import './style.css';
import { activeSteps, STATE_LABELS, transition, type PipelineState } from './app/stateMachine';
import { appendGloss, glossWords, type Gloss } from './app/gloss';
import { CONFIDENCE_THRESHOLD, FINISH_WORD, HOLD_MS } from './app/signs';
import { interpretGlosses, type InterpretResult } from './app/interpretClient';
import { silenceEnded } from './app/utterance';
import { BrowserSpeaker, SpeechError, type Speaker } from './voice/speaker';
import { renderPipeline } from './ui/pipeline';
import { renderGlossStrip, renderSignPill } from './ui/overlays';
import { drawFaceBox, drawFaceMesh, faceBox, positionEmotionTag, renderEmotionLegend } from './ui/faceOverlay';
import { renderCaption } from './ui/caption';
import { drawHandSkeleton } from './vision/drawing';
import { CameraError, startCamera } from './vision/camera';
import { createHandTracker, type HandTracker } from './vision/handTracker';
import { createFaceTracker, type FaceTracker } from './vision/faceTracker';
import { classifyFinish, type SignPrediction } from './recognition/classifier';
import { ModelSignSource, type SourceView } from './recognition/modelSource';
import { initialHoldState, updateHold, type HoldState } from './recognition/holdTracker';
import { classifyEmotion, EmotionSmoother, EmotionTally, type Emotion } from './recognition/emotion';

const video = document.querySelector<HTMLVideoElement>('#video')!;
const frameElement = document.querySelector<HTMLElement>('#frame')!;
const canvas = document.querySelector<HTMLCanvasElement>('#overlay')!;
const message = document.querySelector<HTMLElement>('#camera-message')!;
const stateLabel = document.querySelector<HTMLElement>('#state-label')!;
const pipeline = document.querySelector<HTMLElement>('.pipeline')!;
const glossStrip = document.querySelector<HTMLElement>('#gloss-strip')!;
const signPill = document.querySelector<HTMLElement>('#sign-pill')!;
const clearButton = document.querySelector<HTMLButtonElement>('#clear-btn')!;
const faceTag = document.querySelector<HTMLElement>('#face-tag')!;
const legend = document.querySelector<HTMLElement>('.emotion-legend')!;
const caption = document.querySelector<HTMLElement>('#caption')!;
const ctx = canvas.getContext('2d')!;

const speaker: Speaker = new BrowserSpeaker();
const signSource = new ModelSignSource();

let state: PipelineState = 'idle';
let tracker: HandTracker | null = null;
let faceTracker: FaceTracker | null = null;
let emotionUnavailable = false;
let lastVideoTime = -1;
let frameCount = 0;
let fpsWindowStart = performance.now();
let fps = 0;

let glosses: Gloss[] = [];
let hold: HoldState = initialHoldState();
let finishHold: HoldState = initialHoldState();
let sourceView: SourceView = { status: 'waiting', prediction: null, detail: null };
let current: SignPrediction | null = null;
let finishNoticeUntil = 0;
let lastHandSeenAt = 0;
let interpreting = false;

const smoother = new EmotionSmoother(15);
const tally = new EmotionTally();
let activeEmotion: Emotion | null = null;

function setState(next: PipelineState): void {
  state = next;
  renderPipeline(pipeline, activeSteps(state));
  updateStateLabel();
}

function updateStateLabel(): void {
  const emotionNote = emotionUnavailable ? ' · emotion unavailable' : '';
  const modelNote = sourceView.status === 'no_model' ? ' · no model trained' : '';
  stateLabel.textContent = `State: ${STATE_LABELS[state]} · ${fps} fps${emotionNote}${modelNote}`;
}

function showMessage(text: string | null): void {
  message.textContent = text ?? '';
  message.hidden = text === null;
}

function syncCanvasSize(): void {
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
}

// The hold state is kept on purpose: a sign still held after FINISH must not confirm again.
function resetUtterance(): void {
  glosses = [];
  tally.reset();
  renderGlossStrip(glossStrip, glosses);
}

function clearSequence(): void {
  resetUtterance();
  current = null;
}

function fallbackNotes(result: InterpretResult): string[] {
  if (!result.usedFallback) return [];
  return [`Language model unavailable (${result.reason ?? 'unknown reason'}). Showing the raw sign order.`];
}

function speechNote(error: unknown): string {
  if (error instanceof SpeechError && error.kind === 'no-voice') {
    return 'No speech voice is available in this browser. The sentence is shown above.';
  }
  if (error instanceof SpeechError && error.kind === 'unsupported') {
    return 'Text-to-speech is not supported in this browser. The sentence is shown above.';
  }
  return error instanceof Error ? `Speech output failed: ${error.message}` : 'Speech output failed.';
}

async function runUtterance(): Promise<void> {
  if (interpreting || glosses.length === 0) return;
  interpreting = true;

  const words = glossWords(glosses);
  const emotion = tally.dominant();
  setState(transition(state, { type: 'INTERPRET' }));
  resetUtterance();

  try {
    const result = await interpretGlosses(words, emotion);
    const notes = fallbackNotes(result);
    renderCaption(caption, frameElement, result.sentence, notes);

    setState(transition(state, { type: 'INTERPRETED' }));
    try {
      await speaker.speak(result.sentence);
    } catch (error) {
      renderCaption(caption, frameElement, result.sentence, [...notes, speechNote(error)]);
    }
  } finally {
    // Always return to tracking, even if something failed part way through.
    if (state === 'interpreting') setState(transition(state, { type: 'INTERPRETED' }));
    setState(transition(state, { type: 'SPEECH_DONE' }));
    interpreting = false;
  }
}

function handleConfirmed(sign: SignPrediction): void {
  if (state !== 'tracking' || sign.word === FINISH_WORD) return;
  glosses = appendGloss(glosses, { word: sign.word, confidence: sign.confidence });
  renderGlossStrip(glossStrip, glosses);
}

function handleFinish(now: number): void {
  if (state !== 'tracking') return;
  if (glosses.length === 0) {
    finishNoticeUntil = now + 3000;
    return;
  }
  void runUtterance();
}

function renderPill(now: number): void {
  renderSignPill(signPill, { prediction: current });
  const hint = signPill.querySelector<HTMLElement>('.pill-hint')!;
  if (sourceView.status === 'no_model') {
    signPill.querySelector<HTMLElement>('.pill-word')!.textContent = '—';
    hint.textContent = 'No model trained';
  } else if (sourceView.status === 'unavailable') {
    hint.textContent = 'Recognizer unavailable';
  } else if (now < finishNoticeUntil) {
    hint.textContent = 'Sign a word before FINISH';
  }
}

function updateFace(now: number, width: number, height: number): void {
  if (!faceTracker) return;

  const face = faceTracker.detect(video, now);
  if (!face) {
    smoother.reset();
    activeEmotion = null;
    faceTag.hidden = true;
    renderEmotionLegend(legend, null);
    return;
  }

  const scores = classifyEmotion(face.blendshapes).scores;
  activeEmotion = smoother.push(scores);
  if (state === 'tracking') tally.add(activeEmotion);

  const box = faceBox(face.landmarks);
  drawFaceMesh(ctx, face.landmarks, width, height);
  drawFaceBox(ctx, box, width, height);
  positionEmotionTag(faceTag, box, activeEmotion);
  renderEmotionLegend(legend, activeEmotion);
}

function frame(now: number): void {
  requestAnimationFrame(frame);

  if (video.readyState < 2 || !tracker) return;

  syncCanvasSize();
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const { hands } = tracker.detect(video, now);
    if (hands.length > 0) lastHandSeenAt = now;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updateFace(now, canvas.width, canvas.height);
    for (const hand of hands) {
      drawHandSkeleton(ctx, hand.landmarks, canvas.width, canvas.height);
    }

    signSource.push(hands, now);
    sourceView = signSource.view(now);
    current = sourceView.prediction;
    const update = updateHold(hold, current, now, { threshold: CONFIDENCE_THRESHOLD, holdMs: HOLD_MS });
    hold = update.state;
    if (update.confirmed) handleConfirmed(update.confirmed);

    const finishUpdate = updateHold(finishHold, classifyFinish(hands.map((h) => h.landmarks)), now, {
      threshold: CONFIDENCE_THRESHOLD,
      holdMs: HOLD_MS,
    });
    finishHold = finishUpdate.state;
    if (finishUpdate.confirmed) handleFinish(now);

    if (state === 'tracking' && silenceEnded(lastHandSeenAt, now, glosses.length)) {
      void runUtterance();
    }

    renderPill(now);
    updateStateLabel();
  }

  frameCount += 1;
  if (now - fpsWindowStart >= 1000) {
    fps = Math.round((frameCount * 1000) / (now - fpsWindowStart));
    frameCount = 0;
    fpsWindowStart = now;
    updateStateLabel();
  }
}

async function boot(): Promise<void> {
  setState('idle');
  showMessage('Starting camera…');
  clearButton.addEventListener('click', clearSequence);

  try {
    await startCamera(video);
  } catch (error) {
    const text = error instanceof CameraError ? error.message : 'The webcam could not be started.';
    showMessage(text);
    return;
  }

  setState(transition(state, { type: 'CAMERA_STARTED' }));
  lastHandSeenAt = performance.now();
  showMessage('Loading hand and face models…');

  try {
    tracker = await createHandTracker();
  } catch {
    showMessage('The hand tracking model could not be loaded. Check that the models folder is present.');
    return;
  }

  try {
    faceTracker = await createFaceTracker();
  } catch {
    emotionUnavailable = true;
    updateStateLabel();
  }

  showMessage(null);
  renderPill(0);
  requestAnimationFrame(frame);
}

boot();

import './style.css';
import { activeSteps, STATE_LABELS, transition, type PipelineState } from './app/stateMachine';
import { renderPipeline } from './ui/pipeline';
import { drawHandSkeleton } from './vision/drawing';
import { CameraError, startCamera } from './vision/camera';
import { createHandTracker, type HandTracker } from './vision/handTracker';

const video = document.querySelector<HTMLVideoElement>('#video')!;
const canvas = document.querySelector<HTMLCanvasElement>('#overlay')!;
const message = document.querySelector<HTMLElement>('#camera-message')!;
const stateLabel = document.querySelector<HTMLElement>('#state-label')!;
const pipeline = document.querySelector<HTMLElement>('.pipeline')!;
const ctx = canvas.getContext('2d')!;

let state: PipelineState = 'idle';
let tracker: HandTracker | null = null;
let lastVideoTime = -1;
let frameCount = 0;
let fpsWindowStart = performance.now();
let fps = 0;

function setState(next: PipelineState): void {
  state = next;
  renderPipeline(pipeline, activeSteps(state));
  updateStateLabel();
}

function updateStateLabel(): void {
  stateLabel.textContent = `State: ${STATE_LABELS[state]} · ${fps} fps`;
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

function frame(now: number): void {
  requestAnimationFrame(frame);

  if (video.readyState < 2 || !tracker) return;

  syncCanvasSize();
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const { hands } = tracker.detect(video, now);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const hand of hands) {
      drawHandSkeleton(ctx, hand.landmarks, canvas.width, canvas.height);
    }
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

  try {
    await startCamera(video);
  } catch (error) {
    const text = error instanceof CameraError ? error.message : 'The webcam could not be started.';
    showMessage(text);
    return;
  }

  setState(transition(state, { type: 'CAMERA_STARTED' }));
  showMessage('Loading hand model…');

  try {
    tracker = await createHandTracker();
  } catch {
    showMessage('The hand tracking model could not be loaded. Check that the models folder is present.');
    return;
  }

  showMessage(null);
  requestAnimationFrame(frame);
}

boot();

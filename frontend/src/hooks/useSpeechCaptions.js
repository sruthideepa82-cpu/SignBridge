import { useCallback, useEffect, useRef, useState } from 'react';
import { CAPTURE_STATE, MicrophoneCapture } from '../lib/audio/microphoneCapture.js';
import { appendText, isSameUtterance } from '../lib/captionDraft.js';
import {
  CAPTION_PHASE,
  PROVIDER,
  captionErrorMessage,
  derivePhase,
  isFallbackEligible,
  isMicrophoneActive,
} from '../lib/captionPhase.js';
import { createTranscriptState } from '../lib/transcriptState.js';
import { currentSpeechPlayback, subscribeSpeechPlayback } from '../lib/speechPlayback.js';
import { TRANSPORT_STATUS, TranscriptionTransport } from '../services/transcriptionTransport.js';
import useSpeechRecognition from './useSpeechRecognition.js';

const INITIAL_SNAPSHOT = Object.freeze({
  status: TRANSPORT_STATUS.IDLE,
  transcript: createTranscriptState(),
  error: null,
  droppedFrames: 0,
});

const RUNNING_STATUSES = [
  TRANSPORT_STATUS.CONNECTING,
  TRANSPORT_STATUS.LISTENING,
  TRANSPORT_STATUS.PAUSING,
  TRANSPORT_STATUS.PAUSED,
  TRANSPORT_STATUS.RESUMING,
  TRANSPORT_STATUS.RECONNECTING,
  TRANSPORT_STATUS.STOPPING,
];

const STARTABLE_STATUSES = [TRANSPORT_STATUS.IDLE, TRANSPORT_STATUS.STOPPED, TRANSPORT_STATUS.FAILED];

// The browser's own recognition takes one language per session. Hindi is used when Hindi is chosen; otherwise English.
export function browserRecognitionLanguage(language) {
  return language === 'hi-IN' ? 'hi-IN' : 'en-IN';
}

// Owns one speech-to-text session for Live Studio: the microphone, the Gemini transport, the editable draft and the
// optional browser fallback. It lives in the page, so switching tabs does not end the session or lose the draft.
export default function useSpeechCaptions() {
  const [language, setLanguageState] = useState('auto');
  const speech = useSpeechRecognition({ lang: browserRecognitionLanguage(language) });
  const speechRef = useRef(speech);
  speechRef.current = speech;

  const [captureState, setCaptureState] = useState(CAPTURE_STATE.IDLE);
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);
  const [draft, setDraft] = useState('');
  const [interrupted, setInterrupted] = useState(false);
  // Sequences up to and including this one were cleared by the user. Their late interim and incomplete text is hidden.
  const [clearedThroughSeq, setClearedThroughSeq] = useState(0);
  // Browser interim text that was on screen at the last clear. It stays hidden until the browser moves on.
  const [clearedFallbackInterim, setClearedFallbackInterim] = useState('');
  const [userPaused, setUserPaused] = useState(false);
  const [speechPlayback, setSpeechPlayback] = useState(currentSpeechPlayback);
  const [captureError, setCaptureError] = useState(null);
  const [sendError, setSendError] = useState('');
  const [notice, setNotice] = useState('');
  const [fallbackActive, setFallbackActive] = useState(false);

  const captureRef = useRef(null);
  const transportRef = useRef(null);
  const captureStateRef = useRef(CAPTURE_STATE.IDLE);
  const languageRef = useRef('auto');
  // Highest committed sequence already added to the draft. Clearing the draft does not reset it, so a sentence is never
  // added twice.
  const appliedSeqRef = useRef(0);
  const fallbackActiveRef = useRef(false);
  const fallbackSuspendedRef = useRef(false);
  const clearedFallbackRef = useRef('');

  const handleFallbackFinal = useCallback((text) => {
    const cleared = clearedFallbackRef.current;
    if (cleared && isSameUtterance(cleared, text)) {
      // The result for speech that was cleared. It is dropped, and only one result is dropped.
      clearedFallbackRef.current = '';
      return;
    }
    setDraft((current) => appendText(current, text));
    setNotice('Sentence added to the transcript.');
  }, []);

  const handleTransportChange = useCallback((next) => {
    setSnapshot(next);
    const pending = next.transcript.committed.filter((entry) => entry.seq > appliedSeqRef.current);
    if (pending.length > 0) {
      appliedSeqRef.current = pending[pending.length - 1].seq;
      setDraft((current) => pending.reduce((text, entry) => appendText(text, entry.text), current));
      setNotice(
        pending.length === 1 ? 'Sentence added to the transcript.' : `${pending.length} sentences added to the transcript.`,
      );
    }
    if (next.status === TRANSPORT_STATUS.FAILED) {
      // The connection is gone for good, so the microphone is released rather than left open for nothing.
      captureRef.current?.stop().catch(() => {});
      setUserPaused(false);
    }
  }, []);

  const handleTransportEvent = useCallback((event) => {
    if (event.type === 'interrupted' || event.type === 'audio_dropped') setInterrupted(true);
  }, []);

  const createTransport = useCallback(() => {
    const transport = new TranscriptionTransport({
      language: languageRef.current,
      onChange: handleTransportChange,
      onEvent: handleTransportEvent,
    });
    transportRef.current = transport;
    return transport;
  }, [handleTransportChange, handleTransportEvent]);

  const handleCaptureState = useCallback(
    (state) => {
      captureStateRef.current = state;
      setCaptureState(state);
      if (state === CAPTURE_STATE.CAPTURING) {
        const transport = transportRef.current ?? createTransport();
        if (STARTABLE_STATUSES.includes(transport.status)) {
          transport.setLanguage(languageRef.current);
          transport.start();
        }
      }
    },
    [createTransport],
  );

  const handleCaptureError = useCallback(({ message }) => {
    setCaptureError(message);
    setUserPaused(false);
    const transport = transportRef.current;
    if (transport && RUNNING_STATUSES.includes(transport.status)) transport.stop();
  }, []);

  const ensureCapture = useCallback(() => {
    if (!captureRef.current) {
      captureRef.current = new MicrophoneCapture({
        onFrame: (frame) => transportRef.current?.sendAudio(frame),
        onStateChange: handleCaptureState,
        onError: handleCaptureError,
      });
    }
    return captureRef.current;
  }, [handleCaptureState, handleCaptureError]);

  // Read Aloud pauses listening so SignBridge's own voice is not transcribed. Pause and resume are decided here, from
  // only two inputs: the user's pause and whether speech is playing. Each step is idempotent, so repeated runs are safe.
  useEffect(() => {
    const wantPaused = userPaused || speechPlayback !== 'idle';
    if (fallbackActiveRef.current) {
      const speech = speechRef.current;
      if (wantPaused && !fallbackSuspendedRef.current) {
        fallbackSuspendedRef.current = true;
        speech.stop();
      } else if (!wantPaused && fallbackSuspendedRef.current) {
        fallbackSuspendedRef.current = false;
        speech.start(handleFallbackFinal);
      }
      return;
    }
    const capture = captureRef.current;
    const transport = transportRef.current;
    if (!capture || !transport) return;
    const micOn = captureStateRef.current === CAPTURE_STATE.CAPTURING;
    if (wantPaused) {
      if (transport.status === TRANSPORT_STATUS.LISTENING) transport.pause();
      if (micOn) capture.pause();
    } else if (micOn) {
      capture.resume();
      if (transport.status === TRANSPORT_STATUS.PAUSED) transport.resume();
    }
  }, [userPaused, speechPlayback, captureState, snapshot.status, fallbackActive, handleFallbackFinal]);

  useEffect(() => subscribeSpeechPlayback(setSpeechPlayback), []);

  // If the browser recognition reports an error, the fallback ends and the error is shown. Nothing is retried silently.
  useEffect(() => {
    if (fallbackActiveRef.current && speech.status === 'error') {
      fallbackActiveRef.current = false;
      fallbackSuspendedRef.current = false;
      setFallbackActive(false);
    }
  }, [speech.status]);

  useEffect(
    () => () => {
      const capture = captureRef.current;
      const transport = transportRef.current;
      captureRef.current = null;
      transportRef.current = null;
      capture?.dispose();
      transport?.dispose();
      if (fallbackActiveRef.current) speechRef.current.stop();
      fallbackActiveRef.current = false;
    },
    [],
  );

  const transportRunning = RUNNING_STATUSES.includes(snapshot.status);
  const micActive = isMicrophoneActive(captureState);
  const sessionBusy = micActive || transportRunning || fallbackActive;
  // Hidden after a clear: anything from a sequence the user cleared, including late arrivals for it.
  const interruptedEntries = snapshot.transcript.interrupted.filter((entry) => entry.seq > clearedThroughSeq);
  const pendingInterim = snapshot.transcript.interim;
  const visibleInterim = pendingInterim && pendingInterim.seq > clearedThroughSeq ? pendingInterim.text : '';
  const fallbackInterim = speech.interim === clearedFallbackInterim ? '' : speech.interim;
  const autoPaused = speechPlayback !== 'idle' && !userPaused;

  const phase = fallbackActive
    ? userPaused || autoPaused
      ? CAPTION_PHASE.PAUSED
      : fallbackInterim
        ? CAPTION_PHASE.RECEIVING
        : CAPTION_PHASE.LISTENING
    : derivePhase({
        captureState,
        transportStatus: snapshot.status,
        hasInterim: visibleInterim !== '',
        interrupted,
        hasError: Boolean(captureError),
      });

  let error = captureError;
  if (!error && snapshot.status === TRANSPORT_STATUS.FAILED) error = captionErrorMessage(snapshot.error?.code);
  if (!error && snapshot.status === TRANSPORT_STATUS.RECONNECTING && snapshot.error) {
    error = captionErrorMessage(snapshot.error.code);
  }

  const fallbackOffered =
    !fallbackActive &&
    snapshot.status === TRANSPORT_STATUS.FAILED &&
    isFallbackEligible(snapshot.error?.code) &&
    !micActive;

  const start = () => {
    if (fallbackActiveRef.current || isMicrophoneActive(captureStateRef.current)) return;
    const transport = transportRef.current;
    if (transport && RUNNING_STATUSES.includes(transport.status)) return;
    setInterrupted(false);
    setCaptureError(null);
    setNotice('');
    setUserPaused(false);
    // Called synchronously from the click, so the permission prompt is attributed to the user's action.
    ensureCapture()
      .start()
      .catch(() => {});
  };

  const stop = async () => {
    setUserPaused(false);
    if (fallbackActiveRef.current) {
      fallbackActiveRef.current = false;
      fallbackSuspendedRef.current = false;
      setFallbackActive(false);
      speechRef.current.stop();
      return;
    }
    // The microphone is released first. Buffered frames are sent before the transport asks Gemini to finish.
    await captureRef.current?.stop();
    const transport = transportRef.current;
    if (transport && RUNNING_STATUSES.includes(transport.status)) transport.stop();
  };

  const setLanguage = (next) => {
    if (sessionBusy) return false;
    languageRef.current = next;
    setLanguageState(next);
    return true;
  };

  // Clears the draft, the incomplete notes and the visible interim text. The microphone keeps running, and conversation
  // messages are not touched. The sequence watermark is not reset: sentences up to the current one stay cleared, so a
  // late event for them cannot bring them back.
  const clear = () => {
    const through = Math.max(
      appliedSeqRef.current,
      snapshot.transcript.interim?.seq ?? 0,
      ...snapshot.transcript.interrupted.map((entry) => entry.seq),
    );
    appliedSeqRef.current = through;
    setClearedThroughSeq(through);
    const shownFallback = fallbackActiveRef.current ? speech.interim : '';
    clearedFallbackRef.current = shownFallback;
    setClearedFallbackInterim(shownFallback);
    setDraft('');
    setInterrupted(false);
    setSendError('');
    setNotice('Transcript cleared. Conversation messages are kept.');
  };

  // The conversation send is passed in. The draft is cleared only after it succeeds, so a failed send keeps the text.
  const send = (sendMessage) => {
    const text = draft.trim();
    if (!text) return false;
    try {
      sendMessage({ text, source: 'speech', speaker: 'hearing' });
    } catch {
      setSendError('The message could not be sent. Your text is still here.');
      return false;
    }
    setDraft('');
    setSendError('');
    setNotice('Sent to the conversation.');
    return true;
  };

  const startFallback = () => {
    if (!speech.supported || isMicrophoneActive(captureStateRef.current)) return;
    fallbackActiveRef.current = true;
    fallbackSuspendedRef.current = false;
    setFallbackActive(true);
    setCaptureError(null);
    clearedFallbackRef.current = '';
    setClearedFallbackInterim('');
    setNotice('Browser speech recognition is on. Gemini is not in use.');
    speechRef.current.start(handleFallbackFinal);
  };

  return {
    phase,
    provider: fallbackActive ? PROVIDER.BROWSER : PROVIDER.GEMINI,
    draft,
    setDraft,
    interimText: fallbackActive ? fallbackInterim : visibleInterim,
    interrupted,
    interruptedEntries,
    droppedFrames: snapshot.droppedFrames,
    language,
    // The language the browser recognizer is asked for. Auto uses English (India), because the browser cannot detect.
    fallbackLanguage: browserRecognitionLanguage(language),
    fallbackAutoLanguage: language === 'auto',
    setLanguage,
    error,
    sendError,
    notice,
    micActive: micActive || fallbackActive,
    userPaused,
    autoPaused,
    sessionBusy,
    canStart: !sessionBusy,
    canPause: fallbackActive ? !userPaused : snapshot.status === TRANSPORT_STATUS.LISTENING && !userPaused,
    canResume: userPaused,
    canStop: sessionBusy,
    fallbackOffered,
    fallbackActive,
    browserSupported: speech.supported,
    start,
    stop,
    pause: () => setUserPaused(true),
    resume: () => setUserPaused(false),
    clear,
    send,
    startFallback,
  };
}

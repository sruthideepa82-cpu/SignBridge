import { CAPTURE_STATE } from './audio/microphoneCapture.js';
import { TRANSPORT_STATUS } from '../services/transcriptionTransport.js';

// What the captions panel shows. Derived from the capture and transport states, which are the source of truth.
export const CAPTION_PHASE = Object.freeze({
  IDLE: 'idle',
  REQUESTING_PERMISSION: 'requesting_permission',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  RECEIVING: 'receiving',
  PAUSED: 'paused',
  RECONNECTING: 'reconnecting',
  INTERRUPTED: 'interrupted',
  STOPPING: 'stopping',
  ERROR: 'error',
});

export const PROVIDER = Object.freeze({ GEMINI: 'gemini', BROWSER: 'browser' });

// Languages the browser fallback can be asked for. The browser decides whether it can actually recognize each one.
export const BROWSER_LANGUAGE_LABELS = Object.freeze({
  'en-IN': 'English (India)',
  'hi-IN': 'Hindi (India)',
});

export const LANGUAGE_OPTIONS = Object.freeze([
  { value: 'auto', label: 'Auto detect' },
  { value: 'en-IN', label: 'English (India)' },
  { value: 'hi-IN', label: 'Hindi (India)' },
]);

// Service and network failures that the browser speech recognition fallback can cover. Configuration and
// authentication failures are not listed: they are shown as errors and are never hidden behind a fallback.
const FALLBACK_ELIGIBLE_CODES = new Set([
  'gemini_unavailable',
  'gemini_rate_limited',
  'gemini_disconnected',
  'gemini_session_ended',
  'reconnect_exhausted',
  'ready_timeout',
  'pong_timeout',
  'connection_failed',
]);

const MESSAGES = {
  transcription_unavailable: 'Gemini transcription is not set up on the SignBridge server.',
  gemini_auth_failed: 'Gemini rejected the server API key, so live transcription cannot start.',
  gemini_model_unavailable: 'The Gemini transcription model is not available for this key.',
  gemini_request_rejected: 'Gemini could not process the audio. Try again.',
  gemini_unavailable: 'Gemini is busy right now.',
  gemini_rate_limited: 'Gemini usage limit reached for now. Try again shortly.',
  gemini_disconnected: 'The connection to Gemini was interrupted.',
  gemini_session_ended: 'The transcription session ended.',
  too_many_sessions: 'Too many transcription sessions are open. Stop one and try again.',
  session_time_limit: 'This transcription session reached its time limit. Start listening again.',
  reconnect_exhausted: 'Transcription could not reconnect after several tries.',
  ready_timeout: 'The transcription service did not respond in time.',
  pong_timeout: 'The transcription connection stopped responding.',
  pause_timeout: 'Transcription did not pause in time.',
  resume_timeout: 'Transcription did not resume in time.',
  stop_timeout: 'Transcription did not stop cleanly.',
  connection_failed: 'The transcription connection could not be opened.',
  invalid_start: 'Transcription could not start with the current settings.',
  frame_too_large: 'Audio was too large to send. Stop and start listening again.',
  origin_refused: 'The transcription connection was refused by the server.',
};

const GENERIC_MESSAGE = 'Transcription stopped unexpectedly. Start listening again.';

// A plain sentence for the page. Internal codes and server text are never shown.
export function captionErrorMessage(code) {
  if (!code) return GENERIC_MESSAGE;
  return MESSAGES[code] ?? GENERIC_MESSAGE;
}

export function isFallbackEligible(code) {
  return FALLBACK_ELIGIBLE_CODES.has(code);
}

// Interrupted means some speech may be missing. It is shown until the user clears the transcript or starts again.
export function derivePhase({ captureState, transportStatus, hasInterim, interrupted, hasError }) {
  if (captureState === CAPTURE_STATE.REQUESTING) return CAPTION_PHASE.REQUESTING_PERMISSION;
  if (captureState === CAPTURE_STATE.STOPPING || transportStatus === TRANSPORT_STATUS.STOPPING) {
    return CAPTION_PHASE.STOPPING;
  }
  if (transportStatus === TRANSPORT_STATUS.FAILED || hasError) return CAPTION_PHASE.ERROR;
  if (transportStatus === TRANSPORT_STATUS.RECONNECTING) return CAPTION_PHASE.RECONNECTING;
  if (transportStatus === TRANSPORT_STATUS.CONNECTING || transportStatus === TRANSPORT_STATUS.RESUMING) {
    return CAPTION_PHASE.CONNECTING;
  }
  if (transportStatus === TRANSPORT_STATUS.PAUSING || transportStatus === TRANSPORT_STATUS.PAUSED) {
    return CAPTION_PHASE.PAUSED;
  }
  if (transportStatus === TRANSPORT_STATUS.LISTENING) {
    if (interrupted) return CAPTION_PHASE.INTERRUPTED;
    return hasInterim ? CAPTION_PHASE.RECEIVING : CAPTION_PHASE.LISTENING;
  }
  if (captureState === CAPTURE_STATE.CAPTURING) return CAPTION_PHASE.CONNECTING;
  return CAPTION_PHASE.IDLE;
}

// Microphone access is live while the stream is open, including while transcription is paused.
export function isMicrophoneActive(captureState) {
  return (
    captureState === CAPTURE_STATE.REQUESTING ||
    captureState === CAPTURE_STATE.CAPTURING ||
    captureState === CAPTURE_STATE.STOPPING
  );
}

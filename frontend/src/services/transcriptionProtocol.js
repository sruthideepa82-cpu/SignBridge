import { API_BASE_URL } from './apiClient.js';
import { TARGET_SAMPLE_RATE } from '../lib/audio/pcm.js';

// Wire contract for /api/transcription/live. It matches backend/app/schemas/transcription.py. Only the languages the
// product exposes are listed. Tamil (ta-IN) stays out until real Tamil speech has been tested.
export const TRANSCRIPTION_LANGUAGES = Object.freeze(['auto', 'en-IN', 'hi-IN']);
export const DEFAULT_LANGUAGE = 'auto';
export const MAX_FRAME_BYTES = 32000;
export const TRANSCRIPTION_PATH = '/transcription/live';

export const SERVER_MESSAGE_TYPES = Object.freeze(['ready', 'state', 'interim', 'final', 'error', 'pong', 'closed']);

// Errors the backend marks as not recoverable, plus codes that always mean the same request will fail again.
const NON_RETRYABLE_CODES = new Set([
  'invalid_start',
  'transcription_unavailable',
  'gemini_auth_failed',
  'gemini_model_unavailable',
  'gemini_request_rejected',
  'frame_too_large',
  'session_time_limit',
]);

// WebSocket close codes that mean the connection was refused for a reason a retry cannot fix.
// 1008: the origin is not allowed or the start message was invalid. 1009: a frame was too large.
export const FATAL_CLOSE_CODES = Object.freeze([1008, 1009]);

// Builds the ws:// or wss:// URL from the same base the HTTP client uses. The Vite proxy forwards the upgrade.
export function buildTranscriptionSocketUrl(base = API_BASE_URL, location = globalThis.window?.location) {
  const origin = location?.href ?? 'http://localhost/';
  const url = new URL(base, origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${TRANSCRIPTION_PATH}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function assertLanguage(language) {
  if (!TRANSCRIPTION_LANGUAGES.includes(language)) {
    throw new RangeError(`Unsupported transcription language: ${language}.`);
  }
  return language;
}

export function buildStartMessage({ language = DEFAULT_LANGUAGE, seqStart = 1 } = {}) {
  if (!Number.isInteger(seqStart) || seqStart < 1) {
    throw new RangeError(`seqStart must be a whole number from 1, got ${seqStart}.`);
  }
  return {
    type: 'start',
    encoding: 'pcm_s16le',
    sampleRate: TARGET_SAMPLE_RATE,
    channels: 1,
    language: assertLanguage(language),
    seqStart,
  };
}

export const CONTROL_TYPES = Object.freeze(['pause', 'resume', 'stop', 'ping']);

export function buildControlMessage(type) {
  if (!CONTROL_TYPES.includes(type)) throw new RangeError(`Unknown control message: ${type}.`);
  return { type };
}

// Only whole PCM samples in 100 ms frames or smaller are sent. Empty and odd-length buffers are never valid.
export function isValidAudioFrame(frame) {
  return (
    frame instanceof ArrayBuffer &&
    frame.byteLength > 0 &&
    frame.byteLength % 2 === 0 &&
    frame.byteLength <= MAX_FRAME_BYTES
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSequence(value) {
  return Number.isInteger(value) && value >= 1;
}

// Returns the validated message, or null for anything malformed. Nothing outside the contract reaches the state.
export function parseServerMessage(raw) {
  if (typeof raw !== 'string') return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'ready':
    case 'pong':
      return { type: value.type };
    case 'state':
      return value.state === 'listening' || value.state === 'paused' ? { type: 'state', state: value.state } : null;
    case 'interim':
    case 'final':
      if (!isSequence(value.seq) || typeof value.text !== 'string') return null;
      return { type: value.type, seq: value.seq, text: value.text };
    case 'error':
      if (
        typeof value.code !== 'string' ||
        typeof value.message !== 'string' ||
        typeof value.recoverable !== 'boolean'
      ) {
        return null;
      }
      return { type: 'error', code: value.code, message: value.message, recoverable: value.recoverable };
    case 'closed':
      return { type: 'closed', reason: typeof value.reason === 'string' ? value.reason : 'stopped' };
    default:
      return null;
  }
}

// A retry only makes sense for a recoverable error the backend has not marked as fatal.
export function isRetryableError(error) {
  return error?.recoverable === true && !NON_RETRYABLE_CODES.has(error.code);
}

export function isFatalCloseCode(code) {
  return FATAL_CLOSE_CODES.includes(code);
}

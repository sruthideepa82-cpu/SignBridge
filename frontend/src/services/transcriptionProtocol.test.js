import { describe, expect, it } from 'vitest';
import {
  FATAL_CLOSE_CODES,
  TRANSCRIPTION_LANGUAGES,
  buildControlMessage,
  buildStartMessage,
  buildTranscriptionSocketUrl,
  isFatalCloseCode,
  isRetryableError,
  isValidAudioFrame,
  parseServerMessage,
} from './transcriptionProtocol.js';

describe('buildTranscriptionSocketUrl', () => {
  const page = { href: 'http://localhost:5173/workspace/live-studio' };

  it('uses ws:// on local http and proxies through the same origin', () => {
    expect(buildTranscriptionSocketUrl('/api', page)).toBe('ws://localhost:5173/api/transcription/live');
  });

  it('uses wss:// on https pages', () => {
    const secure = { href: 'https://signbridge.example/workspace' };

    expect(buildTranscriptionSocketUrl('/api', secure)).toBe('wss://signbridge.example/api/transcription/live');
  });

  it('follows an absolute API base URL, including its port', () => {
    expect(buildTranscriptionSocketUrl('http://127.0.0.1:8000/api/', page)).toBe(
      'ws://127.0.0.1:8000/api/transcription/live',
    );
  });

  it('does not hardcode a host or port', () => {
    const url = buildTranscriptionSocketUrl('/api', { href: 'http://example.test:4000/' });

    expect(url).toBe('ws://example.test:4000/api/transcription/live');
    expect(url).not.toContain('8000');
  });
});

describe('start and control messages', () => {
  it('builds the start message with the wire format and sequence continuity', () => {
    expect(buildStartMessage({ language: 'hi-IN', seqStart: 4 })).toEqual({
      type: 'start',
      encoding: 'pcm_s16le',
      sampleRate: 16000,
      channels: 1,
      language: 'hi-IN',
      seqStart: 4,
    });
  });

  it('defaults to automatic language detection starting at sequence 1', () => {
    expect(buildStartMessage()).toMatchObject({ language: 'auto', seqStart: 1 });
  });

  it('exposes only the languages the product offers, without Tamil', () => {
    expect(TRANSCRIPTION_LANGUAGES).toEqual(['auto', 'en-IN', 'hi-IN']);
    expect(() => buildStartMessage({ language: 'ta-IN' })).toThrow(RangeError);
  });

  it('rejects sequence numbers below 1', () => {
    expect(() => buildStartMessage({ seqStart: 0 })).toThrow(RangeError);
    expect(() => buildStartMessage({ seqStart: 1.5 })).toThrow(RangeError);
  });

  it('builds only the defined control messages', () => {
    expect(buildControlMessage('pause')).toEqual({ type: 'pause' });
    expect(() => buildControlMessage('shutdown')).toThrow(RangeError);
  });
});

describe('audio frame validation', () => {
  it('accepts whole-sample frames up to the 32,000-byte limit', () => {
    expect(isValidAudioFrame(new ArrayBuffer(3200))).toBe(true);
    expect(isValidAudioFrame(new ArrayBuffer(2))).toBe(true);
    expect(isValidAudioFrame(new ArrayBuffer(32000))).toBe(true);
  });

  it('rejects empty, odd-length and oversized frames, and non-buffers', () => {
    expect(isValidAudioFrame(new ArrayBuffer(0))).toBe(false);
    expect(isValidAudioFrame(new ArrayBuffer(3201))).toBe(false);
    expect(isValidAudioFrame(new ArrayBuffer(32002))).toBe(false);
    expect(isValidAudioFrame(new Uint8Array(3200))).toBe(false);
    expect(isValidAudioFrame(null)).toBe(false);
  });
});

describe('parseServerMessage', () => {
  const parse = (value) => parseServerMessage(JSON.stringify(value));

  it('accepts every server message type in the contract', () => {
    expect(parse({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parse({ type: 'state', state: 'paused' })).toEqual({ type: 'state', state: 'paused' });
    expect(parse({ type: 'interim', seq: 1, text: 'Hel' })).toEqual({ type: 'interim', seq: 1, text: 'Hel' });
    expect(parse({ type: 'final', seq: 2, text: 'Hello.' })).toEqual({ type: 'final', seq: 2, text: 'Hello.' });
    expect(
      parse({ type: 'error', code: 'too_many_sessions', message: 'Busy.', recoverable: true }),
    ).toEqual({ type: 'error', code: 'too_many_sessions', message: 'Busy.', recoverable: true });
    expect(parse({ type: 'pong' })).toEqual({ type: 'pong' });
    expect(parse({ type: 'closed', reason: 'stopped' })).toEqual({ type: 'closed', reason: 'stopped' });
  });

  it('returns null for text that is not JSON, and for binary data', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage(new ArrayBuffer(4))).toBeNull();
    expect(parseServerMessage(undefined)).toBeNull();
  });

  it('rejects JSON that is not an object, or has no string type', () => {
    expect(parseServerMessage('null')).toBeNull();
    expect(parseServerMessage('[]')).toBeNull();
    expect(parseServerMessage('"final"')).toBeNull();
    expect(parseServerMessage(JSON.stringify({ seq: 1 }))).toBeNull();
  });

  it('rejects unknown message types', () => {
    expect(parse({ type: 'transcript_dump', text: 'x' })).toBeNull();
  });

  it('rejects transcript events with an invalid sequence or missing text', () => {
    expect(parse({ type: 'final', seq: 0, text: 'x' })).toBeNull();
    expect(parse({ type: 'final', seq: 1.5, text: 'x' })).toBeNull();
    expect(parse({ type: 'final', seq: '1', text: 'x' })).toBeNull();
    expect(parse({ type: 'interim', seq: 1 })).toBeNull();
  });

  it('rejects error messages that do not match the contract', () => {
    expect(parse({ type: 'error', code: 'x', message: 'y' })).toBeNull();
    expect(parse({ type: 'error', code: 'x', message: 'y', recoverable: 'yes' })).toBeNull();
  });

  it('rejects state values the protocol does not define', () => {
    expect(parse({ type: 'state', state: 'recording' })).toBeNull();
  });
});

describe('retry policy', () => {
  it('retries recoverable errors that are not on the fatal list', () => {
    expect(isRetryableError({ code: 'gemini_unavailable', recoverable: true })).toBe(true);
    expect(isRetryableError({ code: 'gemini_rate_limited', recoverable: true })).toBe(true);
    expect(isRetryableError({ code: 'too_many_sessions', recoverable: true })).toBe(true);
  });

  it.each([
    ['gemini_auth_failed'],
    ['gemini_model_unavailable'],
    ['transcription_unavailable'],
    ['invalid_start'],
    ['frame_too_large'],
    ['session_time_limit'],
  ])('never retries %s, even if marked recoverable', (code) => {
    expect(isRetryableError({ code, recoverable: true })).toBe(false);
  });

  it('does not retry errors the backend marks unrecoverable', () => {
    expect(isRetryableError({ code: 'gemini_disconnected', recoverable: false })).toBe(false);
  });

  it('treats the origin and frame-size close codes as fatal', () => {
    expect(FATAL_CLOSE_CODES).toEqual([1008, 1009]);
    expect(isFatalCloseCode(1008)).toBe(true);
    expect(isFatalCloseCode(1011)).toBe(false);
    expect(isFatalCloseCode(1000)).toBe(false);
  });
});

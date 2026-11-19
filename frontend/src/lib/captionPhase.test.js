import { describe, expect, it } from 'vitest';
import { CAPTURE_STATE } from './audio/microphoneCapture.js';
import { TRANSPORT_STATUS } from '../services/transcriptionTransport.js';
import {
  CAPTION_PHASE,
  captionErrorMessage,
  derivePhase,
  isFallbackEligible,
  isMicrophoneActive,
} from './captionPhase.js';
import { appendText, applyCommitted, isSameUtterance } from './captionDraft.js';
import { publishSpeechPlayback, subscribeSpeechPlayback, currentSpeechPlayback } from './speechPlayback.js';

const base = {
  captureState: CAPTURE_STATE.CAPTURING,
  transportStatus: TRANSPORT_STATUS.LISTENING,
  hasInterim: false,
  interrupted: false,
  hasError: false,
};

describe('derivePhase', () => {
  it.each([
    [{ captureState: CAPTURE_STATE.IDLE, transportStatus: TRANSPORT_STATUS.IDLE }, CAPTION_PHASE.IDLE],
    [{ captureState: CAPTURE_STATE.REQUESTING, transportStatus: TRANSPORT_STATUS.IDLE }, CAPTION_PHASE.REQUESTING_PERMISSION],
    [{ transportStatus: TRANSPORT_STATUS.CONNECTING }, CAPTION_PHASE.CONNECTING],
    [{ transportStatus: TRANSPORT_STATUS.LISTENING }, CAPTION_PHASE.LISTENING],
    [{ transportStatus: TRANSPORT_STATUS.LISTENING, hasInterim: true }, CAPTION_PHASE.RECEIVING],
    [{ transportStatus: TRANSPORT_STATUS.PAUSING }, CAPTION_PHASE.PAUSED],
    [{ transportStatus: TRANSPORT_STATUS.PAUSED }, CAPTION_PHASE.PAUSED],
    [{ transportStatus: TRANSPORT_STATUS.RESUMING }, CAPTION_PHASE.CONNECTING],
    [{ transportStatus: TRANSPORT_STATUS.RECONNECTING }, CAPTION_PHASE.RECONNECTING],
    [{ transportStatus: TRANSPORT_STATUS.LISTENING, interrupted: true }, CAPTION_PHASE.INTERRUPTED],
    [{ transportStatus: TRANSPORT_STATUS.STOPPING }, CAPTION_PHASE.STOPPING],
    [{ captureState: CAPTURE_STATE.STOPPING, transportStatus: TRANSPORT_STATUS.LISTENING }, CAPTION_PHASE.STOPPING],
    [{ transportStatus: TRANSPORT_STATUS.FAILED }, CAPTION_PHASE.ERROR],
    [{ hasError: true }, CAPTION_PHASE.ERROR],
    [{ captureState: CAPTURE_STATE.CAPTURING, transportStatus: TRANSPORT_STATUS.IDLE }, CAPTION_PHASE.CONNECTING],
    [{ captureState: CAPTURE_STATE.ERROR, transportStatus: TRANSPORT_STATUS.STOPPED }, CAPTION_PHASE.IDLE],
  ])('derives the phase for %j', (overrides, expected) => {
    expect(derivePhase({ ...base, ...overrides })).toBe(expected);
  });

  it('keeps the interruption warning visible even while receiving speech', () => {
    expect(derivePhase({ ...base, hasInterim: true, interrupted: true })).toBe(CAPTION_PHASE.INTERRUPTED);
  });
});

describe('microphone activity', () => {
  it('counts the stream as live while paused, requesting, capturing or stopping', () => {
    expect(isMicrophoneActive(CAPTURE_STATE.CAPTURING)).toBe(true);
    expect(isMicrophoneActive(CAPTURE_STATE.REQUESTING)).toBe(true);
    expect(isMicrophoneActive(CAPTURE_STATE.STOPPING)).toBe(true);
    expect(isMicrophoneActive(CAPTURE_STATE.IDLE)).toBe(false);
    expect(isMicrophoneActive(CAPTURE_STATE.ERROR)).toBe(false);
  });
});

describe('error messages', () => {
  it('turns internal codes into plain sentences and never shows the code', () => {
    expect(captionErrorMessage('gemini_auth_failed')).toMatch(/API key/);
    expect(captionErrorMessage('gemini_auth_failed')).not.toContain('gemini_auth_failed');
  });

  it('uses a generic sentence for unknown codes', () => {
    expect(captionErrorMessage('something_new')).toMatch(/stopped unexpectedly/);
    expect(captionErrorMessage(undefined)).toMatch(/stopped unexpectedly/);
  });
});

describe('browser fallback eligibility', () => {
  it.each(['gemini_unavailable', 'gemini_rate_limited', 'gemini_disconnected', 'reconnect_exhausted', 'ready_timeout'])(
    'offers the fallback for the recoverable service or network failure %s',
    (code) => {
      expect(isFallbackEligible(code)).toBe(true);
    },
  );

  it.each([
    'gemini_auth_failed',
    'gemini_model_unavailable',
    'transcription_unavailable',
    'gemini_request_rejected',
    'invalid_start',
    'session_time_limit',
    'frame_too_large',
  ])('never offers the fallback for the configuration or authentication failure %s', (code) => {
    expect(isFallbackEligible(code)).toBe(false);
  });
});

describe('draft text', () => {
  it('adds a sentence after existing text with one space, and never doubles spaces', () => {
    expect(appendText('', ' Hello ')).toBe('Hello');
    expect(appendText('Hello', 'there.')).toBe('Hello there.');
    expect(appendText('Hello ', 'there.')).toBe('Hello there.');
    expect(appendText('Hello', '   ')).toBe('Hello');
  });

  it('adds each committed sentence exactly once, even when called again with the same list', () => {
    const committed = [
      { seq: 1, text: 'First.' },
      { seq: 2, text: 'Second.' },
    ];

    const once = applyCommitted('', committed, 0);
    const again = applyCommitted(once.draft, committed, once.lastAppliedSeq);

    expect(once.draft).toBe('First. Second.');
    expect(once.added).toBe(2);
    expect(again.draft).toBe('First. Second.');
    expect(again.added).toBe(0);
  });

  it('keeps the user edits and adds only the new sentence', () => {
    const first = applyCommitted('', [{ seq: 1, text: 'Hello.' }], 0);
    const edited = 'Hi, my friend.';

    const next = applyCommitted(edited, [{ seq: 1, text: 'Hello.' }, { seq: 2, text: 'How are you?' }], first.lastAppliedSeq);

    expect(next.draft).toBe('Hi, my friend. How are you?');
  });

  it('does not re-add old sentences after the draft was cleared', () => {
    const committed = [{ seq: 1, text: 'Old.' }];
    const first = applyCommitted('', committed, 0);

    const afterClear = applyCommitted('', committed, first.lastAppliedSeq);

    expect(afterClear.draft).toBe('');
    expect(afterClear.added).toBe(0);
  });
});

describe('read aloud playback publishing', () => {
  it('tells subscribers about each change, and only real changes', () => {
    const seen = [];
    const unsubscribe = subscribeSpeechPlayback((state) => seen.push(state));

    publishSpeechPlayback('speaking');
    publishSpeechPlayback('speaking');
    publishSpeechPlayback('idle');
    unsubscribe();
    publishSpeechPlayback('speaking');

    expect(seen).toEqual(['speaking', 'idle']);
    expect(currentSpeechPlayback()).toBe('speaking');
    publishSpeechPlayback('idle');
  });
});

describe('same-utterance matching for late browser results', () => {
  it('matches the cleared interim text against its final, including small wording changes', () => {
    expect(isSameUtterance('Hello there', 'Hello there.')).toBe(true);
    expect(isSameUtterance('Hello there friend', 'Hello there')).toBe(true);
    expect(isSameUtterance('  HELLO   there ', 'hello there')).toBe(true);
  });

  it('does not match an unrelated new sentence, or empty text', () => {
    expect(isSameUtterance('Hello there', 'Goodbye now')).toBe(false);
    expect(isSameUtterance('', 'Hello')).toBe(false);
    expect(isSameUtterance('Hello', '')).toBe(false);
  });
});

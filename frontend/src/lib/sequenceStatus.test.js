import { describe, expect, it } from 'vitest';
import { describeRecognition } from './sequenceStatus.js';
import { initialSentence } from './sentenceBuilder.js';

const base = { cameraLive: true, paused: false, error: '', sentence: initialSentence() };

describe('describeRecognition', () => {
  it('reports waiting for the camera and paused recognition', () => {
    expect(describeRecognition({ ...base, cameraLive: false }).key).toBe('waiting_camera');
    expect(describeRecognition({ ...base, paused: true }).key).toBe('paused');
  });

  it('says the model is unavailable, and never shows a translation', () => {
    const state = describeRecognition({
      ...base,
      result: { status: 'no_model', frame_sequence: 1, detail: 'No trained sign model found.' },
    });

    expect(state.key).toBe('no_model');
    expect(state.label).toBe('Sentence model not installed');
    expect(state.detail).toMatch(/Sentences need the temporal sign model/);
    expect(state.detail).toMatch(/Single letters above come from the static classifier/);
  });

  it('shows each detection stage', () => {
    expect(describeRecognition({ ...base, result: { status: 'warming_up', collected_frames: 10, frame_sequence: 2 } }).detail)
      .toContain('10 of 32');
    expect(describeRecognition({ ...base, result: { status: 'no_hand', frame_sequence: 3 } }).label).toBe('No hand detected');
    expect(describeRecognition({ ...base, result: { status: 'uncertain', frame_sequence: 4 } }).label).toBe('Low confidence');
    expect(describeRecognition({ ...base, result: { status: 'detection_unavailable', frame_sequence: 5 } }).key).toBe(
      'detection_unavailable',
    );
  });

  it('shows a recognised sign only once the model returned a word', () => {
    const holding = describeRecognition({
      ...base,
      sentence: { ...initialSentence(), blockedWord: 'HELLO' },
      result: { status: 'recognized', word: 'HELLO', confidence: 0.92, frame_sequence: 6 },
    });
    expect(holding.label).toBe('Sign recognised: HELLO');
    expect(holding.detail).toContain('92%');

    const steady = describeRecognition({
      ...base,
      sentence: { ...initialSentence(), candidate: 'HELLO', holdCount: 1 },
      result: { status: 'recognized', word: 'HELLO', confidence: 0.92, frame_sequence: 7 },
    });
    expect(steady.key).toBe('recognising');
  });

  it('reports an error from the request', () => {
    expect(describeRecognition({ ...base, error: 'Cannot reach the SignBridge backend.' }).key).toBe('unavailable');
  });
});

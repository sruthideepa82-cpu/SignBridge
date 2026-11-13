// Replays real /api/recognition/latest responses (captured by ai-engine/public_datasets/isl_static/make_replay_fixture.py)
// through the Live Studio letter path: user threshold, then the stability buffer. The draft is what the user would see.
import { describe, expect, it } from 'vitest';
import fixture from '../test/fixtures/static-replay.json';
import { applyRecognition, initialBuffer, toText } from './signBuffer.js';
import { effectiveRecognition } from './letterSettings.js';

function replay(minConfidence = null) {
  return fixture.frames.reduce((state, { response }) => {
    const result = effectiveRecognition(response, minConfidence);
    return applyRecognition(state, result);
  }, initialBuffer());
}

describe('real backend responses replayed through the letter path', () => {
  it('the fixture came from the active static model and is labelled experimental', () => {
    const recognised = fixture.frames.filter((frame) => frame.response.status === 'recognized');

    expect(recognised.length).toBeGreaterThan(0);
    expect(recognised.every((frame) => frame.response.experimental === true)).toBe(true);
    expect(recognised.every((frame) => frame.response.verification === 'unverified_dataset')).toBe(true);
  });

  it('a held B, one uncertain frame, and a held B again produce a single B', () => {
    const state = replay();
    const letters = state.items.map((item) => item.label);

    expect(letters).toEqual(['B', 'C', 'B']);
    expect(toText(state.items)).toBe('BCB');
    expect(letters.join('')).not.toMatch(/BB/);
  });

  it('the committed confidence is the confidence of the accepted frame', () => {
    const state = replay();
    const accepted = state.items.map((item) => ({ label: item.label, confidence: Math.round(item.confidence * 1000) / 1000 }));

    expect(accepted).toEqual([
      { label: 'B', confidence: 0.75 },
      { label: 'C', confidence: 0.957 },
      { label: 'B', confidence: 0.75 },
    ]);
  });

  it('a user threshold above the B confidence keeps B out of the draft and leaves only C', () => {
    const state = replay(0.8);

    expect(state.items.map((item) => item.label)).toEqual(['C']);
  });

  it('the scripted no-hand frames release the held letter without adding anything', () => {
    const noHandFrames = fixture.frames.filter((frame) => frame.response.status === 'no_hand');

    expect(noHandFrames.length).toBe(3);
    const state = replay();
    expect(state.items.every((item) => item.type === 'letter')).toBe(true);
  });
});

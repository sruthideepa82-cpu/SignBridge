import { describe, expect, it } from 'vitest';
import { applyRecognition, HOLD_FRAMES, initialBuffer, removeAt, RELEASE_FRAMES } from './signBuffer.js';
import { DEFAULT_LETTER_SETTINGS, effectiveRecognition, normaliseLetterSettings } from './letterSettings.js';

let frame = 0;
const seen = (label, confidence = 0.9) => ({
  status: 'recognized',
  label,
  confidence,
  threshold: 0.7,
  frame_sequence: ++frame,
  experimental: true,
});
const uncertain = () => ({ status: 'uncertain', label: null, confidence: 0.4, threshold: 0.7, frame_sequence: ++frame });
const noHand = () => ({ status: 'no_hand', label: null, confidence: null, threshold: 0.7, frame_sequence: ++frame });

const run = (state, results) => results.reduce((current, result) => applyRecognition(current, result), state);
const hold = (label, count = HOLD_FRAMES, confidence = 0.9) =>
  Array.from({ length: count }, () => seen(label, confidence));
const letters = (state) => state.items.map((item) => item.label);

describe('a held handshape does not duplicate', () => {
  it('a single uncertain frame in the middle of a held letter adds nothing', () => {
    const state = run(initialBuffer(), [...hold('B'), uncertain(), ...hold('B', HOLD_FRAMES * 2)]);

    expect(letters(state)).toEqual(['B']);
  });

  it('a one-frame wrong guess in the middle of a held letter adds nothing', () => {
    const state = run(initialBuffer(), [...hold('B'), seen('W'), ...hold('B', HOLD_FRAMES * 2)]);

    expect(letters(state)).toEqual(['B']);
  });

  it('a sustained change to another letter releases the first one and commits the second', () => {
    const state = run(initialBuffer(), [...hold('B'), ...hold('W', HOLD_FRAMES)]);

    expect(letters(state)).toEqual(['B', 'W']);
  });

  it('the same letter is committed again only after the hand has left the frame', () => {
    const held = run(initialBuffer(), hold('B'));
    const stillHeld = run(held, hold('B', HOLD_FRAMES * 2));
    expect(letters(stillHeld)).toEqual(['B']);

    const afterLeaving = run(stillHeld, [noHand(), ...hold('B')]);
    expect(letters(afterLeaving)).toEqual(['B', 'B']);
  });

  it('keeps the held letter through a noisy stretch shorter than the release window', () => {
    const noisy = Array.from({ length: RELEASE_FRAMES - 1 }, () => seen('V'));
    const state = run(initialBuffer(), [...hold('C'), ...noisy, ...hold('C', HOLD_FRAMES)]);

    expect(letters(state)).toEqual(['C']);
  });
});

describe('uncertain predictions never add a letter', () => {
  it('a run of uncertain frames adds nothing, however long', () => {
    const state = run(initialBuffer(), Array.from({ length: 30 }, () => uncertain()));

    expect(state.items).toEqual([]);
  });
});

describe('the confidence shown on a letter is the accepted prediction', () => {
  it('uses the confidence of the frame that completed the hold', () => {
    const results = [0.7, 0.75, 0.8, 0.85, 0.9, 0.87].map((confidence) => seen('D', confidence));
    const state = run(initialBuffer(), results);

    expect(state.items).toEqual([{ type: 'letter', label: 'D', confidence: 0.87, experimental: true }]);
  });
});

describe('correction', () => {
  it('removes only the chosen item and keeps the order of the rest', () => {
    let state = run(initialBuffer(), hold('A'));
    state = run(state, [noHand(), ...hold('B'), noHand(), ...hold('C')]);
    expect(letters(state)).toEqual(['A', 'B', 'C']);

    const corrected = removeAt(state, 1);

    expect(letters(corrected)).toEqual(['A', 'C']);
  });
});

describe('user confidence threshold', () => {
  it('turns a recognized letter below the user threshold into UNKNOWN', () => {
    const result = seen('B', 0.8);

    const adjusted = effectiveRecognition(result, 0.9);

    expect(adjusted.status).toBe('uncertain');
    expect(adjusted.label).toBeNull();
    expect(adjusted.detail).toMatch(/below your threshold of 90%/);
  });

  it('keeps a recognized letter that clears the user threshold', () => {
    const result = seen('B', 0.95);

    expect(effectiveRecognition(result, 0.9)).toBe(result);
  });

  it('never loosens the backend decision, and passes other results through', () => {
    const uncertainResult = uncertain();
    expect(effectiveRecognition(uncertainResult, 0.5)).toBe(uncertainResult);
    expect(effectiveRecognition(null, 0.5)).toBeNull();
    const recognised = seen('B', 0.8);
    expect(effectiveRecognition(recognised, null)).toBe(recognised);
  });

  it('a result below the user threshold never reaches the draft', () => {
    const below = effectiveRecognition(seen('W', 0.8), 0.9);
    const state = run(initialBuffer(), Array.from({ length: HOLD_FRAMES * 2 }, () => below));

    expect(state.items).toEqual([]);
  });

  it('clamps stored settings to the allowed ranges', () => {
    expect(normaliseLetterSettings({ stableFrames: 99, minConfidence: 0.1 })).toEqual({ stableFrames: 10, minConfidence: 0.5 });
    expect(normaliseLetterSettings({ stableFrames: 1, minConfidence: null })).toEqual({ stableFrames: 2, minConfidence: null });
    expect(normaliseLetterSettings(null)).toEqual(DEFAULT_LETTER_SETTINGS);
  });
});

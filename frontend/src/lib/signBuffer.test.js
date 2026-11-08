import { describe, expect, it } from 'vitest';
import {
  HOLD_FRAMES,
  appendSpace,
  applyRecognition,
  clearAll,
  initialBuffer,
  toText,
  undoLast,
} from './signBuffer.js';

let frame = 0;
const seen = (label, confidence = 0.9) => ({
  status: 'recognized',
  label,
  confidence,
  threshold: 0.7,
  frame_sequence: ++frame,
});
const other = (status) => ({ status, label: null, confidence: 0.4, threshold: 0.7, frame_sequence: ++frame });

function feed(state, results) {
  return results.reduce((current, result) => applyRecognition(current, result), state);
}

describe('signBuffer: committing letters', () => {
  it('commits a letter only after it is held for the full hold window', () => {
    const almost = feed(initialBuffer(), Array.from({ length: HOLD_FRAMES - 1 }, () => seen('C')));
    expect(almost.items).toEqual([]);

    const committed = applyRecognition(almost, seen('C'));
    expect(committed.items).toEqual([{ type: 'letter', label: 'C', confidence: 0.9 }]);
  });

  it('does not append the same held letter on every frame', () => {
    const state = feed(initialBuffer(), Array.from({ length: HOLD_FRAMES * 4 }, () => seen('L')));

    expect(state.items).toHaveLength(1);
    expect(state.items[0].label).toBe('L');
  });

  it('needs the hand to move before the same letter can be committed again', () => {
    const first = feed(initialBuffer(), Array.from({ length: HOLD_FRAMES }, () => seen('O')));
    const still = feed(first, Array.from({ length: HOLD_FRAMES * 2 }, () => seen('O')));
    expect(still.items).toHaveLength(1);

    const released = feed(still, [other('no_hand')]);
    const again = feed(released, Array.from({ length: HOLD_FRAMES }, () => seen('O')));
    expect(again.items.map((item) => item.label)).toEqual(['O', 'O']);
  });

  it('starts a new hold when the recognized letter changes', () => {
    const state = feed(initialBuffer(), [
      ...Array.from({ length: HOLD_FRAMES }, () => seen('C')),
      ...Array.from({ length: HOLD_FRAMES - 1 }, () => seen('V')),
    ]);

    expect(state.items.map((item) => item.label)).toEqual(['C']);
    expect(state.candidate).toBe('V');
    expect(state.holdCount).toBe(HOLD_FRAMES - 1);
  });
});

describe('signBuffer: low-confidence and missing results', () => {
  it('never commits from uncertain, no-hand, or camera-off results', () => {
    const noisy = [
      ...Array.from({ length: HOLD_FRAMES - 1 }, () => seen('S')),
      other('uncertain'),
      ...Array.from({ length: HOLD_FRAMES - 1 }, () => seen('S')),
      other('no_hand'),
      other('camera_off'),
    ];

    const state = feed(initialBuffer(), noisy);

    expect(state.items).toEqual([]);
    expect(state.candidate).toBeNull();
  });

  it('ignores a repeated frame sequence so one frame is counted once', () => {
    const result = seen('U');
    const once = applyRecognition(initialBuffer(), result);
    const repeated = applyRecognition(once, result);

    expect(repeated).toBe(once);
  });

  it('resets the hold when results stop arriving', () => {
    const holding = feed(initialBuffer(), Array.from({ length: HOLD_FRAMES - 1 }, () => seen('V')));
    const reset = applyRecognition(holding, null);

    expect(reset.candidate).toBeNull();
    expect(reset.holdCount).toBe(0);
    expect(reset.items).toEqual([]);
  });
});

describe('signBuffer: correction and text', () => {
  it('builds text from committed letters and spaces', () => {
    let state = feed(initialBuffer(), Array.from({ length: HOLD_FRAMES }, () => seen('C')));
    state = appendSpace(state);
    state = feed(state, [other('no_hand')]);
    state = feed(state, Array.from({ length: HOLD_FRAMES }, () => seen('L')));

    expect(toText(state.items)).toBe('C L');
  });

  it('undo removes the last committed item only', () => {
    let state = feed(initialBuffer(), Array.from({ length: HOLD_FRAMES }, () => seen('C')));
    state = feed(state, [other('no_hand')]);
    state = feed(state, Array.from({ length: HOLD_FRAMES }, () => seen('L')));

    const undone = undoLast(state);

    expect(undone.items.map((item) => item.label)).toEqual(['C']);
    expect(undoLast(initialBuffer()).items).toEqual([]);
  });

  it('clear empties the output', () => {
    const state = feed(initialBuffer(), Array.from({ length: HOLD_FRAMES }, () => seen('O')));

    expect(clearAll(state).items).toEqual([]);
  });
});

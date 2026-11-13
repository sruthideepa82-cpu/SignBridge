import { describe, expect, it } from 'vitest';
import {
  appendPhraseToDraft,
  correctSuggestion,
  confirmSuggestion,
  discardSuggestion,
  initialPhraseState,
  stepPhraseState,
} from './phraseStabilizer.js';

const phrase = (label, confidence = 0.9) => ({ status: 'recognized', label, confidence });
const NOTHING = { status: 'no_hand' };
const UNCERTAIN = { status: 'uncertain', confidence: 0.4 };

function run(results, holdFrames = 3) {
  return results.reduce((state, result) => stepPhraseState(state, result, { holdFrames }), initialPhraseState());
}

describe('phrase stabiliser', () => {
  it('suggests nothing until the same phrase is held for the required frames', () => {
    const state = run([phrase('sick'), phrase('sick')], 3);

    expect(state.suggestion).toBeNull();
    expect(state.count).toBe(2);
  });

  it('suggests a phrase once it is held steady', () => {
    const state = run([phrase('sick'), phrase('sick'), phrase('sick')], 3);

    expect(state.suggestion).toEqual({ label: 'sick', confidence: 0.9 });
  });

  it('does not suggest the same phrase again while it is still being held', () => {
    let state = run([phrase('sick'), phrase('sick'), phrase('sick')], 3);
    state = confirmSuggestion(state);
    for (let i = 0; i < 10; i += 1) state = stepPhraseState(state, phrase('sick'), { holdFrames: 3 });

    expect(state.suggestion).toBeNull();
  });

  it('suggests the same phrase again after the recognizer reports something else', () => {
    let state = run([phrase('sick'), phrase('sick'), phrase('sick')], 3);
    state = confirmSuggestion(state);
    state = stepPhraseState(state, NOTHING, { holdFrames: 3 });
    for (let i = 0; i < 3; i += 1) state = stepPhraseState(state, phrase('sick'), { holdFrames: 3 });

    expect(state.suggestion?.label).toBe('sick');
  });

  it('a different phrase starts its own count and releases the previous one', () => {
    let state = run([phrase('sick'), phrase('sick'), phrase('sick')], 3);
    state = stepPhraseState(state, phrase('shift'), { holdFrames: 3 });
    expect(state.count).toBe(1);
    state = stepPhraseState(state, phrase('shift'), { holdFrames: 3 });
    state = stepPhraseState(state, phrase('shift'), { holdFrames: 3 });

    expect(state.suggestion?.label).toBe('shift');
  });

  it('never suggests from uncertain, excluded or unavailable results', () => {
    const state = run([UNCERTAIN, UNCERTAIN, UNCERTAIN, { status: 'unsupported', label: null }, { status: 'camera_off' }], 3);

    expect(state.suggestion).toBeNull();
  });

  it('a recognized result without a label is ignored', () => {
    const state = run([{ status: 'recognized', label: null, confidence: 0.99 }, { status: 'recognized', label: null }], 2);

    expect(state.suggestion).toBeNull();
  });

  it('discarding a suggestion keeps it from returning while the sign is still held', () => {
    let state = run([phrase('sick'), phrase('sick'), phrase('sick')], 3);
    state = discardSuggestion(state);
    for (let i = 0; i < 5; i += 1) state = stepPhraseState(state, phrase('sick'), { holdFrames: 3 });

    expect(state.suggestion).toBeNull();
  });

  it('correcting a suggestion replaces it and counts the chosen phrase as already suggested', () => {
    let state = run([phrase('sick'), phrase('sick'), phrase('sick')], 3);
    state = correctSuggestion(state, 'change');

    expect(state.suggestion).toEqual({ label: 'change', confidence: null, corrected: true });
    for (let i = 0; i < 5; i += 1) state = stepPhraseState(state, phrase('change'), { holdFrames: 3 });
    expect(state.suggestion).toEqual({ label: 'change', confidence: null, corrected: true });
  });
});

describe('phrase stabiliser frame counting', () => {
  it('counts each processed frame once, even when the same frame is returned by several polls', () => {
    const frame = (n) => ({ status: 'recognized', label: 'sick', confidence: 0.9, frame_sequence: n });
    let state = initialPhraseState();
    for (let i = 0; i < 5; i += 1) state = stepPhraseState(state, frame(7), { holdFrames: 3 });

    expect(state.count).toBe(1);
    expect(state.suggestion).toBeNull();

    state = stepPhraseState(state, frame(8), { holdFrames: 3 });
    state = stepPhraseState(state, frame(9), { holdFrames: 3 });

    expect(state.suggestion?.label).toBe('sick');
  });
});

describe('appendPhraseToDraft', () => {
  it('starts the draft with the phrase when it is empty', () => {
    expect(appendPhraseToDraft('', 'sick')).toBe('sick');
  });

  it('separates the phrase from existing text with one space', () => {
    expect(appendPhraseToDraft('hello', 'sick')).toBe('hello sick');
    expect(appendPhraseToDraft('hello ', 'sick')).toBe('hello sick');
  });

  it('ignores an empty phrase', () => {
    expect(appendPhraseToDraft('hello', '  ')).toBe('hello');
  });
});

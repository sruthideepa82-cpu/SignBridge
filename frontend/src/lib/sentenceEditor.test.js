import { describe, expect, it } from 'vitest';
import { HOLD_FRAMES, applyRecognition, initialBuffer } from './signBuffer.js';
import {
  TYPING_GROUP_MS,
  initialEditor,
  newlyCommitted,
  sentenceEditorReducer,
} from './sentenceEditor.js';

const run = (state, ...actions) => actions.reduce(sentenceEditorReducer, state);
const letter = (label) => ({ type: 'recognised', items: [{ type: 'letter', label, confidence: 0.9 }] });
const type = (text, now = 0) => ({ type: 'type', text, now });

// Mirrors the page: the buffer commits letters, and only newly committed items reach the sentence.
let frame = 0;
const seen = (label) => ({ status: 'recognized', label, confidence: 0.9, threshold: 0.7, frame_sequence: ++frame });
function recogniseFrames(state, results) {
  let buffer = state.buffer;
  let committed = state.committed;
  let sentence = state.sentence;
  for (const result of results) {
    buffer = applyRecognition(buffer, result);
    const fresh = newlyCommitted(committed, buffer.items);
    committed = buffer.items.length;
    if (fresh.length > 0) sentence = sentenceEditorReducer(sentence, { type: 'recognised', items: fresh });
  }
  return { buffer, committed, sentence };
}

describe('building a sentence from recognised letters', () => {
  it('adds one letter at a time, in order', () => {
    const state = run(initialEditor(), letter('H'), letter('I'));

    expect(state.text).toBe('HI');
  });

  it('turns letters into a word and words into a sentence with spaces', () => {
    let state = run(initialEditor(), letter('H'), letter('I'), { type: 'space' }, letter('A'), letter('M'));
    state = run(state, { type: 'space' }, { type: 'space' });

    expect(state.text).toBe('HI AM ');
  });

  it('does not add a second space or a leading space', () => {
    expect(run(initialEditor(), { type: 'space' }).text).toBe('');
    expect(run(initialEditor(), letter('A'), { type: 'space' }, { type: 'space' }).text).toBe('A ');
  });

  it('turns a recognised space item into a space in the sentence', () => {
    const state = run(initialEditor(), letter('A'), { type: 'recognised', items: [{ type: 'space' }] }, letter('B'));

    expect(state.text).toBe('A B');
  });
});

describe('manual editing', () => {
  it('lets the user type punctuation and any text, including in the middle', () => {
    let state = run(initialEditor(), type('Hello there'));
    state = run(state, type('Hello, there'));
    state = run(state, type('Hello, there, friend?'));

    expect(state.text).toBe('Hello, there, friend?');
  });

  it('edits the middle of a sentence in place', () => {
    const state = run(initialEditor(), type('Helo world'), type('Hello world'));

    expect(state.text).toBe('Hello world');
  });

  it('keeps manual edits when new letters are recognised', () => {
    let state = run(initialEditor(), letter('H'), letter('A'));
    state = run(state, type('Hallo!'));
    state = run(state, letter('T'));

    expect(state.text).toBe('Hallo!T');
  });
});

describe('undo, delete and clear', () => {
  it('undoes recognised letters one at a time', () => {
    const state = run(initialEditor(), letter('C'), letter('A'), letter('T'), { type: 'undo' });

    expect(state.text).toBe('CA');
    expect(run(state, { type: 'undo' }, { type: 'undo' }, { type: 'undo' }).text).toBe('');
  });

  it('undoes a manual edit back to the text before it, without losing earlier edits', () => {
    let state = run(initialEditor(), type('Hi'), letter('!'));
    state = run(state, { type: 'undo' });

    expect(state.text).toBe('Hi');
    expect(run(initialEditor(), type('Hi'), { type: 'undo' }).text).toBe('');
  });

  it('groups quick typing into one undo step', () => {
    let state = run(initialEditor(), type('H', 0), type('He', 100), type('Hel', 200), type('Hell', 300));
    state = run(state, { type: 'undo' });

    expect(state.text).toBe('');
  });

  it('starts a new undo step after a pause in typing', () => {
    let state = run(initialEditor(), type('Hi', 0), type('Hi!', TYPING_GROUP_MS + 500));
    state = run(state, { type: 'undo' });

    expect(state.text).toBe('Hi');
  });

  it('deletes the last character, and that delete can be undone', () => {
    let state = run(initialEditor(), type('Hello!'), { type: 'delete' });

    expect(state.text).toBe('Hello');
    expect(run(state, { type: 'undo' }).text).toBe('Hello!');
  });

  it('does nothing when there is nothing to delete or undo', () => {
    const empty = initialEditor();

    expect(sentenceEditorReducer(empty, { type: 'delete' })).toBe(empty);
    expect(sentenceEditorReducer(empty, { type: 'undo' })).toBe(empty);
  });

  it('clears the whole sentence, and undo brings it back', () => {
    let state = run(initialEditor(), type('Good morning'), { type: 'clear' });

    expect(state.text).toBe('');
    expect(run(state, { type: 'undo' }).text).toBe('Good morning');
  });

  it('reset clears the text and the undo history, so undo cannot restore a sent sentence', () => {
    const sent = run(initialEditor(), letter('H'), letter('I'), type('Hi there', 0));
    const afterSend = run(sent, { type: 'reset' });

    expect(afterSend).toEqual(initialEditor());
    expect(run(afterSend, { type: 'undo' }).text).toBe('');
    expect(sentenceEditorReducer(afterSend, { type: 'undo' })).toBe(afterSend);
  });

  it('after a reset, a new sentence starts a fresh undo history', () => {
    let state = run(initialEditor(), type('Sent'), { type: 'reset' });
    state = run(state, letter('O'), letter('K'));

    expect(run(state, { type: 'undo' }, { type: 'undo' }, { type: 'undo' }).text).toBe('');
  });
});

describe('duplicate recognition', () => {
  it('adds a held sign once, however many frames it is held for', () => {
    const held = Array.from({ length: HOLD_FRAMES * 5 }, () => seen('U'));
    const result = recogniseFrames({ buffer: initialBuffer(), committed: 0, sentence: initialEditor() }, held);

    expect(result.sentence.text).toBe('U');
  });

  it('adds the same letter again only after the hand has moved away', () => {
    const first = Array.from({ length: HOLD_FRAMES }, () => seen('O'));
    const away = [{ status: 'no_hand', label: null, frame_sequence: ++frame }, { status: 'no_hand', label: null, frame_sequence: ++frame }, { status: 'no_hand', label: null, frame_sequence: ++frame }];
    const again = Array.from({ length: HOLD_FRAMES }, () => seen('O'));

    const result = recogniseFrames({ buffer: initialBuffer(), committed: 0, sentence: initialEditor() }, [...first, ...away, ...again]);

    expect(result.sentence.text).toBe('OO');
  });

  it('adds only the letters committed after a letter was removed from the detected sequence', () => {
    const A = { type: 'letter', label: 'A', confidence: 0.9 };
    const B = { type: 'letter', label: 'B', confidence: 0.9 };
    const C = { type: 'letter', label: 'C', confidence: 0.9 };
    let state = run(initialEditor(), { type: 'recognised', items: [A, B] });
    let committed = 2;

    const afterRemoval = [A];
    committed = afterRemoval.length;
    expect(newlyCommitted(committed, afterRemoval)).toEqual([]);

    const afterNewLetter = [A, C];
    const fresh = newlyCommitted(committed, afterNewLetter);
    state = run(state, { type: 'recognised', items: fresh });

    expect(state.text).toBe('ABC');
  });
});

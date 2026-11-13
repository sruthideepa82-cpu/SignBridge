import { describe, expect, it } from 'vitest';
import {
  addSpace,
  applySequenceResult,
  clearText,
  finishSentence,
  initialSentence,
  previewSentence,
  removeAt,
  sentenceReducer,
  signWords,
  undoLast,
} from './sentenceBuilder.js';

const recognised = (word, frame, confidence = 0.9) => ({ status: 'recognized', word, confidence, frame_sequence: frame });
const uncertain = (frame) => ({ status: 'uncertain', word: null, confidence: 0.3, frame_sequence: frame });

function feed(state, results) {
  return results.reduce((current, result) => applySequenceResult(current, result), state);
}

function holdRun(word, startFrame, count) {
  return Array.from({ length: count }, (_, index) => recognised(word, startFrame + index));
}

describe('sign commit and duplicate prevention', () => {
  it('commits a sign only after it is held for several results', () => {
    const state = feed(initialSentence(), holdRun('HELLO', 1, 2));
    expect(signWords(state.items)).toEqual([]);

    const committed = feed(state, holdRun('HELLO', 3, 1));
    expect(signWords(committed.items)).toEqual(['HELLO']);
  });

  it('does not repeat a sign while the hand keeps making it', () => {
    const state = feed(initialSentence(), holdRun('HELLO', 1, 15));

    expect(signWords(state.items)).toEqual(['HELLO']);
  });

  it('accepts the same sign again only after the model stops recognising it', () => {
    let state = feed(initialSentence(), holdRun('HELLO', 1, 3));
    state = feed(state, [uncertain(4), uncertain(5)]);
    state = feed(state, holdRun('HELLO', 6, 3));

    expect(signWords(state.items)).toEqual(['HELLO', 'HELLO']);
  });

  it('builds a sentence from different signs in sequence', () => {
    let state = feed(initialSentence(), holdRun('HELLO', 1, 3));
    state = feed(state, holdRun('HELLO', 4, 8));
    state = feed(state, [uncertain(12), uncertain(13)]);
    state = feed(state, holdRun('HOW', 14, 3));
    state = feed(state, [uncertain(17), uncertain(18)]);
    state = feed(state, holdRun('YOU', 19, 3));

    expect(signWords(state.items)).toEqual(['HELLO', 'HOW', 'YOU']);
  });

  it('never commits from uncertain, missing or empty results', () => {
    const state = feed(initialSentence(), [uncertain(1), uncertain(2), uncertain(3), uncertain(4), uncertain(5)]);

    expect(state.items).toEqual([]);
  });

  it('does not count a repeated frame twice', () => {
    const state = feed(initialSentence(), [recognised('HELLO', 1), recognised('HELLO', 1), recognised('HELLO', 2)]);

    expect(signWords(state.items)).toEqual([]);
    expect(feed(state, [recognised('HELLO', 3)]).items).toHaveLength(1);
  });

  it('resets a hold when a different word interrupts it', () => {
    const state = feed(initialSentence(), [
      recognised('HELLO', 1),
      recognised('HOW', 2),
      recognised('HELLO', 3),
      recognised('HELLO', 4),
    ]);

    expect(signWords(state.items)).toEqual([]);
    expect(feed(state, [recognised('HELLO', 5)]).items).toHaveLength(1);
  });

  it('ignores a new sign straight after one is committed, to stabilise between signs', () => {
    const state = feed(initialSentence(), [...holdRun('HELLO', 1, 3), ...holdRun('WAVE', 4, 2)]);

    expect(signWords(state.items)).toEqual(['HELLO']);
  });
});

describe('manual correction', () => {
  const sentence = {
    ...initialSentence(),
    items: [
      { type: 'sign', word: 'HELLO', confidence: 0.9 },
      { type: 'space' },
      { type: 'sign', word: 'YOU', confidence: 0.8 },
    ],
  };

  it('undoes the last item, including a space', () => {
    expect(signWords(undoLast(sentence).items)).toEqual(['HELLO']);
    expect(undoLast(undoLast(sentence)).items).toHaveLength(1);
  });

  it('removes a chosen sign', () => {
    expect(signWords(removeAt(sentence, 0).items)).toEqual(['YOU']);
  });

  it('adds one space, and not two in a row or at the start', () => {
    expect(addSpace(initialSentence()).items).toEqual([]);
    expect(addSpace(sentence).items).toHaveLength(4);
    const spaced = addSpace(sentence);
    expect(addSpace(spaced)).toBe(spaced);
  });

  it('clears the text but keeps the held sign blocked', () => {
    const held = { ...sentence, blockedWord: 'HELLO' };

    const cleared = clearText(held);

    expect(cleared.items).toEqual([]);
    expect(cleared.blockedWord).toBe('HELLO');
  });
});

describe('finishing a sentence', () => {
  it('builds a completed message and clears the buffer', () => {
    const state = {
      ...initialSentence(),
      items: [
        { type: 'sign', word: 'HELLO', confidence: 0.91 },
        { type: 'sign', word: 'HOW', confidence: 0.84 },
        { type: 'sign', word: 'YOU', confidence: 0.88 },
      ],
    };

    const { state: next, message } = finishSentence(state, { id: 'm1', now: 1000 });

    expect(message).toMatchObject({
      id: 'm1',
      text: 'Hello, how are you?',
      glosses: ['HELLO', 'HOW', 'YOU'],
      confidences: [0.91, 0.84, 0.88],
      createdAt: 1000,
    });
    expect(next.items).toEqual([]);
  });

  it('produces no message when there are no signs', () => {
    expect(finishSentence(initialSentence(), { id: 'm2', now: 1 }).message).toBeNull();
  });

  it('previews the draft without changing the buffer', () => {
    const state = { ...initialSentence(), items: [{ type: 'sign', word: 'ME', confidence: 0.9 }] };

    expect(previewSentence(state).text).toBe('I.');
    expect(state.items).toHaveLength(1);
  });

  it('reducer handles the Live Studio actions', () => {
    let state = sentenceReducer(initialSentence(), { type: 'result', result: recognised('HELLO', 1) });
    state = sentenceReducer(state, { type: 'result', result: recognised('HELLO', 2) });
    state = sentenceReducer(state, { type: 'result', result: recognised('HELLO', 3) });

    expect(signWords(state.items)).toEqual(['HELLO']);
    expect(sentenceReducer(state, { type: 'reset' }).items).toEqual([]);
  });
});

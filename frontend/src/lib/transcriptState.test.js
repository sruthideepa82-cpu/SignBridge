import { describe, expect, it } from 'vitest';
import {
  EFFECT,
  applyDisconnect,
  applyFinal,
  applyInterim,
  committedText,
  createTranscriptState,
} from './transcriptState.js';

function run(state, operations) {
  return operations.reduce((current, [kind, message]) => {
    const apply = kind === 'interim' ? applyInterim : applyFinal;
    return apply(current, message).state;
  }, state);
}

describe('interim transcript text', () => {
  it('replaces the previous interim for the same sequence', () => {
    const state = run(createTranscriptState(), [
      ['interim', { seq: 1, text: 'Hel' }],
      ['interim', { seq: 1, text: 'Hello there' }],
    ]);

    expect(state.interim).toEqual({ seq: 1, text: 'Hello there' });
    expect(state.committed).toEqual([]);
  });

  it('clears the interim when an empty interim arrives for its sequence', () => {
    const start = run(createTranscriptState(), [['interim', { seq: 1, text: 'Hello' }]]);

    const result = applyInterim(start, { seq: 1, text: '' });

    expect(result.effect).toBe(EFFECT.CLEARED);
    expect(result.state.interim).toBeNull();
  });

  it('never appends interim text to the committed transcript', () => {
    const state = run(createTranscriptState(), [
      ['interim', { seq: 1, text: 'Still speaking' }],
      ['interim', { seq: 1, text: 'Still speaking now' }],
    ]);

    expect(state.committed).toEqual([]);
    expect(committedText(state)).toBe('');
  });

  it('ignores interim text for a sequence that is already committed', () => {
    const committed = run(createTranscriptState(), [['final', { seq: 2, text: 'Done.' }]]);

    const result = applyInterim(committed, { seq: 2, text: 'Late hypothesis' });

    expect(result.effect).toBe(EFFECT.STALE);
    expect(result.state).toBe(committed);
  });

  it('keeps superseded interim text as interrupted rather than discarding it', () => {
    const state = run(createTranscriptState(), [
      ['interim', { seq: 1, text: 'Never confirmed' }],
      ['interim', { seq: 2, text: 'Next segment' }],
    ]);

    expect(state.interrupted).toEqual([{ seq: 1, text: 'Never confirmed' }]);
    expect(state.interim).toEqual({ seq: 2, text: 'Next segment' });
  });
});

describe('final transcript text', () => {
  it('commits a final once and clears the interim it confirms', () => {
    const state = run(createTranscriptState(), [
      ['interim', { seq: 1, text: 'Hello, how are' }],
      ['final', { seq: 1, text: 'Hello, how are you?' }],
    ]);

    expect(state.committed).toEqual([{ seq: 1, text: 'Hello, how are you?' }]);
    expect(state.interim).toBeNull();
    expect(state.lastCommittedSequence).toBe(1);
  });

  it('ignores a repeated final for the same sequence', () => {
    const once = run(createTranscriptState(), [['final', { seq: 1, text: 'Hello.' }]]);

    const again = applyFinal(once, { seq: 1, text: 'Hello.' });

    expect(again.effect).toBe(EFFECT.DUPLICATE);
    expect(again.state.committed).toHaveLength(1);
  });

  it('keeps identical text in separate sequences as separate segments', () => {
    const state = run(createTranscriptState(), [
      ['final', { seq: 1, text: 'Yes.' }],
      ['final', { seq: 2, text: 'Yes.' }],
    ]);

    expect(state.committed).toEqual([
      { seq: 1, text: 'Yes.' },
      { seq: 2, text: 'Yes.' },
    ]);
    expect(committedText(state)).toBe('Yes. Yes.');
  });

  it('ignores a final whose sequence is not above the highest committed one', () => {
    const state = run(createTranscriptState(), [
      ['final', { seq: 5, text: 'Five.' }],
      ['final', { seq: 3, text: 'Three.' }],
    ]);

    expect(state.committed).toEqual([{ seq: 5, text: 'Five.' }]);
    expect(state.lastCommittedSequence).toBe(5);
  });

  it('does not commit empty or non-string text', () => {
    const empty = applyFinal(createTranscriptState(), { seq: 1, text: '   ' });
    const wrongType = applyFinal(createTranscriptState(), { seq: 1, text: 42 });

    expect(empty.effect).toBe(EFFECT.IGNORED);
    expect(wrongType.effect).toBe(EFFECT.IGNORED);
    expect(empty.state.committed).toEqual([]);
  });

  it('keeps an interim from an earlier sequence as interrupted when a later final commits', () => {
    const state = run(createTranscriptState(), [
      ['interim', { seq: 1, text: 'Unfinished' }],
      ['final', { seq: 2, text: 'Confirmed.' }],
    ]);

    expect(state.interrupted).toEqual([{ seq: 1, text: 'Unfinished' }]);
    expect(state.committed).toEqual([{ seq: 2, text: 'Confirmed.' }]);
  });
});

describe('disconnects', () => {
  it('moves an unconfirmed interim into interrupted text', () => {
    const interim = run(createTranscriptState(), [['interim', { seq: 3, text: 'Half a sentence' }]]);

    const after = applyDisconnect(interim);

    expect(after.interim).toBeNull();
    expect(after.interrupted).toEqual([{ seq: 3, text: 'Half a sentence' }]);
  });

  it('keeps committed segments untouched across a disconnect', () => {
    const committed = run(createTranscriptState(), [['final', { seq: 1, text: 'Kept.' }]]);

    expect(applyDisconnect(committed).committed).toEqual([{ seq: 1, text: 'Kept.' }]);
  });
});

it('never changes the state it is given', () => {
  const before = run(createTranscriptState(), [['final', { seq: 1, text: 'A.' }]]);
  const snapshot = JSON.stringify(before);

  applyFinal(before, { seq: 2, text: 'B.' });
  applyInterim(before, { seq: 2, text: 'C' });
  applyDisconnect(before);

  expect(JSON.stringify(before)).toBe(snapshot);
});

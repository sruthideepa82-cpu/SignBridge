// All input in this file is SIMULATED letter sequences or typed keys. No model prediction is involved.
import { describe, expect, it } from 'vitest';
import {
  addLetter,
  addSpace,
  applySuggestion,
  backspace,
  clearAll,
  confirmWord,
  correctLetter,
  createBuilder,
  displayText,
  playSimulated,
  sendableText,
  suggestions,
  undo,
} from './wordBuilder.js';
import { DICTIONARY_WORDS } from './wordList.js';

const typeWord = (state, word, source = 'manual') => word.split('').reduce((next, char) => addLetter(next, char, source), state);

describe('simulated HELLO sequence', () => {
  it('builds HELLO from H, E, L, L, O and shows it as the word being built', () => {
    const state = playSimulated(createBuilder(), ['H', 'E', 'L', 'L', 'O']);

    expect(displayText(state)).toBe('HELLO');
    expect(state.current.map((item) => item.char).join('')).toBe('HELLO');
    expect(state.current.every((item) => item.source === 'simulated')).toBe(true);
  });

  it('confirms the word on space and keeps it as a confirmed word', () => {
    const state = addSpace(playSimulated(createBuilder(), ['H', 'E', 'L', 'L', 'O']));

    expect(state.current).toEqual([]);
    expect(state.confirmed.map((word) => word.text)).toEqual(['HELLO']);
    expect(displayText(state)).toBe('HELLO');
  });

  it('refuses to send simulated letters to a conversation', () => {
    const state = confirmWord(playSimulated(createBuilder(), ['H', 'E', 'L', 'L', 'O']));

    expect(sendableText(state)).toEqual({
      error: 'Simulated letters cannot be sent to a conversation. Type or recognise the letters first.',
    });
  });
});

describe('typing and word building', () => {
  it('adds letters, ignores anything that is not A to Z, and upper-cases them', () => {
    let state = createBuilder();
    state = addLetter(state, 'h');
    state = addLetter(state, '5');
    state = addLetter(state, '');
    state = addLetter(state, 'i');

    expect(displayText(state)).toBe('HI');
  });

  it('does nothing when space is pressed on an empty word', () => {
    const empty = createBuilder();

    expect(addSpace(empty)).toBe(empty);
  });

  it('builds a sentence from several confirmed words', () => {
    let state = typeWord(createBuilder(), 'HI');
    state = addSpace(state);
    state = addSpace(typeWord(state, 'THERE'));

    expect(displayText(state)).toBe('HI THERE');
    expect(state.confirmed).toHaveLength(2);
  });

  it('confirms the word being typed on Enter', () => {
    const state = confirmWord(typeWord(createBuilder(), 'OK'));

    expect(state.confirmed.map((word) => word.text)).toEqual(['OK']);
    expect(state.current).toEqual([]);
  });
});

describe('backspace', () => {
  it('removes the last letter of the word being typed', () => {
    const state = backspace(typeWord(createBuilder(), 'HELP'));

    expect(displayText(state)).toBe('HEL');
  });

  it('reopens the last confirmed word when the current word is empty', () => {
    const state = backspace(addSpace(typeWord(createBuilder(), 'HELP')));

    expect(state.confirmed).toEqual([]);
    expect(displayText(state)).toBe('HELP');
  });

  it('does nothing on an empty builder', () => {
    const empty = createBuilder();

    expect(backspace(empty)).toBe(empty);
  });
});

describe('undo', () => {
  it('reverts the last letter', () => {
    const state = undo(typeWord(createBuilder(), 'HEL'));

    expect(displayText(state)).toBe('HE');
  });

  it('reverts a clear, a backspace and a confirmation in turn', () => {
    let state = typeWord(createBuilder(), 'HELLO');
    state = backspace(state);
    expect(displayText(state)).toBe('HELL');
    state = undo(state);
    expect(displayText(state)).toBe('HELLO');
    state = clearAll(state);
    expect(displayText(state)).toBe('');
    state = undo(state);
    expect(displayText(state)).toBe('HELLO');
  });

  it('does nothing when there is no history', () => {
    const empty = createBuilder();

    expect(undo(empty)).toBe(empty);
  });
});

describe('clear', () => {
  it('empties the buffer, and undo brings it back', () => {
    let state = addSpace(typeWord(createBuilder(), 'HELLO'));
    state = typeWord(state, 'WORLD');

    state = clearAll(state);

    expect(displayText(state)).toBe('');
    expect(displayText(undo(state))).toBe('HELLO WORLD');
  });
});

describe('manual correction', () => {
  it('replaces one letter of the word being typed and marks it as typed by the user', () => {
    const state = correctLetter(playSimulated(createBuilder(), ['H', 'E', 'L', 'P']), 3, 'O');

    expect(displayText(state)).toBe('HELO');
    expect(state.current[3]).toMatchObject({ char: 'O', source: 'manual' });
  });

  it('ignores corrections to non-letters or positions that do not exist', () => {
    const state = typeWord(createBuilder(), 'HI');

    expect(correctLetter(state, 0, '3')).toBe(state);
    expect(correctLetter(state, 5, 'A')).toBe(state);
  });
});

describe('word suggestions', () => {
  it('offers completions of the word being typed and nothing before anything is typed', () => {
    expect(suggestions(createBuilder())).toEqual([]);
    expect(suggestions(typeWord(createBuilder(), 'HE'))).toEqual(expect.arrayContaining(['HELLO', 'HELP']));
  });

  it('ranks shorter completions first', () => {
    const list = suggestions(typeWord(createBuilder(), 'HEL'), DICTIONARY_WORDS, 10);

    expect(list[0]).toBe('HELP');
    expect(list).toContain('HELLO');
    expect(list.every((word) => word.startsWith('HEL'))).toBe(true);
  });

  it('applies a suggestion, keeping the typed letters and marking the rest as suggested', () => {
    const state = applySuggestion(typeWord(createBuilder(), 'HEL'), 'HELLO');

    expect(displayText(state)).toBe('HELLO');
    expect(state.current.map((item) => item.source)).toEqual(['manual', 'manual', 'manual', 'suggestion', 'suggestion']);
  });

  it('ignores a suggestion that does not continue what was typed', () => {
    const state = typeWord(createBuilder(), 'HEL');

    expect(applySuggestion(state, 'WORLD')).toBe(state);
    expect(applySuggestion(state, 'HEL')).toBe(state);
  });

  it('can be undone', () => {
    const before = typeWord(createBuilder(), 'HEL');

    expect(displayText(undo(applySuggestion(before, 'HELLO')))).toBe('HEL');
  });
});

describe('sending confirmed text', () => {
  it('sends typed words as typed text', () => {
    const state = confirmWord(typeWord(createBuilder(), 'THANK'));

    expect(sendableText(state)).toEqual({ text: 'THANK', source: 'typed' });
  });

  it('requires the word being typed to be confirmed first', () => {
    expect(sendableText(typeWord(createBuilder(), 'HI'))).toEqual({
      error: 'Confirm the word you are typing before sending.',
    });
  });

  it('reports when there is nothing to send', () => {
    expect(sendableText(createBuilder())).toEqual({ error: 'Nothing to send yet. Type a word and confirm it.' });
  });

  it('sends recognised letters as sign text only when every letter came from a model', () => {
    let state = createBuilder();
    for (const char of 'YES') state = addLetter(state, char, 'model', 0.93);
    state = confirmWord(state);

    expect(sendableText(state)).toEqual({ text: 'YES', source: 'sign' });
  });

  it('blocks sending when any letter is simulated, even if the rest were typed', () => {
    let state = playSimulated(createBuilder(), ['H']);
    state = confirmWord(typeWord(state, 'I'));

    expect(sendableText(state).error).toMatch(/Simulated letters cannot be sent/);
  });
});

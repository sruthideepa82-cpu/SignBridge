// Fingerspelling word builder. Pure functions: every operation returns a new state, so undo is exact.
//
// Letter sources (each letter records where it came from, and the source decides what may be sent):
//   'manual'     typed by the user on the keyboard
//   'suggestion' filled in by applying a word suggestion
//   'model'      from a trained recognizer. No model exists yet, so nothing in the app produces this source
//   'simulated'  from a test sequence. Clearly labelled, and never sent to a conversation
//
// Nothing here recognises signs. The builder only arranges letters that were given to it.
import { DICTIONARY_WORDS } from './wordList.js';

export const MAX_HISTORY = 200;
export const LETTER_SOURCES = {
  manual: 'Typed',
  suggestion: 'Suggestion',
  model: 'Recognised',
  simulated: 'Simulated',
};

export function createBuilder() {
  return { current: [], confirmed: [], history: [], seq: 0 };
}

export function isLetter(value) {
  return typeof value === 'string' && /^[A-Z]$/.test(value);
}

function snapshot(state) {
  return { current: state.current, confirmed: state.confirmed };
}

// Records the state before a change so undo can return to it. Does not record no-op changes.
function commit(state, change) {
  return { ...state, ...change, history: [...state.history, snapshot(state)].slice(-MAX_HISTORY) };
}

function makeItem(state, char, source, confidence) {
  return { id: state.seq + 1, char, source, confidence };
}

export function addLetter(state, value, source = 'manual', confidence = null) {
  const char = String(value ?? '').toUpperCase();
  if (!isLetter(char)) return state;
  const item = makeItem(state, char, source, confidence);
  return commit({ ...state, seq: state.seq + 1 }, { current: [...state.current, item] });
}

export function confirmWord(state) {
  if (state.current.length === 0) return state;
  const text = state.current.map((item) => item.char).join('');
  return commit(state, { current: [], confirmed: [...state.confirmed, { text, items: state.current }] });
}

// Adds a space by confirming the word being typed. A space on an empty word does nothing.
export function addSpace(state) {
  return confirmWord(state);
}

// Removes the last letter of the word being typed. When that word is empty, reopens the last confirmed word.
export function backspace(state) {
  if (state.current.length > 0) {
    return commit(state, { current: state.current.slice(0, -1) });
  }
  if (state.confirmed.length > 0) {
    const last = state.confirmed[state.confirmed.length - 1];
    return commit(state, { current: last.items, confirmed: state.confirmed.slice(0, -1) });
  }
  return state;
}

// Reverts the last change of any kind (letter, space, backspace, correction, suggestion, clear).
export function undo(state) {
  if (state.history.length === 0) return state;
  const previous = state.history[state.history.length - 1];
  return { ...state, current: previous.current, confirmed: previous.confirmed, history: state.history.slice(0, -1) };
}

export function clearAll(state) {
  if (state.current.length === 0 && state.confirmed.length === 0) return state;
  return commit(state, { current: [], confirmed: [] });
}

// Replaces one letter of the word being typed. The corrected letter counts as typed by the user.
export function correctLetter(state, index, value) {
  const char = String(value ?? '').toUpperCase();
  if (!isLetter(char) || index < 0 || index >= state.current.length) return state;
  const current = state.current.map((item, position) =>
    position === index ? { ...item, char, source: 'manual', confidence: null } : item,
  );
  return commit(state, { current });
}

// Words from the built-in list that continue the word being typed. Empty when nothing has been typed yet.
export function suggestions(state, dictionary = DICTIONARY_WORDS, limit = 5) {
  const prefix = state.current.map((item) => item.char).join('');
  if (!prefix) return [];
  return dictionary
    .filter((word) => word.length > prefix.length && word.startsWith(prefix))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, limit);
}

// Completes the word being typed with a suggestion. The suggestion must continue what was typed.
export function applySuggestion(state, word) {
  const prefix = state.current.map((item) => item.char).join('');
  const target = String(word ?? '').toUpperCase();
  if (!target.startsWith(prefix) || target.length <= prefix.length) return state;
  let next = { ...state, seq: state.seq };
  const items = state.current.slice();
  for (const char of target.slice(prefix.length)) {
    next = { ...next, seq: next.seq + 1 };
    items.push(makeItem(next, char, 'suggestion', null));
  }
  return commit(next, { current: items });
}

export function displayText(state) {
  const parts = state.confirmed.map((word) => word.text);
  if (state.current.length > 0) parts.push(state.current.map((item) => item.char).join(''));
  return parts.join(' ');
}

// Returns { text, source } when the confirmed text may be sent, or { error } with the reason it may not.
// Only confirmed words are sent. Text recognised from signs is sent as 'sign'; anything typed is sent as 'typed'.
export function sendableText(state) {
  if (state.current.length > 0) {
    return { error: 'Confirm the word you are typing before sending.' };
  }
  if (state.confirmed.length === 0) {
    return { error: 'Nothing to send yet. Type a word and confirm it.' };
  }
  const items = state.confirmed.flatMap((word) => word.items);
  if (items.some((item) => item.source === 'simulated')) {
    return { error: 'Simulated letters cannot be sent to a conversation. Type or recognise the letters first.' };
  }
  const allRecognised = items.every((item) => item.source === 'model');
  return { text: displayText(state), source: allRecognised ? 'sign' : 'typed' };
}

// Plays a test sequence as simulated input. The letters are labelled 'simulated' everywhere they appear.
export function playSimulated(state, letters) {
  return letters.reduce((next, letter) => addLetter(next, letter, 'simulated'), state);
}

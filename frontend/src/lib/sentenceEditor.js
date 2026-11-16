// The editable sentence in Live Studio. It is the one place the text lives: recognised letters and spaces are
// appended to it, typing edits it in place, and Read aloud and Send read it. Every change keeps the text it replaced,
// so Undo steps back through the sentence whether the change came from recognition or from the user.

export const UNDO_LIMIT = 200;
// Typing that continues within this many milliseconds is one undo step, so a word is not undone letter by letter.
export const TYPING_GROUP_MS = 1500;

export function initialEditor() {
  return { text: '', history: [], lastTypedAt: null };
}

function commit(state, next, { typing = false, now = 0 } = {}) {
  if (next === state.text) return state;
  const grouped = typing && state.lastTypedAt !== null && now - state.lastTypedAt < TYPING_GROUP_MS;
  const history = grouped ? state.history : [...state.history, state.text].slice(-UNDO_LIMIT);
  return { text: next, history, lastTypedAt: typing ? now : null };
}

export function appendLetter(state, label) {
  return commit(state, state.text + label);
}

export function appendSpace(state) {
  if (state.text === '' || state.text.endsWith(' ')) return state;
  return commit(state, `${state.text} `);
}

// The user typed or edited the text directly.
export function typeText(state, text, now) {
  return commit(state, text, { typing: true, now });
}

// A phrase or other whole block was added. It is one step for Undo.
export function insertText(state, text) {
  return commit(state, text);
}

export function deleteLast(state) {
  if (state.text === '') return state;
  return commit(state, state.text.slice(0, -1));
}

export function undo(state) {
  if (state.history.length === 0) return state;
  return {
    text: state.history[state.history.length - 1],
    history: state.history.slice(0, -1),
    lastTypedAt: null,
  };
}

export function clearText(state) {
  return commit(state, '');
}

// Letters and spaces the recogniser has committed since the last check. Only growth is applied. Removing an item from
// the detected sequence does not change the sentence, which the user edits directly.
export function newlyCommitted(seenCount, items) {
  return items.length > seenCount ? items.slice(seenCount) : [];
}

export function sentenceEditorReducer(state, action) {
  switch (action.type) {
    case 'recognised':
      return action.items.reduce(
        (current, item) => (item.type === 'space' ? appendSpace(current) : appendLetter(current, item.label)),
        state,
      );
    case 'type':
      return typeText(state, action.text, action.now);
    case 'insert':
      return insertText(state, action.text);
    case 'space':
      return appendSpace(state);
    case 'delete':
      return deleteLast(state);
    case 'undo':
      return undo(state);
    case 'clear':
      return clearText(state);
    // After a sentence is sent: the text and its undo history are both dropped, so Undo cannot bring it back.
    case 'reset':
      return initialEditor();
    default:
      return state;
  }
}

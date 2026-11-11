// Turns a stream of single-frame recognition results into committed text.
//
// A letter is committed only after the same label is recognized on HOLD_FRAMES new frames in a row.
// Once committed, that letter cannot be committed again until the hand has moved to a different
// recognized sign or stopped being recognized. Uncertain, missing, or unavailable results reset the hold.

export const HOLD_FRAMES = 6;

export function initialBuffer() {
  return {
    items: [],
    candidate: null,
    holdCount: 0,
    committedLabel: null,
    lastFrame: -1,
  };
}

function resetHold(state) {
  return { ...state, candidate: null, holdCount: 0, committedLabel: null };
}

export function applyRecognition(state, result, { holdFrames = HOLD_FRAMES } = {}) {
  if (!result) {
    return resetHold(state);
  }
  if (result.frame_sequence === state.lastFrame) {
    return state;
  }

  const next = { ...state, lastFrame: result.frame_sequence };
  if (result.status !== 'recognized' || !result.label) {
    return resetHold(next);
  }

  const { label } = result;
  if (label === next.committedLabel) {
    return { ...next, candidate: label, holdCount: 0 };
  }

  const holdCount = label === next.candidate ? next.holdCount + 1 : 1;
  if (holdCount >= holdFrames) {
    return {
      ...next,
      items: [...next.items, { type: 'letter', label, confidence: result.confidence }],
      candidate: label,
      holdCount: 0,
      committedLabel: label,
    };
  }

  return { ...next, candidate: label, holdCount, committedLabel: null };
}

export function appendSpace(state) {
  return { ...state, items: [...state.items, { type: 'space' }] };
}

export function undoLast(state) {
  return { ...state, items: state.items.slice(0, -1) };
}

export function clearAll(state) {
  return { ...state, items: [] };
}

export function toText(items) {
  return items.map((item) => (item.type === 'space' ? ' ' : item.label)).join('').trim();
}

// The draft is the text the user reviews before sending. Letters recognised since the last change are appended
// to the draft, keeping any edits the user has made. A change that removes text (undo, clear, sending) resets
// the draft to the recognised text.
export function nextDraft(draft, previousText, nextText) {
  if (nextText === previousText) return draft;
  if (!nextText.startsWith(previousText)) return nextText;
  const addition = nextText.slice(previousText.length);
  return draft.endsWith(' ') && addition.startsWith(' ') ? draft + addition.slice(1) : draft + addition;
}
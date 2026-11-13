// Turns a stream of single-frame recognition results into committed letters.
//
// A letter is committed only after the same label is recognized on HOLD_FRAMES new frames in a row. Once a letter is
// committed, it is held: the same letter cannot be committed again while the hand keeps making it. Two kinds of result
// are treated differently:
//   - An uncertain frame (the hand is there, but the model is not sure) restarts the count but keeps the committed
//     letter, so one noisy frame cannot cause a duplicate.
//   - No hand, camera off, or a different letter that lasts RELEASE_FRAMES frames releases the committed letter, so the
//     same letter can be committed again after a real change.
// Results are applied once per processed frame (frame_sequence).

export const HOLD_FRAMES = 6;
export const RELEASE_FRAMES = 3;

export function initialBuffer() {
  return {
    items: [],
    candidate: null,
    holdCount: 0,
    committedLabel: null,
    releaseCount: 0,
    lastFrame: -1,
  };
}

function restartCount(state) {
  return { ...state, candidate: null, holdCount: 0 };
}

function release(state) {
  return { ...state, committedLabel: null, releaseCount: 0 };
}

export function applyRecognition(state, result, { holdFrames = HOLD_FRAMES, releaseFrames = RELEASE_FRAMES } = {}) {
  if (!result) {
    return release(restartCount(state));
  }
  if (result.frame_sequence === state.lastFrame) {
    return state;
  }

  const next = { ...state, lastFrame: result.frame_sequence };

  if (result.status !== 'recognized' || !result.label) {
    // The hand is in view but the model is not sure: keep any committed letter.
    if (result.status === 'uncertain') return restartCount(next);
    return release(restartCount(next));
  }

  const { label } = result;
  if (label === next.committedLabel) {
    return { ...next, candidate: label, holdCount: 0, releaseCount: 0 };
  }

  let committedLabel = next.committedLabel;
  let releaseCount = next.releaseCount;
  if (committedLabel !== null) {
    releaseCount += 1;
    if (releaseCount >= releaseFrames) {
      committedLabel = null;
      releaseCount = 0;
    }
  }

  const holdCount = label === next.candidate ? next.holdCount + 1 : 1;
  if (holdCount >= holdFrames && committedLabel === null) {
    return {
      ...next,
      items: [
        ...next.items,
        { type: 'letter', label, confidence: result.confidence, ...(result.experimental === true ? { experimental: true } : {}) },
      ],
      candidate: label,
      holdCount: 0,
      committedLabel: label,
      releaseCount: 0,
    };
  }

  return { ...next, candidate: label, holdCount, committedLabel, releaseCount };
}

export function appendSpace(state) {
  return { ...state, items: [...state.items, { type: 'space' }] };
}

export function undoLast(state) {
  return { ...state, items: state.items.slice(0, -1) };
}

// Removes one item the user does not want, for example a wrong letter. Other items keep their order.
export function removeAt(state, index) {
  return { ...state, items: state.items.filter((_, position) => position !== index) };
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

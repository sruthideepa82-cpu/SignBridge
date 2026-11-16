// Turns a stream of single-frame recognition results into committed letters.
//
// A letter is committed only after the same label is recognized on HOLD_FRAMES new frames in a row. Once a letter is
// committed, it is held: the same letter cannot be committed again while the hand keeps making it. Three kinds of result
// are treated differently:
//   - An uncertain frame (the hand is there, but the model is not sure) restarts the count but keeps the committed
//     letter, so one noisy frame cannot cause a duplicate.
//   - A missing frame (no hand, or a failed request) keeps the committed letter until MISS_FRAMES missing frames arrive
//     in a row, so one dropped frame cannot cause a duplicate.
//   - Camera off or paused, or a different letter that lasts RELEASE_FRAMES frames, releases the committed letter, so
//     the same letter can be committed again after a real change.
// Results are applied once per processed frame (frame_sequence).

export const HOLD_FRAMES = 6;
export const RELEASE_FRAMES = 3;
export const MISS_FRAMES = 3;

export function initialBuffer() {
  return {
    items: [],
    candidate: null,
    holdCount: 0,
    committedLabel: null,
    releaseCount: 0,
    missCount: 0,
    lastFrame: -1,
  };
}

function restartCount(state) {
  return { ...state, candidate: null, holdCount: 0 };
}

function release(state) {
  return { ...state, committedLabel: null, releaseCount: 0 };
}

// A missing frame: no hand, or a failed request. The committed letter is released only after missFrames in a row.
function missed(state, missFrames) {
  const missCount = state.missCount + 1;
  if (missCount >= missFrames) {
    return { ...release(restartCount(state)), missCount: 0 };
  }
  return { ...restartCount(state), missCount };
}

// Each failed recognition request is one missing frame. Callers pass the number of failures that are new since the last
// call, so a failure is counted once however often the caller re-renders.
export function applyFailedRequests(state, count, { missFrames = MISS_FRAMES } = {}) {
  let next = state;
  for (let index = 0; index < count; index += 1) {
    next = missed(next, missFrames);
  }
  return next;
}

// A null result with no failed request behind it means recognition was stopped on purpose (camera stopped or paused).
export function applyRecognition(state, result, { holdFrames = HOLD_FRAMES, releaseFrames = RELEASE_FRAMES, missFrames = MISS_FRAMES } = {}) {
  if (!result) {
    return { ...release(restartCount(state)), missCount: 0 };
  }
  if (result.frame_sequence === state.lastFrame) {
    return state;
  }

  if (result.status === 'no_hand') {
    return missed({ ...state, lastFrame: result.frame_sequence }, missFrames);
  }

  const next = { ...state, lastFrame: result.frame_sequence, missCount: 0 };
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


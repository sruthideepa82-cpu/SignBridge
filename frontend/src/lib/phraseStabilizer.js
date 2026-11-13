// Turns a stream of phrase-recognition results into at most one suggestion at a time.
//
// - A phrase is suggested only after the same label is returned for `holdFrames` consecutive results.
// - Once suggested, the same phrase is not suggested again until the recognizer reports something else
//   (another phrase, uncertain, no hand, or no result). This stops one held sign from piling up repeats.
// - Uncertain, excluded or unavailable results never produce a suggestion.
// Nothing here speaks or adds text; the user confirms each suggestion.

export const DEFAULT_HOLD_FRAMES = 8;

export const initialPhraseState = () => ({
  candidate: null,
  count: 0,
  released: true,
  lastSuggested: null,
  suggestion: null,
  lastFrame: -1,
});

export function stepPhraseState(state, result, { holdFrames = DEFAULT_HOLD_FRAMES } = {}) {
  if (result && result.frame_sequence !== undefined && result.frame_sequence === state.lastFrame) {
    return state;
  }
  if (result && result.frame_sequence !== undefined) {
    state = { ...state, lastFrame: result.frame_sequence };
  }
  const recognized = result?.status === 'recognized' && typeof result.label === 'string' && result.label.length > 0;
  if (!recognized) {
    return { ...state, candidate: null, count: 0, released: true };
  }

  const label = result.label;
  const released = state.released || label !== state.lastSuggested;
  const count = label === state.candidate ? state.count + 1 : 1;
  const candidate = label;

  if (count >= holdFrames && released) {
    return {
      candidate,
      count,
      released: false,
      lastSuggested: label,
      suggestion: { label, confidence: result.confidence ?? null },
    };
  }
  return { ...state, candidate, count, released };
}

// Adds a confirmed phrase to the end of the draft, separated by one space.
export function appendPhraseToDraft(draft, phrase) {
  const text = String(phrase ?? '').trim();
  if (!text) return draft;
  if (!draft || draft.trim() === '') return text;
  return draft.endsWith(' ') ? `${draft}${text}` : `${draft} ${text}`;
}

export function confirmSuggestion(state) {
  return { ...state, suggestion: null };
}

export function discardSuggestion(state) {
  return { ...state, suggestion: null };
}

// The user picks a different phrase from the list. It becomes the suggestion, and it counts as already suggested.
export function correctSuggestion(state, label) {
  return { ...state, suggestion: { label, confidence: null, corrected: true }, lastSuggested: label, released: false };
}

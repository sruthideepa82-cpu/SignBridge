// Turns a stream of sequence-recognition results into a sentence of recognised signs.
//
// A sign is committed only after the same word is recognised on HOLD_RESULTS consecutive new results. Once it is
// committed, the same word cannot be committed again while the hand keeps making it: it is "blocked" until the
// model stops recognising it for RELEASE_RESULTS results, or a different sign is recognised. A short cooldown after
// each commit (STABILISE_RESULTS) stops one movement from starting the next sign. Uncertain, missing or
// unavailable results never count towards a sign. Results with a repeated frame number are ignored.

import { translateGlosses } from './islTranslation.js';

export const HOLD_RESULTS = 3;
export const RELEASE_RESULTS = 2;
export const STABILISE_RESULTS = 2;

export function initialSentence() {
  return {
    items: [],
    candidate: null,
    holdCount: 0,
    blockedWord: null,
    idleResults: 0,
    cooldown: 0,
    lastFrame: -1,
  };
}

export function signWords(items) {
  return items.filter((item) => item.type === 'sign').map((item) => item.word);
}

export function applySequenceResult(state, result) {
  if (!result || result.frame_sequence === state.lastFrame) return state;

  const cooling = state.cooldown > 0;
  const next = {
    ...state,
    lastFrame: result.frame_sequence,
    cooldown: Math.max(0, state.cooldown - 1),
  };

  if (result.status !== 'recognized' || !result.word) {
    const idleResults = state.idleResults + 1;
    const released = idleResults >= RELEASE_RESULTS;
    return {
      ...next,
      candidate: null,
      holdCount: 0,
      idleResults: released ? 0 : idleResults,
      blockedWord: released ? null : state.blockedWord,
    };
  }

  const { word } = result;
  let blockedWord = state.blockedWord;
  if (blockedWord !== null && word !== blockedWord) blockedWord = null;
  const stillHolding = blockedWord !== null && word === blockedWord;
  const base = { ...next, idleResults: 0, blockedWord };

  if (stillHolding || cooling) {
    return { ...base, candidate: null, holdCount: 0 };
  }

  const holdCount = word === state.candidate ? state.holdCount + 1 : 1;
  if (holdCount < HOLD_RESULTS) {
    return { ...base, candidate: word, holdCount };
  }

  return {
    ...base,
    items: [...state.items, { type: 'sign', word, confidence: result.confidence ?? null }],
    candidate: null,
    holdCount: 0,
    blockedWord: word,
    cooldown: STABILISE_RESULTS,
  };
}

export function undoLast(state) {
  return { ...state, items: state.items.slice(0, -1) };
}

export function removeAt(state, index) {
  return { ...state, items: state.items.filter((_, position) => position !== index) };
}

export function addSpace(state) {
  if (state.items.length === 0 || state.items[state.items.length - 1].type === 'space') return state;
  return { ...state, items: [...state.items, { type: 'space' }] };
}

// Clears the words but keeps the hold and cooldown, so the sign still being held is not committed again.
export function clearText(state) {
  return { ...state, items: [], candidate: null, holdCount: 0 };
}

export function previewSentence(state) {
  return translateGlosses(signWords(state.items));
}

// Builds the completed message from the current signs and clears the buffer. Returns null when no sign is set.
export function finishSentence(state, { id, now }) {
  const glosses = signWords(state.items);
  if (glosses.length === 0) return { state, message: null };
  const translation = translateGlosses(glosses);
  const confidences = state.items.filter((item) => item.type === 'sign').map((item) => item.confidence);
  const message = {
    id,
    text: translation.text,
    glosses,
    unmapped: translation.unmapped,
    isQuestion: translation.isQuestion,
    confidences,
    createdAt: now,
  };
  return { state: clearText(state), message };
}

// The reducer used by the Live Studio component. Each action returns the next state.
export function sentenceReducer(state, action) {
  switch (action.type) {
    case 'result':
      return applySequenceResult(state, action.result);
    case 'undo':
      return undoLast(state);
    case 'remove':
      return removeAt(state, action.index);
    case 'space':
      return addSpace(state);
    case 'clear':
      return clearText(state);
    case 'reset':
      return initialSentence();
    default:
      return state;
  }
}

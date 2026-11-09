import type { SignPrediction } from './classifier';

// Confirms a sign only after the same word stays above the confidence threshold for holdMs.
// A confirmed word can't be confirmed again until the hand drops out or a different sign appears,
// so a single held sign never adds the same word twice in a row.

export interface HoldOptions {
  threshold: number;
  holdMs: number;
}

export interface HoldState {
  candidate: SignPrediction | null;
  since: number;
  confirmed: boolean;
  lastConfirmedWord: string | null;
}

export interface HoldUpdate {
  state: HoldState;
  confirmed: SignPrediction | null;
  // Progress toward confirmation for the current candidate, 0 to 1. Used by the UI.
  progress: number;
}

export function initialHoldState(): HoldState {
  return { candidate: null, since: 0, confirmed: false, lastConfirmedWord: null };
}

export function updateHold(
  state: HoldState,
  prediction: SignPrediction | null,
  now: number,
  options: HoldOptions,
): HoldUpdate {
  const usable = prediction !== null && prediction.confidence >= options.threshold;

  if (!usable) {
    // Hand gone or unsure: reset the hold, and allow the same word to be signed again later.
    return {
      state: { candidate: null, since: 0, confirmed: false, lastConfirmedWord: null },
      confirmed: null,
      progress: 0,
    };
  }

  if (!state.candidate || state.candidate.word !== prediction.word) {
    return {
      state: { candidate: prediction, since: now, confirmed: false, lastConfirmedWord: state.lastConfirmedWord },
      confirmed: null,
      progress: 0,
    };
  }

  const next: HoldState = { ...state, candidate: prediction };
  const held = now - state.since;
  const progress = Math.min(1, held / options.holdMs);

  const repeatsLast = prediction.word === state.lastConfirmedWord;

  if (!state.confirmed && !repeatsLast && held >= options.holdMs) {
    return {
      state: { ...next, confirmed: true, lastConfirmedWord: prediction.word },
      confirmed: prediction,
      progress: 1,
    };
  }

  return { state: next, confirmed: null, progress };
}

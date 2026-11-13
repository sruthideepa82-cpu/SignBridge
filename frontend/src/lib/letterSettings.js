// Letter recognition settings for Live Studio, kept in this browser.
//
// stableFrames: how many consecutive processed frames must show the same letter before it is added to the draft.
// minConfidence: an extra threshold chosen by the user. It can only make recognition stricter than the backend's
// threshold, never looser. A result below it is shown as UNKNOWN and is not added to the draft.
import { HOLD_FRAMES } from './signBuffer.js';

export const LETTER_SETTINGS_KEY = 'signbridge.letters.v1';
export const STABLE_FRAMES_RANGE = { min: 2, max: 10 };
export const CONFIDENCE_RANGE = { min: 0.5, max: 0.95 };
export const DEFAULT_LETTER_SETTINGS = Object.freeze({ stableFrames: HOLD_FRAMES, minConfidence: null });

export function normaliseLetterSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const frames = Number.isInteger(source.stableFrames) ? source.stableFrames : DEFAULT_LETTER_SETTINGS.stableFrames;
  const confidence = typeof source.minConfidence === 'number' ? source.minConfidence : null;
  return {
    stableFrames: Math.min(STABLE_FRAMES_RANGE.max, Math.max(STABLE_FRAMES_RANGE.min, frames)),
    minConfidence:
      confidence === null
        ? null
        : Math.min(CONFIDENCE_RANGE.max, Math.max(CONFIDENCE_RANGE.min, confidence)),
  };
}

export function loadLetterSettings(storage = window.localStorage) {
  try {
    return normaliseLetterSettings(JSON.parse(storage.getItem(LETTER_SETTINGS_KEY) ?? 'null'));
  } catch {
    return normaliseLetterSettings(null);
  }
}

export function saveLetterSettings(settings, storage = window.localStorage) {
  const next = normaliseLetterSettings(settings);
  storage.setItem(LETTER_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

// The result the rest of Live Studio should use. A recognized letter below the user's threshold becomes an UNKNOWN
// (uncertain) result, so it is never shown as a sign or added to the draft. Other results pass through unchanged.
export function effectiveRecognition(result, minConfidence) {
  if (!result || result.status !== 'recognized' || minConfidence === null || minConfidence === undefined) {
    return result;
  }
  if (result.confidence >= minConfidence) return result;
  return {
    ...result,
    status: 'uncertain',
    label: null,
    detail: `Confidence is below your threshold of ${Math.round(minConfidence * 100)}%.`,
  };
}

// Live Studio recognition mode. Alphabet is the default. The choice is remembered in this browser only.

export const RECOGNITION_MODES = {
  ALPHABET: 'alphabet',
  PHRASES: 'phrases',
};

export const RECOGNITION_MODE_LABELS = {
  [RECOGNITION_MODES.ALPHABET]: 'Alphabet Mode',
  [RECOGNITION_MODES.PHRASES]: 'Daily Phrases Mode',
};

export const RECOGNITION_MODE_KEY = 'signbridge.recognitionMode';

export function loadRecognitionMode(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(RECOGNITION_MODE_KEY);
    return stored === RECOGNITION_MODES.PHRASES ? RECOGNITION_MODES.PHRASES : RECOGNITION_MODES.ALPHABET;
  } catch {
    return RECOGNITION_MODES.ALPHABET;
  }
}

export function saveRecognitionMode(mode, storage = globalThis.localStorage) {
  const value = mode === RECOGNITION_MODES.PHRASES ? RECOGNITION_MODES.PHRASES : RECOGNITION_MODES.ALPHABET;
  try {
    storage?.setItem(RECOGNITION_MODE_KEY, value);
  } catch {
    // Storage can be unavailable (private mode); the mode still applies for this page view.
  }
  return value;
}

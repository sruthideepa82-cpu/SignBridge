// Demo vocabulary. Add a word here and it is recognised, shown and interpreted.
//
// Each one-hand word is a finger pattern in the order [thumb, index, middle, ring, pinky]:
// 1 = finger extended, 0 = curled. These templates are rough placeholders for a rule-based
// classifier. They are not a trained model and will confuse similar shapes.
//
// FINISH is a two-hand sign (both open palms raised). It ends the utterance and is never added
// to the gloss sequence.

export type FingerPattern = readonly [number, number, number, number, number];

export interface SignDefinition {
  word: string;
  hands: 1 | 2;
  pattern: FingerPattern;
  // Two-hand signs: the wrists must be in the upper part of the frame (0 = top, 1 = bottom).
  maxWristY?: number;
}

export const FINISH_WORD = 'FINISH';

export const SIGNS: readonly SignDefinition[] = [
  { word: 'TECHNOLOGY', hands: 1, pattern: [0, 1, 0, 0, 0] },
  { word: 'USE', hands: 1, pattern: [1, 1, 0, 0, 0] },
  { word: 'IMPROVE', hands: 1, pattern: [1, 0, 0, 0, 0] },
  { word: 'LIFE', hands: 1, pattern: [0, 0, 0, 0, 1] },
  { word: 'WAR', hands: 1, pattern: [0, 1, 1, 0, 0] },
  { word: 'NOT', hands: 1, pattern: [0, 1, 1, 1, 1] },
  { word: 'UNDERSTAND', hands: 1, pattern: [0, 0, 0, 0, 0] },
  { word: FINISH_WORD, hands: 2, pattern: [1, 1, 1, 1, 1], maxWristY: 0.6 },
];

export const ONE_HAND_SIGNS = SIGNS.filter((sign) => sign.hands === 1);
export const FINISH_SIGN = SIGNS.find((sign) => sign.word === FINISH_WORD)!;

export const CONFIDENCE_THRESHOLD = 0.6;
export const HOLD_MS = 600;
// Gloss chips at or above this confidence are shown green; below it, amber.
export const CONFIDENT_THRESHOLD = 0.8;

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { describe, expect, it } from 'vitest';
import { SIGNS, ONE_HAND_SIGNS, FINISH_WORD } from '../app/signs';
import { classifyFinish, classifySign, ruleBasedClassifier } from './classifier';

type Fingers = { thumb: boolean; index: boolean; middle: boolean; ring: boolean; pinky: boolean };

const point = (x: number, y: number): NormalizedLandmark => ({ x, y, z: 0, visibility: 0 });

// Builds a synthetic 21-landmark hand. Extended fingers are straight; curled fingers fold toward the palm.
function makeHand(fingers: Fingers, wristY = 0.8): NormalizedLandmark[] {
  const points: NormalizedLandmark[] = Array.from({ length: 21 }, () => point(0.5, 0.5));
  points[0] = point(0.5, wristY);

  const names: Array<keyof Omit<Fingers, 'thumb'>> = ['index', 'middle', 'ring', 'pinky'];
  const bases = [5, 9, 13, 17];
  const pips = [6, 10, 14, 18];
  const tips = [8, 12, 16, 20];

  names.forEach((name, i) => {
    const x = 0.44 + i * 0.04;
    const extended = fingers[name];
    points[bases[i]] = point(x, wristY - 0.18);
    points[pips[i]] = point(x, wristY - 0.28);
    points[tips[i]] = extended ? point(x, wristY - 0.36) : point(x + 0.01, wristY - 0.2);
  });

  points[2] = point(0.38, wristY - 0.1);
  points[4] = fingers.thumb ? point(0.2, wristY - 0.3) : point(0.36, wristY - 0.12);
  return points;
}

const pattern = (word: string): Fingers => {
  const sign = SIGNS.find((s) => s.word === word)!;
  const [thumb, index, middle, ring, pinky] = sign.pattern;
  return { thumb: thumb === 1, index: index === 1, middle: middle === 1, ring: ring === 1, pinky: pinky === 1 };
};

describe('single-hand classification', () => {
  for (const sign of ONE_HAND_SIGNS) {
    it(`recognises ${sign.word} from its finger pattern`, () => {
      const result = classifySign(makeHand(pattern(sign.word)));
      expect(result.word).toBe(sign.word);
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  }
});

describe('FINISH (two open palms raised)', () => {
  const openPalm = pattern(FINISH_WORD);

  it('is recognised when both open palms are raised', () => {
    const result = classifyFinish([makeHand(openPalm, 0.4), makeHand(openPalm, 0.4)]);
    expect(result?.word).toBe(FINISH_WORD);
    expect(result!.confidence).toBeGreaterThan(0.8);
  });

  it('is weak when the palms are lowered below the upper frame', () => {
    const result = classifyFinish([makeHand(openPalm, 0.95), makeHand(openPalm, 0.95)]);
    expect(result!.confidence).toBeLessThan(0.6);
  });

  it('is not returned for a single hand', () => {
    expect(classifyFinish([makeHand(openPalm, 0.4)])).toBeNull();
  });

  it('is not returned when only one of two hands is open', () => {
    const result = ruleBasedClassifier.classify([makeHand(openPalm, 0.4), makeHand(pattern('UNDERSTAND'), 0.4)]);
    expect(result?.word).not.toBe(FINISH_WORD);
  });
});

describe('ruleBasedClassifier', () => {
  it('returns null when no hand is visible', () => {
    expect(ruleBasedClassifier.classify([])).toBeNull();
  });

  it('uses a single-hand reading when two hands are visible but not a FINISH', () => {
    const result = ruleBasedClassifier.classify([
      makeHand(pattern('TECHNOLOGY'), 0.6),
      makeHand(pattern('UNDERSTAND'), 0.9),
    ]);
    expect(ONE_HAND_SIGNS.map((s) => s.word)).toContain(result?.word);
  });
});

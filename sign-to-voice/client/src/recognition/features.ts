import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { FingerPattern } from '../app/signs';

// Landmark indices (MediaPipe hand model). Thumb uses its MCP and tip; other fingers use PIP and tip.
const WRIST = 0;
const THUMB = { base: 2, tip: 4 };
const FINGERS: ReadonlyArray<{ base: number; tip: number }> = [
  { base: 6, tip: 8 }, // index
  { base: 10, tip: 12 }, // middle
  { base: 14, tip: 16 }, // ring
  { base: 18, tip: 20 }, // pinky
];

export interface HandFeatures {
  // Extension per finger in order [thumb, index, middle, ring, pinky], each 0 (curled) to 1 (extended).
  extension: readonly [number, number, number, number, number];
  wristY: number;
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function extractFeatures(landmarks: NormalizedLandmark[]): HandFeatures {
  const wrist = landmarks[WRIST];

  // Tip distance from the wrist relative to the joint distance: straight fingers are longer than curled ones.
  const thumbRatio = distance(wrist, landmarks[THUMB.tip]) / distance(wrist, landmarks[THUMB.base]);
  const thumb = clamp01((thumbRatio - 1.2) / 0.5);

  const fingers = FINGERS.map(({ base, tip }) => {
    const ratio = distance(wrist, landmarks[tip]) / distance(wrist, landmarks[base]);
    return clamp01((ratio - 1.0) / 0.3);
  });

  return {
    extension: [thumb, fingers[0], fingers[1], fingers[2], fingers[3]],
    wristY: wrist.y,
  };
}

// Probability-like agreement between measured extension and a template pattern, 0 to 1.
export function patternScore(extension: HandFeatures['extension'], pattern: FingerPattern): number {
  let total = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    total += pattern[i] === 1 ? extension[i] : 1 - extension[i];
  }
  return total / pattern.length;
}

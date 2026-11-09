// Facial expression from MediaPipe face blendshapes (0 to 1 per named muscle movement).
// These formulas are heuristic. They are a starting point, not a trained expression model.

export const EMOTIONS = ['Happy', 'Sad', 'Neutral', 'Angry', 'Questioning', 'Skeptical'] as const;
export type Emotion = (typeof EMOTIONS)[number];

export type Blendshapes = Readonly<Record<string, number>>;
export type EmotionScores = Record<Emotion, number>;

// Neutral is a fixed floor. Another emotion has to beat it to win, so a relaxed face reads as Neutral.
const NEUTRAL_FLOOR = 0.25;

const avg = (shapes: Blendshapes, names: string[]): number =>
  names.reduce((sum, name) => sum + (shapes[name] ?? 0), 0) / names.length;

const diff = (shapes: Blendshapes, left: string, right: string): number =>
  Math.abs((shapes[left] ?? 0) - (shapes[right] ?? 0));

export function scoreEmotions(shapes: Blendshapes): EmotionScores {
  const smile = avg(shapes, ['mouthSmileLeft', 'mouthSmileRight']);
  const frown = avg(shapes, ['mouthFrownLeft', 'mouthFrownRight']);
  const browDown = avg(shapes, ['browDownLeft', 'browDownRight']);
  const browUp = avg(shapes, ['browOuterUpLeft', 'browOuterUpRight']);
  const browInner = shapes['browInnerUp'] ?? 0;
  const press = avg(shapes, ['mouthPressLeft', 'mouthPressRight']);
  const sneer = avg(shapes, ['noseSneerLeft', 'noseSneerRight']);
  const eyeWide = avg(shapes, ['eyeWideLeft', 'eyeWideRight']);
  const cheekSquint = avg(shapes, ['cheekSquintLeft', 'cheekSquintRight']);

  return {
    Happy: smile + 0.3 * cheekSquint,
    Sad: frown + 0.5 * browInner,
    Neutral: NEUTRAL_FLOOR,
    Angry: browDown + 0.5 * press + 0.3 * sneer,
    Questioning: 0.5 * browInner + 0.5 * browUp + 0.4 * eyeWide,
    // One brow higher or lower than the other is the classic skeptical look.
    Skeptical: diff(shapes, 'browOuterUpLeft', 'browOuterUpRight') + diff(shapes, 'browDownLeft', 'browDownRight'),
  };
}

export function classifyEmotion(shapes: Blendshapes): { emotion: Emotion; scores: EmotionScores } {
  const scores = scoreEmotions(shapes);
  let best: Emotion = 'Neutral';
  for (const emotion of EMOTIONS) {
    if (scores[emotion] > scores[best]) best = emotion;
  }
  return { emotion: best, scores };
}

// Averages the last `size` frames so the label does not flicker.
export class EmotionSmoother {
  private readonly window: EmotionScores[] = [];

  constructor(private readonly size = 15) {}

  push(scores: EmotionScores): Emotion {
    this.window.push(scores);
    if (this.window.length > this.size) this.window.shift();

    let best: Emotion = 'Neutral';
    let bestValue = -Infinity;
    for (const emotion of EMOTIONS) {
      const value = this.window.reduce((sum, frame) => sum + frame[emotion], 0) / this.window.length;
      if (value > bestValue) {
        bestValue = value;
        best = emotion;
      }
    }
    return best;
  }

  reset(): void {
    this.window.length = 0;
  }
}

// Counts the smoothed emotion per frame across one utterance. The most frequent one is sent to the LLM.
export class EmotionTally {
  private counts = new Map<Emotion, number>();

  add(emotion: Emotion): void {
    this.counts.set(emotion, (this.counts.get(emotion) ?? 0) + 1);
  }

  dominant(): Emotion {
    let best: Emotion = 'Neutral';
    let bestCount = 0;
    for (const [emotion, count] of this.counts) {
      if (count > bestCount) {
        best = emotion;
        bestCount = count;
      }
    }
    return best;
  }

  reset(): void {
    this.counts = new Map();
  }
}

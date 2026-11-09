import type { TrackedHand } from '../vision/handTracker';

// The model was trained on 32-frame clips with two hand slots (0 = Left, 1 = Right) and zeros for a
// missing hand. This window builds the same layout from live detections.

export const WINDOW_FRAMES = 32;
const HANDS = 2;
const LANDMARKS = 21;
const COORDS = 3;

export type Frame = number[][][]; // [hand slot][landmark][coordinate]

function emptyFrame(): Frame {
  return Array.from({ length: HANDS }, () =>
    Array.from({ length: LANDMARKS }, () => [0, 0, 0]),
  );
}

export function frameFromHands(hands: readonly TrackedHand[]): Frame {
  const frame = emptyFrame();
  hands.forEach((hand, index) => {
    const slot = hand.handedness === 'Left' ? 0 : hand.handedness === 'Right' ? 1 : index % HANDS;
    frame[slot] = hand.landmarks.map((point) => [point.x, point.y, point.z ?? 0]);
  });
  return frame;
}

export class LandmarkWindow {
  private frames: Frame[] = [];

  push(hands: readonly TrackedHand[]): void {
    this.frames.push(frameFromHands(hands));
    if (this.frames.length > WINDOW_FRAMES) this.frames.shift();
  }

  get full(): boolean {
    return this.frames.length === WINDOW_FRAMES;
  }

  // Oldest frame first, exactly WINDOW_FRAMES long. Only call when full.
  payload(): number[][][][] {
    if (!this.full) throw new Error(`The window needs ${WINDOW_FRAMES} frames before it can be sent.`);
    return this.frames.map((frame) => frame.map((hand) => hand.map((point) => [...point])));
  }

  clear(): void {
    this.frames = [];
  }
}

export const WINDOW_SHAPE = [WINDOW_FRAMES, HANDS, LANDMARKS, COORDS] as const;

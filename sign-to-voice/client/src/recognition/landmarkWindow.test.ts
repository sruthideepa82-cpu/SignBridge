import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { describe, expect, it } from 'vitest';
import type { TrackedHand } from '../vision/handTracker';
import { frameFromHands, LandmarkWindow, WINDOW_FRAMES } from './landmarkWindow';

function hand(handedness: string, x: number): TrackedHand {
  const landmarks = Array.from({ length: 21 }, (_, i) => ({ x: x + i * 0.001, y: 0.5, z: 0.01 }) as NormalizedLandmark);
  return { landmarks, handedness, score: 0.9 };
}

describe('frameFromHands', () => {
  it('puts the Left hand in slot 0 and the Right hand in slot 1', () => {
    const frame = frameFromHands([hand('Right', 0.8), hand('Left', 0.2)]);
    expect(frame[0][0][0]).toBeCloseTo(0.2);
    expect(frame[1][0][0]).toBeCloseTo(0.8);
  });

  it('leaves zeros for a missing hand, as the training extractor does', () => {
    const frame = frameFromHands([hand('Right', 0.5)]);
    expect(frame[0].every((point) => point.every((value) => value === 0))).toBe(true);
    expect(frame[1][0][0]).toBeCloseTo(0.5);
  });
});

describe('LandmarkWindow', () => {
  it('is not full until 32 frames have been pushed', () => {
    const window = new LandmarkWindow();
    for (let i = 0; i < WINDOW_FRAMES - 1; i += 1) window.push([hand('Right', 0.5)]);
    expect(window.full).toBe(false);
    window.push([hand('Right', 0.5)]);
    expect(window.full).toBe(true);
  });

  it('sends exactly 32 frames of 2 hands, 21 landmarks and 3 coordinates', () => {
    const window = new LandmarkWindow();
    for (let i = 0; i < 40; i += 1) window.push([hand('Left', 0.5)]);
    const payload = window.payload();
    expect(payload).toHaveLength(32);
    expect(payload[0]).toHaveLength(2);
    expect(payload[0][0]).toHaveLength(21);
    expect(payload[0][0][0]).toHaveLength(3);
  });

  it('keeps only the newest 32 frames, oldest first', () => {
    const window = new LandmarkWindow();
    for (let i = 0; i < 40; i += 1) window.push([hand('Right', i / 100)]);
    const payload = window.payload();
    expect(payload[0][1][0][0]).toBeCloseTo(0.08);
    expect(payload[31][1][0][0]).toBeCloseTo(0.39);
  });

  it('refuses to build a payload before the window is full', () => {
    const window = new LandmarkWindow();
    window.push([hand('Right', 0.5)]);
    expect(() => window.payload()).toThrow();
  });

  it('clears the frames', () => {
    const window = new LandmarkWindow();
    for (let i = 0; i < WINDOW_FRAMES; i += 1) window.push([hand('Right', 0.5)]);
    window.clear();
    expect(window.full).toBe(false);
  });
});

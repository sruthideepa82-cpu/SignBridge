import { describe, expect, it, vi } from 'vitest';
import fixture from '../test/fixtures/face-grace-hopper.json';
import { FACE_OVAL, LEFT_EYE, RIGHT_EYE, LEFT_EYEBROW, RIGHT_EYEBROW, NOSE, LIPS } from './faceConnections.js';
import { drawFaceOverlay, FACE_OVERLAY_CONNECTIONS, faceOverlaySegments } from './faceOverlay.js';

describe('official face connection sets', () => {
  it('match the MediaPipe definitions that were exported', () => {
    expect(FACE_OVAL).toHaveLength(36);
    expect(LEFT_EYE).toHaveLength(16);
    expect(RIGHT_EYE).toHaveLength(16);
    expect(LEFT_EYEBROW).toHaveLength(8);
    expect(RIGHT_EYEBROW).toHaveLength(8);
    expect(NOSE).toHaveLength(25);
    expect(LIPS).toHaveLength(40);
  });

  it('only refer to the 478 face landmark indices', () => {
    for (const set of FACE_OVERLAY_CONNECTIONS) {
      for (const [start, end] of set) {
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeLessThan(478);
      }
    }
  });
});

describe('faceOverlaySegments on real landmarks', () => {
  it('builds one segment per connection in the overlay sets', () => {
    const expected = FACE_OVERLAY_CONNECTIONS.reduce((sum, set) => sum + set.length, 0);

    const segments = faceOverlaySegments(fixture.landmarks, FACE_OVERLAY_CONNECTIONS, 640, 480);

    expect(segments).toHaveLength(expected);
  });

  it('places every segment inside the drawing area when the face is inside the frame', () => {
    const segments = faceOverlaySegments(fixture.landmarks, FACE_OVERLAY_CONNECTIONS, 640, 480);

    for (const [x1, y1, x2, y2] of segments) {
      for (const value of [x1, x2]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(640);
      }
      for (const value of [y1, y2]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(480);
      }
    }
  });

  it('scales normalised points to the size of the preview', () => {
    const [start, end] = FACE_OVAL[0];
    const [x1, y1, x2, y2] = faceOverlaySegments(fixture.landmarks, [[[start, end]]], 200, 100)[0];

    expect(x1).toBeCloseTo(fixture.landmarks[start][0] * 200);
    expect(y1).toBeCloseTo(fixture.landmarks[start][1] * 100);
    expect(x2).toBeCloseTo(fixture.landmarks[end][0] * 200);
    expect(y2).toBeCloseTo(fixture.landmarks[end][1] * 100);
  });

  it('draws nothing when there are no landmarks', () => {
    expect(faceOverlaySegments(null, FACE_OVERLAY_CONNECTIONS, 640, 480)).toEqual([]);
    expect(faceOverlaySegments([], FACE_OVERLAY_CONNECTIONS, 640, 480)).toEqual([]);
  });
});

describe('drawFaceOverlay', () => {
  it('clears the canvas and strokes the segments', () => {
    const ctx = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };

    const drawn = drawFaceOverlay(ctx, fixture.landmarks, 640, 480);

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(drawn).toBeGreaterThan(100);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});

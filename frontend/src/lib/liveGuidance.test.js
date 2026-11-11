import { describe, expect, it } from 'vitest';
import { describeConfidence, describeHandTracking, guidanceFor } from './liveGuidance.js';

describe('describeConfidence', () => {
  it('shows no number when there is no recognition result', () => {
    expect(describeConfidence(null, false).value).toBe('—');
  });

  it('shows no number while recognition is paused, even if an old result exists', () => {
    expect(describeConfidence({ status: 'recognized', confidence: 0.9, threshold: 0.7 }, true).value).toBe('—');
  });

  it('shows the real confidence for a recognised sign and flags a low-confidence frame', () => {
    expect(describeConfidence({ status: 'recognized', confidence: 0.91, threshold: 0.7 }, false)).toMatchObject({
      value: '91%',
      threshold: '70%',
      lowConfidence: false,
    });
    expect(describeConfidence({ status: 'uncertain', confidence: 0.4, threshold: 0.7 }, false)).toMatchObject({
      value: '40%',
      lowConfidence: true,
    });
  });

  it('shows no number for a result without a confidence value', () => {
    expect(describeConfidence({ status: 'no_hand' }, false).value).toBe('—');
  });
});

describe('describeHandTracking', () => {
  it('reports the camera and pause state before anything else', () => {
    expect(describeHandTracking({ landmarks: null, landmarkError: '', cameraLive: false, paused: false }).label).toBe(
      'Waiting for camera',
    );
    expect(describeHandTracking({ landmarks: null, landmarkError: '', cameraLive: true, paused: true }).label).toBe('Paused');
  });

  it('reports detected hands with the real count', () => {
    const view = describeHandTracking({
      landmarks: { status: 'hand_detected', hand_count: 2 },
      landmarkError: '',
      cameraLive: true,
      paused: false,
    });
    expect(view).toEqual({ label: '2 hands tracked', tone: 'success' });
  });

  it('reports a missing hand and a backend error', () => {
    expect(
      describeHandTracking({ landmarks: { status: 'no_hand' }, landmarkError: '', cameraLive: true, paused: false }).label,
    ).toBe('No hand in view');
    expect(describeHandTracking({ landmarks: null, landmarkError: 'down', cameraLive: true, paused: false }).tone).toBe(
      'danger',
    );
  });
});

describe('guidanceFor', () => {
  const idle = { cameraLive: true, paused: false, landmarks: null, landmarkError: '', recognition: null, recognitionError: '' };

  it('asks for a hand when none is in view', () => {
    expect(guidanceFor({ ...idle, landmarks: { status: 'no_hand' } })).toMatch(/No hand in view/);
  });

  it('explains a missing trained model without claiming a sign was read', () => {
    expect(guidanceFor({ ...idle, recognition: { status: 'no_model' } })).toMatch(/no trained model/);
  });

  it('asks the user to hold the sign steady when confidence is low', () => {
    expect(guidanceFor({ ...idle, recognition: { status: 'uncertain' } })).toMatch(/Hold the sign steady/);
  });

  it('needs no guidance when a sign is recognised', () => {
    expect(guidanceFor({ ...idle, recognition: { status: 'recognized', label: 'U', confidence: 0.9 } })).toBeNull();
  });

  it('gives the most important problem first', () => {
    expect(guidanceFor({ ...idle, cameraLive: false, recognition: { status: 'uncertain' } })).toMatch(/Start the camera/);
    expect(guidanceFor({ ...idle, paused: true })).toMatch(/paused/);
  });
});
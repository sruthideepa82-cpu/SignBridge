import { describe, expect, it } from 'vitest';
import { describeFace, NO_FACE_MESSAGE, strengthText } from './faceStatus.js';

const live = { cameraLive: true, paused: false, error: '' };

describe('describeFace', () => {
  it('asks for the camera before anything else', () => {
    expect(describeFace({ face: null, error: '', cameraLive: false, paused: false }).label).toBe('Waiting for camera');
  });

  it('reports a detected face with its expression and strength from the backend', () => {
    const view = describeFace({
      ...live,
      face: { status: 'face_detected', expression: 'Sad', strength: 0.42, landmark_count: 478 },
    });

    expect(view).toMatchObject({ label: 'Face detected', tone: 'success', expression: 'Sad', strength: 0.42, landmarkCount: 478 });
    expect(view.message).toBeNull();
  });

  it('asks the user to move into the frame when no face is visible', () => {
    const view = describeFace({ ...live, face: { status: 'no_face' } });

    expect(view.label).toBe('No face in view');
    expect(view.message).toBe(NO_FACE_MESSAGE);
    expect(view.expression).toBeNull();
  });

  it('shows the backend model error instead of an expression', () => {
    const view = describeFace({
      ...live,
      face: { status: 'detection_unavailable', detection_error: 'MediaPipe could not load the face model: missing file' },
    });

    expect(view.tone).toBe('danger');
    expect(view.message).toMatch(/could not load the face model/);
    expect(view.expression).toBeNull();
  });

  it('reports a request failure without inventing a face', () => {
    const view = describeFace({ face: null, error: 'Cannot reach the SignBridge backend.', cameraLive: true, paused: false });

    expect(view.label).toBe('Unavailable');
    expect(view.expression).toBeNull();
  });

  it('does not analyse faces while recognition is paused', () => {
    expect(describeFace({ face: { status: 'face_detected', expression: 'Happy' }, error: '', cameraLive: true, paused: true }).label).toBe(
      'Paused',
    );
  });
});

describe('strengthText', () => {
  it('is blank when the backend gives no strength', () => {
    expect(strengthText(null)).toBeNull();
    expect(strengthText(0.8)).toBe('Strength 80%');
  });
});

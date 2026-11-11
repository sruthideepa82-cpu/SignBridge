import { describe, expect, it } from 'vitest';
import fixture from '../test/fixtures/face-grace-hopper.json';
import { CAMERA_STATUS } from '../hooks/useCamera.js';
import { describeFace, NO_FACE_MESSAGE, PARTIAL_FACE_MESSAGE, STALE_BACKEND_MESSAGE, strengthText, UNCERTAIN_NOTE } from './faceStatus.js';

const live = { cameraLive: true, paused: false, error: '', cameraStatus: CAMERA_STATUS.LIVE, cameraError: '' };

const detected = (overrides = {}) => ({
  status: 'face_detected',
  face_count: 1,
  landmark_count: 478,
  expression: 'Happy',
  strength: 0.8,
  faces: [{ bbox: [0.2, 0.2, 0.8, 0.8], partially_outside_frame: false, landmarks: [], blendshapes: fixture.blendshapes }],
  ...overrides,
});

describe('describeFace', () => {
  it('reports a detected face with its real count, landmarks and blendshapes', () => {
    const view = describeFace({ ...live, face: detected() });

    expect(view).toMatchObject({ label: 'Face detected', tone: 'success', faceCount: 1, landmarkCount: 478, expression: 'Happy' });
    expect(view.blendshapes).toBe(fixture.blendshapes);
    expect(view.message).toBeNull();
  });

  it('warns when the face is partly outside the frame', () => {
    const face = detected({ faces: [{ partially_outside_frame: true, landmarks: [], blendshapes: null }] });

    const view = describeFace({ ...live, face });

    expect(view.label).toBe('Partly outside frame');
    expect(view.tone).toBe('warning');
    expect(view.message).toBe(PARTIAL_FACE_MESSAGE);
    expect(view.partiallyOutside).toBe(true);
  });

  it('asks the user to move into the frame when no face is visible', () => {
    const view = describeFace({ ...live, face: { status: 'no_face', face_count: 0, landmark_count: 0, faces: [] } });

    expect(view.label).toBe('Face not detected');
    expect(view.message).toBe(NO_FACE_MESSAGE);
    expect(view.expression).toBeNull();
    expect(view.blendshapes).toBeNull();
  });

  it('shows the backend model error instead of an expression', () => {
    const view = describeFace({
      ...live,
      face: { status: 'detection_unavailable', detection_error: 'MediaPipe could not load the face model: missing file' },
    });

    expect(view.label).toBe('Model unavailable');
    expect(view.tone).toBe('danger');
    expect(view.message).toMatch(/could not load the face model/);
    expect(view.expression).toBeNull();
  });

  it('reports a processing error from the backend', () => {
    const view = describeFace({ ...live, face: { status: 'processing_error', detection_error: 'Facial tracking failed on a frame.' } });

    expect(view.label).toBe('Processing error');
    expect(view.message).toBe('Facial tracking failed on a frame.');
  });

  it('shows the model as loading until the first result arrives', () => {
    expect(describeFace({ ...live, face: null }).label).toBe('Loading face model');
  });

  it('reports a disconnected camera as its own state', () => {
    const view = describeFace({
      face: null,
      error: '',
      cameraLive: false,
      paused: false,
      cameraStatus: CAMERA_STATUS.ERROR,
      cameraError: 'The webcam stopped delivering frames.',
    });

    expect(view.label).toBe('Camera disconnected');
    expect(view.tone).toBe('danger');
    expect(view.message).toBe('The webcam stopped delivering frames.');
  });

  it('asks for the camera before anything else when it is off', () => {
    expect(describeFace({ face: null, error: '', cameraLive: false, paused: false, cameraStatus: CAMERA_STATUS.IDLE }).label).toBe(
      'Waiting for camera',
    );
  });

  it('reports a request failure without inventing a face', () => {
    const view = describeFace({ ...live, face: null, error: 'Cannot reach the SignBridge backend.' });

    expect(view.label).toBe('Unavailable');
    expect(view.expression).toBeNull();
  });

  it('does not analyse faces while recognition is paused', () => {
    expect(describeFace({ ...live, face: detected(), paused: true }).label).toBe('Paused');
  });
});

describe('strengthText', () => {
  it('is blank when the backend gives no strength', () => {
    expect(strengthText(null)).toBeNull();
    expect(strengthText(0.8)).toBe('Strength 80%');
  });
});

describe('stale backend and uncertain expressions', () => {
  it('tells the user to restart the backend when the face endpoint is missing', () => {
    const view = describeFace({ ...live, face: null, error: STALE_BACKEND_MESSAGE });

    expect(view.label).toBe('Backend out of date');
    expect(view.tone).toBe('danger');
    expect(view.message).toMatch(/Restart the backend/);
  });

  it('reports an uncertain expression without naming one', () => {
    const view = describeFace({ ...live, face: detected({ expression: 'Uncertain', strength: 0.4 }) });

    expect(view.label).toBe('Face detected');
    expect(view.expression).toBe('Uncertain');
    expect(view.message).toBe(UNCERTAIN_NOTE);
  });
});

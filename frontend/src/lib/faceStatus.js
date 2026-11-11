// What Live Studio shows about the face. Every value comes from the backend's face result. The expression is an
// estimate from facial movements, so the strength is labelled as a heuristic and never as a probability.
export const NO_FACE_MESSAGE = 'Move into the camera frame to enable facial tracking.';
export const ESTIMATE_NOTE = 'Estimate from facial movements. Not a verified reading of how someone feels.';

export function describeFace({ face, error, cameraLive, paused }) {
  if (paused) {
    return { label: 'Paused', tone: 'neutral', message: 'Facial tracking pauses with recognition.', expression: null, strength: null };
  }
  if (!cameraLive) {
    return { label: 'Waiting for camera', tone: 'neutral', message: 'Start the camera to enable facial tracking.', expression: null, strength: null };
  }
  if (error) {
    return { label: 'Unavailable', tone: 'danger', message: error, expression: null, strength: null };
  }
  if (!face) {
    return { label: 'Checking', tone: 'neutral', message: null, expression: null, strength: null };
  }

  switch (face.status) {
    case 'face_detected':
      return {
        label: 'Face detected',
        tone: 'success',
        message: null,
        expression: face.expression,
        strength: face.strength,
        landmarkCount: face.landmark_count,
      };
    case 'no_face':
      return { label: 'No face in view', tone: 'warning', message: NO_FACE_MESSAGE, expression: null, strength: null };
    case 'detection_unavailable':
      return {
        label: 'Model unavailable',
        tone: 'danger',
        message: face.detection_error ?? 'The face model is not loaded on the backend.',
        expression: null,
        strength: null,
      };
    case 'processing_error':
      return { label: 'Processing error', tone: 'danger', message: face.detection_error, expression: null, strength: null };
    default:
      return { label: 'Checking', tone: 'neutral', message: null, expression: null, strength: null };
  }
}

export function strengthText(strength) {
  return strength == null ? null : `Strength ${Math.round(strength * 100)}%`;
}

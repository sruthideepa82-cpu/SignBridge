import { CAMERA_STATUS } from '../hooks/useCamera.js';

// What Live Studio shows about the face. Every value comes from the backend's face result. The expression is an
// estimate from facial movements, so the strength is labelled as a heuristic and never as a probability.
export const NO_FACE_MESSAGE = 'Move into the camera frame to enable facial tracking.';
export const PARTIAL_FACE_MESSAGE = 'Move your face fully into the frame for steadier tracking.';
export const ESTIMATE_NOTE = 'Estimate from facial movements. Not a verified reading of how someone feels.';
export const UNCERTAIN_NOTE = 'The recent frames disagree, so no single expression is reported.';
// Set when the running backend has no face endpoint (it was started before facial tracking was added).
export const STALE_BACKEND_MESSAGE = 'The running SignBridge backend has no facial tracking. Restart the backend and reload the page.';

function view(label, tone, message, extra = {}) {
  return { label, tone, message, expression: null, strength: null, faceCount: 0, landmarkCount: 0, partiallyOutside: false, blendshapes: null, ...extra };
}

export function describeFace({ face, error, cameraLive, paused, cameraStatus, cameraError }) {
  if (cameraStatus === CAMERA_STATUS.ERROR) {
    return view('Camera disconnected', 'danger', cameraError || 'The camera stopped. Check the connection and start it again.');
  }
  if (paused) {
    return view('Paused', 'neutral', 'Facial tracking pauses with recognition.');
  }
  if (!cameraLive) {
    return view('Waiting for camera', 'neutral', 'Start the camera to enable facial tracking.');
  }
  if (error === STALE_BACKEND_MESSAGE) {
    return view('Backend out of date', 'danger', error);
  }
  if (error) {
    return view('Unavailable', 'danger', error);
  }
  if (!face) {
    return view('Loading face model', 'neutral', null);
  }

  const base = { faceCount: face.face_count, landmarkCount: face.landmark_count, blendshapes: face.faces?.[0]?.blendshapes ?? null };

  switch (face.status) {
    case 'face_detected': {
      const partiallyOutside = Boolean(face.faces?.[0]?.partially_outside_frame);
      if (partiallyOutside) {
        return view('Partly outside frame', 'warning', PARTIAL_FACE_MESSAGE, {
          ...base,
          partiallyOutside: true,
          expression: face.expression,
          strength: face.strength,
        });
      }
      return view('Face detected', 'success', face.expression === 'Uncertain' ? UNCERTAIN_NOTE : null, {
        ...base,
        expression: face.expression,
        strength: face.strength,
      });
    }
    case 'no_face':
      return view('Face not detected', 'warning', NO_FACE_MESSAGE, { faceCount: 0, landmarkCount: 0 });
    case 'detection_unavailable':
      return view('Model unavailable', 'danger', face.detection_error ?? 'The face model is not loaded on the backend.');
    case 'processing_error':
      return view('Processing error', 'danger', face.detection_error);
    default:
      return view('Loading face model', 'neutral', null);
  }
}

export function strengthText(strength) {
  return strength == null ? null : `Strength ${Math.round(strength * 100)}%`;
}

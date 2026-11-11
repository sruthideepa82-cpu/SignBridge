// Turns backend status into what the Live Studio shows. Nothing here invents a result: a sign is only
// reported when the recognizer returned status 'recognized', and confidence is only shown with a real value.
import { CAMERA_STATUS } from '../hooks/useCamera.js';
import { describeRecognition, pct } from './recognitionStatus.js';

export function describeCamera(status) {
  switch (status) {
    case CAMERA_STATUS.LIVE:
      return { label: 'Live', tone: 'success' };
    case CAMERA_STATUS.STARTING:
      return { label: 'Starting', tone: 'info' };
    case CAMERA_STATUS.ERROR:
      return { label: 'Error', tone: 'danger' };
    default:
      return { label: 'Off', tone: 'neutral' };
  }
}

export function describeHandTracking({ landmarks, landmarkError, cameraLive, paused }) {
  if (paused) return { label: 'Paused', tone: 'neutral' };
  if (!cameraLive) return { label: 'Waiting for camera', tone: 'neutral' };
  if (landmarkError) return { label: 'Unavailable', tone: 'danger' };
  if (!landmarks) return { label: 'Checking', tone: 'neutral' };
  switch (landmarks.status) {
    case 'hand_detected':
      return {
        label: `${landmarks.hand_count} ${landmarks.hand_count === 1 ? 'hand' : 'hands'} tracked`,
        tone: 'success',
      };
    case 'no_hand':
      return { label: 'No hand in view', tone: 'warning' };
    case 'detection_unavailable':
      return { label: 'Model unavailable', tone: 'danger' };
    case 'processing_error':
      return { label: 'Processing error', tone: 'danger' };
    default:
      return { label: 'Checking', tone: 'neutral' };
  }
}

export function describeGesture({ recognition, recognitionError, cameraLive, paused }) {
  if (paused) return { label: 'Paused', tone: 'neutral' };
  const view = describeRecognition(recognition, recognitionError, cameraLive);
  return { label: view.label, tone: view.tone };
}

export function describeConfidence(recognition, paused) {
  const hasValue =
    !paused &&
    recognition?.confidence != null &&
    (recognition.status === 'recognized' || recognition.status === 'uncertain');
  return {
    value: hasValue ? pct(recognition.confidence) : '—',
    threshold: recognition?.threshold != null ? pct(recognition.threshold) : null,
    lowConfidence: hasValue && recognition.status === 'uncertain',
  };
}

// One short, practical suggestion for the most important problem. Returns null when nothing needs fixing.
export function guidanceFor({ cameraLive, paused, landmarks, landmarkError, recognition, recognitionError }) {
  if (paused) return 'Recognition is paused. The camera is still on. Resume when you are ready to sign.';
  if (!cameraLive) return 'Start the camera, then sit so your hands are fully visible in the frame.';
  if (landmarkError || recognitionError) {
    return 'The camera is not responding to the backend. Check that the SignBridge backend is running.';
  }
  if (landmarks?.status === 'detection_unavailable') return 'The hand tracking model is not available on the backend.';
  if (landmarks?.status === 'processing_error') return 'Hand tracking hit an error. Stop and start the camera again.';
  if (landmarks?.status === 'no_hand') {
    return 'No hand in view. Bring one hand into the centre of the frame, about an arm’s length from the camera.';
  }
  switch (recognition?.status) {
    case 'two_hands':
      return 'Two hands are visible. Show one hand at a time.';
    case 'no_model':
      return 'Hand tracking works, but no trained model is loaded, so signs are not recognised yet.';
    case 'uncertain':
      return 'Hold the sign steady, palm towards the camera, in even light.';
    default:
      return null;
  }
}

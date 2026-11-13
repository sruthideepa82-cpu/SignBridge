// What the sign recogniser state means on screen. Success is only shown when the model returned a word.
import { HOLD_RESULTS } from './sentenceBuilder.js';

export const WINDOW_LABEL = 'frames';

export function describeRecognition({ cameraLive, paused, error, result, sentence, windowFrames = 32 }) {
  if (!cameraLive) {
    return { key: 'waiting_camera', label: 'Waiting for camera', tone: 'neutral', detail: 'Press Start Camera to begin.' };
  }
  if (paused) {
    return { key: 'paused', label: 'Recognition paused', tone: 'neutral', detail: 'Resume recognition to continue.' };
  }
  if (error) {
    return { key: 'unavailable', label: 'Recognition unavailable', tone: 'danger', detail: error };
  }
  if (!result) {
    return { key: 'detecting', label: 'Detecting hands', tone: 'info', detail: 'Waiting for the first result.' };
  }

  switch (result.status) {
    case 'camera_off':
      return { key: 'waiting_camera', label: 'Waiting for camera', tone: 'neutral', detail: 'Press Start Camera to begin.' };
    case 'detection_unavailable':
      return {
        key: 'detection_unavailable',
        label: 'Hand detection unavailable',
        tone: 'danger',
        detail: result.detail ?? 'The backend could not run hand detection.',
      };
    case 'no_model':
      return {
        key: 'no_model',
        label: 'Model unavailable',
        tone: 'warning',
        detail: 'Awaiting model integration. No signs are translated until a trained sign model is connected.',
      };
    case 'warming_up':
      return {
        key: 'detecting',
        label: 'Detecting hands',
        tone: 'info',
        detail: `Collecting frames (${result.collected_frames ?? 0} of ${windowFrames} ${WINDOW_LABEL}).`,
      };
    case 'no_hand':
      return { key: 'no_hand', label: 'No hand detected', tone: 'neutral', detail: 'Show your hands to the camera.' };
    case 'uncertain':
      return {
        key: 'low_confidence',
        label: 'Low confidence',
        tone: 'warning',
        detail: 'The sign was not clear enough to confirm. Try again, closer to the camera.',
      };
    case 'recognized': {
      const { word } = result;
      if (sentence.blockedWord === word) {
        return {
          key: 'recognised',
          label: `Sign recognised: ${word}`,
          tone: 'success',
          detail: `Confidence ${Math.round((result.confidence ?? 0) * 100)}%.`,
        };
      }
      const held = sentence.candidate === word ? sentence.holdCount : 0;
      return {
        key: 'recognising',
        label: 'Recognising sign',
        tone: 'info',
        detail: `${word}. Hold steady (${held} of ${HOLD_RESULTS}).`,
      };
    }
    default:
      return { key: 'unavailable', label: 'Recognition unavailable', tone: 'danger', detail: 'Unknown response from the server.' };
  }
}

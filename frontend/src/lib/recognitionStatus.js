export const pct = (value) => `${Math.round(value * 100)}%`;

// Maps a /recognition/latest response to what the UI may say. A sign is only returned for the
// 'recognized' status; every other status shows no sign.
export function describeRecognition(result, error, cameraLive) {
  if (error) {
    return { tone: 'danger', label: 'Recognition unavailable', headline: null, text: error };
  }
  if (!cameraLive) {
    return { tone: 'neutral', label: 'Camera off', headline: null, text: 'Start the camera to see sign predictions.' };
  }
  if (!result) {
    return { tone: 'neutral', label: 'Waiting', headline: null, text: 'Waiting for the first recognition result.' };
  }
  switch (result.status) {
    case 'camera_off':
      return { tone: 'neutral', label: 'Camera off', headline: null, text: 'Start the camera to see sign predictions.' };
    case 'no_model':
      return {
        tone: 'warning',
        label: 'Classifier inactive',
        headline: null,
        text: 'No trained model is loaded, so no sign is predicted.',
      };
    case 'no_hand':
      return { tone: 'warning', label: 'Waiting for hand', headline: null, text: 'Show one hand to the camera.' };
    case 'two_hands':
      return { tone: 'warning', label: 'Two hands', headline: null, text: result.detail };
    case 'uncertain':
      return {
        tone: 'warning',
        label: 'Not recognized',
        headline: null,
        text: result.confidence == null
          ? result.detail ?? 'This hand could not be classified.'
          : `Confidence ${pct(result.confidence)} is below the ${pct(result.threshold)} threshold, so no sign is shown.`,
      };
    case 'recognized':
      return {
        tone: 'success',
        label: 'Recognized',
        headline: result.label,
        text: `Confidence ${pct(result.confidence)}. Single-frame result from a pilot model. Not yet checked by a signer.`,
      };
    default:
      return { tone: 'neutral', label: 'Unknown status', headline: null, text: '' };
  }
}

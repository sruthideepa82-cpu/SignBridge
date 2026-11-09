export const HISTORY_LIMIT = 10;

export function isClassifierPrediction(result) {
  if (!result || (result.status !== 'recognized' && result.status !== 'uncertain')) {
    return false;
  }
  return result.confidence != null;
}

export function predictionKey(result) {
  return `${result.status}:${result.label ?? ''}`;
}

export function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

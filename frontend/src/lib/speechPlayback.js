// Shares the Read Aloud playback state ('idle' | 'speaking' | 'paused') with other parts of the page. The speech output
// hook publishes its state here. Speech transcription listens, so it can pause while SignBridge is speaking.

let current = 'idle';
const listeners = new Set();

export function currentSpeechPlayback() {
  return current;
}

export function publishSpeechPlayback(next) {
  if (next === current) return;
  current = next;
  for (const listener of [...listeners]) listener(next);
}

export function subscribeSpeechPlayback(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

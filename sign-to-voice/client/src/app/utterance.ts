// When an utterance ends. FINISH is handled by the caller when it is confirmed. This covers the
// silence case: no hands in frame for a while after at least one word has been signed.

export const SILENCE_MS = 2500;

export function silenceEnded(lastHandSeenAt: number, now: number, glossCount: number): boolean {
  return glossCount > 0 && now - lastHandSeenAt >= SILENCE_MS;
}

// Speech output. Stage 5 replaces this with the browser speechSynthesis implementation, and later
// with a cloud voice. The pipeline only depends on this interface.
export interface Speaker {
  speak(text: string): Promise<void>;
  cancel(): void;
}

export const noopSpeaker: Speaker = {
  speak: async () => {},
  cancel: () => {},
};

// Speech output. The pipeline depends only on the Speaker interface, so a cloud voice (ElevenLabs,
// OpenAI) can be added later as another implementation without changing the pipeline.

export type SpeechErrorKind = 'unsupported' | 'no-voice' | 'failed';

export class SpeechError extends Error {
  constructor(
    readonly kind: SpeechErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface Speaker {
  // Resolves when the sentence has finished speaking. Rejects with a SpeechError if it cannot.
  speak(text: string): Promise<void>;
  cancel(): void;
}

export interface SpeechSynthesisLike {
  getVoices(): SpeechSynthesisVoice[];
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  addEventListener?(type: 'voiceschanged', listener: () => void): void;
  removeEventListener?(type: 'voiceschanged', listener: () => void): void;
}

export interface BrowserSpeakerOptions {
  synth?: SpeechSynthesisLike;
  UtteranceCtor?: new (text: string) => SpeechSynthesisUtterance;
  lang?: string;
  voiceWaitMs?: number;
}

// Exact language first, then the same language family (en-GB for en-IN), then any English voice.
// Returns null when no voice matches, so the browser default is used.
export function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const exact = voices.find((voice) => voice.lang === lang);
  if (exact) return exact;
  const family = lang.split('-')[0];
  return voices.find((voice) => voice.lang?.split('-')[0] === family) ?? null;
}

// Rough upper bound on how long a sentence takes to speak, used as a watchdog so a silent engine
// cannot leave the pipeline stuck in the speaking state.
export function speakingBudgetMs(text: string): number {
  return Math.max(5000, text.length * 120);
}

export class BrowserSpeaker implements Speaker {
  private readonly synth: SpeechSynthesisLike | undefined;
  private readonly UtteranceCtor: (new (text: string) => SpeechSynthesisUtterance) | undefined;
  private readonly lang: string;
  private readonly voiceWaitMs: number;

  constructor(options: BrowserSpeakerOptions = {}) {
    const globalWindow = typeof window !== 'undefined' ? window : undefined;
    this.synth = options.synth ?? globalWindow?.speechSynthesis;
    this.UtteranceCtor = options.UtteranceCtor ?? globalWindow?.SpeechSynthesisUtterance;
    this.lang = options.lang ?? 'en-IN';
    this.voiceWaitMs = options.voiceWaitMs ?? 1500;
  }

  async speak(text: string): Promise<void> {
    if (!this.synth || !this.UtteranceCtor) {
      throw new SpeechError('unsupported', 'Text-to-speech is not supported in this browser.');
    }
    if (text.trim() === '') return;

    const voices = await this.loadVoices();
    if (voices.length === 0) {
      throw new SpeechError('no-voice', 'No speech voice is available in this browser.');
    }

    const synth = this.synth;
    synth.cancel();

    return new Promise<void>((resolve, reject) => {
      const utterance = new this.UtteranceCtor!(text);
      utterance.lang = this.lang;
      utterance.voice = pickVoice(voices, this.lang);
      utterance.rate = 1;

      const watchdog = setTimeout(() => {
        synth.cancel();
        reject(new SpeechError('failed', 'Speech did not finish.'));
      }, speakingBudgetMs(text));

      utterance.onend = () => {
        clearTimeout(watchdog);
        resolve();
      };
      utterance.onerror = (event) => {
        clearTimeout(watchdog);
        if (event.error === 'interrupted' || event.error === 'canceled') {
          resolve();
          return;
        }
        reject(new SpeechError('failed', `Speech output failed (${event.error}).`));
      };

      synth.speak(utterance);
    });
  }

  cancel(): void {
    this.synth?.cancel();
  }

  // Browsers load voices asynchronously, so an empty list at first is normal. Wait briefly for them.
  private loadVoices(): Promise<SpeechSynthesisVoice[]> {
    const synth = this.synth!;
    const ready = synth.getVoices();
    if (ready.length > 0 || !synth.addEventListener) return Promise.resolve(ready);

    return new Promise((resolve) => {
      const finish = () => {
        synth.removeEventListener?.('voiceschanged', finish);
        clearTimeout(timer);
        resolve(synth.getVoices());
      };
      const timer = setTimeout(finish, this.voiceWaitMs);
      synth.addEventListener!('voiceschanged', finish);
    });
  }
}

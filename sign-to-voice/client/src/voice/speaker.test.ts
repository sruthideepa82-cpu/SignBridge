import { describe, expect, it, vi } from 'vitest';
import {
  BrowserSpeaker,
  pickVoice,
  SpeechError,
  speakingBudgetMs,
  type SpeechSynthesisLike,
} from './speaker';

class FakeUtterance {
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(readonly text: string) {}
}

function voice(name: string, lang: string): SpeechSynthesisVoice {
  return { name, lang } as SpeechSynthesisVoice;
}

// Fake engine: speak() finishes immediately unless `behaviour` says otherwise.
function fakeSynth(options: { voices?: SpeechSynthesisVoice[]; behaviour?: 'end' | 'error' | 'silent' } = {}) {
  const spoken: FakeUtterance[] = [];
  const synth = {
    cancel: vi.fn(),
    getVoices: vi.fn(() => options.voices ?? []),
    speak: vi.fn((utterance: unknown) => {
      const u = utterance as FakeUtterance;
      spoken.push(u);
      if (options.behaviour === 'end') u.onend?.();
      if (options.behaviour === 'error') u.onerror?.({ error: 'synthesis-failed' });
    }),
  } satisfies SpeechSynthesisLike;
  return { synth, spoken };
}

describe('pickVoice', () => {
  const voices = [voice('Google UK', 'en-GB'), voice('Hindi', 'hi-IN')];

  it('prefers an exact language match', () => {
    expect(pickVoice([...voices, voice('India', 'en-IN')], 'en-IN')?.name).toBe('India');
  });

  it('falls back to the same language family', () => {
    expect(pickVoice(voices, 'en-IN')?.name).toBe('Google UK');
  });

  it('returns null when no voice matches the language', () => {
    expect(pickVoice([voice('Hindi', 'hi-IN')], 'en-IN')).toBeNull();
  });
});

describe('BrowserSpeaker', () => {
  it('resolves when the sentence has finished speaking, with the chosen language and voice', async () => {
    const { synth, spoken } = fakeSynth({ voices: [voice('Google UK', 'en-GB')], behaviour: 'end' });
    const speaker = new BrowserSpeaker({ synth, UtteranceCtor: FakeUtterance as never, lang: 'en-GB' });

    await speaker.speak('Let us talk.');

    expect(spoken[0].text).toBe('Let us talk.');
    expect(spoken[0].lang).toBe('en-GB');
    expect(spoken[0].voice?.name).toBe('Google UK');
    expect(synth.cancel).toHaveBeenCalled();
  });

  it('rejects with a no-voice error when the browser reports no voices', async () => {
    const { synth } = fakeSynth({ voices: [] });
    const speaker = new BrowserSpeaker({ synth, UtteranceCtor: FakeUtterance as never, voiceWaitMs: 1 });

    await expect(speaker.speak('Hello')).rejects.toMatchObject({ kind: 'no-voice' });
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('rejects with an unsupported error when speech synthesis is missing', async () => {
    const speaker = new BrowserSpeaker({ synth: undefined, UtteranceCtor: undefined });
    await expect(speaker.speak('Hello')).rejects.toBeInstanceOf(SpeechError);
    await expect(speaker.speak('Hello')).rejects.toMatchObject({ kind: 'unsupported' });
  });

  it('rejects with a failed error when the engine reports an error', async () => {
    const { synth } = fakeSynth({ voices: [voice('x', 'en-IN')], behaviour: 'error' });
    const speaker = new BrowserSpeaker({ synth, UtteranceCtor: FakeUtterance as never });

    await expect(speaker.speak('Hello')).rejects.toMatchObject({ kind: 'failed' });
  });

  it('treats an interrupted utterance as finished, not as an error', async () => {
    const synth = {
      cancel: vi.fn(),
      getVoices: () => [voice('x', 'en-IN')],
      speak: (u: unknown) => (u as FakeUtterance).onerror?.({ error: 'interrupted' }),
    } satisfies SpeechSynthesisLike;
    const speaker = new BrowserSpeaker({ synth, UtteranceCtor: FakeUtterance as never });

    await expect(speaker.speak('Hello')).resolves.toBeUndefined();
  });

  it('does nothing for empty text', async () => {
    const { synth } = fakeSynth({ voices: [voice('x', 'en-IN')] });
    const speaker = new BrowserSpeaker({ synth, UtteranceCtor: FakeUtterance as never });

    await speaker.speak('   ');

    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('cancels speech through the engine', () => {
    const { synth } = fakeSynth();
    new BrowserSpeaker({ synth, UtteranceCtor: FakeUtterance as never }).cancel();
    expect(synth.cancel).toHaveBeenCalled();
  });
});

describe('speaking budget', () => {
  it('allows at least five seconds and grows with the sentence length', () => {
    expect(speakingBudgetMs('Hi')).toBe(5000);
    expect(speakingBudgetMs('x'.repeat(200))).toBe(24000);
  });
});

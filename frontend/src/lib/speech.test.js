import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSpeechSupported, pickVoice, speak, stopSpeaking } from './speech.js';

class FakeUtterance {
  constructor(text) {
    this.text = text;
  }
}

const VOICES = [
  { name: 'US English', lang: 'en-US' },
  { name: 'Hindi', lang: 'hi-IN' },
];

describe('speech', () => {
  let synth;

  beforeEach(() => {
    synth = {
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn(() => VOICES),
    };
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports support from the browser API', () => {
    expect(isSpeechSupported()).toBe(true);
    vi.unstubAllGlobals();
    expect(isSpeechSupported()).toBe(false);
  });

  it('speaks the exact text it is given, with the requested language', () => {
    speak('CLOVS');

    expect(synth.cancel).toHaveBeenCalled();
    const utterance = synth.speak.mock.calls[0][0];
    expect(utterance.text).toBe('CLOVS');
    expect(utterance.lang).toBe('en-IN');
  });

  it('uses a matching voice when one exists and falls back to the browser default otherwise', () => {
    expect(pickVoice(VOICES, 'en-US')?.name).toBe('US English');
    expect(pickVoice(VOICES, 'en-IN')?.name).toBe('US English');
    expect(pickVoice(VOICES, 'fr-FR')).toBeNull();
  });

  it('refuses to speak empty text or when speech is unsupported', () => {
    expect(() => speak('')).toThrow(/no text/i);
    vi.unstubAllGlobals();
    expect(() => speak('C')).toThrow(/not supported/i);
  });

  it('stop cancels speech', () => {
    stopSpeaking();

    expect(synth.cancel).toHaveBeenCalled();
  });
});

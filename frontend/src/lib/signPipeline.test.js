// The sign-to-text-and-speech pipeline without the browser or the camera: recognition results go into the sentence
// builder, the builder's completed sentence is translated, and speech is started for the completed message only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translateGlosses } from './islTranslation.js';
import { applySequenceResult, finishSentence, initialSentence, signWords } from './sentenceBuilder.js';
import { speak } from './speech.js';

const recognised = (word, frame) => ({ status: 'recognized', word, confidence: 0.9, frame_sequence: frame });

describe('sign to text and speech pipeline', () => {
  let synth;

  beforeEach(() => {
    synth = { speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), getVoices: vi.fn(() => []) };
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      constructor(text) {
        this.text = text;
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('turns a held sequence of recognised signs into one translated, spoken sentence', () => {
    const results = [];
    let frame = 0;
    for (const word of ['HELLO', 'HOW', 'YOU']) {
      for (let i = 0; i < 4; i += 1) results.push(recognised(word, (frame += 1)));
      results.push({ status: 'uncertain', word: null, confidence: 0.2, frame_sequence: (frame += 1) });
      results.push({ status: 'uncertain', word: null, confidence: 0.2, frame_sequence: (frame += 1) });
    }

    let state = initialSentence();
    for (const result of results) state = applySequenceResult(state, result);
    expect(signWords(state.items)).toEqual(['HELLO', 'HOW', 'YOU']);

    const { message } = finishSentence(state, { id: 'pipeline-1', now: 0 });
    expect(message.text).toBe('Hello, how are you?');
    expect(synth.speak).not.toHaveBeenCalled();

    expect(translateGlosses(['HELLO', 'HOW', 'YOU']).text).toBe(message.text);
    speak(message.text, { voices: [] });
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(synth.speak.mock.calls[0][0].text).toBe('Hello, how are you?');
  });

  it('never speaks while only uncertain or missing results have arrived', () => {
    let state = initialSentence();
    for (let frame = 1; frame <= 20; frame += 1) {
      state = applySequenceResult(state, { status: 'uncertain', word: null, confidence: 0.3, frame_sequence: frame });
    }

    expect(finishSentence(state, { id: 'none', now: 0 }).message).toBeNull();
    expect(synth.speak).not.toHaveBeenCalled();
  });
});

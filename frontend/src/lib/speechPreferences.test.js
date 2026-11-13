import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SPEECH_PREFS, SPEECH_PREFS_KEY, loadSpeechPrefs, normaliseSpeechPrefs, saveSpeechPrefs } from './speechPreferences.js';

describe('speech preferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts with auto speak on and speech not muted', () => {
    expect(loadSpeechPrefs()).toEqual(DEFAULT_SPEECH_PREFS);
  });

  it('keeps only valid values', () => {
    expect(normaliseSpeechPrefs({ autoSpeak: 'yes', muted: true, rate: 3, voiceName: 'Asha' })).toEqual({
      autoSpeak: true,
      muted: true,
      rate: 1,
      voiceName: 'Asha',
    });
  });

  it('ignores corrupt stored settings', () => {
    window.localStorage.setItem(SPEECH_PREFS_KEY, '{broken');
    expect(loadSpeechPrefs()).toEqual(DEFAULT_SPEECH_PREFS);
  });

  it('saves and reloads the chosen settings', () => {
    saveSpeechPrefs({ autoSpeak: false, muted: false, rate: 1.25, voiceName: '' });

    expect(loadSpeechPrefs()).toMatchObject({ autoSpeak: false, rate: 1.25 });
  });
});

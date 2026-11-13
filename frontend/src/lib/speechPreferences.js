// Speech settings for Live Studio. Stored in this browser only.
export const SPEECH_PREFS_KEY = 'signbridge.speech.v1';
export const RATE_OPTIONS = [0.75, 1, 1.25];
export const DEFAULT_SPEECH_PREFS = Object.freeze({ autoSpeak: true, muted: false, rate: 1, voiceName: '' });

export function normaliseSpeechPrefs(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    autoSpeak: typeof source.autoSpeak === 'boolean' ? source.autoSpeak : DEFAULT_SPEECH_PREFS.autoSpeak,
    muted: typeof source.muted === 'boolean' ? source.muted : DEFAULT_SPEECH_PREFS.muted,
    rate: RATE_OPTIONS.includes(source.rate) ? source.rate : DEFAULT_SPEECH_PREFS.rate,
    voiceName: typeof source.voiceName === 'string' ? source.voiceName : DEFAULT_SPEECH_PREFS.voiceName,
  };
}

export function loadSpeechPrefs(storage = window.localStorage) {
  try {
    return normaliseSpeechPrefs(JSON.parse(storage.getItem(SPEECH_PREFS_KEY) ?? 'null'));
  } catch {
    return normaliseSpeechPrefs(null);
  }
}

export function saveSpeechPrefs(prefs, storage = window.localStorage) {
  const next = normaliseSpeechPrefs(prefs);
  storage.setItem(SPEECH_PREFS_KEY, JSON.stringify(next));
  return next;
}

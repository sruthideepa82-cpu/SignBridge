// Browser text-to-speech through the Web Speech API. Nothing is spoken automatically; callers speak
// only committed text when the user presses a button.

export function isSpeechSupported() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance === 'function';
}

export function availableVoices() {
  if (!isSpeechSupported()) return [];
  return window.speechSynthesis.getVoices();
}

export function pickVoice(voices, lang) {
  const exact = voices.find((voice) => voice.lang === lang);
  if (exact) return exact;
  const language = lang.split('-')[0];
  return voices.find((voice) => voice.lang?.split('-')[0] === language) ?? null;
}

export function speak(text, { lang = 'en-IN', voices = availableVoices(), rate = 1, voiceName = '' } = {}) {
  if (!isSpeechSupported()) {
    throw new Error('Text-to-speech is not supported in this browser.');
  }
  if (!text) {
    throw new Error('There is no text to speak.');
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  const named = voiceName ? voices.find((item) => item.name === voiceName && item.lang?.split('-')[0] === lang.split('-')[0]) : null;
  const voice = named ?? pickVoice(voices, lang);
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
  return { utterance, voice };
}

export function pauseSpeaking() {
  if (isSpeechSupported()) window.speechSynthesis.pause();
}

export function resumeSpeaking() {
  if (isSpeechSupported()) window.speechSynthesis.resume();
}

export function stopSpeaking() {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}

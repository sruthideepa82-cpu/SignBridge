import { useCallback, useEffect, useRef, useState } from 'react';
import { isSpeechSupported, pauseSpeaking, resumeSpeaking, speak, stopSpeaking } from '../lib/speech.js';
import { loadSpeechPrefs, saveSpeechPrefs } from '../lib/speechPreferences.js';

// Speech output for completed sentences. A message is spoken once: automatic speaking skips a message that has
// already been spoken, and only the explicit replay speaks it again. Muting stops speech and blocks replay too.
export default function useSpeechOutput() {
  const [prefs, setPrefs] = useState(() => loadSpeechPrefs());
  const [playback, setPlayback] = useState('idle');
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const spokenIds = useRef(new Set());
  const lastMessage = useRef(null);
  const supported = isSpeechSupported();

  useEffect(() => () => stopSpeaking(), []);

  const updatePrefs = useCallback((patch) => {
    setPrefs((current) => saveSpeechPrefs({ ...current, ...patch }));
  }, []);

  const speakMessage = useCallback(
    (message, { replay = false } = {}) => {
      const current = prefsRef.current;
      if (!supported || !message?.text || current.muted) return false;
      if (!replay && spokenIds.current.has(message.id)) return false;
      spokenIds.current.add(message.id);
      lastMessage.current = message;
      try {
        const { utterance } = speak(message.text, { rate: current.rate, voiceName: current.voiceName });
        const finished = () => setPlayback('idle');
        utterance.onend = finished;
        utterance.onerror = finished;
        setPlayback('speaking');
        return true;
      } catch {
        setPlayback('idle');
        return false;
      }
    },
    [supported],
  );

  // Called when a sentence is completed. Speaks it only when automatic speaking is on.
  const announce = useCallback(
    (message) => (prefsRef.current.autoSpeak ? speakMessage(message) : false),
    [speakMessage],
  );

  const replay = useCallback(() => {
    if (!lastMessage.current) return false;
    return speakMessage(lastMessage.current, { replay: true });
  }, [speakMessage]);

  const pause = useCallback(() => {
    pauseSpeaking();
    setPlayback('paused');
  }, []);

  const resume = useCallback(() => {
    resumeSpeaking();
    setPlayback('speaking');
  }, []);

  const toggleMuted = useCallback(() => {
    if (!prefsRef.current.muted) {
      stopSpeaking();
      setPlayback('idle');
    }
    updatePrefs({ muted: !prefsRef.current.muted });
  }, [updatePrefs]);

  return {
    prefs,
    playback,
    supported,
    announce,
    speakMessage,
    replay,
    pause,
    resume,
    toggleMuted,
    updatePrefs,
    hasLastMessage: () => lastMessage.current !== null,
  };
}

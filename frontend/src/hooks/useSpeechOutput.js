import { useCallback, useEffect, useRef, useState } from 'react';
import { isSpeechSupported, pauseSpeaking, resumeSpeaking, speak, stopSpeaking } from '../lib/speech.js';
import { SPEECH_PREFS_EVENT, loadSpeechPrefs, saveSpeechPrefs } from '../lib/speechPreferences.js';

// The browser has one speech queue, so only one panel can be speaking at a time. The panel that owns the queue
// registers its reset here, so starting or stopping speech elsewhere cannot leave it showing "speaking".
let resetOwner = null;

// Speech output for Live Studio. Completed sentences are spoken once: automatic speaking skips a message that has
// already been spoken, and only the explicit replay speaks it again. speakText speaks text the user asks for.
// Muting stops speech and blocks every way of starting it. A cancelled or finished utterance never changes the
// state of a newer one.
export default function useSpeechOutput() {
  const [prefs, setPrefs] = useState(() => loadSpeechPrefs());
  const [playback, setPlayback] = useState('idle');
  const [error, setError] = useState('');
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const spokenIds = useRef(new Set());
  const lastMessage = useRef(null);
  const active = useRef(null);
  const supported = isSpeechSupported();

  useEffect(() => {
    const onPrefsChanged = (event) => setPrefs(event.detail);
    window.addEventListener(SPEECH_PREFS_EVENT, onPrefsChanged);
    return () => window.removeEventListener(SPEECH_PREFS_EVENT, onPrefsChanged);
  }, []);

  useEffect(
    () => () => {
      if (!active.current) return;
      if (resetOwner === active.current.release) resetOwner = null;
      active.current = null;
      stopSpeaking();
    },
    [],
  );

  const updatePrefs = useCallback((patch) => {
    prefsRef.current = saveSpeechPrefs({ ...prefsRef.current, ...patch });
  }, []);

  const startSpeech = useCallback((text, { rate, voiceName }) => {
    if (resetOwner) resetOwner();
    const { utterance } = speak(text, { rate, voiceName });
    const release = () => {
      active.current = null;
      setPlayback('idle');
      if (resetOwner === release) resetOwner = null;
    };
    active.current = { utterance, release };
    resetOwner = release;
    utterance.onend = () => {
      if (active.current?.utterance === utterance) release();
    };
    utterance.onerror = (event) => {
      if (active.current?.utterance !== utterance) return;
      const cancelled = event?.error === 'interrupted' || event?.error === 'canceled';
      release();
      setError(cancelled ? '' : 'Speech stopped unexpectedly. Try again.');
    };
    setError('');
    setPlayback('speaking');
  }, []);

  const speakMessage = useCallback(
    (message, { replay = false } = {}) => {
      const current = prefsRef.current;
      if (!supported || !message?.text || current.muted) return false;
      if (!replay && spokenIds.current.has(message.id)) return false;
      spokenIds.current.add(message.id);
      lastMessage.current = message;
      try {
        startSpeech(message.text, current);
        return true;
      } catch {
        setPlayback('idle');
        return false;
      }
    },
    [supported, startSpeech],
  );

  // Speaks text the user asked for. Nothing is spoken automatically through this path.
  const speakText = useCallback(
    (text) => {
      const current = prefsRef.current;
      if (!supported || !text?.trim() || current.muted) return false;
      try {
        startSpeech(text, current);
        return true;
      } catch (caught) {
        setError(caught.message);
        setPlayback('idle');
        return false;
      }
    },
    [supported, startSpeech],
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
    if (!active.current) return;
    pauseSpeaking();
    setPlayback('paused');
  }, []);

  const resume = useCallback(() => {
    if (!active.current) return;
    resumeSpeaking();
    setPlayback('speaking');
  }, []);

  const stop = useCallback(() => {
    if (resetOwner) resetOwner();
    resetOwner = null;
    active.current = null;
    stopSpeaking();
    setPlayback('idle');
  }, []);

  const toggleMuted = useCallback(() => {
    if (!prefsRef.current.muted) stop();
    updatePrefs({ muted: !prefsRef.current.muted });
  }, [stop, updatePrefs]);

  return {
    prefs,
    playback,
    error,
    supported,
    announce,
    speakMessage,
    speakText,
    replay,
    pause,
    resume,
    stop,
    toggleMuted,
    updatePrefs,
    hasLastMessage: () => lastMessage.current !== null,
  };
}

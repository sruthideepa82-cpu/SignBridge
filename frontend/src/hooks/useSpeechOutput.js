import { useCallback, useEffect, useRef, useState } from 'react';
import { isSpeechSupported, pauseSpeaking, resumeSpeaking, speak, stopSpeaking } from '../lib/speech.js';
import { publishSpeechPlayback } from '../lib/speechPlayback.js';
import { SPEECH_PREFS_EVENT, loadSpeechPrefs, saveSpeechPrefs } from '../lib/speechPreferences.js';

// The browser has one speech queue, so only one panel can be speaking at a time. The panel that owns the queue
// registers its reset here, so starting or stopping speech elsewhere cannot leave it showing "speaking".
let resetOwner = null;

// Engine checks. A browser can accept an utterance and then never start or finish it (no voice, a stalled network
// voice, or a queue cancelled in the same tick). The hook looks at the engine every WATCH_MS and recovers.
const WATCH_MS = 250;
// Time allowed for an utterance to start before it is treated as dropped. It is retried once.
const START_GRACE_MS = 1500;

// A generous upper bound for how long an utterance should take. It only decides when an engine that reports
// "speaking" with no progress is stopped, so normal speech is never cut short.
function expectedMs(text, rate) {
  return Math.max(4000, 2000 + (text.length * 110) / rate);
}

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

  // Publishes the playback state for speech transcription, which pauses while this is speaking. Publishing is read-only.
  useEffect(() => {
    publishSpeechPlayback(playback);
  }, [playback]);

  useEffect(() => () => publishSpeechPlayback('idle'), []);

  useEffect(() => {
    const onPrefsChanged = (event) => setPrefs(event.detail);
    window.addEventListener(SPEECH_PREFS_EVENT, onPrefsChanged);
    return () => window.removeEventListener(SPEECH_PREFS_EVENT, onPrefsChanged);
  }, []);

  useEffect(
    () => () => {
      if (!active.current) return;
      clearInterval(active.current.timer);
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
    const record = {
      utterance,
      startedAt: Date.now(),
      pausedAt: null,
      pausedMs: 0,
      started: false,
      retried: false,
      maxMs: expectedMs(text, rate),
      timer: null,
      release: null,
    };
    record.release = () => {
      clearInterval(record.timer);
      if (active.current === record) active.current = null;
      setPlayback('idle');
      if (resetOwner === record.release) resetOwner = null;
    };
    const finishWith = (message) => {
      record.release();
      setError(message);
    };
    const elapsedMs = () => Date.now() - record.startedAt - record.pausedMs;

    active.current = record;
    resetOwner = record.release;

    utterance.onstart = () => {
      if (active.current === record) record.started = true;
    };
    utterance.onpause = () => {
      if (active.current === record) setPlayback('paused');
    };
    utterance.onresume = () => {
      if (active.current === record) setPlayback('speaking');
    };
    utterance.onend = () => {
      if (active.current === record) record.release();
    };
    utterance.onerror = (event) => {
      if (active.current !== record) return;
      const cancelled = event?.error === 'interrupted' || event?.error === 'canceled';
      record.release();
      setError(cancelled ? '' : 'Speech stopped unexpectedly. Try again.');
    };

    const watch = () => {
      if (active.current !== record) return;
      const synth = window.speechSynthesis;
      const idle = synth.speaking === false && synth.pending === false;

      if (idle && !record.started && elapsedMs() > START_GRACE_MS) {
        if (record.retried) {
          finishWith('Speech did not start. Try again.');
          return;
        }
        record.retried = true;
        record.startedAt = Date.now();
        record.pausedMs = 0;
        synth.speak(utterance);
        return;
      }
      if (idle && record.started && !synth.paused) {
        record.release();
        return;
      }
      if (synth.speaking && record.pausedAt === null && elapsedMs() > record.maxMs) {
        stopSpeaking();
        record.release();
      }
    };

    record.timer = setInterval(watch, WATCH_MS);
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
    const record = active.current;
    if (!record || record.pausedAt !== null) return;
    record.pausedAt = Date.now();
    pauseSpeaking();
    setPlayback('paused');
  }, []);

  const resume = useCallback(() => {
    const record = active.current;
    if (!record || record.pausedAt === null) return;
    record.pausedMs += Date.now() - record.pausedAt;
    record.pausedAt = null;
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

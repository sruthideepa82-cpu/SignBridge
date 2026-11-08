import { useState } from 'react';
import { MessageSquareText, Pause, Play, Square, Volume2 } from 'lucide-react';
import { isSpeechSupported, availableVoices, pauseSpeaking, resumeSpeaking, speak, stopSpeaking } from '../../lib/speech.js';

const BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY = `${BUTTON} bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50`;

export default function TranslationOutputPanel({ buffer }) {
  const [paused, setPaused] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const supported = isSpeechSupported();
  const hasText = buffer.text.length > 0;
  const voicesReady = supported && availableVoices().length > 0;

  const handleSpeak = () => {
    setSpeechError('');
    try {
      speak(buffer.text);
      setPaused(false);
    } catch (error) {
      setSpeechError(error.message);
    }
  };

  const handlePauseToggle = () => {
    if (paused) {
      resumeSpeaking();
    } else {
      pauseSpeaking();
    }
    setPaused(!paused);
  };

  const handleStop = () => {
    stopSpeaking();
    setPaused(false);
  };

  return (
    <section
      className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5"
      aria-labelledby="translation-output-title"
    >
      <h2 id="translation-output-title" className="text-lg font-semibold text-slate-900">
        Translation output
      </h2>

      {hasText ? (
        <p
          className="mt-4 min-h-12 break-words rounded-2xl bg-slate-50 px-4 py-3 font-mono text-lg tracking-wide text-slate-900 ring-1 ring-slate-200"
          aria-live="polite"
          data-testid="committed-text"
        >
          {buffer.text}
        </p>
      ) : (
        <div className="mt-4 flex min-h-24 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <MessageSquareText size={20} aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-800">No text yet</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
            Hold a recognized letter steady. It is added to the text after a short hold.
          </p>
        </div>
      )}

      {buffer.holding && (
        <p className="mt-3 text-xs text-slate-600" aria-live="polite">
          Holding {buffer.holding.label}: {buffer.holding.count} of {buffer.holding.of} frames
        </p>
      )}

      {buffer.items.length > 0 && (
        <ol className="mt-4 space-y-1 text-xs text-slate-600" aria-label="Committed items, in order">
          {buffer.items.map((item, index) => (
            <li key={`${index}-${item.type}-${item.label ?? ''}`} className="flex justify-between gap-3">
              <span>{item.type === 'space' ? 'Space' : `Letter ${item.label}`}</span>
              {item.type === 'letter' && <span>Confidence {Math.round(item.confidence * 100)}%</span>}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={SECONDARY} onClick={buffer.undo} disabled={buffer.items.length === 0}>
          Undo last
        </button>
        <button type="button" className={SECONDARY} onClick={buffer.addSpace} disabled={buffer.items.length === 0}>
          Add space
        </button>
        <button type="button" className={SECONDARY} onClick={buffer.clear} disabled={buffer.items.length === 0}>
          Clear
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={handleSpeak}
          disabled={!supported || !hasText}
          className={`${BUTTON} bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/20`}
        >
          <Volume2 size={16} aria-hidden="true" />
          Speak text
        </button>
        <button type="button" className={SECONDARY} onClick={handlePauseToggle} disabled={!supported}>
          {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className={SECONDARY} onClick={handleStop} disabled={!supported}>
          <Square size={16} aria-hidden="true" />
          Stop
        </button>
      </div>

      {!supported && (
        <p className="mt-3 text-xs text-slate-500">Text-to-speech is not available in this browser.</p>
      )}
      {supported && !voicesReady && (
        <p className="mt-3 text-xs text-slate-500">
          No speech voices were reported by this browser. Speech may be silent, depending on the system voices.
        </p>
      )}
      {speechError && <p className="mt-3 text-xs text-red-600" role="alert">{speechError}</p>}

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Letters come from a pilot model and may be wrong. Check the text before you rely on it. Only the text above is spoken.
      </p>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { Check, Copy, MessageSquareText, Pause, Play, Square, Volume2 } from 'lucide-react';
import { isSpeechSupported, availableVoices, pauseSpeaking, resumeSpeaking, speak, stopSpeaking } from '../../lib/speech.js';
import StatusBadge from '../common/StatusBadge.jsx';

const BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal disabled:cursor-not-allowed disabled:opacity-40';
const SECONDARY = `${BUTTON} bg-white/[0.04] text-zinc-200 ring-1 ring-white/10 enabled:hover:bg-white/[0.08] enabled:active:scale-[0.98]`;
const PRIMARY = `${BUTTON} bg-lime-signal text-black shadow-[0_0_24px_-8px_rgba(182,255,0,0.8)] enabled:hover:-translate-y-0.5 enabled:active:scale-[0.98]`;

function translationStatus(buffer) {
  if (buffer.holding) return { label: 'Recognising', tone: 'info', pulse: true };
  if (buffer.text.length > 0) return { label: 'Text ready', tone: 'success' };
  return { label: 'Waiting for signs', tone: 'neutral' };
}

export default function TranslationOutputPanel({ buffer }) {
  const [paused, setPaused] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [copyState, setCopyState] = useState('idle');
  const supported = isSpeechSupported();
  const hasText = buffer.text.length > 0;
  const hasItems = buffer.items.length > 0;
  const voicesReady = supported && availableVoices().length > 0;
  const status = translationStatus(buffer);

  useEffect(() => {
    if (copyState === 'idle') return undefined;
    const timer = setTimeout(() => setCopyState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buffer.text);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

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
      className="rounded-3xl border border-white/[0.07] bg-white/[0.03] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6"
      aria-labelledby="translation-output-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="translation-output-title" className="text-lg font-semibold tracking-tight text-zinc-100">
          Translation output
        </h2>
        <StatusBadge label={status.label} tone={status.tone} pulse={status.pulse} dark />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_minmax(0,16rem)]">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Accumulated text</p>
          {hasText ? (
            <p
              className="mt-3 min-h-16 animate-fade-up break-words rounded-2xl border border-white/[0.06] bg-black/40 px-5 py-4 font-mono text-2xl tracking-wider text-zinc-100"
              aria-live="polite"
              data-testid="committed-text"
            >
              {buffer.text}
            </p>
          ) : (
            <div className="mt-3 flex min-h-16 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/30 px-6 py-6 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-zinc-400">
                <MessageSquareText size={20} aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-semibold text-zinc-200">No text yet</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-500">
                Hold a recognized letter steady. It is added to the text after a short hold.
              </p>
            </div>
          )}

          {buffer.holding && (
            <p className="mt-3 text-xs text-zinc-400" aria-live="polite">
              Holding {buffer.holding.label}: {buffer.holding.count} of {buffer.holding.of} frames
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={SECONDARY} onClick={buffer.undo} disabled={!hasItems}>
              Undo last
            </button>
            <button type="button" className={SECONDARY} onClick={buffer.addSpace} disabled={!hasItems}>
              Add space
            </button>
            <button type="button" className={SECONDARY} onClick={buffer.clear} disabled={!hasItems}>
              Clear text
            </button>
            <button type="button" className={SECONDARY} onClick={handleCopy} disabled={!hasText}>
              {copyState === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copyState === 'copied' ? 'Copied' : 'Copy text'}
            </button>
          </div>
          {copyState === 'error' && (
            <p className="mt-3 text-xs text-red-300" role="alert">
              Copying is not available in this browser.
            </p>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Recognised signs</p>
          {hasItems ? (
            <ol className="mt-3 max-h-48 space-y-1 overflow-y-auto pr-1 text-xs text-zinc-400" aria-label="Committed items, in order">
              {buffer.items.map((item, index) => (
                <li
                  key={`${index}-${item.type}-${item.label ?? ''}`}
                  className="flex justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-1.5"
                >
                  <span className="text-zinc-200">{item.type === 'space' ? 'Space' : `Letter ${item.label}`}</span>
                  {item.type === 'letter' && <span>Confidence {Math.round(item.confidence * 100)}%</span>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">Committed signs will appear here, in order.</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
        <button type="button" onClick={handleSpeak} disabled={!supported || !hasText} className={PRIMARY}>
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

      {!supported && <p className="mt-3 text-xs text-zinc-500">Text-to-speech is not available in this browser.</p>}
      {supported && !voicesReady && (
        <p className="mt-3 text-xs text-zinc-500">
          No speech voices were reported by this browser. Speech may be silent, depending on the system voices.
        </p>
      )}
      {speechError && <p className="mt-3 text-xs text-red-300" role="alert">{speechError}</p>}

      <p className="mt-5 text-xs leading-relaxed text-zinc-500">
        Letters come from a pilot model and may be wrong. Check the text before you rely on it. Only the text above is
        spoken.
      </p>
    </section>
  );
}

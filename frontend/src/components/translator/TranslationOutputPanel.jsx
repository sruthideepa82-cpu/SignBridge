import { useEffect, useState } from 'react';
import { Check, Copy, Pause, Play, Square, Volume2 } from 'lucide-react';
import { isSpeechSupported, pauseSpeaking, resumeSpeaking, speak, stopSpeaking } from '../../lib/speech.js';
import StatusBadge from '../common/StatusBadge.jsx';

const ACTION =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all duration-200 ease-out enabled:hover:border-white/25 enabled:hover:text-white enabled:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal disabled:cursor-not-allowed disabled:opacity-35';
const SPEAK =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-lime-signal px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 ease-out enabled:hover:-translate-y-px enabled:hover:shadow-[0_0_20px_-4px_rgba(182,255,0,0.8)] enabled:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal disabled:cursor-not-allowed disabled:opacity-35';

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
      className="w-full rounded-md border border-white/10 bg-white/[0.02] p-4 sm:p-5"
      aria-labelledby="translation-output-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="translation-output-title" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Translation output
        </h2>
        <StatusBadge label={status.label} tone={status.tone} pulse={status.pulse} dark />
      </div>

      {hasText ? (
        <p
          className="mt-3 min-h-14 animate-fade-up break-words rounded-md border border-white/10 bg-black/60 px-4 py-3 font-mono text-xl tracking-wider text-white"
          aria-live="polite"
          data-testid="committed-text"
        >
          {buffer.text}
        </p>
      ) : (
        <p className="mt-3 flex min-h-14 items-center rounded-md border border-dashed border-white/10 bg-black/40 px-4 py-3 text-sm text-zinc-500">
          No text yet. Hold a recognized letter steady and it is added after a short hold.
        </p>
      )}

      {buffer.holding && (
        <p className="mt-2 text-xs text-zinc-400" aria-live="polite">
          Holding {buffer.holding.label}: {buffer.holding.count} of {buffer.holding.of} frames
        </p>
      )}

      {hasItems && (
        <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Committed items, in order">
          {buffer.items.map((item, index) => (
            <li
              key={`${index}-${item.type}-${item.label ?? ''}`}
              className="flex items-center gap-2 rounded-sm border border-white/10 px-2 py-0.5 text-[11px] text-zinc-300"
            >
              <span>{item.type === 'space' ? 'Space' : `Letter ${item.label}`}</span>
              {item.type === 'letter' && <span className="tabular-nums text-zinc-500">{Math.round(item.confidence * 100)}%</span>}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ACTION} onClick={buffer.undo} disabled={!hasItems}>
            Undo last
          </button>
          <button type="button" className={ACTION} onClick={buffer.addSpace} disabled={!hasItems}>
            Add space
          </button>
          <button type="button" className={ACTION} onClick={buffer.clear} disabled={!hasItems}>
            Clear text
          </button>
          <button type="button" className={ACTION} onClick={handleCopy} disabled={!hasText}>
            {copyState === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copyState === 'copied' ? 'Copied' : 'Copy text'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={ACTION} onClick={handlePauseToggle} disabled={!supported}>
            {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" className={ACTION} onClick={handleStop} disabled={!supported}>
            <Square size={14} aria-hidden="true" />
            Stop
          </button>
          <button type="button" onClick={handleSpeak} disabled={!supported || !hasText} className={SPEAK}>
            <Volume2 size={14} aria-hidden="true" />
            Speak text
          </button>
        </div>
      </div>

      {copyState === 'error' && (
        <p className="mt-3 text-xs text-red-300" role="alert">
          Copying is not available in this browser.
        </p>
      )}
      {speechError && <p className="mt-3 text-xs text-red-300" role="alert">{speechError}</p>}
      {!supported && <p className="mt-3 text-xs text-zinc-500">Text-to-speech is not available in this browser.</p>}

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
        Letters come from a pilot model and may be wrong. Check the text before you rely on it. Only the text above is
        spoken.
      </p>
    </section>
  );
}

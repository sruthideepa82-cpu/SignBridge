import { BrainCircuit, Hand, Smile, Volume2 } from 'lucide-react';
import { isSpeechSupported } from '../../lib/speech.js';

export const MODE_IDS = {
  HAND_TRACKING: 'hand-tracking',
  EMOTION: 'emotion',
  LLM: 'llm',
  VOICE: 'voice',
};

export const PROCESSING_MODES = [
  {
    id: MODE_IDS.HAND_TRACKING,
    label: 'Hand Tracking',
    description: 'MediaPipe landmarks from the live camera, 21 points per hand. Letter recognition runs only when a trained model is loaded.',
    icon: Hand,
    enabled: true,
  },
  {
    id: MODE_IDS.EMOTION,
    label: 'Emotion Detection',
    description: 'Coming soon. No facial or emotion analysis runs yet.',
    icon: Smile,
    enabled: false,
  },
  {
    id: MODE_IDS.LLM,
    label: 'LLM Interpretation',
    description: 'Coming soon. Sentences are not generated; only committed letters are shown.',
    icon: BrainCircuit,
    enabled: false,
  },
  {
    id: MODE_IDS.VOICE,
    label: 'Voice Output',
    description: 'Speaks the committed text on request, using your browser speech voices.',
    icon: Volume2,
    enabled: true,
  },
];

export function describeMode(mode) {
  if (mode.id === MODE_IDS.VOICE && mode.enabled && !isSpeechSupported()) {
    return `${mode.description} Speech is not available in this browser.`;
  }
  return mode.description;
}

export default function ProcessingModeSelector({ activeMode, onSelect }) {
  const active = PROCESSING_MODES.find((mode) => mode.id === activeMode) ?? PROCESSING_MODES[0];

  return (
    <div className="w-full">
      <div role="radiogroup" aria-label="Processing mode" className="grid grid-cols-2 overflow-hidden rounded-md sm:flex">
        {PROCESSING_MODES.map((mode) => {
          const isActive = mode.id === active.id;
          const Icon = mode.icon;
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={!mode.enabled}
              onClick={() => onSelect(mode.id)}
              className={`group relative -ml-px -mt-px flex min-w-0 items-center justify-center gap-2 border border-white/15 px-4 py-3 text-sm font-medium transition-colors duration-300 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lime-signal sm:flex-1 ${
                isActive
                  ? 'bg-lime-signal/[0.08] text-lime-signal'
                  : mode.enabled
                    ? 'text-zinc-300 hover:bg-white/[0.04] hover:text-white'
                    : 'cursor-not-allowed text-zinc-600'
              }`}
            >
              <Icon size={15} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{mode.label}</span>
              {!mode.enabled && (
                <span className="rounded-sm border border-white/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                  Soon
                </span>
              )}
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 h-px bg-lime-signal shadow-[0_0_10px_rgba(182,255,0,0.9)] transition-transform duration-300 ease-out ${
                  isActive ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </button>
          );
        })}
      </div>

      <p key={active.id} className="mt-3 animate-fade-up text-center text-xs leading-relaxed text-zinc-500" aria-live="polite">
        <span className="font-semibold text-zinc-300">{active.label}: </span>
        {describeMode(active)}
      </p>
    </div>
  );
}

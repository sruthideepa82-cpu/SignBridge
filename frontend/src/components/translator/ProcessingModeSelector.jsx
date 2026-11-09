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
    description: 'MediaPipe landmarks from the live camera, 21 points per hand.',
    icon: Hand,
    accent: 'lime',
    enabled: true,
  },
  {
    id: MODE_IDS.EMOTION,
    label: 'Emotion Detection',
    description: 'Not built yet. No facial or emotion analysis runs.',
    icon: Smile,
    accent: 'rose',
    enabled: false,
  },
  {
    id: MODE_IDS.LLM,
    label: 'LLM Interpretation',
    description: 'Not built yet. Sentences are not generated, only committed letters are shown.',
    icon: BrainCircuit,
    accent: 'violet',
    enabled: false,
  },
  {
    id: MODE_IDS.VOICE,
    label: 'Voice Output',
    description: 'Speaks the committed text on request, using your browser speech voices.',
    icon: Volume2,
    accent: 'sky',
    enabled: true,
  },
];

const ACCENT_CLASSES = {
  lime: {
    active: 'border-lime-signal/50 bg-lime-signal/[0.06] shadow-[0_0_30px_-12px_rgba(182,255,0,0.6)]',
    icon: 'bg-lime-signal/15 text-lime-signal',
  },
  sky: {
    active: 'border-sky-400/50 bg-sky-400/[0.06] shadow-[0_0_30px_-12px_rgba(56,189,248,0.6)]',
    icon: 'bg-sky-400/15 text-sky-300',
  },
  violet: {
    active: 'border-violet-400/50 bg-violet-400/[0.06]',
    icon: 'bg-violet-400/15 text-violet-300',
  },
  rose: {
    active: 'border-rose-400/50 bg-rose-400/[0.06]',
    icon: 'bg-rose-400/15 text-rose-300',
  },
};

function modeStatus(mode) {
  if (!mode.enabled) return { label: 'Coming soon', tone: 'neutral' };
  if (mode.id === MODE_IDS.VOICE && !isSpeechSupported()) return { label: 'Unavailable', tone: 'warning' };
  return { label: 'Ready', tone: 'success' };
}

const STATUS_CLASSES = {
  neutral: 'text-zinc-500',
  success: 'text-lime-signal/80',
  warning: 'text-amber-300/80',
};

export default function ProcessingModeSelector({ activeMode, onSelect }) {
  return (
    <section aria-labelledby="processing-modes-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="processing-modes-title" className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Processing mode
        </h2>
      </div>

      <div role="radiogroup" aria-labelledby="processing-modes-title" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PROCESSING_MODES.map((mode) => {
          const active = mode.id === activeMode;
          const status = modeStatus(mode);
          const accent = ACCENT_CLASSES[mode.accent];
          const Icon = mode.icon;

          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-disabled={!mode.enabled}
              disabled={!mode.enabled}
              onClick={() => mode.enabled && onSelect(mode.id)}
              className={`group flex min-w-0 flex-col gap-3 rounded-2xl border p-4 text-left transition-all duration-300 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal ${
                active
                  ? accent.active
                  : 'border-white/[0.07] bg-white/[0.02] enabled:hover:-translate-y-0.5 enabled:hover:border-white/15 enabled:hover:bg-white/[0.04]'
              } ${mode.enabled ? 'cursor-pointer enabled:active:scale-[0.99]' : 'cursor-not-allowed opacity-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors duration-300 ${
                    mode.enabled ? accent.icon : 'bg-white/5 text-zinc-500'
                  }`}
                >
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className={`text-[11px] font-semibold uppercase tracking-wide ${active ? 'text-lime-signal' : STATUS_CLASSES[status.tone]}`}>
                  {active ? 'Active' : status.label}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-100">{mode.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{mode.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

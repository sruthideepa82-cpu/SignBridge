import { describeRecognition, pct } from '../../lib/recognitionStatus.js';

const TONE_TEXT = {
  neutral: 'text-zinc-400',
  success: 'text-lime-signal',
  warning: 'text-amber-300',
  danger: 'text-red-300',
};

export default function RecognitionIndicator({ result, error, cameraLive, holding }) {
  const view = describeRecognition(result, error, cameraLive);
  const confidence = result?.confidence ?? null;
  const showConfidence = confidence != null && (result.status === 'recognized' || result.status === 'uncertain');

  return (
    <div
      className="max-w-[16rem] rounded-md border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-sm"
      aria-live="polite"
      data-testid="recognition-indicator"
    >
      <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${TONE_TEXT[view.tone]}`}>{view.label}</p>
      <p
        className={`mt-1 break-words font-semibold tracking-tight ${
          view.headline ? 'text-2xl text-lime-signal' : 'text-sm text-zinc-500'
        }`}
        data-testid="predicted-sign"
      >
        {view.headline ?? (view.text || '—')}
      </p>
      {showConfidence && <p className="mt-0.5 text-[11px] tabular-nums text-zinc-400">Confidence {pct(confidence)}</p>}
      {holding && (
        <div className="mt-2">
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span>Holding {holding.label}</span>
            <span className="tabular-nums">
              {holding.count}/{holding.of}
            </span>
          </div>
          <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-lime-signal transition-[width] duration-300"
              style={{ width: `${Math.min(100, (holding.count / holding.of) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

import { describeRecognition, EXPERIMENTAL_LABEL, pct } from '../../lib/recognitionStatus.js';

const TONE_TEXT = {
  neutral: 'text-app-muted',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

// Gesture overlay on the webcam. It only shows a sign when the backend returned one, and a confidence
// value only when the model provided it.
export default function RecognitionIndicator({ result, error, cameraLive, holding }) {
  const view = describeRecognition(result, error, cameraLive);
  const confidence = result?.confidence ?? null;
  const showConfidence = confidence != null && (result.status === 'recognized' || result.status === 'uncertain');

  return (
    <div
      className="flex max-w-full items-center gap-4 rounded-lg bg-app-bg/85 px-3 py-2 ring-1 ring-white/10"
      aria-live="polite"
      data-testid="recognition-indicator"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`shrink-0 text-xs font-medium ${TONE_TEXT[view.tone]}`}>{view.label}</span>
        {view.headline ? (
          <span
            className="min-w-0 truncate rounded-md bg-accent/20 px-2 py-0.5 text-sm font-semibold tracking-wide text-accent-hover"
            data-testid="predicted-sign"
          >
            {view.headline}
          </span>
        ) : (
          <span className="truncate text-xs text-app-muted" data-testid="predicted-sign">
            {view.text || '—'}
          </span>
        )}
      </div>

      {result?.experimental === true && result.status !== 'no_model' && (
        <span className="shrink-0 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
          {EXPERIMENTAL_LABEL}
        </span>
      )}

      {showConfidence && (
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="text-xs tabular-nums text-app-text">Confidence {pct(confidence)}</span>
          <span className="h-1 w-16 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <span className="block h-full bg-accent" style={{ width: `${Math.min(100, confidence * 100)}%` }} />
          </span>
        </div>
      )}

      {holding && (
        <div className="flex shrink-0 items-center gap-2 text-xs text-app-muted">
          <span>Holding {holding.label}</span>
          <span className="tabular-nums">{holding.count}/{holding.of}</span>
        </div>
      )}
    </div>
  );
}

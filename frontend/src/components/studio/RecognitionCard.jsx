import { Activity, X } from 'lucide-react';
import { describeRecognition, EXPERIMENTAL_LABEL, pct } from '../../lib/recognitionStatus.js';

// The Recognition card on Live Studio. It shows the sign the recognizer reports now, its confidence, and the letters
// already accepted into the sequence. Every value comes from the same state the draft uses. Removing a letter here calls
// the same handler as the draft, so the two cannot disagree.
export default function RecognitionCard({
  recognition,
  recognitionError,
  cameraLive,
  paused,
  phraseMode,
  items,
  experimental,
  onRemoveAt,
}) {
  const view = describeRecognition(recognition, recognitionError, cameraLive && !paused);
  const showing = cameraLive && !paused && !phraseMode;
  const confidence = recognition?.confidence ?? null;
  const showConfidence = showing && confidence != null && (recognition.status === 'recognized' || recognition.status === 'uncertain');
  const sequence = items ?? [];

  let statusLabel = 'Camera off';
  let statusTone = 'text-app-muted';
  let dotTone = 'bg-app-muted';
  if (phraseMode) {
    statusLabel = 'Daily Phrases';
  } else if (paused && cameraLive) {
    statusLabel = 'Paused';
  } else if (cameraLive && recognitionError) {
    statusLabel = 'Unavailable';
    statusTone = 'text-danger';
    dotTone = 'bg-danger';
  } else if (cameraLive) {
    statusLabel = 'Live';
    statusTone = 'text-success';
    dotTone = 'bg-success';
  }

  return (
    <section aria-labelledby="recognition-card-title" className="ls-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="recognition-card-title" className="flex items-center gap-2 text-base font-semibold text-app-text">
          <Activity size={17} className="text-accent" aria-hidden="true" />
          Recognition
        </h2>
        <span className={`flex items-center gap-1.5 rounded-full border border-app-border px-2.5 py-1 text-xs font-medium ${statusTone}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-app-muted">Detected sign</p>
          {phraseMode ? (
            <p className="mt-2 text-sm text-app-muted">
              Daily Phrases mode. Suggestions appear in the panel below the camera, and you confirm each one.
            </p>
          ) : view.headline && showing ? (
            <p className="mt-1 break-words text-[44px] font-bold leading-tight tracking-wide text-accent-hover" data-testid="detected-sign">
              {view.headline}
            </p>
          ) : (
            <p className="mt-2 text-sm text-app-muted" data-testid="detected-sign">
              {paused && cameraLive ? 'Recognition is paused.' : view.text || 'No sign recognised yet.'}
            </p>
          )}
          {experimental && showing && recognition?.status !== 'no_model' && (
            <span className="mt-2 inline-block rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
              {EXPERIMENTAL_LABEL}
            </span>
          )}
        </div>

        {showConfidence && (
          <div className="shrink-0 rounded-xl border border-app-border bg-app-raised px-4 py-2.5 text-center">
            <p className="text-lg font-semibold tabular-nums text-success">{pct(confidence)}</p>
            <p className="text-[11px] text-app-muted">Confidence</p>
          </div>
        )}
      </div>

      {!phraseMode && (
        <div className="mt-4 border-t border-app-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-app-muted">Detected sequence</p>
          {sequence.length === 0 ? (
            <p className="mt-2 text-sm text-app-muted">Recognised letters appear here, in order.</p>
          ) : (
            <ol className="mt-2 flex flex-wrap gap-2" aria-label="Detected sequence, in order">
              {sequence.map((item, index) =>
                item.type === 'space' ? (
                  <li key={`space-${index}`} className="flex items-center">
                    <span className="rounded-lg border border-dashed border-app-border px-2 py-1.5 text-xs text-app-muted">Space</span>
                    {onRemoveAt && <RemoveButton label="Remove space" onClick={() => onRemoveAt(index)} />}
                  </li>
                ) : (
                  <li key={`${index}-${item.label}`} className="ls-token">
                    <span className="text-2xl font-semibold leading-none">{item.label}</span>
                    <span className="text-xs tabular-nums text-app-muted" aria-label={`Accepted with ${Math.round(item.confidence * 100)} percent confidence`}>
                      {Math.round(item.confidence * 100)}%
                    </span>
                    {item.experimental && (
                      <span className="rounded bg-warning/15 px-1 text-[10px] font-semibold text-warning" aria-label="Experimental, unverified">
                        Exp.
                      </span>
                    )}
                    {onRemoveAt && (
                      <span className="absolute right-0.5 top-0.5">
                        <RemoveButton label={`Remove letter ${item.label}`} onClick={() => onRemoveAt(index)} />
                      </span>
                    )}
                  </li>
                ),
              )}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

function RemoveButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-5 w-5 items-center justify-center rounded text-app-muted hover:bg-white/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-accent"
    >
      <X size={12} aria-hidden="true" />
    </button>
  );
}

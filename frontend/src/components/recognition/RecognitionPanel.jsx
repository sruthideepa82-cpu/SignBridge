import StatusBadge from '../common/StatusBadge.jsx';
import { formatTime } from '../../lib/recognitionHistory.js';

const pct = (value) => `${Math.round(value * 100)}%`;

function describe(result, error, cameraLive) {
  if (error) {
    return {
      badge: { label: 'Recognition unavailable', tone: 'danger' },
      headline: null,
      text: error,
    };
  }
  if (!cameraLive) {
    return {
      badge: { label: 'Camera off', tone: 'neutral' },
      headline: null,
      text: 'Start the camera to see sign predictions.',
    };
  }
  if (!result) {
    return {
      badge: { label: 'Waiting', tone: 'neutral' },
      headline: null,
      text: 'Waiting for the first recognition result.',
    };
  }
  switch (result.status) {
    case 'camera_off':
      return {
        badge: { label: 'Camera off', tone: 'neutral' },
        headline: null,
        text: 'Start the camera to see sign predictions.',
      };
    case 'no_model':
      return {
        badge: { label: 'Classifier inactive', tone: 'warning' },
        headline: null,
        text: 'No trained model is loaded, so no sign is predicted.',
      };
    case 'no_hand':
      return {
        badge: { label: 'Waiting for hand', tone: 'warning' },
        headline: null,
        text: 'Show one hand to the camera.',
      };
    case 'two_hands':
      return {
        badge: { label: 'Two hands', tone: 'warning' },
        headline: null,
        text: result.detail,
      };
    case 'uncertain':
      return {
        badge: { label: 'Not recognized', tone: 'warning' },
        headline: null,
        text: result.confidence == null
          ? result.detail ?? 'This hand could not be classified.'
          : `Confidence ${pct(result.confidence)} is below the ${pct(result.threshold)} threshold, so no sign is shown.`,
      };
    case 'recognized':
      return {
        badge: { label: 'Recognized', tone: 'success', pulse: true },
        headline: result.label,
        text: 'Single-frame result from a pilot model. Not yet checked by a signer.',
      };
    default:
      return { badge: { label: 'Unknown status', tone: 'neutral' }, headline: null, text: '' };
  }
}

function confidenceFor(result) {
  if (!result || result.confidence == null) return null;
  if (result.status !== 'recognized' && result.status !== 'uncertain') return null;
  return result.confidence;
}

function handDetectionText(landmarks, cameraLive) {
  if (!cameraLive) return 'Camera off';
  if (!landmarks) return 'Waiting';
  switch (landmarks.status) {
    case 'hand_detected':
      return `${landmarks.hand_count} hand${landmarks.hand_count === 1 ? '' : 's'} detected`;
    case 'no_hand':
      return 'No hand detected';
    case 'detection_unavailable':
      return 'Detection unavailable';
    case 'processing_error':
      return 'Processing error';
    default:
      return 'Unknown';
  }
}

function LiveIndicator({ active }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500" aria-live="polite">
      <span className="flex h-3 items-end gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((bar) => (
          <span
            key={bar}
            className={`w-0.5 rounded-full ${active ? 'bg-lime-signal motion-safe:animate-pulse' : 'bg-zinc-700'}`}
            style={{ height: `${40 + bar * 25}%`, animationDelay: `${bar * 150}ms` }}
          />
        ))}
      </span>
      {active ? 'Processing live frames' : 'Idle'}
    </span>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/30 px-4 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-zinc-100">{value}</dd>
    </div>
  );
}

function ConfidenceBar({ confidence, threshold }) {
  const width = Math.min(100, Math.max(0, confidence * 100));
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Classifier confidence</span>
        <span className="font-semibold tabular-nums text-zinc-200">{pct(confidence)}</span>
      </div>
      <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-lime-signal transition-[width] duration-500 ease-out"
          style={{ width: `${width}%` }}
        />
        {threshold != null && (
          <span
            className="absolute top-[-3px] h-[12px] w-px bg-white/60"
            style={{ left: `${Math.min(100, threshold * 100)}%` }}
            title={`Threshold ${pct(threshold)}`}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

export default function RecognitionPanel({ result, error, cameraLive, landmarks, lastPredictionAt, holding }) {
  const view = describe(result, error, cameraLive);
  const confidence = confidenceFor(result);
  const isRecognized = result?.status === 'recognized';
  const processing = cameraLive && !error;

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-transparent p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-6"
      aria-labelledby="recognition-title"
    >
      {isRecognized && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-lime-signal/10 blur-3xl transition-opacity duration-700"
        />
      )}

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <h2 id="recognition-title" className="text-lg font-semibold tracking-tight text-zinc-100">
          Sign prediction
        </h2>
        <StatusBadge label={view.badge.label} tone={view.badge.tone} pulse={view.badge.pulse} dark />
      </div>

      <div className="relative mt-5 flex min-h-44 flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-black/40 px-4 py-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Predicted sign</p>
        {view.headline ? (
          <p
            key={view.headline}
            className="mt-3 animate-fade-up break-words text-6xl font-bold tracking-tight text-lime-signal drop-shadow-[0_0_24px_rgba(182,255,0,0.35)] sm:text-7xl"
            data-testid="predicted-sign"
          >
            {view.headline}
          </p>
        ) : (
          <p className="mt-3 text-4xl font-light text-zinc-700" data-testid="predicted-sign" aria-hidden="true">
            —
          </p>
        )}
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400" aria-live="polite">
          {view.text}
        </p>
      </div>

      {holding && (
        <div className="relative mt-4" aria-live="polite">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>
              Holding <span className="font-semibold text-zinc-100">{holding.label}</span>
            </span>
            <span className="tabular-nums">
              {holding.count} of {holding.of}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-lime-signal/70 transition-[width] duration-300"
              style={{ width: `${Math.min(100, (holding.count / holding.of) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {confidence != null && <ConfidenceBar confidence={confidence} threshold={result.threshold} />}

      <div className="relative mt-5 flex items-center justify-between gap-3">
        <LiveIndicator active={processing} />
      </div>

      <dl className="relative mt-4 grid gap-3 sm:grid-cols-2">
        <Metric label="Hand detection" value={handDetectionText(landmarks, cameraLive)} />
        <Metric label="Last prediction" value={lastPredictionAt ? formatTime(lastPredictionAt) : '—'} />
      </dl>
    </section>
  );
}

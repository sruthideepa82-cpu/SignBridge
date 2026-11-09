import StatusBadge from '../common/StatusBadge.jsx';
import { formatTime } from '../../lib/recognitionHistory.js';

const pct = (value) => `${Math.round(value * 100)}%`;

function describe(result, error, cameraLive) {
  if (error) {
    return {
      badge: { label: 'Recognition unavailable', tone: 'danger' },
      headline: 'No prediction',
      text: error,
    };
  }
  if (!cameraLive) {
    return {
      badge: { label: 'Camera off', tone: 'neutral' },
      headline: 'No prediction',
      text: 'Start the camera to see sign predictions.',
    };
  }
  if (!result) {
    return {
      badge: { label: 'Waiting', tone: 'neutral' },
      headline: 'Waiting for a result',
      text: 'Waiting for the first recognition result.',
    };
  }
  switch (result.status) {
    case 'camera_off':
      return {
        badge: { label: 'Camera off', tone: 'neutral' },
        headline: 'No prediction',
        text: 'Start the camera to see sign predictions.',
      };
    case 'no_model':
      return {
        badge: { label: 'No model loaded', tone: 'warning' },
        headline: 'Sign classification is not active yet.',
        text: 'No trained model is loaded, so no sign is predicted.',
      };
    case 'no_hand':
      return {
        badge: { label: 'No hand', tone: 'warning' },
        headline: 'No sign yet',
        text: 'Show one hand to the camera.',
      };
    case 'two_hands':
      return {
        badge: { label: 'Two hands', tone: 'warning' },
        headline: 'No sign yet',
        text: result.detail,
      };
    case 'uncertain':
      return {
        badge: { label: 'Not recognized', tone: 'warning' },
        headline: 'No sign yet',
        text: result.confidence == null
          ? result.detail ?? 'This hand could not be classified.'
          : `Confidence ${pct(result.confidence)} is below the ${pct(result.threshold)} threshold, so no sign is shown.`,
      };
    case 'recognized':
      return {
        badge: { label: 'Recognized', tone: 'success', pulse: true },
        headline: result.label,
        predicted: true,
        text: 'Single-frame result from a pilot model. Not yet checked by a signer.',
      };
    default:
      return { badge: { label: 'Unknown status', tone: 'neutral' }, headline: 'Unknown status', text: '' };
  }
}

function classifierConfidence(result) {
  if (!result || result.confidence == null) return '—';
  if (result.status !== 'recognized' && result.status !== 'uncertain') return '—';
  return pct(result.confidence);
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

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

export default function RecognitionPanel({ result, error, cameraLive, landmarks, lastPredictionAt, children }) {
  const view = describe(result, error, cameraLive);

  return (
    <section
      className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5"
      aria-labelledby="recognition-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="recognition-title" className="text-lg font-semibold text-slate-900">
          Sign prediction
        </h2>
        <StatusBadge label={view.badge.label} tone={view.badge.tone} pulse={view.badge.pulse} />
      </div>

      <div className="mt-5 flex min-h-48 flex-col items-center justify-center rounded-2xl bg-slate-50 px-4 py-6 text-center ring-1 ring-slate-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Predicted sign</p>
        {view.predicted ? (
          <p className="mt-2 break-words text-6xl font-bold text-slate-900" data-testid="predicted-sign">
            {view.headline}
          </p>
        ) : (
          <p className="mt-2 text-base font-semibold text-slate-800" data-testid="predicted-sign">
            {view.headline}
          </p>
        )}
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600" aria-live="polite">
          {view.text}
        </p>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Classifier confidence" value={classifierConfidence(result)} />
        <Metric label="Hand detection" value={handDetectionText(landmarks, cameraLive)} />
        <Metric label="Last prediction" value={lastPredictionAt ? formatTime(lastPredictionAt) : '—'} />
      </dl>

      {children && <div className="mt-6 border-t border-slate-200 pt-5">{children}</div>}
    </section>
  );
}

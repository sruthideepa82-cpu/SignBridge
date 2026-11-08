import StatusBadge from '../common/StatusBadge.jsx';

const pct = (value) => `${Math.round(value * 100)}%`;

function describe(result, error) {
  if (error) {
    return { badge: { label: 'Recognition unavailable', tone: 'danger' }, text: error };
  }
  if (!result) {
    return { badge: { label: 'Waiting', tone: 'neutral' }, text: 'Waiting for the first recognition result.' };
  }
  switch (result.status) {
    case 'camera_off':
      return { badge: { label: 'Camera off', tone: 'neutral' }, text: 'Start the camera to test recognition.' };
    case 'no_model':
      return {
        badge: { label: 'No model loaded', tone: 'warning' },
        text: 'Recognition is not active because no trained model is loaded. No letter is predicted.',
      };
    case 'no_hand':
      return { badge: { label: 'No hand', tone: 'warning' }, text: 'Show one hand to the camera.' };
    case 'two_hands':
      return { badge: { label: 'Two hands', tone: 'warning' }, text: result.detail };
    case 'uncertain':
      return {
        badge: { label: 'Not recognized', tone: 'warning' },
        text: result.confidence == null
          ? result.detail ?? 'This hand could not be classified.'
          : `Confidence ${pct(result.confidence)} is below the ${pct(result.threshold)} threshold, so no letter is shown.`,
      };
    case 'recognized':
      return {
        badge: { label: `Recognized: ${result.label}`, tone: 'success', pulse: true },
        text: `Confidence ${pct(result.confidence)}. Single-frame result from a pilot model. Not yet checked by a signer.`,
      };
    default:
      return { badge: { label: 'Unknown status', tone: 'neutral' }, text: '' };
  }
}

export default function RecognitionPanel({ result, error }) {
  const view = describe(result, error);

  return (
    <section
      className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5"
      aria-labelledby="recognition-title"
    >
      <h2 id="recognition-title" className="text-lg font-semibold text-slate-900">
        Letter recognition (pilot)
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge label={view.badge.label} tone={view.badge.tone} pulse={view.badge.pulse} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600" aria-live="polite">
        {view.text}
      </p>
    </section>
  );
}

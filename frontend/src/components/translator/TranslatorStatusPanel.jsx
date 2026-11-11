import StatusBadge from '../common/StatusBadge.jsx';

const NOT_AVAILABLE = { label: 'Not available', tone: 'neutral' };

function modelAvailability(result, error, cameraLive) {
  if (error || !cameraLive || !result || result.status === 'camera_off') {
    return {
      badge: NOT_AVAILABLE,
      text: 'Reported by the backend once the camera is running.',
    };
  }
  if (result.status === 'no_model') {
    return { badge: { label: 'Not started', tone: 'warning' }, text: 'No trained model is loaded.' };
  }
  return { badge: { label: 'Model ready', tone: 'success' }, text: 'A trained model is loaded.' };
}

function StatusRow({ title, description, badge }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{description}</p>}
      </div>
      {badge && <StatusBadge label={badge.label} tone={badge.tone} dark />}
    </li>
  );
}

export default function TranslatorStatusPanel({ recognition, error, cameraLive }) {
  const model = modelAvailability(recognition, error, cameraLive);

  return (
    <section
      className="rounded-xl border border-app-border bg-app-surface p-5 sm:p-6"
      aria-labelledby="translator-status-title"
    >
      <h2 id="translator-status-title" className="text-lg font-semibold tracking-tight text-zinc-100">
        Collection &amp; training status
      </h2>

      <ul className="mt-2 divide-y divide-white/[0.06]">
        <StatusRow
          title="Dataset collection"
          description="The app does not report collection progress yet. Samples are recorded with the offline collection tool."
          badge={NOT_AVAILABLE}
        />
        <StatusRow
          title="Samples collected"
          description="Sample counts are not reported to the app yet."
          badge={NOT_AVAILABLE}
        />
        <StatusRow
          title="Model training"
          description="Training runs offline with ai-engine/training/train_static_classifier.py. Its status is not reported to the app yet."
          badge={NOT_AVAILABLE}
        />
        <StatusRow title="Model availability" description={model.text} badge={model.badge} />
        <StatusRow title="Last training status" description="Not reported to the app yet." badge={NOT_AVAILABLE} />
      </ul>
    </section>
  );
}

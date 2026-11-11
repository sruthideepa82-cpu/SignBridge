// Development diagnostics for facial tracking. Collapsed by default. Every value is read from the backend's
// latest face result or the last request error; nothing here is estimated.
const BLENDSHAPE_CATEGORIES = 52;

function Item({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="text-xs text-app-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-xs tabular-nums text-app-text">{value ?? '—'}</dd>
    </div>
  );
}

export default function FaceDiagnostics({ face, error, faceView }) {
  const blendshapeCount = faceView.blendshapes ? Object.keys(faceView.blendshapes).length : 0;
  const modelStatus = !face
    ? 'Waiting for first result'
    : face.detection_available
      ? 'Loaded'
      : 'Not loaded';

  return (
    <details className="group rounded-lg border border-app-border">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-app-muted hover:text-app-text focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        Diagnostics
        <span className="transition-transform duration-200 group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <dl className="divide-y divide-app-border border-t border-app-border px-3">
        <Item label="Face model" value={modelStatus} />
        <Item label="Detection status" value={face?.status} />
        <Item label="Detection error" value={face?.detection_error || error || 'none'} />
        <Item label="Result frame" value={face?.frame_sequence} />
        <Item label="Faces" value={face?.face_count} />
        <Item label="Landmarks" value={face?.landmark_count} />
        <Item label="Blendshapes" value={blendshapeCount ? `${blendshapeCount} of ${BLENDSHAPE_CATEGORIES}` : null} />
        <Item label="Frames smoothed" value={face?.frames_smoothed} />
        <Item label="Frame agreement" value={face?.agreement != null ? `${Math.round(face.agreement * 100)}%` : null} />
      </dl>
    </details>
  );
}

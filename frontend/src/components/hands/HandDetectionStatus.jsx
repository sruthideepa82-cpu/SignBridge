import StatusBadge from '../common/StatusBadge.jsx';

const LANDMARK_STATUS_BADGES = {
  camera_off: { label: 'Waiting for camera', tone: 'neutral' },
  detection_unavailable: { label: 'Detection unavailable', tone: 'danger' },
  processing_error: { label: 'Processing error', tone: 'danger' },
  no_hand: { label: 'No hand detected', tone: 'warning' },
  hand_detected: { label: 'Hand detected', tone: 'success', pulse: true },
};

export default function HandDetectionStatus({ landmarks, error }) {
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label="Status unavailable" tone="danger" dark />
        <span className="text-xs text-zinc-500">{error}</span>
      </div>
    );
  }

  const badge = LANDMARK_STATUS_BADGES[landmarks?.status ?? 'camera_off'];
  const handCount = landmarks?.hand_count ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge label={badge.label} tone={badge.tone} pulse={badge.pulse} dark />
      <span
        className="inline-flex items-center rounded-full bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-zinc-300 ring-1 ring-inset ring-white/10"
        aria-live="polite"
      >
        Hands detected: {handCount}
      </span>
      {(landmarks?.status === 'detection_unavailable' || landmarks?.status === 'processing_error') && landmarks.detection_error && (
        <span className="text-xs text-zinc-500">{landmarks.detection_error}</span>
      )}
    </div>
  );
}

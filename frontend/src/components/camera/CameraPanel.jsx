import { CAMERA_STATUS } from '../../hooks/useCamera.js';
import HandDetectionStatus from '../hands/HandDetectionStatus.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import CameraControls from './CameraControls.jsx';
import CameraPreview from './CameraPreview.jsx';

const STATUS_BADGES = {
  [CAMERA_STATUS.IDLE]: { label: 'Camera off', tone: 'neutral' },
  [CAMERA_STATUS.STARTING]: { label: 'Connecting', tone: 'info', pulse: true },
  [CAMERA_STATUS.LIVE]: { label: 'Live', tone: 'success', pulse: true },
  [CAMERA_STATUS.ERROR]: { label: 'Error', tone: 'danger' },
};

export default function CameraPanel({ camera, landmarks, landmarkError }) {
  const { status, errorMessage, streamUrl, startCamera, stopCamera, handleStreamError } = camera;
  const badge = STATUS_BADGES[status];

  return (
    <section
      className="rounded-3xl border border-white/[0.07] bg-white/[0.03] p-4 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-5"
      aria-labelledby="camera-panel-title"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="camera-panel-title" className="text-lg font-semibold tracking-tight text-zinc-100">
          Camera preview
        </h2>
        <StatusBadge label={badge.label} tone={badge.tone} pulse={badge.pulse} dark />
      </div>

      <CameraPreview
        status={status}
        streamUrl={streamUrl}
        errorMessage={errorMessage}
        onStreamError={handleStreamError}
      />

      {status === CAMERA_STATUS.LIVE && (
        <div className="mt-4 animate-fade-up">
          <HandDetectionStatus landmarks={landmarks} error={landmarkError} />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <CameraControls status={status} onStart={startCamera} onStop={stopCamera} />
        <p className="max-w-md text-xs leading-relaxed text-zinc-500">
          Frames are captured by the backend with OpenCV. MediaPipe landmarks are drawn on the preview when a hand is
          detected.
        </p>
      </div>
    </section>
  );
}

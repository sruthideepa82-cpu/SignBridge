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
      className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5 sm:p-6"
      aria-labelledby="camera-panel-title"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="camera-panel-title" className="text-lg font-semibold text-slate-900">
          Camera preview
        </h2>
        <StatusBadge label={badge.label} tone={badge.tone} pulse={badge.pulse} />
      </div>

      <CameraPreview
        status={status}
        streamUrl={streamUrl}
        errorMessage={errorMessage}
        onStreamError={handleStreamError}
      />

      {status === CAMERA_STATUS.LIVE && (
        <div className="mt-4">
          <HandDetectionStatus landmarks={landmarks} error={landmarkError} />
        </div>
      )}

      <div className="mt-5">
        <CameraControls status={status} onStart={startCamera} onStop={stopCamera} />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Frames are captured by the backend with OpenCV. The preview shows MediaPipe hand landmarks when a hand is
        detected. Sign classification is not active yet, so no translations are produced.
      </p>
    </section>
  );
}

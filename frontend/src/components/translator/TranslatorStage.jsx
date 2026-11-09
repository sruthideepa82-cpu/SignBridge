import { CAMERA_STATUS } from '../../hooks/useCamera.js';
import CameraControls from '../camera/CameraControls.jsx';
import CameraPreview from '../camera/CameraPreview.jsx';
import RecognitionIndicator from '../recognition/RecognitionIndicator.jsx';

function handChip(landmarks, landmarkError) {
  if (landmarkError) return 'Landmarks unavailable';
  if (!landmarks) return 'Waiting for hands';
  switch (landmarks.status) {
    case 'hand_detected':
      return `${landmarks.hand_count} ${landmarks.hand_count === 1 ? 'hand' : 'hands'} · 21 landmarks each`;
    case 'no_hand':
      return 'No hand detected';
    case 'detection_unavailable':
      return 'Hand model unavailable';
    case 'processing_error':
      return 'Processing error';
    default:
      return 'Waiting for hands';
  }
}

function Chip({ children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/70 px-2.5 py-1 text-xs text-zinc-200 backdrop-blur-sm ${className}`}
    >
      {children}
    </span>
  );
}

export default function TranslatorStage({
  camera,
  landmarks,
  landmarkError,
  recognition,
  recognitionError,
  holding,
  modeLabel,
  handTrackingActive,
}) {
  const { status, errorMessage, streamUrl, startCamera, stopCamera, handleStreamError } = camera;
  const cameraLive = status === CAMERA_STATUS.LIVE;

  return (
    <section aria-label="Live camera demonstration" className="w-full">
      <div className="relative">
        <CameraPreview
          status={status}
          streamUrl={streamUrl}
          errorMessage={errorMessage}
          onStreamError={handleStreamError}
        />

        {cameraLive && handTrackingActive && (
          <div className="pointer-events-none absolute right-3 top-3 animate-fade-up">
            <Chip>
              <span className={`h-1.5 w-1.5 rounded-full ${landmarks?.status === 'hand_detected' ? 'bg-lime-signal' : 'bg-zinc-500'}`} />
              {handChip(landmarks, landmarkError)}
            </Chip>
          </div>
        )}

        {cameraLive && (
          <div className="absolute bottom-3 left-3 animate-fade-up">
            <RecognitionIndicator result={recognition} error={recognitionError} cameraLive holding={holding} />
          </div>
        )}

        {cameraLive && (
          <div className="pointer-events-none absolute bottom-3 right-3 animate-fade-up">
            <Chip>
              <span className="h-1.5 w-1.5 rounded-full bg-lime-signal" />
              {modeLabel}
            </Chip>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Frames are captured by the backend with OpenCV. MediaPipe landmarks are drawn on the stream.
        </p>
        <CameraControls status={status} onStart={startCamera} onStop={stopCamera} />
      </div>
    </section>
  );
}

import { Check } from 'lucide-react';
import CameraControls from '../camera/CameraControls.jsx';
import CameraPreview from '../camera/CameraPreview.jsx';
import RecognitionIndicator from '../recognition/RecognitionIndicator.jsx';
import FaceLandmarkOverlay from './FaceLandmarkOverlay.jsx';
import { describeHandTracking } from '../../lib/liveGuidance.js';
import { describeFace } from '../../lib/faceStatus.js';

const TONE_DOT = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-accent',
  neutral: 'bg-app-muted',
};

// The webcam is the largest element on Live Studio. Hand skeletons are drawn by the backend on the stream. The face
// overlay is drawn here from the face result, so it can be switched off without touching detection.
export default function WebcamPreview({
  camera,
  cameraLive,
  paused,
  onTogglePause,
  onStopSession,
  canStopSession,
  landmarks,
  landmarkError,
  recognition,
  recognitionError,
  holding,
  face,
  faceError,
  showFaceMesh,
  onToggleFaceMesh,
}) {
  const { status, errorMessage, streamUrl, startCamera, stopCamera, handleStreamError } = camera;
  const tracking = describeHandTracking({ landmarks, landmarkError, cameraLive, paused });
  const tracked = tracking.tone === 'success';
  const faceView = describeFace({
    face,
    error: faceError,
    cameraLive,
    paused,
    cameraStatus: status,
    cameraError: errorMessage,
  });
  const facePoints = face?.faces?.[0]?.landmarks ?? null;
  const showOverlay = cameraLive && showFaceMesh && Boolean(facePoints);

  return (
    <section aria-label="Live camera" className="flex min-w-0 flex-col gap-3">
      <div className="relative">
        <CameraPreview status={status} streamUrl={streamUrl} errorMessage={errorMessage} onStreamError={handleStreamError} />

        {showOverlay && <FaceLandmarkOverlay points={facePoints} />}

        {cameraLive && (
          <div className="pointer-events-none absolute right-3 top-3">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-app-bg/85 px-2.5 py-1 text-xs text-app-text ring-1 ring-white/10">
              {tracked && <Check size={12} className="text-success" aria-hidden="true" />}
              {tracking.label}
            </span>
          </div>
        )}

        {cameraLive && (
          <div className="pointer-events-none absolute left-3 top-12 max-w-[calc(100%-1.5rem)]" data-testid="face-overlay">
            <span className="inline-flex items-center gap-2 rounded-md bg-app-bg/85 px-2.5 py-1 text-xs text-app-text ring-1 ring-white/10">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[faceView.tone]}`} aria-hidden="true" />
              <span>{faceView.label}</span>
              {faceView.expression && (
                <span className="text-accent-hover">
                  · {faceView.expression} <span className="text-app-muted">(estimate)</span>
                </span>
              )}
            </span>
          </div>
        )}

        {cameraLive && !paused && (
          <div className="absolute bottom-3 left-3 right-3">
            <RecognitionIndicator result={recognition} error={recognitionError} cameraLive holding={holding} />
          </div>
        )}
      </div>

      <CameraControls
        status={status}
        onStart={startCamera}
        onStop={stopCamera}
        paused={paused}
        onTogglePause={onTogglePause}
        onStopSession={onStopSession}
        canStopSession={canStopSession}
        showFaceMesh={showFaceMesh}
        onToggleFaceMesh={onToggleFaceMesh}
        canToggleFaceMesh={cameraLive}
      />
    </section>
  );
}

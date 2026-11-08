import PageContainer from '../components/common/PageContainer.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import BackendStatusIndicator from '../components/common/BackendStatusIndicator.jsx';
import CameraPanel from '../components/camera/CameraPanel.jsx';
import LandmarkInfoPanel from '../components/hands/LandmarkInfoPanel.jsx';
import RecognitionPanel from '../components/recognition/RecognitionPanel.jsx';
import RoadmapPanel from '../components/translator/RoadmapPanel.jsx';
import TranslationOutputPanel from '../components/translator/TranslationOutputPanel.jsx';
import useBackendHealth from '../hooks/useBackendHealth.js';
import useCamera, { CAMERA_STATUS } from '../hooks/useCamera.js';
import useHandLandmarks from '../hooks/useHandLandmarks.js';
import useRecognition from '../hooks/useRecognition.js';

export default function TranslatorPage() {
  const backend = useBackendHealth();
  const camera = useCamera();
  const cameraLive = camera.status === CAMERA_STATUS.LIVE;
  const { landmarks, error: landmarkError } = useHandLandmarks(cameraLive);
  const { result: recognition, error: recognitionError } = useRecognition(cameraLive);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Translator"
        title="Sign-to-text translator"
        description="Preview your webcam with live MediaPipe hand landmarks. Sign classification and translation are under development and not active yet."
        badge={<StatusBadge label="Under development" tone="warning" />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <CameraPanel camera={camera} landmarks={landmarks} landmarkError={landmarkError} />
          {cameraLive && (
            <RecognitionPanel result={recognition} error={recognitionError} />
          )}
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
            <p className="text-sm font-semibold text-slate-900">Backend connection</p>
            <div className="mt-3">
              <BackendStatusIndicator status={backend.status} onRefresh={backend.refresh} />
            </div>
          </div>
          <LandmarkInfoPanel landmarks={landmarks} cameraLive={cameraLive} error={landmarkError} />
          <TranslationOutputPanel />
          <RoadmapPanel />
        </aside>
      </div>
    </PageContainer>
  );
}

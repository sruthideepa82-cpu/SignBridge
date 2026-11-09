import { useState } from 'react';
import { AppPageHeader } from '../components/app/ui.jsx';
import BackendStatusIndicator from '../components/common/BackendStatusIndicator.jsx';
import LandmarkInfoPanel from '../components/hands/LandmarkInfoPanel.jsx';
import RecognitionHistoryPanel from '../components/recognition/RecognitionHistoryPanel.jsx';
import ProcessingModeSelector, { MODE_IDS, PROCESSING_MODES } from '../components/translator/ProcessingModeSelector.jsx';
import RoadmapPanel from '../components/translator/RoadmapPanel.jsx';
import TranslationOutputPanel from '../components/translator/TranslationOutputPanel.jsx';
import TranslatorStage from '../components/translator/TranslatorStage.jsx';
import TranslatorStatusPanel from '../components/translator/TranslatorStatusPanel.jsx';
import useBackendHealth from '../hooks/useBackendHealth.js';
import useCamera, { CAMERA_STATUS } from '../hooks/useCamera.js';
import useHandLandmarks from '../hooks/useHandLandmarks.js';
import useRecognition from '../hooks/useRecognition.js';
import useRecognitionHistory from '../hooks/useRecognitionHistory.js';
import useSignBuffer from '../hooks/useSignBuffer.js';

export default function TranslatorPage() {
  const backend = useBackendHealth();
  const camera = useCamera();
  const cameraLive = camera.status === CAMERA_STATUS.LIVE;
  const { landmarks, error: landmarkError } = useHandLandmarks(cameraLive);
  const { result: recognition, error: recognitionError, receivedAt } = useRecognition(cameraLive);
  const history = useRecognitionHistory(recognition, receivedAt);
  const signBuffer = useSignBuffer(recognition);
  const [activeMode, setActiveMode] = useState(MODE_IDS.HAND_TRACKING);

  const modeLabel = PROCESSING_MODES.find((mode) => mode.id === activeMode)?.label ?? '';

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 text-app-text sm:px-6">
        <AppPageHeader
          eyebrow="Communicate"
          title="Sign to Voice"
          description="Show signs to the camera. Hand tracking runs live. Sign recognition needs a trained model, so until one is loaded no sign is recognised."
          actions={<BackendStatusIndicator status={backend.status} onRefresh={backend.refresh} dark />}
        />

        <div className="relative w-full">
          <TranslatorStage
            camera={camera}
            landmarks={landmarks}
            landmarkError={landmarkError}
            recognition={recognition}
            recognitionError={recognitionError}
            holding={signBuffer.holding}
            modeLabel={modeLabel}
            handTrackingActive={activeMode === MODE_IDS.HAND_TRACKING}
          />
        </div>

        <div className="relative mt-8 w-full max-w-4xl">
          <ProcessingModeSelector activeMode={activeMode} onSelect={setActiveMode} />
        </div>

        <div className="relative mt-6 w-full max-w-4xl">
          <TranslationOutputPanel buffer={signBuffer} />
        </div>

        <details className="group relative mt-6 w-full max-w-4xl">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-md border border-white/10 px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500 transition-colors duration-200 hover:border-white/20 hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
            Details: landmarks, system status, history
            <span className="text-zinc-600 transition-transform duration-300 group-open:rotate-45" aria-hidden="true">
              +
            </span>
          </summary>

          <div className="mt-4 grid animate-fade-up gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-white/10 p-4 sm:p-5">
              <p className="mb-3 text-xs text-zinc-500">Backend connection</p>
              <BackendStatusIndicator status={backend.status} onRefresh={backend.refresh} dark />
            </div>
            <LandmarkInfoPanel landmarks={landmarks} cameraLive={cameraLive} error={landmarkError} />
            <TranslatorStatusPanel recognition={recognition} error={recognitionError} cameraLive={cameraLive} />
            <RoadmapPanel />
            <div className="lg:col-span-2">
              <RecognitionHistoryPanel entries={history.entries} onClear={history.clear} />
            </div>
          </div>
        </details>
    </div>
  );
}

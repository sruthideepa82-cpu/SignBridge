import { useState } from 'react';
import PageContainer from '../components/common/PageContainer.jsx';
import BackendStatusIndicator from '../components/common/BackendStatusIndicator.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import CameraPanel from '../components/camera/CameraPanel.jsx';
import LandmarkInfoPanel from '../components/hands/LandmarkInfoPanel.jsx';
import RecognitionHistoryPanel from '../components/recognition/RecognitionHistoryPanel.jsx';
import RecognitionPanel from '../components/recognition/RecognitionPanel.jsx';
import ProcessingModeSelector, { MODE_IDS } from '../components/translator/ProcessingModeSelector.jsx';
import RoadmapPanel from '../components/translator/RoadmapPanel.jsx';
import TranslationOutputPanel from '../components/translator/TranslationOutputPanel.jsx';
import TranslatorStatusPanel from '../components/translator/TranslatorStatusPanel.jsx';
import useBackendHealth from '../hooks/useBackendHealth.js';
import useCamera, { CAMERA_STATUS } from '../hooks/useCamera.js';
import useHandLandmarks from '../hooks/useHandLandmarks.js';
import useRecognition from '../hooks/useRecognition.js';
import useRecognitionHistory from '../hooks/useRecognitionHistory.js';
import useSignBuffer from '../hooks/useSignBuffer.js';

const ACTIVE_GLOW = 'rounded-3xl shadow-[0_0_0_1px_rgba(182,255,0,0.3),0_0_40px_-16px_rgba(182,255,0,0.5)]';
const IDLE_GLOW = 'rounded-3xl shadow-[0_0_0_1px_rgba(255,255,255,0)]';

export default function TranslatorPage() {
  const backend = useBackendHealth();
  const camera = useCamera();
  const cameraLive = camera.status === CAMERA_STATUS.LIVE;
  const { landmarks, error: landmarkError } = useHandLandmarks(cameraLive);
  const { result: recognition, error: recognitionError, receivedAt } = useRecognition(cameraLive);
  const history = useRecognitionHistory(recognition, receivedAt);
  const signBuffer = useSignBuffer(recognition);
  const [activeMode, setActiveMode] = useState(MODE_IDS.HAND_TRACKING);

  const handActive = activeMode === MODE_IDS.HAND_TRACKING;
  const voiceActive = activeMode === MODE_IDS.VOICE;

  return (
    <div className="relative isolate overflow-hidden bg-zinc-950 text-zinc-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[32rem] bg-[radial-gradient(ellipse_at_top,rgba(182,255,0,0.10),transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />

      <PageContainer>
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 animate-fade-up">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-lime-signal">Translator</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
              Sign-to-text translator
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
              Preview your webcam with live MediaPipe hand landmarks. Sign classification and translation are under
              development and not active yet.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge label="Under development" tone="warning" dark />
            <BackendStatusIndicator status={backend.status} onRefresh={backend.refresh} dark />
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          <div className={`min-w-0 lg:col-span-3 transition-shadow duration-500 ${handActive ? ACTIVE_GLOW : IDLE_GLOW}`}>
            <CameraPanel camera={camera} landmarks={landmarks} landmarkError={landmarkError} />
          </div>
          <div className="min-w-0 lg:col-span-2">
            <RecognitionPanel
              result={recognition}
              error={recognitionError}
              cameraLive={cameraLive}
              landmarks={landmarks}
              lastPredictionAt={history.lastPredictionAt}
              holding={signBuffer.holding}
            />
          </div>
        </div>

        <div className="mt-8">
          <ProcessingModeSelector activeMode={activeMode} onSelect={setActiveMode} />
        </div>

        <div className={`mt-8 transition-shadow duration-500 ${voiceActive ? ACTIVE_GLOW : IDLE_GLOW}`}>
          <TranslationOutputPanel buffer={signBuffer} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className={`min-w-0 transition-shadow duration-500 ${handActive ? ACTIVE_GLOW : IDLE_GLOW}`}>
            <LandmarkInfoPanel landmarks={landmarks} cameraLive={cameraLive} error={landmarkError} />
          </div>
          <TranslatorStatusPanel recognition={recognition} error={recognitionError} cameraLive={cameraLive} />
          <RoadmapPanel />
        </div>

        <div className="mt-6">
          <RecognitionHistoryPanel entries={history.entries} onClear={history.clear} />
        </div>
      </PageContainer>
    </div>
  );
}

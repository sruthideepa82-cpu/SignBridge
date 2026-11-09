import { useState } from 'react';
import PageContainer from '../components/common/PageContainer.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import CameraPanel from '../components/camera/CameraPanel.jsx';
import LandmarkInfoPanel from '../components/hands/LandmarkInfoPanel.jsx';
import RecognitionHistoryPanel from '../components/recognition/RecognitionHistoryPanel.jsx';
import RecognitionPanel from '../components/recognition/RecognitionPanel.jsx';
import RoadmapPanel from '../components/translator/RoadmapPanel.jsx';
import TranslationOutputPanel from '../components/translator/TranslationOutputPanel.jsx';
import TranslatorStatusPanel from '../components/translator/TranslatorStatusPanel.jsx';
import VocabularySelector from '../components/translator/VocabularySelector.jsx';
import { TRANSLATOR_VOCABULARY } from '../data/translatorVocabulary.js';
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
  const [selectedSign, setSelectedSign] = useState(TRANSLATOR_VOCABULARY[0].label);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Translator"
        title="Sign-to-text translator"
        description="Preview your webcam with live MediaPipe hand landmarks. Sign classification and translation are under development and not active yet."
        badge={<StatusBadge label="Under development" tone="warning" />}
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CameraPanel camera={camera} landmarks={landmarks} landmarkError={landmarkError} />
        </div>
        <RecognitionPanel
          result={recognition}
          error={recognitionError}
          cameraLive={cameraLive}
          landmarks={landmarks}
          lastPredictionAt={history.lastPredictionAt}
        >
          <VocabularySelector
            vocabulary={TRANSLATOR_VOCABULARY}
            selected={selectedSign}
            onSelect={setSelectedSign}
          />
        </RecognitionPanel>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <TranslatorStatusPanel
          backend={backend}
          selectedSign={selectedSign}
          recognition={recognition}
          error={recognitionError}
          cameraLive={cameraLive}
        />
        <LandmarkInfoPanel landmarks={landmarks} cameraLive={cameraLive} error={landmarkError} />
        <TranslationOutputPanel buffer={signBuffer} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecognitionHistoryPanel entries={history.entries} onClear={history.clear} />
        </div>
        <RoadmapPanel />
      </div>
    </PageContainer>
  );
}

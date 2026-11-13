import { Copy, MessageSquarePlus, MessagesSquare, Trash2, Type } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../components/app/ConfirmDialog.jsx';
import ActionMenu from '../components/app/ActionMenu.jsx';
import { buttonClass } from '../components/app/ui.jsx';
import BackendStatusIndicator from '../components/common/BackendStatusIndicator.jsx';
import ConversationPanel from '../components/studio/ConversationPanel.jsx';
import QuickPhraseSelector from '../components/studio/QuickPhraseSelector.jsx';
import SignSentencePanel from '../components/studio/SignSentencePanel.jsx';
import { effectiveRecognition, loadLetterSettings, saveLetterSettings } from '../lib/letterSettings.js';
import WebcamPreview from '../components/studio/WebcamPreview.jsx';
import useBackendHealth from '../hooks/useBackendHealth.js';
import useCamera, { CAMERA_STATUS } from '../hooks/useCamera.js';
import useConversationStore from '../hooks/useConversationStore.js';
import useFaceExpression from '../hooks/useFaceExpression.js';
import useHandLandmarks from '../hooks/useHandLandmarks.js';
import usePhraseFavourites from '../hooks/usePhraseFavourites.js';
import useRecognition from '../hooks/useRecognition.js';
import useRecognitionHistory from '../hooks/useRecognitionHistory.js';
import useSignBuffer from '../hooks/useSignBuffer.js';
import { activeConversation, conversationActions, transcriptText } from '../lib/conversationStore.js';
import { nextDraft } from '../lib/signBuffer.js';

export default function LiveStudioPage() {
  const navigate = useNavigate();
  const backend = useBackendHealth();
  const camera = useCamera();
  const cameraLive = camera.status === CAMERA_STATUS.LIVE;
  const [paused, setPaused] = useState(false);
  const recognitionOn = cameraLive && !paused;
  const { landmarks, error: landmarkError } = useHandLandmarks(recognitionOn);
  const { face, error: faceError } = useFaceExpression(recognitionOn);
  const { result: rawRecognition, error: recognitionError, receivedAt } = useRecognition(recognitionOn);
  const [letterSettings, setLetterSettings] = useState(loadLetterSettings);
  // Recognised letters below the user's threshold become UNKNOWN before anything else uses them.
  const recognition = useMemo(() => effectiveRecognition(rawRecognition, letterSettings.minConfidence), [rawRecognition, letterSettings.minConfidence]);
  const history = useRecognitionHistory(recognition, receivedAt);
  const signBuffer = useSignBuffer(recognition, { holdFrames: letterSettings.stableFrames });
  const draftControls = {
    experimental: recognition?.experimental === true,
    backendThreshold: rawRecognition?.threshold ?? null,
    settings: letterSettings,
    onSettingsChange: (patch) => setLetterSettings((current) => saveLetterSettings({ ...current, ...patch })),
    onRemoveAt: (index) => signBuffer.remove(index),
  };

  const store = useConversationStore();
  const conversation = activeConversation(store);
  const favourites = usePhraseFavourites();

  const [draft, setDraft] = useState('');
  const previousBufferText = useRef('');
  const [largeText, setLargeText] = useState(false);
  const [showFaceMesh, setShowFaceMesh] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!cameraLive) setPaused(false);
  }, [cameraLive]);

  // Recognised letters flow into the draft. Letters added by recognition are appended to whatever the
  // user has edited; undo, clear or any other change that removes text resets the draft to the recognised text.
  useEffect(() => {
    const next = signBuffer.text;
    const previous = previousBufferText.current;
    previousBufferText.current = next;
    setDraft((current) => nextDraft(current, previous, next));
  }, [signBuffer.text]);

  const messageCount = conversation?.messages.length ?? 0;
  const savedCount = conversation?.messages.filter((message) => message.saved).length ?? 0;

  const sendDraft = () => {
    const text = draft.trim();
    if (!text) return;
    const experimental = signBuffer.items.some((item) => item.experimental);
    conversationActions.append({ text, speaker: 'deaf', source: 'sign', experimental });
    signBuffer.clear();
    setDraft('');
    setStatus('Sent recognised text to the conversation.');
  };

  const discardDraft = () => {
    signBuffer.clear();
    setDraft('');
  };

  const addSpace = () => {
    signBuffer.addSpace();
    setDraft((current) => (current === '' || current.endsWith(' ') ? current : `${current} `));
  };

  const sendPhrase = (phrase) => {
    conversationActions.append({ text: phrase, speaker: 'deaf', source: 'phrase' });
    setStatus(`Sent: ${phrase}`);
  };

  const sendReply = ({ text, source }) => {
    conversationActions.append({ text, source, speaker: 'hearing' });
    setStatus('Reply sent.');
  };

  // Stops the camera and clears the unsent draft. Messages already in the conversation are kept.
  const stopSession = () => {
    camera.stopCamera();
    setPaused(false);
    signBuffer.clear();
    setDraft('');
    setStatus('Session stopped. Unsent draft discarded.');
  };

  const copyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(transcriptText(conversation));
      setStatus('Conversation copied.');
    } catch {
      setStatus('Copying is not available in this browser.');
    }
  };

  const canStopSession = cameraLive || draft.trim().length > 0 || signBuffer.items.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-app-text">Live Studio</h1>
          <p className="mt-1 text-sm text-app-muted">
            Real-time sign recognition and communication
            {conversation && (
              <span className="text-app-muted/80">
                {' '}
                · {conversation.title} · {messageCount} {messageCount === 1 ? 'message' : 'messages'}
                {savedCount ? ` · ${savedCount} saved` : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="lg:hidden">
            <BackendStatusIndicator status={backend.status} onRefresh={backend.refresh} dark />
          </div>
          <button
            type="button"
            onClick={() => setLargeText((value) => !value)}
            aria-pressed={largeText}
            aria-label={largeText ? 'Standard text size' : 'Large text size'}
            title={largeText ? 'Standard text' : 'Large text'}
            className={buttonClass('ghost', 'w-9 px-0')}
          >
            <Type size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={messageCount === 0}
            className={buttonClass('secondary')}
          >
            <Trash2 size={15} aria-hidden="true" />
            Clear Chat
          </button>
          <ActionMenu
            label="More Live Studio actions"
            items={[
              { label: 'New conversation', icon: MessageSquarePlus, onSelect: () => conversationActions.startNew() },
              { label: 'Copy conversation', icon: Copy, onSelect: copyTranscript, disabled: messageCount === 0 },
              { label: 'All conversations', icon: MessagesSquare, onSelect: () => navigate('/conversations') },
            ]}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(19rem,1fr)] 2xl:grid-cols-[minmax(0,2.2fr)_minmax(21rem,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <WebcamPreview
            camera={camera}
            cameraLive={cameraLive}
            paused={paused}
            onTogglePause={() => setPaused((value) => !value)}
            onStopSession={stopSession}
            canStopSession={canStopSession}
            landmarks={landmarks}
            landmarkError={landmarkError}
            recognition={recognition}
            recognitionError={recognitionError}
            holding={signBuffer.holding}
            face={face}
            faceError={faceError}
            showFaceMesh={showFaceMesh}
            onToggleFaceMesh={() => setShowFaceMesh((value) => !value)}
          />

          <SignSentencePanel cameraLive={cameraLive} paused={paused} />
        </div>

        <ConversationPanel
          conversation={conversation}
          largeText={largeText}
          draft={draft}
          onDraftChange={setDraft}
          signBuffer={signBuffer}
          onSendDraft={sendDraft}
          onDiscardDraft={discardDraft}
          onAddSpace={addSpace}
          onSendReply={sendReply}
          recognitionProps={{
            camera,
            cameraLive,
            paused,
            landmarks,
            landmarkError,
            recognition,
            recognitionError,
            holding: signBuffer.holding,
            face,
            faceError,
          }}
          history={history}
          landmarks={landmarks}
          cameraLive={cameraLive}
          recognition={recognition}
          recognitionError={recognitionError}
          draftControls={draftControls}
        />
      </div>

      <QuickPhraseSelector favourites={favourites} onSendPhrase={sendPhrase} status={status} />

      <ConfirmDialog
        open={confirmClear}
        title="Clear this conversation?"
        description="All messages in this conversation will be removed from this browser. This cannot be undone."
        confirmLabel="Clear conversation"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          conversationActions.clear(conversation.id);
          setConfirmClear(false);
        }}
      />
    </div>
  );
}

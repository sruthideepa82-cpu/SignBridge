import { Copy, MessageSquare, MessageSquarePlus, MessagesSquare, Sparkles, Trash2, Type } from 'lucide-react';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../components/app/ConfirmDialog.jsx';
import ActionMenu from '../components/app/ActionMenu.jsx';
import { buttonClass } from '../components/app/ui.jsx';
import BackendStatusIndicator from '../components/common/BackendStatusIndicator.jsx';
import ConversationPanel from '../components/studio/ConversationPanel.jsx';
import PhrasePanel from '../components/studio/PhrasePanel.jsx';
import QuickPhraseSelector from '../components/studio/QuickPhraseSelector.jsx';
import RecognitionCard from '../components/studio/RecognitionCard.jsx';
import SignDraft from '../components/studio/SignDraft.jsx';
import SignSentencePanel from '../components/studio/SignSentencePanel.jsx';
import '../styles/liveStudio.css';
import { appendPhraseToDraft } from '../lib/phraseStabilizer.js';
import { initialEditor, newlyCommitted, sentenceEditorReducer } from '../lib/sentenceEditor.js';
import {
  RECOGNITION_MODE_LABELS,
  RECOGNITION_MODES,
  loadRecognitionMode,
  saveRecognitionMode,
} from '../lib/recognitionMode.js';
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

export default function LiveStudioPage() {
  const navigate = useNavigate();
  const backend = useBackendHealth();
  const camera = useCamera();
  const cameraLive = camera.status === CAMERA_STATUS.LIVE;
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState(loadRecognitionMode);
  const phraseMode = mode === RECOGNITION_MODES.PHRASES;
  const recognitionOn = cameraLive && !paused;
  const { landmarks, error: landmarkError } = useHandLandmarks(recognitionOn);
  const { face, error: faceError } = useFaceExpression(recognitionOn);
  const { result: rawRecognition, error: recognitionError, receivedAt } = useRecognition(recognitionOn && !phraseMode);
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

  // The editable sentence. Every input (recognition, typing, phrases, undo, clear) changes this one state.
  const [sentence, dispatchSentence] = useReducer(sentenceEditorReducer, undefined, initialEditor);
  const draft = sentence.text;
  const committedSeen = useRef(0);
  const [largeText, setLargeText] = useState(false);
  const [showFaceMesh, setShowFaceMesh] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!cameraLive) setPaused(false);
  }, [cameraLive]);

  // Each letter or space the recogniser commits is appended to the sentence once. The buffer already ignores repeated
  // frames, so a held sign adds one letter. Removing an item from the detected sequence leaves the sentence alone.
  useEffect(() => {
    const items = signBuffer.items;
    if (items.length < committedSeen.current) {
      committedSeen.current = items.length;
      return;
    }
    const fresh = newlyCommitted(committedSeen.current, items);
    committedSeen.current = items.length;
    if (fresh.length > 0) dispatchSentence({ type: 'recognised', items: fresh });
  }, [signBuffer.items]);

  const chooseMode = (next) => {
    setMode(saveRecognitionMode(next));
  };

  const addPhraseToDraft = (phrase) => {
    dispatchSentence({ type: 'insert', text: appendPhraseToDraft(draft, phrase) });
  };

  const messageCount = conversation?.messages.length ?? 0;
  const savedCount = conversation?.messages.filter((message) => message.saved).length ?? 0;

  const sendDraft = () => {
    const text = draft.trim();
    if (!text) return;
    const experimental = signBuffer.items.some((item) => item.experimental);
    conversationActions.append({ text, speaker: 'deaf', source: 'sign', experimental });
    signBuffer.clear();
    dispatchSentence({ type: 'clear' });
    setStatus('Sent recognised text to the conversation.');
  };

  const discardDraft = () => {
    signBuffer.clear();
    dispatchSentence({ type: 'clear' });
  };

  const addSpace = () => {
    dispatchSentence({ type: 'space' });
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
    dispatchSentence({ type: 'clear' });
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
    <div className="live-studio min-h-full">
    <div className="flex w-full min-w-0 flex-col gap-6 px-5 pb-7 pt-5 sm:px-7">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-[40px] font-bold leading-tight tracking-tight text-app-text">
              Live <span className="text-accent">Studio</span>
              <Sparkles size={18} className="text-[var(--ls-pink)]" aria-hidden="true" />
            </h1>
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
          <div role="group" aria-label="Recognition mode" className="ls-segmented">
            {Object.values(RECOGNITION_MODES).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => chooseMode(value)}
                className="ls-segment"
              >
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold"
                >
                  {value === RECOGNITION_MODES.PHRASES ? <MessageSquare size={14} /> : 'A'}
                </span>
                {RECOGNITION_MODE_LABELS[value]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      <div className="grid min-w-0 grid-cols-1 items-stretch gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,0.95fr)]">
        <div className="flex min-w-0 flex-col gap-5">
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

          <SignDraft
            draft={draft}
            onDraftChange={(text) => dispatchSentence({ type: 'type', text, now: Date.now() })}
            items={signBuffer.items}
            holding={signBuffer.holding}
            canUndo={sentence.history.length > 0}
            onUndo={() => dispatchSentence({ type: 'undo' })}
            onAddSpace={addSpace}
            onDelete={() => dispatchSentence({ type: 'delete' })}
            onDiscard={discardDraft}
            onSend={sendDraft}
            controls={draftControls}
            showItems={false}
          />

          <QuickPhraseSelector favourites={favourites} onSendPhrase={sendPhrase} status={status} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-5">
          <RecognitionCard
            recognition={recognition}
            recognitionError={recognitionError}
            cameraLive={cameraLive}
            paused={paused}
            phraseMode={phraseMode}
            items={signBuffer.items}
            experimental={draftControls.experimental}
            onRemoveAt={draftControls.onRemoveAt}
          />

          <ConversationPanel
            conversation={conversation}
            largeText={largeText}
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
          />
        </div>
      </div>

      <div className="min-w-0">
        {phraseMode ? (
          <PhrasePanel cameraLive={cameraLive} paused={paused} onConfirm={addPhraseToDraft} />
        ) : (
          <SignSentencePanel cameraLive={cameraLive} paused={paused} />
        )}
      </div>

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
    </div>
  );
}

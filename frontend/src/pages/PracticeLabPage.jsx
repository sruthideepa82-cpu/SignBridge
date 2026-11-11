import { ExternalLink, History, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from '../components/app/ConfirmDialog.jsx';
import { AppPageHeader, EmptyState, Panel, StatusDot, buttonClass } from '../components/app/ui.jsx';
import CameraControls from '../components/camera/CameraControls.jsx';
import CameraPreview from '../components/camera/CameraPreview.jsx';
import { VOCABULARY, VOCABULARY_SOURCE } from '../data/datasetStatus.js';
import useCamera, { CAMERA_STATUS } from '../hooks/useCamera.js';
import usePracticeProgress from '../hooks/usePracticeProgress.js';
import useRecognition from '../hooks/useRecognition.js';
import { appendHistory, clearHistory, loadHistory } from '../lib/practiceHistory.js';

const pct = (value) => `${Math.round(value * 100)}%`;

// Feedback comes only from the recogniser's real answer. With no model or no camera, none is given.
export function feedbackFor(target, cameraLive, result, error) {
  if (!cameraLive) return { tone: 'neutral', text: 'Start the camera to get feedback on your handshape.' };
  if (error) return { tone: 'error', text: `Recognition is unavailable: ${error}` };
  if (!result) return { tone: 'neutral', text: 'Waiting for the first result from the recogniser.' };
  switch (result.status) {
    case 'no_model':
      return { tone: 'warning', text: 'No recognition model is loaded, so no feedback is given. You can still practise and mark letters yourself.' };
    case 'no_hand':
      return { tone: 'neutral', text: 'Show one hand to the camera.' };
    case 'two_hands':
      return { tone: 'warning', text: 'Show one hand at a time.' };
    case 'uncertain':
      return { tone: 'warning', text: `Not recognised with enough confidence${result.confidence == null ? '' : ` (${pct(result.confidence)})`}.` };
    case 'recognized':
      if (result.label === target) {
        return {
          tone: 'ok',
          text: `Recognised as ${result.label} (${pct(result.confidence)}). This is one frame from a pilot model, not a checked result.`,
        };
      }
      return { tone: 'warning', text: `Recognised as ${result.label}, not ${target}.` };
    default:
      return { tone: 'neutral', text: '' };
  }
}

const TONE = {
  ok: 'text-success',
  warning: 'text-amber-200',
  error: 'text-red-200',
  neutral: 'text-app-muted',
};

export default function PracticeLabPage() {
  const camera = useCamera();
  const cameraLive = camera.status === CAMERA_STATUS.LIVE;
  const { result, error } = useRecognition(cameraLive);
  const { practised, toggle } = usePracticeProgress();
  const [target, setTarget] = useState(VOCABULARY[0]?.label ?? null);
  const [history, setHistory] = useState(() => loadHistory());
  const [confirmClear, setConfirmClear] = useState(false);
  const matchedRef = useRef(false);

  const targetEntry = VOCABULARY.find((entry) => entry.label === target) ?? null;
  const feedback = useMemo(() => feedbackFor(target, cameraLive, result, error), [target, cameraLive, result, error]);

  // Record a "matched" event once per match, not on every frame.
  useEffect(() => {
    const matched = cameraLive && result?.status === 'recognized' && result.label === target;
    if (matched && !matchedRef.current) {
      setHistory(appendHistory({ letter: target, kind: 'matched', at: Date.now() }));
    }
    matchedRef.current = matched;
  }, [cameraLive, result, target]);

  const markPractised = () => {
    if (!target) return;
    const wasMarked = practised.includes(target);
    toggle(target);
    if (!wasMarked) setHistory(appendHistory({ letter: target, kind: 'marked', at: Date.now() }));
  };

  const recent = history.slice(-10).reverse();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <AppPageHeader
        eyebrow="Learn"
        title="Practice Lab"
        description="Choose a letter, copy the handshape from the official chart, and practise with the camera. Feedback appears only when a recognition model is loaded."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-3">
          <Panel title="Camera" description="The camera runs on this device. The backend captures the frames.">
            <CameraPreview
              status={camera.status}
              streamUrl={camera.streamUrl}
              errorMessage={camera.errorMessage}
              onStreamError={camera.handleStreamError}
            />
            <div className="mt-4">
              <CameraControls status={camera.status} onStart={camera.startCamera} onStop={camera.stopCamera} />
            </div>
          </Panel>

          <Panel title="Feedback" labelledBy="practice-feedback-title">
            <p className={`text-sm leading-relaxed ${TONE[feedback.tone]}`} aria-live="polite">
              {feedback.text}
            </p>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Panel title="Letter to practise" labelledBy="practice-letter-title">
            <div role="group" aria-label="Letters" className="grid grid-cols-6 gap-2 lg:grid-cols-3">
              {VOCABULARY.map((entry) => {
                const selected = entry.label === target;
                return (
                  <button
                    key={entry.label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setTarget(entry.label)}
                    className={`flex h-11 items-center justify-center rounded-lg border text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                      selected ? 'border-accent/50 bg-accent/10 text-accent' : 'border-app-border text-app-muted hover:text-app-text'
                    }`}
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>

            {targetEntry && (
              <div className="mt-4 space-y-3 text-xs text-app-muted">
                <p>
                  <span className="text-app-text">{targetEntry.meaning}.</span> One hand. Check the handshape on the chart before you start.
                </p>
                <p className="flex items-center gap-1.5">
                  <StatusDot tone="warn" />
                  Checked against the chart. Not yet confirmed by a signer.
                </p>
                <a href={VOCABULARY_SOURCE.url} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'w-full')}>
                  Open the ISLRTC chart
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
                <button type="button" onClick={markPractised} className={buttonClass(practised.includes(target) ? 'secondary' : 'primary', 'w-full')}>
                  {practised.includes(target) ? 'Unmark as practised' : `Mark ${target} as practised`}
                </button>
              </div>
            )}
          </Panel>

          <Panel
            title="Practice history"
            description="Saved in this browser. “Matched” means the recogniser returned the letter."
            labelledBy="practice-history-title"
            actions={
              history.length > 0 ? (
                <button type="button" onClick={() => setConfirmClear(true)} className={buttonClass('ghost', 'px-2 py-1 text-xs')}>
                  <Trash2 size={13} aria-hidden="true" />
                  Clear
                </button>
              ) : null
            }
          >
            {recent.length === 0 ? (
              <EmptyState icon={History} title="No practice yet">
                Marked letters and matches from the camera appear here.
              </EmptyState>
            ) : (
              <ol className="divide-y divide-app-border">
                {recent.map((event) => (
                  <li key={`${event.at}-${event.letter}-${event.kind}`} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-app-text">
                      {event.letter}
                      <span className="ml-2 text-xs text-app-muted">{event.kind === 'matched' ? 'Matched by recogniser' : 'Marked by you'}</span>
                    </span>
                    <time className="text-xs tabular-nums text-app-muted" dateTime={new Date(event.at).toISOString()}>
                      {new Date(event.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear practice history?"
        description="The saved list of matches and marked letters in this browser will be removed. Your marked letters on the lessons page are kept."
        confirmLabel="Clear history"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearHistory();
          setHistory([]);
          setConfirmClear(false);
        }}
      />
    </div>
  );
}

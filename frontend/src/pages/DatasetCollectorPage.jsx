import { CircleAlert, Download, Lock, Save, Square, Trash2, Video } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import CameraControls from '../components/camera/CameraControls.jsx';
import CameraPreview from '../components/camera/CameraPreview.jsx';
import { AppPageHeader, buttonClass, Panel, StatusDot } from '../components/app/ui.jsx';
import useCamera, { CAMERA_STATUS } from '../hooks/useCamera.js';
import useLandmarkRecorder from '../hooks/useLandmarkRecorder.js';
import {
  LABELS,
  MAX_RECORDING_MS,
  MIN_RECORDING_MS,
  UNKNOWN_LABEL,
  buildClipPayload,
  handShares,
  newSessionId,
  saveBlockers,
} from '../lib/datasetRecording.js';
import { datasetExportUrl, getDatasetStatus, saveDatasetClip } from '../services/datasetService.js';

const DEFAULT_MIN_FRAMES = 10;

function useDatasetStatus() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    getDatasetStatus()
      .then((data) => {
        setStatus(data);
        setError('');
      })
      .catch((requestError) => {
        setStatus(null);
        setError(requestError.message);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, error, refresh };
}

function formatPercent(share) {
  return `${Math.round(share * 100)}%`;
}

export default function DatasetCollectorPage() {
  const { status, error: statusError, refresh } = useDatasetStatus();
  const camera = useCamera();
  const cameraLive = camera.status === CAMERA_STATUS.LIVE;
  const recorder = useLandmarkRecorder({ enabled: cameraLive });
  const [label, setLabel] = useState(LABELS[0]);
  const [participant, setParticipant] = useState('P001');
  const [consentRef, setConsentRef] = useState('');
  const [session, setSession] = useState(() => newSessionId());
  const [review, setReview] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const participantId = useId();
  const consentId = useId();
  const sessionId = useId();

  const verifiedLabels = status?.verified_labels ?? {};
  const minFrames = status?.min_frames ?? DEFAULT_MIN_FRAMES;
  const counts = status?.counts ?? {};
  const apiBlocker = status ? [] : ['The developer API is not reachable. Start the backend with SIGNBRIDGE_DEVELOPER_TOOLS_ENABLED=true.'];

  const setupReasons = useMemo(
    () => [
      ...apiBlocker,
      ...(cameraLive ? [] : ['Start the camera before recording.']),
      ...saveBlockers({
        label,
        verifiedLabels,
        participant,
        consentRef,
        session,
        frames: [],
        minFrames: 0,
        durationMs: MIN_RECORDING_MS,
      }),
    ],
    [apiBlocker, cameraLive, label, verifiedLabels, participant, consentRef, session],
  );

  const reviewReasons = review
    ? [
        ...apiBlocker,
        ...saveBlockers({
          label,
          verifiedLabels,
          participant,
          consentRef,
          session,
          frames: review.frames,
          minFrames,
          durationMs: review.durationMs,
        }),
      ]
    : [];

  const stopRecording = useCallback(() => {
    const { frames, durationMs } = recorder.stop();
    setReview({ frames, durationMs });
    setMessage('');
  }, [recorder]);

  // Recording ends by itself at the time limit, or when the camera stops, so a clip is never left open.
  useEffect(() => {
    if (!recorder.recording) return;
    if (recorder.elapsedMs >= MAX_RECORDING_MS || !cameraLive) stopRecording();
  }, [recorder.recording, recorder.elapsedMs, cameraLive, stopRecording]);

  const startRecording = () => {
    setReview(null);
    setMessage('');
    recorder.start();
  };

  const discard = () => {
    setReview(null);
    recorder.discard();
    setMessage('Clip discarded. Nothing was saved.');
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = buildClipPayload({ label, participant, consentRef, session, frames: review.frames });
      const saved = await saveDatasetClip(payload);
      setMessage(`Saved ${saved.clip_id}: ${saved.frame_count} frames, ${saved.frames_with_hands} with hands.`);
      setReview(null);
      recorder.discard();
      refresh();
    } catch (requestError) {
      setMessage(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const shares = review ? handShares(review.frames) : null;
  const liveLabel = recorder.recording ? `Recording: ${Math.round(recorder.elapsedMs / 100) / 10} s, ${recorder.frameCount} frames` : '';

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <AppPageHeader
        eyebrow="Developer"
        title="Dataset Collector"
        description="Record labelled landmark clips from several sessions and signers. Developer use only. Clips stay on this machine and are not part of the public application."
      />

      {statusError && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          {statusError}
        </p>
      )}

      {(setupReasons.length > 0 || reviewReasons.length > 0) && (
        <div role="status" className="flex gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
          <Lock size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="font-medium text-app-text">
              {review ? 'This clip cannot be saved yet' : 'Recording is locked'}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-app-muted">
              {(review ? reviewReasons : setupReasons).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Label" description="Pick the letter the signer is making, or UNKNOWN when the frames show no valid sign." labelledBy="label-title">
            <div role="group" aria-label="Label" className="grid grid-cols-6 gap-2 sm:grid-cols-9">
              {LABELS.map((item) => {
                const verified = item === UNKNOWN_LABEL || item in verifiedLabels;
                const count = counts[item]?.clips ?? 0;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={item === label}
                    aria-label={`${item}, ${count} clips, ${verified ? 'verified' : 'not verified'}`}
                    onClick={() => setLabel(item)}
                    className={`flex h-12 flex-col items-center justify-center rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                      item === label ? 'border-accent/60 bg-accent/15 text-app-text' : 'border-app-border text-app-muted hover:text-app-text'
                    }`}
                  >
                    <span>{item.length > 2 ? 'UNK' : item}</span>
                    <span className="text-[10px] font-normal tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-app-muted">
              <StatusDot tone={label === UNKNOWN_LABEL || label in verifiedLabels ? 'ok' : 'warn'} />
              {label === UNKNOWN_LABEL
                ? 'UNKNOWN: frames with no valid sign.'
                : label in verifiedLabels
                  ? `${label} is verified (${verifiedLabels[label]} hand${verifiedLabels[label] === 1 ? '' : 's'}).`
                  : `${label} is not verified. It cannot be recorded until a qualified signer confirms it.`}
            </p>
          </Panel>

          <Panel title="Session" description="Use a new session for each sitting: change the lighting, distance or background between sessions." labelledBy="session-title">
            <div className="grid gap-4 sm:grid-cols-3">
              <label htmlFor={participantId} className="flex flex-col gap-1.5 text-xs text-app-muted">
                Participant ID
                <input
                  id={participantId}
                  value={participant}
                  onChange={(event) => setParticipant(event.target.value.trim())}
                  className="h-9 rounded-lg border border-app-border bg-app-bg px-3 text-sm text-app-text"
                />
              </label>
              <label htmlFor={consentId} className="flex flex-col gap-1.5 text-xs text-app-muted">
                Consent reference
                <input
                  id={consentId}
                  value={consentRef}
                  onChange={(event) => setConsentRef(event.target.value.trim())}
                  placeholder="C-2026-001"
                  className="h-9 rounded-lg border border-app-border bg-app-bg px-3 text-sm text-app-text"
                />
              </label>
              <label htmlFor={sessionId} className="flex flex-col gap-1.5 text-xs text-app-muted">
                Session ID
                <input
                  id={sessionId}
                  value={session}
                  onChange={(event) => setSession(event.target.value.trim())}
                  className="h-9 rounded-lg border border-app-border bg-app-bg px-3 text-sm text-app-text"
                />
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => setSession(newSessionId())} className={buttonClass('ghost', 'h-8 px-3 text-xs')}>
                New session
              </button>
            </div>
          </Panel>

          <Panel title="Recording" description={`Hold the sign for ${MIN_RECORDING_MS / 1000} to ${MAX_RECORDING_MS / 1000} seconds. Each clip is a sequence of frames, not a single picture.`} labelledBy="recording-title">
            <CameraPreview status={camera.status} streamUrl={camera.streamUrl} errorMessage={camera.errorMessage} onStreamError={camera.handleStreamError} />
            <div className="mt-4">
              <CameraControls status={camera.status} onStart={camera.startCamera} onStop={camera.stopCamera} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {recorder.recording ? (
                <button type="button" onClick={stopRecording} className={buttonClass('danger')}>
                  <Square size={14} aria-hidden="true" />
                  Stop Recording
                </button>
              ) : (
                <button type="button" onClick={startRecording} disabled={setupReasons.length > 0 || review !== null} className={buttonClass('primary')}>
                  <Video size={15} aria-hidden="true" />
                  Start Recording
                </button>
              )}
              <p className="text-xs tabular-nums text-app-muted" aria-live="polite">
                {liveLabel}
              </p>
            </div>

            {review && shares && (
              <div className="mt-5 rounded-lg border border-app-border bg-app-bg p-4">
                <p className="text-sm font-medium text-app-text">
                  Clip review: {shares.frames} frames over {(review.durationMs / 1000).toFixed(1)} s
                </p>
                <p className="mt-1 text-xs text-app-muted">
                  Left hand in {formatPercent(shares.left)} of frames. Right hand in {formatPercent(shares.right)}. Hands seen in{' '}
                  {formatPercent(shares.frames ? shares.withHands / shares.frames : 0)}.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={save} disabled={reviewReasons.length > 0 || saving} className={buttonClass('primary')}>
                    <Save size={15} aria-hidden="true" />
                    {saving ? 'Saving…' : `Save clip as ${label}`}
                  </button>
                  <button type="button" onClick={discard} className={buttonClass('secondary')}>
                    <Trash2 size={15} aria-hidden="true" />
                    Discard
                  </button>
                </div>
              </div>
            )}

            {message && (
              <p role="status" className="mt-4 flex items-start gap-2 text-xs text-app-muted">
                <CircleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                {message}
              </p>
            )}
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel title="Samples per class" description="Saved clips on this machine." labelledBy="counts-title">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Clips saved for each label</caption>
              <thead className="text-app-muted">
                <tr>
                  <th scope="col" className="py-1.5 font-medium">Label</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Clips</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Frames</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Signers</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-app-text">
                {LABELS.map((item) => (
                  <tr key={item} className="border-t border-app-border">
                    <th scope="row" className="py-1.5 font-semibold">{item}</th>
                    <td className="py-1.5 text-right">{counts[item]?.clips ?? 0}</td>
                    <td className="py-1.5 text-right">{counts[item]?.frames ?? 0}</td>
                    <td className="py-1.5 text-right">{counts[item]?.participants ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-app-muted">
              Total clips: {status?.total_clips ?? 0}. Verified classes: {Object.keys(verifiedLabels).length}.
            </p>
          </Panel>

          <Panel title="Export" description="Landmark files only. No video or images." labelledBy="export-title">
            <div className="flex flex-wrap gap-2">
              <a href={datasetExportUrl('csv')} className={buttonClass('secondary')} download>
                <Download size={15} aria-hidden="true" />
                CSV (one row per frame)
              </a>
              <a href={datasetExportUrl('json')} className={buttonClass('secondary')} download>
                <Download size={15} aria-hidden="true" />
                JSON (clips and frames)
              </a>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

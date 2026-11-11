import { AlertTriangle, Info } from 'lucide-react';
import { describeRecognition } from '../../lib/recognitionStatus.js';
import { describeFace, ESTIMATE_NOTE, strengthText } from '../../lib/faceStatus.js';
import FaceDiagnostics from './FaceDiagnostics.jsx';
import { summariseBlendshapes } from '../../lib/faceBlendshapes.js';
import {
  describeCamera,
  describeConfidence,
  describeGesture,
  describeHandTracking,
  guidanceFor,
} from '../../lib/liveGuidance.js';

const TONE_TEXT = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-accent-hover',
  neutral: 'text-app-text',
};

function Row({ label, value, tone = 'neutral', detail }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-app-muted">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className={`text-sm font-medium ${TONE_TEXT[tone]}`}>{value}</span>
        {detail && <span className="block text-xs text-app-muted">{detail}</span>}
      </dd>
    </div>
  );
}

// What the recognizer and the hand tracker are doing right now. Every value comes from the backend.
export default function RecognitionStatus({
  camera,
  cameraLive,
  paused,
  landmarks,
  landmarkError,
  recognition,
  recognitionError,
  holding,
  face,
  faceError,
}) {
  const faceView = describeFace({
    face,
    error: faceError,
    cameraLive,
    paused,
    cameraStatus: camera.status,
    cameraError: camera.errorMessage,
  });
  const blendshapeRows = summariseBlendshapes(faceView.blendshapes);
  const cameraView = describeCamera(camera.status);
  const tracking = describeHandTracking({ landmarks, landmarkError, cameraLive, paused });
  const gesture = describeGesture({ recognition, recognitionError, cameraLive, paused });
  const confidence = describeConfidence(recognition, paused);
  const guidance = guidanceFor({ cameraLive, paused, landmarks, landmarkError, recognition, recognitionError });
  const current = describeRecognition(recognition, recognitionError, cameraLive);
  const currentSign = !paused && recognition?.status === 'recognized' ? recognition.label : null;

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="current-gesture-title" className="rounded-xl border border-app-border bg-app-raised p-4">
        <h3 id="current-gesture-title" className="text-xs font-medium uppercase tracking-wide text-app-muted">
          Current gesture
        </h3>
        {currentSign ? (
          <p className="mt-2 text-2xl font-semibold tracking-wide text-accent-hover" data-testid="current-gesture">
            {currentSign}
          </p>
        ) : (
          <p className="mt-2 text-base font-medium text-app-text" data-testid="current-gesture">
            {paused ? 'Recognition paused' : 'No sign recognised'}
          </p>
        )}
        <p className="mt-1 text-xs leading-relaxed text-app-muted">{paused ? 'Resume recognition to continue.' : current.text}</p>
        {holding && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-app-muted">
              <span>Holding {holding.label}</span>
              <span className="tabular-nums">
                {holding.count}/{holding.of}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
              <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.min(100, (holding.count / holding.of) * 100)}%` }} />
            </div>
          </div>
        )}
      </section>

      <dl className="divide-y divide-app-border">
        <Row label="Camera" value={cameraView.label} tone={cameraView.tone} />
        <Row label="Hand tracking" value={tracking.label} tone={tracking.tone} />
        <Row label="Gesture detection" value={gesture.label} tone={gesture.tone} />
        <Row
          label="Confidence"
          value={confidence.value}
          tone={confidence.lowConfidence ? 'warning' : 'neutral'}
          detail={confidence.threshold ? `Threshold ${confidence.threshold}` : undefined}
        />
      </dl>

      <section aria-labelledby="facial-expression-title" className="space-y-2">
        <h3 id="facial-expression-title" className="text-xs font-medium uppercase tracking-wide text-app-muted">
          Facial expression
        </h3>
        <dl className="divide-y divide-app-border">
          <Row label="Face tracking" value={faceView.label} tone={faceView.tone} />
          <Row label="Faces in frame" value={String(faceView.faceCount)} />
          <Row
            label="Landmarks"
            value={faceView.landmarkCount ? `${faceView.landmarkCount} tracked` : '—'}
          />
          <Row
            label="Predicted expression"
            value={faceView.expression ?? '—'}
            tone={faceView.expression === 'Uncertain' ? 'warning' : faceView.expression ? 'info' : 'neutral'}
            detail={faceView.expression ? ESTIMATE_NOTE : undefined}
          />
          {faceView.expression && <Row label="Strength" value={strengthText(faceView.strength) ?? '—'} />}
        </dl>
        {blendshapeRows.length > 0 && (
          <div className="space-y-1.5 pt-1" aria-label="Facial movements from the model">
            <p className="text-xs text-app-muted">Facial movements (model scores)</p>
            <ul className="space-y-1.5">
              {blendshapeRows.map((row) => (
                <li key={row.key} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-xs">
                  <span className="truncate text-app-muted">{row.label}</span>
                  <span className="h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                    <span className="block h-full bg-accent" style={{ width: `${Math.round(row.value * 100)}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-app-text">{row.value.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {faceView.message && (
          <p role="status" className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-app-muted">
            {faceView.message}
          </p>
        )}
        <FaceDiagnostics face={face} error={faceError} faceView={faceView} />
      </section>

      {confidence.lowConfidence && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Low confidence. No sign was shown for this frame. Check the sign before you send anything.
        </p>
      )}

      {guidance && (
        <p className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5 text-xs leading-relaxed text-app-muted">
          <Info size={14} className="mt-0.5 shrink-0 text-accent-hover" aria-hidden="true" />
          <span>{guidance}</span>
        </p>
      )}
    </div>
  );
}

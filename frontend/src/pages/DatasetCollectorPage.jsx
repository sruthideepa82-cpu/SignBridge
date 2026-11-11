import { CircleAlert, Database, Lock, Trash2, Video } from 'lucide-react';
import { useId, useState } from 'react';
import { AppPageHeader, buttonClass, Panel } from '../components/app/ui.jsx';
import { CONSENT_STATUS, FINGERSPELLING_CLASSES, VERIFIED_CLASS_COUNT } from '../data/fingerspelling.js';

// Recording and training stay disabled until both gates pass. The gates come from the same vocabulary file the
// recording tool reads, so the UI and the command-line tools cannot disagree.
const CONSENT_GRANTED = 'granted';
const TOTAL_CLASSES = FINGERSPELLING_CLASSES.length;

function gateReasons() {
  const reasons = [];
  if (VERIFIED_CLASS_COUNT === 0) {
    reasons.push('No class is verified. A qualified ISL signer must confirm each handshape against the ISLRTC reference.');
  }
  if (CONSENT_STATUS !== CONSENT_GRANTED) {
    reasons.push('Participant consent has not been recorded. Each signer must sign the consent form before any recording.');
  }
  return reasons;
}

const STATUS_LABEL = { unverified: 'Unverified' };
const TRAINING_LABEL = {
  blocked_unverified: 'Blocked: unverified',
  excluded_temporal: 'Excluded: temporal, later phase',
  not_started: 'Not started',
};

function StatTile({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-app-border bg-app-bg px-4 py-3">
      <p className="text-xs text-app-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-app-text">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-app-muted">{hint}</p>}
    </div>
  );
}

export default function DatasetCollectorPage() {
  const [selected, setSelected] = useState(FINGERSPELLING_CLASSES[0].label);
  const gateId = useId();
  const signerId = useId();
  const hand = useId();
  const lighting = useId();
  const distance = useId();
  const notes = useId();
  const reasons = gateReasons();
  const canRecord = reasons.length === 0;
  const current = FINGERSPELLING_CLASSES.find((item) => item.label === selected);
  const completion = Math.round((VERIFIED_CLASS_COUNT / TOTAL_CLASSES) * 100);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <AppPageHeader
        eyebrow="Contribute"
        title="Dataset Collector"
        description="Prepare labelled hand samples for the fingerspelling classifier. Recording is locked until the handshapes are verified and participants consent."
      />

      <div id={gateId} role="status" className="flex gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
        <Lock size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="font-medium text-app-text">Recording and training are disabled</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-app-muted">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {canRecord && <p className="mt-2 text-xs text-app-muted">Both gates have passed.</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Candidate classes" value={TOTAL_CLASSES} hint="A to Z. J and Z are temporal." />
        <StatTile label="Verified classes" value={VERIFIED_CLASS_COUNT} hint="Signer-confirmed handshapes" />
        <StatTile label="Samples recorded" value={0} hint="No recording sessions yet" />
        <StatTile label="Dataset completion" value={`${completion}%`} hint={`${VERIFIED_CLASS_COUNT} of ${TOTAL_CLASSES} classes`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Alphabet" description="Choose the letter to prepare. Every candidate is unverified and cannot be recorded.">
            <div role="group" aria-label="Alphabet selector" className="grid grid-cols-6 gap-2 sm:grid-cols-9">
              {FINGERSPELLING_CLASSES.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  aria-pressed={item.label === selected}
                  aria-label={`${item.label}, ${item.recognition_type}, unverified`}
                  onClick={() => setSelected(item.label)}
                  className={`flex h-11 flex-col items-center justify-center rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                    item.label === selected ? 'border-accent/60 bg-accent/15 text-app-text' : 'border-app-border text-app-muted hover:text-app-text'
                  }`}
                >
                  {item.label}
                  {item.recognition_type === 'temporal' && <span className="text-[9px] font-normal text-app-muted">moving</span>}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title={`Letter ${current.label}`} description={current.meaning} labelledBy="selected-class-title">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-app-muted">Class ID</dt>
                <dd className="font-mono text-app-text">{current.class_id}</dd>
              </div>
              <div>
                <dt className="text-xs text-app-muted">Recognition type</dt>
                <dd className="text-app-text">{current.recognition_type === 'temporal' ? 'Temporal (moving sign)' : 'Static (single posture)'}</dd>
              </div>
              <div>
                <dt className="text-xs text-app-muted">Verification</dt>
                <dd className="text-warning">{STATUS_LABEL[current.verification_status] ?? current.verification_status}</dd>
              </div>
              <div>
                <dt className="text-xs text-app-muted">Training status</dt>
                <dd className="text-app-text">{TRAINING_LABEL[current.training_status] ?? current.training_status}</dd>
              </div>
              <div>
                <dt className="text-xs text-app-muted">Source</dt>
                <dd className="text-app-text">{current.source}</dd>
              </div>
              <div>
                <dt className="text-xs text-app-muted">Samples for this letter</dt>
                <dd className="tabular-nums text-app-text">0</dd>
              </div>
            </dl>
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-app-muted">
              <CircleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
              {current.reference}. The source is provisional until a qualified ISL signer checks the handshape.
            </p>
          </Panel>

          <Panel title="Recording" description="Recording needs a verified class, a signer ID and consent. Sessions are saved as landmark files, not video." labelledBy="recording-title">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled aria-describedby={gateId} className={buttonClass('primary')}>
                <Video size={15} aria-hidden="true" />
                Record
              </button>
              <p className="text-xs text-app-muted">Countdown: not started · Progress: 0 of 0 samples</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} aria-label="Recording progress">
              <div className="h-full w-0 bg-accent" />
            </div>
            <div className="mt-5 rounded-lg border border-dashed border-app-border px-4 py-8 text-center">
              <p className="text-sm font-medium text-app-text">No recordings for {current.label}</p>
              <p className="mt-1 text-xs text-app-muted">Recorded clips and their landmark previews will appear here after a verified recording.</p>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" disabled aria-describedby={gateId} className={buttonClass('danger')}>
                <Trash2 size={15} aria-hidden="true" />
                Delete selected recording
              </button>
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Signer" description="Signers are identified by pseudonym only. Never enter a name." labelledBy="signer-title">
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor={signerId} className="text-xs font-medium text-app-muted">
                  Signer ID
                </label>
                <input
                  id={signerId}
                  disabled
                  placeholder="P001"
                  pattern="P[0-9]{3}"
                  className="mt-1.5 h-9 w-full rounded-lg border border-app-border bg-app-bg px-3 text-sm text-app-text disabled:opacity-50"
                />
              </div>
              <div>
                <label htmlFor={hand} className="text-xs font-medium text-app-muted">
                  Hand used
                </label>
                <select id={hand} disabled className="mt-1.5 h-9 w-full rounded-lg border border-app-border bg-app-bg px-3 text-sm text-app-text disabled:opacity-50">
                  <option>Right</option>
                  <option>Left</option>
                  <option>Both</option>
                </select>
              </div>
            </div>
          </Panel>

          <Panel title="Recording metadata" description="Saved with each session." labelledBy="metadata-title">
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor={lighting} className="text-xs font-medium text-app-muted">
                  Lighting
                </label>
                <select id={lighting} disabled className="mt-1.5 h-9 w-full rounded-lg border border-app-border bg-app-bg px-3 text-sm text-app-text disabled:opacity-50">
                  <option>Daylight</option>
                  <option>Indoor lamp</option>
                  <option>Low light</option>
                </select>
              </div>
              <div>
                <label htmlFor={distance} className="text-xs font-medium text-app-muted">
                  Camera distance (cm, approximate)
                </label>
                <input id={distance} type="number" disabled className="mt-1.5 h-9 w-full rounded-lg border border-app-border bg-app-bg px-3 text-sm text-app-text disabled:opacity-50" />
              </div>
              <div>
                <label htmlFor={notes} className="text-xs font-medium text-app-muted">
                  Notes
                </label>
                <textarea id={notes} rows={2} disabled className="mt-1.5 w-full rounded-lg border border-app-border bg-app-bg p-3 text-sm text-app-text disabled:opacity-50" />
              </div>
            </div>
          </Panel>

          <Panel title="Where samples go" labelledBy="storage-title">
            <p className="text-xs leading-relaxed text-app-muted">
              Each session is written to <span className="font-mono text-app-text">ai-engine/dataset/raw/</span> as
              <span className="font-mono text-app-text"> LABEL__SIGNER__SESSION.jsonl</span>, with a
              <span className="font-mono text-app-text"> .session.json</span> manifest. Only hand landmarks are stored. No video, images or names.
            </p>
            <p className="mt-3 flex items-center gap-2 text-xs text-app-muted">
              <Database size={13} aria-hidden="true" />
              The ISL protocol describes fingerspelling as usually two-handed. The provisional chart shows one hand, so hand count is unconfirmed.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

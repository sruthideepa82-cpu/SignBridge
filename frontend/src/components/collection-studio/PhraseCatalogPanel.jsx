import { useState } from 'react';
import { ShieldCheck, Tags } from 'lucide-react';
import { AppPageHeader, buttonClass, EmptyState, Panel } from '../app/ui.jsx';
import { checkRecording, listPhrases } from '../../services/studioService.js';
import useStudioData from './useStudioData.js';

const INPUT = 'rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text focus-visible:outline-2 focus-visible:outline-accent';

export default function PhraseCatalogPanel() {
  const phrases = useStudioData(listPhrases);
  return (
    <div className="flex flex-col gap-6">
      <AppPageHeader
        eyebrow="Dataset Collection Studio"
        title="Phrase catalogue"
        description="Dynamic phrases with their verification status. A phrase is recordable only after a named reviewer verifies its label against an ISL reference."
      />
      <Panel title="Catalogue">
        {phrases.loading && <p className="text-sm text-app-muted" role="status">Loading…</p>}
        {phrases.error && <p className="text-sm text-danger" role="alert">{phrases.error}</p>}
        {phrases.data && phrases.data.length === 0 && (
          <EmptyState icon={Tags} title="No phrases in the catalogue">The catalogue file is missing or empty. Nothing can be recorded.</EmptyState>
        )}
        {phrases.data && phrases.data.length > 0 && (
          <ul className="flex flex-col divide-y divide-app-border text-sm">
            {phrases.data.map((p) => (
              <li key={p.phrase_id} className="flex flex-col gap-1 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-app-muted">{p.phrase_id}</span>
                  <span className="font-medium text-app-text">{p.label}</span>
                  <span className={p.recording_blocked ? 'text-xs text-warning' : 'text-xs text-success'}>
                    {p.recording_blocked ? 'Recording blocked' : 'Verified'}
                  </span>
                </div>
                {p.blocked_reason && <p className="text-xs text-app-muted">{p.blocked_reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <EligibilityCheck phrases={phrases.data ?? []} />
    </div>
  );
}

// Asks the server to evaluate every gate condition. It never creates a recording and never starts the camera.
export function EligibilityCheck({ phrases }) {
  const [form, setForm] = useState({ participant_code: '', consent_ref: '', phrase_id: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      setResult(await checkRecording({
        participant_code: form.participant_code || null,
        consent_ref: form.consent_ref || null,
        phrase_id: form.phrase_id || null,
      }));
    } catch (requestError) {
      setResult(null);
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Check whether a recording could be made" description="Every condition is checked on the server. This check records nothing.">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-app-muted">Participant code<input className={INPUT} value={form.participant_code} onChange={set('participant_code')} placeholder="P001" maxLength={16} /></label>
        <label className="flex flex-col gap-1 text-sm text-app-muted">Consent reference<input className={INPUT} value={form.consent_ref} onChange={set('consent_ref')} placeholder="C-2026-001" maxLength={32} /></label>
        <label className="flex flex-col gap-1 text-sm text-app-muted">Phrase
          <select className={INPUT} value={form.phrase_id} onChange={set('phrase_id')}>
            <option value="">Choose a phrase</option>
            {phrases.map((p) => <option key={p.phrase_id} value={p.phrase_id}>{p.label}</option>)}
          </select>
        </label>
        <div className="md:col-span-3"><button type="submit" className={buttonClass('secondary')} disabled={busy}>Check</button></div>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      {result && (
        <div className="mt-4 rounded-lg border border-app-border p-4" aria-live="polite">
          <p className={`text-sm font-semibold ${result.eligible ? 'text-success' : 'text-warning'}`}>
            {result.eligible ? 'All conditions pass in the gate. No recording was made.' : 'Recording is blocked.'}
          </p>
          {result.reasons.length > 0 && (
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-app-muted">
              {result.reasons.map((r) => <li key={r.code}>{r.message}</li>)}
            </ul>
          )}
          <p className="mt-3 flex items-center gap-2 text-xs text-app-muted"><ShieldCheck size={14} aria-hidden="true" />This check does not create a recording. The attempt is recorded in the audit log.</p>
        </div>
      )}
    </Panel>
  );
}

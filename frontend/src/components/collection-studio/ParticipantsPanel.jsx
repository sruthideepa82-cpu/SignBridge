import { useState } from 'react';
import { Users } from 'lucide-react';
import { AppPageHeader, buttonClass, EmptyState, Panel } from '../app/ui.jsx';
import {
  getParticipant,
  listParticipants,
  recordConsent,
  registerParticipant,
  withdrawConsent,
} from '../../services/studioService.js';
import useStudioData from './useStudioData.js';

const INPUT = 'rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text focus-visible:outline-2 focus-visible:outline-accent';
const PARTICIPANT_HINT = 'Pseudonym such as P001. Never enter a name.';
const CONSENT_HINT = 'Reference such as C-2026-001. Never put a name in it.';

export default function ParticipantsPanel() {
  const list = useStudioData(listParticipants);
  const [selected, setSelected] = useState(null);

  return (
    <div className="flex flex-col gap-6">
      <AppPageHeader
        eyebrow="Dataset Collection Studio"
        title="Participants"
        description="Pseudonymous participants and their consent history. No names, contact details or addresses are collected."
      />
      <RegisterForm onRegistered={(code) => { setSelected(code); list.reload(); }} />
      <Panel title="Registered participants">
        {list.loading && <p className="text-sm text-app-muted" role="status">Loading…</p>}
        {list.error && <p className="text-sm text-danger" role="alert">{list.error}</p>}
        {list.data && list.data.length === 0 && (
          <EmptyState icon={Users} title="No participants yet">
            Register a pseudonymous code above. A participant cannot record until consent is granted and recording is enabled by the project owner.
          </EmptyState>
        )}
        {list.data && list.data.length > 0 && (
          <ul className="flex flex-col gap-1">
            {list.data.map((p) => (
              <li key={p.participant_code}>
                <button
                  type="button"
                  onClick={() => setSelected(p.participant_code)}
                  aria-pressed={selected === p.participant_code}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    selected === p.participant_code ? 'bg-white/[0.08] text-app-text' : 'text-app-muted hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="font-medium">{p.participant_code}</span>
                  <span className="text-xs">Consent: {p.consent_status ?? 'none recorded'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {selected && <ParticipantDetail key={selected} code={selected} onChanged={list.reload} />}
    </div>
  );
}

function RegisterForm({ onRegistered }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState({ tone: '', text: '' });
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage({ tone: '', text: '' });
    try {
      const created = await registerParticipant(code.trim());
      setMessage({ tone: 'success', text: `Registered ${created.participant_code}.` });
      setCode('');
      onRegistered(created.participant_code);
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Register a participant" description={PARTICIPANT_HINT}>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-app-muted">
          Participant code
          <input className={`${INPUT} w-40`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="P001" maxLength={4} required />
        </label>
        <button type="submit" className={buttonClass('primary')} disabled={busy || !code.trim()}>
          Register
        </button>
      </form>
      {message.text && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm ${message.tone === 'error' ? 'text-danger' : 'text-success'}`}>
          {message.text}
        </p>
      )}
    </Panel>
  );
}

function ParticipantDetail({ code, onChanged }) {
  const detail = useStudioData(() => getParticipant(code), [code]);
  if (detail.loading) return <Panel title={code}><p className="text-sm text-app-muted" role="status">Loading…</p></Panel>;
  if (detail.error) return <Panel title={code}><p className="text-sm text-danger" role="alert">{detail.error}</p></Panel>;
  const latest = detail.data.consents[detail.data.consents.length - 1];
  return (
    <div className="flex flex-col gap-6">
      <Panel title={`${code} consent history`} description="Each record is append-only. Changes are new records, never edits.">
        {detail.data.consents.length === 0 ? (
          <EmptyState icon={Users} title="No consent recorded">
            Recording stays blocked until a consent record is granted. Record one below once the signed form is held offline.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-app-border text-sm">
            {detail.data.consents.map((c) => (
              <li key={c.consent_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="font-medium text-app-text">{c.consent_id}</span>
                <span className="text-app-muted">{c.status}</span>
                <span className="text-app-muted">landmarks: {c.scope_landmarks ? 'yes' : 'no'}</span>
                <span className="text-app-muted">reviewer: {c.authorized_by ?? '—'}</span>
                <span className="text-xs text-app-muted">{c.recorded_at}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <ConsentForm code={code} onSaved={() => { detail.reload(); onChanged(); }} />
      {latest && latest.status === 'granted' && (
        <WithdrawForm code={code} onSaved={() => { detail.reload(); onChanged(); }} />
      )}
    </div>
  );
}

function ConsentForm({ code, onSaved }) {
  const [form, setForm] = useState({
    consent_id: '', status: 'granted', form_version: 'v1', scope_landmarks: true,
    document_ref: '', authorized_by: 'REV-01', note: '',
  });
  const [message, setMessage] = useState({ tone: '', text: '' });
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage({ tone: '', text: '' });
    const body = {
      ...form,
      scope_landmarks: form.status === 'granted' ? form.scope_landmarks : false,
      authorized_by: form.status === 'granted' ? form.authorized_by : null,
    };
    try {
      await recordConsent(code, body);
      setMessage({ tone: 'success', text: `Recorded ${form.consent_id} as ${form.status}.` });
      onSaved();
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Record a consent decision" description="Consent must match the signed paper form. A checkbox here is not proof of consent by itself.">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-app-muted">Consent reference<input className={INPUT} value={form.consent_id} onChange={set('consent_id')} placeholder="C-2026-001" maxLength={10} required aria-describedby="consent-hint" /></label>
        <p id="consent-hint" className="text-xs text-app-muted md:col-span-2">{CONSENT_HINT}</p>
        <label className="flex flex-col gap-1 text-sm text-app-muted">Decision
          <select className={INPUT} value={form.status} onChange={set('status')}>
            <option value="granted">Granted</option>
            <option value="pending">Pending</option>
            <option value="declined">Declined</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-app-muted">Form version<input className={INPUT} value={form.form_version} onChange={set('form_version')} required /></label>
        <label className="flex flex-col gap-1 text-sm text-app-muted">Signed form reference<input className={INPUT} value={form.document_ref} onChange={set('document_ref')} placeholder="Form v1 signed 2026-11-20" required minLength={3} /></label>
        {form.status === 'granted' && (
          <label className="flex flex-col gap-1 text-sm text-app-muted">Authorised reviewer<input className={INPUT} value={form.authorized_by} onChange={set('authorized_by')} placeholder="REV-01" required /></label>
        )}
        <label className="flex items-center gap-2 text-sm text-app-muted md:col-span-2">
          <input type="checkbox" checked={form.scope_landmarks} onChange={set('scope_landmarks')} disabled={form.status !== 'granted'} />
          The signed form covers landmark collection (hand joint positions, no video)
        </label>
        <label className="flex flex-col gap-1 text-sm text-app-muted md:col-span-2">Note (optional)<input className={INPUT} value={form.note} onChange={set('note')} maxLength={200} /></label>
        <div className="md:col-span-2">
          <button type="submit" className={buttonClass('primary')} disabled={busy}>Record decision</button>
        </div>
      </form>
      {message.text && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm ${message.tone === 'error' ? 'text-danger' : 'text-success'}`}>{message.text}</p>
      )}
    </Panel>
  );
}

function WithdrawForm({ code, onSaved }) {
  const [form, setForm] = useState({ consent_id: '', document_ref: '', note: '' });
  const [message, setMessage] = useState({ tone: '', text: '' });
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setMessage({ tone: '', text: '' });
    try {
      await withdrawConsent(code, form);
      setMessage({ tone: 'success', text: 'Consent withdrawn. Recording for this participant is blocked.' });
      onSaved();
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    }
  }

  return (
    <Panel title="Withdraw consent" description="Withdrawal is a new record. Earlier records stay in the history.">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-app-muted">New reference for this withdrawal<input className={INPUT} value={form.consent_id} onChange={set('consent_id')} placeholder="C-2026-002" maxLength={10} required /></label>
        <label className="flex flex-col gap-1 text-sm text-app-muted">Withdrawal letter reference<input className={INPUT} value={form.document_ref} onChange={set('document_ref')} placeholder="Withdrawal letter 2026-12-01" required minLength={3} /></label>
        <label className="flex flex-col gap-1 text-sm text-app-muted md:col-span-2">Note (optional)<input className={INPUT} value={form.note} onChange={set('note')} maxLength={200} /></label>
        <div className="md:col-span-2"><button type="submit" className={buttonClass('danger')}>Record withdrawal</button></div>
      </form>
      {message.text && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm ${message.tone === 'error' ? 'text-danger' : 'text-success'}`}>{message.text}</p>
      )}
    </Panel>
  );
}

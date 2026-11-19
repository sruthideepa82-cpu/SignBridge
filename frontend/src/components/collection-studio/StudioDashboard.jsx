import { Activity, Database } from 'lucide-react';
import { AppPageHeader, EmptyState, Panel } from '../app/ui.jsx';
import { getStudioDashboard, listAudit, listPhrases } from '../../services/studioService.js';
import useStudioData from './useStudioData.js';

// Every number here comes from the local Studio database or the phrase catalogue. Zero is shown as zero.
const CARDS = [
  { key: 'participants_total', label: 'Registered participants', note: 'Pseudonymous codes only' },
  { key: 'consent_granted', label: 'Consent cleared', note: 'Latest consent record is granted' },
  { key: 'consent_withdrawn', label: 'Consent withdrawn', note: 'Recording blocked' },
  { key: 'recording_sessions_total', label: 'Recording sessions', note: 'Sessions are not created yet' },
  { key: 'recordings_total', label: 'Recordings', note: 'No recording has been made' },
  { key: 'recordings_pending_review', label: 'Awaiting review', note: 'Review queue' },
  { key: 'recordings_accepted', label: 'Accepted for research', note: 'Not linguistic verification' },
  { key: 'recordings_flagged', label: 'Flagged', note: 'Needs human inspection' },
  { key: 'dataset_versions_total', label: 'Dataset versions', note: 'Exports are not created yet' },
];

export default function StudioDashboard() {
  const dashboard = useStudioData(getStudioDashboard);
  const phrases = useStudioData(listPhrases);
  const audit = useStudioData(() => listAudit(8), []);

  const verified = phrases.data ? phrases.data.filter((p) => p.verified).length : null;
  const total = phrases.data ? phrases.data.length : null;

  return (
    <div className="flex flex-col gap-6">
      <AppPageHeader
        eyebrow="Dataset Collection Studio"
        title="Dashboard"
        description="Local operations for the dataset. Counts are read from the Studio database. They describe collection coverage, not model accuracy."
      />

      {dashboard.loading && <p className="text-sm text-app-muted" role="status">Loading counts…</p>}
      {dashboard.error && <p className="text-sm text-danger" role="alert">Could not load counts: {dashboard.error}</p>}

      {dashboard.data && (
        <section aria-label="Collection counts" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {CARDS.map((card) => (
            <div key={card.key} className="rounded-xl border border-app-border bg-app-surface/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-app-muted">{card.label}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-app-text">{dashboard.data.counts[card.key] ?? 0}</p>
              <p className="mt-1 text-xs text-app-muted">{card.note}</p>
            </div>
          ))}
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Phrase coverage" description="Dynamic phrases with a named reviewer's verification. Coverage is not accuracy.">
          {phrases.loading && <p className="text-sm text-app-muted" role="status">Loading phrases…</p>}
          {phrases.error && <p className="text-sm text-danger" role="alert">{phrases.error}</p>}
          {verified !== null && (
            <>
              <p className="text-2xl font-semibold tabular-nums text-app-text">{verified} of {total} verified</p>
              <p className="mt-2 text-sm text-app-muted">
                {verified === 0
                  ? 'Every phrase is blocked until a qualified reviewer verifies its label. No recording can start for any phrase.'
                  : `${total - verified} phrases remain blocked.`}
              </p>
            </>
          )}
        </Panel>

        <Panel title="Dataset quality" description="Quality checks run on recordings once they exist.">
          {dashboard.data && dashboard.data.counts.recordings_total === 0 ? (
            <EmptyState icon={Database} title="Nothing to assess yet">
              No recordings exist, so there are no quality results to show. No quality figure is estimated.
            </EmptyState>
          ) : (
            <p className="text-sm text-app-muted">Quality results appear in the Quality reports section.</p>
          )}
        </Panel>
      </div>

      <Panel title="Recent activity" description="The latest administrative events. Participant codes appear, names never do.">
        {audit.loading && <p className="text-sm text-app-muted" role="status">Loading activity…</p>}
        {audit.error && <p className="text-sm text-danger" role="alert">{audit.error}</p>}
        {audit.data && audit.data.length === 0 && (
          <EmptyState icon={Activity} title="No activity yet">
            Actions such as registering a participant or checking a recording appear here.
          </EmptyState>
        )}
        {audit.data && audit.data.length > 0 && (
          <ul className="flex flex-col divide-y divide-app-border text-sm">
            {audit.data.map((event) => (
              <li key={event.event_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="text-app-muted">{event.occurred_at.replace('T', ' ').slice(0, 19)}</span>
                <span className="font-medium text-app-text">{event.action}</span>
                <span className="text-app-muted">{event.entity_id}</span>
                <span className={event.outcome === 'ok' ? 'text-success' : 'text-warning'}>{event.outcome}</span>
                {event.detail && <span className="text-xs text-app-muted">{event.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

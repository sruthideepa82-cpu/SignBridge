import { FileText, History, ShieldCheck } from 'lucide-react';
import { AppPageHeader, EmptyState, Panel, StatusDot } from '../components/app/ui.jsx';
import {
  CONSENT_POINTS,
  CONTRIBUTION_STAGES,
  DATASET_STATUS_DATE,
  RECORDING_GUIDANCE,
  VOCABULARY,
} from '../data/datasetStatus.js';

const STAGE_TONE = {
  vocabulary: 'warn',
  consent: 'neutral',
  recordings: 'neutral',
  training: 'neutral',
};

const yesNo = (value) => (value ? 'Yes' : 'No');

export default function ContributePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <AppPageHeader
        eyebrow="Contribute"
        title="Dataset Contribution"
        description="SignBridge is researching Indian Sign Language recognition. Participation is voluntary, and only hand landmarks are recorded."
      />

      <Panel title="Research overview" labelledBy="research-overview-title">
        <p className="text-sm leading-relaxed text-app-muted">
          The research collects labelled hand-landmark samples for a small set of ISL signs, then trains a classifier and
          reports how well it works for people it has not seen. The project is an academic capstone. The first stage
          covers six fingerspelling letters, and no model has been trained yet.
        </p>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Consent" labelledBy="consent-title" description="What you agree to when you take part.">
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-300/30 bg-amber-300/5 px-3 py-2.5 text-xs leading-relaxed text-amber-100">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            The consent form is a draft and needs ethics approval before it is used. Nothing on this page records consent.
          </div>
          <ul className="space-y-2.5 text-sm leading-relaxed text-app-muted">
            {CONSENT_POINTS.map((point) => (
              <li key={point} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-app-muted" />
                {point}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Participant instructions" labelledBy="instructions-title" description="How to make the recordings useful.">
          <ul className="space-y-2.5 text-sm leading-relaxed text-app-muted">
            {RECORDING_GUIDANCE.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-app-muted" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-app-muted">
            <FileText size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Recording is done by the research team with an offline tool. You do not install anything.
          </p>
        </Panel>
      </div>

      <Panel title="Status" labelledBy="status-title" description={`As of ${DATASET_STATUS_DATE}. The four stages are tracked separately.`}>
        <ul className="divide-y divide-app-border">
          {CONTRIBUTION_STAGES.map((stage) => (
            <li key={stage.id} className="grid gap-2 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
              <div className="flex items-center gap-2.5">
                <StatusDot tone={STAGE_TONE[stage.id]} />
                <span className="text-sm font-medium text-app-text">{stage.label}</span>
              </div>
              <div>
                <p className="text-xs font-medium text-app-text">{stage.state}</p>
                <p className="mt-1 text-xs leading-relaxed text-app-muted">{stage.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Vocabulary approval" labelledBy="vocabulary-title" description="Each letter must be checked against the official chart, then confirmed by a signer.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <caption className="sr-only">Approval state for each letter on the vocabulary list</caption>
            <thead className="text-xs text-app-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">Letter</th>
                <th scope="col" className="py-2 pr-4 font-medium">Meaning</th>
                <th scope="col" className="py-2 pr-4 font-medium">Checked against chart</th>
                <th scope="col" className="py-2 font-medium">Signer confirmed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {VOCABULARY.map((entry) => (
                <tr key={entry.label}>
                  <th scope="row" className="py-2.5 pr-4 font-semibold text-app-text">{entry.label}</th>
                  <td className="py-2.5 pr-4 text-xs text-app-muted">{entry.meaning}</td>
                  <td className="py-2.5 pr-4 text-xs text-app-text">{yesNo(entry.checked)}</td>
                  <td className="py-2.5 text-xs text-amber-200">{yesNo(entry.signerConfirmed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Contribution history" labelledBy="history-title">
        <EmptyState icon={History} title="No contributions recorded here">
          This app does not record or receive contributions. Participation records are kept by the research team, outside this app.
        </EmptyState>
      </Panel>
    </div>
  );
}

import { ShieldCheck } from 'lucide-react';
import { AppPageHeader } from '../app/ui.jsx';
import { listConsents } from '../../services/studioService.js';
import StudioListPanel from './StudioListPanel.jsx';

// Every consent record, newest first. Document references are labels only; no signed form is held here.
export default function ConsentRecordsPanel() {
  return (
    <div className="flex flex-col gap-6">
      <AppPageHeader
        eyebrow="Dataset Collection Studio"
        title="Consent records"
        description="Append-only consent history for every participant. Withdrawals are new records that supersede earlier grants."
      />
      <StudioListPanel
        title="All consent records"
        loader={listConsents}
        columns={[
          { key: 'consent_id', label: 'Reference' },
          { key: 'participant_code', label: 'Participant' },
          { key: 'status', label: 'Status' },
          { key: 'scope_landmarks', label: 'Landmarks', render: (row) => (row.scope_landmarks ? 'yes' : 'no') },
          { key: 'authorized_by', label: 'Reviewer' },
          { key: 'supersedes_consent_id', label: 'Supersedes' },
          { key: 'recorded_at', label: 'Recorded' },
        ]}
        emptyIcon={ShieldCheck}
        emptyTitle="No consent records"
        emptyText="No participant has a consent record. Recording stays blocked until one is granted and the owner enables collection."
      />
    </div>
  );
}

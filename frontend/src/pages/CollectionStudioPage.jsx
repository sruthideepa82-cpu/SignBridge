import { CalendarDays, ClipboardCheck, Database, Layers, BarChart3 } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import StudioShell from '../components/collection-studio/StudioShell.jsx';
import StudioDashboard from '../components/collection-studio/StudioDashboard.jsx';
import ParticipantsPanel from '../components/collection-studio/ParticipantsPanel.jsx';
import ConsentRecordsPanel from '../components/collection-studio/ConsentRecordsPanel.jsx';
import PhraseCatalogPanel from '../components/collection-studio/PhraseCatalogPanel.jsx';
import StudioListPanel from '../components/collection-studio/StudioListPanel.jsx';
import StudioSettingsPanel from '../components/collection-studio/StudioSettingsPanel.jsx';
import { AppPageHeader } from '../components/app/ui.jsx';
import {
  listDatasetVersions,
  listRecordings,
  listReviews,
  listSessions,
} from '../services/studioService.js';

const cell = (key) => ({ key, label: key.replace(/_/g, ' ') });

export default function CollectionStudioPage() {
  return (
    <StudioShell>
      <Routes>
        <Route index element={<StudioDashboard />} />
        <Route path="participants" element={<ParticipantsPanel />} />
        <Route path="consents" element={<ConsentRecordsPanel />} />
        <Route path="phrases" element={<PhraseCatalogPanel />} />
        <Route
          path="sessions"
          element={
            <div className="flex flex-col gap-6">
              <AppPageHeader eyebrow="Dataset Collection Studio" title="Recording sessions" description="Sessions group recordings by participant and day. None can start while recording is disabled." />
              <StudioListPanel
                title="Sessions"
                loader={listSessions}
                columns={[cell('session_id'), cell('participant_code'), cell('status'), cell('created_at')]}
                emptyIcon={CalendarDays}
                emptyTitle="No recording sessions"
                emptyText="No session exists. Sessions open only after recording is enabled and a participant passes every gate condition."
              />
            </div>
          }
        />
        <Route
          path="dataset"
          element={
            <div className="flex flex-col gap-6">
              <AppPageHeader eyebrow="Dataset Collection Studio" title="Dataset browser" description="Recordings with their metadata. Original files are never replaced." />
              <StudioListPanel
                title="Recordings"
                loader={listRecordings}
                columns={[cell('recording_id'), cell('session_id'), cell('phrase_id'), cell('status'), cell('created_at')]}
                emptyIcon={Database}
                emptyTitle="The dataset is empty"
                emptyText="No recordings exist. Nothing is estimated or filled in to look complete."
              />
            </div>
          }
        />
        <Route
          path="review"
          element={
            <div className="flex flex-col gap-6">
              <AppPageHeader eyebrow="Dataset Collection Studio" title="Review queue" description="Human review decisions. Each decision is a new record; earlier decisions are kept." />
              <StudioListPanel
                title="Review decisions"
                loader={listReviews}
                columns={[cell('review_id'), cell('recording_id'), cell('reviewer_id'), cell('decision'), cell('reason'), cell('recorded_at')]}
                emptyIcon={ClipboardCheck}
                emptyTitle="Nothing to review"
                emptyText="No recordings are waiting for review because none exist yet."
              />
            </div>
          }
        />
        <Route
          path="quality"
          element={
            <div className="flex flex-col gap-6">
              <AppPageHeader eyebrow="Dataset Collection Studio" title="Quality reports" description="Technical integrity checks and flags for human inspection. Flags never delete data." />
              <StudioListPanel
                title="Recordings checked"
                loader={listRecordings}
                columns={[cell('recording_id'), cell('status'), cell('sha256')]}
                emptyIcon={BarChart3}
                emptyTitle="No quality reports yet"
                emptyText="Quality checks run on recordings. With no recordings there is no quality result, and none is shown."
              />
            </div>
          }
        />
        <Route
          path="versions"
          element={
            <div className="flex flex-col gap-6">
              <AppPageHeader eyebrow="Dataset Collection Studio" title="Dataset versions" description="Frozen, versioned exports with SHA-256 manifests. Exports are not created yet." />
              <StudioListPanel
                title="Versions"
                loader={listDatasetVersions}
                columns={[cell('version_id'), cell('status'), cell('manifest_sha256'), cell('created_at')]}
                emptyIcon={Layers}
                emptyTitle="No dataset versions"
                emptyText="No export has been frozen. Exports are a later sub-stage and are never fed into training automatically."
              />
            </div>
          }
        />
        <Route path="settings" element={<StudioSettingsPanel />} />
        <Route path="*" element={<Navigate to="/studio" replace />} />
      </Routes>
    </StudioShell>
  );
}

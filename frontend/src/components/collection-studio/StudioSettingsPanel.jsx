import { Lock } from 'lucide-react';
import { AppPageHeader, Panel } from '../app/ui.jsx';
import { getStudioStatus } from '../../services/studioService.js';
import useStudioData from './useStudioData.js';

// Read-only. Recording is enabled only by the project owner, through the environment on the backend. There is no switch here.
export default function StudioSettingsPanel() {
  const status = useStudioData(getStudioStatus);
  return (
    <div className="flex flex-col gap-6">
      <AppPageHeader eyebrow="Dataset Collection Studio" title="Settings" description="Read-only status of the local Studio." />
      <Panel title="Collection status">
        {status.loading && <p className="text-sm text-app-muted" role="status">Loading…</p>}
        {status.error && <p className="text-sm text-danger" role="alert">{status.error}</p>}
        {status.data && (
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-wider text-app-muted">Participant collection</dt><dd className="mt-1 font-semibold text-app-text">{status.data.participant_collection === 'enabled' ? 'Enabled' : 'Disabled'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-app-muted">Recording flag</dt><dd className="mt-1 font-mono text-app-text">{status.data.recording_flag}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-app-muted">Network binding</dt><dd className="mt-1 text-app-text">{status.data.binding}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-app-muted">Database schema version</dt><dd className="mt-1 text-app-text">{status.data.schema_version}</dd></div>
          </dl>
        )}
      </Panel>
      <Panel title="Who can enable collection">
        <p className="flex items-start gap-2 text-sm text-app-muted">
          <Lock size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          Only the project owner can set the recording flag, and only after ethics approval, signed consent, a licence arrangement and
          written authorisation. The flag is read from the backend environment on every check. Nothing in this interface can change it.
        </p>
      </Panel>
    </div>
  );
}

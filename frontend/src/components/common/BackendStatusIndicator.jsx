import { RefreshCw } from 'lucide-react';
import { BACKEND_STATUS } from '../../hooks/useBackendHealth.js';
import StatusBadge from './StatusBadge.jsx';

const BACKEND_BADGES = {
  [BACKEND_STATUS.CHECKING]: { label: 'Checking backend…', tone: 'info', pulse: true },
  [BACKEND_STATUS.ONLINE]: { label: 'Backend connected', tone: 'success' },
  [BACKEND_STATUS.OFFLINE]: { label: 'Backend unreachable', tone: 'danger' },
};

export default function BackendStatusIndicator({ status, onRefresh, dark = false }) {
  const badge = BACKEND_BADGES[status];

  return (
    <div className="flex items-center gap-2">
      <StatusBadge label={badge.label} tone={badge.tone} pulse={badge.pulse} dark={dark} />
      {status === BACKEND_STATUS.OFFLINE && (
        <button
          type="button"
          onClick={onRefresh}
          className={
            dark
              ? 'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-lime-signal hover:bg-lime-signal/10'
              : 'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50'
          }
        >
          <RefreshCw size={12} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

import { StatusDot } from '../app/ui.jsx';
import { SYNC_STATUS } from '../../hooks/useLearnProgress.js';

const SYNC_TEXT = {
  [SYNC_STATUS.LOCAL]: { tone: 'neutral', text: 'Saved in this browser' },
  [SYNC_STATUS.SYNCING]: { tone: 'warn', text: 'Syncing to your account…' },
  [SYNC_STATUS.SYNCED]: { tone: 'ok', text: 'Saved to your account' },
  [SYNC_STATUS.ERROR]: { tone: 'error', text: 'Could not sync. Saved in this browser' },
};

export default function ProgressPanel({ completed, total, favourites, recent, syncStatus }) {
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  const sync = SYNC_TEXT[syncStatus] ?? SYNC_TEXT[SYNC_STATUS.LOCAL];

  return (
    <section aria-labelledby="learn-progress-title" className="rounded-xl border border-app-border bg-app-surface/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="learn-progress-title" className="text-sm font-semibold text-app-text">
          Your progress
        </h2>
        <p className="flex items-center gap-1.5 text-xs text-app-muted">
          <StatusDot tone={sync.tone} />
          {sync.text}
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-6">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 text-xs text-app-muted">
            <span>Completed letters</span>
            <span className="tabular-nums">
              {completed} of {total}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Completed letters"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5"
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <div className="rounded-lg border border-app-border bg-app-bg px-4 py-3">
          <p className="text-xs text-app-muted">Favourites</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-app-text">{favourites}</p>
        </div>
        <div className="rounded-lg border border-app-border bg-app-bg px-4 py-3">
          <p className="text-xs text-app-muted">Recently practised</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-app-text">{recent}</p>
        </div>
      </div>
    </section>
  );
}

import StatusBadge from '../common/StatusBadge.jsx';
import { formatTime } from '../../lib/recognitionHistory.js';

const BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal disabled:cursor-not-allowed disabled:opacity-40';
const SECONDARY = `${BUTTON} bg-white/[0.04] text-zinc-200 ring-1 ring-white/10 enabled:hover:bg-white/[0.08] enabled:active:scale-[0.98]`;

function HistoryItem({ entry }) {
  const recognized = entry.status === 'recognized';
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold text-zinc-100">
          {recognized ? entry.label : 'Not recognized'}
        </p>
        <p className="text-xs text-zinc-500">Confidence {Math.round(entry.confidence * 100)}%</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {recognized ? (
          <StatusBadge label="Recognized" tone="success" dark />
        ) : (
          <StatusBadge label="Below threshold" tone="warning" dark />
        )}
        <time dateTime={new Date(entry.timestamp).toISOString()} className="text-xs tabular-nums text-zinc-500">
          {formatTime(entry.timestamp)}
        </time>
      </div>
    </li>
  );
}

export default function RecognitionHistoryPanel({ entries, onClear }) {
  return (
    <section
      className="rounded-3xl border border-white/[0.07] bg-white/[0.03] p-5 backdrop-blur-xl sm:p-6"
      aria-labelledby="recognition-history-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="recognition-history-title" className="text-lg font-semibold tracking-tight text-zinc-100">
            Recognition history
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Latest classifier predictions. A new entry is added only when the prediction changes.
          </p>
        </div>
        <button type="button" className={SECONDARY} onClick={onClear} disabled={entries.length === 0}>
          Clear history
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-8 text-center">
          <p className="text-sm font-semibold text-zinc-200">No predictions yet</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Predictions appear here once a trained classifier returns a result.
          </p>
        </div>
      ) : (
        <ol className="mt-4 max-h-72 divide-y divide-white/[0.06] overflow-y-auto rounded-2xl ring-1 ring-white/10" aria-label="Recent predictions">
          {entries.map((entry) => (
            <HistoryItem key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  );
}

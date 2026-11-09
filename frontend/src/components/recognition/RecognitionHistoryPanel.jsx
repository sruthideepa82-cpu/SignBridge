import StatusBadge from '../common/StatusBadge.jsx';
import { formatTime } from '../../lib/recognitionHistory.js';

const BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY = `${BUTTON} bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50`;

function HistoryItem({ entry }) {
  const recognized = entry.status === 'recognized';
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold text-slate-900">
          {recognized ? entry.label : 'Not recognized'}
        </p>
        <p className="text-xs text-slate-500">Confidence {Math.round(entry.confidence * 100)}%</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {recognized ? (
          <StatusBadge label="Recognized" tone="success" />
        ) : (
          <StatusBadge label="Below threshold" tone="warning" />
        )}
        <time dateTime={new Date(entry.timestamp).toISOString()} className="text-xs tabular-nums text-slate-500">
          {formatTime(entry.timestamp)}
        </time>
      </div>
    </li>
  );
}

export default function RecognitionHistoryPanel({ entries, onClear }) {
  return (
    <section
      className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5"
      aria-labelledby="recognition-history-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="recognition-history-title" className="text-lg font-semibold text-slate-900">
            Recognition history
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Latest classifier predictions. A new entry is added only when the prediction changes.
          </p>
        </div>
        <button type="button" className={SECONDARY} onClick={onClear} disabled={entries.length === 0}>
          Clear history
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
          <p className="text-sm font-semibold text-slate-800">No predictions yet</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Predictions appear here once a trained classifier returns a result.
          </p>
        </div>
      ) : (
        <ol className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl ring-1 ring-slate-200" aria-label="Recent predictions">
          {entries.map((entry) => (
            <HistoryItem key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  );
}

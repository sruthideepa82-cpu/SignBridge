import { Send, Trash2, Undo2, WrapText } from 'lucide-react';
import { buttonClass } from '../app/ui.jsx';

// Recognised letters waiting for review. This is not a message yet: it is only sent when the user presses Send.
export default function SignDraft({ draft, onDraftChange, items, holding, onUndo, onAddSpace, onDiscard, onSend }) {
  const hasItems = items.length > 0;
  const hasDraft = draft.trim().length > 0;

  return (
    <section
      aria-labelledby="sign-draft-title"
      className="rounded-xl border border-dashed border-accent/40 bg-accent/[0.04] p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="sign-draft-title" className="text-xs font-semibold text-accent">
          Detected from signs
          <span className="ml-2 font-normal text-app-muted">Not sent yet</span>
        </h3>
        {holding && (
          <span className="text-xs tabular-nums text-app-muted" aria-live="polite">
            Holding {holding.label}: {holding.count} of {holding.of}
          </span>
        )}
      </div>

      <label htmlFor="sign-draft" className="sr-only">
        Recognised text, editable before sending
      </label>
      <textarea
        id="sign-draft"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        rows={2}
        placeholder="Recognised letters appear here. Hold a sign steady to add a letter."
        className="mt-2 block w-full resize-none rounded-lg border border-app-border bg-app-bg px-3 py-2 font-mono text-lg tracking-wider text-app-text placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-app-muted focus:border-accent/60 focus:outline-none"
      />

      {hasItems && (
        <ol className="mt-2 flex flex-wrap gap-1.5" aria-label="Recognised letters, in order">
          {items.map((item, index) => (
            <li
              key={`${index}-${item.type}-${item.label ?? ''}`}
              className="flex items-center gap-1.5 rounded-md border border-app-border bg-app-surface px-2 py-0.5 text-xs text-app-text"
            >
              {item.type === 'space' ? (
                <span className="text-app-muted">Space</span>
              ) : (
                <>
                  <span className="font-semibold">{item.label}</span>
                  <span className="tabular-nums text-app-muted">{Math.round(item.confidence * 100)}%</span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onUndo} disabled={!hasItems} className={buttonClass('secondary', 'px-2.5 py-1.5 text-xs')}>
          <Undo2 size={14} aria-hidden="true" />
          Undo last sign
        </button>
        <button type="button" onClick={onAddSpace} disabled={!hasItems} className={buttonClass('secondary', 'px-2.5 py-1.5 text-xs')}>
          <WrapText size={14} aria-hidden="true" />
          Add space
        </button>
        <button type="button" onClick={onDiscard} disabled={!hasItems && !hasDraft} className={buttonClass('ghost', 'px-2.5 py-1.5 text-xs')}>
          <Trash2 size={14} aria-hidden="true" />
          Discard
        </button>
        <button type="button" onClick={onSend} disabled={!hasDraft} className={buttonClass('primary', 'ml-auto px-3 py-1.5 text-xs')}>
          <Send size={14} aria-hidden="true" />
          Send to conversation
        </button>
      </div>
    </section>
  );
}

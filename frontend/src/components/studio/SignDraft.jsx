import { Send, Trash2, Undo2, WrapText, X } from 'lucide-react';
import { buttonClass } from '../app/ui.jsx';
import { CONFIDENCE_RANGE, STABLE_FRAMES_RANGE } from '../../lib/letterSettings.js';
import { EXPERIMENTAL_LABEL } from '../../lib/recognitionStatus.js';

// Recognised letters waiting for review. This is not a message yet: it is only sent when the user presses Send.
// `controls` carries what the letter path needs: correction, settings, and whether the active model is experimental.
export default function SignDraft({
  draft,
  onDraftChange,
  items,
  holding,
  onUndo,
  onAddSpace,
  onDiscard,
  onSend,
  controls,
}) {
  const hasItems = items.length > 0;
  const hasDraft = draft.trim().length > 0;
  const experimentalLetters = items.some((item) => item.experimental);
  const modelExperimental = controls?.experimental === true;
  const settings = controls?.settings;

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
        {modelExperimental && (
          <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
            {EXPERIMENTAL_LABEL}
          </span>
        )}
      </div>

      {holding && (
        <p className="mt-1 text-xs tabular-nums text-app-muted" aria-live="polite">
          Holding {holding.label}: {holding.count} of {holding.of}
        </p>
      )}

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
                <>
                  <span className="text-app-muted">Space</span>
                  {controls?.onRemoveAt && (
                    <RemoveButton label="Remove space" onClick={() => controls.onRemoveAt(index)} />
                  )}
                </>
              ) : (
                <>
                  <span className="font-semibold">{item.label}</span>
                  <span className="tabular-nums text-app-muted" aria-label={`Accepted with ${Math.round(item.confidence * 100)} percent confidence`}>
                    {Math.round(item.confidence * 100)}%
                  </span>
                  {item.experimental && (
                    <span className="rounded bg-warning/15 px-1 text-[10px] font-semibold text-warning" aria-label="Experimental, unverified">
                      Exp.
                    </span>
                  )}
                  {controls?.onRemoveAt && (
                    <RemoveButton label={`Remove letter ${item.label}`} onClick={() => controls.onRemoveAt(index)} />
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {experimentalLetters && (
        <p className="mt-2 text-xs text-warning">
          {EXPERIMENTAL_LABEL}. Check these letters before you send them.
        </p>
      )}

      {settings && controls?.onSettingsChange && (
        <div className="mt-3 grid gap-3 rounded-lg border border-app-border bg-app-bg p-3 text-xs text-app-muted sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span>
              Stable for {settings.stableFrames} frames before a letter is added
            </span>
            <input
              type="range"
              min={STABLE_FRAMES_RANGE.min}
              max={STABLE_FRAMES_RANGE.max}
              step={1}
              value={settings.stableFrames}
              onChange={(event) => controls.onSettingsChange({ stableFrames: Number(event.target.value) })}
              className="accent-violet-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>
              Your confidence threshold:{' '}
              {settings.minConfidence === null
                ? `backend default (${Math.round((controls.backendThreshold ?? 0) * 100)}%)`
                : `${Math.round(settings.minConfidence * 100)}%`}
            </span>
            <input
              type="range"
              min={CONFIDENCE_RANGE.min}
              max={CONFIDENCE_RANGE.max}
              step={0.01}
              value={settings.minConfidence ?? controls.backendThreshold ?? CONFIDENCE_RANGE.min}
              onChange={(event) => controls.onSettingsChange({ minConfidence: Number(event.target.value) })}
              className="accent-violet-500"
            />
            <span className="text-[11px]">Can only make recognition stricter than the backend threshold.</span>
          </label>
        </div>
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

function RemoveButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-5 w-5 items-center justify-center rounded text-app-muted hover:bg-white/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-accent"
    >
      <X size={12} aria-hidden="true" />
    </button>
  );
}

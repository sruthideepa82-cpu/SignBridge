import { useEffect, useId, useRef } from 'react';
import { buttonClass } from './ui.jsx';

// Used before any destructive action. Escape and the Cancel button both back out.
export default function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onCancel }) {
  const cancelRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" aria-label="Cancel" onClick={onCancel} className="absolute inset-0 bg-black/60" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-sm rounded-xl border border-app-border bg-app-surface p-5 shadow-2xl shadow-black/60"
      >
        <h2 id={titleId} className="text-base font-semibold text-app-text">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-app-muted">
          {description}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={buttonClass('secondary')}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className={buttonClass('danger')}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useId, useRef, useState } from 'react';

// A disclosure-style popover: the trigger toggles it, Escape and an outside click close it.
export default function Popover({ label, trigger, align = 'right', children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const onPointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-white/5 hover:text-app-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal"
      >
        {trigger}
      </button>
      {open && (
        <div
          id={panelId}
          className={`absolute top-11 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-app-border bg-app-surface p-2 shadow-2xl shadow-black/50 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

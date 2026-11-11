import { MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

// A "more actions" menu for list rows. Opens with Enter or Space, closes on Escape and on outside click,
// and moves focus between items with the arrow keys.
export default function ActionMenu({ label, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        rootRef.current?.querySelector('button[aria-haspopup]')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onMenuKey = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-white/[0.06] hover:text-app-text focus-visible:outline-2 focus-visible:outline-accent"
      >
        <MoreHorizontal size={17} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={`absolute top-9 z-30 w-48 overflow-hidden rounded-xl border border-app-border bg-app-raised p-1 shadow-xl shadow-black/40 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${
                  item.danger ? 'text-danger hover:bg-danger/10' : 'text-app-text hover:bg-white/[0.06]'
                }`}
              >
                {Icon && <Icon size={14} aria-hidden="true" className="shrink-0" />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

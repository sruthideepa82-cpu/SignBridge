// Shared building blocks for the application pages. Keep the visual language here, not per page.

// Every button is 36px tall so buttons line up across the app. Pass extra classes only for width or icon-only sizing.
export const BUTTON_BASE =
  'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40';

export const BUTTON_VARIANTS = {
  primary: 'bg-accent text-app-bg hover:bg-accent-hover active:scale-[0.98]',
  secondary: 'border border-app-border bg-app-surface text-app-text hover:bg-app-raised active:scale-[0.98]',
  ghost: 'text-app-muted hover:bg-white/[0.06] hover:text-app-text',
  danger: 'border border-danger/40 text-danger hover:bg-danger/10',
};

export function buttonClass(variant = 'secondary', extra = '') {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${extra}`.trim();
}

export function AppPageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="flex flex-col gap-4 border-b border-app-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-app-muted">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-app-text">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-app-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ as: Tag = 'section', title, description, actions, children, className = '', labelledBy }) {
  const headingId = labelledBy ?? (title ? `panel-${title.replace(/\W+/g, '-').toLowerCase()}` : undefined);
  return (
    <Tag aria-labelledby={headingId} className={`rounded-xl border border-app-border bg-app-surface/60 p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 id={headingId} className="text-sm font-semibold text-app-text">
                {title}
              </h2>
            )}
            {description && <p className="mt-1 text-xs leading-relaxed text-app-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-app-border px-4 py-8 text-center">
      {Icon && (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-app-border text-app-muted">
          <Icon size={17} aria-hidden="true" />
        </span>
      )}
      <p className="mt-3 text-sm font-medium text-app-text">{title}</p>
      {children && <div className="mt-1 max-w-sm text-xs leading-relaxed text-app-muted">{children}</div>}
    </div>
  );
}

export function StatusDot({ tone = 'neutral' }) {
  const colour = {
    ok: 'bg-success',
    warn: 'bg-amber-300',
    error: 'bg-red-400',
    neutral: 'bg-app-muted',
  }[tone];
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${colour}`} aria-hidden="true" />;
}

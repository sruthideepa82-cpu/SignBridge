// Shown for workspaces that are not built yet. It states what is missing; it does not imitate the feature.
export default function ComingSoonPage({ title, section, description, icon: Icon }) {
  return (
    <section aria-labelledby="coming-soon-title" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-app-muted">{section}</p>
        <h1 id="coming-soon-title" className="mt-1 text-2xl font-semibold tracking-tight text-app-text">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-app-muted">{description}</p>
      </header>

      <div className="flex flex-col items-center rounded-xl border border-dashed border-app-border bg-app-surface/40 px-6 py-14 text-center">
        {Icon && (
          <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-app-border text-app-muted">
            <Icon size={20} aria-hidden="true" />
          </span>
        )}
        <p className="mt-4 text-sm font-medium text-app-text">Not available yet</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-app-muted">
          This workspace is still being built. Nothing is shown here until it works with real data.
        </p>
      </div>
    </section>
  );
}

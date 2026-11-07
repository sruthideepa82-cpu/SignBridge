export default function PageHeader({ eyebrow, title, description, badge }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">{eyebrow}</p>
        )}
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
        {description && <p className="mt-3 text-base leading-relaxed text-slate-600">{description}</p>}
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
    </header>
  );
}

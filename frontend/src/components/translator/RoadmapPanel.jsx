import { CircleCheck, Circle } from 'lucide-react';
import { TRANSLATOR_ROADMAP } from '../../data/moduleContent.js';

const STATUS_STYLES = {
  Done: 'bg-accent/10 text-accent ring-accent/25',
  Next: 'bg-sky-400/10 text-sky-300 ring-sky-400/20',
  Planned: 'bg-white/[0.04] text-zinc-400 ring-white/10',
};

export default function RoadmapPanel() {
  return (
    <section
      className="rounded-xl border border-app-border bg-app-surface p-5 sm:p-6"
      aria-labelledby="translator-roadmap-title"
    >
      <h2 id="translator-roadmap-title" className="text-lg font-semibold tracking-tight text-zinc-100">
        Translator roadmap
      </h2>
      <ol className="mt-4 space-y-3">
        {TRANSLATOR_ROADMAP.map((item) => {
          const Icon = item.status === 'Done' ? CircleCheck : Circle;
          return (
            <li key={item.label} className="flex items-start gap-3">
              <Icon
                size={18}
                className={item.status === 'Done' ? 'mt-0.5 shrink-0 text-accent' : 'mt-0.5 shrink-0 text-zinc-600'}
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-sm text-zinc-300">{item.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLES[item.status]}`}
                >
                  {item.status}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

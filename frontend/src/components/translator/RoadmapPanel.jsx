import { CircleCheck, Circle } from 'lucide-react';
import { TRANSLATOR_ROADMAP } from '../../data/moduleContent.js';

const STATUS_STYLES = {
  Done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Next: 'bg-blue-50 text-blue-700 ring-blue-200',
  Planned: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function RoadmapPanel() {
  return (
    <section
      className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5"
      aria-labelledby="translator-roadmap-title"
    >
      <h2 id="translator-roadmap-title" className="text-lg font-semibold text-slate-900">
        Translator roadmap
      </h2>
      <ol className="mt-4 space-y-3">
        {TRANSLATOR_ROADMAP.map((item) => {
          const Icon = item.status === 'Done' ? CircleCheck : Circle;
          return (
            <li key={item.label} className="flex items-start gap-3">
              <Icon
                size={18}
                className={item.status === 'Done' ? 'mt-0.5 shrink-0 text-emerald-500' : 'mt-0.5 shrink-0 text-slate-300'}
                aria-hidden="true"
              />
              <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-slate-700">{item.label}</span>
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

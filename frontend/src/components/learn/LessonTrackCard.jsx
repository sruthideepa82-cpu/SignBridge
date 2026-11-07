import { Lock } from 'lucide-react';
import StatusBadge from '../common/StatusBadge.jsx';

export default function LessonTrackCard({ title, description }) {
  return (
    <article className="flex h-full flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <Lock size={18} aria-hidden="true" />
        </span>
        <StatusBadge label="Planned" tone="neutral" showDot={false} />
      </div>
      <h3 className="mt-5 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
    </article>
  );
}

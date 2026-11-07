import StatusBadge from '../common/StatusBadge.jsx';

export default function FeatureCard({ icon: Icon, title, description, status }) {
  const isInDevelopment = status === 'In development';

  return (
    <article className="group flex h-full flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/5">
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-violet-100 text-blue-600 transition group-hover:from-blue-600 group-hover:to-violet-600 group-hover:text-white">
          <Icon size={24} aria-hidden="true" />
        </span>
        <StatusBadge
          label={status}
          tone={isInDevelopment ? 'warning' : 'neutral'}
          showDot={false}
        />
      </div>
      <h3 className="mt-5 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
    </article>
  );
}

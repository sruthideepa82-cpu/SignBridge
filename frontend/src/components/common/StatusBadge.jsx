const TONE_CLASSES = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  info: 'bg-blue-50 text-blue-700 ring-blue-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  accent: 'bg-violet-50 text-violet-700 ring-violet-200',
};

const DARK_TONE_CLASSES = {
  neutral: 'bg-white/5 text-zinc-300 ring-white/10',
  info: 'bg-sky-400/10 text-sky-300 ring-sky-400/20',
  success: 'bg-success/10 text-success ring-success/25',
  warning: 'bg-amber-400/10 text-amber-300 ring-amber-400/20',
  danger: 'bg-red-500/10 text-red-300 ring-red-500/20',
  accent: 'bg-violet-400/10 text-violet-300 ring-violet-400/20',
};

const DOT_CLASSES = {
  neutral: 'bg-slate-400',
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  accent: 'bg-violet-500',
};

const DARK_DOT_CLASSES = {
  neutral: 'bg-zinc-500',
  info: 'bg-sky-400',
  success: 'bg-success',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  accent: 'bg-violet-400',
};

export default function StatusBadge({ label, tone = 'neutral', pulse = false, showDot = true, dark = false }) {
  const toneClasses = dark ? DARK_TONE_CLASSES[tone] : TONE_CLASSES[tone];
  const dotClasses = dark ? DARK_DOT_CLASSES[tone] : DOT_CLASSES[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors duration-300 ${toneClasses}`}
    >
      {showDot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotClasses}`}
            />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${dotClasses}`} />
        </span>
      )}
      {label}
    </span>
  );
}

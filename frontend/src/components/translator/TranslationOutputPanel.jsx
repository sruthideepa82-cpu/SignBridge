import { MessageSquareText, Volume2 } from 'lucide-react';

export default function TranslationOutputPanel() {
  return (
    <section
      className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5"
      aria-labelledby="translation-output-title"
    >
      <h2 id="translation-output-title" className="text-lg font-semibold text-slate-900">
        Translation output
      </h2>

      <div className="mt-4 flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          <MessageSquareText size={24} aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-semibold text-slate-800">No recognized text yet</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
          Recognized signs will appear here once gesture recognition is implemented.
        </p>
      </div>

      <button
        type="button"
        disabled
        className="mt-4 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400"
      >
        <Volume2 size={16} aria-hidden="true" />
        Speak translation (coming soon)
      </button>
    </section>
  );
}

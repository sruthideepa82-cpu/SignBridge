const OPTION =
  'inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-sm font-semibold ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
const ACTIVE = `${OPTION} bg-blue-600 text-white ring-blue-600 shadow-sm shadow-blue-600/20`;
const INACTIVE = `${OPTION} bg-white text-slate-700 ring-slate-200 hover:bg-slate-50`;

export default function VocabularySelector({ vocabulary, selected, onSelect }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="vocabulary-selector-title" className="text-sm font-semibold text-slate-800">
          Sign vocabulary
        </p>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
          Provisional demo labels
        </span>
      </div>
      <div role="group" aria-labelledby="vocabulary-selector-title" className="mt-3 flex flex-wrap gap-2">
        {vocabulary.map((entry) => {
          const active = entry.label === selected;
          return (
            <button
              key={entry.label}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(entry.label)}
              className={active ? ACTIVE : INACTIVE}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Selected: <span className="font-semibold text-slate-800">{selected}</span>. Choosing a sign does not change what
        the classifier predicts.
      </p>
    </div>
  );
}

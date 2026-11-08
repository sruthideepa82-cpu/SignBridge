import { ALPHABET_CARDS, ALPHABET_SOURCE } from '../../data/alphabetCards.js';
import usePracticeProgress from '../../hooks/usePracticeProgress.js';

export default function AlphabetCards() {
  const { practised, toggle, reset } = usePracticeProgress();

  return (
    <section aria-labelledby="alphabet-cards-title" className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="alphabet-cards-title" className="text-lg font-semibold text-slate-900">
          Finger-spelling letters
        </h2>
        <p className="text-sm text-slate-600" aria-live="polite">
          {practised.length} of {ALPHABET_CARDS.length} practised
        </p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Each card points to the official ISLRTC chart. Check the handshape there. Mark a letter as practised once you
        have copied it. Progress is saved in this browser only.
      </p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {ALPHABET_CARDS.map((card) => {
          const done = practised.includes(card.letter);
          return (
            <li key={card.letter} className="rounded-2xl ring-1 ring-slate-200 p-4">
              <p className="text-3xl font-bold text-slate-900">{card.letter}</p>
              <p className="mt-1 text-xs text-slate-500">
                {card.hands === 1 ? 'One hand' : 'Two hands'} · static · signer check pending
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => toggle(card.letter)}
                  className="h-4 w-4 accent-blue-600"
                />
                Practised {card.letter}
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <a href={ALPHABET_SOURCE.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">
          Open the ISLRTC chart (PDF, opens in a new tab)
        </a>
        <button
          type="button"
          onClick={reset}
          disabled={practised.length === 0}
          className="rounded-lg px-3 py-1.5 font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          Reset progress
        </button>
      </div>
    </section>
  );
}

import { ArrowRight, Send } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PHRASE_CATEGORIES } from '../../lib/quickPhrases.js';

// "Frequently Used" is the list of phrases the user starred. The app does not count usage, so it is not ranked.
const FREQUENT = { id: 'frequent', label: 'Frequently Used' };
const CATEGORY_TABS = [
  FREQUENT,
  { id: 'greetings', label: 'Greetings' },
  { id: 'help', label: 'Help' },
  { id: 'medical', label: 'Medical' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'college', label: 'College' },
];

// Selectable phrase shortcuts under the category pills. One tap sends the phrase to the conversation.
export default function QuickPhraseSelector({ favourites, onSendPhrase, status }) {
  const [category, setCategory] = useState(FREQUENT.id);
  const phrases =
    category === FREQUENT.id
      ? favourites.map((item) => item.text)
      : (PHRASE_CATEGORIES.find((item) => item.id === category)?.phrases ?? []);

  return (
    <section aria-labelledby="live-quick-phrases-title" className="rounded-xl border border-app-border bg-app-surface p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 id="live-quick-phrases-title" className="text-sm font-semibold text-app-text">
          Quick Phrases
        </h2>
        <div role="group" aria-label="Phrase categories" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {CATEGORY_TABS.map((item) => {
            const selected = item.id === category;
            const emergency = item.id === 'emergency';
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setCategory(item.id)}
                className={`h-8 shrink-0 rounded-full px-3.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  selected
                    ? emergency
                      ? 'bg-danger/20 text-danger'
                      : 'bg-accent text-app-bg'
                    : emergency
                      ? 'text-danger hover:bg-danger/10'
                      : 'text-app-muted hover:bg-white/[0.06] hover:text-app-text'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {phrases.length === 0 ? (
        <p className="mt-3 text-xs text-app-muted">
          No starred phrases yet.{' '}
          <Link to="/phrases" className="font-medium text-accent-hover hover:underline">
            Star phrases in Quick Phrases
          </Link>{' '}
          to keep them here.
        </p>
      ) : (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={`${CATEGORY_TABS.find((item) => item.id === category)?.label} phrases`}>
          {phrases.map((phrase) => (
            <li key={phrase} className="shrink-0">
              <button
                type="button"
                onClick={() => onSendPhrase(phrase)}
                className="group flex h-9 max-w-[18rem] items-center gap-2.5 rounded-lg border border-app-border bg-app-bg pl-3 pr-2.5 text-left text-sm text-app-text transition-colors hover:border-accent/50 hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="truncate">{phrase}</span>
                <Send size={13} aria-hidden="true" className="shrink-0 text-app-muted transition-colors group-hover:text-accent-hover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      <Link to="/phrases" className="mt-2 inline-flex items-center gap-1 text-xs text-app-muted hover:text-app-text">
        All phrases
        <ArrowRight size={12} aria-hidden="true" />
      </Link>
    </section>
  );
}

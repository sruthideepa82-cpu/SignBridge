import { ArrowRight, Send, Zap } from 'lucide-react';
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
    <section aria-labelledby="live-quick-phrases-title" className="ls-quick flex min-w-0 flex-col gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent" aria-hidden="true">
            <Zap size={16} />
          </span>
          <h2 id="live-quick-phrases-title" className="text-sm font-semibold text-app-text">
            Quick Phrases
          </h2>
        </div>
        <div role="group" aria-label="Phrase categories" className="ls-scroll flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
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
        <Link to="/phrases" className="hidden shrink-0 items-center gap-1 whitespace-nowrap text-xs text-app-muted hover:text-app-text xl:inline-flex">
          All phrases
          <ArrowRight size={12} aria-hidden="true" />
        </Link>
      </div>

      {phrases.length === 0 ? (
        <p className="text-xs text-app-muted">
          No starred phrases yet.{' '}
          <Link to="/phrases" className="font-medium text-accent-hover hover:underline">
            Star phrases in Quick Phrases
          </Link>{' '}
          to keep them here.
        </p>
      ) : (
        <ul className="ls-scroll flex gap-2 overflow-x-auto pb-1" aria-label={`${CATEGORY_TABS.find((item) => item.id === category)?.label} phrases`}>
          {phrases.map((phrase) => (
            <li key={phrase} className="shrink-0">
              <button
                type="button"
                onClick={() => onSendPhrase(phrase)}
                className="ls-quick-pill group flex h-9 max-w-[18rem] items-center gap-2.5 border border-app-border bg-app-raised pl-3.5 pr-3 text-left text-sm text-app-text transition-colors hover:border-accent/60 hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-accent"
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
    </section>
  );
}

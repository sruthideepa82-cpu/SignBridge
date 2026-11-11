import { ExternalLink, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppPageHeader, EmptyState, Panel, buttonClass } from '../components/app/ui.jsx';
import { VOCABULARY, VOCABULARY_SOURCE } from '../data/datasetStatus.js';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'letters', label: 'Letters' },
];

function entryStatus(entry) {
  if (entry.checked && !entry.signerConfirmed) return 'Checked against the chart. Signer confirmation pending.';
  if (entry.checked && entry.signerConfirmed) return 'Checked and confirmed by a signer.';
  return 'Not yet checked.';
}

export default function DictionaryPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedLabel, setSelectedLabel] = useState(null);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return VOCABULARY.filter((entry) => {
      if (category !== 'all' && category !== 'letters') return false;
      if (!term) return true;
      return entry.label.toLowerCase().includes(term) || entry.meaning.toLowerCase().includes(term);
    });
  }, [query, category]);

  const selected = VOCABULARY.find((entry) => entry.label === selectedLabel) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <AppPageHeader
        eyebrow="Learn"
        title="ISL Dictionary"
        description="Indian Sign Language entries are listed only after they are checked against the ISLRTC reference. Word-level vocabulary is not yet verified, so it is not listed here."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex w-full items-center gap-2 rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-muted focus-within:border-accent/60 sm:max-w-sm">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search vocabulary</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by letter or meaning"
            className="min-w-0 flex-1 bg-transparent text-app-text placeholder:text-app-muted focus:outline-none"
          />
        </label>
        <div role="group" aria-label="Category" className="flex gap-2">
          {CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                category === item.id ? 'border-accent/50 bg-accent/10 text-accent' : 'border-app-border text-app-muted hover:text-app-text'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {results.length === 0 ? (
            <EmptyState title="No matching entries">Only checked letters are listed. Try a different search.</EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Vocabulary">
              {results.map((entry) => {
                const isSelected = entry.label === selectedLabel;
                return (
                  <li key={entry.label}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedLabel(entry.label)}
                      className={`flex w-full flex-col rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                        isSelected ? 'border-accent/50 bg-accent/5' : 'border-app-border bg-app-surface/60 hover:border-white/20'
                      }`}
                    >
                      <span className="text-3xl font-semibold text-app-text">{entry.label}</span>
                      <span className="mt-1 text-xs text-app-muted">{entry.hands === 1 ? 'One hand' : 'Two hands'} · Letter</span>
                      <span className="mt-3 text-[11px] leading-snug text-app-muted">{entryStatus(entry)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Panel className="lg:col-span-2" labelledBy="entry-detail-title" title={selected ? `Letter ${selected.label}` : 'Entry details'}>
          {!selected ? (
            <p className="text-sm text-app-muted">Select an entry to see its meaning and source.</p>
          ) : (
            <div className="flex flex-col gap-4 text-sm">
              <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-app-border bg-app-bg px-4 text-center text-xs text-app-muted">
                Illustration not available here. Check the handshape on the official chart.
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                <dt className="text-app-muted">Meaning</dt>
                <dd className="text-app-text">{selected.meaning}</dd>
                <dt className="text-app-muted">Hands</dt>
                <dd className="text-app-text">{selected.hands === 1 ? 'One hand' : 'Two hands'}</dd>
                <dt className="text-app-muted">Example use</dt>
                <dd className="text-app-text">Not yet written.</dd>
                <dt className="text-app-muted">Difficulty</dt>
                <dd className="text-app-text">Not yet rated.</dd>
                <dt className="text-app-muted">Status</dt>
                <dd className="text-app-text">{entryStatus(selected)}</dd>
              </dl>
              <a
                href={VOCABULARY_SOURCE.url}
                target="_blank"
                rel="noreferrer"
                className={buttonClass('secondary', 'self-start')}
              >
                Open the ISLRTC chart
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

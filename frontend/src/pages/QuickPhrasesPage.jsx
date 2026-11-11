import { Check, MessageSquarePlus, Pencil, Play, Plus, RotateCcw, Search, Send, Star, Trash2, Volume2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ActionMenu from '../components/app/ActionMenu.jsx';
import ConfirmDialog from '../components/app/ConfirmDialog.jsx';
import { AppPageHeader, buttonClass, EmptyState } from '../components/app/ui.jsx';
import usePhraseFavourites from '../hooks/usePhraseFavourites.js';
import { conversationActions, SPEAKERS } from '../lib/conversationStore.js';
import { favouriteActions, isFavourite } from '../lib/phraseFavourites.js';
import { PHRASE_CATEGORIES } from '../lib/quickPhrases.js';
import { isSpeechSupported, speak, stopSpeaking } from '../lib/speech.js';

const FAVOURITES = 'favourites';
const ALL = 'all';

const NAV = [
  { id: ALL, label: 'All Phrases' },
  ...PHRASE_CATEGORIES.map((item) => ({ id: item.id, label: item.label })),
  { id: FAVOURITES, label: 'Favourites' },
];

// Built-in phrases are fixed text. Phrases the user wrote are "custom" and can be edited or deleted.
function buildRows(favourites) {
  const builtIn = PHRASE_CATEGORIES.flatMap((category) =>
    category.phrases.map((text) => ({ text, custom: false, categoryId: category.id, categoryLabel: category.label })),
  );
  const custom = favourites
    .filter((item) => item.custom)
    .map((item) => ({ text: item.text, custom: true, categoryId: 'custom', categoryLabel: 'Your phrases' }));
  return [...builtIn, ...custom];
}

function StarButton({ saved, text, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={saved}
      aria-label={`${saved ? 'Remove from saved' : 'Save'} phrase: ${text}`}
      title={saved ? 'Remove from favourites' : 'Add to favourites'}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
        saved ? 'text-accent-hover' : 'text-app-muted hover:bg-white/[0.06] hover:text-app-text'
      }`}
    >
      <Star size={15} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
}

export default function QuickPhrasesPage() {
  const [params, setParams] = useSearchParams();
  const favourites = usePhraseFavourites();
  const requested = params.get('category') === 'saved' ? FAVOURITES : params.get('category');
  const categoryId = NAV.some((item) => item.id === requested) ? requested : ALL;
  const searchId = useId();
  const newPhraseId = useId();
  const editId = useId();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState('');
  const [sender, setSender] = useState('deaf');
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [newPhrase, setNewPhrase] = useState('');
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const speechSupported = isSpeechSupported();

  useEffect(() => () => stopSpeaking(), []);

  const rows = useMemo(() => buildRows(favourites), [favourites]);
  const starred = (text) => isFavourite(favourites, text);

  const visibleRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term) return rows.filter((row) => row.text.toLowerCase().includes(term));
    if (categoryId === ALL) return rows;
    if (categoryId === FAVOURITES) return favourites.map((item) => ({ text: item.text, custom: item.custom, categoryId: FAVOURITES, categoryLabel: item.custom ? 'Your phrases' : '' }));
    return rows.filter((row) => row.categoryId === categoryId);
  }, [rows, favourites, query, categoryId]);

  const counts = {
    [ALL]: rows.length,
    [FAVOURITES]: favourites.length,
    ...Object.fromEntries(PHRASE_CATEGORIES.map((item) => [item.id, item.phrases.length])),
  };
  const currentLabel = NAV.find((item) => item.id === categoryId)?.label ?? 'All Phrases';

  const choose = (text) => {
    setSelected(text);
    setDraft(text);
    setMessage('');
  };

  const reset = () => {
    stopSpeaking();
    setSelected(null);
    setDraft('');
    setMessage('');
  };

  const say = (text) => {
    setMessage('');
    try {
      speak(text);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const sendText = (text, from = sender) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    conversationActions.append({ text: trimmed, source: 'phrase', speaker: from });
    setMessage(`Sent to the conversation as ${SPEAKERS[from]}.`);
  };

  const changeCategory = (id) => {
    setParams(id === ALL ? {} : { category: id });
  };

  const addCustom = (event) => {
    event.preventDefault();
    if (!newPhrase.trim()) return;
    favouriteActions.add(newPhrase, { custom: true });
    setNewPhrase('');
    setAdding(false);
  };

  const saveEdit = (event) => {
    event.preventDefault();
    if (!editText.trim()) return;
    favouriteActions.rename(editing, editText);
    if (selected === editing) choose(editText.trim());
    setEditing(null);
  };

  const toggleStar = (text) => (starred(text) ? favouriteActions.remove(text) : favouriteActions.add(text));

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <AppPageHeader
        title="Quick Phrases"
        description="Ready-to-use phrases for common situations. Send one to your conversation in a tap, or write your own."
        actions={
          <button type="button" onClick={() => setAdding((value) => !value)} aria-expanded={adding} className={buttonClass('primary')}>
            <Plus size={16} aria-hidden="true" />
            Add Phrase
          </button>
        }
      />

      {adding && (
        <form onSubmit={addCustom} className="flex flex-col gap-2 rounded-xl border border-app-border bg-app-surface p-3 sm:flex-row">
          <label htmlFor={newPhraseId} className="sr-only">
            New phrase
          </label>
          <input
            id={newPhraseId}
            autoFocus
            value={newPhrase}
            onChange={(event) => setNewPhrase(event.target.value)}
            maxLength={200}
            placeholder="Write your own phrase"
            className="h-9 min-w-0 flex-1 rounded-lg border border-app-border bg-app-bg px-3 text-sm text-app-text placeholder:text-app-muted focus:border-accent/60 focus:outline-none"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={!newPhrase.trim()} className={buttonClass('primary')}>
              <Check size={15} aria-hidden="true" />
              Save phrase
            </button>
            <button type="button" onClick={() => setAdding(false)} className={buttonClass('ghost')}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <nav aria-label="Phrase categories" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {NAV.map((item) => {
            const active = !query.trim() && item.id === categoryId;
            const emergency = item.id === 'emergency';
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setQuery('');
                  changeCategory(item.id);
                }}
                className={`flex h-9 shrink-0 items-center justify-between gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  active
                    ? emergency
                      ? 'bg-danger/15 text-danger'
                      : 'bg-accent/20 text-app-text'
                    : emergency
                      ? 'text-danger hover:bg-danger/10'
                      : 'text-app-muted hover:bg-white/[0.05] hover:text-app-text'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  {item.id === FAVOURITES ? <Star size={14} aria-hidden="true" /> : null}
                  {item.label}
                </span>
                <span aria-hidden="true" className="text-xs tabular-nums text-app-muted">
                  {counts[item.id]}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-4">
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              Search phrases
            </label>
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search phrases…"
              className="h-9 w-full rounded-lg border border-app-border bg-app-surface pl-9 pr-3 text-sm text-app-text placeholder:text-app-muted focus:border-accent/60 focus:outline-none"
            />
          </div>

          {selected && (
            <section aria-label="Selected phrase" className="rounded-xl border border-accent/40 bg-app-surface p-4">
              <div aria-live="polite">
                <p className="break-words text-xl font-semibold leading-snug text-app-text sm:text-2xl" data-testid="shown-message">
                  {draft}
                </p>
              </div>
              <label htmlFor="quick-message" className="mt-4 block text-xs font-medium text-app-muted">
                Edit message
              </label>
              <textarea
                id="quick-message"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
                className="mt-1.5 w-full resize-none rounded-lg border border-app-border bg-app-bg p-3 text-sm text-app-text focus:border-accent/60 focus:outline-none"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div role="radiogroup" aria-label="Send as" className="mr-1 flex rounded-lg bg-white/[0.04] p-0.5">
                  {Object.entries(SPEAKERS).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={sender === value}
                      onClick={() => setSender(value)}
                      className={`h-7 rounded-md px-2.5 text-xs font-medium ${sender === value ? 'bg-app-raised text-app-text' : 'text-app-muted hover:text-app-text'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => sendText(draft)} disabled={!draft.trim()} className={buttonClass('primary')}>
                  <Send size={15} aria-hidden="true" />
                  Send to conversation
                </button>
                <button type="button" onClick={() => say(draft)} disabled={!draft.trim() || !speechSupported} className={buttonClass('secondary')}>
                  <Volume2 size={15} aria-hidden="true" />
                  Speak
                </button>
                <button type="button" onClick={reset} className={buttonClass('ghost')}>
                  <RotateCcw size={15} aria-hidden="true" />
                  Reset
                </button>
              </div>
              {!speechSupported && <p className="mt-3 text-xs text-app-muted">Speech output is not available in this browser.</p>}
              {message && (
                <p role="status" className="mt-3 text-xs text-app-muted">
                  {message}
                  {message.startsWith('Sent') && (
                    <>
                      {' '}
                      <Link to="/conversations" className="font-medium text-accent-hover hover:underline">
                        Open conversations
                      </Link>
                    </>
                  )}
                </p>
              )}
            </section>
          )}

          <section aria-labelledby="phrase-list-title" className="rounded-xl border border-app-border bg-app-surface">
            <header className="flex items-center justify-between border-b border-app-border px-4 py-3">
              <h2 id="phrase-list-title" className="text-sm font-semibold text-app-text">
                {query.trim() ? `Results for “${query.trim()}”` : currentLabel}
              </h2>
              <span className="text-xs tabular-nums text-app-muted">
                {visibleRows.length} {visibleRows.length === 1 ? 'phrase' : 'phrases'}
              </span>
            </header>

            {visibleRows.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={categoryId === FAVOURITES && !query.trim() ? Star : MessageSquarePlus}
                  title={categoryId === FAVOURITES && !query.trim() ? 'No favourites yet' : 'No phrases match'}
                >
                  {categoryId === FAVOURITES && !query.trim()
                    ? 'Star a phrase to keep it here, or add your own phrase.'
                    : 'Try a shorter word, or add your own phrase.'}
                </EmptyState>
              </div>
            ) : (
              <ul aria-label={`${query.trim() ? 'Matching' : currentLabel} phrases`} className="divide-y divide-app-border">
                {visibleRows.map((row) => {
                  const isEditing = editing === row.text;
                  const saved = starred(row.text);
                  return (
                    <li key={`${row.categoryId}-${row.text}`} className="flex items-center gap-2 px-3 py-2">
                      {isEditing ? (
                        <form onSubmit={saveEdit} className="flex min-w-0 flex-1 items-center gap-2">
                          <label htmlFor={editId} className="sr-only">
                            Edit phrase
                          </label>
                          <input
                            id={editId}
                            autoFocus
                            value={editText}
                            maxLength={200}
                            onChange={(event) => setEditText(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') setEditing(null);
                            }}
                            className="h-9 min-w-0 flex-1 rounded-lg border border-accent/50 bg-app-bg px-3 text-sm text-app-text focus:outline-none"
                          />
                          <button type="submit" disabled={!editText.trim()} className={buttonClass('primary', 'px-3')}>
                            Save
                          </button>
                          <button type="button" onClick={() => setEditing(null)} className={buttonClass('ghost', 'w-9 px-0')} aria-label="Cancel edit">
                            <X size={14} aria-hidden="true" />
                          </button>
                        </form>
                      ) : (
                        <>
                          <StarButton saved={saved} text={row.text} onToggle={() => toggleStar(row.text)} />
                          <button
                            type="button"
                            aria-pressed={selected === row.text}
                            onClick={() => choose(row.text)}
                            className="flex min-h-9 min-w-0 flex-1 flex-col justify-center rounded-lg px-2 py-1 text-left text-sm text-app-text transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            <span className="break-words">{row.text}</span>
                            {(row.custom || (query.trim() && row.categoryLabel)) && (
                              <span className="text-xs text-app-muted">{row.categoryLabel}</span>
                            )}
                          </button>
                          {speechSupported && (
                            <button
                              type="button"
                              onClick={() => say(row.text)}
                              aria-label={`Speak phrase: ${row.text}`}
                              title="Speak"
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-white/[0.06] hover:text-app-text focus-visible:outline-2 focus-visible:outline-accent"
                            >
                              <Play size={14} aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => sendText(row.text)}
                            aria-label={`Send to conversation: ${row.text}`}
                            title="Send to conversation"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-accent/15 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            <Send size={14} aria-hidden="true" />
                          </button>
                          <ActionMenu
                            label={`More actions for ${row.text}`}
                            items={[
                              { label: 'Show large', icon: Volume2, onSelect: () => choose(row.text) },
                              ...(row.custom
                                ? [
                                    {
                                      label: 'Edit',
                                      icon: Pencil,
                                      onSelect: () => {
                                        setEditing(row.text);
                                        setEditText(row.text);
                                      },
                                    },
                                    { label: 'Delete', icon: Trash2, danger: true, onSelect: () => setPendingDelete(row.text) },
                                  ]
                                : saved
                                  ? [{ label: 'Remove from favourites', icon: Star, onSelect: () => favouriteActions.remove(row.text) }]
                                  : []),
                            ]}
                          />
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {categoryId === FAVOURITES && favourites.length > 0 && !query.trim() && (
            <p className="text-xs text-app-muted">Favourites also appear in Live Studio and on the Overview page.</p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this phrase?"
        description="Your own phrase is removed from this browser. Built-in phrases cannot be deleted."
        confirmLabel="Delete phrase"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          favouriteActions.remove(pendingDelete);
          if (selected === pendingDelete) reset();
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

import { Bookmark, CalendarDays, Copy, ExternalLink, MessageSquare, Search, Star, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ActionMenu from '../components/app/ActionMenu.jsx';
import ConfirmDialog from '../components/app/ConfirmDialog.jsx';
import { AppPageHeader, EmptyState } from '../components/app/ui.jsx';
import { SourceTag } from '../components/conversation/MessageBubble.jsx';
import useConversationStore from '../hooks/useConversationStore.js';
import { conversationActions, formatListTime, SPEAKERS, sortedConversations, summarise } from '../lib/conversationStore.js';

const TABS = [
  { id: 'conversations', label: 'Conversations' },
  { id: 'saved', label: 'Saved messages' },
];

const RANGES = [
  { id: 'all', label: 'All time', days: null },
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
];

function formatWhen(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const store = useConversationStore();
  const searchId = useId();
  const rangeId = useId();
  const [tab, setTab] = useState('conversations');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState('all');
  const [filter, setFilter] = useState('all');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [notice, setNotice] = useState('');

  const term = query.trim().toLowerCase();
  const rangeDays = RANGES.find((item) => item.id === range)?.days ?? null;
  const since = rangeDays ? Date.now() - rangeDays * 24 * 60 * 60 * 1000 : 0;

  const conversationRows = useMemo(
    () =>
      sortedConversations(store)
        .map((conversation) => ({ conversation, view: summarise(conversation) }))
        .filter(({ conversation, view }) => {
          if (view.lastAt < since) return false;
          if (filter === 'favourites' && !conversation.favourite) return false;
          if (filter === 'saved' && view.savedCount === 0) return false;
          if (!term) return true;
          return (
            conversation.title.toLowerCase().includes(term) ||
            conversation.messages.some((message) => message.text.toLowerCase().includes(term))
          );
        }),
    [store, filter, term, since],
  );

  const savedRows = useMemo(
    () =>
      store.conversations
        .flatMap((conversation) =>
          conversation.messages
            .filter((message) => message.saved)
            .map((message) => ({ ...message, conversationId: conversation.id, conversationTitle: conversation.title })),
        )
        .filter((row) => !term || row.text.toLowerCase().includes(term) || row.conversationTitle.toLowerCase().includes(term))
        .filter((row) => row.at >= since)
        .sort((a, b) => b.at - a.at),
    [store, term, since],
  );

  const openConversation = (conversationId) => navigate(`/conversations/${conversationId}`);

  const copyMessage = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Message copied.');
    } catch {
      setNotice('Copying is not available in this browser.');
    }
  };

  const pending = pendingDelete ? store.conversations.find((item) => item.id === pendingDelete) : null;
  const hasAny = store.conversations.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <AppPageHeader
        title="History"
        description="Your past conversations and the messages you saved. Everything is kept in this browser."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="History sections" className="flex w-fit gap-1 rounded-lg bg-app-surface p-1">
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`history-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`history-panel-${item.id}`}
                onClick={() => setTab(item.id)}
                className={`h-8 rounded-md px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  selected ? 'bg-app-raised text-app-text' : 'text-app-muted hover:text-app-text'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 sm:w-64">
            <label htmlFor={searchId} className="sr-only">
              Search history
            </label>
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tab === 'conversations' ? 'Search titles and messages' : 'Search saved messages'}
              className="h-9 w-full rounded-lg border border-app-border bg-app-surface pl-9 pr-3 text-sm text-app-text placeholder:text-app-muted focus:border-accent/60 focus:outline-none"
            />
          </div>
          <label htmlFor={rangeId} className="sr-only">
            Date range
          </label>
          <select
            id={rangeId}
            value={range}
            onChange={(event) => setRange(event.target.value)}
            className="h-9 rounded-lg border border-app-border bg-app-surface px-3 text-sm text-app-text focus:border-accent/60 focus:outline-none"
          >
            {RANGES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          {tab === 'conversations' && (
            <>
              <label htmlFor="history-filter" className="sr-only">
                Show
              </label>
              <select
                id="history-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="h-9 rounded-lg border border-app-border bg-app-surface px-3 text-sm text-app-text focus:border-accent/60 focus:outline-none"
              >
                <option value="all">All conversations</option>
                <option value="favourites">Favourites</option>
                <option value="saved">With saved messages</option>
              </select>
            </>
          )}
        </div>
      </div>

      {notice && (
        <p role="status" className="text-xs text-app-muted">
          {notice}
        </p>
      )}

      {tab === 'conversations' ? (
        <div role="tabpanel" id="history-panel-conversations" aria-labelledby="history-tab-conversations">
          {!hasAny ? (
            <EmptyState icon={MessageSquare} title="No conversation history yet">
              <span className="block">Conversations appear here after you send your first message.</span>
              <Link to="/workspace/live-studio" className="mt-2 inline-block font-medium text-accent-hover hover:underline">
                Open Live Studio
              </Link>
            </EmptyState>
          ) : conversationRows.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nothing matches these filters">
              Change the search, date range or filter to see more conversations.
            </EmptyState>
          ) : (
            <ul aria-label="Conversation history" className="divide-y divide-app-border rounded-xl border border-app-border bg-app-surface">
              {conversationRows.map(({ conversation, view }) => (
                <li key={conversation.id} className="flex items-center gap-2 px-3 py-1">
                  <div className="flex min-w-0 flex-1 items-center gap-3.5 py-3 pl-1 pr-2">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-hover" aria-hidden="true">
                      <MessageSquare size={17} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openConversation(conversation.id)}
                          className="truncate rounded text-left text-sm font-medium text-app-text hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {conversation.title}
                        </button>
                        {conversation.favourite && <Star size={12} fill="currentColor" className="shrink-0 text-accent-hover" aria-label="Favourite" />}
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-app-muted">
                        <CalendarDays size={12} aria-hidden="true" />
                        <time dateTime={new Date(view.lastAt).toISOString()}>{formatWhen(view.lastAt)}</time>
                      </p>
                    </div>
                    <span className="hidden shrink-0 text-xs tabular-nums text-app-muted sm:block">
                      {view.messageCount} {view.messageCount === 1 ? 'message' : 'messages'}
                    </span>
                    {view.savedCount > 0 && (
                      <span className="hidden shrink-0 items-center gap-1 text-xs text-accent-hover md:flex">
                        <Bookmark size={11} fill="currentColor" aria-hidden="true" />
                        {view.savedCount} saved
                      </span>
                    )}
                  </div>
                  <ActionMenu
                    label={`Actions for ${conversation.title}`}
                    items={[
                      { label: 'Reopen', icon: ExternalLink, onSelect: () => openConversation(conversation.id) },
                      {
                        label: conversation.favourite ? 'Remove from favourites' : 'Add to favourites',
                        icon: Star,
                        onSelect: () => conversationActions.toggleFavourite(conversation.id),
                      },
                      { label: 'Delete', icon: Trash2, danger: true, onSelect: () => setPendingDelete(conversation.id) },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div role="tabpanel" id="history-panel-saved" aria-labelledby="history-tab-saved">
          {savedRows.length === 0 ? (
            <EmptyState icon={Bookmark} title={term ? 'No saved messages match' : 'No saved messages yet'}>
              Save a message from its row in a conversation, and it will be listed here.
            </EmptyState>
          ) : (
            <ul aria-label="Saved messages" className="divide-y divide-app-border rounded-xl border border-app-border bg-app-surface">
              {savedRows.map((row) => (
                <li key={`${row.conversationId}-${row.id}`} className="flex items-start gap-2 px-3 py-1">
                  <div className="min-w-0 flex-1 py-3 pl-1 pr-2">
                    <p className="whitespace-pre-wrap break-words text-sm text-app-text">{row.text}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-app-muted">
                      <span>{row.conversationTitle}</span>
                      <span aria-hidden="true">·</span>
                      <span>{SPEAKERS[row.speaker]}</span>
                      <span aria-hidden="true">·</span>
                      <SourceTag source={row.source} />
                      <span aria-hidden="true">·</span>
                      <time dateTime={new Date(row.at).toISOString()}>{formatListTime(row.at)}</time>
                    </p>
                  </div>
                  <ActionMenu
                    label={`Actions for saved message: ${row.text.slice(0, 30)}`}
                    items={[
                      { label: 'Open conversation', icon: ExternalLink, onSelect: () => openConversation(row.conversationId) },
                      { label: 'Copy message', icon: Copy, onSelect: () => copyMessage(row.text) },
                      {
                        label: 'Remove from saved',
                        icon: Bookmark,
                        onSelect: () => conversationActions.toggleSaved(row.conversationId, row.id),
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title="Delete this conversation?"
        description={
          pending
            ? `“${pending.title}” and its ${pending.messages.length} ${pending.messages.length === 1 ? 'message' : 'messages'} will be removed from this browser. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete conversation"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          conversationActions.remove(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

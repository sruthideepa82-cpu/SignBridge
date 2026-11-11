import { MessageSquare, MessageSquarePlus, Star, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ActionMenu from '../components/app/ActionMenu.jsx';
import ConfirmDialog from '../components/app/ConfirmDialog.jsx';
import { AppPageHeader, buttonClass, EmptyState } from '../components/app/ui.jsx';
import useConversationStore from '../hooks/useConversationStore.js';
import {
  conversationActions,
  formatListTime,
  matchesChannel,
  previewText,
  sortedConversations,
  summarise,
} from '../lib/conversationStore.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'sign', label: 'Sign' },
  { id: 'text', label: 'Text' },
  { id: 'speech', label: 'Speech' },
];

export default function ConversationsPage() {
  const navigate = useNavigate();
  const store = useConversationStore();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState('all');
  const [pendingDelete, setPendingDelete] = useState(null);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sortedConversations(store).filter(
      (conversation) =>
        matchesChannel(conversation, channel) &&
        (!term ||
          conversation.title.toLowerCase().includes(term) ||
          conversation.messages.some((message) => message.text.toLowerCase().includes(term))),
    );
  }, [store, query, channel]);

  const startNew = () => {
    conversationActions.startNew();
    navigate('/live');
  };

  const pending = pendingDelete ? store.conversations.find((item) => item.id === pendingDelete) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <AppPageHeader
        title="Conversations"
        description="Your ongoing and past conversations. Every message shows how it was entered: by sign, by text, or by speech."
        actions={
          <button type="button" onClick={startNew} className={buttonClass('primary')}>
            <MessageSquarePlus size={16} aria-hidden="true" />
            New Conversation
          </button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor={searchId} className="sr-only">
            Search conversations
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations…"
            className="h-9 w-full rounded-lg border border-app-border bg-app-surface px-3.5 text-sm text-app-text placeholder:text-app-muted focus:border-accent/60 focus:outline-none"
          />
        </div>
        <div role="group" aria-label="Filter by how messages were entered" className="flex gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={channel === item.id}
              onClick={() => setChannel(item.id)}
              className={`h-8 rounded-full px-3.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                channel === item.id ? 'bg-accent text-app-bg' : 'border border-app-border text-app-muted hover:text-app-text'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {store.conversations.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No conversations yet">
          <span className="block">Start a conversation in Live Studio. It is saved here after your first message.</span>
          <button type="button" onClick={startNew} className={`${buttonClass('secondary', 'mt-4')}`}>
            Start a conversation
          </button>
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No conversations match">
          Try another search, or choose a different filter.
        </EmptyState>
      ) : (
        <ul aria-label="Conversations" className="divide-y divide-app-border rounded-xl border border-app-border bg-app-surface">
          {rows.map((conversation) => {
            const view = summarise(conversation);
            return (
              <li key={conversation.id} className="flex items-center gap-2 px-3 py-1">
                <Link
                  to={`/conversations/${conversation.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3.5 rounded-lg py-3 pl-1 pr-2 transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-hover" aria-hidden="true">
                    <MessageSquare size={17} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-app-text">{conversation.title}</span>
                      {conversation.favourite && <Star size={12} fill="currentColor" className="shrink-0 text-accent-hover" aria-label="Favourite" />}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-app-muted">{previewText(conversation)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <time dateTime={new Date(view.lastAt).toISOString()} className="block text-xs tabular-nums text-app-muted">
                      {formatListTime(view.lastAt)}
                    </time>
                    <span className="block text-[11px] text-app-muted/80">
                      {view.messageCount} {view.messageCount === 1 ? 'message' : 'messages'}
                    </span>
                  </span>
                </Link>
                <ActionMenu
                  label={`Actions for ${conversation.title}`}
                  items={[
                    { label: 'Open', icon: MessageSquare, onSelect: () => navigate(`/conversations/${conversation.id}`) },
                    {
                      label: conversation.favourite ? 'Remove from favourites' : 'Add to favourites',
                      icon: Star,
                      onSelect: () => conversationActions.toggleFavourite(conversation.id),
                    },
                    { label: 'Delete', icon: Trash2, danger: true, onSelect: () => setPendingDelete(conversation.id) },
                  ]}
                />
              </li>
            );
          })}
        </ul>
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

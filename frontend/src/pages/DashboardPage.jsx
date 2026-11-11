import { ArrowRight, CalendarDays, ChevronRight, Hand, MessageSquare, MessageSquarePlus, Plus, Star, Trash2, Video, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ActionMenu from '../components/app/ActionMenu.jsx';
import ConfirmDialog from '../components/app/ConfirmDialog.jsx';
import { buttonClass } from '../components/app/ui.jsx';
import useConversationStore from '../hooks/useConversationStore.js';
import usePhraseFavourites from '../hooks/usePhraseFavourites.js';
import { USER_PROFILE } from '../config/userProfile.js';
import { conversationActions, formatListTime, previewText, sortedConversations } from '../lib/conversationStore.js';

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function Section({ id, title, action, children }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col rounded-xl border border-app-border bg-app-surface p-5">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="text-base font-semibold text-app-text">
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function ViewAll({ to, label }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 rounded text-xs font-medium text-accent-hover transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
      {label}
      <ChevronRight size={13} aria-hidden="true" />
    </Link>
  );
}

function QuickAccessRow({ to, onClick, icon: Icon, title, description }) {
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-hover">
        <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-app-text">{title}</span>
        <span className="block text-xs text-app-muted">{description}</span>
      </span>
      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-app-muted" />
    </>
  );
  const className =
    'flex items-center gap-3 rounded-lg border border-app-border bg-app-bg/60 p-3 transition-colors hover:border-accent/40 hover:bg-accent/[0.06] focus-visible:outline-2 focus-visible:outline-accent';
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={`${className} w-full text-left`}>
      {content}
    </button>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const store = useConversationStore();
  const favourites = usePhraseFavourites();
  const [pendingDelete, setPendingDelete] = useState(null);
  const [notice, setNotice] = useState('');

  const now = new Date();
  const conversations = sortedConversations(store);
  const recent = conversations.slice(0, 4);
  const pending = pendingDelete ? store.conversations.find((item) => item.id === pendingDelete) : null;

  const startNewConversation = () => {
    conversationActions.startNew();
    navigate('/live');
  };

  const sendSavedPhrase = (text) => {
    conversationActions.append({ text, source: 'phrase', speaker: 'deaf' });
    setNotice(`Sent to your conversation: ${text}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-app-text sm:text-3xl">
            {greetingFor(now)}, {USER_PROFILE.firstName}
          </h1>
          <p className="mt-1 text-sm text-app-muted">Ready to communicate without barriers?</p>
        </div>
        <p className="flex h-9 shrink-0 items-center gap-2 self-start rounded-lg border border-app-border bg-app-surface px-3 text-sm text-app-muted">
          <CalendarDays size={15} aria-hidden="true" />
          <time dateTime={now.toISOString()}>
            {now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </time>
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="live-hero-title"
          className="relative flex min-h-[15rem] flex-col justify-between overflow-hidden rounded-xl border border-app-border bg-app-surface p-6"
        >
          <div className="relative z-10 max-w-md">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20 text-accent-hover" aria-hidden="true">
              <Video size={18} strokeWidth={1.8} />
            </span>
            <h2 id="live-hero-title" className="mt-4 text-xl font-semibold text-app-text">
              Start a Live Conversation
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-app-muted">
              Use your camera to sign, then check the recognised text and send it. Chat with text or speech, and
              communicate in real time.
            </p>
          </div>
          <div className="relative z-10 mt-6">
            <Link to="/live" className={buttonClass('primary', 'px-4')}>
              Open Live Studio
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute -right-6 top-1/2 hidden -translate-y-1/2 md:block">
            <div className="flex h-44 w-44 rotate-[-8deg] items-center justify-center rounded-2xl border border-accent/25 bg-accent/[0.08]">
              <Hand size={84} strokeWidth={1.1} className="text-accent/70" />
            </div>
          </div>
        </section>

        <section aria-labelledby="quick-access-title" className="flex flex-col rounded-xl border border-app-border bg-app-surface p-5">
          <h2 id="quick-access-title" className="mb-3 text-base font-semibold text-app-text">
            Quick Access
          </h2>
          <div className="flex flex-1 flex-col gap-2.5">
            <QuickAccessRow to="/phrases" icon={Zap} title="Quick Phrases" description="Common and emergency phrases" />
            <QuickAccessRow onClick={startNewConversation} icon={MessageSquarePlus} title="New Conversation" description="Start a text or speech chat" />
          </div>
        </section>
      </div>

      {notice && (
        <p role="status" className="text-xs text-app-muted">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          id="recent-conversations-title"
          title="Recent Conversations"
          action={<ViewAll to="/conversations" label="View all" />}
        >
          {recent.length === 0 ? (
            <div className="rounded-lg border border-dashed border-app-border px-4 py-8 text-center">
              <p className="text-sm font-medium text-app-text">No conversations yet</p>
              <p className="mt-1 text-xs text-app-muted">Your conversations appear here after your first message.</p>
            </div>
          ) : (
            <ul className="divide-y divide-app-border">
              {recent.map((conversation) => (
                <li key={conversation.id} className="flex items-center gap-2 py-1">
                  <Link
                    to={`/conversations/${conversation.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2.5 pr-2 transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-app-muted" aria-hidden="true">
                      <MessageSquare size={16} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-app-text">{conversation.title}</span>
                        {conversation.favourite && <Star size={11} fill="currentColor" className="shrink-0 text-accent-hover" aria-label="Favourite" />}
                      </span>
                      <span className="block truncate text-xs text-app-muted">{previewText(conversation)}</span>
                    </span>
                    <time dateTime={new Date(conversation.updatedAt).toISOString()} className="shrink-0 text-xs tabular-nums text-app-muted">
                      {formatListTime(conversation.updatedAt)}
                    </time>
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
              ))}
            </ul>
          )}
        </Section>

        <Section
          id="saved-phrases-title"
          title="Saved Phrases"
          action={<ViewAll to="/phrases?category=favourites" label="View all" />}
        >
          {favourites.length === 0 ? (
            <div className="rounded-lg border border-dashed border-app-border px-4 py-8 text-center">
              <p className="text-sm font-medium text-app-text">No saved phrases yet</p>
              <p className="mt-1 text-xs text-app-muted">
                Star a phrase in{' '}
                <Link to="/phrases" className="text-accent-hover hover:underline">
                  Quick Phrases
                </Link>{' '}
                to keep it here.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {favourites.slice(0, 5).map((item) => (
                <li key={item.text} className="flex items-center gap-2.5 rounded-lg border border-app-border bg-app-bg/60 py-1.5 pl-3 pr-1.5">
                  <Star size={14} fill="currentColor" aria-hidden="true" className="shrink-0 text-accent-hover" />
                  <span className="min-w-0 flex-1 truncate text-sm text-app-text">{item.text}</span>
                  <button
                    type="button"
                    onClick={() => sendSavedPhrase(item.text)}
                    aria-label={`Send to conversation: ${item.text}`}
                    title="Send to conversation"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-app-muted transition-colors hover:bg-accent/15 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Plus size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

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

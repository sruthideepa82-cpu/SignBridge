import { ArrowLeft, Check, Copy, Pencil, RotateCcw, Star, Type, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ConfirmDialog from '../components/app/ConfirmDialog.jsx';
import { buttonClass, EmptyState } from '../components/app/ui.jsx';
import MessageBubble, { formatTime } from '../components/conversation/MessageBubble.jsx';
import MessageComposer from '../components/conversation/MessageComposer.jsx';
import useConversationStore from '../hooks/useConversationStore.js';
import { conversationActions, findConversation, transcriptText } from '../lib/conversationStore.js';
import { PHRASE_CATEGORIES } from '../lib/quickPhrases.js';
import { stopSpeaking, speak, isSpeechSupported } from '../lib/speech.js';

function RenameField({ initial, onSave, onCancel }) {
  const [value, setValue] = useState(initial);
  const id = useId();
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onSave(value);
      }}
    >
      <label htmlFor={id} className="sr-only">
        Conversation name
      </label>
      <input
        id={id}
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
        maxLength={80}
        className="h-9 min-w-0 flex-1 rounded-lg border border-accent/50 bg-app-bg px-3 text-sm text-app-text focus:outline-none"
      />
      <button type="submit" disabled={!value.trim()} className={buttonClass('primary', 'px-3')}>
        <Check size={14} aria-hidden="true" />
        Save
      </button>
      <button type="button" onClick={onCancel} className={buttonClass('ghost', 'w-9 px-0')} aria-label="Cancel rename">
        <X size={14} aria-hidden="true" />
      </button>
    </form>
  );
}

// One conversation: its messages, sign-recognised or typed or spoken, and a composer to reply.
export default function ConversationDetailPage() {
  const { conversationId } = useParams();
  const store = useConversationStore();
  const conversation = findConversation(store, conversationId);
  const [sender, setSender] = useState('deaf');
  const [renaming, setRenaming] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [phraseCategory, setPhraseCategory] = useState('greetings');
  const [notice, setNotice] = useState('');
  const speechSupported = isSpeechSupported();

  useEffect(() => () => stopSpeaking(), []);

  // Opening a conversation makes it the one Live Studio continues.
  useEffect(() => {
    if (conversation) conversationActions.open(conversation.id);
  }, [conversation?.id]);

  if (!conversation) {
    return (
      <div className="mx-auto w-full max-w-[1000px] px-4 py-6 sm:px-6 lg:px-8">
        <EmptyState title="Conversation not found">
          It may have been deleted from this browser.{' '}
          <Link to="/conversations" className="font-medium text-accent-hover hover:underline">
            Back to conversations
          </Link>
        </EmptyState>
      </div>
    );
  }

  const messages = conversation.messages;
  const phrases = PHRASE_CATEGORIES.find((item) => item.id === phraseCategory)?.phrases ?? [];
  const savedCount = messages.filter((message) => message.saved).length;

  const copyConversation = async () => {
    setNotice('');
    try {
      await navigator.clipboard.writeText(transcriptText(conversation));
      setNotice('Conversation copied to the clipboard.');
    } catch {
      setNotice('Copying is not available in this browser.');
    }
  };

  const speakMessage = (text) => {
    setNotice('');
    try {
      speak(text);
    } catch (error) {
      setNotice(error.message);
    }
  };

  const pending = pendingDelete ? messages.find((message) => message.id === pendingDelete) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <Link to="/conversations" className="inline-flex w-fit items-center gap-1.5 text-sm text-app-muted transition-colors hover:text-app-text">
        <ArrowLeft size={15} aria-hidden="true" />
        All conversations
      </Link>

      <section aria-labelledby="thread-title" className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-app-border bg-app-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border px-4 py-3.5">
          {renaming ? (
            <RenameField
              initial={conversation.title}
              onSave={(title) => {
                conversationActions.rename(conversation.id, title);
                setRenaming(false);
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <div className="min-w-0">
              <h1 id="thread-title" className="truncate text-lg font-semibold text-app-text">
                {conversation.title}
              </h1>
              <p className="mt-0.5 text-xs text-app-muted" aria-live="polite">
                {messages.length} {messages.length === 1 ? 'message' : 'messages'}
                {savedCount ? ` · ${savedCount} saved` : ''} · Last activity {formatTime(conversation.updatedAt)}
              </p>
            </div>
          )}

          {!renaming && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => setRenaming(true)} className={buttonClass('ghost', 'px-2.5')}>
                <Pencil size={14} aria-hidden="true" />
                Rename
              </button>
              <button
                type="button"
                onClick={() => conversationActions.toggleFavourite(conversation.id)}
                aria-pressed={conversation.favourite}
                className={buttonClass('ghost', `px-2.5 ${conversation.favourite ? 'text-accent-hover' : ''}`)}
              >
                <Star size={14} fill={conversation.favourite ? 'currentColor' : 'none'} aria-hidden="true" />
                Favourite
              </button>
              <button
                type="button"
                onClick={() => setLargeText((value) => !value)}
                aria-pressed={largeText}
                className={buttonClass('ghost', 'px-2.5')}
              >
                <Type size={14} aria-hidden="true" />
                {largeText ? 'Standard text' : 'Large text'}
              </button>
              <button type="button" onClick={copyConversation} disabled={messages.length === 0} className={buttonClass('ghost', 'px-2.5')}>
                <Copy size={14} aria-hidden="true" />
                Copy
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                disabled={messages.length === 0}
                className={buttonClass('ghost', 'px-2.5 hover:text-danger')}
              >
                <RotateCcw size={14} aria-hidden="true" />
                Clear
              </button>
            </div>
          )}
        </header>

        {notice && (
          <p role="status" className="border-b border-app-border px-4 py-2 text-xs text-app-muted">
            {notice}
          </p>
        )}

        <div className="min-h-[18rem] flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-medium text-app-text">No messages in this conversation</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-app-muted">
                Reply below, insert a phrase, or sign in Live Studio.
              </p>
            </div>
          ) : (
            <ol aria-label="Messages" className="flex flex-col gap-4">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  largeText={largeText}
                  onEdit={(text) => conversationActions.editMessage(conversation.id, message.id, text)}
                  onDelete={() => setPendingDelete(message.id)}
                  onToggleSaved={() => conversationActions.toggleSaved(conversation.id, message.id)}
                  onSpeak={speechSupported ? speakMessage : undefined}
                />
              ))}
            </ol>
          )}
        </div>

        <div className="space-y-3 border-t border-app-border p-3">
          <details className="group rounded-lg border border-app-border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium text-app-muted hover:text-app-text focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              Insert a ready phrase
              <span className="transition-transform group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="border-t border-app-border p-3">
              <label htmlFor="conversation-phrase-category" className="sr-only">
                Phrase category
              </label>
              <select
                id="conversation-phrase-category"
                value={phraseCategory}
                onChange={(event) => setPhraseCategory(event.target.value)}
                className="mb-2.5 h-8 rounded-md border border-app-border bg-app-bg px-2 text-xs text-app-text focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
              >
                {PHRASE_CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <ul className="flex flex-wrap gap-2">
                {phrases.map((phrase) => (
                  <li key={phrase}>
                    <button
                      type="button"
                      onClick={() => conversationActions.append({ text: phrase, source: 'phrase', speaker: sender, conversationId: conversation.id })}
                      className="rounded-lg border border-app-border bg-app-bg px-2.5 py-1.5 text-left text-xs text-app-text transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {phrase}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </details>

          <MessageComposer
            id="conversation-composer"
            speaker={sender}
            onSpeakerChange={setSender}
            onSend={({ text, source, speaker }) => conversationActions.append({ text, source, speaker, conversationId: conversation.id })}
          />
        </div>
      </section>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all messages in this conversation?"
        description="The conversation stays in your list, but all of its messages are removed from this browser. This cannot be undone."
        confirmLabel="Clear messages"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          conversationActions.clear(conversation.id);
          setConfirmClear(false);
        }}
      />

      <ConfirmDialog
        open={pending !== null}
        title="Delete this message?"
        description="The message is removed from this browser. This cannot be undone."
        confirmLabel="Delete message"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          conversationActions.removeMessage(conversation.id, pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

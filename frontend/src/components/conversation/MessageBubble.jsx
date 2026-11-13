import { Bookmark, Check, Hand, Keyboard, Mic, Pencil, Trash2, Volume2, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { SOURCES, SPEAKERS } from '../../lib/conversationStore.js';

const SOURCE_ICONS = { sign: Hand, typed: Keyboard, speech: Mic, phrase: Zap };

export function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SourceTag({ source }) {
  return <span className="text-xs text-app-muted">{SOURCES[source]}</span>;
}

const ACTION =
  'flex h-7 w-7 items-center justify-center rounded-md text-app-muted transition-colors hover:bg-white/[0.06] hover:text-app-text focus-visible:outline-2 focus-visible:outline-accent';

// One message in a conversation. The icon shows how it was entered; the label shows who sent it.
export default function MessageBubble({ message, largeText, onEdit, onDelete, onToggleSaved, onSpeak }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const Icon = SOURCE_ICONS[message.source] ?? Keyboard;
  const shortText = message.text.length > 32 ? `${message.text.slice(0, 29)}...` : message.text;
  const fromSign = message.source === 'sign';

  const startEdit = () => {
    setDraft(message.text);
    setEditing(true);
  };

  const saveEdit = () => {
    if (!draft.trim()) return;
    onEdit?.(draft);
    setEditing(false);
  };

  return (
    <li className="group flex gap-3">
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          fromSign ? 'bg-accent/20 text-accent-hover' : 'bg-white/[0.05] text-app-muted'
        }`}
        aria-hidden="true"
      >
        <Icon size={16} strokeWidth={1.8} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-app-text">{SPEAKERS[message.speaker]}</span>
          <span className="text-app-muted">· {SOURCES[message.source]}</span>
          {message.experimental && (
            <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
              Experimental – Unverified Dataset
            </span>
          )}
          {message.edited && <span className="italic text-app-muted">edited</span>}
          {message.saved && (
            <span className="inline-flex items-center gap-1 text-accent-hover">
              <Bookmark size={11} fill="currentColor" aria-hidden="true" />
              Saved
            </span>
          )}
          <time dateTime={new Date(message.at).toISOString()} className="ml-auto shrink-0 tabular-nums text-app-muted">
            {formatTime(message.at)}
          </time>
        </div>

        {editing ? (
          <div className="mt-1.5">
            <label htmlFor={`edit-${message.id}`} className="sr-only">
              Edit message
            </label>
            <textarea
              id={`edit-${message.id}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  saveEdit();
                }
                if (event.key === 'Escape') setEditing(false);
              }}
              rows={2}
              className="w-full resize-none rounded-lg border border-accent/50 bg-app-bg p-2.5 text-sm text-app-text focus:outline-none"
            />
            <div className="mt-1.5 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-app-muted hover:bg-white/[0.06] hover:text-app-text"
              >
                <X size={13} aria-hidden="true" />
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={!draft.trim()}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-2.5 text-xs font-semibold text-app-bg hover:bg-accent-hover disabled:opacity-40"
              >
                <Check size={13} aria-hidden="true" />
                Save edit
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1.5 flex items-start gap-2">
            <p
              className={`min-w-0 flex-1 whitespace-pre-wrap break-words rounded-xl border px-3.5 py-2.5 leading-relaxed text-app-text ${
                fromSign ? 'border-accent/30 bg-accent/10' : 'border-app-border bg-app-raised'
              } ${largeText ? 'text-2xl' : 'text-sm'} ${fromSign ? 'font-medium' : ''}`}
            >
              {message.text}
            </p>
            <div className="flex shrink-0 flex-col gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
              {onToggleSaved && (
                <button
                  type="button"
                  onClick={onToggleSaved}
                  aria-pressed={message.saved}
                  aria-label={`${message.saved ? 'Remove saved' : 'Save'} message: ${shortText}`}
                  title={message.saved ? 'Remove from saved' : 'Save message'}
                  className={`${ACTION} ${message.saved ? 'text-accent-hover' : ''}`}
                >
                  <Bookmark size={14} fill={message.saved ? 'currentColor' : 'none'} aria-hidden="true" />
                </button>
              )}
              {onEdit && (
                <button type="button" onClick={startEdit} aria-label={`Edit message: ${shortText}`} title="Edit" className={ACTION}>
                  <Pencil size={14} aria-hidden="true" />
                </button>
              )}
              {onSpeak && (
                <button type="button" onClick={() => onSpeak(message.text)} aria-label={`Speak message: ${shortText}`} title="Speak" className={ACTION}>
                  <Volume2 size={14} aria-hidden="true" />
                </button>
              )}
              {onDelete && (
                <button type="button" onClick={onDelete} aria-label={`Delete message: ${shortText}`} title="Delete" className={`${ACTION} hover:text-danger`}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

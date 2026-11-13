import { Activity, MessageSquare } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { conversationActions } from '../../lib/conversationStore.js';
import LandmarkInfoPanel from '../hands/LandmarkInfoPanel.jsx';
import RecognitionHistoryPanel from '../recognition/RecognitionHistoryPanel.jsx';
import MessageBubble from '../conversation/MessageBubble.jsx';
import MessageComposer from '../conversation/MessageComposer.jsx';
import RoadmapPanel from '../translator/RoadmapPanel.jsx';
import TranslatorStatusPanel from '../translator/TranslatorStatusPanel.jsx';
import RecognitionStatus from './RecognitionStatus.jsx';
import SignDraft from './SignDraft.jsx';

const TABS = [
  { id: 'conversation', label: 'Conversation', icon: MessageSquare },
  { id: 'recognition', label: 'Recognition', icon: Activity },
];

// Right-hand panel of Live Studio with two tabs. The Conversation tab holds the messages, the editable sign draft
// and the composer. The Recognition tab shows what the recognizer and hand tracker are doing.
export default function ConversationPanel({
  conversation,
  largeText,
  draft,
  onDraftChange,
  signBuffer,
  onSendDraft,
  onDiscardDraft,
  onAddSpace,
  onSendReply,
  recognitionProps,
  history,
  landmarks,
  cameraLive,
  recognition,
  recognitionError,
  draftControls,
}) {
  const [tab, setTab] = useState('conversation');
  const listRef = useRef(null);
  const idBase = useId();
  const messages = conversation?.messages ?? [];

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, draft.length]);

  return (
    <section aria-label="Conversation and recognition" className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-app-border bg-app-surface xl:min-h-0">
      <div role="tablist" aria-label="Live studio panels" className="grid grid-cols-2 border-b border-app-border p-1.5">
        {TABS.map((item) => {
          const Icon = item.icon;
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${idBase}-${item.id}-tab`}
              aria-selected={selected}
              aria-controls={`${idBase}-${item.id}-panel`}
              onClick={() => setTab(item.id)}
              className={`flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                selected ? 'bg-app-raised text-app-text' : 'text-app-muted hover:text-app-text'
              }`}
            >
              <Icon size={15} aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'conversation' ? (
        <div role="tabpanel" id={`${idBase}-conversation-panel`} aria-labelledby={`${idBase}-conversation-tab`} className="flex min-h-0 flex-1 flex-col">
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm font-medium text-app-text">No messages yet</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-app-muted">
                  Hold a sign steady to draft text, use a quick phrase, or type below. Nothing is sent until you send it.
                </p>
              </div>
            ) : (
              <ol aria-label="Conversation" className="flex flex-col gap-4">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    largeText={largeText}
                    onEdit={(text) => conversationActions.editMessage(conversation.id, message.id, text)}
                    onDelete={() => conversationActions.removeMessage(conversation.id, message.id)}
                    onToggleSaved={() => conversationActions.toggleSaved(conversation.id, message.id)}
                  />
                ))}
              </ol>
            )}
            <div className="mt-4">
              <SignDraft
                draft={draft}
                onDraftChange={onDraftChange}
                items={signBuffer.items}
                holding={signBuffer.holding}
                onUndo={() => signBuffer.undo()}
                onAddSpace={onAddSpace}
                onDiscard={onDiscardDraft}
                onSend={onSendDraft}
                controls={draftControls}
              />
            </div>
          </div>

          <div className="border-t border-app-border p-3">
            <MessageComposer id="live-composer" speaker="hearing" onSend={onSendReply} placeholder="Reply as the hearing participant…" />
          </div>
        </div>
      ) : (
        <div
          role="tabpanel"
          id={`${idBase}-recognition-panel`}
          aria-labelledby={`${idBase}-recognition-tab`}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4"
        >
          <RecognitionStatus {...recognitionProps} />

          <details className="group rounded-lg border border-app-border">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium text-app-muted transition-colors hover:text-app-text focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              Technical details
              <span className="transition-transform duration-200 group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="space-y-4 border-t border-app-border p-3">
              <LandmarkInfoPanel landmarks={landmarks} cameraLive={cameraLive} error={recognitionProps.landmarkError} />
              <TranslatorStatusPanel recognition={recognition} error={recognitionError} cameraLive={cameraLive} />
              <RoadmapPanel />
              <RecognitionHistoryPanel entries={history.entries} onClear={history.clear} />
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

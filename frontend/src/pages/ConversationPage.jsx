import { Mic, MicOff, RotateCcw, Send, Type, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../components/app/ConfirmDialog.jsx';
import { AppPageHeader, Panel, buttonClass, StatusDot } from '../components/app/ui.jsx';
import useSpeechRecognition from '../hooks/useSpeechRecognition.js';
import { PHRASE_CATEGORIES } from '../lib/quickPhrases.js';
import { clearMessages, loadMessages, makeMessage, saveMessages, SPEAKERS } from '../lib/conversationStore.js';
import { isSpeechSupported, speak, stopSpeaking } from '../lib/speech.js';

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Message({ message, largeText, onSpeak, speechSupported }) {
  const fromDeaf = message.speaker === 'deaf';
  return (
    <li className={`flex ${fromDeaf ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] sm:max-w-[70%] ${fromDeaf ? 'items-end' : 'items-start'} flex flex-col`}>
        <p className="mb-1 text-xs text-app-muted">
          <span className="font-medium text-app-text">{SPEAKERS[message.speaker]}</span> · {formatTime(message.at)}
        </p>
        <div
          className={`rounded-xl border px-4 py-2.5 leading-relaxed text-app-text ${
            fromDeaf ? 'border-lime-signal/30 bg-lime-signal/10' : 'border-app-border bg-app-surface'
          } ${largeText ? 'text-2xl' : 'text-base'}`}
        >
          {message.text}
        </div>
        {!fromDeaf && speechSupported && (
          <button
            type="button"
            onClick={() => onSpeak(message.text)}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-app-muted hover:bg-white/5 hover:text-app-text"
            aria-label={`Speak message from ${SPEAKERS[message.speaker]}`}
          >
            <Volume2 size={13} aria-hidden="true" />
            Speak
          </button>
        )}
      </div>
    </li>
  );
}

export default function ConversationPage() {
  const [messages, setMessages] = useState(() => loadMessages());
  const [draft, setDraft] = useState('');
  const [speaker, setSpeaker] = useState('deaf');
  const [largeText, setLargeText] = useState(false);
  const [phraseCategory, setPhraseCategory] = useState('everyday');
  const [confirmReset, setConfirmReset] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const logRef = useRef(null);
  const speech = useSpeechRecognition();
  const speechSupported = isSpeechSupported();
  const listening = speech.status === 'listening';

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages.length]);

  useEffect(() => () => stopSpeaking(), []);

  const commit = (next) => {
    setMessages(next);
    saveMessages(next);
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    commit([...messages, makeMessage(speaker, text)]);
    setDraft('');
  };

  const onComposerKey = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const insertIntoDraft = (chunk) => {
    setDraft((current) => (current && !current.endsWith(' ') ? `${current} ${chunk}` : `${current}${chunk}`));
  };

  const toggleVoice = () => {
    if (listening) speech.stop();
    else speech.start(insertIntoDraft);
  };

  const speakText = (text) => {
    setSpeechError('');
    try {
      speak(text);
    } catch (error) {
      setSpeechError(error.message);
    }
  };

  const phrases = PHRASE_CATEGORIES.find((item) => item.id === phraseCategory)?.phrases ?? [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-8 sm:px-6">
      <AppPageHeader
        eyebrow="Communicate"
        title="Conversation Space"
        description="Exchange messages in both directions. Each message shows who sent it."
        actions={
          <>
            <button
              type="button"
              onClick={() => setLargeText((value) => !value)}
              aria-pressed={largeText}
              className={buttonClass('ghost')}
            >
              <Type size={15} aria-hidden="true" />
              {largeText ? 'Standard text' : 'Large text'}
            </button>
            <button type="button" onClick={() => setConfirmReset(true)} disabled={messages.length === 0} className={buttonClass('danger')}>
              <RotateCcw size={15} aria-hidden="true" />
              Reset conversation
            </button>
          </>
        }
      />

      <Panel className="flex min-h-[22rem] flex-col p-0" labelledBy="conversation-log-title">
        <h2 id="conversation-log-title" className="sr-only">
          Messages
        </h2>
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm font-medium text-app-text">No messages yet</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-app-muted">
              Type a message below, use voice input, or insert a phrase. Messages stay in this browser.
            </p>
          </div>
        ) : (
          <ol ref={logRef} role="log" aria-live="polite" aria-label="Conversation" className="flex max-h-[28rem] flex-1 flex-col gap-4 overflow-y-auto p-5">
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                largeText={largeText}
                onSpeak={speakText}
                speechSupported={speechSupported}
              />
            ))}
          </ol>
        )}
      </Panel>

      {speechError && (
        <p role="alert" className="text-xs text-red-200">
          {speechError}
        </p>
      )}

      <Panel labelledBy="composer-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="composer-title" className="text-sm font-semibold text-app-text">
            Send a message
          </h2>
          <div role="radiogroup" aria-label="Who is sending" className="flex rounded-lg border border-app-border p-0.5">
            {Object.entries(SPEAKERS).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={speaker === id}
                onClick={() => setSpeaker(id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-lime-signal ${
                  speaker === id ? 'bg-lime-signal/15 text-lime-signal' : 'text-app-muted hover:text-app-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label htmlFor="composer" className="sr-only">
          Message
        </label>
        <textarea
          id="composer"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposerKey}
          rows={3}
          placeholder="Type a message. Enter sends, Shift+Enter starts a new line."
          className="mt-3 w-full resize-none rounded-lg border border-app-border bg-app-bg p-3 text-base text-app-text placeholder:text-app-muted focus:border-lime-signal/60 focus:outline-none"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleVoice}
            disabled={!speech.supported}
            aria-pressed={listening}
            className={buttonClass(listening ? 'danger' : 'secondary')}
          >
            {listening ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
            {listening ? 'Stop voice input' : 'Voice input'}
          </button>
          <span className="flex items-center gap-1.5 text-xs text-app-muted" aria-live="polite">
            <StatusDot tone={listening ? 'ok' : 'neutral'} />
            {speech.supported ? (listening ? 'Listening' : '') : 'Voice input is not available in this browser'}
          </span>
          <button type="button" onClick={send} disabled={!draft.trim()} className={`${buttonClass('primary')} ml-auto`}>
            <Send size={15} aria-hidden="true" />
            Send
          </button>
        </div>

        <div className="mt-5 border-t border-app-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="phrase-category" className="text-xs font-medium text-app-muted">
              Insert a phrase
            </label>
            <select
              id="phrase-category"
              value={phraseCategory}
              onChange={(event) => setPhraseCategory(event.target.value)}
              className="rounded-md border border-app-border bg-app-bg px-2 py-1 text-xs text-app-text focus:outline-none focus-visible:outline-2 focus-visible:outline-lime-signal"
            >
              {PHRASE_CATEGORIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {phrases.map((phrase) => (
              <li key={phrase}>
                <button
                  type="button"
                  onClick={() => insertIntoDraft(phrase)}
                  className="rounded-lg border border-app-border bg-app-bg px-3 py-1.5 text-left text-xs text-app-text transition-colors hover:border-white/20 focus-visible:outline-2 focus-visible:outline-lime-signal"
                >
                  {phrase}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <ConfirmDialog
        open={confirmReset}
        title="Reset this conversation?"
        description="All messages in this browser will be removed. This cannot be undone."
        confirmLabel="Reset conversation"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          clearMessages();
          setMessages([]);
          setConfirmReset(false);
        }}
      />
    </div>
  );
}

import { Mic, MicOff, Send } from 'lucide-react';
import { useState } from 'react';
import useSpeechRecognition from '../../hooks/useSpeechRecognition.js';
import { SPEAKERS } from '../../lib/conversationStore.js';

// Typed or spoken text for the conversation. Enter sends. Speech input is offered only where the browser has it.
export default function MessageComposer({ id = 'composer', onSend, speaker, onSpeakerChange, placeholder, disabled = false }) {
  const [draft, setDraft] = useState('');
  const [fromSpeech, setFromSpeech] = useState(false);
  const speech = useSpeechRecognition();
  const listening = speech.status === 'listening';

  const appendSpeech = (chunk) => {
    setDraft((current) => (current && !current.endsWith(' ') ? `${current} ${chunk}` : `${current}${chunk}`));
    setFromSpeech(true);
  };

  const toggleVoice = () => {
    if (listening) speech.stop();
    else speech.start(appendSpeech);
  };

  const send = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend({ text, source: fromSpeech ? 'speech' : 'typed', speaker });
    setDraft('');
    setFromSpeech(false);
  };

  return (
    <div className="space-y-2">
      {onSpeakerChange && (
        <div className="flex items-center gap-2">
          <span id={`${id}-sender`} className="text-xs text-app-muted">
            Sending as
          </span>
          <div role="radiogroup" aria-labelledby={`${id}-sender`} className="flex rounded-lg bg-white/[0.04] p-0.5">
            {Object.entries(SPEAKERS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={speaker === value}
                onClick={() => onSpeakerChange(value)}
                className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  speaker === value ? 'bg-app-raised text-app-text' : 'text-app-muted hover:text-app-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex h-11 items-center gap-1.5 rounded-xl border border-app-border bg-app-bg pl-3.5 pr-1.5 transition-colors focus-within:border-accent/60">
        <label htmlFor={id} className="sr-only">
          Message
        </label>
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              send();
            }
          }}
          disabled={disabled}
          placeholder={placeholder ?? 'Type a message…'}
          className="min-w-0 flex-1 bg-transparent text-sm text-app-text placeholder:text-app-muted focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={toggleVoice}
          disabled={!speech.supported || disabled}
          aria-pressed={listening}
          aria-label={listening ? 'Stop voice input' : 'Voice input'}
          title={speech.supported ? (listening ? 'Stop voice input' : 'Voice input') : 'Voice input is not available in this browser'}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${
            listening ? 'bg-danger/15 text-danger' : 'text-app-muted hover:bg-white/[0.06] hover:text-app-text'
          }`}
        >
          {listening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || disabled}
          aria-label="Send"
          title="Send"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-app-bg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={15} aria-hidden="true" />
        </button>
      </div>

      <p className="min-h-4 truncate text-xs text-app-muted" aria-live="polite">
        {!speech.supported
          ? 'Voice input is not available in this browser.'
          : listening
            ? speech.interim || 'Listening…'
            : ''}
      </p>
    </div>
  );
}

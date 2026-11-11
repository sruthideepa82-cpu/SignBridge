import { ArrowLeft, Check, CornerDownLeft, Delete, FlaskConical, Send, Trash2, Undo2, WrapText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppPageHeader, buttonClass, Panel } from '../components/app/ui.jsx';
import { conversationActions } from '../lib/conversationStore.js';
import {
  addLetter,
  addSpace,
  applySuggestion,
  backspace,
  clearAll,
  confirmWord,
  correctLetter,
  createBuilder,
  displayText,
  LETTER_SOURCES,
  playSimulated,
  sendableText,
  suggestions,
  undo,
} from '../lib/wordBuilder.js';

// Simulated sequences for testing the builder only. They are not recognised signs and are labelled as such.
const SIMULATED_SAMPLES = [
  { label: 'HELLO', letters: 'HELLO'.split('') },
  { label: 'HELP', letters: 'HELP'.split('') },
  { label: 'THANK YOU', letters: 'THANK'.split(''), then: 'YOU'.split('') },
];

function LetterChip({ item, index, selected, onSelect }) {
  const simulated = item.source === 'simulated';
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      aria-pressed={selected}
      aria-label={`Letter ${item.char}, ${LETTER_SOURCES[item.source]}. Select to correct.`}
      className={`flex h-10 min-w-10 flex-col items-center justify-center rounded-lg border px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
        selected ? 'border-accent bg-accent/20 text-app-text' : 'border-app-border bg-app-bg text-app-text hover:border-white/20'
      }`}
    >
      <span className="font-semibold leading-none">{item.char}</span>
      <span className={`mt-0.5 text-[9px] leading-none ${simulated ? 'text-warning' : 'text-app-muted'}`}>
        {LETTER_SOURCES[item.source]}
      </span>
    </button>
  );
}

export default function FingerspellingPage() {
  const [builder, setBuilder] = useState(createBuilder);
  const [correcting, setCorrecting] = useState(null);
  const [status, setStatus] = useState('');

  const update = (next) => setBuilder(next);
  const sendState = sendableText(builder);
  const suggestionList = suggestions(builder);
  const text = displayText(builder);
  const hasAny = builder.current.length > 0 || builder.confirmed.length > 0;

  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        setBuilder((state) => undo(state));
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Backspace') {
        event.preventDefault();
        setBuilder((state) => backspace(state));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        setBuilder((state) => confirmWord(state));
      } else if (event.key === ' ') {
        event.preventDefault();
        setBuilder((state) => addSpace(state));
      } else if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault();
        if (correcting !== null) {
          setBuilder((state) => correctLetter(state, correcting, event.key));
          setCorrecting(null);
        } else {
          setBuilder((state) => addLetter(state, event.key, 'manual'));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [correcting]);

  const send = () => {
    if (sendState.error) return;
    conversationActions.append({ text: sendState.text, source: sendState.source, speaker: 'deaf' });
    setBuilder((state) => clearAll(state));
    setStatus(`Sent to your conversation: ${sendState.text}`);
  };

  const playSample = (sample) => {
    setCorrecting(null);
    setBuilder((state) => {
      const afterFirst = confirmWord(playSimulated(state, sample.letters));
      return sample.then ? confirmWord(playSimulated(afterFirst, sample.then)) : afterFirst;
    });
    setStatus(`Simulated input played: ${sample.label}. It is labelled Simulated and cannot be sent.`);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <Link to="/help" className="inline-flex w-fit items-center gap-1.5 text-sm text-app-muted transition-colors hover:text-app-text">
        <ArrowLeft size={15} aria-hidden="true" />
        Help and tools
      </Link>
      <AppPageHeader
        eyebrow="Tools"
        title="Fingerspelling"
        description="Build words one letter at a time. Type on the keyboard, complete words with suggestions, correct a letter, then confirm and send."
      />

      <div role="note" className="rounded-xl border border-app-border bg-app-surface px-4 py-3 text-xs leading-relaxed text-app-muted">
        Letters come from typing here or from simulated test input. No trained alphabet model is loaded, so the app does not recognise signs
        into letters yet. Suggestions only complete the spelling of what you typed.
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Word being built" description="Type A to Z. Space confirms the word. Enter confirms it too." labelledBy="builder-title">
            <div className="min-h-16 rounded-lg border border-app-border bg-app-bg px-4 py-3">
              <p className="break-words text-2xl font-semibold tracking-wide text-app-text" data-testid="builder-text" aria-live="polite">
                {text || <span className="text-base font-normal text-app-muted">Start typing a letter…</span>}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2" aria-label="Letters in the current word">
              {builder.current.length === 0 && <span className="text-xs text-app-muted">No letters in the current word.</span>}
              {builder.current.map((item, index) => (
                <LetterChip
                  key={item.id}
                  item={item}
                  index={index}
                  selected={correcting === index}
                  onSelect={(position) => setCorrecting(correcting === position ? null : position)}
                />
              ))}
            </div>
            {correcting !== null && (
              <p className="mt-3 text-xs text-accent-hover" role="status">
                Correcting letter {correcting + 1}. Press the correct letter, or select the chip again to cancel.
              </p>
            )}

            {suggestionList.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-app-muted">Word suggestions (spelling completions)</p>
                <ul className="flex flex-wrap gap-2" aria-label="Word suggestions">
                  {suggestionList.map((word) => (
                    <li key={word}>
                      <button
                        type="button"
                        onClick={() => update(applySuggestion(builder, word))}
                        className="h-8 rounded-full border border-accent/40 px-3 text-xs font-medium text-accent-hover transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        {word}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2 border-t border-app-border pt-4">
              <button type="button" onClick={() => update(addSpace(builder))} disabled={builder.current.length === 0} className={buttonClass('secondary')}>
                <WrapText size={15} aria-hidden="true" />
                Space
              </button>
              <button type="button" onClick={() => update(backspace(builder))} disabled={!hasAny} className={buttonClass('secondary')}>
                <Delete size={15} aria-hidden="true" />
                Backspace
              </button>
              <button type="button" onClick={() => update(undo(builder))} disabled={builder.history.length === 0} className={buttonClass('secondary')}>
                <Undo2 size={15} aria-hidden="true" />
                Undo last
              </button>
              <button type="button" onClick={() => update(confirmWord(builder))} disabled={builder.current.length === 0} className={buttonClass('secondary')}>
                <Check size={15} aria-hidden="true" />
                Confirm word
              </button>
              <button type="button" onClick={() => update(clearAll(builder))} disabled={!hasAny} className={buttonClass('ghost')}>
                <Trash2 size={15} aria-hidden="true" />
                Clear
              </button>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-app-muted">
              <CornerDownLeft size={12} aria-hidden="true" />
              Keyboard: letters type, Space adds a space, Enter confirms the word, Backspace deletes, Ctrl+Z undoes.
            </p>
          </Panel>

          <Panel title="Send" description="Only confirmed words are sent. Simulated letters are never sent." labelledBy="send-title">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={send} disabled={Boolean(sendState.error)} className={buttonClass('primary')}>
                <Send size={15} aria-hidden="true" />
                Send to conversation
              </button>
              {sendState.error ? (
                <p className="text-xs text-app-muted" role="status">
                  {sendState.error}
                </p>
              ) : (
                <p className="text-xs text-app-muted" role="status">
                  Will be sent as {sendState.source === 'sign' ? 'recognised signs' : 'typed text'}.
                </p>
              )}
            </div>
            {status && <p className="mt-3 text-xs text-app-muted">{status}</p>}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Confirmed words" labelledBy="confirmed-title">
            {builder.confirmed.length === 0 ? (
              <p className="text-xs text-app-muted">Confirmed words appear here. Confirm a word to move it here.</p>
            ) : (
              <ol className="flex flex-col gap-2" aria-label="Confirmed words">
                {builder.confirmed.map((word, index) => (
                  <li key={`${index}-${word.text}`} className="flex items-center justify-between gap-2 rounded-lg border border-app-border px-3 py-2">
                    <span className="font-medium text-app-text">{word.text}</span>
                    <span className="text-[10px] text-app-muted">
                      {word.items.some((item) => item.source === 'simulated') ? 'Contains simulated letters' : 'Ready to send'}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Letter history" description="Every letter in order, with where it came from." labelledBy="history-title">
            {[...builder.confirmed.flatMap((word) => word.items), ...builder.current].length === 0 ? (
              <p className="text-xs text-app-muted">No letters yet.</p>
            ) : (
              <p className="break-words font-mono text-xs leading-relaxed text-app-text">
                {[...builder.confirmed.flatMap((word) => word.items), ...builder.current].map((item) => (
                  <span key={item.id} className={item.source === 'simulated' ? 'text-warning' : ''} title={LETTER_SOURCES[item.source]}>
                    {item.char}
                  </span>
                ))}
              </p>
            )}
          </Panel>

          <Panel title="Simulated input" description="Testing only. These sequences are not model predictions." labelledBy="simulated-title">
            <div className="flex flex-col gap-2">
              {SIMULATED_SAMPLES.map((sample) => (
                <button key={sample.label} type="button" onClick={() => playSample(sample)} className={buttonClass('secondary', 'justify-start')}>
                  <FlaskConical size={15} aria-hidden="true" className="text-warning" />
                  Play {sample.label}
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

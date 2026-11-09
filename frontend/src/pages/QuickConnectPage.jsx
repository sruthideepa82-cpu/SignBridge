import { RotateCcw, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppPageHeader, Panel, buttonClass } from '../components/app/ui.jsx';
import { PHRASE_CATEGORIES } from '../lib/quickPhrases.js';
import { isSpeechSupported, speak, stopSpeaking } from '../lib/speech.js';

const DEFAULT_CATEGORY = 'everyday';

export default function QuickConnectPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('category');
  const categoryId = PHRASE_CATEGORIES.some((item) => item.id === requested) ? requested : DEFAULT_CATEGORY;
  const category = PHRASE_CATEGORIES.find((item) => item.id === categoryId);

  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState(null);
  const [speechError, setSpeechError] = useState('');
  const speechSupported = isSpeechSupported();

  useEffect(() => () => stopSpeaking(), []);

  const choose = (phrase) => {
    setSelected(phrase);
    setDraft(phrase);
    setSpeechError('');
  };

  const changeCategory = (id) => {
    setParams(id === DEFAULT_CATEGORY ? {} : { category: id });
  };

  const reset = () => {
    stopSpeaking();
    setSelected(null);
    setDraft('');
    setSpeechError('');
  };

  const say = () => {
    setSpeechError('');
    try {
      speak(draft);
    } catch (error) {
      setSpeechError(error.message);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <AppPageHeader
        eyebrow="Communicate"
        title="Quick Connect"
        description="Choose a phrase for the situation, then show or speak it. Edit the message first if you need to."
      />

      <div role="group" aria-label="Phrase categories" className="flex gap-2 overflow-x-auto pb-1">
        {PHRASE_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === categoryId}
            onClick={() => changeCategory(item.id)}
            className={`shrink-0 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal ${
              item.id === categoryId
                ? 'border-lime-signal/50 bg-lime-signal/10 text-lime-signal'
                : 'border-app-border text-app-muted hover:text-app-text'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title={category.label}
          description="Tap a phrase to show it."
          labelledBy="phrase-list-title"
        >
          <ul className="grid gap-2.5 sm:grid-cols-2" aria-label={`${category.label} phrases`}>
            {category.phrases.map((phrase) => {
              const isSelected = selected === phrase;
              return (
                <li key={phrase}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => choose(phrase)}
                    className={`flex min-h-16 w-full items-center rounded-lg border px-4 py-3 text-left text-base leading-snug transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal active:scale-[0.99] ${
                      isSelected
                        ? 'border-lime-signal/60 bg-lime-signal/10 text-app-text'
                        : 'border-app-border bg-app-bg text-app-text hover:border-white/20'
                    }`}
                  >
                    {phrase}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel className="lg:col-span-2" title="Message" labelledBy="message-title" description={selected ? 'Edit before you show or speak it.' : 'Nothing selected yet.'}>
          <div aria-live="polite">
            {selected ? (
              <p className="min-h-24 break-words text-2xl font-semibold leading-snug text-app-text" data-testid="shown-message">
                {draft}
              </p>
            ) : (
              <p className="min-h-24 text-sm text-app-muted">Choose a phrase from the list. It will appear here in large text.</p>
            )}
          </div>

          <label htmlFor="quick-message" className="mt-4 block text-xs font-medium text-app-muted">
            Edit message
          </label>
          <textarea
            id="quick-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            disabled={!selected}
            className="mt-1.5 w-full resize-none rounded-lg border border-app-border bg-app-bg p-3 text-sm text-app-text placeholder:text-app-muted focus:border-lime-signal/60 focus:outline-none disabled:opacity-50"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={say} disabled={!selected || !draft.trim() || !speechSupported} className={buttonClass('primary')}>
              <Volume2 size={15} aria-hidden="true" />
              Speak
            </button>
            <button type="button" onClick={reset} disabled={!selected} className={buttonClass('secondary')}>
              <RotateCcw size={15} aria-hidden="true" />
              Reset
            </button>
          </div>

          {!speechSupported && <p className="mt-3 text-xs text-app-muted">Speech output is not available in this browser.</p>}
          {speechError && (
            <p role="alert" className="mt-3 text-xs text-red-200">
              {speechError}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

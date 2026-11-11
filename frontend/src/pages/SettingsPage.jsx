import { Trash2, Volume2 } from 'lucide-react';
import { useId, useState } from 'react';
import ConfirmDialog from '../components/app/ConfirmDialog.jsx';
import { AppPageHeader, buttonClass, Panel } from '../components/app/ui.jsx';
import useConversationStore from '../hooks/useConversationStore.js';
import usePhraseFavourites from '../hooks/usePhraseFavourites.js';
import { TEXT_SCALES, useTextScale } from '../hooks/useAppPreferences.js';
import { PROGRESS_KEY } from '../hooks/usePracticeProgress.js';
import { clearConversationData, summarise } from '../lib/conversationStore.js';
import { clearFavourites } from '../lib/phraseFavourites.js';
import { isSpeechSupported, speak } from '../lib/speech.js';

const SETTINGS_SECTIONS = [
  { id: 'settings-display', label: 'Display' },
  { id: 'settings-speech', label: 'Speech' },
  { id: 'settings-data', label: 'Data in this browser' },
  { id: 'settings-about', label: 'About' },
];

function SettingRow({ title, description, children }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 max-w-md">
        <p className="text-sm font-medium text-app-text">{title}</p>
        {description && <p className="mt-1 text-xs leading-relaxed text-app-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { scaleId, setScaleId } = useTextScale();
  const store = useConversationStore();
  const favourites = usePhraseFavourites();
  const [confirmErase, setConfirmErase] = useState(false);
  const [message, setMessage] = useState('');
  const [speechError, setSpeechError] = useState('');
  const speechSupported = isSpeechSupported();
  const textSizeId = useId();

  const messageTotal = store.conversations.reduce((total, conversation) => total + summarise(conversation).messageCount, 0);

  const testSpeech = () => {
    setSpeechError('');
    try {
      speak('SignBridge speech output is working.');
    } catch (error) {
      setSpeechError(error.message);
    }
  };

  const eraseAll = () => {
    clearConversationData();
    clearFavourites();
    try {
      window.localStorage.removeItem(PROGRESS_KEY);
    } catch {
      // Nothing to clear if storage is blocked.
    }
    setConfirmErase(false);
    setMessage('All conversations, saved phrases and practice progress were removed from this browser.');
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <AppPageHeader
        eyebrow="Account"
        title="Settings"
        description="Adjust how SignBridge looks and sounds, and manage what is stored in this browser."
      />

      <nav aria-label="Settings sections" className="flex gap-4 overflow-x-auto border-b border-app-border text-sm">
        {SETTINGS_SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="shrink-0 border-b-2 border-transparent pb-2.5 text-app-muted transition-colors hover:text-app-text focus-visible:outline-2 focus-visible:outline-accent"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <Panel as="section" labelledBy="settings-display-title" title="Display" className="scroll-mt-6">
        <div id="settings-display" className="divide-y divide-app-border">
          <SettingRow title="Text size" description="Scales all text in the app. Also available from the top bar.">
            <div role="radiogroup" aria-labelledby={textSizeId} className="flex rounded-lg bg-white/[0.04] p-0.5">
              <span id={textSizeId} className="sr-only">
                Text size
              </span>
              {TEXT_SCALES.map((scale) => (
                <button
                  key={scale.id}
                  type="button"
                  role="radio"
                  aria-checked={scale.id === scaleId}
                  onClick={() => setScaleId(scale.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                    scale.id === scaleId ? 'bg-app-raised text-app-text shadow-sm' : 'text-app-muted hover:text-app-text'
                  }`}
                >
                  {scale.label}
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow title="Motion" description="Animations follow your system’s reduced-motion setting." />
        </div>
      </Panel>

      <Panel as="section" labelledBy="settings-speech-title" title="Speech" className="scroll-mt-6">
        <div id="settings-speech" className="divide-y divide-app-border">
          <SettingRow
            title="Speech output"
            description="Speaks text only when you press Speak. Voices come from your browser. Nothing is spoken automatically."
          >
            <button type="button" onClick={testSpeech} disabled={!speechSupported} className={buttonClass('secondary')}>
              <Volume2 size={15} aria-hidden="true" />
              Test voice
            </button>
          </SettingRow>
          <SettingRow
            title="Voice input"
            description="Provided by your browser where it is supported. SignBridge does not receive the audio."
          >
            <span className="text-xs text-app-muted">Available in the message box</span>
          </SettingRow>
        </div>
        {!speechSupported && <p className="mt-3 text-xs text-app-muted">Speech output is not available in this browser.</p>}
        {speechError && (
          <p role="alert" className="mt-3 text-xs text-red-300">
            {speechError}
          </p>
        )}
      </Panel>

      <Panel as="section" labelledBy="settings-data-title" title="Data in this browser" className="scroll-mt-6">
        <div id="settings-data" className="divide-y divide-app-border">
          <SettingRow
            title="Stored here"
            description="Conversations, saved phrases and practice progress are kept only in this browser. They are never uploaded to SignBridge."
          >
            <dl className="grid grid-cols-3 gap-6 text-right text-sm">
              <div>
                <dt className="text-xs text-app-muted">Conversations</dt>
                <dd className="font-semibold tabular-nums text-app-text">{store.conversations.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-app-muted">Messages</dt>
                <dd className="font-semibold tabular-nums text-app-text">{messageTotal}</dd>
              </div>
              <div>
                <dt className="text-xs text-app-muted">Saved phrases</dt>
                <dd className="font-semibold tabular-nums text-app-text">{favourites.length}</dd>
              </div>
            </dl>
          </SettingRow>
          <SettingRow
            title="Erase local data"
            description="Removes every conversation, saved phrase and practice record from this browser. This cannot be undone."
          >
            <button type="button" onClick={() => setConfirmErase(true)} className={buttonClass('danger')}>
              <Trash2 size={15} aria-hidden="true" />
              Erase all local data
            </button>
          </SettingRow>
        </div>
        {message && (
          <p role="status" className="mt-3 text-xs text-app-muted">
            {message}
          </p>
        )}
      </Panel>

      <Panel as="section" labelledBy="settings-about-title" title="About" className="scroll-mt-6">
        <div id="settings-about" className="space-y-2 text-sm leading-relaxed text-app-muted">
          <p>
            SignBridge is an accessibility project for communication between sign-language users and people who do not
            sign. Version 0.1.0.
          </p>
          <p>
            The current recognition model is a pilot that recognises a small set of Indian Sign Language letters. It is
            not a complete sign-language translator. Check recognised text before you rely on it.
          </p>
          <p>Camera frames are processed by the SignBridge backend on the computer that runs it.</p>
        </div>
      </Panel>

      <ConfirmDialog
        open={confirmErase}
        title="Erase all local data?"
        description="All conversations, saved phrases and practice progress will be removed from this browser. This cannot be undone."
        confirmLabel="Erase everything"
        onCancel={() => setConfirmErase(false)}
        onConfirm={eraseAll}
      />
    </div>
  );
}

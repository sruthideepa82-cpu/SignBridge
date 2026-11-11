import { Check, Copy, Mic, MicOff, Trash2, Type } from 'lucide-react';
import { useState } from 'react';
import { AppPageHeader, Panel, buttonClass, StatusDot } from '../components/app/ui.jsx';
import ConfirmDialog from '../components/app/ConfirmDialog.jsx';
import useSpeechRecognition from '../hooks/useSpeechRecognition.js';

const PERMISSION_LABELS = {
  granted: { label: 'Microphone allowed', tone: 'ok' },
  prompt: { label: 'Microphone not yet allowed. You will be asked when you start.', tone: 'warn' },
  denied: { label: 'Microphone blocked in browser settings', tone: 'error' },
  unknown: { label: 'Microphone status unknown until you start', tone: 'neutral' },
};

export default function VoiceToTextPage() {
  const speech = useSpeechRecognition();
  const [text, setText] = useState('');
  const [largeText, setLargeText] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  const listening = speech.status === 'listening';
  const permission = PERMISSION_LABELS[speech.permission] ?? PERMISSION_LABELS.unknown;

  const appendFinal = (chunk) => {
    setText((current) => (current && !current.endsWith(' ') ? `${current} ${chunk}` : `${current}${chunk}`));
  };

  const toggleRecording = () => {
    if (listening) speech.stop();
    else speech.start(appendFinal);
  };

  const copy = async () => {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError('Copying is not available in this browser. Select the text and copy it manually.');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <AppPageHeader
        eyebrow="Communicate"
        title="Voice to Text"
        description="Speak and read the words as text. You can edit the transcript at any time."
      />

      {!speech.supported && (
        <div role="status" className="rounded-lg border border-amber-300/30 bg-amber-300/5 px-4 py-3 text-sm text-amber-200">
          Speech recognition is not available in this browser. Type your message in the transcript below, or try a
          recent version of Chrome or Edge.
        </div>
      )}

      <Panel title="Recording" description="Recognition runs in your browser. Audio is not sent to SignBridge.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleRecording}
              disabled={!speech.supported}
              aria-pressed={listening}
              className={buttonClass(listening ? 'danger' : 'primary', 'min-w-40 justify-center py-3')}
            >
              {listening ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
              {listening ? 'Stop listening' : 'Start listening'}
            </button>
            <div className="text-sm">
              <p className="flex items-center gap-2 text-app-text" aria-live="polite">
                <StatusDot tone={listening ? 'ok' : speech.status === 'error' ? 'error' : 'neutral'} />
                {listening ? 'Listening…' : speech.status === 'error' ? 'Stopped' : 'Not listening'}
              </p>
              <p className="mt-0.5 text-xs text-app-muted">
                <span className="inline-flex items-center gap-1.5">
                  <StatusDot tone={permission.tone} />
                  {permission.label}
                </span>
              </p>
            </div>
          </div>
        </div>

        {speech.error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200">
            {speech.error}
          </p>
        )}

        {listening && speech.interim && (
          <p className="mt-4 rounded-lg bg-app-bg px-3 py-2 text-sm italic text-app-muted" aria-live="polite">
            {speech.interim}
          </p>
        )}
      </Panel>

      <Panel
        title="Transcript"
        description="Edit freely. Speech is added at the end of the text."
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
            <button type="button" onClick={copy} disabled={!text} className={buttonClass('secondary')}>
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={!text}
              className={buttonClass('danger')}
            >
              <Trash2 size={15} aria-hidden="true" />
              Clear
            </button>
          </>
        }
      >
        <label htmlFor="transcript" className="sr-only">
          Transcript
        </label>
        <textarea
          id="transcript"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          placeholder={speech.supported ? 'Press “Start listening”, or type here.' : 'Type your message here.'}
          className={`w-full resize-y rounded-lg border border-app-border bg-app-bg p-4 leading-relaxed text-app-text placeholder:text-app-muted focus:border-accent/60 focus:outline-none ${
            largeText ? 'text-2xl' : 'text-base'
          }`}
        />
        {copyError && (
          <p role="alert" className="mt-2 text-xs text-red-200">
            {copyError}
          </p>
        )}
      </Panel>

      <ConfirmDialog
        open={confirmClear}
        title="Clear the transcript?"
        description="The text will be removed from this page. This cannot be undone."
        confirmLabel="Clear transcript"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setText('');
          setConfirmClear(false);
        }}
      />
    </div>
  );
}

import { Mic, MicOff, Pause, Play, Send, Square, Trash2 } from 'lucide-react';
import { buttonClass, StatusDot } from '../app/ui.jsx';
import { BROWSER_LANGUAGE_LABELS, CAPTION_PHASE, LANGUAGE_OPTIONS, PROVIDER } from '../../lib/captionPhase.js';

const SMALL = 'px-2.5 py-1.5 text-xs';

// Shown while the browser recognizer is in use instead of Gemini. It names the language the browser is asked for.
function BrowserFallbackNotice({ captions }) {
  const languageLabel = BROWSER_LANGUAGE_LABELS[captions.fallbackLanguage] ?? BROWSER_LANGUAGE_LABELS['en-IN'];
  return (
    <div className="space-y-1 rounded-md border border-amber-300/30 bg-amber-300/5 px-3 py-2 text-xs text-amber-100">
      <p>
        <span className="rounded bg-amber-300/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
          Browser fallback
        </span>
      </p>
      <p>Recognizing in {languageLabel}.</p>
      {captions.fallbackAutoLanguage ? (
        <p className="text-amber-200/90">
          Automatic language detection is not available in browser fallback, so English (India) is used.
        </p>
      ) : (
        <p className="text-amber-200/90">Your browser decides whether it can recognize {languageLabel}.</p>
      )}
    </div>
  );
}

const PHASE_LABELS = {
  [CAPTION_PHASE.IDLE]: 'Not listening',
  [CAPTION_PHASE.REQUESTING_PERMISSION]: 'Waiting for microphone permission',
  [CAPTION_PHASE.CONNECTING]: 'Connecting to transcription',
  [CAPTION_PHASE.LISTENING]: 'Listening',
  [CAPTION_PHASE.RECEIVING]: 'Receiving speech',
  [CAPTION_PHASE.PAUSED]: 'Paused',
  [CAPTION_PHASE.RECONNECTING]: 'Connection lost. Reconnecting',
  [CAPTION_PHASE.INTERRUPTED]: 'Listening. Some speech may be missing',
  [CAPTION_PHASE.STOPPING]: 'Stopping',
  [CAPTION_PHASE.ERROR]: 'Transcription stopped',
};

const PHASE_TONES = {
  [CAPTION_PHASE.LISTENING]: 'ok',
  [CAPTION_PHASE.RECEIVING]: 'ok',
  [CAPTION_PHASE.PAUSED]: 'warn',
  [CAPTION_PHASE.RECONNECTING]: 'warn',
  [CAPTION_PHASE.INTERRUPTED]: 'warn',
  [CAPTION_PHASE.ERROR]: 'error',
};

// Changes here are announced to screen readers. Listening and receiving are not, so speech does not cause chatter.
const ANNOUNCED_PHASES = new Set([
  CAPTION_PHASE.REQUESTING_PERMISSION,
  CAPTION_PHASE.CONNECTING,
  CAPTION_PHASE.PAUSED,
  CAPTION_PHASE.RECONNECTING,
  CAPTION_PHASE.INTERRUPTED,
  CAPTION_PHASE.ERROR,
]);

function phaseLabel(captions) {
  if (captions.phase === CAPTION_PHASE.PAUSED) {
    if (captions.userPaused) return 'Paused';
    if (captions.autoPaused) return 'Paused while SignBridge reads aloud';
  }
  return PHASE_LABELS[captions.phase] ?? PHASE_LABELS[CAPTION_PHASE.IDLE];
}

function microphoneNote(captions) {
  if (captions.phase === CAPTION_PHASE.PAUSED && captions.micActive) {
    return 'Microphone is on. Audio is not being sent.';
  }
  if (captions.micActive) return 'Microphone is on.';
  return 'Microphone is off.';
}

// Speech-to-text captions for the hearing participant. The page owns the session (useSpeechCaptions), so this component
// only shows it. Sending uses the existing conversation send, and only the user's confirmed text is sent.
export default function SpeechCaptions({ captions, onSend, idPrefix = 'speech' }) {
  const draftId = `${idPrefix}-draft`;
  const languageId = `${idPrefix}-language`;
  const label = phaseLabel(captions);
  const announced = ANNOUNCED_PHASES.has(captions.phase) ? label : '';
  const tone = PHASE_TONES[captions.phase] ?? (captions.micActive ? 'ok' : 'neutral');
  const hasClearable =
    captions.draft.length > 0 || captions.interimText.length > 0 || captions.interruptedEntries.length > 0 || captions.interrupted;

  return (
    <section aria-labelledby={`${idPrefix}-title`} className="space-y-3 rounded-lg border border-app-border bg-app-bg/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${idPrefix}-title`} className="text-xs font-semibold text-app-text">
          Speech to text
        </h3>
        <p className="flex items-center gap-2 text-xs text-app-text">
          <StatusDot tone={tone} />
          <span>{label}</span>
          {captions.provider === PROVIDER.BROWSER && <span className="text-app-muted">(browser recognition)</span>}
        </p>
      </div>

      <p className="flex items-start gap-2 text-xs text-app-muted">
        {captions.micActive ? (
          <Mic size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
        ) : (
          <MicOff size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        )}
        <span>{microphoneNote(captions)}</span>
      </p>

      <p className="text-[11px] leading-relaxed text-app-muted">
        Your microphone audio is streamed to Google Gemini for speech transcription.
      </p>

      {captions.fallbackActive && <BrowserFallbackNotice captions={captions} />}

      <p role="status" aria-live="polite" className="sr-only">
        {announced}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={captions.start}
          disabled={!captions.canStart}
          className={buttonClass('primary', SMALL)}
        >
          <Mic size={14} aria-hidden="true" />
          Start listening
        </button>
        <button
          type="button"
          onClick={captions.pause}
          disabled={!captions.canPause}
          className={buttonClass('secondary', SMALL)}
        >
          <Pause size={14} aria-hidden="true" />
          Pause
        </button>
        <button
          type="button"
          onClick={captions.resume}
          disabled={!captions.canResume}
          title={captions.autoPaused ? 'Resumes when SignBridge finishes reading aloud' : undefined}
          className={buttonClass('secondary', SMALL)}
        >
          <Play size={14} aria-hidden="true" />
          Resume
        </button>
        <button
          type="button"
          onClick={captions.stop}
          disabled={!captions.canStop}
          className={buttonClass('danger', SMALL)}
        >
          <Square size={14} aria-hidden="true" />
          Stop
        </button>

        <div className="ml-auto flex items-center gap-2 text-xs text-app-muted">
          <label htmlFor={languageId}>Language</label>
          <select
            id={languageId}
            value={captions.language}
            disabled={captions.sessionBusy}
            onChange={(event) => captions.setLanguage(event.target.value)}
            className="h-8 max-w-44 rounded-md border border-app-border bg-app-surface px-2 text-xs text-app-text disabled:opacity-50"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {captions.sessionBusy && (
        <p className="text-[11px] text-app-muted">The language can be changed when listening stops.</p>
      )}

      {captions.error && (
        <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200">
          {captions.error}
        </p>
      )}

      {captions.fallbackOffered && captions.browserSupported && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-app-border bg-app-surface px-3 py-2">
          <p className="text-xs text-app-muted">
            Gemini is unavailable right now. The browser can transcribe instead. Nothing switches until you choose it.
          </p>
          <button type="button" onClick={captions.startFallback} className={buttonClass('secondary', SMALL)}>
            Use browser recognition
          </button>
        </div>
      )}
      {captions.fallbackOffered && !captions.browserSupported && (
        <p className="text-xs text-app-muted">Browser speech recognition is not available in this browser either.</p>
      )}

      {captions.phase === CAPTION_PHASE.RECONNECTING && (
        <p role="status" className="rounded-md border border-amber-300/30 bg-amber-300/5 px-3 py-2 text-xs text-amber-200">
          Speech said while reconnecting is not transcribed.
        </p>
      )}

      {captions.interrupted && (
        <p role="status" className="rounded-md border border-amber-300/30 bg-amber-300/5 px-3 py-2 text-xs text-amber-200">
          Some speech may be missing because the connection dropped. Check the transcript before you send it.
        </p>
      )}

      {captions.interimText && (
        <p aria-live="off" className="rounded-md bg-app-surface px-3 py-2 text-sm italic text-app-muted">
          <span className="sr-only">Speaking now, not final yet: </span>
          {captions.interimText}
        </p>
      )}

      {captions.interruptedEntries.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-amber-200">Incomplete, before the connection dropped:</p>
          <ul className="space-y-1">
            {captions.interruptedEntries.map((entry) => (
              <li key={entry.seq} className="rounded-md bg-app-surface px-3 py-1.5 text-xs italic text-app-muted">
                {entry.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label htmlFor={draftId} className="mb-1 block text-xs font-medium text-app-text">
          Transcript (editable)
        </label>
        <textarea
          id={draftId}
          value={captions.draft}
          onChange={(event) => captions.setDraft(event.target.value)}
          rows={3}
          placeholder="Confirmed speech appears here. Edit it before you send."
          className="block max-h-40 w-full resize-y rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm leading-relaxed text-app-text placeholder:text-app-muted focus:border-accent/60 focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => captions.send(onSend)}
          disabled={!captions.draft.trim()}
          className={buttonClass('primary', SMALL)}
        >
          <Send size={14} aria-hidden="true" />
          Send transcript
        </button>
        <button
          type="button"
          onClick={captions.clear}
          disabled={!hasClearable}
          className={buttonClass('ghost', SMALL)}
        >
          <Trash2 size={14} aria-hidden="true" />
          Clear transcript
        </button>
        {captions.notice && (
          <p role="status" className="text-xs text-app-muted">
            {captions.notice}
          </p>
        )}
        {captions.sendError && (
          <p role="alert" className="text-xs text-red-200">
            {captions.sendError}
          </p>
        )}
      </div>
    </section>
  );
}

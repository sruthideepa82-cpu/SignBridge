import { CircleCheck, Eraser, Pause, Play, Send, Undo2, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { buttonClass, Panel, StatusDot } from '../app/ui.jsx';
import { availableVoices } from '../../lib/speech.js';
import { RATE_OPTIONS } from '../../lib/speechPreferences.js';
import { conversationActions } from '../../lib/conversationStore.js';
import { describeRecognition } from '../../lib/sequenceStatus.js';
import { finishSentence, initialSentence, previewSentence, sentenceReducer, signWords } from '../../lib/sentenceBuilder.js';
import useSequenceRecognition from '../../hooks/useSequenceRecognition.js';
import useSpeechOutput from '../../hooks/useSpeechOutput.js';
import { saveSignTranslation } from '../../services/signTranslationService.js';

const MAX_MESSAGES = 5;

const TONE_TEXT = {
  success: 'text-success',
  info: 'text-accent-hover',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-app-muted',
};

const TONE_DOT = { success: 'ok', info: 'neutral', warning: 'warn', danger: 'error', neutral: 'neutral' };

const SAVE_MESSAGES = {
  saved: 'Sent to the conversation and saved to your account.',
  signed_out: 'Sent to the conversation. Sign in to save it to your account.',
  not_configured: 'Sent to the conversation. Saved in this browser.',
  failed: 'Sent to the conversation. Saving to your account failed; it is kept in this browser.',
};

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Recognised signs, the English draft, and completed sentences. Only the model's recognised words are added;
// nothing is translated from a result that was uncertain, missing or unavailable.
export default function SignSentencePanel({ cameraLive, paused }) {
  const recognitionOn = cameraLive && !paused;
  const { result, error } = useSequenceRecognition(recognitionOn);
  const [sentence, dispatch] = useReducer(sentenceReducer, undefined, initialSentence);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('');
  const speech = useSpeechOutput();

  useEffect(() => {
    if (recognitionOn && result) dispatch({ type: 'result', result });
  }, [result, recognitionOn]);

  useEffect(() => {
    if (!cameraLive) dispatch({ type: 'reset' });
  }, [cameraLive]);

  const recognition = describeRecognition({ cameraLive, paused, error, result, sentence });
  const preview = useMemo(() => previewSentence(sentence), [sentence]);
  const words = signWords(sentence.items);
  const hasSigns = words.length > 0;
  const lastIsSpace = sentence.items.length > 0 && sentence.items[sentence.items.length - 1].type === 'space';
  const detected = result?.status === 'recognized' ? result : null;
  const voices = speech.supported ? availableVoices().filter((voice) => voice.lang?.startsWith('en')) : [];

  const finish = () => {
    const { message } = finishSentence(sentence, { id: newId(), now: Date.now() });
    if (!message) return;
    dispatch({ type: 'clear' });
    const completed = {
      ...message,
      recognition: { confidences: message.confidences, threshold: result?.threshold ?? null, caveat: result?.caveat ?? null },
      sent: false,
    };
    setMessages((list) => [completed, ...list].slice(0, MAX_MESSAGES));
    speech.announce(completed);
    setStatus('Sentence complete.');
  };

  const send = async (message) => {
    conversationActions.append({ text: message.text, speaker: 'deaf', source: 'sign' });
    const saved = await saveSignTranslation(message, message.recognition);
    setMessages((list) => list.map((item) => (item.id === message.id ? { ...item, sent: true } : item)));
    setStatus(saved.saved ? SAVE_MESSAGES.saved : SAVE_MESSAGES[saved.reason] ?? SAVE_MESSAGES.failed);
  };

  return (
    <Panel
      labelledBy="sign-sentence-title"
      title="Sign to text and speech"
      description="Signs are added after they are held steady. The English is a draft: check it before you send it."
      actions={
        <span className={`flex items-center gap-1.5 text-xs ${TONE_TEXT[recognition.tone]}`} aria-live="polite">
          <StatusDot tone={TONE_DOT[recognition.tone]} />
          {recognition.label}
        </span>
      }
    >
      <p className="text-xs leading-relaxed text-app-muted">{recognition.detail}</p>
      {result?.caveat && recognition.key !== 'no_model' && (
        <p className="mt-2 text-xs leading-relaxed text-warning">{result.caveat}</p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-app-border bg-app-bg p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-app-muted">Detected now</p>
          {detected ? (
            <p className="mt-2 text-lg font-semibold text-app-text">
              {detected.word}{' '}
              <span className="text-sm font-normal text-app-muted">{Math.round((detected.confidence ?? 0) * 100)}%</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-app-muted">No confirmed sign.</p>
          )}
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-app-muted">Signs in this sentence</p>
          {hasSigns ? (
            <ol className="mt-2 flex flex-wrap gap-1.5" aria-label="Signs in this sentence">
              {sentence.items.map((item, index) =>
                item.type === 'space' ? (
                  <li key={`space-${index}`} className="w-2" aria-hidden="true" />
                ) : (
                  <li key={`${item.word}-${index}`}>
                    <span className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 py-1 pl-2.5 pr-1 text-xs font-medium text-app-text">
                      {item.word}
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'remove', index })}
                        aria-label={`Remove sign ${item.word}`}
                        className="flex h-5 w-5 items-center justify-center rounded text-app-muted hover:bg-white/10 hover:text-app-text focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </span>
                  </li>
                ),
              )}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-app-muted">Recognised signs appear here.</p>
          )}
        </div>

        <div className="rounded-lg border border-app-border bg-app-bg p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-app-muted">English draft</p>
          <p className="mt-2 min-h-6 text-base text-app-text" aria-live="polite">
            {preview.text || 'Nothing to translate yet.'}
          </p>
          {preview.unmapped.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-warning">
              No English word yet for {preview.unmapped.join(', ')}. Shown as the sign name.
            </p>
          )}
          {preview.isQuestion && <p className="mt-2 text-xs text-app-muted">Reads as a question.</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={sentence.items.length === 0} className={buttonClass('secondary')}>
          <Undo2 size={15} aria-hidden="true" />
          Undo last sign
        </button>
        <button type="button" onClick={() => dispatch({ type: 'space' })} disabled={sentence.items.length === 0 || lastIsSpace} className={buttonClass('secondary')}>
          Add space
        </button>
        <button type="button" onClick={() => dispatch({ type: 'clear' })} disabled={sentence.items.length === 0} className={buttonClass('secondary')}>
          <Eraser size={15} aria-hidden="true" />
          Clear text
        </button>
        <button type="button" onClick={finish} disabled={!hasSigns} className={buttonClass('primary')}>
          <CircleCheck size={15} aria-hidden="true" />
          Finish sentence
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-app-border pt-4 text-xs text-app-muted">
        {speech.supported ? (
          <>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={speech.prefs.autoSpeak}
                onChange={(event) => speech.updatePrefs({ autoSpeak: event.target.checked })}
                className="h-4 w-4 accent-violet-500"
              />
              Auto speak
            </label>
            <button
              type="button"
              onClick={speech.toggleMuted}
              aria-pressed={speech.prefs.muted}
              className={buttonClass('ghost', 'h-8 px-2.5 text-xs')}
            >
              {speech.prefs.muted ? <VolumeX size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
              {speech.prefs.muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              onClick={speech.replay}
              disabled={!speech.hasLastMessage() || speech.prefs.muted}
              className={buttonClass('ghost', 'h-8 px-2.5 text-xs')}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Replay audio
            </button>
            {speech.playback === 'paused' ? (
              <button type="button" onClick={speech.resume} className={buttonClass('ghost', 'h-8 px-2.5 text-xs')}>
                <Play size={15} aria-hidden="true" />
                Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={speech.pause}
                disabled={speech.playback !== 'speaking'}
                className={buttonClass('ghost', 'h-8 px-2.5 text-xs')}
              >
                <Pause size={15} aria-hidden="true" />
                Pause
              </button>
            )}
            <label className="flex items-center gap-2">
              <span>Speed</span>
              <select
                value={speech.prefs.rate}
                onChange={(event) => speech.updatePrefs({ rate: Number(event.target.value) })}
                className="h-8 rounded-md border border-app-border bg-app-surface px-2 text-xs text-app-text"
              >
                {RATE_OPTIONS.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}×
                  </option>
                ))}
              </select>
            </label>
            {voices.length > 0 && (
              <label className="flex items-center gap-2">
                <span>Voice</span>
                <select
                  value={speech.prefs.voiceName}
                  onChange={(event) => speech.updatePrefs({ voiceName: event.target.value })}
                  className="h-8 max-w-40 rounded-md border border-app-border bg-app-surface px-2 text-xs text-app-text"
                >
                  <option value="">Browser default</option>
                  {voices.map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        ) : (
          <p>Speech output is not supported in this browser.</p>
        )}
      </div>

      {messages.length > 0 && (
        <div className="mt-5 border-t border-app-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-app-muted">Completed sentences</p>
          <ul className="mt-2 space-y-2">
            {messages.map((message) => (
              <li key={message.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app-border bg-app-bg px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-app-text">{message.text}</p>
                  {message.unmapped.length > 0 && (
                    <p className="mt-0.5 text-xs text-warning">Unmapped: {message.unmapped.join(', ')}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => speech.speakMessage(message, { replay: true })}
                    disabled={!speech.supported || speech.prefs.muted}
                    aria-label={`Speak sentence: ${message.text}`}
                    className={buttonClass('ghost', 'h-8 w-8 px-0')}
                  >
                    <Volume2 size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => send(message)}
                    disabled={message.sent}
                    className={buttonClass('secondary', 'h-8 px-2.5 text-xs')}
                  >
                    <Send size={14} aria-hidden="true" />
                    {message.sent ? 'Sent' : 'Send to conversation'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {status && (
        <p role="status" className="mt-3 text-xs text-app-muted">
          {status}
        </p>
      )}
    </Panel>
  );
}

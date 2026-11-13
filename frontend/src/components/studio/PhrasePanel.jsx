import { CircleCheck, Volume2, X, Pencil } from 'lucide-react';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { buttonClass, Panel, StatusDot } from '../app/ui.jsx';
import usePhraseRecognition from '../../hooks/usePhraseRecognition.js';
import { isSpeechSupported, speak } from '../../lib/speech.js';
import { loadSpeechPrefs } from '../../lib/speechPreferences.js';
import { EXPERIMENTAL_LABEL, pct } from '../../lib/recognitionStatus.js';
import {
  correctSuggestion,
  confirmSuggestion,
  discardSuggestion,
  initialPhraseState,
  stepPhraseState,
} from '../../lib/phraseStabilizer.js';

const TONE_TEXT = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', neutral: 'text-app-muted' };
const TONE_DOT = { success: 'ok', warning: 'warn', danger: 'error', neutral: 'neutral' };

// What the phrase result may say. A phrase is shown only for the 'recognized' status.
export function describePhraseResult(result, error, cameraLive) {
  if (error) return { tone: 'danger', text: `Phrase recognition is unavailable: ${error}` };
  if (!cameraLive) return { tone: 'neutral', text: 'Start the camera to recognise daily phrases.' };
  if (!result) return { tone: 'neutral', text: 'Waiting for the first phrase result.' };
  switch (result.status) {
    case 'no_model':
      return { tone: 'warning', text: 'No phrase model is loaded, so no phrase is predicted.' };
    case 'no_hand':
      return { tone: 'neutral', text: 'Show your hands to the camera.' };
    case 'unsupported':
      return { tone: 'warning', text: result.detail ?? 'This phrase is not supported by the phrase model.' };
    case 'uncertain':
      return {
        tone: 'warning',
        text: result.confidence == null
          ? 'Not recognised. Nothing is suggested.'
          : `Confidence ${pct(result.confidence)} is below the ${pct(result.threshold)} threshold. Nothing is suggested.`,
      };
    case 'recognized':
      return { tone: 'success', text: `Confidence ${pct(result.confidence)}. Not verified by a signer.` };
    default:
      return { tone: 'neutral', text: 'Phrase recognition is not available right now.' };
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'result':
      return stepPhraseState(state, action.result, { holdFrames: action.holdFrames });
    case 'confirm':
      return confirmSuggestion(state);
    case 'discard':
      return discardSuggestion(state);
    case 'correct':
      return correctSuggestion(state, action.label);
    case 'reset':
      return initialPhraseState();
    default:
      return state;
  }
}

// Daily phrases in Live Studio. Suggestions appear only after a phrase is held steady; the user confirms, corrects
// or discards each one. Confirmed phrases go to the draft. Speech starts only when the user presses Speak.
export default function PhrasePanel({ cameraLive, paused, onConfirm, holdFrames = 8 }) {
  const [expected, setExpected] = useState('');
  const recognitionOn = cameraLive && !paused;
  const { result, error, model } = usePhraseRecognition(recognitionOn, { phrase: expected });
  const [state, dispatch] = useReducer(reducer, undefined, initialPhraseState);
  const [confirmed, setConfirmed] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (recognitionOn && result) dispatch({ type: 'result', result, holdFrames });
  }, [result, recognitionOn, holdFrames]);

  useEffect(() => {
    if (!cameraLive) dispatch({ type: 'reset' });
  }, [cameraLive]);

  const view = describePhraseResult(result, error, cameraLive && !paused);
  const labels = useMemo(() => model?.labels ?? [], [model]);
  const excluded = useMemo(() => Object.entries(model?.excluded_phrases ?? {}), [model]);
  const [correcting, setCorrecting] = useState(false);

  const confirm = () => {
    if (!state.suggestion) return;
    const text = state.suggestion.label;
    onConfirm(text);
    setConfirmed((list) => [...list, text]);
    dispatch({ type: 'confirm' });
    setStatus(`Added "${text}" to the draft.`);
  };

  const speakText = (text) => {
    const prefs = loadSpeechPrefs();
    if (!isSpeechSupported() || prefs.muted) {
      setStatus('Speech is not available here or is muted.');
      return;
    }
    speak(text, { rate: prefs.rate, voiceName: prefs.voiceName });
    setStatus(`Speaking "${text}".`);
  };

  return (
    <Panel
      labelledBy="phrase-panel-title"
      title="Daily phrases"
      description="Hold a phrase steady. A suggestion appears; you confirm it before it is added to the draft."
      actions={
        <span className="flex items-center gap-1.5 text-xs text-warning" aria-live="polite">
          <StatusDot tone={TONE_DOT.warning} />
          {EXPERIMENTAL_LABEL}
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-app-muted">
          Phrase you are signing (optional)
          <select
            value={expected}
            onChange={(event) => setExpected(event.target.value)}
            className="rounded-lg border border-white/10 bg-app-bg px-3 py-2 text-app-text"
          >
            <option value="">Any phrase the model knows</option>
            {labels.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
            {excluded.map(([label]) => (
              <option key={`x-${label}`} value={label}>{label} (needs movement)</option>
            ))}
          </select>
        </label>

        <p className={`text-sm ${TONE_TEXT[view.tone]}`} aria-live="polite">{view.text}</p>

        {state.suggestion ? (
          <div className="rounded-xl border border-accent/40 bg-white/[0.03] p-4" role="group" aria-label="Suggested phrase">
            <p className="text-xs uppercase tracking-wide text-app-muted">Suggested phrase</p>
            <p className="mt-1 text-xl font-semibold text-app-text">{state.suggestion.label}</p>
            {state.suggestion.confidence != null && (
              <p className="text-xs text-app-muted">Confidence {pct(state.suggestion.confidence)}</p>
            )}
            {correcting ? (
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Choose the correct phrase">
                {labels.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className={buttonClass('secondary', 'text-xs')}
                    onClick={() => {
                      dispatch({ type: 'correct', label });
                      setCorrecting(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={buttonClass('primary')} onClick={confirm}>
                  <CircleCheck size={15} aria-hidden="true" /> Confirm
                </button>
                <button type="button" className={buttonClass('secondary')} onClick={() => setCorrecting(true)}>
                  <Pencil size={15} aria-hidden="true" /> Correct
                </button>
                <button type="button" className={buttonClass('ghost')} onClick={() => dispatch({ type: 'discard' })}>
                  <X size={15} aria-hidden="true" /> Discard
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-app-muted">No suggestion yet.</p>
        )}

        {confirmed.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-app-muted">Confirmed this session</p>
            <ul className="mt-2 flex flex-col gap-2">
              {confirmed.map((text, index) => (
                <li key={`${text}-${index}`} className="flex items-center justify-between gap-2 text-sm text-app-text">
                  <span>{text}</span>
                  <button
                    type="button"
                    className={buttonClass('ghost', 'text-xs')}
                    onClick={() => speakText(text)}
                    aria-label={`Speak ${text}`}
                  >
                    <Volume2 size={14} aria-hidden="true" /> Speak
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {excluded.length > 0 && (
          <details className="text-xs text-app-muted">
            <summary className="cursor-pointer">Not supported by the static phrase model ({excluded.length})</summary>
            <p className="mt-2">These phrases need movement across frames. Single images cannot teach them, so they are not predicted.</p>
            <p className="mt-1">{excluded.map(([label]) => label).join(', ')}</p>
          </details>
        )}

        <p className="text-xs text-app-muted" aria-live="polite">{status}</p>
      </div>
    </Panel>
  );
}

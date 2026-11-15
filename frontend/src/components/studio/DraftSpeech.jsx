import { Pause, Play, RotateCcw, Square, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { buttonClass, StatusDot } from '../app/ui.jsx';
import useSpeechOutput from '../../hooks/useSpeechOutput.js';
import useVoices from '../../hooks/useVoices.js';
import { RATE_OPTIONS } from '../../lib/speechPreferences.js';

const SMALL = 'h-8 px-2.5 text-xs';

// Reads the draft aloud. Speech starts only when the user presses Speak, and reads the text exactly as it is in the
// box at that moment. Unfinished text is never spoken automatically.
export default function DraftSpeech({ text }) {
  const speech = useSpeechOutput();
  const voices = useVoices();
  const [spokenOnce, setSpokenOnce] = useState(false);

  if (!speech.supported) {
    return (
      <p className="mt-3 border-t border-app-border pt-3 text-xs text-app-muted">
        Read aloud is not available in this browser. You can still edit and send the text.
      </p>
    );
  }

  const englishVoices = voices.filter((voice) => voice.lang?.startsWith('en'));
  const choices = englishVoices.length > 0 ? englishVoices : voices;
  const hasText = text.trim().length > 0;
  const muted = speech.prefs.muted;
  const speaking = speech.playback === 'speaking';
  const paused = speech.playback === 'paused';
  const busy = speaking || paused;

  const speakDraft = () => {
    if (speech.speakText(text)) setSpokenOnce(true);
  };

  let status = 'Ready.';
  if (speech.error) status = speech.error;
  else if (muted) status = 'Speech is muted.';
  else if (speaking) status = 'Speaking…';
  else if (paused) status = 'Paused.';
  else if (!hasText) status = 'Type or sign some text to read it aloud.';
  else if (choices.length === 0) status = 'This browser lists no voices, so its default voice is used.';

  return (
    <section aria-labelledby="draft-speech-title" className="mt-3 border-t border-app-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id="draft-speech-title" className="flex items-center gap-2 text-xs font-semibold text-app-text">
          {speaking && <StatusDot tone="ok" />}
          Read aloud
        </h4>
        <p role={speech.error ? 'alert' : 'status'} aria-live="polite" className="text-xs text-app-muted">
          {status}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={speakDraft}
          disabled={!hasText || muted || busy}
          className={buttonClass('primary', SMALL)}
        >
          <Volume2 size={14} aria-hidden="true" />
          Speak sentence
        </button>

        {paused ? (
          <button type="button" onClick={speech.resume} className={buttonClass('secondary', SMALL)}>
            <Play size={14} aria-hidden="true" />
            Resume speech
          </button>
        ) : (
          <button
            type="button"
            onClick={speech.pause}
            disabled={!speaking}
            className={buttonClass('secondary', SMALL)}
          >
            <Pause size={14} aria-hidden="true" />
            Pause speech
          </button>
        )}

        <button type="button" onClick={speech.stop} disabled={!busy} className={buttonClass('secondary', SMALL)}>
          <Square size={14} aria-hidden="true" />
          Stop speech
        </button>

        <button
          type="button"
          onClick={speakDraft}
          disabled={!hasText || muted || busy || !spokenOnce}
          className={buttonClass('ghost', SMALL)}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Replay sentence
        </button>

        <button
          type="button"
          onClick={speech.toggleMuted}
          aria-pressed={muted}
          className={buttonClass('ghost', SMALL)}
        >
          {muted ? <VolumeX size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
          {muted ? 'Unmute' : 'Mute'}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-app-muted">
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

        {choices.length > 0 && (
          <label className="flex items-center gap-2">
            <span>Voice</span>
            <select
              value={speech.prefs.voiceName}
              onChange={(event) => speech.updatePrefs({ voiceName: event.target.value })}
              className="h-8 max-w-48 rounded-md border border-app-border bg-app-surface px-2 text-xs text-app-text"
            >
              <option value="">Browser default</option>
              {choices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DraftSpeech from './DraftSpeech.jsx';
import { SPEECH_PREFS_KEY } from '../../lib/speechPreferences.js';

const VOICES = [
  { name: 'Asha', lang: 'en-IN' },
  { name: 'Hindi Voice', lang: 'hi-IN' },
];

describe('DraftSpeech', () => {
  let synth;

  beforeEach(() => {
    window.localStorage.clear();
    synth = {
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn(() => VOICES),
    };
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(text) {
          this.text = text;
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const utterance = (call = 0) => synth.speak.mock.calls[call][0];

  it('explains the fallback when the browser has no speech output', () => {
    vi.unstubAllGlobals();
    render(<DraftSpeech text="HELLO" />);

    expect(screen.getByText(/Read aloud is not available in this browser/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Speak sentence' })).not.toBeInTheDocument();
  });

  it('never speaks an empty draft', () => {
    render(<DraftSpeech text="   " />);

    expect(screen.getByRole('button', { name: 'Speak sentence' })).toBeDisabled();
    expect(screen.getByText('Type or sign some text to read it aloud.')).toBeInTheDocument();
  });

  it('speaks the exact text in the draft when Speak is pressed', () => {
    render(<DraftSpeech text="Hi there" />);

    expect(synth.speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Speak sentence' }));

    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(utterance().text).toBe('Hi there');
    expect(screen.getByText('Speaking…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speak sentence' })).toBeDisabled();
  });

  it('pauses, resumes and stops the current speech', () => {
    render(<DraftSpeech text="HELLO" />);
    fireEvent.click(screen.getByRole('button', { name: 'Speak sentence' }));

    fireEvent.click(screen.getByRole('button', { name: 'Pause speech' }));
    expect(synth.pause).toHaveBeenCalled();
    expect(screen.getByText('Paused.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resume speech' }));
    expect(synth.resume).toHaveBeenCalled();
    expect(screen.getByText('Speaking…')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop speech' }));
    expect(synth.cancel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Speak sentence' })).toBeEnabled();
  });

  it('enables Replay only after something has been spoken, and replays the current text', () => {
    const { rerender } = render(<DraftSpeech text="HELLO" />);
    expect(screen.getByRole('button', { name: 'Replay sentence' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Speak sentence' }));
    act(() => utterance().onend());
    rerender(<DraftSpeech text="HELLO THERE" />);

    fireEvent.click(screen.getByRole('button', { name: 'Replay sentence' }));
    expect(synth.speak).toHaveBeenCalledTimes(2);
    expect(utterance(1).text).toBe('HELLO THERE');
  });

  it('lists English voices and remembers the voice the user picks', () => {
    render(<DraftSpeech text="HELLO" />);
    const voice = screen.getByRole('combobox', { name: /Voice/ });

    expect(within(voice).getByRole('option', { name: 'Asha' })).toBeInTheDocument();
    expect(within(voice).queryByRole('option', { name: 'Hindi Voice' })).not.toBeInTheDocument();

    fireEvent.change(voice, { target: { value: 'Asha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speak sentence' }));
    expect(utterance().voice).toEqual(VOICES[0]);
    expect(JSON.parse(window.localStorage.getItem(SPEECH_PREFS_KEY)).voiceName).toBe('Asha');
  });

  it('applies the chosen speech rate to the next speech', () => {
    render(<DraftSpeech text="HELLO" />);

    fireEvent.change(screen.getByRole('combobox', { name: /Speed/ }), { target: { value: '0.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speak sentence' }));

    expect(utterance().rate).toBe(0.75);
  });

  it('does not speak while muted, and says so', () => {
    render(<DraftSpeech text="HELLO" />);

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(screen.getByText('Speech is muted.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speak sentence' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(screen.getByRole('button', { name: 'Speak sentence' })).toBeEnabled();
  });

  it('shows a clear error when speech fails, but not when it is only interrupted', () => {
    render(<DraftSpeech text="HELLO" />);
    fireEvent.click(screen.getByRole('button', { name: 'Speak sentence' }));

    act(() => utterance().onerror({ error: 'interrupted' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Speak sentence' }));
    act(() => utterance(1).onerror({ error: 'synthesis-failed' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Speech stopped unexpectedly. Try again.');
  });

  it('says when the browser lists no voices, and still speaks with the default', () => {
    synth.getVoices.mockReturnValue([]);
    render(<DraftSpeech text="HELLO" />);

    expect(screen.getByText('This browser lists no voices, so its default voice is used.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Voice/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Speak sentence' }));
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });
});

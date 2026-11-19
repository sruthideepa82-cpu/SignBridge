import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SpeechCaptions from './SpeechCaptions.jsx';
import { CAPTION_PHASE, PROVIDER } from '../../lib/captionPhase.js';

function makeCaptions(overrides = {}) {
  return {
    phase: CAPTION_PHASE.IDLE,
    provider: PROVIDER.GEMINI,
    draft: '',
    setDraft: vi.fn(),
    interimText: '',
    interrupted: false,
    interruptedEntries: [],
    language: 'auto',
    setLanguage: vi.fn(() => true),
    error: null,
    sendError: '',
    notice: '',
    micActive: false,
    userPaused: false,
    autoPaused: false,
    sessionBusy: false,
    canStart: true,
    canPause: false,
    canResume: false,
    canStop: false,
    fallbackOffered: false,
    fallbackActive: false,
    browserSupported: true,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    clear: vi.fn(),
    send: vi.fn(() => true),
    startFallback: vi.fn(),
    ...overrides,
  };
}

const liveRegion = (container) => container.querySelector('[role="status"][aria-live="polite"]');

describe('SpeechCaptions', () => {
  it('shows the privacy disclosure and the idle state at first', () => {
    render(<SpeechCaptions captions={makeCaptions()} onSend={vi.fn()} />);

    expect(screen.getByText('Your microphone audio is streamed to Google Gemini for speech transcription.')).toBeInTheDocument();
    expect(screen.getByText('Not listening')).toBeInTheDocument();
    expect(screen.getByText('Microphone is off.')).toBeInTheDocument();
  });

  it('labels every control', () => {
    render(<SpeechCaptions captions={makeCaptions()} onSend={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Start listening' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send transcript' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear transcript' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Transcript (editable)' })).toBeInTheDocument();
  });

  it('offers the three approved languages, with auto detect first', () => {
    render(<SpeechCaptions captions={makeCaptions()} onSend={vi.fn()} />);

    const options = within(screen.getByRole('combobox', { name: 'Language' })).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Auto detect', 'English (India)', 'Hindi (India)']);
    expect(options.map((option) => option.value)).toEqual(['auto', 'en-IN', 'hi-IN']);
  });

  it('starts listening from the start button', () => {
    const captions = makeCaptions();
    render(<SpeechCaptions captions={captions} onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start listening' }));

    expect(captions.start).toHaveBeenCalledTimes(1);
  });

  it('shows the requesting-permission state and keeps the microphone note accurate', () => {
    render(
      <SpeechCaptions
        captions={makeCaptions({ phase: CAPTION_PHASE.REQUESTING_PERMISSION, micActive: true, canStart: false })}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('Microphone is on.')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting for microphone permission').length).toBeGreaterThan(0);
    expect(liveRegion(document.body)).toHaveTextContent('Waiting for microphone permission');
  });

  it('says plainly that the microphone is on but nothing is sent while paused', () => {
    render(
      <SpeechCaptions
        captions={makeCaptions({
          phase: CAPTION_PHASE.PAUSED,
          micActive: true,
          userPaused: true,
          canResume: true,
          sessionBusy: true,
        })}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('Microphone is on. Audio is not being sent.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled();
    expect(liveRegion(document.body)).toHaveTextContent('Paused');
  });

  it('explains an automatic pause for Read Aloud', () => {
    render(
      <SpeechCaptions
        captions={makeCaptions({ phase: CAPTION_PHASE.PAUSED, micActive: true, autoPaused: true, sessionBusy: true })}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Paused while SignBridge reads aloud').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Resume' })).toHaveAttribute('title', 'Resumes when SignBridge finishes reading aloud');
  });

  it('shows interim text separately, marked as not final, and never announces it', () => {
    const { container } = render(
      <SpeechCaptions
        captions={makeCaptions({ phase: CAPTION_PHASE.RECEIVING, interimText: 'I am doing', micActive: true, sessionBusy: true })}
        onSend={vi.fn()}
      />,
    );

    const interim = screen.getByText('I am doing').closest('p');
    expect(interim).toHaveAttribute('aria-live', 'off');
    expect(screen.getByText('Speaking now, not final yet:', { exact: false })).toBeInTheDocument();
    expect(liveRegion(container)).toHaveTextContent('');
  });

  it('puts confirmed text in the editable transcript and sends it through onSend', () => {
    const captions = makeCaptions({ draft: 'Hello, how are you?', canStop: true, sessionBusy: true });
    const onSend = vi.fn();
    render(<SpeechCaptions captions={captions} onSend={onSend} />);

    expect(screen.getByRole('textbox', { name: 'Transcript (editable)' })).toHaveValue('Hello, how are you?');
    fireEvent.click(screen.getByRole('button', { name: 'Send transcript' }));

    expect(captions.send).toHaveBeenCalledWith(onSend);
  });

  it('lets the user edit the transcript before sending', async () => {
    const captions = makeCaptions({ draft: 'Hello' });
    render(<SpeechCaptions captions={captions} onSend={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Transcript (editable)' }), { target: { value: 'Hello!' } });

    expect(captions.setDraft).toHaveBeenCalledWith('Hello!');
  });

  it('disables sending for an empty transcript', () => {
    render(<SpeechCaptions captions={makeCaptions({ draft: '   ' })} onSend={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Send transcript' })).toBeDisabled();
  });

  it('clears the transcript without any conversation action', () => {
    const captions = makeCaptions({ draft: 'Old text' });
    render(<SpeechCaptions captions={captions} onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear transcript' }));

    expect(captions.clear).toHaveBeenCalledTimes(1);
  });

  it('changes the language through the selector, and disables it while listening', async () => {
    const captions = makeCaptions();
    const { rerender } = render(<SpeechCaptions captions={captions} onSend={vi.fn()} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'hi-IN' } });
    expect(captions.setLanguage).toHaveBeenCalledWith('hi-IN');

    rerender(<SpeechCaptions captions={makeCaptions({ sessionBusy: true })} onSend={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeDisabled();
    expect(screen.getByText('The language can be changed when listening stops.')).toBeInTheDocument();
  });

  it('shows the reconnect state, and explains that speech during the drop is not transcribed', () => {
    render(
      <SpeechCaptions
        captions={makeCaptions({ phase: CAPTION_PHASE.RECONNECTING, micActive: true, sessionBusy: true })}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('Speech said while reconnecting is not transcribed.')).toBeInTheDocument();
    expect(liveRegion(document.body)).toHaveTextContent('Connection lost. Reconnecting');
  });

  it('warns that speech may be missing after an interruption, and keeps interrupted text marked incomplete', () => {
    render(
      <SpeechCaptions
        captions={makeCaptions({
          phase: CAPTION_PHASE.INTERRUPTED,
          interrupted: true,
          interruptedEntries: [{ seq: 2, text: 'the middle of a sentence' }],
          micActive: true,
          sessionBusy: true,
        })}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText(/Some speech may be missing because the connection dropped/)).toBeInTheDocument();
    expect(screen.getByText('Incomplete, before the connection dropped:')).toBeInTheDocument();
    expect(screen.getByText('the middle of a sentence')).toBeInTheDocument();
  });

  it('shows a plain error as an alert', () => {
    render(
      <SpeechCaptions
        captions={makeCaptions({ phase: CAPTION_PHASE.ERROR, error: 'Microphone permission was denied.' })}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Microphone permission was denied.');
  });

  it('offers browser recognition only when the fallback is eligible and supported', () => {
    const captions = makeCaptions({ fallbackOffered: true });
    const { rerender } = render(<SpeechCaptions captions={captions} onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Use browser recognition' }));
    expect(captions.startFallback).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Nothing switches until you choose it/)).toBeInTheDocument();

    rerender(<SpeechCaptions captions={makeCaptions({ fallbackOffered: true, browserSupported: false })} onSend={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Use browser recognition' })).not.toBeInTheDocument();
    expect(screen.getByText(/not available in this browser either/)).toBeInTheDocument();
  });

  it('marks browser recognition as the active provider', () => {
    render(
      <SpeechCaptions
        captions={makeCaptions({ provider: PROVIDER.BROWSER, phase: CAPTION_PHASE.LISTENING, fallbackActive: true, micActive: true, sessionBusy: true })}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('(browser recognition)')).toBeInTheDocument();
  });

  it('announces a newly added sentence through the notice, not through every word', () => {
    render(<SpeechCaptions captions={makeCaptions({ notice: 'Sentence added to the transcript.' })} onSend={vi.fn()} />);

    expect(screen.getByText('Sentence added to the transcript.')).toHaveAttribute('role', 'status');
  });

  it('shows send errors as an alert and keeps the text', () => {
    render(
      <SpeechCaptions
        captions={makeCaptions({ draft: 'Keep me', sendError: 'The message could not be sent. Your text is still here.' })}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('still here');
    expect(screen.getByRole('textbox', { name: 'Transcript (editable)' })).toHaveValue('Keep me');
  });

  it('never shows raw internal codes', () => {
    const { container } = render(
      <SpeechCaptions captions={makeCaptions({ phase: CAPTION_PHASE.ERROR, error: 'Gemini is busy right now.' })} onSend={vi.fn()} />,
    );

    expect(container.textContent).not.toMatch(/gemini_|reconnect_exhausted|ws:\/\/|Error:/);
  });

  it('uses prefixed ids so two instances do not collide', () => {
    const { container } = render(
      <>
        <SpeechCaptions captions={makeCaptions()} onSend={vi.fn()} idPrefix="one" />
        <SpeechCaptions captions={makeCaptions()} onSend={vi.fn()} idPrefix="two" />
      </>,
    );

    expect(container.querySelectorAll('#one-draft, #two-draft')).toHaveLength(2);
  });
});

describe('browser fallback language display', () => {
  const fallback = (overrides = {}) =>
    makeCaptions({
      provider: PROVIDER.BROWSER,
      phase: CAPTION_PHASE.LISTENING,
      fallbackActive: true,
      micActive: true,
      sessionBusy: true,
      fallbackLanguage: 'en-IN',
      fallbackAutoLanguage: true,
      ...overrides,
    });

  it('shows a browser fallback badge and English (India) when the mode was Auto', () => {
    render(<SpeechCaptions captions={fallback()} onSend={vi.fn()} />);

    expect(screen.getByText('Browser fallback')).toBeInTheDocument();
    expect(screen.getByText('Recognizing in English (India).')).toBeInTheDocument();
    expect(
      screen.getByText('Automatic language detection is not available in browser fallback, so English (India) is used.'),
    ).toBeInTheDocument();
  });

  it('shows Hindi only when Hindi was chosen, and says the browser decides whether it can recognize it', () => {
    render(
      <SpeechCaptions
        captions={fallback({ language: 'hi-IN', fallbackLanguage: 'hi-IN', fallbackAutoLanguage: false })}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('Recognizing in Hindi (India).')).toBeInTheDocument();
    expect(screen.getByText('Your browser decides whether it can recognize Hindi (India).')).toBeInTheDocument();
    expect(screen.queryByText(/Automatic language detection/)).not.toBeInTheDocument();
  });

  it('shows English (India) without the auto note when English was chosen', () => {
    render(
      <SpeechCaptions
        captions={fallback({ language: 'en-IN', fallbackLanguage: 'en-IN', fallbackAutoLanguage: false })}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('Recognizing in English (India).')).toBeInTheDocument();
    expect(screen.queryByText(/Automatic language detection/)).not.toBeInTheDocument();
  });

  it('shows no fallback indicator while Gemini is in use', () => {
    render(<SpeechCaptions captions={makeCaptions({ micActive: true, sessionBusy: true })} onSend={vi.fn()} />);

    expect(screen.queryByText('Browser fallback')).not.toBeInTheDocument();
  });
});

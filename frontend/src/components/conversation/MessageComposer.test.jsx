import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MessageComposer from './MessageComposer.jsx';

const mocks = vi.hoisted(() => ({ speech: null }));

vi.mock('../../hooks/useSpeechRecognition.js', () => ({
  default: () => mocks.speech,
}));

const VOICE_NOTE = 'Stop live captions to use voice input here.';

function freshSpeech(overrides = {}) {
  return {
    supported: true,
    status: 'idle',
    interim: '',
    error: '',
    permission: 'unknown',
    start: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
}

const voiceButton = () => screen.getByRole('button', { name: /voice input|stop voice input/i });

beforeEach(() => {
  mocks.speech = freshSpeech();
});

describe('MessageComposer voice input with live captions', () => {
  it('keeps the existing voice button enabled when captions are not running', () => {
    render(<MessageComposer id="t" onSend={vi.fn()} speaker="hearing" voiceLocked={false} />);

    expect(voiceButton()).toBeEnabled();
    expect(screen.queryByText(VOICE_NOTE)).not.toBeInTheDocument();
  });

  it('disables the voice button and explains why while captions are active', () => {
    render(<MessageComposer id="t" onSend={vi.fn()} speaker="hearing" voiceLocked />);

    expect(voiceButton()).toBeDisabled();
    expect(screen.getByText(VOICE_NOTE)).toBeInTheDocument();
    expect(voiceButton()).toHaveAttribute('aria-describedby', 't-voice-note');
  });

  it('does not start voice input from a click, a keypress or a DOM click while locked', () => {
    render(<MessageComposer id="t" onSend={vi.fn()} speaker="hearing" voiceLocked />);
    const button = voiceButton();

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });
    button.click();

    expect(mocks.speech.start).not.toHaveBeenCalled();
    expect(mocks.speech.stop).not.toHaveBeenCalled();
  });

  it('stops voice input that was already listening when captions take the microphone', () => {
    mocks.speech = freshSpeech({ status: 'listening' });

    render(<MessageComposer id="t" onSend={vi.fn()} speaker="hearing" voiceLocked />);

    expect(mocks.speech.stop).toHaveBeenCalled();
  });

  it('restores the voice button unchanged once captions have fully stopped', () => {
    const onSend = vi.fn();
    const { rerender } = render(<MessageComposer id="t" onSend={onSend} speaker="hearing" voiceLocked />);

    rerender(<MessageComposer id="t" onSend={onSend} speaker="hearing" voiceLocked={false} />);

    expect(voiceButton()).toBeEnabled();
    expect(screen.queryByText(VOICE_NOTE)).not.toBeInTheDocument();
    expect(voiceButton()).not.toHaveAttribute('aria-describedby');

    fireEvent.click(voiceButton());
    expect(mocks.speech.start).toHaveBeenCalledWith(expect.any(Function));
  });

  it('leaves typing and sending untouched while the voice input is locked', () => {
    const onSend = vi.fn();
    render(<MessageComposer id="t" onSend={onSend} speaker="hearing" voiceLocked />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Typed reply' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith({ text: 'Typed reply', source: 'typed', speaker: 'hearing' });
  });

  it('keeps the voice button disabled on browsers without speech recognition, whatever the lock says', () => {
    mocks.speech = freshSpeech({ supported: false });

    render(<MessageComposer id="t" onSend={vi.fn()} speaker="hearing" voiceLocked={false} />);

    expect(voiceButton()).toBeDisabled();
  });
});

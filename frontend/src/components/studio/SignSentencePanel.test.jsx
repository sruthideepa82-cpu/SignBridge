import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONVERSATIONS_KEY } from '../../lib/conversationStore.js';
import SignSentencePanel from './SignSentencePanel.jsx';

// The polling hook is replaced so each test chooses exactly what the server returned.
const polling = { result: null, error: '' };
vi.mock('../../hooks/useSequenceRecognition.js', () => ({
  default: () => ({ result: polling.result, error: polling.error }),
}));

const recognised = (word, frame) => ({ status: 'recognized', word, confidence: 0.91, frame_sequence: frame, threshold: 0.6 });

function setResult(result) {
  polling.result = result;
}

describe('SignSentencePanel', () => {
  let synth;

  beforeEach(() => {
    window.localStorage.clear();
    polling.result = null;
    polling.error = '';
    synth = { speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), getVoices: vi.fn(() => []) };
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

  it('never shows a translation when the model is not connected', () => {
    setResult({ status: 'no_model', frame_sequence: 1, detail: 'No trained sign model found.' });
    render(<SignSentencePanel cameraLive paused={false} />);

    expect(screen.getByText('Model unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Awaiting model integration/)).toBeInTheDocument();
    expect(screen.getByText('No confirmed sign.')).toBeInTheDocument();
    expect(screen.getByText('Nothing to translate yet.')).toBeInTheDocument();
  });

  it('asks the user to start the camera before anything is recognised', () => {
    render(<SignSentencePanel cameraLive={false} paused={false} />);

    expect(screen.getByText('Waiting for camera')).toBeInTheDocument();
  });

  it('adds a sign once it is held steady, and undo removes it', () => {
    const { rerender } = render(<SignSentencePanel cameraLive paused={false} />);

    for (let frame = 1; frame <= 3; frame += 1) {
      setResult(recognised('HELLO', frame));
      rerender(<SignSentencePanel cameraLive paused={false} />);
    }

    const chips = screen.getByRole('list', { name: 'Signs in this sentence' });
    expect(within(chips).getByText('HELLO')).toBeInTheDocument();
    expect(screen.getByText('Hello.')).toBeInTheDocument();
    expect(screen.getByText('Sign recognised: HELLO')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo last sign' }));
    expect(screen.queryByRole('list', { name: 'Signs in this sentence' })).not.toBeInTheDocument();
  });

  it('finishes a sentence, speaks it once and keeps it for sending', () => {
    const { rerender } = render(<SignSentencePanel cameraLive paused={false} />);
    for (let frame = 1; frame <= 3; frame += 1) {
      setResult(recognised('HELLO', frame));
      rerender(<SignSentencePanel cameraLive paused={false} />);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Finish sentence' }));

    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(synth.speak.mock.calls[0][0].text).toBe('Hello.');
    expect(screen.getByRole('button', { name: 'Send to conversation' })).toBeInTheDocument();
  });

  it('sends a completed sentence to the conversation and says where it was saved', async () => {
    const { rerender } = render(<SignSentencePanel cameraLive paused={false} />);
    for (let frame = 1; frame <= 3; frame += 1) {
      setResult(recognised('HELLO', frame));
      rerender(<SignSentencePanel cameraLive paused={false} />);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Finish sentence' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to conversation' }));
    });

    const stored = JSON.parse(window.localStorage.getItem(CONVERSATIONS_KEY));
    expect(stored.conversations[0].messages[0]).toMatchObject({ text: 'Hello.', source: 'sign', speaker: 'deaf' });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved in this browser.');
  });

  it('does not speak when muted, even for a finished sentence', () => {
    const { rerender } = render(<SignSentencePanel cameraLive paused={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    for (let frame = 1; frame <= 3; frame += 1) {
      setResult(recognised('HELLO', frame));
      rerender(<SignSentencePanel cameraLive paused={false} />);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Finish sentence' }));

    expect(synth.speak).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();
  });
});

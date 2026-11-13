import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PhrasePanel, { describePhraseResult } from './PhrasePanel.jsx';
import { speak } from '../../lib/speech.js';

// The polling hook is replaced so each test chooses exactly what the server returned.
const polling = { result: null, error: '' };
const MODEL = { labels: ['sick', 'change'], excluded_phrases: { team: 'needs movement' } };
vi.mock('../../hooks/usePhraseRecognition.js', () => ({
  default: () => ({ result: polling.result, error: polling.error, model: MODEL }),
}));
vi.mock('../../lib/speech.js', () => ({
  isSpeechSupported: () => true,
  speak: vi.fn(() => ({ utterance: {}, voice: null })),
}));

const recognised = (label, frame) => ({ status: 'recognized', label, confidence: 0.93, threshold: 0.7, frame_sequence: frame });

function renderPanel(props = {}) {
  return render(<PhrasePanel cameraLive paused={false} onConfirm={vi.fn()} holdFrames={2} {...props} />);
}

function sendResult(panel, result, props = {}) {
  polling.result = { ...result };
  panel.rerender(<PhrasePanel cameraLive paused={false} onConfirm={vi.fn()} holdFrames={2} {...props} />);
}

beforeEach(() => {
  polling.result = null;
  polling.error = '';
  vi.mocked(speak).mockClear();
});

describe('PhrasePanel', () => {
  it('labels the phrase output as experimental and unverified', () => {
    renderPanel();

    expect(screen.getByText('Experimental – Unverified Dataset')).toBeInTheDocument();
  });

  it('offers only phrases the model knows, and lists the excluded ones as needing movement', () => {
    renderPanel();

    const select = screen.getByLabelText(/Phrase you are signing/);
    expect(within(select).getByRole('option', { name: 'sick' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'team (needs movement)' })).toBeInTheDocument();
    expect(screen.getByText(/Not supported by the static phrase model/)).toBeInTheDocument();
  });

  it('shows a suggestion after the phrase is held, and adds it to the draft only when confirmed', () => {
    const onConfirm = vi.fn();
    const panel = renderPanel({ onConfirm });

    sendResult(panel, recognised('sick', 1), { onConfirm });
    sendResult(panel, recognised('sick', 2), { onConfirm });

    expect(screen.getByRole('group', { name: 'Suggested phrase' })).toHaveTextContent('sick');
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));

    expect(onConfirm).toHaveBeenCalledWith('sick');
    expect(screen.queryByRole('group', { name: 'Suggested phrase' })).not.toBeInTheDocument();
  });

  it('never speaks automatically, even when a phrase is suggested', () => {
    const panel = renderPanel();

    sendResult(panel, recognised('sick', 1));
    sendResult(panel, recognised('sick', 2));

    expect(screen.getByRole('group', { name: 'Suggested phrase' })).toBeInTheDocument();
    expect(speak).not.toHaveBeenCalled();
  });

  it('speaks a confirmed phrase only when Speak is pressed', () => {
    const panel = renderPanel();
    sendResult(panel, recognised('sick', 1));
    sendResult(panel, recognised('sick', 2));
    fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));

    expect(speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Speak sick' }));

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith('sick', expect.anything());
  });

  it('shows the reason when a dynamic phrase is requested as unsupported', () => {
    const panel = renderPanel();
    sendResult(panel, { status: 'unsupported', detail: "'team' needs movement and is not supported by the static phrase model." });

    expect(screen.getByText(/needs movement and is not supported/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Suggested phrase' })).not.toBeInTheDocument();
  });
});

describe('describePhraseResult', () => {
  it('says nothing was suggested for an uncertain result', () => {
    const view = describePhraseResult({ status: 'uncertain', confidence: 0.5, threshold: 0.7 }, '', true);

    expect(view.text).toContain('Nothing is suggested');
  });

  it('asks the user to start the camera when it is off', () => {
    expect(describePhraseResult(null, '', false).text).toContain('Start the camera');
  });

  it('reports an unavailable backend as an error', () => {
    expect(describePhraseResult(null, 'Failed to fetch', true).tone).toBe('danger');
  });
});

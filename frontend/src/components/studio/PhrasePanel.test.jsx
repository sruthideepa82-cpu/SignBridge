import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PhrasePanel, { describePhraseResult } from './PhrasePanel.jsx';
import { speak } from '../../lib/speech.js';

// The polling hook is replaced so each test chooses exactly what the backend returned. MODEL mirrors the
// /recognition/phrase/model response for the shipped phrase model.
const MODEL = {
  available: true,
  error: null,
  labels: ['sick', 'change'],
  excluded_phrases: { team: 'DYNAMIC' },
  experimental: true,
  verification: 'unverified_dataset',
  citation: 'Dataset for everyday phrases and words in Indian sign language.',
  limitations: ['Not verified by a qualified ISL signer or interpreter.'],
};
const polling = { result: null, error: '', errorCode: '', model: MODEL, modelError: '', modelErrorCode: '' };
vi.mock('../../hooks/usePhraseRecognition.js', () => ({
  default: () => ({
    result: polling.result,
    error: polling.error,
    errorCode: polling.errorCode,
    model: polling.model,
    modelError: polling.modelError,
    modelErrorCode: polling.modelErrorCode,
  }),
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
  polling.errorCode = '';
  polling.model = MODEL;
  polling.modelError = '';
  polling.modelErrorCode = '';
  vi.mocked(speak).mockClear();
});

describe('PhrasePanel', () => {
  it('labels the phrase output as experimental when the model metadata says so', () => {
    renderPanel();

    expect(screen.getByText('Experimental – Unverified Dataset')).toBeInTheDocument();
  });

  it('explains the limited-signer warning only for an experimental model', () => {
    renderPanel();

    expect(
      screen.getByText('Trained on a limited number of signers. Not yet validated by a qualified ISL signer or interpreter.'),
    ).toBeInTheDocument();
  });

  it('shows no experimental warning when the model metadata is not experimental', () => {
    polling.model = { ...MODEL, experimental: false, verification: 'verified' };
    renderPanel();

    expect(screen.getByText('Phrase model loaded')).toBeInTheDocument();
    expect(screen.queryByText(/Experimental – Unverified Dataset/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trained on a limited number of signers/)).not.toBeInTheDocument();
  });

  it('shows Backend unavailable when the backend cannot be reached, and no model claim', () => {
    polling.error = 'Cannot reach the SignBridge backend. Make sure it is running on port 8000.';
    polling.errorCode = 'network_error';
    polling.model = null;
    polling.modelErrorCode = 'network_error';
    polling.modelError = 'Cannot reach the SignBridge backend. Make sure it is running on port 8000.';
    renderPanel();

    expect(screen.getByText('Backend unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/Experimental – Unverified Dataset/)).not.toBeInTheDocument();
  });

  it('shows Phrase model unavailable when the backend is connected but the model did not load', () => {
    polling.model = { ...MODEL, available: false, error: 'Model file not found: phrase_classifier.joblib', labels: [] };
    renderPanel();

    expect(screen.getByText('Phrase model unavailable')).toBeInTheDocument();
    expect(screen.getByText('Model file not found: phrase_classifier.joblib')).toBeInTheDocument();
    expect(screen.queryByText(/Experimental – Unverified Dataset/)).not.toBeInTheDocument();
  });

  it('shows Ready to recognise phrases when the model is loaded but no sign is detected', () => {
    const panel = renderPanel();
    sendResult(panel, { status: 'no_hand', frame_sequence: 1 });

    expect(screen.getByText(/Ready to recognise phrases/)).toBeInTheDocument();
    expect(screen.getByText('Experimental – Unverified Dataset')).toBeInTheDocument();
  });

  it('shows model information with verification, the research-use note and the separate approval note', () => {
    renderPanel();

    const info = screen.getByText('Model information');
    fireEvent.click(info);
    expect(screen.getByText(/Verification: unverified_dataset/)).toBeInTheDocument();
    expect(screen.getByText(/Research use only/)).toBeInTheDocument();
    expect(screen.getByText(/Approving phrase mappings in Learn Signs is separate/)).toBeInTheDocument();
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

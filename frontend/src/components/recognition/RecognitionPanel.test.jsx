import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RecognitionPanel from './RecognitionPanel.jsx';

const base = { threshold: 0.7, frame_sequence: 10 };

describe('RecognitionPanel', () => {
  it('says no letter is predicted when no model is loaded', () => {
    render(<RecognitionPanel result={{ ...base, status: 'no_model', detail: 'No trained model found.' }} error="" />);

    expect(screen.getByText('No model loaded')).toBeInTheDocument();
    expect(screen.getByText(/no letter is predicted/i)).toBeInTheDocument();
  });

  it('shows the letter only when the backend accepted it', () => {
    render(<RecognitionPanel result={{ ...base, status: 'recognized', label: 'L', confidence: 0.83 }} error="" />);

    expect(screen.getByText('Recognized: L')).toBeInTheDocument();
    expect(screen.getByText(/confidence 83%/i)).toBeInTheDocument();
  });

  it('hides the letter and explains the threshold for an uncertain result', () => {
    render(<RecognitionPanel result={{ ...base, status: 'uncertain', confidence: 0.4 }} error="" />);

    expect(screen.getByText('Not recognized')).toBeInTheDocument();
    expect(screen.getByText(/below the 70% threshold/i)).toBeInTheDocument();
    expect(screen.queryByText(/Recognized:/)).not.toBeInTheDocument();
  });

  it('asks for one hand when none is visible', () => {
    render(<RecognitionPanel result={{ ...base, status: 'no_hand' }} error="" />);

    expect(screen.getByText('No hand')).toBeInTheDocument();
    expect(screen.getByText(/show one hand/i)).toBeInTheDocument();
  });

  it('reports a request failure without showing any letter', () => {
    render(<RecognitionPanel result={null} error="Cannot reach the SignBridge backend." />);

    expect(screen.getByText('Recognition unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/Recognized:/)).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RecognitionPanel from './RecognitionPanel.jsx';

const base = { threshold: 0.7, frame_sequence: 10 };
const live = { cameraLive: true, landmarks: null };

describe('RecognitionPanel', () => {
  it('shows an inactive classifier and no sign when no model is loaded', () => {
    render(
      <RecognitionPanel
        result={{ ...base, status: 'no_model', detail: 'No trained model found.' }}
        error=""
        {...live}
      />,
    );

    expect(screen.getByText('Classifier inactive')).toBeInTheDocument();
    expect(screen.getByText(/no sign is predicted/i)).toBeInTheDocument();
    expect(screen.getByTestId('predicted-sign')).toHaveTextContent('—');
  });

  it('shows the sign and confidence only when the backend accepted it', () => {
    render(
      <RecognitionPanel
        result={{ ...base, status: 'recognized', label: 'L', confidence: 0.83 }}
        error=""
        {...live}
      />,
    );

    expect(screen.getByTestId('predicted-sign')).toHaveTextContent('L');
    expect(screen.getByText('Recognized')).toBeInTheDocument();
    expect(screen.getByText('83%')).toBeInTheDocument();
  });

  it('hides the sign and explains the threshold for an uncertain result', () => {
    render(<RecognitionPanel result={{ ...base, status: 'uncertain', confidence: 0.4 }} error="" {...live} />);

    expect(screen.getByText('Not recognized')).toBeInTheDocument();
    expect(screen.getByText(/below the 70% threshold/i)).toBeInTheDocument();
    expect(screen.getByTestId('predicted-sign')).toHaveTextContent('—');
  });

  it('asks for one hand when none is visible', () => {
    render(<RecognitionPanel result={{ ...base, status: 'no_hand' }} error="" {...live} />);

    expect(screen.getByText('Waiting for hand')).toBeInTheDocument();
    expect(screen.getByText(/show one hand/i)).toBeInTheDocument();
  });

  it('reports a request failure without showing any sign', () => {
    render(<RecognitionPanel result={null} error="Cannot reach the SignBridge backend." {...live} />);

    expect(screen.getByText('Recognition unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('predicted-sign')).toHaveTextContent('—');
  });

  it('shows the hold progress for a sign that is being confirmed', () => {
    render(
      <RecognitionPanel
        result={{ ...base, status: 'recognized', label: 'V', confidence: 0.9 }}
        error=""
        {...live}
        holding={{ label: 'V', count: 3, of: 6 }}
      />,
    );

    expect(screen.getByText('3 of 6')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RecognitionPanel from './RecognitionPanel.jsx';

const base = { threshold: 0.7, frame_sequence: 10 };

describe('RecognitionPanel', () => {
  it('says classification is not active when no model is loaded', () => {
    render(
      <RecognitionPanel
        result={{ ...base, status: 'no_model', detail: 'No trained model found.' }}
        error=""
        cameraLive
      />,
    );

    expect(screen.getByText('No model loaded')).toBeInTheDocument();
    expect(screen.getByText('Sign classification is not active yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Recognized/)).not.toBeInTheDocument();
  });

  it('shows the predicted sign and confidence only when the backend accepted it', () => {
    render(
      <RecognitionPanel
        result={{ ...base, status: 'recognized', label: 'L', confidence: 0.83 }}
        error=""
        cameraLive
      />,
    );

    expect(screen.getByTestId('predicted-sign')).toHaveTextContent('L');
    expect(screen.getByText('83%')).toBeInTheDocument();
  });

  it('hides the sign and explains the threshold for an uncertain result', () => {
    render(<RecognitionPanel result={{ ...base, status: 'uncertain', confidence: 0.4 }} error="" cameraLive />);

    expect(screen.getByText('Not recognized')).toBeInTheDocument();
    expect(screen.getByText(/below the 70% threshold/i)).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('asks for one hand when none is visible', () => {
    render(<RecognitionPanel result={{ ...base, status: 'no_hand' }} error="" cameraLive />);

    expect(screen.getByText('No hand')).toBeInTheDocument();
    expect(screen.getByText(/show one hand/i)).toBeInTheDocument();
  });

  it('reports a request failure without showing any sign', () => {
    render(<RecognitionPanel result={null} error="Cannot reach the SignBridge backend." cameraLive />);

    expect(screen.getByText('Recognition unavailable')).toBeInTheDocument();
    expect(screen.getByText('Cannot reach the SignBridge backend.')).toBeInTheDocument();
    expect(screen.getByTestId('predicted-sign')).toHaveTextContent('No prediction');
  });

  it('shows a camera-off placeholder and never a sign when the camera is stopped', () => {
    render(<RecognitionPanel result={null} error="" cameraLive={false} />);

    expect(screen.getByTestId('predicted-sign')).toHaveTextContent('No prediction');
    expect(screen.getByText('Start the camera to see sign predictions.')).toBeInTheDocument();
  });

  it('renders children below the prediction details', () => {
    render(
      <RecognitionPanel result={null} error="" cameraLive={false}>
        <p>Vocabulary controls</p>
      </RecognitionPanel>,
    );

    expect(screen.getByText('Vocabulary controls')).toBeInTheDocument();
  });
});

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LandmarkInfoPanel from './LandmarkInfoPanel.jsx';
import HandDetectionStatus from './HandDetectionStatus.jsx';

const LANDMARK_NAMES = [
  'WRIST', 'THUMB_CMC', 'THUMB_MCP', 'THUMB_IP', 'THUMB_TIP', 'INDEX_FINGER_MCP', 'INDEX_FINGER_PIP',
  'INDEX_FINGER_DIP', 'INDEX_FINGER_TIP', 'MIDDLE_FINGER_MCP', 'MIDDLE_FINGER_PIP', 'MIDDLE_FINGER_DIP',
  'MIDDLE_FINGER_TIP', 'RING_FINGER_MCP', 'RING_FINGER_PIP', 'RING_FINGER_DIP', 'RING_FINGER_TIP',
  'PINKY_MCP', 'PINKY_PIP', 'PINKY_DIP', 'PINKY_TIP',
];

function buildHand(handedness) {
  return {
    handedness,
    score: 0.93,
    landmarks: LANDMARK_NAMES.map((name, index) => ({ index, name, x: 0.5, y: 0.25, z: -0.01 })),
  };
}

describe('LandmarkInfoPanel', () => {
  it('asks the user to start the camera before showing data', () => {
    render(<LandmarkInfoPanel landmarks={null} cameraLive={false} />);

    expect(screen.getByText(/start the camera to see hand landmark coordinates/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows "No hand detected" and no coordinates when no hand is visible', () => {
    const landmarks = { status: 'no_hand', hand_count: 0, hands: [] };

    render(<LandmarkInfoPanel landmarks={landmarks} cameraLive />);

    expect(screen.getByText('No hand detected')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('lists all 21 landmarks with coordinates for a detected hand', () => {
    const landmarks = { status: 'hand_detected', hand_count: 1, hands: [buildHand('Right')] };

    render(<LandmarkInfoPanel landmarks={landmarks} cameraLive />);

    const table = screen.getByRole('table', { name: 'Landmarks for hand 1' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(21);
    expect(within(rows[0]).getByText('wrist')).toBeInTheDocument();
    expect(within(rows[0]).getByText('0.500')).toBeInTheDocument();
    expect(within(rows[0]).getByText('0.250')).toBeInTheDocument();
    expect(within(rows[0]).getByText('-0.010')).toBeInTheDocument();
    expect(screen.getByText(/Hand 1 · Right/)).toBeInTheDocument();
    expect(screen.getByText('Confidence 93%')).toBeInTheDocument();
  });

  it('hides coordinates and says so when the landmark request failed', () => {
    render(<LandmarkInfoPanel landmarks={null} cameraLive error="Cannot reach the SignBridge backend." />);

    expect(screen.getByText('Landmark data unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('No hand detected')).not.toBeInTheDocument();
  });

  it('does not show coordinates or "No hand detected" when processing fails', () => {
    const landmarks = {
      status: 'processing_error',
      hand_count: 0,
      hands: [],
      detection_error: 'Hand detection failed on a frame. See backend logs.',
    };

    render(<LandmarkInfoPanel landmarks={landmarks} cameraLive />);

    expect(screen.getByText('Hand detection failed')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('No hand detected')).not.toBeInTheDocument();
  });

  it('explains that no coordinates exist when the hand model is unavailable', () => {
    const landmarks = { status: 'detection_unavailable', hand_count: 0, hands: [], detection_error: 'Model missing.' };

    render(<LandmarkInfoPanel landmarks={landmarks} cameraLive />);

    expect(screen.getByText('Hand detection unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No hand detected')).not.toBeInTheDocument();
  });

  it('renders one table per detected hand for two hands (up to 42 landmarks)', () => {
    const landmarks = {
      status: 'hand_detected',
      hand_count: 2,
      hands: [buildHand('Left'), buildHand('Right')],
    };

    render(<LandmarkInfoPanel landmarks={landmarks} cameraLive />);

    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(2);
    const totalRows = tables.reduce((count, table) => count + within(table).getAllByRole('row').length - 1, 0);
    expect(totalRows).toBe(42);
  });
});

describe('HandDetectionStatus', () => {
  it('shows "Hand detected" and the hand count when a hand is visible', () => {
    render(<HandDetectionStatus landmarks={{ status: 'hand_detected', hand_count: 2 }} error="" />);

    expect(screen.getByText('Hand detected')).toBeInTheDocument();
    expect(screen.getByText('Hands detected: 2')).toBeInTheDocument();
  });

  it('shows "No hand detected" when the camera sees no hands', () => {
    render(<HandDetectionStatus landmarks={{ status: 'no_hand', hand_count: 0 }} error="" />);

    expect(screen.getByText('No hand detected')).toBeInTheDocument();
    expect(screen.getByText('Hands detected: 0')).toBeInTheDocument();
  });

  it('explains when hand detection is unavailable', () => {
    render(
      <HandDetectionStatus
        landmarks={{ status: 'detection_unavailable', hand_count: 0, detection_error: 'Model missing.' }}
        error=""
      />,
    );

    expect(screen.getByText('Detection unavailable')).toBeInTheDocument();
    expect(screen.getByText('Model missing.')).toBeInTheDocument();
  });

  it('shows "Processing error" with the reason when a frame could not be processed', () => {
    render(
      <HandDetectionStatus
        landmarks={{ status: 'processing_error', hand_count: 0, detection_error: 'Hand detection failed on a frame.' }}
        error=""
      />,
    );

    expect(screen.getByText('Processing error')).toBeInTheDocument();
    expect(screen.getByText('Hand detection failed on a frame.')).toBeInTheDocument();
    expect(screen.queryByText('No hand detected')).not.toBeInTheDocument();
  });

  it('reports a status request failure without claiming a hand state', () => {
    render(<HandDetectionStatus landmarks={null} error="Cannot reach the SignBridge backend." />);

    expect(screen.getByText('Status unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No hand detected')).not.toBeInTheDocument();
  });
});

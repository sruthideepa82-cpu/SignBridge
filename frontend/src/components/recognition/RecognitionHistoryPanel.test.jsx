import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RecognitionHistoryPanel from './RecognitionHistoryPanel.jsx';

const entries = [
  { id: 2, status: 'recognized', label: 'B', confidence: 0.91, timestamp: Date.UTC(2026, 10, 9, 10, 0, 0) },
  { id: 1, status: 'uncertain', label: null, confidence: 0.42, timestamp: Date.UTC(2026, 10, 9, 9, 59, 0) },
];

describe('RecognitionHistoryPanel', () => {
  it('shows an empty state and disables clearing when there are no predictions', () => {
    render(<RecognitionHistoryPanel entries={[]} onClear={() => {}} />);

    expect(screen.getByText('No predictions yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear history' })).toBeDisabled();
  });

  it('lists recognised and below-threshold predictions with confidence', () => {
    render(<RecognitionHistoryPanel entries={entries} onClear={() => {}} />);

    const list = screen.getByRole('list', { name: 'Recent predictions' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('Confidence 91%')).toBeInTheDocument();
    expect(screen.getByText('Not recognized')).toBeInTheDocument();
    expect(screen.getByText('Confidence 42%')).toBeInTheDocument();
  });

  it('calls onClear when the clear action is used', () => {
    const onClear = vi.fn();
    render(<RecognitionHistoryPanel entries={entries} onClear={onClear} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

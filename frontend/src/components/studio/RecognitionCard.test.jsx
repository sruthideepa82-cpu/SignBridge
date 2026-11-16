import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RecognitionCard from './RecognitionCard.jsx';

const items = [
  { type: 'letter', label: 'C', confidence: 0.9 },
  { type: 'space' },
  { type: 'letter', label: 'L', confidence: 0.8 },
];

function renderCard(onRemoveAt = vi.fn()) {
  render(
    <RecognitionCard
      recognition={null}
      recognitionError=""
      cameraLive={false}
      paused={false}
      phraseMode={false}
      items={items}
      experimental={false}
      onRemoveAt={onRemoveAt}
    />,
  );
  return onRemoveAt;
}

describe('RecognitionCard removal', () => {
  it('names the removal action for what it does: it removes from the detected sequence', () => {
    renderCard();

    expect(screen.getByRole('button', { name: 'Remove from detected sequence: C' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove from detected sequence: L' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove from detected sequence: space' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove letter/ })).not.toBeInTheDocument();
  });

  it('removes only the chosen item from the detected sequence, by its position', () => {
    const onRemoveAt = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Remove from detected sequence: L' }));

    expect(onRemoveAt).toHaveBeenCalledTimes(1);
    expect(onRemoveAt).toHaveBeenCalledWith(2);
  });
});

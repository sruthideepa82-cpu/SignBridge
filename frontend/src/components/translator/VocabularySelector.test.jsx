import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VocabularySelector from './VocabularySelector.jsx';

const vocabulary = [{ label: 'A' }, { label: 'Hello' }];

describe('VocabularySelector', () => {
  it('marks the selected sign and labels the demo vocabulary as provisional', () => {
    render(<VocabularySelector vocabulary={vocabulary} selected="A" onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Hello' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Provisional demo labels')).toBeInTheDocument();
  });

  it('reports the sign the user picks', () => {
    const onSelect = vi.fn();
    render(<VocabularySelector vocabulary={vocabulary} selected="A" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hello' }));

    expect(onSelect).toHaveBeenCalledWith('Hello');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import AlphabetCards from './AlphabetCards.jsx';

describe('AlphabetCards', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('lists the six pilot letters with a link to the official chart', () => {
    render(<AlphabetCards />);

    for (const letter of ['C', 'L', 'O', 'S', 'U', 'V']) {
      expect(screen.getByRole('checkbox', { name: `Practised ${letter}` })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /ISLRTC chart/i })).toHaveAttribute('href', expect.stringContaining('.pdf'));
    expect(screen.getAllByText(/signer check pending/i)).toHaveLength(6);
  });

  it('counts practised letters and resets them', () => {
    render(<AlphabetCards />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Practised C' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Practised U' }));
    expect(screen.getByText('2 of 6 practised')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset progress' }));
    expect(screen.getByText('0 of 6 practised')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Practised C' })).not.toBeChecked();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SignDraft from './SignDraft.jsx';

function props(overrides = {}) {
  return {
    draft: '',
    onDraftChange: vi.fn(),
    items: [],
    holding: null,
    onUndo: vi.fn(),
    onAddSpace: vi.fn(),
    onDiscard: vi.fn(),
    onSend: vi.fn(),
    ...overrides,
  };
}

describe('SignDraft', () => {
  it('says nothing has been sent and disables the actions when there are no letters', () => {
    render(<SignDraft {...props()} />);

    expect(screen.getByText('Not sent yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo last sign' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send to conversation' })).toBeDisabled();
  });

  it('lets the recognised text be edited before it is sent', () => {
    const onDraftChange = vi.fn();
    const onSend = vi.fn();
    render(<SignDraft {...props({ draft: 'CLO', items: [{ type: 'letter', label: 'C', confidence: 0.9 }], onDraftChange, onSend })} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Recognised text, editable before sending' }), {
      target: { value: 'CLOSE' },
    });
    expect(onDraftChange).toHaveBeenCalledWith('CLOSE');

    fireEvent.click(screen.getByRole('button', { name: 'Send to conversation' }));
    expect(onSend).toHaveBeenCalled();
  });

  it('shows each recognised letter with its real confidence', () => {
    render(
      <SignDraft
        {...props({
          draft: 'C',
          items: [{ type: 'letter', label: 'C', confidence: 0.91 }],
        })}
      />,
    );

    expect(screen.getByRole('list', { name: 'Recognised letters, in order' })).toHaveTextContent('C');
    expect(screen.getByText('91%')).toBeInTheDocument();
  });

  it('calls undo, add space and discard from the buttons', () => {
    const state = props({ draft: 'C', items: [{ type: 'letter', label: 'C', confidence: 0.9 }] });
    render(<SignDraft {...state} />);

    fireEvent.click(screen.getByRole('button', { name: 'Undo last sign' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add space' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(state.onUndo).toHaveBeenCalled();
    expect(state.onAddSpace).toHaveBeenCalled();
    expect(state.onDiscard).toHaveBeenCalled();
  });

  it('shows the hold progress for a letter that is not yet added', () => {
    render(<SignDraft {...props({ holding: { label: 'V', count: 3, of: 6 } })} />);

    expect(screen.getByText('Holding V: 3 of 6')).toBeInTheDocument();
  });
});
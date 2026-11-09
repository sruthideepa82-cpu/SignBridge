import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TranslationOutputPanel from './TranslationOutputPanel.jsx';

class FakeUtterance {
  constructor(text) {
    this.text = text;
  }
}

function buffer(overrides = {}) {
  return {
    items: [],
    text: '',
    holding: null,
    addSpace: vi.fn(),
    undo: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}

describe('TranslationOutputPanel', () => {
  let synth;

  beforeEach(() => {
    synth = {
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn(() => []),
    };
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an empty state and disables editing and speech when there is no text', () => {
    render(<TranslationOutputPanel buffer={buffer()} />);

    expect(screen.getByText(/No text yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo last' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Speak text' })).toBeDisabled();
  });

  it('shows the committed text and speaks exactly that text', () => {
    render(
      <TranslationOutputPanel
        buffer={buffer({
          text: 'CLO',
          items: [
            { type: 'letter', label: 'C', confidence: 0.9 },
            { type: 'letter', label: 'L', confidence: 0.8 },
            { type: 'letter', label: 'O', confidence: 0.85 },
          ],
        })}
      />,
    );

    expect(screen.getByTestId('committed-text')).toHaveTextContent('CLO');
    fireEvent.click(screen.getByRole('button', { name: 'Speak text' }));

    expect(synth.speak.mock.calls[0][0].text).toBe('CLO');
  });

  it('shows confidence for each committed letter', () => {
    render(
      <TranslationOutputPanel
        buffer={buffer({
          text: 'C',
          items: [{ type: 'letter', label: 'C', confidence: 0.91 }],
        })}
      />,
    );

    expect(screen.getByText('Letter C')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
  });

  it('calls undo, add space, and clear from the buttons', () => {
    const state = buffer({
      text: 'C',
      items: [{ type: 'letter', label: 'C', confidence: 0.9 }],
    });
    render(<TranslationOutputPanel buffer={state} />);

    fireEvent.click(screen.getByRole('button', { name: 'Undo last' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add space' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear text' }));

    expect(state.undo).toHaveBeenCalled();
    expect(state.addSpace).toHaveBeenCalled();
    expect(state.clear).toHaveBeenCalled();
  });

  it('copies the accumulated text to the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<TranslationOutputPanel buffer={buffer({ text: 'HI', items: [{ type: 'letter', label: 'H', confidence: 0.9 }] })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy text' }));

    expect(writeText).toHaveBeenCalledWith('HI');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('shows an error when the clipboard is not available', async () => {
    vi.stubGlobal('navigator', {});
    render(<TranslationOutputPanel buffer={buffer({ text: 'HI', items: [{ type: 'letter', label: 'H', confidence: 0.9 }] })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy text' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Copying is not available');
  });

  it('shows the hold progress for a letter that is not yet committed', () => {
    render(<TranslationOutputPanel buffer={buffer({ holding: { label: 'V', count: 3, of: 6 } })} />);

    expect(screen.getByText('Holding V: 3 of 6 frames')).toBeInTheDocument();
  });

  it('stops speech with the stop button', () => {
    render(<TranslationOutputPanel buffer={buffer({ text: 'C', items: [{ type: 'letter', label: 'C', confidence: 1 }] })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(synth.cancel).toHaveBeenCalled();
  });
});

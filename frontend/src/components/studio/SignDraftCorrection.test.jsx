import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SignDraft from './SignDraft.jsx';

const items = [
  { type: 'letter', label: 'B', confidence: 0.75, experimental: true },
  { type: 'letter', label: 'C', confidence: 0.96, experimental: true },
];

function renderDraft(overrides = {}) {
  const controls = {
    experimental: true,
    backendThreshold: 0.7,
    settings: { stableFrames: 6, minConfidence: null },
    onSettingsChange: vi.fn(),
    onRemoveAt: vi.fn(),
    ...overrides,
  };
  render(
    <SignDraft
      draft="BC"
      onDraftChange={() => {}}
      items={items}
      holding={null}
      onUndo={() => {}}
      onAddSpace={() => {}}
      onDiscard={() => {}}
      onSend={() => {}}
      controls={controls}
    />,
  );
  return controls;
}

describe('SignDraft correction and labels', () => {
  it('removes one wrong letter by its index', () => {
    const controls = renderDraft();

    fireEvent.click(screen.getByRole('button', { name: 'Remove letter C' }));

    expect(controls.onRemoveAt).toHaveBeenCalledWith(1);
  });

  it('shows the experimental label for the model and for the letters it produced', () => {
    renderDraft();

    expect(screen.getAllByText('Experimental – Unverified Dataset').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Experimental, unverified')).toHaveLength(2);
  });

  it('shows each accepted letter with its own confidence', () => {
    renderDraft();

    expect(screen.getByLabelText('Accepted with 75 percent confidence')).toHaveTextContent('75%');
    expect(screen.getByLabelText('Accepted with 96 percent confidence')).toHaveTextContent('96%');
  });

  it('lets the user change the stability window and confidence threshold', () => {
    const controls = renderDraft();

    fireEvent.change(screen.getByRole('slider', { name: /Stable for 6 frames/ }), { target: { value: '8' } });
    expect(controls.onSettingsChange).toHaveBeenCalledWith({ stableFrames: 8 });

    fireEvent.change(screen.getByRole('slider', { name: /confidence threshold/ }), { target: { value: '0.85' } });
    expect(controls.onSettingsChange).toHaveBeenCalledWith({ minConfidence: 0.85 });
  });

  it('shows the backend default threshold when the user has not set one', () => {
    renderDraft();

    expect(screen.getByText(/backend default \(70%\)/)).toBeInTheDocument();
  });
});

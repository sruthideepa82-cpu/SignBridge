import { describe, expect, it } from 'vitest';
import { EXPERIMENTAL_LABEL, describePhraseModel } from './recognitionStatus.js';

const LOADED_EXPERIMENTAL = { available: true, experimental: true, verification: 'unverified_dataset', labels: ['sick'] };

describe('describePhraseModel', () => {
  it('reports the backend as unavailable when it cannot be reached, whatever the model says', () => {
    expect(describePhraseModel({ backendDown: true, model: LOADED_EXPERIMENTAL })).toMatchObject({
      label: 'Backend unavailable',
      tone: 'danger',
      experimental: false,
    });
  });

  it('reports a missing model when the backend answers but the model did not load', () => {
    const state = describePhraseModel({ model: { available: false, error: 'file not found', labels: [] } });

    expect(state).toMatchObject({ label: 'Phrase model unavailable', tone: 'danger', experimental: false });
    expect(state.detail).toBe('file not found');
  });

  it('reports a model that is still being checked as neutral, not as loaded', () => {
    expect(describePhraseModel({ model: null })).toMatchObject({ label: 'Checking phrase model…', tone: 'neutral' });
  });

  it('shows the experimental label only when the model metadata says experimental', () => {
    expect(describePhraseModel({ model: LOADED_EXPERIMENTAL })).toMatchObject({
      label: EXPERIMENTAL_LABEL,
      experimental: true,
    });
  });

  it('does not show the experimental label for a model that is not experimental', () => {
    const state = describePhraseModel({ model: { ...LOADED_EXPERIMENTAL, experimental: false, verification: 'verified' } });

    expect(state).toMatchObject({ label: 'Phrase model loaded', experimental: false, tone: 'success' });
  });

  it('treats a missing experimental flag as not experimental, so the label is never guessed', () => {
    const state = describePhraseModel({ model: { available: true, labels: ['sick'] } });

    expect(state.experimental).toBe(false);
    expect(state.label).toBe('Phrase model loaded');
  });

  it('gives a stale-backend error as a model problem, not as a connection problem', () => {
    const state = describePhraseModel({ modelError: 'The backend does not serve the phrase routes.' });

    expect(state).toMatchObject({ label: 'Phrase model unavailable', tone: 'danger' });
  });
});

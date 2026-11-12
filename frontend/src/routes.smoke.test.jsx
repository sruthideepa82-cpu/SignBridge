import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from './test/renderWithRouter.jsx';

// Every route the app serves. Each must render a level-1 heading and emit no console warnings or errors.
const ROUTES = [
  ['/', null],
  ['/learn', null],
  ['/dashboard', /^(Good (morning|afternoon|evening)), Sruthi$/],
  ['/workspace/live-studio', 'Live Studio'],
  ['/live', 'Live Studio'],
  ['/translator', 'Live Studio'],
  ['/conversations', 'Conversations'],
  ['/conversation', 'Conversations'],
  ['/phrases', 'Quick Phrases'],
  ['/quick-connect', 'Quick Phrases'],
  ['/history', 'History'],
  ['/voice-to-text', 'Voice to Text'],
  ['/learn/signs', 'Learn Signs'],
  ['/learn/dictionary', 'ISL Dictionary'],
  ['/learn/lessons', 'Guided Learning'],
  ['/learn/practice', 'Practice Lab'],
  ['/contribute', 'Dataset Contribution'],
  ['/community', 'Community & Feedback'],
  ['/help', 'Help & Support'],
  ['/contribute/collector', 'Dataset Collector'],
  ['/fingerspelling', 'Fingerspelling'],
  ['/accessibility', 'Settings'],
  ['/settings', 'Settings'],
  ['/profile', 'Profile'],
  ['/no-such-page', null],
];

describe('route smoke test', () => {
  let errors;
  let warnings;

  beforeEach(() => {
    errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    window.localStorage.clear();
  });

  afterEach(() => {
    errors.mockRestore();
    warnings.mockRestore();
    vi.unstubAllGlobals();
  });

  it.each(ROUTES)('renders %s without console warnings or errors', async (path, heading) => {
    const { unmount } = renderApp(path);

    if (heading) {
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    } else {
      await waitFor(() => expect(document.querySelector('main')).not.toBeNull());
    }

    const unnamedButtons = [...document.querySelectorAll('button')].filter(
      (button) => !button.getAttribute('aria-label') && !button.textContent.trim() && !button.getAttribute('aria-labelledby'),
    );
    expect(unnamedButtons.map((button) => button.outerHTML.slice(0, 120))).toEqual([]);

    const unlabelledFields = [...document.querySelectorAll('input, textarea, select')].filter((field) => {
      if (field.type === 'hidden') return false;
      const id = field.id;
      const labelled = field.getAttribute('aria-label') || field.getAttribute('aria-labelledby') || (id && document.querySelector(`label[for="${id}"]`));
      return !labelled && !field.closest('label');
    });
    expect(unlabelledFields.map((field) => field.outerHTML.slice(0, 120))).toEqual([]);

    unmount();
    expect(errors.mock.calls.map((args) => String(args[0]))).toEqual([]);
    expect(warnings.mock.calls.map((args) => String(args[0]))).toEqual([]);
  });
});

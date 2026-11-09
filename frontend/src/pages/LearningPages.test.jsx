import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderWithRouter.jsx';
import { PROGRESS_KEY } from '../hooks/usePracticeProgress.js';
import { PRACTICE_HISTORY_KEY } from '../lib/practiceHistory.js';
import { feedbackFor } from './PracticeLabPage.jsx';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
  window.localStorage.clear();
});

describe('ISL Dictionary', () => {
  it('lists only the checked letters and says word-level entries are not yet verified', () => {
    renderApp('/learn/dictionary');

    const list = screen.getByRole('list', { name: 'Vocabulary' });
    expect(within(list).getAllByRole('button')).toHaveLength(6);
    expect(screen.getByText(/Word-level vocabulary is not yet verified/)).toBeInTheDocument();
  });

  it('filters by meaning and shows an honest empty result', () => {
    renderApp('/learn/dictionary');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search vocabulary' }), { target: { value: 'letter U' } });
    expect(screen.getAllByRole('button').some((button) => button.textContent.startsWith('U'))).toBe(true);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search vocabulary' }), { target: { value: 'hello' } });
    expect(screen.getByText('No matching entries')).toBeInTheDocument();
  });

  it('shows the meaning, hands and signer status for a selected entry, with no invented example or rating', () => {
    renderApp('/learn/dictionary');

    const list = screen.getByRole('list', { name: 'Vocabulary' });
    fireEvent.click(within(list).getAllByRole('button')[0]);

    expect(screen.getByText('English letter C in ISL fingerspelling')).toBeInTheDocument();
    expect(screen.getAllByText('Checked against the chart. Signer confirmation pending.').length).toBeGreaterThan(1);
    expect(screen.getByText('Not yet written.')).toBeInTheDocument();
    expect(screen.getByText('Not yet rated.')).toBeInTheDocument();
  });
});

describe('Guided Learning', () => {
  it('starts with nothing marked and shows lessons only for the finger-spelling track', () => {
    renderApp('/learn/lessons');

    expect(screen.getByText('Letters C and L')).toBeInTheDocument();
    expect(screen.getAllByText('No lessons yet')).toHaveLength(3);
    expect(screen.getAllByText(/Not started/).length).toBeGreaterThan(0);
  });

  it('marks letters, moves the lesson to In progress and saves the marks in this browser', () => {
    renderApp('/learn/lessons');

    fireEvent.click(screen.getByRole('button', { name: 'Mark letter C as practised' }));

    expect(screen.getByText(/In progress/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(PROGRESS_KEY))).toEqual(['C']);
    expect(JSON.parse(window.localStorage.getItem(PRACTICE_HISTORY_KEY))[0]).toMatchObject({ letter: 'C', kind: 'marked' });
  });
});

describe('Practice Lab', () => {
  it('gives no recognition feedback while the camera is off', () => {
    renderApp('/learn/practice');

    expect(screen.getByText('Start the camera to get feedback on your handshape.')).toBeInTheDocument();
  });

  it('lets the learner choose a letter and mark it practised', () => {
    renderApp('/learn/practice');

    fireEvent.click(screen.getByRole('button', { name: 'U' }));
    expect(screen.getByRole('button', { name: 'U' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Mark U as practised' }));
    expect(JSON.parse(window.localStorage.getItem(PROGRESS_KEY))).toEqual(['U']);
  });

  it('only reports a match when the recogniser returned the target letter', () => {
    expect(feedbackFor('C', false, null, '')).toMatchObject({ tone: 'neutral' });
    expect(feedbackFor('C', true, { status: 'no_model' }, '').text).toMatch(/No recognition model is loaded/);
    expect(feedbackFor('C', true, { status: 'recognized', label: 'L', confidence: 0.9 }, '').text).toBe(
      'Recognised as L, not C.',
    );
    const matched = feedbackFor('C', true, { status: 'recognized', label: 'C', confidence: 0.83 }, '');
    expect(matched.tone).toBe('ok');
    expect(matched.text).toMatch(/Recognised as C \(83%\)/);
  });
});

describe('Dataset Contribution', () => {
  it('separates the four stages and does not claim consent or recordings', () => {
    renderApp('/contribute');

    const status = screen.getByRole('region', { name: 'Status' });
    expect(within(status).getByText('Vocabulary approval')).toBeInTheDocument();
    expect(within(status).getByText('Consent')).toBeInTheDocument();
    expect(within(status).getByText('Recordings')).toBeInTheDocument();
    expect(within(status).getByText('Model training')).toBeInTheDocument();
    expect(screen.getByText('Not trained')).toBeInTheDocument();
    expect(screen.getByText(/consent form is a draft/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /consent/i })).not.toBeInTheDocument();
  });

  it('shows each letter with checked and signer-confirmed columns', () => {
    renderApp('/contribute');

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(6);
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('C');
    expect(within(rows[0]).getByText('No')).toBeInTheDocument();
  });

  it('reports that no contributions are recorded in this app', () => {
    renderApp('/contribute');

    expect(screen.getByText('No contributions recorded here')).toBeInTheDocument();
  });
});

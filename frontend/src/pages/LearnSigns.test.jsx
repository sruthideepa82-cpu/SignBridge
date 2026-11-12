import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SignAnimationPlayer from '../components/animation/SignAnimationPlayer.jsx';
import QuizPanel from '../components/learn-signs/QuizPanel.jsx';
import { probeClip } from '../hooks/useClipAvailability.js';
import { PROGRESS_KEY } from '../hooks/usePracticeProgress.js';
import { LEARN_PROGRESS_KEY } from '../lib/learnProgress.js';
import { renderApp } from '../test/renderWithRouter.jsx';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Learn Signs page', () => {
  it('offers the four learning categories', () => {
    renderApp('/learn/signs');

    const group = screen.getByRole('group', { name: 'Learning categories' });
    for (const label of ['Alphabet A–Z', 'Numbers 0–9', 'Common Words & Phrases', 'Practice & Quiz']) {
      expect(within(group).getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it('shows A to Z as clickable letters and opens the chosen letter', () => {
    renderApp('/learn/signs');

    const grid = screen.getByRole('list', { name: 'Letters' });
    expect(within(grid).getAllByRole('listitem')).toHaveLength(26);

    fireEvent.click(screen.getByRole('button', { name: /^Letter K\b/ }));

    expect(screen.getByRole('heading', { level: 2, name: 'Letter K' })).toBeInTheDocument();
    expect(screen.getByText(/Letter K is a still handshape/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Letter K\b/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves between letters with the buttons and the arrow keys, and stops at the ends', () => {
    renderApp('/learn/signs?category=alphabet&sign=alphabet%3AA');

    expect(screen.getByRole('button', { name: 'Previous letter' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next letter' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Letter B' })).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(screen.getByRole('heading', { level: 2, name: 'Letter A' })).toBeInTheDocument();
  });

  it('shows the Z letter as a moving sign', () => {
    renderApp('/learn/signs?category=alphabet&sign=alphabet%3AZ');

    expect(screen.getByText('Moving sign')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next letter' })).toBeDisabled();
  });

  it('shows a graceful placeholder when the animation file is missing', async () => {
    renderApp('/learn/signs?category=alphabet&sign=alphabet%3AA');

    expect(await screen.findByText('Animation not available yet')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sign animation: Letter A')).not.toBeInTheDocument();
    expect(screen.getByText(/Signer confirmation pending/)).toBeInTheDocument();
  });

  it('saves completed letters to the shared practice list used by the other learning pages', () => {
    renderApp('/learn/signs?category=alphabet&sign=alphabet%3AC');

    fireEvent.click(screen.getByRole('button', { name: 'Mark Letter C as learned' }));

    expect(screen.getByRole('button', { name: 'Unmark Letter C as learned' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(window.localStorage.getItem(PROGRESS_KEY))).toEqual(['C']);
    expect(screen.getByRole('progressbar', { name: 'Completed letters' })).toHaveAttribute('aria-valuenow', '1');
  });

  it('saves favourites in this browser', () => {
    renderApp('/learn/signs?category=alphabet&sign=alphabet%3AC');

    fireEvent.click(screen.getByRole('button', { name: 'Add Letter C to favourites' }));

    expect(screen.getByRole('button', { name: 'Remove Letter C from favourites' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(window.localStorage.getItem(LEARN_PROGRESS_KEY)).favourites).toEqual(['alphabet:C']);
  });

  it('shows no invented numbers or words, and says why', () => {
    renderApp('/learn/signs?category=numbers');
    expect(screen.getByText('No verified number signs yet')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Signs' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Common Words & Phrases/ }));
    expect(screen.getByText('No verified words or phrases yet')).toBeInTheDocument();
  });

  it('says the quiz needs animations while none are in the library', () => {
    renderApp('/learn/signs?category=practice');

    expect(screen.getByText('Quiz not available yet')).toBeInTheDocument();
    expect(screen.getByText('Nothing practised yet')).toBeInTheDocument();
    expect(screen.getByText('No favourites yet')).toBeInTheDocument();
  });

  it('is listed in the sidebar with the Learn Signs label', () => {
    renderApp('/learn/signs');
    const nav = screen.getByRole('navigation', { name: 'Main application navigation' });
    expect(within(nav).getByRole('link', { name: 'Learn Signs' })).toHaveClass('text-app-text');
  });
});

describe('SignAnimationPlayer', () => {
  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  it('plays an available clip with speed and replay controls', () => {
    render(<SignAnimationPlayer src="/animations/alphabet/A.mp4" label="Letter A" available />);

    const video = screen.getByLabelText('Sign animation: Letter A');
    expect(video).toHaveAttribute('src', '/animations/alphabet/A.mp4');

    fireEvent.click(screen.getByRole('button', { name: 'Play Letter A animation' }));
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Speed' }), { target: { value: '0.5' } });
    expect(video.playbackRate).toBe(0.5);

    expect(screen.getByRole('button', { name: 'Replay Letter A animation' })).toBeInTheDocument();
  });

  it('shows the placeholder while checking and when the file fails to load', () => {
    const { rerender } = render(<SignAnimationPlayer src="/animations/alphabet/A.mp4" label="Letter A" available={null} />);
    expect(screen.getByText('Checking for animation…')).toBeInTheDocument();

    rerender(<SignAnimationPlayer src="/animations/alphabet/A.mp4" label="Letter A" available />);
    fireEvent.error(screen.getByLabelText('Sign animation: Letter A'));
    expect(screen.getByText('Animation not available yet')).toBeInTheDocument();
  });
});

describe('QuizPanel', () => {
  const pool = ['A', 'B', 'C'].map((label) => ({
    id: `alphabet:${label}`,
    label,
    title: `Letter ${label}`,
    clipPath: `/animations/alphabet/${label}.mp4`,
  }));
  const labels = 'ABCDEFGH'.split('');

  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  it('marks the answer as correct or not and then offers the next question', () => {
    const onAnswer = vi.fn();
    render(<QuizPanel pool={pool} labels={labels} onAnswer={onAnswer} />);

    const shown = screen.getByLabelText(/Sign animation: Letter/).getAttribute('aria-label').slice(-1);
    const choices = within(screen.getByRole('group', { name: 'Answer choices' }));
    fireEvent.click(choices.getByRole('button', { name: shown }));

    expect(screen.getByText('Correct.')).toBeInTheDocument();
    expect(onAnswer).toHaveBeenCalledWith(`alphabet:${shown}`);
    expect(screen.getByText('1 of 1 correct')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    expect(screen.queryByText('Correct.')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 1 correct')).toBeInTheDocument();
  });

  it('reports a wrong answer with the letter that was shown', () => {
    render(<QuizPanel pool={pool} labels={labels} onAnswer={vi.fn()} />);

    const shown = screen.getByLabelText(/Sign animation: Letter/).getAttribute('aria-label').slice(-1);
    const choices = within(screen.getByRole('group', { name: 'Answer choices' }));
    const wrong = choices.getAllByRole('button').find((button) => button.textContent !== shown);
    fireEvent.click(wrong);

    expect(screen.getByText(`Not quite. This clip shows ${shown}.`)).toBeInTheDocument();
  });
});

describe('probeClip', () => {
  it('counts a clip as available only when the server returns a video', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'content-type': 'video/mp4' } }))
        .mockResolvedValueOnce(new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })),
    );

    expect(await probeClip('/animations/alphabet/A.mp4')).toBe(true);
    expect(await probeClip('/animations/alphabet/B.mp4')).toBe(false);
  });
});

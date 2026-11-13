import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderWithRouter.jsx';
import { CONVERSATIONS_KEY } from '../lib/conversationStore.js';

const STATUS = {
  verified_labels: { C: 1 },
  unknown_label: 'UNKNOWN',
  min_frames: 10,
  max_frames: 600,
  total_clips: 2,
  counts: { C: { clips: 2, frames: 30, participants: 1, sessions: 2 } },
};

const hand = (handedness) => ({
  handedness,
  score: 0.95,
  landmarks: Array.from({ length: 21 }, (_, index) => ({ index, name: `P${index}`, x: 0.1 + index * 0.01, y: 0.2, z: 0.0 })),
});

// A backend stand-in for the developer routes and the camera. Each landmark poll is a new processed frame.
function developerBackend(onSave = () => {}) {
  let sequence = 0;
  const cameraOn = { running: true, camera_index: 0, width: 640, height: 480, fps: 30, last_error: null };
  return vi.fn((url, init = {}) => {
    const path = String(url);
    const reply = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
    if (path.endsWith('/dataset/status')) return reply(STATUS);
    if (path.endsWith('/camera/start') || path.endsWith('/camera/status')) return reply(cameraOn);
    if (path.endsWith('/camera/stop')) return reply({ ...cameraOn, running: false });
    if (path.endsWith('/camera/landmarks')) {
      sequence += 1;
      return reply({
        status: 'hand_detected',
        running: true,
        detection_available: true,
        detection_error: null,
        frame_sequence: sequence,
        hand_count: 1,
        hands: [hand('Right')],
        timestamp: new Date().toISOString(),
      });
    }
    if (path.endsWith('/dataset/clips') && init.method === 'POST') {
      const body = JSON.parse(init.body);
      onSave(body);
      return reply({
        clip_id: 'P001-S-1-abcd1234',
        label: body.label,
        participant: body.participant,
        session: body.session,
        consent_ref: body.consent_ref,
        recorded_at: '2026-11-12T09:00:00+00:00',
        frame_count: body.frames.length,
        frames_with_hands: body.frames.filter((frame) => frame.hands.length > 0).length,
      });
    }
    return Promise.reject(new TypeError('Failed to fetch'));
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Dataset Collector is developer-only', () => {
  it('is not served in the product build', () => {
    vi.stubGlobal('fetch', developerBackend());
    renderApp('/contribute/collector');

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dataset Collector' })).not.toBeInTheDocument();
  });
});

describe('Dataset Collector workspace', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SIGNBRIDGE_DEVELOPER_TOOLS', 'true');
  });

  it('shows the verified letters and the clip count for each label', async () => {
    vi.stubGlobal('fetch', developerBackend());
    renderApp('/contribute/collector');

    expect(await screen.findByRole('button', { name: 'C, 2 clips, verified' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A, 0 clips, not verified' })).toBeInTheDocument();
    const counts = screen.getByRole('table');
    expect(within(counts).getByRole('rowheader', { name: 'C' }).closest('tr')).toHaveTextContent('30');
  });

  it('refuses an unverified letter and explains why', async () => {
    vi.stubGlobal('fetch', developerBackend());
    renderApp('/contribute/collector');
    await screen.findByRole('button', { name: 'C, 2 clips, verified' }, { timeout: 5000 });

    fireEvent.click(screen.getByRole('button', { name: 'A, 0 clips, not verified' }));

    expect(screen.getByText(/A is not a verified class/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Recording' })).toBeDisabled();
  });

  it('will not record until the camera is live and the session details are complete', async () => {
    vi.stubGlobal('fetch', developerBackend());
    renderApp('/contribute/collector');
    await screen.findByRole('button', { name: 'C, 2 clips, verified' }, { timeout: 5000 });

    expect(screen.getByText('Start the camera before recording.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Recording' })).toBeDisabled();
  });

  it('records a clip of frames from the live camera and saves it with its label', async () => {
    const saved = [];
    vi.stubGlobal('fetch', developerBackend((body) => saved.push(body)));
    renderApp('/contribute/collector');
    await screen.findByRole('button', { name: 'C, 2 clips, verified' }, { timeout: 5000 });

    fireEvent.click(screen.getByRole('button', { name: 'C, 2 clips, verified' }));
    fireEvent.change(screen.getByLabelText('Consent reference'), { target: { value: 'C-2026-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start Recording' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Start Recording' }));
    // Wait for the recorder to report enough frames and time, rather than sleeping for a fixed period.
    await waitFor(
      () => {
        const live = document.querySelector('[aria-live="polite"]')?.textContent ?? '';
        const [, seconds, frames] = live.match(/Recording: ([\d.]+) s, (\d+) frames/) ?? [];
        expect(Number(seconds)).toBeGreaterThanOrEqual(1.6);
        expect(Number(frames)).toBeGreaterThanOrEqual(10);
      },
      { timeout: 8000 },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stop Recording' }));

    expect(await screen.findByText(/Clip review:/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Right hand in 100%/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save clip as C' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({ label: 'C', participant: 'P001', consent_ref: 'C-2026-001' });
    expect(saved[0].frames.length).toBeGreaterThanOrEqual(10);
    expect(saved[0].frames[0].hands[0].handedness).toBe('Right');
    expect(await screen.findByText(/Saved P001-S-1-abcd1234/, {}, { timeout: 5000 })).toBeInTheDocument();
  }, 20000);

  it('links to the CSV and JSON exports', async () => {
    vi.stubGlobal('fetch', developerBackend());
    renderApp('/contribute/collector');

    expect(await screen.findByRole('link', { name: /CSV/ }, { timeout: 5000 })).toHaveAttribute('href', '/api/dataset/export?format=csv');
    expect(screen.getByRole('link', { name: /JSON/ })).toHaveAttribute('href', '/api/dataset/export?format=json');
  });
});
describe('Fingerspelling builder', () => {
  it('builds HELLO from simulated letters, labels them, and refuses to send them', () => {
    renderApp('/fingerspelling');

    fireEvent.click(screen.getByRole('button', { name: 'Play HELLO' }));

    expect(screen.getByTestId('builder-text')).toHaveTextContent('HELLO');
    expect(screen.getByText('Contains simulated letters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to conversation' })).toBeDisabled();
    expect(screen.getByText(/Simulated letters cannot be sent/)).toBeInTheDocument();
  });

  it('types a word on the keyboard, confirms it, and sends it as typed text', () => {
    renderApp('/fingerspelling');

    ['h', 'i'].forEach((key) => fireEvent.keyDown(window, { key }));
    expect(screen.getByTestId('builder-text')).toHaveTextContent('HI');
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Send to conversation' }));

    const stored = JSON.parse(window.localStorage.getItem(CONVERSATIONS_KEY));
    expect(stored.conversations[0].messages[0]).toMatchObject({ text: 'HI', source: 'typed', speaker: 'deaf' });
    expect(screen.getByTestId('builder-text')).toHaveTextContent('Start typing a letter');
  });

  it('completes a word with a suggestion from the built-in list', () => {
    renderApp('/fingerspelling');

    ['h', 'e', 'l'].forEach((key) => fireEvent.keyDown(window, { key }));
    const suggestions = screen.getByRole('list', { name: 'Word suggestions' });
    fireEvent.click(within(suggestions).getByRole('button', { name: 'HELP' }));

    expect(screen.getByTestId('builder-text')).toHaveTextContent('HELP');
  });

  it('undoes the last letter with Ctrl+Z and backspaces with the Backspace key', () => {
    renderApp('/fingerspelling');

    ['c', 'a', 't'].forEach((key) => fireEvent.keyDown(window, { key }));
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(screen.getByTestId('builder-text')).toHaveTextContent('CA');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getByTestId('builder-text')).toHaveTextContent('CAT');
  });

  it('corrects a letter by selecting it and pressing the right key', () => {
    renderApp('/fingerspelling');

    ['h', 'a', 't'].forEach((key) => fireEvent.keyDown(window, { key }));
    fireEvent.click(screen.getByRole('button', { name: 'Letter A, Typed. Select to correct.' }));
    fireEvent.keyDown(window, { key: 'o' });

    expect(screen.getByTestId('builder-text')).toHaveTextContent('HOT');
  });

  it('says plainly that no trained model is loaded', () => {
    renderApp('/fingerspelling');

    expect(screen.getByRole('note')).toHaveTextContent('No trained alphabet model is loaded');
  });
});



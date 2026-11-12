import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderWithRouter.jsx';
import { CONVERSATIONS_KEY } from '../lib/conversationStore.js';
import faceFixture from '../test/fixtures/face-grace-hopper.json';

// Simulates the backend: the camera starts, one hand is tracked, and the recognizer reports letter U on each frame.
function mockBackend() {
  let frame = 0;
  return vi.fn(async (url) => {
    const path = String(url);
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (path.endsWith('/camera/start')) return json({ running: true, camera_index: 0, width: 640, height: 480, fps: 30, last_error: null });
    if (path.endsWith('/camera/status')) return json({ running: true, camera_index: 0, width: 640, height: 480, fps: 30, last_error: null });
    if (path.endsWith('/camera/landmarks')) {
      return json({ status: 'hand_detected', running: true, detection_available: true, detection_error: null, hand_count: 1, hands: [] });
    }
    if (path.endsWith('/recognition/latest')) {
      frame += 1;
      return json({ status: 'recognized', label: 'U', confidence: 0.92, threshold: 0.7, frame_sequence: frame });
    }
    if (path.endsWith('/camera/stop')) return json({ running: false, camera_index: null, width: null, height: null, fps: null, last_error: null });
    if (path.endsWith('/face/latest')) {
      return json({
        status: 'face_detected',
        running: true,
        detection_available: true,
        detection_error: null,
        frame_sequence: 1,
        face_count: 1,
        landmark_count: 478,
        faces: [{ bbox: faceFixture.bbox, partially_outside_frame: false, landmarks: faceFixture.landmarks, blendshapes: faceFixture.blendshapes }],
        expression: 'Happy',
        strength: 0.8,
        scores: { Happy: 0.8, Sad: 0, Angry: 0, Surprised: 0, Neutral: 0.2 },
        frames_smoothed: 3,
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
});

describe('Live Studio with a running camera', () => {
  it('turns a held recognised letter into an editable draft and sends it as a sign message', async () => {
    vi.stubGlobal('fetch', mockBackend());
    renderApp('/workspace/live-studio');

    fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));
    expect((await screen.findAllByText('1 hand tracked', {}, { timeout: 3000 })).length).toBeGreaterThan(0);

    const draft = await screen.findByRole('textbox', { name: 'Recognised text, editable before sending' }, { timeout: 6000 });
    await waitFor(() => expect(draft).toHaveValue('U'), { timeout: 6000 });
    expect(screen.getAllByText('92%').length).toBeGreaterThan(0);

    fireEvent.change(draft, { target: { value: 'Ub' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to conversation' }));

    const transcript = screen.getByRole('list', { name: 'Conversation' });
    expect(within(transcript).getByText('Ub')).toBeInTheDocument();
    expect(within(transcript).getByText(/Recognised sign/, { selector: 'span' })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(CONVERSATIONS_KEY)).conversations[0].messages[0]).toMatchObject({
      text: 'Ub',
      source: 'sign',
      speaker: 'deaf',
    });
  }, 15000);

  it('shows the detected face and its expression as an estimate, with the strength in the Recognition tab', async () => {
    vi.stubGlobal('fetch', mockBackend());
    renderApp('/workspace/live-studio');

    fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));
    await waitFor(() => expect(screen.getByTestId('face-overlay')).toHaveTextContent('Face detected'), { timeout: 3000 });
    const overlay = screen.getByTestId('face-overlay');
    expect(overlay).toHaveTextContent('Happy');
    expect(overlay).toHaveTextContent('(estimate)');

    fireEvent.click(screen.getByRole('tab', { name: 'Recognition' }));
    expect(await screen.findByText('Strength 80%')).toBeInTheDocument();
    expect(screen.getByText('478 tracked')).toBeInTheDocument();
  });

  it('draws the face landmark overlay only when the toggle is on, independently of detection', async () => {
    vi.stubGlobal('fetch', mockBackend());
    renderApp('/workspace/live-studio');

    const toggle = screen.getByRole('button', { name: 'Face landmarks' });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));
    await waitFor(() => expect(screen.getByTestId('face-overlay')).toHaveTextContent('Face detected'), { timeout: 3000 });
    expect(screen.queryByTestId('face-landmark-overlay')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Face landmarks' }));
    expect(screen.getByRole('button', { name: 'Face landmarks' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('face-landmark-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('face-overlay')).toHaveTextContent('Face detected');
  });

  it('lists the facial movements the model reported in the Recognition tab', async () => {
    vi.stubGlobal('fetch', mockBackend());
    renderApp('/workspace/live-studio');

    fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));
    await waitFor(() => expect(screen.getByTestId('face-overlay')).toHaveTextContent('Face detected'), { timeout: 3000 });
    fireEvent.click(screen.getByRole('tab', { name: 'Recognition' }));

    const movements = await screen.findByLabelText('Facial movements from the model');
    expect(within(movements).getByText('Jaw open')).toBeInTheDocument();
    const jawRow = within(movements).getByText('Jaw open').closest('li');
    expect(jawRow).toHaveTextContent(faceFixture.blendshapes.jawOpen.toFixed(2));
  });

  it('pauses recognition without stopping the camera', async () => {
    vi.stubGlobal('fetch', mockBackend());
    renderApp('/workspace/live-studio');

    fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pause recognition' }));

    expect(screen.getByRole('button', { name: 'Resume recognition' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Stop Camera' })).toBeEnabled();
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
  });
});

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { describe, expect, it, vi } from 'vitest';
import type { TrackedHand } from '../vision/handTracker';
import { ModelSignSource } from './modelSource';
import type { FetchLike, PredictResponse } from './modelClient';
import { WINDOW_FRAMES } from './landmarkWindow';

const hands: TrackedHand[] = [
  {
    handedness: 'Right',
    score: 0.9,
    landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }) as NormalizedLandmark),
  },
];

function jsonResponse(body: PredictResponse): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const NO_MODEL: PredictResponse = {
  status: 'no_model',
  word: null,
  confidence: 0,
  top3: [],
  threshold: 0.6,
  detail: 'No trained model found.',
  caveat: null,
};

const RECOGNIZED: PredictResponse = {
  status: 'recognized',
  word: 'LIFE',
  confidence: 0.82,
  top3: [
    { word: 'LIFE', confidence: 0.82 },
    { word: 'USE', confidence: 0.1 },
    { word: 'WAR', confidence: 0.05 },
  ],
  threshold: 0.6,
  detail: null,
  caveat: 'Not tested on unseen signers.',
};

// Pushes a full window at the given times and lets the pending request settle.
async function fillWindow(source: ModelSignSource, start: number, frameMs = 33) {
  for (let i = 0; i < WINDOW_FRAMES; i += 1) {
    source.push(hands, start + i * frameMs);
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ModelSignSource', () => {
  it('reports no model and no prediction when the server has no model', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(NO_MODEL));
    const source = new ModelSignSource({ fetch });

    await fillWindow(source, 0);
    const view = source.view(WINDOW_FRAMES * 33);

    expect(view.status).toBe('no_model');
    expect(view.prediction).toBeNull();
    expect(view.detail).toBe('No trained model found.');
  });

  it('returns the top word once the server recognises it', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(RECOGNIZED));
    const source = new ModelSignSource({ fetch });

    await fillWindow(source, 0);
    const view = source.view(WINDOW_FRAMES * 33);

    expect(view.status).toBe('ready');
    expect(view.prediction).toEqual({ word: 'LIFE', confidence: 0.82 });
  });

  it('sends the landmark window to /api/predict as JSON', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(NO_MODEL));
    const source = new ModelSignSource({ fetch });

    await fillWindow(source, 0);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/predict');
    const body = JSON.parse(String(init?.body)) as { landmarks: number[][][][] };
    expect(body.landmarks).toHaveLength(WINDOW_FRAMES);
  });

  it('carries the split caveat from the model card into the view', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(RECOGNIZED));
    const source = new ModelSignSource({ fetch });

    await fillWindow(source, 0);

    expect(source.view(WINDOW_FRAMES * 33).caveat).toBe('Not tested on unseen signers.');
  });

  it('reports the recognizer as unavailable when the request fails', async () => {
    const fetch = vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const source = new ModelSignSource({ fetch });

    await fillWindow(source, 0);
    const view = source.view(WINDOW_FRAMES * 33);

    expect(view.status).toBe('unavailable');
    expect(view.prediction).toBeNull();
  });

  it('does not send a new request while one is in flight', async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    const fetch = vi.fn<FetchLike>(
      () => new Promise<Response>((resolve) => (resolveFirst = resolve)),
    );
    const source = new ModelSignSource({ fetch, intervalMs: 0 });

    for (let i = 0; i < WINDOW_FRAMES + 10; i += 1) source.push(hands, i * 100);

    expect(fetch).toHaveBeenCalledTimes(1);
    resolveFirst?.(jsonResponse(NO_MODEL));
  });

  it('throttles requests to the configured interval', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(NO_MODEL));
    const source = new ModelSignSource({ fetch, intervalMs: 250 });

    await fillWindow(source, 0);
    const after = fetch.mock.calls.length;
    source.push(hands, WINDOW_FRAMES * 33 + 100);
    expect(fetch.mock.calls.length).toBe(after);
  });

  it('drops a prediction that is older than the stale limit', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(RECOGNIZED));
    const source = new ModelSignSource({ fetch, staleAfterMs: 1000 });

    await fillWindow(source, 0);
    expect(source.view(WINDOW_FRAMES * 33).prediction).not.toBeNull();
    expect(source.view(WINDOW_FRAMES * 33 + 5000).prediction).toBeNull();
  });
});

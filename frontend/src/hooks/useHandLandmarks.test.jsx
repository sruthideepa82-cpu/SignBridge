import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cameraService from '../services/cameraService.js';
import useHandLandmarks from './useHandLandmarks.js';

vi.mock('../services/cameraService.js', () => ({
  getHandLandmarks: vi.fn(),
}));

describe('useHandLandmarks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    cameraService.getHandLandmarks.mockResolvedValue({ status: 'no_hand', hand_count: 0, hands: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not request landmarks while the camera is off', () => {
    const { result } = renderHook(() => useHandLandmarks(false));

    expect(cameraService.getHandLandmarks).not.toHaveBeenCalled();
    expect(result.current.landmarks).toBeNull();
  });

  it('polls landmarks while the camera is live and exposes the latest result', async () => {
    cameraService.getHandLandmarks.mockResolvedValue({ status: 'hand_detected', hand_count: 1, hands: [] });

    const { result } = renderHook(() => useHandLandmarks(true));

    await waitFor(() => expect(result.current.landmarks?.status).toBe('hand_detected'));
    expect(cameraService.getHandLandmarks).toHaveBeenCalled();
  });

  it('stops polling when the camera is turned off', async () => {
    const { rerender, result } = renderHook(({ enabled }) => useHandLandmarks(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.landmarks).not.toBeNull());

    rerender({ enabled: false });
    const callsAfterStop = cameraService.getHandLandmarks.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);

    expect(cameraService.getHandLandmarks.mock.calls.length).toBe(callsAfterStop);
    expect(result.current.landmarks).toBeNull();
  });

  it('reports request errors', async () => {
    cameraService.getHandLandmarks.mockRejectedValue(new Error('Cannot reach the SignBridge backend.'));

    const { result } = renderHook(() => useHandLandmarks(true));

    await waitFor(() => expect(result.current.error).toBe('Cannot reach the SignBridge backend.'));
  });
});

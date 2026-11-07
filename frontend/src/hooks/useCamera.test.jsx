import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cameraService from '../services/cameraService.js';
import { ApiError } from '../services/apiClient.js';
import useCamera, { CAMERA_STATUS } from './useCamera.js';

vi.mock('../services/cameraService.js', () => ({
  buildCameraStreamUrl: vi.fn(() => '/api/camera/stream?t=1'),
  getCameraStatus: vi.fn(),
  startCamera: vi.fn(),
  stopCamera: vi.fn(),
}));

describe('useCamera', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cameraService.stopCamera.mockResolvedValue({ running: false });
  });

  it('starts idle with no stream', () => {
    const { result } = renderHook(() => useCamera());

    expect(result.current.status).toBe(CAMERA_STATUS.IDLE);
    expect(result.current.streamUrl).toBeNull();
  });

  it('moves to live and exposes the stream URL after a successful start', async () => {
    cameraService.startCamera.mockResolvedValue({ running: true });
    const { result } = renderHook(() => useCamera());

    await act(() => result.current.startCamera());

    expect(result.current.status).toBe(CAMERA_STATUS.LIVE);
    expect(result.current.streamUrl).toBe('/api/camera/stream?t=1');
  });

  it('shows the backend error message when the camera cannot be opened', async () => {
    cameraService.startCamera.mockRejectedValue(
      new ApiError('The webcam could not be opened.', { status: 503, code: 'camera_unavailable' }),
    );
    const { result } = renderHook(() => useCamera());

    await act(() => result.current.startCamera());

    expect(result.current.status).toBe(CAMERA_STATUS.ERROR);
    expect(result.current.errorMessage).toBe('The webcam could not be opened.');
    expect(result.current.streamUrl).toBeNull();
  });

  it('returns to idle and clears the stream when stopped', async () => {
    cameraService.startCamera.mockResolvedValue({ running: true });
    const { result } = renderHook(() => useCamera());
    await act(() => result.current.startCamera());

    await act(() => result.current.stopCamera());

    expect(result.current.status).toBe(CAMERA_STATUS.IDLE);
    expect(result.current.streamUrl).toBeNull();
    expect(cameraService.stopCamera).toHaveBeenCalled();
  });

  it('reports an interrupted stream when the image fails to load', async () => {
    cameraService.startCamera.mockResolvedValue({ running: true });
    const { result } = renderHook(() => useCamera());
    await act(() => result.current.startCamera());

    act(() => result.current.handleStreamError());

    await waitFor(() => expect(result.current.status).toBe(CAMERA_STATUS.ERROR));
    expect(result.current.errorMessage).toMatch(/interrupted/i);
  });
});

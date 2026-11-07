import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from './apiClient.js';
import { getCameraStatus } from './cameraService.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns parsed JSON for successful responses', async () => {
    fetch.mockResolvedValue(jsonResponse({ running: false }));

    await expect(getCameraStatus()).resolves.toEqual({ running: false });
    expect(fetch).toHaveBeenCalledWith('/api/camera/status', expect.objectContaining({ method: 'GET' }));
  });

  it('maps structured backend errors to ApiError with code and message', async () => {
    fetch.mockResolvedValue(
      jsonResponse(
        { error: { code: 'camera_unavailable', message: 'The webcam could not be opened.' } },
        503,
      ),
    );

    const error = await apiRequest('/camera/start', { method: 'POST' }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(503);
    expect(error.code).toBe('camera_unavailable');
    expect(error.message).toBe('The webcam could not be opened.');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    fetch.mockResolvedValue(new Response('Bad gateway', { status: 502 }));

    const error = await apiRequest('/health').catch((caught) => caught);

    expect(error.status).toBe(502);
    expect(error.code).toBe('http_502');
    expect(error.message).toBe('Request failed with status 502.');
  });

  it('reports a clear message when the backend cannot be reached', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await apiRequest('/health').catch((caught) => caught);

    expect(error.code).toBe('network_error');
    expect(error.message).toMatch(/cannot reach the signbridge backend/i);
  });
});

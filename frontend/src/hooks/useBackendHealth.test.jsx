import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useBackendHealth, { BACKEND_STATUS } from './useBackendHealth.js';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useBackendHealth', () => {
  it('becomes connected by itself once the backend starts after the page loaded', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBackendHealth());

    await waitFor(() => expect(result.current.status).toBe(BACKEND_STATUS.OFFLINE));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    await waitFor(() => expect(result.current.status).toBe(BACKEND_STATUS.ONLINE));
  });

  it('stays offline and keeps trying while the backend is down', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBackendHealth());
    await waitFor(() => expect(result.current.status).toBe(BACKEND_STATUS.OFFLINE));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.status).toBe(BACKEND_STATUS.OFFLINE);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

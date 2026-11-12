import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { LEARN_PROGRESS_KEY } from '../lib/learnProgress.js';
import { PROGRESS_KEY } from './usePracticeProgress.js';
import useLearnProgress, { SYNC_STATUS } from './useLearnProgress.js';

vi.mock('../lib/supabaseClient.js', () => ({ getSupabaseClient: vi.fn() }));

function fakeClient(remoteRows = []) {
  const upsert = vi.fn(() => Promise.resolve({ error: null }));
  const eq = vi.fn(() => Promise.resolve({ data: remoteRows, error: null }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select, upsert }));
  return {
    client: {
      from,
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'user-1' } } } })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
    },
    upsert,
    eq,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  getSupabaseClient.mockReset();
});

describe('useLearnProgress without an account', () => {
  it('keeps everything in this browser and never contacts Supabase', async () => {
    getSupabaseClient.mockResolvedValue(null);
    const { result } = renderHook(() => useLearnProgress());

    act(() => result.current.toggleCompleted('alphabet:A'));
    act(() => result.current.toggleFavourite('alphabet:A'));

    expect(result.current.completedIds).toEqual(['alphabet:A']);
    expect(result.current.favouriteIds).toEqual(['alphabet:A']);
    expect(result.current.syncStatus).toBe(SYNC_STATUS.LOCAL);
    expect(result.current.signedIn).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(PROGRESS_KEY))).toEqual(['A']);
    expect(JSON.parse(window.localStorage.getItem(LEARN_PROGRESS_KEY)).favourites).toEqual(['alphabet:A']);
  });
});

describe('useLearnProgress with a signed-in account', () => {
  it('merges this browser with the account on sign-in and writes the result back', async () => {
    const { client, upsert } = fakeClient([
      { sign_id: 'alphabet:B', completed: true, favourite: true, last_practised_at: '2026-11-11T10:00:00Z' },
    ]);
    getSupabaseClient.mockResolvedValue(client);
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(['A']));

    const { result } = renderHook(() => useLearnProgress());

    await waitFor(() => expect(result.current.syncStatus).toBe(SYNC_STATUS.SYNCED));
    expect(result.current.signedIn).toBe(true);
    expect(result.current.completedIds).toEqual(['alphabet:A', 'alphabet:B']);
    expect(result.current.favouriteIds).toEqual(['alphabet:B']);
    expect(result.current.recent).toEqual([{ id: 'alphabet:B', at: Date.parse('2026-11-11T10:00:00Z') }]);

    const rows = upsert.mock.calls[0][0];
    expect(rows.every((row) => row.user_id === 'user-1')).toBe(true);
    expect(rows.find((row) => row.sign_id === 'alphabet:A')).toMatchObject({ completed: true, favourite: false });
    expect(rows.find((row) => row.sign_id === 'alphabet:B')).toMatchObject({ completed: true, favourite: true });
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'user_id,sign_id' });
  });

  it('saves a change to the account as soon as it is made', async () => {
    const { client, upsert } = fakeClient();
    getSupabaseClient.mockResolvedValue(client);
    const { result } = renderHook(() => useLearnProgress());
    await waitFor(() => expect(result.current.syncStatus).toBe(SYNC_STATUS.SYNCED));
    upsert.mockClear();

    act(() => result.current.toggleFavourite('alphabet:C'));

    await waitFor(() => expect(result.current.syncStatus).toBe(SYNC_STATUS.SYNCED));
    const row = upsert.mock.calls[0][0].find((item) => item.sign_id === 'alphabet:C');
    expect(row).toMatchObject({ favourite: true, completed: false });
  });

  it('keeps local progress and reports the error when the account cannot be reached', async () => {
    const client = fakeClient().client;
    client.from = vi.fn(() => ({
      select: () => ({ eq: () => Promise.resolve({ data: null, error: new Error('offline') }) }),
    }));
    getSupabaseClient.mockResolvedValue(client);

    const { result } = renderHook(() => useLearnProgress());

    await waitFor(() => expect(result.current.syncStatus).toBe(SYNC_STATUS.ERROR));
    act(() => result.current.toggleCompleted('alphabet:D'));
    expect(result.current.completedIds).toEqual(['alphabet:D']);
  });
});

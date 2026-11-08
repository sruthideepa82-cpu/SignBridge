import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import usePracticeProgress, { PROGRESS_KEY } from './usePracticeProgress.js';

describe('usePracticeProgress', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('toggles letters and saves them only in local storage', () => {
    const { result } = renderHook(() => usePracticeProgress());

    act(() => result.current.toggle('C'));
    act(() => result.current.toggle('V'));

    expect(result.current.practised).toEqual(['C', 'V']);
    expect(JSON.parse(window.localStorage.getItem(PROGRESS_KEY))).toEqual(['C', 'V']);

    act(() => result.current.toggle('C'));
    expect(result.current.practised).toEqual(['V']);
  });

  it('restores saved progress on load', () => {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(['L', 'O']));

    const { result } = renderHook(() => usePracticeProgress());

    expect(result.current.practised).toEqual(['L', 'O']);
  });

  it('ignores corrupted saved data instead of failing', () => {
    window.localStorage.setItem(PROGRESS_KEY, '{not json');

    const { result } = renderHook(() => usePracticeProgress());

    expect(result.current.practised).toEqual([]);
  });

  it('reset removes all saved progress', () => {
    const { result } = renderHook(() => usePracticeProgress());
    act(() => result.current.toggle('S'));

    act(() => result.current.reset());

    expect(result.current.practised).toEqual([]);
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull();
  });
});

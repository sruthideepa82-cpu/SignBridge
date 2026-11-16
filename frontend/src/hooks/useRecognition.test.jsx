import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_FRAMES } from '../lib/signBuffer.js';
import { getRecognition } from '../services/recognitionService.js';
import useRecognition from './useRecognition.js';
import useSignBuffer from './useSignBuffer.js';

vi.mock('../services/recognitionService.js', () => ({ getRecognition: vi.fn() }));

const POLL_MS = 100;
let frame = 0;
const ok = () =>
  Promise.resolve({ status: 'recognized', label: 'U', confidence: 0.9, threshold: 0.7, frame_sequence: ++frame });
const fail = () => Promise.reject(new TypeError('Failed to fetch'));

// Lets `count` poll intervals pass. Each poll is flushed on its own, as it is in the app, so every result is rendered.
async function polls(count) {
  await act(async () => {});
  for (let index = 0; index < count; index += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  frame = 0;
  getRecognition.mockReset();
  getRecognition.mockImplementation(ok);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRecognition failure counting', () => {
  it('counts each failed request exactly once', async () => {
    getRecognition.mockImplementation(fail);
    const { result } = renderHook(() => useRecognition(true));

    await polls(2);

    expect(getRecognition).toHaveBeenCalledTimes(3);
    expect(result.current.failures).toBe(3);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe('Failed to fetch');
  });

  it('resets the count after a successful response, and counts the next outage from zero', async () => {
    getRecognition.mockImplementationOnce(fail).mockImplementationOnce(fail);
    const { result } = renderHook(() => useRecognition(true));

    await polls(2);
    expect(result.current.failures).toBe(0);
    expect(result.current.result).toMatchObject({ status: 'recognized', label: 'U' });
    expect(result.current.error).toBe('');

    getRecognition.mockImplementation(fail);
    await polls(1);
    expect(result.current.failures).toBe(1);
  });

  it('resets the count when recognition is stopped', async () => {
    getRecognition.mockImplementation(fail);
    const { result, rerender } = renderHook(({ enabled }) => useRecognition(enabled), {
      initialProps: { enabled: true },
    });
    await polls(1);
    expect(result.current.failures).toBe(2);

    rerender({ enabled: false });

    expect(result.current.failures).toBe(0);
    expect(result.current.result).toBeNull();
  });

  it('does not count requests after recognition has been stopped', async () => {
    getRecognition.mockImplementation(fail);
    const { result, rerender } = renderHook(({ enabled }) => useRecognition(enabled), {
      initialProps: { enabled: true },
    });
    rerender({ enabled: false });
    await polls(3);

    expect(getRecognition).toHaveBeenCalledTimes(1);
    expect(result.current.failures).toBe(0);
  });
});

describe('useRecognition with the sign buffer during a network interruption', () => {
  function useLetterPath(enabled) {
    const recognition = useRecognition(enabled);
    const buffer = useSignBuffer(recognition.result, { failures: recognition.failures });
    return { recognition, buffer };
  }

  it('a short interruption does not duplicate a held letter', async () => {
    const script = [...Array(HOLD_FRAMES).fill('ok'), 'fail', 'fail', ...Array(HOLD_FRAMES).fill('ok')];
    getRecognition.mockImplementation(() => (script.shift() === 'fail' ? fail() : ok()));
    const { result } = renderHook(() => useLetterPath(true));

    await polls(script.length + 2);

    expect(result.current.recognition.failures).toBe(0);
    expect(result.current.buffer.text).toBe('U');
  });

  it('a longer interruption releases the held letter, and the same letter is then committed again', async () => {
    const script = [...Array(HOLD_FRAMES).fill('ok'), 'fail', 'fail', 'fail', ...Array(HOLD_FRAMES).fill('ok')];
    getRecognition.mockImplementation(() => (script.shift() === 'fail' ? fail() : ok()));
    const { result } = renderHook(() => useLetterPath(true));

    await polls(script.length + 2);

    expect(result.current.buffer.text).toBe('UU');
  });
});

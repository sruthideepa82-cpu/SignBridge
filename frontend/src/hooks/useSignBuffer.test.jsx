import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOLD_FRAMES } from '../lib/signBuffer.js';
import useSignBuffer from './useSignBuffer.js';

const recognized = (frame, label) => ({ status: 'recognized', label, confidence: 0.88, threshold: 0.7, frame_sequence: frame });

describe('useSignBuffer', () => {
  it('commits a letter after the hold window and exposes text and progress', () => {
    const { result, rerender } = renderHook(({ value }) => useSignBuffer(value), {
      initialProps: { value: null },
    });

    for (let frame = 1; frame < HOLD_FRAMES; frame += 1) {
      rerender({ value: recognized(frame, 'U') });
    }
    expect(result.current.text).toBe('');
    expect(result.current.holding).toEqual({ label: 'U', count: HOLD_FRAMES - 1, of: HOLD_FRAMES });

    rerender({ value: recognized(HOLD_FRAMES, 'U') });
    expect(result.current.text).toBe('U');
    expect(result.current.holding).toBeNull();
  });

  it('a failed request keeps a held letter, and the same letter is not added again', () => {
    const { result, rerender } = renderHook(({ value, failures }) => useSignBuffer(value, { failures }), {
      initialProps: { value: null, failures: 0 },
    });
    for (let frame = 1; frame <= HOLD_FRAMES; frame += 1) rerender({ value: recognized(frame, 'U'), failures: 0 });
    expect(result.current.text).toBe('U');

    rerender({ value: null, failures: 1 });
    expect(result.current.text).toBe('U');

    for (let frame = HOLD_FRAMES + 1; frame <= HOLD_FRAMES * 2; frame += 1) {
      rerender({ value: recognized(frame, 'U'), failures: 0 });
    }
    expect(result.current.text).toBe('U');
  });

  it('three consecutive failed requests release the held letter', () => {
    const { result, rerender } = renderHook(({ value, failures }) => useSignBuffer(value, { failures }), {
      initialProps: { value: null, failures: 0 },
    });
    for (let frame = 1; frame <= HOLD_FRAMES; frame += 1) rerender({ value: recognized(frame, 'U'), failures: 0 });

    rerender({ value: null, failures: 1 });
    rerender({ value: null, failures: 2 });
    rerender({ value: null, failures: 3 });
    for (let frame = HOLD_FRAMES + 1; frame <= HOLD_FRAMES * 2; frame += 1) {
      rerender({ value: recognized(frame, 'U'), failures: 0 });
    }

    expect(result.current.text).toBe('UU');
  });

  it('counts each failure once, even when the caller re-renders with the same failure count', () => {
    const { result, rerender } = renderHook(({ value, failures }) => useSignBuffer(value, { failures }), {
      initialProps: { value: null, failures: 0 },
    });
    for (let frame = 1; frame <= HOLD_FRAMES; frame += 1) rerender({ value: recognized(frame, 'U'), failures: 0 });

    for (let render = 0; render < 5; render += 1) rerender({ value: null, failures: 1 });
    rerender({ value: null, failures: 2 });
    expect(result.current.text).toBe('U');

    rerender({ value: null, failures: 3 });
    for (let frame = HOLD_FRAMES + 1; frame <= HOLD_FRAMES * 2; frame += 1) {
      rerender({ value: recognized(frame, 'U'), failures: 0 });
    }
    expect(result.current.text).toBe('UU');
  });

  it('a stop with no failed request, such as pausing, releases the held letter at once', () => {
    const { result, rerender } = renderHook(({ value, failures }) => useSignBuffer(value, { failures }), {
      initialProps: { value: null, failures: 0 },
    });
    for (let frame = 1; frame <= HOLD_FRAMES; frame += 1) rerender({ value: recognized(frame, 'U'), failures: 0 });

    rerender({ value: null, failures: 0 });
    for (let frame = HOLD_FRAMES + 1; frame <= HOLD_FRAMES * 2; frame += 1) {
      rerender({ value: recognized(frame, 'U'), failures: 0 });
    }

    expect(result.current.text).toBe('UU');
  });

  it('undo and clear change the text the panel shows', () => {
    const { result, rerender } = renderHook(({ value }) => useSignBuffer(value), {
      initialProps: { value: null },
    });
    for (let frame = 1; frame <= HOLD_FRAMES; frame += 1) rerender({ value: recognized(frame, 'V') });

    act(() => result.current.undo());
    expect(result.current.text).toBe('');

    for (let frame = HOLD_FRAMES + 1; frame <= HOLD_FRAMES * 2; frame += 1) {
      rerender({ value: recognized(frame, 'S') });
    }
    act(() => result.current.clear());
    expect(result.current.items).toEqual([]);
  });
});

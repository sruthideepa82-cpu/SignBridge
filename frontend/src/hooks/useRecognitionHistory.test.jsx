import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT } from '../lib/recognitionHistory.js';
import useRecognitionHistory from './useRecognitionHistory.js';

const recognized = (label) => ({ status: 'recognized', label, confidence: 0.9, threshold: 0.7 });
const noHand = { status: 'no_hand', threshold: 0.7 };

function setup(initial) {
  return renderHook(({ result, receivedAt }) => useRecognitionHistory(result, receivedAt), {
    initialProps: initial,
  });
}

describe('useRecognitionHistory', () => {
  it('starts empty and records nothing for non-classifier results', () => {
    const { result } = setup({ result: { status: 'no_model', threshold: 0.7 }, receivedAt: 1 });

    expect(result.current.entries).toEqual([]);
    expect(result.current.lastPredictionAt).toBeNull();
  });

  it('does not add a duplicate for every frame holding the same sign', () => {
    const { result, rerender } = setup({ result: recognized('A'), receivedAt: 1 });
    rerender({ result: recognized('A'), receivedAt: 2 });
    rerender({ result: recognized('A'), receivedAt: 3 });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].label).toBe('A');
    expect(result.current.lastPredictionAt).toBe(3);
  });

  it('adds a new entry when the sign changes or the hand is lowered and raised again', () => {
    const { result, rerender } = setup({ result: recognized('A'), receivedAt: 1 });
    rerender({ result: recognized('B'), receivedAt: 2 });
    rerender({ result: noHand, receivedAt: 3 });
    rerender({ result: recognized('B'), receivedAt: 4 });

    expect(result.current.entries.map((entry) => entry.label)).toEqual(['B', 'B', 'A']);
  });

  it('keeps only the latest entries', () => {
    const { result, rerender } = setup({ result: recognized('A'), receivedAt: 0 });
    for (let i = 1; i <= HISTORY_LIMIT + 2; i += 1) {
      rerender({ result: recognized(i % 2 ? 'A' : 'B'), receivedAt: i });
    }

    expect(result.current.entries).toHaveLength(HISTORY_LIMIT);
    expect(result.current.entries[0].timestamp).toBe(HISTORY_LIMIT + 2);
  });

  it('clears the history on request', () => {
    const { result, rerender } = setup({ result: recognized('A'), receivedAt: 1 });
    rerender({ result: recognized('B'), receivedAt: 2 });

    result.current.clear();
    rerender({ result: recognized('B'), receivedAt: 3 });

    expect(result.current.entries).toEqual([]);
  });
});

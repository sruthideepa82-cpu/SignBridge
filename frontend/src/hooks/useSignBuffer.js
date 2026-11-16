import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HOLD_FRAMES,
  applyFailedRequests,
  applyRecognition,
  appendSpace,
  clearAll,
  initialBuffer,
  removeAt,
  toText,
  undoLast,
} from '../lib/signBuffer.js';

// `failures` is the count of consecutive failed recognition requests from useRecognition. Each new failure is one
// missing frame, applied once. A null result caused by failures is not a stop, so the first effect leaves it alone.
export default function useSignBuffer(recognition, { holdFrames = HOLD_FRAMES, failures = 0 } = {}) {
  const [state, setState] = useState(initialBuffer);
  const countedFailures = useRef(0);

  useEffect(() => {
    if (recognition === null && failures > 0) return;
    setState((current) => applyRecognition(current, recognition, { holdFrames }));
  }, [recognition, holdFrames, failures]);

  useEffect(() => {
    const fresh = failures - countedFailures.current;
    countedFailures.current = failures;
    if (fresh > 0) setState((current) => applyFailedRequests(current, fresh));
  }, [failures]);

  const addSpace = useCallback(() => setState((current) => appendSpace(current)), []);
  const undo = useCallback(() => setState((current) => undoLast(current)), []);
  const clear = useCallback(() => setState((current) => clearAll(current)), []);
  const remove = useCallback((index) => setState((current) => removeAt(current, index)), []);

  return {
    items: state.items,
    text: toText(state.items),
    holding: state.candidate && state.committedLabel !== state.candidate
      ? { label: state.candidate, count: state.holdCount, of: holdFrames }
      : null,
    addSpace,
    undo,
    clear,
    remove,
  };
}

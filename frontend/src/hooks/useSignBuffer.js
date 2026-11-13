import { useCallback, useEffect, useState } from 'react';
import {
  HOLD_FRAMES,
  applyRecognition,
  appendSpace,
  clearAll,
  initialBuffer,
  removeAt,
  toText,
  undoLast,
} from '../lib/signBuffer.js';

export default function useSignBuffer(recognition, { holdFrames = HOLD_FRAMES } = {}) {
  const [state, setState] = useState(initialBuffer);

  useEffect(() => {
    setState((current) => applyRecognition(current, recognition, { holdFrames }));
  }, [recognition, holdFrames]);

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

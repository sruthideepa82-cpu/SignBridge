import { useCallback, useEffect, useState } from 'react';
import {
  HOLD_FRAMES,
  appendSpace,
  applyRecognition,
  clearAll,
  initialBuffer,
  toText,
  undoLast,
} from '../lib/signBuffer.js';

export default function useSignBuffer(recognition) {
  const [state, setState] = useState(initialBuffer);

  useEffect(() => {
    setState((current) => applyRecognition(current, recognition));
  }, [recognition]);

  const addSpace = useCallback(() => setState((current) => appendSpace(current)), []);
  const undo = useCallback(() => setState((current) => undoLast(current)), []);
  const clear = useCallback(() => setState((current) => clearAll(current)), []);

  return {
    items: state.items,
    text: toText(state.items),
    holding: state.candidate && state.committedLabel === null
      ? { label: state.candidate, count: state.holdCount, of: HOLD_FRAMES }
      : null,
    addSpace,
    undo,
    clear,
  };
}

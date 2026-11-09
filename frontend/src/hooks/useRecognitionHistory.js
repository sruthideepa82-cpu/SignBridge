import { useCallback, useEffect, useRef, useState } from 'react';
import { HISTORY_LIMIT, isClassifierPrediction, predictionKey } from '../lib/recognitionHistory.js';

export default function useRecognitionHistory(result, receivedAt) {
  const [entries, setEntries] = useState([]);
  const [lastPredictionAt, setLastPredictionAt] = useState(null);
  const lastKeyRef = useRef(null);
  const nextIdRef = useRef(0);

  useEffect(() => {
    if (!isClassifierPrediction(result)) {
      lastKeyRef.current = null;
      return;
    }

    setLastPredictionAt(receivedAt);

    const key = predictionKey(result);
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    nextIdRef.current += 1;
    const entry = {
      id: nextIdRef.current,
      status: result.status,
      label: result.label ?? null,
      confidence: result.confidence,
      timestamp: receivedAt,
    };
    setEntries((current) => [entry, ...current].slice(0, HISTORY_LIMIT));
  }, [result, receivedAt]);

  const clear = useCallback(() => setEntries([]), []);

  return { entries, clear, lastPredictionAt };
}

import { useEffect, useState } from 'react';
import { getSequenceRecognition } from '../services/recognitionService.js';

export const SEQUENCE_POLL_INTERVAL_MS = 250;

function sameResult(previous, next) {
  return previous !== null && JSON.stringify(previous) === JSON.stringify(next);
}

// Polls the temporal recogniser while enabled. The result keeps its identity when nothing changed, so
// components that depend on it do not re-render on every poll.
export default function useSequenceRecognition(enabled) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) {
      setResult(null);
      setError('');
      return undefined;
    }

    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await getSequenceRecognition();
        if (!cancelled) {
          setResult((previous) => (sameResult(previous, data) ? previous : data));
          setError('');
        }
      } catch (requestError) {
        if (!cancelled) {
          setResult(null);
          setError(requestError.message);
        }
      } finally {
        inFlight = false;
      }
    };

    poll();
    const intervalId = setInterval(poll, SEQUENCE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled]);

  return { result, error };
}

import { useEffect, useState } from 'react';
import { getRecognition } from '../services/recognitionService.js';

const RECOGNITION_POLL_INTERVAL_MS = 500;

export default function useRecognition(enabled) {
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
        const data = await getRecognition();
        if (!cancelled) {
          setResult(data);
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
    const intervalId = setInterval(poll, RECOGNITION_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled]);

  return { result, error };
}

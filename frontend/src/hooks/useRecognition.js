import { useEffect, useState } from 'react';
import { getRecognition } from '../services/recognitionService.js';

const RECOGNITION_POLL_INTERVAL_MS = 500;

export default function useRecognition(enabled) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [receivedAt, setReceivedAt] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setResult(null);
      setError('');
      setReceivedAt(null);
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
          setReceivedAt(Date.now());
        }
      } catch (requestError) {
        if (!cancelled) {
          setResult(null);
          setError(requestError.message);
          setReceivedAt(null);
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

  return { result, error, receivedAt };
}

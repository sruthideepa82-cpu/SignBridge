import { useEffect, useState } from 'react';
import { getHandLandmarks } from '../services/cameraService.js';

const LANDMARK_POLL_INTERVAL_MS = 250;

export default function useHandLandmarks(enabled) {
  const [landmarks, setLandmarks] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) {
      setLandmarks(null);
      setError('');
      return undefined;
    }

    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await getHandLandmarks();
        if (!cancelled) {
          setLandmarks(data);
          setError('');
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        inFlight = false;
      }
    };

    poll();
    const intervalId = setInterval(poll, LANDMARK_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled]);

  return { landmarks, error };
}

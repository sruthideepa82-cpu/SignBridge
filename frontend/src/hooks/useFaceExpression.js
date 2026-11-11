import { useEffect, useState } from 'react';
import { getFaceExpression } from '../services/cameraService.js';

const FACE_POLL_INTERVAL_MS = 250;

// Polls the backend's face result. The backend reads the same camera frames as the hand tracker, so this
// hook opens no camera of its own. Polling stops when disabled, when the page unmounts, or when the camera stops.
export default function useFaceExpression(enabled) {
  const [face, setFace] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) {
      setFace(null);
      setError('');
      return undefined;
    }

    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await getFaceExpression();
        if (!cancelled) {
          setFace(data);
          setError('');
        }
      } catch (requestError) {
        if (!cancelled) {
          setFace(null);
          setError(requestError.message);
        }
      } finally {
        inFlight = false;
      }
    };

    poll();
    const intervalId = setInterval(poll, FACE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled]);

  return { face, error };
}

import { useEffect, useState } from 'react';
import { STALE_BACKEND_MESSAGE } from '../lib/faceStatus.js';
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
          // A 404 means the backend answering is older than the face endpoint. Say so, instead of a raw HTTP error.
          const stale = requestError.status === 404;
          if (stale) console.error('SignBridge: /api/face/latest returned 404. The backend needs a restart.');
          setError(stale ? STALE_BACKEND_MESSAGE : requestError.message);
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

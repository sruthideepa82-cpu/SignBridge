import { useEffect, useState } from 'react';
import { getPhraseModel, getPhraseRecognition } from '../services/recognitionService.js';

// Polled faster than the camera's frame rate, so every processed frame is seen once. Holds count frames, not polls.
const PHRASE_POLL_INTERVAL_MS = 100;
// The model list is retried while it is missing, so the panel recovers when the backend starts later.
const PHRASE_MODEL_RETRY_MS = 3000;

const STALE_BACKEND_MESSAGE =
  'The backend does not serve the phrase routes. Restart the SignBridge backend so it loads the current code.';

// Polls the phrase recogniser while enabled, and loads the list of phrases the model can recognise.
// Errors keep their code, so a stopped backend can be told apart from a missing model.
export default function usePhraseRecognition(enabled, { phrase = '' } = {}) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState({ message: '', code: '' });
  const [model, setModel] = useState(null);
  const [modelError, setModelError] = useState({ message: '', code: '' });

  useEffect(() => {
    if (!enabled) {
      setResult(null);
      setError({ message: '', code: '' });
      return undefined;
    }

    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await getPhraseRecognition({ phrase: phrase || undefined });
        if (!cancelled) {
          setResult(data);
          setError({ message: '', code: '' });
        }
      } catch (requestError) {
        if (!cancelled) {
          setResult(null);
          setError({
            message: requestError.status === 404 ? STALE_BACKEND_MESSAGE : requestError.message,
            code: requestError.code ?? '',
          });
        }
      } finally {
        inFlight = false;
      }
    };

    poll();
    const intervalId = setInterval(poll, PHRASE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled, phrase]);

  useEffect(() => {
    if (!enabled || model) return undefined;
    let cancelled = false;

    const loadModel = () => {
      getPhraseModel()
        .then((data) => {
          if (!cancelled) {
            setModel(data);
            setModelError({ message: '', code: '' });
          }
        })
        .catch((requestError) => {
          if (!cancelled) {
            setModelError({
              message: requestError.status === 404 ? STALE_BACKEND_MESSAGE : requestError.message,
              code: requestError.code ?? '',
            });
          }
        });
    };

    loadModel();
    const intervalId = setInterval(loadModel, PHRASE_MODEL_RETRY_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled, model]);

  return {
    result,
    error: error.message,
    errorCode: error.code,
    model,
    modelError: modelError.message,
    modelErrorCode: modelError.code,
  };
}

import { useEffect, useState } from 'react';
import { getPhraseModel, getPhraseRecognition } from '../services/recognitionService.js';

const PHRASE_POLL_INTERVAL_MS = 500;

// Polls the phrase recogniser while enabled, and loads the list of phrases the model can recognise.
export default function usePhraseRecognition(enabled, { phrase = '' } = {}) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [model, setModel] = useState(null);

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
        const data = await getPhraseRecognition({ phrase: phrase || undefined });
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
    const intervalId = setInterval(poll, PHRASE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled, phrase]);

  useEffect(() => {
    if (!enabled || model) return undefined;
    let cancelled = false;
    getPhraseModel()
      .then((data) => {
        if (!cancelled) setModel(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, model]);

  return { result, error, model };
}

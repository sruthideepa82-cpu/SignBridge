import { useCallback, useEffect, useRef, useState } from 'react';

// Wraps the browser's speech recognition. When the browser has none, `supported` is false and
// nothing pretends to listen. Recognition runs in the browser; SignBridge's server is not involved.

export function getRecognitionConstructor(scope = typeof window !== 'undefined' ? window : undefined) {
  return scope?.SpeechRecognition ?? scope?.webkitSpeechRecognition ?? null;
}

const ERROR_MESSAGES = {
  'not-allowed': 'Microphone access was blocked. Allow it in your browser settings to use voice input.',
  'service-not-allowed': 'Speech recognition is blocked by your browser.',
  'no-speech': 'No speech was heard. Try again and speak closer to the microphone.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs a network connection in this browser.',
};

export default function useSpeechRecognition({ lang = 'en-IN', scope } = {}) {
  const Constructor = getRecognitionConstructor(scope);
  const supported = Constructor !== null;
  const [status, setStatus] = useState('idle'); // idle | listening | error
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [permission, setPermission] = useState('unknown'); // unknown | granted | prompt | denied
  const recognitionRef = useRef(null);
  const wantListeningRef = useRef(false);
  const onFinalRef = useRef(null);

  useEffect(() => {
    const permissions = typeof navigator !== 'undefined' ? navigator.permissions : undefined;
    if (!permissions?.query) return undefined;
    let cancelled = false;
    permissions
      .query({ name: 'microphone' })
      .then((result) => {
        if (!cancelled) setPermission(result.state);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      wantListeningRef.current = false;
      recognitionRef.current?.abort?.();
    },
    [],
  );

  const start = useCallback(
    (onFinal) => {
      if (!Constructor) return;
      onFinalRef.current = onFinal;
      setError('');
      wantListeningRef.current = true;

      const recognition = new Constructor();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognitionRef.current = recognition;

      recognition.onresult = (event) => {
        let finalText = '';
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) finalText += result[0].transcript;
          else interimText += result[0].transcript;
        }
        setInterim(interimText);
        if (finalText) onFinalRef.current?.(finalText.trim());
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed') setPermission('denied');
        if (event.error === 'aborted') return;
        setError(ERROR_MESSAGES[event.error] ?? `Speech recognition stopped (${event.error}).`);
        wantListeningRef.current = false;
        setStatus('error');
      };

      recognition.onend = () => {
        setInterim('');
        if (wantListeningRef.current) {
          // The browser ends sessions on its own after silence; restart while the user still wants it on.
          try {
            recognition.start();
            return;
          } catch {
            wantListeningRef.current = false;
          }
        }
        setStatus((current) => (current === 'error' ? 'error' : 'idle'));
      };

      try {
        recognition.start();
        setStatus('listening');
        setPermission((current) => (current === 'unknown' ? 'granted' : current));
      } catch {
        wantListeningRef.current = false;
        setError('Speech recognition could not start. Try again.');
        setStatus('error');
      }
    },
    [Constructor, lang],
  );

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    recognitionRef.current?.stop?.();
    setInterim('');
    setStatus('idle');
  }, []);

  return { supported, status, interim, error, permission, start, stop };
}

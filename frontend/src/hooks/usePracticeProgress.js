import { useCallback, useState } from 'react';

// Progress lives only in this browser (localStorage). It is never sent to the server.
export const PROGRESS_KEY = 'signbridge.practice.v1';

function readProgress(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(PROGRESS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeProgress(storage, items) {
  storage.setItem(PROGRESS_KEY, JSON.stringify(items));
}

export default function usePracticeProgress(storage = window.localStorage) {
  const [practised, setPractised] = useState(() => readProgress(storage));

  const toggle = useCallback(
    (letter) => {
      setPractised((current) => {
        const next = current.includes(letter)
          ? current.filter((item) => item !== letter)
          : [...current, letter];
        writeProgress(storage, next);
        return next;
      });
    },
    [storage],
  );

  const merge = useCallback(
    (letters) => {
      setPractised((current) => {
        const next = [...new Set([...current, ...letters])];
        writeProgress(storage, next);
        return next;
      });
    },
    [storage],
  );

  const reset = useCallback(() => {
    storage.removeItem(PROGRESS_KEY);
    setPractised([]);
  }, [storage]);

  return { practised, toggle, merge, reset };
}

import { useCallback, useEffect, useState } from 'react';

// Loads one Studio resource. Shows loading and error states, and never substitutes placeholder data.
export default function useStudioData(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: '', loading: true });

  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    return loader()
      .then((data) => setState({ data, error: '', loading: false }))
      .catch((error) => setState({ data: null, error: error.message || 'Could not load this data.', loading: false }));
    // The loader is supplied by the caller; the caller lists its own dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

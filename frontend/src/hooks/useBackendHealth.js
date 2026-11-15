import { useCallback, useEffect, useState } from 'react';
import { getHealth } from '../services/systemService.js';

export const BACKEND_STATUS = {
  CHECKING: 'checking',
  ONLINE: 'online',
  OFFLINE: 'offline',
};

// While the backend is unreachable, check again quietly so it is noticed when it starts.
const OFFLINE_RECHECK_MS = 5000;

export default function useBackendHealth() {
  const [status, setStatus] = useState(BACKEND_STATUS.CHECKING);

  const probe = useCallback(async () => {
    try {
      await getHealth();
      setStatus(BACKEND_STATUS.ONLINE);
    } catch {
      setStatus(BACKEND_STATUS.OFFLINE);
    }
  }, []);

  const checkHealth = useCallback(() => {
    setStatus(BACKEND_STATUS.CHECKING);
    return probe();
  }, [probe]);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    if (status !== BACKEND_STATUS.OFFLINE) return undefined;
    const intervalId = setInterval(probe, OFFLINE_RECHECK_MS);
    return () => clearInterval(intervalId);
  }, [status, probe]);

  return { status, refresh: checkHealth };
}

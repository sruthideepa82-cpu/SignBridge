import { useCallback, useEffect, useState } from 'react';
import { getHealth } from '../services/systemService.js';

export const BACKEND_STATUS = {
  CHECKING: 'checking',
  ONLINE: 'online',
  OFFLINE: 'offline',
};

export default function useBackendHealth() {
  const [status, setStatus] = useState(BACKEND_STATUS.CHECKING);

  const checkHealth = useCallback(async () => {
    setStatus(BACKEND_STATUS.CHECKING);
    try {
      await getHealth();
      setStatus(BACKEND_STATUS.ONLINE);
    } catch {
      setStatus(BACKEND_STATUS.OFFLINE);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return { status, refresh: checkHealth };
}

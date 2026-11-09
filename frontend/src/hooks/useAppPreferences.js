import { useCallback, useEffect, useState } from 'react';

export const TEXT_SCALES = [
  { id: 'default', label: 'Default', percent: 100 },
  { id: 'large', label: 'Large', percent: 115 },
  { id: 'xlarge', label: 'Extra large', percent: 130 },
];

const TEXT_SCALE_KEY = 'signbridge.textScale';
const SIDEBAR_KEY = 'signbridge.sidebarCollapsed';

function readStorage(key, fallback) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the preference then lasts for this page visit only.
  }
}

export function useTextScale() {
  const [scaleId, setScaleId] = useState(() => readStorage(TEXT_SCALE_KEY, 'default'));

  useEffect(() => {
    const scale = TEXT_SCALES.find((item) => item.id === scaleId) ?? TEXT_SCALES[0];
    document.documentElement.style.fontSize = `${scale.percent}%`;
    writeStorage(TEXT_SCALE_KEY, scale.id);
  }, [scaleId]);

  return { scaleId, setScaleId, scale: TEXT_SCALES.find((item) => item.id === scaleId) ?? TEXT_SCALES[0] };
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => readStorage(SIDEBAR_KEY, 'false') === 'true');

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      writeStorage(SIDEBAR_KEY, String(!current));
      return !current;
    });
  }, []);

  return { collapsed, toggle };
}

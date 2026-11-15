import { useEffect, useState } from 'react';
import { availableVoices, onVoicesChanged } from '../lib/speech.js';

// The browser's speech voices, updated when the browser finishes loading them.
export default function useVoices() {
  const [voices, setVoices] = useState(() => availableVoices());

  useEffect(() => onVoicesChanged(() => setVoices(availableVoices())), []);

  return voices;
}

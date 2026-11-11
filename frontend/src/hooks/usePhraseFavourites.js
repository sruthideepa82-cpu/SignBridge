import { useSyncExternalStore } from 'react';
import { getFavouritesSnapshot, subscribeFavourites } from '../lib/phraseFavourites.js';

export default function usePhraseFavourites() {
  return useSyncExternalStore(subscribeFavourites, getFavouritesSnapshot, getFavouritesSnapshot);
}

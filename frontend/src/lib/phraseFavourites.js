// Saved phrases are kept only in this browser. Each one is either a built-in phrase the user starred
// or a phrase the user wrote themselves (custom).
export const FAVOURITES_KEY = 'signbridge.phrases.favourites.v1';

const MAX_TEXT_LENGTH = 200;

let cache = { raw: undefined, list: [] };
const listeners = new Set();

function parse(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.text === 'string' && item.text.trim())
      .map((item) => ({ text: item.text, custom: item.custom === true }));
  } catch {
    return [];
  }
}

function readRaw() {
  try {
    return window.localStorage.getItem(FAVOURITES_KEY);
  } catch {
    return null;
  }
}

export function getFavouritesSnapshot() {
  const raw = readRaw();
  if (raw !== cache.raw) cache = { raw, list: parse(raw) };
  return cache.list;
}

export function subscribeFavourites(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function save(list) {
  const raw = JSON.stringify(list);
  try {
    window.localStorage.setItem(FAVOURITES_KEY, raw);
  } catch {
    // Storage can be blocked. Saved phrases then last for this page visit only.
  }
  cache = { raw, list };
  listeners.forEach((listener) => listener());
}

export function isFavourite(list, text) {
  return list.some((item) => item.text === text);
}

export function addFavourite(list, text, { custom = false } = {}) {
  const trimmed = text.trim().slice(0, MAX_TEXT_LENGTH);
  if (!trimmed || isFavourite(list, trimmed)) return list;
  return [...list, { text: trimmed, custom }];
}

export function removeFavourite(list, text) {
  return list.filter((item) => item.text !== text);
}

export function moveFavourite(list, text, direction) {
  const index = list.findIndex((item) => item.text === text);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function renameFavourite(list, text, nextText) {
  const trimmed = nextText.trim().slice(0, MAX_TEXT_LENGTH);
  if (!trimmed || (trimmed !== text && isFavourite(list, trimmed))) return list;
  return list.map((item) => (item.text === text ? { ...item, text: trimmed } : item));
}

export const favouriteActions = {
  add: (text, options) => save(addFavourite(getFavouritesSnapshot(), text, options)),
  remove: (text) => save(removeFavourite(getFavouritesSnapshot(), text)),
  rename: (text, nextText) => save(renameFavourite(getFavouritesSnapshot(), text, nextText)),
  move: (text, direction) => save(moveFavourite(getFavouritesSnapshot(), text, direction)),
};

export function clearFavourites() {
  try {
    window.localStorage.removeItem(FAVOURITES_KEY);
  } catch {
    // Nothing to clear if storage is blocked.
  }
  cache = { raw: undefined, list: [] };
  listeners.forEach((listener) => listener());
}

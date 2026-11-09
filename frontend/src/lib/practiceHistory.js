// Practice events are kept only in this browser. A "matched" event is written only when the recogniser
// really returned the target letter; manual "marked" events are written when you tick a letter yourself.
export const PRACTICE_HISTORY_KEY = 'signbridge.practiceHistory.v1';
export const HISTORY_LIMIT = 50;

export function loadHistory(storage = window.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(PRACTICE_HISTORY_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => item && typeof item.letter === 'string' && typeof item.at === 'number' && (item.kind === 'matched' || item.kind === 'marked'),
    );
  } catch {
    return [];
  }
}

export function appendHistory(event, storage = window.localStorage) {
  const next = [...loadHistory(storage), event].slice(-HISTORY_LIMIT);
  storage.setItem(PRACTICE_HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function clearHistory(storage = window.localStorage) {
  storage.removeItem(PRACTICE_HISTORY_KEY);
}

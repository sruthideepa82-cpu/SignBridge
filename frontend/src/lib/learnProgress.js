// Favourites and recently practised signs. Completed letters are stored by usePracticeProgress, which the
// Practice Lab and Guided Learning already use, so every page agrees on which letters are done.
export const LEARN_PROGRESS_KEY = 'signbridge.learnSigns.v1';
export const RECENT_LIMIT = 8;

export const EMPTY_LEARN_STATE = Object.freeze({ favourites: [], recent: [] });

function normaliseState(parsed) {
  const favourites = Array.isArray(parsed?.favourites)
    ? [...new Set(parsed.favourites.filter((id) => typeof id === 'string'))]
    : [];
  const recent = Array.isArray(parsed?.recent)
    ? parsed.recent
        .filter((item) => item && typeof item.id === 'string' && typeof item.at === 'number')
        .slice(0, RECENT_LIMIT)
    : [];
  return { favourites, recent };
}

export function loadLearnState(storage = window.localStorage) {
  try {
    return normaliseState(JSON.parse(storage.getItem(LEARN_PROGRESS_KEY) ?? 'null'));
  } catch {
    return { favourites: [], recent: [] };
  }
}

export function saveLearnState(state, storage = window.localStorage) {
  storage.setItem(LEARN_PROGRESS_KEY, JSON.stringify(state));
  return state;
}

export function withFavourite(state, id) {
  const favourites = state.favourites.includes(id)
    ? state.favourites.filter((item) => item !== id)
    : [...state.favourites, id];
  return { ...state, favourites };
}

export function withPractice(state, id, at = Date.now()) {
  const recent = [{ id, at }, ...state.recent.filter((item) => item.id !== id)].slice(0, RECENT_LIMIT);
  return { ...state, recent };
}

// Combines two copies of the progress, for example this browser and the signed-in account. Nothing is removed.
export function mergeLearnStates(a, b) {
  const favourites = [...new Set([...a.favourites, ...b.favourites])];
  const latest = new Map();
  for (const item of [...a.recent, ...b.recent]) {
    if (!latest.has(item.id) || latest.get(item.id) < item.at) latest.set(item.id, item.at);
  }
  const recent = [...latest]
    .map(([id, at]) => ({ id, at }))
    .sort((x, y) => y.at - x.at)
    .slice(0, RECENT_LIMIT);
  return { favourites, recent };
}

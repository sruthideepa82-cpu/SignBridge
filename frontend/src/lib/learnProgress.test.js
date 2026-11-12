import { beforeEach, describe, expect, it } from 'vitest';
import {
  LEARN_PROGRESS_KEY,
  RECENT_LIMIT,
  loadLearnState,
  mergeLearnStates,
  saveLearnState,
  withFavourite,
  withPractice,
} from './learnProgress.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('learn progress storage', () => {
  it('starts empty and ignores corrupt data', () => {
    expect(loadLearnState()).toEqual({ favourites: [], recent: [] });

    window.localStorage.setItem(LEARN_PROGRESS_KEY, '{not json');
    expect(loadLearnState()).toEqual({ favourites: [], recent: [] });
  });

  it('keeps valid entries and drops malformed ones', () => {
    window.localStorage.setItem(
      LEARN_PROGRESS_KEY,
      JSON.stringify({
        favourites: ['alphabet:A', 'alphabet:A', 42],
        recent: [{ id: 'alphabet:B', at: 5 }, { id: 'alphabet:C' }],
      }),
    );
    expect(loadLearnState()).toEqual({ favourites: ['alphabet:A'], recent: [{ id: 'alphabet:B', at: 5 }] });
  });

  it('saves and reloads state', () => {
    saveLearnState({ favourites: ['alphabet:L'], recent: [{ id: 'alphabet:L', at: 9 }] });
    expect(loadLearnState().favourites).toEqual(['alphabet:L']);
  });
});

describe('favourites and recent practice', () => {
  it('toggles a favourite on and off', () => {
    const on = withFavourite({ favourites: [], recent: [] }, 'alphabet:A');
    expect(on.favourites).toEqual(['alphabet:A']);
    expect(withFavourite(on, 'alphabet:A').favourites).toEqual([]);
  });

  it('moves a practised sign to the front and caps the list', () => {
    let state = { favourites: [], recent: [] };
    for (let i = 0; i < RECENT_LIMIT + 3; i += 1) {
      state = withPractice(state, `alphabet:${i}`, i);
    }
    expect(state.recent).toHaveLength(RECENT_LIMIT);
    expect(state.recent[0]).toEqual({ id: `alphabet:${RECENT_LIMIT + 2}`, at: RECENT_LIMIT + 2 });

    const again = withPractice(state, 'alphabet:3', 999);
    expect(again.recent[0]).toEqual({ id: 'alphabet:3', at: 999 });
    expect(again.recent.filter((item) => item.id === 'alphabet:3')).toHaveLength(1);
  });
});

describe('mergeLearnStates', () => {
  it('keeps every favourite and the latest practice time for each sign', () => {
    const merged = mergeLearnStates(
      { favourites: ['alphabet:A'], recent: [{ id: 'alphabet:B', at: 10 }] },
      { favourites: ['alphabet:C'], recent: [{ id: 'alphabet:B', at: 20 }, { id: 'alphabet:D', at: 5 }] },
    );
    expect(merged.favourites).toEqual(['alphabet:A', 'alphabet:C']);
    expect(merged.recent).toEqual([
      { id: 'alphabet:B', at: 20 },
      { id: 'alphabet:D', at: 5 },
    ]);
  });
});

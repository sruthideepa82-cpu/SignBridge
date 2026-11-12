import { describe, expect, it } from 'vitest';
import { buildProgressRows, rowsToProgress } from './learnProgressService.js';

const SIGNS = [{ id: 'alphabet:A' }, { id: 'alphabet:B' }];

describe('buildProgressRows', () => {
  it('writes a row for every known sign, so removed favourites are cleared remotely', () => {
    const rows = buildProgressRows(['alphabet:A'], { favourites: [], recent: [] }, SIGNS);
    expect(rows).toEqual([
      { sign_id: 'alphabet:A', completed: true, favourite: false, last_practised_at: null },
      { sign_id: 'alphabet:B', completed: false, favourite: false, last_practised_at: null },
    ]);
  });

  it('includes practice and favourite fields', () => {
    const rows = buildProgressRows([], { favourites: ['alphabet:B'], recent: [{ id: 'alphabet:A', at: 0 }] }, SIGNS);
    expect(rows[0]).toMatchObject({ sign_id: 'alphabet:A', last_practised_at: '1970-01-01T00:00:00.000Z' });
    expect(rows[1]).toMatchObject({ sign_id: 'alphabet:B', favourite: true });
  });
});

describe('rowsToProgress', () => {
  it('reads completed signs, favourites and practice times, newest first', () => {
    const progress = rowsToProgress([
      { sign_id: 'alphabet:A', completed: true, favourite: false, last_practised_at: '2026-11-10T10:00:00Z' },
      { sign_id: 'alphabet:B', completed: false, favourite: true, last_practised_at: '2026-11-11T10:00:00Z' },
      { sign_id: 'alphabet:C', completed: false, favourite: false, last_practised_at: null },
    ]);
    expect(progress.completedIds).toEqual(['alphabet:A']);
    expect(progress.state.favourites).toEqual(['alphabet:B']);
    expect(progress.state.recent.map((item) => item.id)).toEqual(['alphabet:B', 'alphabet:A']);
  });
});

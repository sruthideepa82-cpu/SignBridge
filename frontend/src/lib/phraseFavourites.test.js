import { describe, expect, it } from 'vitest';
import { addFavourite, isFavourite, moveFavourite, removeFavourite, renameFavourite } from './phraseFavourites.js';

describe('saved phrases', () => {
  it('adds a phrase once, trimmed, and remembers whether it was written by the user', () => {
    let list = addFavourite([], '  Good morning.  ');
    list = addFavourite(list, 'Good morning.');
    list = addFavourite(list, 'Write my own', { custom: true });

    expect(list).toEqual([
      { text: 'Good morning.', custom: false },
      { text: 'Write my own', custom: true },
    ]);
  });

  it('ignores blank phrases', () => {
    const list = [{ text: 'Hi', custom: false }];
    expect(addFavourite(list, '   ')).toBe(list);
  });

  it('removes a phrase and reports whether it is saved', () => {
    const list = addFavourite([], 'Hello');
    expect(isFavourite(list, 'Hello')).toBe(true);
    expect(removeFavourite(list, 'Hello')).toEqual([]);
  });

  it('moves a phrase up or down and stops at the ends of the list', () => {
    let list = addFavourite(addFavourite([], 'A'), 'B');
    list = moveFavourite(list, 'B', -1);
    expect(list.map((item) => item.text)).toEqual(['B', 'A']);
    expect(moveFavourite(list, 'B', -1)).toBe(list);
    expect(moveFavourite(list, 'A', 1)).toBe(list);
  });
});

describe('renaming a saved phrase', () => {
  it('changes the text of one phrase and refuses a duplicate or blank name', () => {
    const list = addFavourite(addFavourite([], 'A', { custom: true }), 'B');
    expect(renameFavourite(list, 'A', ' C ')).toEqual([
      { text: 'C', custom: true },
      { text: 'B', custom: false },
    ]);
    expect(renameFavourite(list, 'A', 'B')).toBe(list);
    expect(renameFavourite(list, 'A', '  ')).toBe(list);
  });
});

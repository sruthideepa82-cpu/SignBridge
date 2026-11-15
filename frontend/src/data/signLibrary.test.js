import { describe, expect, it } from 'vitest';
import { SIGNS, clipPathFor, isQuizEligible, signById } from './signLibrary.js';

const APPROVED_LETTER = {
  id: 'alphabet:B',
  verified: true,
  clipPath: clipPathFor('alphabet', 'B'),
};

describe('isQuizEligible', () => {
  it('needs an approved mapping and an animation the server returns', () => {
    expect(isQuizEligible(APPROVED_LETTER, { [APPROVED_LETTER.clipPath]: true })).toBe(true);
  });

  it('refuses an unapproved sign even when its animation exists', () => {
    const unapproved = { ...APPROVED_LETTER, verified: false };
    expect(isQuizEligible(unapproved, { [unapproved.clipPath]: true })).toBe(false);
  });

  it('refuses an approved sign whose animation is missing', () => {
    expect(isQuizEligible(APPROVED_LETTER, {})).toBe(false);
  });
});

describe('sign catalog', () => {
  it('keeps letters, numbers and phrases in separate categories', () => {
    expect(SIGNS.filter((sign) => sign.category === 'alphabet')).toHaveLength(26);
    expect(SIGNS.filter((sign) => sign.category === 'numbers')).toHaveLength(10);
    expect(SIGNS.filter((sign) => sign.category === 'words')).toHaveLength(44);
  });

  it('gives numbers their own ids and titles, never letter ids', () => {
    expect(signById('numbers:0')).toMatchObject({ title: 'Number 0', category: 'numbers' });
    expect(signById('alphabet:0')).toBeNull();
  });

  it('keeps the existing letter ids, so saved progress still matches', () => {
    expect(signById('alphabet:K')).toMatchObject({ title: 'Letter K', category: 'alphabet' });
  });

  it('marks nothing approved or training ready', () => {
    expect(SIGNS.every((sign) => sign.verified === false && sign.trainingReady === false)).toBe(true);
  });

  it('points the number and phrase animations at their own folders', () => {
    expect(signById('numbers:7').clipPath).toBe('/animations/numbers/7.mp4');
    expect(signById('phrase:good-morning').clipPath).toBe('/animations/phrases/good-morning.mp4');
  });
});

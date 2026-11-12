import { describe, expect, it } from 'vitest';
import { displayableSigns, SIGNS } from '../data/signLibrary.js';
import { findVerifiedSign, normalisePhrase, toSignSequence } from './signTranslation.js';

const VERIFIED = {
  id: 'word:hello',
  category: 'words',
  label: 'Hello',
  title: 'Hello',
  phrase: 'Hello',
  verified: true,
};

describe('normalisePhrase', () => {
  it('lower-cases, drops punctuation and collapses spaces', () => {
    expect(normalisePhrase('  Good   MORNING! ')).toBe('good morning');
    expect(normalisePhrase("Don't stop?")).toBe("don't stop");
  });

  it('returns an empty key for empty input', () => {
    expect(normalisePhrase(null)).toBe('');
    expect(normalisePhrase('   ')).toBe('');
  });
});

describe('findVerifiedSign', () => {
  it('matches only verified entries', () => {
    const unverified = { ...VERIFIED, id: 'word:bye', phrase: 'Bye', verified: false };
    expect(findVerifiedSign('bye', [unverified])).toBeNull();
    expect(findVerifiedSign('hello', [VERIFIED])).toBe(VERIFIED);
  });

  it('never matches alphabet letters, which have no phrase and are not verified', () => {
    expect(findVerifiedSign('a', SIGNS)).toBeNull();
  });
});

describe('toSignSequence', () => {
  it('returns null for every word that has no verified sign, instead of guessing', () => {
    const sequence = toSignSequence('hello there', [VERIFIED]);
    expect(sequence).toEqual([
      { text: 'hello', sign: VERIFIED },
      { text: 'there', sign: null },
    ]);
  });

  it('prefers a whole-phrase match', () => {
    const phrase = { ...VERIFIED, id: 'phrase:good-morning', phrase: 'Good morning' };
    expect(toSignSequence('good morning!', [phrase])).toEqual([{ text: 'good morning', sign: phrase }]);
  });

  it('is empty for blank input', () => {
    expect(toSignSequence('  ', [VERIFIED])).toEqual([]);
  });
});

describe('displayableSigns', () => {
  it('lists the full alphabet even though no letter is signer-verified', () => {
    const letters = displayableSigns('alphabet');
    expect(letters).toHaveLength(26);
    expect(letters.every((sign) => sign.verified === false)).toBe(true);
  });

  it('hides numbers and words until they have verified entries', () => {
    expect(displayableSigns('numbers')).toEqual([]);
    expect(displayableSigns('words')).toEqual([]);
    expect(displayableSigns('words', [VERIFIED])).toEqual([VERIFIED]);
  });
});

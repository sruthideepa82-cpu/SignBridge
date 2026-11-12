import { SIGNS } from '../data/signLibrary.js';

// Lookup key for a typed word or phrase. It only normalises text; it never guesses a meaning.
export function normalisePhrase(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns a sign only when a verified entry has exactly this phrase. Unverified signs never match.
export function findVerifiedSign(text, signs = SIGNS) {
  const key = normalisePhrase(text);
  if (!key) return null;
  return signs.find((sign) => sign.verified && sign.phrase && normalisePhrase(sign.phrase) === key) ?? null;
}

// Tries the whole phrase first, then each word. A word with no verified sign gets `sign: null`, so the
// caller can show it as missing instead of substituting a guess.
export function toSignSequence(text, signs = SIGNS) {
  const key = normalisePhrase(text);
  if (!key) return [];
  const whole = findVerifiedSign(key, signs);
  if (whole) return [{ text: key, sign: whole }];
  return key.split(' ').map((word) => ({ text: word, sign: findVerifiedSign(word, signs) }));
}

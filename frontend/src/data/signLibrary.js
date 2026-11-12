// Sign metadata only. Playback lives in components/animation and lookups live in lib/signTranslation.js.
// Alphabet entries are generated from the fingerspelling export, so their status is never edited here.
import { FINGERSPELLING_CLASSES } from './fingerspelling.js';

export const ANIMATION_ROOT = '/animations';

export const SIGN_CATEGORIES = [
  { id: 'alphabet', label: 'Alphabet A–Z', description: 'Fingerspelling letters. Watch each handshape and copy it.' },
  { id: 'numbers', label: 'Numbers 0–9', description: 'Shown only after each number sign has a verified mapping.' },
  {
    id: 'words',
    label: 'Common Words & Phrases',
    description: 'Shown only after each word or phrase has a verified mapping.',
  },
  {
    id: 'practice',
    label: 'Practice & Quiz',
    description: 'Review favourites and recent signs, and test yourself on the alphabet.',
  },
];

const REFERENCE_NAMES = {
  'ISLRTC-ALPHABET': 'ISLRTC English Alphabet chart',
  'USER-CHART': 'provisional chart, source not confirmed',
};

const ALPHABET_PREFIX = 'alphabet:';

export function clipPathFor(category, name) {
  return `${ANIMATION_ROOT}/${category}/${name}.mp4`;
}

export function alphabetSignId(letter) {
  return `${ALPHABET_PREFIX}${letter}`;
}

export function letterFromSignId(id) {
  return id.startsWith(ALPHABET_PREFIX) ? id.slice(ALPHABET_PREFIX.length) : null;
}

function alphabetSign(entry) {
  const moving = entry.recognition_type !== 'static';
  return {
    id: alphabetSignId(entry.label),
    category: 'alphabet',
    label: entry.label,
    title: `Letter ${entry.label}`,
    phrase: null,
    motion: moving ? 'moving' : 'static',
    description: moving
      ? `Letter ${entry.label} involves movement. Watch the whole clip, because the handshape changes as the hand moves.`
      : `Letter ${entry.label} is a still handshape. Watch the clip, then copy the shape.`,
    reference: REFERENCE_NAMES[entry.source] ?? 'reference not confirmed',
    verified: entry.verified === true,
    signerConfirmed: entry.signer_confirmed === true,
    clipPath: clipPathFor('alphabet', entry.label),
  };
}

// Numbers and words are added here only once they have a verified mapping. Nothing is invented to fill them.
export const SIGNS = FINGERSPELLING_CLASSES.map(alphabetSign);

export function signById(id, signs = SIGNS) {
  return signs.find((sign) => sign.id === id) ?? null;
}

// The alphabet always lists A–Z, as the explorer requires. Every other category lists only verified signs.
export function displayableSigns(category, signs = SIGNS) {
  const inCategory = signs.filter((sign) => sign.category === category);
  return category === 'alphabet' ? inCategory : inCategory.filter((sign) => sign.verified);
}

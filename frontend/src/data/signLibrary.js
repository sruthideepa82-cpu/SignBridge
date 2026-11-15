// Sign metadata only. Playback lives in components/animation and lookups live in lib/signTranslation.js.
// Letters and numbers come from the generated fingerspelling export, and phrases from the generated phrase export.
// Their status is never edited here.
import { FINGERSPELLING_CLASSES } from './fingerspelling.js';
import { PHRASE_ENTRIES } from './phraseVocabulary.js';

export const ANIMATION_ROOT = '/animations';

export const SIGN_CATEGORIES = [
  { id: 'alphabet', label: 'Alphabet A–Z', description: 'Fingerspelling letters. Watch each handshape and copy it.' },
  {
    id: 'numbers',
    label: 'Numbers 0–9',
    description: 'Number signs. Each one shows its review status. None is used in quizzes until its mapping is approved.',
  },
  {
    id: 'words',
    label: 'Common Words & Phrases',
    description: 'Everyday phrases. Each one shows its review status and whether the camera model covers it.',
  },
  {
    id: 'practice',
    label: 'Practice & Quiz',
    description: 'Review favourites and recent signs, and test yourself on approved letters with animations.',
  },
];

const PHRASE_SOURCE_ID = 'OWNER-PHRASE-ARCHIVE';

const REFERENCE_NAMES = {
  'ISLRTC-ALPHABET': 'ISLRTC English Alphabet chart',
  'USER-CHART': 'provisional chart, source not confirmed',
  'OWNER-STATIC-SET': 'owner-supplied static image sets (training reference)',
  [PHRASE_SOURCE_ID]: 'owner-supplied phrase image archive (stills from several angles)',
};

const PHRASE_RECOGNITION_TEXT = {
  in_model: 'The camera model covers this phrase. Recognition does not approve the mapping.',
  excluded_dynamic: 'This phrase needs movement, so the static camera model does not cover it.',
  excluded_undetermined: 'The camera model does not cover this phrase yet.',
};

const LETTER_PREFIX = 'alphabet:';

export function clipPathFor(category, name) {
  return `${ANIMATION_ROOT}/${category}/${name}.mp4`;
}

export function alphabetSignId(letter) {
  return `${LETTER_PREFIX}${letter}`;
}

export function letterFromSignId(id) {
  return id.startsWith(LETTER_PREFIX) ? id.slice(LETTER_PREFIX.length) : null;
}

function vocabularySign(entry) {
  const isLetter = entry.category === 'alphabet';
  const moving = entry.recognition_type !== 'static';
  const noun = isLetter ? 'Letter' : 'Number';
  return {
    id: `${entry.category}:${entry.label}`,
    category: entry.category,
    label: entry.label,
    title: `${noun} ${entry.label}`,
    phrase: null,
    motion: moving ? 'moving' : 'static',
    description: moving
      ? `${noun} ${entry.label} involves movement. Watch the whole clip, because the handshape changes as the hand moves.`
      : `${noun} ${entry.label} is a still handshape. Watch the clip, then copy the shape.`,
    reference: REFERENCE_NAMES[entry.source] ?? 'reference not confirmed',
    verified: entry.verified === true,
    signerConfirmed: entry.signer_confirmed === true,
    assetAvailable: entry.asset_available === true,
    trainingReady: entry.training_ready === true,
    recognitionStatus: null,
    clipPath: clipPathFor(entry.category, entry.label),
  };
}

function phraseSign(entry) {
  return {
    id: entry.id,
    category: 'words',
    label: entry.display_name,
    title: entry.display_name,
    phrase: entry.label,
    motion: entry.recognition_status === 'excluded_dynamic' ? 'moving' : 'unknown',
    description: `Phrase "${entry.label}". ${PHRASE_RECOGNITION_TEXT[entry.recognition_status] ?? ''}`.trim(),
    reference: REFERENCE_NAMES[PHRASE_SOURCE_ID],
    verified: entry.verified === true,
    signerConfirmed: entry.signer_confirmed === true,
    assetAvailable: entry.asset_available === true,
    trainingReady: entry.training_ready === true,
    recognitionStatus: entry.recognition_status,
    clipPath: clipPathFor('phrases', entry.asset_name),
  };
}

// Letters, numbers and phrases. Nothing is invented: every entry comes from a generated export.
export const SIGNS = [...FINGERSPELLING_CLASSES.map(vocabularySign), ...PHRASE_ENTRIES.map(phraseSign)];

export function signById(id, signs = SIGNS) {
  return signs.find((sign) => sign.id === id) ?? null;
}

// Every sign in a category is listed, with its review status shown. Approval never hides a sign.
export function displayableSigns(category, signs = SIGNS) {
  return signs.filter((sign) => sign.category === category);
}

// A quiz question needs an approved mapping and an animation that the server actually returns.
export function isQuizEligible(sign, clipStatus) {
  return sign.verified === true && clipStatus[sign.clipPath] === true;
}

// Mirror of the dataset status recorded in ai-engine/dataset/README.md and metadata/vocabulary.json.
// The app cannot read those files at runtime, so update this file when the vocabulary or protocol changes.
// Last synced: 2026-11-08. Nothing here is recorded or sent from the browser.

export const DATASET_STATUS_DATE = '2026-11-08';

export const VOCABULARY_SOURCE = {
  name: 'English Alphabets in Indian Sign Language, ISLRTC chart',
  url: 'https://cdnbbsr.s3waas.gov.in/s3f7e2b2b75b04175610e5a00c1e221ebb/uploads/2025/06/202506021220778202.pdf',
};

// Letters that are on the vocabulary list. `checked` means read against the chart; `signerConfirmed`
// means a Deaf ISL signer or qualified interpreter has confirmed the handshape. Only checked is true.
export const VOCABULARY = [
  { label: 'C', meaning: 'English letter C in ISL fingerspelling', hands: 1, checked: true, signerConfirmed: false },
  { label: 'L', meaning: 'English letter L in ISL fingerspelling', hands: 1, checked: true, signerConfirmed: false },
  { label: 'O', meaning: 'English letter O in ISL fingerspelling', hands: 1, checked: true, signerConfirmed: false },
  { label: 'S', meaning: 'English letter S in ISL fingerspelling', hands: 1, checked: true, signerConfirmed: false },
  { label: 'U', meaning: 'English letter U in ISL fingerspelling', hands: 1, checked: true, signerConfirmed: false },
  { label: 'V', meaning: 'English letter V in ISL fingerspelling', hands: 1, checked: true, signerConfirmed: false },
];

export const CONTRIBUTION_STAGES = [
  {
    id: 'vocabulary',
    label: 'Vocabulary approval',
    state: 'Partly checked',
    detail:
      'Six letters are checked against the ISLRTC chart by an AI assistant. None is yet confirmed by a Deaf ISL signer or qualified interpreter.',
  },
  {
    id: 'consent',
    label: 'Consent',
    state: 'Managed offline',
    detail:
      'A consent form template is drafted and needs ethics approval before use. Signed forms are kept outside the repository and are not shown in this app.',
  },
  {
    id: 'recordings',
    label: 'Recordings',
    state: 'Not reported here',
    detail:
      'Samples are recorded with the offline collection tool. This app does not count or receive recordings, so no totals are shown.',
  },
  {
    id: 'training',
    label: 'Model training',
    state: 'Not trained',
    detail:
      'No classifier has been trained. Training needs at least two participants in each of the train, validation and test splits.',
  },
];

export const RECORDING_GUIDANCE = [
  'Vary hand size, skin tone, lighting, background, camera angle and where the hand sits in the frame.',
  'Record with both hands where the sign needs them, and with your usual dominant hand.',
  'Record across several sessions and days.',
  'Change the posture slightly between samples so they are not identical.',
];

export const CONSENT_POINTS = [
  'Only hand landmarks are recorded: 21 points per hand. No video, images or audio are kept.',
  'You are identified only by a pseudonym such as P001. Your name and contact details are never stored with the data.',
  'You can ask for your data to be removed. The research team deletes your raw files and rows in the split table.',
  'The consent form is kept outside the repository, and the link between your pseudonym and you is held offline.',
];

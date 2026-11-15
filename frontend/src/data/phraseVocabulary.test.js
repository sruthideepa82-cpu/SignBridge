import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHRASE_ENTRIES, PHRASE_VERIFIED_COUNT } from './phraseVocabulary.js';

// Tests run from the frontend folder (npm test), so the repository root is one level up.
const vocabularyPath = resolve(process.cwd(), '..', 'ai-engine', 'dataset', 'metadata', 'phrase_vocabulary.json');
const vocabulary = JSON.parse(readFileSync(vocabularyPath, 'utf8'));

describe('generated phrase vocabulary', () => {
  it('matches phrase_vocabulary.json, so the UI and the tools use the same phrases', () => {
    expect(PHRASE_ENTRIES.map((item) => item.id)).toEqual(vocabulary.phrases.map((item) => item.id));
    for (const entry of vocabulary.phrases) {
      const generated = PHRASE_ENTRIES.find((item) => item.id === entry.id);
      expect(generated).toMatchObject({
        label: entry.label,
        reference_folder: entry.reference_folder,
        recognition_status: entry.recognition_status,
        verified: entry.verified,
      });
    }
  });

  it('lists all 44 daily phrases with a reference folder each', () => {
    expect(PHRASE_ENTRIES).toHaveLength(44);
    expect(PHRASE_ENTRIES.every((item) => item.reference_folder && item.reference_image_count === 40)).toBe(true);
  });

  it('splits the phrases between the camera model and its exclusions, without assuming all have a model', () => {
    const inModel = PHRASE_ENTRIES.filter((item) => item.recognition_status === 'in_model');
    const excluded = PHRASE_ENTRIES.filter((item) => item.recognition_status !== 'in_model');
    expect(inModel).toHaveLength(vocabulary.recognition_model.labels);
    expect(excluded).toHaveLength(vocabulary.recognition_model.excluded);
    expect(inModel.length + excluded.length).toBe(44);
  });

  it('keeps every phrase unverified and not training ready', () => {
    expect(PHRASE_VERIFIED_COUNT).toBe(0);
    expect(PHRASE_ENTRIES.every((item) => item.verified === false && item.signer_confirmed === false)).toBe(true);
    expect(PHRASE_ENTRIES.every((item) => item.training_ready === false)).toBe(true);
  });
});

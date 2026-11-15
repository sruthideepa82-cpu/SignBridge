import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONSENT_STATUS, FINGERSPELLING_CLASSES, VERIFIED_CLASS_COUNT } from './fingerspelling.js';

// Tests run from the frontend folder (npm test), so the repository root is one level up.
const vocabularyPath = resolve(process.cwd(), '..', 'ai-engine', 'dataset', 'metadata', 'vocabulary.json');
const vocabulary = JSON.parse(readFileSync(vocabularyPath, 'utf8'));

describe('generated fingerspelling vocabulary', () => {
  it('matches vocabulary.json, so the UI and the recording tools use the same classes', () => {
    expect(FINGERSPELLING_CLASSES.map((item) => item.label)).toEqual(vocabulary.classes.map((item) => item.label));
    for (const entry of vocabulary.classes) {
      const generated = FINGERSPELLING_CLASSES.find((item) => item.label === entry.label);
      expect(generated).toMatchObject({
        class_id: entry.class_id,
        recognition_type: entry.recognition_type,
        verification_status: entry.verification_status,
        training_status: entry.training_status,
        verified: entry.verified,
      });
    }
  });

  it('lists A to Z as letters and 0 to 9 as numbers, with J and Z as temporal candidates', () => {
    const letters = FINGERSPELLING_CLASSES.filter((item) => item.category === 'alphabet').map((item) => item.label);
    const numbers = FINGERSPELLING_CLASSES.filter((item) => item.category === 'numbers').map((item) => item.label);
    expect(letters).toHaveLength(26);
    expect(letters[0]).toBe('A');
    expect(letters[25]).toBe('Z');
    expect(numbers).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(FINGERSPELLING_CLASSES.filter((item) => item.recognition_type === 'temporal').map((item) => item.label)).toEqual(['J', 'Z']);
  });

  it('never places a number under the letters', () => {
    const letterLabels = FINGERSPELLING_CLASSES.filter((item) => item.category === 'alphabet').map((item) => item.label);
    expect(letterLabels.some((label) => /\d/.test(label))).toBe(false);
  });

  it('reports asset and training status separately from approval', () => {
    for (const item of FINGERSPELLING_CLASSES) {
      expect(typeof item.asset_available).toBe('boolean');
      expect(item.training_ready).toBe(false);
    }
  });

  it('marks every class unverified, so nothing can be recorded or trained yet', () => {
    expect(VERIFIED_CLASS_COUNT).toBe(0);
    expect(FINGERSPELLING_CLASSES.every((item) => item.verified === false)).toBe(true);
    expect(FINGERSPELLING_CLASSES.every((item) => item.verification_status === 'unverified')).toBe(true);
  });

  it('records that no participant has consented', () => {
    expect(CONSENT_STATUS).toBe('not_recorded');
  });

  it('keeps J and Z out of the initial static classifier', () => {
    const excluded = FINGERSPELLING_CLASSES.filter((item) => item.training_status === 'excluded_temporal').map((item) => item.label);
    expect(excluded).toEqual(['J', 'Z']);
  });
});

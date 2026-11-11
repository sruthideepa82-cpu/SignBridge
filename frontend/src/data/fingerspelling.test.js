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

  it('lists A to Z with J and Z as temporal candidates', () => {
    const labels = FINGERSPELLING_CLASSES.map((item) => item.label);
    expect(labels).toHaveLength(26);
    expect(labels[0]).toBe('A');
    expect(labels[25]).toBe('Z');
    expect(FINGERSPELLING_CLASSES.filter((item) => item.recognition_type === 'temporal').map((item) => item.label)).toEqual(['J', 'Z']);
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

import { describe, expect, it } from 'vitest';
import { RECOGNITION_MODES, RECOGNITION_MODE_KEY, loadRecognitionMode, saveRecognitionMode } from './recognitionMode.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };
}

describe('recognition mode preference', () => {
  it('defaults to Alphabet Mode', () => {
    expect(loadRecognitionMode(memoryStorage())).toBe(RECOGNITION_MODES.ALPHABET);
  });

  it('remembers Daily Phrases Mode', () => {
    const storage = memoryStorage();
    saveRecognitionMode(RECOGNITION_MODES.PHRASES, storage);

    expect(storage.getItem(RECOGNITION_MODE_KEY)).toBe('phrases');
    expect(loadRecognitionMode(storage)).toBe(RECOGNITION_MODES.PHRASES);
  });

  it('treats an unknown stored value as Alphabet Mode', () => {
    expect(loadRecognitionMode(memoryStorage({ [RECOGNITION_MODE_KEY]: 'something-else' }))).toBe(RECOGNITION_MODES.ALPHABET);
  });

  it('works when storage is unavailable', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };

    expect(loadRecognitionMode(broken)).toBe(RECOGNITION_MODES.ALPHABET);
    expect(saveRecognitionMode(RECOGNITION_MODES.PHRASES, broken)).toBe(RECOGNITION_MODES.PHRASES);
  });
});

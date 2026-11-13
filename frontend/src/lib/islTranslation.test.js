import { describe, expect, it } from 'vitest';
import { translateGlosses } from './islTranslation.js';

describe('translateGlosses', () => {
  it('turns a greeting and a question phrase into a sentence', () => {
    expect(translateGlosses(['HELLO', 'HOW', 'YOU'])).toEqual({
      text: 'Hello, how are you?',
      unmapped: [],
      isQuestion: true,
    });
  });

  it('puts the time expression first, as ISL does', () => {
    expect(translateGlosses(['YOU', 'GO', 'TOMORROW']).text).toBe('Tomorrow you go.');
    expect(translateGlosses(['TOMORROW', 'ME', 'GO']).text).toBe('Tomorrow I go.');
  });

  it('places NOT before the verb it negates', () => {
    expect(translateGlosses(['ME', 'GO', 'NOT']).text).toBe('I do not go.');
  });

  it('moves a closing please to the end after a comma', () => {
    expect(translateGlosses(['ME', 'WANT', 'WATER', 'PLEASE']).text).toBe('I want water, please.');
  });

  it('marks unknown signs as unmapped instead of guessing', () => {
    const result = translateGlosses(['ME', 'ZEBRA']);

    expect(result.text).toBe('I zebra.');
    expect(result.unmapped).toEqual(['ZEBRA']);
  });

  it('returns an empty draft for no signs', () => {
    expect(translateGlosses([])).toEqual({ text: '', unmapped: [], isQuestion: false });
  });
});

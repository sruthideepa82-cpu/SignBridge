import { describe, expect, it } from 'vitest';
import { SILENCE_MS, silenceEnded } from './utterance';

describe('silence trigger', () => {
  it('ends the utterance after 2.5 s with no hands, once words were signed', () => {
    expect(silenceEnded(1000, 1000 + SILENCE_MS, 2)).toBe(true);
  });

  it('does not end before the silence window', () => {
    expect(silenceEnded(1000, 1000 + SILENCE_MS - 1, 2)).toBe(false);
  });

  it('does not end an utterance that has no words yet', () => {
    expect(silenceEnded(0, 10_000, 0)).toBe(false);
  });
});

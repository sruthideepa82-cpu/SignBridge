import { describe, expect, it } from 'vitest';
import { QUIZ_CHOICES, QUIZ_MIN_CLIPS, buildQuizQuestion } from './quiz.js';

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const sign = (label) => ({ id: `alphabet:${label}`, label });

describe('buildQuizQuestion', () => {
  it('needs a minimum number of available clips', () => {
    const pool = LABELS.slice(0, QUIZ_MIN_CLIPS - 1).map(sign);
    expect(buildQuizQuestion(pool, LABELS)).toBeNull();
  });

  it('offers the correct letter once, among distinct choices', () => {
    const pool = ['A', 'B', 'C'].map(sign);
    for (let seed = 0; seed < 25; seed += 1) {
      let state = seed + 1;
      const random = () => {
        state = (state * 16807) % 2147483647;
        return state / 2147483647;
      };
      const question = buildQuizQuestion(pool, LABELS, random);
      expect(question.options).toHaveLength(QUIZ_CHOICES);
      expect(new Set(question.options).size).toBe(QUIZ_CHOICES);
      expect(question.options.filter((label) => label === question.sign.label)).toHaveLength(1);
    }
  });

  it('only asks about signs from the pool', () => {
    const pool = ['L', 'O', 'V'].map(sign);
    const question = buildQuizQuestion(pool, LABELS, () => 0);
    expect(pool.map((item) => item.label)).toContain(question.sign.label);
  });
});

import { describe, expect, it } from 'vitest';
import fixture from '../test/fixtures/face-grace-hopper.json';
import { summariseBlendshapes } from './faceBlendshapes.js';

describe('summariseBlendshapes', () => {
  it('shows nothing when the model gave no scores', () => {
    expect(summariseBlendshapes(null)).toEqual([]);
    expect(summariseBlendshapes(undefined)).toEqual([]);
  });

  it('averages the left and right categories of a movement', () => {
    const rows = summariseBlendshapes({ mouthSmileLeft: 0.8, mouthSmileRight: 0.4, jawOpen: 0.1 });

    expect(rows.find((row) => row.key === 'smile')).toMatchObject({ value: 0.6, group: 'Mouth' });
    expect(rows.find((row) => row.key === 'jaw')).toMatchObject({ value: 0.1, group: 'Jaw' });
  });

  it('leaves out movements the model did not report', () => {
    const rows = summariseBlendshapes({ jawOpen: 0.3 });

    expect(rows.map((row) => row.key)).toEqual(['jaw']);
  });

  it('reads the real model output for the photo without inventing values', () => {
    const rows = summariseBlendshapes(fixture.blendshapes);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.value).toBeGreaterThanOrEqual(0);
      expect(row.value).toBeLessThanOrEqual(1);
    }
    expect(rows.find((row) => row.key === 'jaw').value).toBe(Math.round(fixture.blendshapes.jawOpen * 100) / 100);
  });
});

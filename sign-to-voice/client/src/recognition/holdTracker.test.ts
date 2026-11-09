import { describe, expect, it } from 'vitest';
import { initialHoldState, updateHold, type HoldState } from './holdTracker';
import type { SignPrediction } from './classifier';

const options = { threshold: 0.6, holdMs: 600 };
const sign = (word: string, confidence = 0.9): SignPrediction => ({ word, confidence });

// Feeds frames every 100 ms and returns the words confirmed along the way.
function run(frames: Array<SignPrediction | null>, start = 0): { confirmed: string[]; state: HoldState } {
  let state = initialHoldState();
  const confirmed: string[] = [];
  frames.forEach((frame, index) => {
    const update = updateHold(state, frame, start + index * 100, options);
    state = update.state;
    if (update.confirmed) confirmed.push(update.confirmed.word);
  });
  return { confirmed, state };
}

describe('hold tracker', () => {
  it('confirms a sign only after it is held for 600 ms', () => {
    // Frames are 100 ms apart, so 600 ms of holding needs seven frames (0 to 600 ms).
    const steady = Array.from({ length: 7 }, () => sign('LIFE'));
    expect(run(steady.slice(0, 6)).confirmed).toEqual([]);
    expect(run(steady).confirmed).toEqual(['LIFE']);
  });

  it('does not confirm a sign that is below the threshold', () => {
    const weak = Array.from({ length: 10 }, () => sign('LIFE', 0.4));
    expect(run(weak).confirmed).toEqual([]);
  });

  it('does not add the same word twice in a row while the hand keeps signing it', () => {
    const held = Array.from({ length: 30 }, () => sign('WAR'));
    expect(run(held).confirmed).toEqual(['WAR']);
  });

  it('allows the same word again after the hand drops out', () => {
    const frames = [
      ...Array.from({ length: 7 }, () => sign('WAR')),
      null,
      ...Array.from({ length: 7 }, () => sign('WAR')),
    ];
    expect(run(frames).confirmed).toEqual(['WAR', 'WAR']);
  });

  it('blocks a flicker back to the same word before a different word is confirmed', () => {
    const frames = [
      ...Array.from({ length: 7 }, () => sign('WAR')),
      sign('LIFE'),
      ...Array.from({ length: 7 }, () => sign('WAR')),
    ];
    expect(run(frames).confirmed).toEqual(['WAR']);
  });

  it('restarts the hold when the word changes', () => {
    const frames = [
      ...Array.from({ length: 5 }, () => sign('USE')),
      ...Array.from({ length: 5 }, () => sign('LIFE')),
    ];
    expect(run(frames).confirmed).toEqual([]);
  });

  it('reports progress toward confirmation', () => {
    let state = initialHoldState();
    state = updateHold(state, sign('USE'), 0, options).state;
    const halfway = updateHold(state, sign('USE'), 300, options);
    expect(halfway.progress).toBeCloseTo(0.5);
  });
});

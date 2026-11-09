import { describe, expect, it } from 'vitest';
import { classifyEmotion, EmotionSmoother, EmotionTally, scoreEmotions, type Blendshapes } from './emotion';

const shapes = (values: Blendshapes): Blendshapes => values;

describe('emotion from blendshapes', () => {
  it('reads a relaxed face as Neutral', () => {
    expect(classifyEmotion(shapes({})).emotion).toBe('Neutral');
  });

  it('reads a smile as Happy', () => {
    expect(classifyEmotion(shapes({ mouthSmileLeft: 0.9, mouthSmileRight: 0.85 })).emotion).toBe('Happy');
  });

  it('reads a frown with raised inner brows as Sad', () => {
    expect(classifyEmotion(shapes({ mouthFrownLeft: 0.8, mouthFrownRight: 0.8, browInnerUp: 0.4 })).emotion).toBe('Sad');
  });

  it('reads lowered brows and pressed lips as Angry', () => {
    expect(classifyEmotion(shapes({ browDownLeft: 0.9, browDownRight: 0.9, mouthPressLeft: 0.6, mouthPressRight: 0.6 })).emotion).toBe(
      'Angry',
    );
  });

  it('reads both brows raised with wide eyes as Questioning', () => {
    expect(
      classifyEmotion(shapes({ browOuterUpLeft: 0.8, browOuterUpRight: 0.8, browInnerUp: 0.6, eyeWideLeft: 0.5, eyeWideRight: 0.5 })).emotion,
    ).toBe('Questioning');
  });

  it('reads one brow raised higher than the other as Skeptical', () => {
    expect(classifyEmotion(shapes({ browOuterUpLeft: 0.9, browOuterUpRight: 0.05 })).emotion).toBe('Skeptical');
  });

  it('keeps scores for every emotion', () => {
    const scores = scoreEmotions(shapes({ mouthSmileLeft: 1 }));
    expect(Object.keys(scores).sort()).toEqual(['Angry', 'Happy', 'Neutral', 'Questioning', 'Sad', 'Skeptical']);
  });
});

describe('emotion smoothing', () => {
  const happy = scoreEmotions(shapes({ mouthSmileLeft: 0.9, mouthSmileRight: 0.9 }));
  const angry = scoreEmotions(shapes({ browDownLeft: 0.9, browDownRight: 0.9 }));

  it('does not flip to a new emotion on a brief change', () => {
    const smoother = new EmotionSmoother(15);
    for (let i = 0; i < 15; i += 1) smoother.push(happy);
    let label = 'Happy';
    for (let i = 0; i < 5; i += 1) label = smoother.push(angry);
    expect(label).toBe('Happy');
  });

  it('switches once the new emotion fills the window', () => {
    const smoother = new EmotionSmoother(15);
    for (let i = 0; i < 15; i += 1) smoother.push(happy);
    let label = 'Happy';
    for (let i = 0; i < 15; i += 1) label = smoother.push(angry);
    expect(label).toBe('Angry');
  });
});

describe('utterance emotion tally', () => {
  it('returns the most frequent emotion across the utterance', () => {
    const tally = new EmotionTally();
    (['Happy', 'Angry', 'Angry', 'Neutral', 'Angry'] as const).forEach((e) => tally.add(e));
    expect(tally.dominant()).toBe('Angry');
  });

  it('is cleared by reset', () => {
    const tally = new EmotionTally();
    tally.add('Sad');
    tally.reset();
    expect(tally.dominant()).toBe('Neutral');
  });
});

// Facial movements shown in Live Studio. Each row averages the MediaPipe blendshape categories it names, so
// left and right sides are shown as one value. Scores come only from the model output (0 to 1). They describe
// how far a movement is, not what someone feels. Future non-manual sign recognition will use these same scores.
export const BLENDSHAPE_ROWS = [
  { key: 'jaw', group: 'Jaw', label: 'Jaw open', names: ['jawOpen'] },
  { key: 'blink', group: 'Eyes', label: 'Blink', names: ['eyeBlinkLeft', 'eyeBlinkRight'] },
  { key: 'brow-down', group: 'Eyebrows', label: 'Brows down', names: ['browDownLeft', 'browDownRight'] },
  { key: 'brow-up', group: 'Eyebrows', label: 'Brows raised', names: ['browOuterUpLeft', 'browOuterUpRight', 'browInnerUp'] },
  { key: 'smile', group: 'Mouth', label: 'Smile', names: ['mouthSmileLeft', 'mouthSmileRight'] },
  { key: 'frown', group: 'Mouth', label: 'Frown', names: ['mouthFrownLeft', 'mouthFrownRight'] },
  { key: 'pucker', group: 'Lips', label: 'Lips pursed', names: ['mouthPucker'] },
  { key: 'funnel', group: 'Lips', label: 'Lips funnelled', names: ['mouthFunnel'] },
  { key: 'press', group: 'Lips', label: 'Lips pressed', names: ['mouthPressLeft', 'mouthPressRight'] },
  { key: 'lower-down', group: 'Lips', label: 'Lower lip down', names: ['mouthLowerDownLeft', 'mouthLowerDownRight'] },
];

// Returns rows with a value only when the model supplied the scores. Returns [] otherwise, so nothing is invented.
export function summariseBlendshapes(shapes) {
  if (!shapes) return [];
  return BLENDSHAPE_ROWS.map((row) => {
    const present = row.names.filter((name) => typeof shapes[name] === 'number');
    if (present.length === 0) return null;
    const value = present.reduce((sum, name) => sum + shapes[name], 0) / present.length;
    return { key: row.key, group: row.group, label: row.label, value: Math.round(value * 100) / 100 };
  }).filter(Boolean);
}

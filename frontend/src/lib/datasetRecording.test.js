import { describe, expect, it } from 'vitest';
import {
  LABELS,
  MIN_RECORDING_MS,
  UNKNOWN_LABEL,
  appendFrame,
  buildClipPayload,
  frameFromSnapshot,
  handShares,
  newSessionId,
  saveBlockers,
} from './datasetRecording.js';

const point = (index) => ({ index, name: `P${index}`, x: index / 100, y: 0.5, z: 0 });
const snapshot = (sequence, hands = []) => ({
  frame_sequence: sequence,
  hands: hands.map((handedness) => ({
    handedness,
    score: 0.9,
    landmarks: [...Array(21).keys()].reverse().map(point),
  })),
});

const validInput = {
  label: 'C',
  verifiedLabels: { C: 1 },
  participant: 'P001',
  consentRef: 'C-2026-001',
  session: 'S-20261112-093000',
  frames: Array.from({ length: 12 }, (_, index) => ({ t_ms: index * 100, hands: [] })),
  minFrames: 10,
  durationMs: 2000,
};

describe('frames from the camera', () => {
  it('orders landmarks by index and keeps handedness', () => {
    const frame = frameFromSnapshot(snapshot(1, ['Left']), 120.4);

    expect(frame.t_ms).toBe(120);
    expect(frame.hands[0].handedness).toBe('Left');
    expect(frame.hands[0].landmarks[0]).toEqual([0, 0.5, 0]);
    expect(frame.hands[0].landmarks[20]).toEqual([0.2, 0.5, 0]);
  });

  it('never records the same processed frame twice', () => {
    let state = { frames: [], lastSequence: -1 };
    for (const sequence of [1, 1, 2, 2, 2, 3]) {
      state = appendFrame(state.frames, state.lastSequence, snapshot(sequence, ['Right']), sequence * 100);
    }

    expect(state.frames).toHaveLength(3);
    expect(state.lastSequence).toBe(3);
  });
});

describe('hand shares', () => {
  it('reports how often each hand is in view, counting a frame once', () => {
    const frames = [
      frameFromSnapshot(snapshot(1, ['Left', 'Right']), 0),
      frameFromSnapshot(snapshot(2, ['Left']), 100),
      frameFromSnapshot(snapshot(3, []), 200),
      frameFromSnapshot(snapshot(4, ['Right']), 300),
    ];

    expect(handShares(frames)).toEqual({ frames: 4, withHands: 3, left: 0.5, right: 0.5 });
    expect(handShares([])).toEqual({ frames: 0, withHands: 0, left: 0, right: 0 });
  });
});

describe('save blockers', () => {
  it('accepts a complete clip for a verified letter', () => {
    expect(saveBlockers(validInput)).toEqual([]);
  });

  it('refuses a letter that is not verified, and accepts UNKNOWN', () => {
    expect(saveBlockers({ ...validInput, label: 'A' })[0]).toMatch(/A is not a verified class/);
    expect(saveBlockers({ ...validInput, label: UNKNOWN_LABEL })).toEqual([]);
  });

  it('requires a pseudonymous participant, a consent reference and a session ID', () => {
    expect(saveBlockers({ ...validInput, participant: 'Sruthi' })[0]).toMatch(/P001/);
    expect(saveBlockers({ ...validInput, consentRef: '' })[0]).toMatch(/consent reference/);
    expect(saveBlockers({ ...validInput, session: 'a b' })[0]).toMatch(/Session ID/);
  });

  it('refuses a single frame and a clip that is too short', () => {
    expect(saveBlockers({ ...validInput, durationMs: 300 })[0]).toMatch(`${MIN_RECORDING_MS / 1000} seconds`);
    expect(saveBlockers({ ...validInput, frames: [validInput.frames[0]] }).join(' ')).toMatch(/Only 1 frames/);
  });
});

describe('labels and session IDs', () => {
  it('offers A to Z and UNKNOWN', () => {
    expect(LABELS).toHaveLength(27);
    expect(LABELS.slice(0, 3)).toEqual(['A', 'B', 'C']);
    expect(LABELS.at(-1)).toBe(UNKNOWN_LABEL);
  });

  it('makes session IDs that the server accepts', () => {
    const session = newSessionId(new Date(2026, 10, 12, 9, 5, 7));

    expect(session).toBe('S-20261112-090507');
    expect(session).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/);
  });

  it('builds the payload the server expects', () => {
    expect(buildClipPayload({ label: 'C', participant: 'P001', consentRef: 'C-1', session: 'S-1', frames: [] })).toEqual({
      label: 'C',
      participant: 'P001',
      consent_ref: 'C-1',
      session: 'S-1',
      frames: [],
    });
  });
});

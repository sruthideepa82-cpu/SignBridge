// Developer dataset collection: the rules the browser checks before a clip is recorded and saved. The server checks
// the same rules again (backend/app/services/dataset_store.py), so these are only for immediate feedback.
import { FINGERSPELLING_CLASSES } from '../data/fingerspelling.js';

export const UNKNOWN_LABEL = 'UNKNOWN';
export const LABELS = [...FINGERSPELLING_CLASSES.map((item) => item.label), UNKNOWN_LABEL];
export const MIN_RECORDING_MS = 1500;
export const MAX_RECORDING_MS = 8000;

const PARTICIPANT = /^P\d{3}$/;
const CONSENT_REF = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const SESSION = /^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/;

export function newSessionId(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `S-${day}-${time}`;
}

// Converts one landmark snapshot from /api/camera/landmarks into a frame. Points are kept in index order.
export function frameFromSnapshot(snapshot, tMs) {
  return {
    t_ms: Math.max(0, Math.round(tMs)),
    hands: (snapshot.hands ?? []).map((hand) => ({
      handedness: hand.handedness,
      score: hand.score,
      landmarks: [...hand.landmarks]
        .sort((a, b) => a.index - b.index)
        .map((point) => [point.x, point.y, point.z]),
    })),
  };
}

// Adds a frame only when the camera has produced a new processed frame, so one frame is never recorded twice.
export function appendFrame(frames, lastSequence, snapshot, tMs) {
  if (!snapshot || snapshot.frame_sequence === lastSequence) {
    return { frames, lastSequence };
  }
  return { frames: [...frames, frameFromSnapshot(snapshot, tMs)], lastSequence: snapshot.frame_sequence };
}

// Share of frames in which each hand appears. A hand is counted once per frame even if it is listed twice.
export function handShares(frames) {
  const total = frames.length;
  if (total === 0) return { frames: 0, withHands: 0, left: 0, right: 0 };
  let withHands = 0;
  let left = 0;
  let right = 0;
  for (const frame of frames) {
    if (frame.hands.length > 0) withHands += 1;
    if (frame.hands.some((hand) => hand.handedness === 'Left')) left += 1;
    if (frame.hands.some((hand) => hand.handedness === 'Right')) right += 1;
  }
  return { frames: total, withHands, left: left / total, right: right / total };
}

// Reasons the clip cannot be saved yet. An empty list means it can be saved.
export function saveBlockers({ label, verifiedLabels, participant, consentRef, session, frames, minFrames, durationMs }) {
  const reasons = [];
  if (!LABELS.includes(label)) {
    reasons.push('Choose a letter or UNKNOWN.');
  } else if (label !== UNKNOWN_LABEL && !(label in verifiedLabels)) {
    reasons.push(
      `${label} is not a verified class. Only verified classes can be recorded. Use UNKNOWN for frames with no valid sign.`,
    );
  }
  if (!PARTICIPANT.test(participant ?? '')) reasons.push('Participant ID must look like P001. Do not use names.');
  if (!CONSENT_REF.test(consentRef ?? '')) reasons.push('Enter the consent reference from the signed consent form.');
  if (!SESSION.test(session ?? '')) reasons.push('Session ID must be 3 to 40 letters, digits, underscores or hyphens.');
  if (durationMs < MIN_RECORDING_MS) {
    reasons.push(`Hold the sign for at least ${MIN_RECORDING_MS / 1000} seconds. One frame is not a sample.`);
  }
  if (frames.length < minFrames) {
    reasons.push(`Only ${frames.length} frames were captured. A clip needs at least ${minFrames}.`);
  }
  return reasons;
}

export function buildClipPayload({ label, participant, consentRef, session, frames }) {
  return { label, participant, consent_ref: consentRef, session, frames };
}

// Transport-level transcript state. It is in memory only: nothing here is written to storage. Every function returns a
// new object and never changes its input.
//
// Sequence numbers only increase within a browser session. The backend numbers segments from the seqStart sent on
// connect, and reconnects continue from lastCommittedSequence + 1. So a final is committed once, and any final whose
// sequence is not above lastCommittedSequence is a duplicate or stale.

export const EFFECT = {
  COMMITTED: 'committed',
  INTERIM: 'interim',
  CLEARED: 'cleared',
  DUPLICATE: 'duplicate',
  STALE: 'stale',
  IGNORED: 'ignored',
  NONE: 'none',
};

export function createTranscriptState() {
  return {
    committed: [],
    lastCommittedSequence: 0,
    interim: null,
    interrupted: [],
  };
}

// Uncommitted interim text that was superseded or interrupted is kept here for the application layer to decide on.
function withInterrupted(state, entry) {
  return entry ? { ...state, interrupted: [...state.interrupted, entry] } : state;
}

export function applyInterim(state, { seq, text }) {
  if (seq <= state.lastCommittedSequence) return { state, effect: EFFECT.STALE };
  const trimmed = typeof text === 'string' ? text.trim() : '';
  let next = state;
  // A new sequence means the previous segment ended without a final. Keep its text rather than drop it.
  if (state.interim && state.interim.seq !== seq) {
    next = withInterrupted(next, state.interim);
    next = { ...next, interim: null };
  }
  if (!trimmed) {
    if (next.interim?.seq === seq) return { state: { ...next, interim: null }, effect: EFFECT.CLEARED };
    return { state: next, effect: next === state ? EFFECT.NONE : EFFECT.INTERIM };
  }
  return { state: { ...next, interim: { seq, text: trimmed } }, effect: EFFECT.INTERIM };
}

export function applyFinal(state, { seq, text }) {
  if (seq <= state.lastCommittedSequence) {
    return { state, effect: seq === state.lastCommittedSequence ? EFFECT.DUPLICATE : EFFECT.STALE };
  }
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return { state, effect: EFFECT.IGNORED };

  let next = state;
  // An interim for an earlier sequence was never confirmed, so it is kept as interrupted text.
  if (state.interim && state.interim.seq < seq) {
    next = withInterrupted(next, state.interim);
    next = { ...next, interim: null };
  }
  // An interim for this sequence is replaced by its final, which is the confirmed text.
  if (next.interim?.seq === seq) next = { ...next, interim: null };

  return {
    state: {
      ...next,
      committed: [...next.committed, { seq, text: trimmed }],
      lastCommittedSequence: seq,
    },
    effect: EFFECT.COMMITTED,
  };
}

// The connection ended. Interim text that was not confirmed is kept as interrupted.
export function applyDisconnect(state) {
  if (!state.interim) return state;
  return { ...withInterrupted(state, state.interim), interim: null };
}

export function committedText(state) {
  return state.committed.map((entry) => entry.text).join(' ');
}

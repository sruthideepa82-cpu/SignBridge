// The editable transcript. Each confirmed sentence is added once, after whatever the user has typed. Interim text is
// never added here.

export function appendText(draft, addition) {
  const extra = typeof addition === 'string' ? addition.trim() : '';
  if (!extra) return draft;
  if (!draft) return extra;
  return /\s$/.test(draft) ? `${draft}${extra}` : `${draft} ${extra}`;
}

function normalise(text) {
  return typeof text === 'string' ? text.toLowerCase().replace(/\s+/g, ' ').trim() : '';
}

// The browser's final text for speech that was on screen when the transcript was cleared. Its wording may differ a
// little from the interim text, so a prefix match in either direction counts as the same utterance.
export function isSameUtterance(clearedText, finalText) {
  const cleared = normalise(clearedText);
  const final = normalise(finalText);
  if (!cleared || !final) return false;
  return cleared === final || cleared.startsWith(final) || final.startsWith(cleared);
}

// Adds committed entries whose sequence is above lastAppliedSeq. Returns the new draft and the highest sequence added,
// so a sentence can never be added twice, even after the draft has been cleared.
export function applyCommitted(draft, committed, lastAppliedSeq) {
  const fresh = committed.filter((entry) => entry.seq > lastAppliedSeq);
  if (fresh.length === 0) return { draft, lastAppliedSeq, added: 0 };
  return {
    draft: fresh.reduce((text, entry) => appendText(text, entry.text), draft),
    lastAppliedSeq: fresh[fresh.length - 1].seq,
    added: fresh.length,
  };
}

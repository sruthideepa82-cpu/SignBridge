// The quiz only uses letters whose clip exists, so every question can be answered from the animation shown.
export const QUIZ_MIN_CLIPS = 3;
export const QUIZ_CHOICES = 4;

function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// `pool` holds signs with available clips. `labels` holds every letter, used for wrong answers.
export function buildQuizQuestion(pool, labels, random = Math.random) {
  if (pool.length < QUIZ_MIN_CLIPS) return null;
  const sign = pool[Math.floor(random() * pool.length)];
  const wrong = shuffle(
    labels.filter((label) => label !== sign.label),
    random,
  ).slice(0, QUIZ_CHOICES - 1);
  return { sign, options: shuffle([sign.label, ...wrong], random) };
}

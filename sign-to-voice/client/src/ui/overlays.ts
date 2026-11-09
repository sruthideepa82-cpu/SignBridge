import type { Gloss } from '../app/gloss';
import { CONFIDENCE_THRESHOLD, CONFIDENT_THRESHOLD } from '../app/signs';
import type { SignPrediction } from '../recognition/classifier';

const pct = (value: number) => `${Math.round(value * 100)}%`;

export function renderGlossStrip(container: HTMLElement, glosses: readonly Gloss[]): void {
  container.replaceChildren(
    ...glosses.map((gloss) => {
      const chip = document.createElement('span');
      chip.className = 'gloss-chip';
      const dot = document.createElement('span');
      dot.className = `gloss-dot ${gloss.confidence >= CONFIDENT_THRESHOLD ? 'is-confident' : 'is-unsure'}`;
      chip.append(dot, gloss.word);
      return chip;
    }),
  );
}

export interface PillView {
  prediction: SignPrediction | null;
}

export function renderSignPill(pill: HTMLElement, view: PillView): void {
  const word = pill.querySelector<HTMLElement>('.pill-word')!;
  const bar = pill.querySelector<HTMLElement>('.pill-bar-fill')!;
  const hint = pill.querySelector<HTMLElement>('.pill-hint')!;
  const { prediction } = view;

  if (!prediction) {
    word.textContent = '—';
    bar.style.width = '0%';
    hint.textContent = 'Show a sign';
    return;
  }

  word.textContent = prediction.word;
  bar.style.width = `${Math.round(prediction.confidence * 100)}%`;
  hint.textContent =
    prediction.confidence < CONFIDENCE_THRESHOLD
      ? `${pct(prediction.confidence)} — hold steadier`
      : `${pct(prediction.confidence)} — hold to confirm`;
}

import type { InterpretResult } from '../app/interpretClient';

export function renderCaption(caption: HTMLElement, frame: HTMLElement, result: InterpretResult): void {
  const text = caption.querySelector<HTMLElement>('.caption-text')!;
  const note = caption.querySelector<HTMLElement>('.caption-note')!;

  text.textContent = result.sentence;
  note.textContent = result.usedFallback
    ? `Language model unavailable (${result.reason ?? 'unknown reason'}). Showing the raw sign order.`
    : '';
  note.hidden = !result.usedFallback;

  caption.hidden = false;
  frame.classList.add('has-caption');
}

import type { StepId } from '../app/stateMachine';

const ALL_STEPS: StepId[] = ['tracking', 'emotion', 'llm', 'voice'];

export function renderPipeline(root: HTMLElement, active: StepId[]): void {
  for (const step of ALL_STEPS) {
    const element = root.querySelector<HTMLElement>(`[data-step="${step}"]`);
    if (!element) continue;
    const isActive = active.includes(step);
    element.classList.toggle('is-active', isActive);
    element.setAttribute('aria-current', isActive ? 'step' : 'false');
  }
}

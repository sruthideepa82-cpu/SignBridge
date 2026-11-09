// Single source of truth for the pipeline stage. The UI only reads the state; it never sets it directly.

export type PipelineState = 'idle' | 'tracking' | 'interpreting' | 'speaking';

export type PipelineEvent =
  | { type: 'CAMERA_STARTED' }
  | { type: 'CAMERA_STOPPED' }
  | { type: 'INTERPRET' }
  | { type: 'INTERPRETED' }
  | { type: 'SPEECH_DONE' };

export type StepId = 'tracking' | 'emotion' | 'llm' | 'voice';

export function transition(state: PipelineState, event: PipelineEvent): PipelineState {
  switch (event.type) {
    case 'CAMERA_STARTED':
      return state === 'idle' ? 'tracking' : state;
    case 'CAMERA_STOPPED':
      return 'idle';
    case 'INTERPRET':
      return state === 'tracking' ? 'interpreting' : state;
    case 'INTERPRETED':
      return state === 'interpreting' ? 'speaking' : state;
    case 'SPEECH_DONE':
      return state === 'speaking' ? 'tracking' : state;
  }
}

// Hand tracking and emotion detection run in parallel, so both are active while tracking.
export function activeSteps(state: PipelineState): StepId[] {
  switch (state) {
    case 'idle':
      return [];
    case 'tracking':
      return ['tracking', 'emotion'];
    case 'interpreting':
      return ['llm'];
    case 'speaking':
      return ['voice'];
  }
}

export const STATE_LABELS: Record<PipelineState, string> = {
  idle: 'Idle',
  tracking: 'Tracking signs',
  interpreting: 'Interpreting',
  speaking: 'Speaking',
};

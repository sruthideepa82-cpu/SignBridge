import { describe, expect, it } from 'vitest';
import { activeSteps, transition, type PipelineState } from './stateMachine';

describe('pipeline state machine', () => {
  it('runs idle → tracking → interpreting → speaking → tracking', () => {
    let state: PipelineState = 'idle';
    state = transition(state, { type: 'CAMERA_STARTED' });
    expect(state).toBe('tracking');
    state = transition(state, { type: 'INTERPRET' });
    expect(state).toBe('interpreting');
    state = transition(state, { type: 'INTERPRETED' });
    expect(state).toBe('speaking');
    state = transition(state, { type: 'SPEECH_DONE' });
    expect(state).toBe('tracking');
  });

  it('ignores events that do not apply to the current state', () => {
    expect(transition('idle', { type: 'INTERPRET' })).toBe('idle');
    expect(transition('tracking', { type: 'SPEECH_DONE' })).toBe('tracking');
    expect(transition('speaking', { type: 'INTERPRET' })).toBe('speaking');
  });

  it('returns to idle when the camera stops from any state', () => {
    expect(transition('interpreting', { type: 'CAMERA_STOPPED' })).toBe('idle');
    expect(transition('tracking', { type: 'CAMERA_STOPPED' })).toBe('idle');
  });

  it('activates hand tracking and emotion together while tracking', () => {
    expect(activeSteps('tracking')).toEqual(['tracking', 'emotion']);
    expect(activeSteps('interpreting')).toEqual(['llm']);
    expect(activeSteps('speaking')).toEqual(['voice']);
    expect(activeSteps('idle')).toEqual([]);
  });
});

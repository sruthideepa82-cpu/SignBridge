import { describe, expect, it } from 'vitest';
import { describeRecognition, EXPERIMENTAL_LABEL } from './recognitionStatus.js';
import { applyRecognition, initialBuffer, HOLD_FRAMES, toText } from './signBuffer.js';
import { appendMessage, CONVERSATIONS_KEY } from './conversationStore.js';

const recognised = (frame, experimental) => ({
  status: 'recognized',
  label: 'C',
  confidence: 0.91,
  threshold: 0.6,
  frame_sequence: frame,
  ...(experimental === undefined ? {} : { experimental }),
});

describe('experimental predictions are labelled', () => {
  it('describes an experimental letter as unverified, never as a plain recognition', () => {
    const view = describeRecognition(recognised(1, true), '', true);

    expect(view.label).toBe(EXPERIMENTAL_LABEL);
    expect(view.headline).toBe('C');
    expect(view.tone).toBe('warning');
    expect(view.text).toMatch(/Not a verified ISL translation/);
    expect(view.label).not.toMatch(/Recognized$/);
  });

  it('keeps the existing wording for a result that does not say it is experimental', () => {
    const view = describeRecognition(recognised(1), '', true);

    expect(view.label).toBe('Recognized');
    expect(view.tone).toBe('success');
  });

  it('marks a committed letter as experimental, and leaves other letters unchanged', () => {
    let experimental = initialBuffer();
    let plain = initialBuffer();
    for (let frame = 1; frame <= HOLD_FRAMES; frame += 1) {
      experimental = applyRecognition(experimental, recognised(frame, true));
      plain = applyRecognition(plain, recognised(frame));
    }

    expect(experimental.items).toEqual([{ type: 'letter', label: 'C', confidence: 0.91, experimental: true }]);
    expect(plain.items).toEqual([{ type: 'letter', label: 'C', confidence: 0.91 }]);
    expect(toText(experimental.items)).toBe('C');
  });

  it('keeps the experimental flag on a conversation message sent from the draft', () => {
    const store = appendMessage({ conversations: [], activeId: null }, {
      text: 'C',
      speaker: 'deaf',
      source: 'sign',
      experimental: true,
      now: 1000,
    });
    const plain = appendMessage({ conversations: [], activeId: null }, { text: 'Hi', speaker: 'deaf', source: 'typed', now: 2000 });

    expect(store.conversations[0].messages[0]).toMatchObject({ text: 'C', experimental: true });
    expect(plain.conversations[0].messages[0]).not.toHaveProperty('experimental');
    expect(CONVERSATIONS_KEY).toBe('signbridge.conversations.v2');
  });
});

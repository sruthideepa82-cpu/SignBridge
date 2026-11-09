import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderWithRouter.jsx';
import { CONVERSATION_KEY } from '../lib/conversationStore.js';
import { PROGRESS_KEY } from '../hooks/usePracticeProgress.js';
import { getRecognitionConstructor } from '../hooks/useSpeechRecognition.js';

// A minimal stand-in for the browser's SpeechRecognition, so the tests can deliver results.
class FakeRecognition {
  static instances = [];
  constructor() {
    this.started = false;
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
    this.onend?.();
  }
  abort() {}
  emit(results) {
    const list = results.map(([text, isFinal]) => ({ 0: { transcript: text }, isFinal }));
    this.onresult?.({ resultIndex: 0, results: list });
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
  window.localStorage.clear();
  FakeRecognition.instances = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Dashboard', () => {
  it('shows real learning progress from this browser', () => {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(['C', 'L']));

    renderApp('/dashboard');

    expect(screen.getByText('2 of 6 pilot letters')).toBeInTheDocument();
  });

  it('shows honest empty states instead of invented activity', () => {
    renderApp('/dashboard');

    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    expect(screen.getAllByText('Checked on Sign to Voice', { selector: 'span' })).toHaveLength(2);
  });

  it('shows the latest saved conversation message', () => {
    window.localStorage.setItem(
      CONVERSATION_KEY,
      JSON.stringify([{ id: '1', speaker: 'hearing', text: 'See you tomorrow', at: 1700000000000 }]),
    );

    renderApp('/dashboard');

    expect(screen.getByText('See you tomorrow')).toBeInTheDocument();
  });
});

describe('Voice to Text', () => {
  it('explains when the browser has no speech recognition and still accepts typed text', () => {
    renderApp('/voice-to-text');

    expect(screen.getByText(/Speech recognition is not available in this browser/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start listening' })).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Transcript' }), { target: { value: 'Typed by hand' } });
    expect(screen.getByRole('textbox', { name: 'Transcript' })).toHaveValue('Typed by hand');
  });

  it('adds recognised speech to the transcript', () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    renderApp('/voice-to-text');

    fireEvent.click(screen.getByRole('button', { name: 'Start listening' }));
    act(() => FakeRecognition.instances[0].emit([['good morning', true]]));

    expect(screen.getByRole('textbox', { name: 'Transcript' })).toHaveValue('good morning');
    expect(screen.getByRole('button', { name: 'Stop listening' })).toBeInTheDocument();
  });

  it('asks before clearing the transcript', () => {
    renderApp('/voice-to-text');
    fireEvent.change(screen.getByRole('textbox', { name: 'Transcript' }), { target: { value: 'keep me?' } });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Clear the transcript?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('textbox', { name: 'Transcript' })).toHaveValue('keep me?');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear transcript' }));
    expect(screen.getByRole('textbox', { name: 'Transcript' })).toHaveValue('');
  });
});

describe('Quick Connect', () => {
  it('opens the category named in the link', () => {
    renderApp('/quick-connect?category=emergency');

    expect(screen.getByRole('button', { name: 'Emergency' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'I need help now.' })).toBeInTheDocument();
  });

  it('shows the chosen phrase large and lets it be edited, then reset', () => {
    renderApp('/quick-connect');

    fireEvent.click(screen.getByRole('button', { name: 'Thank you very much.' }));
    expect(screen.getByTestId('shown-message')).toHaveTextContent('Thank you very much.');

    fireEvent.change(screen.getByLabelText('Edit message'), { target: { value: 'Thank you so much.' } });
    expect(screen.getByTestId('shown-message')).toHaveTextContent('Thank you so much.');

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByTestId('shown-message')).not.toBeInTheDocument();
  });
});

describe('Conversation Space', () => {
  it('sends a message on Enter, labels the sender and keeps it in this browser', () => {
    renderApp('/conversation');

    const composer = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(composer, { target: { value: 'Hello there' } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    const log = screen.getByRole('log', { name: 'Conversation' });
    expect(within(log).getByText('Hello there')).toBeInTheDocument();
    expect(within(log).getByText('Deaf or hard-of-hearing', { selector: 'span' })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(CONVERSATION_KEY))).toHaveLength(1);
  });

  it('asks before resetting the whole conversation', () => {
    window.localStorage.setItem(
      CONVERSATION_KEY,
      JSON.stringify([{ id: '1', speaker: 'hearing', text: 'Keep this', at: 1700000000000 }]),
    );
    renderApp('/conversation');

    fireEvent.click(screen.getByRole('button', { name: 'Reset conversation' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Reset this conversation?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Keep this')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset conversation' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset conversation' }));
    expect(screen.queryByText('Keep this')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CONVERSATION_KEY)).toBeNull();
  });

  it('inserts a quick phrase into the composer', () => {
    renderApp('/conversation');

    fireEvent.click(screen.getByRole('button', { name: 'Hello, how are you?' }));

    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Hello, how are you?');
  });
});

describe('speech recognition support', () => {
  it('finds no recognition engine when the browser has none', () => {
    expect(getRecognitionConstructor({})).toBeNull();
  });

  it('prefers the standard constructor and falls back to the prefixed one', () => {
    const standard = function () {};
    const prefixed = function () {};
    expect(getRecognitionConstructor({ SpeechRecognition: standard })).toBe(standard);
    expect(getRecognitionConstructor({ webkitSpeechRecognition: prefixed })).toBe(prefixed);
  });
});

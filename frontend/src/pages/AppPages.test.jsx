import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderWithRouter.jsx';
import { CONVERSATIONS_KEY, LEGACY_CONVERSATION_KEY } from '../lib/conversationStore.js';
import { FAVOURITES_KEY } from '../lib/phraseFavourites.js';
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

const SEEDED_CONVERSATION = {
  conversations: [
    {
      id: 'c1',
      title: 'Clinic visit',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      favourite: false,
      messages: [{ id: 'm1', speaker: 'hearing', source: 'typed', text: 'Keep this', at: 1700000000000, saved: false, edited: false }],
    },
  ],
  activeId: 'c1',
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
  window.localStorage.clear();
  FakeRecognition.instances = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Overview', () => {
  it('shows honest empty states instead of invented activity', () => {
    renderApp('/dashboard');

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    expect(screen.getByText('No saved phrases yet')).toBeInTheDocument();
  });

  it('lists the most recent conversation with its last message', () => {
    window.localStorage.setItem(
      LEGACY_CONVERSATION_KEY,
      JSON.stringify([{ id: '1', speaker: 'hearing', text: 'See you tomorrow', at: 1700000000000 }]),
    );

    renderApp('/dashboard');

    expect(screen.getByText(/See you tomorrow/)).toBeInTheDocument();
  });

  it('sends a saved phrase to the conversation from the overview', () => {
    window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify([{ text: 'Good morning.', custom: false }]));
    renderApp('/dashboard');

    fireEvent.click(screen.getByRole('button', { name: 'Send to conversation: Good morning.' }));

    expect(screen.getByRole('status')).toHaveTextContent('Sent to your conversation: Good morning.');
    const stored = JSON.parse(window.localStorage.getItem(CONVERSATIONS_KEY));
    expect(stored.conversations[0].messages[0]).toMatchObject({ text: 'Good morning.', source: 'phrase' });
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

describe('Quick Phrases', () => {
  it('opens the category named in the link', () => {
    renderApp('/phrases?category=emergency');

    expect(screen.getByRole('button', { name: 'Emergency' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'I need help now.' })).toBeInTheDocument();
  });

  it('keeps the old quick connect link working', () => {
    renderApp('/quick-connect?category=emergency');

    expect(screen.getByRole('heading', { level: 1, name: 'Quick Phrases' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emergency' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the chosen phrase large and lets it be edited, then reset', () => {
    renderApp('/phrases');

    fireEvent.click(screen.getByRole('button', { name: 'Thank you very much.' }));
    expect(screen.getByTestId('shown-message')).toHaveTextContent('Thank you very much.');

    fireEvent.change(screen.getByLabelText('Edit message'), { target: { value: 'Thank you so much.' } });
    expect(screen.getByTestId('shown-message')).toHaveTextContent('Thank you so much.');

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByTestId('shown-message')).not.toBeInTheDocument();
  });

  it('saves a phrase and lists it under Favourites', () => {
    renderApp('/phrases');

    fireEvent.click(screen.getByRole('button', { name: 'Save phrase: Thank you very much.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Favourites' }));

    expect(screen.getByRole('button', { name: 'Thank you very much.' })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(FAVOURITES_KEY))).toEqual([
      { text: 'Thank you very much.', custom: false },
    ]);
  });

  it('adds and then edits and deletes a phrase the user wrote', () => {
    renderApp('/phrases');

    fireEvent.click(screen.getByRole('button', { name: 'Add Phrase' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New phrase' }), { target: { value: 'Call my sister.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save phrase' }));
    expect(screen.getByRole('button', { name: /^Call my sister\./ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Call my sister.' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit phrase' }), { target: { value: 'Call my brother.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: /^Call my brother\./ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Call my brother.' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete phrase' }));
    expect(screen.queryByRole('button', { name: 'Call my brother.' })).not.toBeInTheDocument();
  });

  it('searches every category', () => {
    renderApp('/phrases');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search phrases' }), { target: { value: 'ambulance' } });

    expect(screen.getByRole('button', { name: /^Please call an ambulance\./ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Good morning.' })).not.toBeInTheDocument();
  });

  it('sends the edited phrase to the conversation', () => {
    renderApp('/phrases');

    fireEvent.click(screen.getByRole('button', { name: 'Thank you very much.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send to conversation' }));

    const stored = JSON.parse(window.localStorage.getItem(CONVERSATIONS_KEY));
    expect(stored.conversations[0].messages[0]).toMatchObject({ text: 'Thank you very much.', source: 'phrase', speaker: 'deaf' });
  });
});

describe('Conversations list', () => {
  it('lists conversations and filters them by how messages were entered', () => {
    window.localStorage.setItem(
      CONVERSATIONS_KEY,
      JSON.stringify({
        conversations: [
          { id: 'typed', title: 'Typed chat', createdAt: 1, updatedAt: 3, favourite: false, messages: [{ id: 'a', speaker: 'hearing', source: 'typed', text: 'hi', at: 3, saved: false, edited: false }] },
          { id: 'signed', title: 'Signed chat', createdAt: 1, updatedAt: 2, favourite: false, messages: [{ id: 'b', speaker: 'deaf', source: 'sign', text: 'HELLO', at: 2, saved: false, edited: false }] },
        ],
        activeId: null,
      }),
    );
    renderApp('/conversations');

    const list = screen.getByRole('list', { name: 'Conversations' });
    expect(within(list).getByText('Typed chat')).toBeInTheDocument();
    expect(within(list).getByText('Signed chat')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign' }));
    expect(within(list).queryByText('Typed chat')).not.toBeInTheDocument();
    expect(within(list).getByText('Signed chat')).toBeInTheDocument();
  });

  it('explains when there are no conversations and offers to start one', () => {
    renderApp('/conversations');

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start a conversation' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Live Studio' })).toBeInTheDocument();
  });
});

describe('Conversation page', () => {
  it('sends a message on Enter, labels the sender and keeps it in this browser', () => {
    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(SEEDED_CONVERSATION));
    renderApp('/conversations/c1');

    const composer = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(composer, { target: { value: 'Hello there' } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    const log = screen.getByRole('list', { name: 'Messages' });
    expect(within(log).getByText('Hello there')).toBeInTheDocument();
    expect(within(log).getByText('Deaf participant', { selector: 'span' })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(CONVERSATIONS_KEY)).conversations[0].messages).toHaveLength(2);
  });

  it('shows the selected conversation and lets its messages be edited', () => {
    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(SEEDED_CONVERSATION));
    renderApp('/conversations/c1');

    fireEvent.click(screen.getByRole('button', { name: 'Edit message: Keep this' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit message' }), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save edit' }));

    const log = screen.getByRole('list', { name: 'Messages' });
    expect(within(log).getByText('Changed')).toBeInTheDocument();
    expect(within(log).getByText('edited')).toBeInTheDocument();
  });

  it('asks before deleting a single message', () => {
    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(SEEDED_CONVERSATION));
    renderApp('/conversations/c1');

    fireEvent.click(screen.getByRole('button', { name: 'Delete message: Keep this' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete message' }));

    expect(screen.queryByRole('list', { name: 'Messages' })).not.toBeInTheDocument();
  });

  it('asks before clearing the conversation', () => {
    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(SEEDED_CONVERSATION));
    renderApp('/conversations/c1');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Clear all messages in this conversation?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(screen.getByRole('list', { name: 'Messages' })).getByText('Keep this')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear messages' }));
    expect(screen.queryByRole('list', { name: 'Messages' })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(CONVERSATIONS_KEY)).conversations[0].messages).toEqual([]);
  });

  it('inserts a ready phrase as a message', () => {
    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(SEEDED_CONVERSATION));
    renderApp('/conversations/c1');

    fireEvent.click(screen.getByRole('button', { name: 'Hello, how are you?' }));

    const log = screen.getByRole('list', { name: 'Messages' });
    expect(within(log).getByText('Hello, how are you?')).toBeInTheDocument();
    expect(within(log).getByText(/Quick phrase/)).toBeInTheDocument();
  });

  it('says so when the conversation does not exist', () => {
    renderApp('/conversations/missing');

    expect(screen.getByText('Conversation not found')).toBeInTheDocument();
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

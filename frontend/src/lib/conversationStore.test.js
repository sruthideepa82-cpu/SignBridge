import { beforeEach, describe, expect, it } from 'vitest';
import {
  activityByDay,
  appendMessage,
  clearConversation,
  matchesChannel,
  CONVERSATIONS_KEY,
  DEFAULT_TITLE,
  LEGACY_CONVERSATION_KEY,
  LEGACY_TITLE,
  deleteConversation,
  deleteMessage,
  getStoreSnapshot,
  openConversation,
  recentMessages,
  renameConversation,
  summarise,
  toggleFavourite,
  toggleMessageSaved,
  transcriptText,
  updateMessageText,
  titleFromText,
} from './conversationStore.js';

const EMPTY = { conversations: [], activeId: null };

describe('appendMessage', () => {
  it('starts a conversation when none is open and titles it from the first message', () => {
    const store = appendMessage(EMPTY, { text: 'Hello there', speaker: 'deaf', source: 'sign', now: 1000 });

    expect(store.conversations).toHaveLength(1);
    expect(store.conversations[0]).toMatchObject({ title: 'Hello there', updatedAt: 1000 });
    expect(store.conversations[0].messages[0]).toMatchObject({ text: 'Hello there', source: 'sign', speaker: 'deaf' });
    expect(store.activeId).toBe(store.conversations[0].id);
  });

  it('adds to the open conversation and keeps a custom title', () => {
    const first = appendMessage(EMPTY, { text: 'One', speaker: 'deaf', source: 'typed', now: 1000 });
    const renamed = renameConversation(first, first.activeId, 'Clinic visit');
    const store = appendMessage(renamed, { text: 'Two', speaker: 'hearing', source: 'speech', now: 2000 });

    expect(store.conversations).toHaveLength(1);
    expect(store.conversations[0].title).toBe('Clinic visit');
    expect(store.conversations[0].messages.map((message) => message.text)).toEqual(['One', 'Two']);
  });

  it('starts a new conversation when the open one was deleted', () => {
    const first = appendMessage(EMPTY, { text: 'One', speaker: 'deaf', source: 'typed', now: 1000 });
    const removed = deleteConversation(first, first.activeId);
    const store = appendMessage(removed, { text: 'Fresh', speaker: 'deaf', source: 'typed', now: 3000 });

    expect(store.conversations).toHaveLength(1);
    expect(store.conversations[0].messages[0].text).toBe('Fresh');
  });
});

describe('message and conversation edits', () => {
  let store;
  beforeEach(() => {
    store = appendMessage(EMPTY, { text: 'Original', speaker: 'hearing', source: 'typed', now: 1000 });
  });

  it('edits text, trims it and marks the message as edited', () => {
    const conversationId = store.activeId;
    const messageId = store.conversations[0].messages[0].id;
    const next = updateMessageText(store, conversationId, messageId, '  Updated  ', 5000);

    expect(next.conversations[0].messages[0]).toMatchObject({ text: 'Updated', edited: true });
  });

  it('ignores an empty edit', () => {
    const next = updateMessageText(store, store.activeId, store.conversations[0].messages[0].id, '   ');
    expect(next).toBe(store);
  });

  it('saves and unsaves a message', () => {
    const messageId = store.conversations[0].messages[0].id;
    const saved = toggleMessageSaved(store, store.activeId, messageId);
    expect(saved.conversations[0].messages[0].saved).toBe(true);
    expect(toggleMessageSaved(saved, store.activeId, messageId).conversations[0].messages[0].saved).toBe(false);
  });

  it('deletes one message and clears all messages without deleting the conversation', () => {
    const messageId = store.conversations[0].messages[0].id;
    expect(deleteMessage(store, store.activeId, messageId).conversations[0].messages).toEqual([]);
    expect(clearConversation(store, store.activeId).conversations).toHaveLength(1);
    expect(clearConversation(store, store.activeId).conversations[0].messages).toEqual([]);
  });

  it('favourites a conversation and keeps the rename rules', () => {
    expect(toggleFavourite(store, store.activeId).conversations[0].favourite).toBe(true);
    expect(renameConversation(store, store.activeId, '   ')).toBe(store);
  });

  it('only opens conversations that exist', () => {
    expect(openConversation(store, 'missing')).toBe(store);
    expect(openConversation(store, null).activeId).toBeNull();
  });
});

describe('summaries and activity', () => {
  it('summarises messages, saved items and the last message', () => {
    let store = appendMessage(EMPTY, { text: 'Hi', speaker: 'deaf', source: 'sign', now: 1000 });
    store = appendMessage(store, { text: 'Hello', speaker: 'hearing', source: 'typed', now: 2000 });
    store = toggleMessageSaved(store, store.activeId, store.conversations[0].messages[1].id);

    expect(summarise(store.conversations[0])).toEqual({
      messageCount: 2,
      savedCount: 1,
      signCount: 1,
      preview: 'Hello',
      lastAt: 2000,
    });
  });

  it('counts sign messages and other messages per day, oldest first', () => {
    const now = new Date(2026, 10, 11, 15, 0).getTime();
    const yesterday = new Date(2026, 10, 10, 9, 0).getTime();
    const tooOld = new Date(2026, 9, 1, 9, 0).getTime();
    let store = appendMessage(EMPTY, { text: 'A', speaker: 'deaf', source: 'sign', now: now - 1000 });
    store = appendMessage(store, { text: 'B', speaker: 'hearing', source: 'typed', now: now - 500 });
    store = appendMessage(store, { text: 'C', speaker: 'deaf', source: 'sign', now: yesterday });
    store = appendMessage(store, { text: 'D', speaker: 'deaf', source: 'sign', now: tooOld });

    const days = activityByDay(store, { now, days: 7 });

    expect(days).toHaveLength(7);
    expect(days[6]).toMatchObject({ signs: 1, other: 1 });
    expect(days[5]).toMatchObject({ signs: 1, other: 0 });
    expect(days.reduce((sum, day) => sum + day.signs, 0)).toBe(2);
  });

  it('lists the newest messages across conversations', () => {
    let store = appendMessage(EMPTY, { text: 'Old', speaker: 'deaf', source: 'typed', now: 1000 });
    store = appendMessage({ ...store, activeId: null }, { text: 'New', speaker: 'hearing', source: 'speech', now: 9000 });

    expect(recentMessages(store, 1)).toEqual([
      expect.objectContaining({ text: 'New', conversationTitle: 'New' }),
    ]);
  });

  it('writes a plain-text transcript with the sender and the way each message was entered', () => {
    const store = appendMessage(EMPTY, { text: 'Hello', speaker: 'deaf', source: 'sign', now: 1000 });

    expect(transcriptText(store.conversations[0])).toContain('Deaf participant (Recognised sign): Hello');
  });
});

describe('titles', () => {
  it('shortens long first messages and collapses whitespace', () => {
    expect(titleFromText('  Hello   there  ')).toBe('Hello there');
    expect(titleFromText('x'.repeat(60))).toHaveLength(48);
    expect(DEFAULT_TITLE).toBe('New conversation');
  });
});

describe('persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns an empty store when nothing is saved', () => {
    expect(getStoreSnapshot()).toEqual(EMPTY);
  });

  it('turns the first version of saved messages into one conversation', () => {
    window.localStorage.setItem(
      LEGACY_CONVERSATION_KEY,
      JSON.stringify([
        { id: 'a', speaker: 'deaf', text: 'First', at: 1000 },
        { id: 'b', speaker: 'hearing', text: 'Second', at: 2000 },
      ]),
    );

    const store = getStoreSnapshot();

    expect(store.conversations).toHaveLength(1);
    expect(store.conversations[0]).toMatchObject({ title: LEGACY_TITLE, updatedAt: 2000 });
    expect(store.conversations[0].messages.map((message) => message.source)).toEqual(['typed', 'typed']);
  });

  it('ignores malformed saved data instead of crashing', () => {
    window.localStorage.setItem(CONVERSATIONS_KEY, '{not json');
    expect(getStoreSnapshot()).toEqual(EMPTY);

    window.localStorage.setItem(
      CONVERSATIONS_KEY,
      JSON.stringify({ conversations: [{ id: 'x', messages: [{ id: 'bad', speaker: 'nobody', text: 1 }] }], activeId: 'nope' }),
    );
    const store = getStoreSnapshot();
    expect(store.conversations[0].messages).toEqual([]);
    expect(store.activeId).toBeNull();
  });

  it('returns the same object until the stored data changes', () => {
    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(EMPTY));
    expect(getStoreSnapshot()).toBe(getStoreSnapshot());
  });
});

describe('channels', () => {
  it('filters conversations by how their messages were entered', () => {
    let store = appendMessage(EMPTY, { text: 'Hi', speaker: 'deaf', source: 'typed', now: 1000 });
    store = appendMessage(store, { text: 'Yo', speaker: 'deaf', source: 'sign', now: 2000 });
    const conversation = store.conversations[0];
    expect(matchesChannel(conversation, 'all')).toBe(true);
    expect(matchesChannel(conversation, 'sign')).toBe(true);
    expect(matchesChannel(conversation, 'text')).toBe(true);
    expect(matchesChannel(conversation, 'speech')).toBe(false);
  });
});

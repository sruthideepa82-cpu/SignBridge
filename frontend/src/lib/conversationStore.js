// Conversations are kept only in this browser (localStorage). They are never sent to the server.
// The store is a plain object { conversations, activeId }. Functions named after actions take the store
// and return a new one, so they can be tested without React or the browser.

export const CONVERSATIONS_KEY = 'signbridge.conversations.v2';
export const LEGACY_CONVERSATION_KEY = 'signbridge.conversation.v1';
export const DEFAULT_TITLE = 'New conversation';
export const LEGACY_TITLE = 'Earlier messages';

export const SPEAKERS = {
  deaf: 'Deaf participant',
  hearing: 'Hearing participant',
};

export const SOURCES = {
  sign: 'Recognised sign',
  typed: 'Typed',
  speech: 'Speech',
  phrase: 'Quick phrase',
};

const EMPTY_STORE = Object.freeze({ conversations: [], activeId: null });

const listeners = new Set();
let cache = { key: null, store: EMPTY_STORE };

function newId(now) {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFromText(text) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 48 ? `${oneLine.slice(0, 45)}...` : oneLine;
}

function isMessage(item) {
  return (
    item &&
    typeof item.id === 'string' &&
    typeof item.text === 'string' &&
    typeof item.at === 'number' &&
    Object.hasOwn(SPEAKERS, item.speaker) &&
    Object.hasOwn(SOURCES, item.source)
  );
}

function normaliseMessage(item) {
  return { saved: false, edited: false, ...item };
}

function normaliseStore(parsed) {
  if (!parsed || !Array.isArray(parsed.conversations)) return EMPTY_STORE;
  const conversations = parsed.conversations
    .filter((conversation) => conversation && typeof conversation.id === 'string' && Array.isArray(conversation.messages))
    .map((conversation) => ({
      id: conversation.id,
      title: typeof conversation.title === 'string' && conversation.title ? conversation.title : DEFAULT_TITLE,
      createdAt: typeof conversation.createdAt === 'number' ? conversation.createdAt : 0,
      updatedAt: typeof conversation.updatedAt === 'number' ? conversation.updatedAt : 0,
      favourite: conversation.favourite === true,
      messages: conversation.messages.filter(isMessage).map(normaliseMessage),
    }));
  const activeId = conversations.some((item) => item.id === parsed.activeId) ? parsed.activeId : null;
  return { conversations, activeId };
}

// Turns the single message log from the first version of the app into one conversation, once.
function migrateLegacy(legacyRaw) {
  let items;
  try {
    items = JSON.parse(legacyRaw ?? '[]');
  } catch {
    return EMPTY_STORE;
  }
  if (!Array.isArray(items)) return EMPTY_STORE;
  const messages = items
    .filter((item) => item && typeof item.text === 'string' && Object.hasOwn(SPEAKERS, item.speaker))
    .map((item) => ({
      id: String(item.id ?? newId(item.at ?? 0)),
      speaker: item.speaker,
      source: 'typed',
      text: item.text,
      at: typeof item.at === 'number' ? item.at : 0,
      saved: false,
      edited: false,
    }));
  if (messages.length === 0) return EMPTY_STORE;
  const times = messages.map((message) => message.at);
  return {
    conversations: [
      {
        id: `legacy-${Math.min(...times)}`,
        title: LEGACY_TITLE,
        createdAt: Math.min(...times),
        updatedAt: Math.max(...times),
        favourite: false,
        messages,
      },
    ],
    activeId: null,
  };
}

function parseStore(currentRaw, legacyRaw) {
  if (currentRaw !== null) {
    try {
      return normaliseStore(JSON.parse(currentRaw));
    } catch {
      return EMPTY_STORE;
    }
  }
  return migrateLegacy(legacyRaw);
}

function readRaw(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function sourceKey() {
  return `${readRaw(CONVERSATIONS_KEY) ?? ''}\u0000${readRaw(LEGACY_CONVERSATION_KEY) ?? ''}`;
}

// Stable between reads unless the stored data changed, so React can compare snapshots cheaply.
export function getStoreSnapshot() {
  const key = sourceKey();
  if (cache.key !== key) {
    cache = { key, store: parseStore(readRaw(CONVERSATIONS_KEY), readRaw(LEGACY_CONVERSATION_KEY)) };
  }
  return cache.store;
}

export function subscribeStore(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function persist(next) {
  try {
    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(next));
  } catch {
    // Storage can be blocked. The conversation then lasts for this page visit only.
  }
  cache = { key: sourceKey(), store: next };
  listeners.forEach((listener) => listener());
}

function commit(operation) {
  persist(operation(getStoreSnapshot()));
}

export function findConversation(store, conversationId) {
  return store.conversations.find((conversation) => conversation.id === conversationId) ?? null;
}

export function activeConversation(store) {
  return findConversation(store, store.activeId);
}

export function sortedConversations(store) {
  return [...store.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function appendMessage(store, { text, speaker, source, conversationId, now = Date.now() }) {
  const message = { id: newId(now), speaker, source, text, at: now, saved: false, edited: false };
  let targetId = conversationId ?? store.activeId;
  let conversations = store.conversations;

  if (!conversations.some((conversation) => conversation.id === targetId)) {
    targetId = newId(now);
    conversations = [
      { id: targetId, title: DEFAULT_TITLE, createdAt: now, updatedAt: now, favourite: false, messages: [] },
      ...conversations,
    ];
  }

  conversations = conversations.map((conversation) =>
    conversation.id !== targetId
      ? conversation
      : {
          ...conversation,
          title: conversation.title === DEFAULT_TITLE ? titleFromText(text) : conversation.title,
          updatedAt: now,
          messages: [...conversation.messages, message],
        },
  );

  return { conversations, activeId: targetId };
}

function updateConversation(store, conversationId, change) {
  return {
    ...store,
    conversations: store.conversations.map((conversation) =>
      conversation.id === conversationId ? change(conversation) : conversation,
    ),
  };
}

export function updateMessageText(store, conversationId, messageId, text, now = Date.now()) {
  const trimmed = text.trim();
  if (!trimmed) return store;
  return updateConversation(store, conversationId, (conversation) => ({
    ...conversation,
    updatedAt: now,
    messages: conversation.messages.map((message) =>
      message.id === messageId ? { ...message, text: trimmed, edited: true } : message,
    ),
  }));
}

export function deleteMessage(store, conversationId, messageId) {
  return updateConversation(store, conversationId, (conversation) => ({
    ...conversation,
    messages: conversation.messages.filter((message) => message.id !== messageId),
  }));
}

export function toggleMessageSaved(store, conversationId, messageId) {
  return updateConversation(store, conversationId, (conversation) => ({
    ...conversation,
    messages: conversation.messages.map((message) =>
      message.id === messageId ? { ...message, saved: !message.saved } : message,
    ),
  }));
}

export function renameConversation(store, conversationId, title) {
  const trimmed = title.trim();
  if (!trimmed) return store;
  return updateConversation(store, conversationId, (conversation) => ({ ...conversation, title: trimmed }));
}

export function toggleFavourite(store, conversationId) {
  return updateConversation(store, conversationId, (conversation) => ({
    ...conversation,
    favourite: !conversation.favourite,
  }));
}

export function clearConversation(store, conversationId, now = Date.now()) {
  return updateConversation(store, conversationId, (conversation) => ({
    ...conversation,
    updatedAt: now,
    messages: [],
  }));
}

export function deleteConversation(store, conversationId) {
  return {
    conversations: store.conversations.filter((conversation) => conversation.id !== conversationId),
    activeId: store.activeId === conversationId ? null : store.activeId,
  };
}

export function openConversation(store, conversationId) {
  return conversationId === null || findConversation(store, conversationId)
    ? { ...store, activeId: conversationId }
    : store;
}

export function summarise(conversation) {
  const last = conversation.messages[conversation.messages.length - 1];
  return {
    messageCount: conversation.messages.length,
    savedCount: conversation.messages.filter((message) => message.saved).length,
    signCount: conversation.messages.filter((message) => message.source === 'sign').length,
    preview: last ? last.text : '',
    lastAt: last ? last.at : conversation.updatedAt,
  };
}

// Counts recognised-sign messages and other messages for each of the last `days` days, oldest first.
export function activityByDay(store, { now = Date.now(), days = 7 } = {}) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, index) => {
    const start = new Date(startOfToday);
    start.setDate(start.getDate() - (days - 1 - index));
    return { start: start.getTime(), signs: 0, other: 0 };
  });
  const first = buckets[0].start;
  store.conversations.forEach((conversation) => {
    conversation.messages.forEach((message) => {
      if (message.at < first || message.at > now) return;
      const bucket = [...buckets].reverse().find((item) => message.at >= item.start);
      if (!bucket) return;
      if (message.source === 'sign') bucket.signs += 1;
      else bucket.other += 1;
    });
  });
  return buckets;
}

// Channels are how a message was entered: Sign (recognised), Text (typed or a quick phrase), Speech.
export const CHANNELS = {
  all: null,
  sign: ['sign'],
  text: ['typed', 'phrase'],
  speech: ['speech'],
};

export function matchesChannel(conversation, channel) {
  const sources = CHANNELS[channel];
  if (!sources) return true;
  return conversation.messages.some((message) => sources.includes(message.source));
}

// Short time for lists: clock time today, "Yesterday", then a short date.
export function formatListTime(timestamp, now = Date.now()) {
  const date = new Date(timestamp);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (timestamp >= today.getTime()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (timestamp >= yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function previewText(conversation) {
  const last = conversation.messages[conversation.messages.length - 1];
  if (!last) return 'No messages yet';
  return `${last.speaker === 'deaf' ? 'You' : 'Hearing'}: ${last.text}`;
}

export function transcriptText(conversation) {
  return conversation.messages
    .map((message) => {
      const time = new Date(message.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      return `[${time}] ${SPEAKERS[message.speaker]} (${SOURCES[message.source]}): ${message.text}`;
    })
    .join('\n');
}

export function recentMessages(store, limit = 5) {
  return store.conversations
    .flatMap((conversation) =>
      conversation.messages.map((message) => ({ ...message, conversationId: conversation.id, conversationTitle: conversation.title })),
    )
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}

export const conversationActions = {
  startNew: () => commit((store) => openConversation(store, null)),
  open: (conversationId) => commit((store) => openConversation(store, conversationId)),
  append: (input) => commit((store) => appendMessage(store, input)),
  editMessage: (conversationId, messageId, text) =>
    commit((store) => updateMessageText(store, conversationId, messageId, text)),
  removeMessage: (conversationId, messageId) => commit((store) => deleteMessage(store, conversationId, messageId)),
  toggleSaved: (conversationId, messageId) => commit((store) => toggleMessageSaved(store, conversationId, messageId)),
  rename: (conversationId, title) => commit((store) => renameConversation(store, conversationId, title)),
  toggleFavourite: (conversationId) => commit((store) => toggleFavourite(store, conversationId)),
  clear: (conversationId) => commit((store) => clearConversation(store, conversationId)),
  remove: (conversationId) => commit((store) => deleteConversation(store, conversationId)),
};

export function clearConversationData() {
  try {
    window.localStorage.removeItem(CONVERSATIONS_KEY);
    window.localStorage.removeItem(LEGACY_CONVERSATION_KEY);
  } catch {
    // Nothing to clear if storage is blocked.
  }
  cache = { key: null, store: EMPTY_STORE };
  listeners.forEach((listener) => listener());
}

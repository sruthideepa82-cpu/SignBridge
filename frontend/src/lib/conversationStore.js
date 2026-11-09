// Conversation messages are kept only in this browser. They are never sent to the server.
export const CONVERSATION_KEY = 'signbridge.conversation.v1';
export const SPEAKERS = {
  deaf: 'Deaf or hard-of-hearing',
  hearing: 'Hearing',
};

export function loadMessages(storage = window.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(CONVERSATION_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => item && typeof item.text === 'string' && (item.speaker === 'deaf' || item.speaker === 'hearing'),
    );
  } catch {
    return [];
  }
}

export function saveMessages(messages, storage = window.localStorage) {
  storage.setItem(CONVERSATION_KEY, JSON.stringify(messages));
}

export function clearMessages(storage = window.localStorage) {
  storage.removeItem(CONVERSATION_KEY);
}

export function makeMessage(speaker, text, now = Date.now()) {
  return { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, speaker, text, at: now };
}

import { useSyncExternalStore } from 'react';
import { getStoreSnapshot, subscribeStore } from '../lib/conversationStore.js';

export default function useConversationStore() {
  return useSyncExternalStore(subscribeStore, getStoreSnapshot, getStoreSnapshot);
}

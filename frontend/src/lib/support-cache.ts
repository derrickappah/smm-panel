import type { Conversation, Message } from '@/types/support';

const CACHE_PREFIX = 'support_';
const CONVERSATIONS_KEY = `${CACHE_PREFIX}conversations`;
const MESSAGES_KEY_PREFIX = `${CACHE_PREFIX}messages_`;
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

interface CachedData<T> {
  data: T;
  timestamp: number;
}

function getCachedData<T>(key: string): T | null {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const parsed: CachedData<T> = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is expired
    if (now - parsed.timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error('Error reading cache:', error);
    return null;
  }
}

function setCachedData<T>(key: string, data: T): void {
  try {
    const cached: CachedData<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (error) {
    console.error('Error writing cache:', error);
  }
}

export const supportCache = {
  // Conversations cache
  getConversations: (): Conversation[] | null => {
    return getCachedData<Conversation[]>(CONVERSATIONS_KEY);
  },

  setConversations: (conversations: Conversation[]): void => {
    setCachedData(CONVERSATIONS_KEY, conversations);
  },

  // Messages cache (per conversation)
  getMessages: (conversationId: string): Message[] | null => {
    return getCachedData<Message[]>(`${MESSAGES_KEY_PREFIX}${conversationId}`);
  },

  setMessages: (conversationId: string, messages: Message[]): void => {
    // Only cache last 100 messages
    const messagesToCache = messages.slice(-100);
    setCachedData(`${MESSAGES_KEY_PREFIX}${conversationId}`, messagesToCache);
  },

  // Clear all cache
  clear: (): void => {
    try {
      // Clear conversations
      localStorage.removeItem(CONVERSATIONS_KEY);

      // Clear all message caches
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(MESSAGES_KEY_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  },

  // Clear cache for a specific conversation
  clearConversation: (conversationId: string): void => {
    try {
      localStorage.removeItem(`${MESSAGES_KEY_PREFIX}${conversationId}`);
    } catch (error) {
      console.error('Error clearing conversation cache:', error);
    }
  },

  // Check if online
  isOnline: (): boolean => {
    return navigator.onLine;
  },

  // Listen for online/offline events
  onOnline: (callback: () => void): (() => void) => {
    window.addEventListener('online', callback);
    return () => window.removeEventListener('online', callback);
  },

  onOffline: (callback: () => void): (() => void) => {
    window.addEventListener('offline', callback);
    return () => window.removeEventListener('offline', callback);
  },
};


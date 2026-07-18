/**
 * Cache keys for the admin read path. Kept in one place so the writers
 * (ConversationsService) and the invalidator (CacheInvalidationService)
 * can never drift apart.
 */
export const CONVERSATIONS_LIST_KEY = 'conversations:list';

export const conversationKey = (conversationId: string): string =>
  `conversation:${conversationId}`;

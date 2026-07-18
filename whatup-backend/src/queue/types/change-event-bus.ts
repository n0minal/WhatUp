export type ChangeEventHandler = (conversationId: string) => void;

/**
 * Best-effort broadcast of "this conversation changed" hints from writers
 * (the worker) to every API instance, which fans them out to SSE clients.
 *
 * Hints carry no data — subscribers re-fetch from Postgres — so delivery is
 * intentionally at-most-once: `publish` never rejects (a lost hint means
 * brief staleness, and it must never fail the message pipeline), and
 * subscribers receive nothing that was published while they were down.
 *
 * subscribe() may be called multiple times; every handler receives every
 * hint (the SSE stream and cache invalidation both listen).
 */
export interface ChangeEventBus {
  publish(conversationId: string): Promise<void>;
  subscribe(handler: ChangeEventHandler): void;
}

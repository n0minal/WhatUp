/**
 * Port for the read cache (same pattern as MessagingClient).
 * The DI container binds a driver (Redis or in-memory) selected by
 * CACHE_DRIVER; call sites never know which.
 *
 * Contract: best-effort, like change hints. Every method swallows backend
 * failures — get() misses, set() and delete() no-op — because a cache outage
 * must degrade to slower reads, never to failed requests. Correctness
 * (idempotency, claims) lives in Postgres and is NEVER cached.
 */
export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(...keys: string[]): Promise<void>;
}

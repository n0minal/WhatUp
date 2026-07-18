/** Cache drivers, selected by CACHE_DRIVER. */
export enum CacheDriver {
  /** Shared cache in Redis; the default for the running application. */
  Redis = 'redis',
  /** Per-instance in-process Map; zero infrastructure, dev/test friendly. */
  Memory = 'memory',
}

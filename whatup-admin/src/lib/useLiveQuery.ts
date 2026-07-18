import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToChanges } from '../api/client';

interface LiveQuery<T> {
  data: T | null;
  error: string | null;
  /** True only until the first response arrives; refreshes are silent. */
  loading: boolean;
  /** Re-fetch immediately (e.g. right after sending a message). */
  refresh: () => void;
}

/**
 * Fetch on mount, then re-fetch whenever the backend's SSE change feed
 * reports a relevant change, keeping stale data on screen while refreshing.
 * `isRelevant` filters by conversationId; omit it to re-fetch on every
 * change.
 *
 * `fetcher` must be referentially stable (wrap in useCallback) — a new
 * function identity restarts the query and clears current data.
 */
export function useLiveQuery<T>(
  fetcher: () => Promise<T>,
  isRelevant?: (conversationId: string) => boolean,
): LiveQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const runRef = useRef<() => void>(() => {});
  const isRelevantRef = useRef(isRelevant);
  isRelevantRef.current = isRelevant;

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setLoading(true);

    const run = async () => {
      try {
        const result = await fetcher();
        if (cancelled) return;
        setData(result);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
      setLoading(false);
    };

    runRef.current = () => void run();
    void run();
    const unsubscribe = subscribeToChanges((conversationId) => {
      const relevant = isRelevantRef.current;
      if (!relevant || relevant(conversationId)) void run();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [fetcher]);

  const refresh = useCallback(() => runRef.current(), []);

  return { data, error, loading, refresh };
}

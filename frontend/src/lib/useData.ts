import { useCallback, useEffect, useState } from 'react';

/**
 * Loads data whenever `deps` change (and every `refreshMs`, if given).
 * Responses from superseded requests are ignored, so fast filter changes never show stale rows.
 */
export function useData<T>(load: () => Promise<T>, deps: unknown[], refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    load()
      .then((d) => {
        if (!current) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => current && setError(e instanceof Error ? e.message : 'Something went wrong'))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [...deps, tick]);

  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(() => setTick((t) => t + 1), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

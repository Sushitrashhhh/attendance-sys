import { useCallback, useEffect, useState } from 'react';

/**
 * Loads data whenever `deps` change (and every `refreshMs`, if given). `data` stays null until the
 * first load finishes. Responses from superseded requests are ignored, so fast filter changes never
 * show stale rows.
 */
export function useData<T>(load: () => Promise<T>, deps: unknown[], refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let current = true;
    load()
      .then((d) => {
        if (!current) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => current && setError(e instanceof Error ? e.message : 'Something went wrong'));
    return () => {
      current = false;
    };
    // The caller passes the values `load` depends on as `deps`, like a useEffect dependency list
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(() => setTick((t) => t + 1), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, reload };
}

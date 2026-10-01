import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data whenever `deps` change (and every `refreshMs`, if given). `data` stays null until the
 * first load finishes. Responses from superseded requests are ignored, so fast filter changes never
 * show stale rows. In-flight fetches are aborted on unmount / dep-change to free network resources.
 */
export function useData<T>(load: () => Promise<T>, deps: unknown[], refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Track the latest request so superseded ones never update state
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    load()
      .then((d) => {
        if (seq !== seqRef.current) return; // superseded
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (seq !== seqRef.current) return;
        // AbortError is expected when the request is cancelled — don't show it as an error
        if (e instanceof Error && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Something went wrong');
      });
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

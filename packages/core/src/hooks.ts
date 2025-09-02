import { useEffect, useRef, useState } from "react";
import { usePtriHistory, type Entry, type ScanOptions } from "./provider";

// shallow compare Uint8Array
const sameBytes = (a?: Uint8Array, b?: Uint8Array) => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/**
 * usePtriValue: subscribes to a key using fingerprinting. The hook updates
 * only when the fingerprint changes. Data identity is also preserved when
 * bytes are equal to avoid re-renders.
 */
export function usePtriValue(key?: Uint8Array) {
  const { rootHash, getWithFingerprint } = usePtriHistory();
  const [state, setState] = useState<{
    data: Uint8Array | undefined;
    fingerprint: string | undefined;
    loading: boolean;
    error?: unknown;
  }>({ data: undefined, fingerprint: undefined, loading: !!key });
  const prevFp = useRef<string | undefined>(undefined);
  const prevData = useRef<Uint8Array | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      setState({ data: undefined, fingerprint: undefined, loading: false });
      prevFp.current = undefined;
      prevData.current = undefined;
      return;
    }
    (async () => {
      try {
        const { data, fingerprint } = await getWithFingerprint(key);
        if (cancelled) return;
        if (fingerprint !== prevFp.current) {
          const same = sameBytes(prevData.current, data);
          prevFp.current = fingerprint;
          prevData.current = same ? prevData.current : data;
          setState({
            data: same ? prevData.current : data,
            fingerprint,
            loading: false,
          });
        } else {
          setState((p) => ({ ...p, loading: false }));
        }
      } catch (e) {
        if (!cancelled) setState((p) => ({ ...p, loading: false, error: e }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rootHash, key?.toString()]);

  return state;
}

/**
 * usePtriRange: subscribes to a range using scanWithFingerprint.
 * Updates only when the fingerprint changes.
 */
export function usePtriRange(opts?: ScanOptions) {
  const { rootHash, scanWithFingerprint } = usePtriHistory();
  const [state, setState] = useState<{
    data: Entry[];
    fingerprint: string | undefined;
    loading: boolean;
    error?: unknown;
  }>({ data: [], fingerprint: undefined, loading: !!opts });
  const prevFp = useRef<string | undefined>(undefined);
  const prevData = useRef<Entry[] | undefined>(undefined);

  // stringify opts keys that are Uint8Array to make a stable dep key
  const depKey = JSON.stringify(
    opts
      ? {
          ...opts,
          startKey: opts.startKey ? Array.from(opts.startKey) : undefined,
          endKey: opts.endKey ? Array.from(opts.endKey) : undefined,
        }
      : undefined
  );

  useEffect(() => {
    let cancelled = false;
    if (!opts) {
      setState({ data: [], fingerprint: undefined, loading: false });
      prevFp.current = undefined;
      prevData.current = undefined;
      return;
    }
    (async () => {
      try {
        const { data, fingerprint } = await scanWithFingerprint(opts);
        if (cancelled) return;
        if (fingerprint !== prevFp.current) {
          prevFp.current = fingerprint;
          prevData.current = data;
          setState({ data, fingerprint, loading: false });
        } else {
          setState((p) => ({ ...p, loading: false }));
        }
      } catch (e) {
        if (!cancelled) setState((p) => ({ ...p, loading: false, error: e }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rootHash, depKey]);

  return state;
}

export default undefined;

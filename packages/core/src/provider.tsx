import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PtriClient, encodeUtf8, decodeUtf8 } from "ptri";
import { createChunkStore } from "vunt";

// Public re-exports for convenience
export const b = encodeUtf8;
export const s = decodeUtf8;
export { encodeUtf8, decodeUtf8 };

export type RootHash = string;
export type Entry = [key: Uint8Array, value: Uint8Array];
export type MutationOps = { set?: Entry[]; del?: Uint8Array[] };
export type ScanOptions = {
  startKey?: Uint8Array;
  endKey?: Uint8Array;
  startInclusive?: boolean;
  endInclusive?: boolean;
  offset?: number;
  limit?: number;
  reverse?: boolean;
};
export type CountOptions = Omit<ScanOptions, "offset" | "limit">;
export type DiffEntry = [
  key: Uint8Array,
  left: Uint8Array | undefined,
  right: Uint8Array | undefined,
];
export type DiffResult = DiffEntry[];
export type DiffOptions = {
  startKey?: Uint8Array;
  endKey?: Uint8Array;
  startInclusive?: boolean;
  endInclusive?: boolean;
  offset?: number;
  limit?: number;
  reverse?: boolean;
};

// Hierarchy types (mirror ptri docs)
export type HierarchyScanOptions = Omit<ScanOptions, "offset" | "limit">;
export type LeafNode = { t: "L"; hash: string; entries: Entry[] };
export type BranchNode = {
  t: "B";
  hash: string;
  max: Uint8Array[];
  children: HierarchyNode[];
};
export type HierarchyNode = LeafNode | BranchNode;

// History scan types
export type HistoryScanOptions = {
  offset?: number; // items to skip from the starting side
  limit?: number; // max items to return
  reverse?: boolean; // false => redo-direction (newer), true => undo-direction (older)
};
export type HistoryScanResult = { data: RootHash[]; total: number };

export type LibraryConfig = {
  mainBranchName?: string; // default "main"
  storeName?: string; // OPFS store name; default "react-ptri"
  treeDefinition?: { targetFanout: number; minFanout: number };
  valueChunking?: unknown;
  coordinationWorkerUrl?: string; // SharedWorker URL for cross-tab coordination
};

type HistoryState = {
  timeline: RootHash[]; // append-only list of roots
  index: number; // current pointer into timeline
};

export type PtriHistoryContextValue = {
  ready: boolean;
  rootHash: RootHash;
  canUndo: boolean;
  canRedo: boolean;
  historyOffsetFromHead: number; // 0 when at head; >0 when undone
  mutate: (ops: MutationOps) => Promise<RootHash>;
  checkout: (root: RootHash) => Promise<RootHash>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  historyScan: (opts?: HistoryScanOptions) => Promise<HistoryScanResult>;
  get: (key: Uint8Array) => Promise<Uint8Array | undefined>;
  scan: (opts: ScanOptions) => Promise<Entry[]>;
  count: (opts: CountOptions) => Promise<number>;
  diff: (left: string, opts?: DiffOptions) => Promise<DiffResult>;
  scanHierarchy: (opts?: HierarchyScanOptions) => Promise<HierarchyNode>;
  countHierarchy: (opts?: HierarchyScanOptions) => Promise<number>;
  // Fingerprint-powered reads
  getWithFingerprint: (
    key: Uint8Array
  ) => Promise<{ data: Uint8Array | undefined; fingerprint: string }>;
  scanWithFingerprint: (
    opts: ScanOptions
  ) => Promise<{ data: Entry[]; fingerprint: string }>;
  fingerprintGet: (key: Uint8Array) => Promise<string>;
  fingerprintScan: (opts: ScanOptions) => Promise<string>;
};

const Ctx = createContext<PtriHistoryContextValue | null>(null);

export function usePtriHistory(): PtriHistoryContextValue {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("usePtriHistory must be used within PtriHistoryProvider");
  return ctx;
}

export function PtriHistoryProvider({
  children,
  config = {},
}: {
  children: React.ReactNode;
  config?: LibraryConfig;
}) {
  const { storeName = "react-ptri", treeDefinition, valueChunking } = config;

  const [ready, setReady] = useState(false);
  const clientRef = useRef<PtriClient | null>(null);
  const [state, setState] = useState<HistoryState>(() => ({
    timeline: [],
    index: 0,
  }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const store = await createChunkStore({ name: storeName });
      const client = new PtriClient(store, {
        ...(treeDefinition ? { treeDefinition } : {}),
        ...(valueChunking ? { valueChunking } : {}),
      } as any);
      clientRef.current = client;
      let loadedTimeline: string[] | null = null;
      let loadedIndex: number | null = null;
      try {
        // @ts-ignore OPFS experimental
        const rootDir = await navigator.storage?.getDirectory?.();
        if (rootDir) {
          // @ts-ignore
          const folder = await rootDir.getDirectoryHandle?.("react-ptri", {
            create: false,
          });
          if (folder) {
            // @ts-ignore
            const file = await folder.getFileHandle("history.json", {
              create: false,
            });
            const blob = await file.getFile();
            const txt = await blob.text();
            const data = JSON.parse(txt);
            if (data && typeof data === "object") {
              if (Array.isArray(data.timeline)) loadedTimeline = data.timeline;
              if (typeof data.index === "number") loadedIndex = data.index;
              // Back-compat: if prior schema existed, seed timeline with last known root
              if (!loadedTimeline && data.currentRoot) {
                loadedTimeline = [data.currentRoot];
                loadedIndex = 0;
              }
            }
          }
        }
      } catch {
        // ignore load errors
      }

      let timeline =
        loadedTimeline && loadedTimeline.length ? loadedTimeline : [];
      let index = typeof loadedIndex === "number" ? loadedIndex : 0;
      if (!timeline.length) {
        const root = await client.create();
        timeline = [root];
        index = 0;
      }
      if (cancelled) return;
      // Update ref synchronously
      const currentRoot = timeline[index] || "";
      rootRef.current = currentRoot;
      setState({ timeline, index });
      setReady(true);
    })().catch((e) => console.error("PtriHistoryProvider init failed", e));
    return () => {
      cancelled = true;
    };
  }, [storeName]);

  const rootRef = useRef<string>("");
  useEffect(() => {
    const currentRoot = state.timeline[state.index] || "";
    rootRef.current = currentRoot;
  }, [state.timeline, state.index]);

  // Normalize any fingerprint-like structure into a stable string
  const normalizeFingerprint = (fp: unknown): string => {
    if (typeof fp === "string") return fp;
    try {
      return JSON.stringify(fp, (_k, v) => {
        if (v instanceof Uint8Array) return Array.from(v);
        return v;
      });
    } catch {
      return String(fp);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // best-effort OPFS metadata persistence
        // @ts-ignore
        const rootDir = await navigator.storage?.getDirectory?.();
        if (!rootDir) return;
        // @ts-ignore
        const folder = await rootDir.getDirectoryHandle?.("react-ptri", {
          create: true,
        });
        // @ts-ignore
        const file = await folder.getFileHandle("history.json", {
          create: true,
        });
        const writable = await file.createWritable();
        const payload = JSON.stringify({
          timeline: state.timeline,
          index: state.index,
        });
        await writable.write(payload);
        await writable.close();
      } catch {}
    })();
  }, [state.timeline, state.index]);

  const mutate = useCallback(async (ops: MutationOps) => {
    if (!clientRef.current) throw new Error("Ptri client not ready");
    const next = await clientRef.current.mutate(rootRef.current, ops);
    // Append to timeline, truncating any future if we were not at the tip
    setState((prev: HistoryState) => {
      const atTip = prev.index === prev.timeline.length - 1;
      const base = atTip
        ? prev.timeline
        : prev.timeline.slice(0, prev.index + 1);
      const timeline = [...base, next];
      const index = timeline.length - 1;
      rootRef.current = next; // sync immediately
      return { timeline, index };
    });
    return next;
  }, []);

  const checkout = useCallback(async (root: RootHash) => {
    if (!root) throw new Error("checkout requires a non-empty root hash");
    setState((prev: HistoryState) => {
      const atTip = prev.index === prev.timeline.length - 1;
      const base = atTip
        ? prev.timeline
        : prev.timeline.slice(0, prev.index + 1);
      const timeline = [...base, root];
      const index = timeline.length - 1;
      rootRef.current = root; // sync immediately
      return { timeline, index };
    });
    return root;
  }, []);

  const historyScan = useCallback(
    async (opts: HistoryScanOptions = {}): Promise<HistoryScanResult> => {
      const { offset = 0, limit, reverse = false } = opts;
      const { timeline, index } = state;
      const headIndex = timeline.length - 1;
      if (!timeline.length) return { data: [], total: 0 };

      if (reverse) {
        // undo-direction (older commits): indices [index-1 .. 0]
        const total = Math.max(0, index);
        if (total === 0) return { data: [], total };
        const startList = timeline.slice(0, index).reverse();
        const start = Math.min(Math.max(0, offset), total);
        const end =
          typeof limit === "number" && limit >= 0
            ? Math.min(start + limit, total)
            : total;
        const data = startList.slice(start, end);
        return { data, total };
      } else {
        // redo-direction (newer commits): indices [index+1 .. head]
        const total = Math.max(0, headIndex - index);
        if (total === 0) return { data: [], total };
        const startList = timeline.slice(index + 1); // already forward order
        const start = Math.min(Math.max(0, offset), total);
        const end =
          typeof limit === "number" && limit >= 0
            ? Math.min(start + limit, total)
            : total;
        const data = startList.slice(start, end);
        return { data, total };
      }
    },
    [state]
  );

  const undo = useCallback(async () => {
    if (state.index <= 0) return false;
    const newIndex = state.index - 1;
    const target = state.timeline[newIndex];
    rootRef.current = target; // sync ref
    setState((prev) => ({ ...prev, index: newIndex }));
    return true;
  }, [state.index, state.timeline]);

  const redo = useCallback(async () => {
    if (state.index >= state.timeline.length - 1) return false;
    const newIndex = state.index + 1;
    const target = state.timeline[newIndex];
    rootRef.current = target; // sync ref
    setState((prev) => ({ ...prev, index: newIndex }));
    return true;
  }, [state.index, state.timeline.length]);
  // No branching in simplified model

  const value = useMemo<PtriHistoryContextValue>(
    () => ({
      ready,
      rootHash: state.timeline[state.index] || "",
      canUndo: state.index > 0,
      canRedo: state.index < state.timeline.length - 1,
      historyOffsetFromHead: Math.max(
        0,
        state.timeline.length - 1 - state.index
      ),
      mutate,
      checkout,
      undo,
      redo,
      historyScan,
      get: async (key: Uint8Array) => {
        if (!clientRef.current) throw new Error("Ptri client not ready");
        const v = await clientRef.current.get(rootRef.current, key);
        return v ?? undefined;
      },
      scan: async (opts: ScanOptions) => {
        if (!clientRef.current) throw new Error("Ptri client not ready");
        const rows = await clientRef.current.scan(rootRef.current, opts as any);
        return rows as Entry[];
      },
      count: async (opts: CountOptions) => {
        if (!clientRef.current) throw new Error("Ptri client not ready");
        const n = await clientRef.current.count(rootRef.current, opts as any);
        return n as number;
      },
      diff: async (left: string, opts?: DiffOptions) => {
        if (!clientRef.current) throw new Error("Ptri client not ready");
        const rows = await clientRef.current.diff(
          left,
          rootRef.current,
          opts as any
        );
        return rows as DiffResult;
      },
      scanHierarchy: async (opts?: HierarchyScanOptions) => {
        if (!clientRef.current) throw new Error("Ptri client not ready");
        const node = await clientRef.current.scanHierarchy(
          rootRef.current,
          opts as any
        );
        return node as HierarchyNode;
      },
      countHierarchy: async (opts?: HierarchyScanOptions) => {
        if (!clientRef.current) throw new Error("Ptri client not ready");
        const n = await clientRef.current.countHierarchy(
          rootRef.current,
          opts as any
        );
        return n as number;
      },
      getWithFingerprint: async (key: Uint8Array) => {
        if (!clientRef.current) throw new Error("Ptri client not ready");
        const res = (await clientRef.current.getWithFingerprint(
          rootRef.current,
          key
        )) as any;
        return {
          data: res.data as Uint8Array | undefined,
          fingerprint: normalizeFingerprint(res.fingerprint),
        };
      },
      scanWithFingerprint: async (opts: ScanOptions) => {
        if (!clientRef.current) throw new Error("Ptri client not ready");
        const res = (await clientRef.current.scanWithFingerprint(
          rootRef.current,
          opts as any
        )) as any;
        return {
          data: res.data as Entry[],
          fingerprint: normalizeFingerprint(res.fingerprint),
        };
      },
      fingerprintGet: async (key: Uint8Array) => {
        if (!clientRef.current) throw new Error("Ptri client not ready");
        const fp = (await clientRef.current.fingerprintGet(
          rootRef.current,
          key
        )) as any;
        return normalizeFingerprint(fp);
      },
      fingerprintScan: async (opts: ScanOptions) => {
        if (!clientRef.current) throw new Error("Ptri client not ready");
        const fp = (await clientRef.current.fingerprintScan(
          rootRef.current,
          opts as any
        )) as any;
        return normalizeFingerprint(fp);
      },
    }),
    [ready, state, mutate, checkout, undo, redo, historyScan]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export default PtriHistoryProvider;

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
export type BranchName = string;
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

export type LibraryConfig = {
  mainBranchName?: string; // default "main"
  storeName?: string; // OPFS store name; default "react-ptri"
};

type HistoryState = {
  currentRoot: RootHash;
  currentBranch: BranchName;
  undoStack: RootHash[];
  redoStack: RootHash[];
  branches: Record<BranchName, RootHash>;
};

export type PtriHistoryContextValue = {
  ready: boolean;
  rootHash: RootHash;
  branch: BranchName;
  canUndo: boolean;
  canRedo: boolean;
  branches: BranchName[];
  mutate: (ops: MutationOps) => Promise<RootHash>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  checkout: (branchOrHash: BranchName | RootHash) => Promise<void>;
  createBranch: (name: BranchName) => Promise<void>;
  get: (key: Uint8Array) => Promise<Uint8Array | undefined>;
  scan: (opts: ScanOptions) => Promise<Entry[]>;
};

class WriteQueue {
  private queue: Array<{
    ops: MutationOps;
    resolve: (h: RootHash) => void;
    reject: (e: unknown) => void;
  }> = [];
  private processing = false;
  private client: PtriClient;
  private getRoot: () => RootHash;
  private setRoot: (h: RootHash) => void;

  constructor(
    client: PtriClient,
    getRoot: () => RootHash,
    setRoot: (h: RootHash) => void
  ) {
    this.client = client;
    this.getRoot = getRoot;
    this.setRoot = setRoot;
  }

  enqueue(ops: MutationOps) {
    return new Promise<RootHash>((resolve, reject) => {
      this.queue.push({ ops, resolve, reject });
      this.process().catch((e) =>
        console.error("write-queue process error", e)
      );
    });
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length) {
      const item = this.queue.shift()!;
      try {
        const root = this.getRoot();
        const next = await this.client.mutate(root, item.ops);
        this.setRoot(next);
        item.resolve(next);
      } catch (e) {
        item.reject(e);
      }
    }
    this.processing = false;
  }
}

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
  const { mainBranchName = "main", storeName = "react-ptri" } = config;

  const [ready, setReady] = useState(false);
  const clientRef = useRef<PtriClient | null>(null);
  const [state, setState] = useState<HistoryState>(() => ({
    currentRoot: "",
    currentBranch: mainBranchName,
    undoStack: [],
    redoStack: [],
    branches: { [mainBranchName]: "" },
  }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const store = await createChunkStore({ name: storeName });
      const client = new PtriClient(store);
      clientRef.current = client;
      const root = await client.create();
      if (cancelled) return;
      setState((prev: HistoryState) => ({
        ...prev,
        currentRoot: root,
        branches: { ...prev.branches, [prev.currentBranch]: root },
      }));
      setReady(true);
    })().catch((e) => console.error("PtriHistoryProvider init failed", e));
    return () => {
      cancelled = true;
    };
  }, [storeName]);

  const rootRef = useRef<string>("");
  useEffect(() => {
    rootRef.current = state.currentRoot;
  }, [state.currentRoot]);

  const queueRef = useRef<WriteQueue | null>(null);
  if (!queueRef.current && clientRef.current) {
    queueRef.current = new WriteQueue(
      clientRef.current,
      () => rootRef.current,
      (h) => (rootRef.current = h)
    );
  }

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
          undoStack: state.undoStack,
          redoStack: state.redoStack,
          branches: state.branches,
          currentBranch: state.currentBranch,
          currentRoot: state.currentRoot,
        });
        await writable.write(payload);
        await writable.close();
      } catch {}
    })();
  }, [
    state.undoStack,
    state.redoStack,
    state.branches,
    state.currentBranch,
    state.currentRoot,
  ]);

  const mutate = useCallback(async (ops: MutationOps) => {
    if (!queueRef.current) throw new Error("Ptri client not ready");
    const next = await queueRef.current.enqueue(ops);
    setState((prev: HistoryState) => ({
      ...prev,
      currentRoot: next,
      undoStack: prev.currentRoot
        ? [...prev.undoStack, prev.currentRoot].slice(-100)
        : prev.undoStack,
      redoStack: [],
      branches: { ...prev.branches, [prev.currentBranch]: next },
    }));
    return next;
  }, []);

  const undo = useCallback(async () => {
    if (!state.undoStack.length) return false;
    const previousRoot = state.undoStack[state.undoStack.length - 1];
    setState((prev: HistoryState) => ({
      ...prev,
      currentRoot: previousRoot,
      undoStack: prev.undoStack.slice(0, -1),
      redoStack: prev.currentRoot
        ? [...prev.redoStack, prev.currentRoot]
        : prev.redoStack,
      branches: { ...prev.branches, [prev.currentBranch]: previousRoot },
    }));
    return true;
  }, [state.undoStack, state.currentRoot, state.currentBranch]);

  const redo = useCallback(async () => {
    if (!state.redoStack.length) return false;
    const nextRoot = state.redoStack[state.redoStack.length - 1];
    setState((prev) => ({
      ...prev,
      currentRoot: nextRoot,
      undoStack: prev.currentRoot
        ? [...prev.undoStack, prev.currentRoot]
        : prev.undoStack,
      redoStack: prev.redoStack.slice(0, -1),
      branches: { ...prev.branches, [prev.currentBranch]: nextRoot },
    }));
    return true;
  }, [state.redoStack, state.currentRoot, state.currentBranch]);

  const checkout = useCallback(async (branchOrHash: BranchName | RootHash) => {
    setState((prev: HistoryState) => {
      if (branchOrHash in prev.branches) {
        const h = prev.branches[branchOrHash as BranchName];
        return {
          ...prev,
          currentBranch: branchOrHash as BranchName,
          currentRoot: h,
          redoStack: [],
        };
      } else {
        return {
          ...prev,
          currentBranch: "",
          currentRoot: branchOrHash,
          redoStack: [],
        };
      }
    });
  }, []);

  const createBranch = useCallback(async (name: BranchName) => {
    setState((prev: HistoryState) => ({
      ...prev,
      branches: { ...prev.branches, [name]: prev.currentRoot },
    }));
  }, []);

  const value = useMemo<PtriHistoryContextValue>(
    () => ({
      ready,
      rootHash: state.currentRoot,
      branch: state.currentBranch,
      canUndo: state.undoStack.length > 0,
      canRedo: state.redoStack.length > 0,
      branches: Object.keys(state.branches),
      mutate,
      undo,
      redo,
      checkout,
      createBranch,
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
    }),
    [ready, state, mutate, undo, redo, checkout, createBranch]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export default PtriHistoryProvider;

# react-ptri

### Deterministic, content-addressed state management for React with live fingerprints

react-ptri is a thin React layer over a content-addressed, immutable key–value index (ptri) backed by an OPFS chunk store (vunt). Every mutation yields a new root hash (commit) and every read (point or range) can be summarized by a deterministic fingerprint that only changes when the underlying bytes change within the specified bounds. The provider maintains an in-app linear history of roots for undo/redo, and hooks subscribe to read fingerprints to avoid unnecessary re-renders.

## Quick start

Install the peer dependencies and this package, then wrap your app with the provider and use the hooks.

```tsx
import React from "react";
import PtriHistoryProvider, {
  usePtriHistory,
  usePtriValue,
  usePtriRange,
  b, // encodeUtf8
  s, // decodeUtf8
} from "react-ptri";

function Demo() {
  const { ready, rootHash, mutate, undo, redo, get, scan } = usePtriHistory();

  // Live subscriptions driven by fingerprints
  const liveVal = usePtriValue(b("demo:key"));
  const liveRange = usePtriRange({
    startKey: b("a"),
    endKey: b("z"),
    startInclusive: true,
    endInclusive: true,
  });

  async function setValue() {
    await mutate({ set: [[b("demo:key"), b("hello")]] });
  }

  return (
    <div>
      <p>Status: {ready ? "Ready" : "Loading"}</p>
      <p>Root: {rootHash}</p>
      <p>Live value fp: {liveVal.fingerprint ?? "-"}</p>
      <p>Live range fp: {liveRange.fingerprint ?? "-"}</p>
      <button onClick={setValue}>Set</button>
      <button onClick={() => undo()}>Undo</button>
      <button onClick={() => redo()}>Redo</button>
    </div>
  );
}

export default function App() {
  return (
    <PtriHistoryProvider>
      <Demo />
    </PtriHistoryProvider>
  );
}
```

Notes

- Keys and values are raw bytes (Uint8Array). Use `b("...")` and `s(bytes)` helpers to move between strings and bytes.
- `mutate` accepts batched `set` and `del` operations and returns the new root hash.

## Fingerprints: precise, deterministic change detection

ptri exposes content-based fingerprints for both point reads and range scans. react-ptri uses these to drive reactivity:

- Point reads: `fingerprintGet(key)` changes iff the value bytes at `key` change (including transitions between missing/value and empty-string/value). Identical rewrites yield the same fingerprint.
- Range scans: `fingerprintScan(opts)` changes iff the multiset/ordering of entries within the specified range and options changes. Options such as `startKey/endKey`, inclusivity flags, `reverse`, `offset`, and `limit` are all part of the fingerprint domain, so toggling them deterministically changes the result.
- Non-overlapping writes do not affect a fingerprint for a key/range that does not include the changed rows.

These fingerprints make it trivial to implement stable subscriptions: hooks poll fingerprints and only fetch data and update state when a fingerprint differs from the previous one. If you run the same scan twice and that page of data did not change, the fingerprint is identical and the hook skips a re-render.

## Core concepts

- Immutable root history: Each mutation creates a new root hash (a content-addressed commit). The provider keeps a linear `timeline` and an `index`, enabling `undo`/`redo` without branching.
- OPFS-backed storage: Chunks are persisted using `vunt` in the browser’s Origin Private File System. History metadata (timeline/index) is best-effort persisted in `react-ptri/history.json` for continuity across sessions.
- Byte-first API: The core API speaks Uint8Array for keys/values to avoid encoding ambiguity. Helpers `b`/`s` are provided for UTF-8 conversions.
- Bounded range scans: Range queries are defined by `[startKey, endKey]` with inclusive flags, `offset`, `limit`, and `reverse`. The same options that shape results also shape fingerprints.
- Structural introspection: Hierarchical scan and counts expose the Merkleized tree structure for debugging or analytics.

## API reference

All exports are available from `react-ptri`. Default export is the provider component.

### PtriHistoryProvider (default export)

React component that initializes a ptri client with a vunt OPFS store and manages a linear history of roots.

Props

```ts
type LibraryConfig = {
  mainBranchName?: string; // reserved for future, currently linear history
  storeName?: string; // OPFS store name; default "react-ptri"
  treeDefinition?: { targetFanout: number; minFanout: number };
  valueChunking?: unknown;
  coordinationWorkerUrl?: string; // reserved for cross-tab coordination
};

function PtriHistoryProvider(props: {
  children: React.ReactNode;
  config?: LibraryConfig;
}): JSX.Element;
```

### Hooks

#### usePtriHistory()

Returns the high-level client bound to the current root, plus history controls.

```ts
type RootHash = string;
type Entry = [key: Uint8Array, value: Uint8Array];

type MutationOps = {
  set?: Entry[];
  del?: Uint8Array[]; // keys
};

type ScanOptions = {
  startKey?: Uint8Array;
  endKey?: Uint8Array;
  startInclusive?: boolean;
  endInclusive?: boolean;
  offset?: number;
  limit?: number;
  reverse?: boolean;
};

type CountOptions = Omit<ScanOptions, "offset" | "limit">;

type DiffEntry = [
  key: Uint8Array,
  left: Uint8Array | undefined,
  right: Uint8Array | undefined,
];
type DiffResult = DiffEntry[];

type DiffOptions = {
  startKey?: Uint8Array;
  endKey?: Uint8Array;
  startInclusive?: boolean;
  endInclusive?: boolean;
  offset?: number;
  limit?: number;
  reverse?: boolean;
};

type HierarchyScanOptions = Omit<ScanOptions, "offset" | "limit">;
type LeafNode = { t: "L"; hash: string; entries: Entry[] };
type BranchNode = {
  t: "B";
  hash: string;
  max: Uint8Array[];
  children: HierarchyNode[];
};
type HierarchyNode = LeafNode | BranchNode;

type PtriHistoryContextValue = {
  ready: boolean;
  rootHash: RootHash;
  canUndo: boolean;
  canRedo: boolean;
  historyOffsetFromHead: number; // 0 when at head; > 0 when undone
  mutate: (ops: MutationOps) => Promise<RootHash>;
  checkout: (root: RootHash) => Promise<RootHash>; // append a given root to history
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

function usePtriHistory(): PtriHistoryContextValue;
```

Behavior

- `mutate` appends to the timeline, truncating future states if you had undone.
- `checkout(root)` appends the provided root hash to the timeline (like checking out a commit); it also truncates any future states if you had undone. Undo will revert this checkout.
- `undo`/`redo` move the current root pointer; no branching.
- All reads are performed against the current root and are therefore time-travel aware.
- Fingerprints are normalized into stable strings for reliable comparisons.
- `historyOffsetFromHead` reports how far you are from the head (0 means at head). Useful to signal undone state.
- `historyScan({ offset, limit, reverse })` pages through history hashes without start/end keys. When `reverse` is `true`, you scan toward older commits (undo stack). When `false`, you scan toward newer commits (redo stack).

#### usePtriValue(key?: Uint8Array)

Subscribes to a single key. It polls `fingerprintGet(key)` and only fetches and updates when the fingerprint changes. Byte-identical values are treated as equal to preserve referential stability and avoid re-renders.

```ts
type UsePtriValueState = {
  data: Uint8Array | undefined;
  fingerprint: string | undefined;
  loading: boolean;
  error?: unknown;
};

function usePtriValue(key?: Uint8Array): UsePtriValueState;
```

#### usePtriRange(opts?: ScanOptions)

Subscribes to a range. It polls `fingerprintScan(opts)` and only fetches and updates when the fingerprint changes.

```ts
type UsePtriRangeState = {
  data: Entry[];
  fingerprint: string | undefined;
  loading: boolean;
  error?: unknown;
};

function usePtriRange(opts?: ScanOptions): UsePtriRangeState;
```

### Utilities

```ts
// UTF-8 helpers (aliases provided)
import { encodeUtf8, decodeUtf8, b, s } from "react-ptri";

function b(str: string): Uint8Array; // alias of encodeUtf8
function s(bytes: Uint8Array): string; // alias of decodeUtf8
```

## Examples

### Set, get, scan, and undo/redo

```tsx
const { mutate, get, scan, undo, redo, b, s } = (() => {
  // inside a component: grab from usePtriHistory()
  return {
    ...usePtriHistory(),
    b,
    s,
  };
})();

// set a value
await mutate({ set: [[b("a"), b("1")]] });

// get it back
const v = await get(b("a"));
console.log(s(v!)); // "1"

// scan a..z
const rows = await scan({
  startKey: b("a"),
  endKey: b("z"),
  startInclusive: true,
  endInclusive: true,
});
rows.forEach(([k, v]) => console.log(s(k), s(v)));

// undo/redo
await undo();
await redo();

// checkout a specific root (e.g., from a previous run or a bookmark)
await checkout("<some-root-hash>");
```

### Fingerprinted live queries

```tsx
const value = usePtriValue(b("live:key"));
const range = usePtriRange({
  startKey: b("a"),
  endKey: b("z"),
  startInclusive: true,
  endInclusive: true,
  limit: 10,
});

return (
  <>
    <div>Value fp: {value.fingerprint ?? "-"}</div>
    <div>Range fp: {range.fingerprint ?? "-"}</div>
  </>
);
```

### Browsing history (undo/redo stacks)

```ts
// how far from head are we?
const { historyOffsetFromHead, historyScan } = usePtriHistory();

// list up to 10 older commits (undo direction)
const older = await historyScan({ reverse: true, offset: 0, limit: 10 });
console.log(older.total, older.data);

// list up to 10 newer commits (redo direction)
const newer = await historyScan({ reverse: false, offset: 0, limit: 10 });
console.log(newer.total, newer.data);
```

## Installation

Peer dependencies

- react >= 18
- react-dom >= 18

Package installs

- ptri (transitively via this package)
- vunt (transitively via this package)

## Type safety and bytes

The core operates on Uint8Array for keys and values. This avoids hidden encoding/locale bugs in persistent hashes and fingerprints. For convenience, use `b("...")` and `s(bytes)` when prototyping in React apps.

## License

ISC

# ptri

An immutable prolly tree with content-addressed storage and content-defined chunking. Designed for fast range scans, immutable roots, and efficient large-value storage via FastCDC.

## Install

ptri is published as an ES module.

```sh
pnpm add ptri
# or
npm i ptri
```

## Quick start

You provide a chunk store (put/get/has) and use either the bound client or the standalone functions.

```js
import { PtriClient } from "ptri";

// Minimal in-memory chunk store
const store = (() => {
  const m = new Map();
  const enc = (u8) =>
    crypto.subtle.digest("SHA-256", u8).then((d) => {
      const a = Array.from(new Uint8Array(d));
      return a.map((b) => b.toString(16).padStart(2, "0")).join("");
    });
  return {
    async put(bytes) {
      const h = await enc(bytes);
      m.set(h, bytes);
      return h;
    },
    async get(h) {
      return m.get(h) ?? null;
    },
    async has(h) {
      return m.has(h);
    },
  };
})();

const client = new PtriClient(store);
import { encodeUtf8 as b, decodeUtf8 as s, encodeJson, decodeJson } from "ptri";
// Utilities available from the package:
// - encodeUtf8 (alias b), decodeUtf8 (alias s)
// - encodeJson, decodeJson
let root = await client.create();
root = await client.mutate(root, {
  set: [
    [b("a"), b("1")],
    [b("b"), b("2")],
  ],
});
const val = await client.get(root, b("a")); // Uint8Array
const rows = await client.scan(root, {
  startKey: b("a"),
  endKey: b("z"),
  endInclusive: true,
});
// rows: Array<[Uint8Array, Uint8Array]>
```

## Cheat sheet

Copy-paste snippets for the most common tasks. All examples use the bound client; the stateless forms are shown at the end.

### Setup

Browser/Node with a custom store:

```js
import { PtriClient, decodeUtf8 as s, encodeUtf8 as b } from "ptri";

// Minimal content-addressed store (sha256) shown above; or use vunt:
import { createChunkStore } from "vunt";
const store = await createChunkStore({ name: "demo" });
const client = new PtriClient(store, {
  treeDefinition: { targetFanout: 32, minFanout: 16 },
  valueChunking: {
    chunkingStrategy: "fastcdc-v2020",
    maxInlineValueSize: 1024,
    minChunkSize: 4096,
    avgChunkSize: 16384,
    maxChunkSize: 65536,
  },
});
```

### Create a tree

```js
let root = await client.create();
```

### Mutate (upsert + delete)

```js
root = await client.mutate(root, {
  set: [
    [b("a"), b("1")],
    [b("b"), b("2")],
  ],
  del: [b("oldKey")],
});
```

Notes:

- Keys are Uint8Array and ordered lexicographically by bytes. Use consistent formats (e.g., fixed-width prefixes).
- If `root` is empty/falsy, `mutate` will create a new empty tree, then apply ops.

```js
const v = await client.get(root, b("a")); // Uint8Array | undefined
const text = v ? decodeUtf8(v) : undefined;
```

```js
// Inclusive a..z
await client.scan(root, {
  startKey: b("a"),
  endKey: b("z"),
  endInclusive: true,
});

// b..e inclusive
await client.scan(root, {
  startKey: b("b"),
  endKey: b("e"),
  startInclusive: true,
  endInclusive: true,
});

// Pagination: offset/limit
await client.scan(root, {
  startKey: b("a"),
  endKey: b("z"),
  offset: 2,
  limit: 2,
});

// Reverse in-range (inclusive)
await client.scan(root, {
  startKey: b("b"),
  endKey: b("d"),
  startInclusive: true,
  endInclusive: true,
  reverse: true,
});
```

Defaults: `startInclusive=true`, `endInclusive=false`, `offset=0`, `reverse=false`.

### Count (like scan, but number)

```js
const total = await client.count(root, {}); // full-tree count
const n = await client.count(root, {
  startKey: b("k05"),
  endKey: b("k14"),
  endInclusive: true,
});
```

Notes: `count` rejects `offset`/`limit` (use `scan` for pagination).

### Hierarchy utilities

```js
const tree = await client.scanHierarchy(root, {
  startKey: b("a"),
  endKey: b("m"),
  endInclusive: true,
});
// { t: 'L'|'B', hash, entries|max, children }

const nh = await client.countHierarchy(root, {
  startKey: b("a"),
  endKey: b("z"),
  endInclusive: true,
});
```

### Large values and chunking

```js
// Large UTF-8 string
const big = b("0123456789abcdef".repeat(5000));
root = await client.mutate(root, { set: [[b("blob"), big]] });
await client.mutate(root, {
  set: [[b("doc"), b(JSON.stringify({ a: 1, b: [2, 3] }))]],
});
const doc = await client.get(root, b("doc")); // Uint8Array

// Raw bytes
await client.mutate(root, { set: [[b("bin"), new Uint8Array([1, 2, 3])]] });
const bytes = await client.get(root, b("bin")); // Uint8Array
```

Chunking strategies:

- fastcdc-v2020 (min/avg/max sizes, default in examples)
- fixed-size (simple fixed boundaries)
- rabin-karp (placeholder; throws if selected)

### Immutability (snapshot reads)

```js
const r0 = await client.create();
const r1 = await client.mutate(r0, { set: [[b("a"), b("1")]] });
const r2 = await client.mutate(r1, { set: [[b("a"), b("2")]] });

await client.get(r0, b("a")); // undefined
await client.get(r1, b("a")); // Uint8Array("1")
await client.get(r2, b("a")); // Uint8Array("2")
```

### Diff between roots

Compute a key-wise diff between two immutable roots. The API is bytes-only and mirrors scan/count options.

```js
// Given two roots r1 and r2
const changes = await client.diff(r1, r2, {
  // optional range; same semantics as scan
  startKey: b("a"),
  endKey: b("z"),
  startInclusive: true,
  endInclusive: true,
  // pagination
  offset: 0,
  limit: 100,
  // ordering
  reverse: false,
});

// changes: Array<[key: Uint8Array, left: Uint8Array | undefined, right: Uint8Array | undefined]>
// Examples per row (left/right undefined indicates absence on that side):
// [b("k1"), undefined, b("v") ] // added key
// [b("k2"), b("v"), undefined ] // removed key
// [b("k3"), b("v1"), b("v2")] // modified key
// Unchanged rows are not included.
```

Pagination and filtering:

```js
const page = await client.diff(r1, r2, { startKey: b("k00"), limit: 100 });
const onlyB = await client.diff(r1, r2, { startKey: b("b"), endKey: b("c") });
```

### Cryptographic fingerprints for reads

Use fingerprints to detect changes in read results without re-downloading data. Primary APIs return only the fingerprint hash (string) for performance. Debug variants return full details when needed.

```js
// 1) Scan with fingerprint (wrapper) — fingerprint is a string hash
const { data, fingerprint } = await client.scanWithFingerprint(root, {
  startKey: b("a"),
  endKey: b("z"),
  endInclusive: true,
  offset: 0,
  limit: 100,
});

// 2) Get only the fingerprint (string) for a scan range (pagination supported)
const fpOnly = await client.fingerprintScan(root, {
  startKey: b("a"),
  endKey: b("z"),
  endInclusive: true,
  offset: 0,
  limit: 100,
});

// 3) Get-by-key with fingerprint (string)
const { data: v, fingerprint: gfp } = await client.getWithFingerprint(
  root,
  b("doc")
);

// Or just the fingerprint (string) for a key
const gfpOnly = await client.fingerprintGet(root, b("doc"));

// Debug: full details for diagnostics
const dbgRange = await client.debugFingerprintScan(root, {
  startKey: b("a"),
  endKey: b("z"),
  endInclusive: true,
  offset: 0,
  limit: 100,
});
const dbgGet = await client.debugFingerprintGet(root, b("doc"));
```

Notes:

- Fingerprints are built from subtree digests; large ranges compress to a tiny proof structure. Reading time impact is minimal—no extra value loads beyond what your read already needs.
- For large values stored as chunks, we include a stable value hash so fingerprints don’t depend on chunk boundaries.
- Fingerprints incorporate pagination and reverse when provided. Two pages with different offset/limit (or opposite order via reverse) yield different fingerprints.

Debug shapes:

```ts
type RangeFingerprint = {
  algo: "sha-256";
  scope: {
    root: string;
    startKey?: string;
    endKey?: string;
    startInclusive: boolean;
    endInclusive: boolean;
    offset?: number;
    limit?: number;
    reverse?: boolean;
  };
  components: (
    | { type: "subtree"; hash: string; digest: string }
    | { type: "leaf"; hash: string; from: number; to: number; digest: string }
  )[];
  root: string; // overall digest for quick compare
};

type GetFingerprint = {
  algo: "sha-256";
  key: string; // base64
  present: boolean;
  digest: string; // digest of (key,value) or of miss marker
};
```

Compare fingerprints to detect changes:

```js
const a = await client.fingerprintScan(rootA, {
  startKey: b("a"),
  endKey: b("z"),
  endInclusive: true,
});
const bfp = await client.fingerprintScan(rootB, {
  startKey: b("a"),
  endKey: b("z"),
  endInclusive: true,
});
const changed = a !== bfp; // true if any record in range changed
```

### Stateless API (same behavior, pass chunkStore explicitly)

```js
import {
  create,
  mutate,
  get,
  scan,
  count,
  scanHierarchy,
  countHierarchy,
  scanWithFingerprint,
  fingerprintScan,
  getWithFingerprint,
  fingerprintGet,
} from "ptri";

const root0 = await create({ chunkStore: store });
const root1 = await mutate({
  chunkStore: store,
  rootHash: root0,
  set: [[b("a"), b("1")]],
});
const value = await get({ chunkStore: store, rootHash: root1, key: b("a") });
const rows = await scan({
  chunkStore: store,
  rootHash: root1,
  startKey: b("a"),
  endKey: b("z"),
});
const hier = await scanHierarchy({ chunkStore: store, rootHash: root1 });

// Diff between two roots
import { diff } from "ptri";
const d = await diff({
  chunkStore: store,
  left: root0,
  right: root1,
  startKey: b("a"),
  startInclusive: true,
  limit: 50,
});
```

- Chunk Store: content-addressed store with put/get/has (e.g., vunt-compatible).
- Root Hash: the content hash of the root node; each mutation returns a new root.
- Prolly tree: ordered leaf entries and branching by max key, supporting fast splits/scans.
- Chunked values: large values stored as chunks (FastCDC or fixed-size); read APIs transparently reassemble.
- Keys and ordering: keys are Uint8Array and compared lexicographically by bytes. Choose consistent formats (e.g., fixed-width, prefixed ranges).

## API

### Client

```ts
  create(): Promise<string>;
  get(root: string, key: Uint8Array): Promise<Uint8Array | undefined>;
  scan(root: string, opts: ScanOptions): Promise<Entry[]>;
  count(root: string, opts: CountOptions): Promise<number>;
  mutate(root: string, ops: { set?: Entry[]; del?: Uint8Array[] }): Promise<string>;
  // Hierarchy utilities
  scanHierarchy(
    root: string,
    opts?: HierarchyScanOptions
  ): Promise<HierarchyNode>;
  countHierarchy(root: string, opts?: HierarchyScanOptions): Promise<number>;
  // Fingerprints for change detection
  getWithFingerprint(
    root: string,
    key: Uint8Array
  ): Promise<{ data: Uint8Array | undefined; fingerprint: string }>;
  scanWithFingerprint(
    root: string,
    opts: ScanOptions
  ): Promise<{ data: Entry[]; fingerprint: string }>;
  fingerprintGet(root: string, key: Uint8Array): Promise<string>;
  fingerprintScan(root: string, opts: ScanOptions): Promise<string>;
  // Debug variants (return full structures)
  debugFingerprintGet(root: string, key: Uint8Array): Promise<GetFingerprint>;
  debugFingerprintScan(root: string, opts: ScanOptions): Promise<RangeFingerprint>;
  // Diff between roots
  diff(left: string, right: string, opts?: DiffOptions): Promise<DiffResult>;
}
```

### Low-level functions

```ts
create(params: { chunkStore: ChunkStore, config?: PtreeConfig }): Promise<string>
get(params: { chunkStore: ChunkStore, rootHash: string, key: Uint8Array, config?: PtreeConfig }): Promise<Uint8Array | undefined>
mutate(params: { chunkStore: ChunkStore, rootHash: string, set?: Entry[], del?: Uint8Array[], config?: PtreeConfig }): Promise<string>
scan(params: { chunkStore: ChunkStore, rootHash: string, config?: PtreeConfig } & ScanOptions): Promise<Entry[]>
count(params: { chunkStore: ChunkStore, rootHash: string, config?: PtreeConfig } & CountOptions): Promise<number>
scanHierarchy(params: { chunkStore: ChunkStore, rootHash: string } & HierarchyScanOptions): Promise<HierarchyNode>
countHierarchy(params: { chunkStore: ChunkStore, rootHash: string } & HierarchyScanOptions): Promise<number>
diff(params: { chunkStore: ChunkStore, left: string, right: string, config?: PtreeConfig } & DiffOptions): Promise<DiffResult>
// Fingerprints
getWithFingerprint(params: { chunkStore: ChunkStore, rootHash: string, key: Uint8Array, config?: PtreeConfig }): Promise<{ data: Uint8Array | undefined; fingerprint: string }>
scanWithFingerprint(params: { chunkStore: ChunkStore, rootHash: string, config?: PtreeConfig } & ScanOptions): Promise<{ data: Entry[]; fingerprint: string }>
fingerprintGet(params: { chunkStore: ChunkStore, rootHash: string, key: Uint8Array, config?: PtreeConfig }): Promise<string>
fingerprintScan(params: { chunkStore: ChunkStore, rootHash: string } & ScanOptions): Promise<string>
debugFingerprintGet(params: { chunkStore: ChunkStore, rootHash: string, key: Uint8Array, config?: PtreeConfig }): Promise<GetFingerprint>
debugFingerprintScan(params: { chunkStore: ChunkStore, rootHash: string } & ScanOptions): Promise<RangeFingerprint>
```

Note: `mutate` is tolerant of a missing/empty `rootHash` and will implicitly create a new empty tree before applying operations. This mirrors the demo webapp behavior where the first mutation initializes the tree.

### Options and types

```ts
type Entry = [key: Uint8Array, value: Uint8Array];

type ScanOptions = {
  startKey?: Uint8Array;
  endKey?: Uint8Array;
  startInclusive?: boolean; // default true
  endInclusive?: boolean; // default false
  offset?: number; // default 0
  limit?: number;
  reverse?: boolean; // default false
};

type CountOptions = Omit<ScanOptions, "offset" | "limit">;
type HierarchyScanOptions = Omit<ScanOptions, "offset" | "limit">;

type LeafNode = { t: "L"; hash: string; entries: Entry[] };
type BranchNode = {
  t: "B";
  hash: string;
  max: Uint8Array[];
  children: HierarchyNode[];
};
type HierarchyNode = LeafNode | BranchNode;

type ChunkStore = {
  put(bytes: Uint8Array): Promise<string>;
  get(hash: string): Promise<Uint8Array | null>;
  has(hash: string): Promise<boolean>;
};

type TreeDefinition = { targetFanout: number; minFanout: number };

type FixedSizeChunking = {
  chunkingStrategy: "fixed-size";
  chunkSize: number;
  maxInlineValueSize?: number;
};

type FastCdcChunking = {
  chunkingStrategy: "fastcdc-v2020";
  minChunkSize: number;
  avgChunkSize: number;
  maxChunkSize: number;
  maxInlineValueSize?: number;
};

type RabinKarpChunking = {
  chunkingStrategy: "rabin-karp";
  maxInlineValueSize?: number; // placeholder; this strategy currently throws if selected
};

type ValueChunking = FixedSizeChunking | FastCdcChunking | RabinKarpChunking;

type PtreeConfig = {
  treeDefinition?: TreeDefinition;
  valueChunking?: ValueChunking;
};

// Diff types and options
// Diff types and options (bytes-only)
type DiffEntry = [
  key: Uint8Array,
  left: Uint8Array | undefined,
  right: Uint8Array | undefined
];
type DiffResult = DiffEntry[];
type DiffOptions = {
  // Range selection (same defaults as ScanOptions)
  startKey?: Uint8Array;
  endKey?: Uint8Array;
  startInclusive?: boolean; // default true
  endInclusive?: boolean; // default false
  offset?: number; // default 0
  limit?: number;
  reverse?: boolean; // default false
};

// Fingerprint types (debug variants)
type RangeFingerprint = {
  algo: "sha-256";
  scope: {
    root: string;
    startKey?: string; // base64
    endKey?: string; // base64
    startInclusive: boolean;
    endInclusive: boolean;
    offset?: number;
    limit?: number;
    reverse?: boolean;
  };
  components: (
    | { type: "subtree"; hash: string; digest: string }
    | { type: "leaf"; hash: string; from: number; to: number; digest: string }
  )[];
  root: string; // overall digest
};

type GetFingerprint = {
  algo: "sha-256";
  key: string; // base64 key
  present: boolean;
  digest: string;
};
```

## Chunking behavior

- Small values are inlined based on `maxInlineValueSize`.
- Large values are chunked and stored by the chunk store; ptree stores descriptors and reassembles to a single Uint8Array on read.
- The public API is bytes-only. Encode/decode strings/JSON at the application boundary (e.g., TextEncoder/TextDecoder).
- Supported strategies:
  - fastcdc-v2020 (default in examples): real FastCDC with min/avg/max chunk sizing.
  - fixed-size: simple fixed chunk boundaries.
  - rabin-karp: not yet implemented (will throw if selected).

## Hierarchy utilities

- `scanHierarchy` returns the full node structure for a range so you can inspect the internal shape.
- `countHierarchy` sums entries across leaves in the range; useful for very large datasets when you only need a count.

## Types

This package ships `.d.ts` declarations generated from JSDoc and internal TS type files.
Editors and TypeScript projects will get full IntelliSense and types automatically.

## Error semantics

- All read ops require a valid `rootHash` (`get`, `scan`, `count`, `scanHierarchy`, `countHierarchy`).
- `count` rejects `offset`/`limit` (use `scan` if you need pagination); other range flags match `scan`.
- Range keys are optional. When provided, inclusivity defaults to `startInclusive=true`, `endInclusive=false`.
- `diff` requires two valid roots (`left`, `right`). The result is an array of rows with `Uint8Array` keys and values; a missing side is represented by `undefined`. Unchanged rows are not included.

## Development

- Demo webapp: `pnpm dev` then open http://localhost:3000
- Tests: `pnpm cy:run` or `pnpm cy:open`
- Type declarations: `pnpm run build:types` (also runs on prepublish)

## Status and caveats

- Prolly tree supports inserts, deletes, splits, range scans, and immutability.
- Branch merge/redistribution on underflow is minimal (collapses single-child branches; no sibling rebalancing yet).
- Rabin-Karp chunking is a placeholder.

# vunt

A browser-first, content-addressed chunk store with a simple API and GC, designed to run without a build step and verified via Cypress E2E tests. The store is now OPFS-backed for persistence in modern browsers.

- No build/transpile: native ESM, modern browsers
- Persistent storage: OPFS (Origin Private File System)
- Tests: Cypress
- Hashing: Web Crypto SHA-256 (64-hex digest)

## Quick start

Prereqs: Node 18+ and pnpm.

```powershell
pnpm i
pnpm dev   # serves the demo at http://localhost:3000
# In another terminal
pnpm cy:open   # interactive
# or
pnpm cy:run    # headless
```

## Demo: using the API in the browser

Open http://localhost:3000. The demo page lets you:

- Create a store
- Put text and see the resulting hash
- Check `has(hash)` and `get(hash)`
- Run a GC cycle: beginGCCycle -> markReachable -> sweep
- Inspect `getStats()`

The page imports the library directly:

```html
<script type="module">
  import { createChunkStore, enc, dec } from "../index.js";
  // ...
</script>
```

## Library API

The interface follows the PRD. The implementation is browser-native and OPFS-backed for persistence.

```ts
interface ChunkStore {
  // Core operations
  put(data: Uint8Array): Promise<string>; // returns sha256 hex
  get(hash: string): Promise<Uint8Array | null>;
  has(hash: string): Promise<boolean>;

  // Garbage collection
  beginGCCycle(): Promise<void>;
  markReachable(hash: string): Promise<void>;
  sweep(): Promise<void>;

  // Management
  close(): Promise<void>;
  getStats(): Promise<StoreStats>;
}

interface StoreStats {
  totalChunks: number;
  totalSize: number;
  segmentCount: number;
  cacheHitRate: number;
}

interface ChunkStoreConfig {
  name: string;
  segmentSize?: number;
  cacheSize?: number;
  writeBufferSize?: number;
  hashAlgorithm?: "sha256" | "blake3"; // currently only sha256 is implemented
}

// Factory
function createChunkStore(config?: ChunkStoreConfig): Promise<ChunkStore>;
```

## Examples

### Basic put/get

```js
import { createChunkStore, enc, dec } from "vunt";

const store = await createChunkStore({ name: "demo" });
const hash = await store.put(enc("hello vunt"));
console.log("hash:", hash); // 64-hex sha256

const data = await store.get(hash);
console.log("value:", data ? await dec(data) : null);
```

### Existence check

```js
const ok = await store.has(hash);
console.log("has?", ok);
```

### GC cycle (mark-and-sweep)

```js
await store.beginGCCycle();
await store.markReachable(hash); // mark the chunk you want to keep
await store.sweep(); // unmarked chunks are removed
```

### Stats and teardown

```js
const stats = await store.getStats();
console.log(stats); // { totalChunks, totalSize, segmentCount, cacheHitRate }

await store.close();
```

## Project structure

- `src/index.js` — public exports; OPFS-backed store under the PRD API
- `src/webapp/index.html` — demo UI to explore API
- `src/webapp/server.js` — ESM static dev server (http://localhost:3000)
- `cypress/` — E2E tests; `basic.cy.js` runs the demo app flow
- `chunk-store-prd.md` — Product Requirements Document
- `directory.md` — Repo map and developer guide

## Notes and constraints

- Browser-first, no bundler: public modules must be loadable directly by the browser (ESM only)
- Hashing: Web Crypto SHA-256; BLAKE3 may be considered later
- Storage: OPFS-backed segments with in-memory index and simple GC rewrite

## Roadmap

1. MVP: OPFS segments + in-memory index; `put/get/has` persistently — DONE
2. GC: mark-and-sweep across segments; compaction; index persistence (basic GC rewrite present; index persistence TBD)
3. Performance: write batching, LRU cache, Bloom filter for `has`
4. Reliability: WAL, crash recovery, checksums

## License

ISC

# History Management Library Design with PTRI

## Scope

PTRI provides:

- Immutable tree with content-addressed storage (each mutation returns a new root hash)
- Built-in persistence (we just provide a simple chunk store, vunt)
- Automatic structural sharing between versions
- Diff capability between any two root hashes

Our library's responsibility:

- Track the current root hash in React state
- Maintain a history of root hashes for undo/redo
- Provide a write queue to prevent race conditions
- Use SharedWorker for coordination between tabs
- Persist the history metadata (not the data - PTRI handles that)

## Core Design

### 1. Types

```typescript
import { PtriClient } from "ptri";

type RootHash = string;
type BranchName = string;

interface HistoryState {
  // Current state
  currentRoot: RootHash;
  currentBranch: BranchName;

  // History tracking
  undoStack: RootHash[];
  redoStack: RootHash[];

  // Branch tracking
  branches: Record<BranchName, RootHash>;
}

interface WriteRequest<T = any> {
  id: string;
  operations: {
    set?: Array<[Uint8Array, Uint8Array]>;
    del?: Uint8Array[];
  };
  resolver: (hash: RootHash) => void;
  rejecter: (error: Error) => void;
}

interface LibraryConfig {
  mainBranchName?: string; // default: "main"
  storeName?: string; // for OPFS isolation
}
```

### 2. React Context Structure

```typescript
interface PtriHistoryContextValue {
  // Current state
  rootHash: RootHash;
  branch: BranchName;

  // Operations
  mutate: (ops: MutationOps) => Promise<RootHash>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;

  // Branch operations
  checkout: (branchOrHash: BranchName | RootHash) => Promise<void>;
  createBranch: (name: BranchName) => Promise<void>;

  // State
  canUndo: boolean;
  canRedo: boolean;
  branches: BranchName[];
}
```

### 3. Core Implementation

```typescript
import { createChunkStore } from 'vunt';

// Write Queue to prevent race conditions
class WriteQueue {
  private queue: WriteRequest[] = [];
  private processing = false;
  private client: PtriClient;
  private currentRoot: RootHash;

  constructor(client: PtriClient, initialRoot: RootHash) {
    this.client = client;
    this.currentRoot = initialRoot;
  }

  async enqueue(operations: MutationOps): Promise<RootHash> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: crypto.randomUUID(),
        operations,
        resolver: resolve,
        rejecter: reject
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      try {
        const newRoot = await this.client.mutate(this.currentRoot, request.operations);
        this.currentRoot = newRoot;
        request.resolver(newRoot);
      } catch (error) {
        request.rejecter(error as Error);
      }
    }

    this.processing = false;
  }
}

// SharedWorker for tab coordination
// SharedWorker script (separate file)
const WORKER_SCRIPT = `
  const connections = new Set();
  const branches = new Map(); // branch -> current root

  self.onconnect = (e) => {
    const port = e.ports[0];
    connections.add(port);

    port.onmessage = (event) => {
      const { type, branch, root } = event.data;

      if (type === 'update') {
        branches.set(branch, root);
        // Broadcast to all tabs on same branch
        for (const conn of connections) {
          conn.postMessage({ type: 'sync', branch, root });
        }
      }

      if (type === 'subscribe') {
        const currentRoot = branches.get(branch);
        if (currentRoot) {
          port.postMessage({ type: 'sync', branch, root: currentRoot });
        }
      }
    };
  };
`;

// Main Provider Component
export function PtriHistoryProvider({
  children,
  config = {}
}: {
  children: React.ReactNode;
  config?: LibraryConfig;
}) {
  const { mainBranchName = 'main' } = config;

  // Initialize PTRI client
  const [client] = useState(() => {
    const store = createChunkStore();
    return new PtriClient(store);
  });

  // Initialize write queue
  const [writeQueue] = useState(() => new WriteQueue(client, ''));

  // Core state
  const [state, setState] = useState<HistoryState>({
    currentRoot: '',
    currentBranch: mainBranchName,
    undoStack: [],
    redoStack: [],
    branches: { [mainBranchName]: '' }
  });

  // SharedWorker for multi-tab sync
  useEffect(() => {
    if (typeof SharedWorker === 'undefined') return;

    const worker = new SharedWorker(
      URL.createObjectURL(new Blob([WORKER_SCRIPT], { type: 'application/javascript' }))
    );

    worker.port.onmessage = (event) => {
      if (event.data.type === 'sync' && event.data.branch === state.currentBranch) {
        setState(prev => ({
          ...prev,
          currentRoot: event.data.root,
          branches: {
            ...prev.branches,
            [event.data.branch]: event.data.root
          }
        }));
      }
    };

    // Subscribe to current branch
    worker.port.postMessage({ type: 'subscribe', branch: state.currentBranch });

    return () => worker.port.close();
  }, [state.currentBranch]);

  // Persist history metadata to OPFS
  useEffect(() => {
    const saveHistory = async () => {
      if (!navigator.storage?.getDirectory) return;

      const root = await navigator.storage.getDirectory();
      const file = await root.getFileHandle('history.json', { create: true });
      const writable = await file.createWritable();

      await writable.write(JSON.stringify({
        undoStack: state.undoStack,
        branches: state.branches
      }));

      await writable.close();
    };

    saveHistory();
  }, [state.undoStack, state.branches]);

  const mutate = useCallback(async (operations: MutationOps) => {
    const newRoot = await writeQueue.enqueue(operations);

    setState(prev => ({
      ...prev,
      currentRoot: newRoot,
      undoStack: [...prev.undoStack, prev.currentRoot].slice(-50), // Keep last 50
      redoStack: [], // Clear redo on new mutation
      branches: {
        ...prev.branches,
        [prev.currentBranch]: newRoot
      }
    }));

    // Notify other tabs via SharedWorker
    worker?.port.postMessage({
      type: 'update',
      branch: state.currentBranch,
      root: newRoot
    });

    return newRoot;
  }, [writeQueue, state.currentBranch]);

  const undo = useCallback(async () => {
    if (state.undoStack.length === 0) return false;

    const previousRoot = state.undoStack[state.undoStack.length - 1];

    setState(prev => ({
      ...prev,
      currentRoot: previousRoot,
      undoStack: prev.undoStack.slice(0, -1),
      redoStack: [...prev.redoStack, prev.currentRoot]
    }));

    return true;
  }, [state.undoStack]);

  const redo = useCallback(async () => {
    if (state.redoStack.length === 0) return false;

    const nextRoot = state.redoStack[state.redoStack.length - 1];

    setState(prev => ({
      ...prev,
      currentRoot: nextRoot,
      undoStack: [...prev.undoStack, prev.currentRoot],
      redoStack: prev.redoStack.slice(0, -1)
    }));

    return true;
  }, [state.redoStack]);

  const checkout = useCallback(async (branchOrHash: BranchName | RootHash) => {
    // Check if it's a branch name
    if (state.branches[branchOrHash]) {
      setState(prev => ({
        ...prev,
        currentBranch: branchOrHash,
        currentRoot: prev.branches[branchOrHash],
        redoStack: [] // Clear redo when switching branches
      }));
    } else {
      // Direct hash checkout
      setState(prev => ({
        ...prev,
        currentRoot: branchOrHash,
        currentBranch: '', // Detached state
        redoStack: []
      }));
    }
  }, [state.branches]);

  const value: PtriHistoryContextValue = {
    rootHash: state.currentRoot,
    branch: state.currentBranch,
    mutate,
    undo,
    redo,
    checkout,
    createBranch: async (name: BranchName) => {
      setState(prev => ({
        ...prev,
        branches: {
          ...prev.branches,
          [name]: prev.currentRoot
        }
      }));
    },
    canUndo: state.undoStack.length > 0,
    canRedo: state.redoStack.length > 0,
    branches: Object.keys(state.branches)
  };

  return (
    <PtriHistoryContext.Provider value={value}>
      {children}
    </PtriHistoryContext.Provider>
  );
}
```

## Usage Example

```typescript
function MyApp() {
  return (
    <PtriHistoryProvider config={{ mainBranchName: 'main' }}>
      <Editor />
    </PtriHistoryProvider>
  );
}

function Editor() {
  const { rootHash, mutate, undo, redo, canUndo, canRedo } = usePtriHistory();

  const handleChange = async (key: string, value: string) => {
    const encoder = new TextEncoder();
    await mutate({
      set: [[encoder.encode(key), encoder.encode(value)]]
    });
  };

  return (
    <div>
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
      <div>Current root: {rootHash}</div>
    </div>
  );
}
```

## Key Design Decisions

1. **Simplicity**: PTRI handles all the complex data storage and versioning. We just track root hashes.

2. **Write Queue**: Single queue ensures mutations are applied sequentially, preventing race conditions.

3. **SharedWorker**: Coordinates branch updates across tabs. Each tab can check out different branches or commits.

4. **Minimal Persistence**: Only save history metadata (undo/redo stacks, branch heads) to OPFS. PTRI handles actual data persistence.

5. **Branch Model**: Simple branch tracking - just map branch names to root hashes. When on a branch, updates move the branch head. When on a detached commit, updates don't affect branches.

6. **Redo Branching**: When redo stack is empty after undo operations, we could scan PTRI's data to find child commits, but this is omitted for simplicity. The redo stack is sufficient for linear history.

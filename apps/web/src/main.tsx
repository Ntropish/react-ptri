import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import PtriHistoryProvider, {
  usePtriHistory,
  b,
  s,
  type HierarchyNode,
  usePtriValue,
  usePtriRange,
} from "react-ptri";

function App() {
  const {
    ready,
    rootHash,
    mutate,
    get,
    scan,
    count,
    diff,
    scanHierarchy,
    countHierarchy,
    undo,
    redo,
    canUndo,
    canRedo,
  } = usePtriHistory();
  const [k, setK] = React.useState("");
  const [v, setV] = React.useState("");
  const [out, setOut] = React.useState("");
  // live queries demo
  const liveVal = usePtriValue(k ? b(k) : undefined);
  const liveRange = usePtriRange({
    startKey: b("a"),
    endKey: b("z"),
    endInclusive: true,
  });

  const doSet = async () => {
    if (!k) return setOut("Key required");
    const next = await mutate({ set: [[b(k), b(v)]] });
    setOut(
      JSON.stringify(
        { ok: true, op: "set", key: k, value: v, root: next },
        null,
        2
      )
    );
  };
  const doGet = async () => {
    if (!k) return setOut("Key required");
    const val = await get(b(k));
    setOut(val ? s(val) : "<missing>");
  };
  const doScan = async () => {
    const rows = await scan({
      startKey: b("a"),
      endKey: b("z"),
      endInclusive: true,
    });
    setOut(
      JSON.stringify(
        rows.map(([K, V]) => [s(K), s(V)]),
        null,
        2
      )
    );
  };
  const doCount = async () => {
    const n = await count({
      startKey: b("a"),
      endKey: b("z"),
      endInclusive: true,
    });
    setOut(`count(a..z) = ${n}`);
  };
  const doDiff = async () => {
    // perform a self-diff for demo (should be empty)
    const rows = await diff(rootHash, {
      startKey: b("a"),
      endKey: b("z"),
      endInclusive: true,
    });
    setOut(
      JSON.stringify(
        rows.map(([K, L, R]) => [s(K), L ? s(L) : null, R ? s(R) : null]),
        null,
        2
      )
    );
  };
  const summarizeHierarchy = (node: HierarchyNode): string => {
    if (!node) return "<none>";
    if (node.t === "L") {
      return `L(${node.entries.length})`;
    }
    // Branch: show child summaries
    const kids = (node.children || []).map((c) => summarizeHierarchy(c));
    return `B[${kids.join(",")}]`;
  };
  const doHierarchy = async () => {
    const node = await scanHierarchy({
      startKey: b("a"),
      endKey: b("z"),
      endInclusive: true,
    });
    const n = await countHierarchy({
      startKey: b("a"),
      endKey: b("z"),
      endInclusive: true,
    });
    setOut(`hierarchy: ${summarizeHierarchy(node)}\nleavesTotalEntries: ${n}`);
  };

  return (
    <div className="container">
      <h1>react-ptri demo</h1>
      <div id="status">{ready ? "Ready" : "Initializing..."}</div>
      <div className="controls">
        <button id="undo" onClick={() => void undo()} disabled={!canUndo}>
          Undo
        </button>
        <button id="redo" onClick={() => void redo()} disabled={!canRedo}>
          Redo
        </button>
        <label>
          Key{" "}
          <input
            id="key"
            value={k}
            onChange={(e) => setK(e.target.value)}
            placeholder="k"
          />
        </label>
        <label>
          Value{" "}
          <input
            id="val"
            value={v}
            onChange={(e) => setV(e.target.value)}
            placeholder="v"
          />
        </label>
        <button id="set" onClick={doSet} disabled={!ready}>
          Set
        </button>
        <button id="get" onClick={doGet} disabled={!ready}>
          Get
        </button>
        <button id="scan" onClick={doScan} disabled={!ready}>
          Scan a..z
        </button>
        <button id="count" onClick={doCount} disabled={!ready}>
          Count a..z
        </button>
        <button id="diff" onClick={doDiff} disabled={!ready}>
          Diff (self)
        </button>
        <button id="hierarchy" onClick={doHierarchy} disabled={!ready}>
          Hierarchy a..z
        </button>
      </div>
      <div>
        Current root: <code id="root">{rootHash}</code>
      </div>
      <div>
        Live value fingerprint:{" "}
        <code id="live-val-fp">{liveVal.fingerprint || "-"}</code>
      </div>
      <div>
        Live range fingerprint:{" "}
        <code id="live-range-fp">{liveRange.fingerprint || "-"}</code>
      </div>
      <pre id="output">{out}</pre>
    </div>
  );
}

const root = createRoot(document.getElementById("app")!);
root.render(
  <React.StrictMode>
    <PtriHistoryProvider>
      <App />
    </PtriHistoryProvider>
  </React.StrictMode>
);

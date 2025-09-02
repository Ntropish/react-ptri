import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import PtriHistoryProvider, { usePtriHistory, b, s } from "react-ptri";

function App() {
  const { ready, rootHash, mutate, get, scan } = usePtriHistory();
  const [k, setK] = React.useState("");
  const [v, setV] = React.useState("");
  const [out, setOut] = React.useState("");

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

  return (
    <div className="container">
      <h1>react-ptri demo</h1>
      <div id="status">{ready ? "Ready" : "Initializing..."}</div>
      <div className="controls">
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
      </div>
      <div>
        Current root: <code id="root">{rootHash}</code>
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

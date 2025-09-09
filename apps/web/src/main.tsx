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
    checkout,
    historyScan,
    historyOffsetFromHead,
  } = usePtriHistory();
  const [k, setK] = React.useState("");
  const [v, setV] = React.useState("");
  const [out, setOut] = React.useState("");
  // scan/count/hierarchy options (defaults keep existing tests green)
  const [scanStart, setScanStart] = React.useState("a");
  const [scanEnd, setScanEnd] = React.useState("z");
  const [scanStartInc, setScanStartInc] = React.useState(true);
  const [scanEndInc, setScanEndInc] = React.useState(true);
  const [scanReverse, setScanReverse] = React.useState(false);
  const [scanOffset, setScanOffset] = React.useState<string>("");
  const [scanLimit, setScanLimit] = React.useState<string>("");

  // diff options
  const [diffLeft, setDiffLeft] = React.useState<string>("");

  // batch ops JSON
  const [opsJson, setOpsJson] = React.useState<string>(
    '{"set":[["demo","value"]]}'
  );

  // Branch UI removed in simplified linear-history model

  // live queries demo
  // Isolated controls for live fingerprints (independent from top form)
  const [liveKey, setLiveKey] = React.useState<string>("");
  const [liveScanStart, setLiveScanStart] = React.useState("a");
  const [liveScanEnd, setLiveScanEnd] = React.useState("z");
  const [liveScanStartInc, setLiveScanStartInc] = React.useState(true);
  const [liveScanEndInc, setLiveScanEndInc] = React.useState(true);
  const [liveScanReverse, setLiveScanReverse] = React.useState(false);
  const [liveScanOffset, setLiveScanOffset] = React.useState<string>("");
  const [liveScanLimit, setLiveScanLimit] = React.useState<string>("");

  const liveVal = usePtriValue(liveKey ? b(liveKey) : undefined);
  const liveRange = usePtriRange({
    startKey: liveScanStart ? b(liveScanStart) : undefined,
    endKey: liveScanEnd ? b(liveScanEnd) : undefined,
    startInclusive: liveScanStartInc,
    endInclusive: liveScanEndInc,
    reverse: liveScanReverse,
    offset: liveScanOffset ? Number(liveScanOffset) : undefined,
    limit: liveScanLimit ? Number(liveScanLimit) : undefined,
  });

  // history browsing
  const [histOffset, setHistOffset] = React.useState<string>("0");
  const [histLimit, setHistLimit] = React.useState<string>("10");
  const [histReverse, setHistReverse] = React.useState<boolean>(false);
  const [histOut, setHistOut] = React.useState<string>("[]");
  const [checkoutRoot, setCheckoutRoot] = React.useState<string>("");

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
      startKey: scanStart ? b(scanStart) : undefined,
      endKey: scanEnd ? b(scanEnd) : undefined,
      startInclusive: scanStartInc,
      endInclusive: scanEndInc,
      reverse: scanReverse,
      offset: scanOffset ? Number(scanOffset) : undefined,
      limit: scanLimit ? Number(scanLimit) : undefined,
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
      startKey: scanStart ? b(scanStart) : undefined,
      endKey: scanEnd ? b(scanEnd) : undefined,
      startInclusive: scanStartInc,
      endInclusive: scanEndInc,
      reverse: scanReverse,
    });
    setOut(`count(a..z) = ${n}`);
  };
  const doDiff = async () => {
    const left = diffLeft || rootHash; // default to self-diff
    const rows = await diff(left, {
      startKey: scanStart ? b(scanStart) : undefined,
      endKey: scanEnd ? b(scanEnd) : undefined,
      startInclusive: scanStartInc,
      endInclusive: scanEndInc,
      reverse: scanReverse,
      offset: scanOffset ? Number(scanOffset) : undefined,
      limit: scanLimit ? Number(scanLimit) : undefined,
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
      startKey: scanStart ? b(scanStart) : undefined,
      endKey: scanEnd ? b(scanEnd) : undefined,
      startInclusive: scanStartInc,
      endInclusive: scanEndInc,
      reverse: scanReverse,
    });
    const n = await countHierarchy({
      startKey: scanStart ? b(scanStart) : undefined,
      endKey: scanEnd ? b(scanEnd) : undefined,
      startInclusive: scanStartInc,
      endInclusive: scanEndInc,
      reverse: scanReverse,
    });
    setOut(`hierarchy: ${summarizeHierarchy(node)}\nleavesTotalEntries: ${n}`);
  };

  const doBatch = async () => {
    try {
      const parsed = JSON.parse(opsJson || "{}");
      const setOps: [Uint8Array, Uint8Array][] = Array.isArray(parsed.set)
        ? parsed.set.map((pair: [string, string]) => [b(pair[0]), b(pair[1])])
        : [];
      const delOps: Uint8Array[] = Array.isArray(parsed.del)
        ? parsed.del.map((key: string) => b(key))
        : [];
      if (setOps.length === 0 && delOps.length === 0) {
        setOut("No ops to apply");
        return;
      }
      const next = await mutate({
        ...(setOps.length ? { set: setOps } : {}),
        ...(delOps.length ? { del: delOps } : {}),
      });
      setOut(JSON.stringify({ ok: true, op: "mutate", root: next }, null, 2));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setOut(`Batch parse/apply error: ${msg}`);
    }
  };

  const doHistoryScan = async () => {
    const res = await historyScan({
      offset: histOffset ? Number(histOffset) : 0,
      limit: histLimit ? Number(histLimit) : undefined,
      reverse: histReverse,
    });
    setHistOut(JSON.stringify(res, null, 2));
  };

  const doCheckout = async () => {
    if (!checkoutRoot) return;
    await checkout(checkoutRoot);
  };

  // Branch actions removed

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
          Scan
        </button>
        <button id="count" onClick={doCount} disabled={!ready}>
          Count a..z
        </button>
        <button id="diff" onClick={doDiff} disabled={!ready}>
          Diff
        </button>
        <button id="hierarchy" onClick={doHierarchy} disabled={!ready}>
          Hierarchy
        </button>
      </div>
      <div className="controls">
        <fieldset>
          <legend>Scan/Count Options</legend>
          <label>
            Start{" "}
            <input
              id="scan-start"
              value={scanStart}
              onChange={(e) => setScanStart(e.target.value)}
              placeholder="a"
            />
          </label>
          <label>
            End{" "}
            <input
              id="scan-end"
              value={scanEnd}
              onChange={(e) => setScanEnd(e.target.value)}
              placeholder="z"
            />
          </label>
          <label>
            <input
              id="scan-start-inclusive"
              type="checkbox"
              checked={scanStartInc}
              onChange={(e) => setScanStartInc(e.target.checked)}
            />
            startInclusive
          </label>
          <label>
            <input
              id="scan-end-inclusive"
              type="checkbox"
              checked={scanEndInc}
              onChange={(e) => setScanEndInc(e.target.checked)}
            />
            endInclusive
          </label>
          <label>
            <input
              id="scan-reverse"
              type="checkbox"
              checked={scanReverse}
              onChange={(e) => setScanReverse(e.target.checked)}
            />
            reverse
          </label>
          <label>
            Offset{" "}
            <input
              id="scan-offset"
              value={scanOffset}
              onChange={(e) => setScanOffset(e.target.value)}
              placeholder=""
            />
          </label>
          <label>
            Limit{" "}
            <input
              id="scan-limit"
              value={scanLimit}
              onChange={(e) => setScanLimit(e.target.value)}
              placeholder=""
            />
          </label>
        </fieldset>
      </div>
      <div className="controls">
        <fieldset>
          <legend>Diff Options</legend>
          <label>
            Left root{" "}
            <input
              id="diff-left"
              value={diffLeft}
              onChange={(e) => setDiffLeft(e.target.value)}
              placeholder="defaults to current"
            />
          </label>
        </fieldset>
      </div>
      <div className="controls">
        <fieldset>
          <legend>Batch Ops (JSON)</legend>
          <textarea
            id="ops-json"
            value={opsJson}
            onChange={(e) => setOpsJson(e.target.value)}
            rows={4}
            style={{ width: "100%" }}
          />
          <div>
            <button id="mutate" onClick={doBatch} disabled={!ready}>
              Apply Ops
            </button>
          </div>
        </fieldset>
      </div>
      {/* Branch controls removed */}
      <div className="controls">
        <fieldset>
          <legend>History</legend>
          <div>
            Offset from head:{" "}
            <code id="history-offset">{historyOffsetFromHead}</code>
          </div>
          <div>
            <label>
              Offset{" "}
              <input
                id="hist-scan-offset"
                value={histOffset}
                onChange={(e) => setHistOffset(e.target.value)}
              />
            </label>
            <label>
              Limit{" "}
              <input
                id="hist-scan-limit"
                value={histLimit}
                onChange={(e) => setHistLimit(e.target.value)}
              />
            </label>
            <label>
              <input
                id="hist-scan-reverse"
                type="checkbox"
                checked={histReverse}
                onChange={(e) => setHistReverse(e.target.checked)}
              />
              reverse (undo direction)
            </label>
            <button id="hist-scan" onClick={doHistoryScan} disabled={!ready}>
              Scan History
            </button>
          </div>
          <div>
            <label>
              Checkout root{" "}
              <input
                id="checkout-root"
                value={checkoutRoot}
                onChange={(e) => setCheckoutRoot(e.target.value)}
                placeholder="root hash"
              />
            </label>
            <button id="checkout" onClick={doCheckout} disabled={!ready}>
              Checkout
            </button>
          </div>
          <pre id="history-output">{histOut}</pre>
        </fieldset>
      </div>
      <div className="controls">
        <fieldset>
          <legend>Live Value Fingerprint</legend>
          <label>
            Key{" "}
            <input
              id="live-key"
              value={liveKey}
              onChange={(e) => setLiveKey(e.target.value)}
              placeholder="subscription key"
            />
          </label>
        </fieldset>
      </div>
      <div className="controls">
        <fieldset>
          <legend>Live Range Options</legend>
          <label>
            Start{" "}
            <input
              id="live-scan-start"
              value={liveScanStart}
              onChange={(e) => setLiveScanStart(e.target.value)}
              placeholder="a"
            />
          </label>
          <label>
            End{" "}
            <input
              id="live-scan-end"
              value={liveScanEnd}
              onChange={(e) => setLiveScanEnd(e.target.value)}
              placeholder="z"
            />
          </label>
          <label>
            <input
              id="live-scan-start-inclusive"
              type="checkbox"
              checked={liveScanStartInc}
              onChange={(e) => setLiveScanStartInc(e.target.checked)}
            />
            startInclusive
          </label>
          <label>
            <input
              id="live-scan-end-inclusive"
              type="checkbox"
              checked={liveScanEndInc}
              onChange={(e) => setLiveScanEndInc(e.target.checked)}
            />
            endInclusive
          </label>
          <label>
            <input
              id="live-scan-reverse"
              type="checkbox"
              checked={liveScanReverse}
              onChange={(e) => setLiveScanReverse(e.target.checked)}
            />
            reverse
          </label>
          <label>
            Offset{" "}
            <input
              id="live-scan-offset"
              value={liveScanOffset}
              onChange={(e) => setLiveScanOffset(e.target.value)}
              placeholder=""
            />
          </label>
          <label>
            Limit{" "}
            <input
              id="live-scan-limit"
              value={liveScanLimit}
              onChange={(e) => setLiveScanLimit(e.target.value)}
              placeholder=""
            />
          </label>
        </fieldset>
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

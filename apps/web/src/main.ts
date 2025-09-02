import "./style.css";
import { PtriClient, encodeUtf8 as b, decodeUtf8 as s } from "ptri";
import { createChunkStore } from "vunt";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="container">
    <h1>react-ptri demo</h1>
    <div id="status">Initializing...</div>
    <div class="controls">
      <label>Key <input id="key" placeholder="k" /></label>
      <label>Value <input id="val" placeholder="v" /></label>
      <button id="set">Set</button>
      <button id="get">Get</button>
      <button id="scan">Scan a..z</button>
    </div>
    <div>Current root: <code id="root"></code></div>
    <pre id="output"></pre>
  </div>
`;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const status = $("#status");
const rootEl = $("#root");
const output = $("#output");
const keyInp = $("#key") as HTMLInputElement;
const valInp = $("#val") as HTMLInputElement;
const btnSet = $("#set") as HTMLButtonElement;
const btnGet = $("#get") as HTMLButtonElement;
const btnScan = $("#scan") as HTMLButtonElement;

let client: PtriClient;
let root = "";

function show(obj: unknown) {
  output.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

async function init() {
  status.textContent = "Creating OPFS store...";
  const store = await createChunkStore({ name: "react-ptri-demo" });
  status.textContent = "Initializing PtriClient...";
  client = new PtriClient(store);
  root = await client.create();
  rootEl.textContent = root;
  status.textContent = "Ready";
}

btnSet.addEventListener("click", async () => {
  const k = keyInp.value;
  const v = valInp.value;
  if (!k) return show("Key required");
  root = await client.mutate(root, { set: [[b(k), b(v)]] });
  rootEl.textContent = root;
  show({ ok: true, op: "set", key: k, value: v, root });
});

btnGet.addEventListener("click", async () => {
  const k = keyInp.value;
  if (!k) return show("Key required");
  const v = await client.get(root, b(k));
  show(v ? s(v) : "<missing>");
});

btnScan.addEventListener("click", async () => {
  const rows = (await client.scan(root, {
    startKey: b("a"),
    endKey: b("z"),
    endInclusive: true,
  })) as [Uint8Array, Uint8Array][];
  const mapped = rows.map(([k, v]) => [s(k), s(v)]);
  show(mapped);
});

init().catch((e) => {
  status.textContent = "Init failed";
  show(String((e as any)?.message || e));
});

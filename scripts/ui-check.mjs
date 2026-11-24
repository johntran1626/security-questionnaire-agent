// Drive the app in headless Chrome through the DevTools Protocol (no extra packages): run a sample questionnaire,
// check the review table shows all three outcomes, and save screenshots at desktop and phone width.
//
//   node scripts/ui-check.mjs [--base http://localhost:3000] [--mock]
//
// --mock answers /api/answer from scripts/fixtures/answer.json, so the UI can be checked without API keys.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const MOCK = args.includes("--mock");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "screenshots";
const PORT = 9333;
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const profile = mkdtempSync(path.join(tmpdir(), "ui-check-"));
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page) return { proc, wsUrl: page.webSocketDebuggerUrl };
    } catch {}
    await sleep(200);
  }
  proc.kill();
  throw new Error("Chrome did not start");
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return new Promise((resolve) => (ws.onopen = () => resolve({ send, on: (l) => listeners.push(l), close: () => ws.close() })));
}

async function evaluate(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

async function waitFor(cdp, expr, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await evaluate(cdp, expr)) return true;
    await sleep(300);
  }
  return false;
}

async function goto(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await waitFor(cdp, "document.readyState === 'complete'", 30000);
  await sleep(500);
}

async function screenshot(cdp, name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const file = path.join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  return file;
}

async function setViewport(cdp, width, height, mobile) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
}

const { proc, wsUrl } = await launch();
const cdp = await connect(wsUrl);
const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail });

try {
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const consoleErrors = [];
  cdp.on((m) => {
    if (m.method === "Runtime.exceptionThrown") consoleErrors.push(m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
  });

  if (MOCK) {
    const body = Buffer.from(readFileSync("scripts/fixtures/answer.json")).toString("base64");
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/answer*" }] });
    cdp.on((m) => {
      if (m.method === "Fetch.requestPaused") {
        setTimeout(() => cdp.send("Fetch.fulfillRequest", { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: "content-type", value: "application/json" }], body }), 400);
      }
    });
  }

  for (const [label, w, h, mobile] of [["desktop", 1280, 900, false], ["phone", 390, 844, true]]) {
    await setViewport(cdp, w, h, mobile);
    await goto(cdp, BASE);
    check(`${label}: home renders`, await evaluate(cdp, "!!document.querySelector('textarea#questions')"));
    await screenshot(cdp, `${label}-1-home`);

    // Pick the "Tricky" sample on the mock run only matters for content; any sample exercises the flow.
    await evaluate(cdp, "[...document.querySelectorAll('button')].find(b => b.textContent.includes('Run agent')).click()");
    const done = await waitFor(cdp, "document.querySelectorAll('[data-testid=review-row]').length > 0 || !!document.querySelector('[role=alert]')", MOCK ? 15000 : 240000);
    const alert = await evaluate(cdp, "document.querySelector('[role=alert]')?.textContent ?? ''");
    check(`${label}: review table appears`, done && !alert, alert);
    const chips = await evaluate(cdp, "[...document.querySelectorAll('[data-testid=review-row] span')].map(s => s.textContent)");
    const hasAnswer = chips.some((t) => /^(Yes|No|Partial)$/.test(t));
    const hasFlag = chips.some((t) => t.startsWith("Flag:"));
    check(`${label}: shows answers and flags`, hasAnswer && hasFlag, JSON.stringify([...new Set(chips)].slice(0, 12)));
    check(`${label}: citations shown`, await evaluate(cdp, "document.querySelectorAll('blockquote').length > 0"));
    const overflow = await evaluate(cdp, "document.documentElement.scrollWidth - window.innerWidth");
    check(`${label}: no horizontal scroll`, overflow <= 0, `overflow ${overflow}px`);
    await screenshot(cdp, `${label}-2-review`);

    // Approve all drafts and confirm the export button enables.
    await evaluate(cdp, "[...document.querySelectorAll('button')].find(b => b.textContent.includes('Approve all')).click()");
    await sleep(300);
    check(`${label}: export enabled after approval`, await evaluate(cdp, "!([...document.querySelectorAll('button')].find(b => b.textContent.includes('Export CSV')).disabled)"));
    await evaluate(cdp, "document.querySelector('details')?.setAttribute('open', '')");
    await screenshot(cdp, `${label}-3-approved`);

    await goto(cdp, `${BASE}/docs`);
    check(`${label}: docs page renders`, await evaluate(cdp, "document.querySelectorAll('section').length >= 5"));
    await screenshot(cdp, `${label}-4-docs`);
    await goto(cdp, `${BASE}/report`);
    check(`${label}: report page renders`, await evaluate(cdp, "!!document.querySelector('h1')"));
    await screenshot(cdp, `${label}-5-report`);
  }
  check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
} finally {
  cdp.close();
  proc.kill();
}

for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail && !c.ok ? `  (${c.detail})` : ""}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed. Screenshots in ${OUT}/`);
process.exit(failed ? 1 : 0);

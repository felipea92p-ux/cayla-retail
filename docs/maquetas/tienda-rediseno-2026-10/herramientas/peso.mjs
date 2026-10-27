// Mide la portada compilada: LCP, bytes que bajan (por tipo), fuentes y cuántas peticiones, con caché fría. Uso: node peso.mjs <url> <ancho> <alto> [movil]
import { spawn } from "node:child_process"; import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const [url, ancho, alto, movil] = process.argv.slice(2);
const puerto = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${puerto}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`, "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore" });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${puerto}/json/version`)).ok) break; } catch {} await dormir(250); }
const t = (await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json()).find((x) => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const esp = new Map(); const reqs = new Map(); const fin = [];
ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && esp.has(x.id)) { esp.get(x.id)(x); esp.delete(x.id); }
  else if (x.method === "Network.requestWillBeSent") reqs.set(x.params.requestId, { url: x.params.request.url, tipo: x.params.type });
  else if (x.method === "Network.loadingFinished") fin.push({ id: x.params.requestId, bytes: x.params.encodedDataLength });
  else if (x.method === "Network.responseReceived") { const r = reqs.get(x.params.requestId); if (r) r.mime = x.params.response.mimeType; } };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; esp.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await cmd("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;
await cmd("Page.enable"); await cmd("Network.enable"); await cmd("Network.setCacheDisabled", { cacheDisabled: true });
await cmd("Emulation.setDeviceMetricsOverride", { width: +ancho, height: +alto, deviceScaleFactor: movil ? 2 : 1, mobile: !!movil });
if (movil) await cmd("Emulation.setCPUThrottlingRate", { rate: 4 });
if (movil) await cmd("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
await cmd("Page.addScriptToEvaluateOnNewDocument", { source: `window.__lcp = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });` });
await cmd("Page.navigate", { url }); await dormir(9000);
const lcp = await ev("window.__lcp");
const elLcp = await ev(`(() => new Promise((res) => { new PerformanceObserver((l) => { const e = l.getEntries().at(-1); res(e ? (e.element?.tagName + '.' + String(e.element?.className).split(' ')[0] + ' ' + (e.url || '').slice(-60)) : null); }).observe({ type: 'largest-contentful-paint', buffered: true }); }))()`);
const por = {}; let total = 0;
for (const f of fin) { const r = reqs.get(f.id); if (!r) continue; const k = r.mime?.includes("font") ? "fuentes" : r.mime?.includes("javascript") ? "js" : r.mime?.includes("css") ? "css" : r.mime?.includes("image") ? "imágenes" : r.mime?.includes("html") ? "html" : "otro"; por[k] = (por[k] || 0) + f.bytes; total += f.bytes; }
const tam = (n) => (n / 1024).toFixed(0) + " kB";
console.log(`${url} ${movil ? "(móvil 4G lento, CPU ×4)" : "(escritorio)"}  LCP ${lcp} ms · elemento: ${elLcp}`);
console.log("  total", tam(total), "·", Object.entries(por).map(([k, v]) => `${k} ${tam(v)}`).join(" · "), "· peticiones", fin.length);
const fuentes = [...reqs.values()].filter((r) => r.mime?.includes("font")).map((r) => r.url.split("/").pop().slice(0, 40));
console.log("  fuentes:", fuentes.join(", "));
chrome.kill(); process.exit(0);

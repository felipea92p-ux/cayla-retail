// Tomas del tamaño de la ventana, bajando por la página como lo haría quien la mira (con su cabecera pegada).
// Uso: node tomas.mjs <carpeta> <ancho> <alto> <maxTomas> <url> <nombre> [<url> <nombre> ...]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const [salida, ancho, alto, max, ...pares] = process.argv.slice(2);
mkdirSync(salida, { recursive: true });
const puerto = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${puerto}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`, "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore" });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${puerto}/json/version`)).ok) break; } catch {} await dormir(250); }
const lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
const t = lista.find((x) => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const esp = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && esp.has(d.id)) { esp.get(d.id)(d); esp.delete(d.id); } };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; esp.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result.result.value;
await cmd("Page.enable");
if (process.env.ESQUEMA) await cmd("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: process.env.ESQUEMA }] });
await cmd("Emulation.setDeviceMetricsOverride", { width: +ancho, height: +alto, deviceScaleFactor: 1, mobile: +ancho < 700 });
for (let k = 0; k < pares.length; k += 2) {
  await cmd("Page.navigate", { url: pares[k] }); await dormir(4000);
  const H = await ev("document.documentElement.scrollHeight");
  const paso = Math.round(+alto * 0.92);
  let n = 0;
  for (let y = 0; y < H && n < +max; y += paso) {
    await ev(`window.scrollTo(0, ${y})`); await dormir(1100);
    const s = await cmd("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(salida, `${pares[k + 1]}-${++n}.png`), Buffer.from(s.result.data, "base64"));
  }
  console.log(pares[k + 1], `${n} tomas (alto de la página ${H})`);
}
chrome.kill(); process.exit(0);

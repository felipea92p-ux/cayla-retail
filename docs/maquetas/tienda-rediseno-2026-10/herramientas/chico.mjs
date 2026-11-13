// Lista TODO el texto de menos de 12 px (agrupado por clase) y los blancos de toque de menos de 24 px, por ruta. Uso: node chico.mjs <ancho> <rutas coma> ; env SESION=1
import { spawn } from "node:child_process"; import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const [ancho, rutas] = process.argv.slice(2);
const puerto = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${puerto}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`, "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore" });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${puerto}/json/version`)).ok) break; } catch {} await dormir(250); }
const t = (await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json()).find((x) => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const esp = new Map();
ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && esp.has(x.id)) { esp.get(x.id)(x); esp.delete(x.id); } };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; esp.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await cmd("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;
await cmd("Page.enable"); await cmd("Runtime.enable");
await cmd("Emulation.setDeviceMetricsOverride", { width: +ancho, height: 900, deviceScaleFactor: 1, mobile: +ancho < 700 });
const todo = {}; const blancos = {};
for (const r of rutas.split(",")) {
  const ruta = r === "ficha" ? "/catalogo/c74b6498-ff93-4dfe-b1a0-380581b8cfc0?sede=lima" : r;
  await cmd("Page.navigate", { url: "http://localhost:3100" + ruta }); await dormir(4200);
  await ev(`(async()=>{ const h=document.documentElement.scrollHeight; for(let y=0;y<h;y+=500){window.scrollTo(0,y); await new Promise(r=>setTimeout(r,40));} window.scrollTo(0,0); await new Promise(r=>setTimeout(r,400)); })()`);
  const x = await ev(`(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'; };
    const clave = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
    const chico = {}, bl = {};
    for (const el of document.body.querySelectorAll('*')) {
      if (!vis(el)) continue;
      if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length) && !el.closest('.t-sr, .t-solo-lector')) {
        const px = parseFloat(getComputedStyle(el).fontSize); if (px < 12 && !el.closest('script,style')) { const k = clave(el) + ' ' + px + 'px'; chico[k] = (chico[k] || 0) + 1; }
      }
      if (el.matches('a[href],button:not([disabled]),input:not([type=hidden]),select,textarea,[role=button]')) { const r = el.getBoundingClientRect(); const dis = /^inline/.test(getComputedStyle(el).display) && [...(el.parentElement?.childNodes || [])].some((n) => n.nodeType === 3 && n.textContent.trim().length > 3); if (!dis && Math.min(r.width, r.height) < 24) { const k = clave(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); bl[k] = (bl[k] || 0) + 1; } }
    }
    return { chico, bl };
  })()`);
  for (const [k, v] of Object.entries(x.chico)) todo[k] = (todo[k] || 0) + v;
  for (const [k, v] of Object.entries(x.bl)) blancos[k] = (blancos[k] || 0) + v;
}
console.log("— TEXTO < 12 px —"); for (const [k, v] of Object.entries(todo).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k);
console.log("— BLANCOS < 24 px —"); for (const [k, v] of Object.entries(blancos).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k);
chrome.kill(); process.exit(0);

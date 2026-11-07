// El barrido de cierre de la tienda: cada ruta × ancho × tema, en local. Mide el desborde horizontal y corre el medidor de oficio de /formidable
// (blancos de toque, contraste, texto chico). Deja el detalle en <carpeta>/detalle.jsonl y un resumen en pantalla.
// Uso: node barrido.mjs <carpeta> <anchos coma> <temas coma> <rutas coma> ; env SESION=1 para entrar con la cuenta de prueba; BOLSA=1 para llenar la bolsa antes
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const [salida, anchos, temas, rutas] = process.argv.slice(2).map((s, i) => (i === 0 ? s : s.split(",")));
mkdirSync(salida, { recursive: true });
const medidor = readFileSync(new URL("../../../../.claude/skills/formidable/referencia/medir-oficio.js", import.meta.url), "utf8");
const puerto = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${puerto}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`, "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore" });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${puerto}/json/version`)).ok) break; } catch {} await dormir(250); }
const t = (await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json()).find((x) => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const esp = new Map(); const errs = [];
ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && esp.has(x.id)) { esp.get(x.id)(x); esp.delete(x.id); } else if (x.method === "Runtime.exceptionThrown") errs.push((x.params.exceptionDetails.exception?.description ?? x.params.exceptionDetails.text).slice(0, 140)); };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; esp.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await cmd("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;
await cmd("Page.enable"); await cmd("Runtime.enable");
const base = process.env.TIENDA_URL ?? "http://localhost:3100";
const { TIENDA_CORREO, TIENDA_CLAVE } = process.env; // la cuenta de prueba de la tienda local: nunca escrita aquí (el repo es público)
await cmd("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
if (process.env.SESION) {
  if (!TIENDA_CORREO || !TIENDA_CLAVE) throw new Error("SESION=1 pide TIENDA_CORREO y TIENDA_CLAVE (la cuenta de prueba de la tienda local).");
  await cmd("Page.navigate", { url: base + "/entrar" }); await dormir(4000);
  for (let i = 0; i < 20; i++) { if (await ev(`(() => { const f = document.querySelector('form'); return !!f && Object.keys(f).some(k => k.startsWith('__react')); })()`)) break; await dormir(500); }
  await ev(`(() => { const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set(document.querySelector('input[type=email], input[name=correo]'), ${JSON.stringify(TIENDA_CORREO)}); set(document.querySelector('input[type=password]'), ${JSON.stringify(TIENDA_CLAVE)}); })()`);
  await dormir(500); await ev(`(() => { const b = [...document.querySelectorAll('form button')].find(b => /entrar/i.test(b.textContent) && b.type !== 'button'); b?.click(); })()`); await dormir(6000);
}
if (process.env.BOLSA) {
  const cat = base + "/catalogo?sede=lima";
  for (const n of ["Blusa Emma", "Casaca Ximena"]) {
    await cmd("Page.navigate", { url: cat }); await dormir(4500);
    const href = await ev(`[...document.querySelectorAll('a.t-card-nom')].find(a => a.textContent.includes(${JSON.stringify(n)}))?.getAttribute('href') ?? null`);
    await cmd("Page.navigate", { url: new URL(href, cat).href }); await dormir(4500);
    await ev(`(() => { const b = document.querySelector('.t-tallas .t-talla:not([data-agotada])'); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); })()`); await dormir(500);
    await ev(`(() => { const b = [...document.querySelectorAll('.t-pdp-cta .t-btn, .t-pdp-barra .t-btn')].find(b => b.offsetParent && /agregar/i.test(b.textContent)); b?.click(); })()`); await dormir(2500);
  }
}
const fichaId = process.env.FICHA || "c74b6498-ff93-4dfe-b1a0-380581b8cfc0";
for (const tema of temas) for (const w of anchos) for (const rr of rutas) {
  const r = rr === "ficha" ? `/catalogo/${fichaId}?sede=lima` : rr;
  await cmd("Emulation.setDeviceMetricsOverride", { width: +w, height: 900, deviceScaleFactor: 1, mobile: +w < 700 });
  await cmd("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: tema === "oscuro" ? "dark" : "light" }, { name: "pointer", value: +w < 700 ? "coarse" : "fine" }] }).catch(() => {});
  await cmd("Page.navigate", { url: base + r }); await dormir(4200);
  await ev(`(async()=>{ const h=document.documentElement.scrollHeight; for(let y=0;y<h;y+=500){window.scrollTo(0,y); await new Promise(r=>setTimeout(r,50));} window.scrollTo(0,0); await new Promise(r=>setTimeout(r,500)); })()`);
  const desborde = await ev(`document.documentElement.scrollWidth - innerWidth`);
  const quien = desborde > 0 ? await ev(`[...document.body.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && e.getClientRects().length).slice(0, 4).map(e => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' →' + Math.round(e.getBoundingClientRect().right)).join(' ; ')`) : "";
  const m = process.env.SOLO_DESBORDE ? null : await ev(medidor);
  const f = m?.fallasPorComprobacion || {};
  const resumen = m?.error ? m.error : Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(" ");
  console.log(`${tema.padEnd(6)} ${String(w).padStart(4)} ${rr.padEnd(22)} desborde=${desborde}${quien ? " [" + quien + "]" : ""}  ${resumen || "limpio"}`);
  appendFileSync(join(salida, "detalle.jsonl"), JSON.stringify({ tema, ancho: +w, ruta: rr, desborde, quien, fallas: f, detalle: m?.detalle }) + "\n");
}
if (errs.length) console.log("errores de página:", [...new Set(errs)].slice(0, 5));
chrome.kill(); process.exit(0);

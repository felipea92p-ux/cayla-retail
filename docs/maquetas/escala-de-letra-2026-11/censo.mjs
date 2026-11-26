// Censo de solo lectura, solo local: en cada pantalla, cuánto texto hay, de qué tamaño, y cuáles son los bloques más largos y más chicos.
// Uso: node docs/maquetas/escala-de-letra-2026-11/censo.mjs "$PWD" http://localhost:3010 <carpeta-donde-dejar-censo-letra.json>
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
const [raiz, base, salida] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(path.join(raiz, "apps/web/node_modules/playwright/index.mjs")).href);
const sesion = JSON.parse(readFileSync(path.join(raiz, "apps/web/tema/.sesion/felipe@cayla.local.json"), "utf8"));
const rutas = ["/", "/inventario", "/inventario/movimientos", "/inventario/traslados", "/inventario/conteo", "/recibir", "/vender", "/vender/apartados", "/vender/historial", "/vender/reportes", "/caja", "/cambios", "/devoluciones", "/productos", "/productos/campanas", "/productos/atributos", "/compras", "/compras/plan", "/compras/proveedores", "/finanzas/resumen", "/finanzas/gastos", "/finanzas/dinero", "/finanzas/reportes", "/gestion/analisis", "/gestion/frescura", "/gestion/plan-del-piso", "/rendimiento", "/clientas", "/clientas/beneficios", "/tienda-web", "/tienda-web/pedidos"];
const medir = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05; };
  const limpio = (t) => t.replace(/\s+/g, " ").trim();
  const propio = new Map();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode()); ) {
    const t = limpio(n.textContent); if (!t) continue;
    const e = n.parentElement; if (!e || !vis(e) || e.closest('script,style,[aria-hidden="true"],.sr-only,nextjs-portal')) continue;
    propio.set(e, limpio((propio.get(e) || "") + " " + t));
  }
  const enMenu = (e) => !!e.closest(".marco-riel");
  const r = { textos: 0, palabras: 0, palabrasFueraDelMenu: 0, bajo11: 0, de11: 0, de12: 0, de13: 0, de14oMas: 0, chicos: [], largos: [] };
  for (const [e, t] of propio) {
    const f = Math.round(parseFloat(getComputedStyle(e).fontSize) * 10) / 10, p = t.split(" ").length;
    r.textos++; r.palabras += p; if (!enMenu(e)) r.palabrasFueraDelMenu += p;
    if (f < 11) r.bajo11++; else if (f < 12) r.de11++; else if (f < 13) r.de12++; else if (f < 14) r.de13++; else r.de14oMas++;
    if (f < 12 && !enMenu(e)) r.chicos.push([f, t.slice(0, 70)]);
  }
  // Los bloques de lectura: el elemento más hondo que junta 12 palabras o más.
  for (const e of document.querySelectorAll("main p, main li, main div, main span, main td, main label, [role=dialog] p, [role=dialog] div")) {
    if (!vis(e)) continue;
    const t = limpio(e.innerText || ""); const p = t ? t.split(" ").length : 0;
    if (p < 12 || p > 90) continue;
    if ([...e.children].some((h) => limpio(h.innerText || "").split(" ").length >= 12)) continue;
    if (e.querySelector("button, a, input, table")) continue;
    r.largos.push([p, Math.round(parseFloat(getComputedStyle(e).fontSize) * 10) / 10, t.slice(0, 220)]);
  }
  r.chicos.sort((a, b) => a[0] - b[0]); r.largos.sort((a, b) => b[0] - a[0]);
  return r;
};
const n = await chromium.launch();
const c = await n.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: sesion.cookies, origins: [] } });
const p = await c.newPage();
const filas = [];
for (const ruta of rutas) {
  try {
    await p.goto(base + ruta, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(5500);
    if (p.url().includes("/login")) { console.log("SIN SESION"); process.exit(3); }
    const m = await p.evaluate(medir);
    filas.push({ ruta, llego: new URL(p.url()).pathname, ...m });
    console.log(ruta.padEnd(26), `textos ${String(m.textos).padStart(4)} · palabras ${String(m.palabrasFueraDelMenu).padStart(4)} · <11px ${String(m.bajo11).padStart(3)} · 11 ${String(m.de11).padStart(3)} · 12 ${String(m.de12).padStart(3)} · 13 ${String(m.de13).padStart(3)} · ≥14 ${String(m.de14oMas).padStart(3)} · bloques≥12 pal. ${m.largos.length}`);
  } catch (e) { console.log(ruta, "ERROR", String(e).slice(0, 100)); }
}
await n.close();
writeFileSync(path.join(salida, "censo-letra.json"), JSON.stringify(filas, null, 1));
const t = filas.reduce((a, f) => ({ textos: a.textos + f.textos, bajo11: a.bajo11 + f.bajo11, de11: a.de11 + f.de11, de12: a.de12 + f.de12, de13: a.de13 + f.de13, de14oMas: a.de14oMas + f.de14oMas, largos: a.largos + f.largos.length, palabras: a.palabras + f.palabrasFueraDelMenu }), { textos: 0, bajo11: 0, de11: 0, de12: 0, de13: 0, de14oMas: 0, largos: 0, palabras: 0 });
console.log("TOTAL", JSON.stringify(t), "pantallas:", filas.length);

// Los globitos con número de HOY en su pantalla (ronda 15). Solo mira.
//   B=http://localhost:<puerto> node unificar/.salida/elegir-ronda15/fotos-globitos.mjs   (desde apps/web) → img/globo-NN-<pie>.png
import { chromium } from "playwright";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
const B = process.env.B ?? "http://localhost:3110";
const OUT = "unificar/.salida/elegir-ronda15/img";
const FOTOS = [
  ["admin", "/devoluciones", "Devoluciones, las pestañas", ".pestana-cayla__cuenta", 560, 120],
  ["admin", "/gestion/frescura", "Frescura, un título", ".titulo-cuenta", 520, 120],
  ["admin", "/compras/plan", "Plan de compra, los avisos", "span.bg-rojo.rounded-full", 240, 120],
  ["admin", "/inventario", "Existencias, Pendientes", "button:has-text('pendientes'), button:has-text('Pendientes')", 200, 120],
  ["admin", "/", "El menú", "aside .bg-ambar.rounded-full", 250, 140],
  ["terminal-ventas", "/vender", "Vender, la bolsa", "text=Ticket actual", 300, 120],
];
const nav = await chromium.launch();
const ctxs = new Map();
const ctxDe = async (c) => { if (!ctxs.has(c)) ctxs.set(c, await abrirContexto(nav, porClave(c), { baseUrl: B, tema: "claro", viewport: { width: 1440, height: 900 }, escala: 2 })); return ctxs.get(c); };
let i = 0;
for (const [c, ruta, pie, sel, min, alto] of FOTOS) {
  i++;
  const p = await (await ctxDe(c)).newPage();
  try {
    await p.goto(B + ruta, { waitUntil: "domcontentloaded", timeout: 90000 });
    await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(3000);
    const el = p.locator(sel).first();
    await el.waitFor({ state: "visible", timeout: 8000 });
    await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
    const r = await el.evaluate((n, m) => { let a = n; while (a.parentElement && a.getBoundingClientRect().width < m) a = a.parentElement; const b = a.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }, min);
    const clip = { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: Math.min(r.width + 24, 1440), height: Math.min(r.height + 24, alto) };
    const nombre = `globo-${String(i).padStart(2, "0")}-${pie.replace(/[,«»]/g, "").replace(/\s+/g, "_")}.png`;
    await p.screenshot({ path: `${OUT}/${nombre}`, clip });
    console.log("ok", nombre);
  } catch (e) { console.log("FALLA", ruta, String(e.message).split("\n")[0]); }
  await p.close();
}
for (const x of ctxs.values()) await x.close();
await nav.close();

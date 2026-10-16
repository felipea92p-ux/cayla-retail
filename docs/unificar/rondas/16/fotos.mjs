// Ronda 16: fotos de HOY y de las propuestas aplicadas EN VIVO (solo cambia el dibujo; no guarda nada).
//   B=http://localhost:<puerto> node unificar/.salida/elegir-ronda16/fotos.mjs   (desde apps/web) → img/<pregunta>-<opcion>-NN-<pie>.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
const B = process.env.B ?? "http://localhost:3110";
const OUT = process.env.OUT ?? "unificar/.salida/elegir-ronda16/img";
mkdirSync(OUT, { recursive: true });
// El marco: el lateral y la cabecera. P1 = trazo 2 y tamaños de la escala; P2 = trazo 1,5 (el de hoy) y tamaños de la escala.
const ESCALA_MARCO = () => {
  for (const s of document.querySelectorAll('aside svg[viewBox="0 0 24 24"], header svg[viewBox="0 0 24 24"]')) {
    if (s.closest("main")) continue;
    const w = Math.round(s.getBoundingClientRect().width);
    const n = w === 22 ? 20 : w === 18 ? (s.closest("a, nav li, [role=menuitem]") ? 20 : 16) : null;
    if (n) { s.style.width = n + "px"; s.style.height = n + "px"; }
  }
};
// Solo los íconos del marco (24 × 24): el colibrí del logo es la marca y no se toca.
const TRAZO_MARCO = (g) => `aside svg[viewBox="0 0 24 24"]:not(main *), header svg[viewBox="0 0 24 24"]:not(main *) { stroke-width: ${g} !important; }`;
const FOTOS = [
  // [pregunta, opción, cuenta, ruta, ancho, selector del recorte, alto, css, js]
  ["marco", "A", "admin", "/", 1440, "aside", 640, null, null],
  ["marco", "P1", "admin", "/", 1440, "aside", 640, TRAZO_MARCO(2), ESCALA_MARCO],
  ["marco", "P2", "admin", "/", 1440, "aside", 640, null, ESCALA_MARCO],
  ["marco", "A", "admin", "/", 1440, "header", 70, null, null],
  ["marco", "P1", "admin", "/", 1440, "header", 70, TRAZO_MARCO(2), ESCALA_MARCO],
  ["marco", "P2", "admin", "/", 1440, "header", 70, null, ESCALA_MARCO],
  ["pildora", "A", "admin", "/colaboradores", 1440, "text=/^Sin (módulos|uso)$/", 300, null, null, /^Roles y accesos/i],
  ["pildora", "A", "admin", "/inventario", 1440, "text=/^\\d+ dañadas?$/", 280, null, null, /^Dañadas/i],
  ["pildora", "A", "admin", "/vender/apartados", 1440, "text=de fábrica", 300, null, null, null],
  ["cierres", "A", "admin", "/caja", 1440, "text=Cómo cerró cada día", 420, null, null, /^Historial de cierres/i],
];
const nav = await chromium.launch();
const ctxs = new Map();
const ctxDe = async (c, w) => { const k = c + w; if (!ctxs.has(k)) ctxs.set(k, await abrirContexto(nav, porClave(c), { baseUrl: B, tema: "claro", viewport: { width: w, height: 900 }, escala: 2 })); return ctxs.get(k); };
let i = 0;
for (const [preg, op, cuenta, ruta, ancho, sel, alto, css, js, abrir] of FOTOS) {
  i++;
  const p = await (await ctxDe(cuenta, ancho)).newPage();
  try {
    await p.goto(B + ruta, { waitUntil: "domcontentloaded", timeout: 90000 });
    await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(3000);
    if (abrir) { await p.getByRole("button", { name: abrir }).first().click(); await p.waitForTimeout(4500); }
    if (css) await p.addStyleTag({ content: css });
    if (js) await p.evaluate(js);
    await p.waitForTimeout(300);
    const el = p.locator(sel).first();
    await el.waitFor({ state: "visible", timeout: 10000 });
    await el.scrollIntoViewIfNeeded();
    const r = await el.evaluate((n, min) => { let a = n; while (a.parentElement && a.getBoundingClientRect().width < min) a = a.parentElement; const b = a.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }, sel === "aside" || sel === "header" ? 0 : 520);
    const clip = { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: Math.min(r.width + 16, 1440), height: Math.min(r.height + 16, alto) };
    const nombre = `${preg}-${op}-${String(i).padStart(2, "0")}-${sel.replace(/[^a-zA-Záéíóúñ]+/g, "_").slice(0, 24)}.png`;
    await p.screenshot({ path: `${OUT}/${nombre}`, clip });
    console.log("ok", nombre);
  } catch (e) { console.log("FALLA", ruta, sel, String(e.message).split("\n")[0]); }
  await p.close();
}
for (const c of ctxs.values()) await c.close();
await nav.close();

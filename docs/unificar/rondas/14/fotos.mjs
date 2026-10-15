// Fotos de los gráficos de HOY en su pantalla real (la lámina «Existe hoy» de la ronda 14). Solo mira: abre escenarios del auditor.
//   B=http://localhost:<puerto del ERP> node unificar/.salida/elegir-ronda14/fotos.mjs   (desde apps/web) → img/<prefijo>-NN-<pie>.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
import { ESCENARIOS } from "../../../tema/escenarios/registro.mjs";
const B = process.env.B ?? "http://localhost:3110";
const OUT = process.env.OUT ?? "unificar/.salida/elegir-ronda14/img";
mkdirSync(OUT, { recursive: true });
// [prefijo, cuenta, ruta o escenario (`esc:<id>`), selector, pie, ancho mínimo del contenedor]
const FOTOS = process.env.DESPUES ? [
  ["barras", "admin", "/compras/por-pagar", '[data-guia="por-pagar.salidas"]', "Por pagar salidas", 600],
  ["barras", "admin", "esc:proveedores.vista", '[role="dialog"] .barras-tiempo', "Vista rapida proveedor", 380],
  ["barras", "admin", "/vender/historial", ".barras-tiempo", "Historial pulso", 300],
  ["escala", "admin", "/compras/proveedores", ".barra-apilada", "Proveedores deuda", 700],
  ["linea", "admin", "/rendimiento", '[data-guia="rendimiento.grafico"]', "Rendimiento grafico", 600],
] : [
  ["linea", "admin", "/compras/proveedores", "svg.trazo-al-pasar, .trazo-al-pasar", "Proveedores, la mini tendencia de cada fila", 700],
  ["linea", "admin", "esc:proveedores.ficha", 'svg[aria-label^="Costo de"]', "La ficha de un proveedor, la evolución del costo", 500],
  ["linea", "admin", "/vender/historial", 'svg[aria-label^="Ventas "]', "Historial, el pulso de las ventas", 500],
  ["linea", "admin", "/rendimiento", '[data-guia="rendimiento.grafico"]', "Rendimiento, ventas contra la meta", 600],
  ["barras", "admin", "esc:proveedores.vista", '[role="dialog"] .anim-crece-y', "La vista rápida de un proveedor, lo facturado por mes", 360],
  ["barras", "admin", "/rendimiento", '[data-guia="rendimiento.por-hora"]', "Rendimiento, ventas por hora", 500],
  ["barras", "admin", "/comercial", '[aria-label="Ventas por hora del día de hoy"]', "Comercial, ventas por hora", 500],
  ["barras", "admin", "/compras/por-pagar", '[data-guia="por-pagar.salidas"]', "Por pagar, los pagos que vencen", 600],
  ["barras", "admin", "/vender/comprobantes", ".kpi-tramos", "Comprobantes, facturado por hora", 300],
  ["barras", "admin", "/caja/historial", '[aria-label^="Ventas por hora."]', "El cierre de una caja, ventas por hora", 500],
  ["escala", "admin", "/compras/proveedores", 'span[title^="Vencido"], span[title="Nada vencido"]', "Proveedores, la deuda a escala del mayor", 700],
  ["dona", "admin", "/caja/historial", '[aria-label^="Total cobrado"]', "El cierre de una caja, lo cobrado por medio", 500],
];
const nav = await chromium.launch();
const contextos = new Map();
const cuenta = async (c) => {
  if (!contextos.has(c)) contextos.set(c, await abrirContexto(nav, porClave(c), { baseUrl: B, tema: "claro", viewport: { width: 1440, height: 900 } }));
  return contextos.get(c);
};
const n = {};
for (const [pref, c, donde, sel, pie, minimo] of FOTOS) {
  const p = await (await cuenta(c)).newPage();
  try {
    const esc = donde.startsWith("esc:") ? ESCENARIOS.find((e) => e.id === donde.slice(4)) : null;
    await p.goto(B + (esc ? esc.ruta.replace(/\[.*?\]/g, "x") : donde), { waitUntil: "domcontentloaded" });
    await p.waitForLoadState("networkidle").catch(() => {});
    await p.waitForTimeout(2200);
    if (esc?.preparar) { await esc.preparar(p); await p.waitForTimeout(2000); }
    const el = p.locator(sel).first();
    await el.waitFor({ state: "visible", timeout: 8000 });
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(1800);
    const r = await el.evaluate((nodo, min) => {
      let a = nodo;
      while (a.parentElement && a.getBoundingClientRect().width < min) a = a.parentElement;
      const b = a.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 520) };
    }, minimo);
    n[pref] = (n[pref] ?? 0) + 1;
    const nombre = `${pref}-${String(n[pref]).padStart(2, "0")}-${pie.replace(/[«»:()/.,]/g, "").replace(/\s+/g, "_")}.png`;
    await p.screenshot({ path: `${OUT}/${nombre}`, clip: { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: Math.min(r.width + 32, 1440), height: Math.min(r.height + 32, 900) } });
    console.log("ok", nombre);
  } catch (e) {
    console.log("FALLA", pref, donde, String(e.message).split("\n")[0]);
  }
  await p.close();
}
for (const ctx of contextos.values()) await ctx.close();
await nav.close();

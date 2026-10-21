// Fotos de las piezas de HOY en su pantalla real, con algo de contexto alrededor (la lámina «Existe hoy» de la ronda 13). Solo mira.
//   B=http://localhost:<puerto del ERP> node unificar/.salida/elegir-ronda13/fotos.mjs   (desde apps/web) → img/<prefijo>-NN-<pie>.png
import { chromium } from "playwright";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
const B = process.env.B ?? "http://localhost:3110";
const OUT = process.env.OUT ?? "unificar/.salida/elegir-ronda13/img";
const TEMA = process.env.TEMA ?? "claro";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });
// [prefijo, cuenta, ruta, selector, pie, contexto en px alrededor, ancho mínimo]
const FOTOS = process.env.DESPUES ? [
  ["avance", "admin", "/compras/por-pagar", 'span[title$="% pagado"]', "Por pagar fila", 30, 900],
  ["avance", "admin", "/compras", ".barra-avance", "Compras fila", 30, 900],
  ["avance", "admin", "/colaboradores?vista=roles", ".barra-avance", "Roles tarjeta", 20, 380],
  ["avance", "admin", "/recibir?vista=recibidas", ".barra-avance", "Recibidas fila", 30, 900],
  ["avance", "admin", "/inventario/conteo", ".barra-avance", "Conteo", 30, 700],
  ["anillo", "admin", "/inventario", ".anillo", "Existencias anillo", 30, 360],
  ["copiar", "admin", "/productos", ".copiar-boton", "Productos copiar enlace", 30, 700],
  ["menu", "admin", "/inventario", '[data-guia="existencias.mas"]', "Existencias Mas", 30, 380],
  ["menu", "admin", "/clientas", '[data-guia="clientas.mas"]', "Clientes Mas", 30, 520],
  ["menu", "admin", "/inventario/movimientos", '[data-guia="movimientos.menu"]', "Movimientos Mas", 30, 520],
  ["menu", "admin", "/colaboradores?vista=roles", 'button[aria-label^="Más acciones de"]', "Roles puntos", 30, 520],
] : [
  ["avance", "admin", "/caja", '[data-guia="caja.meta"]', "Caja abierta: la meta de hoy (12 px)", 0, 0],
  ["avance", "admin", "/rendimiento", '[role="progressbar"]', "Rendimiento: vendido contra la meta (6 px)", 40, 520],
  ["avance", "admin", "/compras/por-pagar", 'span[title$="% pagado"]', "Por pagar: lo pagado de cada factura (3 px)", 30, 520],
  ["avance", "admin", "/vender", "span.h-1\\.5.w-16", "Vender: la venta de cada tienda contra su meta", 30, 420],
  ["anillo", "integrante", "/", ".size-\\[150px\\]", "Inicio: Mi meta (150 px)", 30, 420],
  ["anillo", "admin", "/inventario", 'button[title^="Lo de hoy"]', "Existencias: lo de hoy (32 px)", 30, 360],
  ["copiar", "admin", "/productos", 'button[aria-label="Copiar enlace de esta lista"]', "Productos: «Copiar enlace»", 40, 420],
  ["copiar", "admin", "/inventario", '[data-guia="existencias.copiar-enlace"]', "Existencias: el eslabón solo", 40, 420],
  ["menu", "admin", "/clientas", '[data-guia="clientas.mas"]', "Clientes: «Más ▾»", 30, 520],
  ["menu", "admin", "/colaboradores", 'button[aria-label^="Más acciones de"]', "Roles: el «⋯» de 36 px", 40, 520],
  ["menu", "admin", "/vender/comprobantes", '[data-guia="comprobantes.opciones"]', "Facturación: «⋯ Opciones»", 30, 520],
  ["menu", "admin", "/inventario", '[data-guia="existencias.mas"]', "Existencias: «Más ▾» en el pie de una tarjeta", 30, 420],
];
const nav = await chromium.launch();
const contextos = new Map();
const cuenta = async (c) => {
  if (!contextos.has(c)) contextos.set(c, await abrirContexto(nav, porClave(c), { baseUrl: B, tema: TEMA, viewport: { width: Number(process.env.ANCHO ?? 1440), height: 900 } }));
  return contextos.get(c);
};
const n = {};
for (const [pref, c, ruta, sel, pie, aire, minimo] of FOTOS) {
  const p = await (await cuenta(c)).newPage();
  try {
    await p.goto(B + ruta, { waitUntil: "domcontentloaded" });
    await p.waitForLoadState("networkidle").catch(() => {});
    await p.waitForTimeout(2200);
    const el = p.locator(sel).first();
    await el.waitFor({ state: "visible", timeout: 8000 });
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(1500);
    // Sube hasta el contenedor que ya tiene el ancho pedido (la fila, la tarjeta): la pieza se ve con lo que la rodea.
    const r = await el.evaluate((n, min) => {
      let a = n;
      while (a.parentElement && a.getBoundingClientRect().width < min) a = a.parentElement;
      const b = a.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 380) };
    }, minimo);
    const w = Math.min(1440, r.width + aire * 2), h = r.height + aire * 2;
    const x = Math.max(0, r.x - aire), y = Math.max(0, r.y - aire);
    n[pref] = (n[pref] ?? 0) + 1;
    const nombre = `${pref}-${String(n[pref]).padStart(2, "0")}-${pie.replace(/[«»:()/.]/g, "").replace(/\s+/g, "_")}.png`;
    await p.screenshot({ path: `${OUT}/${nombre}`, clip: { x, y, width: Math.min(w, 1440 - x), height: Math.min(h, 900) } });
    console.log("ok", nombre);
  } catch (e) {
    console.log("FALLA", pref, ruta, String(e.message).split("\n")[0]);
  }
  await p.close();
}
for (const ctx of contextos.values()) await ctx.close();
await nav.close();

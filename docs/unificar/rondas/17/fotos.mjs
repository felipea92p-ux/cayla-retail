// Ronda 17: fotos de HOY y de las propuestas aplicadas EN VIVO sobre la pantalla real (solo cambia el dibujo; no guarda nada).
//   B=http://localhost:<puerto> PRODUCTO=<id de un producto con stock> MOVIMIENTO=<id de un movimiento> node unificar/.salida/elegir-ronda17/fotos.mjs [prefijo]   (desde apps/web)
//   → img/<pregunta>-<opcion>-NN-<ruta>.png
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
import * as P from "./piezas.mjs";

const B = process.env.B ?? "http://localhost:3110";
const OUT = process.env.OUT ?? "unificar/.salida/elegir-ronda17/img";
const PRODUCTO = process.env.PRODUCTO ?? "";
const MOVIMIENTO = process.env.MOVIMIENTO ?? ""; // el cajón de Movimientos se abre por su URL (`?mov=`): el clic en la fila navega
const SOLO = process.argv[2] ?? "";
const CSS17 = readFileSync(new URL("./demo17.css", import.meta.url), "utf8");
mkdirSync(OUT, { recursive: true });

// --- cómo se llega a cada pieza (nada de esto guarda: solo abre, busca y elige en la pantalla) ---
const clicBoton = (nombre) => async (p) => { await p.getByRole("button", { name: nombre }).first().click(); await p.waitForTimeout(3500); };
const clicFila = (sel) => async (p) => { await p.locator(sel).first().click({ force: true }); await p.waitForTimeout(7000); };
const abrirSeccion = (guia) => async (p) => { await p.locator(`[data-guia="${guia}"] button[aria-expanded="false"]`).first().click(); await p.waitForTimeout(1500); };
const guiaPaso2 = async (p) => {
  await p.getByRole("button", { name: /^Guía de impresión/i }).first().click();
  await p.waitForTimeout(2500);
  await p.getByRole("button", { name: /^Siguiente/ }).first().click();
  await p.waitForTimeout(900);
};
/** Escribe en un buscador y elige la primera sugerencia (agrega la prenda a la lista de la pantalla, sin guardar). */
const agregar = (campo, texto = "blusa", opcion = "[role=option]") => async (p) => {
  await p.locator(campo).first().click();
  await p.keyboard.type(texto, { delay: 40 });
  await p.waitForTimeout(2000);
  await p.locator(opcion).first().click();
  await p.waitForTimeout(1800);
};

// --- lo que se aplica en vivo (corre en la página) ---
const reemplazar = (sel, html) => [([s, h]) => { const el = document.querySelector(s); if (!el) throw new Error("no está " + s); el.outerHTML = h; }, [sel, html]];
/** Cambia cada paso de cantidad (desde su botón «−») por la propuesta: sube hasta la caja que también tiene el «+». */
const cambiarPasos = (selMenos, html) => [
  ([s, h]) => {
    const botones = [...document.querySelectorAll(s)];
    if (!botones.length) throw new Error("no está " + s);
    for (const b of botones) {
      let c = b.parentElement;
      while (c && c.querySelectorAll("button").length < 2) c = c.parentElement;
      if (c) c.outerHTML = h;
    }
  },
  [selMenos, html],
];
const SELECTOR_MES_HOY = 'div:has(> button[aria-label^="Ir a"])';
const PIE_GUIA = '[role=dialog] div.border-t:has(> button.btn-primario)';
const ETIQUETAS = `/etiquetas-de-precio?producto=${PRODUCTO}`;
const EDITAR = `/productos/${PRODUCTO}/editar`;

const FOTOS = [
  // [pregunta, opción, cuenta, ruta, ancho, abrir, selector del recorte, alto, aplicar, minimo]
  // 1 · Elegir el mes
  ["mes", "A", "admin", "/caja", 1440, clicBoton(/^Historial de cierres/i), SELECTOR_MES_HOY, 360, null, 560],
  ["mes", "A", "admin", "/vender/comprobantes/emitidos", 1440, null, '[data-guia="comprobantes.mes"]', 300, null, 760],
  ["mes", "A", "admin", "/finanzas/reportes/presupuesto", 1440, null, ".fin-mes-chico", 300, null, 760],
  ["mes", "P1", "admin", "/vender/comprobantes/emitidos", 1440, null, '[data-guia="comprobantes.mes"]', 300, reemplazar('[data-guia="comprobantes.mes"]', P.mesP1("Octubre 2026", { guia: "comprobantes.mes" })), 760],
  ["mes", "P2", "admin", "/caja", 1440, clicBoton(/^Historial de cierres/i), SELECTOR_MES_HOY, 360, reemplazar(SELECTOR_MES_HOY, P.mesP2("Septiembre", "Octubre 2026", null)), 560],
  ["mes", "P2", "admin", "/vender/comprobantes/emitidos", 1440, null, '[data-guia="comprobantes.mes"]', 300, reemplazar('[data-guia="comprobantes.mes"]', P.mesP2("Septiembre", "Octubre 2026", null, { guia: "comprobantes.mes" })), 760],
  // 2 · El cajón lateral (las tres caras de hoy)
  ["cajon", "A", "admin", "/compras/por-pagar", 1440, clicFila("main [role=row].cursor-pointer"), "[role=dialog]", 900, null, 0],
  ["cajon", "A", "admin", `/inventario/movimientos?mov=${MOVIMIENTO}`, 1440, null, "[role=dialog]", 900, null, 0],
  ["cajon", "A", "admin", "/colaboradores", 1440, clicFila("main li button"), "[role=dialog]", 900, null, 0],
  // 3 · El paso de cantidad: hoy y cada propuesta en su tamaño
  ["paso", "A", "admin", "/vender", 1440, agregar("main [role=combobox]"), 'button[aria-label="Reducir cantidad"]', 220, null, 420],
  ["paso", "P1", "admin", "/vender", 1440, agregar("main [role=combobox]"), 'button[aria-label="Reducir cantidad"]', 220, cambiarPasos('button[aria-label="Reducir cantidad"]', P.pasoP1(1, "fila")), 420],
  ["paso", "P2", "admin", "/vender", 1440, agregar("main [role=combobox]"), 'button[aria-label="Reducir cantidad"]', 220, cambiarPasos('button[aria-label="Reducir cantidad"]', P.pasoP2(1, "fila")), 420],
  ["paso", "A", "admin", "/inventario/bajar", 1440, agregar("#bajar-escaner", "blusa", '[data-guia="bajar.escaner"] li button'), 'button[aria-label^="Una menos de"]', 220, null, 760],
  ["paso", "P1", "admin", "/inventario/bajar", 1440, agregar("#bajar-escaner", "blusa", '[data-guia="bajar.escaner"] li button'), 'button[aria-label^="Una menos de"]', 220, cambiarPasos('button[aria-label^="Una menos de"]', P.pasoP1(1, "fila")), 760],
  ["paso", "P2", "admin", "/inventario/bajar", 1440, agregar("#bajar-escaner", "blusa", '[data-guia="bajar.escaner"] li button'), 'button[aria-label^="Una menos de"]', 220, cambiarPasos('button[aria-label^="Una menos de"]', P.pasoP2(1, "fila")), 760],
  // 4 · Anterior y siguiente de la guía de impresión
  ["guia", "A", "admin", ETIQUETAS, 1440, guiaPaso2, PIE_GUIA, 200, null, 0],
  ["guia", "P1", "admin", ETIQUETAS, 1440, guiaPaso2, PIE_GUIA, 200, reemplazar(PIE_GUIA, P.pieGuia("P1", 2, 7)), 0],
  ["guia", "P2", "admin", ETIQUETAS, 1440, guiaPaso2, PIE_GUIA, 200, reemplazar(PIE_GUIA, P.pieGuia("P2", 2, 7)), 0],
];

const nav = await chromium.launch();
const ctxs = new Map();
const ctxDe = async (c, w) => {
  const k = c + w;
  if (!ctxs.has(k)) ctxs.set(k, await abrirContexto(nav, porClave(c), { baseUrl: B, tema: "claro", viewport: { width: w, height: 900 }, escala: 2 }));
  return ctxs.get(k);
};
let i = 0;
for (const [preg, op, cuenta, ruta, ancho, abrir, sel, alto, aplicar, minimo] of FOTOS) {
  i++;
  if (SOLO && !preg.startsWith(SOLO)) continue;
  const p = await (await ctxDe(cuenta, ancho)).newPage();
  try {
    await p.goto(B + ruta, { waitUntil: "domcontentloaded", timeout: 90000 });
    await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(3000);
    if (abrir) await abrir(p);
    if (aplicar) {
      await p.addStyleTag({ content: CSS17 });
      await p.evaluate(aplicar[0], aplicar[1]);
      await p.waitForTimeout(700);
    }
    // La propuesta aplicada lleva `data-r17`: el recorte es ella (en los pasos, la fila que la contiene); lo de hoy, el selector.
    const objetivo = p.locator(aplicar ? "[data-r17]" : sel).first();
    await objetivo.waitFor({ state: "visible", timeout: 25000 });
    await objetivo.scrollIntoViewIfNeeded();
    const r = await objetivo.evaluate((n, min) => {
      let a = n;
      while (a.parentElement && a.getBoundingClientRect().width < min) a = a.parentElement;
      const b = a.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    }, minimo ?? 520);
    const clip = { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: Math.min(r.width + 24, ancho - Math.max(0, r.x - 12)), height: Math.min(r.height + 24, alto) };
    const nombre = `${preg}-${op}-${String(i).padStart(2, "0")}-${ruta.split("?")[0].replace(/[0-9a-f-]{36}/, "id").replace(/[^a-zA-Záéíóúñ]+/g, "_").replace(/^_|_$/g, "").slice(0, 28)}.png`;
    await p.screenshot({ path: `${OUT}/${nombre}`, clip });
    console.log("ok", nombre);
  } catch (e) {
    console.log("FALLA", preg, op, ruta, String(e.message).split("\n")[0]);
  }
  await p.close();
}
for (const c of ctxs.values()) await c.close();
await nav.close();

// Ronda 18: la cabecera de hoy y cada propuesta del «?» aplicada EN VIVO sobre la pantalla real (solo cambia el dibujo; no guarda nada).
//   B=http://localhost:<puerto> node unificar/.salida/elegir-ronda18/fotos.mjs [oscuro]   (desde apps/web)
//   → unificar/.salida/elegir-ronda18/img/<pantalla>-<opcion>[-abierto][-375][-oscuro].png
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
import { partes, aplicar } from "./piezas.mjs";

const B = process.env.B ?? "http://localhost:3110";
const OUT = "unificar/.salida/elegir-ronda18/img";
const tema = process.argv[2] === "oscuro" ? "oscuro" : "claro";
const CSS = readFileSync(new URL("./demo18.css", import.meta.url), "utf8") + readFileSync(new URL("./demo18b.css", import.meta.url), "utf8");
const GUION = readFileSync(new URL("./guion.js", import.meta.url), "utf8");
mkdirSync(OUT, { recursive: true });

// [id, ruta, cuenta, anchos]
const PANTALLAS = [
  ["gastos", "/finanzas/gastos", "admin", [1440, 375]],
  ["existencias", "/inventario", "admin", [1440]],
  ["clientes", "/clientas", "admin", [1440]],
  ["movimientos", "/inventario/movimientos", "admin", [1440]],
  ["ordenes", "/compras/ordenes", "admin", [1440]],
  ["cambios", "/cambios", "admin", [1440, 375]],
  ["caja", "/caja", "integrante", [1440]],
  // Frases que dicen un dato, no qué es la pantalla:
  ["categorias", "/productos/categorias", "admin", [1440]],
  ["inicio", "/", "integrante", [1440]],
].filter(([id]) => !process.env.SOLO || process.env.SOLO.split(",").includes(id));
// [opción, abierto]
// VUELTA=2: las tres caras finas de P2 (Felipe eligió P2 + D2 y pidió más elegancia). El abierto se abre con un clic de verdad.
const ESTADOS = process.env.VUELTA === "2"
  ? [["V1", false], ["V1", true], ["V2", false], ["V2", true], ["V3", false], ["V3", true]]
  : [["A", false], ["P1", false], ["P1", true], ["P2", true], ["P3", false], ["P3", true]];

const nav = await chromium.launch();
const ctxs = {};
const ctx = async (c, ancho) =>
  (ctxs[`${c}-${ancho}`] ??= await abrirContexto(nav, porClave(c), { baseUrl: B, tema, viewport: { width: ancho, height: 900 }, escala: 2 }));

for (const [id, ruta, cuenta, anchos] of PANTALLAS) {
  for (const ancho of anchos) {
    const p = await (await ctx(cuenta, ancho)).newPage();
    try {
      await p.goto(B + ruta, { waitUntil: "domcontentloaded", timeout: 60000 });
      await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await p.waitForSelector('header[data-voz="cabecera"] h1', { timeout: 20000 });
      await p.waitForTimeout(2200);
      await p.addStyleTag({ content: CSS });
      await p.addScriptTag({ content: GUION });
      const { titulo, frase } = await p.evaluate(() => {
        const h1 = document.querySelector('header[data-voz="cabecera"] h1');
        const f = h1.nextElementSibling?.tagName === "P" ? h1.nextElementSibling.textContent : "";
        return { titulo: h1.textContent.trim(), frase: f };
      });
      const original = await p.evaluate(() => document.querySelector('header[data-voz="cabecera"]').outerHTML);
      for (const [op, abierto] of ESTADOS) {
        if (ancho === 375 && op === "P3") continue;
        if (ancho === 375 && /^V/.test(op) && !abierto) continue;
        await p.evaluate((h) => { document.querySelector('header[data-voz="cabecera"]').outerHTML = h; }, original);
        const clic = /^V/.test(op) && abierto;
        await p.evaluate(aplicar, [op, abierto && !clic, partes(op, `ayuda-${id}`, titulo, frase, abierto && !clic)]);
        if (clic) await p.locator(".prop-q").first().click();
        await p.mouse.move(ancho - 5, 890);
        await p.waitForTimeout(900);
        const caja = await p.evaluate(() => {
          const r = document.querySelector('header[data-voz="cabecera"]').getBoundingClientRect();
          return { x: r.x, y: r.y + window.scrollY, w: r.width, h: r.height };
        });
        const margen = ancho === 375 ? 16 : 32;
        const bajo = (op === "P2" || /^V/.test(op)) && abierto ? 220 : 120; // un poco de lo que sigue, para ver si la página se mueve o se tapa
        const clip = { x: Math.max(0, caja.x - margen), y: Math.max(0, caja.y - 24), width: Math.min(ancho - Math.max(0, caja.x - margen), caja.w + 2 * margen), height: caja.h + 24 + bajo };
        const nombre = `${id}-${op}${abierto ? "-abierto" : ""}${ancho === 375 ? "-375" : ""}${tema === "oscuro" ? "-oscuro" : ""}.png`;
        await p.screenshot({ path: `${OUT}/${nombre}`, clip });
        console.log("✓", nombre, op === "A" ? `«${frase.slice(0, 60)}»` : "");
      }
    } catch (e) {
      console.log("✗", id, ancho, e.message.split("\n")[0]);
    } finally {
      await p.close();
    }
  }
}
await nav.close();

// Ronda 18: fotos de la pieza YA construida (`AyudaCabecera` en `EncabezadoPagina`), con el globo abierto por un clic de verdad.
//   B=http://localhost:<puerto> node unificar/.salida/elegir-ronda18/despues.mjs   (desde apps/web) → …/elegir-ronda18/despues/*.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";

const B = process.env.B ?? "http://localhost:3110";
const OUT = "unificar/.salida/elegir-ronda18/despues";
mkdirSync(OUT, { recursive: true });
// [id, ruta, cuenta, ancho, tema]
const FOTOS = [
  ["gastos", "/finanzas/gastos", "admin", 1440, "claro"],
  ["gastos-oscuro", "/finanzas/gastos", "admin", 1440, "oscuro"],
  ["productos", "/productos", "admin", 1440, "claro"],
  ["caja", "/caja", "integrante", 1440, "claro"],
  ["cambios-375", "/cambios", "admin", 375, "claro"],
  ["existencias-cerrada", "/inventario", "admin", 1440, "claro"],
];
const nav = await chromium.launch();
for (const [id, ruta, cuenta, ancho, tema] of FOTOS) {
  const ctx = await abrirContexto(nav, porClave(cuenta), { baseUrl: B, tema, viewport: { width: ancho, height: 900 }, escala: 2 });
  const p = await ctx.newPage();
  try {
    await p.goto(B + ruta, { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await p.waitForSelector(".ayuda-cab-q", { timeout: 20000 });
    await p.waitForTimeout(1800);
    if (!id.endsWith("cerrada")) await p.locator(".ayuda-cab-q").first().click();
    await p.mouse.move(ancho - 5, 890);
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const c = document.querySelector('header[data-voz="cabecera"]').getBoundingClientRect();
      const g = document.querySelector(".ayuda-cab-globo")?.getBoundingClientRect();
      return { x: c.x, y: c.y, w: c.width, abajo: Math.max(c.bottom, g?.bottom ?? 0) };
    });
    const m = ancho === 375 ? 16 : 32;
    const x = Math.max(0, r.x - m);
    await p.screenshot({ path: `${OUT}/${id}.png`, clip: { x, y: Math.max(0, r.y - 24), width: Math.min(ancho - x, r.w + 2 * m), height: r.abajo - r.y + 24 + 40 } });
    console.log("✓", id);
  } catch (e) {
    console.log("✗", id, e.message.split("\n")[0]);
  } finally {
    await ctx.close();
  }
}
await nav.close();

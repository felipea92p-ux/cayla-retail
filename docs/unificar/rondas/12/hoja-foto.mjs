// Foto de la hoja que abre un escenario del auditor (cuando terminó de entrar), en claro y oscuro. Uso:
//   B=… node unificar/.salida/elegir-ronda9/hoja-foto.mjs <ancho> <cuenta> <id>…   → despues/hoja-<id>-<ancho>-<tema>.png
import { chromium } from "playwright";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
import { ESCENARIOS } from "../../../tema/escenarios/registro.mjs";
const B = process.env.B ?? "http://localhost:3110";
const [ancho, cuenta, ...ids] = process.argv.slice(2);
const w = Number(ancho);
const nav = await chromium.launch();
for (const tema of ["claro"]) {
  const ctx = await abrirContexto(nav, porClave(cuenta), { baseUrl: B, tema, viewport: { width: w, height: w < 600 ? 812 : 900 }, escala: w < 600 ? 2 : 1 });
  for (const id of ids) {
    const p = await ctx.newPage();
    try {
      const esc = ESCENARIOS.find((e) => e.id === id);
      await p.goto(B + esc.ruta.replace(/\[.*?\]/g, "x"), { waitUntil: "domcontentloaded" });
      await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(1200);
      if (esc.preparar) await esc.preparar(p);
      await p.waitForTimeout(1800);
      const hoja = p.locator(esc.abre ?? '[role="dialog"]').last();
      await hoja.screenshot({ path: `unificar/.salida/elegir-ronda12/img/${process.env.PREFIJO ?? "hoja"}-${String(ids.indexOf(id)).padStart(2,"0")}-${id}-${tema}.png` });
      console.log("ok", tema, id);
    } catch (e) { console.log("FALLA", tema, id, String(e.message).split("\n")[0]); }
    await p.close();
  }
  await ctx.close();
}
await nav.close();

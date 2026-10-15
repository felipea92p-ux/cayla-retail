// Busca una línea con datos en el ERP local: el plan de campaña («Ver la curva») y Rendimiento ▸ Mes. Solo mira.
import { chromium } from "playwright";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
const B = process.env.B ?? "http://localhost:3110";
const OUT = "unificar/.salida/elegir-ronda14/despues";
const nav = await chromium.launch();
const ctx = await abrirContexto(nav, porClave("admin"), { baseUrl: B, tema: "claro", viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
for (const [ruta, pasos, nombre] of [
  ["/compras/plan/resultados", [() => p.getByRole("button", { name: "Ver la curva" }).first().click()], "linea-02-plan-curva"],
  ["/rendimiento", [() => p.getByRole("button", { name: "Mes" }).first().click()], "linea-03-rendimiento-mes"],
]) {
  try {
    await p.goto(B + ruta, { waitUntil: "domcontentloaded" }); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(2500);
    for (const paso of pasos) { await paso(); await p.waitForTimeout(1800); }
    const l = p.locator(".linea-cayla").first();
    await l.waitFor({ state: "visible", timeout: 6000 });
    await l.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
    const r = await l.boundingBox();
    await p.mouse.move(r.x + r.width * 0.35, r.y + r.height * 0.5); await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/${nombre}.png`, clip: { x: Math.max(0, r.x - 30), y: Math.max(0, r.y - 80), width: r.width + 60, height: r.height + 120 } });
    console.log("ok", nombre);
  } catch (e) { console.log("FALLA", ruta, String(e.message).split("\n")[0]); }
}
await nav.close();

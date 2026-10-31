// La ficha de una persona en Colaboradores, abierta con un clic en la primera fila: solo se mira.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
const B = process.env.B ?? "http://localhost:3110";
const OUT = `unificar/.salida/texto-ronda19/colaboradores-${process.env.ETAPA}`; mkdirSync(OUT, { recursive: true });
const nav = await chromium.launch();
for (const ancho of [1440, 375]) {
  const ctx = await abrirContexto(nav, porClave("admin"), { baseUrl: B, tema: "claro", viewport: { width: ancho, height: 900 }, escala: 1 });
  const p = await ctx.newPage();
  await p.goto(B + "/colaboradores", { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(2000);
  await p.addStyleTag({ content: ".guia-oferta{display:none!important}" });
  await p.locator('[data-guia="colaboradores.nombre"]').first().click().catch((e) => console.log("✗", e.message.split("\n")[0]));
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${ancho}_ficha.png` });
  console.log("✓", ancho);
  await ctx.close();
}
await nav.close();

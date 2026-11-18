// La vista rápida de un producto (Catálogo ▸ Productos), abierta con un clic: solo se mira, nada se guarda.
import { chromium } from "playwright";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
const B = process.env.B ?? "http://localhost:3110";
const nav = await chromium.launch();
for (const ancho of [1440, 375]) {
  const ctx = await abrirContexto(nav, porClave("admin"), { baseUrl: B, tema: "claro", viewport: { width: ancho, height: 900 }, escala: 1 });
  const p = await ctx.newPage();
  await p.goto(B + "/clientas", { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(2000);
  await p.addStyleTag({ content: ".guia-oferta{display:none!important}" });
  const fila = p.locator('[data-guia="clientas.fila"]').first();
  await fila.click();
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `unificar/.salida/texto-ronda19/clientes-${process.env.ETAPA}/${ancho}_ficha.png` });
  console.log("✓", ancho);
  await ctx.close();
}
await nav.close();

// Ventas, ronda 19: página entera de cada pantalla a 1440 y a 375 px. Uso: ETAPA=antes|despues node …/fotos-ventas.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
const B = process.env.B ?? "http://localhost:3110";
const ETAPA = process.env.ETAPA ?? "despues";
const OUT = `unificar/.salida/texto-ronda19/${process.env.MODULO ?? "ventas"}-${ETAPA}`; mkdirSync(OUT, { recursive: true });
const RUTAS = process.env.RUTAS ? process.env.RUTAS.split(",") : ["/vender", "/vender/apartados", "/vender/historial", "/cambios", "/devoluciones", "/vender/comprobantes"];
const nav = await chromium.launch();
for (const ancho of [1440, 375]) {
  const ctx = await abrirContexto(nav, porClave(process.env.CUENTA ?? "admin"), { baseUrl: B, tema: "claro", viewport: { width: ancho, height: 900 }, escala: 1 });
  const p = await ctx.newPage();
  for (const ruta of RUTAS) {
    try {
      await p.goto(B + ruta, { waitUntil: "domcontentloaded", timeout: 90000 });
      await p.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(2200);
      await p.addStyleTag({ content: ".guia-oferta{display:none!important}" });
      const horiz = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await p.screenshot({ path: `${OUT}/${ancho}${ruta.replace(/\//g, "_")}.png`, fullPage: true });
      console.log(ancho, ruta, horiz > 0 ? `se corre ${horiz}px al costado` : "ok");
    } catch (e) { console.log(ancho, ruta, "✗", e.message.split("\n")[0]); }
  }
  await ctx.close();
}
await nav.close();

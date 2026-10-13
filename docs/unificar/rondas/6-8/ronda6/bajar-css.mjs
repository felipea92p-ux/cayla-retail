// Baja el CSS real del ERP (y sus fuentes) para que las demos vivas se dibujen igual que la app, aunque el servidor ya no esté.
//   B=http://localhost:<puerto del ERP> node unificar/.salida/elegir-ronda6/bajar-css.mjs   (desde apps/web)
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
const B = process.env.B ?? "http://localhost:3110";
const AQUI = "unificar/.salida/elegir-ronda6";
const nav = await chromium.launch();
const ctx = await abrirContexto(nav, porClave("admin"), { baseUrl: B, tema: "claro", viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage(); await p.goto(B + "/compras", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(4000);
const { css, clase } = await p.evaluate(async () => {
  const hojas = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
  let css = ""; for (const h of hojas) css += await (await fetch(h)).text() + "\n";
  return { css, clase: document.documentElement.className };
});
writeFileSync(`${AQUI}/app.css`, css);
writeFileSync(`${AQUI}/clase.txt`, clase);
// Las fuentes: el CSS las pide en ../media/ (la carpeta .salida/media sirve a todas las rondas)
mkdirSync("unificar/.salida/media", { recursive: true });
for (const f of new Set([...css.matchAll(/url\("?\.\.\/media\/([^")]+)"?\)/g)].map((m) => m[1]))) {
  const r = await fetch(`${B}/_next/static/media/${f}`);
  writeFileSync(`unificar/.salida/media/${f}`, Buffer.from(await r.arrayBuffer()));
}
console.log(css.length, clase);
await nav.close();

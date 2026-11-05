// Captura páginas de la tienda local (3100) a un ancho dado, de punta a punta, con «reducir movimiento» (estado final).
// Uso: node foto-tienda.mjs <carpeta> <ancho> <prefijo> <ruta> [<ruta>...]
import { createRequire } from "node:module";
const require = createRequire(process.env.PW_DESDE + "/");
const { chromium } = require("playwright-core");
const [salida, ancho, prefijo, ...rutas] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: Number(ancho), height: 900 }, reducedMotion: "reduce", deviceScaleFactor: 1 });
for (const r of rutas) {
  const p = await ctx.newPage(); const errores = [];
  p.on("pageerror", (e) => errores.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errores.push(m.text().slice(0, 160)); });
  await p.goto("http://localhost:3100" + r, { waitUntil: "networkidle", timeout: 90000 });
  // Baja hasta el final para que carguen las fotos diferidas, y vuelve arriba.
  const alto = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < alto; y += 700) { await p.evaluate((yy) => scrollTo(0, yy), y); await p.waitForTimeout(120); }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(600);
  const doc = await p.evaluate(() => document.documentElement.scrollWidth);
  const nombre = `${prefijo}_${r.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "raiz"}_${ancho}.png`;
  await p.screenshot({ path: `${salida}/${nombre}`, fullPage: true });
  console.log(nombre, "ancho doc", doc, errores.length ? "ERRORES: " + errores.slice(0, 3).join(" | ") : "");
  await p.close();
}
await b.close();

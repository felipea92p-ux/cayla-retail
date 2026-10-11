// Saca una captura de la maqueta SIN usar el navegador del app (Playwright + el Chrome instalado).
//   node capturar.mjs <actual|a|b|c> <claro|oscuro> <1440|1024|375> <salida.png> [--pagina]
// Por defecto recorta SOLO el diseño (la zona de «Propuesta»); con --pagina captura la página entera con su marco.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const aqui = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(aqui, "../../../apps/web/package.json"));
const { chromium } = require("playwright");
const [diseno = "actual", tema = "claro", vista = "1440", salida = "captura.png", ...resto] = process.argv.slice(2);
const ancho = { 1440: 1500, 1024: 1100, 375: 420 }[vista] ?? 1500;
const navegador = await chromium.launch({ channel: "chrome" });
const pagina = await navegador.newPage({ viewport: { width: ancho, height: 1000 }, deviceScaleFactor: 1 });
const errores = [];
pagina.on("pageerror", (e) => errores.push(String(e)));
const propio = join(aqui, ".tmp", `plan-${diseno}.html`); // la copia armada con `node armar.mjs <id>`; si no existe, la página completa
await pagina.goto(pathToFileURL(existsSync(propio) ? propio : join(aqui, "plan-del-piso.html")).href + `?diseno=${diseno}&tema=${tema}&vista=${vista}`, { waitUntil: "load" });
await pagina.evaluate(() => document.fonts.ready);
await pagina.waitForTimeout(1600);
if (!resto.includes("--pagina")) await pagina.addStyleTag({ content: ".ctl{display:none!important}" }); // la barra negra del spike no es parte del diseño: fuera de las capturas del diseño solo
if (resto.includes("--pagina")) await pagina.screenshot({ path: salida, fullPage: true });
else await (await pagina.$(`.diseno[data-diseno="${diseno}"]`)).screenshot({ path: salida });
await navegador.close();
console.log(errores.length ? `Errores de JS: ${errores.join(" | ")}` : "ok", "→", salida);

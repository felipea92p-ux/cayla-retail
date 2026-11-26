// HERRAMIENTA DE LA MAQUETA — saca las capturas «hoy» y «propuesta» de la maqueta, sin servidor (abre los archivos).
// Uso, desde la raíz del repo y con las dependencias instaladas:   node docs/maquetas/apartados-claro-2026-11/herramientas/capturar.mjs
// Usa el Chrome instalado (el Chromium de Playwright no está descargado en estas máquinas). Deja los PNG en ../capturas/.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MAQUETA = path.resolve(AQUI, "..");
const SALIDA = path.join(MAQUETA, "capturas");
const require = createRequire(path.resolve(AQUI, "../../../../apps/web/package.json"));
const { chromium } = require("playwright");

const PANTALLAS = [
  ["pendientes", "pendientes.html"],
  ["historial-hoy", "historial.html?v=hoy"], ["historial-propuesta", "historial.html"],
  ["entregar-hoy", "entregar-listo.html?v=hoy"], ["entregar-propuesta", "entregar-listo.html"],
  ["apartar-hoy", "apartar-cobro-listo.html?v=hoy"], ["apartar-propuesta", "apartar-cobro-listo.html"],
  ["registrado-hoy", "apartar-registrado.html?v=hoy"], ["registrado-propuesta", "apartar-registrado.html"],
  ["abonar-hoy", "modal-abonar.html?v=hoy"], ["abonar-propuesta", "modal-abonar.html"],
];

fs.mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch({ channel: "chrome", headless: true, timeout: 120000 });
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
pagina.setDefaultTimeout(60000);
for (const [nombre, archivo] of PANTALLAS) {
  await pagina.goto("file://" + path.join(MAQUETA, archivo.split("?")[0]) + (archivo.includes("?") ? "?" + archivo.split("?")[1] : ""));
  await pagina.waitForTimeout(900);
  await pagina.screenshot({ path: path.join(SALIDA, `${nombre}.png`) });
  console.log("ok", nombre);
}
await navegador.close();

// Abre una página de la maqueta con el Chrome del sistema SIN ventana (Playwright), a un ancho dado.
// Uso desde un script propio:
//   import { abrir } from "<esta carpeta>/chrome.mjs";
//   const { pagina, cerrar, errores } = await abrir("opcion-1.html#c=negro", { ancho: 1440, alto: 900 });
//   await pagina.screenshot({ path: "captura.png" });
//   await cerrar();
// El servidor de las maquetas ya corre en http://127.0.0.1:3033/ (carpeta docs/maquetas). Las fotos vienen de tienda.cayla.pe.
import { createRequire } from "node:module";

const RAIZ = new URL("../../../../", import.meta.url).pathname; // la raíz del repo
const require = createRequire(RAIZ + "apps/web/");
const { chromium } = require("playwright");

export const BASE = "http://127.0.0.1:3033/tienda-filtros-2026-10/";

export async function abrir(ruta, { ancho = 1440, alto = 900, movil = false, calma = true, escala = 1 } = {}) {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const ctx = await browser.newContext({
    viewport: { width: ancho, height: alto },
    deviceScaleFactor: escala,
    reducedMotion: calma ? "reduce" : "no-preference",
    hasTouch: movil,
    isMobile: movil,
  });
  const pagina = await ctx.newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push("pageerror: " + String(e)));
  pagina.on("console", (m) => {
    // Las fotos que tardan o fallan no son errores de la maqueta; lo demás sí.
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("console: " + m.text().slice(0, 200));
  });
  await pagina.goto(BASE + ruta, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector(".t-card", { timeout: 20000 });
  return { browser, ctx, pagina, errores, cerrar: () => browser.close() };
}

// Capturas para elegir la escala de letra MIRANDO (lámina index.html de esta carpeta). Solo local.
// Cada opción es el ERP real con una regla inyectada en la página: lleva cada tamaño de letra al escalón de esa opción. No cambia el código.
// Necesita el ERP corriendo y la sesión de prueba que guarda `pnpm --filter web tema:auditar` (apps/web/tema/.sesion/).
// Uso: node docs/maquetas/escala-de-letra-2026-11/capturar.mjs "$PWD" http://localhost:3010 "$PWD/docs/maquetas/escala-de-letra-2026-11/capturas"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const [raiz, base, salida] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(path.join(raiz, "apps/web/node_modules/playwright/index.mjs")).href);
mkdirSync(salida, { recursive: true });
const sesion = JSON.parse(readFileSync(path.join(raiz, "apps/web/tema/.sesion/felipe@cayla.local.json"), "utf8"));

/** Las tres escalas. Los tamaños de exhibición (36 px o más) no se tocan. */
export const ESCALAS = {
  a: [12, 13, 14, 15, 17, 21, 28],
  b: [13, 14, 16, 18, 21, 28],
  c: [14, 16, 18, 21, 24, 32],
};

/** Lleva cada texto al escalón más cercano de la escala (en empate, al mayor) y cuenta lo que cambió y lo que quedó cortado. */
const aplicar = (escala) => {
  const cerca = (v) => (v >= 36 ? v : escala.reduce((m, x) => (Math.abs(x - v) <= Math.abs(m - v) ? x : m), escala[0]));
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const cambios = [];
  let textos = 0;
  for (const e of document.querySelectorAll("body *")) {
    if (e.closest("nextjs-portal") || !vis(e)) continue;
    const propio = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || e.matches("input, textarea");
    if (!propio) continue;
    textos++;
    const f = parseFloat(getComputedStyle(e).fontSize), nuevo = cerca(f);
    if (Math.abs(nuevo - f) > 0.05) cambios.push([e, nuevo]);
  }
  for (const [e, v] of cambios) e.style.fontSize = v + "px";
  let cortados = 0;
  for (const e of document.querySelectorAll("body *")) {
    if (!vis(e) || e.closest("nextjs-portal")) continue;
    const cs = getComputedStyle(e);
    if ((cs.textOverflow === "ellipsis" || cs.overflowX === "hidden") && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) cortados++;
  }
  return { textos, cambiados: cambios.length, cortados };
};
const cortadosHoy = () => {
  let n = 0;
  for (const e of document.querySelectorAll("body *")) {
    const r = e.getBoundingClientRect(); if (!r.width || e.closest("nextjs-portal")) continue;
    const cs = getComputedStyle(e);
    if ((cs.textOverflow === "ellipsis" || cs.overflowX === "hidden") && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())) n++;
  }
  return n;
};
/** «Poco texto»: cambia o quita frases concretas. Cada par es [un trozo de la frase de hoy, la frase nueva o "" para quitarla]. */
const pocoTexto = (pares) => {
  let hechos = 0;
  for (const [buscar, nuevo] of pares) {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode()); ) {
      if (!n.textContent.includes(buscar)) continue;
      const e = n.parentElement;
      if (nuevo === "") e.style.display = "none"; else e.textContent = nuevo;
      hechos++;
      break;
    }
  }
  return hechos;
};

const PANTALLAS = [
  { id: "existencias", ruta: "/inventario", textos: [["El piso de esta tienda nunca se ha cuadrado", "Falta cuadrar el piso"], ["Lo que dice «en almacén» puede estar colgado", "Hasta cuadrarlo, el almacén es aproximado."], ["(provisional)", "de 180 · por cuadrar"]] },
  { id: "hoja", ruta: "/inventario", abrir: true, textos: [["si quieres, el resto del modelo", ""], ["¿No es lo que ves en la tienda?", "¿No coincide con la tienda?"], ["No ahora:", ""], ["poco tiempo en el piso para medir", "Aún sin ventas para medir."], ["De esta talla:", ""]] },
  { id: "compras", ruta: "/compras" },
  { id: "rendimiento", ruta: "/rendimiento", textos: [["todavía no tiene meta: aquí se ve lo vendido", "Lima aún no tiene meta."], ["Sin meta no se inventa cuánto tocaba", "Falta la meta."], ["Hacen falta 3 días con ventas", "Faltan 3 días con ventas."], ["Toca a alguien para verle solo", "Toca a alguien."]] },
  { id: "finanzas", ruta: "/finanzas/resumen", textos: [["Todo lo que vendió con IGV en noviembre", "Lo que vendió, costó y dejó noviembre."], ["Compara con el mismo tramo del mes pasado", "Contra el mismo tramo de octubre."]] },
];

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: sesion.cookies, origins: [] } });
const p = await contexto.newPage();
const jpg = (nombre) => ({ path: path.join(salida, `${nombre}.jpg`), type: "jpeg", quality: 80 });
const notas = {};
const llegar = async (pantalla) => {
  await p.goto(base + pantalla.ruta, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(6500);
  if (p.url().includes("/login")) { console.log("SIN SESION"); process.exit(3); }
  if (pantalla.abrir) {
    await p.evaluate(() => window.scrollTo(0, 380));
    await p.locator('[data-guia="existencias.tallas"] button').nth(1).click();
    await p.waitForSelector(".hoja-serena", { timeout: 15000 });
    await p.waitForTimeout(1500);
  }
};
// Con SOLO=<id> rehace una sola pantalla; con SOLO_TEXTO=1, solo su captura de «poco texto».
for (const pantalla of PANTALLAS.filter((x) => !process.env.SOLO || x.id === process.env.SOLO)) {
  notas[pantalla.id] = {};
  if (!process.env.SOLO_TEXTO) {
    await llegar(pantalla);
    notas[pantalla.id].hoy = { cortados: await p.evaluate(cortadosHoy) };
    await p.screenshot(jpg(`${pantalla.id}-hoy`));
  }
  for (const [clave, escala] of process.env.SOLO_TEXTO ? [] : Object.entries(ESCALAS)) {
    await llegar(pantalla);
    notas[pantalla.id][clave] = await p.evaluate(aplicar, escala);
    await p.waitForTimeout(500);
    await p.screenshot(jpg(`${pantalla.id}-${clave}`));
  }
  if (pantalla.textos) {
    await llegar(pantalla);
    const frases = await p.evaluate(pocoTexto, pantalla.textos);
    notas[pantalla.id].texto = { ...(await p.evaluate(aplicar, ESCALAS.b)), frases };
    await p.waitForTimeout(500);
    await p.screenshot(jpg(`${pantalla.id}-b-texto`));
  }
  console.log(pantalla.id, JSON.stringify(notas[pantalla.id]));
}
await navegador.close();
if (!process.env.SOLO) writeFileSync(path.join(salida, "notas.json"), JSON.stringify(notas, null, 1));

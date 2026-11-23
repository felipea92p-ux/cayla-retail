// Capturas de «antes y después» sobre el ERP LOCAL, para la lámina de las ocho mejoras (index.html de esta carpeta).
// Cada «después» es el ERP real con una regla inyectada en la página: no cambia ni un archivo del repo.
// Solo local: necesita el ERP corriendo y la sesión de prueba que guarda `pnpm --filter web tema:auditar` (apps/web/tema/.sesion/).
// Uso: node docs/maquetas/ocho-mejoras-2026-11/capturar.mjs "$PWD" http://localhost:3010 "$PWD/docs/maquetas/ocho-mejoras-2026-11/capturas"
//      Con SOLO=fotos-cifras rehace solo las de fotos y de cifras.
import { mkdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const [raiz, base, salida] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(path.join(raiz, "apps/web/node_modules/playwright/index.mjs")).href);
mkdirSync(salida, { recursive: true });
const sesion = JSON.parse(readFileSync(path.join(raiz, "apps/web/tema/.sesion/felipe@cayla.local.json"), "utf8"));
const jpg = (nombre) => ({ path: path.join(salida, `${nombre}.jpg`), type: "jpeg", quality: 84 });
const notas = {};

// La letra de las cifras: el archivo de Inter que sirve Google Fonts (una sola fuente variable, bloque «latin»).
const cssInter = await (await fetch("https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap", { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" } })).text();
const urlInter = cssInter.split("/* latin */")[1]?.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
if (!urlInter) throw new Error("No encontré el archivo de Inter");

// ---------- Las reglas que se inyectan ----------
/** 1 · Todas las fotos recortadas. La mayoría ya lo está; las que aún traen fondo claro se detectan mirando sus cuatro esquinas, y
 *  el «después» SIMULA su recorte volviendo transparente el blanco (un filtro SVG). Es una simulación: el recorte real lo hace la foto. */
const recortar = async () => {
  const fotos = [...document.querySelectorAll("main img")].filter((i) => i.naturalWidth > 60);
  let conFondo = 0, sinSaber = 0, k = 0;
  for (const img of fotos) {
    try {
      const bmp = await createImageBitmap(await (await fetch(img.currentSrc, { mode: "cors" })).blob());
      const W = bmp.width, H = bmp.height;
      const cv = new OffscreenCanvas(W, H); const x = cv.getContext("2d"); x.drawImage(bmp, 0, 0);
      const en = (px, py) => x.getImageData(Math.round(px), Math.round(py), 1, 1).data;
      const borde = [en(2, 2), en(W - 3, 2), en(2, H - 3), en(W - 3, H - 3), en(W / 2, 2), en(2, H / 2), en(W - 3, H / 2), en(W / 4, 2), en((3 * W) / 4, 2)];
      if (!borde.every((d) => d[3] > 250 && d[0] > 225 && d[1] > 225 && d[2] > 225)) continue;
      conFondo++;
      // El tono del fondo de ESTA foto: lo más oscuro de su borde. Lo que se le parece se vuelve transparente; lo demás queda.
      const suma = Math.min(...borde.map((d) => (d[0] + d[1] + d[2]) / 255));
      const fuerza = 6, margen = 0.16;
      const id = `quita-fondo-${k++}`;
      document.body.insertAdjacentHTML("beforeend", `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  ${-fuerza} ${-fuerza} ${-fuerza} 0 ${(fuerza * (suma - margen)).toFixed(3)}"/></filter></svg>`);
      img.style.filter = `url(#${id})`;
      img.style.backgroundColor = "transparent";
    } catch { sinSaber++; }
  }
  return { fotosALaVista: fotos.length, conFondo, sinSaber };
};
/** 2 · Las cifras en una letra con ancho fijo: solo los DÍGITOS salen de Inter (unicode-range); las letras siguen en DM Sans. */
const cifras = (url) => {
  const s = document.createElement("style");
  s.textContent = `@font-face{font-family:"Cifras";src:url(${url}) format("woff2");font-weight:100 900;size-adjust:96%;unicode-range:U+0030-0039;}
    :root{--font-sans:"Cifras",var(--font-dm-sans),ui-sans-serif,system-ui,sans-serif;}`;
  document.head.append(s);
  return document.fonts.load('500 16px "Cifras"', "0123456789").then(() => document.fonts.check('500 16px "Cifras"', "0"));
};
/** 4 · Los datos sobre superficie casi sólida: toda tarjeta o tabla translúcida pasa a papel, con una línea fina y una sombra suave. */
const solido = (oscuro) => {
  const linea = oscuro ? "color-mix(in srgb, var(--color-tinta) 11%, transparent)" : "color-mix(in srgb, var(--color-sand) 85%, transparent)";
  const sombra = oscuro ? "0 1px 0 color-mix(in srgb, var(--color-tinta) 5%, transparent) inset" : "0 1px 2px color-mix(in srgb, var(--color-sombra) 5%, transparent), 0 12px 28px -20px color-mix(in srgb, var(--color-sombra) 26%, transparent)";
  const tocadas = new Map();
  for (const e of document.querySelectorAll("main *")) {
    const r = e.getBoundingClientRect();
    if (r.height < 88 || r.width < 180) continue;
    const cs = getComputedStyle(e);
    if (parseFloat(cs.borderTopLeftRadius) < 10 || parseFloat(cs.borderTopLeftRadius) > 60) continue;
    const alfa = (c) => { const m = c.match(/\/\s*([\d.]+)\)|rgba\([^)]*,\s*([\d.]+)\)/); return m ? parseFloat(m[1] ?? m[2]) : c === "rgba(0, 0, 0, 0)" ? 0 : 1; };
    const conDegradado = /gradient/.test(cs.backgroundImage);
    const a = alfa(cs.backgroundColor);
    if (!conDegradado && (a === 0 || a >= 0.97)) continue;
    if (e.matches(".prod-foto, [data-color-dato], img, canvas, svg")) continue;
    e.style.background = "var(--color-papel)";
    e.style.border = `1px solid ${linea}`;
    e.style.boxShadow = sombra;
    e.style.backdropFilter = "none";
    const clave = String(e.className).split(" ").find((c) => /^[a-z]+-[a-z-]+$/.test(c)) ?? e.tagName.toLowerCase();
    tocadas.set(clave, (tocadas.get(clave) || 0) + 1);
  }
  return Object.fromEntries(tocadas);
};
/** 7 · Una escala cerrada: cada tamaño de letra y cada radio se lleva al escalón más cercano. */
const escala = () => {
  const LETRAS = [11, 12, 13, 14, 16, 18, 21, 28, 46];
  const RADIOS = [6, 10, 16, 24];
  const cerca = (v, lista) => lista.reduce((m, x) => (Math.abs(x - v) < Math.abs(m - v) ? x : m), lista[0]);
  const antes = { letras: new Set(), radios: new Set() }, despues = { letras: new Set(), radios: new Set() };
  const cambios = [];
  for (const e of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(e);
    const propio = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const f = parseFloat(cs.fontSize);
    if (propio) { antes.letras.add(f); const nuevo = cerca(f, LETRAS); despues.letras.add(nuevo); if (nuevo !== f) cambios.push([e, "fontSize", nuevo + "px"]); }
    const r = parseFloat(cs.borderTopLeftRadius);
    if (r > 0 && r < 60 && !cs.borderTopLeftRadius.includes("%")) { antes.radios.add(r); const nuevo = cerca(r, RADIOS); despues.radios.add(nuevo); if (nuevo !== r) cambios.push([e, "borderRadius", nuevo + "px"]); }
  }
  for (const [e, k, v] of cambios) e.style[k] = v;
  return { letrasAntes: antes.letras.size, letrasDespues: despues.letras.size, radiosAntes: antes.radios.size, radiosDespues: despues.radios.size };
};

const navegador = await chromium.launch();
const abrir = async (tema, escalaDePixel = 1) => {
  const c = await navegador.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: escalaDePixel, storageState: { cookies: sesion.cookies, origins: [] } });
  await c.addInitScript((t) => localStorage.setItem("cayla-tema", t), tema);
  return c;
};
const ir = async (p, ruta, bajar = 0) => {
  await p.goto(base + ruta, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(7000);
  if (p.url().includes("/login")) { console.log("SIN SESION"); process.exit(3); }
  if (bajar) { await p.evaluate((y) => window.scrollTo(0, y), bajar); await p.waitForTimeout(900); }
};

for (const tema of ["claro", "oscuro"]) {
  const oscuro = tema === "oscuro";
  const c = await abrir(tema);
  const p = await c.newPage();

  for (const [nombre, ruta, bajar] of [["productos", "/productos", 500], ["existencias", "/inventario", 430]]) {
    await ir(p, ruta, bajar);
    await p.screenshot(jpg(`fotos-${nombre}-${tema}-antes`));
    notas[`fotos-${nombre}-${tema}`] = await p.evaluate(recortar);
    await p.waitForTimeout(500);
    await p.screenshot(jpg(`fotos-${nombre}-${tema}-despues`));
  }
  if (process.env.SOLO === "fotos-cifras") { await c.close(); } else {

  for (const [nombre, ruta] of [["compras", "/compras"], ["existencias", "/inventario"]]) {
    await ir(p, ruta);
    await p.screenshot(jpg(`superficies-${nombre}-${tema}-antes`));
    notas[`superficies-${nombre}-${tema}`] = await p.evaluate(solido, oscuro);
    await p.waitForTimeout(400);
    await p.screenshot(jpg(`superficies-${nombre}-${tema}-despues`));
  }

  if (!oscuro) {
    await ir(p, "/inventario");
    await p.screenshot(jpg("escala-claro-antes"));
    notas.escala = await p.evaluate(escala);
    await p.waitForTimeout(500);
    await p.screenshot(jpg("escala-claro-despues"));
  }
  await c.close();
  }

  // Las cifras, de cerca: la tabla de Historial de compras al doble de píxeles.
  const c2 = await abrir(tema, 2);
  const p2 = await c2.newPage();
  await ir(p2, "/compras");
  const recorte = { x: 884, y: 552, width: 516, height: 330 };
  await p2.screenshot({ ...jpg(`cifras-${tema}-antes`), clip: recorte });
  notas[`cifras-${tema}`] = await p2.evaluate(cifras, urlInter);
  await p2.waitForTimeout(700);
  await p2.screenshot({ ...jpg(`cifras-${tema}-despues`), clip: recorte });
  await c2.close();
}
await navegador.close();
console.log(JSON.stringify(notas, null, 1));

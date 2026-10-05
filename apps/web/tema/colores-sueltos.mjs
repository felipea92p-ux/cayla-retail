#!/usr/bin/env node
/**
 * Los colores escritos A MANO en el código (ADR-0336): la única definición de «color suelto». Un hex, un `rgb()`, `bg-white`, un
 * `bg-gray-100`… no cambian con el tema, así que una pantalla que los usa se queda clara dentro del modo oscuro. La interfaz usa
 * SOLO tokens (`bg-papel`, `text-tinta`, `var(--color-…)`).
 *
 * Lo usan dos cosas: `lib/tema-colores.test.ts` (el candado del CI: falla si aparece uno nuevo o si la deuda no baja) y este
 * comando, para ver el tablero:
 *
 *   pnpm --filter web tema:colores            los archivos con colores sueltos y cuántos
 *   pnpm --filter web tema:colores --lineas   además, cada línea
 *
 * Un color suelto legítimo se declara en `lib/tema-colores-archivos.ts` (con su motivo) o, línea a línea, con el comentario
 * `// tema-fijo: <por qué>` (10 caracteres mínimo) en la MISMA línea.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARPETAS = ["app", "components", "lib"];
// `tema.css` ES donde viven los tokens oscuros y los claros del papel fijo: sus hex son la definición, no un uso. El registro de
// excepciones nombra colores en sus motivos (es texto, no código que pinte nada).
const EXCLUIDOS = new Set(["app/estilos/tema.css", "lib/tema-colores-archivos.ts"]);

const PATRONES = [
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b/g, // #rrggbb y #rrggbbaa
  /#(?:fff|000)\b/gi, // los dos atajos que de verdad se escriben
  /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/g, // funciones de color
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|decoration|accent|caret|placeholder)-(?:white|black)(?![\w-])/g,
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|accent|caret|placeholder)-(?:gray|slate|zinc|neutral|stone|red|green|blue|yellow|amber|orange|emerald|rose|sky|indigo|purple|violet|pink|teal|cyan|lime|fuchsia)-\d{2,3}\b/g,
  /\b(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?-color|fill|stroke|outline-color)\s*:\s*(?:white|black)\b/g,
];

const MARCA = /tema-fijo:\s*\S.{8,}/; // «tema-fijo: » + al menos 10 caracteres de motivo

/** Cambia por espacios (conservando los saltos de línea) lo que no es código: así los números de línea siguen siendo los reales. */
const blanquear = (texto) => texto.replace(/[^\n]/g, " ");

/** Quita los comentarios de un archivo CSS o TS/TSX. Conserva los saltos de línea. */
export function sinComentarios(texto, tipo) {
  let sal = texto.replace(/\/\*[\s\S]*?\*\//g, blanquear);
  if (tipo === "ts") sal = sal.replace(/(^|[^:"'`\\])\/\/.*$/gm, (m, previo) => previo + blanquear(m.slice(previo.length)));
  return sal;
}

/** Quita los bloques `@theme { … }` (ahí viven las definiciones de los tokens: no son un uso). */
export function sinBloquesTheme(css) {
  let sal = "";
  let desde = 0;
  for (;;) {
    const i = css.indexOf("@theme", desde);
    if (i < 0) return sal + css.slice(desde);
    const ini = css.indexOf("{", i);
    let hondo = 1;
    let j = ini + 1;
    while (hondo > 0 && j < css.length) {
      if (css[j] === "{") hondo++;
      else if (css[j] === "}") hondo--;
      j++;
    }
    sal += css.slice(desde, i) + blanquear(css.slice(i, j));
    desde = j;
  }
}

/**
 * Cuenta los colores sueltos de un texto. Devuelve `{ cuenta, lineas: [{ n, texto }] }` (una entrada por línea con alguno).
 * @param {string} texto
 * @param {"css" | "ts"} tipo
 * @param {string} [nombre]
 * @returns {{ cuenta: number, lineas: { n: number, texto: string }[] }}
 */
export function colorSueltosDe(texto, tipo, nombre = "") {
  const crudo = texto.split("\n");
  let limpio = sinComentarios(texto, tipo);
  if (tipo === "css" && /globals\.css$/.test(nombre)) limpio = sinBloquesTheme(limpio);
  /** @type {{ n: number, texto: string }[]} */
  const lineas = [];
  let cuenta = 0;
  limpio.split("\n").forEach((l, i) => {
    if (MARCA.test(crudo[i])) return; // exento y con motivo
    let aqui = 0;
    for (const p of PATRONES) aqui += (l.match(p) ?? []).length;
    if (aqui) {
      cuenta += aqui;
      lineas.push({ n: i + 1, texto: crudo[i].trim().slice(0, 140) });
    }
  });
  return { cuenta, lineas };
}

function archivos(dir, salida = []) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre === "node_modules" || nombre.startsWith(".")) continue;
      archivos(ruta, salida);
    } else if (/\.(tsx?|css)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) && !/\.d\.ts$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

/**
 * Recorre `app`, `components` y `lib` de `apps/web`. Devuelve `{ "components/Foo.tsx": { cuenta, lineas } }` solo de los que tienen.
 * @param {string} [raiz]
 * @returns {Record<string, { cuenta: number, lineas: { n: number, texto: string }[] }>}
 */
export function escanearColoresSueltos(raiz = WEB) {
  /** @type {Record<string, { cuenta: number, lineas: { n: number, texto: string }[] }>} */
  const salida = {};
  for (const carpeta of CARPETAS) {
    for (const ruta of archivos(join(raiz, carpeta))) {
      const rel = relative(raiz, ruta).split(sep).join("/");
      if (EXCLUIDOS.has(rel)) continue;
      const r = colorSueltosDe(readFileSync(ruta, "utf8"), ruta.endsWith(".css") ? "css" : "ts", rel);
      if (r.cuenta) salida[rel] = r;
    }
  }
  return salida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const todo = escanearColoresSueltos();
  const filas = Object.entries(todo).sort((a, b) => b[1].cuenta - a[1].cuenta);
  const total = filas.reduce((s, [, r]) => s + r.cuenta, 0);
  console.log(`${filas.length} archivos con colores escritos a mano (${total} en total):\n`);
  for (const [archivo, r] of filas) {
    console.log(`${String(r.cuenta).padStart(5)}  ${archivo}`);
    if (process.argv.includes("--lineas")) for (const l of r.lineas) console.log(`         L${l.n}: ${l.texto}`);
  }
}

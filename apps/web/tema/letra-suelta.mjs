#!/usr/bin/env node
/**
 * La letra suelta (ADR-0691; Felipe 2026-11-19: «hay cosas con fuente demasiado pequeña y son imposibles de leer»): la única definición.
 *
 * La letra del ERP sale de UNA escala, que vive en el `@theme` de `app/globals.css`:
 *
 *   13 px  `text-xs`       lo más chico que se escribe: etiquetas, chips, conteos        var(--text-xs)
 *   14 px  `text-detalle`  la segunda línea de una fila, lo denso de una tabla           var(--text-detalle)
 *   16 px  `text-sm`       lo que se lee                                                 var(--text-sm)
 *   18 px  `text-lg`       el título de una fila o de una tarjeta                        var(--text-lg)
 *   21 px  `text-xl`       el título de una sección                                      var(--text-xl)
 *
 * Desde 22 px es exhibición (títulos de pantalla y de hoja, cifras grandes) y todavía no se vigila.
 *
 * «Suelta» es una letra de menos de 22 px escrita a mano en vez de pedida a la escala: `text-[11px]` en una clase, `fontSize: 11` en un
 * `style`, `font-size: 11px` (o `font: 600 11px/1 …`) en una hoja de estilos. El 2026-09-08 ya se había subido el piso desde los tokens,
 * y la queja volvió: 2.824 tamaños escritos a mano no pasaban por ellos.
 *
 * Lo usan `lib/letra-suelta.test.ts` (el candado del CI: un archivo nuevo no nace con letra suelta y la deuda de antes solo baja) y:
 *
 *   pnpm --filter web tema:letra              los archivos con letra suelta y cuántas
 *   pnpm --filter web tema:letra --lineas     además, cada línea y a qué escalón iría
 *   pnpm --filter web tema:letra:registro     reescribe la deuda declarada (`lib/letra-suelta-archivos.ts`) con lo que hay hoy
 *
 * Lo que de verdad no es letra de la interfaz se queda y lo dice: `letra-fija: <por qué>` en un comentario de la MISMA línea, con 10
 * caracteres de motivo como mínimo —el papel que se imprime (mide en puntos de impresora), las iniciales dentro de un círculo, la
 * etiqueta de un gráfico que escala con su dibujo—, o el archivo entero en `lib/letra-suelta-archivos.ts`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sinComentarios } from "./colores-sueltos.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARPETAS = ["app", "components", "lib"];

/** La escala, en px, con el nombre de su token (`--text-<nombre>`, utilidad `text-<nombre>`). */
export const ESCALA = /** @type {const} */ ([
  { px: 13, token: "xs" },
  { px: 14, token: "detalle" },
  { px: 16, token: "sm" },
  { px: 18, token: "lg" },
  { px: 21, token: "xl" },
]);
/** Desde aquí es exhibición: no se vigila todavía. */
export const TECHO = 22;

/**
 * El escalón de la escala que le toca a un tamaño: el más cercano y, en empate, el mayor (13,5 → 14; 15 → 16).
 * @param {number} px
 */
export function escalon(px) {
  return ESCALA.reduce((mejor, e) => (Math.abs(e.px - px) <= Math.abs(mejor.px - px) ? e : mejor), ESCALA[0]);
}

const aPx = (n, unidad) => (unidad === "rem" ? Number(n) * 16 : Number(n));

// La escala y el puente se DEFINEN aquí; la lista de la deuda nombra archivos, no tamaños.
const EXCLUIDOS = new Set(["lib/letra-suelta-archivos.ts"]);

/** Cada patrón captura el número y su unidad. */
const PATRONES_TS = [
  // Un tamaño arbitrario de Tailwind, con cualquier variante delante: `text-[11px]`, `sm:text-[12.5px]`, `text-[0.7rem]`.
  /(?<![\w-])(?:[\w@\[\]().&>*-]+:)*!?text-\[([0-9]*\.?[0-9]+)(px|rem)\]/g,
  // Un tamaño en un `style`: `fontSize: 11`, `fontSize: "11px"`. (El atributo `fontSize={…}` de un SVG no entra: es del dibujo.)
  /\bfontSize\s*:\s*["'`]?([0-9]*\.?[0-9]+)(px|rem)?["'`]?(?=\s*[,}\n])/g,
];
const PATRONES_CSS = [
  /(?<![\w-])font-size\s*:\s*([0-9]*\.?[0-9]+)(px|rem)\b/g,
  // La forma corta: `font: 600 11px/1 var(--font-sans)`.
  /(?<![\w-])font\s*:\s*(?:[a-z0-9-]+\s+){0,3}([0-9]*\.?[0-9]+)(px|rem)\b/g,
];

const MARCA = /letra-fija:\s*\S.{8,}/; // «letra-fija: » + al menos 10 caracteres de motivo

/**
 * Cuenta la letra suelta de un texto. Devuelve `{ cuenta, lineas: [{ n, texto, px, a }] }` (`a`: el token al que iría).
 * @param {string} texto
 * @param {"css" | "ts"} tipo
 * @returns {{ cuenta: number, lineas: { n: number, texto: string, px: number, a: string }[] }}
 */
export function letraDe(texto, tipo) {
  const crudo = texto.split("\n");
  const limpio = sinComentarios(texto, tipo);
  /** @type {{ n: number, texto: string, px: number, a: string }[]} */
  const lineas = [];
  let cuenta = 0;
  limpio.split("\n").forEach((l, i) => {
    if (MARCA.test(crudo[i])) return;
    for (const p of tipo === "css" ? PATRONES_CSS : PATRONES_TS) {
      for (const m of l.matchAll(p)) {
        const px = aPx(m[1], m[2] ?? "px");
        if (!(px > 0) || px >= TECHO) continue;
        cuenta++;
        lineas.push({ n: i + 1, texto: crudo[i].trim().slice(0, 150), px, a: escalon(px).token });
      }
    }
  });
  return { cuenta, lineas };
}

/**
 * Los tamaños arbitrarios de Tailwind que hay en un texto, con su variante: `[{ variante: "sm:", px: 11, clase: "sm:text-[11px]" }]`.
 * Lo usa la prueba para exigir que el puente (`app/estilos/letra.css`) cubra cada uno.
 * @param {string} texto
 */
export function clasesArbitrarias(texto) {
  /** @type {{ variante: string, px: number, clase: string }[]} */
  const salida = [];
  const crudo = texto.split("\n");
  sinComentarios(texto, "ts").split("\n").forEach((l, i) => {
    if (MARCA.test(crudo[i])) return; // letra fija: el puente tampoco la toca (lleva `data-letra-fija`)
    for (const m of l.matchAll(/(?<![\w-])((?:[\w@\[\]().&>*-]+:)*)!?text-\[([0-9]*\.?[0-9]+)(px|rem)\]/g)) {
      const px = aPx(m[2], m[3]);
      if (px > 0 && px < TECHO) salida.push({ variante: m[1], px, clase: `${m[1]}text-[${m[2]}${m[3]}]` });
    }
  });
  return salida;
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
 * @returns {Record<string, { cuenta: number, lineas: { n: number, texto: string, px: number, a: string }[] }>}
 */
export function escanearLetra(raiz = WEB) {
  /** @type {Record<string, { cuenta: number, lineas: { n: number, texto: string, px: number, a: string }[] }>} */
  const salida = {};
  for (const carpeta of CARPETAS) {
    for (const ruta of archivos(join(raiz, carpeta))) {
      const rel = relative(raiz, ruta).split(sep).join("/");
      if (EXCLUIDOS.has(rel)) continue;
      const r = letraDe(readFileSync(ruta, "utf8"), ruta.endsWith(".css") ? "css" : "ts");
      if (r.cuenta) salida[rel] = r;
    }
  }
  return salida;
}

/**
 * Todas las clases arbitrarias de letra que usa la web, sin repetir: `[{ variante, px, clase }]`.
 * @param {string} [raiz]
 */
export function clasesArbitrariasDeLaWeb(raiz = WEB) {
  /** @type {Map<string, { variante: string, px: number, clase: string }>} */
  const vistas = new Map();
  for (const carpeta of CARPETAS) {
    for (const ruta of archivos(join(raiz, carpeta))) {
      if (ruta.endsWith(".css")) continue;
      for (const c of clasesArbitrarias(readFileSync(ruta, "utf8"))) vistas.set(c.clase, c);
    }
  }
  return [...vistas.values()].sort((a, b) => a.variante.localeCompare(b.variante) || a.px - b.px);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const todo = escanearLetra();
  const filas = Object.entries(todo).sort((a, b) => b[1].cuenta - a[1].cuenta);
  const total = filas.reduce((s, [, r]) => s + r.cuenta, 0);
  const chicas = filas.reduce((s, [, r]) => s + r.lineas.filter((l) => l.px < ESCALA[0].px).length, 0);
  console.log(`${filas.length} archivos con letra suelta (${total} en total; ${chicas} por debajo de ${ESCALA[0].px} px):\n`);
  for (const [archivo, r] of filas) {
    console.log(`${String(r.cuenta).padStart(5)}  ${archivo}`);
    if (process.argv.includes("--lineas")) for (const l of r.lineas) console.log(`         L${l.n}: ${l.px} px → text-${l.a}   ${l.texto}`);
  }
}

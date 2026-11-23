#!/usr/bin/env node
/**
 * La esquina suelta (ADR-0698; Felipe 2026-11-19, al ver la lámina de las ocho mejoras: «cuatro radios, y concéntricas»): la única definición.
 *
 * Las esquinas del ERP salen de UNA escala, que vive en el `@theme` de `app/globals.css`. En una pantalla hay cuatro:
 *
 *    6 px  `rounded-sm`       lo chico: una casilla, una tecla, una celda                                 var(--radius-sm)
 *   10 px  `rounded-md`       lo que vive dentro de otra pieza: la miniatura, la fila que se toca         var(--radius-md)
 *   14 px  `rounded-campo`    un control: el campo, el combo, una opción grande                           var(--radius-campo)
 *   22 px  `rounded-tarjeta`  una tarjeta, una tabla, un bloque                                           var(--radius-tarjeta)
 *
 * Lo que flota trae la suya y una pantalla no la escribe: el cajón (28, `--radius-cajon`) y la hoja (32, `--radius-hoja`). Los cuatro
 * radios grandes son los del contrato de familia con CAYLA Dynamic (`docs/familia/contrato.json`). La píldora y el círculo
 * (`rounded-full`, `999px`, `50%`) no son un radio: no se cuentan. Y por debajo de 4 px no hay esquina: es el remate de un trazo
 * (la punta de una barra, el cuadrito de una leyenda de 10 px, el resaltado de una palabra).
 *
 * CONCÉNTRICAS: cada escalón es el anterior menos 4 u 8 px (22 → 14 → 6, 22 → 10, 14 → 10 → 6) y el espacio del ERP va en múltiplos de 4,
 * así que una pieza pegada al borde de otra baja de escalón sola: adentro = afuera − separación, y nunca más redonda que su contenedor.
 *
 * «Suelta» es una esquina escrita a mano en vez de pedida a la escala: `rounded-[9px]` en una clase, `borderRadius: 9` en un `style`,
 * `border-radius: 9px` en una hoja de estilos, y `rounded` a secas (4 px fijos de Tailwind: va `rounded-sm`). Lo concéntrico no es
 * suelto: `calc(var(--radius-tarjeta) - 12px)` sale de la escala. `rounded-lg`, `rounded-xl` y `rounded-2xl` tampoco: apuntan a ella
 * (valen lo que `rounded-md`, `rounded-campo` y `rounded-tarjeta`).
 *
 * Lo usan `lib/esquina-suelta.test.ts` (el candado del CI: un archivo nuevo no nace con una esquina suelta y la deuda de antes solo baja) y:
 *
 *   pnpm --filter web tema:esquinas              los archivos con esquinas sueltas y cuántas
 *   pnpm --filter web tema:esquinas --lineas     además, cada línea y a qué escalón iría
 *   pnpm --filter web tema:esquinas:registro     reescribe la deuda declarada (`lib/esquina-suelta-archivos.ts`) con lo que hay hoy
 *
 * Lo que de verdad no es una esquina de la interfaz se queda y lo dice: `esquina-fija: <por qué>` en un comentario de la MISMA línea,
 * con 10 caracteres de motivo como mínimo —el papel que se imprime, un dibujo, una forma que no es un rectángulo—, o el archivo entero
 * en `lib/esquina-suelta-archivos.ts`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sinComentarios } from "./colores-sueltos.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARPETAS = ["app", "components", "lib"];

/** La escala, en px, con su token (`--radius-<token>`, utilidad `rounded-<token>`). `flota`: la trae la pieza que flota, no una pantalla. */
export const ESCALA = /** @type {const} */ ([
  { px: 6, token: "sm", flota: false },
  { px: 10, token: "md", flota: false },
  { px: 14, token: "campo", flota: false },
  { px: 22, token: "tarjeta", flota: false },
  { px: 28, token: "cajon", flota: true },
  { px: 32, token: "hoja", flota: true },
]);
/** Por debajo de esto no hay esquina: es el remate de un trazo. */
export const PISO = 4;
/** Desde aquí es una píldora (`99px`, `999px`, `9999px`): no es un radio. */
export const PILDORA = 99;

/**
 * El escalón que le toca a un radio: el más cercano y, en empate, el mayor (4 → 6; 8 → 10; 12 → 14; 18 → 22; 25 → 28).
 * @param {number} px
 */
export function escalon(px) {
  return ESCALA.reduce((mejor, e) => (Math.abs(e.px - px) <= Math.abs(mejor.px - px) ? e : mejor), ESCALA[0]);
}

const aPx = (n, unidad) => (unidad === "rem" || unidad === "em" ? Number(n) * 16 : Number(n));
const suelto = (px) => px >= PISO && px < PILDORA;

// La escala se DEFINE en `globals.css`; la lista de la deuda nombra archivos, no radios.
const EXCLUIDOS = new Set(["lib/esquina-suelta-archivos.ts"]);

const LADO = "(?:-(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?";
const PATRONES_TS = [
  // Un radio arbitrario de Tailwind, con cualquier variante y cualquier lado: `rounded-[9px]`, `sm:rounded-t-[0.6rem]`.
  new RegExp(`(?<![\\w-])(?:[\\w@\\[\\]().&>*-]+:)*!?rounded${LADO}-\\[([0-9]*\\.?[0-9]+)(px|rem)\\]`, "g"),
  // Un radio en un `style`: `borderRadius: 9`, `borderRadius: "9px"`.
  /\bborder(?:TopLeft|TopRight|BottomLeft|BottomRight)?Radius\s*:\s*["'`]?([0-9]*\.?[0-9]+)(px|rem)?["'`]?(?=\s*[,}\n])/g,
];
// Los nombres de Tailwind que no están en la escala: `rounded` a secas (4 px fijos, no sale de un token) y los de 24 px o más.
const FUERA_DE_ESCALA = new RegExp(`(?<![\\w-])(?:[\\w@\\[\\]().&>*-]+:)*!?rounded(?:${LADO}-(3xl|4xl))?(?![\\w-])`, "g");
const DE_FABRICA = { "": 4, "3xl": 24, "4xl": 32 };

const DECLARACION = /(?<![\w-])border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius\s*:\s*([^;{}\n]+)/g;
const MARCA = /esquina-fija:\s*\S.{8,}/; // «esquina-fija: » + al menos 10 caracteres de motivo

/** Los radios escritos a mano de UNA declaración (`0 0 12px 12px` → [12, 12]); lo derivado (`var()`, `calc()`, `max()`) no cuenta. */
function radiosDe(valor) {
  let v = valor;
  // Lo que sale de una función ya viene de un token o de una cuenta: se quita, con sus paréntesis anidados.
  for (let antes = ""; antes !== v; ) { antes = v; v = v.replace(/[a-z-]+\([^()]*\)/gi, " "); }
  return [...v.matchAll(/(?<![\w.-])([0-9]*\.?[0-9]+)(px|rem|em)\b/g)].map((m) => aPx(m[1], m[2])).filter(suelto);
}

/**
 * Cuenta las esquinas sueltas de un texto. Devuelve `{ cuenta, lineas: [{ n, texto, px, a }] }` (`a`: el token al que iría).
 * Una declaración con varios valores (`12px 12px 0 0`) cuenta UNA vez, con su radio mayor.
 * @param {string} texto
 * @param {"css" | "ts"} tipo
 * @returns {{ cuenta: number, lineas: { n: number, texto: string, px: number, a: string }[] }}
 */
export function esquinasDe(texto, tipo) {
  const crudo = texto.split("\n");
  const limpio = sinComentarios(texto, tipo);
  /** @type {{ n: number, texto: string, px: number, a: string }[]} */
  const lineas = [];
  const anota = (i, px) => lineas.push({ n: i + 1, texto: crudo[i].trim().slice(0, 150), px, a: escalon(px).token });
  limpio.split("\n").forEach((l, i) => {
    if (MARCA.test(crudo[i])) return;
    if (tipo === "css") {
      for (const m of l.matchAll(DECLARACION)) { const r = radiosDe(m[1]); if (r.length) anota(i, Math.max(...r)); }
      return;
    }
    for (const p of PATRONES_TS) for (const m of l.matchAll(p)) { const px = aPx(m[1], m[2] ?? "px"); if (suelto(px)) anota(i, px); }
    for (const m of l.matchAll(FUERA_DE_ESCALA)) anota(i, DE_FABRICA[m[1] ?? ""]);
  });
  return { cuenta: lineas.length, lineas };
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
export function escanearEsquinas(raiz = WEB) {
  /** @type {Record<string, { cuenta: number, lineas: { n: number, texto: string, px: number, a: string }[] }>} */
  const salida = {};
  for (const carpeta of CARPETAS) {
    for (const ruta of archivos(join(raiz, carpeta))) {
      const rel = relative(raiz, ruta).split(sep).join("/");
      if (EXCLUIDOS.has(rel)) continue;
      const r = esquinasDe(readFileSync(ruta, "utf8"), ruta.endsWith(".css") ? "css" : "ts");
      if (r.cuenta) salida[rel] = r;
    }
  }
  return salida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const todo = escanearEsquinas();
  const filas = Object.entries(todo).sort((a, b) => b[1].cuenta - a[1].cuenta);
  const total = filas.reduce((s, [, r]) => s + r.cuenta, 0);
  console.log(`${filas.length} archivos con esquinas sueltas (${total} en total):\n`);
  for (const [archivo, r] of filas) {
    console.log(`${String(r.cuenta).padStart(5)}  ${archivo}`);
    if (process.argv.includes("--lineas")) for (const l of r.lineas) console.log(`         L${l.n}: ${l.px} px → rounded-${l.a}   ${l.texto}`);
  }
}

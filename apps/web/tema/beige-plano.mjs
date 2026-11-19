#!/usr/bin/env node
/**
 * El beige plano (Felipe 2026-11-19: «ese color plano le quita la estética al sistema, quítalo de donde sea que aparezca»): la única
 * definición. Cuenta los rellenos hechos con `hueso` o `sand` —`bg-hueso`, `hover:bg-sand/40`, `background: var(--color-hueso)`, un
 * `color-mix` de ellos— en `app`, `components` y `lib`. Una superficie de la interfaz va en vidrio: las clases `vd-*`
 * (`app/estilos/vidrio/rellenos.css`) o una receta (`recetas.css`).
 *
 * Lo usan `lib/beige-plano.test.ts` (el candado del CI: falla si aparece uno nuevo o si la deuda no baja) y este comando:
 *
 *   pnpm --filter web tema:beige            los archivos con beige plano y cuántos
 *   pnpm --filter web tema:beige --lineas   además, cada línea
 *
 * Lo que NO es una superficie se queda y lo dice: `// beige-fijo: <por qué>` (o `/* beige-fijo: … *\/`) en la MISMA línea, con 10
 * caracteres de motivo como mínimo —la pista de un gráfico o de una barra de avance (es la escala del dato), una línea o un separador,
 * el papel que se imprime, el esqueleto de carga—, o el archivo entero en `lib/beige-plano-archivos.ts`. Los `loading.tsx` no cuentan:
 * son solo esqueleto. Un borde (`border-sand`) no es un relleno y no cuenta.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sinComentarios } from "./colores-sueltos.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARPETAS = ["app", "components", "lib"];
// Donde viven los tokens y las recetas (su definición, no un uso), la versión maciza (que vuelve a lo opaco a propósito) y el registro.
const EXCLUIDOS = new Set([
  "app/estilos/tema.css",
  "app/estilos/vidrio/recetas.css",
  "app/estilos/vidrio/aguanta.css",
  "lib/beige-plano-archivos.ts",
]);

const PATRONES = [
  // Una utilidad de Tailwind con cualquier variante delante (`hover:`, `group-hover:`, `@min-[880px]:`…) y su opacidad.
  /(?<![\w-])(?:[\w@\[\]().-]+:)*bg-(?:hueso|sand)(?:\/\d+)?(?![\w-])/g,
  // Un relleno escrito en CSS o en un `style`: `background`, `background-color` o `background-image` con hueso o sand en su valor.
  /\bbackground(?:-color|-image)?\s*:\s*[^;}\n]*var\(--color-(?:hueso|sand)\)/g,
  /\bbackground(?:Color|Image)\s*:\s*["'`][^"'`\n]*var\(--color-(?:hueso|sand)\)/g, // `backgroundColor` de un style (el `background` ya lo cuenta el de arriba)
];

const MARCA = /beige-fijo:\s*\S.{8,}/; // «beige-fijo: » + al menos 10 caracteres de motivo

/**
 * Cuenta los rellenos beige de un texto. Devuelve `{ cuenta, lineas: [{ n, texto }] }`.
 * @param {string} texto
 * @param {"css" | "ts"} tipo
 * @returns {{ cuenta: number, lineas: { n: number, texto: string }[] }}
 */
export function beigeDe(texto, tipo) {
  const crudo = texto.split("\n");
  const limpio = sinComentarios(texto, tipo);
  /** @type {{ n: number, texto: string }[]} */
  const lineas = [];
  let cuenta = 0;
  limpio.split("\n").forEach((l, i) => {
    if (MARCA.test(crudo[i])) return;
    let aqui = 0;
    for (const p of PATRONES) aqui += (l.match(p) ?? []).length;
    if (aqui) {
      cuenta += aqui;
      lineas.push({ n: i + 1, texto: crudo[i].trim().slice(0, 160) });
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
    } else if (/\.(tsx?|css)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) && !/\.d\.ts$/.test(nombre) && nombre !== "loading.tsx") salida.push(ruta);
  }
  return salida;
}

/**
 * Recorre `app`, `components` y `lib` de `apps/web`. Devuelve `{ "components/Foo.tsx": { cuenta, lineas } }` solo de los que tienen.
 * @param {string} [raiz]
 * @returns {Record<string, { cuenta: number, lineas: { n: number, texto: string }[] }>}
 */
export function escanearBeige(raiz = WEB) {
  /** @type {Record<string, { cuenta: number, lineas: { n: number, texto: string }[] }>} */
  const salida = {};
  for (const carpeta of CARPETAS) {
    for (const ruta of archivos(join(raiz, carpeta))) {
      const rel = relative(raiz, ruta).split(sep).join("/");
      if (EXCLUIDOS.has(rel)) continue;
      const r = beigeDe(readFileSync(ruta, "utf8"), ruta.endsWith(".css") ? "css" : "ts");
      if (r.cuenta) salida[rel] = r;
    }
  }
  return salida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const todo = escanearBeige();
  const filas = Object.entries(todo).sort((a, b) => b[1].cuenta - a[1].cuenta);
  const total = filas.reduce((s, [, r]) => s + r.cuenta, 0);
  console.log(`${filas.length} archivos con beige plano (${total} en total):\n`);
  for (const [archivo, r] of filas) {
    console.log(`${String(r.cuenta).padStart(5)}  ${archivo}`);
    if (process.argv.includes("--lineas")) for (const l of r.lineas) console.log(`         L${l.n}: ${l.texto}`);
  }
}

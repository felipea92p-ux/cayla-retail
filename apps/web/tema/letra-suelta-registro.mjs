#!/usr/bin/env node
/**
 * Reescribe la DEUDA de `lib/letra-suelta-archivos.ts` con lo que el escáner ve hoy (las entradas permanentes no se tocan). Se corre
 * al terminar de migrar un módulo: la cuenta de cada archivo baja o el archivo sale de la lista. Nunca sirve para agregar deuda nueva:
 * `DEUDA_LETRA_HOY` está escrita a mano en ese archivo y la prueba exige que solo baje.
 *
 *   pnpm --filter web tema:letra:registro
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { escanearLetra } from "./letra-suelta.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUTA = join(WEB, "lib/letra-suelta-archivos.ts");
const texto = readFileSync(RUTA, "utf8");
const INICIO = "  // ---------- Deuda: se pasa a la escala módulo por módulo ----------\n";
const FIN = "};\n\n/** La deuda";
const i = texto.indexOf(INICIO) + INICIO.length;
const j = texto.indexOf(FIN);
if (i < INICIO.length || j < 0) throw new Error("No encontré las marcas de la lista en lib/letra-suelta-archivos.ts");
const permanentes = new Set([...texto.slice(0, i).matchAll(/^\s+"([^"]+)": /gm)].map((m) => m[1]));
const real = escanearLetra();
const filas = Object.entries(real)
  .filter(([a]) => !permanentes.has(a))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([a, r]) => `  "${a}": ${r.cuenta},\n`)
  .join("");
const total = Object.entries(real).filter(([a]) => !permanentes.has(a)).reduce((s, [, r]) => s + r.cuenta, 0);
const nuevo = (texto.slice(0, i) + filas + texto.slice(j)).replace(/export const DEUDA_LETRA_HOY = \d+;/, `export const DEUDA_LETRA_HOY = ${total};`);
writeFileSync(RUTA, nuevo);
console.log(`Deuda de letra suelta: ${total} en ${Object.keys(real).length - permanentes.size} archivos`);

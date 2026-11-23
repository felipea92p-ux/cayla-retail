#!/usr/bin/env node
/**
 * Reescribe la DEUDA de `lib/esquina-suelta-archivos.ts` con lo que el escáner ve hoy (las entradas permanentes no se tocan). Se corre
 * al llevar una pieza a la escala: la cuenta de su archivo baja o el archivo sale de la lista. Nunca sirve para agregar deuda nueva:
 * `DEUDA_ESQUINA_HOY` está escrita en ese archivo y la prueba exige que solo baje.
 *
 *   pnpm --filter web tema:esquinas:registro
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { escanearEsquinas } from "./esquina-suelta.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUTA = join(WEB, "lib/esquina-suelta-archivos.ts");
const texto = readFileSync(RUTA, "utf8");
const INICIO = "  // ---------- Deuda: piezas de diseño propio (decide Felipe) y el cobro de Vender ----------\n";
const FIN = "};\n\n/** La deuda";
const i = texto.indexOf(INICIO) + INICIO.length;
const j = texto.indexOf(FIN);
if (i < INICIO.length || j < 0) throw new Error("No encontré las marcas de la lista en lib/esquina-suelta-archivos.ts");
const permanentes = new Set([...texto.slice(0, i).matchAll(/^\s+"([^"]+)": /gm)].map((m) => m[1]));
const real = escanearEsquinas();
const deuda = Object.entries(real).filter(([a]) => !permanentes.has(a));
const filas = deuda
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([a, r]) => `  "${a}": ${r.cuenta},\n`)
  .join("");
const total = deuda.reduce((s, [, r]) => s + r.cuenta, 0);
const nuevo = (texto.slice(0, i) + filas + texto.slice(j)).replace(/export const DEUDA_ESQUINA_HOY = \d+;/, `export const DEUDA_ESQUINA_HOY = ${total};`);
writeFileSync(RUTA, nuevo);
console.log(`Deuda de esquinas sueltas: ${total} en ${deuda.length} archivos`);

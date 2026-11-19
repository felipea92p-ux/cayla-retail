#!/usr/bin/env node
/**
 * Reescribe la DEUDA de `lib/beige-plano-archivos.ts` con lo que el escáner ve hoy (las entradas permanentes no se tocan). Se corre al
 * terminar de migrar un módulo: la cuenta de cada archivo baja o el archivo sale de la lista. Nunca sirve para agregar deuda nueva: la
 * prueba exige que `DEUDA_BEIGE_HOY` baje, y su número está escrito a mano en `lib/beige-plano.test.ts`.
 *
  *   pnpm --filter web tema:beige:registro
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { escanearBeige } from "./beige-plano.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUTA = join(WEB, "lib/beige-plano-archivos.ts");
const texto = readFileSync(RUTA, "utf8");
const INICIO = "  // ---------- Deuda: se pasa a vidrio módulo por módulo ----------\n";
const FIN = "};\n\n/** La deuda";
const i = texto.indexOf(INICIO) + INICIO.length;
const j = texto.indexOf(FIN);
const permanentes = new Set([...texto.slice(0, i).matchAll(/^\s+"([^"]+)": \{/gm)].map((m) => m[1]));
const real = escanearBeige();
const modulo = (a) => {
  const s = a.split("/");
  if (s[0] === "components" && s.length > 2) return `components/${s[1]}`;
  if (s[0] === "app" && s[1] === "estilos") return "app/estilos";
  if (s[0] === "app" && s[1] === "(app)") return `app/${s[2]}`;
  return s.slice(0, -1).join("/") || s[0];
};
const filas = Object.entries(real)
  .filter(([a]) => !permanentes.has(a))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([a, r]) => `  "${a}": { cuenta: ${r.cuenta}, motivo: DEUDA, deuda: "${modulo(a)}" },\n`)
  .join("");
writeFileSync(RUTA, texto.slice(0, i) + filas + texto.slice(j));
const total = Object.entries(real).filter(([a]) => !permanentes.has(a)).reduce((s, [, r]) => s + r.cuenta, 0);
console.log(`Deuda de beige plano: ${total}`);

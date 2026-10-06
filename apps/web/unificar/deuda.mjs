#!/usr/bin/env node
/**
 * La deuda de una familia ya decidida (ADR-0357): los archivos que todavía dibujan A MANO lo que Felipe decidió que es una sola
 * pieza. Es la ÚNICA definición de «variante a mano»: la usan `lib/unificar.test.ts` (el candado del CI: un archivo nuevo con la
 * firma falla, y la deuda solo baja) y este comando, para ver el tablero o llenar la `deuda` de una decisión recién tomada:
 *
 *   pnpm --filter web unificar:deuda              todas las familias decididas, con sus archivos
 *   pnpm --filter web unificar:deuda pestanas     solo una, con cada línea
 *
 * Una firma es una expresión regular que reconoce, en una LÍNEA de código, la variante dibujada a mano (por ejemplo, un
 * `role="tablist"` fuera de la pieza elegida). No cuentan la pieza elegida, las que la acompañan (`tambien`) ni los archivos que
 * un ADR deja como están (`excepciones`, cada uno con su motivo). Una línea legítima suelta se exime con
 * `// unificar-fijo: <por qué>` (10 caracteres de motivo) en esa misma línea.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DECISIONES, familiaPorId, MARCA_FIJA } from "./familias.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(WEB, "..", "..");
const CARPETAS = ["components", "app"];

function recorrer(dir, salida = []) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) recorrer(ruta, salida);
    else if (/\.(tsx|ts|css)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

/** Los archivos (relativos a apps/web) que tienen la firma de la familia, con las líneas donde aparece. */
export function deudaDe(id) {
  const d = DECISIONES[id];
  if (!d) return [];
  const firmas = d.firmas.map((f) => new RegExp(f));
  // La pieza elegida, las que la acompañan y lo que un ADR deja como está no son deuda.
  const fuera = new Set([d.pieza, ...(d.tambien ?? []), ...(d.excepciones ?? []).map((e) => e.archivo)]);
  const sal = [];
  for (const ruta of CARPETAS.flatMap((c) => recorrer(join(WEB, c)))) {
    const rel = relative(WEB, ruta);
    if (fuera.has(rel)) continue;
    const lineas = readFileSync(ruta, "utf8").split("\n");
    // Un comentario que nombra la forma vieja («antes era «← Volver a …»») no la dibuja: no es deuda.
    const esComentario = (l) => /^\s*(\/\/|\/\*|\*|\{\s*\/\*)/.test(l);
    const donde = lineas.map((l, i) => (firmas.some((f) => f.test(l)) && !MARCA_FIJA.test(l) && !esComentario(l) ? i + 1 : 0)).filter(Boolean);
    if (donde.length) sal.push({ archivo: rel, lineas: donde });
  }
  return sal.sort((a, b) => a.archivo.localeCompare(b.archivo));
}

/** Lo que una decisión necesita para valer: la familia existe, y su pieza, su ADR y su registro están en el repo. */
export function problemasDe(id) {
  const d = DECISIONES[id];
  const p = [];
  if (!familiaPorId(id)) p.push(`la familia «${id}» no existe en familias.mjs`);
  if (!d) return p;
  for (const campo of ["fecha", "adr", "registro", "elegida", "pieza"]) if (!d[campo]) p.push(`le falta «${campo}»`);
  if (!Array.isArray(d.firmas) || !d.firmas.length) p.push("no tiene firmas: sin ellas la prueba no puede ver una variante nueva");
  if (!Array.isArray(d.deuda)) p.push("le falta la lista «deuda» (puede ser vacía)");
  if (d.pieza && !existsSync(join(WEB, d.pieza))) p.push(`la pieza ${d.pieza} no existe (es relativa a apps/web)`);
  for (const t of d.tambien ?? []) if (!existsSync(join(WEB, t))) p.push(`la pieza ${t} (tambien) no existe (es relativa a apps/web)`);
  for (const e of d.excepciones ?? []) {
    if (!existsSync(join(WEB, e.archivo))) p.push(`la excepción ${e.archivo} no existe (es relativa a apps/web)`);
    if (!e.motivo || e.motivo.length < 10) p.push(`la excepción ${e.archivo} no dice por qué (motivo de 10 caracteres o más, con su ADR)`);
  }
  if (d.adr && !existsSync(join(REPO, d.adr))) p.push(`el ADR ${d.adr} no existe (es relativo a la raíz del repo)`);
  if (d.registro && !existsSync(join(REPO, d.registro))) p.push(`el registro ${d.registro} no existe (es relativo a la raíz del repo)`);
  for (const f of d.firmas ?? []) {
    try {
      new RegExp(f);
    } catch {
      p.push(`la firma ${f} no es una expresión regular válida`);
    }
  }
  return p;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pedida = process.argv.slice(2).find((a) => !a.startsWith("-"));
  const ids = pedida ? [pedida] : Object.keys(DECISIONES);
  if (!ids.length) {
    console.log("Todavía no hay familias decididas. Se agregan en unificar/familias.mjs (DECISIONES) al cerrar un /unificar.");
    process.exit(0);
  }
  for (const id of ids) {
    if (!DECISIONES[id]) {
      console.log(`«${id}» no está decidida todavía.`);
      continue;
    }
    const hoy = deudaDe(id);
    const declarada = new Set(DECISIONES[id].deuda);
    console.log(`\n${id} → ${DECISIONES[id].pieza}: ${hoy.length} archivos la dibujan a mano (declarados ${declarada.size})`);
    for (const d of hoy) console.log(`  ${declarada.has(d.archivo) ? " " : "+"} ${d.archivo}${pedida ? `  líneas ${d.lineas.join(", ")}` : ""}`);
    for (const a of declarada) if (!hoy.some((d) => d.archivo === a)) console.log(`  - ${a}  (ya no la dibuja: sácalo de la deuda)`);
    for (const p of problemasDe(id)) console.log(`  ! ${p}`);
  }
}

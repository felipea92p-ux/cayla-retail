// Reescribe en familias.mjs la `deuda` de las familias pedidas con lo que HOY encuentra deuda.mjs (al registrar una decisión,
// o al terminar de migrar: la deuda solo baja). Después de escribir, vuelve a cargar familias.mjs y, si quedó roto o con una
// clave repetida, deja el archivo como estaba y avisa.
//   pnpm --filter web unificar:rellenar <familia> [<familia>…]
//
// Aprendido el 2026-10-13: cortar la lista en el primer «]» rompía el archivo (una ruta como `[compraId]` lleva «]» adentro),
// y una clave repetida en una decisión (`"excepciones": []` al final) borraba en silencio las de arriba: gana la última.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deudaDe } from "./deuda.mjs";

const ruta = join(dirname(fileURLToPath(import.meta.url)), "familias.mjs");
const original = readFileSync(ruta, "utf8");
const pedidas = process.argv.slice(2);
if (!pedidas.length) {
  console.error("Uso: unificar:rellenar <familia> [<familia>…]");
  process.exit(1);
}

let s = original;
for (const id of pedidas) {
  const archivos = deudaDe(id).map((d) => d.archivo);
  const ini = s.indexOf(`  "${id}": {`);
  if (ini < 0) throw new Error(`no encuentro la decisión «${id}» en familias.mjs`);
  const k = s.indexOf('"deuda": [', ini);
  // El cierre de la lista es «]» al empezar una línea (cuatro espacios), nunca el primero que aparezca.
  const vacia = s.startsWith('"deuda": []', k);
  const fin = vacia ? k + '"deuda": ['.length : s.indexOf("\n    ]", k) + 1 + 4;
  const lista = archivos.length ? `\n${archivos.map((a) => `      "${a}"`).join(",\n")}\n    ` : "";
  s = s.slice(0, k) + `"deuda": [${lista}` + s.slice(fin);
  console.log(`${id}: ${archivos.length} ${archivos.length === 1 ? "archivo" : "archivos"}`);
}
writeFileSync(ruta, s);

// Una clave repetida dentro de una decisión no rompe la carga, pero pisa la de arriba: se busca a mano.
const repetidas = [];
const cuerpo = s.slice(s.indexOf("export const DECISIONES"));
const bloques = cuerpo.split(/\n  "([a-z.-]+)": \{/);
for (let i = 1; i < bloques.length; i += 2) {
  for (const clave of ['"deuda"', '"excepciones"', '"firmas"', '"tambien"', '"ventana"']) {
    if (bloques[i + 1].split(clave).length > 2) repetidas.push(`${bloques[i]} → ${clave}`);
  }
}

try {
  if (repetidas.length) throw new Error(`clave repetida en: ${repetidas.join(", ")}`);
  await import(`${pathToFileURL(ruta).href}?v=${Date.now()}`);
} catch (e) {
  writeFileSync(ruta, original);
  console.error(`\nfamilias.mjs quedó roto y se dejó como estaba: ${e.message}`);
  process.exit(1);
}

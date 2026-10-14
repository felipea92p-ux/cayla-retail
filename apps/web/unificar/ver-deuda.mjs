// Muestra cada línea de deuda con su contexto, para migrar archivo por archivo sin abrirlos a ciegas.
//   pnpm --filter web unificar:ver                              → toda la deuda de todas las familias decididas
//   pnpm --filter web unificar:ver -- --familia tabla enlace    → solo esas familias
//   pnpm --filter web unificar:ver -- Caja Vender.tsx           → solo los archivos cuya ruta termina así
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DECISIONES } from "./familias.mjs";
import { deudaDe } from "./deuda.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((a) => a !== "--");
const iFam = args.indexOf("--familia");
const familias = iFam >= 0 ? args.slice(iFam + 1) : Object.keys(DECISIONES).filter((id) => DECISIONES[id].firmas?.length);
const pedidos = iFam >= 0 ? args.slice(0, iFam) : args;

let total = 0;
for (const f of familias) {
  for (const d of deudaDe(f)) {
    if (pedidos.length && !pedidos.some((p) => d.archivo.endsWith(p))) continue;
    const l = readFileSync(join(WEB, d.archivo), "utf8").split("\n");
    for (const n of d.lineas) {
      total++;
      console.log(`\n### ${f} · ${d.archivo}:${n}`);
      for (let k = Math.max(1, n - 2); k <= Math.min(l.length, n + 3); k++) console.log(`${k === n ? ">" : " "}${k}: ${l[k - 1].slice(0, 230)}`);
    }
  }
}
console.log(`\n${total} ${total === 1 ? "línea" : "líneas"} de deuda.`);

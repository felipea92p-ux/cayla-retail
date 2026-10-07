#!/usr/bin/env node
// Acepta la huella de controles de una o más guías (ADR-0362). Se corre DESPUÉS de revisar la guía contra lo que cambió en la
// pantalla: la prueba `lib/guias.test.ts` falla mientras la huella guardada no coincida con el código, y su mensaje dice qué
// controles nacieron o desaparecieron. Aceptarla sin mirar la guía es exactamente lo que este candado quiere evitar.
//
//   pnpm --filter web guias:huella vender vender.historial   ← las guías nombradas (su `id`)
//   pnpm --filter web guias:huella --todas                    ← todas (al crear el sistema, o tras un cambio de una pieza común)
//   pnpm --filter web guias:huella --ver vender               ← solo muestra la diferencia, no escribe

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ_WEB, diferenciaDeHuella, guiasDeLosArchivos, huellaDePantalla } from "./escaner.mjs";

const DIR = join(RAIZ_WEB, "lib", "guias", "huellas");
const args = process.argv.slice(2).filter((a) => a !== "--");
const ver = args.includes("--ver");
const todas = args.includes("--todas");
const nombres = args.filter((a) => !a.startsWith("--"));

// Las guías se leen del texto de `lib/guias/pantallas/*.ts` (su `id` y su `ruta`), sin compilar TypeScript. La prueba
// `lib/guias.test.ts` comprueba que esta lectura encuentra exactamente las guías del registro.
const guias = guiasDeLosArchivos();

const elegidas = todas ? guias : guias.filter((g) => nombres.includes(g.id));
const faltan = nombres.filter((n) => !guias.some((g) => g.id === n));
if (faltan.length) {
  console.error(`No hay guía con id ${faltan.map((f) => `«${f}»`).join(", ")}. Las que hay: ${guias.map((g) => g.id).join(", ")}`);
  process.exit(2);
}
if (!elegidas.length) {
  console.error("Di qué guía (su id, p. ej. «vender.historial») o --todas.");
  process.exit(2);
}

for (const g of elegidas) {
  const archivo = join(DIR, `${g.id}.json`);
  const hoy = huellaDePantalla(g.ruta);
  const guardada = existsSync(archivo) ? JSON.parse(readFileSync(archivo, "utf8")).controles : {};
  const { nuevos, quitados } = diferenciaDeHuella(guardada, hoy);
  console.log(`\n${g.id} (${g.ruta}): ${nuevos.length} nuevos, ${quitados.length} que ya no están`);
  for (const n of nuevos) console.log(`  + ${n}`);
  for (const q of quitados) console.log(`  - ${q}`);
  if (ver) continue;
  const total = Object.values(hoy).flat().length;
  writeFileSync(
    archivo,
    JSON.stringify(
      {
        guia: g.id,
        ruta: g.ruta,
        nota: "Huella de controles de la pantalla (ADR-0362). La escribe `pnpm --filter web guias:huella`; no se edita a mano.",
        total,
        controles: hoy,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`  ✓ huella aceptada (${total} controles)`);
}

#!/usr/bin/env node
/**
 * Candado: una entrada nueva de bitácora o de backlog vive en su propio archivo (ADR-0259).
 *
 * EL PROBLEMA. `docs/BITACORA.md` y `docs/BACKLOG.md` eran los dos archivos más tocados del repo (321 y 328 commits en
 * una semana): cada PR metía su sección ARRIBA DEL TODO, en la misma línea, así que el segundo PR que se fusionaba
 * chocaba siempre, tenía que ponerse al día y volvía a esperar el CI. Desde el 2026-09-29 cada entrada es un archivo
 * (`docs/bitacora/AAAA-MM-DD-<tema>.md`, `docs/backlog/AAAA-MM-DD-<tema>.md`): dos PR nunca tocan el mismo.
 *
 * QUÉ PROMETE. En un `pull_request`, falla si el PR agrega a uno de esos dos archivos un encabezado `## ` con una fecha
 * posterior a CORTE. Lo demás sigue permitido: tachar un pendiente o corregir una sección vieja, y las entradas fechadas
 * hasta CORTE (las de los PR que ya estaban abiertos cuando nació el candado). Un encabezado sin fecha (un «cubo» del
 * backlog) no cuenta como entrada.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const CONGELADOS = ["docs/BITACORA.md", "docs/BACKLOG.md"];
export const CORTE = "2026-09-28";

/** `diff` = salida de `git diff -U0`. Devuelve `[{ archivo, encabezado }]` de las entradas nuevas que no van ahí. */
export function entradasFueraDeLugar(diff, corte = CORTE) {
  const fuera = [];
  let archivo = null;
  for (const linea of diff.split("\n")) {
    const cabecera = /^\+\+\+ b\/(.+)$/.exec(linea);
    if (cabecera) {
      archivo = cabecera[1];
      continue;
    }
    if (!CONGELADOS.includes(archivo) || !linea.startsWith("+## ")) continue;
    const fecha = /\b(\d{4}-\d{2}-\d{2})\b/.exec(linea)?.[1];
    if (fecha && fecha > corte) fuera.push({ archivo, encabezado: linea.slice(1) });
  }
  return fuera;
}

function main() {
  if (process.env.GITHUB_EVENT_NAME !== "pull_request") {
    console.log("✓ Solo se revisa en un pull_request (compara el PR contra main).");
    return;
  }
  const diff = execFileSync("git", ["diff", "-U0", "HEAD^1", "HEAD", "--", ...CONGELADOS], { encoding: "utf8" });
  const fuera = entradasFueraDeLugar(diff);
  if (fuera.length === 0) {
    console.log("✓ Ninguna entrada nueva en BITACORA.md ni en BACKLOG.md: las nuevas viven en docs/bitacora/ y docs/backlog/.");
    return;
  }
  console.error("✗ Entradas nuevas en un archivo congelado (ADR-0259):\n");
  for (const { archivo, encabezado } of fuera) console.error(`  ${archivo}: ${encabezado}`);
  console.error(
    "\nMuévelas, sin cambiarles una letra, a su propio archivo:\n" +
      "  docs/BITACORA.md → docs/bitacora/AAAA-MM-DD-<tema>.md\n" +
      "  docs/BACKLOG.md  → docs/backlog/AAAA-MM-DD-<tema>.md\n" +
      "Así dos PR nunca escriben en la misma línea y nadie vuelve a resolver un conflicto de documentación.",
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

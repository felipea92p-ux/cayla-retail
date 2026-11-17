#!/usr/bin/env node
/**
 * Candado: una entrada nueva de bitácora, de backlog o del tablero de auditorías de «Al milímetro» vive en su propio
 * archivo (ADR-0259).
 *
 * EL PROBLEMA. `docs/BITACORA.md` y `docs/BACKLOG.md` eran los dos archivos más tocados del repo (321 y 328 commits en
 * una semana): cada PR metía su sección ARRIBA DEL TODO, en la misma línea, así que el segundo PR que se fusionaba
 * chocaba siempre, tenía que ponerse al día y volvía a esperar el CI. Desde el 2026-09-29 cada entrada es un archivo
 * (`docs/bitacora/AAAA-MM-DD-<tema>.md`, `docs/backlog/AAAA-MM-DD-<tema>.md`): dos PR nunca tocan el mismo.
 * El 2026-11-17 volvió con la tabla de auditorías de `docs/milimetro/README.md` (114 commits en una semana, y 51
 * fusiones donde los dos lados la habían tocado): `/milimetro` es obligatoria en todo cambio visual y cada auditoría
 * escribía su fila en la primera línea de la tabla. Desde ese día la auditoría es solo su informe
 * (`docs/milimetro/auditorias/AAAA-MM-DD-<tema>.md`) y el tablero se arma desde la carpeta (`pnpm milimetro:auditorias`).
 *
 * QUÉ PROMETE. En un `pull_request`, falla si el PR agrega a uno de esos archivos una entrada (un encabezado `## ` en
 * la bitácora y el backlog; una fila `| AAAA-MM-DD |` en el tablero) con una fecha posterior a su corte. Lo demás sigue
 * permitido: tachar un pendiente o corregir una entrada vieja, y las entradas fechadas hasta el corte (las de los PR que
 * ya estaban abiertos cuando nació el candado). Un encabezado sin fecha (un «cubo» del backlog) no cuenta como entrada.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Un archivo congelado: qué línea cuenta como entrada, hasta qué fecha se acepta y qué hacer con una entrada nueva. */
export const CONGELADOS = [
  { archivo: "docs/BITACORA.md", corte: "2026-09-28", entrada: /^## /, destino: "muévela, sin cambiarle una letra, a docs/bitacora/AAAA-MM-DD-<tema>.md" },
  { archivo: "docs/BACKLOG.md", corte: "2026-09-28", entrada: /^## /, destino: "muévela, sin cambiarle una letra, a docs/backlog/AAAA-MM-DD-<tema>.md" },
  {
    archivo: "docs/milimetro/README.md",
    corte: "2026-11-17",
    entrada: /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/,
    destino: "bórrala: el informe docs/milimetro/auditorias/AAAA-MM-DD-<tema>.md ya es el registro (el tablero: pnpm milimetro:auditorias)",
  },
];

/** `diff` = salida de `git diff -U0`. Devuelve `[{ archivo, linea }]` de las entradas nuevas que no van ahí. */
export function entradasFueraDeLugar(diff, congelados = CONGELADOS) {
  const fuera = [];
  let regla = null;
  for (const linea of diff.split("\n")) {
    const cabecera = /^\+\+\+ b\/(.+)$/.exec(linea);
    if (cabecera) {
      regla = congelados.find((c) => c.archivo === cabecera[1]) ?? null;
      continue;
    }
    if (!regla || !linea.startsWith("+") || !regla.entrada.test(linea.slice(1))) continue;
    const fecha = /\b(\d{4}-\d{2}-\d{2})\b/.exec(linea)?.[1];
    if (fecha && fecha > regla.corte) fuera.push({ archivo: regla.archivo, linea: linea.slice(1) });
  }
  return fuera;
}

/** Una fila del tablero pasa de 600 letras: en el mensaje basta el inicio para reconocerla. */
const recortar = (texto, tope = 140) => (texto.length > tope ? `${texto.slice(0, tope)}…` : texto);

function main() {
  if (process.env.GITHUB_EVENT_NAME !== "pull_request") {
    console.log("✓ Solo se revisa en un pull_request (compara el PR contra main).");
    return;
  }
  const archivos = CONGELADOS.map((c) => c.archivo);
  const diff = execFileSync("git", ["diff", "-U0", "HEAD^1", "HEAD", "--", ...archivos], { encoding: "utf8" });
  const fuera = entradasFueraDeLugar(diff);
  if (fuera.length === 0) {
    console.log(`✓ Ninguna entrada nueva en ${archivos.join(", ")}: las nuevas viven cada una en su archivo.`);
    return;
  }
  console.error("✗ Entradas nuevas en un archivo congelado (ADR-0259):\n");
  for (const { archivo, linea } of fuera) console.error(`  ${archivo}: ${recortar(linea)}`);
  console.error("\nCada entrada nueva vive en su propio archivo:");
  for (const { archivo, destino } of CONGELADOS) {
    if (fuera.some((f) => f.archivo === archivo)) console.error(`  ${archivo} → ${destino}`);
  }
  console.error("Así dos PR nunca escriben en la misma línea y nadie vuelve a resolver un conflicto de documentación.");
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

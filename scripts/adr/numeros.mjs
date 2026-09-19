#!/usr/bin/env node
/**
 * Candado de números de ADR — dos archivos de `docs/adr/` no pueden compartir número.
 *
 * EL PROBLEMA QUE RESUELVE. Cada sesión (de IA o de persona) numera su ADR como "el
 * siguiente" del `main` que tiene delante, y varias trabajan en ramas paralelas: dos
 * eligen el mismo número sin que nadie haga nada mal. Ya pasó con 0074, 0102 y 0105 (el
 * 0102 se resolvió al renumerar el ADR de Caja; 0074 y 0105 siguen repetidos en `main`) y el
 * 2026-09-17 hubo seis choques en un día. Git no lo ve —son archivos con nombres distintos—,
 * ningún hook lo impide, y cada "ADR-0102" del repo dejó de saber de cuál de los dos hablaba.
 *
 * QUÉ PROMETE. Sale con código 1 y nombra los archivos si dos o más de `docs/adr/`
 * comparten número de cuatro dígitos (`0102-algo.md`), salvo los duplicados que ya estaban
 * en `main` cuando se puso el candado (LEGADO): esos se toleran, pero no pueden crecer —un
 * tercer `0074-…` falla—. Al renumerar uno, se borra su línea de LEGADO; si una línea queda
 * de sobra el script lo avisa, sin fallar. No mira el contenido de los ADR.
 *
 * QUÉ NO PUEDE DECIR. Solo ve la rama que se está probando. Dos ramas que eligen el mismo
 * número no chocan aquí mientras están separadas: chocan cuando la segunda se prueba con la
 * primera ya en `main`, y es en ese PR donde este candado se pone rojo (por eso corre
 * también en `pull_request`). Tampoco ve las ramas de otras sesiones: ANTES de elegir número,
 * mira las ramas remotas y los demás worktrees, no solo `main` —una rama sin fusionar ya
 * puede tener el "siguiente"—:
 *     git for-each-ref --format='%(refname)' refs/remotes refs/heads \
 *       | while read r; do git ls-tree --name-only "$r" docs/adr/; done | sort | tail
 *
 * QUÉ HACER SI SALE ROJO. Renumera el ADR que AÚN NO está en `main` (el de tu rama) a un
 * número libre, con `git mv`, y actualiza sus referencias: `git grep 'ADR-<número>'`, sin
 * tocar las que son del otro ADR con ese número.
 *
 * USO
 *   pnpm adr:numeros                        → revisa docs/adr/
 *   node scripts/adr/numeros.mjs <carpeta>  → otra carpeta (para probarlo)
 */
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// `0102-emitir-comprobante.md` → número `0102`. Lo que no calza (un README, una plantilla)
// no es un ADR numerado.
const PATRON = /^(\d{4})-.+\.md$/;

// Números que YA estaban repetidos en `main` el 2026-09-18, con cuántos archivos se toleran.
// No pueden crecer. Al renumerar uno, borra su línea (el script avisa de las que sobran).
export const LEGADO = { "0074": 2, "0105": 2 };

function agrupar(nombres) {
  const porNumero = new Map();
  for (const nombre of nombres) {
    const m = PATRON.exec(nombre);
    if (!m) continue;
    porNumero.set(m[1], [...(porNumero.get(m[1]) ?? []), nombre]);
  }
  return porNumero;
}

/** `[[numero, [archivos...]], ...]` de los números repetidos por encima de lo tolerado, en orden. */
export function numerosRepetidos(nombres, legado = LEGADO) {
  return [...agrupar(nombres)]
    .filter(([numero, archivos]) => archivos.length > (legado[numero] ?? 1))
    .sort(([a], [b]) => a.localeCompare(b));
}

/** Números de LEGADO que ya no están repetidos: su línea sobra. */
export function legadoDeSobra(nombres, legado = LEGADO) {
  const porNumero = agrupar(nombres);
  return Object.keys(legado).filter((numero) => (porNumero.get(numero)?.length ?? 0) < 2);
}

function main() {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const carpeta = resolve(process.argv[2] ?? join(raiz, "docs", "adr"));
  const nombres = readdirSync(carpeta).sort();
  const repetidos = numerosRepetidos(nombres);
  const sobra = legadoDeSobra(nombres);

  if (sobra.length > 0) {
    console.log(`ℹ LEGADO de sobra (ya no está repetido; borra su línea en scripts/adr/numeros.mjs): ${sobra.join(", ")}`);
  }
  if (repetidos.length === 0) {
    console.log(`✓ ${nombres.length} archivos en ${carpeta}: ningún número de ADR repetido fuera del legado.`);
    return;
  }

  console.error("✗ Números de ADR repetidos — cada «ADR-NNNN» del repo dejaría de saber de cuál habla:\n");
  for (const [numero, archivos] of repetidos) {
    console.error(`  ${numero}`);
    for (const a of archivos) console.error(`    · ${a}`);
  }
  console.error(
    "\nRenumera el que AÚN NO está en `main` a un número libre —mira antes las ramas remotas y los\n" +
      "otros worktrees, no solo `main`— y actualiza sus referencias: git grep 'ADR-<número>'.",
  );
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();

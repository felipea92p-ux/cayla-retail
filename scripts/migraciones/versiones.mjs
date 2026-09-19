#!/usr/bin/env node
/**
 * Candado de versiones de migración — dos archivos no pueden compartir prefijo.
 *
 * EL PROBLEMA QUE RESUELVE. Supabase toma el prefijo numérico del nombre
 * (`20260918170000_algo.sql` → `20260918170000`) como llave primaria del historial
 * (`supabase_migrations.schema_migrations.version`). Dos archivos con el mismo prefijo
 * hacen que `supabase start`, `db reset` y `migration up` fallen con llave duplicada.
 * Como varias sesiones de IA trabajan en ramas paralelas y cada una elige "el siguiente
 * timestamp", el choque se da sin que nadie haga nada mal: pasó dos veces el 2026-09-17
 * (`20260917100000` y `20260917140000`) y otra el 2026-09-18 (`20260918170000`, PR #150).
 * Nada lo detectaba: `verificar.mjs` compara lo que cada archivo PROMETE contra la base,
 * no los nombres entre sí, y producción no lo delata porque el SQL se pega a mano.
 *
 * QUÉ PROMETE. Sale con código 1 y nombra los archivos si dos o más de
 * `supabase/migrations/` comparten versión. No mira contenido ni base de datos.
 *
 * QUÉ NO PUEDE DECIR. Solo ve la rama que se está probando. Dos ramas que cada una agrega
 * una versión distinta-pero-igual-a-la-otra NO chocan aquí; chocan al fusionar la segunda,
 * y es en ese PR (ya con la primera en `main`) donde este candado se pone rojo. Por eso
 * corre también en `pull_request`.
 *
 * QUÉ HACER SI SALE ROJO. Renombra la que AÚN NO corrió en producción a un timestamp libre
 * justo después. Nunca la que ya se pegó allá: su nombre puede estar en el historial de
 * producción. Y actualiza toda referencia al nombre viejo (`git grep '<nombre viejo>'`).
 *
 * USO
 *   pnpm migraciones:versiones               → revisa supabase/migrations/
 *   node scripts/migraciones/versiones.mjs <carpeta>   → otra carpeta (para probarlo)
 */
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Misma regla que el CLI de Supabase: dígitos, guion bajo, resto, `.sql`. Lo que no
// calza, el CLI lo ignora, así que aquí tampoco cuenta como versión.
const PATRON = /^(\d+)_.*\.sql$/;

/** Devuelve `[[version, [archivos...]], ...]` solo de las versiones repetidas, en orden. */
export function versionesRepetidas(nombres) {
  const porVersion = new Map();
  for (const nombre of nombres) {
    const m = PATRON.exec(nombre);
    if (!m) continue;
    porVersion.set(m[1], [...(porVersion.get(m[1]) ?? []), nombre]);
  }
  return [...porVersion].filter(([, archivos]) => archivos.length > 1).sort(([a], [b]) => a.localeCompare(b));
}

function main() {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const carpeta = resolve(process.argv[2] ?? join(raiz, "supabase", "migrations"));
  const nombres = readdirSync(carpeta).sort();
  const repetidas = versionesRepetidas(nombres);

  if (repetidas.length === 0) {
    console.log(`✓ ${nombres.length} archivos en ${carpeta}: ninguna versión repetida.`);
    return;
  }

  console.error("✗ Versiones de migración repetidas — `supabase db reset` y `migration up` fallarían:\n");
  for (const [version, archivos] of repetidas) {
    console.error(`  ${version}`);
    for (const a of archivos) console.error(`    · ${a}`);
  }
  console.error(
    "\nRenombra la que AÚN NO corrió en producción a un timestamp libre justo después\n" +
      "(nunca la que ya se pegó allá) y actualiza sus referencias: git grep '<nombre viejo>'.",
  );
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();

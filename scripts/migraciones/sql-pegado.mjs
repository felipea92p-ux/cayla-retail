#!/usr/bin/env node
/**
 * Check «SQL pegado» — un PR con migración nueva dice si su SQL ya está en producción, y no edita migraciones viejas.
 *
 * EL PROBLEMA QUE RESUELVE. El SQL de producción lo pega Felipe a mano en el SQL Editor, y Vercel publica `main` apenas
 * se fusiona un PR. Si se fusiona sin pegar, la web nueva llama funciones o columnas que producción no tiene: el
 * 2026-09-27 se publicaron 6 cambios así (Pedir a otra sede, el nº de operación de Yape, el costo…) y nada avisó. Y una
 * migración de `main` que se edita ya no dice lo que corrió en producción (la corrección va en un archivo nuevo).
 *
 * QUÉ PROMETE. Con la lista de archivos del PR (de la API de GitHub) y su cuerpo, sale con código 1 si:
 *   - agrega una migración en `supabase/migrations/` y no marcó ninguna de las dos casillas del formulario
 *     («SQL pegado en producción» o «El SQL se pega después de fusionar»);
 *   - edita o borra una migración que ya estaba en la rama base. Renombrar sin cambiar el contenido sí se puede (así se
 *     arregla un choque de versiones, ver `versiones.mjs`).
 *
 * QUÉ NO PUEDE DECIR. No mira producción: cree lo que dice la casilla. Si alguien la marca sin pegar, el check queda
 * verde; eso lo atrapa la revisión diaria de producción contra `main`. Y como `main` no está protegida, un check rojo
 * avisa pero no impide fusionar.
 *
 * USO (lo corre `.github/workflows/sql-pegado.yml`)
 *   node scripts/migraciones/sql-pegado.mjs <archivos.json> <cuerpo.md>
 *   archivos.json = la respuesta de `gh api repos/<dueño>/<repo>/pulls/<n>/files --paginate --slurp`
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MIGRACION = /^supabase\/migrations\/[^/]+\.sql$/;
const PEGADO = /^\s*[-*]\s*\[[xX]\][^\n]*SQL pegado en producci[oó]n/m;
const DESPUES = /^\s*[-*]\s*\[[xX]\][^\n]*se pega despu[eé]s de fusionar/m;

/**
 * `archivos`: `[{ filename, status, previous_filename?, changes? }]` como los da la API de GitHub.
 * Devuelve `{ nuevas, editadas, casilla, motivos }`; `motivos` vacío = verde.
 */
export function revisarSqlPegado(archivos, cuerpo) {
  const nuevas = [];
  const editadas = [];
  for (const a of archivos) {
    const es = MIGRACION.test(a.filename);
    const eraMigracion = a.previous_filename ? MIGRACION.test(a.previous_filename) : false;
    if (a.status === "added" || a.status === "copied") {
      if (es) nuevas.push(a.filename);
    } else if (a.status === "renamed") {
      if (es && !eraMigracion) nuevas.push(a.filename);
      else if (eraMigracion && (!es || (a.changes ?? 0) > 0)) editadas.push(`${a.previous_filename} → ${a.filename}`);
    } else if (a.status === "modified" || a.status === "changed" || a.status === "removed") {
      if (es) editadas.push(a.filename);
    }
  }
  const texto = cuerpo ?? "";
  const casilla = PEGADO.test(texto) ? "pegado" : DESPUES.test(texto) ? "despues" : null;
  const motivos = [];
  if (nuevas.length > 0 && !casilla) {
    motivos.push(
      `El PR agrega ${nuevas.length === 1 ? "una migración" : `${nuevas.length} migraciones`} (${nuevas.join(", ")}) y no marcó ` +
        "«SQL pegado en producción» ni «El SQL se pega después de fusionar». Pégalo en producción antes de fusionar y marca la casilla.",
    );
  }
  if (editadas.length > 0) {
    motivos.push(
      `El PR edita o borra migraciones que ya están en la rama base (${editadas.join(", ")}). ` +
        "Una migración de main no se edita: la corrección va en un archivo nuevo.",
    );
  }
  return { nuevas, editadas, casilla, motivos };
}

function main() {
  const [rutaArchivos, rutaCuerpo] = process.argv.slice(2);
  // `--slurp` junta las páginas en un arreglo de arreglos.
  const archivos = JSON.parse(readFileSync(rutaArchivos, "utf8")).flat();
  const cuerpo = rutaCuerpo ? readFileSync(rutaCuerpo, "utf8") : "";
  const { nuevas, casilla, motivos } = revisarSqlPegado(archivos, cuerpo);
  if (motivos.length === 0) {
    const detalle = nuevas.length === 0 ? "no trae migraciones nuevas" : `trae ${nuevas.length} y marcó «${casilla === "pegado" ? "SQL pegado en producción" : "se pega después de fusionar"}»`;
    console.log(`✓ SQL pegado: el PR ${detalle}.`);
    return;
  }
  for (const m of motivos) console.error(`✗ ${m}`);
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();

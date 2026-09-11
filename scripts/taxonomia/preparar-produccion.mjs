#!/usr/bin/env node
/**
 * Prepara los archivos SQL que se pegan en el SQL Editor de producción.
 *
 * POR QUÉ EXISTE. Producción vive dentro del proyecto de cayla-dynamic, en el
 * schema `retail`, y el SQL Editor busca en `public` por defecto — donde está el
 * schema de Dynamic, no el de retail. Sin `set search_path`, la migración falla
 * con "relation does not exist" (42P01) y parece que la tabla no existiera
 * cuando en realidad se está mirando el cajón equivocado. Ya costó un round-trip
 * con la 0030 (CLAUDE.md §"Cómo aplicar SQL a producción").
 *
 * Las migraciones del repo se escriben SIN prefijo para que corran limpias
 * contra el Postgres local. Este script produce la versión de producción sin
 * tocar el archivo original — que es justo lo que evita romper `db reset`.
 *
 * Y PARTE EL SEED. El seed de la taxonomía son ~1,5 MB en un solo archivo. El
 * SQL Editor se atraganta bastante antes de eso, así que sale en trozos que se
 * pegan en orden. Cada trozo lleva su propio `set search_path` porque en el SQL
 * Editor cada ejecución es una sesión nueva: el de la parte 1 no sobrevive a la
 * parte 2.
 *
 * USO
 *   node scripts/taxonomia/preparar-produccion.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SALIDA = join(RAIZ, "supabase", "seed-taxonomia", "produccion");

/** Tablas del repo que hay que calificar con `retail.` al pegar en producción. */
const CABECERA = `-- ============================================================
-- PARA PEGAR EN EL SQL EDITOR DE PRODUCCIÓN (proyecto cayla-dynamic)
-- Generado por scripts/taxonomia/preparar-produccion.mjs — no editar a mano.
--
-- El search_path de abajo es obligatorio: sin él, el SQL Editor busca en
-- \`public\`, que en ese proyecto es el schema de Dynamic y no el de retail.
-- ============================================================
set search_path to retail, public;

`;

/** ~380.000 caracteres por trozo: 5 pegados en vez de 10, y el editor lo aguanta
 *  sin ponerse lento. Probado aplicando los archivos generados, en orden, contra
 *  una base puesta en el mismo estado que producción. */
const MAX_CHARS = 380_000;

function trozos(sql) {
  // Se corta SOLO entre statements completos (línea en blanco después de `;`).
  // Partir por caracteres a secas dejaría un INSERT a la mitad, que es la peor
  // forma posible de fallar: la mitad de las filas entra y la otra no.
  const statements = sql.split(/;\n\n/).filter((s) => s.trim());
  const partes = [];
  let actual = "";
  for (const st of statements) {
    const pieza = st.trimEnd() + ";\n\n";
    if (actual.length + pieza.length > MAX_CHARS && actual) {
      partes.push(actual);
      actual = "";
    }
    actual += pieza;
  }
  if (actual.trim()) partes.push(actual);
  return partes;
}

/**
 * Deja una migración del repo lista para producción.
 *
 * NO alcanza con el search_path al principio del script. Una función declarada
 * con `set search_path = public` lo lleva ESCRITO en su definición, y Postgres
 * valida el cuerpo de las `language sql` al crearlas contra ESE search_path —
 * no contra el de la sesión. Así falló `fn_familia_color_de_universal` al
 * probar la 0056 contra una base con schema `retail`: "relation
 * taxonomia_valores does not exist", con la tabla ahí mismo. Las migraciones
 * de `supabase/unificacion/` lo resuelven declarando `retail, public` en cada
 * función; esto hace lo mismo sin que nadie tenga que acordarse.
 */
function paraProduccion(sql) {
  return (
    sql
      .replace(/set search_path = public\b/g, "set search_path = retail, public")
      // En producción `retail.personas` es una VISTA sobre Dynamic (ADR-0010), y
      // una FK no puede apuntar a una vista: `references personas (id)` da
      // "42809: referenced relation personas is not a table". Las tablas de
      // retail apuntan a la tabla real, `public.personas` — igual que todas las
      // migraciones de `supabase/unificacion/`. Le pasó a la 0056 el 2026-09-11.
      .replace(/references personas \(/g, "references public.personas (")
  );
}

function main() {
  mkdirSync(SALIDA, { recursive: true });

  // ---------- 1. la migración 0052, calificada ----------
  const migracion = readFileSync(join(RAIZ, "supabase", "migrations", "0052_taxonomia_universal.sql"), "utf8");
  writeFileSync(join(SALIDA, "1-migracion-0052.sql"), CABECERA + paraProduccion(migracion), "utf8");
  console.log("  1-migracion-0052.sql");

  // ---------- 2. el seed, en trozos ----------
  const rutaSeed = join(RAIZ, "supabase", "seed-taxonomia", "taxonomia-2026-08.sql");
  if (!existsSync(rutaSeed)) {
    console.error(`\nFalta el seed. Genéralo primero:\n  node scripts/taxonomia/cargar.mjs\n`);
    process.exitCode = 1;
    return;
  }

  const seed = readFileSync(rutaSeed, "utf8");

  // El seed viene envuelto en su propio begin/commit y su propio search_path.
  // Se les quita: cada trozo es su propia transacción implícita, y un `begin`
  // sin su `commit` al final del trozo dejaría la sesión abierta.
  const cuerpo = seed
    .replace(/^set search_path[^\n]*\n/m, "")
    .replace(/^begin;\n/m, "")
    .replace(/^commit;\n?/m, "");

  const partes = trozos(cuerpo);
  partes.forEach((parte, i) => {
    const n = i + 2; // el 1 es la migración
    const nombre = `${n}-seed-parte-${i + 1}-de-${partes.length}.sql`;
    writeFileSync(
      join(SALIDA, nombre),
      CABECERA +
        `-- Parte ${i + 1} de ${partes.length} del seed de la taxonomía.\n` +
        `-- Pegar EN ORDEN. Es idempotente: repetir una parte no duplica nada.\n\n` +
        parte,
      "utf8"
    );
    console.log(`  ${nombre}  (${(parte.length / 1024).toFixed(0)} KB)`);
  });

  // ---------- 3. la verificación ----------
  writeFileSync(
    join(SALIDA, `${partes.length + 2}-verificar.sql`),
    CABECERA +
      `-- Correr DESPUÉS de todas las partes. Los números esperados salen de la
-- misma carga verificada en local (ADR-0030).
select 'categorias'      as que, count(*) as hay, 1849 as esperado from taxonomia_categorias
union all select 'de ropa (aa)', count(*), 663   from taxonomia_categorias where vertical = 'aa'
union all select 'atributos',    count(*), 993   from taxonomia_atributos
union all select 'valores',      count(*), 10216 from taxonomia_valores
union all select 'puente',       count(*), 16527 from taxonomia_categoria_atributos;

-- Debe devolver una fila: 2026-08 activa.
select version, es_activa from taxonomia_versiones;

-- Debe devolver la ruta completa de "Camisetas de capa base".
select ruta from taxonomia_categorias where id = 'aa-1-1-2-4';
`,
    "utf8"
  );
  console.log(`  ${partes.length + 2}-verificar.sql`);

  // ---------- 4. la 0056, que va DESPUÉS del seed ----------
  // Referencia `taxonomia_valores` en una función `language sql`, y Postgres
  // valida ese cuerpo al crearla: la taxonomía tiene que estar cargada antes.
  const m55 = readFileSync(join(RAIZ, "supabase", "migrations", "0056_importar_catalogo.sql"), "utf8");
  const nombre55 = `${partes.length + 3}-migracion-0056.sql`;
  writeFileSync(join(SALIDA, nombre55), CABECERA + paraProduccion(m55), "utf8");
  console.log(`  ${nombre55}`);

  console.log(`\n  → ${SALIDA}`);
  console.log(`\nPegar en orden: la 0052, las ${partes.length} partes del seed, la verificación, y la 0056.`);
}

main();

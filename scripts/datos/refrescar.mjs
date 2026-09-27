#!/usr/bin/env node
/**
 * Refresco del volcado de producción POR DIFERENCIA — `pnpm datos:refrescar`.
 *
 * EL PROBLEMA QUE RESUELVE. `docs/datos/generado/` es la foto de producción, y producción no se alcanza desde una máquina
 * del equipo (vive en Supabase, detrás de internet: `COMO-REFRESCAR.md`). Refrescarla era pegar nueve consultas en el SQL
 * Editor y guardar ~600 KB a mano, aunque solo hubieran cambiado dos funciones. Mientras nadie lo hacía, `datos:comparar`
 * decía «esa función no existe en producción» de funciones que sí existían, y alguien podía volver a pegarlas.
 *
 * QUÉ HACE, EN DOS PASOS.
 *   1. `pnpm datos:refrescar` — con la base LOCAL (Docker) calcula una huella por grupo de la foto actual: por tabla en
 *      columnas, candados, índices únicos, políticas, llaves hacia Dynamic y RLS; por los primeros 8 caracteres de la
 *      firma en funciones. Postgres serializa el JSON (`jsonb::text`, `collate "C"`), así la huella local y la de
 *      producción se calculan igual. Escribe UNA consulta que lleva esas huellas adentro: pegada en el SQL Editor de
 *      producción, devuelve en una sola celda solo los grupos nuevos o distintos, los que ya no están, las huellas de
 *      todo, las filas por tabla y la fecha de la foto (en la misma sentencia: una sola foto, coherente).
 *   2. `pnpm datos:refrescar <archivo>` — con esa celda guardada en un archivo, reemplaza esos grupos en los archivos
 *      del volcado (mismo formato: JSON con sangría 1 y claves ordenadas), escribe filas y foto, y vuelve a calcular las
 *      huellas: si alguna no coincide con producción, lo dice y termina en error. Después: `pnpm datos:generar:produccion`,
 *      `pnpm datos:comparar`, `pnpm datos:aviario` y `pnpm --filter web test diccionario-datos`.
 *
 * QUÉ ASUME. Docker con `supabase_db_cayla-retail` corriendo (solo como calculadora: no lee sus tablas) y que los archivos
 * de `generado/` salieron de las consultas de `COMO-REFRESCAR.md` — esta consulta arma exactamente las mismas.
 *
 * SE ROMPE SI alguien cambia una de las consultas de `COMO-REFRESCAR.md` sin cambiarla acá (las huellas dejan de
 * coincidir y el paso 2 lo dice), o si el archivo del paso 2 no es la celda que devolvió la consulta del paso 1.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const G = "docs/datos/generado";
const ARCHIVOS = {
  c: "retail_columnas.json",
  r: "retail_rls.json",
  k: "retail_constraints.json",
  i: "retail_indices_unicos.json",
  p: "retail_policies.json",
  f: "retail_fks_cruzadas.json",
  x: "funciones-produccion.txt",
};
// Las listas se agrupan por tabla (clave) y se ordenan por (tabla, nombre), como las devuelven las consultas.
const LISTAS = {
  k: ["tabla", "conname"],
  i: ["tablename", "indexname"],
  p: ["tablename", "policyname"],
  f: ["src_table", "conname"],
};

function psqlLocal(sql) {
  try {
    return execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1"], {
      input: sql,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    const detalle = (e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 3).join(" ");
    console.error(`\n  ✗ No se pudo usar el Postgres local (${CONTENEDOR_LOCAL}): ${detalle}\n    ¿Está corriendo Docker con Supabase local?\n`);
    process.exit(1);
  }
}

function literal(archivo) {
  const texto = readFileSync(join(G, archivo), "utf8");
  if (texto.includes("$J$")) throw new Error(`${archivo} contiene «$J$»: no se puede pasar como literal`);
  return `$J$${texto}$J$`;
}

/** La huella de cada grupo de la foto actual, calculada por Postgres (la misma serialización que en producción). */
function huellasLocales() {
  const sql = String.raw`
select 'c', k, left(md5(v::text), 12) from jsonb_each(${literal(ARCHIVOS.c)}::jsonb) e(k, v)
union all select 'r', k, left(md5(v::text), 12) from jsonb_each(${literal(ARCHIVOS.r)}::jsonb) e(k, v)
union all select 'k', x->>'tabla', left(md5(jsonb_agg(x order by x->>'conname' collate "C")::text), 12) from jsonb_array_elements(${literal(ARCHIVOS.k)}::jsonb) x group by 2
union all select 'i', x->>'tablename', left(md5(jsonb_agg(x order by x->>'indexname' collate "C")::text), 12) from jsonb_array_elements(${literal(ARCHIVOS.i)}::jsonb) x group by 2
union all select 'p', x->>'tablename', left(md5(jsonb_agg(x order by x->>'policyname' collate "C")::text), 12) from jsonb_array_elements(${literal(ARCHIVOS.p)}::jsonb) x group by 2
union all select 'f', x->>'src_table', left(md5(jsonb_agg(x order by x->>'conname' collate "C")::text), 12) from jsonb_array_elements(${literal(ARCHIVOS.f)}::jsonb) x group by 2
union all select 'x', left(l, 8), left(md5(string_agg(l, E'\n' order by l collate "C")), 12) from regexp_split_to_table(rtrim(${literal(ARCHIVOS.x)}, E'\n'), E'\n') l group by 2;
`;
  const huellas = new Map();
  for (const linea of psqlLocal(sql).trim().split("\n")) {
    const [grupo, clave, huella] = linea.split("\t");
    huellas.set(`${grupo}|${clave}`, huella);
  }
  return huellas;
}

// Las mismas consultas de COMO-REFRESCAR.md, agrupadas por tabla (o por prefijo de firma en funciones).
const PROD = String.raw`prod as (
  select 'c' as grupo, table_name::text as clave,
         jsonb_agg(jsonb_build_object('table_schema', table_schema, 'table_name', table_name, 'column_name', column_name, 'data_type', data_type, 'is_nullable', is_nullable, 'column_default', column_default, 'ordinal_position', ordinal_position) order by ordinal_position) as v
    from information_schema.columns where table_schema = 'retail' group by table_name
  union all
  select 'r', c.relname::text, jsonb_build_object('relkind', c.relkind::text, 'rls', c.relrowsecurity, 'forzado', c.relforcerowsecurity)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'retail' and c.relkind in ('r','p','v','m','f')
  union all
  select 'k', n.nspname || '.' || c.relname, jsonb_agg(jsonb_build_object('tabla', n.nspname || '.' || c.relname, 'conname', con.conname, 'definicion', pg_get_constraintdef(con.oid)) order by con.conname collate "C")
    from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'retail' group by 2
  union all
  select 'i', tablename::text, jsonb_agg(jsonb_build_object('tablename', tablename, 'indexname', indexname, 'indexdef', indexdef) order by indexname collate "C")
    from pg_indexes where schemaname = 'retail' and indexdef ilike '%unique%' group by 2
  union all
  select 'p', tablename::text, jsonb_agg(jsonb_build_object('schemaname', schemaname, 'tablename', tablename, 'policyname', policyname, 'cmd', cmd, 'roles', roles::text, 'qual', qual, 'with_check', with_check) order by policyname collate "C")
    from pg_policies where schemaname = 'retail' group by 2
  union all
  select 'f', src.relname::text, jsonb_agg(jsonb_build_object('conname', con.conname, 'src_table', src.relname, 'ref_table', refn.nspname || '.' || ref.relname) order by con.conname collate "C")
    from pg_constraint con join pg_class src on src.oid = con.conrelid join pg_namespace srcn on srcn.oid = src.relnamespace
    join pg_class ref on ref.oid = con.confrelid join pg_namespace refn on refn.oid = ref.relnamespace
   where con.contype = 'f' and srcn.nspname = 'retail' and refn.nspname <> 'retail' group by 2
  union all
  select 'x', left(l, 8), jsonb_agg(l order by l collate "C") from (
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' || ' -> ' || pg_get_function_result(p.oid)
           || case when p.prosecdef then ' [definer]' else ' [invoker]' end as l
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.prokind = 'f') f group by 2
),
huellas as (
  select grupo, clave, v,
         left(md5(case when grupo = 'x' then (select string_agg(e, E'\n' order by e collate "C") from jsonb_array_elements_text(v) e) else v::text end), 12) as huella
    from prod
)`;

function consultaParaProduccion(locales) {
  const valores = [...locales].map(([grupoClave, huella]) => {
    const [grupo, ...resto] = grupoClave.split("|");
    return `('${grupo}', '${resto.join("|").replaceAll("'", "''")}', '${huella}')`;
  });
  return String.raw`-- pnpm datos:refrescar — pégala ENTERA en el SQL Editor de producción (proyecto de Dynamic). Solo lee.
-- Devuelve una sola celda («refresco»): guárdala tal cual en un archivo y corre «pnpm datos:refrescar <archivo>».
with foto_local (grupo, clave, huella) as (values
${valores.join(",\n")}
),
${PROD}
select jsonb_build_object(
  'huellas', (select jsonb_agg(jsonb_build_array(grupo, clave, huella) order by grupo, clave) from huellas),
  'cambios', (select coalesce(jsonb_object_agg(h.grupo || '|' || h.clave, h.v), '{}'::jsonb)
                from huellas h left join foto_local l on l.grupo = h.grupo and l.clave = h.clave
               where l.huella is distinct from h.huella),
  'quitados', (select coalesce(jsonb_agg(l.grupo || '|' || l.clave), '[]'::jsonb)
                 from foto_local l where not exists (select 1 from huellas h where h.grupo = l.grupo and h.clave = l.clave)),
  'filas', (select jsonb_object_agg(tabla, n) from (
              select c.relname as tabla,
                     (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from retail.%I', c.relname), false, true, '')))[1]::text::bigint as n
                from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
               where nsp.nspname = 'retail' and c.relkind = 'r') s),
  'foto', jsonb_build_object(
    'leido_en', now(),
    'relaciones', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'retail' and c.relkind in ('r','p','v','m','f')),
    'funciones', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'retail' and p.prokind = 'f'))
) as refresco;
`;
}

/** El mismo formato que tienen los archivos: sangría 1, claves ordenadas, salto de línea al final. */
function ordenar(v) {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort(comparar).map((k) => [k, ordenar(v[k])]));
  return v;
}
function comparar(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function escribirJson(archivo, valor) {
  writeFileSync(join(G, archivo), `${JSON.stringify(ordenar(valor), null, 1)}\n`);
}
/** La foto va en una línea, con los separadores de siempre: {"funciones": 607, "leido_en": "…", "relaciones": 134}. */
function escribirFoto(foto) {
  const campos = Object.keys(foto).sort(comparar).map((k) => `${JSON.stringify(k)}: ${JSON.stringify(foto[k])}`);
  writeFileSync(join(G, "retail_foto.json"), `{${campos.join(", ")}}\n`);
}

/** La celda puede llegar como el objeto, como `{"refresco": …}` o como la fila exportada por el SQL Editor (`[{…}]`). */
function leerCelda(archivo) {
  let dato = JSON.parse(readFileSync(archivo, "utf8"));
  if (Array.isArray(dato)) dato = dato[0];
  if (dato && dato.refresco) dato = typeof dato.refresco === "string" ? JSON.parse(dato.refresco) : dato.refresco;
  if (!dato || !Array.isArray(dato.huellas) || !dato.cambios || !dato.foto) {
    console.error("\n  ✗ Ese archivo no es la celda «refresco» que devuelve la consulta de `pnpm datos:refrescar`.\n");
    process.exit(1);
  }
  return dato;
}

function aplicar(celda) {
  const cambios = new Map();
  for (const grupo of Object.keys(ARCHIVOS)) cambios.set(grupo, new Map());
  for (const [grupoClave, valor] of Object.entries(celda.cambios)) {
    const [grupo, ...resto] = grupoClave.split("|");
    cambios.get(grupo).set(resto.join("|"), valor);
  }
  const quitados = new Map([...cambios.keys()].map((g) => [g, new Set()]));
  for (const grupoClave of celda.quitados ?? []) {
    const [grupo, ...resto] = grupoClave.split("|");
    quitados.get(grupo).add(resto.join("|"));
  }

  // Objetos por tabla: columnas y RLS.
  for (const grupo of ["c", "r"]) {
    const objeto = JSON.parse(readFileSync(join(G, ARCHIVOS[grupo]), "utf8"));
    for (const clave of quitados.get(grupo)) delete objeto[clave];
    for (const [clave, valor] of cambios.get(grupo)) objeto[clave] = valor;
    escribirJson(ARCHIVOS[grupo], objeto);
  }
  // Listas agrupadas por tabla.
  for (const [grupo, [campoTabla, campoNombre]] of Object.entries(LISTAS)) {
    const fuera = new Set([...quitados.get(grupo), ...cambios.get(grupo).keys()]);
    const lista = JSON.parse(readFileSync(join(G, ARCHIVOS[grupo]), "utf8")).filter((x) => !fuera.has(x[campoTabla]));
    for (const valor of cambios.get(grupo).values()) lista.push(...valor);
    lista.sort((a, b) => comparar(a[campoTabla], b[campoTabla]) || comparar(a[campoNombre], b[campoNombre]));
    escribirJson(ARCHIVOS[grupo], lista);
  }
  // Funciones: una firma por línea, agrupadas por los primeros 8 caracteres.
  const fueraX = new Set([...quitados.get("x"), ...cambios.get("x").keys()]);
  const firmas = readFileSync(join(G, ARCHIVOS.x), "utf8").split("\n").filter((l) => l && !fueraX.has(l.slice(0, 8)));
  for (const valor of cambios.get("x").values()) firmas.push(...valor);
  firmas.sort(comparar);
  writeFileSync(join(G, ARCHIVOS.x), `${firmas.join("\n")}\n`);

  escribirJson("retail_filas.json", celda.filas);
  escribirFoto(celda.foto);
  return { cambiados: Object.keys(celda.cambios).length, quitados: (celda.quitados ?? []).length, funciones: firmas.length };
}

const archivo = process.argv[2];
if (!archivo) {
  const locales = huellasLocales();
  const carpeta = join(tmpdir(), "cayla-refresco");
  mkdirSync(carpeta, { recursive: true });
  const ruta = join(carpeta, "consulta.sql");
  writeFileSync(ruta, consultaParaProduccion(locales));
  console.log(`\n  Foto actual: ${locales.size} grupos con su huella.`);
  console.log(`  ✓ Consulta escrita en ${ruta}`);
  console.log("    1. Pégala ENTERA en el SQL Editor de producción (solo lee).");
  console.log("    2. Guarda la celda «refresco» en un archivo (por ejemplo refresco.json).");
  console.log("    3. pnpm datos:refrescar refresco.json\n");
} else {
  const celda = leerCelda(archivo);
  const { cambiados, quitados, funciones } = aplicar(celda);
  const esperadas = new Map(celda.huellas.map(([grupo, clave, huella]) => [`${grupo}|${clave}`, huella]));
  const locales = huellasLocales();
  const distintas = [...new Set([...esperadas.keys(), ...locales.keys()])].filter((k) => esperadas.get(k) !== locales.get(k));
  const cuadraFoto = celda.foto.funciones === funciones && celda.foto.relaciones === Object.keys(JSON.parse(readFileSync(join(G, ARCHIVOS.r), "utf8"))).length;
  console.log(`\n  Grupos nuevos o cambiados: ${cambiados} · quitados: ${quitados}`);
  if (distintas.length || !cuadraFoto) {
    console.error(`  ✗ ${distintas.length} grupo(s) no coinciden con producción${cuadraFoto ? "" : " y la foto no cuadra con los archivos"}: ${distintas.slice(0, 10).join(", ")}`);
    console.error("    No commitees esto: `git checkout -- docs/datos/generado/` y vuelve a empezar.\n");
    process.exit(1);
  }
  console.log(`  ✓ Las ${esperadas.size} huellas coinciden con producción (foto del ${celda.foto.leido_en}: ${celda.foto.relaciones} relaciones, ${celda.foto.funciones} funciones).`);
  console.log("  Sigue: pnpm datos:generar:produccion && pnpm datos:comparar && pnpm datos:aviario && pnpm --filter web test diccionario-datos\n");
}

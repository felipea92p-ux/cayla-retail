#!/usr/bin/env node
/**
 * Prueba de integración de `retail.fn_movimientos_variantes` — la búsqueda de prendas de Movimientos con el
 * «Filtro de búsqueda especial» (migración 20260921153700) — contra el Postgres LOCAL.
 *
 * Lo que ninguna prueba de TypeScript puede verificar:
 *   · que la versión SQL de la búsqueda responde IGUAL que la de TypeScript (apps/web/lib/filtro-busqueda-especial.ts):
 *     los dos leen los mismos casos de `filtro-busqueda-especial.casos.json` —las mismas prendas, las mismas consultas,
 *     las mismas respuestas—, así que una regla que cambie en un lado y no en el otro rompe una de las dos pruebas;
 *   · que el texto de la persona nunca se interpreta como SQL ni como comodín (`%`, `_`, comillas, barras);
 *   · que una consulta en blanco no busca nada (NULL) y una rara no revienta;
 *   · que la búsqueda funciona con el rol de una persona logueada (RLS de variantes, productos, colores, tallas y
 *     códigos de barras) y que `anon` no puede ejecutarla ni ejecutar sus ayudas;
 *   · que el historial completo (`fn_movimientos` y las tarjetas de `fn_movimientos_resumen`) usa esas mismas reglas:
 *     «zafiro rosado m» trae solo los movimientos de esa prenda, y la lista y las tarjetas cuentan lo mismo.
 *
 * Las prendas de los casos se insertan SIN disparadores (`session_replication_role = replica`) para que queden
 * exactamente como dice el JSON —sin los códigos ni los códigos de barras que el alta genera sola— y con nombres,
 * SKUs y códigos inventados que no chocan con los de la siembra local.
 *
 * Mismo mecanismo que `fn_movimientos_referencias.mjs`: `docker exec … psql` y `ROLLBACK` SIEMPRE — no deja nada en el
 * Postgres compartido (regla: no ensuciar la base local; jamás `db reset`).
 *
 * USO
 *   pnpm pruebas:fn-movimientos-busqueda-especial    → necesita el stack local levantado y la migración aplicada
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede

const CASOS = JSON.parse(readFileSync(new URL("../../apps/web/lib/filtro-busqueda-especial.casos.json", import.meta.url), "utf8"));

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
}

/** Un valor como literal de SQL: comillas dobladas; las barras invertidas no se tocan (standard_conforming_strings). */
const lit = (x) => (x === null || x === undefined ? "null" : `'${String(x).replaceAll("'", "''")}'`);

let fallos = 0;
let total = 0;
function afirmar(nombre, condicion, detalle = "") {
  total += 1;
  if (condicion) console.log(`  ✔ ${nombre}`);
  else {
    fallos += 1;
    console.log(`  ✘ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}

/** Una línea `clave|valor` por resultado, con su prefijo (`R` = caso compartido, `K` = verificación suelta). */
function leer(salida, prefijo) {
  const d = {};
  for (const linea of salida.split("\n")) {
    if (!linea.startsWith(`${prefijo}|`)) continue;
    const [, clave, ...resto] = linea.split("|");
    d[clave] = resto.join("|");
  }
  return d;
}

// ---------------------------------------------------------------------------
// 1. Los casos compartidos con TypeScript
// ---------------------------------------------------------------------------

/** SQL que crea las prendas de un escenario tal como dice el JSON y una función `pg_temp.q` que responde con sus ids. */
function sqlEscenario(escenario) {
  const productos = new Map();
  for (const f of escenario.filas) if (!productos.has(f.producto)) productos.set(f.producto, { id: randomUUID(), codigo: f.productoCodigo ?? null });
  const colores = [...new Set(escenario.filas.map((f) => f.color).filter(Boolean))];
  const tallas = [...new Set(escenario.filas.map((f) => f.talla).filter(Boolean))];
  const filas = escenario.filas.map((f, i) => ({ ...f, idx: i, variante: randomUUID() }));

  const sql = [];
  sql.push("begin;", "set local session_replication_role = replica;");
  sql.push("create temp table fx (idx int, id text, variante uuid) on commit drop;");
  for (const c of colores) {
    sql.push(`insert into retail.colores (codigo, nombre) select 'ZZ' || substr(md5(${lit(c)}), 1, 8), ${lit(c)} where not exists (select 1 from retail.colores where nombre = ${lit(c)});`);
  }
  for (const t of tallas) {
    sql.push(`insert into retail.tallas (valor) select ${lit(t)} where not exists (select 1 from retail.tallas where valor = ${lit(t)});`);
  }
  for (const [nombre, p] of productos) {
    // Desde ADR-0109 todo producto lleva marca y proveedor: la pareja que la siembra deja.
    sql.push(
      `insert into retail.productos (id, referencia, codigo, estado, marca_id, proveedor_id) select ${lit(p.id)}, ${lit(nombre)}, ${lit(p.codigo)}, 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1;`,
    );
  }
  for (const f of filas) {
    const color = f.color ? `(select codigo from retail.colores where nombre = ${lit(f.color)} limit 1)` : "null";
    const talla = f.talla ? `(select id from retail.tallas where valor = ${lit(f.talla)} limit 1)` : "null";
    sql.push(
      `insert into retail.variantes (id, producto_id, color_codigo, talla_id, sku, precio, costo, activo, codigo) values (${lit(f.variante)}, ${lit(productos.get(f.producto).id)}, ${color}, ${talla}, ${lit(f.sku)}, 100, 40, true, ${lit(f.codigo ?? null)});`,
    );
    for (const codigo of f.codigos) sql.push(`insert into retail.codigos_barras (variante_id, codigo) values (${lit(f.variante)}, ${lit(codigo)});`);
    sql.push(`insert into fx values (${f.idx}, ${lit(f.id)}, ${lit(f.variante)});`);
  }
  sql.push("set local session_replication_role = origin;");
  // Los ids de las prendas del escenario que la búsqueda devuelve, en el orden de las filas; NULL = «no busca nada».
  sql.push(`create function pg_temp.q(consulta text) returns text language plpgsql as $$
    declare r uuid[];
    begin
      r := retail.fn_movimientos_variantes(consulta);
      if r is null then return 'TODAS'; end if;
      return coalesce((select string_agg(fx.id, ';' order by fx.idx) from fx where fx.variante = any(r)), '');
    end $$;`);
  escenario.casos.forEach((caso, i) => sql.push(`select 'R|${i}|' || pg_temp.q(${lit(caso.consulta)});`));
  return sql;
}

for (const escenario of CASOS.escenarios) {
  console.log(`\n1. Mismos casos que TypeScript — ${escenario.nombre} (${escenario.casos.length} consultas)`);
  let salida;
  try {
    salida = psql([...sqlEscenario(escenario), "rollback;"].join("\n"));
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del escenario falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 4).join(" ")}`);
    continue;
  }
  const r = leer(salida, "R");
  let distintas = 0;
  escenario.casos.forEach((caso, i) => {
    const esperado = caso.esperado === "todas" ? "TODAS" : caso.esperado.join(";");
    total += 1;
    if (r[i] === esperado) return;
    fallos += 1;
    distintas += 1;
    console.log(`  ✘ «${caso.consulta.replaceAll("\t", "\\t")}» — SQL: [${(r[i] ?? "(sin respuesta)").replaceAll(";", ", ")}] · esperado: [${esperado.replaceAll(";", ", ")}]${caso.nota ? ` (${caso.nota})` : ""}`);
  });
  if (distintas === 0) console.log(`  ✔ las ${escenario.casos.length} consultas responden igual que TypeScript`);
}

// ---------------------------------------------------------------------------
// 2. Contrato: en blanco, texto raro, permisos y rol de una persona logueada
// ---------------------------------------------------------------------------
{
  console.log("\n2. Contrato: en blanco, texto raro, permisos y rol de una persona logueada");
  const [escenario] = CASOS.escenarios;
  const base = sqlEscenario({ ...escenario, casos: [] });
  const rarezas = ["'", "''", "\\", "%", "_", "'; drop table retail.variantes; --", "a".repeat(600), "🙂 blusa", "blusa ) or ( 1=1", "tab\tsalto"];
  const sql = [
    ...base,
    // en blanco → NULL (nada que buscar); el resto devuelve un arreglo (posiblemente vacío) sin reventar
    `select 'K|blanco_vacio|' || (retail.fn_movimientos_variantes('') is null)::text;`,
    `select 'K|blanco_espacios|' || (retail.fn_movimientos_variantes('   ') is null)::text;`,
    `select 'K|blanco_puntuacion|' || (retail.fn_movimientos_variantes(' , ; ') is null)::text;`,
    `select 'K|blanco_nulo|' || (retail.fn_movimientos_variantes(null) is null)::text;`,
    ...rarezas.map((x, i) => `select 'K|rareza_${i}|' || pg_temp.q(${lit(x)});`),
    `select 'K|tabla_intacta|' || (select count(*) > 0 from retail.variantes)::text;`,
    // permisos: una sola firma viva; authenticated sí, anon no (ni la búsqueda ni sus ayudas)
    `select 'K|firmas|' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_movimientos_variantes';`,
    ...["fn_movimientos_variantes(text)", "fn_busqueda_singulares(text)", "fn_busqueda_formas_color(text)"].flatMap((f, i) => [
      `select 'K|auth_${i}|' || has_function_privilege('authenticated', 'retail.${f}', 'execute')::text;`,
      `select 'K|anon_${i}|' || has_function_privilege('anon', 'retail.${f}', 'execute')::text;`,
    ]),
    `select 'K|invoker|' || (not prosecdef)::text || '|' || provolatile::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_movimientos_variantes';`,
    // con el rol de una persona logueada: las mismas prendas que ve el dueño (la RLS no le esconde nada del catálogo).
    // Las políticas de colores y tallas piden `auth.role() = 'authenticated'`, que sale del JWT completo (como lo arma
    // PostgREST), no solo de `sub`: sin el rol en el JWT esas dos tablas se ven vacías y la prueba no imitaría a la app.
    `select 'K|n_dueno|' || coalesce(array_length(retail.fn_movimientos_variantes('blusa rosado m'), 1), 0);`,
    `set local role authenticated;`,
    `set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';`,
    `select 'K|n_authenticated|' || coalesce(array_length(retail.fn_movimientos_variantes('blusa rosado m'), 1), 0);`,
    `select 'K|n_authenticated_color|' || coalesce(array_length(retail.fn_movimientos_variantes('rosa'), 1), 0);`,
    `reset role;`,
    `select 'K|n_dueno_color|' || coalesce(array_length(retail.fn_movimientos_variantes('rosa'), 1), 0);`,
    "rollback;",
  ];
  let salida = "";
  try {
    salida = psql(sql.join("\n"));
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del contrato falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 4).join(" ")}`);
  }
  const d = leer(salida, "K");
  if (salida) {
    const igual = (clave, esperado, nombre) => afirmar(nombre, d[clave] === String(esperado), `${clave}=${JSON.stringify(d[clave])} esperado=${JSON.stringify(String(esperado))}`);
    igual("blanco_vacio", "true", "una consulta vacía no busca nada (NULL)");
    igual("blanco_espacios", "true", "una consulta de solo espacios tampoco");
    igual("blanco_puntuacion", "true", "ni una de puras comas y punto y coma");
    igual("blanco_nulo", "true", "ni NULL");
    rarezas.forEach((x, i) => afirmar(`texto raro #${i} no revienta y no trae ninguna prenda (${JSON.stringify(x.length > 24 ? `${x.slice(0, 20)}…` : x)})`, d[`rareza_${i}`] === ""));
    igual("tabla_intacta", "true", "«'; drop table…» se busca como texto: la tabla sigue ahí");
    igual("firmas", "1", "una sola firma viva de fn_movimientos_variantes");
    ["fn_movimientos_variantes", "fn_busqueda_singulares", "fn_busqueda_formas_color"].forEach((nombre, i) => {
      igual(`auth_${i}`, "true", `authenticated puede ejecutar ${nombre}`);
      igual(`anon_${i}`, "false", `anon NO puede ejecutar ${nombre}`);
    });
    igual("invoker", "true|s", "fn_movimientos_variantes sigue siendo invoker y stable (quien la llama ve lo que su rol ya veía)");
    afirmar("una persona logueada encuentra lo mismo que el dueño: «blusa rosado m»", Number(d.n_dueno) >= 2 && d.n_authenticated === d.n_dueno, `dueño=${d.n_dueno} authenticated=${d.n_authenticated}`);
    afirmar("…y «rosa» (color con equivalentes) también", Number(d.n_dueno_color) >= 6 && d.n_authenticated_color === d.n_dueno_color, `dueño=${d.n_dueno_color} authenticated=${d.n_authenticated_color}`);
  }
}

// ---------------------------------------------------------------------------
// 3. El historial completo usa esas reglas: lista y tarjetas cuentan lo mismo
// ---------------------------------------------------------------------------
{
  console.log("\n3. Historial: fn_movimientos y fn_movimientos_resumen usan la búsqueda especial");
  const conteos = [
    ["zafiro rosado m", 1, "una prenda: nombre + color + talla, en cualquier orden"],
    ["m rosado blusa zafiro", 1, "el orden no importa"],
    ["zafiro negro m", 1, "el otro color"],
    ["blusa zafiro m", 2, "las dos M de esa blusa"],
    ["blusas zafiro", 2, "en plural"],
    ["zafiro rosado", 1, "sin talla"],
    ["zafiro l", 0, "una talla que esa blusa no tiene"],
    ["zafiro blanca", 0, "un color que esa blusa no tiene"],
    ["blusa talla m de color rosado zafiro", 1, "con las palabras que solo acompañan"],
  ];
  const sql = `
begin;
set local session_replication_role = replica;
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select id as sa from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset

insert into retail.colores (codigo, nombre) select 'ZZ' || substr(md5('Rosado'), 1, 8), 'Rosado' where not exists (select 1 from retail.colores where nombre = 'Rosado');
insert into retail.colores (codigo, nombre) select 'ZZ' || substr(md5('Negro'), 1, 8), 'Negro' where not exists (select 1 from retail.colores where nombre = 'Negro');
insert into retail.tallas (valor) select 'M' where not exists (select 1 from retail.tallas where valor = 'M');

insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'Blusa Zafiro', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1 returning id as prod \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo, activo)
  values (:'prod', (select codigo from retail.colores where nombre = 'Rosado' limit 1), (select id from retail.tallas where valor = 'M' limit 1), 'ZZ-ZAFIRO-ROS-M', 100, 40, true) returning id as v1 \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo, activo)
  values (:'prod', (select codigo from retail.colores where nombre = 'Negro' limit 1), (select id from retail.tallas where valor = 'M' limit 1), 'ZZ-ZAFIRO-NEG-M', 100, 40, true) returning id as v2 \\gset
set local session_replication_role = origin;

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo) values (:'v1', :'ubic', :'sa', 'entrada', 3, 'recepcion') returning id as m1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo) values (:'v2', :'ubic', :'sa', 'entrada', 2, 'recepcion') returning id as m2 \\gset

create function pg_temp.n(u uuid, q text) returns int language sql as $$
  select count(*)::int from retail.fn_movimientos(u, p_busqueda => q, p_limite => 200)
$$;
create function pg_temp.nr(u uuid, q text) returns int language sql as $$
  select coalesce(sum(movimientos), 0)::int from retail.fn_movimientos_resumen(u, p_busqueda => q)
$$;
${conteos.map(([q], i) => `select 'K|n_${i}|' || pg_temp.n(:'ubic', ${lit(q)}) || '|' || pg_temp.nr(:'ubic', ${lit(q)});`).join("\n")}
select 'K|id_rosado|' || (select count(*) from retail.fn_movimientos(:'ubic', p_busqueda => 'zafiro rosado m', p_limite => 200) f where f.id = :'m1');
select 'K|id_negro_fuera|' || (select count(*) from retail.fn_movimientos(:'ubic', p_busqueda => 'zafiro rosado m', p_limite => 200) f where f.id = :'m2');
rollback;`;
  let salida = "";
  try {
    salida = psql(sql);
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del historial falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 4).join(" ")}`);
  }
  if (salida) {
    const d = leer(salida, "K");
    conteos.forEach(([q, esperado, que], i) => afirmar(`«${q}» → ${esperado} en la lista y en las tarjetas (${que})`, d[`n_${i}`] === `${esperado}|${esperado}`, `lista|tarjetas=${d[`n_${i}`]}`));
    afirmar("«zafiro rosado m» trae el movimiento de la M rosada", d.id_rosado === "1");
    afirmar("…y deja fuera el de la M negra", d.id_negro_fuera === "0");
  }
}

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * La regla del precio por lotes (`20261031161000_tienda_precio_por_lotes.sql`) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. La migración que bajó el catálogo de la tienda de ~800 ms a ~330 ms en producción (2026-10-31) sin cambiar lo que dice:
 *   1. `fn_precios_en_sedes` (la regla, por lotes) y `fn_precio_en_sede` (la de Vender, que ahora le pregunta a ella) dan, talla por talla
 *      y tienda por tienda —también sin tienda—, EXACTAMENTE el precio de la `fn_precio_en_sede` de antes (copiada abajo tal cual,
 *      `PRECIO_DE_ANTES`), con precio de la prenda en una tienda, uno archivado, la excepción de una combinación, una archivada, ropa en
 *      S/ 0 con precio de tienda y la talla de obsequio. Mutante: la regla con el orden cambiado (la prenda antes que la combinación).
 *   2. El precio de la tienda (`fn_tienda_precio_talla`), el catálogo (`tienda_catalogo`) y los looks (`tienda_looks`) devuelven
 *      EXACTAMENTE lo mismo que con las tres funciones de antes (la migración deshecha dentro de la transacción, con sus propias anclas),
 *      con «Todas», con cada tienda de la web, con el Taller y con una sede que no existe.
 *   3. Una carga del catálogo no llama a ninguna regla fila por fila: cero llamadas a `fn_precio_en_sede`, a `fn_tienda_empresa_se_ve`
 *      y a `fn_precios_en_sedes` (Postgres la mete en la consulta). Mutante: con un `set search_path`, Postgres ya no la mete y la prueba
 *      lo ve.
 *   4. Permisos: `fn_precios_en_sedes` no la ejecuta nadie de afuera; `fn_precio_en_sede` sigue siendo de `authenticated` y
 *      `security definer`; el catálogo sigue siendo solo de `tienda_web`.
 *   5. La migración se puede pegar dos veces, y se detiene sin tocar nada si `fn_precio_en_sede` cambió desde que se midió.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK, como Felipe (líder). Si la base local todavía no tiene la migración, la mete
 * dentro de cada transacción. Nunca se commitea nada en el Postgres local que comparten los worktrees.
 *
 * DA POR SENTADO: el seed («Blusa Emma» en BEI y NEG, «Pantalón Carla», «Falda Renata»; Tienda Trujillo, Tienda Lima y el Taller), la
 * tienda online (20261015012000 y siguientes), los precios por tienda (20261011100000, 20261028230000) y las empresas (20261020225000).
 *
 * USO
 *   pnpm pruebas:tienda-precio-por-lotes                 → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-precio-por-lotes -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261031161000_tienda_precio_por_lotes.sql";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin): publica en la Vitrina

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let total = 0;
let fallos = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida.split("\n").at(-1) === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
}
function esperarError(nombre, r, contiene) {
  esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `no falló: ${r.salida}` : `falló distinto: ${r.mensaje}`);
}

if (!correr("select 1;").ok) {
  console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
  process.exit(2);
}
if (correr("select to_regprocedure('retail.tienda_catalogo(uuid)') is not null;").salida !== "t") {
  console.error("Falta la tienda online en la base local: aplica las migraciones de supabase/migrations.");
  process.exit(2);
}

const SQL_MIGRACION = readFileSync(MIGRACION, "utf8");
const YA_APLICADA = correr("select to_regprocedure('retail.fn_precios_en_sedes(uuid[], uuid[])') is not null;").salida === "t";
const APLICAR = YA_APLICADA ? "" : `set client_min_messages = warning;\n${SQL_MIGRACION}\nreset client_min_messages;\n`;

// Las anclas de la migración (lo de antes `$v$` y lo nuevo `$n$`), leídas del propio archivo: deshacerla no repite su texto aquí.
const ANCLAS = [...SQL_MIGRACION.matchAll(/\$v\$([\s\S]*?)\$v\$,\s*\$n\$([\s\S]*?)\$n\$/g)].map((m) => ({ antes: m[1], nuevo: m[2] }));
if (ANCLAS.length !== 2) {
  console.error(`Se esperaban 2 reemplazos anclados en ${MIGRACION} (el precio de la tienda y el catálogo) y hay ${ANCLAS.length}.`);
  process.exit(2);
}

// `fn_precio_en_sede` tal como estaba en producción el 31-oct (md5 4c387dff06a6de9fa802f87c03eed16c), la referencia de la regla.
const PRECIO_DE_ANTES = String.raw`CREATE OR REPLACE FUNCTION retail.fn_precio_en_sede(p_variante_id uuid, p_ubicacion_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  -- La talla de OBSEQUIO —S/ 0 en la grilla, en una categoría que admite el 0 (Empaque, fn_categoria_admite_precio_cero, ADR-0384)—
  -- vale S/ 0 en TODA tienda: el precio de una tienda es de la prenda y no alcanza a lo que se regala. Todo lo demás, también la ropa
  -- con una talla en S/ 0 en su ficha, vale el de la prenda en esa tienda o, sin él, la grilla (20261015121000, Felipe 2026-10-15).
  select case when v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id) then v.precio
              else coalesce(
                -- ADR-0370 (act. 2026-10-28): lo primero es la excepción de ESTA combinación en ESTA tienda; si no hay, el precio de la prenda.
                (select pv.precio from retail.precios_sede_variante pv
                  where pv.variante_id = v.id and pv.ubicacion_id = p_ubicacion_id and pv.archivado_en is null),
                (select ps.precio from retail.precios_sede_prenda ps
                  where ps.producto_id = v.producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null),
                v.precio) end
    from retail.variantes v
    join retail.productos pr on pr.id = v.producto_id
   where v.id = p_variante_id;
$function$;
`;
const PRECIO_DE_ANTES_TEMP = PRECIO_DE_ANTES.replace(
  "CREATE OR REPLACE FUNCTION retail.fn_precio_en_sede(",
  "CREATE FUNCTION pg_temp.precio_de_antes(",
);

/** Deshace la migración DENTRO de la transacción: las tres funciones vuelven a como estaban. */
const DESHACER = `${PRECIO_DE_ANTES}
do $deshacer$
declare d text;
begin
  d := pg_get_functiondef('retail.fn_tienda_precio_talla(uuid[], uuid)'::regprocedure);
  if position($a1$${ANCLAS[0].nuevo}$a1$ in d) = 0 then raise exception 'deshacer: el precio de la tienda no tiene lo nuevo'; end if;
  execute replace(d, $a1$${ANCLAS[0].nuevo}$a1$, $b1$${ANCLAS[0].antes}$b1$);
  d := pg_get_functiondef('retail.tienda_catalogo(uuid)'::regprocedure);
  if position($a2$${ANCLAS[1].nuevo}$a2$ in d) = 0 then raise exception 'deshacer: el catálogo no tiene lo nuevo'; end if;
  execute replace(d, $a2$${ANCLAS[1].nuevo}$a2$, $b2$${ANCLAS[1].antes}$b2$);
end $deshacer$;
`;

/** Rompe una función de la base a propósito, dentro de la transacción. Si el texto a romper ya no está, el mutante está vacío y falla. */
const mutar = (firma, de, a) => `do $m$
declare d text := pg_get_functiondef('${firma}'::regprocedure);
begin
  if position($q$${de}$q$ in d) = 0 then raise exception 'mutante vacío: ${firma} no tiene «%»', $q$${de}$q$; end if;
  execute replace(d, $q$${de}$q$, $q$${a}$q$);
end $m$;\n`;

// ---- El punto de partida: Trujillo y Lima en la web; Emma, Carla y Falda publicadas; precios de tienda de todo tipo ----
// Trujillo: Emma con precio propio (99.90) y la excepción de su negro M (79.00); la excepción archivada de su beige S. Lima: el precio
// propio de Carla (120.00) y uno archivado de Emma. La talla negra M de Emma en S/ 0 en su ficha (ropa: vale lo de Trujillo) y Falda en
// una familia fuera de los motores con una talla en S/ 0 (obsequio: S/ 0 en toda tienda, aunque Lima le ponga precio).
const PREPARAR = `begin;
${APLICAR}
set local request.jwt.claim.sub = '${FELIPE}';
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as carla from retail.productos where referencia = 'Pantalón Carla' \\gset
select id as falda from retail.productos where referencia = 'Falda Renata' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
select v.id as neg_m from retail.variantes v join retail.tallas ta on ta.id = v.talla_id where v.producto_id = :'emma' and v.color_codigo = 'NEG' and ta.valor = 'M' \\gset
select v.id as bei_s from retail.variantes v join retail.tallas ta on ta.id = v.talla_id where v.producto_id = :'emma' and v.color_codigo = 'BEI' and ta.valor = 'S' \\gset
select v.id as falda_1 from retail.variantes v where v.producto_id = :'falda' and v.activo order by v.sku limit 1 \\gset
update retail.ubicacion_datos_web set mostrar = false where mostrar;
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru' and whatsapp_numero is null;
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim' and whatsapp_numero is null;
select retail.vitrina_mostrar(array[:'emma', :'carla', :'falda']::uuid[], true) \\gset
update retail.precios_sede_prenda set archivado_en = now() where archivado_en is null and producto_id in (:'emma', :'carla', :'falda');
update retail.precios_sede_variante set archivado_en = now() where archivado_en is null
   and variante_id in (select id from retail.variantes where producto_id in (:'emma', :'carla', :'falda'));
insert into retail.precios_sede_prenda (producto_id, ubicacion_id, precio, motivo) values
  (:'emma', :'tru', 99.90, 'ZZ prueba por lotes'), (:'carla', :'lim', 120.00, 'ZZ prueba por lotes');
insert into retail.precios_sede_prenda (producto_id, ubicacion_id, precio, motivo, archivado_en) values
  (:'emma', :'lim', 55.00, 'ZZ archivado', now());
insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo) values (:'neg_m', :'tru', 79.00, 'ZZ excepción');
insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo, archivado_en) values
  (:'bei_s', :'tru', 11.00, 'ZZ excepción archivada', now());
update retail.variantes set precio = 0 where id in (:'neg_m', :'falda_1');
-- Falda pasa a una categoría propia de una familia fuera de los motores (Empaque): su talla en S/ 0 es de obsequio. Las demás prendas
-- siguen en sus familias (si se apagara «indumentaria», Emma y Carla también dejarían la web).
insert into retail.familias (codigo, nombre, entra_a_motores) values ('zz_empaque', 'ZZ Empaque', false);
update retail.categorias set familia = 'zz_empaque' where id = (select p.categoria_id from retail.productos p where p.id = :'falda');
insert into retail.precios_sede_prenda (producto_id, ubicacion_id, precio, motivo) values (:'falda', :'lim', 45.00, 'ZZ precio de tienda');
`;

// Todas las tallas contra todas las sedes (y sin sede): cuántas difieren de la regla de antes.
const DIFERENCIAS_REGLA = `${PRECIO_DE_ANTES_TEMP}
select concat_ws('|',
  (select count(*) from retail.variantes v cross join (select u.id from retail.ubicaciones u union all select null) s
    where retail.fn_precio_en_sede(v.id, s.id) is distinct from pg_temp.precio_de_antes(v.id, s.id)),
  (select count(*) from retail.fn_precios_en_sedes(array(select id from retail.variantes), array(select id from retail.ubicaciones)) x
    where x.precio is distinct from pg_temp.precio_de_antes(x.variante_id, x.ubicacion_id)),
  (select count(*) from retail.fn_precios_en_sedes(array(select id from retail.variantes), array(select id from retail.ubicaciones)))
    = (select count(*) from retail.variantes) * (select count(*) from retail.ubicaciones),
  retail.fn_precio_en_sede(:'neg_m', :'tru'), retail.fn_precio_en_sede(:'neg_m', :'lim'), retail.fn_precio_en_sede(:'bei_s', :'tru'),
  retail.fn_precio_en_sede(:'falda_1', :'lim'), retail.fn_precio_en_sede(gen_random_uuid(), :'tru') is null);
`;

// ---------------------------------------------------------------- 1. La regla
console.log("— 1. La regla del precio, por lotes y de a una —");
esperarValor(
  "fn_precio_en_sede y fn_precios_en_sedes dan el precio de antes en TODA talla y TODA sede (y sin sede): combinación 79 > prenda 99.90 en Trujillo, ropa en S/ 0 vale lo de su tienda, archivados no cuentan, obsequio en S/ 0 aunque Lima le ponga precio",
  correr(`${PREPARAR}${DIFERENCIAS_REGLA}rollback;`),
  "0|0|t|79.00|0.00|99.90|0.00|t",
);
{
  const r = correr(`${PREPARAR}${mutar(
    "retail.fn_precios_en_sedes(uuid[], uuid[])",
    "coalesce(pv.precio, ps.precio, v.precio)",
    "coalesce(ps.precio, pv.precio, v.precio)",
  )}${DIFERENCIAS_REGLA}rollback;`);
  esperar(
    "MUTANTE la regla pone la prenda antes que la combinación: la comparación lo ve",
    r.ok && !r.salida.split("\n").at(-1).startsWith("0|0|"),
    r.ok ? r.salida : r.mensaje,
  );
}

// ---------------------------------------------------------------- 2. Lo que ve la tienda
console.log("— 2. El precio de la tienda, el catálogo y los looks, igual que antes —");
/** Guarda lo que devuelven las tres con cada sede, deshace la migración y cuenta las diferencias contra lo de antes. */
const SEDES = `(values (null::uuid), (:'tru'), (:'lim'), (:'taller'), ('00000000-0000-4000-8000-0000000000ff'::uuid)) as s (id)`;
const FOTO = (tabla) => `create temp table ${tabla} on commit drop as
  select s.id as sede, retail.tienda_catalogo(s.id)::text as catalogo, retail.tienda_looks(s.id)::text as looks,
         (select coalesce(jsonb_agg(to_jsonb(t) order by t.variante_id), '[]'::jsonb)::text
            from retail.fn_tienda_precio_talla(array(select v.id from retail.variantes v), s.id) t) as precio
    from ${SEDES};
`;
const IGUALES = `${FOTO("nuevo")}${DESHACER}${FOTO("viejo")}
select concat_ws('|',
  (select count(*) from nuevo n join viejo o on o.sede is not distinct from n.sede
    where n.catalogo <> o.catalogo or n.looks <> o.looks or n.precio <> o.precio),
  (select count(*) from nuevo),
  (select min(jsonb_array_length((n.catalogo::jsonb) -> 'prendas')) > 0 from nuevo n where n.sede is null));
`;
esperarValor(
  "con «Todas», Trujillo, Lima, el Taller y una sede que no existe: el catálogo, los looks y el precio de cada talla son idénticos a los de antes, letra por letra",
  correr(`${PREPARAR}${IGUALES}rollback;`),
  "0|5|t",
);
{
  const r = correr(`${PREPARAR}${mutar(
    "retail.fn_tienda_precio_talla(uuid[], uuid)",
    "select x.variante_id, max(x.precio) as precio",
    "select x.variante_id, min(x.precio) as precio",
  )}${FOTO("nuevo")}${mutar(
    "retail.fn_tienda_precio_talla(uuid[], uuid)",
    "select x.variante_id, min(x.precio) as precio",
    "select x.variante_id, max(x.precio) as precio",
  )}${DESHACER}${FOTO("viejo")}
select count(*) from nuevo n join viejo o on o.sede is not distinct from n.sede where n.precio <> o.precio;
rollback;`);
  esperar(
    "MUTANTE con «Todas» la tienda toma el MENOR precio entre sus tiendas: la comparación lo ve",
    r.ok && Number(r.salida.split("\n").at(-1)) > 0,
    r.ok ? r.salida : r.mensaje,
  );
}

// ---------------------------------------------------------------- 3. Sin llamadas fila por fila
console.log("— 3. Una carga del catálogo no pregunta fila por fila —");
const LLAMADAS = `set local track_functions = 'all';
select jsonb_array_length(retail.tienda_catalogo(null) -> 'prendas') as prendas \\gset n_
select concat_ws('|', :n_prendas > 0,
  coalesce((select sum(calls) from pg_stat_xact_user_functions where schemaname = 'retail'
             and funcname in ('fn_precio_en_sede', 'fn_tienda_empresa_se_ve', 'fn_precios_en_sedes')), 0));
`;
esperarValor(
  "cero llamadas a fn_precio_en_sede, fn_tienda_empresa_se_ve y fn_precios_en_sedes (Postgres mete la regla en la consulta)",
  correr(`${PREPARAR}${LLAMADAS}rollback;`),
  "t|0",
);
{
  const r = correr(`${PREPARAR}${mutar("retail.fn_precios_en_sedes(uuid[], uuid[])", " STABLE\n", " STABLE\n SET search_path TO 'retail', 'public'\n")}${LLAMADAS}rollback;`);
  esperar(
    "MUTANTE con un set search_path en fn_precios_en_sedes, Postgres deja de meterla en la consulta y la prueba lo ve",
    r.ok && r.salida.split("\n").at(-1) !== "t|0",
    r.ok ? r.salida : r.mensaje,
  );
}

// ---------------------------------------------------------------- 4. Permisos
console.log("— 4. Permisos —");
esperarValor(
  "fn_precios_en_sedes no la ejecuta anon, authenticated ni tienda_web; fn_precio_en_sede sigue siendo de authenticated y security definer; el catálogo, de tienda_web",
  correr(`begin;
${APLICAR}
select concat_ws('|',
  has_function_privilege('anon', 'retail.fn_precios_en_sedes(uuid[], uuid[])', 'EXECUTE'),
  has_function_privilege('authenticated', 'retail.fn_precios_en_sedes(uuid[], uuid[])', 'EXECUTE'),
  has_function_privilege('tienda_web', 'retail.fn_precios_en_sedes(uuid[], uuid[])', 'EXECUTE'),
  has_function_privilege('authenticated', 'retail.fn_precio_en_sede(uuid, uuid)', 'EXECUTE'),
  (select prosecdef from pg_proc where oid = 'retail.fn_precio_en_sede(uuid, uuid)'::regprocedure),
  has_function_privilege('tienda_web', 'retail.tienda_catalogo(uuid)', 'EXECUTE'),
  has_function_privilege('authenticated', 'retail.tienda_catalogo(uuid)', 'EXECUTE'));
rollback;`),
  "f|f|f|t|t|t|f",
);

// ---------------------------------------------------------------- 5. La migración
console.log("— 5. La migración —");
esperarValor(
  "se puede pegar dos veces y no cambia nada la segunda",
  correr(`begin;
set client_min_messages = warning;
${SQL_MIGRACION}
select md5(string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.proname)) as antes from pg_proc p
 where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_precio_en_sede', 'fn_precios_en_sedes', 'fn_tienda_precio_talla', 'tienda_catalogo') \\gset
${SQL_MIGRACION}
select md5(string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.proname)) = :'antes' from pg_proc p
 where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_precio_en_sede', 'fn_precios_en_sedes', 'fn_tienda_precio_talla', 'tienda_catalogo');
rollback;`),
  "t",
);
esperarError(
  "se detiene sin tocar nada si fn_precio_en_sede cambió desde que se midió",
  correr(`begin;
${PRECIO_DE_ANTES.replace("  select case when", "  -- alguien le agregó algo\n  select case when")}
${SQL_MIGRACION}
rollback;`),
  "fn_precio_en_sede cambió desde que se midió",
);

console.log(`\n${total - fallos}/${total} escenarios en verde.`);
if (fallos > 0) process.exit(1);

#!/usr/bin/env node
/**
 * La tienda online carga rápido sin cambiar lo que muestra (optimización del 2026-10-17) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Las tres migraciones que bajaron el catálogo de la tienda de ~2,4 s a ~0,3 s en producción:
 *   1. `20261017171000_tienda_precio_una_vez_por_talla.sql`: en una carga del catálogo, `fn_precio_en_sede` se llama UNA vez por talla
 *      y por tienda de la web (antes, 9 veces: 31 914 llamadas con 1 773 tallas), y `fn_tienda_precio_talla` devuelve lo mismo que la
 *      versión sin materializar, con «Todas», con cada tienda y con campaña. Mutante: sin el `materialized`, las llamadas suben.
 *   2. `20261017172000_tienda_revisar_prenda_sin_replanear.sql`: la cadena «¿se puede mostrar?» (`fn_tienda_modelo_se_ve`,
 *      `fn_vitrina_publicable`, `fn_vitrina_por_que_no`, `fn_categoria_entra_a_motores`) está en PL/pgSQL, con su `security definer`,
 *      su `search_path` y sus permisos de antes, y la regla sigue diciendo lo mismo. Mutante: una de vuelta en SQL.
 *   3. `20261017173000_tienda_catalogo_por_prenda_una_vez.sql`: `tienda_catalogo` devuelve EXACTAMENTE el mismo JSON que la versión de
 *      antes (copiada abajo tal cual, `CATALOGO_DE_ANTES`) con prendas en dos colores, fotos de color y sin color, una foto que no es del
 *      almacén público, campaña, precio propio de una tienda, stock en una tienda y en otra, Lo nuevo y Más vendidos; con «Todas», con
 *      cada tienda, con una sede que no está en la web, sin tiendas en la web y con la vitrina vacía. Mutante: tres fotos en vez de dos.
 *   4. Las tres migraciones se pueden volver a correr, y la 2 y la 3 se detienen sin tocar nada si la función viva cambió.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK, como Felipe (líder). Parte con la vitrina vacía, sin campañas, con Trujillo
 * y Lima en la web y umbral 3, y publica «Blusa Emma», «Pantalón Carla» y «Falda Renata» del seed. Nunca se commitea nada en el Postgres
 * local que comparten los worktrees.
 *
 * DA POR SENTADO: el seed (Felipe líder; «Blusa Emma» en BEI y NEG, tallas S/M/L; «Pantalón Carla»; «Falda Renata»; Tienda Trujillo y
 * Tienda Lima con piso; el Taller), la tienda online (20261015012000, 013000 y 215000), la Vitrina (20261014225000 y 20261015122000) y
 * las tres migraciones de arriba.
 *
 * USO
 *   pnpm pruebas:tienda-rapida                    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-rapida -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)
const M1 = "supabase/migrations/20261017171000_tienda_precio_una_vez_por_talla.sql";
const M2 = "supabase/migrations/20261017172000_tienda_revisar_prenda_sin_replanear.sql";
const M3 = "supabase/migrations/20261017173000_tienda_catalogo_por_prenda_una_vez.sql";

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
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
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

// ---- El punto de partida: vitrina vacía, sin campañas, Trujillo y Lima en la web, umbral 3; Emma, Carla y Falda publicadas ----
const PREPARAR = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
update retail.vitrina_productos set publicado = false where publicado;
update retail.etiquetas set activo = false where activo and descuento_pct is not null;
update retail.ubicacion_datos_web set mostrar = false where mostrar;
update retail.configuracion_tienda_web set quedan_pocas_desde = 3 where id;
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as carla from retail.productos where referencia = 'Pantalón Carla' \\gset
select id as falda from retail.productos where referencia = 'Falda Renata' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
select id as tru_piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as lim_piso from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' \\gset
select v.id as neg_m from retail.variantes v join retail.tallas ta on ta.id = v.talla_id where v.producto_id = :'emma' and v.color_codigo = 'NEG' and ta.valor = 'M' \\gset
select v.id as bei_s from retail.variantes v join retail.tallas ta on ta.id = v.talla_id where v.producto_id = :'emma' and v.color_codigo = 'BEI' and ta.valor = 'S' \\gset
select v.id as carla_1 from retail.variantes v where v.producto_id = :'carla' and v.activo order by v.sku limit 1 \\gset
update retail.stock set cantidad = 0, cantidad_apartada = 0
 where variante_id in (select id from retail.variantes where producto_id in (:'emma', :'carla', :'falda')) and (cantidad <> 0 or cantidad_apartada <> 0);
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
select retail.vitrina_mostrar(array[:'emma', :'carla', :'falda']::uuid[], true) \\gset
`;

/** Deja EXACTAMENTE `cantidad` de una talla en el piso de una tienda. */
const poner = (variante, sede, piso, cantidad) =>
  `insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
   values (:'${variante}', :'${sede}', :'${piso}', ${cantidad}, 0)
   on conflict on constraint stock_variante_ubicacion_sububicacion_key
   do update set cantidad = excluded.cantidad, cantidad_apartada = excluded.cantidad_apartada;\n`;

// Lo que distingue a cada prenda en el catálogo: fotos (de color, sin color y una que no es del almacén público), campaña en el negro de
// Emma, precio propio de Emma en Trujillo, stock en las dos tiendas, Carla fija en Lo nuevo (y llegó hace 5 días) y Emma se vendió (Más
// vendidos). Lo nuevo y Más vendidos no se comparan por su número (el seed también trae llegadas y ventas): basta con que estén.
const URL_FOTO = (archivo) => `'https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/${archivo}'`;
const VARIADO = `insert into retail.producto_fotos (producto_id, url, orden, es_principal, color_codigo) values
  (:'emma', ${URL_FOTO("emma-bei.jpg")}, 2, false, 'BEI'),
  (:'emma', ${URL_FOTO("emma-neg.jpg")}, 5, true, 'NEG'),
  (:'emma', ${URL_FOTO("emma-neg-2.jpg")}, 1, false, 'NEG'),
  (:'emma', 'https://x.supabase.co/storage/v1/object/sign/retail-compras-adjuntos/factura.jpg?token=1', 0, false, null),
  (:'emma', ${URL_FOTO("emma-suelta.jpg")}, 9, false, null),
  (:'carla', ${URL_FOTO("carla.jpg")}, 0, true, null);
insert into retail.etiquetas (nombre, estilo, activo, descuento_pct, vigente_hasta)
values ('ZZ Negro rápido', 'campana', true, 20, retail.fn_hoy_lima() + 6) returning id as etq \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id)
  select v.id, :'etq' from retail.variantes v where v.producto_id = :'emma' and v.activo and v.color_codigo = 'NEG';
select retail.poner_precio_sede(:'emma', :'tru', 99.90, 'Prueba de la tienda rápida') \\gset
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
  values (:'carla_1', :'tru', 'entrada', 1, 'carga_inicial', now() - interval '5 days');
update retail.vitrina_productos set en_lo_nuevo = 'fijo' where producto_id = :'carla';
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
  values (:'neg_m', :'lim', 'salida', 2, 'venta', now() - interval '2 days');
${poner("neg_m", "tru", "tru_piso", 5)}${poner("bei_s", "tru", "tru_piso", 1)}${poner("neg_m", "lim", "lim_piso", 2)}${poner("carla_1", "lim", "lim_piso", 4)}`;

/** Rompe una función de la base a propósito, dentro de la transacción. Si el texto a romper ya no está, el mutante está vacío y falla. */
const mutar = (firma, de, a) => `do $m$
declare d text := pg_get_functiondef('${firma}'::regprocedure);
begin
  if position($q$${de}$q$ in d) = 0 then raise exception 'mutante vacío: ${firma} no tiene «%»', $q$${de}$q$; end if;
  execute replace(d, $q$${de}$q$, $q$${a}$q$);
end $m$;\n`;

// ---------------------------------------------------------------- 1. El precio, una vez por talla y tienda (20261017171000)
console.log("— 1. El precio, una vez por talla y tienda —");
/** ¿Una carga del catálogo llamó a `fn_precio_en_sede` exactamente (tallas activas publicadas × tiendas que cuentan) veces? */
const UNA_VEZ = (sede, tiendas) => `set local track_functions = 'all';
select jsonb_array_length(retail.tienda_catalogo(${sede}) -> 'prendas') \\gset n_
select coalesce((select calls from pg_stat_xact_user_functions where schemaname = 'retail' and funcname = 'fn_precio_en_sede'), 0)
       = (select count(*) * ${tiendas} from retail.variantes v where v.producto_id in (:'emma', :'carla', :'falda') and v.activo);\n`;
esperarValor(
  "con «Todas», una carga del catálogo calcula el precio de cada talla UNA vez en cada una de las 2 tiendas de la web",
  correr(`${PREPARAR}${VARIADO}${UNA_VEZ("null", 2)}rollback;`),
  "t",
);
esperarValor(
  "con una tienda elegida, una vez por talla, solo en esa tienda",
  correr(`${PREPARAR}${VARIADO}${UNA_VEZ(":'tru'", 1)}rollback;`),
  "t",
);
{
  // Sin el `materialized` (la versión de antes), cada precio se vuelve a calcular en cada lugar donde se nombra.
  const r = correr(`${PREPARAR}${VARIADO}${mutar("retail.fn_tienda_precio_talla(uuid[], uuid)", "  base as materialized (", "  base as (")}${mutar(
    "retail.fn_tienda_precio_talla(uuid[], uuid)",
    "  con_campana as materialized (",
    "  con_campana as (",
  )}${UNA_VEZ("null", 2)}rollback;`);
  esperar(
    "MUTANTE sin el materialized: el catálogo vuelve a calcular cada precio varias veces, y la prueba lo ve",
    r.ok && r.salida.split("\n").at(-1) === "f",
    r.ok ? r.salida : r.mensaje,
  );
}
/** La versión sin materializar, como referencia (`pg_temp`), para comparar lo que devuelve. */
const PRECIO_DE_ANTES = `do $r$
declare d text := pg_get_functiondef('retail.fn_tienda_precio_talla(uuid[], uuid)'::regprocedure);
begin
  d := replace(d, '  base as materialized (', '  base as (');
  d := replace(d, '  con_campana as materialized (', '  con_campana as (');
  d := replace(d, 'CREATE OR REPLACE FUNCTION retail.fn_tienda_precio_talla(', 'CREATE FUNCTION pg_temp.precio_talla_de_antes(');
  execute d;
end $r$;
create function pg_temp.diferencias_precio(p_sede uuid) returns bigint language sql as $f$
  with v as (select array(select x.id from retail.variantes x
                           where x.producto_id in (select vp.producto_id from retail.vitrina_productos vp where vp.publicado)) as ids),
  a as (select t.* from v, retail.fn_tienda_precio_talla(v.ids, p_sede) t),
  b as (select t.* from v, pg_temp.precio_talla_de_antes(v.ids, p_sede) t)
  select (select count(*) from (select * from a except all select * from b) x) + (select count(*) from (select * from b except all select * from a) y)
$f$;\n`;
esperarValor(
  "lo que devuelve fn_tienda_precio_talla es lo mismo que la versión sin materializar: con «Todas», con Trujillo (precio propio), con Lima y con el Taller",
  correr(`${PREPARAR}${VARIADO}${PRECIO_DE_ANTES}select concat_ws('|', pg_temp.diferencias_precio(null), pg_temp.diferencias_precio(:'tru'),
      pg_temp.diferencias_precio(:'lim'), pg_temp.diferencias_precio(:'taller'),
      (select count(*) from retail.fn_tienda_precio_talla(array(select x.id from retail.variantes x where x.producto_id = :'emma'), null) t where t.descuento > 0) > 0);
    rollback;`),
  "0|0|0|0|t",
);

// ---------------------------------------------------------------- 2. La revisión de cada prenda, sin volver a planear (20261017172000)
console.log("— 2. La revisión de cada prenda, sin volver a planear —");
const CADENA = `select string_agg(concat_ws(',', p.proname, l.lanname, p.prosecdef, coalesce(array_to_string(p.proconfig, ';'), '-')), ' ' order by p.proname)
  from pg_proc p join pg_language l on l.oid = p.prolang join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname in ('fn_categoria_entra_a_motores', 'fn_tienda_modelo_se_ve', 'fn_vitrina_por_que_no', 'fn_vitrina_publicable');\n`;
const CADENA_ESPERADA =
  "fn_categoria_entra_a_motores,plpgsql,f,- fn_tienda_modelo_se_ve,plpgsql,f,search_path=retail, public " +
  "fn_vitrina_por_que_no,plpgsql,t,search_path=retail, public fn_vitrina_publicable,plpgsql,t,search_path=retail, public";
esperarValor(
  "las cuatro piezas de «¿se puede mostrar?» están en PL/pgSQL (guardan su plan) con el security definer y el search_path de antes",
  correr(`begin;\n${CADENA}rollback;`),
  CADENA_ESPERADA,
);
esperarValor(
  "nadie de la API las ejecuta (tampoco tienda_web): los permisos de antes",
  correr(`begin;
select bool_or(has_function_privilege(r, f, 'EXECUTE'))::text
  from unnest(array['retail.fn_tienda_modelo_se_ve(uuid)', 'retail.fn_vitrina_por_que_no(uuid)', 'retail.fn_vitrina_publicable(uuid)']) f,
       unnest(array['tienda_web', 'anon']) r;
rollback;`),
  "false",
);
esperarValor(
  "la regla dice lo mismo: Emma se ve; Falda en S/ 0 sin precio de tienda, «sin_precio»; un id que no existe, «no_existe»; una despublicada no se ve; sin familia de motores, «empaque»",
  correr(`${PREPARAR}update retail.variantes set precio = 0 where producto_id = :'falda';
    select concat_ws('|', coalesce(retail.fn_vitrina_por_que_no(:'emma'), 'se puede'), retail.fn_vitrina_por_que_no(:'falda'),
      retail.fn_vitrina_por_que_no('00000000-0000-4000-8000-000000000000'), retail.fn_tienda_modelo_se_ve(:'emma'), retail.fn_vitrina_publicable(:'falda'));
    update retail.vitrina_productos set publicado = false where producto_id = :'emma';
    select retail.fn_tienda_modelo_se_ve(:'emma');
    insert into retail.familias (codigo, nombre, entra_a_motores) values ('zzempaque', 'ZZ Empaque', false);
    insert into retail.categorias (nombre, familia, prefijo) values ('ZZ Bolsas', 'zzempaque', 'ZZB') returning id as cat_bolsa \\gset
    update retail.productos set categoria_id = :'cat_bolsa' where id = :'carla';
    select concat_ws('|', retail.fn_vitrina_por_que_no(:'carla'), retail.fn_categoria_entra_a_motores(:'cat_bolsa'), retail.fn_categoria_entra_a_motores(null));
    rollback;`),
  "se puede|sin_precio|no_existe|t|f\nf\nempaque|f|t",
);
{
  const r = correr(`begin;
create or replace function retail.fn_vitrina_publicable(p_producto_id uuid) returns boolean language sql stable security definer
  set search_path to 'retail', 'public' as $f$ select retail.fn_vitrina_por_que_no(p_producto_id) is null $f$;
${CADENA}rollback;`);
  esperar(
    "MUTANTE fn_vitrina_publicable de vuelta en SQL (vuelve a planear su cuerpo en cada prenda): la prueba lo ve",
    r.ok && r.salida !== CADENA_ESPERADA,
    r.ok ? r.salida : r.mensaje,
  );
}

// ---------------------------------------------------------------- 3. El catálogo arma lo de cada prenda una vez (20261017173000)
console.log("— 3. El catálogo arma lo de cada prenda una vez —");
// La versión de antes, TAL CUAL (md5 c88267810363f873024446590c1bc49b), como referencia: el catálogo nuevo tiene que devolver lo mismo.
const CATALOGO_DE_ANTES = String.raw`CREATE FUNCTION pg_temp.catalogo_de_antes(p_sede uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public'
AS $function$
declare
  v_sedes uuid[] := retail.fn_tienda_sedes_web();
  v_umbral integer := retail.fn_tienda_umbral();
  v_sede uuid;
  v_ids uuid[];
begin
  v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);
  v_ids := array(select vp.producto_id from retail.vitrina_productos vp
                  where vp.publicado and retail.fn_vitrina_publicable(vp.producto_id));

  return (
    with pv as materialized (
      select * from retail.fn_tienda_precios(v_ids, v_sede)
    ),
    modelos as (
      select distinct on (pv.producto_id)
             pv.producto_id as id, pv.resumen_precio as precio, pv.resumen_final as final, pv.resumen_desde as desde,
             pv.resumen_campana as campana
        from pv
       order by pv.producto_id
    ),
    disponible as (
      select d.producto_id, d.ubicacion_id, sum(d.disponible)::integer as n
        from retail.fn_tienda_disponible(v_ids, v_sedes) d
       where d.variante_id in (select pv.variante_id from pv)
       group by d.producto_id, d.ubicacion_id
    ),
    nuevo as (select * from retail.fn_tienda_lo_nuevo(v_ids)),
    vendidos as (select * from retail.fn_tienda_mas_vendidos(v_ids)),
    foto_ok as (
      select pf.producto_id, pf.color_codigo, pf.url, pf.es_principal, pf.orden, pf.created_at, pf.id
        from retail.producto_fotos pf
       where pf.producto_id = any (v_ids)
         and pf.url ~ '^https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/'
    )
    select jsonb_build_object('sede', v_sede, 'prendas', coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'codigo', p.codigo,
        'nombre', p.referencia,
        'categoria', case when c.id is null then null else jsonb_build_object('nombre', c.nombre, 'prefijo', c.prefijo) end,
        'precio', m.precio,
        'precio_final', m.final,
        'desde', m.desde,
        'campana', m.campana,
        'colores', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex,
                   'foto', (select fo.url from foto_ok fo where fo.producto_id = m.id and fo.color_codigo = co.codigo
                             order by fo.es_principal desc, fo.orden, fo.created_at, fo.id limit 1))
                 order by co.orden, co.nombre)
            from retail.colores co
           where co.codigo in (select pv.color_codigo from pv where pv.producto_id = m.id)), '[]'::jsonb),
        'fotos', coalesce((
          select jsonb_agg(fo.url order by fo.n)
            from (select fo.url, row_number() over (order by fo.es_principal desc, fo.orden, fo.created_at, fo.id) as n
                    from foto_ok fo where fo.producto_id = m.id) fo
           where fo.n <= 2), '[]'::jsonb),
        'stock', jsonb_build_object(
          'total', retail.fn_tienda_nivel(coalesce((select sum(d.n) from disponible d where d.producto_id = m.id), 0)::integer, v_umbral),
          'sedes', coalesce((
            select jsonb_object_agg(s.id::text, retail.fn_tienda_nivel(coalesce(d.n, 0), v_umbral))
              from unnest(v_sedes) as s (id)
              left join disponible d on d.producto_id = m.id and d.ubicacion_id = s.id), '{}'::jsonb)),
        'nuevo', (select jsonb_build_object('dias', ln.dias) from nuevo ln where ln.producto_id = m.id),
        'vendidos', (select mv.puesto from vendidos mv where mv.producto_id = m.id)
      ) order by vp.publicado_en desc, p.referencia, m.id), '[]'::jsonb))
    from modelos m
    join retail.productos p on p.id = m.id
    join retail.vitrina_productos vp on vp.producto_id = m.id
    left join retail.categorias c on c.id = p.categoria_id
  );
end;
$function$;
`;
/** ¿El catálogo nuevo devuelve, byte a byte, lo mismo que el de antes con «Todas», Trujillo, Lima y el Taller (que no está en la web)? */
// Desde ADR-0465 el catálogo trae `empresa` en cada prenda (null fuera de una tienda con dos o más empresas) y esconde lo de una empresa que no
// opera en la tienda: esta prueba mide que la reescritura no cambie lo demás, así que compara sin esa clave (en esta base ninguna prenda es de CLAURE).
const SIN_EMPRESA = `create or replace function pg_temp.sin_empresa(j jsonb) returns jsonb language sql as $f$
  select jsonb_set(j, '{prendas}', coalesce((select jsonb_agg(p - 'empresa' order by n) from jsonb_array_elements(j -> 'prendas') with ordinality t (p, n)), '[]'::jsonb)) $f$;\n`;
const IGUALES = `${SIN_EMPRESA}select concat_ws('|', pg_temp.sin_empresa(retail.tienda_catalogo())::text = pg_temp.catalogo_de_antes()::text,
    pg_temp.sin_empresa(retail.tienda_catalogo(:'tru'))::text = pg_temp.catalogo_de_antes(:'tru')::text,
    pg_temp.sin_empresa(retail.tienda_catalogo(:'lim'))::text = pg_temp.catalogo_de_antes(:'lim')::text,
    pg_temp.sin_empresa(retail.tienda_catalogo(:'taller'))::text = pg_temp.catalogo_de_antes(:'taller')::text);\n`;
esperarValor(
  "el catálogo nuevo devuelve EXACTAMENTE el JSON de antes: con «Todas», Trujillo, Lima y el Taller; sin tiendas en la web; con la vitrina vacía",
  correr(`${PREPARAR}${VARIADO}${CATALOGO_DE_ANTES}${IGUALES}
    update retail.ubicacion_datos_web set mostrar = false where mostrar;
    ${IGUALES}
    update retail.vitrina_productos set publicado = false where publicado;
    ${IGUALES}
    rollback;`),
  "t|t|t|t\nt|t|t|t\nt|t|t|t",
);
esperarValor(
  "y lo que compara no está vacío: 3 prendas; Emma con 2 colores (cada uno con su foto), 2 fotos, campaña, nivel en las dos tiendas y Más vendidos; Carla en Lo nuevo",
  correr(`${PREPARAR}${VARIADO}
    with c as (select retail.tienda_catalogo() as j), e as (select x from c, jsonb_array_elements(c.j -> 'prendas') x where x ->> 'id' = :'emma'),
         k as (select x from c, jsonb_array_elements(c.j -> 'prendas') x where x ->> 'id' = :'carla')
    select concat_ws('|', (select jsonb_array_length(j -> 'prendas') from c),
      (select string_agg(co ->> 'codigo' || '=' || regexp_replace(co ->> 'foto', '^.*/', ''), ',' order by o) from e, jsonb_array_elements(e.x -> 'colores') with ordinality t(co, o)),
      (select string_agg(regexp_replace(f #>> '{}', '^.*/', ''), ',' order by o) from e, jsonb_array_elements(e.x -> 'fotos') with ordinality t(f, o)),
      (select e.x -> 'campana' ->> 'pct' from e), (select e.x -> 'stock' -> 'sedes' ->> :'tru' || ',' || (e.x -> 'stock' -> 'sedes' ->> :'lim') from e),
      (select e.x -> 'vendidos' <> 'null'::jsonb from e), (select k.x -> 'nuevo' <> 'null'::jsonb from k));
    rollback;`),
  "3|NEG=emma-neg.jpg,BEI=emma-bei.jpg|emma-neg.jpg,emma-neg-2.jpg|20.00|hay,2|t|t",
);
{
  const r = correr(`${PREPARAR}${VARIADO}${CATALOGO_DE_ANTES}${mutar("retail.tienda_catalogo(uuid)", "where f.n <= 2", "where f.n <= 3")}${IGUALES}rollback;`);
  esperar(
    "MUTANTE el catálogo nuevo trae tres fotos en vez de dos: ya no es igual al de antes, y la prueba lo ve",
    r.ok && r.salida.split("\n").at(-1) !== "t|t|t|t",
    r.ok ? r.salida : r.mensaje,
  );
}

// ---------------------------------------------------------------- 4. Las migraciones
console.log("— 4. Las migraciones —");
// `20261017173000` reescribe `tienda_catalogo` ENTERO («se vuelve a escribir igual»): vuelve a su cuerpo de siempre y se lleva lo que le sumaron
// 20261021000000 y 20261021001000 (ADR-0465: el filtro por empresa y la clave `empresa`). Para medir que el segundo pegado no cambia nada, se parte
// de ese cuerpo: se les quita lo de la empresa antes de medir.
const SIN_PARCHES_DE_EMPRESA = `do $quitar$
declare v_def text := pg_get_functiondef('retail.tienda_catalogo(uuid)'::regprocedure);
begin
  v_def := regexp_replace(v_def, '\\n\\s*-- ADR-0465: de qué empresa es la prenda[^\\n]*\\n\\s*''empresa'', case when[^\\n]*\\n\\s*then [^\\n]*end,', '');
  v_def := replace(v_def, E'\\n                  and retail.fn_tienda_empresa_se_ve(vp.producto_id, v_sede)', '');
  execute v_def;
end $quitar$;`;
const sql = (archivo) => readFileSync(archivo, "utf8");
esperarValor(
  "las tres se pueden volver a correr (dos veces seguidas, como un segundo pegado) y no cambian nada",
  correr(`begin;
${SIN_PARCHES_DE_EMPRESA}
select md5(string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.proname)) as antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname in ('fn_tienda_precio_talla', 'fn_categoria_entra_a_motores', 'fn_tienda_modelo_se_ve', 'fn_vitrina_por_que_no', 'fn_vitrina_publicable', 'tienda_catalogo') \\gset
set client_min_messages = warning;
${sql(M1)}\n${sql(M1)}\n${sql(M2)}\n${sql(M2)}\n${sql(M3)}\n${sql(M3)}
select md5(string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.proname)) = :'antes' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname in ('fn_tienda_precio_talla', 'fn_categoria_entra_a_motores', 'fn_tienda_modelo_se_ve', 'fn_vitrina_por_que_no', 'fn_vitrina_publicable', 'tienda_catalogo');
rollback;`),
  "t",
);
esperarError(
  "la 3 se detiene sin tocar nada si tienda_catalogo cambió desde que se midió (alguien le agregó algo)",
  correr(`begin;
${CATALOGO_DE_ANTES.replace("CREATE FUNCTION pg_temp.catalogo_de_antes(", "CREATE OR REPLACE FUNCTION retail.tienda_catalogo(").replace("  v_ids uuid[];", "  v_ids uuid[];\n  v_otro integer;")}
${sql(M3)}
rollback;`),
  "tienda_catalogo cambió desde que se midió",
);
esperarError(
  "la 2 se detiene sin tocar nada si una de sus funciones cambió y sigue en SQL",
  correr(`begin;
create or replace function retail.fn_vitrina_publicable(p_producto_id uuid) returns boolean language sql stable security definer
  set search_path to 'retail', 'public' as $f$ select retail.fn_vitrina_por_que_no(p_producto_id) is null and true $f$;
${sql(M2)}
rollback;`),
  "retail.fn_vitrina_publicable(uuid) cambió desde que se midió",
);
esperarError(
  "la 1 se detiene sin tocar nada si fn_tienda_precio_talla ya no tiene sus anclas",
  correr(`begin;
${mutar("retail.fn_tienda_precio_talla(uuid[], uuid)", "  base as materialized (", "  base as materialized  (")}
${sql(M1)}
rollback;`),
  "no aparece exactamente una vez",
);

function main() {
  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();

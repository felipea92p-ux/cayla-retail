#!/usr/bin/env node
/**
 * Prueba de Ventas ▸ Reportes ▸ Ranking de prendas (`20261103235000_reporte_ventas_ranking.sql`; usa el módulo `20261103224000_…` y, para cuadrar,
 * `20261103230000_reporte_ventas_mes.sql`).
 *
 * EL PROBLEMA. Un ranking de lo que más se vende decide qué se pide y qué se rebaja. Si cuenta una venta anulada, una de prueba o la bolsa de
 * obsequio, o mezcla «unidades» con «soles», o se come las prendas sin registrar sin decirlo, ordena mal y nadie lo ve.
 *
 * QUÉ CUBRE (enero de 2019, para no mezclarse con lo que haya en la base local; tres modelos con ventas conocidas)
 *   A. El orden: por unidades (con el desempate por soles) y por soles; por modelo y por color y talla.
 *   B. Las cuentas: lo vendido por fila, lo del período anterior del MISMO largo, el total, el total del período, los diez primeros.
 *   C. Lo que NO entra: la venta anulada, la de prueba, la del primer instante del mes siguiente, la bolsa/empaque (una familia fuera de los
 *      motores) y la prenda sin registrar (que se cuenta aparte, no se esconde).
 *   D. Los filtros: tienda, categoría, marca, talla, color y búsqueda; y que las tallas que se llevan sumen lo mismo que el total filtrado.
 *   E. «Quedan»: lo de las tiendas (no el taller), de una tienda si se la elige, y de la variante en «por color y talla».
 *   F. La página (tamaño y número) y la regla de oro: el ranking, más lo sin registrar, SUMA lo que dicen las cifras de «Ventas del mes».
 *   G. Quién ve qué: quien tiene el módulo ve solo su tienda; sin módulo, 42501; anon no ejecuta; un parámetro fuera de lista o de rango es 22023.
 *   H. Los atributos: función INVOKER, estable, sin `search_path` propio.
 *
 * CÓMO. UNA transacción con ROLLBACK (nunca se commitea nada en el Postgres local compartido); las migraciones se pegan antes. Se siembra con los
 * disparadores apagados (`session_replication_role = replica`): aquí se prueba la lectura, no la venta. Sesión simulada con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:reporte-ventas-ranking
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACIONES = ["20261103224000_reportes_ventas_modulo.sql", "20261103230000_reporte_ventas_mes.sql", "20261103235000_reporte_ventas_ranking.sql"].map((m) =>
  readFileSync(join(RAIZ, "supabase", "migrations", m), "utf8"),
);
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const CON_MODULO = "55555555-5555-4555-8555-0000000000a1"; // cuenta de Trujillo con el módulo en su rol (se crea aquí)
const SIN_MODULO = "55555555-5555-4555-8555-0000000000a2"; // cuenta de Trujillo sin el módulo (se crea aquí)
const ROL_CON = "55555555-5555-4555-8555-0000000000a3";
const ROL_SIN = "55555555-5555-4555-8555-0000000000a4";
const PERSONA_CON = "55555555-5555-4555-8555-0000000000a5";
const PERSONA_SIN = "55555555-5555-4555-8555-0000000000a6";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const LIMA = (ts) => `(timestamp '${ts}' at time zone 'America/Lima')`;
const J = (v) => `(:'${v}'::jsonb)`;
/** Lo que devuelve la función con los argumentos de siempre (enero de 2019) y los que se cambien. */
const RANK = (extra = "") => `retail.fn_reporte_ventas_ranking('2019-01-01', '2019-02-01'${extra})`;
/** Las filas como «nombre:unidades:vendido», en orden, para comparar de un vistazo. */
const FILAS = (v) =>
  `(select string_agg((x ->> 'nombre') || ':' || (x ->> 'unidades') || ':' || trim_scale((x ->> 'vendido')::numeric)::text, ' ' order by (x ->> 'pos')::int) from jsonb_array_elements(${J(v)} -> 'filas') x)`;
const NUM = (v, ...ruta) => `(${J(v)} #>> '{${ruta.join(",")}}')::numeric`;

const SQL = `
begin;
${MIGRACIONES.join("\n")}
reset search_path;

create function pg_temp.codigo(p_sql text) returns text language plpgsql as $f$
declare v_cod text; v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_msg = message_text;
  v_cod := sqlstate;
  return v_cod || ' ' || v_msg;
end $f$;
grant execute on function pg_temp.codigo(text) to authenticated, anon;

-- ---------- el catálogo de la prueba: tres modelos de categorías y marcas distintas ----------
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
select sede_base_id as sede_base from public.personas where auth_user_id = '${FELIPE}' \\gset
with t as (select producto_id, count(*) n from retail.variantes group by producto_id order by n desc, producto_id)
  select (select producto_id from t limit 1) as p1, (select producto_id from t offset 1 limit 1) as p2 \\gset
select categoria_id as c1 from retail.productos where id = :'p1' \\gset
select categoria_id as c2 from retail.productos where id = :'p2' \\gset
select p.id as p3 from retail.productos p join retail.variantes va on va.producto_id = p.id
  where p.categoria_id is not null and p.categoria_id not in (:'c1', :'c2') group by p.id order by count(*) desc, p.id limit 1 \\gset
select categoria_id as c3 from retail.productos where id = :'p3' \\gset
select (array_agg(id order by id))[1] as a1, (array_agg(id order by id))[2] as a2 from retail.variantes where producto_id = :'p1' \\gset
select (array_agg(id order by id))[1] as b1, (array_agg(id order by id))[2] as b2 from retail.variantes where producto_id = :'p2' \\gset
select (array_agg(id order by id))[1] as c1v from retail.variantes where producto_id = :'p3' \\gset
select va.id as sent from retail.variantes va join retail.productos p on p.id = va.producto_id where p.categoria_id is null limit 1 \\gset
select referencia as n1 from retail.productos where id = :'p1' \\gset
select referencia as n2 from retail.productos where id = :'p2' \\gset
select referencia as n3 from retail.productos where id = :'p3' \\gset
select (array_agg(id order by id))[1] as m1, (array_agg(id order by id))[2] as m2 from retail.marcas \\gset
select talla_id as ta1, color_codigo as co1 from retail.variantes where id = :'a1' \\gset
update retail.productos set marca_id = :'m1' where id in (:'p1', :'p2');
update retail.productos set marca_id = :'m2' where id = :'p3';

-- Cuentas: una de Trujillo CON el módulo en su rol y otra SIN
insert into auth.users (id, aud, role, email) values
  ('${CON_MODULO}', 'authenticated', 'authenticated', 'ranking-con@prueba.local'),
  ('${SIN_MODULO}', 'authenticated', 'authenticated', 'ranking-sin@prueba.local');
insert into retail.roles (id, nombre, descripcion) values
  ('${ROL_CON}', 'Ranking de prueba (con módulo)', 'Rol de prueba'),
  ('${ROL_SIN}', 'Ranking de prueba (sin módulo)', 'Rol de prueba');
insert into retail.rol_modulos (rol_id, modulo) values ('${ROL_CON}', 'reportes_ventas'), ('${ROL_SIN}', 'vender');
insert into public.personas (id, nombres, apellidos, estado, sede_base_id, auth_user_id) values
  ('${PERSONA_CON}', 'Con', 'Módulo', 'activo', :'sede_base', '${CON_MODULO}'),
  ('${PERSONA_SIN}', 'Sin', 'Módulo', 'activo', :'sede_base', '${SIN_MODULO}');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id, rol_id) values
  ('${PERSONA_CON}', 'colaborador', :'tru', '${ROL_CON}'),
  ('${PERSONA_SIN}', 'colaborador', :'tru', '${ROL_SIN}');

-- ---------- las ventas (con los disparadores apagados: se prueba la lectura) ----------
set local session_replication_role = replica;
create function pg_temp.venta(p_id text, p_ub uuid, p_cuando timestamptz, p_estado text, p_prueba boolean, p_precio numeric, p_cant int, p_var uuid)
returns void language plpgsql as $f$
begin
  insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, usuario_id, anulado_en, motivo_anulacion)
    values (md5('rk-' || p_id)::uuid, p_ub, p_cuando, p_estado, p_prueba, '${FELIPE}',
            case when p_estado = 'anulada' then p_cuando end, case when p_estado = 'anulada' then 'prueba' end);
  insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
    values (md5('rk-i-' || p_id)::uuid, md5('rk-' || p_id)::uuid, p_var, p_cant, p_precio, 0, 0);
end $f$;
-- Enero de 2019 (el período) y diciembre de 2018 (el anterior, del mismo largo: 31 días)
select pg_temp.venta('S1',  :'tru', ${LIMA("2019-01-10 10:00")}, 'completada', false, 50, 3, :'a1');    -- modelo 1 · 3 u · 150
select pg_temp.venta('S2',  :'tru', ${LIMA("2019-01-11 10:00")}, 'completada', false, 50, 2, :'a2');    -- modelo 1 · 2 u · 100  → 5 u · 250
select pg_temp.venta('S3',  :'tru', ${LIMA("2019-01-12 10:00")}, 'completada', false, 20, 4, :'b1');    -- modelo 2 · 4 u · 80
select pg_temp.venta('S4',  :'lim', ${LIMA("2019-01-13 10:00")}, 'completada', false, 100, 1, :'b2');   -- modelo 2 · 1 u · 100 (Lima) → 5 u · 180
select pg_temp.venta('S5',  :'tru', ${LIMA("2019-01-14 10:00")}, 'completada', false, 300, 1, :'c1v');  -- modelo 3 · 1 u · 300
select pg_temp.venta('S6',  :'tru', ${LIMA("2019-01-15 10:00")}, 'anulada', false, 50, 9, :'a1');       -- NO: anulada
select pg_temp.venta('S7',  :'tru', ${LIMA("2019-01-16 10:00")}, 'completada', true, 20, 9, :'b1');     -- NO: de prueba
select pg_temp.venta('S8',  :'tru', ${LIMA("2019-01-17 10:00")}, 'completada', false, 30, 2, :'sent');  -- sin registrar: se cuenta aparte
select pg_temp.venta('S11', :'tru', ${LIMA("2019-02-01 00:00")}, 'completada', false, 50, 1, :'a1');    -- NO: ya es febrero
select pg_temp.venta('S9',  :'tru', ${LIMA("2018-12-10 10:00")}, 'completada', false, 50, 1, :'a1');    -- anterior · modelo 1 · 1 u · 50
select pg_temp.venta('S13', :'tru', ${LIMA("2018-12-31 23:59")}, 'completada', false, 50, 1, :'a1');    -- anterior · modelo 1 · +1 u · 50 → 2 u · 100
select pg_temp.venta('S10', :'tru', ${LIMA("2018-12-12 10:00")}, 'completada', false, 20, 6, :'b1');    -- anterior · modelo 2 · 6 u · 120
-- Lo que queda en las tiendas (el taller no cuenta)
delete from retail.stock where variante_id in (select id from retail.variantes where producto_id in (:'p1', :'p2', :'p3'));
insert into retail.stock (variante_id, ubicacion_id, cantidad) values
  (:'a1', :'tru', 7), (:'a1', :'lim', 3), (:'a1', :'taller', 50), (:'a2', :'tru', 2);
set local session_replication_role = origin;

-- ---------- el líder ----------
set local role authenticated;
select set_config('request.jwt.claim.sub', '${FELIPE}', true);
select
  ${RANK()} as r1,
  ${RANK(", p_orden => 'soles'")} as soles,
  ${RANK(", p_nivel => 'variante'")} as variante,
  ${RANK(", p_categoria => :'c3'")} as cat,
  ${RANK(", p_marca => :'m2'")} as marca,
  ${RANK(", p_busqueda => lower(:'n2')")} as busca,
  ${RANK(", p_ubicacion => :'lim'")} as lima,
  ${RANK(", p_ubicacion => :'tru'")} as truj,
  ${RANK(", p_pagina => 1, p_por_pagina => 1")} as pag,
  ${RANK(", p_talla => :'ta1'")} as talla,
  ${RANK(", p_color => :'co1'")} as color,
  ${RANK(", p_nivel => 'variante', p_orden => 'soles'")} as varsoles \\gset k_
select retail.fn_reporte_ventas_mes('2019-01-15', null) as mes \\gset km_
create function pg_temp.esperado(p_col text, p_val text) returns numeric language plpgsql as $f$
declare v numeric;
begin
  -- Lo vendido en enero de 2019 de los tres modelos, calculado a mano desde las tablas (independiente de la función)
  execute format($q$select coalesce(sum(i.cantidad), 0) from retail.venta_items i join retail.ventas vt on vt.id = i.venta_id
      join retail.variantes va on va.id = i.variante_id join retail.productos pr on pr.id = va.producto_id
    where vt.estado = 'completada' and not vt.es_prueba and pr.categoria_id is not null
      and vt.created_at >= (timestamp '2019-01-01' at time zone 'America/Lima') and vt.created_at < (timestamp '2019-02-01' at time zone 'America/Lima')
      and va.%I = %L$q$, p_col, p_val) into v;
  return v;
end $f$;
grant execute on function pg_temp.esperado(text, text) to authenticated;

select 'A1 por unidades: el modelo 1 (5 u, S/ 250), el 2 (5 u, S/ 180: empatan en unidades y gana el que vendió más soles) y el 3 (1 u, S/ 300)' || '|' ||
  (${FILAS("k_r1")} = :'n1' || ':5:250 ' || :'n2' || ':5:180 ' || :'n3' || ':1:300')::text;
select 'A2 por soles: el 3 (S/ 300), el 1 (250) y el 2 (180)' || '|' ||
  (${FILAS("k_soles")} = :'n3' || ':1:300 ' || :'n1' || ':5:250 ' || :'n2' || ':5:180')::text;
select 'A3 por color y talla: cada variante en su fila, de la que más a la que menos (con el empate de 1 unidad ganado por soles)' || '|' ||
  ((select count(*) from jsonb_array_elements(${J("k_variante")} -> 'filas')) = 5
   and (select string_agg((x ->> 'unidades') || ':' || trim_scale((x ->> 'vendido')::numeric)::text, ' ' order by (x ->> 'pos')::int) from jsonb_array_elements(${J("k_variante")} -> 'filas') x) = '4:80 3:150 2:100 1:300 1:100')::text;
select 'A4 por color y talla ordenado por soles: 300, 150, 100, 100, 80' || '|' ||
  ((select string_agg(trim_scale((x ->> 'vendido')::numeric)::text, ' ' order by (x ->> 'pos')::int) from jsonb_array_elements(${J("k_varsoles")} -> 'filas') x) = '300 150 100 100 80')::text;
select 'B1 el período anterior es del MISMO largo: del 1 de diciembre al 1 de enero (31 días)' || '|' ||
  (${J("k_r1")} -> 'anterior' ->> 'desde' = '2018-12-01' and ${J("k_r1")} -> 'anterior' ->> 'hasta' = '2019-01-01')::text;
select 'B2 lo del período anterior por fila: el modelo 1 vendió 2 (S/ 100), el 2 vendió 6 (S/ 120) y el 3 nada' || '|' ||
  ((select string_agg((x ->> 'unidades_ant') || ':' || trim_scale((x ->> 'vendido_ant')::numeric)::text, ' ' order by (x ->> 'pos')::int) from jsonb_array_elements(${J("k_r1")} -> 'filas') x) = '2:100 6:120 0:0')::text;
select 'B3 el total (11 prendas, S/ 730) y el del período son los mismos; hay 3 modelos y los diez primeros suman todo' || '|' ||
  (${NUM("k_r1", "total", "unidades")} = 11 and ${NUM("k_r1", "total", "vendido")} = 730 and ${NUM("k_r1", "total_periodo", "unidades")} = 11
   and ${NUM("k_r1", "total_periodo", "vendido")} = 730 and ${NUM("k_r1", "cuantos")} = 3 and ${NUM("k_r1", "primeros_diez", "unidades")} = 11)::text;
select 'B4 la primera venta que ve la cuenta es la del 10 de diciembre de 2018 (para no comparar contra un período que empezó antes de vender)' || '|' ||
  (${J("k_r1")} ->> 'primera_venta' = '2018-12-10')::text;
select 'B5 la fila mayor es la primera de TODAS (no de la página): en la segunda página sigue siendo la de 5 prendas y S/ 250' || '|' ||
  (${NUM("k_r1", "mayor", "unidades")} = 5 and ${NUM("k_pag", "mayor", "unidades")} = 5 and ${NUM("k_pag", "mayor", "vendido")} = 250)::text;
select 'C1 la prenda sin registrar NO es un modelo: se cuenta aparte (2 prendas, S/ 60) y no sale en el ranking' || '|' ||
  (${NUM("k_r1", "sin_registrar", "unidades")} = 2 and ${NUM("k_r1", "sin_registrar", "vendido")} = 60 and ${NUM("k_r1", "cuantos")} = 3)::text;
select 'C2 no cuentan la venta anulada (9 u), la de prueba (9 u) ni la del 1 de febrero a las 00:00: el total sigue en 11' || '|' ||
  (${NUM("k_r1", "total", "unidades")} = 11)::text;
select 'D1 por categoría: solo el modelo 3 (1 prenda)' || '|' ||
  (${FILAS("k_cat")} = :'n3' || ':1:300')::text;
select 'D2 por marca: la marca 2 es solo del modelo 3' || '|' ||
  (${FILAS("k_marca")} = :'n3' || ':1:300')::text;
select 'D3 la búsqueda por nombre (sin mayúsculas) encuentra solo el modelo 2' || '|' ||
  (${FILAS("k_busca")} = :'n2' || ':5:180')::text;
select 'D4 por tienda (Lima): solo lo que se vendió en Lima, el modelo 2 con 1 prenda y S/ 100' || '|' ||
  (${FILAS("k_lima")} = :'n2' || ':1:100')::text;
select 'D5 por talla: el total filtrado es la suma a mano de lo vendido en esa talla' || '|' ||
  (${NUM("k_talla", "total", "unidades")} = pg_temp.esperado('talla_id', :'ta1') and ${NUM("k_talla", "total", "unidades")} > 0)::text;
select 'D6 por color: el total filtrado es la suma a mano de lo vendido en ese color' || '|' ||
  (${NUM("k_color", "total", "unidades")} = pg_temp.esperado('color_codigo', :'co1') and ${NUM("k_color", "total", "unidades")} > 0)::text;
select 'D7 las tallas que se llevan suman el total filtrado (11 prendas) y los colores no pasan de él' || '|' ||
  ((select sum((x ->> 'unidades')::numeric) from jsonb_array_elements(${J("k_r1")} -> 'tallas') x) = 11
   and (select sum((x ->> 'unidades')::numeric) from jsonb_array_elements(${J("k_r1")} -> 'colores') x) <= 11)::text;
select 'E1 quedan: el modelo 1 tiene 12 en las tiendas (7 + 3 + 2; los 50 del taller no cuentan); en Trujillo, 9' || '|' ||
  ((select (x ->> 'stock')::numeric from jsonb_array_elements(${J("k_r1")} -> 'filas') x where x ->> 'nombre' = :'n1') = 12
   and (select (x ->> 'stock')::numeric from jsonb_array_elements(${J("k_truj")} -> 'filas') x where x ->> 'nombre' = :'n1') = 9)::text;
select 'E2 por color y talla, quedan es el de esa variante (la primera: 7 + 3 = 10)' || '|' ||
  ((select max((x ->> 'stock')::numeric) from jsonb_array_elements(${J("k_variante")} -> 'filas') x) = 10)::text;
select 'F1 la página: de a una fila, la segunda página trae el modelo 2, y el total de modelos sigue siendo 3' || '|' ||
  (${FILAS("k_pag")} = :'n2' || ':5:180' and ${NUM("k_pag", "cuantos")} = 3)::text;
select 'F2 LA REGLA DE ORO: el ranking + lo sin registrar suman lo que dicen las cifras de «Ventas del mes» (13 prendas, S/ 790)' || '|' ||
  (${NUM("k_r1", "total_periodo", "unidades")} + ${NUM("k_r1", "sin_registrar", "unidades")} = ${NUM("km_mes", "actual", "unidades")}
   and ${NUM("k_r1", "total_periodo", "vendido")} + ${NUM("k_r1", "sin_registrar", "vendido")} = ${NUM("km_mes", "actual", "vendido")}
   and ${NUM("km_mes", "actual", "vendido")} = 790)::text;

-- La familia fuera de los motores (bolsas, empaque): el modelo 3 pasa a una familia apagada
reset role;
select codigo as fam_alt from retail.familias where codigo <> (select familia from retail.categorias where id = :'c3') order by codigo limit 1 \\gset
update retail.categorias set familia = :'fam_alt' where id = :'c3';
update retail.familias set entra_a_motores = false where codigo = :'fam_alt';
set local role authenticated;
select set_config('request.jwt.claim.sub', '${FELIPE}', true);
select ${RANK()} as apagada \\gset k_
select 'C3 una familia fuera de los motores (la bolsa) NO entra al ranking ni a su total: quedan 2 modelos, 10 prendas y S/ 430' || '|' ||
  (${FILAS("k_apagada")} = :'n1' || ':5:250 ' || :'n2' || ':5:180' and ${NUM("k_apagada", "total_periodo", "unidades")} = 10 and ${NUM("k_apagada", "total_periodo", "vendido")} = 430)::text;

-- ---------- quien tiene el módulo: solo su tienda ----------
reset role;
update retail.familias set entra_a_motores = true where codigo = :'fam_alt';
set local role authenticated;
select set_config('request.jwt.claim.sub', '${CON_MODULO}', true);
select ${RANK()} as con \\gset c_
select 'G1 con el módulo ve SOLO su tienda: Trujillo suma 10 prendas y S/ 630 (sin lo de Lima)' || '|' ||
  (${NUM("c_con", "total", "unidades")} = 10 and ${NUM("c_con", "total", "vendido")} = 630)::text;
select set_config('request.jwt.claim.sub', '${SIN_MODULO}', true);
select 'G2 sin el módulo: 42501' || '|' || (pg_temp.codigo($q$select ${RANK()}$q$) like '42501 %')::text;
select set_config('request.jwt.claim.sub', '${FELIPE}', true);
select 'G3 un rango al revés, uno de más de 400 días, un nivel, un orden o una página que no son de la lista: 22023' || '|' ||
  (pg_temp.codigo($q$select retail.fn_reporte_ventas_ranking('2019-02-01', '2019-01-01')$q$) like '22023 %'
   and pg_temp.codigo($q$select retail.fn_reporte_ventas_ranking('2018-01-01', '2019-03-01')$q$) like '22023 %'
   and pg_temp.codigo($q$select ${RANK(", p_nivel => 'otro'")}$q$) like '22023 %'
   and pg_temp.codigo($q$select ${RANK(", p_orden => 'margen'")}$q$) like '22023 %'
   and pg_temp.codigo($q$select ${RANK(", p_por_pagina => 51")}$q$) like '22023 %'
   and pg_temp.codigo($q$select ${RANK(", p_pagina => -1")}$q$) like '22023 %')::text;
reset role;
set local role anon;
select 'G4 anon no ejecuta (permiso denegado)' || '|' || (pg_temp.codigo($q$select ${RANK()}$q$) like '42501 permission denied%')::text;
reset role;
select 'H1 es INVOKER (lee con las reglas de fila), estable y sin search_path propio' || '|' ||
  (select (not p.prosecdef and p.provolatile = 's' and p.proconfig is null)
   from pg_proc p where p.oid = 'retail.fn_reporte_ventas_ranking(date,date,uuid,uuid,uuid,uuid,text,text,text,text,integer,integer)'::regprocedure)::text;
rollback;
`;

let salida;
try {
  salida = psql(SQL);
} catch (e) {
  console.error(`✗ La prueba no pudo correr:\n${e.stderr ?? ""}${e.message ?? ""}`);
  process.exit(1);
}
const casos = salida
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => /\|(true|false)$/.test(l))
  .map((l) => ({ nombre: l.slice(0, l.lastIndexOf("|")), ok: l.endsWith("|true") }));
for (const c of casos) console.log(`${c.ok ? "✓" : "✗"} ${c.nombre}`);
const ESPERADOS = 28;
if (casos.length !== ESPERADOS) {
  console.error(`✗ Se esperaban ${ESPERADOS} casos y salieron ${casos.length}: la prueba dejó de mirar algo.`);
  process.exit(1);
}
const mal = casos.filter((c) => !c.ok);
if (mal.length) {
  console.error(`\n✗ ${mal.length} de ${casos.length} casos fallaron.`);
  process.exit(1);
}
console.log(`\n✓ ${casos.length} casos en verde (todo en una transacción que se deshizo).`);

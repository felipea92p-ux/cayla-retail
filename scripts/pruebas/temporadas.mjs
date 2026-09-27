#!/usr/bin/env node
/**
 * Prueba de ADR-0246 «Temporadas como atributo del producto» (`supabase/migrations/20260928100000_temporadas_como_atributo.sql`).
 *
 * QUÉ CUBRE
 *   T1 la lista: 9 temporadas en su orden, la mitad del año sale de la estación, lo que no tiene sentido no se escribe
 *      (una estación que cruza de PV a OI, una moda sin estación), y de afuera solo se lee por `fn_temporadas`.
 *   T2 el calendario: 12 fechas; una fecha lejos de su estación, repetida o fuera de orden no entra; lo que ya empezó no
 *      se mueve ni se borra (tampoco desde el SQL Editor); `fijar_fechas_temporada` todo o nada, solo para el líder, solo
 *      este año o el siguiente, firmada; el orden se revisa con todas las fechas escritas; el fin de
 *      cada estación es el inicio de la siguiente.
 *   T3 las llaves: un texto fuera de la lista no entra en producto ni en categoría; la excepción de un color que la
 *      prenda no tiene se rechaza; la excepción se va con su producto.
 *   T4 la regla: manda el color, luego el producto, luego la categoría; sin ninguna, «sin temporada»; la «Prenda sin
 *      registrar» no aparece.
 *   T5 `asignar_temporadas`: sin permiso de catálogo, nada; todo o nada; solo cambia lo que cambia; firma y deja rastro.
 *   T6 el alta: `p_temporada` queda guardada; una clave inventada no crea nada; una sola versión del alta.
 *   T7 el año: `fn_ocurrencia_temporada` pone la chompa de invierno cargada hoy en el invierno que acaba de terminar y la
 *      que llega en febrero en el que viene.
 *   T8 la guarda: si el alta viva cambió, la migración aborta sin tocar nada; pegada dos veces, igual.
 *
 * No depende de la fecha del día: donde hace falta una estación futura, la prueba usa el año siguiente al de hoy y la
 * siembra dentro de su propia transacción si el calendario no llega.
 *
 * CÓMO. Como `alta_con_stock_inicial.mjs`: cada caso en su transacción con ROLLBACK, sesión simulada con
 * `request.jwt.claim(s)`. `pg_temp.intento` corre SQL y devuelve el error (estado, hint, mensaje) como JSON.
 *
 * USO
 *   pnpm pruebas:temporadas    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260928100000_temporadas_como_atributo.sql"), "utf8");
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

const PRELUDIO = `
begin;
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
set local request.jwt.claim.sub = '${FELIPE}';
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
-- Una categoría con dos tallas, una pareja marca-proveedor y dos colores: una prenda NUEVA para la prueba.
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and (select count(*) from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id) >= 2
  order by c.nombre limit 1 \\gset
select t.id as t1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo
  where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
select codigo as c2 from retail.colores where activo order by codigo offset 1 limit 1 \\gset
select codigo as c3 from retail.colores where activo order by codigo offset 2 limit 1 \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id)
  values ('Blusa Temporada Prueba', :'cat', :'marca', :'prov') returning id as prod \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  values (:'prod', :'t1', :'c1', 'TEMP-PRUEBA-1', 50), (:'prod', :'t1', :'c2', 'TEMP-PRUEBA-2', 50);
-- El año siguiente al de hoy, con sus 4 estaciones (sembradas aquí si el calendario no llega): lo «futuro» de la prueba.
select extract(year from now() at time zone 'America/Lima')::integer + 1 as y \\gset
insert into retail.temporada_fechas (anio, estacion, inicio, fuente)
  select :y, e.estacion, make_timestamptz(:y, e.mes, 21, 12, 0, 0, 'America/Lima'), 'usno'
    from (values ('otono', 3), ('invierno', 6), ('primavera', 9), ('verano', 12)) e(estacion, mes)
   where not exists (select 1 from retail.temporada_fechas f where f.anio = :y);
`;

const sesion = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const COMO_POSTGRES = "reset role;\n";
/** Deja al rol con clave `clave` con exactamente esos módulos (como `postgres`). */
const soloModulos = (clave, modulos) =>
  `${COMO_POSTGRES}update retail.roles set limitado_como_hoy = false where clave = '${clave}';
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('${clave}');\n` +
  (modulos.length
    ? `insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('${clave}'), unnest(array[${modulos.map((m) => `'${m}'`).join(", ")}]);\n`
    : "");
const intento = (sql) => `pg_temp.intento($q$${sql}$q$)`;
/** La temporada efectiva de un color de la prenda de prueba: «temporada:origen». */
const efectiva = (color) =>
  `(select coalesce(temporada, '-') || ':' || coalesce(origen, '-') from retail.fn_temporada_efectiva(:'prod') where color_codigo = :'${color}')`;

/** Una fecha del calendario como la manda la pantalla (jsonb), con el año dado por una expresión SQL. */
const fecha = (anioSql, estacion, mes, dia) =>
  `jsonb_build_object('anio', ${anioSql}, 'estacion', '${estacion}', 'inicio', make_timestamptz(${anioSql}, ${mes}, ${dia}, 0, 0, 0, 'America/Lima'))`;
const ANIO_SIG = "(extract(year from now() at time zone 'America/Lima')::integer + 1)";

let fallos = 0;
let total = 0;
function caso(nombre, sql, verificar) {
  total++;
  let lineas;
  try {
    lineas = psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim().split("\n");
  } catch (e) {
    fallos++;
    console.log(`✗ ${nombre}\n    ${`${e.stderr ?? ""}${e.message ?? ""}`.slice(0, 1500)}`);
    return;
  }
  let ok = false;
  try {
    ok = typeof verificar === "string" ? lineas.at(-1) === verificar : !!verificar(lineas);
  } catch {
    ok = false;
  }
  if (!ok) fallos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) console.log(`    salió:\n    ${lineas.join("\n    ").slice(0, 1500)}`);
}
const json = (l) => JSON.parse(l);
const hint = (l, h) => json(l).ok === false && json(l).hint === h;
const estado = (l, e) => json(l).ok === false && json(l).estado === e;

// ── T1 · La lista ─────────────────────────────────────────────────────────
caso(
  "T1 · 9 temporadas en su orden, con la mitad del año calculada de la estación",
  `select string_agg(clave || '=' || coalesce(mitad, '-'), ',' order by orden) from retail.temporadas;`,
  "primavera_verano=PV,primavera=PV,verano=PV,otono_invierno=OI,otono=OI,invierno=OI,clasico=-,clasico_verano=PV,clasico_invierno=OI"
);
caso(
  "T1 · una estación que cruza de PV a OI, o una temporada de moda sin estación, no se escriben",
  `select ${intento("insert into retail.temporadas (clave, nombre, orden, estacion_desde, estacion_hasta) values ('rara', 'Rara', 99, 'verano', 'invierno')")} as a \\gset
select ${intento("insert into retail.temporadas (clave, nombre, orden) values ('sin_estacion', 'Sin estación', 98)")} as b \\gset
select concat_ws(',', (:'a')::jsonb ->> 'estado', (:'b')::jsonb ->> 'estado');`,
  "23514,23514"
);
caso(
  "T1 · de afuera, las tablas no se leen ni se escriben directo; la lista se lee por fn_temporadas",
  `${sesion(FELIPE)}select ${intento("select 1 from retail.temporadas")} as a \\gset
select ${intento("update retail.productos set temporada = 'verano' where id = '00000000-0000-0000-0000-000000000000'")} as b \\gset
select count(*) as n from retail.fn_temporadas() \\gset
${COMO_POSTGRES}select concat_ws(',', (:'a')::jsonb ->> 'estado', :'n');`,
  "42501,9"
);

// ── T2 · El calendario ───────────────────────────────────────────────────
caso(
  "T2 · 12 fechas sembradas y el fin de cada estación es el inicio de la siguiente",
  `select count(*) filter (where anio between 2026 and 2028) as n from retail.temporada_fechas \\gset
select bool_and(c.hasta = (select min(f.inicio) from retail.temporada_fechas f where f.inicio > c.inicio)) as ok
  from retail.fn_calendario_estaciones() c where c.hasta is not null \\gset
select concat_ws(',', :'n', :'ok');`,
  "12,t"
);
caso(
  "T2 · la primavera 2026 empezó el 22 de setiembre a las 19:05 (hora de Perú), no 5 horas antes",
  `select to_char(inicio at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') from retail.temporada_fechas where anio = 2026 and estacion = 'primavera';`,
  "2026-09-22 19:05"
);
caso(
  "T2 · una fecha lejos de su estación (el otoño en agosto) o la misma estación dos veces en un año no entra",
  `select ${intento("insert into retail.temporada_fechas (anio, estacion, inicio, fuente) values (2029, 'otono', '2029-08-10 12:00-05', 'usno')")} as a \\gset
select ${intento("insert into retail.temporada_fechas (anio, estacion, inicio, fuente) values (2026, 'otono', '2026-03-20 10:00-05', 'usno')")} as b \\gset
select concat_ws(',', (:'a')::jsonb ->> 'estado', (:'b')::jsonb ->> 'estado');`,
  "23514,23505"
);
caso(
  "T2 · lo que ya empezó no se mueve ni se borra (tampoco desde el SQL Editor)",
  `select ${intento("update retail.temporada_fechas set inicio = inicio + interval '1 hour' where anio = 2026 and estacion = 'otono'")} as a \\gset
select ${intento("delete from retail.temporada_fechas where anio = 2028 and estacion = 'verano'")} as b \\gset
select concat_ws(',', (:'a')::jsonb ->> 'hint', (:'b')::jsonb ->> 'hint');`,
  "calendario_pasado,calendario_sin_borrar"
);
caso(
  "T2 · el líder adelanta el invierno del año que viene al 25 de mayo: queda firmado y el otoño termina ese día",
  `${sesion(FELIPE)}select retail.fijar_fechas_temporada(jsonb_build_array(${fecha(":y", "invierno", 5, 25)})) as n \\gset
select to_char(hasta at time zone 'America/Lima', 'MM-DD') as fin_otono from retail.fn_calendario_estaciones() where anio = :y and estacion = 'otono' \\gset
${COMO_POSTGRES}select concat_ws(',', :'n', :'fin_otono',
  (select fuente || ':' || (actualizado_por = :'felipe') from retail.temporada_fechas where anio = :y and estacion = 'invierno'));`,
  "1,05-25,ajustada:true"
);
caso(
  "T2 · todo o nada: si una de las fechas del lote queda fuera de orden, no se guarda ninguna",
  `${sesion(FELIPE)}select ${intento(`select retail.fijar_fechas_temporada(jsonb_build_array(${fecha(ANIO_SIG, "verano", 12, 20)}, ${fecha(ANIO_SIG, "invierno", 4, 25)}, ${fecha(ANIO_SIG, "otono", 5, 15)}))`)} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint',
  (select count(*) from retail.temporada_fechas where anio = :y and fuente = 'ajustada'));`,
  "calendario_orden,0"
);
caso(
  "T2 · el orden también vale para lo que se escribe a mano en el SQL Editor (se revisa al confirmar)",
  `select ${intento(`update retail.temporada_fechas set inicio = make_timestamptz(${ANIO_SIG}, 4, 25, 0, 0, 0, 'America/Lima') where anio = ${ANIO_SIG} and estacion = 'invierno'; update retail.temporada_fechas set inicio = make_timestamptz(${ANIO_SIG}, 5, 15, 0, 0, 0, 'America/Lima') where anio = ${ANIO_SIG} and estacion = 'otono'; set constraints retail.temporada_fechas_orden immediate`)} as r \\gset
select (:'r')::jsonb ->> 'hint';`,
  "calendario_orden"
);
caso(
  "T2 · fijar_fechas_temporada: una integrante no puede (42501) y nadie ajusta dentro de 5 años",
  `${soloModulos("integrante", ["productos", "atributos"])}${sesion(MICAELA)}select ${intento(`select retail.fijar_fechas_temporada(jsonb_build_array(${fecha(ANIO_SIG, "verano", 12, 20)}))`)} as a \\gset
${sesion(FELIPE)}select ${intento(`select retail.fijar_fechas_temporada(jsonb_build_array(${fecha("(extract(year from now() at time zone 'America/Lima')::integer + 5)", "verano", 12, 21)}))`)} as b \\gset
${COMO_POSTGRES}select concat_ws(',', (:'a')::jsonb ->> 'estado', (:'b')::jsonb ->> 'hint');`,
  "42501,calendario_fuera_de_rango"
);

// ── T3 · Las llaves ──────────────────────────────────────────────────────
caso(
  "T3 · «Verano 26» a mano no entra en el producto ni en la categoría",
  `select ${intento("update retail.productos set temporada = 'Verano 26' where referencia = 'Blusa Temporada Prueba'")} as a \\gset
select ${intento("update retail.categorias set temporada = 'Verano 26' where id = (select categoria_id from retail.productos where referencia = 'Blusa Temporada Prueba')")} as b \\gset
select concat_ws(',', (:'a')::jsonb ->> 'estado', (:'b')::jsonb ->> 'estado');`,
  "23503,23503"
);
caso(
  "T3 · la excepción para un color que la prenda no tiene se rechaza; la de uno suyo entra",
  `select ${intento("insert into retail.producto_color_temporadas (producto_id, color_codigo, temporada) select id, (select codigo from retail.colores where activo order by codigo offset 2 limit 1), 'invierno' from retail.productos where referencia = 'Blusa Temporada Prueba'")} as a \\gset
select ${intento("insert into retail.producto_color_temporadas (producto_id, color_codigo, temporada) select id, (select codigo from retail.colores where activo order by codigo limit 1), 'invierno' from retail.productos where referencia = 'Blusa Temporada Prueba'")} as b \\gset
select concat_ws(',', (:'a')::jsonb ->> 'hint', (:'b')::jsonb ->> 'ok');`,
  "color_no_es_de_la_prenda,true"
);
caso(
  "T3 · la excepción por color se va con su producto (en cascada)",
  `select confdeltype from pg_constraint
    where conrelid = 'retail.producto_color_temporadas'::regclass and confrelid = 'retail.productos'::regclass;`,
  "c"
);

// ── T4 · La regla ────────────────────────────────────────────────────────
caso(
  "T4 · sin nada: sin temporada; la categoría da el valor por defecto; el producto la pisa; el color pisa al producto",
  `select ${efectiva("c1")} as a \\gset
update retail.categorias set temporada = 'verano' where id = :'cat';
select ${efectiva("c1")} as b \\gset
update retail.productos set temporada = 'primavera_verano' where id = :'prod';
select ${efectiva("c1")} as c \\gset
insert into retail.producto_color_temporadas (producto_id, color_codigo, temporada) values (:'prod', :'c2', 'invierno');
select concat_ws(',', :'a', :'b', :'c', ${efectiva("c1")}, ${efectiva("c2")});`,
  "-:-,verano:categoria,primavera_verano:producto,primavera_verano:producto,invierno:color"
);
caso(
  "T4 · la «Prenda sin registrar» no aparece en la regla",
  `select count(*) from retail.fn_temporada_efectiva() where producto_id = '11111111-1111-4111-8111-111111111111';`,
  "0"
);

// ── T5 · asignar_temporadas ──────────────────────────────────────────────
caso(
  "T5 · una integrante SIN Productos ni Atributos no puede (42501) y nada cambia",
  `${soloModulos("integrante", ["vender"])}${sesion(MICAELA)}select ${intento("select retail.asignar_temporadas(jsonb_build_array(jsonb_build_object('producto_id', (select id from retail.productos where referencia = 'Blusa Temporada Prueba'), 'temporada', 'verano')))")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'estado', (:'r')::jsonb ->> 'hint', coalesce((select temporada from retail.productos where id = :'prod'), '-'));`,
  "42501,temporada_sin_permiso,-"
);
caso(
  "T5 · con Productos: asigna producto y color, firma quien asigna y deja rastro en el historial",
  `${soloModulos("integrante", ["productos"])}${sesion(MICAELA)}select retail.asignar_temporadas(jsonb_build_array(jsonb_build_object(
    'producto_id', :'prod', 'temporada', 'verano', 'colores', jsonb_build_object(:'c2', 'invierno')))) as n \\gset
${COMO_POSTGRES}select concat_ws(',', :'n', ${efectiva("c1")}, ${efectiva("c2")},
  (select count(*) from retail.historial_producto_cambios h join public.personas pe on pe.id = h.usuario_id
    where h.entidad_id = :'prod' and h.campo like 'temporada%' and pe.auth_user_id = '${MICAELA}'));`,
  "2,verano:producto,invierno:color,2"
);
caso(
  "T5 · todo o nada: con una clave inventada en el segundo ítem, el primero tampoco se guarda",
  `${sesion(FELIPE)}select ${intento("select retail.asignar_temporadas(jsonb_build_array(jsonb_build_object('producto_id', (select id from retail.productos where referencia = 'Blusa Temporada Prueba'), 'temporada', 'verano'), jsonb_build_object('producto_id', (select id from retail.productos where referencia = 'Blusa Temporada Prueba'), 'colores', jsonb_build_object((select codigo from retail.colores where activo order by codigo offset 1 limit 1), 'Invierno 27'))))")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'estado', coalesce((select temporada from retail.productos where id = :'prod'), '-'),
  (select count(*) from retail.producto_color_temporadas where producto_id = :'prod'));`,
  "23503,-,0"
);
caso(
  "T5 · solo cambia lo que cambia: asignar lo mismo dos veces no sube la versión ni repite el historial; null quita la excepción",
  `${sesion(FELIPE)}select retail.asignar_temporadas(jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'temporada', 'otono', 'colores', jsonb_build_object(:'c2', 'invierno')))) as _1 \\gset
select version as v1 from retail.productos where id = :'prod' \\gset
select retail.asignar_temporadas(jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'temporada', 'otono', 'colores', jsonb_build_object(:'c2', 'invierno')))) as n2 \\gset
select retail.asignar_temporadas(jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'colores', jsonb_build_object(:'c2', null)))) as n3 \\gset
${COMO_POSTGRES}select concat_ws(',', :'n2', (select version from retail.productos where id = :'prod') = :'v1', :'n3', ${efectiva("c2")},
  (select count(*) from retail.historial_producto_cambios where entidad_id = :'prod' and campo like 'temporada%'));`,
  "0,t,1,otono:producto,3"
);

caso(
  "T5 · lote de «Sin temporada»: se salta la prenda que ya tiene temporada (propia o de su categoría) y asigna la que no",
  `${sesion(FELIPE)}insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id, temporada)
  values ('Polo Ya Tiene Temporada', :'cat', :'marca', :'prov', 'invierno') returning id as p2 \\gset
select retail.asignar_temporadas(jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'temporada', 'verano'),
  jsonb_build_object('producto_id', :'p2', 'temporada', 'verano')), true) as n1 \\gset
${COMO_POSTGRES}update retail.categorias set temporada = 'otono' where id = :'cat';
update retail.productos set temporada = null where id = :'prod';
${sesion(FELIPE)}select retail.asignar_temporadas(jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'temporada', 'verano')), true) as n2 \\gset
${COMO_POSTGRES}select concat_ws(',', :'n1', (select temporada from retail.productos where id = :'p2'), :'n2',
  coalesce((select temporada from retail.productos where id = :'prod'), '-'));`,
  "1,invierno,0,-"
);

// ── T6 · El alta ─────────────────────────────────────────────────────────
caso(
  "T6 · el alta guarda la temporada elegida; con una clave inventada no crea nada; una sola versión del alta",
  `${sesion(FELIPE)}select retail.crear_producto_con_stock_inicial('Falda Alta Temporada', :'cat',
    jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'precio', 50)), null, gen_random_uuid(), null, null, false, null,
    :'marca', :'prov', null, false, 'verano') as id1 \\gset
select pg_temp.intento(format($q$select retail.crear_producto_con_stock_inicial('Falda Alta Mala', %L,
    jsonb_build_array(jsonb_build_object('talla_id', %L, 'color_codigo', %L, 'precio', 50)), null, gen_random_uuid(), null, null, false, null,
    %L, %L, null, false, 'Verano 2027')$q$, :'cat', :'t1', :'c1', :'marca', :'prov')) as r \\gset
${COMO_POSTGRES}select concat_ws(',', (select temporada from retail.productos where id = :'id1'), (:'r')::jsonb ->> 'estado',
  (select count(*) from retail.productos where referencia = 'Falda Alta Mala'),
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'crear_producto_con_stock_inicial'),
  has_function_privilege('anon', 'retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean, text)', 'execute'));`,
  "verano,23503,0,1,f"
);

// ── T7 · El año sale de la fecha de llegada ──────────────────────────────
caso(
  "T7 · la chompa de invierno cargada el 26-set-2026 cae en el invierno que acaba de terminar; la de febrero, en el que viene",
  `select concat_ws(',',
  (select to_char(desde at time zone 'America/Lima', 'YYYY-MM-DD') from retail.fn_ocurrencia_temporada('invierno', '2026-09-26 12:00-05')),
  (select to_char(hasta at time zone 'America/Lima', 'YYYY-MM-DD') from retail.fn_ocurrencia_temporada('invierno', '2026-09-26 12:00-05')),
  (select to_char(desde at time zone 'America/Lima', 'YYYY-MM-DD') from retail.fn_ocurrencia_temporada('invierno', '2027-02-10 12:00-05')),
  (select to_char(desde at time zone 'America/Lima', 'YYYY-MM-DD') from retail.fn_ocurrencia_temporada('primavera_verano', '2026-10-01 12:00-05')),
  (select to_char(desde at time zone 'America/Lima', 'YYYY-MM-DD') from retail.fn_ocurrencia_temporada('clasico_verano', '2026-10-01 12:00-05')),
  (select count(*) from retail.fn_ocurrencia_temporada('clasico', '2026-10-01 12:00-05')));`,
  "2026-06-21,2026-09-22,2027-06-21,2026-09-22,2026-12-21,0"
);

// ── T8 · La guarda de la migración ───────────────────────────────────────
const MIG = MIGRACION.replace(/\\/g, "\\\\");
caso(
  "T8 · si el alta viva cambió (un parche en vivo), la migración aborta y el alta queda como estaba",
  `drop function retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean, text);
create function retail.crear_producto_con_stock_inicial(p_referencia text, p_categoria_id uuid, p_variantes jsonb,
  p_descripcion text default null, p_token uuid default null, p_tejido_id uuid default null, p_patron_id uuid default null,
  p_confirmo_distinto boolean default false, p_etiqueta_ids uuid[] default null, p_marca_id uuid default null,
  p_proveedor_id uuid default null, p_ubicacion_id uuid default null, p_al_piso boolean default false)
returns uuid language plpgsql as $f$ begin return null; /* parche en vivo desconocido */ end; $f$;
select pg_temp.intento($m$${MIG}$m$) as r \\gset
select concat_ws(',', (:'r')::jsonb ->> 'ok', position('cambió desde que se escribió' in (:'r')::jsonb ->> 'msg') > 0,
  (select string_agg(pg_get_function_identity_arguments(oid), ';') like '%p_al_piso boolean' from pg_proc
    where pronamespace = 'retail'::regnamespace and proname = 'crear_producto_con_stock_inicial'));`,
  "false,t,t"
);
caso(
  "T8 · pegada otra vez sobre la base de hoy no cambia nada (9 temporadas, 12 fechas, una sola alta)",
  `select pg_temp.intento($m$${MIG}$m$) ->> 'ok' as p \\gset
select concat_ws(',', :'p', (select count(*) from retail.temporadas),
  (select count(*) from retail.temporada_fechas where anio between 2026 and 2028),
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'crear_producto_con_stock_inicial'));`,
  "true,9,12,1"
);

console.log(`\n${total - fallos}/${total} pruebas en verde.`);
process.exit(fallos ? 1 : 0);

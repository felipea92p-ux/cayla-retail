#!/usr/bin/env node
// Pruebas de la historia del Plan de campaña (ADR-0372, C2–C6 · Felipe 2026-10-12) contra el Postgres LOCAL, cada caso en su transacción
// revertida (no deja nada escrito).
//
//   node scripts/pruebas/plan_compra_historia.mjs [--base <nombre>]
//
// Qué fija:
//   H  · Historial: antes de la primera venta de una tienda en el ERP manda Sinatra; desde ella, el ERP (un día nunca se cuenta dos veces).
//   R  · «Lo que sobra» de CAYLA: solo un líder, de 0 a 100, firmado; una campaña sin el suyo hereda el de la anterior.
//   P  · Propuesta: lo vendido en 90 días y por ventanas, lo vendido en la misma campaña el año anterior, el multiplicador real de la
//        tienda y si la categoría se agotó (stock de hoy menos lo movido después).
//   S  · Resultados: lo vendido en la campaña por tienda/prenda/color y a qué % del precio se vendió lo de después.
//   M  · Puertas: sin el módulo, 42501; ninguna función interna se expone a la web.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const leer = (n) => readFileSync(join(RAIZ, "supabase", "migrations", n), "utf8").replace(/^set lock_timeout.*$/m, "");
const C2 = leer("20261012160000_ventas_historicas_sinatra.sql");
const C4 = leer("20261012161000_plan_compra_propuesta_y_resultados.sql");
const TIENDAS_ACTIVAS = leer("20261012162000_plan_compra_tiendas_activas.sql");
const EN_CURSO_Y_CIERRE = leer("20261012163000_plan_compra_resultados_en_curso_y_cierre.sql");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

// Una tienda (Trujillo de la base local), una categoría nueva con una prenda de S/ 80, y dos campañas: «PH Futura» (empieza en 60 días; la
// misma un año antes es la «previa») y «PH Pasada» (terminó hace 20 días). Las ventas viejas se escriben con los disparadores apagados
// (el candado de mes cerrado rechazaría una venta de hace un año) y se vuelven a encender antes de leer.
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${C2}
set local search_path = retail, public, extensions;
${C4}
set local search_path = retail, public, extensions;
${TIENDAS_ACTIVAS}
set local search_path = retail, public, extensions;
${EN_CURSO_Y_CIERRE}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
select id as tienda from retail.ubicaciones where nombre ~* '\\m(tru|trujillo)\\M' limit 1 \\gset
select retail.fn_hoy_lima() as hoy \\gset
insert into retail.categorias (nombre, familia) values ('PH Polos', 'indumentaria');
select id as cat from retail.categorias where nombre = 'PH Polos' \\gset
with p as (insert into retail.productos (referencia, descripcion, categoria_id, marca_id, proveedor_id)
             select 'ZZ PH polo', 'Polo PH', :'cat', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
             returning id)
insert into retail.variantes (producto_id, sku, precio, costo, color_codigo, talla_id)
  select p.id, 'ZZ-PH-1', 80, 30, (select codigo from retail.colores order by orden nulls last limit 1), (select id from retail.tallas order by valor limit 1) from p
  returning id as v \\gset
insert into retail.planes_compra (nombre, desde, hasta) values ('PH Futura', :'hoy'::date + 60, :'hoy'::date + 74), ('PH Pasada', :'hoy'::date - 30, :'hoy'::date - 20);
select id as futura from retail.planes_compra where nombre = 'PH Futura' \\gset
select id as pasada from retail.planes_compra where nombre = 'PH Pasada' \\gset
create function pg_temp.vende(p_dia date, p_cant int, p_precio numeric) returns void language sql as $f$
  with v as (insert into retail.ventas (ubicacion_id, estado, created_at)
             values (current_setting('ph.tienda')::uuid, 'completada', (p_dia::timestamp + interval '12 hours') at time zone 'America/Lima') returning id)
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) select id, current_setting('ph.v')::uuid, p_cant, p_precio, 30 from v
$f$;
select set_config('ph.tienda', :'tienda', true) as _1, set_config('ph.v', :'v', true) as _2 \\gset
set local session_replication_role = replica;
-- La previa (la misma campaña un año antes): 9 en la campaña, 6 en los 60 días anteriores y 1 venta antes de todo (abre la tienda en el ERP).
select pg_temp.vende((:'hoy'::date + 60 - interval '1 year')::date - 70, 1, 80);
select pg_temp.vende((:'hoy'::date + 60 - interval '1 year')::date - 30, 6, 80);
select pg_temp.vende((:'hoy'::date + 60 - interval '1 year')::date + 2, 9, 80);
-- Reciente: 3 hace 10 días (está en la «después» de PH Pasada, a S/ 40: la mitad del precio); 4 dentro de PH Pasada a precio lleno.
select pg_temp.vende(:'hoy'::date - 10, 3, 40);
select pg_temp.vende(:'hoy'::date - 25, 4, 80);
set local session_replication_role = origin;
${como(FELIPE)}
`;

// `PH_VOLCAR=1`: imprime el preludio y sale (para mirar qué línea falló).
if (process.env.PH_VOLCAR) {
  console.log(PRELUDIO);
  process.exit(0);
}

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").at(-1);
  } catch (e) {
    obtenido = `ERROR_DE_SCRIPT ${`${e.stderr ?? ""}`.split("\n").find((l) => l.includes("ERROR")) ?? e.message}`;
  }
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else console.log(`✓ ${nombre}`);
}

// H. HISTORIAL ------------------------------------------------------------------------------------------------------------
caso(
  "H1 antes de la primera venta en el ERP manda Sinatra; desde ese día, el ERP (el día de Sinatra que se pisa no se cuenta)",
  `reset role;
   insert into retail.ventas_historicas (ubicacion_id, fecha, soles, fuente) values
     (:'tienda', (:'hoy'::date + 60 - interval '1 year')::date - 80, 1234, 'prueba'),
     (:'tienda', :'hoy'::date - 10, 99999, 'prueba')
   on conflict (ubicacion_id, fecha) do update set soles = excluded.soles;
   ${como(FELIPE)}
   select retail.fn_historial_ventas((:'hoy'::date - 500), :'hoy'::date) as h \\gset
   select concat_ws(',',
     (select (d->>'s') from jsonb_array_elements(:'h'::jsonb->'dias') d where d->>'u' = :'tienda' and d->>'f' = ((:'hoy'::date + 60 - interval '1 year')::date - 80)::text),
     (select (d->>'s') from jsonb_array_elements(:'h'::jsonb->'dias') d where d->>'u' = :'tienda' and d->>'f' = (:'hoy'::date - 10)::text));`,
  "1234.00,120.00"
);
caso(
  "H2 el esquema impide dos cifras para el mismo día de la misma tienda y un monto negativo",
  `reset role;
   insert into retail.ventas_historicas (ubicacion_id, fecha, soles, fuente) values (:'tienda', '2001-12-24', 10, 'a');
   select concat_ws(',',
     split_part(pg_temp.intento(format('insert into retail.ventas_historicas (ubicacion_id, fecha, soles, fuente) values (%L, %L, 11, %L)', :'tienda', '2001-12-24', 'b')), '|', 1),
     split_part(pg_temp.intento(format('insert into retail.ventas_historicas (ubicacion_id, fecha, soles, fuente) values (%L, %L, -1, %L)', :'tienda', '2001-12-25', 'b')), '|', 1));`,
  "23505,23514"
);

// R. LO QUE SOBRA ---------------------------------------------------------------------------------------------------------
caso(
  "R1 un líder fija el % (firmado) y la otra campaña lo hereda; 101 se rechaza; NULL lo quita",
  `select retail.guardar_plan_compra_recupero(:'pasada', 40);
   select concat_ws(',',
     (select recupero_defecto_pct || ':' || (recupero_actualizado_por is not null) from retail.planes_compra where id = :'pasada'),
     retail.fn_plan_compra_propuesta(:'futura')->'recupero_defecto'->>'pct',
     retail.fn_plan_compra_propuesta(:'futura')->'recupero_defecto'->>'heredado',
     split_part(pg_temp.intento(format('select retail.guardar_plan_compra_recupero(%L, 101)', :'futura')), '|', 2),
     (select retail.guardar_plan_compra_recupero(:'pasada', null)->>'recupero_defecto_pct') is null);`,
  "40:true,40,true,Lo que sobra va de 0 a 100 % del precio.,t"
);
caso(
  "R2 sin el módulo, ni lee la propuesta ni fija el %",
  `${como(MICAELA)}
   select concat_ws(',',
     split_part(pg_temp.intento(format('select retail.fn_plan_compra_propuesta(%L)', :'futura')), '|', 1),
     split_part(pg_temp.intento(format('select retail.guardar_plan_compra_recupero(%L, 40)', :'futura')), '|', 1),
     split_part(pg_temp.intento(format('select retail.fn_plan_compra_resultados(%L)', :'futura')), '|', 1));`,
  "42501,42501,42501"
);

// P. PROPUESTA ------------------------------------------------------------------------------------------------------------
const propuestaCat = `select retail.fn_plan_compra_propuesta(:'futura') as p \\gset
   select (select c from jsonb_array_elements(:'p'::jsonb->'categorias') c where c->>'c' = :'cat' and c->>'u' = :'tienda') as fila \\gset
   select (select t from jsonb_array_elements(:'p'::jsonb->'tiendas') t where t->>'id' = :'tienda') as t \\gset`;
caso(
  "P1 lo vendido en 90 días, la ventana de los últimos 30 días y la previa; la tienda tiene campaña anterior y su multiplicador (9/15 ÷ 6/60 = 6)",
  `${propuestaCat}
   select concat_ws(',', :'fila'::jsonb->>'u90', :'fila'::jsonb->'ventanas'->>0, :'fila'::jsonb->>'previa', :'t'::jsonb->>'previa_disponible', :'t'::jsonb->>'multiplicador');`,
  (o) => /^7,7,9,true,6(\.0+)?$/.test(o)
);
caso(
  "P2 sin stock hoy y sin movimientos después de la previa, la categoría quedó en cero: se agotó",
  `${propuestaCat}
   select :'fila'::jsonb->>'agotada';`,
  "true"
);
caso(
  "P3 con 3 en el piso hoy (y nada movido desde entonces), al fin de la previa había 3: no se agotó",
  `reset role;
   insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
     values (:'v', :'tienda', (select id from retail.sububicaciones where ubicacion_id = :'tienda' and tipo = 'piso_venta'), 3, 0);
   ${como(FELIPE)}
   ${propuestaCat}
   select :'fila'::jsonb->>'agotada';`,
  "false"
);
caso(
  "P4 lo que está en Cuarentena no cuenta como stock: sigue agotada",
  `reset role;
   insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
     values (:'v', :'tienda', (select id from retail.sububicaciones where ubicacion_id = :'tienda' and tipo = 'cuarentena'), 5, 0);
   ${como(FELIPE)}
   ${propuestaCat}
   select :'fila'::jsonb->>'agotada';`,
  "true"
);

// S. RESULTADOS -----------------------------------------------------------------------------------------------------------
caso(
  "S1 en la campaña pasada: 4 prendas por S/ 320 en la tienda, una fila por prenda y color; lo de después, a la mitad del precio",
  `select retail.fn_plan_compra_resultados(:'pasada') as r \\gset
   select concat_ws(',',
     (select t->>'unidades' || ':' || (t->>'soles') from jsonb_array_elements(:'r'::jsonb->'tiendas') t where t->>'id' = :'tienda'),
     (select f->>'unidades' from jsonb_array_elements(:'r'::jsonb->'filas') f where f->>'c' = :'cat'),
     (select round((d->>'soles')::numeric / (d->>'a_precio_lista')::numeric, 2) from jsonb_array_elements(:'r'::jsonb->'despues'->'categorias') d where d->>'c' = :'cat'),
     (select p->>'nombre' from jsonb_array_elements(:'r'::jsonb->'productos') p limit 1));`,
  "4:320.00,4,0.50,Polo PH"
);

caso(
  "S2 en curso y cierre: lo vendido por día, cuántas se cobraron con rebaja y el stock de hoy y al cierre de la categoría",
  `reset role;
   set local session_replication_role = replica;
   select pg_temp.vende(:'hoy'::date - 22, 2, 40);
   set local session_replication_role = origin;
   insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
     values (:'v', :'tienda', (select id from retail.sububicaciones where ubicacion_id = :'tienda' and tipo = 'piso_venta'), 5, 0);
   ${como(FELIPE)}
   select retail.fn_plan_compra_resultados(:'pasada') as r \\gset
   select concat_ws(',',
     (select string_agg((d->>'u'), '+' order by d->>'f') from jsonb_array_elements(:'r'::jsonb->'por_dia') d),
     (select sum((f->>'rebajadas')::int) from jsonb_array_elements(:'r'::jsonb->'filas') f where f->>'c' = :'cat'),
     (select (s->>'hoy') || '/' || (s->>'cierre') from jsonb_array_elements(:'r'::jsonb->'stock') s where s->>'c' = :'cat'));`,
  "4+2,2,5/5"
);

// T. TIENDAS ACTIVAS ------------------------------------------------------------------------------------------------------
caso(
  "T1 una tienda activa sin historia ni ventas sale en el Historial y en los Resultados (con 0); una inactiva sin nada, no",
  `reset role;
   insert into retail.ubicaciones (nombre, tipo, activo) values ('ZZ Tienda nueva', 'tienda', true), ('ZZ Tienda cerrada', 'tienda', false);
   ${como(FELIPE)}
   select retail.fn_historial_ventas(:'hoy'::date - 30, :'hoy'::date) as h \\gset
   select retail.fn_plan_compra_resultados(:'pasada') as r \\gset
   select concat_ws(',',
     (select count(*) from jsonb_array_elements(:'h'::jsonb->'tiendas') t where t->>'nombre' = 'ZZ Tienda nueva'),
     (select count(*) from jsonb_array_elements(:'h'::jsonb->'tiendas') t where t->>'nombre' = 'ZZ Tienda cerrada'),
     (select t->>'unidades' from jsonb_array_elements(:'r'::jsonb->'tiendas') t where t->>'nombre' = 'ZZ Tienda nueva'),
     (select count(*) from jsonb_array_elements(:'r'::jsonb->'tiendas') t where t->>'nombre' = 'ZZ Tienda cerrada'));`,
  "1,0,0,0"
);

// M. PUERTAS --------------------------------------------------------------------------------------------------------------
caso(
  "M1 las funciones internas no se exponen a la web; las de lectura no las ejecuta anon",
  `reset role;
   select concat_ws(',',
     has_function_privilege('authenticated', 'retail.fn_unidades_vendidas(timestamptz,timestamptz)', 'execute'),
     has_function_privilege('authenticated', 'retail.fn_stock_categoria_al(timestamptz)', 'execute'),
     has_function_privilege('anon', 'retail.fn_plan_compra_propuesta(uuid)', 'execute'),
     has_function_privilege('anon', 'retail.fn_historial_ventas(date,date)', 'execute'),
     has_function_privilege('authenticated', 'retail.fn_plan_compra_resultados(uuid)', 'execute'));`,
  "f,f,f,f,t"
);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);

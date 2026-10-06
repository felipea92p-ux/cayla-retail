#!/usr/bin/env node
/**
 * Pruebas del plan de campaña (ADR-0349) — migración `20261005220000_plan_de_campana.sql`: `retail.fn_plan_compra`,
 * `retail.guardar_plan_compra_linea`, las tablas `planes_compra` / `planes_compra_lineas` y el módulo `plan_compra`. CAYLA V2.
 *
 * LO QUE VIGILA. Que un supuesto incoherente no se pueda guardar (escenarios desordenados, costo ≥ precio, recupero fuera de 0-100,
 * una curva con tallas ajenas o que no suma 100): la compra de diciembre se calcularía sobre él. Que solo quien tiene el módulo lo lea
 * y lo escriba, firmado por el responsable. Y que la hoja traiga el stock, la curva vendida y lo vendido DENTRO de la campaña.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK).
 *   M  EL MÓDULO: existe en Compras, orden 195, delegable, y nace SIN rol (ningún `rol_modulos`). La campaña «Diciembre 2026» existe.
 *   P  PUERTAS: Felipe (líder) lee y guarda; Micaela (sin el módulo) recibe 42501 en las dos; nadie lee las tablas directo.
 *   G  GUARDAR: rechaza lo incoherente con su mensaje; guardar dos veces la misma categoría deja UNA línea con lo último; firma.
 *   L  LEER: la línea guardada, el stock libre de la red (sin apartados ni Cuarentena), lo vendido por talla en 90 días y lo vendido
 *      dentro de las fechas de la campaña (lo de antes no cuenta).
 *
 * USO
 *   pnpm pruebas:plan-compra              → contra la base `postgres` del stack local
 *   pnpm pruebas:plan-compra --base otra  → contra otra base del mismo contenedor
 * La migración se carga dentro de cada caso (idempotente): corre igual con la base al día o sin ella.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261005220000_plan_de_campana.sql"), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${MIGRACION.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "").replace(/^notify pgrst.*$/m, "")}
set local search_path = retail, public, extensions;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz, fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);

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

select id as plan from retail.planes_compra where nombre = 'Diciembre 2026' \\gset
insert into retail.categorias (nombre, familia) values ('PC Polos', 'indumentaria');
select id as cat from retail.categorias where nombre = 'PC Polos' \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) select :'cat', t.id from retail.tallas t where t.valor in ('S', 'M', 'L');
select id as t_s from retail.tallas where valor = 'S' \\gset
select id as t_m from retail.tallas where valor = 'M' \\gset
select id as t_l from retail.tallas where valor = 'L' \\gset
select id as t_xl from retail.tallas where valor = 'XL' \\gset
select set_config('pc.plan', :'plan', true) as _1, set_config('pc.cat', :'cat', true) as _2 \\gset
-- Una línea válida con la curva dada.
create function pg_temp.guarda(p_curva jsonb, p_normal int default 120) returns text language sql as $$
  select pg_temp.intento(format('select retail.guardar_plan_compra_linea(%L, %L, 80, %s, 180, 79.90, 32, 50, %L)',
    current_setting('pc.plan'), current_setting('pc.cat'), p_normal, p_curva))
$$;
${como(FELIPE)}
`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
const curva = (o) => JSON.stringify(o).replace(/'/g, "''");

// M. MÓDULO ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 el módulo está en Compras (orden 195, delegable), nace SIN rol; la campaña Diciembre 2026 existe",
  `reset role;
   select concat_ws(',', (select grupo || ':' || orden || ':' || delegable || ':' || solo_lider from retail.modulos where clave = 'plan_compra'),
     (select count(*) from retail.rol_modulos where modulo = 'plan_compra'),
     (select desde || '/' || hasta from retail.planes_compra where nombre = 'Diciembre 2026'));`,
  "Compras:195:true:false,0,2026-12-01/2026-12-31"
);

// P. PUERTAS --------------------------------------------------------------------------------------------------------------
caso(
  "P1 Felipe lee; Micaela, sin el módulo, recibe 42501 al leer y al guardar",
  `select (retail.fn_plan_compra() -> 'plan' ->> 'nombre') as nombre \\gset
   ${como(MICAELA)}
   select :'nombre' || ',' ||
     split_part(pg_temp.intento('select retail.fn_plan_compra()'), '|', 1) || ',' ||
     split_part(pg_temp.guarda('{}'::jsonb), '|', 1);`,
  "Diciembre 2026,42501,42501"
);
caso(
  "P2 nadie lee las tablas directo (RLS sin políticas) ni ejecuta como anon",
  `set local role authenticated;
   select concat_ws(',', (select count(*) from retail.planes_compra), (select count(*) from retail.planes_compra_lineas)) as directo \\gset
   reset role;
   select :'directo' || ',' || concat_ws(',', (select count(*) from retail.planes_compra) > 0,
     has_function_privilege('anon', 'retail.fn_plan_compra(uuid)', 'execute'),
     has_function_privilege('anon', 'retail.guardar_plan_compra_linea(uuid,uuid,integer,integer,integer,numeric,numeric,integer,jsonb,text)', 'execute'));`,
  "0,0,t,f,f"
);

// G. GUARDAR --------------------------------------------------------------------------------------------------------------
caso(
  "G1 rechaza escenarios desordenados, costo ≥ precio, recupero > 100, talla ajena y curva que no suma 100",
  `select concat_ws(' / ',
     split_part(pg_temp.guarda('{}'::jsonb, 60), '|', 2),
     split_part(pg_temp.intento(format('select retail.guardar_plan_compra_linea(%L, %L, 1, 2, 3, 30, 30, 50)', :'plan', :'cat')), '|', 2),
     split_part(pg_temp.intento(format('select retail.guardar_plan_compra_linea(%L, %L, 1, 2, 3, 50, 30, 101)', :'plan', :'cat')), '|', 2),
     split_part(pg_temp.guarda(jsonb_build_object(:'t_xl', 100)), '|', 2),
     split_part(pg_temp.guarda(jsonb_build_object(:'t_s', 50, :'t_m', 60)), '|', 2));`,
  "Los escenarios van de menor a mayor: flojo, normal y bueno (flojo puede ser 0). / El costo tiene que ser menor que el precio de venta. / Lo que sobra se vende entre el 0 % y el 100 % del precio. / La curva tiene una talla que no es de esta categoría o un porcentaje que no es entero entre 0 y 100. / La curva de tallas suma 110 %: tiene que sumar 100 %."
);
caso(
  "G2 guardar dos veces deja UNA línea con lo último, firmada; la curva vacía vale",
  `select pg_temp.guarda('{}'::jsonb);
   select pg_temp.guarda(jsonb_build_object(:'t_s', 20, :'t_m', 50, :'t_l', 30), 130);
   reset role;
   select concat_ws(',', count(*), max(normal), max(curva ->> :'t_m'), bool_and(actualizado_por is not null))
     from retail.planes_compra_lineas where plan_id = :'plan' and categoria_id = :'cat';`,
  "1,130,50,t"
);

// L. LEER -----------------------------------------------------------------------------------------------------------------
caso(
  "L1 la hoja trae la línea, el stock libre de la red, la curva vendida en 90 días y lo vendido dentro de la campaña",
  `select pg_temp.guarda(jsonb_build_object(:'t_s', 20, :'t_m', 50, :'t_l', 30));
   reset role;
   create function pg_temp.prenda(p_cat uuid, p_talla uuid) returns uuid language plpgsql as $f$
   declare p uuid; v uuid;
   begin
     insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id)
       select 'ZZ PC polo', p_cat, mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
       returning id into p;
     insert into retail.variantes (producto_id, sku, precio, costo, talla_id) values (p, 'ZZ-PC-M', 80, 30, p_talla) returning id into v;
     return v;
   end $f$;
   select pg_temp.prenda(:'cat', :'t_m') as v \\gset
   select id as tienda from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
   insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
     values (:'v', :'tienda', (select id from retail.sububicaciones where ubicacion_id = :'tienda' and tipo = 'piso_venta'), 7, 2),
            (:'v', :'tienda', (select id from retail.sububicaciones where ubicacion_id = :'tienda' and tipo = 'cuarentena'), 5, 0);
   -- Vendida hace 10 días (curva) y una el 5 de diciembre (campaña).
   with v1 as (insert into retail.ventas (ubicacion_id, estado, created_at) values (:'tienda', 'completada', now() - interval '10 days') returning id)
   insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) select id, :'v', 3, 80, 30 from v1;
   with v2 as (insert into retail.ventas (ubicacion_id, estado, created_at) values (:'tienda', 'completada', timestamptz '2026-12-05 12:00-05') returning id)
   insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) select id, :'v', 4, 80, 30 from v2;
   ${como(FELIPE)}
   select retail.fn_plan_compra() as h \\gset
   select concat_ws(',',
     (select l ->> 'normal' from jsonb_array_elements((:'h')::jsonb -> 'lineas') l where l ->> 'categoria_id' = :'cat'),
     (select s ->> 'unidades' from jsonb_array_elements((:'h')::jsonb -> 'stock') s where s ->> 'categoria_id' = :'cat'),
     (select c ->> 'unidades' from jsonb_array_elements((:'h')::jsonb -> 'curvas') c where c ->> 'categoria_id' = :'cat' and c ->> 'talla_id' = :'t_m'),
     (select w ->> 'unidades' from jsonb_array_elements((:'h')::jsonb -> 'vendido') w where w ->> 'categoria_id' = :'cat'),
     (select jsonb_array_length(c -> 'tallas') from jsonb_array_elements((:'h')::jsonb -> 'categorias') c where c ->> 'id' = :'cat'));`,
  "120,5,3,4,3"
);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);

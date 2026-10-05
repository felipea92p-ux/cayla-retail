#!/usr/bin/env node
/**
 * Pruebas de la cifra única de demanda (ADR-0347) — `retail.fn_demanda_sede(p_ubicacion_id, p_dias)`, migración
 * `20261005215000_motor_demanda_lectura.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. La base entrega, por prenda, lo que el cliente se llevó y los días en que la prenda estuvo colgada; por grupo
 * (categoría × talla × familia de color), las ventas «sin registrar» sin prenda. El error caro es contar un día sin la prenda a la
 * vista como un día sin demanda: el sistema dejaría de reponer lo que se agota. El otro, contar distinto que el motor del piso.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; una sede NUEVA por caso).
 *   F  FORMA: SECURITY DEFINER, STABLE, search_path fijo; anon sin EXECUTE; días fuera de 1-120 y sede nula dan error.
 *   P  PUERTAS: Felipe (líder) lee cualquier sede; Micaela lee la suya (jsonb) y recibe NULL de otra; sin sesión, NULL.
 *   E  EXPOSICIÓN: colgada de la tarde del día −5 a la mañana del −3 son 3 jornadas; una exposición de 5 minutos no cuenta; hoy no
 *      cuenta; los días en que estuvo en el almacén y no en el piso, tampoco; y una prenda agotada ayer no pierde sus días colgada.
 *   K  CUADRE: la ventana empieza el día SIGUIENTE al último cuadre; cuadrada hoy, 0 días y listas vacías.
 *   V  VENDIDAS: lo de hoy, lo anulado, lo de prueba y la centinela no cuentan; y el total de los días cerrados es EL MISMO que
 *      `fn_piso_plan_lectura` cuenta como escaneado en esos días (la definición copiada).
 *   A  ANOTADAS: pendientes y cerradas sin prenda suman en su grupo; anuladas no; el grupo trae sus jornadas con alguna colgada.
 *
 * USO
 *   pnpm pruebas:motor-demanda-lectura              → contra la base `postgres` del stack local
 *   pnpm pruebas:motor-demanda-lectura --base otra  → contra otra base del mismo contenedor
 * La migración se carga dentro de cada caso (es `create or replace`): corre igual con la base al día o sin ella.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261005215000_motor_demanda_lectura.sql"), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const CENTINELA = "22222222-2222-4222-8222-222222222222";

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
const SIN_SESION = `set local request.jwt.claim.sub = '';\nset local request.jwt.claims = '{}';\n`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${MIGRACION.replace(/^set lock_timeout.*$/m, "")}
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

insert into retail.ubicaciones (nombre, tipo, activo) values ('Sede DL', 'tienda', true);
select id as sede from retail.ubicaciones where nombre = 'Sede DL' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values
  (:'sede', 'Piso de venta', 'piso_venta'), (:'sede', 'Almacén de tienda', 'almacen_tienda');
select set_config('dl.sede', :'sede', true) as _1 \\gset

insert into retail.categorias (nombre, familia) values ('DL Polos', 'indumentaria');
select id as cat from retail.categorias where nombre = 'DL Polos' \\gset
select set_config('dl.cat', :'cat', true) as _2 \\gset
select id as t_m from retail.tallas where valor = 'M' \\gset
select codigo as neutro from retail.colores where familia_color = 'neutro' order by codigo limit 1 \\gset
select set_config('dl.neutro', :'neutro', true) as _3 \\gset

create function pg_temp.prenda(p_sku text) returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id)
    select 'ZZ DL ' || p_sku, current_setting('dl.cat')::uuid, mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
    returning id into p;
  insert into retail.variantes (producto_id, sku, precio, costo, talla_id, color_codigo)
    values (p, p_sku, 100, 40, (select id from retail.tallas where valor = 'M'), current_setting('dl.neutro'))
    returning id into v;
  return v;
end $$;
-- Las HH:MM de Lima de hace k días.
create function pg_temp.a(k int, hora time) returns timestamptz language sql stable as $$
  select ((retail.fn_hoy_lima() - k) + hora) at time zone 'America/Lima'
$$;
-- Un movimiento en el piso (o el almacén) con su hora, aplicado al stock.
create function pg_temp.mueve(v uuid, p_tipo text, n int, cuando timestamptz, p_lugar text default 'piso_venta') returns void language plpgsql as $$
declare m uuid; u uuid := current_setting('dl.sede')::uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
    values (v, u, (select id from retail.sububicaciones where ubicacion_id = u and tipo = p_lugar), p_tipo, n, 'prueba', cuando) returning id into m;
  perform retail.fn_aplicar_movimiento(m);
end $$;
create function pg_temp.vende(v uuid, n int, cuando timestamptz, p_estado text default 'completada', p_prueba boolean default false) returns uuid language plpgsql as $$
declare vt uuid; li uuid; u uuid := current_setting('dl.sede')::uuid;
begin
  if p_estado = 'anulada' then
    insert into retail.ventas (ubicacion_id, estado, anulado_en, motivo_anulacion, created_at, es_prueba)
      values (u, 'anulada', cuando + interval '1 hour', 'prueba', cuando, p_prueba) returning id into vt;
  else
    insert into retail.ventas (ubicacion_id, estado, created_at, es_prueba) values (u, 'completada', cuando, p_prueba) returning id into vt;
  end if;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (vt, v, n, 100, 40) returning id into li;
  return li;
end $$;
create function pg_temp.anota(cuando timestamptz, p_estado text default 'pendiente') returns uuid language plpgsql as $$
declare vt uuid; li uuid; u uuid := current_setting('dl.sede')::uuid;
begin
  insert into retail.ventas (ubicacion_id, estado, created_at) values (u, 'completada', cuando) returning id into vt;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (vt, '${CENTINELA}', 1, 60, 0) returning id into li;
  insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado, vendido_en)
    values (li, u, 'Polo anotado', current_setting('dl.cat')::uuid, (select id from retail.tallas where valor = 'M'), current_setting('dl.neutro'), 60, cuando);
  if p_estado = 'cerrada_sin_prenda' then
    -- Como la deja cerrar_cola_arranque (ADR-0334): con su cierre y sin prenda.
    insert into retail.cierres_cola_arranque (id, ubicacion_id, corte, motivo, filas, soles, cerrado_por)
      values (gen_random_uuid(), u, cuando + interval '1 hour', 'no_se_sabe', 1, 60, (select id from public.personas limit 1));
    update retail.prendas_por_regularizar
       set estado = p_estado, cierre_id = (select c.id from retail.cierres_cola_arranque c where c.ubicacion_id = u order by c.cerrado_en desc limit 1)
     where venta_item_id = li;
  elsif p_estado <> 'pendiente' then
    update retail.prendas_por_regularizar set estado = p_estado where venta_item_id = li;
  end if;
  return li;
end $$;
create function pg_temp.lee() returns jsonb language sql as $$ select retail.fn_demanda_sede(current_setting('dl.sede')::uuid, 28) $$;
create function pg_temp.de(v uuid, campo text) returns text language sql as $$
  select coalesce((select x ->> campo from jsonb_array_elements(retail.fn_demanda_sede(current_setting('dl.sede')::uuid, 28) -> 'variantes') x
                    where x ->> 'variante_id' = v::text), 'nada')
$$;

${como(FELIPE)}
`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  // Solo la última línea: lo que arma un caso puede imprimir ids antes de la respuesta.
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

const OID = `'retail.fn_demanda_sede(uuid,integer)'::regprocedure`;

// F. FORMA ----------------------------------------------------------------------------------------------------------------
caso(
  "F1 SECURITY DEFINER, STABLE, search_path fijo; anon no la ejecuta, authenticated sí",
  `select concat_ws(',', (select prosecdef from pg_proc where oid = ${OID}), (select provolatile = 's' from pg_proc where oid = ${OID}),
     (select coalesce(array_to_string(proconfig, ';') like '%search_path=retail, public, extensions%', false) from pg_proc where oid = ${OID}),
     has_function_privilege('anon', ${OID}, 'execute'), has_function_privilege('authenticated', ${OID}, 'execute'));`,
  "t,t,t,f,t"
);
caso(
  "F2 días fuera de 1-120 y sede nula dan error",
  `select concat_ws(',',
     split_part(pg_temp.intento(format('select retail.fn_demanda_sede(%L, 0)', current_setting('dl.sede'))), '|', 1),
     split_part(pg_temp.intento(format('select retail.fn_demanda_sede(%L, 121)', current_setting('dl.sede'))), '|', 1),
     split_part(pg_temp.intento('select retail.fn_demanda_sede(null, 28)'), '|', 1));`,
  "22023,22023,22004"
);

// P. PUERTAS --------------------------------------------------------------------------------------------------------------
caso(
  "P1 Micaela lee su sede y NULL de otra; sin sesión, NULL",
  `${como(MICAELA)}select concat_ws(',',
     retail.fn_demanda_sede((select id from retail.ubicaciones where nombre = 'Tienda Trujillo'), 28) is not null,
     retail.fn_demanda_sede(current_setting('dl.sede')::uuid, 28) is null);
   ${SIN_SESION}select retail.fn_demanda_sede(current_setting('dl.sede')::uuid, 28) is null;`,
  "t"
);

// E. EXPOSICIÓN -----------------------------------------------------------------------------------------------------------
caso(
  "E1 colgada de la tarde del −5 a la mañana del −3: 3 jornadas; el almacén no cuenta; 5 minutos el −1 no cuentan; hoy no cuenta",
  `select pg_temp.prenda('DL-1') as v \\gset
   select pg_temp.mueve(:'v', 'entrada', 4, pg_temp.a(8, '10:00'), 'almacen_tienda');
   select pg_temp.mueve(:'v', 'entrada', 1, pg_temp.a(5, '15:00'));
   select pg_temp.mueve(:'v', 'salida', 1, pg_temp.a(3, '11:00'));
   select pg_temp.mueve(:'v', 'entrada', 1, pg_temp.a(1, '23:55'));
   select pg_temp.de(:'v', 'dias_expuesta') || ',' || pg_temp.de(:'v', 'piso_hoy') || ',' || pg_temp.de(:'v', 'almacen_hoy');`,
  "3,1,4"
);

caso(
  "E2 agotada ayer después de estar colgada desde el −5: cuenta sus 4 jornadas (hoy tiene 0 y no se pierde)",
  `select pg_temp.prenda('DL-7') as v \\gset
   select pg_temp.mueve(:'v', 'entrada', 2, pg_temp.a(5, '09:00'));
   select pg_temp.mueve(:'v', 'salida', 2, pg_temp.a(2, '11:00'));
   select pg_temp.de(:'v', 'dias_expuesta') || ',' || pg_temp.de(:'v', 'piso_hoy');`,
  "4,0"
);

// K. CUADRE ---------------------------------------------------------------------------------------------------------------
caso(
  "K1 la ventana empieza el día siguiente al cuadre; cuadrada hoy, 0 días",
  `select pg_temp.prenda('DL-2') as v \\gset
   select pg_temp.mueve(:'v', 'entrada', 1, pg_temp.a(10, '09:00'));
   insert into retail.cuadres_piso (ubicacion_id, persona_id, token_cliente, huella, escaneo_desde, resumen, created_at)
     values (:'sede', (select id from public.personas limit 1), gen_random_uuid(), md5('k1'), pg_temp.a(4, '09:00'), '{}', pg_temp.a(4, '10:00'));
   select (pg_temp.lee() ->> 'desde')::date = retail.fn_hoy_lima() - 3 as desde_ok, pg_temp.de(:'v', 'dias_expuesta') as dias \\gset
   insert into retail.cuadres_piso (ubicacion_id, persona_id, token_cliente, huella, escaneo_desde, resumen, created_at, nota)
     values (:'sede', (select id from public.personas limit 1), gen_random_uuid(), md5('k2'), now() - interval '1 hour', '{}', now() - interval '30 minutes', 'otra vez');
   select :'desde_ok' || ',' || :'dias' || ',' || (pg_temp.lee() ->> 'dias') || ',' || jsonb_array_length(pg_temp.lee() -> 'variantes');`,
  "t,3,0,0"
);

// V. VENDIDAS -------------------------------------------------------------------------------------------------------------
caso(
  "V1 lo de hoy, lo anulado, lo de prueba y la centinela no cuentan",
  `select pg_temp.prenda('DL-3') as v \\gset
   select pg_temp.vende(:'v', 2, pg_temp.a(2, '12:00'));
   select pg_temp.vende(:'v', 1, pg_temp.a(0, '09:00'));
   select pg_temp.vende(:'v', 5, pg_temp.a(2, '12:00'), 'anulada');
   select pg_temp.vende(:'v', 5, pg_temp.a(2, '12:00'), 'completada', true);
   select pg_temp.vende('${CENTINELA}', 1, pg_temp.a(2, '12:00'));
   select pg_temp.de(:'v', 'vendidas') || ',' || (select count(*) from jsonb_array_elements(pg_temp.lee() -> 'variantes') x where x ->> 'variante_id' = '${CENTINELA}');`,
  "2,0"
);
caso(
  "V2 en los días cerrados, lo vendido es EXACTAMENTE lo que el motor del piso cuenta como escaneado",
  `select pg_temp.prenda('DL-4') as a \\gset
   select pg_temp.prenda('DL-5') as b \\gset
   -- Con stock: el motor del piso solo lista las tallas que la sede tiene.
   select pg_temp.mueve(:'a', 'entrada', 1, pg_temp.a(20, '09:00')); select pg_temp.mueve(:'b', 'entrada', 1, pg_temp.a(20, '09:00'));
   select pg_temp.vende(:'a', 2, pg_temp.a(1, '12:00')); select pg_temp.vende(:'a', 1, pg_temp.a(6, '18:00'));
   select pg_temp.vende(:'b', 3, pg_temp.a(12, '10:00')); select pg_temp.vende(:'b', 1, pg_temp.a(13, '23:30'));
   select ((select sum((x ->> 'vendidas')::int) from jsonb_array_elements(pg_temp.lee() -> 'variantes') x)
          = (select sum((t ->> 'vendidas_14')::int) from jsonb_array_elements(retail.fn_piso_plan_lectura(current_setting('dl.sede')::uuid) -> 'tallas') t))::text
          || ',' || (select sum((x ->> 'vendidas')::int) from jsonb_array_elements(pg_temp.lee() -> 'variantes') x);`,
  "true,7"
);

// A. ANOTADAS -------------------------------------------------------------------------------------------------------------
caso(
  "A1 pendientes y cerradas sin prenda suman en su grupo; anuladas no; el grupo trae sus jornadas con alguna colgada",
  `select pg_temp.prenda('DL-6') as v \\gset
   select pg_temp.mueve(:'v', 'entrada', 1, pg_temp.a(3, '09:00'));
   select pg_temp.anota(pg_temp.a(2, '12:00'));
   select pg_temp.anota(pg_temp.a(5, '12:00'), 'cerrada_sin_prenda');
   select pg_temp.anota(pg_temp.a(4, '12:00'), 'anulada');
   select (g ->> 'anotadas') || ',' || (g ->> 'dias_alguna_expuesta')
     from jsonb_array_elements(pg_temp.lee() -> 'grupos') g
    where g ->> 'categoria_id' = current_setting('dl.cat');`,
  "2,3"
);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);

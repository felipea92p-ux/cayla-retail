#!/usr/bin/env node
/**
 * Pruebas de la lectura del motor de demanda, etapa 0 (ADR-0346) — `retail.fn_motor_demanda_preparacion(p_ubicacion_id)`,
 * migraciones `20261005210000_motor_demanda_preparacion.sql` y `20261005223000_motor_demanda_preparacion_sin_sede.sql` (la vigente). CAYLA V2.
 *
 * LO QUE VIGILA. La lectura dice, por tienda, cuántas unidades se vendieron cada día de Lima y cuántas apuntan a una prenda real
 * (no a la centinela de «venta sin registrar»), más la fecha del último cuadre del piso y si el almacén ya tuvo su conteo de
 * arranque. Con eso la web decide si el motor puede recomendar (90 % sostenido 14 días; `apps/web/lib/motor-demanda-reglas.ts`).
 * El error caro es contar mal la venta identificada: una sede que «parece lista» sin serlo recibiría sugerencias sobre ruido; una
 * que sí lo está se quedaría callada.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; una sede NUEVA por caso, así nada del seed se mezcla).
 *   F  FORMA: una firma, SECURITY DEFINER, STABLE, search_path fijo; anon sin EXECUTE, authenticated con EXECUTE.
 *   P  PUERTAS: sin sede, quien ve `cayla_global` recibe todas las tiendas (Felipe) y los demás solo las que operan (Micaela: su
 *     tienda), sin error; con sede, quien la opera (Micaela con Tienda Trujillo sí, con la sede de prueba 42501).
 *   D  DÍAS: identificadas y total por día de LIMA (las 23:30 de ayer en Lima son ayer, aunque en UTC ya sea hoy); la venta
 *     anulada, la de prueba, la de otra sede y la de hace 50 días no cuentan; la liquidación de una dañada tampoco.
 *   R  REGULARIZADA: al pasar la línea de la centinela a la prenda real, cuenta como identificada en el día en que se cobró.
 *   K  CUADRE: `cuadrado_en` NULL sin cuadre; con dos cuadres, el último de SU sede.
 *   A  ALMACÉN: sin conteo, no contado; con un conteo de arranque del almacén entero, contado.
 *   T  SOLO TIENDAS ACTIVAS; una sede sin ventas trae `dias = []` y `primera_venta` NULL.
 *
 * USO
 *   pnpm pruebas:motor-demanda              → contra la base `postgres` del stack local
 *   pnpm pruebas:motor-demanda --base otra  → contra otra base del mismo contenedor
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
// La versión vigente: 20261005223000 reemplazó a 20261005210000 (sin sede, cada cuenta recibe las tiendas que opera, sin error).
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261005223000_motor_demanda_preparacion_sin_sede.sql"), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const CENTINELA = "22222222-2222-4222-8222-222222222222"; // «Prenda sin registrar» (ADR-0179)

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

/** Una sede NUEVA con piso y almacén, otra sede para «la de al lado», una prenda real y piezas para vender con hora fijada. */
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${MIGRACION.replace(/^set lock_timeout.*$/m, "")}
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

insert into retail.ubicaciones (nombre, tipo, activo) values ('Sede MD', 'tienda', true), ('Sede MD Lejos', 'tienda', true);
select id as sede from retail.ubicaciones where nombre = 'Sede MD' \\gset
select id as otra from retail.ubicaciones where nombre = 'Sede MD Lejos' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values
  (:'sede', 'Piso de venta', 'piso_venta'), (:'sede', 'Almacén de tienda', 'almacen_tienda'),
  (:'otra', 'Piso de venta', 'piso_venta'), (:'otra', 'Almacén de tienda', 'almacen_tienda');
select id as almacen from retail.sububicaciones where ubicacion_id = :'sede' and tipo = 'almacen_tienda' \\gset
select set_config('md.sede', :'sede', true) as _1 \\gset

-- Una prenda real (su propio producto), creada como en la prueba del motor del piso.
create function pg_temp.prenda() returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  insert into retail.productos (referencia, marca_id, proveedor_id)
    select 'ZZ MD polo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
    returning id into p;
  insert into retail.variantes (producto_id, sku, precio, costo) values (p, 'ZZ-MD-1', 100, 40) returning id into v;
  return v;
end $$;
select pg_temp.prenda() as real \\gset
select set_config('md.real', :'real', true) as _2 \\gset

-- Una venta de una línea con su hora; devuelve la línea.
create function pg_temp.vende(v uuid, n int, cuando timestamptz, p_estado text default 'completada', p_sede uuid default null,
                              p_prueba boolean default false) returns uuid language plpgsql as $$
declare vt uuid; li uuid; u uuid := coalesce(p_sede, current_setting('md.sede')::uuid);
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
-- Las 12:00 de Lima de hace k días (0 = hoy).
create function pg_temp.dia(k int) returns timestamptz language sql stable as $$
  select ((retail.fn_hoy_lima() - k) + time '12:00') at time zone 'America/Lima'
$$;
-- La fila de la sede de prueba, y un día suyo como «identificadas/unidades».
create function pg_temp.fila() returns retail.ubicaciones language sql as $$ select * from retail.ubicaciones where id = current_setting('md.sede')::uuid $$;
create function pg_temp.el_dia(k int) returns text language sql as $$
  select coalesce((select (d ->> 'identificadas') || '/' || (d ->> 'unidades')
                     from retail.fn_motor_demanda_preparacion(current_setting('md.sede')::uuid) f,
                          jsonb_array_elements(f.dias) d
                    where (d ->> 'dia')::date = retail.fn_hoy_lima() - k), 'nada')
$$;

${como(FELIPE)}
`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  // Solo la última línea: las ventas que arma un caso imprimen su id antes de la respuesta.
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

const OID = `'retail.fn_motor_demanda_preparacion(uuid)'::regprocedure`;

// F. FORMA ---------------------------------------------------------------------------------------------------------------
caso(
  "F1 una sola firma, SECURITY DEFINER, STABLE, search_path fijo; anon no la ejecuta y authenticated sí",
  `select concat_ws(',', (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_motor_demanda_preparacion'),
     (select prosecdef from pg_proc where oid = ${OID}),
     (select provolatile = 's' from pg_proc where oid = ${OID}),
     (select coalesce(array_to_string(proconfig, ';') like '%search_path=retail, public, extensions%', false) from pg_proc where oid = ${OID}),
     has_function_privilege('anon', ${OID}, 'execute'),
     has_function_privilege('authenticated', ${OID}, 'execute'));`,
  "1,t,t,t,f,t"
);

// P. PUERTAS -------------------------------------------------------------------------------------------------------------
caso(
  "P1 sin sede: Felipe (CAYLA Global) ve las tiendas, incluida la de prueba",
  `select count(*) filter (where nombre = 'Sede MD') || ',' || bool_and(true) from retail.fn_motor_demanda_preparacion();`,
  "1,true"
);
caso(
  "P2 sin sede: Micaela (sin CAYLA Global) recibe solo la tienda que opera, sin error (el barrido de terminales lo exige)",
  `${como(MICAELA)}select string_agg(nombre, ',' order by nombre) from retail.fn_motor_demanda_preparacion();`,
  "Tienda Trujillo"
);
caso(
  "P3 con sede: Micaela lee la suya (Tienda Trujillo) y no la de prueba",
  `${como(MICAELA)}select concat_ws(',',
     (select count(*) from retail.fn_motor_demanda_preparacion((select id from retail.ubicaciones where nombre = 'Tienda Trujillo'))),
     split_part(pg_temp.intento(format('select * from retail.fn_motor_demanda_preparacion(%L)', current_setting('md.sede'))), '|', 1));`,
  "1,42501"
);

// D. DÍAS ----------------------------------------------------------------------------------------------------------------
caso(
  "D1 hoy: 2 identificadas y 1 sin registrar → 2/3; hace 3 días solo sin registrar → 0/1",
  `select pg_temp.vende(current_setting('md.real')::uuid, 2, pg_temp.dia(0));
   select pg_temp.vende('${CENTINELA}', 1, pg_temp.dia(0));
   select pg_temp.vende('${CENTINELA}', 1, pg_temp.dia(3));
   select pg_temp.el_dia(0) || ',' || pg_temp.el_dia(3) || ',' || pg_temp.el_dia(1);`,
  "2/3,0/1,nada"
);
caso(
  "D2 anulada, de prueba, de otra sede y de hace 50 días no cuentan",
  `select pg_temp.vende(current_setting('md.real')::uuid, 1, pg_temp.dia(1));
   select pg_temp.vende(current_setting('md.real')::uuid, 5, pg_temp.dia(1), 'anulada');
   select pg_temp.vende(current_setting('md.real')::uuid, 5, pg_temp.dia(1), 'completada', null, true);
   select pg_temp.vende(current_setting('md.real')::uuid, 5, pg_temp.dia(1), 'completada', (select id from retail.ubicaciones where nombre = 'Sede MD Lejos'));
   select pg_temp.vende(current_setting('md.real')::uuid, 5, pg_temp.dia(50));
   select pg_temp.el_dia(1) || ',' || (select jsonb_array_length(dias) from retail.fn_motor_demanda_preparacion(current_setting('md.sede')::uuid));`,
  "1/1,1"
);
caso(
  "D3 día de LIMA: las 23:30 de ayer en Lima cuentan ayer (en UTC ya es hoy)",
  `select pg_temp.vende(current_setting('md.real')::uuid, 1, ((retail.fn_hoy_lima() - 1) + time '23:30') at time zone 'America/Lima');
   select pg_temp.el_dia(1) || ',' || pg_temp.el_dia(0);`,
  "1/1,nada"
);
caso(
  "D4 la liquidación de una prenda dañada no es demanda: no cuenta",
  `select pg_temp.vende(current_setting('md.real')::uuid, 1, pg_temp.dia(2)) as li \\gset
   insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id)
     values (current_setting('md.real')::uuid, current_setting('md.sede')::uuid, 'salida', 1, 'cuarentena_liquidada', :'li');
   select pg_temp.el_dia(2);`,
  "nada"
);

// R. REGULARIZADA --------------------------------------------------------------------------------------------------------
caso(
  "R1 regularizada después: cuenta como identificada en el día en que se cobró, no hoy",
  `select pg_temp.vende('${CENTINELA}', 1, pg_temp.dia(4)) as li \\gset
   select pg_temp.el_dia(4) as antes \\gset
   -- Lo que hace regularizar_prenda con la línea (20260923162300:87-88): la pasa a la prenda real.
   update retail.venta_items set variante_id = current_setting('md.real')::uuid where id = :'li';
   select :'antes' || ',' || pg_temp.el_dia(4) || ',' || pg_temp.el_dia(0);`,
  "0/1,1/1,nada"
);

// K. CUADRE --------------------------------------------------------------------------------------------------------------
caso(
  "K1 sin cuadre, NULL; con dos cuadres, el último de su sede (no el de la otra)",
  `select coalesce((select cuadrado_en::text from retail.fn_motor_demanda_preparacion(current_setting('md.sede')::uuid)), 'NULL') as antes \\gset
   insert into retail.cuadres_piso (ubicacion_id, persona_id, token_cliente, huella, escaneo_desde, resumen, created_at, nota) values
     (current_setting('md.sede')::uuid, (select id from public.personas limit 1), gen_random_uuid(), md5('a'), '2026-10-01 09:00-05', '{}', '2026-10-01 10:00-05', null),
     (current_setting('md.sede')::uuid, (select id from public.personas limit 1), gen_random_uuid(), md5('b'), '2026-10-03 09:00-05', '{}', '2026-10-03 10:00-05', 'Se volvió a cuadrar'),
     ((select id from retail.ubicaciones where nombre = 'Sede MD Lejos'), (select id from public.personas limit 1), gen_random_uuid(), md5('c'), '2026-10-04 09:00-05', '{}', '2026-10-04 10:00-05', null);
   select :'antes' || ',' || ((select cuadrado_en from retail.fn_motor_demanda_preparacion(current_setting('md.sede')::uuid)) = '2026-10-03 10:00-05'::timestamptz);`,
  "NULL,true"
);

// A. ALMACÉN -------------------------------------------------------------------------------------------------------------
caso(
  "A1 sin conteo, el almacén no está contado; con su conteo de arranque entero, sí",
  `select almacen_contado as antes from retail.fn_motor_demanda_preparacion(current_setting('md.sede')::uuid) \\gset
   insert into retail.conteos (ubicacion_id, sububicacion_id, estado, alcance, es_arranque, cerrado_en)
     values (:'sede', :'almacen', 'cerrado', 'todo', true, now());
   select :'antes' || ',' || (select almacen_contado from retail.fn_motor_demanda_preparacion(current_setting('md.sede')::uuid));`,
  "f,true"
);

// T. SOLO TIENDAS --------------------------------------------------------------------------------------------------------
caso(
  "T1 el taller y una tienda desactivada no salen; una sede sin ventas trae dias=[] y primera_venta NULL",
  `update retail.ubicaciones set activo = false where nombre = 'Sede MD Lejos';
   select concat_ws(',',
     (select count(*) from retail.fn_motor_demanda_preparacion() f join retail.ubicaciones u on u.id = f.ubicacion_id where u.tipo <> 'tienda'),
     (select count(*) from retail.fn_motor_demanda_preparacion() where nombre = 'Sede MD Lejos'),
     (select dias::text from retail.fn_motor_demanda_preparacion(current_setting('md.sede')::uuid)),
     (select coalesce(primera_venta::text, 'NULL') from retail.fn_motor_demanda_preparacion(current_setting('md.sede')::uuid)),
     (select hoy = retail.fn_hoy_lima() from retail.fn_motor_demanda_preparacion(current_setting('md.sede')::uuid)));`,
  "0,0,[],NULL,t"
);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);

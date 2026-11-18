#!/usr/bin/env node
/**
 * Pruebas de que los motores del PISO solo cuentan lo vendido en la tienda física (`20261104032000_motores_del_piso_solo_tienda.sql`,
 * ADR-0607, actividad 8) contra el Postgres local — CAYLA V2.
 *
 * EL PROBLEMA QUE RESUELVE. Una venta de TikTok descuenta stock de la sede donde se aparta, pero no pasó por el piso: si el motor del piso la
 * cuenta como rotación, «colgar otra igual» pide reposición por una demanda que el piso no tuvo. Lo que SÍ debe seguir contando lo vendido
 * online: Análisis y el plan de compra (es demanda real de CAYLA).
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; una sede NUEVA por caso; 20261104004000 y 20261104032000 dentro de la transacción).
 *   P  PISO (`fn_piso_plan_lectura`): una venta de tienda cuenta; la de TikTok, con la misma prenda, no; la anotada de TikTok tampoco.
 *   D  DEMANDA (`fn_demanda_sede`): `variantes.vendidas` y `grupos.anotadas` solo traen lo de la tienda.
 *   E  PREPARACIÓN (`fn_motor_demanda_preparacion`): `primera_venta` ignora una venta de TikTok.
 *   U  NO SE TOCA LO QUE DEBE CONTAR: `fn_unidades_vendidas` (plan de compra, Análisis) sigue sumando la venta de TikTok.
 *   R  RE-EJECUTABLE: cargar la migración dos veces no cambia nada ni falla.
 *   G  GUARDA: sin `ventas.canal` (falta 20261104004000) se detiene diciendo qué pegar antes.
 *
 * USO   pnpm pruebas:ventas-online-motores   → necesita el stack local con las migraciones del repo (menos las dos de arriba, que la
 *       prueba carga dentro de su transacción, como `pruebas:ventas-online-canal`).
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (n) => readFileSync(join(RAIZ, "supabase", "migrations", n), "utf8");
const sinControl = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "").replace(/^notify pgrst.*$/m, "");
const CANAL = sinControl(leer("20261104004000_ventas_online_canal.sql"));
const MOTORES = sinControl(leer("20261104032000_motores_del_piso_solo_tienda.sql"));
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const CENTINELA = "22222222-2222-4222-8222-222222222222";
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

const FIXTURE = `
set local search_path = retail, public, extensions;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz, fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);

-- Una sede nueva (sin ventas ni stock de nadie más) y una categoría de ropa.
insert into retail.ubicaciones (nombre, tipo, activo) values ('Sede VO', 'tienda', true);
select id as sede from retail.ubicaciones where nombre = 'Sede VO' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values
  (:'sede', 'Piso de venta', 'piso_venta'), (:'sede', 'Almacén de tienda', 'almacen_tienda');
select set_config('vo.sede', :'sede', true) as _1 \\gset
insert into retail.categorias (nombre, familia) values ('VO Polos', 'indumentaria');
select id as cat from retail.categorias where nombre = 'VO Polos' \\gset
select id as t_m from retail.tallas where valor = 'M' \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat', :'t_m');
select codigo as neutro from retail.colores where familia_color = 'neutro' order by codigo limit 1 \\gset
select set_config('vo.neutro', :'neutro', true) as _4 \\gset

create function pg_temp.prenda(p_sku text) returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id)
    select 'ZZ VO ' || p_sku, (select id from retail.categorias where nombre = 'VO Polos'), mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
    returning id into p;
  insert into retail.variantes (producto_id, sku, precio, costo, talla_id, color_codigo)
    values (p, p_sku, 100, 40, (select id from retail.tallas where valor = 'M'), current_setting('vo.neutro'))
    returning id into v;
  return v;
end $$;
create function pg_temp.mueve(v uuid, n int) returns void language plpgsql as $$
declare m uuid; u uuid := current_setting('vo.sede')::uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
    values (v, u, (select id from retail.sububicaciones where ubicacion_id = u and tipo = 'piso_venta'), 'entrada', n, 'prueba', now() - interval '3 days') returning id into m;
  perform retail.fn_aplicar_movimiento(m);
end $$;
-- Una venta de la prenda en el canal dado (la marca se pone directo: así llega una venta que nació de un apartado online).
create function pg_temp.vende(v uuid, n int, p_canal text, p_dias int default 0) returns uuid language plpgsql as $$
declare vt uuid; li uuid; u uuid := current_setting('vo.sede')::uuid;
begin
  insert into retail.ventas (ubicacion_id, estado, created_at, canal) values (u, 'completada', now() - make_interval(days => p_dias), p_canal) returning id into vt;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (vt, v, n, 100, 40) returning id into li;
  return li;
end $$;
-- Una venta «sin registrar» pendiente anotada en la categoría, en el canal dado.
create function pg_temp.anota(p_canal text) returns uuid language plpgsql as $$
declare vt uuid; li uuid; u uuid := current_setting('vo.sede')::uuid;
begin
  insert into retail.ventas (ubicacion_id, estado, created_at, canal) values (u, 'completada', now() - interval '1 day', p_canal) returning id into vt;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (vt, '${CENTINELA}', 1, 60, 0) returning id into li;
  insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado, vendido_en)
    values (li, u, 'Anotada', (select id from retail.categorias where nombre = 'VO Polos'), (select id from retail.tallas where valor = 'M'), current_setting('vo.neutro'), 60, now() - interval '1 day');
  return li;
end $$;
${como(FELIPE)}
`;

const PRELUDIO = `begin;\n${CANAL}\nset local search_path = retail, public, extensions;\n${MOTORES}\n${FIXTURE}`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado, { prelu = PRELUDIO } = {}) {
  casos++;
  const r = correr(`${prelu}${sql}\nrollback;`);
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

const UNA_PRENDA = `
   select pg_temp.prenda('VO-POL') as vp \\gset
   select pg_temp.mueve(:'vp', 20);
`;

// P. PISO -----------------------------------------------------------------------------------------------------------------
caso(
  "P1 el motor del piso cuenta la venta de la tienda (2) y NO la de TikTok (3) de la misma prenda",
  `${UNA_PRENDA}
   select pg_temp.vende(:'vp', 2, 'tienda');
   select pg_temp.vende(:'vp', 3, 'tiktok');
   select coalesce(sum((e ->> 'escaneadas')::int), 0) from jsonb_array_elements(retail.fn_piso_plan_lectura(:'sede') -> 'ventas') e where e ->> 'categoria_id' = :'cat';`,
  "2",
);
caso(
  "P2 con solo una venta de TikTok el piso no ve ninguna venta de la categoría",
  `${UNA_PRENDA}
   select pg_temp.vende(:'vp', 3, 'tiktok');
   select count(*) from jsonb_array_elements(retail.fn_piso_plan_lectura(:'sede') -> 'ventas') e where e ->> 'categoria_id' = :'cat';`,
  "0",
);
caso(
  "P3 la venta anotada de TikTok tampoco cuenta para el piso; la de la tienda sí",
  `select pg_temp.anota('tiktok');
   select pg_temp.anota('tienda');
   select coalesce(sum((e ->> 'anotadas')::int), 0) from jsonb_array_elements(retail.fn_piso_plan_lectura(:'sede') -> 'ventas') e where e ->> 'categoria_id' = :'cat';`,
  "1",
);

// D. DEMANDA --------------------------------------------------------------------------------------------------------------
caso(
  "D1 la demanda cuenta 2 vendidas de la prenda (la de la tienda) y no las 3 de TikTok",
  `${UNA_PRENDA}
   select pg_temp.vende(:'vp', 2, 'tienda', 2);
   select pg_temp.vende(:'vp', 3, 'tiktok', 2);
   select coalesce(sum((e ->> 'vendidas')::int), 0) from jsonb_array_elements(retail.fn_demanda_sede(:'sede', 28) -> 'variantes') e where e ->> 'variante_id' = :'vp';`,
  "2",
);
caso(
  "D2 la demanda cuenta la anotada de la tienda y no la de TikTok",
  `select pg_temp.anota('tiktok');
   select pg_temp.anota('tienda');
   select coalesce(sum((g ->> 'anotadas')::int), 0) from jsonb_array_elements(retail.fn_demanda_sede(:'sede', 28) -> 'grupos') g where g ->> 'categoria_id' = :'cat';`,
  "1",
);

// E. PREPARACIÓN ----------------------------------------------------------------------------------------------------------
caso(
  "E1 una sede que solo vendió por TikTok no tiene «primera venta» (sin fila o sin fecha): el motor no se da por arrancado",
  `${UNA_PRENDA}
   select pg_temp.vende(:'vp', 3, 'tiktok');
   select coalesce((select primera_venta::text from retail.fn_motor_demanda_preparacion(:'sede')), 'sin-fila');`,
  (o) => o === "" || o === "sin-fila",
);
caso(
  "E2 con una venta de la tienda, la primera venta es hoy",
  `${UNA_PRENDA}
   select pg_temp.vende(:'vp', 1, 'tienda');
   select (select primera_venta = retail.fn_hoy_lima() from retail.fn_motor_demanda_preparacion(:'sede'));`,
  "t",
);

// U. LO QUE DEBE SEGUIR CONTANDO ------------------------------------------------------------------------------------------
caso(
  "U1 el plan de compra y Análisis (fn_unidades_vendidas) SÍ suman la venta de TikTok: es demanda real de CAYLA",
  `${UNA_PRENDA}
   select pg_temp.vende(:'vp', 2, 'tienda');
   select pg_temp.vende(:'vp', 3, 'tiktok');
   select coalesce(sum(unidades), 0) from retail.fn_unidades_vendidas(now() - interval '1 day', now() + interval '1 day') u where u.categoria_id = :'cat' and u.ubicacion_id = :'sede';`,
  "5",
);

// R. RE-EJECUTABLE --------------------------------------------------------------------------------------------------------
caso(
  "R1 cargar la migración dos veces no cambia nada ni falla",
  `${MOTORES}
   select (length(pg_get_functiondef('retail.fn_demanda_sede(uuid, integer)'::regprocedure)) - length(replace(pg_get_functiondef('retail.fn_demanda_sede(uuid, integer)'::regprocedure), 'v.canal = ''tienda''', ''))) / length('v.canal = ''tienda''');`,
  "2",
);

// G. GUARDA ---------------------------------------------------------------------------------------------------------------
caso(
  "G1 sin la columna ventas.canal la migración se detiene y dice qué pegar antes",
  `select 'no-debio-llegar';`,
  (o) => o.includes("Falta retail.ventas.canal"),
  { prelu: `begin;\nset local search_path = retail, public, extensions;\nalter table retail.ventas drop column if exists canal cascade;\n${MOTORES}\n` },
);

console.log(`\n${casos - fallas}/${casos} casos bien`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Pruebas de que los motores del piso, la demanda y el plan de campaña IGNORAN una familia apagada (Bolsas de despacho, actividad 2) contra
 * el Postgres local — CAYLA V2. Migración: `20261010232000_piso_demanda_y_plan_ignoran_familias_apagadas.sql`.
 *
 * LO QUE VIGILA. `familias.entra_a_motores = false` (la familia «Empaque» de las bolsas) tiene que sacar de TRES lecturas todo lo de sus
 * categorías: prendas con stock, ventas escaneadas, ventas «sin registrar» y lo que se pidió y no había. El error caro es que la bolsa de
 * S/ 0.50 vuelva a contar como demanda («colgar otra igual», «pedir al Taller», «comprar para la campaña») sin que ninguna pantalla falle.
 * Cada caso pone LA MISMA fixture en una categoría de una familia apagada (bolsas) y en una de una familia normal (polos) y lee las dos.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; una sede NUEVA por caso).
 *   P  PISO (`fn_piso_plan_lectura`): `tallas`, `ventas`, `curvas` y `anotadas_recientes` traen el polo y no la bolsa; al encender la familia,
 *      la bolsa vuelve (el interruptor es en vivo).
 *   D  DEMANDA (`fn_demanda_sede`): `variantes` y `grupos` (anotadas y perdidas) traen el polo y no la bolsa.
 *   M  PLAN (`fn_plan_compra`): `categorias`, `stock`, `stock_sedes`, `curvas`, `vendido`, `vendido_30` y `catalogo` traen el polo y no la bolsa.
 *   V  VENTA INTACTA: la venta de la bolsa SIGUE en `ventas`/`venta_items` (los motores la ignoran, la caja no).
 *   R  RE-EJECUTABLE: cargar la migración dos veces no cambia nada ni falla.
 *
 * USO (necesita la base AL DÍA con las migraciones del repo, como la del CI: los anclajes parchan la definición viva)
 *   pnpm pruebas:motores-familias-apagadas              → contra la base `postgres` del stack local
 *   pnpm pruebas:motores-familias-apagadas --base otra  → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const leer = (n) => readFileSync(join(RAIZ, "supabase", "migrations", n), "utf8");
const MARCA = leer("20261010231000_familias_entran_a_motores.sql");
const MOTORES = leer("20261010232000_piso_demanda_y_plan_ignoran_familias_apagadas.sql");
const sinControl = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "").replace(/^notify pgrst.*$/m, "");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const CENTINELA = "22222222-2222-4222-8222-222222222222";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
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
${sinControl(MARCA)}
set local search_path = retail, public, extensions;
${sinControl(MOTORES)}
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

-- Una sede nueva (sin ventas ni stock de nadie más) y dos categorías: bolsas en una familia APAGADA y polos en una normal.
insert into retail.ubicaciones (nombre, tipo, activo) values ('Sede BF', 'tienda', true);
select id as sede from retail.ubicaciones where nombre = 'Sede BF' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values
  (:'sede', 'Piso de venta', 'piso_venta'), (:'sede', 'Almacén de tienda', 'almacen_tienda');
select set_config('bf.sede', :'sede', true) as _1 \\gset

insert into retail.familias (codigo, nombre, entra_a_motores) values ('zz_empaque', 'ZZ Empaque', false);
insert into retail.categorias (nombre, familia) values ('BF Bolsas', 'zz_empaque'), ('BF Polos', 'indumentaria');
select id as cat_b from retail.categorias where nombre = 'BF Bolsas' \\gset
select id as cat_p from retail.categorias where nombre = 'BF Polos' \\gset
select set_config('bf.cat_b', :'cat_b', true) as _2, set_config('bf.cat_p', :'cat_p', true) as _3 \\gset
select id as t_m from retail.tallas where valor = 'M' \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat_b', :'t_m'), (:'cat_p', :'t_m');
select codigo as neutro from retail.colores where familia_color = 'neutro' order by codigo limit 1 \\gset
select set_config('bf.neutro', :'neutro', true) as _4 \\gset

-- Una prenda (producto + variante) en la categoría dada.
create function pg_temp.prenda(p_cat uuid, p_sku text) returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id)
    select 'ZZ BF ' || p_sku, p_cat, mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
    returning id into p;
  insert into retail.variantes (producto_id, sku, precio, costo, talla_id, color_codigo)
    values (p, p_sku, 100, 40, (select id from retail.tallas where valor = 'M'), current_setting('bf.neutro'))
    returning id into v;
  return v;
end $$;
-- Stock en el piso de la sede (la forma real: un movimiento aplicado).
create function pg_temp.mueve(v uuid, n int) returns void language plpgsql as $$
declare m uuid; u uuid := current_setting('bf.sede')::uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
    values (v, u, (select id from retail.sububicaciones where ubicacion_id = u and tipo = 'piso_venta'), 'entrada', n, 'prueba', now() - interval '3 days') returning id into m;
  perform retail.fn_aplicar_movimiento(m);
end $$;
-- Una venta de la prenda, hecha en la sede en la fecha dada.
create function pg_temp.vende(v uuid, n int, cuando timestamptz default now()) returns uuid language plpgsql as $$
declare vt uuid; li uuid; u uuid := current_setting('bf.sede')::uuid;
begin
  insert into retail.ventas (ubicacion_id, estado, created_at) values (u, 'completada', cuando) returning id into vt;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (vt, v, n, 100, 40) returning id into li;
  return li;
end $$;
-- Una venta «sin registrar» pendiente anotada en la categoría dada.
create function pg_temp.anota(p_cat uuid, cuando timestamptz default now()) returns uuid language plpgsql as $$
declare vt uuid; li uuid; u uuid := current_setting('bf.sede')::uuid;
begin
  insert into retail.ventas (ubicacion_id, estado, created_at) values (u, 'completada', cuando) returning id into vt;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (vt, '${CENTINELA}', 1, 60, 0) returning id into li;
  insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado, vendido_en)
    values (li, u, 'Anotada', p_cat, (select id from retail.tallas where valor = 'M'), current_setting('bf.neutro'), 60, cuando);
  return li;
end $$;
-- Cuántas veces aparece una categoría en una lista de la lectura (por la clave que la nombra).
create function pg_temp.veces(p_lista jsonb, p_clave text, p_cat uuid) returns integer language sql immutable as $$
  select count(*)::integer from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) e where e ->> p_clave = p_cat::text
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

// Las dos prendas (bolsa y polo) con stock y una venta hoy cada una; deja :vb, :vp, :cat_b, :cat_p listos.
const DOS_PRENDAS = `
   select pg_temp.prenda(:'cat_b', 'BF-BOL') as vb \\gset
   select pg_temp.prenda(:'cat_p', 'BF-POL') as vp \\gset
   select pg_temp.mueve(:'vb', 9);
   select pg_temp.mueve(:'vp', 9);
   select pg_temp.vende(:'vb', 2);
   select pg_temp.vende(:'vp', 2);
`;

// P. PISO -----------------------------------------------------------------------------------------------------------------
caso(
  "P1 el motor del piso trae el polo y NO la bolsa en tallas, ventas y curvas",
  `${DOS_PRENDAS}
   select concat_ws(',',
     (select count(*) from jsonb_array_elements(retail.fn_piso_plan_lectura(:'sede') -> 'tallas') t where t ->> 'variante_id' = :'vp'),
     (select count(*) from jsonb_array_elements(retail.fn_piso_plan_lectura(:'sede') -> 'tallas') t where t ->> 'variante_id' = :'vb'),
     pg_temp.veces(retail.fn_piso_plan_lectura(:'sede') -> 'ventas', 'categoria_id', :'cat_p'),
     pg_temp.veces(retail.fn_piso_plan_lectura(:'sede') -> 'ventas', 'categoria_id', :'cat_b'),
     pg_temp.veces(retail.fn_piso_plan_lectura(:'sede') -> 'curvas', 'categoria_id', :'cat_p'),
     pg_temp.veces(retail.fn_piso_plan_lectura(:'sede') -> 'curvas', 'categoria_id', :'cat_b'));`,
  "1,0,1,0,1,0",
);
caso(
  "P2 el motor del piso no cuenta la venta anotada de la bolsa (ventas y anotadas_recientes), y sí la del polo",
  `select pg_temp.anota(:'cat_b');
   select pg_temp.anota(:'cat_p');
   select concat_ws(',',
     pg_temp.veces(retail.fn_piso_plan_lectura(:'sede') -> 'ventas', 'categoria_id', :'cat_p'),
     pg_temp.veces(retail.fn_piso_plan_lectura(:'sede') -> 'ventas', 'categoria_id', :'cat_b'),
     pg_temp.veces(retail.fn_piso_plan_lectura(:'sede') -> 'anotadas_recientes', 'categoria_id', :'cat_p'),
     pg_temp.veces(retail.fn_piso_plan_lectura(:'sede') -> 'anotadas_recientes', 'categoria_id', :'cat_b'));`,
  "1,0,1,0",
);
caso(
  "P3 el interruptor es en vivo: al encender la familia, la bolsa vuelve al motor del piso; al apagarla, se va",
  `${DOS_PRENDAS}
   select pg_temp.veces(retail.fn_piso_plan_lectura(:'sede') -> 'ventas', 'categoria_id', :'cat_b') as apagada \\gset
   update retail.familias set entra_a_motores = true where codigo = 'zz_empaque';
   select pg_temp.veces(retail.fn_piso_plan_lectura(:'sede') -> 'ventas', 'categoria_id', :'cat_b') as encendida \\gset
   update retail.familias set entra_a_motores = false where codigo = 'zz_empaque';
   select concat_ws(',', :'apagada', :'encendida', pg_temp.veces(retail.fn_piso_plan_lectura(:'sede') -> 'ventas', 'categoria_id', :'cat_b'));`,
  "0,1,0",
);

// D. DEMANDA --------------------------------------------------------------------------------------------------------------
caso(
  "D1 la demanda trae la prenda del polo y NO la de la bolsa; ni sus anotadas ni lo que se pidió y no había",
  `${DOS_PRENDAS}
   select pg_temp.anota(:'cat_b', now() - interval '2 days');
   select pg_temp.anota(:'cat_p', now() - interval '2 days');
   insert into retail.pedidos_no_atendidos (ubicacion_id, producto_id, variante_id, motivo, created_at) values
     (:'sede', (select producto_id from retail.variantes where id = :'vb'), :'vb', 'no_habia_talla', now() - interval '2 days'),
     (:'sede', (select producto_id from retail.variantes where id = :'vp'), :'vp', 'no_habia_talla', now() - interval '2 days');
   select concat_ws(',',
     (select count(*) from jsonb_array_elements(retail.fn_demanda_sede(:'sede', 28) -> 'variantes') x where x ->> 'variante_id' = :'vp'),
     (select count(*) from jsonb_array_elements(retail.fn_demanda_sede(:'sede', 28) -> 'variantes') x where x ->> 'variante_id' = :'vb'),
     (select coalesce(sum((g ->> 'anotadas')::int + (g ->> 'perdidas')::int), 0) from jsonb_array_elements(retail.fn_demanda_sede(:'sede', 28) -> 'grupos') g where g ->> 'categoria_id' = :'cat_p'),
     (select coalesce(sum((g ->> 'anotadas')::int + (g ->> 'perdidas')::int), 0) from jsonb_array_elements(retail.fn_demanda_sede(:'sede', 28) -> 'grupos') g where g ->> 'categoria_id' = :'cat_b'));`,
  "1,0,2,0",
);

// M. PLAN DE CAMPAÑA ------------------------------------------------------------------------------------------------------
caso(
  "M1 la hoja del plan ofrece el polo con su stock, su curva y lo vendido, y NO la bolsa en ninguna de sus siete listas",
  `select pg_temp.prenda(:'cat_b', 'BF-BOL') as vb \\gset
   select pg_temp.prenda(:'cat_p', 'BF-POL') as vp \\gset
   select pg_temp.mueve(:'vb', 9);
   select pg_temp.mueve(:'vp', 9);
   select pg_temp.vende(:'vb', 3, now() - interval '10 days');
   select pg_temp.vende(:'vp', 3, now() - interval '10 days');
   select pg_temp.vende(:'vb', 4, timestamptz '2026-12-05 12:00-05');
   select pg_temp.vende(:'vp', 4, timestamptz '2026-12-05 12:00-05');
   select pg_temp.anota(:'cat_b', now() - interval '5 days');
   select pg_temp.anota(:'cat_p', now() - interval '5 days');
   select retail.fn_plan_compra((select id from retail.planes_compra where nombre = 'Diciembre 2026')) as h \\gset
   select concat_ws(' ',
     'cats=' || pg_temp.veces(:'h'::jsonb -> 'categorias', 'id', :'cat_p') || pg_temp.veces(:'h'::jsonb -> 'categorias', 'id', :'cat_b'),
     'stock=' || pg_temp.veces(:'h'::jsonb -> 'stock', 'categoria_id', :'cat_p') || pg_temp.veces(:'h'::jsonb -> 'stock', 'categoria_id', :'cat_b'),
     'sedes=' || pg_temp.veces(:'h'::jsonb -> 'stock_sedes', 'categoria_id', :'cat_p') || pg_temp.veces(:'h'::jsonb -> 'stock_sedes', 'categoria_id', :'cat_b'),
     'curvas=' || pg_temp.veces(:'h'::jsonb -> 'curvas', 'categoria_id', :'cat_p') || pg_temp.veces(:'h'::jsonb -> 'curvas', 'categoria_id', :'cat_b'),
     'vendido=' || pg_temp.veces(:'h'::jsonb -> 'vendido', 'categoria_id', :'cat_p') || pg_temp.veces(:'h'::jsonb -> 'vendido', 'categoria_id', :'cat_b'),
     'v30=' || pg_temp.veces(:'h'::jsonb -> 'vendido_30', 'categoria_id', :'cat_p') || pg_temp.veces(:'h'::jsonb -> 'vendido_30', 'categoria_id', :'cat_b'),
     'cat=' || pg_temp.veces(:'h'::jsonb -> 'catalogo', 'categoria_id', :'cat_p') || pg_temp.veces(:'h'::jsonb -> 'catalogo', 'categoria_id', :'cat_b'));`,
  "cats=10 stock=10 sedes=10 curvas=10 vendido=10 v30=10 cat=10",
);
caso(
  "M2 lo vendido del polo en el plan suma lo suyo (3 + 1 anotada en 30 días; 4 dentro de la campaña) y nada de la bolsa",
  `select pg_temp.prenda(:'cat_b', 'BF-BOL') as vb \\gset
   select pg_temp.prenda(:'cat_p', 'BF-POL') as vp \\gset
   select pg_temp.vende(:'vb', 3, now() - interval '10 days');
   select pg_temp.vende(:'vp', 3, now() - interval '10 days');
   select pg_temp.vende(:'vb', 4, timestamptz '2026-12-05 12:00-05');
   select pg_temp.vende(:'vp', 4, timestamptz '2026-12-05 12:00-05');
   select pg_temp.anota(:'cat_b', now() - interval '5 days');
   select pg_temp.anota(:'cat_p', now() - interval '5 days');
   select retail.fn_plan_compra((select id from retail.planes_compra where nombre = 'Diciembre 2026')) as h \\gset
   select concat_ws(',',
     (select coalesce(sum((e ->> 'unidades')::int), 0) from jsonb_array_elements(:'h'::jsonb -> 'vendido_30') e where e ->> 'categoria_id' = :'cat_p'),
     (select coalesce(sum((e ->> 'unidades')::int), 0) from jsonb_array_elements(:'h'::jsonb -> 'vendido_30') e where e ->> 'categoria_id' = :'cat_b'),
     (select coalesce(sum((e ->> 'unidades')::int), 0) from jsonb_array_elements(:'h'::jsonb -> 'vendido') e where e ->> 'categoria_id' = :'cat_p'),
     (select coalesce(sum((e ->> 'unidades')::int), 0) from jsonb_array_elements(:'h'::jsonb -> 'vendido') e where e ->> 'categoria_id' = :'cat_b'));`,
  "4,0,4,0",
);

// V. LA VENTA SIGUE SIENDO VENTA ------------------------------------------------------------------------------------------
caso(
  "V1 la venta de la bolsa sigue entera en ventas y venta_items: los motores la ignoran, la caja no",
  `${DOS_PRENDAS}
   select pg_temp.anota(:'cat_b');
   select count(*) || ',' || coalesce(sum(vi.cantidad * vi.precio_unitario), 0)
     from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id
    where v.ubicacion_id = :'sede' and v.estado = 'completada';`,
  "3,460.00",
);

// R. RE-EJECUTABLE --------------------------------------------------------------------------------------------------------
caso(
  "R1 cargar la migración otra vez no falla ni agrega preguntas de más (5 / 3 / 10)",
  `${sinControl(MOTORES)}
   select concat_ws(',',
     (length(pg_get_functiondef('retail.fn_piso_plan_lectura(uuid)'::regprocedure)) - length(replace(pg_get_functiondef('retail.fn_piso_plan_lectura(uuid)'::regprocedure), 'fn_categoria_entra_a_motores', ''))) / length('fn_categoria_entra_a_motores'),
     (length(pg_get_functiondef('retail.fn_demanda_sede(uuid, integer)'::regprocedure)) - length(replace(pg_get_functiondef('retail.fn_demanda_sede(uuid, integer)'::regprocedure), 'fn_categoria_entra_a_motores', ''))) / length('fn_categoria_entra_a_motores'),
     (length(pg_get_functiondef('retail.fn_plan_compra(uuid)'::regprocedure)) - length(replace(pg_get_functiondef('retail.fn_plan_compra(uuid)'::regprocedure), 'fn_categoria_entra_a_motores', ''))) / length('fn_categoria_entra_a_motores'));`,
  "5,3,10",
);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);

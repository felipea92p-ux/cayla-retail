#!/usr/bin/env node
/**
 * Prueba de integración de Movimientos leído desde la tienda (ADR-0234, migración 20260927153000) contra el Postgres
 * LOCAL: `retail.fn_movimientos_resumen_procesos` (nueva) y el filtro «Entradas» / «Salidas» de `retail.fn_movimientos`.
 *
 * Lo que ninguna prueba de TypeScript puede verificar:
 *   · un traslado que LLEGA cuenta en «Entradas» y en «Traslados», y uno que SALE, en «Salidas» y en «Traslados»
 *     — en las cifras y en la lista, que tienen que decir lo mismo;
 *   · una operación es lo guardado en una sola transacción sobre un mismo documento: 16 líneas de un traslado son UNA,
 *     un cambio (entra lo devuelto, sale lo nuevo) es UNO aunque esté en Entradas y en Salidas, y dos ventas guardadas
 *     en la misma transacción son DOS;
 *   · los ajustes van aparte: un ajuste que resta no es una «Salida»;
 *   · lo que se movió entre piso y almacén no suma ni resta, y se cuenta como «movidas»;
 *   · el parche de `fn_movimientos` está puesto (re-pegable) y el permiso es el de siempre: quien no opera la sede no
 *     la ve, `anon` no ejecuta, una sola firma.
 *
 * Todo lo de prueba lleva fechas de enero de 2020, que ningún dato de siembra tiene: el período las aísla. Cada caso
 * termina en ROLLBACK — no deja nada en el Postgres compartido (regla: no ensuciar la base local; jamás `db reset`).
 *
 * USO
 *   pnpm pruebas:movimientos-desde-la-tienda    → necesita el stack local levantado
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
}

/** Tienda Lima con piso y almacén, el Taller, quién firma, y las fechas de cada operación (una por día de enero de 2020). */
const PRELUDIO = `
begin;
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select id as sp from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select id as sa from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset
select id as persona from public.personas where auth_user_id = '${FELIPE}' \\gset

create function pg_temp.variante(sku text) returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'productos' and column_name = 'marca_id') then
    insert into retail.productos (referencia, estado, marca_id, proveedor_id)
      select 'ZZ ' || sku, 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
      returning id into p;
  else
    insert into retail.productos (referencia, estado) values ('ZZ ' || sku, 'activo') returning id into p;
  end if;
  insert into retail.variantes (producto_id, sku, precio, costo, activo) values (p, sku, 100, 40, true) returning id into v;
  return v;
end $$;

-- Un movimiento con su hora puesta a mano: en una sola transacción de prueba \`now()\` es el mismo para todo, y acá cada
-- operación necesita su propia hora (la de SU transacción).
create function pg_temp.mov(v uuid, tipo text, cant int, u uuid, sub uuid, motivo text, t timestamptz, persona uuid,
                            ti uuid default null, trc uuid default null, vi uuid default null, camb uuid default null,
                            destino uuid default null, sub_destino uuid default null)
returns uuid language sql as $$
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at, usuario_id,
                                  transferencia_item_id, transferencia_recepcion_id, venta_item_id, cambio_id,
                                  ubicacion_destino_id, sububicacion_destino_id)
  values (v, u, sub, tipo, cant, motivo, t, persona, ti, trc, vi, camb, destino, sub_destino) returning id
$$;

select pg_temp.variante('ZZ-TDA-A') as va \\gset
select pg_temp.variante('ZZ-TDA-B') as vb \\gset
select pg_temp.variante('ZZ-TDA-C') as vc \\gset

-- 1. Traslado 999001 que LLEGA del Taller: dos líneas, una sola recepción (la misma hora).
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, numero) values (:'taller', :'ubic', 'cerrada', 999001) returning id as tr1 \\gset
insert into retail.transferencia_recepciones (transferencia_id, variante_id, cantidad_recibida) values (:'tr1', :'va', 4) returning id as rca \\gset
insert into retail.transferencia_recepciones (transferencia_id, variante_id, cantidad_recibida) values (:'tr1', :'vb', 3) returning id as rcb \\gset
select pg_temp.mov(:'va', 'entrada', 4, :'ubic', :'sa', 'traslado_entrada', '2020-01-10 10:00-05', :'persona', trc => :'rca');
select pg_temp.mov(:'vb', 'entrada', 3, :'ubic', :'sa', 'traslado_entrada', '2020-01-10 10:00-05', :'persona', trc => :'rcb');

-- 2. Traslado 999002 que SALE hacia el Taller.
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, numero) values (:'ubic', :'taller', 'en_transito', 999002) returning id as tr2 \\gset
insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (:'tr2', :'vc', 2) returning id as tic \\gset
select pg_temp.mov(:'vc', 'salida', 2, :'ubic', :'sa', 'traslado_salida', '2020-01-11 10:00-05', :'persona', ti => :'tic');

-- 3 y 4. Dos ventas guardadas en LA MISMA transacción (la misma hora): V1 con boleta, V2 con dos prendas.
insert into retail.ventas (ubicacion_id, estado) values (:'ubic', 'completada') returning id as v1 \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (:'v1', :'va', 1, 100, 40) returning id as vi1 \\gset
insert into retail.ventas (ubicacion_id, estado) values (:'ubic', 'completada') returning id as v2 \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (:'v2', :'vb', 1, 100, 40) returning id as vi2b \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (:'v2', :'vc', 1, 100, 40) returning id as vi2c \\gset
select pg_temp.mov(:'va', 'salida', 1, :'ubic', :'sp', 'venta', '2020-01-13 10:00-05', :'persona', vi => :'vi1');
select pg_temp.mov(:'vb', 'salida', 1, :'ubic', :'sp', 'venta', '2020-01-13 10:00-05', :'persona', vi => :'vi2b');
select pg_temp.mov(:'vc', 'salida', 1, :'ubic', :'sp', 'venta', '2020-01-13 10:00-05', :'persona', vi => :'vi2c');

-- 5. Un cambio: entra lo devuelto (A) y sale lo nuevo (B), la misma hora y el mismo cambio.
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad) values (:'vi1', :'ubic', :'vb', 1) returning id as ca \\gset
select pg_temp.mov(:'va', 'entrada', 1, :'ubic', :'sp', 'cambio', '2020-01-12 10:00-05', :'persona', camb => :'ca');
select pg_temp.mov(:'vb', 'salida', 1, :'ubic', :'sp', 'cambio', '2020-01-12 10:00-05', :'persona', camb => :'ca');

-- 6. Una bajada al piso de dos prendas de una vez (no cambia el total de la tienda).
select pg_temp.mov(:'va', 'traslado', 2, :'ubic', :'sa', 'movimiento_interno', '2020-01-14 10:00-05', :'persona', destino => :'ubic', sub_destino => :'sp');
select pg_temp.mov(:'vb', 'traslado', 1, :'ubic', :'sa', 'movimiento_interno', '2020-01-14 10:00-05', :'persona', destino => :'ubic', sub_destino => :'sp');

-- 7. Un ajuste que resta (conteo físico sin conteo formal).
select pg_temp.mov(:'vc', 'ajuste', -2, :'ubic', :'sa', 'conteo_fisico', '2020-01-15 10:00-05', :'persona');

-- Lo que devuelven las cifras de enero de 2020, por grupo y proceso.
create function pg_temp.r(g text, p text, col text) returns text language plpgsql as $$
declare res text;
begin
  execute format('select coalesce(sum(%I), 0)::text from retail.fn_movimientos_resumen_procesos($1, p_desde => date ''2020-01-01'', p_hasta => date ''2020-01-31'') where grupo = $2 and ($3 is null or proceso = $3)', col)
    into res using current_setting('prueba.ubic')::uuid, g, p;
  return res;
end $$;
select set_config('prueba.ubic', :'ubic', false);
-- Cuántas FILAS trae la lista con un tipo (el filtro que tocan las píldoras).
create function pg_temp.n(cat text) returns int language sql as $$
  select count(*)::int from retail.fn_movimientos(current_setting('prueba.ubic')::uuid, p_desde => date '2020-01-01', p_hasta => date '2020-01-31', p_categoria => cat, p_limite => 200)
$$;
set local request.jwt.claim.sub = '${FELIPE}';
`;

const K = (clave, expresion) => `select 'K|${clave}|' || (${expresion})::text;`;

function parsear(salida) {
  const d = {};
  for (const linea of salida.split("\n")) {
    if (!linea.startsWith("K|")) continue;
    const [, clave, ...resto] = linea.split("|");
    d[clave] = resto.join("|");
  }
  return d;
}

let fallos = 0;
let total = 0;
function afirmar(nombre, condicion, detalle = "") {
  total += 1;
  if (condicion) console.log(`  ✔ ${nombre}`);
  else {
    fallos += 1;
    console.log(`  ✘ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}
const igual = (d, clave, esperado, nombre) => afirmar(nombre, d[clave] === String(esperado), `${clave}=${JSON.stringify(d[clave])} esperado=${JSON.stringify(String(esperado))}`);

function correr(titulo, sql, verificar) {
  console.log(`\n${titulo}`);
  let salida;
  try {
    salida = psql(sql).trim();
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del caso falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 4).join(" ")}`);
    return;
  }
  verificar(parsear(salida));
}

correr(
  "1. Entró y salió, leído desde la tienda",
  `${PRELUDIO}
${K("entran", "pg_temp.r('entrada', null, 'entran')")}
${K("entran_traslado", "pg_temp.r('entrada', 'traslado_entrada', 'entran')")}
${K("salen", "pg_temp.r('salida', null, 'salen')")}
${K("salen_traslado", "pg_temp.r('salida', 'traslado_salida', 'salen')")}
${K("traslados", "pg_temp.r('transferencia', null, 'operaciones')")}
${K("lista_entradas", "pg_temp.n('entrada')")}
${K("lista_salidas", "pg_temp.n('salida')")}
${K("lista_traslados", "pg_temp.n('transferencia')")}
rollback;`,
  (d) => {
    igual(d, "entran", 8, "«Entró» suma el traslado que llegó (4+3) y lo devuelto en el cambio (1): +8");
    igual(d, "entran_traslado", 7, "de eso, 7 llegaron por traslado");
    igual(d, "salen", 6, "«Salió» suma el traslado que salió (2), las dos ventas (3) y lo que se llevó en el cambio (1): −6");
    igual(d, "salen_traslado", 2, "de eso, 2 salieron por traslado");
    igual(d, "traslados", 2, "«Traslados» cuenta las dos operaciones: la que llegó y la que salió");
    igual(d, "lista_entradas", 3, "la lista con «Entradas» trae las 2 líneas del traslado que llegó y lo devuelto en el cambio");
    igual(d, "lista_salidas", 5, "la lista con «Salidas» trae el traslado que salió, las 3 prendas vendidas y lo que se llevó en el cambio");
    igual(d, "lista_traslados", 3, "la lista con «Traslados» sigue trayendo las dos piernas");
  },
);

correr(
  "2. Una operación es lo guardado de una sola vez sobre un mismo documento",
  `${PRELUDIO}
${K("todos", "pg_temp.r('todos', null, 'operaciones')")}
${K("traslado_una", "pg_temp.r('entrada', 'traslado_entrada', 'operaciones')")}
${K("traslado_filas", "pg_temp.r('entrada', 'traslado_entrada', 'filas')")}
${K("ventas", "pg_temp.r('salida', 'venta', 'operaciones')")}
${K("cambio_todos", "pg_temp.r('todos', 'cambio', 'operaciones')")}
${K("cambio_entra", "pg_temp.r('entrada', 'cambio', 'operaciones')")}
${K("cambio_sale", "pg_temp.r('salida', 'cambio', 'operaciones')")}
rollback;`,
  (d) => {
    igual(d, "traslado_una", 1, "las 2 líneas del traslado que llegó son UNA operación…");
    igual(d, "traslado_filas", 2, "…con sus 2 filas");
    igual(d, "ventas", 2, "dos ventas guardadas en la misma transacción son DOS operaciones (el documento está en la clave)");
    igual(d, "cambio_todos", 1, "el cambio es UNA operación en «Todos»…");
    igual(d, "cambio_entra", 1, "…aparece en «Entradas» (lo devuelto)…");
    igual(d, "cambio_sale", 1, "…y en «Salidas» (lo nuevo)");
    igual(d, "todos", 7, "«Todos» = 7: traslado que llegó, traslado que salió, 2 ventas, cambio, bajada y ajuste — nada dos veces");
  },
);

correr(
  "3. Los ajustes van aparte y lo movido dentro de la sede no suma ni resta",
  `${PRELUDIO}
${K("ajuste_salen", "pg_temp.r('ajuste', null, 'salen')")}
${K("ajuste_en_salidas", "pg_temp.r('salida', 'conteo_fisico', 'operaciones')")}
${K("movidas", "pg_temp.r('interno', null, 'movidas')")}
${K("interno_ops", "pg_temp.r('interno', null, 'operaciones')")}
${K("interno_entran", "pg_temp.r('interno', null, 'entran')")}
${K("interno_en_entradas", "pg_temp.r('entrada', 'movimiento_interno', 'operaciones')")}
rollback;`,
  (d) => {
    igual(d, "ajuste_salen", 2, "el ajuste resta 2 en «Ajustes»…");
    igual(d, "ajuste_en_salidas", 0, "…y no aparece como «Salida» (D1: los ajustes van aparte)");
    igual(d, "interno_ops", 1, "la bajada de dos prendas de una vez es UNA operación");
    igual(d, "movidas", 3, "movió 3 unidades entre almacén y piso");
    igual(d, "interno_entran", 0, "sin sumar al total de la tienda");
    igual(d, "interno_en_entradas", 0, "ni aparecer como «Entrada»");
  },
);

correr(
  "4. Permisos, firma única y parche re-pegable",
  `begin;
${K("n_resumen", "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_movimientos_resumen_procesos')")}
${K("anon", "has_function_privilege('anon', 'retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid)'::regprocedure, 'EXECUTE')")}
${K("auth", "has_function_privilege('authenticated', 'retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid)'::regprocedure, 'EXECUTE')")}
${K("parche_entradas", "position('ADR-0234: entradas_desde_la_tienda' in pg_get_functiondef('retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid)'::regprocedure)) > 0")}
${K("parche_salidas", "position('ADR-0234: salidas_desde_la_tienda' in pg_get_functiondef('retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid)'::regprocedure)) > 0")}
rollback;`,
  (d) => {
    igual(d, "n_resumen", 1, "hay UNA sola fn_movimientos_resumen_procesos");
    igual(d, "anon", "false", "anon NO puede ejecutarla");
    igual(d, "auth", "true", "authenticated sí");
    igual(d, "parche_entradas", "true", "«Entradas» de la lista ya trae los traslados que llegan (parche puesto)");
    igual(d, "parche_salidas", "true", "«Salidas» de la lista ya trae los traslados que salen (parche puesto)");
  },
);

// Quien no opera Tienda Lima (Micaela, de Trujillo) no ve sus cifras: la función lanza el error de siempre.
console.log("\n5. Quien no opera la sede no ve sus cifras");
try {
  // El id de Lima se lee ANTES de pasar a Micaela: con su rol, la RLS de \`ubicaciones\` ya no le deja ver otra tienda.
  psql(`begin;
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
set local request.jwt.claim.sub = '${MICAELA}';
set local role authenticated;
select count(*) from retail.fn_movimientos_resumen_procesos(:'lima');
rollback;`);
  afirmar("Micaela (Trujillo) no puede leer las cifras de Tienda Lima", false, "la consulta respondió en vez de rechazar");
} catch (e) {
  afirmar("Micaela (Trujillo) no puede leer las cifras de Tienda Lima", /No tienes permiso/.test(String(e.stderr ?? e.message)), String(e.stderr ?? e.message).split("\n")[0]);
}

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);

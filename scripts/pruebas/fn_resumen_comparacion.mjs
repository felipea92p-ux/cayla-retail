#!/usr/bin/env node
/**
 * Prueba de integración de `retail.fn_resumen_comparacion` (Resumen de Inventario,
 * comparación de dos períodos, ADR-0138, migración 20260919220000) contra el Postgres LOCAL.
 *
 * Verifica lo que ninguna prueba de TypeScript puede: que la RPC reconstruye el stock al
 * INICIO y al CIERRE de cada período sobre el ledger, sin deducirlo de las ventas, y las entradas.
 *   · stock inicio → cierre: «inicio 0 → cierre 14» con 4 vendidas (llegó mercadería);
 *   · un período que llega hasta hoy cierra con el stock de hoy;
 *   · períodos NO contiguos: el cierre de A no es el inicio de B;
 *   · importe y COGS: precio − descuento; el costo de lo vendido es el del día de la venta (no el
 *     de hoy) y va en COMPONENTES (costo de lo vendido, costo de lo devuelto); una venta a costo 0
 *     se cuenta como «unidad sin costo» (la rotación no se inventa el costo); anulada no cuenta;
 *   · días con stock por período (piso), ledger que no cuadra → `ledger_consistente = false`;
 *   · un colaborador no recibe filas; `anon` sin EXECUTE; una sola firma.
 *
 * Mismo mecanismo que `fn_resumen_variantes.mjs`: `docker exec … psql`, `set local
 * request.jwt.claim.sub` y `ROLLBACK` SIEMPRE — no deja nada en el Postgres compartido.
 *
 * USO
 *   pnpm pruebas:fn-resumen-comparacion    → necesita el stack local levantado
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

/**
 * Todo caso empieza igual: una sede con piso/almacén, el líder (o quien se pida) y un reloj propio.
 * Período A = días 0–14 desde `t0`; período B = días 15 hasta hoy (t0 = 00:00 de Lima de hace 29 días).
 */
function prelude({ persona = FELIPE, sede = "Tienda Lima" } = {}) {
  return `
begin;
set local request.jwt.claim.sub = '${persona}';
select id as ubic from retail.ubicaciones where nombre = '${sede}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select id as sp from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select id as sa from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset
select (((now() at time zone 'America/Lima')::date - 29)::timestamp at time zone 'America/Lima') as t0 \\gset
select ((now() at time zone 'America/Lima')::date) as hoy \\gset
select set_config('prueba.ubic', :'ubic', true) as _cfg \\gset

-- Un movimiento del ledger con fecha controlada (no toca \`stock\`: cada caso deja el saldo final a mano).
create function pg_temp.mov(v uuid, tipo text, cant int, sub uuid, motivo text, cuando timestamptz,
                            venta_item uuid default null, dev_item uuid default null)
returns uuid language sql as $$
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, devolucion_item_id, created_at)
  values (v, current_setting('prueba.ubic')::uuid, sub, tipo, cant, motivo, venta_item, dev_item, cuando) returning id
$$;
create function pg_temp.saldo(v uuid, sub uuid, cant int) returns void language sql as $$
  insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad) values (v, current_setting('prueba.ubic')::uuid, sub, cant)
  on conflict (variante_id, ubicacion_id, sububicacion_id) do update set cantidad = excluded.cantidad
$$;
-- Un producto + variante de prueba. Desde ADR-0109 todo producto lleva marca y proveedor (NOT NULL).
create function pg_temp.variante(sku text, costo numeric default 40) returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'productos' and column_name = 'marca_id') then
    insert into retail.productos (referencia, estado, marca_id, proveedor_id)
      select 'ZZ ' || sku, 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
      returning id into p;
  else
    insert into retail.productos (referencia, estado) values ('ZZ ' || sku, 'activo') returning id into p;
  end if;
  insert into retail.variantes (producto_id, sku, precio, costo, activo) values (p, sku, 100, costo, true) returning id into v;
  return v;
end $$;
-- Una venta con una línea (precio 100, descuento y costo a elección); devuelve el id de la línea.
create function pg_temp.venta(v uuid, cant int, descuento numeric default 0, costo numeric default 40, estado text default 'completada') returns uuid language plpgsql as $$
declare vt uuid; li uuid;
begin
  if estado = 'anulada' then
    insert into retail.ventas (ubicacion_id, estado, anulado_en, motivo_anulacion) values (current_setting('prueba.ubic')::uuid, 'anulada', now(), 'prueba') returning id into vt;
  else
    insert into retail.ventas (ubicacion_id, estado) values (current_setting('prueba.ubic')::uuid, 'completada') returning id into vt;
  end if;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario, motivo_descuento)
    values (vt, v, cant, 100, descuento, costo, case when descuento > 0 then 'liquidacion_temporada' end) returning id into li;
  return li;
end $$;
`;
}

// A = [t0, t0+15d) ; B = [t0+15d, ahora]. Las fechas se calculan en Lima desde `hoy`.
const LLAMADA = `retail.fn_resumen_comparacion(:'ubic', :'hoy'::date - 29, :'hoy'::date - 15, :'hoy'::date - 14, :'hoy'::date)`;

const FILA = (sku, llamada = LLAMADA) =>
  `select 'R|' || r.sku || '|' || r.a_ventas || '|' || r.a_devoluciones || '|' || r.a_importe || '|' || r.a_costo_ventas || '|' || r.a_costo_devoluciones || '|' || r.a_uds_sin_costo || '|' || r.a_entradas || '|' || r.a_stock_inicio || '|' || r.a_stock_cierre || '|' || r.a_dias_con_stock
     || '|' || r.b_ventas || '|' || r.b_devoluciones || '|' || r.b_importe || '|' || r.b_costo_ventas || '|' || r.b_costo_devoluciones || '|' || r.b_uds_sin_costo || '|' || r.b_entradas || '|' || r.b_stock_inicio || '|' || r.b_stock_cierre || '|' || r.b_dias_con_stock || '|' || r.ledger_consistente
   from ${llamada} r where r.sku = '${sku}';`;

function parsear(salida) {
  const filas = {};
  for (const linea of salida.split("\n")) {
    if (!linea.startsWith("R|")) continue;
    const c = linea.split("|");
    filas[c[1]] = {
      a: { ventas: +c[2], dev: +c[3], importe: +c[4], costoVentas: +c[5], costoDev: +c[6], sinCosto: +c[7], entradas: +c[8], ini: +c[9], fin: +c[10], dias: +c[11] },
      b: { ventas: +c[12], dev: +c[13], importe: +c[14], costoVentas: +c[15], costoDev: +c[16], sinCosto: +c[17], entradas: +c[18], ini: +c[19], fin: +c[20], dias: +c[21] },
      ledger: c[22] === "true",
    };
  }
  return filas;
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
const cerca = (a, b, tol = 0.02) => a !== null && a !== undefined && Math.abs(a - b) <= tol;

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
  verificar(parsear(salida), salida);
}

// ---------------------------------------------------------------------------
// 1. Stock al inicio y al cierre: se reconstruye del ledger, no se deduce de las ventas
// ---------------------------------------------------------------------------
correr(
  "1. «inicio 0 → cierre 14» con 4 vendidas en A: llegó mercadería; el cierre de A es el inicio de B; B cierra con el stock de hoy",
  `${prelude()}
select pg_temp.variante('ZZ-CMP-A') as va \\gset
-- Día 0 entran 10 al piso; día 5 se venden 4 (queda 6); día 10 llegan 8 al almacén (utilizable 14).
select pg_temp.mov(:'va', 'entrada', 10, :'sp', 'carga_inicial', :'t0'::timestamptz + interval '1 hour') as _1 \\gset
select count(pg_temp.mov(:'va', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '5 days' + (i * interval '1 hour'))) as _2 from generate_series(1, 4) i \\gset
select pg_temp.mov(:'va', 'entrada', 8, :'sa', 'recepcion', :'t0'::timestamptz + interval '10 days') as _3 \\gset
-- Ya en B: día 16 se venden 3 (piso 3); día 20 se bajan los 8 del almacén al piso (movimiento interno: no cambia lo utilizable).
select count(pg_temp.mov(:'va', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '16 days' + (i * interval '1 hour'))) as _4 from generate_series(1, 3) i \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  values (:'va', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 8, 'movimiento_interno', :'t0'::timestamptz + interval '20 days');
select pg_temp.saldo(:'va', :'sp', 11) as _5 \\gset
select pg_temp.saldo(:'va', :'sa', 0) as _6 \\gset
select 'E|' || (extract(epoch from (now() - (:'t0'::timestamptz + interval '15 days'))) / 86400.0)::numeric(10,3) as esperado \\gset
select :'esperado' as _print;
${FILA("ZZ-CMP-A")}
rollback;`,
  (f, salida) => {
    const esperadoB = Number((salida.match(/E\|([\d.]+)/) ?? [])[1] ?? NaN);
    const r = f["ZZ-CMP-A"];
    afirmar("aparece", !!r);
    afirmar("A vendió 4 y B vendió 3", r?.a.ventas === 4 && r?.b.ventas === 3, `A=${r?.a.ventas} B=${r?.b.ventas}`);
    afirmar("A: inicio 0 → cierre 14 (vendió 4 pero el stock SUBE: recepción de 8)", r?.a.ini === 0 && r?.a.fin === 14, `ini=${r?.a.ini} fin=${r?.a.fin}`);
    afirmar("B: inicio 14 (= cierre de A) → cierre 11", r?.b.ini === 14 && r?.b.fin === 11, `ini=${r?.b.ini} fin=${r?.b.fin}`);
    afirmar("el cierre de B (llega hasta hoy) es el stock utilizable de hoy: 11", r?.b.fin === 11);
    afirmar("A: días con stock ≈ 15 − 1 hora (piso >0 desde la entrada)", cerca(r?.a.dias, 15 - 1 / 24, 0.02), `dias=${r?.a.dias}`);
    afirmar("B: en venta toda la ventana", cerca(r?.b.dias, esperadoB, 0.02), `dias=${r?.b.dias} esperado=${esperadoB}`);
    afirmar("el ledger cuadra", r?.ledger === true);
    // Entradas = lo que llegó DE AFUERA con el criterio de `fn_resumen_variantes.flujo`: la carga inicial cuenta;
    // una recepción sin lote/producción/traslado (motivo suelto) no. Es la base del sell-through.
    afirmar("A: entradas = 10 (la carga inicial); la recepción suelta de 8 no cuenta", r?.a.entradas === 10, `entradas=${r?.a.entradas}`);
    afirmar("B: sin entradas", r?.b.entradas === 0, `entradas=${r?.b.entradas}`);
  },
);

// ---------------------------------------------------------------------------
// 2. Períodos NO contiguos: A viejo, B reciente, con un hueco en medio
// ---------------------------------------------------------------------------
correr(
  "2. Períodos separados: el cierre de A ya no es el inicio de B (hubo movimiento en el hueco)",
  `${prelude()}
select pg_temp.variante('ZZ-CMP-B') as vb \\gset
select pg_temp.mov(:'vb', 'entrada', 10, :'sp', 'carga_inicial', :'t0'::timestamptz + interval '1 day') as _1 \\gset
-- En el hueco (día 8) llegan 5 más; en B (día 25) se venden 2.
select pg_temp.mov(:'vb', 'entrada', 5, :'sp', 'recepcion', :'t0'::timestamptz + interval '8 days') as _2 \\gset
select pg_temp.mov(:'vb', 'salida', 2, :'sp', 'venta', :'t0'::timestamptz + interval '25 days') as _3 \\gset
select pg_temp.saldo(:'vb', :'sp', 13) as _4 \\gset
-- A = días 0–3, B = días 20–29 (hasta hoy): el hueco es el día 4 al 19.
${FILA("ZZ-CMP-B", `retail.fn_resumen_comparacion(:'ubic', :'hoy'::date - 29, :'hoy'::date - 26, :'hoy'::date - 9, :'hoy'::date)`)}
rollback;`,
  (f) => {
    const r = f["ZZ-CMP-B"];
    afirmar("A cierra con 10 y B abre con 15 (el hueco tuvo una recepción de 5)", r?.a.fin === 10 && r?.b.ini === 15, `A.fin=${r?.a.fin} B.ini=${r?.b.ini}`);
    afirmar("B cierra con 13", r?.b.fin === 13, `B.fin=${r?.b.fin}`);
    afirmar("A no tuvo ventas y B vendió 2", r?.a.ventas === 0 && r?.b.ventas === 2);
  },
);

// ---------------------------------------------------------------------------
// 3. Importe y COGS (en componentes) y unidades sin costo
// ---------------------------------------------------------------------------
correr(
  "3. Importe = precio − descuento; COGS = costo del día de la venta (no el de hoy) en componentes; anulada fuera; una venta a costo 0 se cuenta «sin costo»",
  `${prelude()}
select pg_temp.variante('ZZ-CMP-C', 70) as vc \\gset
select pg_temp.variante('ZZ-CMP-C2', 70) as vc2 \\gset
select pg_temp.mov(:'vc', 'entrada', 20, :'sp', 'carga_inicial', :'t0'::timestamptz) as _0 \\gset
select pg_temp.mov(:'vc2', 'entrada', 20, :'sp', 'carga_inicial', :'t0'::timestamptz) as _00 \\gset
-- B: venta de 2 con 20 de descuento (se cobró 80 c/u) y costo 40 ese día — hoy el costo de la variante es 70.
select pg_temp.venta(:'vc', 2, 20, 40) as li \\gset
select pg_temp.mov(:'vc', 'salida', 2, :'sp', 'venta', :'t0'::timestamptz + interval '18 days', :'li') as _1 \\gset
-- B: una venta anulada de 5 (no cuenta en NADA).
select pg_temp.venta(:'vc', 5, 0, 40, 'anulada') as la \\gset
select pg_temp.mov(:'vc', 'salida', 5, :'sp', 'venta', :'t0'::timestamptz + interval '19 days', :'la') as _2 \\gset
-- B: devuelven 1 de las 2 (vendible, vuelve al piso).
select v.id as venta_id from retail.ventas v join retail.venta_items i on i.venta_id = v.id where i.id = :'li' \\gset
insert into retail.devoluciones (venta_id, ubicacion_id, motivo, estado, aprobado_en) values (:'venta_id', :'ubic', 'prueba', 'aprobada', now()) returning id as dev \\gset
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (:'dev', :'li', 1, 'vendible') returning id as di \\gset
select pg_temp.mov(:'vc', 'entrada', 1, :'sp', 'devolucion', :'t0'::timestamptz + interval '21 days', null, :'di') as _3 \\gset
select pg_temp.saldo(:'vc', :'sp', 14) as _4 \\gset
-- C2: vende 3 con costo 0 guardado en la línea (la variante no tenía costo ese día): no hay COGS que reconocer.
select pg_temp.venta(:'vc2', 3, 0, 0) as lz \\gset
select pg_temp.mov(:'vc2', 'salida', 3, :'sp', 'venta', :'t0'::timestamptz + interval '18 days', :'lz') as _5 \\gset
select pg_temp.saldo(:'vc2', :'sp', 17) as _6 \\gset
${FILA("ZZ-CMP-C")}
${FILA("ZZ-CMP-C2")}
rollback;`,
  (f) => {
    const r = f["ZZ-CMP-C"];
    const z = f["ZZ-CMP-C2"];
    afirmar("vendió 2 y le devolvieron 1 (la anulada de 5 no cuenta)", r?.b.ventas === 2 && r?.b.dev === 1, `ventas=${r?.b.ventas} dev=${r?.b.dev}`);
    afirmar("importe neto = 2×80 − 1×80 = 80", cerca(r?.b.importe, 80, 0.01), `importe=${r?.b.importe}`);
    afirmar("COGS en componentes: vendido 2×40 = 80 y devuelto 1×40 = 40 (el de ese día, no 70)", cerca(r?.b.costoVentas, 80, 0.01) && cerca(r?.b.costoDev, 40, 0.01), `ventas=${r?.b.costoVentas} dev=${r?.b.costoDev}`);
    afirmar("todo lo vendido tiene costo: 0 unidades sin costo", r?.b.sinCosto === 0, `sinCosto=${r?.b.sinCosto}`);
    afirmar("A no vendió nada: importe, costos y unidades sin costo en 0", r?.a.ventas === 0 && r?.a.importe === 0 && r?.a.costoVentas === 0 && r?.a.costoDev === 0 && r?.a.sinCosto === 0);
    afirmar("una venta a costo 0 NO inventa un costo: COGS 0 y sus 3 unidades quedan «sin costo»", z?.b.costoVentas === 0 && z?.b.sinCosto === 3, `costo=${z?.b.costoVentas} sinCosto=${z?.b.sinCosto}`);
  },
);

// ---------------------------------------------------------------------------
// 4. Ledger que no cuadra, variantes sin actividad, permisos y firma
// ---------------------------------------------------------------------------
correr(
  "4. Ledger que no cuadra se marca; una variante sin actividad no aparece; el colaborador no ve filas",
  `${prelude()}
select pg_temp.variante('ZZ-CMP-D') as vd \\gset
select pg_temp.variante('ZZ-CMP-E') as ve \\gset
-- D: el ledger dice que entraron 5 hace 3 días y salió 1 (quedan 4), pero el stock de hoy es 0.
select pg_temp.mov(:'vd', 'entrada', 5, :'sp', 'carga_inicial', now() - interval '3 days') as _1 \\gset
select pg_temp.mov(:'vd', 'salida', 1, :'sp', 'venta', now() - interval '2 days') as _1b \\gset
select pg_temp.saldo(:'vd', :'sp', 0) as _2 \\gset
${FILA("ZZ-CMP-D")}
${FILA("ZZ-CMP-E")}
select 'N|' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_resumen_comparacion';
select 'X|' || has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_resumen_comparacion';
select 'L|' || count(*) from ${LLAMADA};
-- Un colaborador (fijo a otra sede, sin ser líder) no recibe ninguna fila: costo e importe son de líder.
set local request.jwt.claim.sub = '${MICAELA}';
select 'C|' || count(*) from ${LLAMADA};
rollback;`,
  (f, salida) => {
    afirmar("D se marca como inconsistente", f["ZZ-CMP-D"]?.ledger === false, `ledger=${f["ZZ-CMP-D"]?.ledger}`);
    afirmar("E (sin stock ni ventas en ninguno de los dos períodos) no aparece", f["ZZ-CMP-E"] === undefined);
    afirmar("hay UNA sola función", salida.includes("N|1"));
    afirmar("anon no puede ejecutarla", salida.includes("X|f"));
    afirmar("el líder recibe filas", /L\|[1-9]/.test(salida));
    afirmar("el colaborador no recibe ninguna", salida.includes("C|0"), salida.match(/C\|\d+/)?.[0]);
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);

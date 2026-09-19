#!/usr/bin/env node
/**
 * Prueba de integración de `retail.fn_resumen_variantes` (Resumen de Inventario v2,
 * ADR-0113, migración 20260919141804) contra el Postgres LOCAL.
 *
 * Verifica lo que ninguna prueba de TypeScript puede: que la RPC reconstruye bien el
 * saldo sobre el ledger y clasifica la demanda por FK y estado real.
 *   · días con stock: 10 unidades vendidas en 5 días con stock ≠ 10 ÷ 30;
 *   · «en venta» = el PISO (el POS solo vende del piso): stock atrás no cuenta;
 *   · ventas anuladas fuera; devolución vendible resta y la que va a cuarentena no;
 *     un cambio suma en la prenda que se llevó y resta en la que volvió;
 *   · ventana elegible y ventana de comparación por separado;
 *   · la variante centinela y las inactivas no aparecen; un producto descontinuado sí;
 *   · el costo solo viaja a un líder, con su estado de verificación;
 *   · ledger que no cuadra → `ledger_consistente = false`;
 *   · una sola firma viva y `anon` sin EXECUTE.
 *
 * Mismo mecanismo que `registrar_venta.mjs` / `registrar_cambio.mjs`: `docker exec … psql`,
 * `set local request.jwt.claim.sub` y `ROLLBACK` SIEMPRE — no deja nada en el Postgres
 * compartido (regla: no ensuciar la base local; jamás `db reset`).
 *
 * USO
 *   pnpm pruebas:fn-resumen-variantes    → necesita el stack local levantado
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo
const CENTINELA = "22222222-2222-4222-8222-222222222222";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
}

/** Todo caso empieza igual: una sede con piso/almacén/cuarentena, el líder (o quien se pida) y un reloj propio. */
function prelude({ persona = FELIPE, sede = "Tienda Lima" } = {}) {
  return `
begin;
set local request.jwt.claim.sub = '${persona}';
select id as ubic from retail.ubicaciones where nombre = '${sede}' \\gset

-- Autocuración: este Postgres compartido puede no tener las tres sububicaciones para esa sede.
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Cuarentena', 'cuarentena' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena');
select id as sp from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select id as sa from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset
select id as sc from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena' \\gset

-- Inicio del período de 30 días (00:00 de Lima, hace 29 días): las pruebas cuelgan sus fechas de acá.
select (((now() at time zone 'America/Lima')::date - 29)::timestamp at time zone 'America/Lima') as t0 \\gset
select ((now() at time zone 'America/Lima')::date) as hoy \\gset
-- psql no sustituye variables dentro de cuerpos entre $$: la sede viaja en un parámetro de sesión.
select set_config('prueba.ubic', :'ubic', true) as _cfg \\gset

-- Un movimiento del ledger con fecha controlada (no toca \`stock\`: cada caso deja el saldo final a mano).
create function pg_temp.mov(v uuid, tipo text, cant int, sub uuid, motivo text, cuando timestamptz,
                            venta_item uuid default null, dev_item uuid default null, cambio uuid default null)
returns uuid language sql as $$
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, devolucion_item_id, cambio_id, created_at)
  values (v, current_setting('prueba.ubic')::uuid, sub, tipo, cant, motivo, venta_item, dev_item, cambio, cuando) returning id
$$;
-- Deja el saldo de hoy de una cubeta.
create function pg_temp.saldo(v uuid, sub uuid, cant int) returns void language sql as $$
  insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad) values (v, current_setting('prueba.ubic')::uuid, sub, cant)
  on conflict (variante_id, ubicacion_id, sububicacion_id) do update set cantidad = excluded.cantidad
$$;
-- Un producto + variante de prueba (cada uno su producto: evita el UNIQUE producto/talla/color).
-- Desde ADR-0109 todo producto lleva marca y proveedor (NOT NULL, con llave compuesta a marca_proveedores):
-- se usa la pareja que esa misma migración siembra (marca CAYLA / proveedor CAYLA SAC). En un Postgres local
-- que todavía no la aplicó esas columnas no existen y el alta va sin ellas.
create function pg_temp.variante(sku text, costo numeric default 40, estado_prod text default 'activo', activa boolean default true) returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'productos' and column_name = 'marca_id') then
    insert into retail.productos (referencia, estado, marca_id, proveedor_id)
      select 'ZZ ' || sku, estado_prod, mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
      returning id into p;
  else
    insert into retail.productos (referencia, estado) values ('ZZ ' || sku, estado_prod) returning id into p;
  end if;
  insert into retail.variantes (producto_id, sku, precio, costo, activo) values (p, sku, 100, costo, activa) returning id into v;
  return v;
end $$;
-- Una venta (completada o anulada) con una línea; devuelve el id de la línea.
create function pg_temp.venta(v uuid, cant int, estado text default 'completada') returns uuid language plpgsql as $$
declare vt uuid; li uuid;
begin
  if estado = 'anulada' then
    insert into retail.ventas (ubicacion_id, estado, anulado_en, motivo_anulacion) values (current_setting('prueba.ubic')::uuid, 'anulada', now(), 'prueba') returning id into vt;
  else
    insert into retail.ventas (ubicacion_id, estado) values (current_setting('prueba.ubic')::uuid, 'completada') returning id into vt;
  end if;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (vt, v, cant, 100, 40) returning id into li;
  return li;
end $$;
`;
}

/** La fila de una variante en el resultado de la RPC (una línea `R|…`). */
const FILA = (sku, args = "") =>
  `select 'R|' || r.sku || '|' || r.ventas_ventana || '|' || r.devoluciones_ventana || '|' || coalesce(r.dias_con_stock::text,'') || '|' || r.ledger_consistente || '|' || r.piso || '|' || r.almacen || '|' || r.ventas_cmp || '|' || coalesce(r.estado_costo,'∅') || '|' || coalesce(r.costo::text,'∅') || '|' || r.producto_estado || '|' || r.entradas_ventana || '|' || r.stock_inicial
   from retail.fn_resumen_variantes(:'ubic'${args}) r where r.sku = '${sku}';`;

function parsear(salida) {
  const filas = {};
  for (const linea of salida.split("\n")) {
    if (!linea.startsWith("R|")) continue;
    const [, sku, ventas, dev, dias, ledger, piso, alm, cmp, costoEstado, costo, prodEstado, entradas, inicial] = linea.split("|");
    filas[sku] = { ventas: +ventas, devoluciones: +dev, dias: dias === "" ? null : +dias, ledger: ledger === "true", piso: +piso, almacen: +alm, ventasCmp: +cmp, estadoCosto: costoEstado, costo, productoEstado: prodEstado, entradas: +entradas, stockInicial: +inicial };
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
const cerca = (a, b, tol = 0.02) => a !== null && Math.abs(a - b) <= tol;

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
// 1. El denominador: días CON stock, no días del calendario
// ---------------------------------------------------------------------------
correr(
  "1. 10 unidades vendidas en los 5 días que tuvo stock (y 25 agotada) → 5 días con stock, no 30 (salidas de venta sin venta_item_id, como una importación histórica, también son demanda)",
  `${prelude()}
select pg_temp.variante('ZZ-RES-A') as va \\gset
-- Entra 1 lote de 10 al piso al inicio del período y se vende 1 cada 12 horas: al día 5 queda en cero.
select pg_temp.mov(:'va', 'entrada', 10, :'sp', 'carga_inicial', :'t0'::timestamptz) as _e \\gset
select count(pg_temp.mov(:'va', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + (i * interval '12 hours'))) as _n from generate_series(1, 10) i \\gset
select pg_temp.saldo(:'va', :'sp', 0) as _s \\gset
${FILA("ZZ-RES-A", ", p_ventana_dias => 30")}
rollback;`,
  (f) => {
    const a = f["ZZ-RES-A"];
    afirmar("aparece en el resumen de la sede", !!a);
    afirmar("vendió 10 unidades", a?.ventas === 10, `ventas=${a?.ventas}`);
    afirmar("estuvo en venta 5 días (±0.02)", cerca(a?.dias ?? null, 5), `dias=${a?.dias}`);
    afirmar("velocidad = 10 ÷ 5 = 2/día (no 0.33)", a && a.ventas / a.dias > 1.9 && a.ventas / a.dias < 2.1);
    afirmar("el ledger cuadra", a?.ledger === true);
    afirmar("recibió 10 en el período y empezó en 0", a?.entradas === 10 && a?.stockInicial === 0, `entradas=${a?.entradas} inicial=${a?.stockInicial}`);
  },
);

// ---------------------------------------------------------------------------
// 2. «En venta» es el piso: lo que está en el almacén no se puede vender
// ---------------------------------------------------------------------------
correr(
  "2. Stock solo en el almacén = 0 días en venta; cuando se baja al piso empieza a contar",
  `${prelude()}
select pg_temp.variante('ZZ-RES-B1') as vb1 \\gset
select pg_temp.variante('ZZ-RES-B2') as vb2 \\gset
-- B1: llegó al almacén el día 0 y nunca se bajó.
select pg_temp.mov(:'vb1', 'entrada', 8, :'sa', 'recepcion', :'t0'::timestamptz) as _1 \\gset
select pg_temp.saldo(:'vb1', :'sa', 8) as _2 \\gset
-- B2: llegó al almacén el día 0 y se bajó al piso el día 10 (movimiento interno).
select pg_temp.mov(:'vb2', 'entrada', 8, :'sa', 'recepcion', :'t0'::timestamptz) as _3 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  values (:'vb2', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 8, 'movimiento_interno', :'t0'::timestamptz + interval '10 days');
select pg_temp.saldo(:'vb2', :'sp', 8) as _4 \\gset
select pg_temp.saldo(:'vb2', :'sa', 0) as _5 \\gset
select 'E|' || (extract(epoch from (now() - (:'t0'::timestamptz + interval '10 days'))) / 86400.0)::numeric(10,3) as esperado \\gset
select :'esperado' as _print;
${FILA("ZZ-RES-B1")}
${FILA("ZZ-RES-B2")}
rollback;`,
  (f, salida) => {
    const esperado = Number((salida.match(/E\|([\d.]+)/) ?? [])[1] ?? NaN);
    afirmar("B1 (solo en almacén): 0 días en venta", cerca(f["ZZ-RES-B1"]?.dias ?? null, 0, 0.001), `dias=${f["ZZ-RES-B1"]?.dias}`);
    afirmar("B1 sigue teniendo 8 utilizables (almacén)", f["ZZ-RES-B1"]?.almacen === 8);
    afirmar("B2 (bajada al piso el día 10): cuenta desde ese día", cerca(f["ZZ-RES-B2"]?.dias ?? null, esperado, 0.02), `dias=${f["ZZ-RES-B2"]?.dias} esperado=${esperado}`);
    afirmar("el movimiento interno no es demanda", f["ZZ-RES-B2"]?.ventas === 0);
  },
);

// ---------------------------------------------------------------------------
// 3. Demanda: una venta anulada no cuenta; devolución vendible resta, a cuarentena no
// ---------------------------------------------------------------------------
correr(
  "3. Demanda: anuladas fuera, devolución vendible resta y la dañada (cuarentena) no",
  `${prelude()}
select pg_temp.variante('ZZ-RES-C1') as vc1 \\gset
select pg_temp.variante('ZZ-RES-C2') as vc2 \\gset
select pg_temp.variante('ZZ-RES-C3') as vc3 \\gset
select pg_temp.mov(:'vc1', 'entrada', 20, :'sp', 'carga_inicial', :'t0'::timestamptz) as _a \\gset
select pg_temp.mov(:'vc2', 'entrada', 20, :'sp', 'carga_inicial', :'t0'::timestamptz) as _b \\gset
select pg_temp.mov(:'vc3', 'entrada', 20, :'sp', 'carga_inicial', :'t0'::timestamptz) as _c \\gset
-- C1: 3 ventas completadas.
select pg_temp.venta(:'vc1', 1) as li1 \\gset
select pg_temp.mov(:'vc1', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '3 days', :'li1') as _m1 \\gset
select pg_temp.venta(:'vc1', 1) as li2 \\gset
select pg_temp.mov(:'vc1', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '4 days', :'li2') as _m2 \\gset
select pg_temp.venta(:'vc1', 1) as li3 \\gset
select pg_temp.mov(:'vc1', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '5 days', :'li3') as _m3 \\gset
-- C2: 3 ventas, 2 de ellas anuladas (la salida original queda en el ledger, pero la venta ya no es demanda).
select pg_temp.venta(:'vc2', 1) as lj1 \\gset
select pg_temp.mov(:'vc2', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '3 days', :'lj1') as _n1 \\gset
select pg_temp.venta(:'vc2', 1, 'anulada') as lj2 \\gset
select pg_temp.mov(:'vc2', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '4 days', :'lj2') as _n2 \\gset
select pg_temp.venta(:'vc2', 1, 'anulada') as lj3 \\gset
select pg_temp.mov(:'vc2', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '5 days', :'lj3') as _n3 \\gset
-- C3: vende 5; devuelven 2 vendibles (a piso) y 1 dañada (a cuarentena), en dos devoluciones (unique devolución+línea).
select pg_temp.venta(:'vc3', 5) as lk \\gset
select pg_temp.mov(:'vc3', 'salida', 5, :'sp', 'venta', :'t0'::timestamptz + interval '3 days', :'lk') as _o \\gset
select v.id as venta_c3 from retail.ventas v join retail.venta_items i on i.venta_id = v.id where i.id = :'lk' \\gset
insert into retail.devoluciones (venta_id, ubicacion_id, motivo, estado, aprobado_en) values (:'venta_c3', :'ubic', 'prueba', 'aprobada', now()) returning id as dev1 \\gset
insert into retail.devoluciones (venta_id, ubicacion_id, motivo, estado, aprobado_en) values (:'venta_c3', :'ubic', 'prueba', 'aprobada', now()) returning id as dev2 \\gset
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (:'dev1', :'lk', 2, 'vendible') returning id as di1 \\gset
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (:'dev2', :'lk', 1, 'danada_reparacion') returning id as di2 \\gset
select pg_temp.mov(:'vc3', 'entrada', 2, :'sp', 'devolucion', :'t0'::timestamptz + interval '6 days', null, :'di1') as _p \\gset
select pg_temp.mov(:'vc3', 'entrada', 1, :'sc', 'devolucion', :'t0'::timestamptz + interval '6 days', null, :'di2') as _q \\gset
select pg_temp.saldo(:'vc1', :'sp', 17) as _s1 \\gset
select pg_temp.saldo(:'vc2', :'sp', 17) as _s2 \\gset
select pg_temp.saldo(:'vc3', :'sp', 17) as _s3 \\gset
select pg_temp.saldo(:'vc3', :'sc', 1) as _s4 \\gset
${FILA("ZZ-RES-C1", ", p_ventana_dias => 30")}
${FILA("ZZ-RES-C2", ", p_ventana_dias => 30")}
${FILA("ZZ-RES-C3", ", p_ventana_dias => 30")}
rollback;`,
  (f) => {
    afirmar("C1: 3 ventas completadas = 3", f["ZZ-RES-C1"]?.ventas === 3, `ventas=${f["ZZ-RES-C1"]?.ventas}`);
    afirmar("C2: 3 salidas de venta pero 2 anuladas = 1 (una venta anulada NO es demanda)", f["ZZ-RES-C2"]?.ventas === 1, `ventas=${f["ZZ-RES-C2"]?.ventas}`);
    afirmar("C3: vendió 5", f["ZZ-RES-C3"]?.ventas === 5);
    afirmar("C3: la devolución vendible resta 2 y la dañada (a cuarentena) NO resta", f["ZZ-RES-C3"]?.devoluciones === 2, `devoluciones=${f["ZZ-RES-C3"]?.devoluciones}`);
    afirmar("C3: el stock en cuarentena no es utilizable (piso 17, almacén 0)", f["ZZ-RES-C3"]?.piso === 17 && f["ZZ-RES-C3"]?.almacen === 0);
  },
);

// ---------------------------------------------------------------------------
// 3b. Un cambio: suma en la prenda que se llevó, resta en la que volvió
// ---------------------------------------------------------------------------
correr(
  "3b. Cambio de talla: la prenda que se llevó suma demanda y la que volvió la resta",
  `${prelude()}
select pg_temp.variante('ZZ-RES-M') as vm \\gset
select pg_temp.variante('ZZ-RES-L') as vl \\gset
select pg_temp.mov(:'vm', 'entrada', 20, :'sp', 'carga_inicial', :'t0'::timestamptz) as _1 \\gset
select pg_temp.mov(:'vl', 'entrada', 20, :'sp', 'carga_inicial', :'t0'::timestamptz) as _2 \\gset
-- Vendió 5 de M; la clienta cambia 2 de M por 2 de L.
select pg_temp.venta(:'vm', 5) as lm \\gset
select pg_temp.mov(:'vm', 'salida', 5, :'sp', 'venta', :'t0'::timestamptz + interval '3 days', :'lm') as _3 \\gset
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad) values (:'lm', :'ubic', :'vl', 2) returning id as cam \\gset
select pg_temp.mov(:'vm', 'entrada', 2, :'sp', 'cambio', :'t0'::timestamptz + interval '4 days', null, null, :'cam') as _4 \\gset
select pg_temp.mov(:'vl', 'salida', 2, :'sp', 'cambio', :'t0'::timestamptz + interval '4 days', null, null, :'cam') as _5 \\gset
select pg_temp.saldo(:'vm', :'sp', 17) as _6 \\gset
select pg_temp.saldo(:'vl', :'sp', 18) as _7 \\gset
${FILA("ZZ-RES-M", ", p_ventana_dias => 30")}
${FILA("ZZ-RES-L", ", p_ventana_dias => 30")}
rollback;`,
  (f) => {
    afirmar("la talla que volvió: vendió 5 y devolvió 2 → 3 netas", f["ZZ-RES-M"]?.ventas === 5 && f["ZZ-RES-M"]?.devoluciones === 2, `${f["ZZ-RES-M"]?.ventas}/${f["ZZ-RES-M"]?.devoluciones}`);
    afirmar("la talla que se llevó: cuenta 2 como demanda", f["ZZ-RES-L"]?.ventas === 2 && f["ZZ-RES-L"]?.devoluciones === 0, `${f["ZZ-RES-L"]?.ventas}/${f["ZZ-RES-L"]?.devoluciones}`);
  },
);

// ---------------------------------------------------------------------------
// 4. Ventana elegible y ventana de comparación, cada una con lo suyo
// ---------------------------------------------------------------------------
correr(
  "4. Ventana elegible y ventana de comparación: lo de hace 40 días no cuenta en ninguna",
  `${prelude()}
select pg_temp.variante('ZZ-RES-D') as vd \\gset
select pg_temp.mov(:'vd', 'entrada', 100, :'sp', 'carga_inicial', :'t0'::timestamptz - interval '40 days') as _e \\gset
-- 2 uds hace 40 días (fuera de ambas), 4 uds hace 15 días (comparación), 3 uds hace 5 días (período).
select pg_temp.mov(:'vd', 'salida', 2, :'sp', 'venta', now() - interval '40 days') as _a \\gset
select pg_temp.mov(:'vd', 'salida', 4, :'sp', 'venta', now() - interval '15 days') as _b \\gset
select pg_temp.mov(:'vd', 'salida', 3, :'sp', 'venta', now() - interval '5 days') as _c \\gset
select pg_temp.saldo(:'vd', :'sp', 91) as _s \\gset
${FILA("ZZ-RES-D", `, p_desde => :'hoy'::date - 9, p_hasta => :'hoy'::date, p_cmp_desde => :'hoy'::date - 19, p_cmp_hasta => :'hoy'::date - 10`)}
-- Sin comparación: ventas_cmp = 0.
${FILA("ZZ-RES-D", `, p_desde => :'hoy'::date - 9, p_hasta => :'hoy'::date`).replace("'R|' ||", "'S|' ||")}
rollback;`,
  (f, salida) => {
    afirmar("período (últimos 10 días): 3 uds", f["ZZ-RES-D"]?.ventas === 3, `ventas=${f["ZZ-RES-D"]?.ventas}`);
    afirmar("comparación (los 10 días anteriores): 4 uds", f["ZZ-RES-D"]?.ventasCmp === 4, `ventasCmp=${f["ZZ-RES-D"]?.ventasCmp}`);
    const sinCmp = salida.split("\n").find((l) => l.startsWith("S|"))?.split("|");
    afirmar("sin ventana de comparación no inventa ventas previas", sinCmp?.[8] === "0", `ventasCmp=${sinCmp?.[8]}`);
  },
);

// ---------------------------------------------------------------------------
// 5. Universo: centinela e inactivas fuera; producto descontinuado adentro
// ---------------------------------------------------------------------------
correr(
  "5. Universo: la variante centinela y las inactivas no aparecen; un producto descontinuado con stock, sí",
  `${prelude()}
select pg_temp.variante('ZZ-RES-E1') as ve1 \\gset
select pg_temp.variante('ZZ-RES-E2', 40, 'activo', false) as ve2 \\gset
select pg_temp.variante('ZZ-RES-E3', 40, 'descontinuado') as ve3 \\gset
select pg_temp.saldo(:'ve1', :'sp', 5) as _1 \\gset
select pg_temp.saldo(:'ve2', :'sp', 5) as _2 \\gset
select pg_temp.saldo(:'ve3', :'sp', 5) as _3 \\gset
select pg_temp.saldo('${CENTINELA}'::uuid, :'sp', 5) as _4 \\gset
select 'C|' || count(*) from retail.fn_resumen_variantes(:'ubic') where variante_id = '${CENTINELA}'::uuid;
${FILA("ZZ-RES-E1")}
${FILA("ZZ-RES-E2")}
${FILA("ZZ-RES-E3")}
rollback;`,
  (f, salida) => {
    afirmar("una variante activa aparece", !!f["ZZ-RES-E1"]);
    afirmar("una variante inactiva NO aparece", !f["ZZ-RES-E2"]);
    afirmar("un producto descontinuado con stock SÍ aparece (candidato a liquidar)", f["ZZ-RES-E3"]?.productoEstado === "descontinuado");
    afirmar("la variante centinela del cobro manual nunca aparece", salida.includes("C|0"));
  },
);

// ---------------------------------------------------------------------------
// 6. Costo: solo para líderes, con su estado de verificación
// ---------------------------------------------------------------------------
correr(
  "6. Costo: declarado, oficial, alterado y sin costo — y solo un líder lo ve",
  `${prelude()}
-- F1 declarado (costo de alta, nunca tocado); F2 oficial (coincide con el ledger de promedio ponderado);
-- F3 alterado (el ledger dice 40 y alguien lo dejó en 55); F4 alterado (cambio manual sin ledger oficial); F5 sin costo.
select pg_temp.variante('ZZ-RES-F1', 40) as vf1 \\gset
select pg_temp.variante('ZZ-RES-F2', 40) as vf2 \\gset
select pg_temp.variante('ZZ-RES-F3', 40) as vf3 \\gset
select pg_temp.variante('ZZ-RES-F4', 40) as vf4 \\gset
select pg_temp.variante('ZZ-RES-F5', 0) as vf5 \\gset
select count(pg_temp.saldo(v, :'sp', 3)) as _n from unnest(array[:'vf1', :'vf2', :'vf3', :'vf4', :'vf5']::uuid[]) v \\gset
select pg_temp.mov(:'vf2', 'entrada', 3, :'sp', 'carga_inicial', now() - interval '3 days') as mov2 \\gset
select pg_temp.mov(:'vf3', 'entrada', 3, :'sp', 'carga_inicial', now() - interval '3 days') as mov3 \\gset
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id)
  values (:'vf2', 0, 0, 3, 40, 40, 'compra', :'mov2'), (:'vf3', 0, 0, 3, 40, 40, 'compra', :'mov3');
-- Por fuera del cálculo oficial (F3), y por fuera y sin ledger oficial (F4):
update retail.variantes set costo = 55 where id = :'vf3';
update retail.variantes set costo = 47 where id = :'vf4';
${FILA("ZZ-RES-F1")}
${FILA("ZZ-RES-F2")}
${FILA("ZZ-RES-F3")}
${FILA("ZZ-RES-F4")}
${FILA("ZZ-RES-F5")}
rollback;`,
  (f) => {
    afirmar("F1 sin historial oficial ni cambios: «declarado»", f["ZZ-RES-F1"]?.estadoCosto === "declarado", f["ZZ-RES-F1"]?.estadoCosto);
    afirmar("F2 coincide con el promedio ponderado: «oficial»", f["ZZ-RES-F2"]?.estadoCosto === "oficial", f["ZZ-RES-F2"]?.estadoCosto);
    afirmar("F3 movido a mano después del ledger oficial: «alterado»", f["ZZ-RES-F3"]?.estadoCosto === "alterado", f["ZZ-RES-F3"]?.estadoCosto);
    afirmar("F4 cambio manual registrado sin ledger oficial: «alterado»", f["ZZ-RES-F4"]?.estadoCosto === "alterado", f["ZZ-RES-F4"]?.estadoCosto);
    afirmar("F5 costo en cero: «sin_costo»", f["ZZ-RES-F5"]?.estadoCosto === "sin_costo", f["ZZ-RES-F5"]?.estadoCosto);
    afirmar("un líder ve el costo", f["ZZ-RES-F1"]?.costo === "40.00" || f["ZZ-RES-F1"]?.costo === "40", f["ZZ-RES-F1"]?.costo);
  },
);

correr(
  "7. Una colaboradora (no líder) NO recibe costos ni las otras sedes",
  `${prelude({ persona: MICAELA, sede: "Tienda Trujillo" })}
select pg_temp.variante('ZZ-RES-G', 40) as vg \\gset
select pg_temp.saldo(:'vg', :'sp', 4) as _1 \\gset
select 'RED|' || coalesce(jsonb_array_length(en_red), 0) from retail.fn_resumen_variantes(:'ubic') where sku = 'ZZ-RES-G';
${FILA("ZZ-RES-G")}
rollback;`,
  (f, salida) => {
    afirmar("la colaboradora ve su sede", !!f["ZZ-RES-G"]);
    afirmar("costo y estado de costo vienen vacíos", f["ZZ-RES-G"]?.costo === "∅" && f["ZZ-RES-G"]?.estadoCosto === "∅", `${f["ZZ-RES-G"]?.costo}/${f["ZZ-RES-G"]?.estadoCosto}`);
    afirmar("no recibe lo que tienen las otras sedes", salida.includes("RED|0"));
  },
);

// ---------------------------------------------------------------------------
// 8. Un ledger que no explica el stock se avisa, no se disimula
// ---------------------------------------------------------------------------
correr(
  "8. Si el ledger no explica el stock de hoy, `ledger_consistente = false`",
  `${prelude()}
select pg_temp.variante('ZZ-RES-H') as vh \\gset
-- El ledger dice que entraron 5 hace 3 días y NO hubo salidas, pero el stock de hoy es 0: falta una salida.
select pg_temp.mov(:'vh', 'entrada', 5, :'sp', 'carga_inicial', now() - interval '3 days') as _e \\gset
select pg_temp.saldo(:'vh', :'sp', 0) as _s \\gset
${FILA("ZZ-RES-H", ", p_ventana_dias => 30")}
rollback;`,
  (f) => afirmar("se marca como inconsistente", f["ZZ-RES-H"]?.ledger === false, `ledger=${f["ZZ-RES-H"]?.ledger}`),
);

// ---------------------------------------------------------------------------
// 9. Firma: una sola función viva, compatible hacia atrás y sin EXECUTE para anon
// ---------------------------------------------------------------------------
correr(
  "9. Firma: una sola sobrecarga, la llamada vieja sigue sirviendo y `anon` no ejecuta",
  `${prelude()}
select 'N|' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_resumen_variantes';
select 'A|' || has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_resumen_variantes';
select 'V|' || count(*) from retail.fn_resumen_variantes(p_ubicacion_id => :'ubic', p_ventana_dias => 30);
-- Fechas al revés y con un futuro imposible: se ordenan y se recortan a hoy, sin error.
select 'X|' || count(*) from retail.fn_resumen_variantes(:'ubic', p_desde => :'hoy'::date, p_hasta => :'hoy'::date - 5);
select 'Y|' || count(*) from retail.fn_resumen_variantes(:'ubic', p_desde => :'hoy'::date - 5, p_hasta => :'hoy'::date + 30);
rollback;`,
  (_f, salida) => {
    afirmar("hay UNA sola función", salida.includes("N|1"));
    afirmar("anon no puede ejecutarla", salida.includes("A|f"));
    afirmar("la llamada con el parámetro viejo (p_ventana_dias) sigue funcionando", /V\|\d+/.test(salida));
    afirmar("fechas invertidas o futuras no rompen", /X\|\d+/.test(salida) && /Y\|\d+/.test(salida));
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);

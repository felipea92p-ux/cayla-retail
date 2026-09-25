#!/usr/bin/env node
/**
 * Prueba de integración: `retail.fn_ritmo_reciente_json` (2026-09-25, rediseño de Existencias) —
 * confirma que reutiliza `retail.fn_ledger_puntos` (ADR-0202) en vez de sumar una CUARTA
 * reconstrucción del ledger (la auditoría del 2026-09-25 encontró que `fn_resumen_variantes`,
 * 2026-09-19, ya era una tercera, independiente de `fn_ledger_puntos`), y que su permiso es el
 * de TODO el personal de tienda (como `fn_resumen_variantes`), nunca el de líder de
 * `fn_resumen_comparacion` — porque Existencias la usa cualquier colaboradora, no solo líderes.
 *
 *   1. ESTRUCTURAL: el código fuente de `fn_ritmo_reciente_json` contiene una llamada real a
 *      `fn_ledger_puntos` (no coincidencia numérica); NO contiene `fn_es_lider()`; NO menciona
 *      `costo` en ningún punto (a diferencia de `fn_resumen_comparacion`, que sí lo devuelve).
 *   2. PERMISO: una colaboradora de OTRA sede no ve nada (`{}`); sin sesión (`anon`), tampoco.
 *   3. REUTILIZA EL LEDGER (no lo reconstruye aparte): para una variante con una reposición
 *      interna y una venta, los eventos que devuelve coinciden EXACTOS (mismos ts/delta/
 *      esVenta/esMovimientoInterno) con los que devuelve `fn_ledger_puntos` filtrado al bucket
 *      'piso' — la prueba de que es un consumidor delgado, no una copia del algoritmo.
 *   4. CON ARREGLO EXPLÍCITO, TODAS LAS VARIANTES APARECEN: una variante sin ningún movimiento
 *      en la ventana igual aparece en el resultado, con `[]` — nunca ausente (mismo criterio que
 *      `fn_ledger_puntos`/`fn_ledger_timeline`): Existencias necesita saber "sin movimiento" para
 *      distinguirlo de "no se pudo calcular".
 *
 * Mismo mecanismo que el resto de `scripts/pruebas/`: `docker exec … psql`, `set local
 * request.jwt.claim.sub` y `ROLLBACK` SIEMPRE — no deja nada en el Postgres compartido. Los
 * actores se resuelven por ROL/RELACIÓN (nunca UUID ni nombre fijo), mismo criterio que
 * `fn_ledger_fuente_unica.mjs` (pedido de Felipe, 2026-09-24: no hardcodear identidades).
 *
 * USO
 *   pnpm pruebas:fn-ritmo-reciente    → necesita el stack local levantado
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
}

const RESOLVER = `
select id as ubic from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1 \\gset
select p.auth_user_id as persona_admin from public.personas p where p.rol = 'admin' order by p.created_at limit 1 \\gset
select p.auth_user_id as persona_colaboradora
  from public.personas p
  join retail.colaboradores c on c.persona_id = p.id
  join retail.ubicaciones u2 on u2.sede_dynamic_id = p.sede_base_id
  where c.rol = 'colaborador' and c.estado = 'activo' and p.estado = 'activo' and u2.id = :'ubic'
  order by p.created_at limit 1 \\gset
select p.auth_user_id as persona_otra_sede
  from public.personas p
  join retail.colaboradores c on c.persona_id = p.id
  join retail.ubicaciones u2 on u2.sede_dynamic_id = p.sede_base_id
  where p.rol not in ('admin', 'supervisor_sede') and u2.id <> :'ubic' and u2.activo
  order by p.created_at limit 1 \\gset
`;

function prelude() {
  return `
begin;
${RESOLVER}
set local request.jwt.claim.sub = :'persona_admin';
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select id as sp from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select id as sa from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset
select ((now() at time zone 'America/Lima')::date - 6)::timestamp at time zone 'America/Lima' as t0 \\gset
select set_config('prueba.ubic', :'ubic', true) as _cfg \\gset

create function pg_temp.mov(v uuid, tipo text, cant int, sub uuid, motivo text, cuando timestamptz, venta_item uuid default null) returns uuid language sql as $$
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at, venta_item_id)
  values (v, current_setting('prueba.ubic')::uuid, sub, tipo, cant, motivo, cuando, venta_item) returning id
$$;
create function pg_temp.mov_interno(v uuid, cant int, origen uuid, destino uuid, cuando timestamptz) returns uuid language sql as $$
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  values (v, current_setting('prueba.ubic')::uuid, origen, current_setting('prueba.ubic')::uuid, destino, 'traslado', cant, 'movimiento_interno', cuando) returning id
$$;
create function pg_temp.saldo(v uuid, sub uuid, cant int) returns void language sql as $$
  insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad) values (v, current_setting('prueba.ubic')::uuid, sub, cant)
  on conflict (variante_id, ubicacion_id, sububicacion_id) do update set cantidad = excluded.cantidad
$$;
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
create function pg_temp.venta(v uuid, cant int) returns uuid language plpgsql as $$
declare vt uuid; li uuid;
begin
  insert into retail.ventas (ubicacion_id, estado) values (current_setting('prueba.ubic')::uuid, 'completada') returning id into vt;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
    values (vt, v, cant, 100, 0, 40) returning id into li;
  return li;
end $$;
`;
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

function correr(titulo, sql, verificar) {
  console.log(`\n${titulo}`);
  let salida;
  try {
    salida = psql(sql).trim();
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del caso falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 6).join(" ")}`);
    return;
  }
  verificar(salida);
}

// ---------------------------------------------------------------------------
// 1. ESTRUCTURAL
// ---------------------------------------------------------------------------
correr(
  "1. fn_ritmo_reciente_json delega en fn_ledger_puntos, sin fn_es_lider(), sin costo",
  `
select 'LEDGER|' || (pg_get_functiondef('retail.fn_ritmo_reciente_json'::regproc) like '%fn_ledger_puntos(%');
select 'LIDER|' || (pg_get_functiondef('retail.fn_ritmo_reciente_json'::regproc) like '%fn_es_lider(%');
select 'COSTO|' || (pg_get_functiondef('retail.fn_ritmo_reciente_json'::regproc) like '%costo%');
`,
  (salida) => {
    afirmar("delega en fn_ledger_puntos (no lo reconstruye aparte)", salida.includes("LEDGER|t"));
    afirmar("NO exige fn_es_lider() — mismo permiso que fn_resumen_variantes", salida.includes("LIDER|f"));
    afirmar("NO menciona costo en ningún punto", salida.includes("COSTO|f"));
  },
);

// ---------------------------------------------------------------------------
// 2. PERMISO
// ---------------------------------------------------------------------------
correr(
  "2. Una colaboradora de OTRA sede no ve nada; sin sesión tampoco",
  `${prelude()}
select pg_temp.variante('ZZ-RR-PERM') as va \\gset
select pg_temp.saldo(:'va'::uuid, :'sp'::uuid, 5);

set local role authenticated;
set local request.jwt.claim.sub = :'persona_otra_sede';
select 'OTRA_SEDE|' || retail.fn_ritmo_reciente_json(:'ubic'::uuid, :'t0'::timestamptz, array[:'va'::uuid])::text;

reset role;
select 'ANON|' || has_function_privilege('anon', p.oid, 'EXECUTE')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'retail' and p.proname = 'fn_ritmo_reciente_json';
rollback;`,
  (salida) => {
    afirmar("colaboradora de otra sede: {}", salida.includes("OTRA_SEDE|{}"));
    afirmar("anon no puede ejecutarla", salida.includes("ANON|f"));
  },
);

// ---------------------------------------------------------------------------
// 3. REUTILIZA EL LEDGER: mismos eventos que fn_ledger_puntos, bucket piso
// ---------------------------------------------------------------------------
correr(
  "3. Los eventos que devuelve coinciden EXACTOS con fn_ledger_puntos (bucket piso, mismo filtro)",
  `${prelude()}
select pg_temp.variante('ZZ-RR-LEDGER') as va \\gset
select pg_temp.saldo(:'va'::uuid, :'sp'::uuid, 3);
select pg_temp.saldo(:'va'::uuid, :'sa'::uuid, 10);
select pg_temp.mov_interno(:'va'::uuid, 4, :'sa'::uuid, :'sp'::uuid, :'t0'::timestamptz + interval '1 day');
select pg_temp.venta(:'va'::uuid, 2) as li \\gset
select pg_temp.mov(:'va'::uuid, 'salida', 2, :'sp'::uuid, 'venta', :'t0'::timestamptz + interval '2 days', :'li'::uuid);

set local role authenticated;
set local request.jwt.claim.sub = :'persona_colaboradora';
select 'RITMO|' || retail.fn_ritmo_reciente_json(:'ubic'::uuid, :'t0'::timestamptz, array[:'va'::uuid])::text;

reset role;
select 'PUNTOS|' || jsonb_agg(jsonb_build_object('ts', ts, 'delta', delta, 'esVenta', es_venta, 'esMovimientoInterno', es_interno) order by ts)::text
  from retail.fn_ledger_puntos(:'ubic'::uuid, :'t0'::timestamptz, array[:'va'::uuid])
  where bucket = 'piso' and (ord = 1 or delta <> 0);
rollback;`,
  (salida) => {
    const lineas = salida.split("\n");
    const ritmoLinea = lineas.find((l) => l.startsWith("RITMO|"));
    const puntosLinea = lineas.find((l) => l.startsWith("PUNTOS|"));
    if (!ritmoLinea || !puntosLinea) {
      afirmar("se obtuvieron ambas respuestas", false, `ritmo=${!!ritmoLinea} puntos=${!!puntosLinea}`);
      return;
    }
    const ritmoJson = JSON.parse(ritmoLinea.slice("RITMO|".length));
    const puntosJson = JSON.parse(puntosLinea.slice("PUNTOS|".length));
    const eventosVariante = Object.values(ritmoJson)[0];
    afirmar("hay eventos para la variante", Array.isArray(eventosVariante) && eventosVariante.length > 0, JSON.stringify(ritmoJson));
    afirmar(
      "los eventos de fn_ritmo_reciente_json son EXACTOS a los de fn_ledger_puntos (bucket piso)",
      JSON.stringify(eventosVariante) === JSON.stringify(puntosJson),
      `${JSON.stringify(eventosVariante)} vs ${JSON.stringify(puntosJson)}`,
    );
  },
);

// ---------------------------------------------------------------------------
// 4. CON ARREGLO EXPLÍCITO, TODAS APARECEN — incluso sin movimiento
// ---------------------------------------------------------------------------
correr(
  "4. Una variante sin movimiento en la ventana igual aparece, con []",
  `${prelude()}
select pg_temp.variante('ZZ-RR-SINMOV') as va \\gset
select pg_temp.saldo(:'va'::uuid, :'sp'::uuid, 0);

set local role authenticated;
set local request.jwt.claim.sub = :'persona_colaboradora';
select 'SINMOV|' || retail.fn_ritmo_reciente_json(:'ubic'::uuid, :'t0'::timestamptz, array[:'va'::uuid])::text;
rollback;`,
  (salida) => {
    const linea = salida.split("\n").find((l) => l.startsWith("SINMOV|"));
    if (!linea) {
      afirmar("se obtuvo respuesta", false);
      return;
    }
    const json = JSON.parse(linea.slice("SINMOV|".length));
    const eventos = Object.values(json)[0];
    afirmar("la variante aparece en el resultado (nunca ausente)", Object.keys(json).length === 1);
    afirmar("sin movimiento en la ventana: arreglo vacío, no ausencia", Array.isArray(eventos) && eventos.length === 0, JSON.stringify(json));
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones`);
process.exit(fallos === 0 ? 0 : 1);

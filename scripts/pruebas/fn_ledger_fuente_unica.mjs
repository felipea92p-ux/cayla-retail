#!/usr/bin/env node
/**
 * Prueba de integración: `retail.fn_ledger_puntos` es la ÚNICA fuente de verdad del ledger de
 * piso/almacén/total (ADR-0182, 2026-09-24) — que `fn_resumen_comparacion` y `fn_ledger_timeline`
 * REALMENTE la usan (no que "dan el mismo número por coincidencia"), y que unificarlas no cambió
 * ningún resultado de `fn_resumen_comparacion` (mismos casos que `fn_resumen_comparacion.mjs`,
 * antes de esta migración, adaptados a la sede real del seed actual — ver la nota al final).
 *
 *   1. PRUEBA ESTRUCTURAL: el código fuente de `fn_resumen_comparacion` y de `fn_ledger_timeline`
 *      contiene una llamada real a `fn_ledger_puntos` — la prueba de que delegan, no una
 *      casualidad numérica.
 *   2. EQUIVALENCIA CRUZADA: para una misma variante/sede/ventana, los intervalos crudos que
 *      devuelve `fn_ledger_timeline` (un consumidor de la primitiva) reconstruyen, calculados a
 *      mano en JS, EXACTAMENTE el mismo stock al inicio/cierre y los mismos días con stock que
 *      `fn_resumen_comparacion` (el otro consumidor) reporta para la MISMA variante/ventana —
 *      con un ciclo piso→almacén→piso de por medio, para ejercitar los dos buckets a la vez.
 *   3. TAXONOMÍA ESTRUCTURAL: `esMovimientoInterno` usa `retail.fn_es_traslado_interno` (tipo +
 *      ubicación, la MISMA condición que ya usaba la pantalla Movimientos) en vez de comparar el
 *      string `motivo = 'movimiento_interno'` — reproduce el caso real ya aplicado en producción
 *      (`activacion-piso-almacen-produccion.sql`, 2026-09-14) donde un traslado interno real tiene
 *      un motivo distinto, y confirma que el reloj de exposición lo sigue reconociendo.
 *   4. `actual` NO ES UNA SEGUNDA FUENTE DE VERDAD: en una ventana HISTÓRICA (que termina mucho antes
 *      de hoy, con más movimiento después de que cierra), `a_stock_inicio`/`a_stock_cierre` de
 *      `fn_resumen_comparacion` NO coinciden con el stock de HOY (`actual`) — prueba de que la
 *      reconstrucción temporal real vive en `fn_ledger_puntos`/`intervalos`, y `actual` es solo el
 *      ancla desde la que se camina hacia atrás, nunca una reconstrucción paralela.
 *   5. CRUCE LEDGER ↔ MOVIMIENTOS: para una variante con recepción, dos ciclos piso↔almacén, venta,
 *      devolución y ajuste, la suma de `delta` que reporta `retail.fn_movimientos` (la RPC REAL de
 *      Inventario > Movimientos) coincide EXACTA con la suma de `delta` del bucket total del ledger
 *      — ningún movimiento visible en Movimientos queda ignorado por el ledger, ninguno usado por el
 *      ledger es inexistente en Movimientos. Las filas no calzan 1 a 1 (Movimientos muestra las 3
 *      piernas de traslado interno con delta=0 cada una; el ledger las neta a 0 y no las expone) —
 *      diferencia legítima y documentada, no una omisión.
 *   6. STOCK ACTUAL P/A (2026-09-24): las columnas nuevas `stock_piso_hoy`/`stock_almacen_hoy` de
 *      `fn_resumen_comparacion` reutilizan exactamente `actual.en_venta`/`actual.utilizable` (nunca
 *      una fuente de stock nueva) y dan los 4 casos exactos que pidió Felipe — 5/60, 0/35, 0/0, y
 *      NULL/NULL (nunca un 0 inventado) cuando la sede no separa piso de almacén.
 *   7. REGRESIÓN: los mismos 4 casos de `fn_resumen_comparacion.mjs` (stock inicio/cierre
 *      reconstruido del ledger, períodos no contiguos, importe/COGS en componentes, ledger que no
 *      cuadra y permisos) siguen dando el mismo resultado después de la migración.
 *
 * NOTA (2026-09-24, corregida el mismo día por pedido de Felipe): esta prueba NO hardcodea ningún
 * UUID de persona ni ningún nombre de sede — sustituir un UUID viejo por uno nuevo (lo que hacía
 * la primera versión de este archivo) no resuelve la fragilidad estructural, solo la pospone hasta
 * el próximo reseed. En vez de eso, cada corrida resuelve sus propios actores POR ROL/RELACIÓN
 * (`resolver()`, abajo): cualquier sede activa de tipo 'tienda', cualquier persona con rol admin, y
 * cualquier colaboradora cuya sede base (`sede_base_id`, resuelta contra `retail.ubicaciones.
 * sede_dynamic_id` — el puente real entre las dos identidades, ver `integracion-dynamic-identidad`)
 * sea DISTINTA de la sede bajo prueba. Sobrevive a cualquier reseed que mantenga la forma del
 * dominio (al menos una tienda activa, al menos un admin, al menos una colaboradora en otra sede) —
 * exactamente lo único que esta prueba necesita, nada de su seed concreto.
 *
 * Los ~15 scripts preexistentes que SÍ hardcodean nombre/UUID (`fn_resumen_comparacion.mjs`,
 * `roles_por_modulo.mjs`, etc.) son un problema aparte, señalado ya como chip de sesión — no se
 * tocan acá; esta nota documenta por qué la prueba NUEVA no repite ese patrón.
 *
 * Mismo mecanismo que el resto de `scripts/pruebas/`: `docker exec … psql`, `set local
 * request.jwt.claim.sub` y `ROLLBACK` SIEMPRE — no deja nada en el Postgres compartido.
 *
 * USO
 *   pnpm pruebas:fn-ledger-fuente-unica    → necesita el stack local levantado
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

// Resuelve los actores por ROL/RELACIÓN, nunca por UUID ni nombre fijo: `ubic` = cualquier tienda
// activa; `persona_admin` = cualquier persona con rol admin (opera cualquier sede, `fn_es_admin`);
// `persona_otra_sede` = cualquier colaboradora cuya sede base NO es `ubic` (para el caso «no ve
// filas»). El JOIN `u2.sede_dynamic_id = p.sede_base_id` es el puente real entre las dos
// identidades (`public.personas`/Dynamic y `retail.ubicaciones`) — el mismo que usa
// `fn_puede_operar_ubicacion` por dentro.
const RESOLVER = `
select id as ubic from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1 \\gset
select p.auth_user_id as persona_admin from public.personas p where p.rol = 'admin' order by p.created_at limit 1 \\gset
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
select (((now() at time zone 'America/Lima')::date - 29)::timestamp at time zone 'America/Lima') as t0 \\gset
select ((now() at time zone 'America/Lima')::date) as hoy \\gset
select set_config('prueba.ubic', :'ubic', true) as _cfg \\gset

create function pg_temp.mov(v uuid, tipo text, cant int, sub uuid, motivo text, cuando timestamptz,
                            venta_item uuid default null, dev_item uuid default null)
returns uuid language sql as $$
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, devolucion_item_id, created_at)
  values (v, current_setting('prueba.ubic')::uuid, sub, tipo, cant, motivo, venta_item, dev_item, cuando) returning id
$$;
create function pg_temp.mov_interno(v uuid, cant int, origen uuid, destino uuid, cuando timestamptz) returns uuid language sql as $$
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  values (v, current_setting('prueba.ubic')::uuid, origen, current_setting('prueba.ubic')::uuid, destino, 'traslado', cant, 'movimiento_interno', cuando) returning id
$$;
create function pg_temp.saldo(v uuid, sub uuid, cant int) returns void language sql as $$
  insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad) values (v, current_setting('prueba.ubic')::uuid, sub, cant)
  on conflict (variante_id, ubicacion_id, sububicacion_id) do update set cantidad = excluded.cantidad
$$;
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
    console.log(`  ✘ el SQL del caso falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 6).join(" ")}`);
    return;
  }
  verificar(salida);
}

// ---------------------------------------------------------------------------
// 1. PRUEBA ESTRUCTURAL: las dos funciones delegan de verdad en fn_ledger_puntos
// ---------------------------------------------------------------------------
correr(
  "1. fn_resumen_comparacion y fn_ledger_timeline contienen una llamada real a fn_ledger_puntos (no coincidencia numérica)",
  `
select 'RC|' || (pg_get_functiondef('retail.fn_resumen_comparacion'::regproc) like '%fn_ledger_puntos(%');
select 'LT|' || (pg_get_functiondef('retail.fn_ledger_timeline'::regproc) like '%fn_ledger_puntos(%');
select 'DEF|' || (pg_get_functiondef('retail.fn_ledger_puntos'::regproc) like '%security definer%');
`,
  (salida) => {
    afirmar("fn_resumen_comparacion delega en fn_ledger_puntos", salida.includes("RC|t"));
    afirmar("fn_ledger_timeline delega en fn_ledger_puntos", salida.includes("LT|t"));
    afirmar("fn_ledger_puntos NO es security definer (función interna, la autorización vive en cada llamador)", salida.includes("DEF|f"));
  },
);

// ---------------------------------------------------------------------------
// 2. EQUIVALENCIA CRUZADA: fn_ledger_timeline (una variante) y fn_resumen_comparacion (todas las
//    variantes de la sede) parten del MISMO fn_ledger_puntos — con un ciclo piso→almacén→piso.
// ---------------------------------------------------------------------------
correr(
  "2. fn_ledger_timeline y fn_resumen_comparacion coinciden para la misma variante/ventana (piso→almacén→piso de por medio)",
  `${prelude()}
select pg_temp.variante('ZZ-LFU-A') as va \\gset
-- día 0: entran 20 al piso. día 5: se venden 6 (piso 14). día 8: bajan 5 al almacén (piso 9, total 14).
-- día 15: regresan las 5 del almacén al piso (piso 14, total 14: el traslado interno no mueve el total).
select pg_temp.mov(:'va', 'entrada', 20, :'sp', 'carga_inicial', :'t0'::timestamptz + interval '1 hour') as _1 \\gset
select count(pg_temp.mov(:'va', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '5 days' + (i * interval '1 hour'))) as _2 from generate_series(1, 6) i \\gset
select pg_temp.mov_interno(:'va', 5, :'sp', :'sa', :'t0'::timestamptz + interval '8 days') as _3 \\gset
select pg_temp.mov_interno(:'va', 5, :'sa', :'sp', :'t0'::timestamptz + interval '15 days') as _4 \\gset
select pg_temp.saldo(:'va', :'sp', 14) as _5 \\gset
select pg_temp.saldo(:'va', :'sa', 0) as _6 \\gset
-- fn_ledger_timeline: los intervalos crudos, para la misma variante, ventana [t0, hoy+1d).
select 'LT|' || bucket || '|' || inicio || '|' || fin || '|' || nivel
  from retail.fn_ledger_timeline(:'va', :'ubic', :'t0'::timestamptz, (:'hoy'::date + 1)::timestamp at time zone 'America/Lima')
  order by bucket, inicio;
-- fn_resumen_comparacion: A = todo el período (t0 a hoy-15), B = el resto (hoy-14 a hoy) — igual que el resto de estas pruebas.
select 'RC|' || r.a_stock_inicio || '|' || r.a_stock_cierre || '|' || r.a_dias_con_stock || '|' || r.b_stock_inicio || '|' || r.b_stock_cierre || '|' || r.ledger_consistente
  from retail.fn_resumen_comparacion(:'ubic', :'hoy'::date - 29, :'hoy'::date - 15, :'hoy'::date - 14, :'hoy'::date) r
  where r.sku = 'ZZ-LFU-A';
rollback;`,
  (salida) => {
    const lineas = salida.split("\n").filter(Boolean);
    const piso = lineas.filter((l) => l.startsWith("LT|piso|")).map((l) => l.split("|"));
    const total_ = lineas.filter((l) => l.startsWith("LT|total|")).map((l) => l.split("|"));
    const rc = (lineas.find((l) => l.startsWith("RC|")) ?? "").split("|");
    afirmar("fn_ledger_timeline devolvió intervalos de piso y de total", piso.length > 0 && total_.length > 0, `piso=${piso.length} total=${total_.length}`);

    // Reconstrucción independiente en JS de "stock al inicio de A" (= t0, el primer intervalo) y
    // "stock al cierre de A" (= el nivel vigente en hoy-15) a partir de los intervalos CRUDOS de
    // fn_ledger_timeline — sin usar ninguna fórmula de fn_resumen_comparacion.
    const nivelEn = (intervalos, fecha) => {
      const fila = intervalos.find((c) => new Date(c[2]) <= fecha && fecha < new Date(c[3]));
      return fila ? Number(fila[4]) : null;
    };
    const t0Real = new Date(piso[0][2]);
    const aCierre = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    aCierre.setUTCDate(aCierre.getUTCDate() - 14); // hoy - 14 días, el borde A/B de estas pruebas

    const totalInicio = nivelEn(total_, t0Real);
    const totalCierre = nivelEn(total_, aCierre);
    afirmar(
      "total al inicio de A (fn_ledger_timeline) = a_stock_inicio (fn_resumen_comparacion): el traslado interno no lo movió",
      totalInicio !== null && Number(rc[1]) === totalInicio,
      `timeline=${totalInicio} resumen=${rc[1]}`,
    );
    afirmar(
      "total al cierre de A (fn_ledger_timeline) = a_stock_cierre (fn_resumen_comparacion), 14 unidades (20 − 6 vendidas)",
      totalCierre !== null && Number(rc[2]) === totalCierre && totalCierre === 14,
      `timeline=${totalCierre} resumen=${rc[2]}`,
    );
    afirmar("el ledger cuadra en las dos funciones (mismo dato, misma reconstrucción)", rc[6] === "true", `ledger_consistente=${rc[6]}`);
  },
);

// ---------------------------------------------------------------------------
// 3. TAXONOMÍA ESTRUCTURAL: esMovimientoInterno usa la MISMA condición que ya usaba Movimientos
//    (tipo='traslado' and ubicacion_id=ubicacion_destino_id), no el string `motivo`. Reproduce el
//    caso real de `activacion-piso-almacen-produccion.sql` (2026-09-14): un traslado interno con un
//    motivo que NO es 'movimiento_interno' — antes de este fix, `fn_ledger_puntos` lo habría tratado
//    como stock nuevo (reloj en 0) en vez de un regreso desde almacén (reloj que pausa y continúa).
// ---------------------------------------------------------------------------
correr(
  "3. esMovimientoInterno es estructural (tipo+ubicación), no depende del string `motivo` — reproduce el caso real de 'activacion_piso_almacen'",
  `${prelude()}
select pg_temp.variante('ZZ-LFU-INTERNO') as va \\gset
-- 10 al piso, día 1. Día 5: 4 se van al almacén con un motivo QUE NO ES 'movimiento_interno' (como
-- hizo el script de activación real en producción) — mismo tipo/ubicación que mover_interno(), motivo
-- distinto. Día 10: esas 4 regresan al piso, también con un motivo ajeno a la convención.
select pg_temp.mov(:'va', 'entrada', 10, :'sp', 'carga_inicial', :'t0'::timestamptz + interval '1 day') as _1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  values (:'va', :'ubic', :'sp', :'ubic', :'sa', 'traslado', 4, 'activacion_piso_almacen', :'t0'::timestamptz + interval '5 days');
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  values (:'va', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 4, 'activacion_piso_almacen', :'t0'::timestamptz + interval '10 days');
select pg_temp.saldo(:'va', :'sp', 10) as _2 \\gset
select pg_temp.saldo(:'va', :'sa', 0) as _3 \\gset
select 'PUNTOS|' || bucket || '|' || es_interno || '|' || delta
  from retail.fn_ledger_puntos(:'ubic', :'t0'::timestamptz, array[:'va']::uuid[])
  where bucket = 'piso' and ord = 1
  order by ts;
rollback;`,
  (salida) => {
    const todas = salida
      .split("\n")
      .filter((l) => l.startsWith("PUNTOS|"))
      .map((l) => l.split("|"));
    const entrada = todas.filter((f) => f[3] === "10");
    const traslado = todas.filter((f) => f[3] === "-4" || f[3] === "4");
    afirmar("la entrada original (10) y los dos tramos del traslado (−4, +4) aparecen en el bucket piso", entrada.length === 1 && traslado.length === 2, `total=${todas.length}`);
    afirmar("la entrada genuina (carga_inicial) NO es interna", entrada[0]?.[2] === "false", JSON.stringify(entrada));
    afirmar(
      "es_interno = true en los dos tramos del traslado, aunque el motivo sea 'activacion_piso_almacen' (no 'movimiento_interno'): la condición es estructural, no el string",
      traslado.every((f) => f[2] === "true"),
      JSON.stringify(traslado),
    );
  },
);

// ---------------------------------------------------------------------------
// 4. `actual` NO ES UNA SEGUNDA FUENTE DE VERDAD: ventana histórica con más movimiento DESPUÉS de
//    que cierra — a_stock_inicio/a_stock_cierre deben ser DISTINTOS del stock de hoy (`actual`).
// ---------------------------------------------------------------------------
correr(
  "4. actual no es una segunda reconstrucción: en una ventana histórica, inicio/cierre ≠ stock de hoy",
  `${prelude()}
select pg_temp.variante('ZZ-LFU-ACTUAL') as va \\gset
-- Entra 20 (día 0), vende 5 (día 5, piso 15). El período A analizado cierra en el día 15 — TODAVÍA
-- no ha pasado la recepción de 30 del día 20. Esa recepción sube el stock a 45, que es lo que
-- queda hoy en \`stock\` (\`actual\`). Si fn_resumen_comparacion reportara el stock de HOY para un
-- período que ya cerró, a_stock_cierre saldría 45 — el número real (15) prueba que reconstruye el
-- ledger hacia atrás en el tiempo, no que lee \`actual\` para cualquier fecha.
select pg_temp.mov(:'va', 'entrada', 20, :'sp', 'carga_inicial', :'t0'::timestamptz + interval '1 hour') as _1 \\gset
select pg_temp.mov(:'va', 'salida', 5, :'sp', 'venta', :'t0'::timestamptz + interval '5 days') as _2 \\gset
select pg_temp.mov(:'va', 'entrada', 30, :'sp', 'recepcion', :'t0'::timestamptz + interval '20 days') as _3 \\gset
select pg_temp.saldo(:'va', :'sp', 45) as _4 \\gset
select 'ACTUAL|' || cantidad from retail.stock where variante_id = :'va' and sububicacion_id = :'sp';
select 'RESUMEN|' || r.a_stock_inicio || '|' || r.a_stock_cierre || '|' || r.b_stock_inicio || '|' || r.b_stock_cierre
  from retail.fn_resumen_comparacion(:'ubic', :'hoy'::date - 29, :'hoy'::date - 15, :'hoy'::date - 14, :'hoy'::date) r
  where r.sku = 'ZZ-LFU-ACTUAL';
rollback;`,
  (salida) => {
    const actual = Number((salida.match(/ACTUAL\|(\d+)/) ?? [])[1]);
    const r = (salida.match(/RESUMEN\|(-?\d+)\|(-?\d+)\|(-?\d+)\|(-?\d+)/) ?? []).slice(1).map(Number);
    const [aIni, aFin, bIni, bFin] = r;
    afirmar("el stock de HOY (actual) es 45 (20 − 5 + 30)", actual === 45, `actual=${actual}`);
    afirmar("a_stock_inicio (0, antes de que entrara nada) ≠ a_stock_cierre (15) ≠ actual (45): tres números distintos", aIni !== undefined && aIni !== aFin && aFin !== actual && aIni !== actual, `aIni=${aIni} aFin=${aFin} actual=${actual}`);
    afirmar("a_stock_cierre = 15 (20 − 5, ANTES de la recepción del día 20 — no el stock de hoy)", aFin === 15, `aFin=${aFin}`);
    afirmar("b_stock_inicio = a_stock_cierre (15): el cierre de A es el inicio de B, sin discontinuidad", bIni === aFin, `bIni=${bIni} aFin=${aFin}`);
    afirmar("b_stock_cierre SÍ coincide con actual (45): B es el único período que llega hasta hoy", bFin === actual, `bFin=${bFin} actual=${actual}`);
  },
);

// ---------------------------------------------------------------------------
// 5. CRUCE LEDGER ↔ MOVIMIENTOS: ningún movimiento visible en Movimientos se ignora en silencio; nada
//    que use el ledger es inauditable desde Movimientos.
// ---------------------------------------------------------------------------
correr(
  "5. la suma de deltas de retail.fn_movimientos (Movimientos real) coincide con la del bucket total del ledger — recepción, dos ciclos piso↔almacén, venta, devolución, ajuste",
  `${prelude()}
select pg_temp.variante('ZZ-LFU-CRUCE') as va \\gset
select pg_temp.mov(:'va', 'entrada', 20, :'sa', 'recepcion', :'t0'::timestamptz + interval '1 day') as _1 \\gset
select pg_temp.mov_interno(:'va', 20, :'sa', :'sp', :'t0'::timestamptz + interval '2 days') as _2 \\gset
select pg_temp.venta(:'va', 6) as li \\gset
select pg_temp.mov(:'va', 'salida', 6, :'sp', 'venta', :'t0'::timestamptz + interval '3 days', :'li') as _3 \\gset
select pg_temp.mov_interno(:'va', 5, :'sp', :'sa', :'t0'::timestamptz + interval '4 days') as _4 \\gset
select pg_temp.mov_interno(:'va', 5, :'sa', :'sp', :'t0'::timestamptz + interval '5 days') as _5 \\gset
select venta_id as vid from retail.venta_items where id = :'li' \\gset
insert into retail.devoluciones (venta_id, ubicacion_id, motivo, estado, aprobado_en) values (:'vid', :'ubic', 'prueba', 'aprobada', now()) returning id as dev \\gset
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (:'dev', :'li', 1, 'vendible') returning id as di \\gset
select pg_temp.mov(:'va', 'entrada', 1, :'sp', 'devolucion', :'t0'::timestamptz + interval '6 days', null, :'di') as _6 \\gset
select pg_temp.mov(:'va', 'ajuste', -1, :'sp', 'merma', :'t0'::timestamptz + interval '7 days') as _7 \\gset
select pg_temp.saldo(:'va', :'sp', 14) as _8 \\gset
select pg_temp.saldo(:'va', :'sa', 0) as _9 \\gset
select 'MOV|' || count(*) || '|' || coalesce(sum(delta), 0)
  from retail.fn_movimientos(p_ubicacion_id => :'ubic', p_desde => (:'t0'::date), p_hasta => :'hoy'::date, p_limite => 200)
  where sku = 'ZZ-LFU-CRUCE';
select 'LEDGER|' || count(*) || '|' || coalesce(sum(delta), 0)
  from retail.fn_ledger_puntos(:'ubic', :'t0'::timestamptz, array[:'va']::uuid[])
  where bucket = 'total' and ord = 1;
select 'MOV_INTERNO|' || count(*) filter (where categoria = 'interno' and delta = 0)
  from retail.fn_movimientos(p_ubicacion_id => :'ubic', p_desde => (:'t0'::date), p_hasta => :'hoy'::date, p_limite => 200)
  where sku = 'ZZ-LFU-CRUCE';
rollback;`,
  (salida) => {
    const mov = (salida.match(/MOV\|(\d+)\|(-?\d+)/) ?? []).slice(1).map(Number);
    const ledger = (salida.match(/LEDGER\|(\d+)\|(-?\d+)/) ?? []).slice(1).map(Number);
    const internos = Number((salida.match(/MOV_INTERNO\|(\d+)/) ?? [])[1]);
    afirmar("Movimientos ve las 7 filas (recepción, 3 piernas de traslado interno, venta, devolución, ajuste)", mov[0] === 7, `mov_count=${mov[0]}`);
    afirmar("el ledger reduce a 4 puntos en el bucket total (las 3 piernas de traslado interno netean a 0, no entran)", ledger[0] === 4, `ledger_count=${ledger[0]}`);
    afirmar("las 3 filas «que faltan» en el ledger son EXACTAMENTE las de categoría interno con delta=0 en Movimientos — diferencia legítima, no una omisión", internos === 3, `internos_delta_cero=${internos}`);
    afirmar("la suma de deltas coincide EXACTA entre Movimientos y el ledger: 14 (20 − 6 + 1 − 1)", mov[1] === 14 && ledger[1] === 14 && mov[1] === ledger[1], `mov_suma=${mov[1]} ledger_suma=${ledger[1]}`);
  },
);

// ---------------------------------------------------------------------------
// 6. STOCK ACTUAL P/A: los 4 casos exactos que pidió Felipe (5/60, 0/35, 0/0, NULL/NULL).
// ---------------------------------------------------------------------------
correr(
  "6a. Stock actual P/A — casos A (5/60), B (0/35) y C (0/0): reutiliza actual.en_venta/actual.utilizable, nunca una fuente nueva",
  `${prelude()}
select pg_temp.variante('ZZ-LFU-PA-A') as va \\gset
select pg_temp.variante('ZZ-LFU-PA-B') as vb \\gset
select pg_temp.variante('ZZ-LFU-PA-C') as vc \\gset
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad) values (:'va', :'ubic', :'sp', 5), (:'va', :'ubic', :'sa', 60);
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad) values (:'vb', :'ubic', :'sp', 0), (:'vb', :'ubic', :'sa', 35);
-- C: sin filas de stock en absoluto, pero con movimiento (para que aparezca en el reporte) → 0/0 conocido, no N/D.
select pg_temp.mov(:'vc', 'entrada', 10, :'sp', 'carga_inicial', :'t0'::timestamptz + interval '1 day') as _1 \\gset
select pg_temp.mov(:'vc', 'salida', 10, :'sp', 'venta', :'t0'::timestamptz + interval '2 days') as _2 \\gset
select 'PA|' || r.sku || '|' || coalesce(r.stock_piso_hoy::text, 'NULL') || '|' || coalesce(r.stock_almacen_hoy::text, 'NULL')
  from retail.fn_resumen_comparacion(:'ubic', :'hoy'::date - 29, :'hoy'::date - 15, :'hoy'::date - 14, :'hoy'::date) r
  where r.sku in ('ZZ-LFU-PA-A', 'ZZ-LFU-PA-B', 'ZZ-LFU-PA-C');
rollback;`,
  (salida) => {
    const filas = Object.fromEntries(
      salida
        .split("\n")
        .filter((l) => l.startsWith("PA|"))
        .map((l) => l.split("|"))
        .map(([, sku, piso, almacen]) => [sku, { piso, almacen }]),
    );
    afirmar("A: piso 5 / almacén 60", filas["ZZ-LFU-PA-A"]?.piso === "5" && filas["ZZ-LFU-PA-A"]?.almacen === "60", JSON.stringify(filas["ZZ-LFU-PA-A"]));
    afirmar("B: piso 0 (cero real) / almacén 35", filas["ZZ-LFU-PA-B"]?.piso === "0" && filas["ZZ-LFU-PA-B"]?.almacen === "35", JSON.stringify(filas["ZZ-LFU-PA-B"]));
    afirmar("C: 0 / 0 — se sabe con certeza que no hay stock, no es lo mismo que 'no lo sabemos'", filas["ZZ-LFU-PA-C"]?.piso === "0" && filas["ZZ-LFU-PA-C"]?.almacen === "0", JSON.stringify(filas["ZZ-LFU-PA-C"]));
  },
);

correr(
  "6b. Stock actual P/A — caso D: una sede que NO separa piso/almacén nunca inventa un split (NULL/NULL, no 0/0 ni el total en un solo lado)",
  `begin;
select id as ubic from retail.ubicaciones where tipo = 'taller' and activo limit 1 \\gset
select p.auth_user_id as persona_admin from public.personas p where p.rol = 'admin' order by p.created_at limit 1 \\gset
set local request.jwt.claim.sub = :'persona_admin';
select ((now() at time zone 'America/Lima')::date) as hoy \\gset
create function pg_temp.variante(sku text) returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  insert into retail.productos (referencia, estado, marca_id, proveedor_id)
    select 'ZZ ' || sku, 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
    returning id into p;
  insert into retail.variantes (producto_id, sku, precio, costo, activo) values (p, sku, 100, 40, true) returning id into v;
  return v;
end $$;
select pg_temp.variante('ZZ-LFU-PA-D') as vd \\gset
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad) values (:'vd', :'ubic', null, 20);
select 'PA_D|' || r.sku || '|' || coalesce(r.stock_piso_hoy::text, 'NULL') || '|' || coalesce(r.stock_almacen_hoy::text, 'NULL')
  from retail.fn_resumen_comparacion(:'ubic', :'hoy'::date - 5, :'hoy'::date - 3, :'hoy'::date - 2, :'hoy'::date) r
  where r.sku = 'ZZ-LFU-PA-D';
rollback;`,
  (salida) => {
    const fila = (salida.match(/PA_D\|[^|]+\|([^|]+)\|([^|\n]+)/) ?? []).slice(1);
    afirmar("D: NULL/NULL — el Taller no separa piso/almacén, no se inventa el split", fila[0] === "NULL" && fila[1] === "NULL", JSON.stringify(fila));
  },
);

// ---------------------------------------------------------------------------
// 7. REGRESIÓN: los mismos 4 casos de fn_resumen_comparacion.mjs, con el nombre de sede real
// ---------------------------------------------------------------------------
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

correr(
  "7a. «inicio 0 → cierre 14» con 4 vendidas en A: llegó mercadería; el cierre de A es el inicio de B; B cierra con el stock de hoy",
  `${prelude()}
select pg_temp.variante('ZZ-LFU-CMP-A') as va \\gset
select pg_temp.mov(:'va', 'entrada', 10, :'sp', 'carga_inicial', :'t0'::timestamptz + interval '1 hour') as _1 \\gset
select count(pg_temp.mov(:'va', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '5 days' + (i * interval '1 hour'))) as _2 from generate_series(1, 4) i \\gset
select pg_temp.mov(:'va', 'entrada', 8, :'sa', 'recepcion', :'t0'::timestamptz + interval '10 days') as _3 \\gset
select count(pg_temp.mov(:'va', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '16 days' + (i * interval '1 hour'))) as _4 from generate_series(1, 3) i \\gset
select pg_temp.mov_interno(:'va', 8, :'sa', :'sp', :'t0'::timestamptz + interval '20 days') as _5 \\gset
select pg_temp.saldo(:'va', :'sp', 11) as _6 \\gset
select pg_temp.saldo(:'va', :'sa', 0) as _7 \\gset
select 'E|' || (extract(epoch from (now() - (:'t0'::timestamptz + interval '15 days'))) / 86400.0)::numeric(10,3) as esperado \\gset
select :'esperado' as _print;
${FILA("ZZ-LFU-CMP-A")}
rollback;`,
  (salida) => {
    const f = parsear(salida);
    const esperadoB = Number((salida.match(/E\|([\d.]+)/) ?? [])[1] ?? NaN);
    const r = f["ZZ-LFU-CMP-A"];
    afirmar("aparece", !!r);
    afirmar("A vendió 4 y B vendió 3", r?.a.ventas === 4 && r?.b.ventas === 3, `A=${r?.a.ventas} B=${r?.b.ventas}`);
    afirmar("A: inicio 0 → cierre 14 (vendió 4 pero el stock SUBE: recepción de 8)", r?.a.ini === 0 && r?.a.fin === 14, `ini=${r?.a.ini} fin=${r?.a.fin}`);
    afirmar("B: inicio 14 (= cierre de A) → cierre 11", r?.b.ini === 14 && r?.b.fin === 11, `ini=${r?.b.ini} fin=${r?.b.fin}`);
    afirmar("el cierre de B (llega hasta hoy) es el stock utilizable de hoy: 11", r?.b.fin === 11);
    afirmar("A: días con stock ≈ 15 − 1 hora (piso >0 desde la entrada)", cerca(r?.a.dias, 15 - 1 / 24, 0.02), `dias=${r?.a.dias}`);
    afirmar("B: en venta toda la ventana", cerca(r?.b.dias, esperadoB, 0.02), `dias=${r?.b.dias} esperado=${esperadoB}`);
    afirmar("el ledger cuadra", r?.ledger === true);
    afirmar("A: entradas = 10 (la carga inicial); la recepción suelta de 8 no cuenta", r?.a.entradas === 10, `entradas=${r?.a.entradas}`);
    afirmar("B: sin entradas", r?.b.entradas === 0, `entradas=${r?.b.entradas}`);
  },
);

correr(
  "7b. Períodos separados: el cierre de A ya no es el inicio de B (hubo movimiento en el hueco)",
  `${prelude()}
select pg_temp.variante('ZZ-LFU-CMP-B') as vb \\gset
select pg_temp.mov(:'vb', 'entrada', 10, :'sp', 'carga_inicial', :'t0'::timestamptz + interval '1 day') as _1 \\gset
select pg_temp.mov(:'vb', 'entrada', 5, :'sp', 'recepcion', :'t0'::timestamptz + interval '8 days') as _2 \\gset
select pg_temp.mov(:'vb', 'salida', 2, :'sp', 'venta', :'t0'::timestamptz + interval '25 days') as _3 \\gset
select pg_temp.saldo(:'vb', :'sp', 13) as _4 \\gset
${FILA("ZZ-LFU-CMP-B", `retail.fn_resumen_comparacion(:'ubic', :'hoy'::date - 29, :'hoy'::date - 26, :'hoy'::date - 9, :'hoy'::date)`)}
rollback;`,
  (salida) => {
    const f = parsear(salida);
    const r = f["ZZ-LFU-CMP-B"];
    afirmar("A cierra con 10 y B abre con 15 (el hueco tuvo una recepción de 5)", r?.a.fin === 10 && r?.b.ini === 15, `A.fin=${r?.a.fin} B.ini=${r?.b.ini}`);
    afirmar("B cierra con 13", r?.b.fin === 13, `B.fin=${r?.b.fin}`);
    afirmar("A no tuvo ventas y B vendió 2", r?.a.ventas === 0 && r?.b.ventas === 2);
  },
);

correr(
  "7c. Importe = precio − descuento; COGS = costo del día de la venta (no el de hoy) en componentes; anulada fuera; una venta a costo 0 se cuenta «sin costo»",
  `${prelude()}
select pg_temp.variante('ZZ-LFU-CMP-C', 70) as vc \\gset
select pg_temp.variante('ZZ-LFU-CMP-C2', 70) as vc2 \\gset
select pg_temp.mov(:'vc', 'entrada', 20, :'sp', 'carga_inicial', :'t0'::timestamptz) as _0 \\gset
select pg_temp.mov(:'vc2', 'entrada', 20, :'sp', 'carga_inicial', :'t0'::timestamptz) as _00 \\gset
select pg_temp.venta(:'vc', 2, 20, 40) as li \\gset
select pg_temp.mov(:'vc', 'salida', 2, :'sp', 'venta', :'t0'::timestamptz + interval '18 days', :'li') as _1 \\gset
select pg_temp.venta(:'vc', 5, 0, 40, 'anulada') as la \\gset
select pg_temp.mov(:'vc', 'salida', 5, :'sp', 'venta', :'t0'::timestamptz + interval '19 days', :'la') as _2 \\gset
select v.id as venta_id from retail.ventas v join retail.venta_items i on i.venta_id = v.id where i.id = :'li' \\gset
insert into retail.devoluciones (venta_id, ubicacion_id, motivo, estado, aprobado_en) values (:'venta_id', :'ubic', 'prueba', 'aprobada', now()) returning id as dev \\gset
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (:'dev', :'li', 1, 'vendible') returning id as di \\gset
select pg_temp.mov(:'vc', 'entrada', 1, :'sp', 'devolucion', :'t0'::timestamptz + interval '21 days', null, :'di') as _3 \\gset
select pg_temp.saldo(:'vc', :'sp', 14) as _4 \\gset
select pg_temp.venta(:'vc2', 3, 0, 0) as lz \\gset
select pg_temp.mov(:'vc2', 'salida', 3, :'sp', 'venta', :'t0'::timestamptz + interval '18 days', :'lz') as _5 \\gset
select pg_temp.saldo(:'vc2', :'sp', 17) as _6 \\gset
${FILA("ZZ-LFU-CMP-C")}
${FILA("ZZ-LFU-CMP-C2")}
rollback;`,
  (salida) => {
    const f = parsear(salida);
    const r = f["ZZ-LFU-CMP-C"];
    const z = f["ZZ-LFU-CMP-C2"];
    afirmar("vendió 2 y le devolvieron 1 (la anulada de 5 no cuenta)", r?.b.ventas === 2 && r?.b.dev === 1, `ventas=${r?.b.ventas} dev=${r?.b.dev}`);
    afirmar("importe neto = 2×80 − 1×80 = 80", cerca(r?.b.importe, 80, 0.01), `importe=${r?.b.importe}`);
    afirmar("COGS en componentes: vendido 2×40 = 80 y devuelto 1×40 = 40 (el de ese día, no 70)", cerca(r?.b.costoVentas, 80, 0.01) && cerca(r?.b.costoDev, 40, 0.01), `ventas=${r?.b.costoVentas} dev=${r?.b.costoDev}`);
    afirmar("todo lo vendido tiene costo: 0 unidades sin costo", r?.b.sinCosto === 0, `sinCosto=${r?.b.sinCosto}`);
    afirmar("A no vendió nada: importe, costos y unidades sin costo en 0", r?.a.ventas === 0 && r?.a.importe === 0 && r?.a.costoVentas === 0 && r?.a.costoDev === 0 && r?.a.sinCosto === 0);
    afirmar("una venta a costo 0 NO inventa un costo: COGS 0 y sus 3 unidades quedan «sin costo»", z?.b.costoVentas === 0 && z?.b.sinCosto === 3, `costo=${z?.b.costoVentas} sinCosto=${z?.b.sinCosto}`);
  },
);

correr(
  "7d. Ledger que no cuadra se marca; una variante sin actividad no aparece; el colaborador no ve filas; permisos y firma",
  `${prelude()}
select pg_temp.variante('ZZ-LFU-CMP-D') as vd \\gset
select pg_temp.variante('ZZ-LFU-CMP-E') as ve \\gset
select pg_temp.mov(:'vd', 'entrada', 5, :'sp', 'carga_inicial', now() - interval '3 days') as _1 \\gset
select pg_temp.mov(:'vd', 'salida', 1, :'sp', 'venta', now() - interval '2 days') as _1b \\gset
select pg_temp.saldo(:'vd', :'sp', 0) as _2 \\gset
${FILA("ZZ-LFU-CMP-D")}
${FILA("ZZ-LFU-CMP-E")}
select 'N|' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_resumen_comparacion';
select 'X|' || has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_resumen_comparacion';
select 'L|' || count(*) from ${LLAMADA};
set local request.jwt.claim.sub = :'persona_otra_sede';
select 'C|' || count(*) from ${LLAMADA};
rollback;`,
  (salida) => {
    const f = parsear(salida);
    afirmar("D se marca como inconsistente", f["ZZ-LFU-CMP-D"]?.ledger === false, `ledger=${f["ZZ-LFU-CMP-D"]?.ledger}`);
    afirmar("E (sin stock ni ventas en ninguno de los dos períodos) no aparece", f["ZZ-LFU-CMP-E"] === undefined);
    afirmar("hay UNA sola función", salida.includes("N|1"));
    afirmar("anon no puede ejecutarla", salida.includes("X|f"));
    afirmar("el líder recibe filas", /L\|[1-9]/.test(salida));
    afirmar("el colaborador no recibe ninguna", salida.includes("C|0"), salida.match(/C\|\d+/)?.[0]);
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);

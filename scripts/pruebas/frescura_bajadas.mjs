#!/usr/bin/env node
/**
 * Prueba de ADR-0208 «Frescura del piso» — la lectura de la bajada tardía `retail.fn_bajadas_del_piso`
 * (`20260926000300_frescura_lectura_bajadas.sql`; desde el paso 2 de Frescura 3c, su núcleo
 * `20260928120100_bajadas_nucleo.sql` y el cambio de conducta `20260928120200_bajadas_netear_retiros.sql`).
 *
 * POR QUÉ. La marca «tardía» no se guarda: se deriva al leer, tomando el piso de antes del libro único
 * (`fn_ledger_puntos`, ADR-0202) y cruzándolo con las ventas desde el piso de los 10 minutos siguientes. Un error de
 * signo, de borde de ventana o de qué cuenta como venta acusaría a una colaboradora que registró bien (o taparía a la que
 * registró al cobrar). Eso solo se ve con un libro de verdad y horas fijadas, y ninguna prueba de TypeScript lo cubre.
 *
 * LA REGLA DESDE 20260928120200 (ADR-0208 (c)): piso_antes = el nivel MÁS ALTO del piso en [t − ventana, t] (si el
 * nivel justo antes es negativo, ese nivel: «dudosa»); retiradas = piso → almacén de la misma prenda en
 * [t − ventana, t + ventana]; cantidad_efectiva = máx(0, cantidad − retiradas); tardías = mín(efectiva,
 * máx(0, vendidas − piso_antes)); «corregida» si la efectiva es 0; es_carga_inicial = entrada «carga_inicial» de la misma
 * prenda en el mismo instante. Los casos que CAMBIARON con esa migración dicen «(cambia en 120200: antes …)».
 *
 * QUÉ CUBRE (valores esperados escritos a mano; ventana de 10 minutos salvo que se diga otra cosa)
 *   T0  forma: una sola versión, security definer, plan a medida, anon sin EXECUTE y authenticated con EXECUTE, y las
 *       columnas del contrato; la prueba ESTRUCTURAL de ADR-0202 mira el NÚCLEO (`fn_bajadas_del_piso_nucleo`, interno:
 *       nadie de afuera lo ejecuta): llama a `fn_ledger_puntos(` una sola vez y no lee `stock` por su cuenta; la puerta
 *       `fn_bajadas_del_piso` (el candado de líder) llama al núcleo UNA vez y al libro ninguna.
 *   T1  piso 0, baja 3, vende 1 a los 3 min → 1 tardía.            T2  piso 5, baja 3, vende 2 a los 2 min → 0.
 *   T3a venta a los 10:00 exactos → cuenta.   T3b a los 10:01 → no. Con ventana de 5 minutos, la de 10:00 no cuenta.
 *   T4  bajadas de 2 y 3 y una venta de 5 que necesita las dos → 2 y 3.
 *   T5  venta anulada: no cuenta, pero su salida y su entrada de anulación mueven el piso (piso_antes correcto).
 *   T6  baja 10, vende 1, baja 3, vende 1 → 2 y 0 (el orden importa). La segunda: piso_antes 10 (cambia en 120200: antes 9).
 *   T7  la bajada de «Reponer» (mover_interno) sale con bajada_id nulo; la de bajar_al_piso, con el suyo y su firma.
 *   T8  la entrega de un apartado desde el almacén, la salida de regularizar_prenda y la «Prenda sin registrar» no son venta.
 *   T9  cuarentena→piso no es bajada; el piso→almacén de los 10 minutos antes es un retiro que se descuenta → «corregida»
 *       (cambia en 120200: antes «normal» con piso_antes 1).
 *   T10 stock tocado a mano: una unidad de más cambia piso_antes; si queda negativo → «dudosa» y tardías nulas.
 *   T11 bajada de hace 2 minutos sin venta → «en_curso», sin cerrar; si ya se vendió, «tardia» aunque siga abierta.
 *   T12 Taller (sin piso ni almacén) → cero filas y sin error.   T13 cuenta que no es líder → su mensaje.
 *   T14 historia mezclada (y una entrada de hace 40 días, fuera del rango): piso_antes = el nivel más alto de la ventana,
 *       recalculado desde cero (cambia en 120200: antes 4, 5, 7 y ahora 4, 7, 8), con el retiro descontado de las dos
 *       bajadas que lo tienen en su ventana.
 *   T15 un cambio (la prenda que se lleva la clienta) cuenta como venta.
 *   T16 ventana fuera de 1..240 y rango de más de 120 días → sus errores; los bordes pasan; hasta <= desde → cero filas.
 *   T17 rango [desde, hasta): el borde de hasta queda fuera, y las ventas posteriores a hasta igual se miran.
 *   T18 LÍMITE CONOCIDO: una devolución que entra al piso dentro de la ventana no se descuenta → la bajada sale tardía.
 *   T19 lo que llega de OTRA tienda directo al piso no es bajada, pero sí suma en piso_antes (criterio del libro).
 *   T20 tienda inactiva → cero filas y sin error (el libro no reconstruye sedes inactivas).
 *   T21 la venta se mide a la hora de la VENTA, no a la de su salida del libro, cuando las dos no coinciden.
 *   T22 la guarda de 20260928120100: con un parche en vivo aborta sin tocar nada; pegada DESPUÉS de la 120200, aborta
 *       con su aviso y no deshace nada.
 *   T23 la guarda de 20260928120200: pegada dos veces deja lo mismo; con un parche en vivo del núcleo aborta sin tocar.
 *   T24 el ejemplo de ADR-0208 (c): piso 2, se retiran 2 por error, se reponen 2 al minuto y se vende 1 → «corregida»,
 *       0 tardías (antes de 120200: «tardia»).
 *   T25 retiro DESPUÉS: se bajan 10 y a los 5 minutos se retiran 4 → efectiva 6; las tardías se topan por la efectiva;
 *       LÍMITE CONOCIDO: un retiro en la ventana de dos bajadas se descuenta de las dos.
 *   T26 carga inicial: la entrada «carga_inicial» y su bajada en el mismo instante (cargar_stock_inicial con p_al_piso,
 *       o a mano) → es_carga_inicial; en otro instante, o una bajada normal → no.
 *   T27 borde del rango: una bajada del primer minuto ve su piso de antes y el retiro previo aunque caigan antes de p_desde.
 *   T28 la misma hora exacta (una transacción): para el nivel más alto cuenta lo que el libro ordena ANTES de la bajada
 *       (created_at, id), nunca lo de después: si no, la bajada contaría sus propias unidades como piso de antes.
 *
 * CÓMO. `now()` es constante dentro de una transacción y `movimientos` es inmutable: como `postgres`, cada caso inserta
 * sus movimientos con `created_at` explícito (colgados de t0 = ahora − 3 h) EN ORDEN CRONOLÓGICO y los aplica con
 * `fn_aplicar_movimiento`, así el stock cuadra con el libro. Prendas nuevas en cada caso (SKU «ZZ-FRE-…»); cada caso en
 * su transacción con ROLLBACK: no deja nada en la base. Mismo mecanismo que `fn_resumen_variantes.mjs`.
 *
 * USO
 *   pnpm pruebas:frescura-bajadas    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const migracion = (archivo) => readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8");
const MIGRACION_0300 = migracion("20260926000300_frescura_lectura_bajadas.sql");
const MIGRACION_NUCLEO = migracion("20260928120100_bajadas_nucleo.sql");
const MIGRACION_RETIROS = migracion("20260928120200_bajadas_netear_retiros.sql");
/** Una migración entera como literal de SQL (entre $m$), para ejecutarla con pg_temp.intento dentro del caso. */
const comoLiteral = (sql) => `${"$"}m$${sql.replace(/\\/g, "\\\\")}${"$"}m$`;
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const CENTINELA = "22222222-2222-4222-8222-222222222222"; // «Prenda sin registrar» (ADR-0179)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

/** Todo caso empieza igual: Tienda Trujillo con piso, almacén y cuarentena, el líder en sesión y el reloj t0. */
const PRELUDIO = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
-- fn_actor_persona_id consulta la asistencia de Dynamic: en un Postgres sin Dynamic esas tablas no existen.
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Cuarentena', 'cuarentena' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena');
select id as sp from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select id as sa from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset
select id as sc from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select (now() - interval '3 hours') as t0 \\gset
-- psql no sustituye variables dentro de cuerpos entre $$: la tienda y sus sububicaciones viajan como parámetros de sesión.
select set_config('prueba.ubic', :'ubic', true) as _1, set_config('prueba.sp', :'sp', true) as _2,
       set_config('prueba.sa', :'sa', true) as _3, set_config('prueba.sc', :'sc', true) as _4 \\gset

-- Una prenda nueva (cada una su producto; desde ADR-0109 todo producto lleva marca y proveedor).
create function pg_temp.variante(p_sku text) returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'productos' and column_name = 'marca_id') then
    insert into retail.productos (referencia, marca_id, proveedor_id)
      select 'ZZ ' || p_sku, mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
      returning id into p;
  else
    insert into retail.productos (referencia) values ('ZZ ' || p_sku) returning id into p;
  end if;
  insert into retail.variantes (producto_id, sku, precio, costo) values (p, p_sku, 100, 40) returning id into v;
  return v;
end $$;
-- Una fila del libro con hora fijada, aplicada al stock en el acto (se llaman en orden cronológico).
create function pg_temp.mov(v uuid, p_tipo text, n int, sub uuid, p_motivo text, cuando timestamptz,
                            sub_destino uuid default null, venta_item uuid default null, cambio uuid default null)
returns uuid language plpgsql as $$
declare u uuid := current_setting('prueba.ubic')::uuid; m uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                  tipo, cantidad, motivo, venta_item_id, cambio_id, created_at)
  values (v, u, sub, case when p_tipo = 'traslado' then u end, sub_destino, p_tipo, n, p_motivo, venta_item, cambio, cuando)
  returning id into m;
  perform retail.fn_aplicar_movimiento(m);
  return m;
end $$;
-- Entrada al almacén (lo que llegó del proveedor).
create function pg_temp.llega(v uuid, n int, cuando timestamptz) returns uuid language sql as $$
  select pg_temp.mov(v, 'entrada', n, current_setting('prueba.sa')::uuid, 'recepcion', cuando)
$$;
-- Bajada con la forma exacta de mover_interno: traslado almacén→piso de la misma tienda.
create function pg_temp.bajada(v uuid, n int, cuando timestamptz) returns uuid language sql as $$
  select pg_temp.mov(v, 'traslado', n, current_setting('prueba.sa')::uuid, 'movimiento_interno', cuando, current_setting('prueba.sp')::uuid)
$$;
-- Una venta de una línea (completada o anulada) con su hora; devuelve el id de la línea. No mueve stock.
create function pg_temp.venta_item(v uuid, n int, cuando timestamptz, p_estado text default 'completada') returns uuid language plpgsql as $$
declare vt uuid; li uuid; u uuid := current_setting('prueba.ubic')::uuid;
begin
  if p_estado = 'anulada' then
    insert into retail.ventas (ubicacion_id, estado, anulado_en, motivo_anulacion, created_at) values (u, 'anulada', cuando + interval '47 minutes', 'prueba', cuando) returning id into vt;
  else
    insert into retail.ventas (ubicacion_id, estado, created_at) values (u, 'completada', cuando) returning id into vt;
  end if;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (vt, v, n, 100, 40) returning id into li;
  return li;
end $$;
-- Venta desde una sububicación (el piso si no se dice): la venta y su salida del libro, a la misma hora.
create function pg_temp.vende(v uuid, n int, cuando timestamptz, p_estado text default 'completada', sub uuid default null) returns uuid language sql as $$
  select pg_temp.mov(v, 'salida', n, coalesce(sub, current_setting('prueba.sp')::uuid), 'venta', cuando, null, pg_temp.venta_item(v, n, cuando, p_estado))
$$;
`;

/** Las filas de la función para las prendas de la prueba: una línea `R|…` por bajada. */
const FILAS = (args = "") => `
select 'R|' || v.sku || '|' || round(extract(epoch from (r.bajada_en - :'t0'::timestamptz)) / 60.0, 3) || '|' || r.cantidad
       || '|' || r.piso_antes || '|' || r.vendidas_en_ventana || '|' || coalesce(r.unidades_tardias::text, 'null')
       || '|' || r.cerrada || '|' || r.estado || '|' || coalesce(r.bajada_id::text, 'null') || '|' || coalesce(r.persona_id::text, 'null')
       || '|' || r.movimiento_id || '|' || r.retiradas_en_ventana || '|' || r.cantidad_efectiva || '|' || r.es_carga_inicial
  from retail.fn_bajadas_del_piso(:'ubic'${args}) r
  join retail.variantes v on v.id = r.variante_id
 where v.sku like 'ZZ-FRE-%'
 order by v.sku, r.bajada_en;`;

/** Llama a la función con esos argumentos y devuelve «ok + filas» o el error (estado, hint, mensaje) en una línea `E|nombre|…`. */
const PROBAR = `
create function pg_temp.probar(p_ubicacion uuid, p_desde timestamptz default null, p_hasta timestamptz default null, p_minutos integer default 10)
returns jsonb language plpgsql as $$
declare n bigint; v_estado text; v_msg text; v_hint text;
begin
  select count(*) into n from retail.fn_bajadas_del_piso(p_ubicacion, p_desde, p_hasta, p_minutos);
  return jsonb_build_object('ok', true, 'filas', n);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end $$;
-- Cualquier SQL (una migración entera, una llamada al núcleo): «ok» o el error, sin cortar el caso.
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'msg', v_msg);
end $$;`;
const probar =(nombre, args) => `select 'E|${nombre}|' || pg_temp.probar(${args})::text;`;

function parsear(salida) {
  const filas = {};
  const errores = {};
  const otras = {};
  for (const linea of salida.split("\n")) {
    if (linea.startsWith("R|")) {
      const [, sku, min, cantidad, pisoAntes, vendidas, tardias, cerrada, estado, bajadaId, personaId, movimientoId, retiradas, efectiva, carga] =
        linea.split("|");
      (filas[sku] ??= []).push({
        min: Number(min), cantidad: +cantidad, pisoAntes: +pisoAntes, vendidas: +vendidas,
        tardias: tardias === "null" ? null : +tardias, cerrada: cerrada === "true", estado,
        bajadaId: bajadaId === "null" ? null : bajadaId, personaId: personaId === "null" ? null : personaId, movimientoId,
        retiradas: +retiradas, efectiva: +efectiva, carga: carga === "true",
      });
    } else if (linea.startsWith("E|")) {
      const [, nombre, ...resto] = linea.split("|");
      errores[nombre] = JSON.parse(resto.join("|"));
    } else if (/^[A-Z][A-Z0-9_]*\|/.test(linea)) {
      const [clave, ...resto] = linea.split("|");
      otras[clave] = resto.join("|");
    }
  }
  return { filas, errores, otras };
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
const ver = (x) => JSON.stringify(x);
/** ¿La fila tiene exactamente estos valores? (solo compara las claves que se piden) */
const es = (fila, esperado) => !!fila && Object.entries(esperado).every(([k, v]) => fila[k] === v);

function correr(titulo, sql, verificar) {
  console.log(`\n${titulo}`);
  let salida;
  try {
    salida = psql(`${PRELUDIO}\n${PROBAR}\n${sql}\nrollback;\n`).trim();
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del caso falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 6).join(" ")}`);
    return;
  }
  verificar(parsear(salida), salida);
}

// ---------------------------------------------------------------------------
correr(
  "T0 · forma: una sola versión, security definer, plan a medida; authenticated la ejecuta y anon no",
  `select 'N|' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_bajadas_del_piso';
select 'F|' || p.prosecdef || ',' || p.provolatile::text || ',' || array_to_string(p.proconfig, ';')
  from pg_proc p where p.oid = 'retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer)'::regprocedure;
select 'C|' || array_to_string(p.proargnames, ',')
  from pg_proc p where p.oid = 'retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer)'::regprocedure;
select 'P|' || has_function_privilege('authenticated', 'retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer)', 'execute')
       || ',' || has_function_privilege('anon', 'retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer)', 'execute');
-- ADR-0202: cuántas veces llama el NÚCLEO al libro único y si vuelve a leer el stock por su cuenta (el saldo de partida
-- es del libro). La puerta no toca el libro: le pide todo al núcleo, una vez.
select 'LEDGER|' || (length(d) - length(replace(d, 'fn_ledger_puntos(', ''))) / length('fn_ledger_puntos(')
       || ',' || (d ~* '\\m(from|join)\\s+(retail\\.)?stock\\M')
  from (select pg_get_functiondef('retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)'::regprocedure) as d) x;
select 'PUERTA|' || (length(d) - length(replace(d, 'fn_bajadas_del_piso_nucleo(', ''))) / length('fn_bajadas_del_piso_nucleo(')
       || ',' || (length(d) - length(replace(d, 'fn_ledger_puntos(', ''))) / length('fn_ledger_puntos(')
  from (select pg_get_functiondef('retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer)'::regprocedure) as d) x;
-- El núcleo: uno solo, security definer, y nadie de afuera lo ejecuta (ni authenticated, ni anon, ni public).
select 'NN|' || count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_bajadas_del_piso_nucleo';
select 'NF|' || p.prosecdef || ',' || p.provolatile::text
  from pg_proc p where p.oid = 'retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)'::regprocedure;
select 'NP|' || has_function_privilege('authenticated', 'retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)', 'execute')
       || ',' || has_function_privilege('anon', 'retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)', 'execute')
       || ',' || coalesce((select bool_or(a.grantee = 0) from pg_proc p, aclexplode(p.proacl) a
                            where p.oid = 'retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)'::regprocedure), false);
set local role authenticated;
select 'A|' || count(*) from retail.fn_bajadas_del_piso(:'ubic');
select 'NA|' || pg_temp.intento(format('select count(*) from retail.fn_bajadas_del_piso_nucleo(%L)', :'ubic'))::text;
reset role;
set local role anon;
${probar("anon", ":'ubic'")}
reset role;`,
  ({ errores, otras }) => {
    const [llamadas, leeStock] = (otras.LEDGER ?? "").split(",");
    afirmar("las entrañas descansan en el libro único: el núcleo llama a fn_ledger_puntos( UNA sola vez (sin N+1)", llamadas === "1", `LEDGER=${otras.LEDGER}`);
    afirmar("el núcleo no lee stock por su cuenta (el saldo de partida sale de fn_ledger_puntos)", leeStock === "false", `LEDGER=${otras.LEDGER}`);
    afirmar("la puerta llama al núcleo UNA vez y al libro ninguna (un solo cálculo)", otras.PUERTA === "1,0", `PUERTA=${otras.PUERTA}`);
    afirmar("hay UN solo núcleo, security definer y stable", otras.NN === "1" && otras.NF === "true,s", `NN=${otras.NN} NF=${otras.NF}`);
    afirmar("nadie de afuera ejecuta el núcleo: ni authenticated, ni anon, ni public", otras.NP === "false,false,false", `NP=${otras.NP}`);
    const na = otras.NA ? JSON.parse(otras.NA) : null;
    afirmar("authenticated llamando al núcleo directo → permission denied (42501)", na?.ok === false && na?.estado === "42501", otras.NA);
    afirmar("hay UNA sola función fn_bajadas_del_piso", otras.N === "1", `N=${otras.N}`);
    const [secdef, volatil, ...resto] = (otras.F ?? "").split(",");
    const config = resto.join(",");
    afirmar("security definer y stable", secdef === "true" && volatil === "s", otras.F);
    afirmar("plan_cache_mode = force_custom_plan y search_path fijo", /plan_cache_mode=force_custom_plan/.test(config ?? "") && /search_path=retail, public, extensions/.test(config ?? ""), config);
    afirmar(
      "parámetros y columnas del contrato, en su orden",
      otras.C ===
        "p_ubicacion_id,p_desde,p_hasta,p_minutos,movimiento_id,bajada_id,variante_id,persona_id,bajada_en,cantidad,piso_antes,vendidas_en_ventana," +
          "unidades_tardias,cerrada,estado,retiradas_en_ventana,cantidad_efectiva,es_carga_inicial",
      otras.C,
    );
    afirmar("authenticated tiene EXECUTE y anon no", otras.P === "true,false", otras.P);
    afirmar("el líder la llama como authenticated (grant real, no solo postgres)", /^\d+$/.test(otras.A ?? ""), `A=${otras.A}`);
    afirmar("anon llamándola → permission denied", errores.anon?.ok === false && errores.anon?.estado === "42501", ver(errores.anon));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T1 · piso vacío, baja 3 y a los 3 minutos se vende 1 → 1 tardía",
  `select pg_temp.variante('ZZ-FRE-T1') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz) as _2 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '3 minutes') as _3 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T1"] ?? [];
    afirmar("una sola fila (la entrada al almacén y la venta no son bajadas)", f.length === 1, ver(f));
    afirmar("piso_antes 0, cantidad 3, vendidas 1, tardías 1, tardía y cerrada", es(f[0], { min: 0, cantidad: 3, pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia", cerrada: true }), ver(f[0]));
    afirmar("una bajada por movimiento directo no tiene documento de bajada", f[0]?.bajadaId === null, ver(f[0]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T2 · el piso ya tenía 5, baja 3 y a los 2 minutos se venden 2 → 0 tardías (el piso de antes alcanzaba)",
  `select pg_temp.variante('ZZ-FRE-T2') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
-- Entrada directa al piso (no es bajada): deja 5 colgadas.
select pg_temp.mov(:'v', 'entrada', 5, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _2 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz) as _3 \\gset
select pg_temp.vende(:'v', 2, :'t0'::timestamptz + interval '2 minutes') as _4 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T2"] ?? [];
    afirmar("una sola fila (la entrada directa al piso no es bajada)", f.length === 1, ver(f));
    afirmar("piso_antes 5, vendidas 2, tardías 0, normal", es(f[0], { cantidad: 3, pisoAntes: 5, vendidas: 2, tardias: 0, estado: "normal" }), ver(f[0]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T3 · el borde de la ventana: a los 10:00 exactos cuenta (T3a), a los 10:01 no (T3b); con ventana de 5 minutos, la de 10:00 tampoco",
  `select pg_temp.variante('ZZ-FRE-T3A') as va \\gset
select pg_temp.variante('ZZ-FRE-T3B') as vb \\gset
select pg_temp.llega(:'va', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'vb', 5, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.bajada(:'va', 1, :'t0'::timestamptz) as _3 \\gset
select pg_temp.bajada(:'vb', 1, :'t0'::timestamptz) as _4 \\gset
select pg_temp.vende(:'va', 1, :'t0'::timestamptz + interval '10 minutes') as _5 \\gset
select pg_temp.vende(:'vb', 1, :'t0'::timestamptz + interval '10 minutes 1 second') as _6 \\gset
${FILAS()}
${FILAS(", p_minutos => 5").replace("'R|' || v.sku", "'R|' || v.sku || '-5MIN'")}`,
  ({ filas }) => {
    afirmar("T3a · venta a los 10:00 exactos → 1 tardía", es(filas["ZZ-FRE-T3A"]?.[0], { pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia" }), ver(filas["ZZ-FRE-T3A"]));
    afirmar("T3b · venta a los 10:01 → fuera de la ventana, 0 tardías", es(filas["ZZ-FRE-T3B"]?.[0], { pisoAntes: 0, vendidas: 0, tardias: 0, estado: "normal" }), ver(filas["ZZ-FRE-T3B"]));
    afirmar("con p_minutos = 5 la venta de los 10:00 ya no cuenta", es(filas["ZZ-FRE-T3A-5MIN"]?.[0], { vendidas: 0, tardias: 0, estado: "normal" }), ver(filas["ZZ-FRE-T3A-5MIN"]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T4 · dos bajadas seguidas (2 y a los 4 minutos 3) y una venta de 5 a los 6 minutos → 2 y 3 tardías",
  `select pg_temp.variante('ZZ-FRE-T4') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _2 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz + interval '4 minutes') as _3 \\gset
select pg_temp.vende(:'v', 5, :'t0'::timestamptz + interval '6 minutes') as _4 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T4"] ?? [];
    afirmar("dos filas", f.length === 2, ver(f));
    afirmar("la primera: piso_antes 0, vendidas 5, 2 tardías", es(f[0], { min: 0, cantidad: 2, pisoAntes: 0, vendidas: 5, tardias: 2, estado: "tardia" }), ver(f[0]));
    afirmar("la segunda: piso_antes 2, vendidas 5, 3 tardías", es(f[1], { min: 4, cantidad: 3, pisoAntes: 2, vendidas: 5, tardias: 3, estado: "tardia" }), ver(f[1]));
    afirmar("entre las dos suman las 5 vendidas", (f[0]?.tardias ?? 0) + (f[1]?.tardias ?? 0) === 5);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T5 · una venta anulada no es venta, pero su salida y su entrada de anulación sí mueven el piso",
  `select pg_temp.variante('ZZ-FRE-T5') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz) as _2 \\gset
-- Se vendió 1 a los 2 minutos y se anuló a los 50: la salida original queda en el libro y vuelve con 'anulacion_venta'.
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '2 minutes', 'anulada') as mv \\gset
select venta_item_id as li from retail.movimientos where id = :'mv' \\gset
select pg_temp.mov(:'v', 'entrada', 1, :'sp', 'anulacion_venta', :'t0'::timestamptz + interval '50 minutes', null, :'li') as _3 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz + interval '60 minutes') as _4 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T5"] ?? [];
    afirmar("la bajada de t0: vendidas 0 (la anulada no cuenta), 0 tardías, piso_antes 0", es(f[0], { min: 0, pisoAntes: 0, vendidas: 0, tardias: 0, estado: "normal" }), ver(f[0]));
    afirmar("la bajada de t0+60: piso_antes 3 (3 − 1 que salió + 1 que volvió)", es(f[1], { min: 60, pisoAntes: 3, vendidas: 0, tardias: 0 }), ver(f[1]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T6 · baja 10, se vende 1 a los 2 min, baja 3 a los 5 y se vende 1 a los 7 → 2 y 0 tardías (el orden importa)",
  `select pg_temp.variante('ZZ-FRE-T6') as v \\gset
select pg_temp.llega(:'v', 20, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 10, :'t0'::timestamptz) as _2 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '2 minutes') as _3 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz + interval '5 minutes') as _4 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '7 minutes') as _5 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T6"] ?? [];
    afirmar("la de 10: piso_antes 0, vendidas 2 → 2 tardías", es(f[0], { min: 0, cantidad: 10, pisoAntes: 0, vendidas: 2, tardias: 2, estado: "tardia" }), ver(f[0]));
    // Cambia en 120200 (antes piso_antes 9): la venta de los 2 minutos cae en la ventana de la segunda bajada, y el
    // nivel más alto de esa ventana es el de antes de venderla (10). Las tardías no cambian.
    afirmar("la de 3: piso_antes 10 (el más alto de la ventana), vendidas 1 → 0 tardías", es(f[1], { min: 5, cantidad: 3, pisoAntes: 10, vendidas: 1, tardias: 0, estado: "normal" }), ver(f[1]));
    afirmar("sin retiros: la efectiva es la cantidad", f.every((x) => x.retiradas === 0 && x.efectiva === x.cantidad && x.carga === false), ver(f));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T7 · «Reponer» (mover_interno) sale sin bajada_id; bajar_al_piso sale con el suyo; las dos firmadas por quien bajó",
  `select pg_temp.variante('ZZ-FRE-T7-REPONER') as vr \\gset
select pg_temp.variante('ZZ-FRE-T7-BAJAR') as vb \\gset
select pg_temp.llega(:'vr', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'vb', 5, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select retail.mover_interno(:'ubic', :'vr', 2, :'sa', :'sp', null) as mov_reponer \\gset
select retail.bajar_al_piso(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'vb', 'cantidad', 3)), gen_random_uuid()) ->> 'bajada_id' as bid \\gset
-- Lo recién escrito tiene created_at = now() de ESTA transacción y la lectura va hasta now() sin incluirlo ([desde,
-- hasta)): en la vida real la lectura es otra transacción, posterior. Se corre 1 minuto hacia atrás por fuera de los
-- disparadores (solo postgres y solo en esta transacción, que termina en ROLLBACK); el stock no cambia. El candado se
-- apaga A LA VISTA y no con el modo réplica: desde 20260926160000 está en ALWAYS y el modo réplica ya no lo salta (D-22).
alter table retail.movimientos disable trigger movimientos_inmutables;
update retail.movimientos set created_at = created_at - interval '1 minute'
 where id = :'mov_reponer' or id in (select movimiento_id from retail.bajada_piso_items where bajada_id = :'bid');
alter table retail.movimientos enable always trigger movimientos_inmutables;
select 'BID|' || :'bid';
select 'FELIPE|' || :'felipe';
select 'MOVR|' || :'mov_reponer';
${FILAS()}`,
  ({ filas, otras }) => {
    const r = filas["ZZ-FRE-T7-REPONER"]?.[0];
    const b = filas["ZZ-FRE-T7-BAJAR"]?.[0];
    afirmar("la de «Reponer» aparece, es su movimiento y no tiene documento", r?.bajadaId === null && r?.movimientoId === otras.MOVR, ver(r));
    afirmar("la de bajar_al_piso aparece con su bajada_id", !!otras.BID && b?.bajadaId === otras.BID, `${ver(b)} bid=${otras.BID}`);
    afirmar("persona_id = quien firmó el movimiento (el líder en sesión)", r?.personaId === otras.FELIPE && b?.personaId === otras.FELIPE, `${r?.personaId} ${b?.personaId} felipe=${otras.FELIPE}`);
    afirmar("recién hechas: ventana abierta → en_curso y sin cerrar", es(r, { estado: "en_curso", cerrada: false, cantidad: 2 }) && es(b, { estado: "en_curso", cerrada: false, cantidad: 3 }), `${ver(r)} ${ver(b)}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T8 · no son venta: la entrega de un apartado desde el almacén, la salida de regularizar_prenda y la «Prenda sin registrar»",
  `select pg_temp.variante('ZZ-FRE-T8') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
-- Apartado en el almacén para una clienta.
select pg_temp.mov(:'v', 'apartado', 1, :'sa', 'apartado', :'t0'::timestamptz - interval '50 minutes') as _2 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _3 \\gset
-- Venta registrada al cobrar con la «Prenda sin registrar» a los t0+1; se regulariza a los t0+4 y sale del piso con
-- motivo 'venta' y la hora de la venta original (dentro de la ventana): regularizar_prenda la fecha en otro momento.
select pg_temp.venta_item(:'v', 1, :'t0'::timestamptz + interval '1 minute') as li_reg \\gset
insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado,
                                            estado, variante_id, forma, precio_oficial, diferencia, regularizado_en)
  select :'li_reg', :'ubic', 'Blusa sin etiqueta', (select id from retail.categorias order by id limit 1), (select id from retail.tallas order by id limit 1),
         (select codigo from retail.colores order by codigo limit 1), 100, 'regularizada', :'v', 'ya_registrada', 100, 0, :'t0'::timestamptz + interval '4 minutes';
select pg_temp.mov(:'v', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '4 minutes', null, :'li_reg') as _4 \\gset
-- Entrega del apartado a los t0+3: se libera y sale DESDE EL ALMACÉN como venta completada.
select pg_temp.mov(:'v', 'liberacion_apartado', 1, :'sa', 'liberacion_apartado', :'t0'::timestamptz + interval '3 minutes') as _5 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '3 minutes', 'completada', :'sa') as _6 \\gset
-- «Prenda sin registrar»: una venta de la centinela no mueve stock; y una fila con forma de bajada de la centinela no sale.
select pg_temp.venta_item('${CENTINELA}'::uuid, 1, :'t0'::timestamptz + interval '5 minutes') as _7 \\gset
select pg_temp.llega('${CENTINELA}'::uuid, 1, :'t0'::timestamptz - interval '60 minutes') as _8 \\gset
select pg_temp.bajada('${CENTINELA}'::uuid, 1, :'t0'::timestamptz) as _9 \\gset
select 'CENT|' || count(*) from retail.fn_bajadas_del_piso(:'ubic') r where r.variante_id = '${CENTINELA}'::uuid;
${FILAS()}`,
  ({ filas, otras }) => {
    const f = filas["ZZ-FRE-T8"] ?? [];
    afirmar("una sola fila para la prenda", f.length === 1, ver(f));
    afirmar("vendidas 0 y 0 tardías: ni la entrega desde el almacén ni la regularización cuentan", es(f[0], { pisoAntes: 0, vendidas: 0, tardias: 0, estado: "normal" }), ver(f[0]));
    afirmar("la «Prenda sin registrar» nunca sale como bajada", otras.CENT === "0", `CENT=${otras.CENT}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T9 · cuarentena→piso no es bajada; el piso→almacén de 10 minutos antes es un retiro y se descuenta de la bajada",
  `select pg_temp.variante('ZZ-FRE-T9') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
-- Devolución dañada a cuarentena; ya reparada, pasa al piso (2). Después una vuelve al almacén (queda 1).
select pg_temp.mov(:'v', 'entrada', 2, :'sc', 'devolucion', :'t0'::timestamptz - interval '40 minutes') as _2 \\gset
select pg_temp.mov(:'v', 'traslado', 2, :'sc', 'movimiento_interno', :'t0'::timestamptz - interval '20 minutes', :'sp') as _3 \\gset
select pg_temp.mov(:'v', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '10 minutes', :'sa') as _4 \\gset
select pg_temp.bajada(:'v', 1, :'t0'::timestamptz) as _5 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T9"] ?? [];
    afirmar("una sola fila: solo almacén→piso es bajada", f.length === 1, ver(f));
    // Cambia en 120200 (antes «normal» con piso_antes 1): la vuelta al almacén de los 10:00 exactos antes es un retiro
    // de la misma prenda dentro de la ventana. Se descuenta (efectiva 0 → «corregida») y el piso de antes es el más
    // alto de la ventana: 2, el que había antes de retirarla.
    afirmar(
      "retiro de 1 dentro de la ventana → retiradas 1, efectiva 0, «corregida», piso_antes 2 (cuarentena→piso sí lo sube)",
      es(f[0], { min: 0, cantidad: 1, pisoAntes: 2, retiradas: 1, efectiva: 0, tardias: 0, estado: "corregida" }),
      ver(f[0]),
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T10 · stock tocado a mano: una unidad de más cambia piso_antes; si el libro no alcanza a explicarlo (negativo) → «dudosa»",
  `select pg_temp.variante('ZZ-FRE-T10-DEMAS') as vl \\gset
select pg_temp.variante('ZZ-FRE-T10-DUDOSA') as vm \\gset
select pg_temp.llega(:'vl', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'vm', 10, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.bajada(:'vl', 3, :'t0'::timestamptz) as _3 \\gset
select pg_temp.bajada(:'vm', 2, :'t0'::timestamptz) as _4 \\gset
select pg_temp.vende(:'vm', 1, :'t0'::timestamptz + interval '3 minutes') as _5 \\gset
-- Como postgres y por fuera del libro: una de más en el piso de L; el piso de M queda en 0 cuando el libro dice 1.
update retail.stock set cantidad = cantidad + 1 where variante_id = :'vl' and ubicacion_id = :'ubic' and sububicacion_id = :'sp';
update retail.stock set cantidad = 0 where variante_id = :'vm' and ubicacion_id = :'ubic' and sububicacion_id = :'sp';
${FILAS()}`,
  ({ filas }) => {
    const l = filas["ZZ-FRE-T10-DEMAS"]?.[0];
    const m = filas["ZZ-FRE-T10-DUDOSA"]?.[0];
    afirmar("una de más en el stock → piso_antes 1 (el libro repetido desde cero diría 0)", es(l, { pisoAntes: 1, tardias: 0, estado: "normal" }), ver(l));
    afirmar("piso_antes negativo → estado «dudosa» y tardías nulas (aunque hubo una venta en la ventana)", es(m, { pisoAntes: -1, vendidas: 1, tardias: null, estado: "dudosa" }), ver(m));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T11 · bajada de hace 2 minutos sin venta → «en_curso», sin cerrar; si ya se vendió de más, «tardia» aunque siga abierta",
  `select pg_temp.variante('ZZ-FRE-T11') as v \\gset
select pg_temp.variante('ZZ-FRE-T11-VENDIDA') as w \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'w', 5, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.bajada(:'v', 1, now() - interval '2 minutes') as _3 \\gset
select pg_temp.bajada(:'w', 1, now() - interval '2 minutes') as _4 \\gset
select pg_temp.vende(:'w', 1, now() - interval '1 minute') as _5 \\gset
${FILAS()}`,
  ({ filas }) => {
    afirmar("sin venta: en_curso, cerrada = false, 0 tardías", es(filas["ZZ-FRE-T11"]?.[0], { cerrada: false, estado: "en_curso", tardias: 0 }), ver(filas["ZZ-FRE-T11"]));
    afirmar("con venta que el piso no cubría: tardia, cerrada = false", es(filas["ZZ-FRE-T11-VENDIDA"]?.[0], { cerrada: false, estado: "tardia", tardias: 1 }), ver(filas["ZZ-FRE-T11-VENDIDA"]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T12 · Taller (sin piso ni almacén) → cero filas y sin error",
  `${probar("taller", ":'taller'")}
${probar("sin_tienda", "null")}`,
  ({ errores }) => {
    afirmar("Taller: ok con 0 filas", errores.taller?.ok === true && errores.taller?.filas === 0, ver(errores.taller));
    afirmar("tienda nula: ok con 0 filas", errores.sin_tienda?.ok === true && errores.sin_tienda?.filas === 0, ver(errores.sin_tienda));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T13 · una cuenta que no es líder no la ve",
  `set local request.jwt.claim.sub = '${MICAELA}';
${probar("integrante", ":'ubic'")}`,
  ({ errores }) => {
    const e = errores.integrante;
    afirmar(
      "«Solo el líder puede ver cómo se registran las bajadas al piso.» (P0001, hint bajadas_solo_lider)",
      e?.ok === false && e?.estado === "P0001" && e?.hint === "bajadas_solo_lider" && e?.msg === "Solo el líder puede ver cómo se registran las bajadas al piso.",
      ver(e),
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T14 · historia mezclada (con una entrada de hace 40 días, fuera del rango): piso_antes = el más alto de la ventana, recalculado desde cero",
  `select pg_temp.variante('ZZ-FRE-T14') as v \\gset
select pg_temp.mov(:'v', 'entrada', 5, :'sp', 'recepcion', now() - interval '40 days') as _1 \\gset
select pg_temp.mov(:'v', 'ajuste', 2, :'sp', 'conteo', :'t0'::timestamptz - interval '100 minutes') as _2 \\gset
select pg_temp.mov(:'v', 'ajuste', -1, :'sp', 'conteo', :'t0'::timestamptz - interval '90 minutes') as _3 \\gset
select pg_temp.vende(:'v', 2, :'t0'::timestamptz - interval '80 minutes') as _4 \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '75 minutes') as _5 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz - interval '60 minutes') as _6 \\gset
select pg_temp.mov(:'v', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '50 minutes', :'sa') as _7 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz - interval '45 minutes') as _8 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz - interval '40 minutes') as _9 \\gset
select pg_temp.mov(:'v', 'entrada', 1, :'sc', 'devolucion', :'t0'::timestamptz - interval '38 minutes') as _10 \\gset
select pg_temp.mov(:'v', 'traslado', 1, :'sc', 'movimiento_interno', :'t0'::timestamptz - interval '33 minutes', :'sp') as _11 \\gset
select pg_temp.mov(:'v', 'salida', 1, :'sp', 'merma', :'t0'::timestamptz - interval '30 minutes') as _12 \\gset
select pg_temp.bajada(:'v', 1, :'t0'::timestamptz - interval '20 minutes') as _13 \\gset
select pg_temp.mov(:'v', 'entrada', 1, :'sp', 'devolucion', :'t0'::timestamptz - interval '10 minutes') as _14 \\gset
-- Recalculo independiente HACIA ADELANTE, desde la primera fila del libro y sin mirar el stock: para cada movimiento
-- del piso dentro de [bajada − 10 min, bajada] (la bajada incluida), el nivel con que se entró a él; y el más alto.
select 'REPLAY|' || string_agg(round(extract(epoch from (r.bajada_en - :'t0'::timestamptz)) / 60.0, 3) || '=' || (
         select max((
           select coalesce(sum(
                    case when m.sububicacion_id = :'sp' then case m.tipo when 'entrada' then m.cantidad when 'ajuste' then m.cantidad
                                                                        when 'salida' then -m.cantidad when 'traslado' then -m.cantidad else 0 end else 0 end
                  + case when m.tipo = 'traslado' and m.sububicacion_destino_id = :'sp' then m.cantidad else 0 end), 0)
             from retail.movimientos m
            where m.variante_id = :'v' and m.ubicacion_id = :'ubic'
              and (m.created_at, m.id) < (p.created_at, p.id)))
           from retail.movimientos p
          where p.variante_id = :'v' and p.ubicacion_id = :'ubic'
            and (p.sububicacion_id = :'sp' or (p.tipo = 'traslado' and p.sububicacion_destino_id = :'sp'))
            and p.created_at >= r.bajada_en - interval '10 minutes'
            and (p.created_at, p.id) <= (r.bajada_en, r.movimiento_id)), ',' order by r.bajada_en)
  from retail.fn_bajadas_del_piso(:'ubic') r where r.variante_id = :'v';
select 'PISO|' || (select cantidad from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'sp');
${FILAS()}`,
  ({ filas, otras }) => {
    const f = filas["ZZ-FRE-T14"] ?? [];
    const replay = Object.fromEntries((otras.REPLAY ?? "").split(",").filter(Boolean).map((p) => p.split("=").map(Number)));
    afirmar("tres bajadas", f.length === 3, ver(f));
    // Cambia en 120200 (antes 4, 5 y 7, el nivel justo antes): la segunda ve el 7 de antes del retiro de −50 y de la
    // venta de −45; la tercera, el 8 de antes de la merma de −30.
    afirmar("piso_antes a mano: 4, 7 y 8 (el más alto de cada ventana)", f.map((x) => x.pisoAntes).join(",") === "4,7,8", ver(f.map((x) => x.pisoAntes)));
    afirmar("piso_antes = recalcular el libro desde cero en cada ventana", f.length === 3 && f.every((x) => replay[x.min] === x.pisoAntes), `función=${ver(f.map((x) => [x.min, x.pisoAntes]))} replay=${otras.REPLAY}`);
    // El retiro de −50 cae a 10 minutos exactos DESPUÉS de la primera y ANTES de la segunda: se descuenta de las dos
    // (LÍMITE CONOCIDO, ver T25).
    afirmar("retiradas 1, 1 y 0 → efectivas 2, 1 y 1", f.map((x) => `${x.retiradas}/${x.efectiva}`).join(",") === "1/2,1/1,0/1", ver(f.map((x) => [x.retiradas, x.efectiva])));
    afirmar("el stock del piso de hoy es 9 (el libro cuadra)", otras.PISO === "9", `PISO=${otras.PISO}`);
    afirmar("sin ventas en ninguna ventana: 0 tardías y normales", f.every((x) => x.vendidas === 0 && x.tardias === 0 && x.estado === "normal"), ver(f));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T15 · un cambio (la prenda que se lleva la clienta sale del piso con cambio_id) cuenta como venta",
  `select pg_temp.variante('ZZ-FRE-T15') as v \\gset
select pg_temp.variante('ZZ-FRE-T15-DEVUELTA') as w \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.mov(:'w', 'entrada', 3, :'sp', 'recepcion', :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.vende(:'w', 1, :'t0'::timestamptz - interval '30 minutes') as mw \\gset
select venta_item_id as li from retail.movimientos where id = :'mw' \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _3 \\gset
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, created_at)
  values (:'li', :'ubic', :'v', 1, :'t0'::timestamptz + interval '4 minutes') returning id as cam \\gset
select pg_temp.mov(:'w', 'entrada', 1, :'sp', 'cambio', :'t0'::timestamptz + interval '4 minutes', null, null, :'cam') as _4 \\gset
select pg_temp.mov(:'v', 'salida', 1, :'sp', 'cambio', :'t0'::timestamptz + interval '4 minutes', null, null, :'cam') as _5 \\gset
${FILAS()}`,
  ({ filas }) => {
    afirmar("vendidas 1 por el cambio → 1 tardía", es(filas["ZZ-FRE-T15"]?.[0], { pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia" }), ver(filas["ZZ-FRE-T15"]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T16 · ventana fuera de 1..240 y rango de más de 120 días → sus errores; los bordes pasan; hasta <= desde → cero filas",
  `${probar("min0", "null, null, null, 0")}
${probar("min241", "null, null, null, 241")}
${probar("minnull", "null, null, null, null")}
${probar("rango121", "null, now() - interval '121 days'")}
${probar("min1", "null, null, null, 1")}
${probar("min240", "null, null, null, 240")}
${probar("rango120", "null, now() - interval '120 days'")}
select pg_temp.variante('ZZ-FRE-T16') as v \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 1, :'t0'::timestamptz) as _2 \\gset
select 'AL_REVES|' || count(*) from retail.fn_bajadas_del_piso(:'ubic', :'t0'::timestamptz + interval '1 hour', :'t0'::timestamptz - interval '1 hour') r where r.variante_id = :'v';
select 'IGUALES|' || count(*) from retail.fn_bajadas_del_piso(:'ubic', :'t0'::timestamptz, :'t0'::timestamptz) r where r.variante_id = :'v';`,
  ({ errores, otras }) => {
    const ventana = "La ventana va de 1 a 240 minutos.";
    for (const k of ["min0", "min241", "minnull"]) {
      afirmar(`p_minutos ${k.slice(3)} → «${ventana}» (P0001)`, errores[k]?.ok === false && errores[k]?.estado === "P0001" && errores[k]?.msg === ventana, ver(errores[k]));
    }
    afirmar("desde hace 121 días → «El rango máximo es de 120 días.» (P0001)", errores.rango121?.ok === false && errores.rango121?.estado === "P0001" && errores.rango121?.msg === "El rango máximo es de 120 días.", ver(errores.rango121));
    afirmar("los bordes pasan: 1 y 240 minutos, 120 días justos", errores.min1?.ok && errores.min240?.ok && errores.rango120?.ok, `${ver(errores.min1)} ${ver(errores.min240)} ${ver(errores.rango120)}`);
    afirmar("hasta antes que desde → cero filas, sin error", otras.AL_REVES === "0", `AL_REVES=${otras.AL_REVES}`);
    afirmar("hasta igual a desde → cero filas, sin error", otras.IGUALES === "0", `IGUALES=${otras.IGUALES}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T17 · rango [desde, hasta): el borde de hasta queda fuera, el de desde dentro; la venta posterior a hasta igual se mira",
  `select pg_temp.variante('ZZ-FRE-T17') as v \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _2 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '3 minutes') as _3 \\gset
select 'HASTA_BORDE|' || count(*) from retail.fn_bajadas_del_piso(:'ubic', :'t0'::timestamptz - interval '1 hour', :'t0'::timestamptz) r where r.variante_id = :'v';
select 'DESDE_BORDE|' || count(*) from retail.fn_bajadas_del_piso(:'ubic', :'t0'::timestamptz, :'t0'::timestamptz + interval '1 second') r where r.variante_id = :'v';
${FILAS(", p_desde => :'t0'::timestamptz - interval '1 hour', p_hasta => :'t0'::timestamptz + interval '1 minute'")}`,
  ({ filas, otras }) => {
    afirmar("hasta = la hora de la bajada → fuera (0 filas)", otras.HASTA_BORDE === "0", `HASTA_BORDE=${otras.HASTA_BORDE}`);
    afirmar("desde = la hora de la bajada → dentro (1 fila)", otras.DESDE_BORDE === "1", `DESDE_BORDE=${otras.DESDE_BORDE}`);
    afirmar("con hasta a 1 minuto, la venta de los 3 minutos igual cuenta (el libro llega hasta hoy)", es(filas["ZZ-FRE-T17"]?.[0], { pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia" }), ver(filas["ZZ-FRE-T17"]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T18 · LÍMITE CONOCIDO: una devolución entra al piso dentro de la ventana y después se vende 1 → la bajada sale tardía igual",
  `select pg_temp.variante('ZZ-FRE-T18') as v \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz) as _2 \\gset
-- Una clienta devuelve una unidad al piso a los 2 minutos; a los 3 se vende una, que pudo ser la devuelta.
select pg_temp.mov(:'v', 'entrada', 1, :'sp', 'devolucion', :'t0'::timestamptz + interval '2 minutes') as _3 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '3 minutes') as _4 \\gset
${FILAS()}`,
  ({ filas }) => {
    // Se afirma lo que HOY hace la fórmula, no lo deseable: mira el piso de antes y no lo que entró después de la
    // bajada. Descontar esas entradas cambia el contrato y lo decide el paso 3 (ADR-0208, LÍMITES). Si esta prueba
    // se pone roja, alguien cambió la fórmula: que sea a propósito y con el ADR al día.
    const f = filas["ZZ-FRE-T18"] ?? [];
    afirmar("comportamiento actual: piso_antes 0, vendidas 1 → 1 tardía y «tardia»", es(f[0], { min: 0, cantidad: 3, pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia" }), ver(f));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T19 · lo que llega de OTRA tienda directo al piso no es bajada, pero sí suma en piso_antes (criterio de fn_ledger_puntos)",
  `select id as otra from retail.ubicaciones where tipo = 'tienda' and activo and id <> :'ubic' order by nombre limit 1 \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'otra', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'otra' and tipo = 'almacen_tienda');
select id as otra_sa from retail.sububicaciones where ubicacion_id = :'otra' and tipo = 'almacen_tienda' \\gset
select pg_temp.variante('ZZ-FRE-T19') as v \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
-- La otra tienda recibe 4 y manda 2 directo al piso de esta ANTES de la bajada y 2 DESPUÉS: la fila es de la otra
-- tienda (ubicacion_id) y llega aquí por ubicacion_destino_id.
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
  values (:'v', :'otra', :'otra_sa', 'entrada', 4, 'recepcion', :'t0'::timestamptz - interval '90 minutes') returning id as e_otra \\gset
select retail.fn_aplicar_movimiento(:'e_otra') as _2 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  values (:'v', :'otra', :'otra_sa', :'ubic', :'sp', 'traslado', 2, 'transferencia', :'t0'::timestamptz - interval '30 minutes') returning id as t_antes \\gset
select retail.fn_aplicar_movimiento(:'t_antes') as _3 \\gset
select pg_temp.bajada(:'v', 1, :'t0'::timestamptz) as _4 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  values (:'v', :'otra', :'otra_sa', :'ubic', :'sp', 'traslado', 2, 'transferencia', :'t0'::timestamptz + interval '30 minutes') returning id as t_despues \\gset
select retail.fn_aplicar_movimiento(:'t_despues') as _5 \\gset
select 'PISO19|' || (select cantidad from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'sp');
${FILAS()}`,
  ({ filas, otras }) => {
    const f = filas["ZZ-FRE-T19"] ?? [];
    afirmar("una sola fila: lo que cruza de tienda no es bajada", f.length === 1, ver(f));
    // Antes de apoyarse en el libro salía 4: la llegada posterior estaba en el stock de hoy pero no se restaba.
    afirmar("piso_antes 2: cuenta la llegada de antes y descuenta la de después", es(f[0], { min: 0, cantidad: 1, pisoAntes: 2, estado: "normal" }), ver(f[0]));
    afirmar("el piso de hoy es 5 (2 + 1 bajada + 2): el libro cuadra", otras.PISO19 === "5", `PISO19=${otras.PISO19}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T20 · tienda inactiva → cero filas y sin error (el libro no reconstruye sedes inactivas)",
  `select pg_temp.variante('ZZ-FRE-T20') as v \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _2 \\gset
select 'ACTIVA|' || count(*) from retail.fn_bajadas_del_piso(:'ubic') r where r.variante_id = :'v';
update retail.ubicaciones set activo = false where id = :'ubic';
${probar("inactiva", ":'ubic'")}`,
  ({ errores, otras }) => {
    afirmar("activa: su bajada aparece", otras.ACTIVA === "1", `ACTIVA=${otras.ACTIVA}`);
    afirmar("inactiva: ok con 0 filas", errores.inactiva?.ok === true && errores.inactiva?.filas === 0, ver(errores.inactiva));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T21 · la venta se mide a la hora de la venta (coalesce(ventas.created_at, movimientos.created_at)), no a la de su salida",
  `select pg_temp.variante('ZZ-FRE-T21') as v \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _2 \\gset
-- La venta es de los 3 minutos; su salida del piso quedó en el libro a los 15 (fuera de la ventana de 10).
select pg_temp.venta_item(:'v', 1, :'t0'::timestamptz + interval '3 minutes') as li \\gset
select pg_temp.mov(:'v', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '15 minutes', null, :'li') as _3 \\gset
${FILAS()}`,
  ({ filas }) => {
    afirmar("cuenta por la hora de la venta: vendidas 1 → 1 tardía", es(filas["ZZ-FRE-T21"]?.[0], { pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia" }), ver(filas["ZZ-FRE-T21"]));
  },
);

// ---------------------------------------------------------------------------
const MD5 = (fn) => `(select md5(prosrc) from pg_proc where oid = to_regprocedure('retail.${fn}(uuid, timestamptz, timestamptz, integer)'))`;
const FIRMA = "(uuid, timestamptz, timestamptz, integer)";
const BORRAR_LAS_DOS = `drop function retail.fn_bajadas_del_piso${FIRMA}; drop function retail.fn_bajadas_del_piso_nucleo${FIRMA};`;
const CUANTAS = "(select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname like 'fn_bajadas_del_piso%')";
const intento = (sql) => `pg_temp.intento(${comoLiteral(sql)})`;
const abortaCon = (r, texto) => `((:'${r}')::jsonb ->> 'ok') || ',' || (position('${texto}' in (:'${r}')::jsonb ->> 'msg') > 0)`;
correr(
  "T22 · la guarda de 20260928120100: acepta solo el cuerpo de 20260926000300; un parche en vivo la hace abortar; después de la 120200, avisa y no deshace nada",
  `select ${MD5("fn_bajadas_del_piso")} as puerta_hoy, ${MD5("fn_bajadas_del_piso_nucleo")} as nucleo_hoy \\gset
-- 1. Pegada otra vez sobre la base de hoy (ya con la 120200): se niega con su aviso y no toca nada.
select ${intento(MIGRACION_NUCLEO)} as r1 \\gset
select 'TARDE|' || ${abortaCon("r1", "Ya está pegada la 20260928120200")} || ',' || (${MD5("fn_bajadas_del_piso")} = :'puerta_hoy')
       || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'nucleo_hoy');
-- 2. La cadena completa desde el cuerpo de 20260926000300 (el de producción): 0300 → 120100 → 120200, cada una pasa.
${BORRAR_LAS_DOS}
select ${intento(MIGRACION_0300)} ->> 'ok' as c1 \\gset
select ${MD5("fn_bajadas_del_piso")} as md5_0300 \\gset
select ${intento(MIGRACION_NUCLEO)} ->> 'ok' as c2 \\gset
select ${intento(MIGRACION_RETIROS)} ->> 'ok' as c3 \\gset
select 'CADENA|' || :'c1' || ',' || :'md5_0300' || ',' || :'c2' || ',' || :'c3' || ',' || (${MD5("fn_bajadas_del_piso")} = :'puerta_hoy')
       || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'nucleo_hoy') || ',' || ${CUANTAS};
-- 3. Alguien parcha la puerta vieja en vivo (el mismo contrato de la 0300, otro cuerpo): la 120100 se niega a pisarlo.
${BORRAR_LAS_DOS}
create function retail.fn_bajadas_del_piso(p_ubicacion_id uuid, p_desde timestamptz default null,
  p_hasta timestamptz default null, p_minutos integer default 10)
returns table (movimiento_id uuid, bajada_id uuid, variante_id uuid, persona_id uuid, bajada_en timestamptz, cantidad integer,
  piso_antes integer, vendidas_en_ventana integer, unidades_tardias integer, cerrada boolean, estado text)
language plpgsql stable security definer set search_path = retail, public, extensions as $f$
begin /* parche en vivo desconocido */ return; end $f$;
select ${MD5("fn_bajadas_del_piso")} as parche \\gset
select ${intento(MIGRACION_NUCLEO)} as r3 \\gset
select 'PARCHE|' || ${abortaCon("r3", "cambió desde que se escribió")} || ',' || (${MD5("fn_bajadas_del_piso")} = :'parche')
       || ',' || (to_regprocedure('retail.fn_bajadas_del_piso_nucleo${FIRMA}') is null);`,
  ({ otras }) => {
    afirmar("pegada después de la 120200: aborta con «Ya está pegada la 20260928120200» y no toca ninguna de las dos", otras.TARDE === "false,true,true,true", `TARDE=${otras.TARDE}`);
    afirmar(
      "la cadena 0300 → 120100 → 120200 pasa entera, la 0300 mide 91e2d0c1… (el md5 de producción) y termina igual que hoy",
      otras.CADENA === "true,91e2d0c19981952706c7b75d8514eb26,true,true,true,true,2",
      `CADENA=${otras.CADENA}`,
    );
    afirmar("con un parche en vivo aborta («cambió desde que se escribió»), no pisa el parche y no crea el núcleo", otras.PARCHE === "false,true,true,true", `PARCHE=${otras.PARCHE}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T23 · la guarda de 20260928120200: pegada dos veces deja lo mismo (y los permisos); un parche del núcleo o su falta la hacen abortar",
  `select ${MD5("fn_bajadas_del_piso")} as puerta_hoy, ${MD5("fn_bajadas_del_piso_nucleo")} as nucleo_hoy \\gset
select ${intento(MIGRACION_RETIROS)} ->> 'ok' as p1 \\gset
select ${intento(MIGRACION_RETIROS)} ->> 'ok' as p2 \\gset
select 'DOS|' || :'p1' || ',' || :'p2' || ',' || (${MD5("fn_bajadas_del_piso")} = :'puerta_hoy') || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'nucleo_hoy')
       || ',' || ${CUANTAS}
       || ',' || has_function_privilege('authenticated', 'retail.fn_bajadas_del_piso${FIRMA}', 'execute')
       || ',' || has_function_privilege('anon', 'retail.fn_bajadas_del_piso${FIRMA}', 'execute')
       || ',' || has_function_privilege('authenticated', 'retail.fn_bajadas_del_piso_nucleo${FIRMA}', 'execute');
-- Alguien parcha el núcleo en vivo (las mismas columnas, otro cuerpo).
create or replace function retail.fn_bajadas_del_piso_nucleo(p_ubicacion_id uuid, p_desde timestamptz default null,
  p_hasta timestamptz default null, p_minutos integer default 10)
returns table (movimiento_id uuid, bajada_id uuid, variante_id uuid, persona_id uuid, bajada_en timestamptz, cantidad integer,
  piso_antes integer, vendidas_en_ventana integer, unidades_tardias integer, cerrada boolean, estado text,
  retiradas_en_ventana integer, cantidad_efectiva integer, es_carga_inicial boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $f$
begin /* parche en vivo desconocido */ return; end $f$;
select ${MD5("fn_bajadas_del_piso_nucleo")} as parche \\gset
select ${intento(MIGRACION_RETIROS)} as r \\gset
select 'PARCHE|' || ${abortaCon("r", "cambiaron desde que se escribió")} || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'parche')
       || ',' || (${MD5("fn_bajadas_del_piso")} = :'puerta_hoy');
drop function retail.fn_bajadas_del_piso_nucleo${FIRMA};
select ${intento(MIGRACION_RETIROS)} as r2 \\gset
select 'SIN_NUCLEO|' || ${abortaCon("r2", "pega antes 20260928120100")};`,
  ({ otras }) => {
    afirmar(
      "pegada dos veces: pasan las dos, las dos funciones quedan iguales, authenticated ejecuta la puerta y no el núcleo, anon ninguna",
      otras.DOS === "true,true,true,true,2,true,false,false",
      `DOS=${otras.DOS}`,
    );
    afirmar("con un parche en vivo del núcleo aborta («cambiaron desde que se escribió») y no toca nada", otras.PARCHE === "false,true,true,true", `PARCHE=${otras.PARCHE}`);
    afirmar("sin el núcleo pide pegar antes la 20260928120100", otras.SIN_NUCLEO === "false,true", `SIN_NUCLEO=${otras.SIN_NUCLEO}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T24 · el ejemplo de ADR-0208 (c): piso 2; se retiran 2 por error; al minuto se reponen 2; a los 5 se vende 1 → «corregida», sin tardía",
  `select pg_temp.variante('ZZ-FRE-T24') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz - interval '30 minutes') as _2 \\gset
select pg_temp.mov(:'v', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz, :'sa') as _3 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz + interval '1 minute') as _4 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '5 minutes') as _5 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T24"] ?? [];
    afirmar("dos filas (el retiro no es bajada)", f.length === 2, ver(f));
    afirmar("la de hace 30 minutos no se toca: el retiro cae fuera de su ventana", es(f[0], { min: -30, cantidad: 2, pisoAntes: 0, retiradas: 0, efectiva: 2, estado: "normal" }), ver(f[0]));
    // Antes de 120200: piso_antes 0, vendidas 1 → 1 tardía y «tardia» (a quien corrigió).
    afirmar(
      "la re-bajada: piso_antes 2 (el de antes del retiro), retiradas 2, efectiva 0, 0 tardías, «corregida»",
      es(f[1], { min: 1, cantidad: 2, pisoAntes: 2, vendidas: 1, retiradas: 2, efectiva: 0, tardias: 0, estado: "corregida" }),
      ver(f[1]),
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T25 · retiro DESPUÉS: 10 escaneadas y 4 retiradas → efectiva 6; las tardías se topan por la efectiva; un retiro entre dos bajadas se descuenta de las dos",
  `select pg_temp.variante('ZZ-FRE-T25-DIEZ') as v \\gset
select pg_temp.variante('ZZ-FRE-T25-TOPE') as w \\gset
select pg_temp.variante('ZZ-FRE-T25-DOBLE') as x \\gset
select pg_temp.llega(:'v', 20, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'w', 20, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.llega(:'x', 20, :'t0'::timestamptz - interval '60 minutes') as _3 \\gset
-- 10 escaneadas; solo cupieron 6 y a los 5 minutos se retiran 4.
select pg_temp.bajada(:'v', 10, :'t0'::timestamptz) as _4 \\gset
select pg_temp.mov(:'v', 'traslado', 4, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '5 minutes', :'sa') as _5 \\gset
-- Tope: baja 3 (piso 0); una clienta devuelve 2 al piso; se retiran 2; se venden 3. Vendidas 3 − piso de antes 0 = 3,
-- pero la bajada solo dejó 1 colgada: 1 tardía (antes de 120200, 3).
select pg_temp.bajada(:'w', 3, :'t0'::timestamptz) as _6 \\gset
select pg_temp.mov(:'w', 'entrada', 2, :'sp', 'devolucion', :'t0'::timestamptz + interval '1 minute') as _7 \\gset
select pg_temp.mov(:'w', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '2 minutes', :'sa') as _8 \\gset
select pg_temp.vende(:'w', 3, :'t0'::timestamptz + interval '4 minutes') as _9 \\gset
-- LÍMITE CONOCIDO: baja 2, a los 2 minutos baja 3, al minuto siguiente se retiran 2, a los 5 se venden 3. El retiro cae
-- en la ventana de las dos y se descuenta de las dos: efectivas 0 y 1 (de verdad quedaron 3 colgadas de 5).
select pg_temp.bajada(:'x', 2, :'t0'::timestamptz) as _10 \\gset
select pg_temp.bajada(:'x', 3, :'t0'::timestamptz + interval '2 minutes') as _11 \\gset
select pg_temp.mov(:'x', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '3 minutes', :'sa') as _12 \\gset
select pg_temp.vende(:'x', 3, :'t0'::timestamptz + interval '5 minutes') as _13 \\gset
${FILAS()}`,
  ({ filas }) => {
    const d = filas["ZZ-FRE-T25-DIEZ"] ?? [];
    afirmar("10 escaneadas, 4 retiradas a los 5 minutos → efectiva 6, sin ventas: normal", d.length === 1 && es(d[0], { cantidad: 10, pisoAntes: 0, retiradas: 4, efectiva: 6, tardias: 0, estado: "normal" }), ver(d));
    const t = filas["ZZ-FRE-T25-TOPE"] ?? [];
    afirmar("tope: vendidas 3, piso_antes 0, efectiva 1 → 1 tardía (topada por la efectiva, no por la cantidad)", t.length === 1 && es(t[0], { cantidad: 3, pisoAntes: 0, vendidas: 3, retiradas: 2, efectiva: 1, tardias: 1, estado: "tardia" }), ver(t));
    const x = filas["ZZ-FRE-T25-DOBLE"] ?? [];
    afirmar(
      "doble descuento (límite): la primera retiradas 2 → efectiva 0, «corregida»; la segunda retiradas 2 → efectiva 1, piso_antes 2, 1 tardía",
      x.length === 2 && es(x[0], { min: 0, cantidad: 2, retiradas: 2, efectiva: 0, tardias: 0, estado: "corregida" }) &&
        es(x[1], { min: 2, cantidad: 3, pisoAntes: 2, vendidas: 3, retiradas: 2, efectiva: 1, tardias: 1, estado: "tardia" }),
      ver(x),
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T26 · la carga inicial: su entrada «carga_inicial» y su bajada en el mismo instante → es_carga_inicial; en otro instante o una bajada normal → no",
  `select pg_temp.variante('ZZ-FRE-T26-PUERTA') as vp \\gset
select pg_temp.variante('ZZ-FRE-T26-MANO') as vm \\gset
select pg_temp.variante('ZZ-FRE-T26-OTRA-HORA') as vo \\gset
select pg_temp.variante('ZZ-FRE-T26-NORMAL') as vn \\gset
-- La puerta real (ADR-0235): carga inicial colgada = entrada «carga_inicial» al almacén + bajar_al_piso, una transacción.
select retail.cargar_stock_inicial(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'vp', 'cantidad', 4)), null, true, gen_random_uuid()) as _1 \\gset
-- Como en T7: lo recién escrito tiene created_at = now() y la lectura va hasta now() sin incluirlo; se corre 1 minuto
-- atrás, las DOS filas igual (siguen en el mismo instante), por fuera de los disparadores y solo en esta transacción.
alter table retail.movimientos disable trigger movimientos_inmutables;
update retail.movimientos set created_at = created_at - interval '1 minute' where variante_id = :'vp';
alter table retail.movimientos enable always trigger movimientos_inmutables;
-- A mano, en el mismo instante: también es carga inicial.
select pg_temp.mov(:'vm', 'entrada', 3, :'sa', 'carga_inicial', :'t0'::timestamptz) as _2 \\gset
select pg_temp.bajada(:'vm', 3, :'t0'::timestamptz) as _3 \\gset
-- La carga entró 20 minutos antes y la bajada es aparte: no se marca.
select pg_temp.mov(:'vo', 'entrada', 3, :'sa', 'carga_inicial', :'t0'::timestamptz - interval '20 minutes') as _4 \\gset
select pg_temp.bajada(:'vo', 2, :'t0'::timestamptz) as _5 \\gset
-- Una recepción y su bajada en el mismo instante: no es carga inicial (el motivo manda).
select pg_temp.llega(:'vn', 3, :'t0'::timestamptz) as _6 \\gset
select pg_temp.bajada(:'vn', 2, :'t0'::timestamptz) as _7 \\gset
${FILAS()}`,
  ({ filas }) => {
    const p = filas["ZZ-FRE-T26-PUERTA"] ?? [];
    afirmar("cargar_stock_inicial con p_al_piso → una bajada con su documento, es_carga_inicial", p.length === 1 && p[0].bajadaId !== null && es(p[0], { cantidad: 4, carga: true }), ver(p));
    afirmar("a mano en el mismo instante → es_carga_inicial", es(filas["ZZ-FRE-T26-MANO"]?.[0], { cantidad: 3, carga: true }), ver(filas["ZZ-FRE-T26-MANO"]));
    afirmar("carga 20 minutos antes y bajada aparte → no", es(filas["ZZ-FRE-T26-OTRA-HORA"]?.[0], { cantidad: 2, carga: false }), ver(filas["ZZ-FRE-T26-OTRA-HORA"]));
    afirmar("recepción + bajada en el mismo instante → no", es(filas["ZZ-FRE-T26-NORMAL"]?.[0], { cantidad: 2, carga: false }), ver(filas["ZZ-FRE-T26-NORMAL"]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T27 · borde del rango: la bajada del primer minuto ve su piso de antes y el retiro previo aunque caigan antes de p_desde",
  `select pg_temp.variante('ZZ-FRE-T27') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz - interval '30 minutes') as _2 \\gset
select pg_temp.mov(:'v', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '5 minutes', :'sa') as _3 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _4 \\gset
${FILAS(", p_desde => :'t0'::timestamptz - interval '1 minute'").replace("'R|' || v.sku", "'R|' || v.sku || '-BORDE'")}
${FILAS()}`,
  ({ filas }) => {
    const borde = filas["ZZ-FRE-T27-BORDE"] ?? [];
    const todo = (filas["ZZ-FRE-T27"] ?? []).filter((x) => x.min === 0);
    afirmar("desde 1 minuto antes: solo la bajada de t0, piso_antes 2, retiradas 2, «corregida»", borde.length === 1 && es(borde[0], { min: 0, pisoAntes: 2, retiradas: 2, efectiva: 0, estado: "corregida" }), ver(borde));
    afirmar("la misma fila que con el rango de 30 días", todo.length === 1 && es(borde[0], { pisoAntes: todo[0].pisoAntes, retiradas: todo[0].retiradas, efectiva: todo[0].efectiva, estado: todo[0].estado }), `${ver(borde)} ${ver(todo)}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T28 · la misma hora exacta: cuenta lo que el libro ordena antes de la bajada (por id), nunca lo de después",
  `select pg_temp.variante('ZZ-FRE-T28-DESPUES') as v \\gset
select pg_temp.variante('ZZ-FRE-T28-ANTES') as w \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'w', 10, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.mov(:'w', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _3 \\gset
-- V: piso 0; a la MISMA hora, la bajada de 3 (id bajo: el libro la pone primero) y una venta de 1 (id alto: después).
-- El nivel más alto de antes es 0, no el 3 que dejó la propia bajada: la venta de esa hora es tardía.
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('00000000-0000-4000-8000-00000000f281', :'v', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 3, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('00000000-0000-4000-8000-00000000f281') as _4 \\gset
select pg_temp.venta_item(:'v', 1, :'t0'::timestamptz) as li_v \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, created_at)
  values ('ffffffff-ffff-4fff-bfff-00000000f282', :'v', :'ubic', :'sp', 'salida', 1, 'venta', :'li_v', :'t0');
select retail.fn_aplicar_movimiento('ffffffff-ffff-4fff-bfff-00000000f282') as _5 \\gset
-- W: piso 2; a la MISMA hora, una venta de 2 (id bajo: primero) y la bajada de 1 (id alto: después). El nivel más alto
-- de antes es 2 (el de antes de esa venta).
select pg_temp.venta_item(:'w', 2, :'t0'::timestamptz) as li_w \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, created_at)
  values ('00000000-0000-4000-8000-00000000f283', :'w', :'ubic', :'sp', 'salida', 2, 'venta', :'li_w', :'t0');
select retail.fn_aplicar_movimiento('00000000-0000-4000-8000-00000000f283') as _6 \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('ffffffff-ffff-4fff-bfff-00000000f284', :'w', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 1, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('ffffffff-ffff-4fff-bfff-00000000f284') as _7 \\gset
${FILAS()}`,
  ({ filas }) => {
    afirmar(
      "lo de después (la venta de la misma hora) no sube el piso de antes: piso_antes 0, vendidas 1 → 1 tardía",
      es(filas["ZZ-FRE-T28-DESPUES"]?.[0], { cantidad: 3, pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia" }),
      ver(filas["ZZ-FRE-T28-DESPUES"]),
    );
    afirmar(
      "lo de antes (la venta de la misma hora, primero en el libro) sí cuenta: piso_antes 2 (el nivel justo antes era 0)",
      es(filas["ZZ-FRE-T28-ANTES"]?.[0], { cantidad: 1, pisoAntes: 2, vendidas: 2, tardias: 0, estado: "normal" }),
      ver(filas["ZZ-FRE-T28-ANTES"]),
    );
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);

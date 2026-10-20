#!/usr/bin/env node
/**
 * Pruebas de GANAR puntos al cobrar (actividad 2 de 12; migración `20261019202000_club_puntos_ganar.sql`, sobre la base de
 * `20261019201000_club_puntos_base.sql`).
 *
 * EL PROBLEMA. Cada compra de una MIEMBRO suma 1 punto por S/ 1 que paga de verdad; en el mes de su cumpleaños la primera suma
 * además 100 de regalo; si la venta se anula o se devuelve algo, los puntos se restan; y nada de esto puede tumbar una venta, una
 * anulación o una devolución. La base lo hace cumplir (la caja no manda ni calcula puntos).
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`; cuentas del
 * seed: Felipe, líder y Admin):
 *   a. Una venta de una miembro suma sus puntos (79.90 → 79, bloques enteros) y queda ligada a la venta; el saldo guardado es la
 *      suma de los movimientos.
 *   b. Suman lo que PAGA: con descuento en la línea, con cantidad 2 y con dos líneas.
 *   c. Quién NO suma: una ficha «Identificado» (sin club) y una venta sin clienta; en los dos la venta se hace igual.
 *   d. El mes del cumpleaños: la primera compra suma el regalo (100); la segunda, solo la compra; en otro mes, no hay regalo.
 *   e. La configuración del DÍA DE LA VENTA manda: con 2 puntos por sol, 79.90 → 159.
 *   f. Anular la venta resta sus puntos (reversa enlazada a la compra) y el regalo de cumpleaños; el regalo se puede volver a dar
 *      con otra compra del año; conciliar dos veces no quita dos veces.
 *   g. Una devolución parcial resta lo devuelto (2 unidades, se devuelve 1: 159 → 79); entera, deja 0.
 *   h. El saldo NUNCA queda negativo: si la miembro ya gastó los puntos, anular quita solo lo que tiene y no falla.
 *   i. El mismo token no suma dos veces (una venta, un movimiento de compra).
 *   j. Si sumar puntos falla, la VENTA sigue; si restarlos falla, la ANULACIÓN sigue (con un aviso, no un error).
 *   k. Estructura: `registrar_venta` llama a `fn_club_puntos_por_venta` una sola vez; los tres disparadores existen; la API no
 *      llama a las funciones internas.
 *
 * USO
 *   pnpm pruebas:club-puntos-ganar                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-puntos-ganar --base cayla_x    → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin
const RV_HOY = "retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const FUNCIONES_DE_PRUEBA = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else v_msg end;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated, anon;

-- Vende las líneas y paga exactamente su total (Σ (precio − descuento) × cantidad). Devuelve el id de la venta o «ERROR|hint».
create function pg_temp.vender(p_ubic uuid, p_items jsonb, p_clienta uuid, p_token uuid) returns text language plpgsql as $f$
declare v_id uuid; v_estado text; v_msg text; v_hint text; v_total numeric;
begin
  v_total := (select sum(((e ->> 'precio_unitario')::numeric - coalesce((e ->> 'descuento_unitario')::numeric, 0)) * (e ->> 'cantidad')::integer)
                from jsonb_array_elements(p_items) e);
  v_id := retail.registrar_venta(
    p_ubicacion_id => p_ubic, p_items => p_items,
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', v_total)),
    p_cliente_id => p_clienta, p_token => p_token);
  return v_id::text;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return 'ERROR|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else v_estado || '|' || v_msg end;
end;
$f$;
grant execute on function pg_temp.vender(uuid, jsonb, uuid, uuid) to authenticated;

-- Una ficha de prueba: miembro del club o solo «Identificado». p_cumple_mes: el mes de su cumpleaños (null = sin).
create function pg_temp.ficha(p_dni text, p_miembro boolean, p_cumple_mes integer default null) returns uuid language plpgsql as $f$
declare v uuid;
begin
  if p_miembro then
    insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club, registro_origen, cumple_dia, cumple_mes)
    values ('dni', p_dni, 'MIEMBRO PUNTOS PRUEBA', '9' || substr(p_dni, 1, 8), now(), retail.fn_club_codigo_nuevo(), 'caja',
            case when p_cumple_mes is null then null else 10 end, p_cumple_mes) returning id into v;
  else
    insert into retail.clientas (documento_tipo, documento_numero, nombre, registro_origen)
    values ('dni', p_dni, 'IDENTIFICADA PUNTOS PRUEBA', 'caja') returning id into v;
  end if;
  return v;
end;
$f$;

-- Devuelve p_cant unidades de cada línea de la venta (devolución aprobada, insertada ya aprobada con sus líneas después).
create function pg_temp.devolver(p_venta uuid, p_cant integer) returns void language sql as $f$
  with d as (
    insert into retail.devoluciones (venta_id, ubicacion_id, estado, motivo, aprobado_en)
    select p_venta, v.ubicacion_id, 'aprobada', 'prueba', now() from retail.ventas v where v.id = p_venta
    returning id
  )
  insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion)
  select d.id, vi.id, p_cant, 'vendible' from d, retail.venta_items vi where vi.venta_id = p_venta;
$f$;
`;

const PRELUDIO_BASE = `
begin;
set local search_path = retail, public, extensions;
${FUNCIONES_DE_PRUEBA}
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select (now() at time zone 'America/Lima')::date as hoy, extract(month from (now() at time zone 'America/Lima'))::int as mes_hoy, extract(year from (now() at time zone 'America/Lima'))::int as anio_hoy \\gset
`;
const PRELUDIO = `${PRELUDIO_BASE}update retail.configuracion_empresa set exige_responsable = false;\n`;

const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;

/** Una sede lista para vender: piso, su caja abierta y 100 unidades de tres prendas (v1 = BLU-EMMA-NEG-M a 79.90). Deja :ubic, :v1, :v2. */
const SEDE = (nombre = "Tienda Lima") => `reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select id as ubic from retail.ubicaciones where nombre = '${nombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba club_puntos_ganar') as caja_id \\gset
select id as v1 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v2 from retail.variantes where sku = 'BLU-EMMA-BEI-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
with m as (
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select v, :'ubic', :'sub_piso', 'entrada', 100, 'colchón de prueba' from unnest(array[:'v1', :'v2']::uuid[]) v
  returning id)
select count(retail.fn_aplicar_movimiento(m.id)) as _mov from m \\gset
update retail.variantes set precio = 45.00 where id = :'v2';
`;

/** Una línea de p_items: v1 al precio de catálogo (79.90), con descuento y cantidad opcionales. */
const item = ({ v = ":'v1'", precio = 79.9, desc = 0, cant = 1 } = {}) =>
  `jsonb_build_object('variante_id', ${v}, 'cantidad', ${cant}, 'precio_unitario', ${precio.toFixed(2)}::numeric, 'descuento_unitario', ${desc.toFixed(2)}` +
  (desc > 0 ? `, 'motivo_descuento', 'cerrar_venta'` : "") + ")";
const items = (...xs) => `jsonb_build_array(${xs.join(", ")})`;
const VENDER = (alias, { lineas, clienta = "null", token = "gen_random_uuid()" }) =>
  `select pg_temp.vender(:'ubic', ${lineas}, ${clienta}, ${token}) as ${alias} \\gset\n`;
/** Lo que dice la miembro de sus puntos: saldo guardado | saldo recalculado. */
const SALDO = (f) => `retail.fn_club_puntos_saldo(${f}) || '|' || retail.fn_club_puntos_saldo_calculado(${f})`;

let fallas = 0;
let casos = 0;
function registrar(nombre, bien, obtenido, esperadoTexto) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${String(esperadoTexto).split("\n").join("\n              ")}\n    obtenido: ${String(obtenido).split("\n").join("\n              ")}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  registrar(nombre, bien, obtenido, typeof esperado === "function" ? "(condición)" : esperado);
}

try {
  execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"], { stdio: "ignore" });
} catch {
  console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
  process.exit(1);
}

// a. Una venta de una miembro suma sus puntos
caso(
  "(a) una venta de una miembro suma sus puntos: 79.90 → 79 (bloques enteros), ligados a la venta; saldo guardado = recalculado",
  SEDE() + `reset role;\nselect pg_temp.ficha('79100001', true) as f \\gset\n` + como(FELIPE) +
    VENDER("venta", { lineas: items(item()), clienta: ":'f'" }) +
    `reset role;
select ${SALDO(":'f'")}, (select count(*) from retail.club_puntos_movimientos where clienta_id = :'f' and tipo = 'compra' and venta_id::text = :'venta' and puntos = 79);`,
  "79|79|1"
);

// b. Suman lo que paga
caso(
  "(b) suman lo que PAGA: con S/ 10 de descuento en la línea → 69; 2 unidades → 159; 2 unidades + otra línea de S/ 45 → 204",
  SEDE() + `reset role;
select pg_temp.ficha('79100002', true) as f1 \\gset
select pg_temp.ficha('79100003', true) as f2 \\gset
select pg_temp.ficha('79100004', true) as f3 \\gset
` + como(FELIPE) +
    VENDER("s1", { lineas: items(item({ desc: 10 })), clienta: ":'f1'" }) +
    VENDER("s2", { lineas: items(item({ cant: 2 })), clienta: ":'f2'" }) +
    VENDER("s3", { lineas: items(item({ cant: 2 }), item({ v: ":'v2'", precio: 45 })), clienta: ":'f3'" }) +
    `reset role;
select retail.fn_club_puntos_saldo(:'f1') || '|' || retail.fn_club_puntos_saldo(:'f2') || '|' || retail.fn_club_puntos_saldo(:'f3');`,
  "69|159|204"
);

// c. Quién no suma
caso(
  "(c) una ficha «Identificado» (sin club) y una venta sin clienta NO suman puntos, y la venta se hace igual",
  SEDE() + `reset role;\nselect pg_temp.ficha('79100005', false) as f \\gset\n` + como(FELIPE) +
    VENDER("s1", { lineas: items(item()), clienta: ":'f'" }) +
    VENDER("s2", { lineas: items(item()) }) +
    `reset role;
select (:'s1' !~ '^ERROR') and (:'s2' !~ '^ERROR'), (select count(*) from retail.club_puntos_movimientos where venta_id::text in (:'s1', :'s2')), (select count(*) from retail.ventas where id::text in (:'s1', :'s2'));`,
  "t|0|2"
);

// d. El mes del cumpleaños
caso(
  "(d) en el mes de su cumpleaños la primera compra suma el regalo (+100); la segunda, solo la compra; en otro mes no hay regalo",
  SEDE() + `reset role;
select pg_temp.ficha('79100006', true, :'mes_hoy') as f \\gset
select pg_temp.ficha('79100007', true, case when :'mes_hoy' = 12 then 1 else :'mes_hoy' + 1 end) as otro \\gset
` + como(FELIPE) +
    VENDER("s1", { lineas: items(item()), clienta: ":'f'" }) +
    VENDER("s2", { lineas: items(item()), clienta: ":'f'" }) +
    VENDER("s3", { lineas: items(item()), clienta: ":'otro'" }) +
    `reset role;
select ${SALDO(":'f'")} || '|' || (select count(*) from retail.club_puntos_movimientos where clienta_id = :'f' and tipo = 'cumple') || '|' || retail.fn_club_puntos_saldo(:'otro');`,
  "258|258|1|79"
);

// e. La configuración del día de la venta
caso(
  "(e) manda la configuración del día de la venta: con 2 puntos por sol, 79.90 → 159",
  SEDE() + `reset role;
insert into retail.club_puntos_config (vigente_desde, puntos_por_sol, soles_por_100, canje_minimo_puntos, compra_minima_x, vigencia_cupon_dias, regalo_cumple_puntos, tope_costo_pct)
  values (:'hoy', 2, 5, 200, 3, 7, 100, 2);
select pg_temp.ficha('79100008', true) as f \\gset
` + como(FELIPE) +
    VENDER("s1", { lineas: items(item()), clienta: ":'f'" }) +
    `reset role;\nselect retail.fn_club_puntos_saldo(:'f');`,
  "159"
);

// f. Anular
caso(
  "(f) anular la venta resta sus puntos y el regalo (reversas enlazadas); el regalo se vuelve a dar con otra compra; conciliar dos veces no quita dos veces",
  SEDE() + `reset role;\nselect pg_temp.ficha('79100009', true, :'mes_hoy') as f \\gset\n` + como(FELIPE) +
    VENDER("venta", { lineas: items(item()), clienta: ":'f'" }) +
    `reset role;
select id as item from retail.venta_items where venta_id::text = :'venta' \\gset
select ${SALDO(":'f'")} as antes \\gset
` + como(FELIPE) +
    `select retail.anular_venta(:'venta', 'prueba club_puntos_ganar', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'condicion', 'vendible'))) as _an \\gset
reset role;
select retail.fn_club_puntos_conciliar_venta(:'venta') as _c2 \\gset
select ${SALDO(":'f'")} as despues \\gset
select count(*) as reversas from retail.club_puntos_movimientos where clienta_id = :'f' and tipo = 'revierte' \\gset
` + como(FELIPE) +
    VENDER("otra", { lineas: items(item()), clienta: ":'f'" }) +
    `reset role;
select :'antes' || ' > ' || :'despues' || ' > ' || :'reversas' || ' > ' || ${SALDO(":'f'")};`,
  "179|179 > 0|0 > 2 > 179|179"
);

// g. Devolución
caso(
  "(g) una devolución parcial resta lo devuelto (2 unidades, se devuelve 1: 159 → 79); devolver todo deja 0",
  SEDE() + `reset role;\nselect pg_temp.ficha('79100010', true) as f \\gset\n` + como(FELIPE) +
    VENDER("venta", { lineas: items(item({ cant: 2 })), clienta: ":'f'" }) +
    `reset role;
select retail.fn_club_puntos_saldo(:'f') as a \\gset
select pg_temp.devolver(:'venta'::uuid, 1) as _d1;
select retail.fn_club_puntos_saldo(:'f') as b \\gset
update retail.devolucion_items set cantidad = 2 where devolucion_id in (select id from retail.devoluciones where venta_id::text = :'venta');
select retail.fn_club_puntos_conciliar_venta(:'venta') as _c \\gset
select :'a' || '>' || :'b' || '>' || ${SALDO(":'f'")};`,
  "159>79>0|0"
);

// h. Nunca negativo
caso(
  "(h) el saldo NUNCA queda negativo: si ya gastó los puntos, anular quita solo lo que tiene y no falla",
  SEDE() + `reset role;\nselect pg_temp.ficha('79100011', true) as f \\gset\n` + como(FELIPE) +
    VENDER("venta", { lineas: items(item()), clienta: ":'f'" }) +
    `reset role;
select retail.fn_club_puntos_anotar(:'f', 'canje', -70, null, null, 'prueba') as _g \\gset
select id as item from retail.venta_items where venta_id::text = :'venta' \\gset
` + como(FELIPE) +
    `select pg_temp.intento(format($q$select retail.anular_venta(%L::uuid, 'prueba', jsonb_build_array(jsonb_build_object('venta_item_id', %L, 'condicion', 'vendible')))$q$, :'venta', :'item')) as an \\gset
reset role;
select :'an' || '|' || ${SALDO(":'f'")} || '|' || (select estado from retail.ventas where id::text = :'venta');`,
  "SIN_ERROR|0|0|anulada"
);

// i. El mismo token no suma dos veces
caso(
  "(i) el mismo token no suma dos veces: la segunda llamada devuelve la misma venta y hay UN movimiento de compra",
  SEDE() + `reset role;\nselect pg_temp.ficha('79100012', true) as f \\gset\nselect gen_random_uuid() as tk \\gset\n` + como(FELIPE) +
    VENDER("s1", { lineas: items(item()), clienta: ":'f'", token: ":'tk'" }) +
    VENDER("s2", { lineas: items(item()), clienta: ":'f'", token: ":'tk'" }) +
    `reset role;
select (:'s1' = :'s2') || '|' || ${SALDO(":'f'")} || '|' || (select count(*) from retail.club_puntos_movimientos where clienta_id = :'f' and tipo = 'compra');`,
  "true|79|79|1"
);

// j. Sumar o restar no tumba nada
caso(
  "(j1) si sumar puntos falla, la VENTA sigue (con un aviso, no un error)",
  SEDE() + `reset role;\nselect pg_temp.ficha('79100013', true) as f \\gset
create or replace function retail.fn_club_puntos_por_venta(p_venta_id uuid) returns void language plpgsql as $$ begin raise exception 'se rompió a propósito'; end $$;
` + como(FELIPE) +
    VENDER("s1", { lineas: items(item()), clienta: ":'f'" }) +
    `reset role;\nselect (:'s1' !~ '^ERROR') || '|' || (select count(*) from retail.ventas where id::text = :'s1') || '|' || retail.fn_club_puntos_saldo(:'f');`,
  "true|1|0"
);
caso(
  "(j2) si restar puntos falla, la ANULACIÓN sigue",
  SEDE() + `reset role;\nselect pg_temp.ficha('79100014', true) as f \\gset\n` + como(FELIPE) +
    VENDER("venta", { lineas: items(item()), clienta: ":'f'" }) +
    `reset role;
select id as item from retail.venta_items where venta_id::text = :'venta' \\gset
create or replace function retail.fn_club_puntos_conciliar_venta(p_venta_id uuid) returns void language plpgsql as $$ begin raise exception 'se rompió a propósito'; end $$;
` + como(FELIPE) +
    `select pg_temp.intento(format($q$select retail.anular_venta(%L::uuid, 'prueba', jsonb_build_array(jsonb_build_object('venta_item_id', %L, 'condicion', 'vendible')))$q$, :'venta', :'item')) as an \\gset
reset role;
select :'an' || '|' || (select estado from retail.ventas where id::text = :'venta');`,
  "SIN_ERROR|anulada"
);

// k. Estructura
caso(
  "(k) registrar_venta llama a fn_club_puntos_por_venta UNA vez; existen los tres disparadores; la API no llama a las funciones internas",
  `select (length(pg_get_functiondef('${RV_HOY}'::regprocedure)) - length(replace(pg_get_functiondef('${RV_HOY}'::regprocedure), 'fn_club_puntos_por_venta', ''))) / length('fn_club_puntos_por_venta') as llamadas \\gset
select count(*) as discs from pg_trigger where not tgisinternal and tgname in ('trg_club_puntos_al_anular_venta', 'trg_club_puntos_al_aprobar_devolucion', 'trg_club_puntos_al_devolver_linea') \\gset
` + como(FELIPE) +
    `select :'llamadas' || '|' || :'discs' || '|' || substr(pg_temp.intento($q$select retail.fn_club_puntos_por_venta(gen_random_uuid())$q$), 1, 5) || '|' || substr(pg_temp.intento($q$select retail.fn_club_puntos_conciliar_venta(gen_random_uuid())$q$), 1, 5);`,
  "1|3|42501|42501"
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

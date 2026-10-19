#!/usr/bin/env node
/**
 * Pruebas de COBRAR CON CUPÓN (actividad 4 de 12; migración `20261019204000_club_puntos_cobrar_con_cupon.sql`).
 *
 * EL PROBLEMA. La caja cobra con el CÓDIGO de un cupón: el descuento se reparte por prenda (la boleta lleva el de cada línea), el
 * cupón se gasta UNA vez aunque dos cajas lo intenten a la vez, lo puede usar cualquiera (al portador) y, si la venta se anula,
 * vuelve a vivir. Es dinero y boleta: la base lo hace cumplir, la caja no manda el monto (manda el código y el reparto, y la base
 * rechaza cualquier otro).
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`):
 *   a. Una venta con cupón de S/ 30: la caja paga el total menos 30, las líneas guardan la parte del cupón (Σ = 30.00) y el cupón
 *      queda USADO con su venta.
 *   b. La regla del reparto, `fn_club_repartir_vale`, igual a la de la web (la tabla de ejemplos y 300 casos al azar contra una
 *      réplica en JS de `repartirVale`), exacta al céntimo.
 *   c. Los rechazos, sin dejar venta ni gastar el cupón: no existe, ya usado, vencido, compra por debajo del mínimo, un reparto
 *      distinto del de la base, un cupón sin su parte en las líneas, y el cupón junto al cumpleaños.
 *   d. Al portador: lo usa una compra con OTRA ficha (los puntos son de ella, no de la dueña) y una compra SIN ficha.
 *   e. Anular la venta devuelve el cupón (vuelve a vivir y se puede usar otra vez); si ya pasó su fecha, vence y devuelve sus puntos.
 *   f. El mismo token no gasta dos veces: devuelve la misma venta, no «ya usado».
 *   g. `validar_cupon`: ok (valor, vencimiento, nombre de pila de la dueña y nada más), no existe, usado, vencido, por debajo del
 *      mínimo (cuánto falta) y el bloqueo a los 5 códigos que no existen; solo con el módulo Vender o Clientes.
 *   h. Estructura: `registrar_venta` lleva los trozos del cupón y su firma NO cambió (18 parámetros).
 *   i. Con BASE_DESECHABLE=1 (commitea): dos cajas cobran A LA VEZ con el mismo cupón → pasa una y la otra recibe `cupon_ya_usado`.
 *
 * USO
 *   pnpm pruebas:club-puntos-cobrar-cupon                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-puntos-cobrar-cupon --base cayla_x    → contra otra base del mismo contenedor
 *   BASE_DESECHABLE=1 pnpm pruebas:club-puntos-cobrar-cupon → además (i), que commitea: SOLO contra un Postgres desechable
 */

import { execFileSync, spawn } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo
const RV_HOY = "retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
function psqlEnParalelo(sql) {
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS_PSQL, { stdio: ["pipe", "pipe", "pipe"] });
    let salida = "";
    let error = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (error += d));
    p.on("close", (codigo) => resolve({ ok: codigo === 0, salida: salida.trim(), mensaje: error }));
    p.stdin.end(sql);
  });
}

/**
 * La regla del reparto, en JS: una RÉPLICA de `repartirVale` (apps/web/lib/club-aniversario-canje-reglas.ts). Todo en céntimos
 * enteros. Devuelve la parte del monto por unidad de cada línea, en soles.
 */
function repartirVale(lineas, monto) {
  const netos = lineas.map((l) => Math.max(0, Math.round(l.precio * 100) - Math.round(l.descuento * 100)));
  const cants = lineas.map((l) => Math.max(0, Math.trunc(l.cantidad)));
  const total = netos.reduce((a, n, k) => a + n * cants[k], 0);
  if (total <= 0) return lineas.map(() => 0);
  const vale = Math.min(Math.max(0, Math.round(monto * 100)), total);
  const partes = netos.map((n) => (vale * n - ((vale * n) % total)) / total);
  let resto = vale - partes.reduce((a, u, k) => a + u * cants[k], 0);
  const orden = netos.map((n, k) => ({ k, f: (vale * n) % total })).sort((a, b) => b.f - a.f || a.k - b.k);
  let sumo = true;
  while (resto > 0 && sumo) {
    sumo = false;
    for (const { k } of orden) {
      const q = cants[k];
      if (q === 0 || q > resto || partes[k] >= netos[k]) continue;
      partes[k] += 1;
      resto -= q;
      sumo = true;
      if (resto === 0) break;
    }
  }
  return partes.map((u) => u / 100);
}
// [monto, líneas [precio, descuento sin club, cantidad], lo que reparte por unidad en cada línea]
const EJEMPLOS = [
  [20, [[79.9, 0, 1]], [20.0]],
  [30, [[79.9, 0, 1], [40.1, 0, 1]], [19.98, 10.02]],
  [20, [[79.9, 0, 1], [45.0, 0, 1]], [12.79, 7.21]],
  [20, [[10.0, 0, 3]], [6.66]],
  [50, [[79.9, 0, 2], [45.0, 0, 3]], [13.55, 7.63]],
  [30, [[79.9, 7.99, 2], [45.0, 0, 1]], [11.42, 7.16]],
];

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

-- Reparte p_valor entre las líneas como lo hace la caja: suma la parte a descuento_unitario y la guarda en descuento_club_unitario.
create function pg_temp.con_cupon(p_items jsonb, p_valor numeric) returns jsonb language sql as $f$
  select jsonb_agg(o.e || jsonb_build_object('descuento_unitario', coalesce((o.e ->> 'descuento_unitario')::numeric, 0) + p.parte,
                                              'descuento_club_unitario', p.parte) order by o.ord)
    from jsonb_array_elements(p_items) with ordinality o(e, ord)
    join unnest(retail.fn_club_repartir_vale(p_items, p_valor)) with ordinality p(parte, ord) on p.ord = o.ord
$f$;

-- Vende las líneas y paga exactamente su total (Σ (precio − descuento) × cantidad). Devuelve el id de la venta o «ERROR|hint».
create function pg_temp.vender(p_ubic uuid, p_items jsonb, p_clienta uuid, p_codigo text, p_token uuid, p_cumple boolean default false) returns text
language plpgsql as $f$
declare v_id uuid; v_estado text; v_msg text; v_hint text; v_total numeric;
begin
  v_total := (select sum(((e ->> 'precio_unitario')::numeric - coalesce((e ->> 'descuento_unitario')::numeric, 0)) * (e ->> 'cantidad')::integer)
                from jsonb_array_elements(p_items) e);
  v_id := retail.registrar_venta(
    p_ubicacion_id => p_ubic, p_items => p_items,
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', v_total)),
    p_cliente_id => p_clienta, p_token => p_token, p_codigo_descuento => p_codigo, p_canjear_cumpleanos => p_cumple);
  return v_id::text;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return 'ERROR|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else v_estado || '|' || v_msg end;
end;
$f$;
grant execute on function pg_temp.vender(uuid, jsonb, uuid, text, uuid, boolean) to authenticated;

-- Una ficha de prueba: miembro del club con p_saldo puntos.
create function pg_temp.ficha(p_dni text, p_saldo integer) returns uuid language plpgsql as $f$
declare v uuid;
begin
  insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club, registro_origen)
  values ('dni', p_dni, 'LUCIA PAREDES PRUEBA', '9' || substr(p_dni, 1, 8), now(), retail.fn_club_codigo_nuevo(), 'caja') returning id into v;
  if p_saldo > 0 then
    perform retail.fn_club_puntos_anotar(v, 'compra', p_saldo, null, null, 'prueba');
  end if;
  return v;
end;
$f$;
`;

const PRELUDIO_BASE = `
begin;
set local search_path = retail, public, extensions;
${FUNCIONES_DE_PRUEBA}
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select (now() at time zone 'America/Lima')::date as hoy \\gset
`;
const PRELUDIO = `${PRELUDIO_BASE}update retail.configuracion_empresa set exige_responsable = false;\n`;

const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;

/** Una sede lista para vender (v1 = BLU-EMMA-NEG-M a 79.90; v2 a 45.00). Deja :ubic, :v1, :v2. */
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
select retail.abrir_caja(:'ubic', 100.00, 'prueba club_puntos_cobrar_cupon') as caja_id \\gset
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

/** Una línea de p_items. */
const item = ({ v = ":'v1'", precio = 79.9, desc = 0, cant = 1 } = {}) =>
  `jsonb_build_object('variante_id', ${v}, 'cantidad', ${cant}, 'precio_unitario', ${precio.toFixed(2)}::numeric, 'descuento_unitario', ${desc.toFixed(2)})`;
const items = (...xs) => `jsonb_build_array(${xs.join(", ")})`;
/** Dos prendas (79.90 + 45.00 = 124.90): la compra normal de los casos. */
const DOS = items(item(), item({ v: ":'v2'", precio: 45 }));
const VENDER = (alias, { lineas, clienta = "null", codigo = "null", token = "gen_random_uuid()", cumple = "false" }) =>
  `select pg_temp.vender(:'ubic', ${lineas}, ${clienta}, ${codigo}, ${token}, ${cumple}) as ${alias} \\gset\n`;
/** La dueña con su cupón de S/ 30 (600 puntos): deja :dueña, :codigo. */
const CON_CUPON = (dni = "79400001", valor = 600, d = "duena", c = "codigo") => `reset role;
select pg_temp.ficha('${dni}', 1000) as ${d} \\gset
${como(FELIPE)}select (retail.canjear_puntos(:'${d}', ${valor}))::jsonb ->> 'codigo' as ${c} \\gset
reset role;
`;
const VENCER_DE = (c = "codigo") => `alter table retail.club_cupones disable trigger trg_club_cupones_guardas;
update retail.club_cupones set vence_el = :'hoy'::date - 1 where codigo = :'${c}';
alter table retail.club_cupones enable trigger trg_club_cupones_guardas;
`;
const VENCER = VENCER_DE();

let casos = 0;
let fallas = 0;
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

// ---------------------------------------------------------------- a. Una venta con cupón
caso(
  "(a) una venta con cupón de S/ 30: se paga el total menos 30, las líneas guardan la parte del cupón (Σ 30.00) y el cupón queda USADO con su venta",
  SEDE() + CON_CUPON() + como(FELIPE) +
    `select pg_temp.con_cupon(${DOS}, 30) as lineas \\gset\n` +
    VENDER("venta", { lineas: ":'lineas'::jsonb", codigo: ":'codigo'" }) +
    `reset role;
select concat_ws('|', :'venta' !~ '^ERROR',
  (select round(sum(subtotal), 2) from retail.venta_items where venta_id::text = :'venta'),
  (select round(sum(descuento_club_unitario * cantidad), 2) from retail.venta_items where venta_id::text = :'venta'),
  (select estado from retail.club_cupones where codigo = :'codigo'),
  (select venta_id::text = :'venta' and usado_en is not null from retail.club_cupones where codigo = :'codigo'));`,
  "t|94.90|30.00|usado|t"
);

// ---------------------------------------------------------------- b. La regla del reparto
{
  const filas = EJEMPLOS.map(([monto, lineas]) => ({ monto, lineas: lineas.map(([precio, descuento, cantidad]) => ({ precio, descuento, cantidad })) }));
  // 300 casos al azar (semilla fija: reproducible).
  let semilla = 20261019;
  const azar = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let k = 0; k < 300; k++) {
    const n = 1 + Math.floor(azar() * 4);
    const lineas = Array.from({ length: n }, () => ({
      precio: Math.round((5 + azar() * 295) * 100) / 100,
      descuento: azar() < 0.3 ? Math.round(azar() * 3 * 100) / 100 : 0,
      cantidad: 1 + Math.floor(azar() * 3),
    }));
    const total = lineas.reduce((a, l) => a + Math.round((l.precio - l.descuento) * 100) * l.cantidad, 0) / 100;
    filas.push({ monto: Math.max(1, Math.floor(azar() * (total - 1))), lineas });
  }
  const sqlItems = (lineas) =>
    `jsonb_build_array(${lineas.map((l) => `jsonb_build_object('precio_unitario', ${l.precio.toFixed(2)}, 'descuento_unitario', ${l.descuento.toFixed(2)}, 'cantidad', ${l.cantidad})`).join(", ")})`;
  const consulta = filas.map((f, k) => `select ${k} as k, array_to_string(retail.fn_club_repartir_vale(${sqlItems(f.lineas)}, ${f.monto}), '/') as r`).join("\nunion all\n");
  const r = correr(`select r from (${consulta}) x order by k;`);
  const obtenido = r.ok ? r.salida.split("\n") : [];
  const esperado = filas.map((f) => repartirVale(f.lineas, f.monto).map((x) => x.toFixed(2)).join("/"));
  const distintos = esperado.map((e, k) => (obtenido[k] === e ? null : `#${k}: base=${obtenido[k]} web=${e}`)).filter(Boolean);
  registrar(
    `(b) fn_club_repartir_vale = la regla de la web (repartirVale): ${EJEMPLOS.length} ejemplos y 300 casos al azar, exacta al céntimo`,
    r.ok && obtenido.length === filas.length && distintos.length === 0,
    r.ok ? distintos.slice(0, 5).join("\n") : r.mensaje,
    "0 diferencias"
  );
  const tabla = EJEMPLOS.map(([, , esperadoEj], k) => (obtenido[k] === esperadoEj.map((x) => x.toFixed(2)).join("/") ? null : `ejemplo ${k}`)).filter(Boolean);
  registrar("(b2) la tabla de ejemplos da exactamente lo escrito (19.98 y 10.02, 6.66 × 3, …)", r.ok && tabla.length === 0, tabla.join(", "), "todos iguales");
}

// ---------------------------------------------------------------- c. Los rechazos
const SIN_RASTRO = `reset role;
select (select count(*) from retail.ventas where nota is null and created_at > now() - interval '1 minute' and ubicacion_id = :'ubic') as ventas \\gset
`;
caso(
  "(c) los rechazos NO dejan venta ni gastan el cupón: no existe, ya usado, vencido, por debajo del mínimo, reparto distinto, sin su parte, y junto al cumpleaños",
  SEDE() + CON_CUPON() + `select count(*) as antes from retail.ventas \\gset\n` + como(FELIPE) +
    `select pg_temp.con_cupon(${DOS}, 30) as bien \\gset
select pg_temp.con_cupon(${DOS}, 25) as otro_monto \\gset
select pg_temp.con_cupon(${items(item({ precio: 79.9 }))}, 30) as una_linea \\gset
` +
    `select concat_ws('|',
  substr(pg_temp.vender(:'ubic', :'bien'::jsonb, null, 'CAY-ZZZZ-ZZZZ', gen_random_uuid()), 1, 40),
  pg_temp.vender(:'ubic', :'otro_monto'::jsonb, null, :'codigo', gen_random_uuid()),
  pg_temp.vender(:'ubic', ${DOS}, null, :'codigo', gen_random_uuid()),
  pg_temp.vender(:'ubic', ${items(item({ cant: 1 }))}, null, :'codigo', gen_random_uuid()),
  pg_temp.vender(:'ubic', :'bien'::jsonb, null, :'codigo', gen_random_uuid(), true)) as r \\gset
reset role;
select :'r' || '|' || (select count(*) from retail.ventas) - :antes || '|' || (select estado from retail.club_cupones where codigo = :'codigo');`,
  "ERROR|cupon_no_existe|ERROR|cupon_descuento_distinto|ERROR|cupon_descuento_distinto|ERROR|cupon_compra_minima|ERROR|club_un_cupon_por_compra|0|activo"
);
caso(
  "(c2) un cupón vencido y uno ya usado se rechazan con su motivo (cupon_vencido, cupon_ya_usado)",
  SEDE() + CON_CUPON("79400002") + `select codigo as codigo1 from (select :'codigo' as codigo) x \\gset\n` + CON_CUPON("79400003") +
    VENCER + como(FELIPE) +
    `select pg_temp.con_cupon(${DOS}, 30) as lineas \\gset
select pg_temp.vender(:'ubic', :'lineas'::jsonb, null, :'codigo', gen_random_uuid()) as vencido \\gset
select pg_temp.vender(:'ubic', :'lineas'::jsonb, null, :'codigo1', gen_random_uuid()) as ok1 \\gset
select pg_temp.vender(:'ubic', :'lineas'::jsonb, null, :'codigo1', gen_random_uuid()) as usado \\gset
select :'vencido' || '|' || (:'ok1' !~ '^ERROR') || '|' || :'usado';`,
  "ERROR|cupon_vencido|true|ERROR|cupon_ya_usado"
);

// ---------------------------------------------------------------- d. Al portador
caso(
  "(d) al portador: lo usa una compra con OTRA ficha (los puntos son de ella; la dueña conserva su saldo) y otra SIN ficha",
  SEDE() + CON_CUPON("79400004") + `select retail.fn_club_puntos_saldo(:'duena') as saldo_duena \\gset
select pg_temp.ficha('79400005', 0) as otra \\gset
` + como(FELIPE) +
    `select pg_temp.con_cupon(${DOS}, 30) as lineas \\gset\n` +
    VENDER("venta", { lineas: ":'lineas'::jsonb", clienta: ":'otra'", codigo: ":'codigo'" }) +
    `reset role;
select concat_ws('|', :'venta' !~ '^ERROR', retail.fn_club_puntos_saldo(:'otra'), retail.fn_club_puntos_saldo(:'duena') = :'saldo_duena'::integer,
  (select usado_por_clienta_id = :'otra' from retail.club_cupones where codigo = :'codigo'));`,
  "t|94|t|t"
);
caso(
  "(d2) un cupón se puede usar en una venta SIN ficha: queda usado, sin usado_por_clienta_id, y nadie suma puntos",
  SEDE() + CON_CUPON("79400006") + como(FELIPE) +
    `select pg_temp.con_cupon(${DOS}, 30) as lineas \\gset\n` +
    VENDER("venta", { lineas: ":'lineas'::jsonb", codigo: ":'codigo'" }) +
    `reset role;
select concat_ws('|', :'venta' !~ '^ERROR', (select estado || ':' || coalesce(usado_por_clienta_id::text, 'nadie') from retail.club_cupones where codigo = :'codigo'),
  (select count(*) from retail.club_puntos_movimientos where venta_id::text = :'venta'));`,
  "t|usado:nadie|0"
);

// ---------------------------------------------------------------- e. Anular
caso(
  "(e) anular la venta devuelve el cupón: vuelve a vivir y se puede usar otra vez; los puntos de la compra se restan",
  SEDE() + CON_CUPON("79400007") + `select pg_temp.ficha('79400008', 0) as otra \\gset\n` + como(FELIPE) +
    `select pg_temp.con_cupon(${DOS}, 30) as lineas \\gset\n` +
    VENDER("venta", { lineas: ":'lineas'::jsonb", clienta: ":'otra'", codigo: ":'codigo'" }) +
    `reset role;
select jsonb_agg(jsonb_build_object('venta_item_id', id, 'condicion', 'vendible')) as condiciones from retail.venta_items where venta_id::text = :'venta' \\gset
${como(FELIPE)}select retail.anular_venta(:'venta', 'prueba', :'condiciones'::jsonb) as _an \\gset
reset role;
select estado || ':' || coalesce(venta_id::text, 'sin venta') as tras from retail.club_cupones where codigo = :'codigo' \\gset
${como(FELIPE)}${VENDER("de_nuevo", { lineas: ":'lineas'::jsonb", codigo: ":'codigo'" })}reset role;
select :'tras' || '|' || retail.fn_club_puntos_saldo(:'otra') || '|' || (:'de_nuevo' !~ '^ERROR');`,
  "activo:sin venta|0|true"
);
caso(
  "(e2) si el cupón ya pasó su fecha cuando se anula la venta: vence y devuelve sus puntos (una sola vez)",
  SEDE() + CON_CUPON("79400009") + como(FELIPE) +
    `select pg_temp.con_cupon(${DOS}, 30) as lineas \\gset\n` +
    VENDER("venta", { lineas: ":'lineas'::jsonb", codigo: ":'codigo'" }) +
    `reset role;
select jsonb_agg(jsonb_build_object('venta_item_id', id, 'condicion', 'vendible')) as condiciones from retail.venta_items where venta_id::text = :'venta' \\gset
${VENCER}select retail.fn_club_puntos_saldo(:'duena') as antes \\gset
${como(FELIPE)}select retail.anular_venta(:'venta', 'prueba', :'condiciones'::jsonb) as _an \\gset
reset role;
select :'antes' || '>' || retail.fn_club_puntos_saldo(:'duena') || '|' || (select estado from retail.club_cupones where codigo = :'codigo');`,
  "400>1000|vencido"
);

// ---------------------------------------------------------------- f. El mismo token
caso(
  "(f) el mismo token no gasta dos veces: devuelve la MISMA venta (no «cupón ya usado») y el cupón queda usado por la primera",
  SEDE() + CON_CUPON("79400010") + `select gen_random_uuid() as tk \\gset\n` + como(FELIPE) +
    `select pg_temp.con_cupon(${DOS}, 30) as lineas \\gset\n` +
    VENDER("v1", { lineas: ":'lineas'::jsonb", codigo: ":'codigo'", token: ":'tk'" }) +
    VENDER("v2", { lineas: ":'lineas'::jsonb", codigo: ":'codigo'", token: ":'tk'" }) +
    `reset role;
select (:'v1' = :'v2') || '|' || (:'v1' !~ '^ERROR') || '|' || (select venta_id::text = :'v1' from retail.club_cupones where codigo = :'codigo');`,
  "true|true|true"
);

// ---------------------------------------------------------------- g. validar_cupon
caso(
  "(g1) validar_cupon: ok (valor, vencimiento y SOLO el nombre de pila de la dueña), usado, vencido y por debajo del mínimo (cuánto falta)",
  SEDE() + CON_CUPON("79400011") + CON_CUPON("79400012", 600, "duena2", "codigo2") + VENCER_DE("codigo2") +
    como(FELIPE) +
    `select retail.validar_cupon(:'codigo') as ok \\gset
select retail.validar_cupon(:'codigo', 50) as minimo \\gset
select pg_temp.con_cupon(${DOS}, 30) as lineas \\gset
${VENDER("venta", { lineas: ":'lineas'::jsonb", codigo: ":'codigo'" })}select retail.validar_cupon(:'codigo') as usado \\gset
select retail.validar_cupon(:'codigo2') as vencido \\gset
select concat_ws('|', (:'ok'::jsonb ->> 'ok'), (:'ok'::jsonb ->> 'valor'), ((:'ok'::jsonb ->> 'vence_el')::date - :'hoy'::date), (:'ok'::jsonb ->> 'de'), (:'ok'::jsonb) ? 'nombre',
  (:'minimo'::jsonb ->> 'motivo'), (:'minimo'::jsonb ->> 'faltan'), (:'usado'::jsonb ->> 'motivo'), (:'vencido'::jsonb ->> 'motivo'));`,
  "true|30.00|7|Lucia|f|minimo|40.00|usado|vencido"
);
caso(
  "(g2) validar_cupon cuenta los códigos que NO existen: a los 5 en 5 minutos bloquea esa cuenta; solo con el módulo Vender o Clientes",
  SEDE() + CON_CUPON("79400013") + `delete from retail.rol_modulos where modulo in ('vender', 'clientas') and rol_id = retail.fn_rol_por_clave('integrante');\n` +
    como(FELIPE) +
    `select concat_ws('|',
  (retail.validar_cupon('CAY-AAAA-AAA2') ->> 'motivo'), (retail.validar_cupon('CAY-AAAA-AAA3') ->> 'motivo'),
  (retail.validar_cupon('CAY-AAAA-AAA4') ->> 'motivo'), (retail.validar_cupon('CAY-AAAA-AAA5') ->> 'motivo'),
  (retail.validar_cupon('CAY-AAAA-AAA6') ->> 'intentos')) as cinco \\gset
select retail.validar_cupon(:'codigo') as bloqueado \\gset
${como(MICAELA)}select pg_temp.intento($q$select retail.validar_cupon('CAY-AAAA-AAA7')$q$) as sin_modulo \\gset
reset role;
select :'cinco' || '|' || (:'bloqueado'::jsonb ->> 'motivo') || '|' || :'sin_modulo';`,
  "no_existe|no_existe|no_existe|no_existe|5|bloqueado|42501|sin_permiso"
);

// ---------------------------------------------------------------- h. Estructura
caso(
  "(h) registrar_venta lleva los trozos del cupón (3 usos de v_cup) y su firma NO cambió: 18 parámetros, p_codigo_descuento sigue ahí",
  `select (length(d) - length(replace(d, 'v_cup.id is not null', ''))) / length('v_cup.id is not null') as usos,
  position('fn_club_repartir_vale' in d) > 0 as reparte, position('p_codigo_descuento text' in d) > 0 as param
  from (select pg_get_functiondef('${RV_HOY}'::regprocedure) d) x \\gset
select (select count(*) from pg_trigger where not tgisinternal and tgname = 'trg_club_cupon_al_anular_venta') as disc \\gset
select :'usos' || '|' || :'reparte' || '|' || :'param' || '|' || :'disc';`,
  "3|t|t|1"
);

// ---------------------------------------------------------------- i. Dos cajas a la vez (commitea: solo base desechable)
if (process.env.BASE_DESECHABLE === "1") {
  casos++;
  const dni = `76${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  const prep = correr(`${PRELUDIO}${SEDE("Tienda Lima")}${CON_CUPON(dni)}select :'codigo';\n commit;`);
  if (!prep.ok) {
    fallas++;
    console.log(`✗ (i) con COMMIT: dos cajas cobran a la vez con el mismo cupón\n    preparación falló: ${prep.mensaje}`);
  } else {
    const codigo = prep.salida.split("\n").pop();
    const caja = (tienda, dormirS) => `${PRELUDIO}${SEDE(tienda)}${como(FELIPE)}select pg_temp.con_cupon(${DOS}, 30) as lineas \\gset
select pg_temp.vender(:'ubic', :'lineas'::jsonb, null, '${codigo}', gen_random_uuid());
${dormirS ? `select pg_sleep(${dormirS});` : ""}
commit;`;
    const a = psqlEnParalelo(caja("Tienda Lima", 3));
    await new Promise((r) => setTimeout(r, 1200));
    const b = await psqlEnParalelo(caja("Tienda Trujillo", 0));
    const ra = await a;
    const cupon = correr(`select estado || '|' || (select count(*) from retail.ventas where id = venta_id) from retail.club_cupones where codigo = '${codigo}';`);
    const idA = ra.ok ? ra.salida.split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l)) : null;
    const ok = Boolean(idA) && b.ok && b.salida.split("\n").some((l) => l === "ERROR|cupon_ya_usado") && cupon.salida === "usado|1";
    if (!ok) fallas++;
    console.log(`${ok ? "✓" : "✗"} (i) con COMMIT: dos cajas cobran A LA VEZ con el mismo cupón → pasa UNA (la que llegó primero) y la otra recibe cupon_ya_usado`);
    if (!ok) console.log(`    obtenido:\n      A: ${ra.ok ? ra.salida : ra.mensaje}\n      B: ${b.ok ? b.salida : b.mensaje}\n      cupón: ${cupon.salida ?? cupon.mensaje}`);
  }
} else {
  console.log("· (i), la carrera con COMMIT, no corrió: solo corre con BASE_DESECHABLE=1 (deja un cupón y una venta de prueba)");
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

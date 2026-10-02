#!/usr/bin/env node
/**
 * Pruebas del vale de aniversario del club (ADR-0288, G-9 y G-13; «Contrato de la tanda 1g»; migraciones
 * `20261001210000…210700_club_paso1g_*`).
 *
 * EL PROBLEMA. Cada año de club que CUENTA (6 compras o S/ 600 en compras netas, configurable) le da a la socia un vale en
 * soles que crece (S/ 20 · 30 · 40 · 50 · 60; desde el quinto se repite), para una compra dentro de 60 días. Un año que no
 * cuenta pausa: no avanza ni se pierde. Uno solo de los dos beneficios del club por compra. La base tiene que hacer cumplir,
 * no la pantalla:
 *   · `fn_club_aniversario` calcula al leer el año de club, el umbral con compras netas (las devueltas enteras no cuentan; una
 *     devolución parcial resta lo devuelto) y el vale del último aniversario;
 *   · `registrar_venta` con `p_canjear_aniversario` reparte el vale en `descuento_club_unitario` con la MISMA regla que la web
 *     (`repartirVale` de apps/web/lib/club-aniversario-canje-reglas.ts) y rechaza un reparto distinto; un canje vivo por año
 *     de club; anular lo libera; una devolución no.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`; cuentas
 * del seed: Felipe, líder y Admin; Micaela, integrante de Trujillo; Sandra, para aprobar una devolución):
 *   a. El reparto: la tabla de ejemplos (la misma regla que la web, recalculada aquí con su réplica en JS) contra lo que guarda
 *      la base; un reparto distinto → `aniversario_descuento_distinto` sin venta.
 *   b. El umbral: 5 compras y menos de S/ 600 no cuentan; 6 compras, sí; S/ 600 en una compra, sí; S/ 599.99, no; una devuelta
 *      entera no cuenta; una parcial resta lo devuelto; anulada, de prueba o antes de unirse, no cuentan.
 *   c. La pausa y la escala: año 1 cuenta, año 2 no, año 3 cuenta → el vale del año 3 es el segundo (S/ 30); seis años que
 *      cuentan → S/ 60 (el del quinto se repite); el año en curso (compras, monto, si ya cuenta) y el próximo aniversario.
 *   d. Los 60 días: el día 60 todavía vale (vence hoy); el 61, no; los días salen de configuracion_empresa.
 *   e. El canje: la línea, el monto APLICADO en club_canjes (tipo, año del aniversario, año de club, sin %, quién), la
 *      actividad sin datos suyos; resumen_clienta_caja y fn_club_aniversario antes y después.
 *   f. Uno por compra (`club_un_cupon_por_compra`), uno por año de club (`aniversario_ya_canjeado`), sin vale o sin clienta
 *      (`aniversario_no_disponible`), sin nada que descontar (`aniversario_sin_monto`); en ningún rechazo queda venta ni canje.
 *   g. Anular la venta libera el vale (se vuelve a canjear); una devolución no.
 *   h. Estructura: una firma de registrar_venta (18); permisos; candados de club_canjes; fn_club_aniversario con el módulo.
 *   j. Dos cajas a la vez (dos conexiones reales): (j1) la segunda ESPERA en la lectura de la ficha (sin COMMIT). Con
 *      BASE_DESECHABLE=1, además y con COMMIT: (j2) dos canjes del mismo vale → pasa uno y el otro recibe
 *      `aniversario_ya_canjeado`.
 *
 * USO
 *   pnpm pruebas:club-aniversario                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-aniversario --base cayla_x    → contra otra base del mismo contenedor
 *   BASE_DESECHABLE=1 pnpm pruebas:club-aniversario → además (j2), que commitea: SOLO contra un Postgres desechable
 */

import { execFileSync, spawn } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const SANDRA = "22222222-2222-4222-8222-000000000005";
const TOKEN_A = "99999999-9999-4999-8999-0000000a0001";
const RV_HOY = "retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean,boolean)";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
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
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/**
 * La regla del reparto, en JS: una RÉPLICA de `repartirVale` (apps/web/lib/club-aniversario-canje-reglas.ts, rama de la web
 * de la tanda 1g). Todo en céntimos enteros. Devuelve la parte del vale por unidad de cada línea, en soles.
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

// La tabla de ejemplos (los de la cabecera de la migración y los que pidió la web): [vale, líneas [precio, descuento sin
// club, cantidad], lo que reparte por unidad en cada línea]. El de S/ 60 sobre 45.00 la regla lo reparte entero, pero la
// venta quedaría en S/ 0: la base la rechaza (`aniversario_cubre_todo`, ver la cabecera de la migración).
const EJEMPLOS = [
  [20, [[79.9, 0, 1]], [20.0]],
  [30, [[79.9, 0, 1], [40.1, 0, 1]], [19.98, 10.02]],
  [20, [[79.9, 0, 1], [45.0, 0, 1]], [12.79, 7.21]],
  [60, [[45.0, 0, 1]], [45.0]],
  [20, [[10.0, 0, 3]], [6.66]],
  [50, [[79.9, 0, 2], [45.0, 0, 3]], [13.55, 7.63]],
  [30, [[79.9, 7.99, 2], [45.0, 0, 1]], [11.42, 7.16]],
];

/** Las funciones de prueba (en `pg_temp`, se van con la sesión). */
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

-- Vende las líneas y paga exactamente su total (Σ (precio − descuento_unitario) × cantidad), con o sin canje. Devuelve el
-- id de la venta o «ERROR|hint».
create function pg_temp.vender(p_ubic uuid, p_items jsonb, p_clienta uuid, p_cumple boolean, p_aniv boolean, p_token uuid)
returns text language plpgsql as $f$
declare v_id uuid; v_estado text; v_msg text; v_hint text; v_total numeric;
begin
  v_total := (select sum(((e ->> 'precio_unitario')::numeric - coalesce((e ->> 'descuento_unitario')::numeric, 0)) * (e ->> 'cantidad')::integer)
                from jsonb_array_elements(p_items) e);
  v_id := retail.registrar_venta(
    p_ubicacion_id => p_ubic, p_items => p_items,
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', v_total)),
    p_cliente_id => p_clienta, p_token => p_token,
    p_canjear_cumpleanos => p_cumple, p_canjear_aniversario => p_aniv);
  return v_id::text;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return 'ERROR|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else v_estado || '|' || v_msg end;
end;
$f$;
grant execute on function pg_temp.vender(uuid, jsonb, uuid, boolean, boolean, uuid) to authenticated;

-- Una socia del club (unida desde el cartel) que se unió el día p_desde (Lima, al mediodía). Como postgres.
create function pg_temp.socia(p_dni text, p_cel text, p_desde date, p_ubic uuid) returns uuid language plpgsql as $f$
declare v uuid;
begin
  v := (select r.clienta_id from retail.registrarse_en_el_club(p_ubic, 'dni', p_dni, 'SOCIA ANIVERSARIO PRUEBA', p_cel, date '1990-05-12',
          null, true, true, false,
          jsonb_build_object('terminos', (select max(t.version) from retail.club_textos t where t.tipo = 'terminos'),
                             'privacidad', (select max(t.version) from retail.club_textos t where t.tipo = 'privacidad')), true) r);
  update retail.clientas set club_desde = (p_desde::timestamp + interval '12 hours') at time zone 'America/Lima' where id = v;
  return v;
end;
$f$;

-- Una compra de la clienta el día p_dia (Lima, al mediodía), de p_cant unidades a p_precio. Directo en las tablas: aquí se
-- prueba cómo CUENTAN las compras, no cómo se cobran.
create function pg_temp.compra(p_cli uuid, p_ubic uuid, p_dia date, p_precio numeric, p_cant integer default 1,
                               p_estado text default 'completada', p_prueba boolean default false) returns uuid
language plpgsql as $f$
declare v uuid;
begin
  insert into retail.ventas (ubicacion_id, cliente_id, created_at, estado, anulado_en, motivo_anulacion, es_prueba)
  values (p_ubic, p_cli, (p_dia::timestamp + interval '12 hours') at time zone 'America/Lima', p_estado,
          case when p_estado = 'anulada' then now() end, case when p_estado = 'anulada' then 'prueba' end, p_prueba)
  returning id into v;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
  select v, va.id, p_cant, p_precio, 1 from retail.variantes va order by va.id limit 1;
  return v;
end;
$f$;
-- Devuelve p_cant unidades de cada línea de la venta (devolución aprobada).
create function pg_temp.devolver(p_venta uuid, p_cant integer) returns void language sql as $f$
  with d as (
    insert into retail.devoluciones (venta_id, ubicacion_id, estado, motivo, aprobado_en)
    select p_venta, v.ubicacion_id, 'aprobada', 'prueba', now() from retail.ventas v where v.id = p_venta
    returning id
  )
  insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion)
  select d.id, vi.id, p_cant, 'vendible' from d, retail.venta_items vi where vi.venta_id = p_venta;
$f$;
-- n compras de p_precio en el año de club p_anio (desde el día 10 del año, una por día).
create function pg_temp.compras_en_anio(p_cli uuid, p_ubic uuid, p_anio integer, p_n integer, p_precio numeric) returns void
language plpgsql as $f$
declare v_desde date := ((select c.club_desde from retail.clientas c where c.id = p_cli) at time zone 'America/Lima')::date;
begin
  for k in 1 .. p_n loop
    perform pg_temp.compra(p_cli, p_ubic, (v_desde + make_interval(years => p_anio - 1))::date + 9 + k, p_precio);
  end loop;
end;
$f$;
`;

const PRELUDIO_BASE = `
begin;
set local search_path = retail, public, extensions;
${FUNCIONES_DE_PRUEBA}
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select retail.fn_hoy_lima() as hoy, extract(year from retail.fn_hoy_lima())::int as anio_hoy \\gset
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
`;
const PRELUDIO = `${PRELUDIO_BASE}
update retail.configuracion_empresa set exige_responsable = false;
insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('integrante'), 'clientas' on conflict do nothing;
`;

const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);\n`;
const intentoCon = (sql, ...vars) => `select pg_temp.intento(format($q$${sql}$q$, ${vars.join(", ")}));\n`;

/**
 * Una sede lista para vender (como postgres con los claims del líder): piso, su caja abierta y 100 unidades de tres prendas
 * en el piso: v1 = BLU-EMMA-NEG-M (79.90), v2 = BLU-EMMA-BEI-M y v3 = BLU-VALE-BLA-M (precios a gusto de cada caso). Deja
 * :v1, :v2, :v3 y :stock0 (de v1).
 */
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
select retail.abrir_caja(:'ubic', 100.00, 'prueba club_aniversario') as caja_id \\gset
select id as v1 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v2 from retail.variantes where sku = 'BLU-EMMA-BEI-M' \\gset
select id as v3 from retail.variantes where sku = 'BLU-VALE-BLA-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
with m as (
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select v, :'ubic', :'sub_piso', 'entrada', 100, 'colchón de prueba' from unnest(array[:'v1', :'v2', :'v3']::uuid[]) v
  returning id)
select count(retail.fn_aplicar_movimiento(m.id)) as _mov from m \\gset
select coalesce(sum(cantidad), 0) as stock0 from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic' \\gset
`;

/**
 * Una socia (como postgres) con su vale de aniversario disponible: se unió hace un año y tres días y en su año 1 hizo 6
 * compras de S/ 50 (300: cuenta por compras). El vale del año 1 es el de la escala (S/ 20; `vale` lo cambia). Deja :<alias>.
 */
const CON_VALE = (alias, dni, cel, { vale = null } = {}) => `reset role;
select pg_temp.socia('${dni}', '${cel}', (retail.fn_hoy_lima() - interval '1 year' - interval '3 days')::date, :'ubic') as ${alias} \\gset
select pg_temp.compras_en_anio(:'${alias}', :'ubic', 1, 6, 50) as _c_${alias} \\gset
${vale === null ? "" : `update retail.club_aniversario_escala set monto = ${vale} where anio = 1;\n`}`;

/** Una línea de p_items: precio, descuento SIN el club, cantidad y la parte del club (null = no viaja). */
const item = ({ v = ":'v1'", precio = 79.9, sinClub = 0, club = null, cant = 1 } = {}) => {
  const total = (Math.round((sinClub + (club ?? 0)) * 100) / 100).toFixed(2);
  return (
    `jsonb_build_object('variante_id', ${v}, 'cantidad', ${cant}, 'precio_unitario', ${precio.toFixed(2)}::numeric, 'descuento_unitario', ${total}` +
    (club === null ? "" : `, 'descuento_club_unitario', ${club.toFixed(2)}`) +
    (sinClub > 0 ? `, 'motivo_descuento', 'cerrar_venta'` : "") +
    ")"
  );
};
const items = (...xs) => `jsonb_build_array(${xs.join(", ")})`;
const VENDER = (alias, { lineas, clienta = "null", cumple = "false", aniv = "false", token = "gen_random_uuid()" }) =>
  `select pg_temp.vender(:'ubic', ${lineas}, ${clienta}, ${cumple}, ${aniv}, ${token}) as ${alias} \\gset\n`;
/** Pone el precio de catálogo de v2 y v3 (como postgres): la caja exige que el precio sea el del catálogo. */
const PRECIOS = (p2, p3 = null) =>
  `reset role;\nupdate retail.variantes set precio = ${p2} where id = :'v2';\n` + (p3 === null ? "" : `update retail.variantes set precio = ${p3} where id = :'v3';\n`);

const md5Norm = (expr) =>
  `md5(regexp_replace(regexp_replace(regexp_replace(${expr}, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))`;

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
function caso(nombre, sql, esperadoCaso) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperadoCaso === "function" ? esperadoCaso(obtenido) : obtenido === esperadoCaso;
  registrar(nombre, bien, obtenido, typeof esperadoCaso === "function" ? "(condición)" : esperadoCaso);
}
function chequeo(nombre, obtenido, esperado) {
  registrar(nombre, obtenido === esperado, obtenido, esperado);
}

try {
  execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"], { stdio: "ignore" });
} catch {
  console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
  process.exit(1);
}

// =====================================================================================================================
// a. El reparto del vale
// =====================================================================================================================
chequeo(
  `(a) la réplica JS de la regla de la web da la tabla de ejemplos (${EJEMPLOS.length} casos; entre ellos 79.90 y 40.10 con S/ 30 → 19.98 y 10.02, y 10.00 × 3 con S/ 20 → 6.66 × 3 = 19.98)`,
  EJEMPLOS.map(([vale, lineas]) => repartirVale(lineas.map(([precio, descuento, cantidad]) => ({ precio, descuento, cantidad })), vale).join("/")).join(" · "),
  EJEMPLOS.map(([, , esperado]) => esperado.join("/")).join(" · ")
);
{
  // Cada ejemplo, de verdad en registrar_venta: la línea guarda la parte del vale que manda la web, el canje anota lo
  // APLICADO (Σ parte × cantidad) y el pago es el total menos eso. Las líneas: v1 (79.90 fijo), v2 y v3 al precio del caso.
  EJEMPLOS.forEach(([vale, lineas], n) => {
    const cubreTodo = lineas.reduce((a, [p, d, q]) => a + (Math.round(p * 100) - Math.round(d * 100)) * q, 0) <= Math.round(vale * 100);
    const partes = repartirVale(lineas.map(([precio, descuento, cantidad]) => ({ precio, descuento, cantidad })), vale);
    const vars = [":'v1'", ":'v2'", ":'v3'"];
    // v1 es la de 79.90; las demás líneas toman v2 y v3 con su precio.
    let otra = 1;
    const asignadas = lineas.map(([precio]) => (precio === 79.9 ? vars[0] : vars[otra++]));
    const precios = lineas.filter(([precio]) => precio !== 79.9).map(([precio]) => precio);
    const aplicado = Math.round(lineas.reduce((a, [, , q], k) => a + partes[k] * 100 * q, 0)) / 100;
    const total = Math.round(lineas.reduce((a, [p, d, q], k) => a + (Math.round(p * 100) - Math.round(d * 100) - Math.round(partes[k] * 100)) * q, 0)) / 100;
    caso(
      cubreTodo
        ? `(a) registrar_venta, ejemplo ${n + 1}: vale S/ ${vale} sobre ${lineas.map(([p, d, q]) => `${p.toFixed(2)}${d ? `−${d.toFixed(2)}` : ""}×${q}`).join(" + ")}: el vale cubre toda la compra → no queda venta (se prueba en f, aniversario_cubre_todo)`
        : `(a) registrar_venta, ejemplo ${n + 1}: vale S/ ${vale} sobre ${lineas.map(([p, d, q]) => `${p.toFixed(2)}${d ? `−${d.toFixed(2)}` : ""}×${q}`).join(" + ")} → ${partes.map((x) => x.toFixed(2)).join(" y ")} por unidad (aplica ${aplicado.toFixed(2)}, cobra ${total.toFixed(2)})`,
      SEDE() + (precios.length ? PRECIOS(...precios.map((x) => x.toFixed(2))) : "") + CON_VALE("f", `9099${String(n).padStart(4, "0")}`, `96699${String(n).padStart(4, "0")}`, { vale }) +
        como(FELIPE) +
        VENDER("venta", {
          lineas: items(...lineas.map(([precio, sinClub, cant], k) => item({ v: asignadas[k], precio, sinClub, cant, club: partes[k] }))),
          clienta: ":'f'",
          aniv: "true",
        }) +
        `reset role;
select string_agg(descuento_club_unitario::text, '/' order by precio_unitario desc, cantidad) from retail.venta_items where venta_id::text = :'venta';
select tipo, monto, pct is null, anio_club from retail.club_canjes where venta_id::text = :'venta';
select sum(monto) from retail.venta_pagos where venta_id::text = :'venta';
`,
      cubreTodo
        ? ""
        : [
            lineas
              .map(([p, , q], k) => ({ p, q, u: partes[k] }))
              .sort((a, b) => b.p - a.p || a.q - b.q)
              .map((x) => x.u.toFixed(2))
              .join("/"),
            `aniversario|${aplicado.toFixed(2)}|t|1`,
            total.toFixed(2),
          ].join("\n")
    );
  });
}
caso(
  "(a) un reparto distinto del de la regla (30 sobre 79.90 y 40.10 mandado como 20.00 y 10.00, o 19.99 y 10.01) → aniversario_descuento_distinto, sin venta, sin canje y sin stock movido",
  SEDE() + PRECIOS("40.10") + CON_VALE("f", "90991001", "966991001", { vale: 30 }) + como(FELIPE) +
    VENDER("mal1", { lineas: items(item({ club: 20 }), item({ v: ":'v2'", precio: 40.1, club: 10 })), clienta: ":'f'", aniv: "true", token: `'${TOKEN_A}'` }) +
    VENDER("mal2", { lineas: items(item({ club: 19.99 }), item({ v: ":'v2'", precio: 40.1, club: 10.01 })), clienta: ":'f'", aniv: "true" }) +
    `select :'mal1', :'mal2';
reset role;
select (select count(*) from retail.ventas where token_cliente = '${TOKEN_A}'), (select count(*) from retail.club_canjes where clienta_id = :'f'),
       (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic') - :stock0;
`,
  "ERROR|aniversario_descuento_distinto|ERROR|aniversario_descuento_distinto\n0|0|0"
);

// =====================================================================================================================
// b. El umbral (compras netas)
// =====================================================================================================================
/** fn_club_aniversario de una ficha, como Felipe: «años que cuentan|vale disponible|monto|vence = hoy+d». */
const ANIV = (alias) => `${como(FELIPE)}select anios_que_cuentan || '|' || vale_disponible || '|' || coalesce(vale_monto::text, '-')
  from retail.fn_club_aniversario(:'${alias}');\n`;
/** Una socia que cumplió su primer aniversario hace 3 días (sin compras). */
const SOCIA_1 = (alias, dni) =>
  `reset role;\nselect pg_temp.socia('${dni}', '96${dni.slice(1)}', (retail.fn_hoy_lima() - interval '1 year' - interval '3 days')::date, :'ubic') as ${alias} \\gset\n`;
caso(
  "(b) el umbral: 5 compras de S/ 100 (500) no cuentan; 6 de S/ 50 (300), sí; una de S/ 600, sí; una de S/ 599.99, no",
  SOCIA_1("a", "90992001") + `select pg_temp.compras_en_anio(:'a', :'ubic', 1, 5, 100) as _a \\gset\n` +
    SOCIA_1("b", "90992002") + `select pg_temp.compras_en_anio(:'b', :'ubic', 1, 6, 50) as _b \\gset\n` +
    SOCIA_1("c", "90992003") + `select pg_temp.compras_en_anio(:'c', :'ubic', 1, 1, 600) as _c \\gset\n` +
    SOCIA_1("d", "90992004") + `select pg_temp.compras_en_anio(:'d', :'ubic', 1, 1, 599.99) as _d \\gset\n` +
    ANIV("a") + ANIV("b") + ANIV("c") + ANIV("d"),
  "0|false|-\n1|true|20.00\n1|true|20.00\n0|false|-"
);
caso(
  "(b) compras netas (la regla de la 1f): 6 compras con una devuelta ENTERA son 5 (no cuenta); una de S/ 700 en 2 prendas con una devuelta resta S/ 350 (no cuenta) y sin devolver, cuenta; anulada, de prueba o antes de unirse, no cuentan",
  SOCIA_1("a", "90992011") + `select pg_temp.compras_en_anio(:'a', :'ubic', 1, 6, 50) as _a \\gset
select pg_temp.devolver((select id from retail.ventas where cliente_id = :'a' order by created_at limit 1), 1) as _da \\gset
` +
    SOCIA_1("b", "90992012") + `select pg_temp.compra(:'b', :'ubic', (retail.fn_hoy_lima() - 100), 350, 2) as vb \\gset
select pg_temp.devolver(:'vb', 1) as _db \\gset
` +
    SOCIA_1("c", "90992013") + `select pg_temp.compra(:'c', :'ubic', (retail.fn_hoy_lima() - 100 - 365), 350, 2) as _vc \\gset
select pg_temp.compra(:'c', :'ubic', (retail.fn_hoy_lima() - 100), 350, 2) as _vc2 \\gset
` +
    SOCIA_1("d", "90992014") + `select pg_temp.compra(:'d', :'ubic', (retail.fn_hoy_lima() - 100), 700, 1, 'anulada') as _x1 \\gset
select pg_temp.compra(:'d', :'ubic', (retail.fn_hoy_lima() - 100), 700, 1, 'completada', true) as _x2 \\gset
select pg_temp.compra(:'d', :'ubic', (retail.fn_hoy_lima() - 400 - 30), 700) as _x3 \\gset
` +
    ANIV("a") + ANIV("b") + ANIV("c") + ANIV("d"),
  "0|false|-\n0|false|-\n1|true|20.00\n0|false|-"
);

// =====================================================================================================================
// c. La pausa y la escala
// =====================================================================================================================
/** Una socia que se unió hace n años y 3 días: :<alias>. */
const SOCIA_N = (alias, dni, n) =>
  `reset role;\nselect pg_temp.socia('${dni}', '96${dni.slice(1)}', (retail.fn_hoy_lima() - interval '${n} years' - interval '3 days')::date, :'ubic') as ${alias} \\gset\n`;
caso(
  "(c) la pausa: año 1 cuenta, año 2 no (una compra), año 3 cuenta → 2 años que cuentan y el vale del año 3 es el SEGUNDO de la escala (S/ 30), no el tercero",
  SOCIA_N("f", "90993001", 3) +
    `select pg_temp.compras_en_anio(:'f', :'ubic', 1, 6, 50) as _1 \\gset
select pg_temp.compras_en_anio(:'f', :'ubic', 2, 1, 50) as _2 \\gset
select pg_temp.compras_en_anio(:'f', :'ubic', 3, 1, 600) as _3 \\gset
` + ANIV("f"),
  "2|true|30.00"
);
caso(
  "(c) la escala: seis años que cuentan → S/ 60 (desde el quinto se repite el del 5); y con la escala cambiada (5 → 75), el del quinto en adelante es el nuevo",
  SOCIA_N("f", "90993011", 6) +
    `select pg_temp.compras_en_anio(:'f', :'ubic', a, 1, 600) from generate_series(1, 6) a;
` + ANIV("f") + `reset role;\nupdate retail.club_aniversario_escala set monto = 75 where anio = 5;\n` + ANIV("f"),
  (s) => {
    const l = s.split("\n").filter((x) => x !== "");
    return l.slice(-2).join("\n") === "6|true|60.00\n6|true|75.00";
  }
);
caso(
  "(c) el año en curso: sus compras y su monto netos, si ya cuenta, y el próximo aniversario (club_desde + años); sin club, ceros y nulos",
  SOCIA_1("f", "90993021") +
    `select pg_temp.compra(:'f', :'ubic', retail.fn_hoy_lima() - 1, 250) as _1 \\gset
select pg_temp.compra(:'f', :'ubic', retail.fn_hoy_lima(), 400) as _2 \\gset
insert into retail.clientas (documento_numero, nombre) values ('90993022', 'Sin Club Prueba') returning id as nc \\gset
` + como(FELIPE) +
    `select anio_en_curso_cuenta, compras_anio, monto_anio, proximo_aniversario = (retail.fn_hoy_lima() + interval '1 year' - interval '3 days')::date
  from retail.fn_club_aniversario(:'f');
select anios_que_cuentan, anio_en_curso_cuenta, compras_anio, monto_anio, proximo_aniversario is null, vale_disponible, vale_monto is null
  from retail.fn_club_aniversario(:'nc');
select count(*) from retail.fn_club_aniversario(gen_random_uuid());
`,
  "t|2|650.00|t\n0|f|0|0|t|f|t\n0"
);

// =====================================================================================================================
// d. Los 60 días
// =====================================================================================================================
caso(
  "(d) el vale vence el aniversario + 60 días (inclusive): a los 60 días todavía vale (vence hoy); a los 61, no; con 90 días en la configuración, a los 61 vale",
  `reset role;
select pg_temp.socia('90994001', '966994001', (retail.fn_hoy_lima() - interval '1 year' - interval '60 days')::date, :'ubic') as a \\gset
select pg_temp.compras_en_anio(:'a', :'ubic', 1, 6, 50) as _a \\gset
select pg_temp.socia('90994002', '966994002', (retail.fn_hoy_lima() - interval '1 year' - interval '61 days')::date, :'ubic') as b \\gset
select pg_temp.compras_en_anio(:'b', :'ubic', 1, 6, 50) as _b \\gset
` + como(FELIPE) +
    `select vale_disponible, vale_vence = retail.fn_hoy_lima() from retail.fn_club_aniversario(:'a');
select vale_disponible, vale_vence = retail.fn_hoy_lima() - 1 from retail.fn_club_aniversario(:'b');
reset role;
insert into retail.configuracion_empresa (ruc, razon_social, club_aniversario_dias) values ('20000000001', 'Prueba Club SAC', 90)
  on conflict (id) do update set club_aniversario_dias = 90;
` + como(FELIPE) + `select vale_disponible from retail.fn_club_aniversario(:'b');\n`,
  "t|t\nf|t\nt"
);

// =====================================================================================================================
// e. El canje en la venta
// =====================================================================================================================
const RESUMEN = (f) => `${como(FELIPE)}select aniversario_disponible, coalesce(aniversario_monto::text, '-'), aniversario_vence = retail.fn_hoy_lima() + 57
  from retail.resumen_clienta_caja(:'${f}');\n`;
caso(
  "(e) canje del vale (S/ 20 sobre 79.90): la línea guarda 20.00 (total y club, sin motivo), cobra 59.90; club_canjes anota tipo aniversario, año del aniversario, año de club 1, sin %, monto APLICADO y quién; la actividad lo cuenta sin datos suyos; la caja lo ve disponible antes y no después; fn_club_aniversario dice canjeado hoy",
  SEDE() + CON_VALE("f", "90995001", "966995001") + RESUMEN("f") + como(FELIPE) +
    VENDER("venta", { lineas: items(item({ club: 20 })), clienta: ":'f'", aniv: "true" }) +
    `reset role;
select descuento_unitario, descuento_club_unitario, coalesce(motivo_descuento, '-'), subtotal from retail.venta_items where venta_id::text = :'venta';
select tipo, anio = extract(year from retail.fn_hoy_lima() - 3), anio_club, pct is null, monto, registrado_por = :'persona_felipe', anulado_en is null
  from retail.club_canjes where venta_id::text = :'venta';
select a.accion, a.registro_id = :'venta', a.detalle ->> 'anio_club', a.detalle ->> 'monto',
       (a.descripcion || a.detalle::text) !~* ('(aniversario prueba|90995001|966995001|' || :'f' || ')')
  from retail.actividad a where a.accion = 'aniversario_canjeado' and a.registro_id = :'venta';
` + RESUMEN("f") + `select vale_disponible, vale_canjeado_el = retail.fn_hoy_lima() from retail.fn_club_aniversario(:'f');\n`,
  "t|20.00|t\n20.00|20.00|-|59.90\naniversario|t|1|t|20.00|t|t\naniversario_canjeado|t|1|20.00|t\nf|-|\nf|t"
);
caso(
  "(e) el vale que cubre TODA la compra (S/ 60 sobre una prenda de 45.00, o S/ 20 justo sobre 20.00) → aniversario_cubre_todo: una venta en S/ 0 no se cobra ni se emite (decisión pendiente de Felipe); sin venta ni canje",
  SEDE() + PRECIOS("45.00", "20.00") + CON_VALE("f", "90995011", "966995011", { vale: 60 }) + como(FELIPE) +
    VENDER("v1", { lineas: items(item({ v: ":'v2'", precio: 45, club: 45 })), clienta: ":'f'", aniv: "true", token: `'${TOKEN_A}'` }) +
    `reset role;\nupdate retail.club_aniversario_escala set monto = 20 where anio = 1;\n` + como(FELIPE) +
    VENDER("v2", { lineas: items(item({ v: ":'v3'", precio: 20, club: 20 })), clienta: ":'f'", aniv: "true" }) +
    `select :'v1', :'v2';
reset role;
select (select count(*) from retail.ventas where token_cliente = '${TOKEN_A}') || '|' || (select count(*) from retail.club_canjes where clienta_id = :'f');
`,
  "ERROR|aniversario_cubre_todo|ERROR|aniversario_cubre_todo\n0|0"
);

// =====================================================================================================================
// f. Rechazos
// =====================================================================================================================
const NADA = (token, ficha) => `reset role;
select (select count(*) from retail.ventas where token_cliente = '${token}') || '|' || (select count(*) from retail.club_canjes where clienta_id = :'${ficha}');
`;
caso(
  "(f) una sola ventaja del club por compra: cumpleaños y vale a la vez → club_un_cupon_por_compra, sin venta ni canje",
  SEDE() + CON_VALE("f", "90996001", "966996001") + como(FELIPE) +
    VENDER("v", { lineas: items(item({ club: 20 })), clienta: ":'f'", cumple: "true", aniv: "true", token: `'${TOKEN_A}'` }) +
    `select :'v';\n` + NADA(TOKEN_A, "f"),
  "ERROR|club_un_cupon_por_compra\n0|0"
);
caso(
  "(f) el segundo canje del mismo vale → aniversario_ya_canjeado (y queda uno solo)",
  SEDE() + CON_VALE("f", "90996011", "966996011") + como(FELIPE) +
    VENDER("v1", { lineas: items(item({ club: 20 })), clienta: ":'f'", aniv: "true" }) +
    VENDER("v2", { lineas: items(item({ club: 20 })), clienta: ":'f'", aniv: "true", token: `'${TOKEN_A}'` }) +
    `select :'v2';\n` + NADA(TOKEN_A, "f"),
  "ERROR|aniversario_ya_canjeado\n0|1"
);
caso(
  "(f) sin vale (no cumplió el año, el año no contó, o no es socia) y sin clienta → aniversario_no_disponible; sin nada que descontar (la prenda ya en 0) → aniversario_sin_monto",
  SEDE() + SOCIA_1("a", "90996021") +
    `reset role;\nselect pg_temp.socia('90996022', '966996022', (retail.fn_hoy_lima() - 100)::date, :'ubic') as b \\gset
insert into retail.clientas (documento_numero, nombre) values ('90996023', 'No Socia Prueba') returning id as c \\gset
` + CON_VALE("d", "90996024", "966996024") + como(FELIPE) +
    VENDER("ra", { lineas: items(item({ club: 20 })), clienta: ":'a'", aniv: "true" }) +
    VENDER("rb", { lineas: items(item({ club: 20 })), clienta: ":'b'", aniv: "true" }) +
    VENDER("rc", { lineas: items(item({ club: 20 })), clienta: ":'c'", aniv: "true" }) +
    VENDER("rn", { lineas: items(item({ club: 20 })), aniv: "true" }) +
    VENDER("rd", { lineas: items(item({ sinClub: 79.9, club: 0 })), clienta: ":'d'", aniv: "true" }) +
    `select :'ra', :'rb', :'rc', :'rn', :'rd';\n`,
  "ERROR|aniversario_no_disponible|ERROR|aniversario_no_disponible|ERROR|aniversario_no_disponible|ERROR|aniversario_no_disponible|ERROR|aniversario_sin_monto"
);
caso(
  "(f) una parte del club SIN canjear nada → cumple_sin_canje (el candado de siempre, ahora para cualquier ventaja del club)",
  SEDE() + CON_VALE("f", "90996031", "966996031") + como(FELIPE) +
    VENDER("v", { lineas: items(item({ club: 20 })), clienta: ":'f'" }) + `select :'v';\n`,
  "ERROR|cumple_sin_canje"
);

// =====================================================================================================================
// g. Anular libera; una devolución no
// =====================================================================================================================
caso(
  "(g) anular la venta libera el vale (con la hora y la persona de la anulación) y se vuelve a canjear: un canje vivo, dos en la historia",
  SEDE() + CON_VALE("f", "90997001", "966997001") + como(FELIPE) +
    VENDER("venta", { lineas: items(item({ club: 20 })), clienta: ":'f'", aniv: "true" }) +
    `reset role;
select id as item from retail.venta_items where venta_id::text = :'venta' \\gset
` + como(FELIPE) +
    `select retail.anular_venta(:'venta', 'prueba club_aniversario', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'condicion', 'vendible'))) as _an \\gset
reset role;
select k.anulado_en = v.anulado_en, k.anulado_por = :'persona_felipe' from retail.club_canjes k join retail.ventas v on v.id = k.venta_id where k.venta_id::text = :'venta';
` + como(FELIPE) + `select vale_disponible from retail.fn_club_aniversario(:'f');\n` +
    VENDER("otra", { lineas: items(item({ club: 20 })), clienta: ":'f'", aniv: "true" }) +
    `reset role;
select (select count(*) from retail.club_canjes where clienta_id = :'f' and anulado_en is null), (select count(*) from retail.club_canjes where clienta_id = :'f'),
       (select venta_id::text = :'otra' from retail.club_canjes where clienta_id = :'f' and anulado_en is null);
`,
  "t|t\nt\n1|2|t"
);
caso(
  "(g) una devolución (registrada y aprobada) NO libera el vale: el siguiente canje sigue siendo aniversario_ya_canjeado",
  SEDE() + CON_VALE("f", "90997011", "966997011") + como(FELIPE) +
    VENDER("venta", { lineas: items(item({ club: 20 })), clienta: ":'f'", aniv: "true" }) +
    `reset role;
select id as item from retail.venta_items where venta_id::text = :'venta' \\gset
` + como(FELIPE) +
    `select retail.crear_devolucion(:'venta', :'ubic', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'cantidad', 1, 'condicion', 'vendible')), 'prueba club_aniversario', 'otro') as dev \\gset
` + como(SANDRA) + intentoCon(`select retail.aprobar_devolucion(%L, null, null)`, ":'dev'") +
    como(FELIPE) + VENDER("otra", { lineas: items(item({ club: 20 })), clienta: ":'f'", aniv: "true" }) +
    `select :'otra';
reset role;
select (select estado from retail.devoluciones where id = :'dev'), (select count(*) from retail.club_canjes where clienta_id = :'f' and anulado_en is null);
`,
  "SIN_ERROR\nERROR|aniversario_ya_canjeado\naprobada|1"
);

// =====================================================================================================================
// h. Estructura
// =====================================================================================================================
caso(
  "(h) una sola firma de registrar_venta (la de 18) y la llamada de la web resuelve con p_canjear_aniversario por nombre",
  `select count(*), to_regprocedure('${RV_HOY}') is not null from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_venta';
explain select retail.registrar_venta(p_ubicacion_id => gen_random_uuid(), p_items => '[]'::jsonb, p_pagos => '[]'::jsonb,
  p_token => gen_random_uuid(), p_cliente_id => null, p_canjear_aniversario => true);
`,
  (s) => s.startsWith("1|t\n") && s.includes("Result")
);
caso(
  "(h) permisos: registrar_venta, fn_club_aniversario y resumen_clienta_caja solo authenticated (sin PUBLIC ni anon); los ayudantes del aniversario, nadie de la API",
  `select string_agg(proname || ':' || coalesce(array_to_string(proacl, ','), ''), ' ' order by proname) from pg_proc
 where oid in ('${RV_HOY}'::regprocedure, 'retail.fn_club_aniversario(uuid)'::regprocedure, 'retail.resumen_clienta_caja(uuid)'::regprocedure);
select bool_or(has_function_privilege(r, f::regprocedure, 'execute'))
  from unnest(array['retail.fn_club_aniversario_calculo(uuid)', 'retail.fn_club_monto_neto_venta(uuid)', 'retail.fn_club_beneficios()']) f,
       unnest(array['anon', 'authenticated']) r;
`,
  "fn_club_aniversario:postgres=X/postgres,authenticated=X/postgres registrar_venta:postgres=X/postgres,authenticated=X/postgres resumen_clienta_caja:postgres=X/postgres,authenticated=X/postgres\nf"
);
caso(
  "(h) fn_club_aniversario y resumen_clienta_caja exigen el módulo «Clientas» (Micaela sin él → clientas_sin_modulo)",
  `delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';\n` +
    como(MICAELA) + intento(`select * from retail.fn_club_aniversario(gen_random_uuid())`) + intento(`select * from retail.resumen_clienta_caja(gen_random_uuid())`),
  "42501|clientas_sin_modulo\n42501|clientas_sin_modulo"
);
caso(
  "(h) los candados de club_canjes (insert directo, como postgres): aniversario con %, sin año de club o cumpleaños con año de club o sin % → rechazados; dos aniversarios vivos del mismo año de club → el único parcial",
  SEDE() + CON_VALE("f", "90998001", "966998001") + como(FELIPE) +
    VENDER("venta", { lineas: items(item({ club: 20 })), clienta: ":'f'", aniv: "true" }) +
    `reset role;\n` +
    intentoCon(`insert into retail.club_canjes (clienta_id, venta_id, tipo, anio, anio_club, pct, monto) values (%L, %L, 'aniversario', 2030, 2, 10, 5)`, ":'f'", ":'venta'") +
    intentoCon(`insert into retail.club_canjes (clienta_id, venta_id, tipo, anio, monto) values (%L, %L, 'aniversario', 2030, 5)`, ":'f'", ":'venta'") +
    intentoCon(`insert into retail.club_canjes (clienta_id, venta_id, tipo, anio, anio_club, pct, monto) values (%L, %L, 'cumpleanos', 2030, 1, 10, 5)`, ":'f'", ":'venta'") +
    intentoCon(`insert into retail.club_canjes (clienta_id, venta_id, tipo, anio, monto) values (%L, %L, 'cumpleanos', 2030, 5)`, ":'f'", ":'venta'") +
    intentoCon(`insert into retail.club_canjes (clienta_id, venta_id, tipo, anio, anio_club, monto) values (%L, %L, 'aniversario', 2031, 1, 5)`, ":'f'", ":'venta'"),
  (s) => {
    const l = s.split("\n");
    return (
      l.length === 5 &&
      l[0].includes("club_canjes_pct_valido") &&
      l[1].includes("club_canjes_anio_club_valido") &&
      l[2].includes("club_canjes_anio_club_valido") &&
      l[3].includes("club_canjes_pct_valido") &&
      l[4].startsWith("23505|") && l[4].includes("club_canjes_aniversario_uno_vivo")
    );
  }
);
caso(
  "(h) configuracion_empresa: los defaults del aniversario (6, 600, 60) y su candado (compras 0, monto 0 o días 181 → rechazados); la escala sembrada 20/30/40/50/60",
  `select column_default from information_schema.columns where table_schema = 'retail' and table_name = 'configuracion_empresa'
   and column_name in ('club_aniversario_compras', 'club_aniversario_monto', 'club_aniversario_dias') order by column_name;
select string_agg(anio || '=' || monto, ',' order by anio) from retail.club_aniversario_escala;
insert into retail.configuracion_empresa (ruc, razon_social) values ('20000000001', 'Prueba Club SAC') on conflict (id) do nothing;
` + intento(`update retail.configuracion_empresa set club_aniversario_compras = 0`) +
    intento(`update retail.configuracion_empresa set club_aniversario_monto = 0`) +
    intento(`update retail.configuracion_empresa set club_aniversario_dias = 181`),
  (s) => {
    const l = s.split("\n");
    return (
      l[0] === "6" && l[1] === "60" && l[2] === "600" && l[3] === "1=20.00,2=30.00,3=40.00,4=50.00,5=60.00" &&
      l.slice(4).every((x) => x.startsWith("23514|") && x.includes("configuracion_empresa_club_aniversario_valido"))
    );
  }
);

// =====================================================================================================================
// j. Dos cajas a la vez (dos conexiones reales)
// =====================================================================================================================
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const esperarA = (app) => `do $espera$ begin
  for i in 1..200 loop
    perform pg_stat_clear_snapshot();
    exit when exists (select 1 from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep');
    perform pg_sleep(0.05);
  end loop;
end $espera$;
select exists (select 1 from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep');
`;
const DONDE_ESPERA = `
create function pg_temp.donde_espera(p_ubic uuid, p_items jsonb, p_clienta uuid) returns text language plpgsql as $f$
declare v_estado text; v_contexto text; v_hint text;
begin
  perform retail.registrar_venta(p_ubicacion_id => p_ubic, p_items => p_items,
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto',
      (select sum(((e ->> 'precio_unitario')::numeric - (e ->> 'descuento_unitario')::numeric) * (e ->> 'cantidad')::integer) from jsonb_array_elements(p_items) e))),
    p_cliente_id => p_clienta, p_token => gen_random_uuid(), p_canjear_aniversario => true);
  return 'SIN_ESPERA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_contexto = pg_exception_context, v_hint = pg_exception_hint;
  return v_estado || '|' || case when v_estado <> '55P03' then coalesce(v_hint, '')
                                 when v_contexto ~* 'from retail\\.clientas c where c\\.id = p_cliente_id'
                                   or (v_contexto ~* 'locking tuple .* in relation "clientas"' and v_contexto ~* 'at FOR over SELECT rows')
                                   then 'en la lectura de la ficha'
                                 else 'en otra sentencia: ' || regexp_replace(v_contexto, '\\s+', ' ', 'g') end;
end $f$;
grant execute on function pg_temp.donde_espera(uuid, jsonb, uuid) to authenticated;
`;
async function carrera(nombre, fn) {
  casos++;
  let obtenido;
  let bien;
  try {
    [bien, obtenido] = await fn();
  } catch (e) {
    [bien, obtenido] = [false, `ERROR_DE_SCRIPT ${e.message}`];
  }
  if (!bien) fallas++;
  console.log(`${bien ? "✓" : "✗"} ${nombre}${bien ? "" : `\n    obtenido: ${String(obtenido).split("\n").join("\n              ")}`}`);
}
const LINEA_VALE = items(item({ club: 20 }));

await carrera(
  "(j1) una caja canjea el vale de una socia y, mientras guarda, otra caja canjea el MISMO vale: la segunda ESPERA en la lectura de la ficha (sin COMMIT: las dos terminan en ROLLBACK)",
  async () => {
    const ficha = correr(`select id from retail.clientas where not anonimizada and archivada_en is null and fusionada_en_id is null
  and documento_tipo = 'dni' and documento_numero is not null and nombre is not null and club_desde is null order by documento_numero limit 1;`);
    if (!ficha.ok || !ficha.salida) return [false, `no hay fichas en la base: ${ficha.mensaje ?? ""}`];
    const dni = correr(`select documento_numero from retail.clientas where id = '${ficha.salida}';`).salida;
    const app = `club_aniversario_a_${Date.now()}`;
    const a = psqlEnParalelo(`set application_name = '${app}';
${PRELUDIO_BASE}${SEDE()}reset role;
select pg_temp.socia('${dni}', '966998801', (retail.fn_hoy_lima() - interval '1 year' - interval '3 days')::date, :'ubic') as f \\gset
select pg_temp.compras_en_anio(:'f', :'ubic', 1, 6, 50) as _c \\gset
${como(FELIPE)}${VENDER("venta", { lineas: LINEA_VALE, clienta: ":'f'", aniv: "true" })}select :'venta' ~ '^[0-9a-f-]{36}$';
select pg_sleep(3);
rollback;
`);
    await dormir(100);
    const b = await psqlEnParalelo(`${PRELUDIO_BASE}${DONDE_ESPERA}${SEDE("Tienda Trujillo")}${esperarA(app)}set local lock_timeout = '1s';
${como(FELIPE)}select pg_temp.donde_espera(:'ubic', ${LINEA_VALE}, '${ficha.salida}');
rollback;
`);
    const ra = await a;
    const obtenido = `${ra.ok ? `A: ${ra.salida}` : `A falló: ${ra.mensaje}`}\n${b.ok ? b.salida : `B falló: ${b.mensaje}`}`;
    return [ra.ok && ra.salida.endsWith("t") && b.ok && b.salida === "t\n55P03|en la lectura de la ficha", obtenido];
  }
);

if (process.env.BASE_DESECHABLE === "1") {
  await carrera(
    "(j2) con COMMIT: dos cajas canjean a la vez el mismo vale → pasa UNA y la otra recibe aniversario_ya_canjeado; un solo canje vivo",
    async () => {
      const dni = `7${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
      const cel = `96${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
      const prep = correr(`${PRELUDIO_BASE}reset role;
select pg_temp.socia('${dni}', '${cel}', (retail.fn_hoy_lima() - interval '1 year' - interval '3 days')::date, :'ubic') as f \\gset
select pg_temp.compras_en_anio(:'f', :'ubic', 1, 6, 50) as _c \\gset
select :'f';
commit;`);
      if (!prep.ok) return [false, prep.mensaje];
      const f = prep.salida.split("\n").pop();
      const caja = (app, tienda, dormirS) => `set application_name = '${app}';
${PRELUDIO_BASE}${SEDE(tienda)}${como(FELIPE)}${VENDER("venta", { lineas: LINEA_VALE, clienta: `'${f}'`, aniv: "true" })}select :'venta';
${dormirS ? `select pg_sleep(${dormirS});` : ""}
commit;
`;
      const app = `club_aniversario_j2_${Date.now()}`;
      const a = psqlEnParalelo(caja(app, "Tienda Lima", 3));
      await dormir(100);
      const b = await psqlEnParalelo(`${esperarA(app)}${caja(`${app}_b`, "Tienda Trujillo", 0)}`);
      const ra = await a;
      const vivos = correr(`select count(*) from retail.club_canjes where clienta_id = '${f}' and anulado_en is null and tipo = 'aniversario';`);
      const idA = ra.ok ? ra.salida.split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l)) : null;
      const obtenido = `A: ${ra.ok ? ra.salida : ra.mensaje}\nB: ${b.ok ? b.salida : b.mensaje}\nvivos: ${vivos.salida ?? vivos.mensaje}`;
      return [Boolean(idA) && b.ok && b.salida.endsWith("ERROR|aniversario_ya_canjeado") && vivos.salida === "1", obtenido];
    }
  );
} else {
  console.log("· (j2), la carrera con COMMIT, no corrió: solo corre con BASE_DESECHABLE=1 (deja una socia de prueba)");
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

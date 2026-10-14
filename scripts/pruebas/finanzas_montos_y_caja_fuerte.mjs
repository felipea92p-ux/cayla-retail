#!/usr/bin/env node
/**
 * Prueba de `20261015002000_finanzas_montos_y_textos_parte1.sql` y `20261015003000_finanzas_caja_fuerte_y_gasto_desde_el_inicio_parte2.sql`
 * (/chaos de Finanzas 2026-10-14, ADR-0412).
 *
 * EL PROBLEMA QUE PRUEBA. Por la API entraban un `NaN` en el saldo inicial de una cuenta, un gasto fijo, el mínimo de caja y un
 * activo; un gasto o un aporte de S/ 99 999 999; una descripción de 5000 letras; un retiro de la caja fuerte que no tenía esa plata
 * (saldo negativo); y un gasto fechado en 1990, antes del inicio de Finanzas. Aquí cada caso se rechaza con su candado o su `hint`, lo
 * válido pasa igual (los bordes exactos, el banco que sí puede quedar en negativo) y hay control: sin las migraciones, todo entraba.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK. Los disparadores de la caja fuerte son DIFERIDOS (miran al confirmar):
 * cada caso corre `set constraints all immediate` para verlos sin confirmar.
 *
 * USO: pnpm pruebas:finanzas-montos-y-caja-fuerte   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const PARTE1 = readFileSync(join(RAIZ, "supabase/migrations/20261015002000_finanzas_montos_y_textos_parte1.sql"), "utf8");
const PARTE2 = readFileSync(join(RAIZ, "supabase/migrations/20261015003000_finanzas_caja_fuerte_y_gasto_desde_el_inicio_parte2.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

// El control quita, dentro de la misma transacción, lo que pone cada parte: los candados de la 1; los disparadores y el bloque de la 2.
const CANDADOS = [...PARTE1.matchAll(/select pg_temp\.candado\('([a-z_]+)', '([a-z_]+)'/g)].map((m) => ({ tabla: m[1], nombre: m[2] }));
if (CANDADOS.length !== 16) throw new Error(`esperaba 16 candados y encontré ${CANDADOS.length}`);
const sinCandados = CANDADOS.map((c) => `alter table retail.${c.tabla} drop constraint if exists ${c.nombre};`).join("\n");
const DISPARADORES = [...PARTE2.matchAll(/create constraint trigger ([a-z_]+)\s+after [^;]*? on (retail\.[a-z_]+)/g)].map((m) => ({ nombre: m[1], tabla: m[2] }));
if (DISPARADORES.length !== 7) throw new Error(`esperaba 7 disparadores y encontré ${DISPARADORES.length}`);
const sinDisparadores = DISPARADORES.map((d) => `drop trigger if exists ${d.nombre} on ${d.tabla};`).join("\n");
const BLOQUE_FECHA = PARTE2.match(/\$v\$  if p_fecha is null or p_fecha > retail\.fn_hoy_lima\(\) then\$v\$, 1,\s*\$v\$([\s\S]*?)\$v\$,/)?.[1];
if (!BLOQUE_FECHA) throw new Error("no encontré el bloque de la fecha del gasto");
const sinFecha = `do $d$ begin execute replace(pg_get_functiondef('retail.registrar_gasto(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, uuid, uuid, uuid)'::regprocedure), $n$${BLOQUE_FECHA}$n$, ''); end $d$;`;
// Los bloques del token (TOK-F1 a F3): el control los quita para mostrar que sin ellos el segundo envío devolvía lo del primero.
const DEL_TOKEN = [...PARTE2.matchAll(/select pg_temp\.insertar_antes\(\s*'(retail\.[^']+)',\s*\$v\$[\s\S]*?\$v\$, \d+,\s*\$v\$([\s\S]*?)\$v\$,/g)]
  .map((m) => ({ firma: m[1], bloque: m[2] })).filter((b) => b.bloque.includes("fn_intento_con_huella("));
if (DEL_TOKEN.length !== 3) throw new Error(`esperaba 3 bloques de token y encontré ${DEL_TOKEN.length}`);
const sinToken = DEL_TOKEN.map((b) => `do $d$ begin execute replace(pg_get_functiondef('${b.firma}'::regprocedure), $n$${b.bloque}$n$, ''); end $d$;`).join("\n");

/** El saldo de una cuenta con la misma fórmula de Cuentas y dinero (`fn_cuentas_dinero_saldos`). */
const SALDO = (cuenta) => `(select c.saldo_inicial + coalesce((select sum(l.monto) from retail.fn_dinero_libro('9999-12-31'::date) l
  where l.cuenta_id = c.id and (c.saldo_desde is null or l.fecha >= c.saldo_desde)), 0) from retail.cuentas_dinero c where c.id = :'${cuenta}')`;

// Todo sale del seed por su nombre (los ids cambian en cada base). La caja fuerte arranca con un aporte de S/ 100 de la propia prueba,
// dentro de la transacción: así su saldo es conocido sea cual sea la base.
function preparar({ sinMontos = false, sinCaja = false, sinFechaInicio = false, sinTokens = false } = {}) {
  return `
begin;
${PARTE1}
${PARTE2}
${sinMontos ? sinCandados : ""}
${sinCaja ? sinDisparadores : ""}
${sinFechaInicio ? sinFecha : ""}
${sinTokens ? sinToken : ""}
set local request.jwt.claim.sub = '${FELIPE}';
set constraints all immediate;
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as fuerte from retail.cuentas_dinero where tipo = 'caja_fuerte' and ubicacion_id = :'lima' \\gset
select retail.crear_cuenta_dinero('ZZ Banco de prueba', 'banco', 0) as banco \\gset
select retail.registrar_movimiento_dinero('aporte', 100, null, :'fuerte', current_date, 'colchón de prueba', 0, null, null, gen_random_uuid()) as _aporte \\gset
select ${SALDO("fuerte")} as saldo \\gset
`;
}

let fallas = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 5).join("\n    ")}`);
  }
}
const rechaza = (r, marca) => !r.ok && r.error.includes(marca);

const gasto = (monto, { descripcion = "'Luz'", fecha = "current_date", cuenta = "null", medio = "'transferencia'" } = {}) =>
  `select retail.registrar_gasto(:'lima', 'servicios_basicos', ${descripcion}, ${fecha}, ${monto}, null, ${medio}, null, null, null, gen_random_uuid(), null, ${cuenta});`;
const movimiento = (tipo, monto, origen, destino) =>
  `select retail.registrar_movimiento_dinero('${tipo}', ${monto}, ${origen}, ${destino}, current_date, null, 0, null, null, gen_random_uuid());`;

// --- 1. Montos que no son números, montos gigantes y textos sin tope: rechazados por la tabla, con control ---
const ATAQUES = [
  ["el saldo inicial de una cuenta en NaN", `select retail.crear_cuenta_dinero('ZZ Cuenta de prueba', 'banco', 'NaN'::numeric);`, "cuentas_dinero_montos_finitos"],
  ["un gasto fijo en NaN", `select retail.guardar_gasto_fijo(null, :'lima', 'servicios_basicos', 'Luz', null, 'factura', 'NaN'::numeric, false, 5);`, "gastos_fijos_montos_finitos"],
  ["el mínimo de caja en NaN", `select retail.guardar_parametros_finanzas('NaN'::numeric, 10, 5);`, "parametros_finanzas_montos_finitos"],
  ["un activo en NaN", `select retail.registrar_activo(:'lima', 'equipos', 'Parlante', current_date, 'NaN'::numeric, null, 'transferencia');`, "activos_fijos_montos_finitos"],
  ["un gasto de S/ 1 000 000.01", gasto("1000000.01"), "gastos_monto_con_tope"],
  ["un aporte de S/ 99 999 999 a la caja fuerte", movimiento("aporte", 99999999, "null", ":'fuerte'"), "movimientos_dinero_monto_con_tope"],
  ["una descripción de gasto de 201 letras", gasto(50, { descripcion: "repeat('x', 201)" }), "gastos_textos_con_tope"],
];
for (const [nombre, sql, candado] of ATAQUES) {
  const sin = correr(`${preparar({ sinMontos: true })}${sql}`);
  esperar(`CONTROL sin la migración: ${nombre} entraba`, sin.ok, sin.error);
  esperar(`${nombre} se rechaza (${candado})`, rechaza(correr(`${preparar()}${sql}`), candado), "pasó");
}
{
  const r = correr(`${preparar()}${gasto(1000000)}${gasto(50, { descripcion: "repeat('y', 200)" })}
select retail.crear_cuenta_dinero(repeat('z', 80), 'banco', 0);
select 'ok|bordes';`);
  esperar("lo válido entra igual: un gasto de S/ 1 000 000 justo, 200 letras de descripción y 80 de nombre de cuenta", r.ok && r.salida.includes("ok|bordes"), r.error);
}

// --- 2. La caja fuerte no queda bajo cero ---
{
  const retiro = `${movimiento("retiro", ":'saldo'::numeric + 0.01", ":'fuerte'", "null")}`;
  const sin = correr(`${preparar({ sinCaja: true })}${retiro}`);
  esperar("CONTROL sin la migración: un retiro de un céntimo más de lo que hay en la caja fuerte entraba", sin.ok, sin.error);
  esperar("un retiro de más de lo que hay en la caja fuerte se rechaza (efectivo_insuficiente)", rechaza(correr(`${preparar()}${retiro}`), "efectivo_insuficiente"), "pasó");
  const justo = correr(`${preparar()}${movimiento("retiro", ":'saldo'::numeric", ":'fuerte'", "null")}
select 'queda|' || ${SALDO("fuerte")};`);
  esperar("sacar TODO lo que hay en la caja fuerte se acepta y la deja en cero", justo.ok && /queda\|0(\.00)?$/m.test(justo.salida), justo.salida || justo.error);
}
{
  const r = correr(`${preparar()}${gasto(":'saldo'::numeric + 10", { medio: "'efectivo'", cuenta: ":'fuerte'" })}`);
  esperar("un gasto pagado desde la caja fuerte por más de lo que tiene se rechaza", rechaza(r, "efectivo_insuficiente"), r.salida || "pasó");
  const m = r.error?.match(/quedaría en S\/ (-?\d+\.\d{2})/)?.[1];
  esperar("el mensaje dice en cuánto quedaría (para quien ve esa cuenta)", m === "-10.00", r.error);
}
{
  // El aporte de la preparación es lo único que deja sacar: anularlo después de gastarlo la dejaría en negativo.
  const r = correr(`${preparar()}${movimiento("retiro", ":'saldo'::numeric", ":'fuerte'", "null")}
select retail.anular_movimiento_dinero(:'_aporte', 'se registró dos veces');`);
  esperar("anular un aporte que ya se gastó se rechaza (la caja fuerte quedaría bajo cero)", rechaza(r, "efectivo_insuficiente"), r.salida || r.error || "pasó");
}
{
  const r = correr(`${preparar()}${movimiento("retiro", 500, ":'banco'", "null")}
select 'banco|' || ${SALDO("banco")};`);
  esperar("el banco SÍ puede quedar en negativo (su saldo puede estar incompleto hasta conciliarlo)", r.ok && /banco\|-/.test(r.salida), r.salida || r.error);
}
{
  const r = correr(`${preparar()}${movimiento("aporte", 50, "null", ":'fuerte'")}${movimiento("retiro", ":'saldo'::numeric + 50", ":'fuerte'", "null")}
select 'ok|despues_de_aportar';`);
  esperar("lo que entra antes cuenta: aportar y después sacar todo se acepta", r.ok && r.salida.includes("ok|despues_de_aportar"), r.error);
}

// --- 3. Un gasto anterior al inicio de Finanzas ---
{
  const conInicio = `update retail.parametros_finanzas set inicio_finanzas = date_trunc('month', current_date)::date where id;\n`;
  const sin = correr(`${preparar({ sinFechaInicio: true })}${conInicio}${gasto(50, { fecha: "'1990-01-01'::date" })}`);
  esperar("CONTROL sin la migración: un gasto fechado en 1990 entraba", sin.ok, sin.error);
  esperar("un gasto anterior al inicio de Finanzas se rechaza (gasto_antes_del_inicio)",
    rechaza(correr(`${preparar()}${conInicio}${gasto(50, { fecha: "'1990-01-01'::date" })}`), "gasto_antes_del_inicio"), "pasó");
  const elDia = correr(`${preparar()}${conInicio}${gasto(50, { fecha: "date_trunc('month', current_date)::date" })}`);
  esperar("un gasto del mismo día del inicio se acepta", elDia.ok, elDia.error);
  const sinInicio = correr(`${preparar()}update retail.parametros_finanzas set inicio_finanzas = null where id;\n${gasto(50, { fecha: "current_date - 400" })}`);
  esperar("sin un inicio elegido, la fecha no se frena (solo la futura, como siempre)", sinInicio.ok, sinInicio.error);
}

// --- 4. El token sigue al contenido en Finanzas (TOK-F1 a F3) ---
{
  const t = "c0ffee00-0000-4000-8000-000000014121";
  const CASOS = [
    ["registrar_movimiento_dinero: un aporte de 100 y luego de 300",
      (m) => `retail.registrar_movimiento_dinero('aporte', ${m}, null, :'fuerte', current_date, null, 0, null, null, '${t}')`, [100, 300]],
    ["registrar_activo: un parlante de 900 y luego de 3000",
      (m) => `retail.registrar_activo(:'lima', 'equipos', 'Parlante', current_date, ${m}, null, 'transferencia', null, null, null, null, null, '${t}')`, [900, 3000]],
    ["cargar_activo_inicial: un parlante de 900 y luego de 3000",
      (m) => `retail.cargar_activo_inicial(:'lima', 'equipos', 'Parlante', current_date - 30, ${m}, null, null, null, '${t}')`, [900, 3000]],
  ];
  const dos = (f, [a, b], opciones) => correr(`${preparar(opciones)}select 'uno|' || ${f(a)};\nselect 'dos|' || ${f(b)};`);
  const iguales = (r) => r.ok && r.salida.match(/^uno\|(.*)$/m)?.[1] === r.salida.match(/^dos\|(.*)$/m)?.[1];
  for (const [nombre, f, montos] of CASOS) {
    const sin = dos(f, montos, { sinTokens: true });
    esperar(`CONTROL ${nombre}: sin la migración, el segundo devolvía lo del primero`, iguales(sin), sin.salida || sin.error);
    esperar(`${nombre}: el segundo se rechaza (token_reusado)`, rechaza(dos(f, montos), "token_reusado"), "pasó");
    const repetido = dos(f, [montos[0], montos[0]]);
    esperar(`${nombre}: el reintento con LO MISMO devuelve lo mismo`, iguales(repetido), repetido.salida || repetido.error);
  }
}

// --- 5. Concurrencia: dos retiros de toda la caja fuerte a la vez. El segundo espera al primero. ---
function sesion(sql) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ ok: code === 0, salida: out.trim(), error: err, ms: Date.now() - inicio }));
    p.stdin.end(`${sql}\nrollback;\n`);
  });
}
{
  // Sin pegar las migraciones dentro de cada sesión (un `create or replace` también esperaría y la prueba pasaría sin el candado).
  const retiraTodo = (dormir) => `begin;
set local request.jwt.claim.sub = '${FELIPE}';
set constraints all immediate;
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as fuerte from retail.cuentas_dinero where tipo = 'caja_fuerte' and ubicacion_id = :'lima' \\gset
select retail.registrar_movimiento_dinero('aporte', 100, null, :'fuerte', current_date, null, 0, null, null, gen_random_uuid()) as _a \\gset
select pg_sleep(${dormir});`;
  const primera = sesion(retiraTodo(2.5));
  await new Promise((r) => setTimeout(r, 1000));
  const segunda = await sesion(retiraTodo(0));
  const p = await primera;
  esperar("concurrencia: un segundo movimiento de la misma caja fuerte espera a que el primero termine", p.ok && segunda.ok && segunda.ms >= 1000,
    `primera: ${p.ok ? "ok" : p.error} · segunda (${segunda.ms} ms): ${segunda.ok ? "ok" : segunda.error}`);
}

// --- 6. Las dos partes se pueden pegar dos veces ---
{
  const r = correr(`begin;\n${PARTE1}\n${PARTE1}\n${PARTE2}\n${PARTE2}
select 'validados|' || count(*) filter (where convalidated) || '/' || count(*) from pg_constraint
 where conname in (${CANDADOS.map((c) => `'${c.nombre}'`).join(", ")});
select 'disparadores|' || count(*) from pg_trigger where tgname like '%_efectivo_en_cuenta';
select 'fecha|' || (length(d) - length(replace(d, 'gasto_antes_del_inicio', ''))) / length('gasto_antes_del_inicio')
  from (select pg_get_functiondef('retail.registrar_gasto(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, uuid, uuid, uuid)'::regprocedure) d) x;
select 'huellas|' || sum((length(d) - length(replace(d, 'fn_intento_con_huella(', ''))) / length('fn_intento_con_huella('))
  from (select pg_get_functiondef(oid) d from pg_proc where pronamespace = 'retail'::regnamespace
         and proname in ('registrar_movimiento_dinero', 'registrar_activo', 'cargar_activo_inicial')) x;`);
  esperar("las dos partes se pueden pegar dos veces: 16 candados validados, 7 disparadores, el chequeo de la fecha y las tres huellas una sola vez",
    r.ok && r.salida.includes("validados|16/16") && r.salida.includes("disparadores|7") && r.salida.includes("fecha|2") && r.salida.includes("huellas|3"), r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Pruebas del módulo «Beneficios del club» (actividad 8 de 12; migración `20261019215000_club_puntos_modulo_beneficios.sql`).
 *
 * EL PROBLEMA. El líder cambia sin deploy lo que se le ofrece al cliente (cuánto vale cada punto, desde cuántos se canjea, cuánto dura un
 * cupón, el regalo de cumpleaños) y necesita ver, antes de guardar, lo que cuesta y qué cambió la última vez. Una cifra equivocada (la deuda
 * en soles, un cambio programado que no aparece) lo haría decidir a ciegas.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`):
 *   a. El líder lee la configuración de arranque (1 punto por sol, 100 puntos = S/ 5, canje desde 200, cupón desde 3×, 7 días, regalo 100,
 *      tope 2 %), sin versión programada.
 *   b. Un cambio de lo que valen los puntos queda PROGRAMADO a 15 días: la vigente no cambia, la programada aparece con su fecha, y el
 *      historial dice quién lo hizo y qué había antes y después.
 *   c. Las cifras suben con lo que pasa: puntos en circulación, miembros con puntos, la deuda en soles (cientos completos por miembro) y
 *      los cupones vivos con su valor, contados contra lo que ya había (la base es compartida).
 *   d. Un cupón usado este mes entra en «canjeado este mes».
 *   e. Quién puede: el módulo nace SIN rol (el integrante recibe 42501), el líder sí, y no hay ninguna fila en `rol_modulos`.
 *
 * USO
 *   pnpm pruebas:club-puntos-beneficios                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-puntos-beneficios --base cayla_x    → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo

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

-- Una miembro con p_saldo puntos (sin cuenta web: no hace falta aquí).
create function pg_temp.miembro(p_dni text, p_saldo integer) returns uuid language plpgsql as $f$
declare v uuid;
begin
  insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club, registro_origen)
  values ('dni', p_dni, 'BENEFICIOS PRUEBA', '9' || substr(p_dni, 1, 8), now(), retail.fn_club_codigo_nuevo(), 'caja') returning id into v;
  if p_saldo > 0 then
    perform retail.fn_club_puntos_anotar(v, 'compra', p_saldo, null, null, 'prueba');
  end if;
  return v;
end;
$f$;
`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${FUNCIONES_DE_PRUEBA}
select (now() at time zone 'America/Lima')::date as hoy \\gset
update retail.configuracion_empresa set exige_responsable = false;
`;

const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;

let casos = 0;
let fallas = 0;
function reportar(nombre, ok, obtenido) {
  casos++;
  if (!ok) fallas++;
  console.log(`${ok ? "✔" : "✘"} ${nombre}`);
  if (!ok) console.log(`    obtenido:\n${String(obtenido).replace(/^/gm, "      ")}`);
}
function caso(nombre, cuerpo, esperado) {
  const r = correr(`${PRELUDIO}${cuerpo}\nrollback;\n`);
  if (!r.ok) return reportar(nombre, false, r.mensaje);
  const ultima = r.salida.split("\n").filter((l) => l !== "").pop() ?? "";
  reportar(nombre, ultima === esperado, r.salida);
}

// Para que la prueba no dependa de lo que ya haya en la base compartida: empieza con la configuración de arranque en todo lo que se lee.
const ARRANQUE = `
-- Sin versiones programadas ni cambios anteriores en esta transacción: lo que se lee es lo que se acaba de poner.
delete from retail.club_puntos_config where vigente_desde > :'hoy'::date;
`;

caso(
  "(a) el líder lee la configuración vigente y ninguna programada",
  `${ARRANQUE}${como(FELIPE)}select retail.resumen_beneficios_puntos() as r \\gset
select concat_ws('|', (:'r'::jsonb -> 'vigente' ->> 'puntos_por_sol'), (:'r'::jsonb -> 'vigente' ->> 'soles_por_100'), (:'r'::jsonb -> 'vigente' ->> 'canje_minimo'),
  (:'r'::jsonb -> 'vigente' ->> 'compra_minima_x'), (:'r'::jsonb -> 'vigente' ->> 'vigencia_dias'), (:'r'::jsonb -> 'vigente' ->> 'regalo_cumple'),
  (:'r'::jsonb -> 'vigente' ->> 'tope_costo_pct'), coalesce(:'r'::jsonb ->> 'programada', 'ninguna'));`,
  "1.00|5.00|200|3.00|7|100|2.00|ninguna"
);
caso(
  "(b) un cambio de lo que valen los puntos queda PROGRAMADO a 15 días: la vigente no cambia, la programada trae su fecha y el historial, quién y qué",
  `${ARRANQUE}${como(FELIPE)}select retail.guardar_beneficios_puntos(1, 4, 200, 3, 7, 100, 2) as desde \\gset
select retail.resumen_beneficios_puntos() as r \\gset
select concat_ws('|', (:'r'::jsonb -> 'vigente' ->> 'soles_por_100'), (:'r'::jsonb -> 'programada' ->> 'soles_por_100'),
  (:'r'::jsonb -> 'programada' ->> 'desde') = (:'hoy'::date + 15)::text, (:'desde'::date = :'hoy'::date + 15),
  (:'r'::jsonb -> 'historial' -> 0 -> 'antes' ->> 'soles_por_100'), (:'r'::jsonb -> 'historial' -> 0 -> 'despues' ->> 'soles_por_100'),
  coalesce(:'r'::jsonb -> 'historial' -> 0 ->> 'quien', 'sin nombre') <> 'sin nombre');`,
  "5.00|4.00|t|t|5.00|4|t"
);
caso(
  "(c) las cifras suben con lo que pasa: circulación, miembros con puntos, deuda en soles (cientos completos por miembro) y cupones vivos",
  `${ARRANQUE}${como(FELIPE)}select retail.resumen_beneficios_puntos() as a \\gset
reset role;
select pg_temp.miembro('79700001', 1240) as m1 \\gset
select pg_temp.miembro('79700002', 99) as m2 \\gset
${como(FELIPE)}select (retail.canjear_puntos(:'m1', 200))::jsonb ->> 'codigo' as cod \\gset
select retail.resumen_beneficios_puntos() as b \\gset
select concat_ws('|',
  -- circulación: +1 240 +99 −200 del canje = +1 139; miembros con puntos: +2; deuda: floor(1040/100)=10 y floor(99/100)=0 → +10 cientos × S/ 5
  ((:'b'::jsonb -> 'cifras' ->> 'puntos_en_circulacion')::int - (:'a'::jsonb -> 'cifras' ->> 'puntos_en_circulacion')::int),
  ((:'b'::jsonb -> 'cifras' ->> 'miembros_con_puntos')::int - (:'a'::jsonb -> 'cifras' ->> 'miembros_con_puntos')::int),
  ((:'b'::jsonb -> 'cifras' ->> 'deuda_soles')::numeric - (:'a'::jsonb -> 'cifras' ->> 'deuda_soles')::numeric),
  ((:'b'::jsonb -> 'cifras' ->> 'cupones_vivos')::int - (:'a'::jsonb -> 'cifras' ->> 'cupones_vivos')::int),
  ((:'b'::jsonb -> 'cifras' ->> 'cupones_vivos_soles')::numeric - (:'a'::jsonb -> 'cifras' ->> 'cupones_vivos_soles')::numeric));`,
  "1139|2|50.00|1|10.00"
);
caso(
  "(d) un cupón usado este mes entra en «canjeado este mes» (cuántos y cuántos soles)",
  `${ARRANQUE}${como(FELIPE)}select retail.resumen_beneficios_puntos() as a \\gset
reset role;
select pg_temp.miembro('79700003', 600) as m \\gset
${como(FELIPE)}select (retail.canjear_puntos(:'m', 200))::jsonb ->> 'codigo' as cod \\gset
reset role;
update retail.club_cupones set estado = 'usado', usado_en = now(), venta_id = (select id from retail.ventas limit 1) where codigo = :'cod';
${como(FELIPE)}select retail.resumen_beneficios_puntos() as b \\gset
select concat_ws('|',
  ((:'b'::jsonb -> 'cifras' ->> 'canjeado_mes_cupones')::int - (:'a'::jsonb -> 'cifras' ->> 'canjeado_mes_cupones')::int),
  ((:'b'::jsonb -> 'cifras' ->> 'canjeado_mes_soles')::numeric - (:'a'::jsonb -> 'cifras' ->> 'canjeado_mes_soles')::numeric));`,
  "1|10.00"
);
caso(
  "(e) el módulo nace SIN rol: el integrante recibe sin_permiso (al leer y al guardar), y ningún rol lo trae",
  `${ARRANQUE}reset role;
select count(*) as filas from retail.rol_modulos where modulo = 'beneficios_club' \\gset
${como(MICAELA)}select concat_ws('|', :'filas', pg_temp.intento($q$select retail.resumen_beneficios_puntos()$q$), pg_temp.intento($q$select retail.guardar_beneficios_puntos(1, 5, 200, 3, 9, 100, 2)$q$));`,
  "0|42501|sin_permiso|42501|sin_permiso"
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

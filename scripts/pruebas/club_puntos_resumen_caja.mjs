#!/usr/bin/env node
/**
 * Pruebas de lo que la caja muestra de los puntos (actividad 5 de 12; migración `20261019205000_club_puntos_resumen_caja.sql`).
 *
 * EL PROBLEMA. La tarjeta del cliente en caja dice cuántos puntos tiene y cuánto valen, si tiene cupones vivos, cuántos puntos gana
 * con la compra y si le toca el regalo de cumpleaños. Todo lo decide la base; la caja solo lo muestra. Un resumen equivocado
 * (puntos que están en un cupón vencido, un regalo que ya se dio, un cupón usado como vivo) llevaría a ofrecer lo que no existe.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`):
 *   a. Una miembro: su saldo, lo que valen, la configuración vigente y sus cupones vivos (con su código), sin los usados ni los vencidos.
 *   b. Una ficha «Identificado» o una anonimizada: `miembro: false`, y aun así la configuración (sirve para decir «gana N puntos»).
 *   c. Leer libera lo vencido: un cupón pasado de fecha devuelve sus puntos y deja de aparecer, en la misma lectura.
 *   d. El regalo de cumpleaños: disponible en su mes, no disponible fuera de su mes, no disponible si ya lo recibió este año y
 *      disponible otra vez si ese regalo se revirtió (se anuló la venta que lo dio).
 *   e. Solo con el módulo Vender o Clientes.
 *
 * USO
 *   pnpm pruebas:club-puntos-resumen-caja                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-puntos-resumen-caja --base cayla_x    → contra otra base del mismo contenedor
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

-- Una ficha: miembro con p_saldo puntos y su cumpleaños en p_mes (null = sin), o solo «Identificado».
create function pg_temp.ficha(p_dni text, p_saldo integer, p_miembro boolean default true, p_mes integer default null) returns uuid language plpgsql as $f$
declare v uuid;
begin
  if p_miembro then
    insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club, registro_origen, cumple_dia, cumple_mes)
    values ('dni', p_dni, 'RESUMEN PRUEBA', '9' || substr(p_dni, 1, 8), now(), retail.fn_club_codigo_nuevo(), 'caja',
            case when p_mes is null then null else 10 end, p_mes) returning id into v;
    if p_saldo > 0 then
      perform retail.fn_club_puntos_anotar(v, 'compra', p_saldo, null, null, 'prueba');
    end if;
  else
    insert into retail.clientas (documento_tipo, documento_numero, nombre, registro_origen)
    values ('dni', p_dni, 'IDENTIFICADA PRUEBA', 'caja') returning id into v;
  end if;
  return v;
end;
$f$;
`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${FUNCIONES_DE_PRUEBA}
select (now() at time zone 'America/Lima')::date as hoy, extract(month from (now() at time zone 'America/Lima'))::int as mes_hoy, extract(year from (now() at time zone 'America/Lima'))::int as anio_hoy \\gset
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

caso(
  "(a) una miembro: su saldo (con lo vencido ya devuelto), lo que valen, la configuración y sus cupones VIVOS con su código (sin el usado ni el vencido)",
  `reset role;
select pg_temp.ficha('79500001', 1240) as f \\gset
${como(FELIPE)}select (retail.canjear_puntos(:'f', 200))::jsonb ->> 'codigo' as vivo \\gset
select (retail.canjear_puntos(:'f', 200))::jsonb ->> 'codigo' as usado \\gset
select (retail.canjear_puntos(:'f', 200))::jsonb ->> 'codigo' as vencido \\gset
reset role;
update retail.club_cupones set estado = 'usado', usado_en = now(), venta_id = (select id from retail.ventas limit 1) where codigo = :'usado';
alter table retail.club_cupones disable trigger trg_club_cupones_guardas;
update retail.club_cupones set vence_el = :'hoy'::date - 1 where codigo = :'vencido';
alter table retail.club_cupones enable trigger trg_club_cupones_guardas;
${como(FELIPE)}select retail.resumen_puntos_caja(:'f') as r \\gset
select concat_ws('|', (:'r'::jsonb ->> 'miembro'), (:'r'::jsonb ->> 'saldo'), (:'r'::jsonb ->> 'valor_saldo'), (:'r'::jsonb ->> 'puntos_por_sol'),
  (:'r'::jsonb ->> 'soles_por_100'), (:'r'::jsonb ->> 'canje_minimo'), (:'r'::jsonb ->> 'compra_minima_x'), jsonb_array_length(:'r'::jsonb -> 'cupones'),
  (:'r'::jsonb -> 'cupones' -> 0 ->> 'codigo') = :'vivo');`,
  // 1 240 − 3 canjes de 200 = 640; el vencido devuelve sus 200 al leer → 840 (S/ 40); queda UN cupón vivo.
  "true|840|40.00|1.00|5.00|200|3.00|1|t"
);
caso(
  "(b) una ficha «Identificado» y una anonimizada: miembro false, y aun así la configuración (sirve para decir «gana N puntos»)",
  `reset role;
select pg_temp.ficha('79500002', 0, false) as ident \\gset
select pg_temp.ficha('79500003', 0) as anon \\gset
update retail.clientas set anonimizada = true, archivada_en = now(), motivo_archivo = 'prueba', club_desde = null, codigo_club = null,
  publicidad_desde = null, documento_numero = null, telefono_whatsapp = null, nombre = 'Clienta anonimizada' where id = :'anon';
${como(FELIPE)}select retail.resumen_puntos_caja(:'ident') as r1 \\gset
select retail.resumen_puntos_caja(:'anon') as r2 \\gset
select concat_ws('|', (:'r1'::jsonb ->> 'miembro'), (:'r1'::jsonb ->> 'puntos_por_sol'), (:'r2'::jsonb ->> 'miembro'), (:'r1'::jsonb) ? 'saldo');`,
  "false|1.00|false|f"
);
caso(
  "(c) leer libera lo vencido: el cupón pasado de fecha devuelve sus puntos y ya no aparece, en la MISMA lectura",
  `reset role;
select pg_temp.ficha('79500004', 600) as f \\gset
${como(FELIPE)}select (retail.canjear_puntos(:'f', 600))::jsonb ->> 'codigo' as codigo \\gset
reset role;
alter table retail.club_cupones disable trigger trg_club_cupones_guardas;
update retail.club_cupones set vence_el = :'hoy'::date - 1 where codigo = :'codigo';
alter table retail.club_cupones enable trigger trg_club_cupones_guardas;
${como(FELIPE)}select retail.resumen_puntos_caja(:'f') as r \\gset
select (:'r'::jsonb ->> 'saldo') || '|' || jsonb_array_length(:'r'::jsonb -> 'cupones');`,
  "600|0"
);
caso(
  "(d) el regalo de cumpleaños: sí en su mes, no fuera de su mes, no si ya lo recibió este año, y sí otra vez si ese regalo se revirtió",
  `reset role;
select pg_temp.ficha('79500005', 0, true, :'mes_hoy') as en_mes \\gset
select pg_temp.ficha('79500006', 0, true, case when :'mes_hoy' = 12 then 1 else :'mes_hoy' + 1 end) as otro_mes \\gset
${como(FELIPE)}select (retail.resumen_puntos_caja(:'en_mes') ->> 'regalo_disponible') as a1 \\gset
select (retail.resumen_puntos_caja(:'otro_mes') ->> 'regalo_disponible') as a2 \\gset
reset role;
select retail.fn_club_puntos_anotar(:'en_mes', 'cumple', 100, null, :'anio_hoy'::smallint) as regalo \\gset
${como(FELIPE)}select (retail.resumen_puntos_caja(:'en_mes') ->> 'regalo_disponible') as a3 \\gset
reset role;
select retail.fn_club_puntos_anotar(:'en_mes', 'revierte', -100, null, null, null, null, null, :'regalo') as _r \\gset
${como(FELIPE)}select (retail.resumen_puntos_caja(:'en_mes') ->> 'regalo_disponible') as a4 \\gset
select concat_ws('|', :'a1', :'a2', :'a3', :'a4');`,
  "true|false|false|true"
);
caso(
  "(e) solo con el módulo Vender o Clientes: el rol sin ninguno recibe sin_permiso",
  `reset role;
select pg_temp.ficha('79500007', 100) as f \\gset
delete from retail.rol_modulos where modulo in ('vender', 'clientas') and rol_id = retail.fn_rol_por_clave('integrante');
${como(MICAELA)}select pg_temp.intento(format($q$select retail.resumen_puntos_caja(%L::uuid)$q$, :'f'));`,
  "42501|sin_permiso"
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Pruebas de la conservación de 3 años con puntos (actividad 9 de 12; migración `20261019220000_club_puntos_conservacion.sql`).
 *
 * EL PROBLEMA. A los 3 años sin compras se eliminan los datos del cliente Y sus puntos (Términos 5.7). Si la ficha se anonimiza pero el saldo
 * se queda, hay una ficha anónima con puntos que nadie puede gastar; si el cron falla con UNA ficha, las demás nunca se anonimizan; y si la
 * fecha que «Mi Club» le muestra a la persona no es la que de verdad corre, el aviso miente.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK):
 *   a. El cron elimina a una miembro inactiva: su ficha queda anonimizada, su saldo en 0, con UN movimiento «pierde» por todo lo que tenía
 *      (que sigue cuadrando con el libro), y una miembro que compró hace poco no se toca.
 *   b. La fecha de «Mi Club» es la del cron: `pierde_el` = 3 años desde su última compra; el día que dice no se elimina, el siguiente sí.
 *   c. Los tres caminos eliminan los puntos (no solo el cron): archivar desde el ERP con una persona.
 *   d. Una ficha que falla no frena a las demás: el cron sigue y las otras quedan anonimizadas.
 *   e. Un cupón vivo de una ficha eliminada no se toca, y al vencer NO devuelve puntos a una ficha anónima.
 *   f. Correr el cron dos veces seguidas no vuelve a eliminar nada.
 *
 * USO
 *   pnpm pruebas:club-puntos-conservacion                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-puntos-conservacion --base cayla_x    → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const FUNCIONES_DE_PRUEBA = `
-- Una miembro con p_saldo puntos cuya última actividad fue hace p_anios años (sin compras: cuenta desde que se unió).
create function pg_temp.miembro(p_dni text, p_saldo integer, p_anios numeric default 4) returns uuid language plpgsql as $f$
declare v uuid;
begin
  insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club, registro_origen)
  values ('dni', p_dni, 'CONSERVACION PRUEBA', '9' || substr(p_dni, 1, 8), now(), retail.fn_club_codigo_nuevo(), 'caja') returning id into v;
  if p_saldo > 0 then
    perform retail.fn_club_puntos_anotar(v, 'compra', p_saldo, null, null, 'prueba');
  end if;
  update retail.clientas set created_at = now() - make_interval(days => (p_anios * 365)::int), club_desde = now() - make_interval(days => (p_anios * 365)::int) where id = v;
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

const comoFelipe = `reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
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
  "(a) el cron elimina a una miembro inactiva con sus puntos (un «pierde» por todo su saldo, el libro sigue cuadrando) y no toca a quien compró hace poco",
  `reset role;
select pg_temp.miembro('79800001', 740, 4) as vieja \\gset
select pg_temp.miembro('79800002', 300, 0.1) as nueva \\gset
select retail.fn_club_anonimizar_inactivas() as _n \\gset
select concat_ws('|',
  (select anonimizada from retail.clientas where id = :'vieja'),
  retail.fn_club_puntos_saldo(:'vieja') || '/' || retail.fn_club_puntos_saldo_calculado(:'vieja'),
  (select count(*) from retail.club_puntos_movimientos where clienta_id = :'vieja' and tipo = 'pierde'),
  (select puntos from retail.club_puntos_movimientos where clienta_id = :'vieja' and tipo = 'pierde'),
  (select anonimizada from retail.clientas where id = :'nueva'),
  retail.fn_club_puntos_saldo(:'nueva'));`,
  "t|0/0|1|-740|f|300"
);
caso(
  "(b) la fecha de «Mi Club» es la del cron: 3 años desde su última actividad; el día que dice NO se elimina, el siguiente SÍ",
  `reset role;
select pg_temp.miembro('79800003', 100, 3) as hoy_c \\gset
select pg_temp.miembro('79800004', 100, 3) as ayer_c \\gset
-- «hasta hoy»: su última actividad fue hace 3 años menos un día (rango de 1 día: el cron mira solo el día de Lima).
update retail.clientas set created_at = (:'hoy'::date - interval '3 years')::timestamptz + interval '12 hours', club_desde = (:'hoy'::date - interval '3 years')::timestamptz + interval '12 hours' where id = :'hoy_c';
update retail.clientas set created_at = (:'hoy'::date - interval '3 years' - interval '1 day')::timestamptz + interval '12 hours', club_desde = (:'hoy'::date - interval '3 years' - interval '1 day')::timestamptz + interval '12 hours' where id = :'ayer_c';
select retail.fn_club_conservacion_hasta(:'hoy_c')::text as h1, retail.fn_club_conservacion_hasta(:'ayer_c')::text as h2 \\gset
select retail.fn_club_anonimizar_inactivas() as _n \\gset
select concat_ws('|', (:'h1'::date = :'hoy'::date), (:'h2'::date = :'hoy'::date - 1),
  (select anonimizada from retail.clientas where id = :'hoy_c'), (select anonimizada from retail.clientas where id = :'ayer_c'));`,
  "t|t|f|t"
);
caso(
  "(c) los tres caminos eliminan los puntos, no solo el cron: archivar desde el ERP con una persona",
  `reset role;
select pg_temp.miembro('79800005', 450, 0.1) as m \\gset
select id as persona from public.personas order by created_at limit 1 \\gset
select retail.fn_clienta_anonimizar(:'m', :'persona', false) as _r \\gset
select concat_ws('|', (select anonimizada from retail.clientas where id = :'m'), retail.fn_club_puntos_saldo(:'m'),
  (select count(*) from retail.club_puntos_movimientos where clienta_id = :'m' and tipo = 'pierde'));`,
  "t|0|1"
);
caso(
  "(d) una ficha que falla no frena a las demás: el cron sigue y las otras quedan anonimizadas",
  `reset role;
select pg_temp.miembro('79800006', 100, 4) as mala \\gset
select pg_temp.miembro('79800007', 200, 4) as buena \\gset
-- La mala se rechaza al actualizarla (simula un pedido pagado sin entregar o cualquier fallo de la base).
create function pg_temp.rechazar() returns trigger language plpgsql as $f$ begin raise exception 'prueba: esta ficha no se puede anonimizar'; end; $f$;
create trigger trg_prueba_rechaza before update on retail.clientas for each row when (old.id = :'mala'::uuid and new.anonimizada) execute function pg_temp.rechazar();
select retail.fn_club_anonimizar_inactivas() as _n \\gset
select concat_ws('|', (select anonimizada from retail.clientas where id = :'mala'), retail.fn_club_puntos_saldo(:'mala'),
  (select anonimizada from retail.clientas where id = :'buena'), retail.fn_club_puntos_saldo(:'buena'));`,
  "f|100|t|0"
);
caso(
  "(e) un cupón vivo de una ficha eliminada no se toca, y al vencer NO devuelve puntos a una ficha anónima",
  `reset role;
select pg_temp.miembro('79800008', 600, 0.1) as m \\gset
${comoFelipe}select (retail.canjear_puntos(:'m', 200))::jsonb ->> 'codigo' as cod \\gset
reset role;
select retail.fn_clienta_anonimizar(:'m', (select id from public.personas order by created_at limit 1), false) as _r \\gset
select estado as antes from retail.club_cupones where codigo = :'cod' \\gset
alter table retail.club_cupones disable trigger trg_club_cupones_guardas;
update retail.club_cupones set vence_el = :'hoy'::date - 1 where codigo = :'cod';
alter table retail.club_cupones enable trigger trg_club_cupones_guardas;
select retail.fn_club_cupones_vencer(:'m') as _v \\gset
select concat_ws('|', :'antes', (select estado from retail.club_cupones where codigo = :'cod'), retail.fn_club_puntos_saldo(:'m'),
  (select count(*) from retail.club_puntos_movimientos where clienta_id = :'m' and tipo = 'devuelve'));`,
  "activo|vencido|0|0"
);
caso(
  "(f) correr el cron dos veces seguidas no vuelve a eliminar nada",
  `reset role;
select pg_temp.miembro('79800009', 500, 4) as m \\gset
select retail.fn_club_anonimizar_inactivas() as _n1 \\gset
select retail.fn_club_anonimizar_inactivas() as n2 \\gset
select concat_ws('|', :'n2', (select count(*) from retail.club_puntos_movimientos where clienta_id = :'m' and tipo = 'pierde'));`,
  "0|1"
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

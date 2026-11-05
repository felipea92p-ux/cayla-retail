#!/usr/bin/env node
/**
 * Pruebas de CANJEAR puntos en un cupón (actividad 3 de 12; migración `20261019203000_club_puntos_cupones.sql`).
 *
 * EL PROBLEMA. Felipe: un cupón NUNCA puede duplicarse. Tres formas de duplicar, y la base cierra las tres: (1) dos cupones con el
 * mismo código; (2) un doble toque o un reintento que crea dos cupones y descuenta los puntos dos veces; (3) un cupón que vence y
 * devuelve sus puntos dos veces. Además el cupón vale 7 días, es al portador y, si vence, los puntos vuelven.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`):
 *   a. Canjear 600 de 1 240: cupón de S/ 30, compra mínima S/ 90, vence en 7 días, con su código CAY-XXXX-XXXX; los puntos se
 *      descuentan (640) y el saldo guardado es igual al recalculado; el canje anota el código.
 *   b. La CLAVE de la operación: el mismo token dos veces devuelve el MISMO cupón y descuenta UNA vez; el mismo token con otros
 *      puntos se rechaza (`token_reusado`); sin token, dos canjes son dos cupones.
 *   c. Los límites: menos del mínimo, no múltiplo de 100, más de lo que tiene (`puntos_insuficientes`, sin dejar nada a medias).
 *   d. Quién canjea: una ficha «Identificado» no; sin permiso (rol sin Vender ni Clientes) no; la persona con el módulo, sí.
 *   e. Códigos únicos: 25 cupones, 25 códigos distintos con el formato; si el código CHOCA, se reintenta y no queda un canje
 *      huérfano (un canje, un cupón).
 *   f. Vencer: un cupón pasado de fecha devuelve sus puntos UNA sola vez (llamar dos veces no devuelve dos), queda vencido y una
 *      devolución manual de más se rechaza; un cupón de una miembro anonimizada vence sin devolver ni fallar.
 *   g. Canjear libera primero lo vencido: con saldo 0 y un cupón vencido de 600, se puede volver a canjear 600.
 *   h. La tabla: un cupón no se edita ni se borra; solo cambia de estado; un vencido no vuelve a vivir; la API no la lee.
 *   i. La puerta de la tienda: con su cuenta canjea; sin cuenta o con una cuenta cerrada, no; el mismo token devuelve el mismo cupón.
 *   j. Con BASE_DESECHABLE=1 (commitea): dos llamadas A LA VEZ con la misma clave → un solo cupón y los puntos descontados una vez.
 *
 * USO
 *   pnpm pruebas:club-puntos-cupones                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-puntos-cupones --base cayla_x    → contra otra base del mismo contenedor
 *   BASE_DESECHABLE=1 pnpm pruebas:club-puntos-cupones → además (j), que commitea: SOLO contra un Postgres desechable
 */

import { execFileSync, spawn } from "node:child_process";

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

-- Una ficha de prueba con p_saldo puntos (una compra anotada). p_miembro = false: solo «Identificado».
create function pg_temp.ficha(p_dni text, p_saldo integer, p_miembro boolean default true) returns uuid language plpgsql as $f$
declare v uuid;
begin
  if p_miembro then
    insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club, registro_origen)
    values ('dni', p_dni, 'MIEMBRO CUPONES PRUEBA', '9' || substr(p_dni, 1, 8), now(), retail.fn_club_codigo_nuevo(), 'caja') returning id into v;
    if p_saldo > 0 then
      perform retail.fn_club_puntos_anotar(v, 'compra', p_saldo, null, null, 'prueba');
    end if;
  else
    insert into retail.clientas (documento_tipo, documento_numero, nombre, registro_origen)
    values ('dni', p_dni, 'IDENTIFICADA CUPONES PRUEBA', 'caja') returning id into v;
  end if;
  return v;
end;
$f$;
`;

const PRELUDIO_BASE = `
begin;
set local search_path = retail, public, extensions;
${FUNCIONES_DE_PRUEBA}
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
const SALDO = (f) => `retail.fn_club_puntos_saldo(${f}) || '|' || retail.fn_club_puntos_saldo_calculado(${f})`;

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
  const lineas = r.salida.split("\n").filter((l) => l !== "");
  const ultima = lineas[lineas.length - 1] ?? "";
  reportar(nombre, typeof esperado === "function" ? esperado(ultima, r.salida) : ultima === esperado, r.salida);
}

// ---------------------------------------------------------------- a. Canjear
caso(
  "(a) canjear 600 de 1 240: cupón de S/ 30, compra mínima S/ 90, vence en 7 días, código CAY-XXXX-XXXX; quedan 640 y el saldo guardado = recalculado",
  `reset role;
select pg_temp.ficha('79200001', 1240) as f \\gset
${como(FELIPE)}select retail.canjear_puntos(:'f', 600) as r \\gset
reset role;
select concat_ws('|', (:'r'::jsonb ->> 'valor'), (:'r'::jsonb ->> 'compra_minima'), ((:'r'::jsonb ->> 'vence_el')::date - :'hoy'::date),
  (:'r'::jsonb ->> 'codigo') ~ '^CAY-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$', ${SALDO(":'f'")},
  (select m.referencia = (:'r'::jsonb ->> 'codigo') and m.puntos = -600 from retail.club_puntos_movimientos m where m.clienta_id = :'f' and m.tipo = 'canje'));`,
  "30.00|90.00|7|t|640|640|t"
);

// ---------------------------------------------------------------- b. La clave de la operación
caso(
  "(b1) la MISMA clave dos veces: el mismo cupón, los puntos descontados UNA vez (640) y un solo cupón",
  `reset role;
select pg_temp.ficha('79200002', 1240) as f \\gset
select gen_random_uuid() as tk \\gset
${como(FELIPE)}select retail.canjear_puntos(:'f', 600, :'tk') as r1 \\gset
select retail.canjear_puntos(:'f', 600, :'tk') as r2 \\gset
reset role;
select concat_ws('|', (:'r1'::jsonb ->> 'codigo') = (:'r2'::jsonb ->> 'codigo'), (:'r2'::jsonb ->> 'repetido'), ${SALDO(":'f'")},
  (select count(*) from retail.club_cupones where clienta_id = :'f'));`,
  "t|true|640|640|1"
);
caso(
  "(b2) la misma clave con OTROS puntos se rechaza (token_reusado); sin clave, dos canjes son dos cupones",
  `reset role;
select pg_temp.ficha('79200003', 1240) as f \\gset
select gen_random_uuid() as tk \\gset
${como(FELIPE)}select retail.canjear_puntos(:'f', 200, :'tk') as _r \\gset
select pg_temp.intento(format($q$select retail.canjear_puntos(%L::uuid, 400, %L::uuid)$q$, :'f', :'tk')) as malo \\gset
select retail.canjear_puntos(:'f', 200) as _a \\gset
select retail.canjear_puntos(:'f', 200) as _b \\gset
reset role;
select concat_ws('|', :'malo', (select count(*) from retail.club_cupones where clienta_id = :'f'), ${SALDO(":'f'")});`,
  "P0001|token_reusado|3|640|640"
);

// ---------------------------------------------------------------- c. Los límites
caso(
  "(c) los límites: menos del mínimo, no múltiplo de 100 y más de lo que tiene se rechazan SIN dejar nada a medias",
  `reset role;
select pg_temp.ficha('79200004', 500) as f \\gset
${como(FELIPE)}select concat_ws('|',
  pg_temp.intento(format($q$select retail.canjear_puntos(%L::uuid, 100)$q$, :'f')),
  pg_temp.intento(format($q$select retail.canjear_puntos(%L::uuid, 250)$q$, :'f')),
  pg_temp.intento(format($q$select retail.canjear_puntos(%L::uuid, 600)$q$, :'f')),
  pg_temp.intento(format($q$select retail.canjear_puntos(%L::uuid, 0)$q$, :'f'))) as r \\gset
reset role;
select :'r' || '|' || ${SALDO(":'f'")} || '|' || (select count(*) from retail.club_cupones where clienta_id = :'f') || '|' || (select count(*) from retail.club_puntos_movimientos where clienta_id = :'f');`,
  "22023|canje_menor_al_minimo|22023|canje_no_multiplo|P0001|puntos_insuficientes|22023|canje_no_multiplo|500|500|0|1"
);

// ---------------------------------------------------------------- d. Quién canjea
caso(
  "(d) una ficha «Identificado» no canjea (puntos_no_es_miembro); la persona con el módulo Vender sí; el rol sin Vender ni Clientes, no",
  `reset role;
select pg_temp.ficha('79200005', 0, false) as ident \\gset
select pg_temp.ficha('79200006', 400) as f \\gset
delete from retail.rol_modulos where modulo in ('vender', 'clientas') and rol_id = retail.fn_rol_por_clave('integrante');
${como(FELIPE)}select pg_temp.intento(format($q$select retail.canjear_puntos(%L::uuid, 200)$q$, :'ident')) as ident_r \\gset
select retail.canjear_puntos(:'f', 200) as _ok \\gset
${como(MICAELA)}select pg_temp.intento(format($q$select retail.canjear_puntos(%L::uuid, 200)$q$, :'f')) as sin_modulo \\gset
reset role;
select :'ident_r' || '|' || :'sin_modulo' || '|' || retail.fn_club_puntos_saldo(:'f');`,
  "P0001|puntos_no_es_miembro|42501|sin_permiso|200"
);

// ---------------------------------------------------------------- e. Códigos únicos
caso(
  "(e1) 25 cupones, 25 códigos DISTINTOS con el formato; un canje por cupón",
  `reset role;
select pg_temp.ficha('79200007', 100000) as f \\gset
${como(FELIPE)}select count(retail.canjear_puntos(:'f', 200)) as _n from generate_series(1, 25) \\gset
reset role;
select count(distinct codigo) || '|' || count(*) filter (where codigo ~ '^CAY-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$')
  || '|' || (select count(*) from retail.club_puntos_movimientos where clienta_id = :'f' and tipo = 'canje')
  || '|' || (select count(distinct canje_movimiento_id) from retail.club_cupones where clienta_id = :'f')
  from retail.club_cupones where clienta_id = :'f';`,
  "25|25|25|25"
);
caso(
  "(e2) si el código CHOCA se reintenta con otro y no queda un canje huérfano: 1 canje y 1 cupón, no 2 canjes",
  `reset role;
select pg_temp.ficha('79200008', 1000) as f \\gset
select pg_temp.ficha('79200009', 1000) as g \\gset
-- La primera llamada devuelve SIEMPRE el mismo código; el cupón de g ya lo tiene: la de f choca y reintenta.
create table pg_temp.cola (n integer);
insert into pg_temp.cola values (0);
create or replace function retail.fn_club_cupon_codigo_nuevo() returns text language plpgsql as $$
declare v integer;
begin
  update pg_temp.cola set n = n + 1 returning n into v;
  if v <= 2 then return 'CAY-AAAA-BBBB'; end if;
  return 'CAY-CCCC-DDDD';
end;
$$;
${como(FELIPE)}select retail.canjear_puntos(:'g', 200) as _g \\gset
select retail.canjear_puntos(:'f', 200) as r \\gset
reset role;
select (:'r'::jsonb ->> 'codigo') || '|' || (select count(*) from retail.club_cupones where clienta_id = :'f') || '|' || (select count(*) from retail.club_puntos_movimientos where clienta_id = :'f' and tipo = 'canje') || '|' || ${SALDO(":'f'")};`,
  "CAY-CCCC-DDDD|1|1|800|800"
);

// ---------------------------------------------------------------- f. Vencer
const VENCIDO = (f) => `${como(FELIPE)}select retail.canjear_puntos(${f}, 600) as _c \\gset
reset role;
alter table retail.club_cupones disable trigger trg_club_cupones_guardas;
update retail.club_cupones set vence_el = :'hoy'::date - 1 where clienta_id = ${f};
alter table retail.club_cupones enable trigger trg_club_cupones_guardas;
`;
caso(
  "(f1) un cupón pasado de fecha devuelve sus puntos UNA sola vez: llamar dos veces no devuelve dos; queda vencido",
  `reset role;
select pg_temp.ficha('79200010', 1000) as f \\gset
${VENCIDO(":'f'")}reset role;
select retail.fn_club_cupones_vencer(:'f') as n1 \\gset
select retail.fn_club_cupones_vencer(:'f') as n2 \\gset
select concat_ws('|', :'n1', :'n2', ${SALDO(":'f'")}, (select estado from retail.club_cupones where clienta_id = :'f'),
  (select count(*) from retail.club_puntos_movimientos where clienta_id = :'f' and tipo = 'devuelve' and puntos = 600));`,
  "1|0|1000|1000|vencido|1"
);
caso(
  "(f2) una devolución de puntos de MÁS (o de un movimiento que no es un canje) se rechaza: puntos_devolucion_excede / _invalida",
  `reset role;
select pg_temp.ficha('79200011', 1000) as f \\gset
${como(FELIPE)}select retail.canjear_puntos(:'f', 600) as _c \\gset
reset role;
select id as canje from retail.club_puntos_movimientos where clienta_id = :'f' and tipo = 'canje' \\gset
select id as compra from retail.club_puntos_movimientos where clienta_id = :'f' and tipo = 'compra' \\gset
select pg_temp.intento(format($q$select retail.fn_club_puntos_anotar(%L::uuid, 'devuelve', 700, null, null, null, null, null, %L::uuid)$q$, :'f', :'canje')) as demas \\gset
select pg_temp.intento(format($q$select retail.fn_club_puntos_anotar(%L::uuid, 'devuelve', 100, null, null, null, null, null, %L::uuid)$q$, :'f', :'compra')) as otra \\gset
select :'demas' || '|' || :'otra';`,
  "23514|puntos_devolucion_excede|23514|puntos_devolucion_invalida"
);
caso(
  "(f3) un cupón de una miembro ANONIMIZADA vence igual, sin devolver nada y sin fallar",
  `reset role;
select pg_temp.ficha('79200012', 1000) as f \\gset
${VENCIDO(":'f'")}reset role;
update retail.clientas set anonimizada = true, archivada_en = now(), motivo_archivo = 'prueba', club_desde = null, codigo_club = null,
  publicidad_desde = null, documento_numero = null, telefono_whatsapp = null, nombre = 'Clienta anonimizada' where id = :'f';
select retail.fn_club_cupones_vencer(:'f') as n \\gset
select :'n' || '|' || (select estado from retail.club_cupones where clienta_id = :'f') || '|' || (select count(*) from retail.club_puntos_movimientos where clienta_id = :'f' and tipo = 'devuelve');`,
  "1|vencido|0"
);

// ---------------------------------------------------------------- g. Canjear libera primero lo vencido
caso(
  "(g) canjear libera primero lo vencido: con saldo 0 y un cupón vencido de 600, se puede canjear 600 otra vez",
  `reset role;
select pg_temp.ficha('79200013', 600) as f \\gset
${VENCIDO(":'f'")}select retail.canjear_puntos(:'f', 600) as r \\gset
reset role;
select (:'r'::jsonb ->> 'valor') || '|' || ${SALDO(":'f'")} || '|' || (select count(*) from retail.club_cupones where clienta_id = :'f') || '|' || (select count(*) from retail.club_cupones where clienta_id = :'f' and estado = 'vencido');`,
  "30.00|0|0|2|1"
);

// ---------------------------------------------------------------- h. La tabla
caso(
  "(h) un cupón no se edita ni se borra, un vencido no vuelve a vivir y la API no lee la tabla",
  `reset role;
select pg_temp.ficha('79200014', 1000) as f \\gset
${como(FELIPE)}select retail.canjear_puntos(:'f', 400) as r \\gset
reset role;
select id as cupon from retail.club_cupones where clienta_id = :'f' \\gset
select pg_temp.intento(format($q$update retail.club_cupones set vence_el = vence_el + 30 where id = %L$q$, :'cupon')) as e1 \\gset
select pg_temp.intento(format($q$update retail.club_cupones set valor = 999 where id = %L$q$, :'cupon')) as e2 \\gset
select pg_temp.intento(format($q$delete from retail.club_cupones where id = %L$q$, :'cupon')) as e3 \\gset
update retail.club_cupones set estado = 'vencido', vencido_en = now() where id = :'cupon';
select pg_temp.intento(format($q$update retail.club_cupones set estado = 'activo', vencido_en = null where id = %L$q$, :'cupon')) as e4 \\gset
${como(FELIPE)}select substr(pg_temp.intento($q$select 1 from retail.club_cupones$q$), 1, 5) as api \\gset
reset role;
select concat_ws('|', :'e1', :'e2', :'e3', :'e4', :'api');`,
  "P0001|cupon_no_se_edita|P0001|cupon_no_se_edita|P0001|cupon_no_se_borra|P0001|cupon_vencido_es_final|42501"
);

// ---------------------------------------------------------------- i. La tienda
caso(
  "(i) la tienda: con su cuenta canjea y el mismo token devuelve el mismo cupón; sin cuenta o con una cuenta cerrada, no",
  `reset role;
select pg_temp.ficha('79200015', 1000) as f \\gset
select gen_random_uuid() as usuario \\gset
select gen_random_uuid() as tk \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados) values (:'usuario', :'f', 'prueba.cupones@ejemplo.com', 'v1') returning id \\gset
select retail.tienda_canjear_puntos(:'usuario', 400, :'tk') as r1 \\gset
select retail.tienda_canjear_puntos(:'usuario', 400, :'tk') as r2 \\gset
select pg_temp.intento($q$select retail.tienda_canjear_puntos(null, 400)$q$) as sin \\gset
select pg_temp.intento($q$select retail.tienda_canjear_puntos(gen_random_uuid(), 400)$q$) as ajena \\gset
select concat_ws('|', (:'r1'::jsonb ->> 'codigo') = (:'r2'::jsonb ->> 'codigo'), (select origen from retail.club_cupones where clienta_id = :'f'), ${SALDO(":'f'")}, :'sin', :'ajena');`,
  "t|web|600|600|42501|sin_cuenta|42501|sin_cuenta"
);

// ---------------------------------------------------------------- j. Dos llamadas a la vez (commitea: solo base desechable)
if (process.env.BASE_DESECHABLE === "1") {
  casos++;
  const dni = `77${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  const prep = correr(`${PRELUDIO_BASE}reset role;
select pg_temp.ficha('${dni}', 1000) as f \\gset
select :'f';
commit;`);
  if (!prep.ok) {
    fallas++;
    console.log(`✘ (j) con COMMIT: dos llamadas a la vez con la misma clave\n    preparación falló: ${prep.mensaje}`);
  } else {
    const f = prep.salida.split("\n").pop();
    const tk = "99999999-9999-4999-8999-" + String(Math.floor(Math.random() * 1e12)).padStart(12, "0");
    const llamada = (dormirS) => `${PRELUDIO}${como(FELIPE)}select retail.canjear_puntos('${f}'::uuid, 600, '${tk}'::uuid)::jsonb ->> 'codigo';
${dormirS ? `select pg_sleep(${dormirS});` : ""}
commit;`;
    const a = psqlEnParalelo(llamada(3));
    await new Promise((r) => setTimeout(r, 800));
    const b = await psqlEnParalelo(llamada(0));
    const ra = await a;
    const estado = correr(`select count(*) || '|' || retail.fn_club_puntos_saldo('${f}') || '|' || retail.fn_club_puntos_saldo_calculado('${f}') from retail.club_cupones where clienta_id = '${f}';`);
    const codigoA = ra.ok ? ra.salida.split("\n").find((l) => l.startsWith("CAY-")) : null;
    const codigoB = b.ok ? b.salida.split("\n").find((l) => l.startsWith("CAY-")) : null;
    const ok = Boolean(codigoA) && codigoA === codigoB && estado.salida === "1|400|400";
    if (!ok) fallas++;
    console.log(`${ok ? "✔" : "✘"} (j) con COMMIT: dos llamadas A LA VEZ con la misma clave → UN cupón (el mismo código para las dos) y los puntos descontados una vez (400)`);
    if (!ok) console.log(`    obtenido:\n      A: ${ra.ok ? ra.salida : ra.mensaje}\n      B: ${b.ok ? b.salida : b.mensaje}\n      estado: ${estado.salida ?? estado.mensaje}`);
  }
} else {
  console.log("· (j), la carrera con COMMIT, no corrió: solo corre con BASE_DESECHABLE=1 (deja una miembro de prueba)");
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

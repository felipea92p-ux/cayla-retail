#!/usr/bin/env node
/**
 * Pruebas de la BASE de los puntos del Club (actividad 1 de 12; migración `20261019201000_club_puntos_base.sql`).
 *
 * EL PROBLEMA. Un saldo de puntos es plata que CAYLA le debe al cliente. Si puede quedar negativo, duplicarse, editarse a mano o
 * dar puntos a quien no es del club, el diseño está mal. La base tiene que hacerlo imposible, no la pantalla.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`):
 *   a. La configuración de arranque (1 punto por S/ 1, 100 puntos = S/ 5, canje desde 200, cupón desde 3×, 7 días, 100 de
 *      cumpleaños, tope 2 %) y cuánto valen N puntos (solo bloques completos de 100).
 *   b. Los movimientos: el saldo guardado es SIEMPRE igual a la suma de los movimientos; no se puede gastar lo que no hay
 *      (`puntos_insuficientes`) y el rechazo no deja ni movimiento ni cambio de saldo.
 *   c. Quién gana puntos: una miembro, sí; una ficha «Identificado» (sin club) o una anonimizada (también la unida a otra), no.
 *   d. Una sola vez: una venta da puntos una vez; el regalo de cumpleaños, una vez por año.
 *   e. Los candados de la tabla: un movimiento no se edita ni se borra; el signo lo manda el tipo; un saldo negativo es
 *      imposible aun escribiendo a mano (CHECK); la API (rol authenticated) no lee ni escribe las tablas ni llama a las funciones
 *      internas.
 *   f. Guardar la configuración (`guardar_beneficios_puntos`): solo el líder; guardar lo mismo no agrega nada; cambiar lo que
 *      valen los puntos o el canje rige desde dentro de 15 días (hint `cambio_con_aviso` si se pide antes) y hoy sigue la
 *      vieja; lo demás rige hoy; queda anotado en configuracion_historial; rangos inválidos; la configuración solo se agrega.
 *   g. Con BASE_DESECHABLE=1 (commitea): dos cajas gastan a la vez los mismos puntos → pasa una, la otra recibe
 *      `puntos_insuficientes` y el saldo queda en lo que tiene que quedar.
 *
 * USO
 *   pnpm pruebas:club-puntos-base                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-puntos-base --base cayla_x    → contra otra base del mismo contenedor
 *   BASE_DESECHABLE=1 pnpm pruebas:club-puntos-base → además (g), que commitea: SOLO contra un Postgres desechable
 */

import { execFileSync, spawn } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo

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

/** Funciones de prueba (en `pg_temp`, se van con la sesión): `intento` devuelve el hint del error o SIN_ERROR. */
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

-- Una ficha de prueba. p_miembro: con club (documento, nombre, celular y código, como exigen los candados de clientas).
create function pg_temp.ficha(p_dni text, p_miembro boolean) returns uuid language plpgsql as $f$
declare v uuid;
begin
  if p_miembro then
    insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club, registro_origen)
    values ('dni', p_dni, 'MIEMBRO PUNTOS PRUEBA', '9' || substr(p_dni, 1, 8), now(), retail.fn_club_codigo_nuevo(), 'caja') returning id into v;
  else
    insert into retail.clientas (documento_tipo, documento_numero, nombre, registro_origen)
    values ('dni', p_dni, 'IDENTIFICADA PUNTOS PRUEBA', 'caja') returning id into v;
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
select (now() at time zone 'America/Lima')::date as hoy, extract(year from (now() at time zone 'America/Lima'))::int as anio_hoy \\gset
`;
const PRELUDIO = `${PRELUDIO_BASE}update retail.configuracion_empresa set exige_responsable = false;\n`;

const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);\n`;
const intentoCon = (sql, ...vars) => `select pg_temp.intento(format($q$${sql}$q$, ${vars.join(", ")}));\n`;

let casos = 0;
let fallas = 0;
function reportar(nombre, ok, obtenido) {
  casos++;
  if (!ok) fallas++;
  console.log(`${ok ? "✔" : "✘"} ${nombre}`);
  if (!ok) console.log(`    obtenido:\n${String(obtenido).replace(/^/gm, "      ")}`);
}

/** Corre el cuerpo en su transacción (con el preludio y un ROLLBACK al final) y compara la ÚLTIMA línea con `esperado`. */
function caso(nombre, cuerpo, esperado) {
  const r = correr(`${PRELUDIO}${cuerpo}\nrollback;\n`);
  if (!r.ok) return reportar(nombre, false, r.mensaje);
  const lineas = r.salida.split("\n").filter((l) => l !== "");
  const ultima = lineas[lineas.length - 1] ?? "";
  reportar(nombre, typeof esperado === "function" ? esperado(ultima, r.salida) : ultima === esperado, r.salida);
}

// ---------------------------------------------------------------- a. La configuración
caso(
  "(a1) la configuración de arranque: 1 punto por S/ 1, 100 puntos = S/ 5, canje desde 200, cupón desde 3×, 7 días, 100 de cumpleaños, tope 2 %",
  `select concat_ws('|', c.puntos_por_sol, c.soles_por_100, c.canje_minimo_puntos, c.compra_minima_x, c.vigencia_cupon_dias, c.regalo_cumple_puntos, c.tope_costo_pct)
     from retail.fn_club_puntos_config() c;`,
  "1.00|5.00|200|3.00|7|100|2.00"
);
caso(
  "(a2) cuánto valen N puntos: solo bloques completos de 100 (1 240 → S/ 60; 99 → S/ 0; 100 → S/ 5)",
  `select concat_ws('|', retail.fn_club_puntos_valor(1240), retail.fn_club_puntos_valor(99), retail.fn_club_puntos_valor(100), retail.fn_club_puntos_valor(0));`,
  "60.00|0.00|5.00|0.00"
);

// ---------------------------------------------------------------- b. Los movimientos y el saldo
caso(
  "(b1) el saldo guardado es igual a la suma de los movimientos: +148 compra, −100 canje → 48",
  `reset role;
select pg_temp.ficha('79000001', true) as f \\gset
select retail.fn_club_puntos_anotar(:'f', 'compra', 148, null, null, 'prueba') as _m1 \\gset
select retail.fn_club_puntos_anotar(:'f', 'canje', -100, null, null, 'CAY-PRUEBA') as _m2 \\gset
select concat_ws('|', retail.fn_club_puntos_saldo(:'f'), retail.fn_club_puntos_saldo_calculado(:'f'),
                 (select count(*) from retail.club_puntos_movimientos where clienta_id = :'f'));`,
  "48|48|2"
);
caso(
  "(b2) no se gasta lo que no hay: pedir 49 con 48 → puntos_insuficientes; el rechazo no deja movimiento y el saldo sigue en 48",
  `reset role;
select pg_temp.ficha('79000002', true) as f \\gset
select retail.fn_club_puntos_anotar(:'f', 'compra', 48) as _m \\gset
${intentoCon(`select retail.fn_club_puntos_anotar(%L::uuid, 'canje', -49)`, `:'f'`)}select concat_ws('|', retail.fn_club_puntos_saldo(:'f'), (select count(*) from retail.club_puntos_movimientos where clienta_id = :'f'));`,
  (u) => u === "48|1"
);
caso(
  "(b3) el rechazo dice puntos_insuficientes",
  `reset role;
select pg_temp.ficha('79000003', true) as f \\gset
select retail.fn_club_puntos_anotar(:'f', 'compra', 48) as _m \\gset
${intentoCon(`select retail.fn_club_puntos_anotar(%L::uuid, 'canje', -49)`, `:'f'`)}`,
  "P0001|puntos_insuficientes"
);
caso(
  "(b4) gastar TODO el saldo está permitido y deja 0 (nunca negativo)",
  `reset role;
select pg_temp.ficha('79000004', true) as f \\gset
select retail.fn_club_puntos_anotar(:'f', 'compra', 200) as _m \\gset
select retail.fn_club_puntos_anotar(:'f', 'canje', -200) as _m2 \\gset
select retail.fn_club_puntos_saldo(:'f') || '|' || retail.fn_club_puntos_saldo_calculado(:'f');`,
  "0|0"
);

// ---------------------------------------------------------------- c. Quién gana puntos
caso(
  "(c1) una ficha «Identificado» (sin club) no gana puntos: puntos_no_es_miembro",
  `reset role;
select pg_temp.ficha('79000011', false) as f \\gset
${intentoCon(`select retail.fn_club_puntos_anotar(%L::uuid, 'compra', 50)`, `:'f'`)}`,
  "P0001|puntos_no_es_miembro"
);
caso(
  "(c2) una ficha que no existe: clienta_no_existe",
  `reset role;
${intento(`select retail.fn_club_puntos_anotar('00000000-0000-4000-8000-00000000dead'::uuid, 'compra', 50)`)}`,
  "P0001|clienta_no_existe"
);
caso(
  "(c3) una ficha anonimizada (o unida a otra, que siempre queda anonimizada) no tiene puntos: clienta_anonimizada",
  `reset role;
select pg_temp.ficha('79000012', true) as a \\gset
update retail.clientas set anonimizada = true, archivada_en = now(), motivo_archivo = 'prueba', club_desde = null, codigo_club = null,
  publicidad_desde = null, documento_numero = null, telefono_whatsapp = null, nombre = 'Clienta anonimizada' where id = :'a';
${intentoCon(`select retail.fn_club_puntos_anotar(%L::uuid, 'compra', 50)`, `:'a'`)}`,
  "P0001|clienta_anonimizada"
);
caso(
  "(c4) movimientos mal armados: sin tipo, con 0 puntos → puntos_movimiento_incompleto",
  `reset role;
select pg_temp.ficha('79000014', true) as f \\gset
${intentoCon(`select retail.fn_club_puntos_anotar(%L::uuid, 'compra', 0)`, `:'f'`)}`,
  "22023|puntos_movimiento_incompleto"
);

// ---------------------------------------------------------------- d. Una sola vez
caso(
  "(d1) una venta da puntos UNA sola vez: el segundo intento con la misma venta se rechaza (único) y el saldo no cambia",
  `reset role;
select pg_temp.ficha('79000021', true) as f \\gset
select id as venta from retail.ventas limit 1 \\gset
select retail.fn_club_puntos_anotar(:'f', 'compra', 120, :'venta') as _m \\gset
${intentoCon(`select retail.fn_club_puntos_anotar(%L::uuid, 'compra', 120, %L::uuid)`, `:'f'`, `:'venta'`)}`,
  (u) => u.startsWith("23505|")
);
caso(
  "(d2) el regalo de cumpleaños se da UNA vez por año: el mismo año se rechaza; otro año, sí",
  `reset role;
select pg_temp.ficha('79000022', true) as f \\gset
select retail.fn_club_puntos_anotar(:'f', 'cumple', 100, null, :'anio_hoy'::smallint) as _m \\gset
select pg_temp.intento(format($q$select retail.fn_club_puntos_anotar(%L::uuid, 'cumple', 100, null, %s::smallint)$q$, :'f', :'anio_hoy')) as segundo \\gset
select retail.fn_club_puntos_anotar(:'f', 'cumple', 100, null, (:'anio_hoy' + 1)::smallint) as _m3 \\gset
select concat_ws('|', substr(:'segundo', 1, 5), retail.fn_club_puntos_saldo(:'f'));`,
  "23505|200"
);

// ---------------------------------------------------------------- e. Los candados de la tabla
caso(
  "(e1) un movimiento no se edita ni se borra: puntos_solo_agregar (ni siquiera como dueño)",
  `reset role;
select pg_temp.ficha('79000031', true) as f \\gset
select retail.fn_club_puntos_anotar(:'f', 'compra', 100) as m \\gset
select concat_ws('|',
  pg_temp.intento(format($q$update retail.club_puntos_movimientos set puntos = 999 where id = %L$q$, :'m')),
  pg_temp.intento(format($q$delete from retail.club_puntos_movimientos where id = %L$q$, :'m')),
  pg_temp.intento($q$update retail.club_puntos_config set tope_costo_pct = 50$q$));`,
  "P0001|puntos_solo_agregar|P0001|puntos_solo_agregar|P0001|puntos_solo_agregar"
);
caso(
  "(e2) el signo lo manda el tipo: una compra negativa, un canje positivo o un movimiento de 0 puntos son imposibles",
  `reset role;
select pg_temp.ficha('79000032', true) as f \\gset
select concat_ws('|',
  substr(pg_temp.intento(format($q$insert into retail.club_puntos_movimientos (clienta_id, tipo, puntos) values (%L, 'compra', -5)$q$, :'f')), 1, 5),
  substr(pg_temp.intento(format($q$insert into retail.club_puntos_movimientos (clienta_id, tipo, puntos) values (%L, 'canje', 5)$q$, :'f')), 1, 5),
  substr(pg_temp.intento(format($q$insert into retail.club_puntos_movimientos (clienta_id, tipo, puntos) values (%L, 'ajuste', 0)$q$, :'f')), 1, 5),
  substr(pg_temp.intento(format($q$insert into retail.club_puntos_movimientos (clienta_id, tipo, puntos) values (%L, 'regalo', 5)$q$, :'f')), 1, 5),
  substr(pg_temp.intento(format($q$insert into retail.club_puntos_movimientos (clienta_id, tipo, puntos) values (%L, 'cumple', 5)$q$, :'f')), 1, 5));`,
  "23514|23514|23514|23514|23514"
);
caso(
  "(e3) un saldo negativo es imposible aun escribiendo a mano (CHECK): un canje de −500 sin saldo",
  `reset role;
select pg_temp.ficha('79000033', true) as f \\gset
select substr(pg_temp.intento(format($q$insert into retail.club_puntos_movimientos (clienta_id, tipo, puntos) values (%L, 'canje', -500)$q$, :'f')), 1, 5);`,
  "23514"
);
caso(
  "(e4) la API (authenticated) no lee ni escribe las 4 tablas ni llama a las funciones internas",
  `reset role;
select pg_temp.ficha('79000034', true) as f \\gset
${como(FELIPE)}select concat_ws('|',
  substr(pg_temp.intento($q$select 1 from retail.club_puntos_movimientos$q$), 1, 5),
  substr(pg_temp.intento($q$select 1 from retail.club_puntos_saldos$q$), 1, 5),
  substr(pg_temp.intento($q$select 1 from retail.club_puntos_config$q$), 1, 5),
  substr(pg_temp.intento($q$insert into retail.club_puntos_saldos (clienta_id, saldo) values (gen_random_uuid(), 9)$q$), 1, 5),
  substr(pg_temp.intento($q$select retail.fn_club_puntos_config()$q$), 1, 5),
  substr(pg_temp.intento($q$select retail.fn_club_puntos_saldo(gen_random_uuid())$q$), 1, 5),
  substr(pg_temp.intento($q$select retail.fn_club_puntos_anotar(gen_random_uuid(), 'compra', 5)$q$), 1, 5));`,
  "42501|42501|42501|42501|42501|42501|42501"
);

// ---------------------------------------------------------------- f. Guardar la configuración
const GUARDAR = (...v) => `select retail.guardar_beneficios_puntos(${v.join(", ")})`;
caso(
  "(f1) solo el líder guarda: una integrante recibe solo_lider",
  `${como(MICAELA)}${intento(GUARDAR("1", "5", "200", "3", "7", "100", "2"))}`,
  "42501|solo_lider"
);
caso(
  "(f2) guardar lo MISMO no agrega una versión (devuelve la vigencia de la última)",
  `select count(*) as antes from retail.club_puntos_config \\gset
${como(FELIPE)}select retail.guardar_beneficios_puntos(1, 5, 200, 3, 7, 100, 2) as _d \\gset
reset role;
select (select count(*) from retail.club_puntos_config) - :antes;`,
  "0"
);
caso(
  "(f3) un cambio que NO toca lo ya ganado (vigencia 7 → 10 días, regalo 100 → 150) rige HOY y queda en el historial",
  `${como(FELIPE)}select retail.guardar_beneficios_puntos(1, 5, 200, 3, 10, 150, 2) as desde \\gset
reset role;
select concat_ws('|', :'desde' = :'hoy', (retail.fn_club_puntos_config()).vigencia_cupon_dias, (retail.fn_club_puntos_config()).regalo_cumple_puntos,
  (select count(*) from retail.configuracion_historial where que = 'puntos_club'));`,
  "t|10|150|1"
);
caso(
  "(f4) cambiar lo que valen los puntos (S/ 5 → S/ 4 por 100) sin fecha rige desde dentro de 15 días: hoy sigue valiendo S/ 5",
  `${como(FELIPE)}select retail.guardar_beneficios_puntos(1, 4, 200, 3, 7, 100, 2) as desde \\gset
reset role;
select concat_ws('|', (:'desde'::date - :'hoy'::date), (retail.fn_club_puntos_config()).soles_por_100,
  (retail.fn_club_puntos_config(:'hoy'::date + 14)).soles_por_100, (retail.fn_club_puntos_config(:'hoy'::date + 15)).soles_por_100);`,
  "15|5.00|5.00|4.00"
);
caso(
  "(f5) pedir ese cambio ANTES de los 15 días se rechaza con cambio_con_aviso; una fecha pasada también",
  `${como(FELIPE)}${intentoCon(`select retail.guardar_beneficios_puntos(1, 4, 200, 3, 7, 100, 2, %L::date)`, `(:'hoy'::date + 5)::text`)}${intentoCon(`select retail.guardar_beneficios_puntos(1, 5, 200, 3, 9, 100, 2, %L::date)`, `(:'hoy'::date - 1)::text`)}`,
  (u, todo) => todo.includes("22023|cambio_con_aviso") && u === "22023|puntos_config_invalida"
);
caso(
  "(f6) el canje mínimo también toca lo ganado: 200 → 500 rige a los 15 días; el mínimo no puede ser 150 ni 0 puntos por sol",
  `${como(FELIPE)}select retail.guardar_beneficios_puntos(1, 5, 500, 3, 7, 100, 2) as desde \\gset
select pg_temp.intento($q$select retail.guardar_beneficios_puntos(1, 5, 150, 3, 7, 100, 2)$q$) as malo1 \\gset
select pg_temp.intento($q$select retail.guardar_beneficios_puntos(0, 5, 200, 3, 7, 100, 2)$q$) as malo2 \\gset
reset role;
select concat_ws('|', (:'desde'::date - :'hoy'::date), (retail.fn_club_puntos_config()).canje_minimo_puntos,
  substr(:'malo1', 1, 5), substr(:'malo2', 1, 5));`,
  "15|200|22023|22023"
);
caso(
  "(f7) la configuración nueva NO toca club_textos: los Términos los publica el abogado",
  `select count(*) as textos from retail.club_textos \\gset
${como(FELIPE)}select retail.guardar_beneficios_puntos(1, 5, 200, 3, 10, 150, 2) as _d \\gset
reset role;
select (select count(*) from retail.club_textos) - :textos;`,
  "0"
);

// ---------------------------------------------------------------- g. Dos cajas a la vez (commitea: solo base desechable)
if (process.env.BASE_DESECHABLE === "1") {
  casos++;
  const dni = `78${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  const prep = correr(`${PRELUDIO_BASE}reset role;
select pg_temp.ficha('${dni}', true) as f \\gset
select retail.fn_club_puntos_anotar(:'f', 'compra', 150) as _m \\gset
select :'f';
commit;`);
  if (!prep.ok) {
    fallas++;
    console.log(`✘ (g) con COMMIT: dos cajas gastan a la vez los mismos puntos\n    preparación falló: ${prep.mensaje}`);
  } else {
    const f = prep.salida.split("\n").pop();
    const caja = (dormirS) => `${PRELUDIO_BASE}reset role;
select pg_temp.intento($q$select retail.fn_club_puntos_anotar('${f}'::uuid, 'canje', -100)$q$);
${dormirS ? `select pg_sleep(${dormirS});` : ""}
commit;`;
    const a = psqlEnParalelo(caja(3));
    await new Promise((r) => setTimeout(r, 800));
    const b = await psqlEnParalelo(caja(0));
    const ra = await a;
    const saldo = correr(`select retail.fn_club_puntos_saldo('${f}') || '|' || retail.fn_club_puntos_saldo_calculado('${f}');`);
    const obtenido = `A: ${ra.ok ? ra.salida : ra.mensaje}\nB: ${b.ok ? b.salida : b.mensaje}\nsaldo: ${saldo.salida ?? saldo.mensaje}`;
    const ok = ra.ok && ra.salida.endsWith("SIN_ERROR") && b.ok && b.salida.endsWith("P0001|puntos_insuficientes") && saldo.salida === "50|50";
    if (!ok) fallas++;
    console.log(`${ok ? "✔" : "✘"} (g) con COMMIT: dos cajas gastan a la vez 100 de 150 puntos → pasa UNA, la otra recibe puntos_insuficientes y el saldo queda en 50`);
    if (!ok) console.log(`    obtenido:\n${obtenido.replace(/^/gm, "      ")}`);
  }
} else {
  console.log("· (g), la carrera con COMMIT, no corrió: solo corre con BASE_DESECHABLE=1 (deja una miembro de prueba)");
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

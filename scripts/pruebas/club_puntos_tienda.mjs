#!/usr/bin/env node
/**
 * Pruebas de lo que «Mi Club» de la tienda web muestra de los puntos (actividad 6 de 12; migración
 * `20261019213000_club_puntos_tienda_mis_puntos.sql`).
 *
 * EL PROBLEMA. La tienda le dice al cliente cuántos puntos tiene, cuánto valen, cuáles son sus cupones vivos y qué le pasó a sus
 * puntos. Todo lo decide la base. Un resumen equivocado (puntos que están en un cupón vencido, un cupón usado como vivo, los datos
 * de la operación interna en un historial que ve el cliente) rompería la confianza en el programa.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK):
 *   a. Una miembro: su saldo, lo que valen, la configuración y sus cupones VIVOS con su código (sin el usado ni el vencido).
 *   b. Sin cuenta, con la cuenta cerrada o sin usuario: null. Cuenta sin ficha del Club: `miembro: false` y solo la configuración.
 *   c. Leer libera lo vencido: el cupón pasado de fecha devuelve sus puntos y deja de aparecer, en la misma lectura.
 *   d. El regalo de cumpleaños: sí en su mes, no fuera de su mes, no si ya lo recibió este año, sí otra vez si se revirtió.
 *   e. El historial: últimos 15, el más nuevo primero; con el código solo en canje y devuelve; sin venta, nota ni responsable.
 *   f. Quién la ejecuta: solo `tienda_web` (ni anon, ni authenticated, ni public).
 *
 * USO
 *   pnpm pruebas:club-puntos-tienda                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-puntos-tienda --base cayla_x    → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin: canjea con la función de la caja

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const FUNCIONES_DE_PRUEBA = `
-- Una ficha con su cuenta web: miembro con p_saldo puntos y su cumpleaños en p_mes (null = sin), o solo «Identificado» (sin club).
create function pg_temp.cuenta(p_dni text, p_saldo integer, p_miembro boolean default true, p_mes integer default null, out clienta uuid, out usuario uuid) language plpgsql as $f$
begin
  usuario := gen_random_uuid();
  if p_miembro then
    insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club, registro_origen, cumple_dia, cumple_mes)
    values ('dni', p_dni, 'TIENDA PRUEBA', '9' || substr(p_dni, 1, 8), now(), retail.fn_club_codigo_nuevo(), 'caja',
            case when p_mes is null then null else 10 end, p_mes) returning id into clienta;
    if p_saldo > 0 then
      perform retail.fn_club_puntos_anotar(clienta, 'compra', p_saldo, null, null, 'prueba');
    end if;
  else
    insert into retail.clientas (documento_tipo, documento_numero, nombre, registro_origen)
    values ('dni', p_dni, 'SIN CLUB PRUEBA', 'caja') returning id into clienta;
  end if;
  insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados)
  values (usuario, clienta, 'prueba-' || p_dni || '@ejemplo.test', 'borrador-2026-10-14');
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
  "(a) una miembro: saldo (con lo vencido devuelto), lo que valen, la configuración y sus cupones VIVOS con su código (sin el usado ni el vencido)",
  `reset role;
select clienta as c, usuario as u from pg_temp.cuenta('79600001', 1240) \\gset
${comoFelipe}select (retail.canjear_puntos(:'c', 200))::jsonb ->> 'codigo' as vivo \\gset
select (retail.canjear_puntos(:'c', 200))::jsonb ->> 'codigo' as usado \\gset
select (retail.canjear_puntos(:'c', 200))::jsonb ->> 'codigo' as vencido \\gset
reset role;
update retail.club_cupones set estado = 'usado', usado_en = now(), venta_id = (select id from retail.ventas limit 1) where codigo = :'usado';
alter table retail.club_cupones disable trigger trg_club_cupones_guardas;
update retail.club_cupones set vence_el = :'hoy'::date - 1 where codigo = :'vencido';
alter table retail.club_cupones enable trigger trg_club_cupones_guardas;
select retail.tienda_mis_puntos(:'u') as r \\gset
select concat_ws('|', (:'r'::jsonb ->> 'miembro'), (:'r'::jsonb ->> 'saldo'), (:'r'::jsonb ->> 'valor_saldo'), (:'r'::jsonb ->> 'puntos_por_sol'),
  (:'r'::jsonb ->> 'soles_por_100'), (:'r'::jsonb ->> 'canje_minimo'), (:'r'::jsonb ->> 'vigencia_dias'), jsonb_array_length(:'r'::jsonb -> 'cupones'),
  (:'r'::jsonb -> 'cupones' -> 0 ->> 'codigo') = :'vivo');`,
  // 1 240 − 3 canjes de 200 = 640; el vencido devuelve sus 200 al leer → 840 (valen S/ 40: solo cuentan los cientos completos); queda UN cupón vivo.
  "true|840|40.00|1.00|5.00|200|7|1|t"
);
caso(
  "(b) sin usuario, sin cuenta o con la cuenta cerrada: null; una cuenta sin ficha del Club: miembro false y solo la configuración",
  `reset role;
select clienta as c1, usuario as u1 from pg_temp.cuenta('79600002', 0) \\gset
select clienta as c2, usuario as u2 from pg_temp.cuenta('79600003', 0, false) \\gset
-- Una cuenta cerrada pierde su usuario y su correo (los guarda como «cerrado»): el usuario de antes ya no encuentra nada.
update retail.cuentas_web set cerrada_en = now(), usuario_cerrado_id = usuario_web_id, usuario_web_id = null, correo = null where usuario_web_id = :'u1';
select retail.tienda_mis_puntos(:'u2') as r2 \\gset
select concat_ws('|', coalesce((retail.tienda_mis_puntos(null))::text, 'null'), coalesce((retail.tienda_mis_puntos(gen_random_uuid()))::text, 'null'),
  coalesce((retail.tienda_mis_puntos(:'u1'))::text, 'null'), (:'r2'::jsonb ->> 'miembro'), (:'r2'::jsonb ->> 'puntos_por_sol'), (:'r2'::jsonb) ? 'saldo');`,
  "null|null|null|false|1.00|f"
);
caso(
  "(c) leer libera lo vencido: el cupón pasado de fecha devuelve sus puntos y ya no aparece, en la MISMA lectura",
  `reset role;
select clienta as c, usuario as u from pg_temp.cuenta('79600004', 600) \\gset
${comoFelipe}select (retail.canjear_puntos(:'c', 600))::jsonb ->> 'codigo' as codigo \\gset
reset role;
alter table retail.club_cupones disable trigger trg_club_cupones_guardas;
update retail.club_cupones set vence_el = :'hoy'::date - 1 where codigo = :'codigo';
alter table retail.club_cupones enable trigger trg_club_cupones_guardas;
select retail.tienda_mis_puntos(:'u') as r \\gset
select (:'r'::jsonb ->> 'saldo') || '|' || jsonb_array_length(:'r'::jsonb -> 'cupones');`,
  "600|0"
);
caso(
  "(d) el regalo de cumpleaños: sí en su mes, no fuera de su mes, no si ya lo recibió este año, y sí otra vez si ese regalo se revirtió",
  `reset role;
select clienta as c1, usuario as u1 from pg_temp.cuenta('79600005', 0, true, :'mes_hoy') \\gset
select clienta as c2, usuario as u2 from pg_temp.cuenta('79600006', 0, true, case when :'mes_hoy' = 12 then 1 else :'mes_hoy' + 1 end) \\gset
select (retail.tienda_mis_puntos(:'u1') ->> 'regalo_disponible') as a1 \\gset
select (retail.tienda_mis_puntos(:'u2') ->> 'regalo_disponible') as a2 \\gset
select retail.fn_club_puntos_anotar(:'c1', 'cumple', 100, null, :'anio_hoy'::smallint) as regalo \\gset
select (retail.tienda_mis_puntos(:'u1') ->> 'regalo_disponible') as a3 \\gset
select retail.fn_club_puntos_anotar(:'c1', 'revierte', -100, null, null, null, null, null, :'regalo') as _r \\gset
select (retail.tienda_mis_puntos(:'u1') ->> 'regalo_disponible') as a4 \\gset
select concat_ws('|', :'a1', :'a2', :'a3', :'a4');`,
  "true|false|false|true"
);
caso(
  "(e) el historial: los últimos 15, el más nuevo primero, con el código solo en canje y devuelve, y sin venta, nota ni responsable",
  `reset role;
select clienta as c, usuario as u from pg_temp.cuenta('79600007', 3000) \\gset
select count(retail.fn_club_puntos_anotar(:'c', 'compra', 10 + k, null, null, 'prueba ' || k)) as _n from generate_series(1, 20) k \\gset
${comoFelipe}select (retail.canjear_puntos(:'c', 200))::jsonb ->> 'codigo' as codigo \\gset
reset role;
-- En la vida cada movimiento es de su propia transacción (otra hora); aquí todos comparten la de la prueba: el canje va un minuto después.
alter table retail.club_puntos_movimientos disable trigger trg_club_puntos_mov_solo_agregar;
update retail.club_puntos_movimientos set created_at = now() + interval '1 minute' where clienta_id = :'c' and tipo = 'canje';
alter table retail.club_puntos_movimientos enable trigger trg_club_puntos_mov_solo_agregar;
select retail.tienda_mis_puntos(:'u') as r \\gset
select concat_ws('|', jsonb_array_length(:'r'::jsonb -> 'movimientos'), (:'r'::jsonb -> 'movimientos' -> 0 ->> 'tipo'), (:'r'::jsonb -> 'movimientos' -> 0 ->> 'puntos'),
  (:'r'::jsonb -> 'movimientos' -> 0 ->> 'codigo') = :'codigo', coalesce(:'r'::jsonb -> 'movimientos' -> 1 ->> 'codigo', 'sin'),
  (:'r'::jsonb -> 'movimientos' -> 0) ? 'nota', (:'r'::jsonb -> 'movimientos' -> 0) ? 'venta_id', (:'r'::jsonb -> 'movimientos' -> 0) ? 'registrado_por');`,
  "15|canje|-200|t|sin|f|f|f"
);
caso(
  "(f) solo tienda_web la ejecuta: ni public, ni anon, ni authenticated",
  `select concat_ws('|', has_function_privilege('anon', 'retail.tienda_mis_puntos(uuid)', 'execute'), has_function_privilege('authenticated', 'retail.tienda_mis_puntos(uuid)', 'execute'),
  case when exists (select 1 from pg_roles where rolname = 'tienda_web') then has_function_privilege('tienda_web', 'retail.tienda_mis_puntos(uuid)', 'execute')::text else 'true' end);`,
  "f|f|true"
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

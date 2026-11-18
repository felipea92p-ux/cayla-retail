#!/usr/bin/env node
/**
 * Los dos permisos de WhatsApp del Club (ADR-0680) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261118154000`, `20261118155000` y `20261118160000` (club_avisos_del_club, partes 1 a 3):
 *   a. Estructura: la foto `clientas.avisos_club_desde`, el texto `casilla_avisos_club` v1 tal cual lo eligió Felipe, los dos
 *      disparadores, una sola `tienda_unirse_al_club` (la de 16 parámetros) y solo para `tienda_web`.
 *   b. El cartel con la casilla da los dos permisos con UNA fila (la de publicidad es la prueba); sin la casilla, ninguno.
 *   c. La BAJA quita los dos (Felipe 2026-11-18: «BAJA quita todo»), también a quien solo tenía los avisos; el club sigue.
 *   d. Cambiar el celular quita los avisos: con publicidad, por el camino de siempre; sin ella, el disparador de `clientas`.
 *   e. Anonimizar quita los avisos con el club.
 *   f. El selector: el regalo de cumpleaños va a quien tiene los AVISOS; las novedades, a quien tiene la PUBLICIDAD.
 *   g. La tienda online: cada casilla da SU permiso, citando SU texto; el texto viejo se rechaza sin escribir; el celular distinto
 *      no activa nada; la llamada de antes (14 parámetros) sigue funcionando.
 *   h. El legado: quien tenía la publicidad antes de esto conserva los avisos, desde la misma fecha y sin fila nueva.
 *   i. Las tres partes se pegan dos veces sin error.
 *
 * CÓMO. Cada caso en su transacción, que termina en ROLLBACK, con fichas de DNI 9077xxxx y los usuarios del seed.
 *
 * USO
 *   pnpm pruebas:club-avisos-del-club      → contra la base del stack local (la del CI)
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";
const PARTES = [
  "supabase/migrations/20261118154000_club_avisos_del_club_parte1_clientas.sql",
  "supabase/migrations/20261118155000_club_avisos_del_club_parte2_permisos.sql",
  "supabase/migrations/20261118160000_club_avisos_del_club_parte3_funciones.sql",
];
const TEXTO_AVISOS =
  "Quiero recibir por WhatsApp los avisos de mi Club: mis puntos, mis cupones, mi regalo de cumpleaños y antes de que se venzan mis puntos.";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_detalle text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_detalle = pg_exception_detail;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || coalesce(v_detalle, '');
end $f$;
-- Una socia del cartel de Tienda Lima, con (o sin) la casilla de WhatsApp, nacida un 15 de p_mes. Como postgres.
create function pg_temp.socia(p_dni text, p_cel text, p_ubic uuid, p_mes integer, p_pub boolean) returns uuid language plpgsql as $f$
declare v uuid;
begin
  -- Fuera del grupo testigo (CL-20, fijo por id): el testigo no recibe novedades y el caso dependería del azar.
  v := (select g.id from (select gen_random_uuid() as id from generate_series(1, 200)) g where not retail.fn_club_es_testigo(g.id) limit 1);
  insert into retail.clientas (id, documento_tipo, documento_numero, nombre) values (v, 'dni', p_dni, 'LUCIA PRUEBA AVISOS');
  perform retail.registrarse_en_el_club(p_ubic, 'dni', p_dni, 'LUCIA PRUEBA AVISOS', p_cel, make_date(1990, p_mes, 15), null,
    true, true, p_pub,
    jsonb_build_object('terminos', (select max(t.version) from retail.club_textos t where t.tipo = 'terminos'),
                       'privacidad', (select max(t.version) from retail.club_textos t where t.tipo = 'privacidad'),
                       'casilla_publicidad', (select max(t.version) from retail.club_textos t where t.tipo = 'casilla_publicidad')), true);
  return v;
end $f$;
-- Los avisos del Club que da la casilla de la tienda online, sin la publicidad (como postgres, igual que lo escribe tienda_unirse_al_club).
create function pg_temp.solo_avisos(p_id uuid) returns void language sql as $f$
  insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, nota)
  values (p_id, 'avisos_club_whatsapp', 'otorga', 'tienda_web', 'casilla_avisos_club',
          (select max(t.version) from retail.club_textos t where t.tipo = 'casilla_avisos_club'), 'desde su cuenta en la tienda online');
$f$;
-- La publicidad que da la casilla de publicidad de la tienda online (sin los avisos: allí cada permiso tiene su casilla).
create function pg_temp.publicidad_web(p_id uuid) returns void language plpgsql as $f$
begin
  insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, nota)
  values (p_id, 'publicidad_whatsapp', 'otorga', 'tienda_web', 'casilla_publicidad',
          (select max(t.version) from retail.club_textos t where t.tipo = 'casilla_publicidad'), 'desde su cuenta en la tienda online');
  update retail.clientas set publicidad_desde = now() where id = p_id;
end $f$;
-- Entra stock de una prenda con su lote: una LLEGADA (lo que hace salir las novedades).
create function pg_temp.llega(p_variante uuid, p_ubic uuid) returns void language plpgsql as $f$
declare v_lote uuid; v_mov uuid;
begin
  insert into retail.lotes (ubicacion_id, proveedor_id) values (p_ubic, (select id from retail.proveedores order by nombre limit 1)) returning id into v_lote;
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id)
  values (p_variante, p_ubic, retail.fn_sububicacion_por_defecto(p_ubic, 'venta'), 'entrada', 5, 'recepcion', v_lote)
  returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
end $f$;
update retail.configuracion_empresa set exige_responsable = false;
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select extract(month from retail.fn_hoy_lima())::int as mes_hoy, (extract(month from retail.fn_hoy_lima())::int % 12) + 1 as otro_mes \\gset
select id as vale_bla_m from retail.variantes where sku = 'BLU-VALE-BLA-M' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'ubic' and s.tipo = 'piso_venta');
`;
const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const SOCIA = (alias, dni, { pub = true, mes = ":mes_hoy" } = {}) =>
  `reset role;\nselect pg_temp.socia('${dni}', '9${dni}', :'ubic', ${mes}, ${pub}) as ${alias} \\gset\n`;
/** «publicidad:avisos» de una ficha: t/f de cada foto. */
const FOTOS = (alias) => `reset role;\nselect case when publicidad_desde is not null then 't' else 'f' end || ':' || case when avisos_club_desde is not null then 't' else 'f' end from retail.clientas where id = :'${alias}';\n`;
/** Los eventos de avisos de una ficha, en orden: «accion/medio/texto_tipo», separados por coma. En una sola transacción tienen la misma
 *  hora: entonces el otorga va antes que el revoca, como pasó. */
const EVENTOS_AVISOS = (alias) => `reset role;\nselect coalesce(string_agg(accion || '/' || medio || '/' || coalesce(texto_tipo, '-'), ',' order by created_at, accion = 'revoca', id::text), 'ninguno')
  from retail.club_permisos where clienta_id = :'${alias}' and finalidad = 'avisos_club_whatsapp';\n`;
const QUIENES = (tipo, alias) => `${como(FELIPE)}select coalesce(string_agg(x.a, ',' order by x.a), 'ninguna')
  from (values ${alias.map((a) => `('${a}', :'${a}'::uuid)`).join(", ")}) x(a, id)
 where exists (select 1 from retail.fn_club_avisos_pendientes(:'ubic') p where p.tipo = '${tipo}' and p.clienta_id = x.id);\n`;
/** Pegar una migración sin que sus `select` de ayuda (los reemplazos anclados devuelven una fila vacía) ensucien la salida. */
const CALLADO = (sql) => `\\o /dev/null\n${sql}\n\\o\n`;
const SIN_LLEGADAS_RECIENTES = `reset role;
alter table retail.movimientos disable trigger movimientos_inmutables;
update retail.movimientos set created_at = created_at - interval '30 days' where created_at > now() - interval '14 days';
alter table retail.movimientos enable trigger movimientos_inmutables;
`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  if (obtenido === esperado) {
    console.log(`✓ ${nombre}`);
  } else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado.split("\n").join("\n              ")}\n    obtenido: ${obtenido.split("\n").join("\n              ")}`);
  }
}

try {
  execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"], { stdio: "ignore" });
} catch {
  console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
  process.exit(1);
}
if (correr("select to_regprocedure('retail.fn_club_avisos_del_club()') is not null;").salida !== "t") {
  console.error("Faltan las migraciones de los avisos del Club (20261118154000 a 20261118160000).");
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------------------------------- a
caso(
  "(a) estructura: la foto en clientas, el texto v1 tal cual, los dos disparadores y una sola tienda_unirse_al_club (16 parámetros), solo para tienda_web",
  `select (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'clientas' and column_name = 'avisos_club_desde'),
       (select texto = '${TEXTO_AVISOS}' from retail.club_textos where tipo = 'casilla_avisos_club' and version = 1),
       (select count(*) from pg_trigger where tgname in ('club_permisos_avisos_del_club', 'clientas_celular_con_avisos') and not tgisinternal),
       (select count(*) from pg_proc where proname = 'tienda_unirse_al_club' and pronamespace = 'retail'::regnamespace),
       (select pronargs from pg_proc where proname = 'tienda_unirse_al_club' and pronamespace = 'retail'::regnamespace),
       has_function_privilege('tienda_web', 'retail.tienda_unirse_al_club(uuid,text,text,boolean,text,integer,integer,integer,boolean,boolean,boolean,integer,text,text,boolean,integer)', 'EXECUTE'),
       has_function_privilege('authenticated', 'retail.tienda_unirse_al_club(uuid,text,text,boolean,text,integer,integer,integer,boolean,boolean,boolean,integer,text,text,boolean,integer)', 'EXECUTE');
`,
  "1|t|2|1|16|t|f",
);
caso(
  "(a) los candados: nadie otorga los avisos de palabra en caja (ni con persona); un evento de avisos sin persona necesita su nota",
  SOCIA("x", "90780091", { pub: false }) +
    `select split_part(pg_temp.intento(format($q$insert into retail.club_permisos (clienta_id, finalidad, accion, medio, registrado_por)
     values (%L, 'avisos_club_whatsapp', 'otorga', 'caja_palabra', %L)$q$, :'x', :'persona_felipe')), '|', 1);
select split_part(pg_temp.intento(format($q$insert into retail.club_permisos (clienta_id, finalidad, accion, medio)
     values (%L, 'avisos_club_whatsapp', 'revoca', 'baja_whatsapp')$q$, :'x')), '|', 1);
`,
  "23514\n23514",
);

// ---------------------------------------------------------------------------------------------------------------------- b
caso(
  "(b) el cartel CON la casilla da los dos permisos con UNA fila (la de publicidad es la prueba: los avisos no escriben la suya); SIN la casilla, ninguno",
  SOCIA("con", "90780001") + SOCIA("sin", "90780002", { pub: false }) + FOTOS("con") + EVENTOS_AVISOS("con") + FOTOS("sin") + EVENTOS_AVISOS("sin"),
  "t:t\nninguno\nf:f\nninguno",
);

// ---------------------------------------------------------------------------------------------------------------------- c
caso(
  "(c) la BAJA quita los dos: con publicidad del cartel, sin fila de avisos; a quien solo tenía los avisos de su casilla, su revoca; a quien tenía las dos casillas, el revoca de avisos lo escribe el disparador con la misma persona; el club sigue",
  SOCIA("ambas", "90780011") + SOCIA("avisos", "90780012", { pub: false }) + SOCIA("dos", "90780013", { pub: false }) +
    `select pg_temp.solo_avisos(:'avisos');\nselect pg_temp.solo_avisos(:'dos');\nselect pg_temp.publicidad_web(:'dos');\n` +
    como(FELIPE) +
    `select retail.registrar_baja_whatsapp('990780011', :'ubic') as _b1 \\gset\nselect retail.registrar_baja_whatsapp('990780012', :'ubic') as _b2 \\gset\nselect retail.registrar_baja_whatsapp('990780013', :'ubic') as _b3 \\gset\n` +
    FOTOS("ambas") + EVENTOS_AVISOS("ambas") + FOTOS("avisos") + EVENTOS_AVISOS("avisos") + FOTOS("dos") + EVENTOS_AVISOS("dos") +
    `select (select bool_and(registrado_por = :'persona_felipe') from retail.club_permisos where clienta_id in (:'avisos', :'dos') and finalidad = 'avisos_club_whatsapp' and accion = 'revoca'),
       (select count(*) from retail.clientas where id in (:'ambas', :'avisos', :'dos') and club_desde is not null);
`,
  "f:f\nninguno\nf:f\notorga/tienda_web/casilla_avisos_club,revoca/baja_whatsapp/-\nf:f\notorga/tienda_web/casilla_avisos_club,revoca/baja_whatsapp/-\nt|3",
);

// ---------------------------------------------------------------------------------------------------------------------- d
caso(
  "(d) cambiar el celular: con publicidad, quitarla por el celular quita también los avisos; con solo los avisos, el disparador los quita al cambiar el número",
  SOCIA("ambas", "90780021") + SOCIA("avisos", "90780022", { pub: false }) + `select pg_temp.solo_avisos(:'avisos');\n` +
    `select retail.fn_club_quitar_publicidad_por_celular(:'ambas', :'persona_felipe') as _q \\gset
update retail.clientas set telefono_whatsapp = '987111222' where id = :'ambas';
update retail.clientas set telefono_whatsapp = '987111333' where id = :'avisos';
` + FOTOS("ambas") + EVENTOS_AVISOS("ambas") + FOTOS("avisos") + EVENTOS_AVISOS("avisos"),
  "f:f\nninguno\nf:f\notorga/tienda_web/casilla_avisos_club,revoca/cambio_celular/-",
);
caso(
  "(d) cambiar algo que no es el celular no toca los avisos",
  SOCIA("avisos", "90780023", { pub: false }) + `select pg_temp.solo_avisos(:'avisos');\nupdate retail.clientas set correo = 'zz.avisos@ejemplo.com' where id = :'avisos';\n` + FOTOS("avisos"),
  "f:t",
);

// ---------------------------------------------------------------------------------------------------------------------- e
caso(
  "(e) anonimizar quita los avisos con el club (medio anonimizar)",
  SOCIA("avisos", "90780031", { pub: false }) + `select pg_temp.solo_avisos(:'avisos');\nselect retail.fn_clienta_anonimizar(:'avisos', :'persona_felipe', false) as _a \\gset\n` +
    `select avisos_club_desde is null from retail.clientas where id = :'avisos';\n` + EVENTOS_AVISOS("avisos"),
  "t\notorga/tienda_web/casilla_avisos_club,revoca/anonimizar/-",
);

// ---------------------------------------------------------------------------------------------------------------------- f
caso(
  "(f) el selector: el cumpleaños va a quien tiene los AVISOS (con o sin publicidad); las novedades, a quien tiene la PUBLICIDAD (con o sin avisos)",
  SIN_LLEGADAS_RECIENTES + SOCIA("ambas", "90780041") + SOCIA("avisos", "90780042", { pub: false }) + SOCIA("publi", "90780043", { pub: false }) +
    `select pg_temp.solo_avisos(:'avisos');
select pg_temp.publicidad_web(:'publi');
select pg_temp.llega(:'vale_bla_m', :'ubic') as _l \\gset
` + QUIENES("cumpleanos", ["ambas", "avisos", "publi"]) + QUIENES("novedades", ["ambas", "avisos", "publi"]),
  "ambas,avisos\nambas,publi",
);

// ---------------------------------------------------------------------------------------------------------------------- g
const TEXTOS = "borrador-2026-10-14";
const cuentaYficha = () => {
  const u = randomUUID();
  return `reset role;
select retail.tienda_registrar_cuenta_simple('${u}'::uuid, 'zz.avisos.${u.slice(0, 8)}@ejemplo.com', 'Lucía', true, '${TEXTOS}', 'google') as _c \\gset
select '${u}'::uuid as u \\gset
`;
};
const UNIR = (dni, { avisos = false, club = false, versionClub = "(select max(t.version) from retail.club_textos t where t.tipo = 'casilla_avisos_club')", celular = "987654321" } = {}) =>
  `retail.tienda_unirse_al_club(:'u'::uuid, '${dni}', 'Lucía Fernanda Pérez Salas', true, '${celular}', null, null, null, true, true, ${avisos}, ` +
  `${avisos ? "(select max(t.version) from retail.club_textos t where t.tipo = 'casilla_publicidad')" : "null"}, '${TEXTOS}', 'dni', ${club}, ${club ? versionClub : "null"})`;
const FICHA_DE_U = `select clienta_id as f from retail.cuentas_web where usuario_web_id = :'u' \\gset\n`;
caso(
  "(g) tienda online, solo la casilla de AVISOS: los avisos sí (citando casilla_avisos_club, sin persona), la publicidad no; devuelve avisos_club = activados",
  cuentaYficha() + `select (${UNIR("90780051", { club: true })})->>'avisos_club';\n` + FICHA_DE_U + FOTOS("f") + EVENTOS_AVISOS("f") +
    `select registrado_por is null from retail.club_permisos where clienta_id = :'f' and finalidad = 'avisos_club_whatsapp';\n`,
  "activados\nf:t\notorga/tienda_web/casilla_avisos_club\nt",
);
caso(
  "(g) tienda online, solo la casilla de PUBLICIDAD: la publicidad sí, los avisos NO (allí cada permiso tiene su casilla)",
  cuentaYficha() + `select (${UNIR("90780052", { avisos: true })})->>'avisos_club';\n` + FICHA_DE_U + FOTOS("f") + EVENTOS_AVISOS("f"),
  "no\nt:f\nninguno",
);
caso(
  "(g) tienda online, las dos casillas: cada una su permiso y su texto",
  cuentaYficha() + `select (${UNIR("90780053", { avisos: true, club: true })}) ->> 'avisos_club';\n` + FICHA_DE_U + FOTOS("f") + EVENTOS_AVISOS("f"),
  "activados\nt:t\notorga/tienda_web/casilla_avisos_club",
);
caso(
  "(g) un texto de avisos que no es el vigente se rechaza sin escribir nada (cuenta_texto_cambio, detalle avisos_club)",
  cuentaYficha() + `select pg_temp.intento(format($q$select ${UNIR("90780054", { club: true, versionClub: "99" }).replace(":'u'::uuid", "%L::uuid")}$q$, :'u'));\n` +
    `select count(*) from retail.clientas where documento_numero = '90780054';\n`,
  "P0001|cuenta_texto_cambio|avisos_club\n0",
);
caso(
  "(g) la llamada de antes (14 parámetros, la web que todavía no se publicó) sigue funcionando y no da los avisos",
  cuentaYficha() +
    `select (retail.tienda_unirse_al_club(:'u'::uuid, '90780055', 'Lucía Fernanda Pérez Salas', true, '987654321', null, null, null, true, true, false, null, '${TEXTOS}', 'dni')) ->> 'estado';\n` +
    FICHA_DE_U + FOTOS("f"),
  "ok\nf:f",
);

// ---------------------------------------------------------------------------------------------------------------------- h
caso(
  "(h) el legado: quien tenía la publicidad ANTES de esto conserva los avisos, desde la misma fecha y sin fila nueva (la prueba es su fila de publicidad); pegar la parte 3 otra vez no cambia nada",
  `alter table retail.club_permisos disable trigger club_permisos_avisos_del_club;\n` + SOCIA("antigua", "90780061") +
    `alter table retail.club_permisos enable trigger club_permisos_avisos_del_club;
update retail.clientas set publicidad_desde = now() - interval '200 days' where id = :'antigua';
` + FOTOS("antigua") + CALLADO(readFileSync(PARTES[2], "utf8") + "\n" + readFileSync(PARTES[2], "utf8")) + FOTOS("antigua") + EVENTOS_AVISOS("antigua") +
    `select avisos_club_desde = publicidad_desde from retail.clientas where id = :'antigua';
`,
  "t:f\nt:t\nninguno\nt",
);

// ---------------------------------------------------------------------------------------------------------------------- i
caso(
  "(i) las tres partes se pegan dos veces sin error",
  CALLADO(PARTES.map((p) => readFileSync(p, "utf8")).join("\n") + "\n" + PARTES.map((p) => readFileSync(p, "utf8")).join("\n")) + "select 'listo';",
  "listo",
);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
process.exit(fallas ? 1 : 0);

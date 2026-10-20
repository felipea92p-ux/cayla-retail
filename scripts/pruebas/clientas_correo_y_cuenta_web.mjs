#!/usr/bin/env node
/**
 * Un correo y un documento, una persona; entrar a la web cuenta como actividad; la cuenta web se cierra al anonimizar — CAYLA V2.
 *
 * EL PROBLEMA. Felipe (2026-10-14): «No debería dejar registrar 2 DNIs y correos iguales, debe ser único por cada usuario, entonces
 * el unir fichas es innecesario»; «entrar a la web cuenta como actividad» para la regla de 3 años del Club; y si aun así la ficha se
 * anonimiza, su cuenta web se cierra: sin su correo, sin sus favoritos ni sus esperas, y sin poder entrar. La base tiene que hacerlo
 * cumplir, no la pantalla.
 *
 * QUÉ PRUEBA (`20261015054000_clientas_correo_unico_y_sin_unir_fichas.sql` y `20261015055000_tienda_cuentas_entrada_y_cierre.sql`):
 *   A. Estructura: el índice único del correo, los disparadores, las funciones nuevas de la tienda (solo `tienda_web`), los
 *      disparadores sin EXECUTE para nadie, `unir_clientas` borrada y `clientas_fusiones` en su lugar.
 *   B. Un correo, una ficha: el de otra ficha se rechaza al dar de alta y al cambiarlo (23505, `correo_repetido`), sin decir de
 *      quién es; la misma ficha lo vuelve a guardar; sin el disparador, el índice frena igual. Y en una base SIN la tienda online
 *      (producción antes de la actividad 13), el correo de una ficha se guarda y se vigila igual.
 *   C. Ficha y cuenta web: la cuenta no lleva el correo de OTRA ficha, ni una ficha el de la cuenta web de otra; la misma persona sí
 *      (su correo de contacto y el de su cuenta); una cuenta cerrada suelta su correo.
 *   D. Dos escrituras del mismo correo a la vez (dos conexiones reales, ROLLBACK): la segunda espera en el candado del correo.
 *   E. El cartel del Club con el correo de otra ficha: `correo_repetido` y no se escribe nada.
 *   F. La tienda: `tienda_revisar_registro` dice `correo_de_otra_persona` (y `ok` con el DNI de esa misma ficha);
 *      `tienda_registrar_cuenta` con el correo de otra ficha (la carrera que se saltó la revisión) no escribe nada.
 *   G. `editar_clienta` con el documento de otra ficha dice de cuál es (nombre, código del club, archivada).
 *   H. La entrada: `tienda_anotar_entrada` anota (también como `tienda_web`), y dice `sin_cuenta` o `cerrada`.
 *   I. El cierre: anonimizar cierra la cuenta en la misma escritura —sin correo ni usuario, con favoritos y esperas quitados, y desde
 *      «Mi cuenta» (20261015132000) sin su cambio de correo pendiente ni sus intentos de contraseña—;
 *      ninguna función la vuelve a encontrar; su usuario queda por borrar y se anota borrado una vez; una cuenta cerrada no se
 *      reabre; ninguna ficha anonimizada queda con una cuenta viva o con datos.
 *   J. La conservación (3 años desde la última compra; ADR-0459, Felipe 2026-10-19: «a los 3 años sin compras se eliminan los datos Y
 *      los puntos», `20261019220000`): comprar hace poco la frena, entrar a la web o crear la cuenta hace poco ya NO; al anonimizar, la
 *      cuenta web se cierra; un pedido web en curso la frena (uno anulado, no).
 *   K. El pegado: las dos partes, dos veces; la PARTE 1 aborta con correos repetidos o con `editar_clienta` cambiada en vivo; la
 *      PARTE 2, con una cuenta que ya tiene el correo de otra ficha.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK (fichas con DNI 0998xxxx, correos «zz.…@ejemplo.com»): nada queda en el
 * Postgres local. La carrera (D) usa dos fichas del seed sin correo y también termina en ROLLBACK.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=1` mete las dos partes dentro de cada transacción (que se revierte); la carrera no corre
 * así (cada conexión pegaría su propia copia de la migración y se esperarían por las tablas).
 *
 * USO
 *   pnpm pruebas:clientas-correo    → necesita el stack local (`npx supabase start`)
 *   node scripts/pruebas/clientas_correo_y_cuenta_web.mjs --contenedor supabase_db_<mi-pila>   → contra una pila propia
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const PARTE_1 = "supabase/migrations/20261015054000_clientas_correo_unico_y_sin_unir_fichas.sql";
const PARTE_2 = "supabase/migrations/20261015055000_tienda_cuentas_entrada_y_cierre.sql";
const SQL_1 = readFileSync(PARTE_1, "utf8");
const SQL_2 = readFileSync(PARTE_2, "utf8");
// 20261015123000 (Felipe 2026-10-15: el correo en «Editar» de la ficha) cambió la firma de editar_clienta: creó la de 11 (con
// p_correo) y borró la de 10. Volver a pegar la PARTE 1 encima aborta A PROPÓSITO (su candado no encuentra la de 10; lo prueba
// clientas_correo_en_la_ficha.mjs). Los casos de K que vuelven a pegarla empiezan por dejar editar_clienta como la dejó la PARTE 1
// (su texto, sacado de ese archivo), dentro de la transacción que se revierte.
const EDITAR_DE_LA_PARTE_1 = (() => {
  const ini = SQL_1.indexOf("create or replace function retail.editar_clienta(");
  const fin = SQL_1.indexOf("\n$$;", ini);
  if (ini < 0 || fin < 0) throw new Error(`No encontré editar_clienta en ${PARTE_1}`);
  return SQL_1.slice(ini, fin + "\n$$;".length);
})();
const COMO_LA_DEJO_LA_PARTE_1 = `drop function if exists retail.editar_clienta(uuid, text, text, text, text, smallint, smallint, smallint, jsonb, integer, text);
${EDITAR_DE_LA_PARTE_1}
`;
// 20261017044000 (ADR-0434, actividad 8: los looks guardados) le sumó a fn_cuentas_web_cerrar_al_anonimizar la línea que quita los looks
// vivos al cerrar la cuenta. Volver a pegar la PARTE 2 encima aborta A PROPÓSITO (su candado ve la función cambiada y no la pisa a
// ciegas). Los casos de K que vuelven a pegar la PARTE 2 empiezan por dejarla como la dejó la PARTE 2 (su texto, sacado de ese
// archivo), dentro de la transacción que se revierte, igual que con editar_clienta.
const CIERRE_DE_LA_PARTE_2 = (() => {
  const ini = SQL_2.indexOf("create or replace function retail.fn_cuentas_web_cerrar_al_anonimizar(");
  const fin = SQL_2.indexOf("\n$$;", ini);
  if (ini < 0 || fin < 0) throw new Error(`No encontré fn_cuentas_web_cerrar_al_anonimizar en ${PARTE_2}`);
  return SQL_2.slice(ini, fin + "\n$$;".length);
})();
// 20261017175000 (ADR-0438: la cuenta simple) le dejó a fn_cuenta_web_reglas pasar de una ficha mínima a otra. Mismo caso: el candado de la
// PARTE 2 no pisa una versión que no es la suya; los casos de K empiezan por dejarla como la dejó la PARTE 2.
const REGLAS_DE_LA_PARTE_2 = (() => {
  const ini = SQL_2.indexOf("create or replace function retail.fn_cuenta_web_reglas(");
  const fin = SQL_2.indexOf("\n$$;", ini);
  if (ini < 0 || fin < 0) throw new Error(`No encontré fn_cuenta_web_reglas en ${PARTE_2}`);
  return SQL_2.slice(ini, fin + "\n$$;".length);
})();
// 20261019220000 (ADR-0459, puntos: «a los 3 años sin compras») reescribió fn_club_anonimizar_inactivas: la fecha de «Mi Club» y una ficha a la
// vez. Mismo caso: el candado de la PARTE 2 no la pisa; los casos de K empiezan por dejarla como la dejó la PARTE 2.
const CONSERVACION_DE_LA_PARTE_2 = (() => {
  const ini = SQL_2.indexOf("create or replace function retail.fn_club_anonimizar_inactivas(");
  const fin = SQL_2.indexOf("\n$$;", ini);
  if (ini < 0 || fin < 0) throw new Error(`No encontré fn_club_anonimizar_inactivas en ${PARTE_2}`);
  return SQL_2.slice(ini, fin + "\n$$;".length);
})();
const COMO_LA_DEJO_LA_PARTE_2 = `${CIERRE_DE_LA_PARTE_2}
${REGLAS_DE_LA_PARTE_2}
${CONSERVACION_DE_LA_PARTE_2}
`;
const APLICAR_ANTES = process.env.APLICAR_ANTES === "1";
const FELIPE = "22222222-2222-4222-8222-000000000001";
const TEXTOS = "borrador-2026-10-14";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    const salida = execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
function correrEnParalelo(sql) {
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

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 12).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio:\n${r.salida}\nse esperaba:\n${esperado}` : r.mensaje);
}

// Cada escenario: sus fichas a mano —Ana con correo de contacto, Bea sin correo, Cami socia archivada—, como Felipe (líder).
const PREPARAR = `
begin;
${APLICAR_ANTES ? `${SQL_1}\n${SQL_2}\n` : ""}
set local search_path = retail, public, extensions;
do $$ begin
  if exists (select 1 from retail.clientas where documento_numero like '0998%') then
    raise exception 'Ambiente sucio: ya hay fichas con DNI 0998xxxx en esta base.';
  end if;
end $$;
update retail.configuracion_empresa set exige_responsable = false;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, correo, telefono_whatsapp)
values ('dni', '09980001', 'Ana Correo Prueba', 'zz.ana@ejemplo.com', '987980001') returning id as ana \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp)
values ('dni', '09980002', 'Bea Sin Correo', '987980002') returning id as bea \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club)
values ('dni', '09980003', 'Cami Socia Archivada', '987980003', now() - interval '200 days', retail.fn_club_codigo_nuevo())
returning id as cami, codigo_club as cami_codigo \\gset
update retail.clientas set archivada_en = now(), motivo_archivo = 'prueba' where id = :'cami';
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_detalle text; v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_detalle = pg_exception_detail, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || coalesce(v_detalle, '') || '|' || v_msg;
end $f$;
-- Solo el código, el hint y el detail de un intento («23505|correo_repetido|correo»).
create function pg_temp.corto(p text) returns text language sql as $f$
  select case when p = 'ok' then 'ok' else split_part(p, '|', 1) || '|' || split_part(p, '|', 2) || '|' || split_part(p, '|', 3) end
$f$;
-- Una cuenta web abierta, como la deja tienda_registrar_cuenta (aquí directo: lo que se prueba son sus candados).
create function pg_temp.cuenta(p_ficha uuid, p_correo text, p_creada timestamptz default now(), p_entrada timestamptz default null)
returns uuid language sql as $f$
  insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados, aceptados_en, creada_en, ultima_entrada_en)
  values (gen_random_uuid(), p_ficha, p_correo, '${TEXTOS}', p_creada, p_creada, p_entrada)
  returning usuario_web_id;
$f$;
`;
const caso = (sql) => correr(`${PREPARAR}${sql}\nrollback;`);
const VERSIONES = `(select jsonb_object_agg(t.tipo, t.v) from (select tipo, max(version) as v from retail.club_textos
                    where tipo in ('terminos', 'privacidad', 'casilla_publicidad') group by tipo) t)`;
// Una cuenta web de Bea con favoritos, una espera y su visita a «Mi cuenta». Deja :u (su usuario) y :cuenta. Y desde «Mi cuenta»
// (20261015132000), un cambio de correo esperando su código y dos intentos de contraseña: también son suyos y se van al cerrarse.
const BEA_CON_CUENTA = `select pg_temp.cuenta(:'bea', 'zz.bea.web@ejemplo.com') as u \\gset
select id as cuenta from retail.cuentas_web where usuario_web_id = :'u' \\gset
insert into retail.favoritos_web (cuenta_web_id, producto_id) select :'cuenta', p.id from retail.productos p order by p.id limit 2;
insert into retail.esperas_web (cuenta_web_id, variante_id) select :'cuenta', v.id from retail.variantes v order by v.id limit 1;
insert into retail.cuentas_web_visitas (cuenta_web_id, visita_en) values (:'cuenta', now());
insert into retail.cuentas_web_cambios_correo (cuenta_web_id, correo_nuevo, origen, vence_en) values (:'cuenta', 'zz.bea.nuevo@ejemplo.com', 'cuenta', now() + interval '1 day');
insert into retail.cuentas_web_intentos_clave (cuenta_web_id, intentos) values (:'cuenta', 2);
`;
const ANONIMIZAR_BEA = `select retail.archivar_clienta(:'bea', 'pidió que la borren', true, null) as _version \\gset\n`;

function main() {
  if (!correr("select 1;").ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES && correr("select to_regprocedure('retail.tienda_anotar_entrada(uuid)') is not null;").salida !== "t") {
    console.error(`Falta la PARTE 2: aplica ${PARTE_1} y ${PARTE_2}, o corre con APLICAR_ANTES=1`);
    process.exit(2);
  }
  const preparado = caso("select 'listo';");
  if (!preparado.ok || preparado.salida !== "listo") {
    console.error(`No se pudo preparar el escenario: ${preparado.mensaje ?? preparado.salida}`);
    process.exit(2);
  }

  console.log("— A. Estructura —");
  esperarValor(
    "el índice único del correo es sobre lower(btrim(correo)) y solo donde hay correo",
    caso(`select indexdef from pg_indexes where schemaname = 'retail' and indexname = 'clientas_correo_unico';`),
    "CREATE UNIQUE INDEX clientas_correo_unico ON retail.clientas USING btree (lower(btrim(correo))) WHERE (correo IS NOT NULL)",
  );
  esperarValor(
    "los disparadores: el correo en clientas (alta y cambio) y en cuentas_web, las reglas de la cuenta y el cierre al anonimizar",
    caso(`select string_agg(n.nspname || '.' || c.relname || ':' || t.tgname, ',' order by t.tgname)
            from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where not t.tgisinternal and t.tgname in ('clientas_correo_de_una_persona_alta', 'clientas_correo_de_una_persona_cambio',
             'cuentas_web_correo_de_una_persona', 'cuentas_web_reglas', 'clientas_cuenta_web_al_anonimizar');`),
    "retail.clientas:clientas_correo_de_una_persona_alta,retail.clientas:clientas_correo_de_una_persona_cambio," +
      "retail.clientas:clientas_cuenta_web_al_anonimizar,retail.cuentas_web:cuentas_web_correo_de_una_persona,retail.cuentas_web:cuentas_web_reglas",
  );
  esperarValor(
    "unir_clientas ya no existe (ni el disparador que movía los pedidos web al unir); clientas_fusiones sigue (es historia)",
    caso(`select to_regprocedure('retail.unir_clientas(uuid,uuid,integer,integer)') is null,
                 to_regprocedure('retail.fn_pedidos_web_siguen_a_la_ficha()') is null,
                 not exists (select 1 from pg_trigger where tgname = 'clientas_pedidos_web_siguen_a_la_ficha'),
                 to_regclass('retail.clientas_fusiones') is not null;`),
    "t|t|t|t",
  );
  const NUEVAS = ["tienda_anotar_entrada(uuid)", "tienda_revisar_registro(text,text,text,text,text,text)", "tienda_usuario_borrado(uuid)", "tienda_usuarios_por_borrar(integer)"];
  esperarValor(
    "las funciones de la tienda: security definer, con su search_path, solo para tienda_web",
    caso(`select string_agg(f || ':' || (p.prosecdef and exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%'))::text || ':' ||
             has_function_privilege('tienda_web', p.oid, 'EXECUTE')::text || ':' ||
             (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text,
             ',' order by f collate "C")
        from unnest(array[${NUEVAS.map((f) => `'${f}'`).join(", ")}]) f join pg_proc p on p.oid = ('retail.' || f)::regprocedure;`),
    NUEVAS.map((f) => `${f}:true:true:false`).join(","),
  );
  esperarValor(
    "los tres disparadores son security definer con su search_path y nadie de la API los ejecuta (tampoco tienda_web)",
    caso(`select bool_and(p.prosecdef and exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%')) || '|' ||
                 bool_or(has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
                         or has_function_privilege('tienda_web', p.oid, 'EXECUTE'))
            from pg_proc p where p.oid in ('retail.fn_correo_de_una_persona()'::regprocedure, 'retail.fn_cuenta_web_reglas()'::regprocedure,
                                           'retail.fn_cuentas_web_cerrar_al_anonimizar()'::regprocedure);`),
    "true|false",
  );

  console.log("— B. Un correo, una ficha —");
  esperarValor(
    "el correo de otra ficha se rechaza al dar de alta y al cambiarlo (23505, correo_repetido, en la caja del correo)",
    caso(`select pg_temp.corto(pg_temp.intento($q$insert into retail.clientas (documento_tipo, documento_numero, nombre, correo) values ('dni', '09980011', 'Otra', 'zz.ana@ejemplo.com')$q$));
          select pg_temp.corto(pg_temp.intento(format('update retail.clientas set correo = %L where id = %L', 'zz.ana@ejemplo.com', :'bea')));`),
    "23505|correo_repetido|correo\n23505|correo_repetido|correo",
  );
  esperarValor(
    "el mensaje no dice de quién es: ni su nombre, ni su DNI, ni el correo",
    caso(`select pg_temp.intento(format('update retail.clientas set correo = %L where id = %L', 'zz.ana@ejemplo.com', :'bea'))
                 !~* '(Ana Correo|09980001|zz\\.ana)';`),
    "t",
  );
  esperarValor(
    "la misma ficha vuelve a guardar su correo; un correo libre y quitarlo, sin problema; dos fichas sin correo, también",
    caso(`select pg_temp.intento(format('update retail.clientas set correo = %L, telefono_whatsapp = telefono_whatsapp where id = %L', 'zz.ana@ejemplo.com', :'ana')) || ',' ||
                 pg_temp.intento(format('update retail.clientas set correo = %L where id = %L', 'zz.bea@ejemplo.com', :'bea')) || ',' ||
                 pg_temp.intento(format('update retail.clientas set correo = null where id = %L', :'bea')) || ',' ||
                 pg_temp.intento($q$insert into retail.clientas (documento_tipo, documento_numero, nombre) values ('dni', '09980012', 'Sin Correo Dos')$q$);`),
    "ok,ok,ok,ok",
  );
  esperarValor(
    "sin el disparador, el índice único frena igual el correo repetido (la red debajo del mensaje)",
    caso(`alter table retail.clientas disable trigger clientas_correo_de_una_persona_alta;
          select split_part(r, '|', 1), r like '%clientas_correo_unico%'
            from (select pg_temp.intento($q$insert into retail.clientas (documento_tipo, documento_numero, nombre, correo) values ('dni', '09980013', 'Otra', 'zz.ana@ejemplo.com')$q$) as r) x;`),
    "23505|t",
  );
  esperarValor(
    "en una base SIN la tienda online (producción antes de la actividad 13), el correo de una ficha se guarda y se vigila igual",
    caso(`alter table retail.cuentas_web rename to cuentas_web_todavia_no;
          select to_regclass('retail.cuentas_web') is null;
          select pg_temp.intento(format('update retail.clientas set correo = %L where id = %L', 'zz.bea@ejemplo.com', :'bea'));
          select pg_temp.corto(pg_temp.intento(format('update retail.clientas set correo = %L where id = %L', 'zz.ana@ejemplo.com', :'bea')));`),
    "t\nok\n23505|correo_repetido|correo",
  );

  console.log("— C. La ficha y la cuenta web —");
  esperarValor(
    "una cuenta web con el correo de contacto de OTRA ficha se rechaza; una ficha con el correo de la cuenta web de OTRA, también",
    caso(`select pg_temp.cuenta(:'bea', 'zz.bea.web@ejemplo.com') as _u \\gset
          select pg_temp.corto(pg_temp.intento(format('select pg_temp.cuenta(%L, %L)', :'cami', 'zz.ana@ejemplo.com')));
          select pg_temp.corto(pg_temp.intento(format('update retail.clientas set correo = %L where id = %L', 'zz.bea.web@ejemplo.com', :'ana')));`),
    "23505|correo_repetido|correo\n23505|correo_repetido|correo",
  );
  esperarValor(
    "la misma persona: su ficha puede tener como correo de contacto el de su cuenta web, y su cuenta el de su ficha",
    caso(`select pg_temp.cuenta(:'bea', 'zz.bea.web@ejemplo.com') as _u \\gset
          select pg_temp.intento(format('update retail.clientas set correo = %L where id = %L', 'zz.bea.web@ejemplo.com', :'bea')) || ',' ||
                 pg_temp.intento(format('select pg_temp.cuenta(%L, %L)', :'ana', 'zz.ana@ejemplo.com'));`),
    "ok,ok",
  );
  esperarValor(
    "una cuenta cerrada suelta su correo: después otra ficha lo puede usar",
    caso(`${BEA_CON_CUENTA}${ANONIMIZAR_BEA}
          select pg_temp.intento(format('update retail.clientas set correo = %L where id = %L', 'zz.bea.web@ejemplo.com', :'ana'));`),
    "ok",
  );

  console.log("— E. El cartel del Club —");
  esperarValor(
    "registrarse en el cartel con el correo de otra ficha: correo_repetido y no se escribe nada; con un correo libre, sí",
    caso(`select ${VERSIONES} as versiones \\gset
          select count(*) as fichas0 from retail.clientas \\gset
          select pg_temp.corto(pg_temp.intento(format($q$select * from retail.registrarse_en_el_club(%L, 'dni', '09980021', 'LUCIA PRUEBA CARTEL', '987980021', '1990-05-12', 'zz.ana@ejemplo.com', true, true, false, %L::jsonb, true)$q$, :'tru', :'versiones')));
          select (select count(*) from retail.clientas) - :fichas0;
          select pg_temp.intento(format($q$select * from retail.registrarse_en_el_club(%L, 'dni', '09980021', 'LUCIA PRUEBA CARTEL', '987980021', '1990-05-12', 'zz.lucia@ejemplo.com', true, true, false, %L::jsonb, true)$q$, :'tru', :'versiones'));
          select correo from retail.clientas where documento_numero = '09980021';`),
    "23505|correo_repetido|correo\n0\nok\nzz.lucia@ejemplo.com",
  );

  console.log("— F. La tienda: antes del código y al crear la cuenta —");
  esperarValor(
    "tienda_revisar_registro: el correo de contacto de otra ficha → correo_de_otra_persona; con el DNI de esa misma ficha → ok; el de una cuenta → correo_repetido",
    caso(`select pg_temp.cuenta(:'bea', 'zz.bea.web@ejemplo.com') as _u \\gset
          select retail.tienda_revisar_registro('zz.ana@ejemplo.com', '09980031', '987980031', 'zz-ip-1', 'zz-doc-1') ->> 'estado';
          select retail.tienda_revisar_registro(' ZZ.Ana@Ejemplo.com ', '09980001', '987980032', 'zz-ip-2', 'zz-doc-2') ->> 'estado';
          select retail.tienda_revisar_registro('zz.bea.web@ejemplo.com', '09980033', '987980033', 'zz-ip-3', 'zz-doc-3') ->> 'estado';`),
    "correo_de_otra_persona\nok\ncorreo_repetido",
  );
  esperarValor(
    "tienda_registrar_cuenta con el correo de otra ficha (la carrera que se saltó la revisión): correo_repetido y no se escribe nada",
    caso(`select gen_random_uuid() as u \\gset
          insert into retail.cuentas_web_pendientes (correo, usuario_web_id, envios, primer_envio_en, ultimo_envio_en, vence_en, intentos)
          values ('zz.ana@ejemplo.com', :'u', 1, now(), now(), now() + interval '30 minutes', 1);
          select count(*) as fichas0 from retail.clientas \\gset
          select pg_temp.corto(pg_temp.intento(format($q$select retail.tienda_registrar_cuenta(%L, 'zz.ana@ejemplo.com', '09980041', 'Nueva Persona', false, '987980041', 3, 4, null, true, true, false, null, '${TEXTOS}')$q$, :'u')));
          select ((select count(*) from retail.clientas) - :fichas0) || '|' || (select count(*) from retail.cuentas_web where usuario_web_id = :'u');`),
    "23505|correo_repetido|correo\n0|0",
  );

  console.log("— G. El documento de otra ficha, en el ERP —");
  esperarValor(
    "editar_clienta con el documento de otra ficha dice de cuál es (su nombre, su código del club, archivada) y no cambia nada",
    caso(`select version as v0 from retail.clientas where id = :'bea' \\gset
          select pg_temp.intento(format($q$select retail.editar_clienta(%L, 'dni', '09980001', 'Bea Sin Correo', '987980002', null, null, null, null, null)$q$, :'bea'));
          select pg_temp.intento(format($q$select retail.editar_clienta(%L, 'dni', '09980003', 'Bea Sin Correo', '987980002', null, null, null, null, null)$q$, :'bea'))
                 = '23505|documento_de_otra_ficha|documento|Ese documento ya es de la ficha de Cami Socia Archivada (' || :'cami_codigo'
                   || ', archivada). Un documento es de una sola persona: búscala en Clientes y corrige la que esté mal.';
          select documento_numero || '|' || (version = :v0) from retail.clientas where id = :'bea';`),
    "23505|documento_de_otra_ficha|documento|Ese documento ya es de la ficha de Ana Correo Prueba. Un documento es de una sola persona: búscala en Clientes y corrige la que esté mal.\nt\n09980002|true",
  );

  console.log("— H. La entrada a la web —");
  esperarValor(
    "tienda_anotar_entrada: anota la entrada, también como tienda_web; un usuario sin cuenta o vacío → sin_cuenta",
    caso(`select pg_temp.cuenta(:'bea', 'zz.bea.web@ejemplo.com', now() - interval '2 days') as u \\gset
          select retail.tienda_anotar_entrada(:'u') ->> 'estado';
          select ultima_entrada_en between now() - interval '1 minute' and now() + interval '1 minute' from retail.cuentas_web where usuario_web_id = :'u';
          grant tienda_web to current_user with set true;
          set local role tienda_web;
          select (retail.tienda_anotar_entrada(:'u') ->> 'estado') || '|' || (retail.tienda_anotar_entrada(gen_random_uuid()) ->> 'estado') || '|' ||
                 (retail.tienda_anotar_entrada(null) ->> 'estado');`),
    "anotada\nt\nanotada|sin_cuenta|sin_cuenta",
  );

  console.log("— I. El cierre de la cuenta web al anonimizar —");
  esperarValor(
    "anonimizar en tienda cierra la cuenta en la misma escritura: sin correo ni usuario, con el usuario por borrar, favoritos y esperas quitados, y sin su cambio de correo pendiente ni sus intentos de contraseña",
    caso(`${BEA_CON_CUENTA}${ANONIMIZAR_BEA}
          select (cerrada_en is not null) || '|' || (correo is null) || '|' || (usuario_web_id is null) || '|' || (usuario_cerrado_id = :'u') || '|' ||
                 (usuario_borrado_en is null) from retail.cuentas_web where id = :'cuenta';
          select (select count(*) filter (where quitado_en is null) || '/' || count(*) from retail.favoritos_web where cuenta_web_id = :'cuenta') || '|' ||
                 (select count(*) filter (where quitada_en is null) || '/' || count(*) from retail.esperas_web where cuenta_web_id = :'cuenta') || '|' ||
                 (select count(*) from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta') || '|' ||
                 (select count(*) from retail.cuentas_web_intentos_clave where cuenta_web_id = :'cuenta');`),
    "true|true|true|true|true\n0/2|0/1|0|0",
  );
  esperarValor(
    "cerrada, ninguna función de la tienda la encuentra: Mi cuenta, el Club, los favoritos y los pedidos dicen «no hay cuenta»; la entrada dice «cerrada»",
    caso(`${BEA_CON_CUENTA}${ANONIMIZAR_BEA}
          select coalesce(retail.tienda_mi_cuenta(:'u')::text, 'null') || '|' || coalesce(retail.tienda_mi_club(:'u')::text, 'null') || '|' ||
                 coalesce(retail.tienda_mis_favoritos_y_esperas(:'u')::text, 'null') || '|' || coalesce(retail.tienda_mis_pedidos(:'u')::text, 'null') || '|' ||
                 (retail.tienda_favorito(:'u', (select id from retail.productos order by id limit 1), true) ->> 'estado') || '|' ||
                 (retail.tienda_anotar_entrada(:'u') ->> 'estado');`),
    "null|null|null|null|sin_cuenta|cerrada",
  );
  esperarValor(
    "su usuario queda por borrar en el proyecto de clientes; se anota borrado una sola vez y deja de estar en la lista",
    caso(`${BEA_CON_CUENTA}${ANONIMIZAR_BEA}
          select (retail.tienda_usuarios_por_borrar(200) -> 'usuarios') ? :'u';
          select retail.tienda_usuario_borrado(:'u');
          select retail.tienda_usuario_borrado(:'u');
          select retail.tienda_usuario_borrado(gen_random_uuid()) || '|' || retail.tienda_usuario_borrado(null);
          select (retail.tienda_usuarios_por_borrar(200) -> 'usuarios') ? :'u';`),
    "t\nt\nf\nfalse|false\nf",
  );
  esperarValor(
    "una cuenta cerrada no se reabre ni cambia de ficha; una cuenta abierta no puede colgar de una ficha anonimizada",
    caso(`${BEA_CON_CUENTA}${ANONIMIZAR_BEA}
          select pg_temp.corto(pg_temp.intento(format('update retail.cuentas_web set cerrada_en = null, usuario_web_id = usuario_cerrado_id, usuario_cerrado_id = null, correo = %L where id = %L', 'zz.bea.web@ejemplo.com', :'cuenta')));
          select pg_temp.corto(pg_temp.intento(format('update retail.cuentas_web set clienta_id = %L where id = %L', :'ana', :'cuenta')));
          select pg_temp.corto(pg_temp.intento(format('select pg_temp.cuenta(%L, %L)', :'bea', 'zz.otra.web@ejemplo.com')));`),
    "23514|cuenta_web_cerrada|\n23514|cuenta_web_inmutable|\n23514|cuenta_web_de_ficha_anonimizada|",
  );
  esperarValor(
    "un usuario que es el de una cuenta ABIERTA nunca está en la lista por borrar (ni se anota borrado)",
    caso(`${BEA_CON_CUENTA}${ANONIMIZAR_BEA}
          insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados) values (:'u', :'ana', 'zz.ana@ejemplo.com', '${TEXTOS}');
          select ((retail.tienda_usuarios_por_borrar(200) -> 'usuarios') ? :'u') || '|' || retail.tienda_usuario_borrado(:'u') || '|' ||
                 (retail.tienda_anotar_entrada(:'u') ->> 'estado');`),
    "false|false|anotada",
  );
  const CUENTAS_VIVAS_DE_ANONIMIZADAS = `select count(*) from retail.cuentas_web w join retail.clientas c on c.id = w.clienta_id
           where c.anonimizada and (w.cerrada_en is null or w.correo is not null or w.usuario_web_id is not null
                                    or exists (select 1 from retail.favoritos_web f where f.cuenta_web_id = w.id and f.quitado_en is null)
                                    or exists (select 1 from retail.esperas_web e where e.cuenta_web_id = w.id and e.quitada_en is null)
                                    or exists (select 1 from retail.cuentas_web_cambios_correo m where m.cuenta_web_id = w.id)
                                    or exists (select 1 from retail.cuentas_web_intentos_clave i where i.cuenta_web_id = w.id));`;
  esperarValor(
    "en toda la base: ninguna ficha anonimizada tiene una cuenta web abierta o con datos (correo, usuario, favoritos o esperas vivos, un cambio de correo pendiente o intentos de contraseña)",
    caso(`${BEA_CON_CUENTA}${ANONIMIZAR_BEA}${CUENTAS_VIVAS_DE_ANONIMIZADAS}`),
    "0",
  );
  esperarValor(
    "control: sin el disparador del cierre, la ficha anonimizada SÍ queda con su cuenta viva (la consulta de arriba no está ciega)",
    caso(`alter table retail.clientas disable trigger clientas_cuenta_web_al_anonimizar;
          ${BEA_CON_CUENTA}${ANONIMIZAR_BEA}${CUENTAS_VIVAS_DE_ANONIMIZADAS}`),
    "1",
  );

  console.log("— J. La conservación: 3 años sin comprar —");
  // Siete fichas de hace 5 años, cada una con lo suyo. La anonimizada pierde su DNI: se la sigue por su id, guardado antes.
  // Hasta 20261019220000 entrar a la web (o crear la cuenta) también corría el plazo; desde ADR-0459 solo la compra (o el registro o la
  // unión al club, que en estas fichas son de hace 5 años). Crear la cuenta web hace 1 año NO cuenta como «se registró»: lo dice
  // fn_club_conservacion_hasta, y es una decisión abierta de Felipe (ADR-0459). La que compró hace 1 año tiene
  // una cuenta web sin entrar hace 4 años: sigue abierta (la cuenta solo se cierra al anonimizar la ficha).
  esperarValor(
    "compró hace 1 año o tiene un pedido web en curso: sigue (y su cuenta web, aunque no entre hace 4 años, sigue abierta); sin compras en 3 años —aunque haya entrado a la web hace 10 días o creado la cuenta hace 1 año— o con un pedido anulado: se anonimiza y su cuenta se cierra",
    caso(`create temp table viejas (d text, id uuid) on commit drop;
          insert into retail.clientas (documento_tipo, documento_numero, nombre) values
            ('dni', '09980051', 'Vieja Entro Hace Poco'), ('dni', '09980052', 'Vieja No Entro'), ('dni', '09980053', 'Vieja Cuenta Nueva'),
            ('dni', '09980054', 'Vieja Compro'), ('dni', '09980055', 'Vieja Sin Nada'), ('dni', '09980056', 'Vieja Pedido En Curso'),
            ('dni', '09980057', 'Vieja Pedido Anulado');
          insert into viejas select documento_numero, id from retail.clientas where documento_numero between '09980051' and '09980057';
          update retail.clientas set created_at = now() - interval '5 years' where id in (select id from viejas);
          select pg_temp.cuenta((select id from viejas where d = '09980051'), 'zz.v1@ejemplo.com', now() - interval '4 years', now() - interval '10 days') as _1 \\gset
          select pg_temp.cuenta((select id from viejas where d = '09980052'), 'zz.v2@ejemplo.com', now() - interval '4 years', now() - interval '4 years') as v2_usuario \\gset
          select pg_temp.cuenta((select id from viejas where d = '09980053'), 'zz.v3@ejemplo.com', now() - interval '1 year') as _3 \\gset
          select pg_temp.cuenta((select id from viejas where d = '09980054'), 'zz.v4@ejemplo.com', now() - interval '4 years', now() - interval '4 years') as _4 \\gset
          insert into retail.ventas (ubicacion_id, cliente_id, created_at, estado)
          values (:'tru', (select id from viejas where d = '09980054'), now() - interval '1 year', 'completada');
          insert into retail.pedidos_web (clienta_id, ubicacion_id) values ((select id from viejas where d = '09980056'), :'tru');
          insert into retail.pedidos_web (clienta_id, ubicacion_id, estado, cerrado_en, cerrado_por, cierre_motivo)
          values ((select id from viejas where d = '09980057'), :'tru', 'anulado', now() - interval '4 years', :'persona_felipe', 'cliente_desistio');
          select retail.fn_club_anonimizar_inactivas() as _n \\gset
          select string_agg(v.d || ':' || c.anonimizada, ',' order by v.d) from viejas v join retail.clientas c on c.id = v.id;
          select (cerrada_en is not null) || '|' || (correo is null) || '|' || (usuario_cerrado_id = :'v2_usuario')
            from retail.cuentas_web where clienta_id = (select id from viejas where d = '09980052');
          select count(*) from retail.cuentas_web w join viejas v on v.id = w.clienta_id where w.cerrada_en is null;`),
    "09980051:true,09980052:true,09980053:true,09980054:false,09980055:true,09980056:false,09980057:true\ntrue|true|true\n1",
  );

  console.log("— K. El pegado —");
  esperarValor(
    "las dos partes se pueden pegar dos veces, y después todo sigue igual (el correo de otra ficha y la entrada)",
    caso(`${COMO_LA_DEJO_LA_PARTE_1}${COMO_LA_DEJO_LA_PARTE_2}${SQL_1}\n${SQL_2}\n${SQL_1}\n${SQL_2}\nset local search_path = retail, public, extensions;
          select pg_temp.corto(pg_temp.intento(format('update retail.clientas set correo = %L where id = %L', 'zz.ana@ejemplo.com', :'bea')));
          select pg_temp.cuenta(:'bea', 'zz.bea.web@ejemplo.com') as u \\gset
          select retail.tienda_anotar_entrada(:'u') ->> 'estado';`),
    "23505|correo_repetido|correo\nanotada",
  );
  const repetidos = caso(`${COMO_LA_DEJO_LA_PARTE_1}drop index retail.clientas_correo_unico;
          alter table retail.clientas disable trigger clientas_correo_de_una_persona_cambio;
          update retail.clientas set correo = 'zz.ana@ejemplo.com' where id = :'bea';
          ${SQL_1}`);
  esperar(
    "la PARTE 1 aborta si hay correos repetidos, dice cuántos y cómo mirarlos, sin nombrar ningún correo (y no se toca nada)",
    !repetidos.ok && /clientas: 1 correo\(s\) están en más de una ficha/.test(repetidos.mensaje) && !repetidos.mensaje.includes("zz.ana@ejemplo.com"),
    repetidos.ok ? "no abortó" : repetidos.mensaje,
  );
  const editarCambiada = caso(`create or replace function retail.editar_clienta(p_id uuid, p_documento_tipo text default 'dni', p_documento_numero text default null,
            p_nombre text default null, p_telefono_whatsapp text default null, p_cumple_dia smallint default null, p_cumple_mes smallint default null,
            p_cumple_anio smallint default null, p_tallas jsonb default null, p_version_esperada integer default null)
          returns integer language plpgsql security definer set search_path = retail, public, extensions as $q$ begin return 1; end; $q$;
          ${SQL_1}`);
  esperar(
    "la PARTE 1 aborta si editar_clienta cambió en vivo (no la reemplaza a ciegas)",
    !editarCambiada.ok &&
      editarCambiada.mensaje.includes("retail.editar_clienta(uuid,text,text,text,text,smallint,smallint,smallint,jsonb,integer) cambió desde que se escribió"),
    editarCambiada.ok ? "no abortó" : editarCambiada.mensaje,
  );
  const cuentaAjena = caso(`${COMO_LA_DEJO_LA_PARTE_2}alter table retail.cuentas_web disable trigger cuentas_web_correo_de_una_persona;
          select pg_temp.cuenta(:'bea', 'zz.ana@ejemplo.com') as _u \\gset
          ${SQL_2}`);
  esperar(
    "la PARTE 2 aborta si una cuenta web ya tiene el correo de otra ficha (y no se toca nada)",
    !cuentaAjena.ok && /cuentas_web: 1 cuenta\(s\) tienen el correo de OTRA ficha/.test(cuentaAjena.mensaje),
    cuentaAjena.ok ? "no abortó" : cuentaAjena.mensaje,
  );
}

// D. Dos escrituras del mismo correo a la vez (dos conexiones reales, ROLLBACK): una ficha toma el correo y se queda con el candado;
// una cuenta web de OTRA ficha con el mismo correo tiene que esperar en ese candado (sin él, no vería la ficha sin confirmar).
async function carrera() {
  console.log("— D. Dos a la vez con el mismo correo —");
  if (APLICAR_ANTES) {
    console.log("  (no corre con APLICAR_ANTES=1: cada conexión pegaría su propia copia de la migración y se esperarían por las tablas)");
    return;
  }
  const fichas = correr(`select id from retail.clientas where not anonimizada and archivada_en is null and correo is null order by id limit 2;`);
  const [a, b] = fichas.ok ? fichas.salida.split("\n") : [];
  if (!a || !b) {
    esperar("hay dos fichas sin correo en la base para la carrera (el seed trae 8)", false, fichas.mensaje ?? fichas.salida);
    return;
  }
  const app = `clientas_correo_a_${process.pid}`;
  const pa = correrEnParalelo(`set application_name = '${app}';
begin;
update retail.clientas set correo = 'zz.carrera@ejemplo.com' where id = '${a}';
select pg_sleep(3);
rollback;
`);
  const rb = await correrEnParalelo(`do $espera$ begin
  for i in 1..200 loop
    perform pg_stat_clear_snapshot();
    exit when exists (select 1 from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep');
    perform pg_sleep(0.05);
  end loop;
end $espera$;
begin;
set local lock_timeout = '1s';
create function pg_temp.donde_espera() returns text language plpgsql as $f$
declare v_estado text; v_contexto text;
begin
  insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados)
  values (gen_random_uuid(), '${b}', 'zz.carrera@ejemplo.com', '${TEXTOS}');
  return 'SIN_ESPERA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_contexto = pg_exception_context;
  return v_estado || '|' || case when v_contexto ~* 'pg_advisory_xact_lock' and v_contexto ~* 'fn_correo_de_una_persona' then 'en el candado del correo'
                                 else 'en otra parte: ' || regexp_replace(v_contexto, '\\s+', ' ', 'g') end;
end $f$;
select pg_temp.donde_espera();
rollback;
`);
  const ra = await pa;
  const obtenido = `${ra.ok ? "A ok" : `A falló: ${ra.mensaje}`}|${rb.ok ? rb.salida : `B falló: ${rb.mensaje}`}`;
  esperar(
    "una cuenta web toma el correo que otra ficha está guardando en ese instante: espera en el candado del correo (y al despertar, la vería)",
    obtenido === "A ok|55P03|en el candado del correo",
    obtenido,
  );
}

main();
await carrera();
console.log(`\n${total - fallos}/${total} casos en verde`);
process.exit(fallos > 0 ? 1 : 0);

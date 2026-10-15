#!/usr/bin/env node
/**
 * El correo en «Editar» de la ficha y la ficha frente a la tienda online — CAYLA V2 (`20261015123000_clientas_correo_en_la_ficha.sql`).
 *
 * EL PROBLEMA. Felipe (2026-10-15, «Sí, antes de abrir la tienda»): la ficha del cliente en el ERP muestra y deja corregir el correo
 * de contacto. `editar_clienta` no lo recibía. Un correo es de una sola persona (20261015054000): si es de otra ficha, quien edita (ve
 * el módulo «Clientes») tiene que saber DE CUÁL, y la base tiene que decirlo; y el correo con que la persona entra a la tienda online
 * (`cuentas_web.correo`) NO cambia desde aquí. Y la hoja de archivar avisa si la ficha tiene un pedido web en curso: lo lee
 * `fn_clienta_tienda_online`. La base tiene que hacerlo cumplir, no la pantalla.
 *
 * QUÉ PRUEBA
 *   A. Estructura: una sola `editar_clienta` (la de 11, con `p_correo` al final); la ejecuta solo authenticated (ni anon ni PUBLIC);
 *      `fn_clienta_tienda_online` es security definer, estable, con su search_path, con el candado del módulo y solo para authenticated.
 *   B. El correo en `editar_clienta` (Felipe, líder):
 *      - se guarda en minúsculas y sin espacios, y sube la versión;
 *      - sin `p_correo` (la ficha de antes) no se toca; vacío lo borra;
 *      - mal escrito → 22023 `correo_invalido` (correo) y no cambia nada;
 *      - el de contacto de otra ficha → 23505 `correo_de_otra_ficha` (correo), con su nombre y su código del club, y no cambia nada;
 *      - con el que entra a la tienda online la cuenta de otra ficha → lo mismo, diciendo que es su correo de entrada;
 *      - el de su propia cuenta web → sí (la misma persona); y cambiar el de contacto no toca el de su cuenta;
 *      - el documento de otra ficha sigue diciendo `documento_de_otra_ficha` (el correo no lo confunde).
 *   C. `fn_clienta_tienda_online`: sin nada; con cuenta abierta (sí) y cerrada (no); los pedidos en curso (por confirmar dentro de su
 *      plazo, confirmado, pagado) con código, estado y tienda, los más viejos primero; no los demás (por confirmar pasado su plazo,
 *      vencido, anulado, entregado) ni los de otra ficha.
 *   D. El módulo: sin «Clientes» en su rol, una integrante recibe `clientas_sin_modulo` en las dos, y no cambia nada.
 *   E. El pegado: dos veces; aborta si `editar_clienta` cambió en vivo; y pegar 20261015054000 después aborta sin pisar nada.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK (fichas con DNI 0997xxxx, correos «zz.…@ejemplo.com»): nada queda en la base.
 *
 * USO
 *   pnpm pruebas:clientas-correo-ficha    → necesita el stack local (`npx supabase start`)
 *   node scripts/pruebas/clientas_correo_en_la_ficha.mjs --contenedor supabase_db_<mi-pila>   → contra una pila propia
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261015123000_clientas_correo_en_la_ficha.sql";
const SQL = readFileSync(MIGRACION, "utf8");
const SQL_CORREO_UNICO = readFileSync("supabase/migrations/20261015054000_clientas_correo_unico_y_sin_unir_fichas.sql", "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const TEXTOS = "borrador-2026-10-15";
const EDITAR = "retail.editar_clienta(uuid,text,text,text,text,smallint,smallint,smallint,jsonb,integer,text)";
const EDITAR_DE_10 = "retail.editar_clienta(uuid,text,text,text,text,smallint,smallint,smallint,jsonb,integer)";
const TIENDA_ONLINE = "retail.fn_clienta_tienda_online(uuid)";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    const salida = execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
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
/** Para un caso cuya salida trae dos líneas: lo obtenido y lo esperado, armado en la misma transacción (con los códigos que salieron). */
function esperarIguales(nombre, r) {
  const [obtenido, armado] = r.ok ? r.salida.split("\n") : [];
  esperar(nombre, r.ok && !!obtenido && obtenido === armado, r.ok ? `dio:\n${obtenido}\nse esperaba:\n${armado}` : r.mensaje);
}

// Cada escenario: Ana con correo de contacto (socia, con su código), Bea sin correo, Cami archivada con correo, Dani con cuenta web.
const PREPARAR = `
begin;
set local search_path = retail, public, extensions;
do $$ begin
  if exists (select 1 from retail.clientas where documento_numero like '0997%') then
    raise exception 'Ambiente sucio: ya hay fichas con DNI 0997xxxx en esta base.';
  end if;
end $$;
update retail.configuracion_empresa set exige_responsable = false;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as tru, nombre as tru_nombre from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, correo, telefono_whatsapp, club_desde, codigo_club)
values ('dni', '09970001', 'Ana Ficha Correo', 'zz.ana.ficha@ejemplo.com', '987970001', now() - interval '100 days', retail.fn_club_codigo_nuevo())
returning id as ana, codigo_club as ana_codigo \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp)
values ('dni', '09970002', 'Bea Ficha Sin Correo', '987970002') returning id as bea \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, correo)
values ('dni', '09970003', 'Cami Ficha Archivada', 'zz.cami.ficha@ejemplo.com') returning id as cami \\gset
update retail.clientas set archivada_en = now(), motivo_archivo = 'prueba' where id = :'cami';
insert into retail.clientas (documento_tipo, documento_numero, nombre, correo)
values ('dni', '09970004', 'Dani Ficha Con Cuenta', 'zz.dani.contacto@ejemplo.com') returning id as dani \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados, aceptados_en, creada_en)
values (gen_random_uuid(), :'dani', 'zz.dani.web@ejemplo.com', '${TEXTOS}', now(), now()) returning id as cuenta_dani \\gset
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_detalle text; v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_detalle = pg_exception_detail, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || coalesce(v_detalle, '') || '|' || v_msg;
end $f$;
grant execute on function pg_temp.intento(text) to authenticated;
-- Solo el código, el hint y el detail de un intento («23505|correo_de_otra_ficha|correo»).
create function pg_temp.corto(p text) returns text language sql as $f$
  select case when p = 'ok' then 'ok' else split_part(p, '|', 1) || '|' || split_part(p, '|', 2) || '|' || split_part(p, '|', 3) end
$f$;
-- editar_clienta de Bea con lo que ya tiene, cambiando solo el correo (con %L: un texto, o null para «no lo mandes»).
create function pg_temp.editar_bea(p_id uuid, p_correo text, p_con_correo boolean) returns text language sql as $f$
  select case when p_con_correo
    then format($q$select retail.editar_clienta(%L, 'dni', '09970002', 'Bea Ficha Sin Correo', '987970002', null, null, null, null, null, %L)$q$, p_id, p_correo)
    else format($q$select retail.editar_clienta(%L, 'dni', '09970002', 'Bea Ficha Sin Correo', '987970002', null, null, null, null, null)$q$, p_id) end
$f$;
grant execute on function pg_temp.corto(text), pg_temp.editar_bea(uuid, text, boolean) to authenticated;
`;
const caso = (sql) => correr(`${PREPARAR}${sql}\nrollback;`);
/** Con los permisos de authenticated (no de postgres): así se prueba a la cuenta de los claims (Felipe, o quien se ponga). */
const COMO_CUENTA = "set local role authenticated;\n";
const DE_POSTGRES = "reset role;\n";

function main() {
  if (!correr("select 1;").ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (correr(`select to_regprocedure('${EDITAR}') is not null;`).salida !== "t") {
    console.error(`Falta la migración: aplica ${MIGRACION}`);
    process.exit(2);
  }
  const preparado = caso("select 'listo';");
  if (!preparado.ok || preparado.salida !== "listo") {
    console.error(`No se pudo preparar el escenario: ${preparado.mensaje ?? preparado.salida}`);
    process.exit(2);
  }

  console.log("— A. Estructura —");
  esperarValor(
    "una sola editar_clienta: la de 11, que termina en p_correo text (la de 10 ya no existe)",
    caso(`select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'editar_clienta';
          select pg_get_function_identity_arguments('${EDITAR}'::regprocedure) ~ 'p_version_esperada integer, p_correo text$';
          select to_regprocedure('${EDITAR_DE_10}') is null;`),
    "1\nt\nt",
  );
  esperarValor(
    "editar_clienta y fn_clienta_tienda_online: las ejecuta authenticated, no anon ni PUBLIC; la lectura es security definer, estable y con su search_path",
    caso(`select string_agg(has_function_privilege('authenticated', f::regprocedure, 'execute') || ':' || has_function_privilege('anon', f::regprocedure, 'execute'), ',')
            from unnest(array['${EDITAR}', '${TIENDA_ONLINE}']) f;
          select bool_or(a.grantee = 0) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           where p.oid in ('${EDITAR}'::regprocedure, '${TIENDA_ONLINE}'::regprocedure) and a.privilege_type = 'EXECUTE';
          select p.prosecdef || ':' || p.provolatile::text || ':' || exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%')
            from pg_proc p where p.oid = '${TIENDA_ONLINE}'::regprocedure;`),
    "true:false,true:false\nf\ntrue:s:true",
  );
  esperarValor(
    "las dos empiezan por el candado del módulo «Clientes»",
    caso(`select string_agg(proname || ':' || (regexp_replace(prosrc, '--[^\\n]*', '', 'g') ~ '^\\s*(declare.*?begin\\s*perform|select)\\s+retail\\.fn_exigir_modulo\\(''clientas''\\)'), ',' order by proname)
            from pg_proc where oid in ('${EDITAR}'::regprocedure, '${TIENDA_ONLINE}'::regprocedure);`),
    "editar_clienta:true,fn_clienta_tienda_online:true",
  );

  console.log("— B. El correo en editar_clienta —");
  esperarValor(
    "se guarda en minúsculas y sin espacios, y sube la versión",
    caso(`${COMO_CUENTA}select version as v0 from retail.clientas where id = :'bea' \\gset
          select pg_temp.intento(pg_temp.editar_bea(:'bea', '  ZZ.Bea.Nuevo@Ejemplo.COM ', true));
          select correo || '|' || (version = :v0 + 1) from retail.clientas where id = :'bea';`),
    "ok\nzz.bea.nuevo@ejemplo.com|true",
  );
  esperarValor(
    "sin p_correo (la ficha de antes) el correo no se toca; con el texto vacío, se borra",
    caso(`${COMO_CUENTA}select pg_temp.intento(pg_temp.editar_bea(:'bea', 'zz.bea.nuevo@ejemplo.com', true));
          select pg_temp.intento(pg_temp.editar_bea(:'bea', null, false));
          select correo from retail.clientas where id = :'bea';
          select pg_temp.intento(pg_temp.editar_bea(:'bea', '   ', true));
          select coalesce(correo, 'SIN_CORREO') from retail.clientas where id = :'bea';`),
    "ok\nok\nzz.bea.nuevo@ejemplo.com\nok\nSIN_CORREO",
  );
  esperarValor(
    "mal escrito: 22023, correo_invalido, en la caja del correo, con su frase; y la ficha no cambia",
    caso(`${COMO_CUENTA}select version as v0 from retail.clientas where id = :'bea' \\gset
          select pg_temp.intento(pg_temp.editar_bea(:'bea', 'zz.bea@ejemplo', true));
          select pg_temp.corto(pg_temp.intento(pg_temp.editar_bea(:'bea', 'zz bea@ejemplo.com', true)));
          select coalesce(correo, 'SIN_CORREO') || '|' || (version = :v0) from retail.clientas where id = :'bea';`),
    "22023|correo_invalido|correo|Revisa el correo: parece incompleto. Si no lo tiene, déjalo vacío.\n22023|correo_invalido|correo\nSIN_CORREO|true",
  );
  esperarValor(
    "el correo de contacto de otra ficha: 23505, correo_de_otra_ficha, dice de cuál (nombre y código del club); la ficha no cambia",
    caso(`${COMO_CUENTA}select version as v0 from retail.clientas where id = :'bea' \\gset
          select pg_temp.intento(pg_temp.editar_bea(:'bea', 'ZZ.Ana.Ficha@ejemplo.com', true))
                 = '23505|correo_de_otra_ficha|correo|Ese correo ya es de la ficha de Ana Ficha Correo (' || :'ana_codigo'
                   || '). Un correo es de una sola persona: búscala en Clientes y corrige la que esté mal.';
          select coalesce(correo, 'SIN_CORREO') || '|' || (version = :v0) from retail.clientas where id = :'bea';`),
    "t\nSIN_CORREO|true",
  );
  esperarValor(
    "el de una ficha archivada también dice de cuál (archivada)",
    caso(`${COMO_CUENTA}select pg_temp.intento(pg_temp.editar_bea(:'bea', 'zz.cami.ficha@ejemplo.com', true));`),
    "23505|correo_de_otra_ficha|correo|Ese correo ya es de la ficha de Cami Ficha Archivada (archivada). Un correo es de una sola persona: búscala en Clientes y corrige la que esté mal.",
  );
  esperarValor(
    "con el que entra a la tienda online la cuenta de otra ficha: también, diciendo que es su correo de entrada",
    caso(`${COMO_CUENTA}select pg_temp.intento(pg_temp.editar_bea(:'bea', 'zz.dani.web@ejemplo.com', true));`),
    "23505|correo_de_otra_ficha|correo|Con ese correo entra a la tienda online la ficha de Dani Ficha Con Cuenta. Un correo es de una sola persona: usa otro para esta ficha.",
  );
  esperarValor(
    "la misma persona: Dani puede tener de contacto el correo de su cuenta web; y cambiar el de contacto no toca el de su cuenta",
    caso(`${COMO_CUENTA}select pg_temp.intento(format($q$select retail.editar_clienta(%L, 'dni', '09970004', 'Dani Ficha Con Cuenta', null, null, null, null, null, null, 'zz.dani.web@ejemplo.com')$q$, :'dani'));
          select pg_temp.intento(format($q$select retail.editar_clienta(%L, 'dni', '09970004', 'Dani Ficha Con Cuenta', null, null, null, null, null, null, 'zz.dani.otro@ejemplo.com')$q$, :'dani'));
          ${DE_POSTGRES}select c.correo || '|' || w.correo from retail.clientas c join retail.cuentas_web w on w.clienta_id = c.id where c.id = :'dani';`),
    "ok\nok\nzz.dani.otro@ejemplo.com|zz.dani.web@ejemplo.com",
  );
  esperarValor(
    "el documento de otra ficha sigue diciendo documento_de_otra_ficha, aunque también cambie el correo",
    caso(`${COMO_CUENTA}select pg_temp.corto(pg_temp.intento(format($q$select retail.editar_clienta(%L, 'dni', '09970001', 'Bea Ficha Sin Correo', '987970002', null, null, null, null, null, 'zz.bea.libre@ejemplo.com')$q$, :'bea')));`),
    "23505|documento_de_otra_ficha|documento",
  );
  esperarValor(
    "sin el disparador del correo, el índice único frena igual y el mensaje sigue diciendo de cuál (la red de abajo)",
    caso(`alter table retail.clientas disable trigger clientas_correo_de_una_persona_cambio;
          ${COMO_CUENTA}select pg_temp.corto(pg_temp.intento(pg_temp.editar_bea(:'bea', 'zz.ana.ficha@ejemplo.com', true)));`),
    "23505|correo_de_otra_ficha|correo",
  );

  console.log("— C. Lo que la ficha tiene en la tienda online —");
  esperarValor(
    "sin cuenta ni pedidos: cuenta_web falso y la lista vacía",
    caso(`${COMO_CUENTA}select retail.fn_clienta_tienda_online(:'bea')::text;`),
    `{"cuenta_web": false, "pedidos_en_curso": []}`,
  );
  esperarValor(
    "con cuenta abierta: verdadero; la misma cuenta cerrada (su ficha anonimizada): falso",
    caso(`${COMO_CUENTA}select retail.fn_clienta_tienda_online(:'dani') ->> 'cuenta_web';
          ${DE_POSTGRES}select retail.archivar_clienta(:'dani', 'prueba', true, null) as _v \\gset
          ${COMO_CUENTA}select retail.fn_clienta_tienda_online(:'dani') ->> 'cuenta_web';`),
    "true\nfalse",
  );
  esperarIguales(
    "los pedidos en curso (por confirmar en plazo, confirmado y pagado), con código, estado y tienda, los más viejos primero; no los otros ni los de otra ficha",
    caso(`${DE_POSTGRES}
          insert into retail.pedidos_web (clienta_id, ubicacion_id, creado_en) values (:'bea', :'tru', now() - interval '1 hour') returning codigo as p_recien \\gset
          insert into retail.pedidos_web (clienta_id, ubicacion_id, creado_en) values (:'bea', :'tru', now() - interval '30 days');
          insert into retail.pedidos_web (clienta_id, ubicacion_id, estado, total, confirmado_en, confirmado_por, creado_en)
            values (:'bea', :'tru', 'confirmado', 100, now() - interval '2 days', :'persona_felipe', now() - interval '3 days') returning codigo as p_confirmado \\gset
          insert into retail.pedidos_web (clienta_id, ubicacion_id, estado, total, pagado, confirmado_en, confirmado_por, pagado_en, creado_en)
            values (:'bea', :'tru', 'pagado', 100, 100, now() - interval '4 days', :'persona_felipe', now() - interval '4 days', now() - interval '5 days') returning codigo as p_pagado \\gset
          insert into retail.pedidos_web (clienta_id, ubicacion_id, estado, total, pagado, confirmado_en, confirmado_por, pagado_en, entregado_en, entregado_por, creado_en)
            values (:'bea', :'tru', 'entregado', 100, 100, now() - interval '9 days', :'persona_felipe', now() - interval '9 days', now() - interval '8 days', :'persona_felipe', now() - interval '10 days');
          insert into retail.pedidos_web (clienta_id, ubicacion_id, estado, cerrado_en, cierre_motivo, creado_en)
            values (:'bea', :'tru', 'vencido', now() - interval '11 days', 'sin_confirmar', now() - interval '12 days');
          insert into retail.pedidos_web (clienta_id, ubicacion_id, estado, cerrado_en, cerrado_por, cierre_motivo, creado_en)
            values (:'bea', :'tru', 'anulado', now() - interval '13 days', :'persona_felipe', 'cliente_desistio', now() - interval '14 days');
          insert into retail.pedidos_web (clienta_id, ubicacion_id, creado_en) values (:'ana', :'tru', now() - interval '2 hours');
          ${COMO_CUENTA}select string_agg((p ->> 'codigo') || ':' || (p ->> 'estado') || ':' || (p ->> 'tienda'), ',')
            from jsonb_array_elements(retail.fn_clienta_tienda_online(:'bea') -> 'pedidos_en_curso') p;
          select :'p_pagado' || ':pagado:' || :'tru_nombre' || ',' || :'p_confirmado' || ':confirmado:' || :'tru_nombre' || ',' || :'p_recien' || ':por_confirmar:' || :'tru_nombre';`),
  );

  console.log("— D. El módulo —");
  esperarValor(
    "sin «Clientes» en su rol, una integrante recibe clientas_sin_modulo en las dos, y la ficha no cambia",
    caso(`delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';
          select version as v0 from retail.clientas where id = :'bea' \\gset
          set local request.jwt.claim.sub = '${MICAELA}';
          set local request.jwt.claims = '{"sub":"${MICAELA}","role":"authenticated"}';
          ${COMO_CUENTA}select pg_temp.corto(pg_temp.intento(pg_temp.editar_bea(:'bea', 'zz.bea.micaela@ejemplo.com', true)));
          select split_part(pg_temp.intento(format('select retail.fn_clienta_tienda_online(%L)', :'bea')), '|', 1) || '|' || split_part(pg_temp.intento(format('select retail.fn_clienta_tienda_online(%L)', :'bea')), '|', 2);
          ${DE_POSTGRES}select coalesce(correo, 'SIN_CORREO') || '|' || (version = :v0) from retail.clientas where id = :'bea';`),
    "42501|clientas_sin_modulo|\n42501|clientas_sin_modulo\nSIN_CORREO|true",
  );

  console.log("— E. El pegado —");
  esperarValor(
    "la migración se puede pegar dos veces, y después todo sigue igual (una sola editar_clienta; el correo de otra ficha dice de cuál)",
    caso(`${SQL}\n${SQL}\nset local search_path = retail, public, extensions;
          select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'editar_clienta';
          ${COMO_CUENTA}select pg_temp.corto(pg_temp.intento(pg_temp.editar_bea(:'bea', 'zz.ana.ficha@ejemplo.com', true)));`),
    "1\n23505|correo_de_otra_ficha|correo",
  );
  const cambiada = caso(`create or replace function retail.editar_clienta(p_id uuid, p_documento_tipo text default 'dni', p_documento_numero text default null,
            p_nombre text default null, p_telefono_whatsapp text default null, p_cumple_dia smallint default null, p_cumple_mes smallint default null,
            p_cumple_anio smallint default null, p_tallas jsonb default null, p_version_esperada integer default null, p_correo text default null)
          returns integer language plpgsql security definer set search_path = retail, public, extensions as $q$ begin return 1; end; $q$;
          ${SQL}`);
  esperar(
    "aborta si editar_clienta cambió en vivo (no la reemplaza a ciegas)",
    !cambiada.ok && cambiada.mensaje.includes(`${EDITAR} cambió desde que se escribió esta migración`),
    cambiada.ok ? "no abortó" : cambiada.mensaje,
  );
  // Pegar 20261015054000 DESPUÉS de esta: su candado no encuentra la editar_clienta de 10 y aborta, sin pisar la de 11.
  const foto = `select md5(string_agg(p.oid::regprocedure::text || '=' || md5(p.prosrc), '|' order by p.oid::regprocedure::text))
                  from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('editar_clienta', 'fn_correo_de_una_persona');\n`;
  const despues = caso(`${foto}\\set ON_ERROR_STOP off\nsavepoint antes_de_pegar;\n${SQL_CORREO_UNICO}\n\\if :ERROR\nrollback to savepoint antes_de_pegar;\n\\endif\n\\set ON_ERROR_STOP on\nset local search_path = retail, public, extensions;\n${foto}`);
  const [antes, luego] = despues.ok ? despues.salida.split("\n").filter(Boolean) : [];
  esperar(
    "pegar 20261015054000 después de esta aborta con un mensaje claro y no pisa nada (la editar_clienta de 11 sigue como estaba)",
    despues.ok && !!antes && antes === luego,
    despues.ok ? `antes ${antes} · después ${luego}` : despues.mensaje,
  );
  const mensajeDespues = caso(SQL_CORREO_UNICO);
  esperar(
    "…y su mensaje dice qué falta (la editar_clienta de 10 no existe en esta base)",
    !mensajeDespues.ok && mensajeDespues.mensaje.includes(`${EDITAR_DE_10} no existe en esta base`),
    mensajeDespues.ok ? "no abortó" : mensajeDespues.mensaje,
  );
}

main();
console.log(`\n${total - fallos}/${total} casos en verde`);
process.exit(fallos > 0 ? 1 : 0);

#!/usr/bin/env node
/**
 * Entrar con Google une la cuenta a la ficha que ya tenía ese correo (ADR-0469) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261021170000_tienda_vincular_cuenta_google_con_ficha.sql`:
 *   1. Estructura: `tienda_vincular_cuenta_google` solo la ejecuta `tienda_web`; `fn_nombres_se_parecen` nadie de la API; las tres de
 *      Clientas ▸ Avisos las ejecuta `authenticated` y no `anon`; la tabla del vínculo está cerrada a todos; un correo de ficha es único.
 *   2. `fn_nombres_se_parecen` (el candado de identidad): sí con dos palabras en común o con una si algún nombre tiene una sola, sin
 *      tildes ni mayúsculas ni orden; no con una sola palabra común entre dos nombres largos ni con nombres distintos.
 *   3. `tienda_vincular_cuenta_google`: une la cuenta a la ficha que ya tenía ese correo (sin crear otra ficha), también cuando Google lo
 *      escribe con mayúsculas; deja el vínculo «pendiente de avisar» (o «sin_celular») y la actividad SIN el nombre ni el
 *      correo; NO une —sin escribir nada— con un nombre distinto, una ficha archivada, una ficha que ya tiene cuenta (abierta o cerrada)
 *      ni un correo que ya es de una cuenta; dice no_aplica si el correo no es de ninguna ficha; rechaza datos inválidos.
 *   4. Lo que ve la cuenta vinculada (`tienda_mi_cuenta`): sin documento, celular ni dirección.
 *   5. Clientas ▸ Avisos: sin el módulo «avisos_club» todo se niega; con él se ve la lista, «Avisar» anota quién y desde qué tienda
 *      (una segunda vez no cambia nada) y desvincular es solo del líder: cierra la cuenta (sin correo ni usuario), deja la ficha
 *      intacta, saca el vínculo de la lista, y esa ficha ya no se vuelve a unir sola.
 *   6. Como `tienda_web` el camino funciona, y la migración se puede pegar dos veces.
 *
 * CÓMO. Igual que `tienda_cuenta_simple.mjs` y `club_avisos.mjs`: cada escenario en su transacción con ROLLBACK, con fichas de
 * DNI 0998xxxx.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=1` mete la migración dentro de cada transacción (que se revierte). Sin la variable prueba
 * lo que la base ya tiene (lo que hace el CI).
 *
 * USO
 *   pnpm pruebas:tienda-vincular-google    → necesita el stack local
 *   pnpm pruebas:tienda-vincular-google -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261021170000_tienda_vincular_cuenta_google_con_ficha.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(MIGRACION, "utf8") : "";

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

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

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
}

const CORRIDA = Date.now().toString(36);
let n = 0;
const correoNuevo = (que = "c") => `zz.${que}.${CORRIDA}.${++n}@ejemplo.com`;
const TEXTOS = "borrador-2026-10-14";
const t = (v) => (v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`);

const C = {
  ana: correoNuevo("ana"),
  bea: correoNuevo("bea"),
  carla: correoNuevo("carla"),
  diana: correoNuevo("diana"),
  elena: correoNuevo("elena"),
  fabiola: correoNuevo("fabiola"),
};

const PREPARAR = `
begin;
${APLICAR_ANTES}
do $$ begin
  if exists (select 1 from retail.clientas where documento_numero like '0998%') then
    raise exception 'Ambiente sucio: ya hay fichas con DNI 0998xxxx en esta base.';
  end if;
end $$;
-- Una ficha de caja con su correo y su celular.
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, correo)
values ('dni', '09981001', 'Ana Lucía Prueba Vega', '987100001', '${C.ana}') returning id as ana \\gset
-- Sin celular.
insert into retail.clientas (documento_tipo, documento_numero, nombre, correo)
values ('dni', '09981002', 'Beatriz Sin Celular', '${C.bea}') returning id as bea \\gset
-- Archivada.
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, correo, archivada_en, motivo_archivo)
values ('dni', '09981003', 'Carla Archivada Prueba', '987100003', '${C.carla}', now(), 'prueba de la tienda') returning id as carla \\gset
-- Con una cuenta abierta que entra con OTRO correo.
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, correo)
values ('dni', '09981004', 'Diana Con Cuenta', '987100004', '${C.diana}') returning id as diana \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados)
values (gen_random_uuid(), :'diana', '${correoNuevo("diana-entra")}', '${TEXTOS}') returning usuario_web_id as u_diana \\gset
-- Una ficha cuyo nombre no se parece al de quien entra.
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, correo)
values ('dni', '09981005', 'Elena Distinta Rojas', '987100005', '${C.elena}') returning id as elena \\gset
-- Una ficha con cuenta CERRADA.
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, correo)
values ('dni', '09981006', 'Fabiola Cuenta Cerrada', '987100006', '${C.fabiola}') returning id as fabiola \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados)
values (gen_random_uuid(), :'fabiola', '${correoNuevo("fabiola-entra")}', '${TEXTOS}') returning id as w_fabiola \\gset
update retail.cuentas_web set cerrada_en = now(), usuario_cerrado_id = usuario_web_id, usuario_web_id = null, correo = null where id = :'w_fabiola';
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else v_msg end;
end $f$;
grant execute on function pg_temp.intento(text) to authenticated, anon;
`;

const vincular = (usuario, correo, nombre, textos = TEXTOS) =>
  `retail.tienda_vincular_cuenta_google('${usuario}'::uuid, ${t(correo)}, ${t(nombre)}, ${t(textos)})`;
const estado = (usuario, correo, nombre) => `select ${vincular(usuario, correo, nombre)} ->> 'estado';`;
/** Cuántas fichas, cuentas y vínculos hay: lo que un rechazo NO puede mover. */
const RECUENTO = `(select count(*) from retail.clientas where documento_numero like '0998%' or registro_origen = 'web') || ':' || (select count(*) from retail.cuentas_web) || ':' || (select count(*) from retail.cuentas_web_vinculos_google) || ':' || (select count(*) from retail.actividad where accion in ('vinculo_google', 'vinculo_google_deshecho'))`;

const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;

function main() {
  if (!correr("select 1;").ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES && correr("select to_regprocedure('retail.tienda_vincular_cuenta_google(uuid,text,text,text)') is not null;").salida !== "t") {
    console.error(`Falta la migración: aplica ${MIGRACION} o corre con APLICAR_ANTES=1`);
    process.exit(2);
  }
  const preparado = correr(`${PREPARAR}select 'listo';\nrollback;`);
  if (!preparado.ok || preparado.salida !== "listo") {
    console.error(`No se pudo preparar el escenario: ${preparado.mensaje ?? preparado.salida}`);
    process.exit(2);
  }

  console.log("— Estructura —");
  esperarValor(
    "tienda_vincular_cuenta_google: security definer, con su search_path, solo para tienda_web",
    correr(`${PREPARAR}
      select (p.prosecdef and exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%'))::text || ':' ||
             has_function_privilege('tienda_web', p.oid, 'EXECUTE')::text || ':' ||
             (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
              or has_function_privilege('public', p.oid, 'EXECUTE'))::text
        from pg_proc p where p.oid = 'retail.tienda_vincular_cuenta_google(uuid,text,text,text)'::regprocedure;
      rollback;`),
    "true:true:false",
  );
  esperarValor(
    "fn_nombres_se_parecen no la ejecuta nadie de la API (tampoco tienda_web)",
    correr(`${PREPARAR}
      select (has_function_privilege('tienda_web', 'retail.fn_nombres_se_parecen(text,text)', 'EXECUTE')
              or has_function_privilege('anon', 'retail.fn_nombres_se_parecen(text,text)', 'EXECUTE')
              or has_function_privilege('authenticated', 'retail.fn_nombres_se_parecen(text,text)', 'EXECUTE'))::text;
      rollback;`),
    "false",
  );
  esperarValor(
    "las tres de Clientas ▸ Avisos: security definer, authenticated sí, anon no",
    correr(`${PREPARAR}
      select string_agg(f || ':' || p.prosecdef::text || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || ':' ||
             has_function_privilege('anon', p.oid, 'EXECUTE')::text, ',' order by f collate "C")
        from unnest(array['desvincular_cuenta_google(uuid)', 'fn_vinculos_google_recientes()', 'registrar_vinculo_google_avisado(uuid,uuid)']) f
        join pg_proc p on p.oid = ('retail.' || f)::regprocedure;
      rollback;`),
    "desvincular_cuenta_google(uuid):true:true:false,fn_vinculos_google_recientes():true:true:false,registrar_vinculo_google_avisado(uuid,uuid):true:true:false",
  );
  esperarValor(
    "la tabla del vínculo está cerrada a la API y a tienda_web",
    correr(`${PREPARAR}
      select (has_table_privilege('anon', 'retail.cuentas_web_vinculos_google', 'SELECT')
              or has_table_privilege('authenticated', 'retail.cuentas_web_vinculos_google', 'SELECT')
              or has_table_privilege('tienda_web', 'retail.cuentas_web_vinculos_google', 'SELECT'))::text;
      rollback;`),
    "false",
  );
  esperarValor(
    "un correo de ficha es único (no hay dos fichas con el mismo, sin importar mayúsculas)",
    correr(`${PREPARAR}
      select pg_temp.intento(format($q$insert into retail.clientas (nombre, correo) values ('Otra Ana', %L)$q$, '${C.ana}'));
      rollback;`),
    '23505|correo_repetido',
  );

  console.log("— ¿Dos nombres son de la misma persona? —");
  const parecen = (a, b) => `select retail.fn_nombres_se_parecen(${t(a)}, ${t(b)})::text;`;
  const NOMBRES = [
    ["Lucía Pérez Salas", "LUCIA PEREZ", "true", "dos palabras en común, sin tildes ni mayúsculas"],
    ["Pérez Salas Lucía Fernanda", "Lucía Pérez", "true", "no importa el orden"],
    ["Felipe", "Felipe Álvarez Pérez", "true", "una palabra en común si uno de los nombres tiene una sola"],
    ["felipe.alvarez92", "Felipe Alvarez", "true", "el nombre que sale del correo (sin números) también sirve"],
    ["José Núñez", "Jose Nunez", "true", "la ñ y las tildes no estorban"],
    ["María López", "María Gómez", "false", "una sola palabra común entre dos nombres largos no alcanza"],
    ["Pedro Quispe", "Elena Distinta Rojas", "false", "nombres distintos"],
    ["", "Ana", "false", "sin nombre no hay parecido"],
    ["De la Cruz", "Del Los", "false", "las palabras cortas y de enlace no cuentan"],
  ];
  for (const [a, b, esperado, que] of NOMBRES) {
    esperarValor(`${a || "(vacío)"} ~ ${b}: ${que}`, correr(`${PREPARAR}${parecen(a, b)}\nrollback;`), esperado);
  }

  console.log("— Unir la cuenta de Google a la ficha —");
  const uAna = randomUUID();
  esperarValor(
    "une a la ficha que ya tenía ese correo (el correo de una ficha ya viene en minúsculas, sin espacios): sin ficha nueva, cuenta apuntando a la ficha, vínculo pendiente",
    correr(`${PREPARAR}
      select count(*) as fichas_antes from retail.clientas \\gset
      ${estado(uAna, C.ana.toUpperCase(), "Ana Prueba")}
      select (select clienta_id = :'ana' and correo = '${C.ana}' from retail.cuentas_web where usuario_web_id = '${uAna}')::text;
      select ((select count(*) from retail.clientas) = :fichas_antes)::text;
      select aviso_estado || ':' || (clienta_id = :'ana')::text || ':' || nombre_google || ':' || nombre_ficha || ':' || (revertido_en is null)::text
        from retail.cuentas_web_vinculos_google where usuario_web_id = '${uAna}';
      rollback;`),
    "vinculada\ntrue\ntrue\npendiente:true:Ana Prueba:Ana Lucía Prueba Vega:true",
  );
  esperarValor(
    "devuelve el nombre de pila de la ficha, y la actividad queda sin el nombre ni el correo de la persona",
    correr(`${PREPARAR}
      select ${vincular(uAna, C.ana, "Ana Prueba")} ->> 'nombre_corto';
      select (a.detalle ->> 'aviso') || ':' || (a.descripcion !~* 'ana' and a.detalle::text !~* '(ana|ejemplo)')::text
        from retail.actividad a where a.accion = 'vinculo_google' and a.registro_id = :'ana'::text;
      rollback;`),
    "Ana\npendiente:true",
  );
  esperarValor(
    "una ficha sin celular que se entienda queda «sin_celular»: el vínculo se registra pero no hay a quién avisar",
    correr(`${PREPARAR}
      ${estado(randomUUID(), C.bea, "Beatriz Sin Celular")}
      select aviso_estado from retail.cuentas_web_vinculos_google where clienta_id = :'bea';
      rollback;`),
    "vinculada\nsin_celular",
  );
  esperarValor(
    "el nombre de Google no se parece al de la ficha: no_coincide y no se escribe nada",
    correr(`${PREPARAR}
      select (${RECUENTO}) as antes \\gset
      ${estado(randomUUID(), C.elena, "Pedro Quispe")}
      select ((${RECUENTO}) = :'antes')::text;
      rollback;`),
    "no_coincide\ntrue",
  );
  esperarValor(
    "una ficha archivada no se une: no_coincide y no se escribe nada",
    correr(`${PREPARAR}
      select (${RECUENTO}) as antes \\gset
      ${estado(randomUUID(), C.carla, "Carla Archivada")}
      select ((${RECUENTO}) = :'antes')::text;
      rollback;`),
    "no_coincide\ntrue",
  );
  esperarValor(
    "una ficha que ya tiene cuenta abierta no se une: no_coincide y no se escribe nada",
    correr(`${PREPARAR}
      select (${RECUENTO}) as antes \\gset
      ${estado(randomUUID(), C.diana, "Diana Con Cuenta")}
      select ((${RECUENTO}) = :'antes')::text;
      rollback;`),
    "no_coincide\ntrue",
  );
  esperarValor(
    "una ficha con cuenta CERRADA tampoco: no_coincide y no se escribe nada",
    correr(`${PREPARAR}
      select (${RECUENTO}) as antes \\gset
      ${estado(randomUUID(), C.fabiola, "Fabiola Cuenta Cerrada")}
      select ((${RECUENTO}) = :'antes')::text;
      rollback;`),
    "no_coincide\ntrue",
  );
  esperarValor(
    "un correo que no es de ninguna ficha es no_aplica (sigue el registro de siempre) y no se escribe nada",
    correr(`${PREPARAR}
      select (${RECUENTO}) as antes \\gset
      ${estado(randomUUID(), correoNuevo("libre"), "Quien Sea")}
      select ((${RECUENTO}) = :'antes')::text;
      rollback;`),
    "no_aplica\ntrue",
  );
  esperarValor(
    "un correo que ya es de una cuenta es no_aplica (el registro dirá «ya hay una cuenta»); un usuario que ya tiene cuenta, ya_tiene_cuenta",
    correr(`${PREPARAR}
      select correo as correo_diana from retail.cuentas_web where usuario_web_id = :'u_diana' \\gset
      select retail.tienda_vincular_cuenta_google(gen_random_uuid(), :'correo_diana', 'Diana Con Cuenta', '${TEXTOS}') ->> 'estado';
      select retail.tienda_vincular_cuenta_google(:'u_diana'::uuid, '${C.ana}', 'Ana Prueba', '${TEXTOS}') ->> 'estado';
      rollback;`),
    "no_aplica\nya_tiene_cuenta",
  );
  esperarValor(
    "datos inválidos: correo mal escrito, sin nombre, y una versión de textos que no existe → cuenta_datos_invalidos sin escribir nada",
    correr(`${PREPARAR}
      select (${RECUENTO}) as antes \\gset
      select pg_temp.intento($q$select ${vincular(randomUUID(), "no-es-correo", "Ana Prueba")}$q$);
      select pg_temp.intento($q$select ${vincular(randomUUID(), C.ana, "   ")}$q$);
      select pg_temp.intento($q$select ${vincular(randomUUID(), C.ana, "Ana Prueba", "Texto Malo!")}$q$);
      select ((${RECUENTO}) = :'antes')::text;
      rollback;`),
    "22023|cuenta_datos_invalidos\n22023|cuenta_datos_invalidos\n22023|cuenta_datos_invalidos\ntrue",
  );
  esperarValor(
    "una segunda vez con la misma cuenta es ya_tiene_cuenta (otra pestaña): no duplica el vínculo",
    correr(`${PREPARAR}
      ${estado(uAna, C.ana, "Ana Prueba")}
      ${estado(uAna, C.ana, "Ana Prueba")}
      select count(*) from retail.cuentas_web_vinculos_google where clienta_id = :'ana';
      rollback;`),
    "vinculada\nya_tiene_cuenta\n1",
  );

  console.log("— Lo que ve la cuenta vinculada —");
  esperarValor(
    "tienda_mi_cuenta trae el nombre de la ficha y solo lo de siempre: sin documento, celular ni dirección",
    correr(`${PREPARAR}
      ${estado(uAna, C.ana, "Ana Prueba")}
      select (retail.tienda_mi_cuenta('${uAna}') ->> 'nombre');
      select string_agg(k, ',' order by k) from jsonb_object_keys(retail.tienda_mi_cuenta('${uAna}')) k;
      rollback;`),
    "vinculada\nAna Lucía Prueba Vega\nactiva,club_desde,codigo_club,correo,cumple_dia,cumple_mes,nombre,nombre_corto",
  );

  console.log("— Clientas ▸ Avisos —");
  const PRELUDIO_ERP = `
update retail.configuracion_empresa set exige_responsable = false;
insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('integrante'), 'clientas' on conflict do nothing;
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
${estado(uAna, C.ana, "Ana Prueba")}
select id as vinculo from retail.cuentas_web_vinculos_google where usuario_web_id = '${uAna}' \\gset
`;
  esperarValor(
    "sin el módulo «avisos_club» (Micaela, integrante) la lista y «Avisar» se niegan; desvincular, solo del líder",
    correr(`${PREPARAR}${PRELUDIO_ERP}
      ${como(MICAELA)}
      select pg_temp.intento($q$select count(*) from retail.fn_vinculos_google_recientes()$q$);
      select pg_temp.intento(format($q$select retail.registrar_vinculo_google_avisado(%L, %L)$q$, :'vinculo', :'ubic'));
      select pg_temp.intento(format($q$select retail.desvincular_cuenta_google(%L)$q$, :'vinculo'));
      rollback;`),
    "vinculada\n42501|avisos_club_sin_modulo\n42501|avisos_club_sin_modulo\n42501|solo_lider",
  );
  esperarValor(
    "con el módulo en su rol, Micaela ve la lista y avisa, pero desvincular sigue siendo solo del líder",
    correr(`${PREPARAR}${PRELUDIO_ERP}
      insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'avisos_club');
      ${como(MICAELA)}
      select pg_temp.intento($q$select count(*) from retail.fn_vinculos_google_recientes()$q$);
      select pg_temp.intento(format($q$select retail.desvincular_cuenta_google(%L)$q$, :'vinculo'));
      rollback;`),
    "vinculada\nok\n42501|solo_lider",
  );
  esperarValor(
    "el líder ve el vínculo (pendiente) con la ficha, el celular y el nombre de Google",
    correr(`${PREPARAR}${PRELUDIO_ERP}
      ${como(FELIPE)}
      select nombre || ':' || telefono || ':' || nombre_google || ':' || aviso_estado || ':' || (avisado_en is null)::text
        from retail.fn_vinculos_google_recientes() where clienta_id = :'ana';
      rollback;`),
    "vinculada\nAna Lucía Prueba Vega:987100001:Ana Prueba:pendiente:true",
  );
  esperarValor(
    "«Avisar» anota quién y desde qué tienda; una segunda vez no cambia nada; un id que no existe → vinculo_no_existe",
    correr(`${PREPARAR}${PRELUDIO_ERP}
      ${como(FELIPE)}
      select retail.registrar_vinculo_google_avisado(:'vinculo', :'ubic') as _x \\gset
      reset role;
      select avisado_en::text as primera from retail.cuentas_web_vinculos_google where id = :'vinculo' \\gset
      ${como(FELIPE)}
      select retail.registrar_vinculo_google_avisado(:'vinculo', :'ubic') as _x \\gset
      reset role;
      select aviso_estado || ':' || (avisado_por = :'persona_felipe')::text || ':' || (ubicacion_id = :'ubic')::text || ':' || (avisado_en::text = :'primera')::text
        from retail.cuentas_web_vinculos_google where id = :'vinculo';
      ${como(FELIPE)}
      select pg_temp.intento($q$select retail.registrar_vinculo_google_avisado(gen_random_uuid(), (select id from retail.ubicaciones where nombre = 'Tienda Lima'))$q$);
      rollback;`),
    "vinculada\nenviado:true:true:true\n" + "P0001|vinculo_no_existe",
  );
  esperarValor(
    "desvincular (líder): cierra la cuenta sin correo ni usuario, deja la ficha intacta, queda en la actividad y sale de la lista",
    correr(`${PREPARAR}${PRELUDIO_ERP}
      ${como(FELIPE)}
      select retail.desvincular_cuenta_google(:'vinculo') as _x \\gset
      reset role;
      select (w.cerrada_en is not null)::text || ':' || (w.usuario_web_id is null)::text || ':' || (w.correo is null)::text || ':' || (w.usuario_cerrado_id = '${uAna}')::text
        from retail.cuentas_web w where w.clienta_id = :'ana';
      select (c.nombre = 'Ana Lucía Prueba Vega' and lower(btrim(c.correo)) = '${C.ana}' and c.archivada_en is null and not c.anonimizada)::text
        from retail.clientas c where c.id = :'ana';
      select (revertido_en is not null)::text || ':' || (revertido_por = :'persona_felipe')::text from retail.cuentas_web_vinculos_google where id = :'vinculo';
      select count(*) from retail.actividad where accion = 'vinculo_google_deshecho' and registro_id = :'ana'::text;
      select (retail.tienda_mi_cuenta('${uAna}') is null)::text;
      ${como(FELIPE)}
      select count(*) from retail.fn_vinculos_google_recientes() where clienta_id = :'ana';
      rollback;`),
    "vinculada\ntrue:true:true:true\ntrue\ntrue:true\n1\ntrue\n0",
  );
  esperarValor(
    "desvincular dos veces no hace nada la segunda; y la misma ficha ya no se une sola (tiene una cuenta cerrada)",
    correr(`${PREPARAR}${PRELUDIO_ERP}
      ${como(FELIPE)}
      select retail.desvincular_cuenta_google(:'vinculo') as _x \\gset
      select retail.desvincular_cuenta_google(:'vinculo') as _x \\gset
      reset role;
      select count(*) from retail.actividad where accion = 'vinculo_google_deshecho' and registro_id = :'ana'::text;
      ${estado(randomUUID(), C.ana, "Ana Prueba")}
      rollback;`),
    "vinculada\n1\nno_coincide",
  );
  esperarValor(
    "un vínculo con la cuenta ya cerrada por otra vía (ficha anonimizada, cuenta cerrada) no sale en la lista",
    correr(`${PREPARAR}${PRELUDIO_ERP}
      update retail.cuentas_web set cerrada_en = now(), usuario_cerrado_id = usuario_web_id, usuario_web_id = null, correo = null where clienta_id = :'ana';
      ${como(FELIPE)}
      select count(*) from retail.fn_vinculos_google_recientes() where clienta_id = :'ana';
      rollback;`),
    "vinculada\n0",
  );

  console.log("— Como tienda_web —");
  const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
  esperarValor(
    "como tienda_web, el camino funciona: vincula, y la cuenta ya se lee con tienda_mi_cuenta",
    correr(`${PREPARAR}
      ${COMO_TIENDA}
      ${estado(uAna, C.ana, "Ana Prueba")}
      select retail.tienda_mi_cuenta('${uAna}') ->> 'nombre_corto';
      rollback;`),
    "vinculada\nAna",
  );
  for (const [nombre, llamada] of [
    ["cuentas_web_vinculos_google", "select count(*) from retail.cuentas_web_vinculos_google"],
    ["fn_nombres_se_parecen", "select retail.fn_nombres_se_parecen('a', 'b')"],
    ["fn_vinculos_google_recientes", "select count(*) from retail.fn_vinculos_google_recientes()"],
  ]) {
    const r = correr(`${PREPARAR}${COMO_TIENDA}${llamada};\nrollback;`);
    esperar(`como tienda_web, ${nombre} se niega`, !r.ok && /permission denied/.test(r.mensaje), r.ok ? `respondió: ${r.salida}` : r.mensaje);
  }

  console.log("— La migración —");
  const sql = readFileSync(MIGRACION, "utf8");
  esperarValor("se puede volver a correr (dos veces seguidas, como un segundo pegado)", correr(`begin;\n${sql}\n${sql}\nselect 'ok';\nrollback;`), "ok");

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();

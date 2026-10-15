#!/usr/bin/env node
/**
 * Las cuentas de la tienda online (ADR-0408, actividades 2 y 2b) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261014223000_tienda_cuentas_parte1_clientas.sql` y `20261014224000_tienda_cuentas_parte2_cuentas_web.sql`:
 *   1. Estructura: `cuentas_web` y `cuentas_web_pendientes` con RLS y sin políticas ni permisos para nadie (tampoco
 *      `tienda_web`); las diez funciones `tienda_*` de la cuenta son security definer y solo las ejecuta `tienda_web`; el
 *      ayudante del correo, nadie de la API. `club_permisos` conoce el medio `tienda_web` solo para que ELLA otorgue la
 *      publicidad citando la casilla (ni el club, ni registrada por otro, ni con otro texto).
 *   2. Mientras se escribe: `tienda_consultar_correo` y `tienda_consultar_documento` dicen libre / repetido / archivada /
 *      del club, cuentan un intento de consulta (y uno inválido no lo cuenta) y frenan a los 20 por ip y hora.
 *   3. Antes de crear la cuenta: `tienda_revisar_registro` cuenta un intento de registro, frena por ip (5), documento (3) y
 *      celular (3), y dice si el correo o el DNI ya tienen cuenta o si la ficha está archivada.
 *   4. El código (actividad 2b): `tienda_reservar_envio` deja mandar uno, después pide esperar 60 s, frena a los 5 por hora y
 *      durante un bloqueo, solo reenvía a un correo que ya pidió el suyo, y limpia lo que lleva un día sin moverse;
 *      `tienda_anotar_invitado` guarda el usuario invitado; `tienda_intento_de_codigo` deja probar 5 veces (el quinto deja el
 *      bloqueo de 15 minutos, y después ese código ya no sirve), y dice cuándo venció. Desde el 2026-10-15 el código se pide y se
 *      confirma bajo el correo (con el correo solo) y la cuenta se crea después: lo que ese orden necesita de la base también se
 *      prueba (el código confirmado sirve aunque venza antes de terminar el formulario; si otro aparato pide un código entretanto,
 *      el intento se vuelve a anotar y la cuenta se crea).
 *   5. `tienda_registrar_cuenta`: SIN el código confirmado de ese correo y ese usuario, no hay cuenta (`cuenta_sin_codigo`);
 *      sin «Soy mayor de 18 años», tampoco. Con un DNI nuevo crea la ficha (origen web, socia con código, celular normalizado,
 *      cumpleaños como el Club, sin persona) y la cuenta, se lleva el pendiente y anota la actividad sin datos suyos; con una
 *      ficha que existe se une a ella sin pisar lo que tiene; con los avisos por WhatsApp anota el permiso de publicidad del
 *      Club con origen web (y no si su ficha tiene otro celular, o si el texto de la casilla cambió); y rechaza con su hint
 *      —sin escribir NADA— un correo o un DNI repetidos, el mismo usuario dos veces, una ficha archivada, un menor de 18, un
 *      cumpleaños imposible, un celular que no es, sin aceptar los términos o sin nombre.
 *   6. `tienda_mi_cuenta`, `tienda_club_beneficios` y `tienda_casilla_whatsapp` devuelven lo que la página muestra; como
 *      `tienda_web`, todo el camino funciona (código incluido) y las tablas se niegan.
 *   7. Las dos partes se pueden pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK: crea sus fichas (DNI 0999xxxx, que el seed no usa), sus pendientes y sus
 * intentos (huellas «zz-…» de esta corrida), y nada queda en el Postgres local que comparten los worktrees. Para actuar como
 * `tienda_web`, quien corre la prueba se da ese rol dentro de la transacción (se revierte). Para crear una cuenta, cada
 * escenario deja antes el pendiente de su correo con un código ya probado (`pg_temp.con_codigo`), como lo dejaría el servidor
 * después de que el proyecto de clientes verificó el código.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=1` mete las dos partes dentro de cada transacción (que se revierte). Sin la variable,
 * prueba lo que la base ya tiene (lo que hace el CI). `APLICAR_ANTES=<parte1>,<parte2>` prueba otras (una copia rota a propósito).
 *
 * DA POR SENTADO: el rol `tienda_web` (20261014220000), las funciones y los textos del club (`club_intento`,
 * `fn_club_codigo_nuevo`, `fn_club_textos_legales`, `casilla_publicidad`; ADR-0288) y ninguna ficha con DNI 0999xxxx.
 *
 * USO
 *   pnpm pruebas:tienda-cuentas    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-cuentas -- --contenedor supabase_db_<mi-pila>   → contra una pila propia
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACIONES = [
  "supabase/migrations/20261014223000_tienda_cuentas_parte1_clientas.sql",
  "supabase/migrations/20261014224000_tienda_cuentas_parte2_cuentas_web.sql",
];
const ANTES = process.env.APLICAR_ANTES ?? "";
const APLICAR_ANTES = ANTES ? (ANTES === "1" ? MIGRACIONES : ANTES.split(",")).map((m) => readFileSync(m.trim(), "utf8")).join("\n") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
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

// ---- Datos de esta corrida ----
const CORRIDA = Date.now().toString(36);
let n = 0;
/** Una huella de ip (o de documento) de esta corrida: no choca con intentos reales de la última hora. */
const huella = (que = "ip") => `zz-${que}-${CORRIDA}-${++n}`;
const correoNuevo = (que = "c") => `zz.${que}.${CORRIDA}.${++n}@ejemplo.com`;
const DNI = { nuevo: "09990001", caja: "09990002", socia: "09990003", archivada: "09990004", vacia: "09990005", otro: "09990006" };
const TEXTOS = "borrador-2026-10-14";
/** La versión vigente de la casilla de WhatsApp, como la manda la tienda (una expresión SQL). */
const CASILLA = "(select max(t.version) from retail.club_textos t where t.tipo = 'casilla_publicidad')";

// Cada escenario parte con sus fichas a mano: una de caja (sin club), una socia, una archivada y una sin celular ni cumpleaños.
const PREPARAR = `
begin;
${APLICAR_ANTES}
do $$ begin
  if exists (select 1 from retail.clientas where documento_numero like '0999%') then
    raise exception 'Ambiente sucio: ya hay fichas con DNI 0999xxxx en esta base.';
  end if;
end $$;
select retail.fn_hoy_lima() as hoy \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes)
values ('dni', '${DNI.caja}', 'Ana Prueba Caja', '987000111', 3, 4) returning id as caja \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes, cumple_anio,
                             club_desde, codigo_club)
values ('dni', '${DNI.socia}', 'Bea Socia Antigua', '987000222', 9, 9, 1990, now() - interval '400 days',
        retail.fn_club_codigo_nuevo()) returning id as socia, codigo_club as codigo_socia \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, archivada_en, motivo_archivo)
values ('dni', '${DNI.archivada}', 'Ceci Archivada', now(), 'prueba de la tienda') returning id as archivada \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre) values ('dni', '${DNI.vacia}', 'Dora Sin Datos')
returning id as vacia \\gset
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_detalle text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_detalle = pg_exception_detail;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || coalesce(v_detalle, '');
end $f$;
-- Lo que deja el servidor después de que el proyecto de clientes verificó el código: el pendiente de ese correo, con el usuario
-- invitado y un intento hecho. Después, la llamada.
create function pg_temp.con_codigo(p_correo text, p_usuario uuid, p_llamada text, p_intentos integer) returns jsonb language plpgsql as $f$
declare v jsonb;
begin
  if retail.fn_cuenta_web_correo(p_correo) is not null then
    insert into retail.cuentas_web_pendientes (correo, usuario_web_id, envios, primer_envio_en, ultimo_envio_en, vence_en, intentos)
    values (retail.fn_cuenta_web_correo(p_correo), p_usuario, 1, now(), now(), now() + interval '30 minutes', p_intentos)
    on conflict (correo) do update set usuario_web_id = excluded.usuario_web_id, intentos = excluded.intentos, vence_en = excluded.vence_en;
  end if;
  execute p_llamada into v;
  return v;
end $f$;
`;

/**
 * La llamada a tienda_registrar_cuenta con lo de un registro bueno, cambiando lo que se pida. `expr` es una expresión (para
 * `select (…) as r`) y `sql` una sentencia (para `pg_temp.intento($q$…$q$)`). Por defecto, con su código confirmado; con
 * `sinCodigo`, sin pendiente; con `codigoDe`, el pendiente es de OTRO usuario; con `intentosDelCodigo: 0`, nadie probó el código.
 */
function registrar(cambios = {}) {
  const d = {
    usuario: randomUUID(),
    correo: correoNuevo(),
    dni: DNI.nuevo,
    tipo: "dni",
    nombre: "Lucía Fernanda Pérez Salas",
    padron: true,
    celular: "+51 987 654 321",
    dia: 14,
    mes: 10,
    anio: 1995,
    acepta: true,
    mayor: true,
    avisos: false,
    casilla: "null",
    textos: TEXTOS,
    sinCodigo: false,
    codigoDe: null,
    intentosDelCodigo: 1,
    ...cambios,
  };
  const t = (v) => (v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
  const num = (v) => (v === null ? "null" : String(v));
  const uuid = (v) => (v === null ? "null" : `'${v}'`);
  const llamada = `select retail.tienda_registrar_cuenta(${uuid(d.usuario)}::uuid, ${t(d.correo)}, ${t(d.dni)}, ${t(d.nombre)}, ${d.padron}, ${t(d.celular)}, ${num(d.dia)}, ${num(d.mes)}, ${num(d.anio)}, ${d.acepta}, ${d.mayor}, ${d.avisos}, ${num(d.casilla)}, ${t(d.textos)}, ${t(d.tipo)})`;
  const expr = d.sinCodigo
    ? `(${llamada})`
    : `pg_temp.con_codigo(${t(d.correo)}, ${uuid(d.codigoDe ?? d.usuario)}::uuid, $r$${llamada}$r$, ${d.intentosDelCodigo})`;
  return { d, expr, sql: `select ${expr}` };
}
const RECUENTO = `(select count(*) from retail.clientas where documento_numero like '0999%') || ':' || (select count(*) from retail.cuentas_web) || ':' || (select count(*) from retail.actividad where accion = 'registro_web') || ':' || (select count(*) from retail.club_permisos where medio = 'tienda_web')`;
/** Corre una expresión sin que su resultado salga en la salida (la guarda en una variable de psql que nadie lee). */
const callado = (expr) => `select (${expr}) as _ignorar \\gset`;
/** El pendiente de un correo, en una línea: envíos|intentos|bloqueado|vence en 30 min|usuario. */
const PENDIENTE = (correo) => `(select p.envios || '|' || p.intentos || '|' || coalesce(p.bloqueado_hasta > now(), false)::text || '|' ||
  (p.vence_en between now() + interval '29 minutes' and now() + interval '31 minutes')::text || '|' || coalesce(p.usuario_web_id::text, '-')
  from retail.cuentas_web_pendientes p where p.correo = '${correo}')`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES && correr("select to_regclass('retail.cuentas_web_pendientes') is not null;").salida !== "t") {
    console.error(`Falta retail.cuentas_web_pendientes: aplica ${MIGRACIONES.join(" y ")} o corre con APLICAR_ANTES=1`);
    process.exit(2);
  }
  const preparado = correr(`${PREPARAR}select 'listo';\nrollback;`);
  if (!preparado.ok || preparado.salida !== "listo") {
    console.error(`No se pudo preparar el escenario: ${preparado.mensaje ?? preparado.salida}`);
    process.exit(2);
  }

  console.log("— Estructura —");
  esperarValor(
    "cuentas_web y cuentas_web_pendientes tienen RLS, ninguna política y ningún permiso para public, anon, authenticated ni tienda_web",
    correr(`${PREPARAR}
      select string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || (select count(*) from pg_policy p where p.polrelid = c.oid) || ':' ||
             (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE') or has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
              or has_table_privilege('tienda_web', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
              or has_table_privilege('public', c.oid, 'SELECT, INSERT, UPDATE, DELETE'))::text, ',' order by c.relname)
        from pg_class c where c.oid in ('retail.cuentas_web'::regclass, 'retail.cuentas_web_pendientes'::regclass);
      rollback;`),
    "cuentas_web:true:0:false,cuentas_web_pendientes:true:0:false",
  );
  const FUNCIONES = [
    "tienda_consultar_correo(text,text)",
    // Con el tipo de documento al final (DNI, carné de extranjería o pasaporte, 20261015161000).
    "tienda_consultar_documento(text,text,text,text)",
    "tienda_revisar_registro(text,text,text,text,text,text)",
    "tienda_reservar_envio(text,boolean)",
    "tienda_anotar_invitado(text,uuid)",
    "tienda_intento_de_codigo(text)",
    "tienda_registrar_cuenta(uuid,text,text,text,boolean,text,integer,integer,integer,boolean,boolean,boolean,integer,text,text)",
    "tienda_mi_cuenta(uuid)",
    "tienda_club_beneficios()",
    "tienda_casilla_whatsapp()",
  ];
  esperarValor(
    "las diez funciones de la cuenta: security definer, con su search_path, solo para tienda_web (y no queda la firma vieja de tienda_registrar_cuenta)",
    correr(`${PREPARAR}
      select string_agg(f || ':' || (p.prosecdef and exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%'))::text || ':' ||
             has_function_privilege('tienda_web', p.oid, 'EXECUTE')::text || ':' ||
             (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
              or has_function_privilege('public', p.oid, 'EXECUTE'))::text, ',' order by f collate "C")
        from unnest(array[${FUNCIONES.map((f) => `'${f}'`).join(", ")}]) f
        join pg_proc p on p.oid = ('retail.' || f)::regprocedure;
      select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'tienda_registrar_cuenta';
      rollback;`),
    `${[...FUNCIONES].sort().map((f) => `${f}:true:true:false`).join(",")}\n1`,
  );
  esperarValor(
    "el ayudante del correo no lo ejecuta nadie de la API (tampoco tienda_web)",
    correr(`${PREPARAR}
      select (has_function_privilege('tienda_web', 'retail.fn_cuenta_web_correo(text)', 'EXECUTE')
              or has_function_privilege('anon', 'retail.fn_cuenta_web_correo(text)', 'EXECUTE')
              or has_function_privilege('authenticated', 'retail.fn_cuenta_web_correo(text)', 'EXECUTE'))::text;
      rollback;`),
    "false",
  );
  esperarValor(
    "registro_origen acepta web (y sigue rechazando lo que no es caja, cartel ni web)",
    correr(`${PREPARAR}
      select pg_temp.intento($q$update retail.clientas set registro_origen = 'web' where documento_numero = '${DNI.vacia}'$q$) || '#' ||
             split_part(pg_temp.intento($q$update retail.clientas set registro_origen = 'tienda' where documento_numero = '${DNI.vacia}'$q$), '|', 1);
      rollback;`),
    "ok#23514",
  );
  // El medio de la tienda solo sirve para que ella otorgue la publicidad citando la casilla, sin quién la registró.
  const permiso = (finalidad, texto, registradoPor) =>
    `split_part(pg_temp.intento($q$insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, registrado_por)
       select c.id, '${finalidad}', 'otorga', 'tienda_web', '${texto}', (select max(t.version) from retail.club_textos t where t.tipo = '${texto}'), ${registradoPor}
         from retail.clientas c where c.documento_numero = '${DNI.caja}'$q$), '|', 1)`;
  esperarValor(
    "club_permisos con medio tienda_web: la publicidad que ella otorga con la casilla, sí; el club, otro texto o registrada por alguien, no",
    correr(`${PREPARAR}
      update retail.clientas set club_desde = now(), codigo_club = retail.fn_club_codigo_nuevo() where id = :'caja';
      select ${permiso("publicidad_whatsapp", "casilla_publicidad", "null")} || ',' ||
             ${permiso("club", "terminos", "null")} || ',' ||
             ${permiso("publicidad_whatsapp", "terminos", "null")} || ',' ||
             ${permiso("publicidad_whatsapp", "casilla_publicidad", "'22222222-2222-4222-8222-000000000001'::uuid")};
      rollback;`),
    "ok,23514,23514,23514",
  );

  console.log("— Mientras se escribe: el correo y el DNI —");
  const ip1 = huella();
  esperarValor(
    "un correo libre: «libre», y cuenta un intento de consulta con esa huella",
    // El intento se cuenta en la sentencia que sigue: la misma sentencia no ve lo que escribió la función que llama.
    correr(`${PREPARAR}
      select retail.tienda_consultar_correo(' Nueva.Persona@Ejemplo.com ', '${ip1}') ->> 'estado' as estado \\gset
      select :'estado' || '|' || (select count(*) from retail.club_intentos_registro where ip_hash = '${ip1}' and tipo = 'consulta');
      rollback;`),
    "libre|1",
  );
  const ip2 = huella();
  esperarValor(
    "un correo mal escrito: «invalido» y NO cuenta el intento",
    correr(`${PREPARAR}
      select string_agg(retail.tienda_consultar_correo(c, '${ip2}') ->> 'estado', ',') as estados
        from unnest(array['ana@', 'ana@gmail', '', null, 'ana @gmail.com']) c \\gset
      select :'estados' || '|' || (select count(*) from retail.club_intentos_registro where ip_hash = '${ip2}');
      rollback;`),
    "invalido,invalido,invalido,invalido,invalido|0",
  );
  const r1 = registrar({ correo: "zz.ana.repetida@ejemplo.com" });
  esperarValor(
    "un correo que ya tiene cuenta: «repetido» (sin importar mayúsculas ni espacios)",
    correr(`${PREPARAR}
      ${callado(r1.expr)}
      select retail.tienda_consultar_correo('  ZZ.Ana.Repetida@Ejemplo.COM', '${huella()}') ->> 'estado';
      rollback;`),
    "repetido",
  );
  const ip4 = huella();
  esperarValor(
    "a los 20 intentos de consulta de una ip en la hora, el 21 dice «limite»",
    correr(`${PREPARAR}
      insert into retail.club_intentos_registro (tipo, ip_hash) select 'consulta', '${ip4}' from generate_series(1, 20);
      select retail.tienda_consultar_correo('otra.persona@ejemplo.com', '${ip4}') ->> 'estado';
      rollback;`),
    "limite",
  );
  const ip5 = huella();
  const doc5 = huella("doc");
  esperarValor(
    "un DNI sin ficha: «libre», no es del club; cuenta la consulta con la huella del documento",
    correr(`${PREPARAR}
      select retail.tienda_consultar_documento('${DNI.nuevo}', '${ip5}', '${doc5}')::text as r \\gset
      select :'r' || '|' ||
             (select count(*) from retail.club_intentos_registro where ip_hash = '${ip5}' and documento_hash = '${doc5}' and tipo = 'consulta');
      rollback;`),
    '{"estado": "libre", "del_club": false}|1',
  );
  const ip6 = huella();
  esperarValor(
    "DNI de una socia: libre y del club; de una ficha de caja: libre y no del club; de una archivada: «archivada»",
    correr(`${PREPARAR}
      select (retail.tienda_consultar_documento('${DNI.socia}', '${ip6}', 'zz-d1') ->> 'del_club') || '|' ||
             (retail.tienda_consultar_documento('${DNI.caja}', '${ip6}', 'zz-d2') ->> 'del_club') || '|' ||
             (retail.tienda_consultar_documento('${DNI.archivada}', '${ip6}', 'zz-d3') ->> 'estado');
      rollback;`),
    "true|false|archivada",
  );
  const ip7 = huella();
  esperarValor(
    "un DNI mal escrito: «invalido» y no cuenta; uno que ya tiene cuenta: «repetido»",
    correr(`${PREPARAR}
      select (retail.tienda_consultar_documento('1234567', '${ip7}', 'zz-d') ->> 'estado') || '|' ||
             (retail.tienda_consultar_documento('ABCDEFGH', '${ip7}', 'zz-d') ->> 'estado') as estados \\gset
      select :'estados' || '|' || (select count(*) from retail.club_intentos_registro where ip_hash = '${ip7}');
      ${callado(registrar({ dni: DNI.socia }).expr)}
      select retail.tienda_consultar_documento('${DNI.socia}', '${ip7}', 'zz-d') ->> 'estado';
      rollback;`),
    "invalido|invalido|0\nrepetido",
  );

  console.log("— Antes de mandar el código: tienda_revisar_registro —");
  const revisar = (correo, dni, celular, ip, doc) =>
    `retail.tienda_revisar_registro(${correo === null ? "null" : `'${correo}'`}, '${dni}', '${celular}', '${ip}', '${doc}')`;
  const ip8 = huella();
  esperarValor(
    "todo libre: «ok», y cuenta UN intento de registro (con su huella de documento y el celular normalizado)",
    correr(`${PREPARAR}
      select ${revisar("nuevo@ejemplo.com", DNI.nuevo, "+51 987 654 321", ip8, "zz-doc-8")} ->> 'estado' as estado \\gset
      select :'estado' || '|' ||
             (select string_agg(tipo || ':' || coalesce(documento_hash, '-') || ':' || coalesce(celular, '-'), ',')
                from retail.club_intentos_registro where ip_hash = '${ip8}');
      rollback;`),
    "ok|registro:zz-doc-8:987654321",
  );
  const ip9 = huella();
  esperarValor(
    "datos que no son: «invalido» con su campo, sin contar el intento",
    correr(`${PREPARAR}
      select (${revisar("nuevo@", DNI.nuevo, "987654321", ip9, "zz-d")} ->> 'campo') || ',' ||
             (${revisar("nuevo@ejemplo.com", "123", "987654321", ip9, "zz-d")} ->> 'campo') || ',' ||
             (${revisar("nuevo@ejemplo.com", DNI.nuevo, "887654321", ip9, "zz-d")} ->> 'campo') as campos \\gset
      select :'campos' || '|' || (select count(*) from retail.club_intentos_registro where ip_hash = '${ip9}');
      rollback;`),
    "correo,dni,celular|0",
  );
  const r10 = registrar({ correo: "zz.tomado@ejemplo.com", dni: DNI.socia });
  esperarValor(
    "correo con cuenta: «correo_repetido»; DNI con cuenta: «dni_repetido»; ficha archivada: «archivada»",
    correr(`${PREPARAR}
      ${callado(r10.expr)}
      select (${revisar("ZZ.Tomado@ejemplo.com", DNI.nuevo, "987654321", huella(), "zz-a")} ->> 'estado') || ',' ||
             (${revisar("libre@ejemplo.com", DNI.socia, "987654321", huella(), "zz-b")} ->> 'estado') || ',' ||
             (${revisar("libre@ejemplo.com", DNI.archivada, "987654321", huella(), "zz-c")} ->> 'estado');
      rollback;`),
    "correo_repetido,dni_repetido,archivada",
  );
  const ip11 = huella();
  const doc11 = huella("doc");
  esperarValor(
    "los topes del cartel: 5 registros por ip, 3 por documento y 3 por celular en la hora → «limite»",
    correr(`${PREPARAR}
      insert into retail.club_intentos_registro (tipo, ip_hash) select 'registro', '${ip11}' from generate_series(1, 5);
      insert into retail.club_intentos_registro (tipo, ip_hash, documento_hash) select 'registro', 'zz-otra-' || g, '${doc11}' from generate_series(1, 3) g;
      insert into retail.club_intentos_registro (tipo, ip_hash, celular) select 'registro', 'zz-otra-' || g, '912121212' from generate_series(1, 3) g;
      select (${revisar("a@ejemplo.com", DNI.nuevo, "987654321", ip11, "zz-x")} ->> 'estado') || ',' ||
             (${revisar("a@ejemplo.com", DNI.nuevo, "987654321", huella(), doc11)} ->> 'estado') || ',' ||
             (${revisar("a@ejemplo.com", DNI.nuevo, "912121212", huella(), "zz-y")} ->> 'estado') || ',' ||
             (${revisar("a@ejemplo.com", DNI.nuevo, "976543210", huella(), "zz-z")} ->> 'estado');
      rollback;`),
    "limite,limite,limite,ok",
  );

  console.log("— El código: mandarlo, reenviarlo y probarlo —");
  const reservar = (correo) => `retail.tienda_reservar_envio('${correo}', false)`;
  const reenviar = (correo) => `retail.tienda_reservar_envio('${correo}', true)`;
  const c1 = correoNuevo("envio");
  const u1 = randomUUID();
  esperarValor(
    "el primero se manda: anota 1 envío, vence en 30 minutos, 0 intentos; y guarda el usuario invitado",
    correr(`${PREPARAR}
      select ${reservar(c1)} ->> 'estado' as e1 \\gset
      select retail.tienda_anotar_invitado('${c1.toUpperCase()}', '${u1}') as anotado \\gset
      select :'e1' || '#' || :'anotado' || '#' || ${PENDIENTE(c1)};
      select retail.tienda_anotar_invitado('${correoNuevo("nadie")}', '${u1}')::text;
      rollback;`),
    `enviar#t#1|0|false|true|${u1}\nfalse`,
  );
  esperarValor(
    "reenviar enseguida: «esperar» (los segundos que faltan, hasta 60); pasado el minuto, sale y devuelve el usuario de antes",
    correr(`${PREPARAR}
      select ${reservar(c1)} ->> 'estado' as e1 \\gset
      select retail.tienda_anotar_invitado('${c1}', '${u1}') as _a \\gset
      select ${reenviar(c1)} as r2 \\gset
      update retail.cuentas_web_pendientes set ultimo_envio_en = now() - interval '61 seconds' where correo = '${c1}';
      select ${reenviar(c1)} as r3 \\gset
      select (:'r2'::jsonb ->> 'estado') || '|' || ((:'r2'::jsonb ->> 'segundos')::int between 1 and 60)::text || '#' ||
             (:'r3'::jsonb ->> 'estado') || '|' || (:'r3'::jsonb ->> 'usuario_web_id') || '#' || ${PENDIENTE(c1)};
      rollback;`),
    `esperar|true#enviar|${u1}#2|0|false|true|${u1}`,
  );
  const c4 = correoNuevo("ajeno");
  esperarValor(
    "reenviar solo sirve para un correo que ya pidió su código (nadie manda códigos a correos ajenos sin los topes del registro): sin pedirlo, o pedido hace más de un día, «sin_codigo» y no se anota nada",
    correr(`${PREPARAR}
      select ${reenviar(c4)} ->> 'estado' as e1 \\gset
      select (select count(*) from retail.cuentas_web_pendientes where correo = '${c4}') as n1 \\gset
      select ${reservar(c1)} as _r \\gset
      update retail.cuentas_web_pendientes set ultimo_envio_en = now() - interval '25 hours', creado_en = now() - interval '25 hours' where correo = '${c1}';
      select ${reenviar(c1)} ->> 'estado' as e2 \\gset
      select :'e1' || '|' || :'n1' || '#' || :'e2' || '|' || coalesce((select envios from retail.cuentas_web_pendientes where correo = '${c1}'), -1);
      rollback;`),
    "sin_codigo|0#sin_codigo|1",
  );
  esperarValor(
    "5 códigos en la hora: el sexto, «limite»; pasada la hora, se cuenta de nuevo desde 1",
    correr(`${PREPARAR}
      select ${reservar(c1)} as _r \\gset
      update retail.cuentas_web_pendientes set envios = 5, primer_envio_en = now() - interval '20 minutes',
             ultimo_envio_en = now() - interval '2 minutes' where correo = '${c1}';
      select ${reservar(c1)} as r1 \\gset
      update retail.cuentas_web_pendientes set primer_envio_en = now() - interval '61 minutes' where correo = '${c1}';
      select ${reservar(c1)} ->> 'estado' as e2 \\gset
      select (:'r1'::jsonb ->> 'estado') || '|' || ((:'r1'::jsonb ->> 'minutos')::int between 1 and 41)::text || '#' || :'e2' || '#' ||
             (select envios from retail.cuentas_web_pendientes where correo = '${c1}');
      rollback;`),
    "limite|true#enviar#1",
  );
  esperarValor(
    "a un correo que ya tiene cuenta no se le manda código; a uno mal escrito, tampoco (y no se anota nada)",
    correr(`${PREPARAR}
      ${callado(registrar({ correo: "zz.ya.tiene@ejemplo.com" }).expr)}
      select (${reservar("ZZ.Ya.Tiene@ejemplo.com")} ->> 'estado') || '|' || (${reservar("ana@")} ->> 'estado') || '|' ||
             (select count(*) from retail.cuentas_web_pendientes where correo in ('zz.ya.tiene@ejemplo.com', 'ana@'));
      rollback;`),
    "correo_repetido|invalido|0",
  );
  const c2 = correoNuevo("viejo");
  const u2 = randomUUID();
  const c3 = correoNuevo("mismo");
  const u3 = randomUUID();
  const c5 = correoNuevo("activo");
  const u5 = randomUUID();
  esperarValor(
    "lo que lleva un día sin moverse se limpia solo: el pendiente viejo de otro correo se va y su usuario vuelve para borrarlo (no el de quien pidió un código hace poco, aunque empezó hace más de un día); el de este correo empieza de cero y conserva su usuario",
    correr(`${PREPARAR}
      insert into retail.cuentas_web_pendientes (correo, usuario_web_id, envios, primer_envio_en, ultimo_envio_en, vence_en, intentos, creado_en)
      values ('${c2}', '${u2}', 3, now() - interval '2 days', now() - interval '2 days', now() - interval '2 days', 2, now() - interval '2 days'),
             ('${c3}', '${u3}', 5, now() - interval '2 days', now() - interval '2 days', now() - interval '2 days', 5, now() - interval '2 days'),
             ('${c5}', '${u5}', 1, now() - interval '5 minutes', now() - interval '5 minutes', now() + interval '25 minutes', 0, now() - interval '2 days');
      select ${reservar(c3)} as r \\gset
      select (:'r'::jsonb ->> 'estado') || '|' || (:'r'::jsonb ->> 'usuario_web_id') || '|' || (:'r'::jsonb -> 'limpiar' @> to_jsonb('${u2}'::text))::text || '|' ||
             (jsonb_array_length(:'r'::jsonb -> 'limpiar') >= 1)::text || '|' || (not (:'r'::jsonb -> 'limpiar' @> to_jsonb('${u5}'::text)))::text || '|' ||
             (select count(*) from retail.cuentas_web_pendientes where correo = '${c2}') || '|' ||
             (select count(*) from retail.cuentas_web_pendientes where correo = '${c5}') || '#' || ${PENDIENTE(c3)};
      rollback;`),
    `enviar|${u3}|true|true|true|0|1#1|0|false|true|${u3}`,
  );
  const intento = (correo) => `retail.tienda_intento_de_codigo('${correo}')`;
  esperarValor(
    "sin código pedido: «sin_codigo»; con uno, 5 intentos (quedan 4, 3, 2, 1, 0), y el quinto deja 15 minutos de bloqueo: ni otro código ni otro intento; pasado el bloqueo, ese código ya no sirve («vencido») y uno nuevo sí",
    correr(`${PREPARAR}
      select (${intento(c1)} ->> 'estado') as e0 \\gset
      select ${reservar(c1)} as _r \\gset
      select (${intento(c1)} ->> 'quedan') as q1 \\gset
      select (${intento(c1)} ->> 'quedan') as q2 \\gset
      select (${intento(c1)} ->> 'quedan') as q3 \\gset
      select (${intento(c1)} ->> 'quedan') as q4 \\gset
      select (${intento(c1)} ->> 'quedan') as q5 \\gset
      select ${reenviar(c1)} as r6 \\gset
      select ${intento(c1)} as r7 \\gset
      update retail.cuentas_web_pendientes set bloqueado_hasta = now() - interval '1 second', ultimo_envio_en = now() - interval '16 minutes' where correo = '${c1}';
      select (${intento(c1)} ->> 'estado') as e8 \\gset
      select (${reenviar(c1)} ->> 'estado') as e9 \\gset
      select :'e0' || '#' || :'q1' || ',' || :'q2' || ',' || :'q3' || ',' || :'q4' || ',' || :'q5' || '#' ||
             (:'r6'::jsonb ->> 'estado') || '|' || ((:'r6'::jsonb ->> 'minutos')::int between 14 and 15)::text || '#' ||
             (:'r7'::jsonb ->> 'estado') || '|' || ((:'r7'::jsonb ->> 'minutos')::int between 14 and 15)::text || '#' ||
             :'e8' || '#' || :'e9' || '|' || (${intento(c1)} ->> 'quedan');
      rollback;`),
    "sin_codigo#4,3,2,1,0#bloqueado|true#bloqueado|true#vencido#enviar|4",
  );
  esperarValor(
    "el código vence: pasados los 30 minutos, «vencido» (y con uno nuevo se puede probar otra vez)",
    correr(`${PREPARAR}
      select ${reservar(c1)} as _r \\gset
      update retail.cuentas_web_pendientes set vence_en = now() - interval '1 second' where correo = '${c1}';
      select (${intento(c1)} ->> 'estado') as e1 \\gset
      update retail.cuentas_web_pendientes set ultimo_envio_en = now() - interval '61 seconds' where correo = '${c1}';
      select (${reservar(c1)} ->> 'estado') as e2 \\gset
      select :'e1' || '|' || :'e2' || '|' || (${intento(c1)} ->> 'estado');
      rollback;`),
    "vencido|enviar|puede",
  );

  // El código bajo el correo (Felipe 2026-10-15, `apps/tienda/app/acciones/cuenta.ts`): «Obtener código» llega con el correo solo
  // (la consulta cuenta el tope por ip), el código se confirma apenas llega y la cuenta se crea después, al terminar el formulario.
  const c6 = correoNuevo("bajo");
  const u6 = randomUUID();
  const r6 = registrar({ correo: c6, usuario: u6, sinCodigo: true });
  esperarValor(
    "el código bajo el correo: la primera vez se manda con el correo solo (la consulta cuenta el tope por ip; sin DNI ni celular), y el código confirmado sirve para crear la cuenta aunque ya haya vencido (se crea al terminar el formulario)",
    correr(`${PREPARAR}
      select retail.tienda_consultar_correo('${c6}', '${huella()}') ->> 'estado' as e1 \\gset
      select ${reservar(c6)} ->> 'estado' as e2 \\gset
      select retail.tienda_anotar_invitado('${c6}', '${u6}') as anotado \\gset
      select ${intento(c6)} ->> 'estado' as e3 \\gset
      update retail.cuentas_web_pendientes set vence_en = now() - interval '1 minute' where correo = '${c6}';
      select pg_temp.intento($q$${r6.sql}$q$) as e4 \\gset
      select :'e1' || '|' || :'e2' || '|' || :'anotado' || '|' || :'e3' || '#' || :'e4' || '#' ||
             (select count(*) from retail.cuentas_web where usuario_web_id = '${u6}');
      rollback;`),
    "libre|enviar|t|puede#ok#1",
  );
  const c7 = correoNuevo("otro-aparato");
  const u7 = randomUUID();
  const r7 = registrar({ correo: c7, usuario: u7, sinCodigo: true });
  esperarValor(
    "si otro aparato pide un código para ese correo mientras esta persona termina el formulario, su pedido deja el pendiente sin el código probado (cuenta_sin_codigo); el servidor vuelve a anotar el intento (con la prueba firmada de este aparato) y la cuenta se crea",
    correr(`${PREPARAR}
      select ${reservar(c7)} as _r \\gset
      select retail.tienda_anotar_invitado('${c7}', '${u7}') as _a \\gset
      select ${intento(c7)} as _i \\gset
      update retail.cuentas_web_pendientes set ultimo_envio_en = now() - interval '61 seconds' where correo = '${c7}';
      select ${reservar(c7)} ->> 'estado' as e1 \\gset
      select pg_temp.intento($q$${r7.sql}$q$) as e2 \\gset
      select ${intento(c7)} ->> 'estado' as e3 \\gset
      select pg_temp.intento($q$${r7.sql}$q$) as e4 \\gset
      select :'e1' || '#' || :'e2' || '#' || :'e3' || '#' || :'e4' || '#' ||
             (select count(*) from retail.cuentas_web where usuario_web_id = '${u7}');
      rollback;`),
    "enviar#P0001|cuenta_sin_codigo|codigo#puede#ok#1",
  );

  console.log("— tienda_registrar_cuenta —");
  const rCod = registrar({ sinCodigo: true });
  const rOtro = registrar({ codigoDe: randomUUID() });
  const rSinProbar = registrar({ intentosDelCodigo: 0 });
  esperarValor(
    "sin código no hay cuenta: sin pendiente, con el pendiente de OTRO usuario o sin haber probado el código → cuenta_sin_codigo, y nada se escribe",
    correr(`${PREPARAR}
      select ${RECUENTO} as antes \\gset
      select pg_temp.intento($q$${rCod.sql}$q$) || '#' || pg_temp.intento($q$${rOtro.sql}$q$) || '#' || pg_temp.intento($q$${rSinProbar.sql}$q$)
             || '#' || ((${RECUENTO}) = :'antes')::text;
      rollback;`),
    "P0001|cuenta_sin_codigo|codigo#P0001|cuenta_sin_codigo|codigo#P0001|cuenta_sin_codigo|codigo#true",
  );
  const r20 = registrar({ correo: " Lucia.Perez@Ejemplo.com " });
  esperarValor(
    "DNI nuevo: crea la ficha (origen web, socia con código, celular normalizado, cumpleaños, correo, sin persona ni tienda) y la cuenta, y se lleva el pendiente",
    correr(`${PREPARAR}
      select (${r20.expr}) as r \\gset
      select (:'r'::jsonb ->> 'era_del_club') || '|' || (:'r'::jsonb ->> 'se_unio_a_su_ficha') || '|' || (:'r'::jsonb ->> 'nombre_corto') || '|' ||
             ((:'r'::jsonb ->> 'codigo_club') ~ '^C-[0-9]{4,}$')::text || '|' || (:'r'::jsonb ->> 'avisos_whatsapp');
      select c.nombre || '|' || c.telefono_whatsapp || '|' || c.cumple_dia || '/' || c.cumple_mes || '/' || c.cumple_anio || '|' ||
             c.correo || '|' || c.registro_origen || '|' || (c.created_por is null)::text || '|' || (c.club_ubicacion_id is null)::text || '|' ||
             (c.publicidad_desde is null)::text || '|' || (c.club_desde = now())::text || '|' || (c.codigo_club = :'r'::jsonb ->> 'codigo_club')::text
        from retail.clientas c where c.documento_numero = '${DNI.nuevo}';
      select w.correo || '|' || (w.usuario_web_id = '${r20.d.usuario}')::text || '|' || w.textos_aceptados || '|' ||
             (w.clienta_id = (select id from retail.clientas where documento_numero = '${DNI.nuevo}'))::text || '|' ||
             (select count(*) from retail.cuentas_web_pendientes where correo = 'lucia.perez@ejemplo.com')
        from retail.cuentas_web w where w.usuario_web_id = '${r20.d.usuario}';
      rollback;`),
    "false|false|Lucía|true|no\n" +
      "Lucía Fernanda Pérez Salas|987654321|14/10/1995|lucia.perez@ejemplo.com|web|true|true|true|true|true\n" +
      "lucia.perez@ejemplo.com|true|borrador-2026-10-14|true|0",
  );
  esperarValor(
    "…y la actividad «registro_web», sin persona y sin el DNI, el nombre, el celular ni el correo",
    correr(`${PREPARAR}
      ${callado(registrar().expr)}
      select a.modulo || '|' || a.accion || '|' || (a.persona_id is null)::text || '|' || (a.registro_id = c.id::text)::text || '|' ||
             (a::text !~* '(${DNI.nuevo}|lucía|pérez|987654321|@ejemplo)')::text || '|' || (a.detalle ->> 'nueva') || '|' || (a.detalle ->> 'textos')
        from retail.actividad a join retail.clientas c on c.documento_numero = '${DNI.nuevo}'
       where a.accion = 'registro_web' and a.registro_id = c.id::text;
      rollback;`),
    "clientas|registro_web|true|true|true|true|borrador-2026-10-14",
  );
  esperarValor(
    "ficha de caja (sin club): se une a ella; el nombre del padrón reemplaza, el celular y el cumpleaños que tenía NO se pisan, el correo vacío se completa; queda socia y su origen sigue «caja»",
    correr(`${PREPARAR}
      select (${registrar({ dni: DNI.caja, nombre: "Ana María Prueba Caja", celular: "912345678", dia: 20, mes: 1, anio: 1990 }).expr}) as r \\gset
      select (:'r'::jsonb ->> 'se_unio_a_su_ficha') || '|' || (:'r'::jsonb ->> 'era_del_club') || '|' || (:'r'::jsonb ->> 'nombre_corto');
      select c.nombre || '|' || c.telefono_whatsapp || '|' || c.cumple_dia || '/' || c.cumple_mes || '/' || coalesce(c.cumple_anio::text, '-') || '|' ||
             (c.correo like 'zz.%')::text || '|' || c.registro_origen || '|' || (c.club_desde = now())::text || '|' || (c.codigo_club = :'r'::jsonb ->> 'codigo_club')::text
        from retail.clientas c where c.id = :'caja';
      rollback;`),
    "true|false|Ana\nAna María Prueba Caja|987000111|3/4/-|true|caja|true|true",
  );
  esperarValor(
    "socia que ya era del club, con el nombre escrito a mano: conserva su nombre, su fecha de socia y su código (era_del_club)",
    correr(`${PREPARAR}
      select (${registrar({ dni: DNI.socia, nombre: "Otro Nombre Cualquiera", padron: false }).expr}) as r \\gset
      select (:'r'::jsonb ->> 'era_del_club') || '|' || (:'r'::jsonb ->> 'se_unio_a_su_ficha') || '|' || (:'r'::jsonb ->> 'codigo_club' = :'codigo_socia')::text;
      select c.nombre || '|' || (c.club_desde < now() - interval '399 days')::text || '|' || (c.codigo_club = :'codigo_socia')::text || '|' || c.cumple_anio
        from retail.clientas c where c.id = :'socia';
      rollback;`),
    "true|true|true\nBea Socia Antigua|true|true|1990",
  );
  esperarValor(
    "ficha sin celular ni cumpleaños: se completan con lo de la web",
    correr(`${PREPARAR}
      ${callado(registrar({ dni: DNI.vacia, celular: "999888777", dia: 29, mes: 2, anio: null, nombre: "Dora", padron: false }).expr)}
      select c.nombre || '|' || c.telefono_whatsapp || '|' || c.cumple_dia || '/' || c.cumple_mes || '/' || coalesce(c.cumple_anio::text, '-')
        from retail.clientas c where c.id = :'vacia';
      rollback;`),
    "Dora Sin Datos|999888777|29/2/-",
  );

  console.log("— Los avisos del Club por WhatsApp —");
  const rAvisos = registrar({ avisos: true, casilla: CASILLA });
  esperarValor(
    "marcó los avisos: el permiso de publicidad con origen web (casilla vigente, sin quién lo registró ni tienda) y publicidad_desde, que es lo que pide la regla de los avisos del Club (club_desde y publicidad_desde)",
    correr(`${PREPARAR}
      select (${rAvisos.expr}) as r \\gset
      select (:'r'::jsonb ->> 'avisos_whatsapp') || '|' ||
             (select string_agg(p.finalidad || ':' || p.accion || ':' || p.medio || ':' || p.texto_tipo || ':' || (p.texto_version = ${CASILLA})::text || ':' ||
                     (p.registrado_por is null)::text || ':' || (p.ubicacion_id is null)::text || ':' || (p.created_at = now())::text, ',')
                from retail.club_permisos p join retail.clientas c on c.id = p.clienta_id where c.documento_numero = '${DNI.nuevo}') || '|' ||
             (select (c.publicidad_desde = now() and c.club_desde is not null and c.publicidad_desde is not null)::text
                from retail.clientas c where c.documento_numero = '${DNI.nuevo}');
      rollback;`),
    "activados|publicidad_whatsapp:otorga:tienda_web:casilla_publicidad:true:true:true:true|true",
  );
  esperarValor(
    "sin marcar los avisos: ni permiso ni publicidad («no»)",
    correr(`${PREPARAR}
      select (${registrar({ avisos: false }).expr}) ->> 'avisos_whatsapp' as e \\gset
      select :'e' || '|' || (select count(*) from retail.club_permisos p join retail.clientas c on c.id = p.clienta_id where c.documento_numero = '${DNI.nuevo}')
             || '|' || (select (publicidad_desde is null)::text from retail.clientas where documento_numero = '${DNI.nuevo}');
      rollback;`),
    "no|0|true",
  );
  esperarValor(
    "su ficha ya tenía OTRO celular (que no se pisa): los avisos quedan sin activar («celular_distinto»), sin permiso ni publicidad",
    correr(`${PREPARAR}
      select (${registrar({ dni: DNI.caja, celular: "912345678", avisos: true, casilla: CASILLA }).expr}) ->> 'avisos_whatsapp' as e \\gset
      select :'e' || '|' || (select count(*) from retail.club_permisos where clienta_id = :'caja') || '|' ||
             (select (publicidad_desde is null)::text || ':' || telefono_whatsapp from retail.clientas where id = :'caja');
      rollback;`),
    "celular_distinto|0|true:987000111",
  );
  esperarValor(
    "una socia que ya tenía los avisos con la misma casilla: no se anota otra fila («ya_estaban») y conserva su fecha",
    correr(`${PREPARAR}
      update retail.clientas set publicidad_desde = now() - interval '30 days' where id = :'socia';
      insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version)
      values (:'socia', 'publicidad_whatsapp', 'otorga', 'pagina_cartel', 'casilla_publicidad', ${CASILLA});
      select (${registrar({ dni: DNI.socia, celular: "987000222", avisos: true, casilla: CASILLA }).expr}) ->> 'avisos_whatsapp' as e \\gset
      select :'e' || '|' || (select count(*) from retail.club_permisos where clienta_id = :'socia') || '|' ||
             (select (publicidad_desde < now() - interval '29 days')::text from retail.clientas where id = :'socia');
      rollback;`),
    "ya_estaban|1|true",
  );

  console.log("— Lo que la base rechaza, sin escribir nada —");
  const rCorreo = registrar({ correo: "zz.unico@ejemplo.com" });
  const rUsuario = registrar({ dni: DNI.caja });
  const casos = [
    ["sin la casilla «Soy mayor de 18 años»", registrar({ dni: DNI.otro, mayor: false }).sql, "22023|cuenta_datos_invalidos|mayor"],
    ["los avisos con un texto de casilla que ya no es el vigente", registrar({ dni: DNI.otro, avisos: true, casilla: `${CASILLA} - 1` }).sql, "P0001|cuenta_texto_cambio|avisos"],
    ["los avisos sin decir qué casilla leyó", registrar({ dni: DNI.otro, avisos: true, casilla: "null" }).sql, "P0001|cuenta_texto_cambio|avisos"],
    ["el mismo correo (con otras mayúsculas)", registrar({ correo: "ZZ.Unico@Ejemplo.com", dni: DNI.otro }).sql, "P0001|cuenta_correo_repetido|correo"],
    ["el mismo DNI con otro correo", registrar({ dni: DNI.nuevo }).sql, "P0001|cuenta_dni_repetido|dni"],
    ["el mismo usuario dos veces", registrar({ usuario: rUsuario.d.usuario, dni: DNI.otro }).sql, "P0001|cuenta_ya_existe|"],
    ["una ficha archivada", registrar({ dni: DNI.archivada }).sql, "P0001|cuenta_archivada|dni"],
    ["un menor de 18 (por el año, aunque marque la casilla)", registrar({ dni: DNI.otro, anio: new Date().getFullYear() - 17 }).sql, "P0001|cuenta_menor|cumple"],
    ["el 29 de febrero de un año que no es bisiesto", registrar({ dni: DNI.otro, dia: 29, mes: 2, anio: 2001 }).sql, "22023|cuenta_datos_invalidos|cumple"],
    ["el 31 de abril", registrar({ dni: DNI.otro, dia: 31, mes: 4, anio: null }).sql, "22023|cuenta_datos_invalidos|cumple"],
    ["el mes 13", registrar({ dni: DNI.otro, mes: 13 }).sql, "22023|cuenta_datos_invalidos|cumple"],
    ["sin día", registrar({ dni: DNI.otro, dia: null }).sql, "22023|cuenta_datos_invalidos|cumple"],
    ["un año de antes de 1900", registrar({ dni: DNI.otro, anio: 1899 }).sql, "22023|cuenta_datos_invalidos|cumple"],
    ["un celular que no empieza en 9", registrar({ dni: DNI.otro, celular: "812345678" }).sql, "22023|cuenta_datos_invalidos|celular"],
    ["sin aceptar los términos", registrar({ dni: DNI.otro, acepta: false }).sql, "22023|cuenta_datos_invalidos|acepta"],
    ["un DNI nuevo sin nombre", registrar({ dni: DNI.otro, nombre: "   ", padron: false }).sql, "22023|cuenta_datos_invalidos|nombre"],
    ["«del padrón» sin nombre", registrar({ dni: DNI.caja, nombre: null, padron: true }).sql, "22023|cuenta_datos_invalidos|nombre"],
    ["un correo sin forma de correo", registrar({ dni: DNI.otro, correo: "ana@gmail" }).sql, "22023|cuenta_datos_invalidos|correo"],
    ["un DNI de 7 dígitos", registrar({ dni: "1234567" }).sql, "22023|cuenta_datos_invalidos|dni"],
    ["sin usuario", registrar({ dni: DNI.otro, usuario: null }).sql, "22023|cuenta_datos_invalidos|usuario"],
    ["una versión de textos rara", registrar({ dni: DNI.otro, textos: "Borrador 1" }).sql, "22023|cuenta_datos_invalidos|textos"],
  ];
  for (const [caso, sql, esperado] of casos) {
    esperarValor(
      `rechaza ${caso} (${esperado.split("|")[1]})`,
      correr(`${PREPARAR}
        ${callado(rCorreo.expr)}
        ${callado(rUsuario.expr)}
        select ${RECUENTO} as antes \\gset
        select pg_temp.intento($q$${sql}$q$) || '#' || ((${RECUENTO}) = :'antes')::text;
        rollback;`),
      `${esperado}#true`,
    );
  }
  // Hoy, en Lima, menos 18 años (`registrar` deja pasar una expresión SQL en el día, el mes y el año).
  const HOY_LIMA = "retail.fn_hoy_lima()";
  esperarValor(
    "quien cumple 18 hoy (en Lima) sí entra; quien los cumple mañana, no",
    correr(`${PREPARAR}
      select pg_temp.intento($q$${registrar({ dni: DNI.otro, dia: `extract(day from ${HOY_LIMA})::int`, mes: `extract(month from ${HOY_LIMA})::int`, anio: `(extract(year from ${HOY_LIMA}) - 18)::int` }).sql}$q$) || '#' ||
             pg_temp.intento($q$${registrar({ dni: DNI.nuevo, dia: `extract(day from ${HOY_LIMA} + 1)::int`, mes: `extract(month from ${HOY_LIMA} + 1)::int`, anio: `(extract(year from ${HOY_LIMA} + 1) - 18)::int` }).sql}$q$);
      rollback;`),
    "ok#P0001|cuenta_menor|cumple",
  );

  console.log("— Mi cuenta, los beneficios y la casilla —");
  const r30 = registrar({ correo: "zz.mi.cuenta@ejemplo.com", nombre: "María Pérez Salas" });
  esperarValor(
    "tienda_mi_cuenta: nombre, nombre de pila, correo, código, socia desde hoy (Lima), cumpleaños y activa; null para un usuario sin cuenta",
    correr(`${PREPARAR}
      ${callado(r30.expr)}
      select (m ->> 'nombre') || '|' || (m ->> 'nombre_corto') || '|' || (m ->> 'correo') || '|' || ((m ->> 'codigo_club') ~ '^C-')::text || '|' ||
             ((m ->> 'club_desde') = :'hoy')::text || '|' || (m ->> 'cumple_dia') || '/' || (m ->> 'cumple_mes') || '|' || (m ->> 'activa')
        from (select retail.tienda_mi_cuenta('${r30.d.usuario}') as m) x;
      select coalesce(retail.tienda_mi_cuenta('${randomUUID()}')::text, 'null');
      rollback;`),
    "María Pérez Salas|María|zz.mi.cuenta@ejemplo.com|true|true|14/10|true\nnull",
  );
  esperarValor(
    "tienda_club_beneficios: el % del cumpleaños y la escala, sin los textos; tienda_casilla_whatsapp: el texto vigente de la casilla con su versión",
    correr(`${PREPARAR}
      select ((b ->> 'pct')::numeric > 0)::text || '|' || (jsonb_array_length(b -> 'escala') > 0)::text || '|' || (b ? 'textos')::text
        from (select retail.tienda_club_beneficios() as b) x;
      select ((c ->> 'version')::int = ${CASILLA})::text || '|' || (c ->> 'texto' = (select texto from retail.club_textos where tipo = 'casilla_publicidad' order by version desc limit 1))::text
        from (select retail.tienda_casilla_whatsapp() as c) x;
      rollback;`),
    "true|true|false\ntrue|true",
  );
  // «Cambiar mi correo» (Felipe 2026-10-15, 20261015132000; lo prueba a fondo tienda_mi_cuenta.mjs): crear una cuenta mira el correo que
  // la cuenta tiene HOY. El nuevo queda tomado y el de antes, libre para otra persona.
  esperarValor(
    "un correo cambiado en Mi cuenta: el nuevo queda tomado para crear otra cuenta (correo_repetido) y el de antes, libre",
    correr(`${PREPARAR}
      ${callado(r30.expr)}
      select (retail.tienda_pedir_cambio_correo('${r30.d.usuario}', 'zz.mi.cuenta.nueva@ejemplo.com') ->> 'estado') as _p \\gset
      select retail.tienda_correo_confirmado('${r30.d.usuario}', 'zz.mi.cuenta.nueva@ejemplo.com') ->> 'estado';
      select (retail.tienda_consultar_correo('zz.mi.cuenta@ejemplo.com', '${huella()}') ->> 'estado') || '|' ||
             (retail.tienda_consultar_correo('zz.mi.cuenta.nueva@ejemplo.com', '${huella()}') ->> 'estado') || '|' ||
             (${revisar("zz.mi.cuenta.nueva@ejemplo.com", DNI.caja, "987654399", huella(), "zz-d-nueva")} ->> 'estado');
      rollback;`),
    "aplicado\nlibre|repetido|correo_repetido",
  );

  console.log("— Carné de extranjería y pasaporte (Felipe 2026-10-15) —");
  {
    // Una ficha de caja con pasaporte, ya del Club (como las que registra la caja o el cartel con un extranjero).
    const CON_PASAPORTE = `${PREPARAR}
      insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club)
      values ('pasaporte', 'ZZ0999001', 'Paola Pasaporte', '987000333', now() - interval '30 days', retail.fn_club_codigo_nuevo());`;
    esperarValor(
      "consultar: el carné libre (en minúsculas también), el pasaporte de una ficha del Club, el mismo número con otro tipo es otro documento, y un formato o un tipo que no es",
      correr(`${CON_PASAPORTE}
        select (retail.tienda_consultar_documento('zz0999002', '${huella()}', '${huella("d")}', 'carne_extranjeria') ->> 'estado') || '|' ||
               (retail.tienda_consultar_documento('ZZ0999001', '${huella()}', '${huella("d")}', 'pasaporte') ->> 'del_club') || '|' ||
               (retail.tienda_consultar_documento('ZZ0999001', '${huella()}', '${huella("d")}', 'carne_extranjeria') ->> 'del_club') || '|' ||
               (retail.tienda_consultar_documento('AB12', '${huella()}', '${huella("d")}', 'pasaporte') ->> 'estado') || '|' ||
               (retail.tienda_consultar_documento('${DNI.otro}', '${huella()}', '${huella("d")}', 'ruc') ->> 'estado') || '|' ||
               (retail.tienda_consultar_documento('${DNI.socia}', '${huella()}', '${huella("d")}') ->> 'del_club');
        rollback;`),
      "libre|true|false|invalido|invalido|true",
    );
    esperarValor(
      "revisar antes del código: un pasaporte libre pasa; uno de 5 caracteres, no",
      correr(`${CON_PASAPORTE}
        select (retail.tienda_revisar_registro('${correoNuevo()}', 'ZZ0999003', '987654300', '${huella()}', '${huella("d")}', 'pasaporte') ->> 'estado') || '|' ||
               (retail.tienda_revisar_registro('${correoNuevo()}', 'AB123', '987654301', '${huella()}', '${huella("d")}', 'pasaporte') ->> 'campo');
        rollback;`),
      "ok|dni",
    );
    const nuevo = registrar({ dni: "zz0999004", tipo: "carne_extranjeria", nombre: "  Ana Lucía   Torres Ruiz ", padron: false });
    const repetido = registrar({ dni: "ZZ0999004", tipo: "carne_extranjeria", nombre: "Ana Torres", padron: false });
    const unida = registrar({ dni: "ZZ0999001", tipo: "pasaporte", nombre: "Otro Nombre Escrito", padron: false });
    esperarValor(
      "crear la cuenta con carné: la ficha nace con su tipo, su número normalizado y el nombre escrito (nombres primero); el mismo carné otra vez, no; con pasaporte se une a su ficha sin cambiarle el nombre",
      correr(`${CON_PASAPORTE}
        select (${nuevo.expr}) ->> 'se_unio_a_su_ficha';
        select c.documento_tipo || '|' || c.documento_numero || '|' || c.nombre || '|' || c.registro_origen || '|' || (c.club_desde is not null)::text
          from retail.clientas c where c.documento_numero = 'ZZ0999004';
        select pg_temp.intento($q$${repetido.sql}$q$);
        select (${unida.expr}) ->> 'se_unio_a_su_ficha';
        select c.nombre || '|' || (select count(*) from retail.cuentas_web w where w.clienta_id = c.id)
          from retail.clientas c where c.documento_tipo = 'pasaporte' and c.documento_numero = 'ZZ0999001';
        rollback;`),
      "false\ncarne_extranjeria|ZZ0999004|Ana Lucía Torres Ruiz|web|true\nP0001|cuenta_dni_repetido|dni\ntrue\nPaola Pasaporte|1",
    );
    const casosDoc = [
      ["con carné, «el nombre es del padrón» no vale: el padrón es solo del DNI", registrar({ dni: "ZZ0999005", tipo: "carne_extranjeria", nombre: "Ana Torres", padron: true }).sql, "22023|cuenta_datos_invalidos|nombre"],
      ["un pasaporte de 5 caracteres", registrar({ dni: "AB123", tipo: "pasaporte", nombre: "Ana Torres", padron: false }).sql, "22023|cuenta_datos_invalidos|dni"],
      ["un tipo que la ficha no conoce (RUC)", registrar({ dni: DNI.otro, tipo: "ruc", nombre: "Ana Torres", padron: false }).sql, "22023|cuenta_datos_invalidos|dni"],
      ["con pasaporte y sin nombre", registrar({ dni: "ZZ0999006", tipo: "pasaporte", nombre: null, padron: false }).sql, "22023|cuenta_datos_invalidos|nombre"],
    ];
    for (const [nombre, sql, esperado] of casosDoc) {
      esperarValor(`rechaza ${nombre}, y no escribe nada`, correr(`${CON_PASAPORTE}
        select pg_temp.intento($q$${sql}$q$) || '#' || (select count(*) from retail.cuentas_web);
        rollback;`), `${esperado}#0`);
    }
  }

  console.log("— Como tienda_web —");
  const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
  const correoTienda = correoNuevo("tienda");
  const usuarioTienda = randomUUID();
  esperarValor(
    "como tienda_web, todo el camino: consulta, revisa, reserva el código, anota el invitado, prueba el código, crea la cuenta (con los avisos) y la lee",
    correr(`${PREPARAR}${COMO_TIENDA}
      select (retail.tienda_consultar_correo('${correoTienda}', '${huella()}') ->> 'estado') || '|' ||
             (retail.tienda_consultar_documento('${DNI.nuevo}', '${huella()}', 'zz-d') ->> 'estado') || '|' ||
             (${revisar(correoTienda, DNI.nuevo, "987654321", huella(), "zz-d")} ->> 'estado');
      select (${reservar(correoTienda)} ->> 'estado');
      select retail.tienda_anotar_invitado('${correoTienda}', '${usuarioTienda}')::text;
      select (${intento(correoTienda)} ->> 'estado');
      select (retail.tienda_casilla_whatsapp() ->> 'version') as casilla \\gset
      select retail.tienda_registrar_cuenta('${usuarioTienda}', '${correoTienda}', '${DNI.nuevo}', 'Lucía Pérez', true, '987654321', 14, 10, null,
             true, true, true, :'casilla'::int, '${TEXTOS}') ->> 'avisos_whatsapp';
      select retail.tienda_mi_cuenta('${usuarioTienda}') ->> 'correo';
      rollback;`),
    `libre|libre|ok\nenviar\ntrue\npuede\nactivados\n${correoTienda}`,
  );
  for (const tabla of ["cuentas_web", "cuentas_web_pendientes", "club_intentos_registro", "clientas", "club_permisos"]) {
    const r = correr(`${PREPARAR}${COMO_TIENDA}select count(*) from retail.${tabla};\nrollback;`);
    esperar(`como tienda_web, leer retail.${tabla} se niega`, !r.ok && /permission denied/.test(r.mensaje), r.ok ? `leyó: ${r.salida}` : r.mensaje);
  }
  const ayudante = correr(`${PREPARAR}${COMO_TIENDA}select retail.fn_cuenta_web_correo('a@b.co');\nrollback;`);
  esperar("como tienda_web, el ayudante del correo se niega", !ayudante.ok && /permission denied/.test(ayudante.mensaje), ayudante.ok ? `respondió: ${ayudante.salida}` : ayudante.mensaje);

  console.log("— Las migraciones —");
  const sql = MIGRACIONES.map((m) => readFileSync(m, "utf8")).join("\n");
  esperarValor(
    "las dos partes se pueden volver a correr (dos veces seguidas, como un segundo pegado)",
    correr(`begin;\n${sql}\n${sql}\nselect (retail.tienda_club_beneficios() ? 'pct')::text || '|' || (retail.tienda_casilla_whatsapp() ? 'version')::text;\nrollback;`),
    "true|true",
  );

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();

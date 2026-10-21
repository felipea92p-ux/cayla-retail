#!/usr/bin/env node
/**
 * La cuenta simple de la tienda online y el Club al separar (ADR-0438) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261017175000_tienda_cuenta_simple_y_club_al_separar.sql`:
 *   1. Estructura: las cuatro funciones nuevas son security definer, con su search_path, y solo las ejecuta `tienda_web`; el ayudante
 *      `fn_ficha_minima_de_cuenta` no lo ejecuta nadie de la API.
 *   2. `tienda_revisar_registro_simple`: dice invalido / correo_repetido / correo_de_otra_persona / ok, cuenta un intento por ip
 *      (el sexto de la hora se frena).
 *   3. `tienda_registrar_cuenta_simple`: con correo exige el código ya probado de ESE usuario; con Google no. Crea una ficha mínima
 *      (solo el nombre, origen web, sin documento, celular, correo ni Club) y la cuenta, y deja el pendiente limpio y la actividad
 *      sin datos suyos. Rechaza —sin escribir nada— un correo o un usuario repetidos, el correo de otra ficha, sin nombre, sin aceptar
 *      y una vía que no existe. La ficha mínima ya la leen las funciones de la cuenta: `tienda_mi_cuenta`, `tienda_mi_club` (sin Club).
 *   4. `tienda_separar` sin ser del Club: `tienda_sin_club`, sin escribir nada.
 *   5. `tienda_revisar_club`: sin_cuenta / ya_es_del_club / invalido / limite / dni_repetido / archivada / ok.
 *   6. `tienda_unirse_al_club`: con un documento nuevo completa SU ficha mínima y entra al Club; con el de una ficha que ya existía,
 *      la cuenta pasa a ESA (sin pisar lo que tiene), entra al Club ahí y la ficha mínima queda archivada; con el de otra cuenta, o
 *      una ficha archivada, rechaza sin escribir; el cumpleaños es opcional y, si viene, se revisa; los avisos por WhatsApp anotan su
 *      permiso; ser del Club abre «Separar»; y una cuenta con Club NO puede cambiar de ficha (la inmutabilidad sigue).
 *   7. Como `tienda_web` todo el camino funciona, y la migración se puede pegar dos veces.
 *
 * CÓMO. Igual que `tienda_cuentas.mjs`: cada escenario en su transacción con ROLLBACK, con fichas de DNI 0999xxxx.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=1` mete la migración dentro de cada transacción (que se revierte). Sin la variable prueba
 * lo que la base ya tiene (lo que hace el CI).
 *
 * USO
 *   pnpm pruebas:tienda-cuenta-simple    → necesita el stack local
 *   pnpm pruebas:tienda-cuenta-simple -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261017175000_tienda_cuenta_simple_y_club_al_separar.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(MIGRACION, "utf8") : "";

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
const huella = (que = "ip") => `zz-${que}-${CORRIDA}-${++n}`;
const correoNuevo = (que = "c") => `zz.${que}.${CORRIDA}.${++n}@ejemplo.com`;
const DNI = { nuevo: "09991001", caja: "09991002", socia: "09991003", archivada: "09991004", conCuenta: "09991005" };
const TEXTOS = "borrador-2026-10-14";
const CASILLA = "(select max(t.version) from retail.club_textos t where t.tipo = 'casilla_publicidad')";

const PREPARAR = `
begin;
${APLICAR_ANTES}
do $$ begin
  if exists (select 1 from retail.clientas where documento_numero like '0999%') then
    raise exception 'Ambiente sucio: ya hay fichas con DNI 0999xxxx en esta base.';
  end if;
end $$;
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes)
values ('dni', '${DNI.caja}', 'Ana Prueba Caja', '987000111', 3, 4) returning id as caja \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes, cumple_anio,
                             club_desde, codigo_club)
values ('dni', '${DNI.socia}', 'Bea Socia Antigua', '987000222', 9, 9, 1990, now() - interval '400 days',
        retail.fn_club_codigo_nuevo()) returning id as socia, codigo_club as codigo_socia \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, archivada_en, motivo_archivo)
values ('dni', '${DNI.archivada}', 'Ceci Archivada', now(), 'prueba de la tienda') returning id as archivada \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club)
values ('dni', '${DNI.conCuenta}', 'Eva Con Cuenta', '987000333', now(), retail.fn_club_codigo_nuevo()) returning id as con_cuenta \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados)
values (gen_random_uuid(), :'con_cuenta', 'zz.evacuenta.${CORRIDA}@ejemplo.com', '${TEXTOS}') returning usuario_web_id as u_eva \\gset
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_detalle text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_detalle = pg_exception_detail;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || coalesce(v_detalle, '');
end $f$;
create function pg_temp.con_codigo(p_correo text, p_usuario uuid, p_llamada text, p_intentos integer) returns jsonb language plpgsql as $f$
declare v jsonb;
begin
  insert into retail.cuentas_web_pendientes (correo, usuario_web_id, envios, primer_envio_en, ultimo_envio_en, vence_en, intentos)
  values (retail.fn_cuenta_web_correo(p_correo), p_usuario, 1, now(), now(), now() + interval '30 minutes', p_intentos)
  on conflict (correo) do update set usuario_web_id = excluded.usuario_web_id, intentos = excluded.intentos;
  execute p_llamada into v;
  return v;
end $f$;
`;

const t = (v) => (v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null ? "null" : String(v));

/** Una cuenta simple creada con su código (como la deja el servidor). Deja las variables :u y :ficha_min. */
function cuenta(cambios = {}) {
  const d = { usuario: randomUUID(), correo: correoNuevo(), nombre: "Lucía", acepta: true, textos: TEXTOS, via: "correo", ...cambios };
  const llamada = `select retail.tienda_registrar_cuenta_simple('${d.usuario}'::uuid, ${t(d.correo)}, ${t(d.nombre)}, ${d.acepta}, ${t(d.textos)}, ${t(d.via)})`;
  const expr = d.via === "correo" && !d.sinCodigo ? `pg_temp.con_codigo(${t(d.correo)}, '${d.usuario}'::uuid, $r$${llamada}$r$, 1)` : `(${llamada})`;
  return { d, expr, sql: `select ${expr}` };
}
/** Deja a esa persona con su cuenta simple: variables :u (usuario) y :fm (su ficha mínima). */
const conCuenta = (c) => `select (${c.expr}) as _r \\gset
select '${c.d.usuario}'::uuid as u \\gset
select clienta_id as fm from retail.cuentas_web where usuario_web_id = :'u' \\gset
`;
/** tienda_unirse_al_club con lo de una unión buena, cambiando lo que se pida. */
function unir(cambios = {}) {
  const d = {
    dni: DNI.nuevo,
    tipo: "dni",
    nombre: "Lucía Fernanda Pérez Salas",
    padron: true,
    celular: "+51 987 654 321",
    dia: null,
    mes: null,
    anio: null,
    mayor: true,
    acepta: true,
    avisos: false,
    casilla: "null",
    textos: TEXTOS,
    ...cambios,
  };
  return `retail.tienda_unirse_al_club(:'u'::uuid, ${t(d.dni)}, ${t(d.nombre)}, ${d.padron}, ${t(d.celular)}, ${num(d.dia)}, ${num(d.mes)}, ${num(d.anio)}, ${d.mayor}, ${d.acepta}, ${d.avisos}, ${d.casilla}, ${t(d.textos)}, ${t(d.tipo)})`;
}
const callado = (expr) => `select (${expr}) as _ignorar \\gset`;
const RECUENTO = `(select count(*) from retail.clientas where documento_numero like '0999%' or registro_origen = 'web') || ':' || (select count(*) from retail.cuentas_web) || ':' || (select count(*) from retail.club_permisos where medio = 'tienda_web') || ':' || (select count(*) from retail.clientas where club_desde is not null)`;

function main() {
  if (!correr("select 1;").ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES && correr("select to_regprocedure('retail.tienda_unirse_al_club(uuid,text,text,boolean,text,integer,integer,integer,boolean,boolean,boolean,integer,text,text)') is not null;").salida !== "t") {
    console.error(`Falta la migración: aplica ${MIGRACION} o corre con APLICAR_ANTES=1`);
    process.exit(2);
  }
  const preparado = correr(`${PREPARAR}select 'listo';\nrollback;`);
  if (!preparado.ok || preparado.salida !== "listo") {
    console.error(`No se pudo preparar el escenario: ${preparado.mensaje ?? preparado.salida}`);
    process.exit(2);
  }

  console.log("— Estructura —");
  const FUNCIONES = [
    "tienda_revisar_registro_simple(text,text)",
    "tienda_registrar_cuenta_simple(uuid,text,text,boolean,text,text)",
    "tienda_revisar_club(uuid,text,text,text,text,text)",
    "tienda_unirse_al_club(uuid,text,text,boolean,text,integer,integer,integer,boolean,boolean,boolean,integer,text,text)",
  ];
  esperarValor(
    "las cuatro funciones: security definer, con su search_path, solo para tienda_web",
    correr(`${PREPARAR}
      select string_agg(f || ':' || (p.prosecdef and exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%'))::text || ':' ||
             has_function_privilege('tienda_web', p.oid, 'EXECUTE')::text || ':' ||
             (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
              or has_function_privilege('public', p.oid, 'EXECUTE'))::text, ',' order by f collate "C")
        from unnest(array[${FUNCIONES.map((f) => `'${f}'`).join(", ")}]) f join pg_proc p on p.oid = ('retail.' || f)::regprocedure;
      rollback;`),
    [...FUNCIONES].sort().map((f) => `${f}:true:true:false`).join(","),
  );
  esperarValor(
    "el ayudante de la ficha mínima no lo ejecuta nadie de la API (tampoco tienda_web)",
    correr(`${PREPARAR}
      select (has_function_privilege('tienda_web', 'retail.fn_ficha_minima_de_cuenta(uuid)', 'EXECUTE')
              or has_function_privilege('anon', 'retail.fn_ficha_minima_de_cuenta(uuid)', 'EXECUTE')
              or has_function_privilege('authenticated', 'retail.fn_ficha_minima_de_cuenta(uuid)', 'EXECUTE'))::text;
      rollback;`),
    "false",
  );

  console.log("— Revisar el correo antes de mandar el código —");
  const ip = huella();
  const revisar = (c, i) => `retail.tienda_revisar_registro_simple(${t(c)}, ${t(i)}) ->> 'estado'`;
  esperarValor("un correo mal escrito es inválido y no cuenta un intento", correr(`${PREPARAR}select ${revisar("no-es-correo", ip)};
    select count(*) from retail.club_intentos_registro where ip_hash = '${ip}';\nrollback;`), "invalido\n0");
  esperarValor("un correo libre pasa (ok) y cuenta un intento", correr(`${PREPARAR}select ${revisar(correoNuevo(), ip)};
    select count(*) from retail.club_intentos_registro where ip_hash = '${ip}';\nrollback;`), "ok\n1");
  esperarValor(
    "un correo que ya tiene cuenta es correo_repetido",
    correr(`${PREPARAR}select ${revisar(`zz.evacuenta.${CORRIDA}@ejemplo.com`, huella())};\nrollback;`),
    "correo_repetido",
  );
  esperarValor(
    "el correo de contacto de OTRA ficha es correo_de_otra_persona",
    correr(`${PREPARAR}update retail.clientas set correo = 'zz.contacto.${CORRIDA}@ejemplo.com' where id = :'caja';
      select ${revisar(`zz.contacto.${CORRIDA}@ejemplo.com`, huella())};\nrollback;`),
    "correo_de_otra_persona",
  );
  const ipTope = huella();
  esperarValor(
    "al sexto intento de la misma ip en la hora, se frena (limite)",
    correr(`${PREPARAR}${Array.from({ length: 5 }, () => callado(revisar(correoNuevo(), ipTope))).join("\n")}
      select ${revisar(correoNuevo(), ipTope)};\nrollback;`),
    "limite",
  );

  console.log("— Crear la cuenta simple —");
  const c1 = cuenta({ nombre: "  Lucía   Pérez " });
  esperarValor(
    "con el código confirmado: crea la cuenta y una ficha mínima (solo el nombre; origen web; sin documento, celular, correo ni Club); se lleva el pendiente",
    correr(`${PREPARAR}${conCuenta(c1)}
      select c.nombre || '|' || c.registro_origen || '|' || (c.documento_numero is null)::text || '|' || (c.telefono_whatsapp is null)::text || '|' ||
             (c.correo is null)::text || '|' || (c.club_desde is null)::text || '|' || (c.codigo_club is null)::text || '|' || (c.created_por is null)::text || '|' ||
             retail.fn_ficha_minima_de_cuenta(c.id)::text || '|' ||
             (select count(*) from retail.cuentas_web_pendientes where correo = '${c1.d.correo}')
        from retail.clientas c where c.id = :'fm';
      select (w.correo = '${c1.d.correo}')::text || '|' || w.textos_aceptados from retail.cuentas_web w where w.usuario_web_id = :'u';
      rollback;`),
    `Lucía Pérez|web|true|true|true|true|true|true|true|0\ntrue|${TEXTOS}`,
  );
  const cg = cuenta({ via: "google", nombre: "Gala Google" });
  esperarValor(
    "con Google no hace falta el código: la cuenta nace igual",
    correr(`${PREPARAR}${conCuenta(cg)}
      select (select nombre from retail.clientas where id = :'fm') || '|' || (select count(*) from retail.cuentas_web where usuario_web_id = :'u');
      rollback;`),
    "Gala Google|1",
  );
  esperarValor(
    "la actividad «registro_web», sin persona y sin el nombre ni el correo",
    correr(`${PREPARAR}${conCuenta(c1)}
      select a.modulo || '|' || a.accion || '|' || (a.persona_id is null)::text || '|' || (a.registro_id = :'fm'::text)::text || '|' ||
             (a::text !~* '(lucía|pérez|@ejemplo)')::text || '|' || (a.detalle ->> 'via')
        from retail.actividad a where a.accion = 'registro_web' and a.registro_id = :'fm'::text;
      rollback;`),
    "clientas|registro_web|true|true|true|correo",
  );
  const rechazos = [
    ["con correo y sin el código probado", cuenta({ sinCodigo: true }), "P0001|cuenta_sin_codigo|codigo"],
    ["sin nombre", cuenta({ nombre: "   " }), "22023|cuenta_datos_invalidos|nombre"],
    ["con un nombre larguísimo", cuenta({ nombre: "x".repeat(121) }), "22023|cuenta_datos_invalidos|nombre"],
    ["sin aceptar la privacidad y los términos", cuenta({ acepta: false }), "22023|cuenta_datos_invalidos|acepta"],
    ["con una versión de textos rara", cuenta({ textos: "Hola Mundo" }), "22023|cuenta_datos_invalidos|textos"],
    ["con una vía que no existe", cuenta({ via: "facebook" }), "22023|cuenta_datos_invalidos|via"],
    ["con un correo mal escrito", cuenta({ correo: "no-es-correo", via: "google" }), "22023|cuenta_datos_invalidos|correo"],
  ];
  for (const [nombre, c, esperado] of rechazos) {
    esperarValor(`rechaza ${nombre}, y no escribe nada`, correr(`${PREPARAR}
      select ${RECUENTO} as antes \\gset
      select pg_temp.intento($q$${c.sql}$q$) || '#' || (${RECUENTO} = :'antes')::text;
      rollback;`), `${esperado}#true`);
  }
  const repetido = cuenta({ correo: `zz.evacuenta.${CORRIDA}@ejemplo.com`, via: "google" });
  esperarValor(
    "rechaza un correo que ya tiene cuenta",
    correr(`${PREPARAR}select pg_temp.intento($q$${repetido.sql}$q$);\nrollback;`),
    "P0001|cuenta_correo_repetido|correo",
  );
  esperarValor(
    "rechaza el correo de contacto de otra ficha",
    correr(`${PREPARAR}update retail.clientas set correo = 'zz.contacto.${CORRIDA}@ejemplo.com' where id = :'caja';
      select pg_temp.intento($q$${cuenta({ correo: `zz.contacto.${CORRIDA}@ejemplo.com`, via: "google" }).sql}$q$);\nrollback;`),
    "P0001|cuenta_correo_de_otra_persona|correo",
  );
  esperarValor(
    "rechaza al mismo usuario dos veces",
    correr(`${PREPARAR}${conCuenta(c1)}
      select pg_temp.intento($q$select retail.tienda_registrar_cuenta_simple('${c1.d.usuario}'::uuid, '${correoNuevo()}', 'Otra', true, '${TEXTOS}', 'google')$q$);
      rollback;`),
    "P0001|cuenta_ya_existe|",
  );

  console.log("— Lo que la cuenta simple ya puede leer —");
  esperarValor(
    "tienda_mi_cuenta la devuelve con su nombre y sin Club (club_desde y código vacíos)",
    correr(`${PREPARAR}${conCuenta(c1)}
      select (m ->> 'nombre') || '|' || (m ->> 'nombre_corto') || '|' || coalesce(m ->> 'club_desde', '-') || '|' || coalesce(m ->> 'codigo_club', '-') || '|' || (m ->> 'activa')
        from (select retail.tienda_mi_cuenta(:'u') as m) x;
      rollback;`),
    "Lucía Pérez|Lucía|-|-|true",
  );
  esperarValor(
    "tienda_mi_club dice «sin Club» para ella, y los avisos del Club y los favoritos no se caen",
    correr(`${PREPARAR}${conCuenta(c1)}
      select retail.tienda_mi_club(:'u') -> 'club' -> 'cumple' ->> 'estado';
      select (retail.tienda_mis_avisos_del_club(:'u') is not null)::text || '|' || (retail.tienda_mis_favoritos_y_esperas(:'u') is not null)::text;
      rollback;`),
    "sin_club\ntrue|true",
  );

  console.log("— «Separar» es del Club —");
  const SEPARAR = `retail.tienda_separar(:'u'::uuid, gen_random_uuid(), '[]'::jsonb, gen_random_uuid())`;
  esperarValor(
    "sin ser del Club, no se separa (tienda_sin_club) y no queda nada escrito",
    correr(`${PREPARAR}${conCuenta(c1)}
      select pg_temp.intento($q$select ${SEPARAR.replace(/:'u'/, `'${c1.d.usuario}'`)}$q$) || '#' || (select count(*) from retail.pedidos_web);
      rollback;`),
    "22023|tienda_sin_club|#0",
  );

  console.log("— Antes de unirse al Club —");
  const revisarClub = (doc, cel, i, hdoc = "zz-d", tipo = "dni") =>
    `retail.tienda_revisar_club(:'u'::uuid, ${t(doc)}, ${t(cel)}, ${t(i)}, ${t(hdoc)}, ${t(tipo)}) ->> 'estado'`;
  esperarValor("un usuario sin cuenta: sin_cuenta", correr(`${PREPARAR}select retail.tienda_revisar_club(gen_random_uuid(), '${DNI.nuevo}', '987654321', '${huella()}', 'zz-d', 'dni') ->> 'estado';\nrollback;`), "sin_cuenta");
  esperarValor("quien ya es del Club: ya_es_del_club", correr(`${PREPARAR}select retail.tienda_revisar_club(:'u_eva'::uuid, '${DNI.nuevo}', '987654321', '${huella()}', 'zz-d', 'dni') ->> 'estado';\nrollback;`), "ya_es_del_club");
  const casosClub = [
    ["un DNI de 7 dígitos: invalido", revisarClub("1234567", "987654321", huella()), "invalido"],
    ["un celular que no es: invalido", revisarClub(DNI.nuevo, "12345", huella()), "invalido"],
    ["un documento libre y un celular bueno: ok", revisarClub(DNI.nuevo, "+51 987 654 321", huella()), "ok"],
    ["el documento de una ficha de la caja sin cuenta: ok", revisarClub(DNI.caja, "987654321", huella()), "ok"],
    ["el documento de una ficha archivada: archivada", revisarClub(DNI.archivada, "987654321", huella()), "archivada"],
    ["el documento de OTRA cuenta: dni_repetido", revisarClub(DNI.conCuenta, "987654321", huella()), "dni_repetido"],
  ];
  for (const [nombre, expr, esperado] of casosClub) {
    esperarValor(nombre, correr(`${PREPARAR}${conCuenta(c1)}select ${expr};\nrollback;`), esperado);
  }
  const ipClub = huella();
  esperarValor(
    "al sexto intento de la misma ip en la hora: limite",
    correr(`${PREPARAR}${conCuenta(c1)}${Array.from({ length: 5 }, (_, i) => callado(revisarClub(DNI.nuevo, `98765432${i}`, ipClub, `zz-d${i}`))).join("\n")}
      select ${revisarClub(DNI.nuevo, "987654329", ipClub, "zz-d9")};\nrollback;`),
    "limite",
  );

  console.log("— Unirse al Club —");
  esperarValor(
    "con un documento nuevo: completa SU ficha mínima (documento, nombre, celular sin +51, sin cumpleaños) y entra al Club; la cuenta sigue en la misma ficha",
    correr(`${PREPARAR}${conCuenta(c1)}
      select (${unir()}) as r \\gset
      select (:'r'::jsonb ->> 'estado') || '|' || (:'r'::jsonb ->> 'se_unio_a_su_ficha') || '|' || (:'r'::jsonb ->> 'era_del_club') || '|' || (:'r'::jsonb ->> 'nombre_corto');
      select c.documento_numero || '|' || c.nombre || '|' || c.telefono_whatsapp || '|' || coalesce(c.cumple_dia::text, '-') || '|' || (c.club_desde = now())::text || '|' ||
             (c.codigo_club = :'r'::jsonb ->> 'codigo_club')::text || '|' || (c.codigo_club ~ '^C-[0-9]{4,}$')::text || '|' || c.registro_origen || '|' || (c.archivada_en is null)::text || '|' ||
             (w.clienta_id = :'fm')::text
        from retail.clientas c join retail.cuentas_web w on w.usuario_web_id = :'u' where c.id = :'fm';
      rollback;`),
    "ok|false|false|Lucía\n09991001|Lucía Fernanda Pérez Salas|987654321|-|true|true|true|web|true|true",
  );
  esperarValor(
    "hacerlo otra vez no hace nada: ya_era, con el mismo código",
    correr(`${PREPARAR}${conCuenta(c1)}
      select (${unir()}) as r \\gset
      select (${unir()}) as r2 \\gset
      select (:'r2'::jsonb ->> 'estado') || '|' || (:'r2'::jsonb ->> 'codigo_club' = :'r'::jsonb ->> 'codigo_club')::text;
      rollback;`),
    "ya_era|true",
  );
  esperarValor(
    "con cumpleaños y año (mayor de 18): lo guarda",
    correr(`${PREPARAR}${conCuenta(c1)}${callado(unir({ dia: 29, mes: 2, anio: 2000 }))}
      select c.cumple_dia || '/' || c.cumple_mes || '/' || c.cumple_anio from retail.clientas c where c.id = :'fm';
      rollback;`),
    "29/2/2000",
  );
  esperarValor(
    "con día y mes sin año (el 29 de febrero vale)",
    correr(`${PREPARAR}${conCuenta(c1)}${callado(unir({ dia: 29, mes: 2 }))}
      select c.cumple_dia || '/' || c.cumple_mes || '/' || coalesce(c.cumple_anio::text, '-') from retail.clientas c where c.id = :'fm';
      rollback;`),
    "29/2/-",
  );
  const unionRechazos = [
    ["un cumpleaños imposible (31 de abril)", unir({ dia: 31, mes: 4 }), "22023|cuenta_datos_invalidos|cumple"],
    ["solo el día del cumpleaños", unir({ dia: 5 }), "22023|cuenta_datos_invalidos|cumple"],
    ["un año sin día ni mes", unir({ anio: 1990 }), "22023|cuenta_datos_invalidos|cumple"],
    ["una menor de 18 (con año)", unir({ dia: 1, mes: 1, anio: new Date().getFullYear() - 10 }), "P0001|cuenta_menor|cumple"],
    ["sin «Soy mayor de 18 años»", unir({ mayor: false }), "22023|cuenta_datos_invalidos|mayor"],
    ["sin aceptar los términos", unir({ acepta: false }), "22023|cuenta_datos_invalidos|acepta"],
    ["un celular que no es", unir({ celular: "12345" }), "22023|cuenta_datos_invalidos|celular"],
    ["un DNI de 7 dígitos", unir({ dni: "1234567" }), "22023|cuenta_datos_invalidos|dni"],
    ["con carné y «el nombre es del padrón»", unir({ dni: "ZZ0999005", tipo: "carne_extranjeria", padron: true }), "22023|cuenta_datos_invalidos|nombre"],
    ["con pasaporte y sin nombre", unir({ dni: "ZZ0999006", tipo: "pasaporte", nombre: null, padron: false }), "22023|cuenta_datos_invalidos|nombre"],
    ["una ficha archivada", unir({ dni: DNI.archivada }), "P0001|cuenta_archivada|dni"],
    ["el documento de OTRA cuenta", unir({ dni: DNI.conCuenta }), "P0001|cuenta_dni_repetido|dni"],
    ["los avisos con un texto de casilla que ya no es", unir({ avisos: true, casilla: "-1" }), "P0001|cuenta_texto_cambio|avisos"],
  ];
  for (const [nombre, llamada, esperado] of unionRechazos) {
    esperarValor(`rechaza ${nombre}, y no escribe nada`, correr(`${PREPARAR}${conCuenta(c1)}
      select ${RECUENTO} as antes \\gset
      select pg_temp.intento($q$select ${llamada.replace(":'u'", `'${c1.d.usuario}'`)}$q$) || '#' || (${RECUENTO} = :'antes')::text;
      select (club_desde is null)::text || '|' || (documento_numero is null)::text from retail.clientas where id = :'fm';
      rollback;`), `${esperado}#true\ntrue|true`);
  }
  esperarValor(
    "con el documento de una ficha de la caja: la cuenta pasa a ESA (el nombre del padrón reemplaza; su celular y su cumpleaños NO se pisan), entra al Club ahí, le anota el correo, y la ficha mínima queda archivada con su motivo",
    correr(`${PREPARAR}${conCuenta(c1)}
      select (${unir({ dni: DNI.caja, nombre: "Ana María Prueba Caja", celular: "912345678", dia: 20, mes: 1 })}) as r \\gset
      select (:'r'::jsonb ->> 'estado') || '|' || (:'r'::jsonb ->> 'se_unio_a_su_ficha') || '|' || (:'r'::jsonb ->> 'era_del_club') || '|' || (:'r'::jsonb ->> 'nombre_corto');
      select (w.clienta_id = :'caja')::text || '|' || c.nombre || '|' || c.telefono_whatsapp || '|' || c.cumple_dia || '/' || c.cumple_mes || '|' ||
             (c.correo = '${c1.d.correo}')::text || '|' || (c.club_desde = now())::text || '|' || (c.codigo_club = :'r'::jsonb ->> 'codigo_club')::text || '|' || c.registro_origen
        from retail.cuentas_web w join retail.clientas c on c.id = w.clienta_id where w.usuario_web_id = :'u';
      select (archivada_en is not null)::text || '|' || (club_desde is null)::text || '|' || (documento_numero is null)::text || '|' || (motivo_archivo like 'Ficha mínima%')::text
        from retail.clientas where id = :'fm';
      rollback;`),
    "ok|true|false|Ana\ntrue|Ana María Prueba Caja|987000111|3/4|true|true|true|caja\ntrue|true|true|true",
  );
  esperarValor(
    "con el documento de una socia que ya era del Club (sin cuenta): conserva su código y su fecha (era_del_club)",
    correr(`${PREPARAR}${conCuenta(c1)}
      select (${unir({ dni: DNI.socia, padron: false, nombre: "Otro Nombre" })}) as r \\gset
      select (:'r'::jsonb ->> 'era_del_club') || '|' || (:'r'::jsonb ->> 'codigo_club' = :'codigo_socia')::text;
      select c.nombre || '|' || (c.club_desde < now() - interval '399 days')::text from retail.clientas c where c.id = :'socia';
      rollback;`),
    "true|true\nBea Socia Antigua|true",
  );
  esperarValor(
    "con los avisos por WhatsApp: anota el permiso de publicidad (medio tienda_web) y la fecha",
    correr(`${PREPARAR}${conCuenta(c1)}
      select (${unir({ avisos: true, casilla: CASILLA })}) ->> 'avisos_whatsapp';
      select (select count(*) from retail.club_permisos where clienta_id = :'fm' and medio = 'tienda_web' and finalidad = 'publicidad_whatsapp') || '|' ||
             (select (publicidad_desde = now())::text from retail.clientas where id = :'fm');
      rollback;`),
    "activados\n1|true",
  );
  esperarValor(
    "la actividad de unirse al Club, sin persona y sin el documento, el nombre ni el celular",
    correr(`${PREPARAR}${conCuenta(c1)}${callado(unir())}
      select count(*) || '|' || bool_and(a.persona_id is null)::text || '|' || bool_and(a::text !~* '(${DNI.nuevo}|fernanda|987654321|@ejemplo)')::text
        from retail.actividad a where a.accion = 'registro_web' and a.registro_id = :'fm'::text;
      rollback;`),
    "2|true|true",
  );
  esperarValor(
    "ser del Club abre «Separar»: ya no responde tienda_sin_club (responde lo de la tienda de recojo)",
    correr(`${PREPARAR}${conCuenta(c1)}${callado(unir())}
      select pg_temp.intento($q$select retail.tienda_separar('${c1.d.usuario}'::uuid, gen_random_uuid(), '[]'::jsonb, gen_random_uuid())$q$);
      rollback;`),
    "22023|tienda_separar_tienda|",
  );

  console.log("— La ficha de una cuenta sigue siendo inmutable —");
  esperarValor(
    "una cuenta con Club no puede cambiar de ficha (cuenta_web_inmutable)",
    correr(`${PREPARAR}
      select pg_temp.intento(format($q$update retail.cuentas_web set clienta_id = %L where usuario_web_id = %L$q$, :'caja', :'u_eva'));
      rollback;`),
    "23514|cuenta_web_inmutable|",
  );

  console.log("— Como tienda_web —");
  const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
  const correoTienda = correoNuevo("tienda");
  const usuarioTienda = randomUUID();
  esperarValor(
    "como tienda_web, todo el camino: revisa, crea la cuenta (con su código), revisa el documento, se une al Club con pasaporte y separa deja de negarse",
    correr(`${PREPARAR}
      select retail.tienda_reservar_envio('${correoTienda}', false) ->> 'estado' as _x \\gset
      select pg_temp.con_codigo('${correoTienda}', '${usuarioTienda}'::uuid, $r$select 1$r$, 1) as _y \\gset
      ${COMO_TIENDA}
      select (retail.tienda_revisar_registro_simple('${correoNuevo("r")}', '${huella()}') ->> 'estado');
      select retail.tienda_registrar_cuenta_simple('${usuarioTienda}', '${correoTienda}', 'Paola', true, '${TEXTOS}', 'correo') ->> 'nombre_corto';
      select retail.tienda_mi_cuenta('${usuarioTienda}') ->> 'nombre';
      select retail.tienda_revisar_club('${usuarioTienda}', 'ZZ0999001', '987654321', '${huella()}', 'zz-d', 'pasaporte') ->> 'estado';
      select retail.tienda_unirse_al_club('${usuarioTienda}', 'ZZ0999001', 'Paola Pasaporte', false, '987654321', null, null, null, true, true, false, null, '${TEXTOS}', 'pasaporte') ->> 'estado';
      select retail.tienda_mi_cuenta('${usuarioTienda}') ->> 'nombre';
      rollback;`),
    "ok\nPaola\nPaola\nok\nok\nPaola Pasaporte",
  );
  for (const [nombre, llamada] of [
    ["clientas", "select count(*) from retail.clientas"],
    ["cuentas_web", "select count(*) from retail.cuentas_web"],
    ["fn_ficha_minima_de_cuenta", "select retail.fn_ficha_minima_de_cuenta(gen_random_uuid())"],
  ]) {
    const r = correr(`${PREPARAR}${COMO_TIENDA}${llamada};\nrollback;`);
    esperar(`como tienda_web, ${nombre} se niega`, !r.ok && /permission denied/.test(r.mensaje), r.ok ? `respondió: ${r.salida}` : r.mensaje);
  }

  console.log("— La migración —");
  // Una migración de main no se edita: la guarda de esta (el md5 de `tienda_separar`) no conoce el cuerpo que le dejó
  // 20261019223000 (ADR-0458, «solo lo de la tienda») ni el de 20261021002000 (ADR-0465, la empresa de la prenda opera en la tienda de recojo).
  // Para probar el segundo pegado se le suman esos md5 en memoria, sin tocar el archivo.
  const sql = readFileSync(MIGRACION, "utf8").replace(
    "'f20e2fd55c98e519c90be7f7aa333c37')",
    "'f20e2fd55c98e519c90be7f7aa333c37', '03cd966d59530bb53817f22523728553', 'd9e56a507ec2b7f8ca945479b64a8a0b')",
  );
  esperarValor(
    "se puede volver a correr (dos veces seguidas, como un segundo pegado)",
    correr(`begin;\n${sql}\n${sql}\nselect 'ok';\nrollback;`),
    "ok",
  );

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();

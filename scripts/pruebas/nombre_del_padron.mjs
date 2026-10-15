#!/usr/bin/env node
/**
 * El nombre de la ficha sale del padrón — CAYLA V2 (`20261015133000_nombre_de_la_ficha_del_padron.sql`).
 *
 * EL PROBLEMA. Felipe (2026-10-15): «El nombre no se debe poder escribir ni editar: siempre debe ser el que trae la API. Sin la API
 * no se registra; con el carné y el pasaporte sí se pide escribir los nombres tal cual en su documento». La pantalla ya no deja
 * escribirlo, pero `registrar_clienta` y `editar_clienta` las llama el navegador: la regla tiene que vivir en la base. Un servidor
 * anota cada lectura del padrón (`fn_anotar_lectura_padron`, solo con la llave de servicio; la tienda, `tienda_anotar_lectura_padron`)
 * y el disparador de `clientas` solo acepta para un DNI un nombre que salió de una lectura de la última hora.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK)
 *   A. Estructura: `padron_lecturas` con RLS, sin políticas y sin permisos para nadie; `fn_anotar_lectura_padron` solo para
 *      service_role y `tienda_anotar_lectura_padron` solo para tienda_web (security definer, con su search_path); los ayudantes y el
 *      disparador, sin EXECUTE para la API; los dos disparadores enganchados a `clientas` con su condición.
 *   B. Las lecturas: se validan (DNI de 8, RUC de 11, un nombre); la misma lectura dos veces es una fila (refresca la hora); al anotar
 *      se borran las vencidas; la tabla solo guarda la huella, nunca el DNI ni el nombre.
 *   C. Por la API (Felipe, con la sesión de la web: `authenticator` → `authenticated`): un DNI con un nombre inventado no se registra
 *      (`nombre_sin_padron`) y no queda ficha; con la lectura anotada sí (con espacios y mayúsculas distintas, también); una lectura
 *      vencida o de otro DNI no sirve; completar una ficha sin tocar su nombre, sí; «Editar» con el mismo nombre (aunque sea uno escrito
 *      a mano de antes) sí, con otro inventado no y con el del padrón sí; cambiar el DNI exige la lectura del DNI nuevo; con carné o
 *      pasaporte el nombre se escribe, sin números (`nombre_con_numeros`); pasar de DNI a pasaporte con su nombre, sí; anonimizar, sí.
 *   D. El cartel del Club (el servidor del ERP por la API, `service_role`): con DNI y sin lectura no se une; con la lectura, sí; con
 *      pasaporte y un nombre con números, no.
 *   E. La tienda online (un usuario que hereda `tienda_web`, como el de producción): sin lectura no se crea la cuenta (tampoco con un
 *      nombre «escrito a mano»); con la lectura anotada por `tienda_anotar_lectura_padron`, sí.
 *   F. El dueño de la base (pruebas, SQL Editor, migraciones) sigue escribiendo como antes.
 *   G. El pegado: la migración dos veces seguidas, y todo sigue igual.
 *
 * CÓMO. Corre como `supabase_admin` para poder ponerse, dentro de la transacción, en la sesión que usa la API
 * (`set local session authorization authenticator`) o la tienda (un usuario de prueba que hereda `tienda_web`). Fichas con documento
 * 0995xxxx o PA0995xxx; nada queda en la base.
 *
 * USO
 *   pnpm pruebas:nombre-del-padron       → necesita el stack local (`npx supabase start`) con la migración aplicada
 *   node scripts/pruebas/nombre_del_padron.mjs --contenedor supabase_db_<mi-pila>   → contra una pila propia
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261015133000_nombre_de_la_ficha_del_padron.sql";
const SQL = readFileSync(MIGRACION, "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const CORRIDA = Date.now().toString(36);

// supabase_admin: el único que puede cambiar la sesión (`set session authorization`) dentro de la transacción.
const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
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

// Cada escenario parte con dos fichas escritas por el dueño de la base (como las de antes de la regla): Ana, con DNI y un nombre
// escrito a mano, y Paola, con pasaporte.
const PREPARAR = `
begin;
set local search_path = retail, public, extensions;
do $$ begin
  if exists (select 1 from retail.clientas where documento_numero like '0995%' or documento_numero like 'PA0995%') then
    raise exception 'Ambiente sucio: ya hay fichas con documento 0995xxxx o PA0995xxx en esta base.';
  end if;
end $$;
update retail.configuracion_empresa set exige_responsable = false;
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp)
values ('dni', '09950001', 'Ana Escrita A Mano', '987950001') returning id as ana, version as ana_v \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre)
values ('pasaporte', 'PA0995001', 'Paola Pasaporte') returning id as pao, version as pao_v \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select jsonb_build_object(
  'terminos', (select max(version) from retail.club_textos where tipo = 'terminos'),
  'privacidad', (select max(version) from retail.club_textos where tipo = 'privacidad'),
  'casilla_publicidad', (select max(version) from retail.club_textos where tipo = 'casilla_publicidad')) as versiones \\gset
create role zz_tienda_${CORRIDA} login in role tienda_web;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_detalle text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_detalle = pg_exception_detail;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || coalesce(v_detalle, '');
end $f$;
grant execute on function pg_temp.intento(text) to public;
`;
const caso = (sql) => correr(`${PREPARAR}${sql}\nrollback;`);

/** La web del ERP: entra por la API (`authenticator`) con la sesión de Felipe. */
const COMO_WEB = `reset role;
set local session authorization authenticator;
set local role authenticated;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
`;
/** El servidor del ERP: por la API con la llave de servicio (sin sesión). */
const COMO_SERVIDOR = `reset role;
set local session authorization authenticator;
set local role service_role;
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claims = '{"role":"service_role"}';
`;
/** La tienda online: su propio usuario, que hereda `tienda_web`. */
const COMO_TIENDA = `reset role;
set local session authorization zz_tienda_${CORRIDA};
set local role tienda_web;
`;
/** El dueño de la base (pruebas, SQL Editor, migraciones). */
const COMO_DUENO = "reset role;\nreset session authorization;\n";

/** El servidor anota que el padrón le dio ese nombre a ese DNI (y vuelve a la web). */
const anotar = (dni, nombre) => `${COMO_SERVIDOR}select retail.fn_anotar_lectura_padron('dni', '${dni}', '${nombre}') as _a \\gset\n`;
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);\n`;
/** Solo el código, el hint y el detail («P0001|nombre_sin_padron|nombre»), o «ok». */
const corto = (sql) => `select case when r = 'ok' then 'ok' else r end from pg_temp.intento($q$${sql}$q$) r;\n`;

function main() {
  if (!correr("select 1;").ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (correr("select to_regprocedure('retail.fn_anotar_lectura_padron(text,text,text)') is not null;").salida !== "t") {
    console.error(`Falta la migración: aplica ${MIGRACION}`);
    process.exit(2);
  }

  console.log("— A. Estructura —");
  esperarValor(
    "padron_lecturas: RLS encendido, sin políticas, y sin permisos para public, anon, authenticated, service_role ni tienda_web; solo la huella y la hora",
    caso(`select c.relrowsecurity || '|' || (select count(*) from pg_policy p where p.polrelid = c.oid) || '|' ||
                 (select bool_or(has_table_privilege(r, c.oid, 'SELECT, INSERT, UPDATE, DELETE'))
                    from unnest(array['public', 'anon', 'authenticated', 'service_role', 'tienda_web']) r) || '|' ||
                 (select string_agg(a.attname, ',' order by a.attnum) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)
            from pg_class c where c.oid = 'retail.padron_lecturas'::regclass;`),
    "true|0|false|huella,leida_en",
  );
  esperarValor(
    "fn_anotar_lectura_padron solo para service_role y tienda_anotar_lectura_padron solo para tienda_web (security definer, con su search_path)",
    caso(`select string_agg(f || ':' || (p.prosecdef and exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%')) || ':' ||
                 (select string_agg(r, ',' order by r) from unnest(array['public', 'anon', 'authenticated', 'service_role', 'tienda_web']) r
                   where has_function_privilege(r, p.oid, 'EXECUTE')), ' · ' order by f)
            from unnest(array['fn_anotar_lectura_padron(text,text,text)', 'tienda_anotar_lectura_padron(text,text)']) f
            join pg_proc p on p.oid = ('retail.' || f)::regprocedure;`),
    "fn_anotar_lectura_padron(text,text,text):true:service_role · tienda_anotar_lectura_padron(text,text):true:tienda_web",
  );
  esperarValor(
    "la huella, la vigencia y el disparador no los ejecuta nadie por la API",
    caso(`select bool_or(has_function_privilege(r, ('retail.' || f)::regprocedure, 'EXECUTE'))
            from unnest(array['fn_huella_padron(text,text,text)', 'fn_padron_lectura_vigencia()', 'fn_nombre_de_ficha_del_padron()']) f,
                 unnest(array['public', 'anon', 'authenticated', 'tienda_web']) r;`),
    "f",
  );
  esperarValor(
    "los dos disparadores de clientas: al crear (con nombre y documento) y al cambiar el nombre o el documento",
    caso(`select string_agg(tgname || ':' || (pg_get_triggerdef(t.oid) like '%BEFORE INSERT ON retail.clientas%') || ':' ||
                 (pg_get_triggerdef(t.oid) like '%BEFORE UPDATE OF nombre, documento_tipo, documento_numero ON retail.clientas%') || ':' ||
                 (pg_get_triggerdef(t.oid) like '%fn_nombre_de_ficha_del_padron()%'), ' · ' order by tgname)
            from pg_trigger t where t.tgrelid = 'retail.clientas'::regclass and tgname like 'clientas_nombre_del_padron%';`),
    "clientas_nombre_del_padron_alta:true:false:true · clientas_nombre_del_padron_cambio:false:true:true",
  );

  console.log("— B. Las lecturas —");
  esperarValor(
    "anotar valida el documento (DNI de 8, RUC de 11) y el nombre (no vacío, hasta 200)",
    caso(`${COMO_SERVIDOR}${intento("select retail.fn_anotar_lectura_padron('pasaporte', 'PA0995001', 'Paola')")}${intento(
      "select retail.fn_anotar_lectura_padron('dni', '0995000', 'Ana')",
    )}${intento("select retail.fn_anotar_lectura_padron('ruc', '2060123456', 'Empresa')")}${intento(
      "select retail.fn_anotar_lectura_padron('dni', '09950001', '   ')",
    )}${intento(`select retail.fn_anotar_lectura_padron('dni', '09950001', repeat('A', 201))`)}${intento(
      "select retail.fn_anotar_lectura_padron('ruc', '20601234567', 'EMPRESA PRUEBA SAC')",
    )}`),
    "22023|padron_documento_invalido|documento\n22023|padron_documento_invalido|documento\n22023|padron_documento_invalido|documento\n22023|padron_nombre_invalido|nombre\n22023|padron_nombre_invalido|nombre\nok",
  );
  esperarValor(
    "la misma lectura dos veces es una sola fila (con la hora de la última); una vencida se borra al anotar otra; nunca se guarda el DNI ni el nombre",
    caso(`${COMO_DUENO}insert into retail.padron_lecturas (huella, leida_en) values (retail.fn_huella_padron('dni', '09950099', 'VIEJA LECTURA'), now() - interval '2 hours');
          insert into retail.padron_lecturas (huella, leida_en) values (retail.fn_huella_padron('dni', '09950001', 'PRUEBA SIMULADA ANA'), now() - interval '10 minutes');
          ${anotar("09950001", "Prueba  simulada ANA")}${COMO_DUENO}
          select count(*) || '|' || bool_and(leida_en = now()) || '|' || bool_or(huella like '%09950001%') from retail.padron_lecturas
           where huella in (retail.fn_huella_padron('dni', '09950001', 'PRUEBA SIMULADA ANA'), retail.fn_huella_padron('dni', '09950099', 'VIEJA LECTURA'));`),
    "1|true|false",
  );

  console.log("— C. Por la web del ERP (la API, con la sesión de quien atiende) —");
  esperarValor(
    "un DNI con un nombre inventado no se registra (nombre_sin_padron) y no queda ficha",
    caso(`${COMO_WEB}${corto("select retail.registrar_clienta('dni', '09950002', 'NOMBRE INVENTADO', null, null, null, null)")}
          ${COMO_DUENO}select count(*) from retail.clientas where documento_numero = '09950002';`),
    "P0001|nombre_sin_padron|nombre\n0",
  );
  esperarValor(
    "con la lectura anotada por el servidor se registra, con ese nombre (aunque la lectura tenga otros espacios y mayúsculas)",
    caso(`${anotar("09950002", "Prueba   simulada LUCIA")}${COMO_WEB}
          select retail.registrar_clienta('dni', '09950002', 'PRUEBA SIMULADA LUCIA', null, null, null, null) as nueva \\gset
          ${COMO_DUENO}select nombre from retail.clientas where id = :'nueva';`),
    "PRUEBA SIMULADA LUCIA",
  );
  esperarValor(
    "una lectura de hace más de una hora no sirve, ni la de otro DNI",
    caso(`${COMO_DUENO}insert into retail.padron_lecturas (huella, leida_en) values (retail.fn_huella_padron('dni', '09950003', 'PRUEBA VENCIDA'), now() - interval '61 minutes');
          ${anotar("09950004", "PRUEBA OTRO DNI")}${COMO_WEB}
          ${corto("select retail.registrar_clienta('dni', '09950003', 'PRUEBA VENCIDA', null, null, null, null)")}
          ${corto("select retail.registrar_clienta('dni', '09950005', 'PRUEBA OTRO DNI', null, null, null, null)")}`),
    "P0001|nombre_sin_padron|nombre\nP0001|nombre_sin_padron|nombre",
  );
  esperarValor(
    "completar la ficha de antes sin tocar su nombre (solo el celular) sí: conserva el nombre escrito a mano",
    caso(`${COMO_WEB}select retail.registrar_clienta('dni', '09950001', null, '987950011', null, null, null) = :'ana';
          ${COMO_DUENO}select nombre || '|' || telefono_whatsapp from retail.clientas where id = :'ana';`),
    "t\nAna Escrita A Mano|987950011",
  );
  esperarValor(
    "registrar otra vez su DNI con el nombre del padrón lo reemplaza (la lectura manda sobre lo escrito a mano)",
    caso(`${anotar("09950001", "PRUEBA SIMULADA ANA")}${COMO_WEB}select retail.registrar_clienta('dni', '09950001', 'PRUEBA SIMULADA ANA', null, null, null, null) = :'ana';
          ${COMO_DUENO}select nombre from retail.clientas where id = :'ana';`),
    "t\nPRUEBA SIMULADA ANA",
  );
  esperarValor(
    "«Editar» con el mismo nombre (escrito a mano antes de la regla) sí; con otro inventado no; con el del padrón, sí",
    caso(`${COMO_WEB}
          select retail.editar_clienta(:'ana', 'dni', '09950001', 'Ana Escrita A Mano', '987950012', null, null, null, null, :'ana_v', null) as v1 \\gset
          select pg_temp.intento(format($q$select retail.editar_clienta(%L, 'dni', '09950001', 'Ana Inventada', '987950012', null, null, null, null, null, null)$q$, :'ana'));
          ${anotar("09950001", "PRUEBA SIMULADA ANA")}${COMO_WEB}
          select retail.editar_clienta(:'ana', 'dni', '09950001', 'PRUEBA SIMULADA ANA', '987950012', null, null, null, null, :'v1', null) > :'v1';
          ${COMO_DUENO}select nombre || '|' || telefono_whatsapp from retail.clientas where id = :'ana';`),
    "P0001|nombre_sin_padron|nombre\nt\nPRUEBA SIMULADA ANA|987950012",
  );
  esperarValor(
    "cambiar el DNI con el mismo nombre no pasa (es otra persona: hay que volver a leer el padrón); con la lectura del DNI nuevo, sí",
    caso(`${COMO_WEB}
          select pg_temp.intento(format($q$select retail.editar_clienta(%L, 'dni', '09950009', 'Ana Escrita A Mano', '987950001', null, null, null, null, null, null)$q$, :'ana'));
          ${anotar("09950009", "PRUEBA SIMULADA NUEVE")}${COMO_WEB}
          select retail.editar_clienta(:'ana', 'dni', '09950009', 'PRUEBA SIMULADA NUEVE', '987950001', null, null, null, null, null, null) > 0;
          ${COMO_DUENO}select documento_numero || '|' || nombre from retail.clientas where id = :'ana';`),
    "P0001|nombre_sin_padron|nombre\nt\n09950009|PRUEBA SIMULADA NUEVE",
  );
  esperarValor(
    "con carné o pasaporte el nombre se escribe tal cual, sin números (nombre_con_numeros); sin números, sí",
    caso(`${COMO_WEB}
          ${corto("select retail.registrar_clienta('pasaporte', 'PA0995002', 'Ana 2 Torres', null, null, null, null)")}
          ${corto("select retail.registrar_clienta('carne_extranjeria', 'CE0995002', 'Ana Torres3', null, null, null, null)")}
          ${corto("select retail.registrar_clienta('pasaporte', 'PA0995002', 'Ana Torres Quispe', null, null, null, null)")}
          select pg_temp.intento(format($q$select retail.editar_clienta(%L, 'pasaporte', 'PA0995001', 'Paola 3', null, null, null, null, null, null, null)$q$, :'pao'));
          select pg_temp.intento(format($q$select retail.editar_clienta(%L, 'pasaporte', 'PA0995001', 'Paola Pasaporte Ríos', null, null, null, null, null, null, null)$q$, :'pao'));`),
    "22023|nombre_con_numeros|nombre\n22023|nombre_con_numeros|nombre\nok\n22023|nombre_con_numeros|nombre\nok",
  );
  esperarValor(
    "pasar de DNI a pasaporte con su nombre sí (ahora se escribe), y anonimizar una ficha con DNI también (queda sin documento)",
    caso(`${COMO_WEB}
          select pg_temp.intento(format($q$select retail.editar_clienta(%L, 'pasaporte', 'PA0995009', 'Ana Escrita A Mano', '987950001', null, null, null, null, null, null)$q$, :'ana'));
          ${anotar("09950002", "PRUEBA SIMULADA LUCIA")}${COMO_WEB}
          select retail.registrar_clienta('dni', '09950002', 'PRUEBA SIMULADA LUCIA', null, null, null, null) as lucia \\gset
          select pg_temp.intento(format($q$select retail.archivar_clienta(%L, 'prueba de la regla del nombre', true, null)$q$, :'lucia'));
          ${COMO_DUENO}select documento_numero is null and anonimizada from retail.clientas where id = :'lucia';`),
    "ok\nok\nt",
  );

  console.log("— D. El cartel del Club (el servidor del ERP) —");
  const unirme = (tipo, numero, nombre, delPadron) =>
    `select pg_temp.intento(format($q$select * from retail.registrarse_en_el_club(%L, '${tipo}', '${numero}', '${nombre}', '987950031', '1990-05-12', null, true, true, false, %L::jsonb, ${delPadron})$q$, :'tru', :'versiones'));\n`;
  esperarValor(
    "con DNI y sin la lectura del padrón no se une; con la lectura anotada sí; con pasaporte y un nombre con números, no",
    caso(`${COMO_SERVIDOR}${unirme("dni", "09950031", "PRUEBA CARTEL SIN LECTURA", true)}
          select retail.fn_anotar_lectura_padron('dni', '09950032', 'PRUEBA CARTEL CON LECTURA') as _a \\gset
          ${unirme("dni", "09950032", "PRUEBA CARTEL CON LECTURA", true)}${unirme("pasaporte", "PA0995033", "Marta 33 Cartel", false)}
          ${COMO_DUENO}select string_agg(documento_numero || ':' || nombre, ',' order by documento_numero) from retail.clientas where documento_numero in ('09950031', '09950032', 'PA0995033');`),
    "P0001|nombre_sin_padron|nombre\nok\n22023|nombre_con_numeros|nombre\n09950032:PRUEBA CARTEL CON LECTURA",
  );

  console.log("— E. La tienda online (su usuario de tienda_web) —");
  /** Lo que deja el servidor de la tienda después de que el proyecto de clientes verificó el código (lo escribe el dueño de la base). */
  const pendiente = (correo, usuario) =>
    `${COMO_DUENO}insert into retail.cuentas_web_pendientes (correo, usuario_web_id, envios, primer_envio_en, ultimo_envio_en, vence_en, intentos)
     values ('${correo}', '${usuario}', 1, now(), now(), now() + interval '30 minutes', 1);\n`;
  const cuenta = (usuario, correo, dni, nombre, delPadron, tipo = "dni") =>
    `select pg_temp.intento($q$select retail.tienda_registrar_cuenta('${usuario}', '${correo}', '${dni}', '${nombre}', ${delPadron}, '987950041', 14, 10, null, true, true, false, null, 'borrador-2026-10-14', '${tipo}')$q$);\n`;
  esperarValor(
    "sin lectura no se crea la cuenta (ni con el nombre «del padrón» ni con uno escrito a mano); con la lectura anotada por la tienda, sí",
    caso(`${pendiente(`zz.a.${CORRIDA}@ejemplo.com`, "a1a1a1a1-0000-4000-8000-000000000001")}${pendiente(
      `zz.b.${CORRIDA}@ejemplo.com`,
      "b2b2b2b2-0000-4000-8000-000000000002",
    )}${pendiente(`zz.c.${CORRIDA}@ejemplo.com`, "c3c3c3c3-0000-4000-8000-000000000003")}${COMO_TIENDA}
          ${cuenta("a1a1a1a1-0000-4000-8000-000000000001", `zz.a.${CORRIDA}@ejemplo.com`, "09950041", "Prueba Tienda Sin Lectura", true)}
          ${cuenta("b2b2b2b2-0000-4000-8000-000000000002", `zz.b.${CORRIDA}@ejemplo.com`, "09950042", "Nombre Escrito A Mano", false)}
          select retail.tienda_anotar_lectura_padron('09950043', 'Prueba Tienda Con Lectura') as _t \\gset
          ${cuenta("c3c3c3c3-0000-4000-8000-000000000003", `zz.c.${CORRIDA}@ejemplo.com`, "09950043", "Prueba Tienda Con Lectura", true)}
          ${COMO_DUENO}select string_agg(documento_numero || ':' || nombre, ',' order by documento_numero) from retail.clientas where documento_numero in ('09950041', '09950042', '09950043');`),
    "P0001|nombre_sin_padron|nombre\nP0001|nombre_sin_padron|nombre\nok\n09950043:Prueba Tienda Con Lectura",
  );
  esperarValor(
    "con pasaporte (la tienda acepta carné y pasaporte, Felipe 2026-10-15) el nombre se escribe, sin números; sin ellos, sí se crea",
    caso(`${pendiente(`zz.d.${CORRIDA}@ejemplo.com`, "d4d4d4d4-0000-4000-8000-000000000004")}${pendiente(
      `zz.e.${CORRIDA}@ejemplo.com`,
      "e5e5e5e5-0000-4000-8000-000000000005",
    )}${COMO_TIENDA}
          ${cuenta("d4d4d4d4-0000-4000-8000-000000000004", `zz.d.${CORRIDA}@ejemplo.com`, "PA0995044", "Paola 44 Tienda", false, "pasaporte")}
          ${cuenta("e5e5e5e5-0000-4000-8000-000000000005", `zz.e.${CORRIDA}@ejemplo.com`, "PA0995045", "Paola Tienda Pasaporte", false, "pasaporte")}
          ${COMO_DUENO}select string_agg(documento_tipo || ':' || documento_numero || ':' || nombre, ',' order by documento_numero) from retail.clientas where documento_numero in ('PA0995044', 'PA0995045');`),
    "22023|nombre_con_numeros|nombre\nok\npasaporte:PA0995045:Paola Tienda Pasaporte",
  );

  console.log("— F. El dueño de la base —");
  esperarValor(
    "las pruebas, el SQL Editor y las migraciones (postgres) siguen escribiendo como antes: un nombre inventado junto a un DNI pasa",
    caso(`set local request.jwt.claim.sub = '${FELIPE}';
          set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
          set local session authorization postgres;
          select retail.registrar_clienta('dni', '09950051', 'Nombre De Una Prueba', null, null, null, null) is not null;`),
    "t",
  );

  console.log("— G. El pegado —");
  esperarValor(
    "la migración se puede pegar dos veces seguidas (cada pegado termina en «QUEDÓ BIEN»), y después la regla sigue igual (sin lectura no; con lectura sí)",
    caso(`${SQL}\n${SQL}\nset local search_path = retail, public, extensions;
          ${COMO_WEB}${corto("select retail.registrar_clienta('dni', '09950061', 'NOMBRE INVENTADO', null, null, null, null)")}
          ${anotar("09950061", "PRUEBA DOS VECES")}${COMO_WEB}${corto("select retail.registrar_clienta('dni', '09950061', 'PRUEBA DOS VECES', null, null, null, null)")}`),
    `${"20261015133000 · el nombre de la ficha sale del padrón|QUEDÓ BIEN\n".repeat(2)}P0001|nombre_sin_padron|nombre\nok`,
  );
}

main();
console.log(`\n${total - fallos}/${total} casos en verde`);
process.exit(fallos > 0 ? 1 : 0);

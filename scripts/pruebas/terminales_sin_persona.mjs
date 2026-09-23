#!/usr/bin/env node
/**
 * Pruebas de las terminales SIN persona (ADR-0162, migración `20260923010000_terminales_sin_persona.sql`) — CAYLA V2.
 *
 * QUÉ PRUEBA. Que un aparato con cuenta propia y sin persona:
 *   · nunca firme solo: `fn_actor_persona_id()` exige un `x-responsable` PRESENTE en la tienda de la terminal
 *     (en pausa, con salida, sin marcas, o presente en OTRA tienda → rechazado);
 *   · no herede poderes de quien firma: con una líder como responsable, `fn_es_lider()` sigue siendo falso;
 *   · tenga los poderes de su ROL (ya no hay tipo: 20260923040000) y opere solo su tienda;
 *   · se identifique por tienda + nombre: dos en la misma tienda con distinto rol, nunca dos activas con el mismo nombre;
 *   · quede anotado en `terminal_id` al insertar.
 * Y que una PERSONA siga firmando a su nombre mientras el interruptor `fn_exige_responsable()` esté apagado.
 * Regresión incluida: sin marcas ni jornada, «presente» es FALSO, no NULL (un NULL dejaba el candado abierto).
 *
 * CÓMO. Mismo patrón que `terminales_por_tienda.mjs`: cada escenario en su transacción con ROLLBACK. La terminal, sus
 * cuentas, personas extra y las tablas `public.marcajes`/`public.jornadas` (que la base local no tiene: son de
 * Dynamic) se crean DENTRO del escenario y desaparecen con el ROLLBACK. El encabezado HTTP se simula con
 * `set local request.headers`, que es exactamente lo que PostgREST hace con cada petición.
 *
 * USO
 *   pnpm pruebas:terminales-sin-persona                 → contra la base `postgres` del stack local
 *   pnpm pruebas:terminales-sin-persona --base cayla_f2 → contra otra base del mismo contenedor
 *   … --en-seco                                          → carga la migración dentro de cada escenario
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const EN_SECO = process.argv.includes("--en-seco");
// En seco se carga la ÚLTIMA pieza (sin tipo): la base ya debe tener 20260923010000 y 20260923030000 aplicadas.
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260923040000_terminales_sin_tipo.sql"), "utf8");

// Seed local: Felipe (líder) y Micaela (colaboradora de Trujillo). Sus auth_user_id son estos.
const FELIPE_AUTH = "22222222-2222-4222-8222-000000000001";
const MICAELA_AUTH = "22222222-2222-4222-8222-000000000003";
// Creados en cada escenario.
const T_VENTAS_AUTH = "33333333-3333-4333-8333-0000000000a1";
const T_ADMIN_AUTH = "33333333-3333-4333-8333-0000000000a2";
const ROSA = "33333333-3333-4333-8333-0000000000b1"; // integrante de Trujillo, sin cuenta (solo firma)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Todo lo que un escenario necesita, dentro de su transacción. */
const PRELUDIO = `
begin;
${EN_SECO ? MIGRACION : ""}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(nullif(v_hint, ''), v_msg);
end;
$f$;
-- Asistencia de Dynamic, simulada (en producción la escribe su kiosco).
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
-- Cada caso arranca SIN asistencia (la base local puede tener marcas simuladas de una demo); el ROLLBACK la devuelve.
delete from public.marcajes;
delete from public.jornadas;
create temp table ids as
  select (select id from retail.ubicaciones where nombre = 'Tienda Trujillo') as tru,
         (select id from retail.ubicaciones where nombre = 'Tienda Lima') as lim,
         (select sede_dynamic_id from retail.ubicaciones where nombre = 'Tienda Trujillo') as sede_tru,
         (select sede_dynamic_id from retail.ubicaciones where nombre = 'Tienda Lima') as sede_lim,
         (select id from public.personas where auth_user_id = '${FELIPE_AUTH}') as felipe,
         (select id from public.personas where auth_user_id = '${MICAELA_AUTH}') as micaela;
grant select on ids to authenticated;
-- Dos aparatos de Trujillo, con su cuenta de Auth y SIN persona.
insert into auth.users (id, aud, role, email) values
  ('${T_VENTAS_AUTH}', 'authenticated', 'authenticated', 'terminal-ventas-tru@prueba.local'),
  ('${T_ADMIN_AUTH}', 'authenticated', 'authenticated', 'terminal-admin-tru@prueba.local');
-- Sin tipo (20260923040000): lo que ve cada una lo decide su ROL.
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  select tru, 'Terminal Ventas TRU', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS_AUTH}'::uuid from ids
  union all select tru, 'Terminal Administrativa TRU', retail.fn_rol_por_clave('terminal_administrativa'), '${T_ADMIN_AUTH}'::uuid from ids;
-- Rosa: integrante de Trujillo, firma pero no tiene cuenta.
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) select '${ROSA}', 'Rosa', 'Prueba', 'activo', sede_tru from ids;
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) select '${ROSA}', 'colaborador', tru from ids;
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const encabezados = (obj) => `set local request.headers = '${JSON.stringify(obj)}';\n`;
const marca = (persona, sede, tipo, hora) =>
  `insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca) select ${persona}, ${sede}, '${tipo}', ${hora} from ids;\n`;
const HOY = (hhmm) => `((now() at time zone 'America/Lima')::date + time '${hhmm}') at time zone 'America/Lima'`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
const actor = `select pg_temp.intento('select retail.fn_actor_persona_id()');`;
const actorValor = `select coalesce(retail.fn_actor_persona_id()::text, 'NULL');`;

// (concat_ws escribe los booleanos como t/f.)
// ---------------- Quién firma: sesión de terminal ----------------
caso("terminal sin responsable → rechazada", como(T_VENTAS_AUTH) + actor, "42501|responsable_requerido");

caso(
  "terminal con responsable PRESENTE en su tienda → firma esa persona",
  marca("micaela", "sede_tru", "entrada", HOY("00:01")) + como(T_VENTAS_AUTH) + `select set_config('request.headers', json_build_object('x-responsable', micaela)::text, true) from ids \\g /dev/null\n` +
    `select (retail.fn_actor_persona_id() = micaela)::text from ids;`,
  "true"
);

for (const [tipo, nombre] of [
  ["salida_almuerzo", "EN PAUSA (almuerzo)"],
  ["salida_final", "que ya SALIÓ"],
]) {
  caso(
    `terminal con responsable ${nombre} → rechazada`,
    marca("micaela", "sede_tru", "entrada", HOY("00:01")) + marca("micaela", "sede_tru", tipo, `now() - interval '1 second'`) + como(T_VENTAS_AUTH) +
      `select set_config('request.headers', json_build_object('x-responsable', micaela)::text, true) from ids \\g /dev/null\n` + actor,
    "42501|responsable_no_presente"
  );
}

caso(
  "REGRESIÓN: responsable sin marcas NI jornada → rechazada (no NULL)",
  como(T_VENTAS_AUTH) + `select set_config('request.headers', json_build_object('x-responsable', micaela)::text, true) from ids \\g /dev/null\n` + actor,
  "42501|responsable_no_presente"
);

caso(
  "presente pero en OTRA tienda (Lima) → rechazada en la terminal de Trujillo",
  marca("micaela", "sede_lim", "entrada", HOY("00:01")) + como(T_VENTAS_AUTH) +
    `select set_config('request.headers', json_build_object('x-responsable', micaela)::text, true) from ids \\g /dev/null\n` + actor,
  "42501|responsable_no_presente"
);

caso(
  "jornada abierta sin marcas → presente (misma regla que la lista del combo)",
  `insert into public.jornadas select micaela, sede_tru, (now() at time zone 'America/Lima')::date, 'abierta' from ids;\n` + como(T_VENTAS_AUTH) +
    `select set_config('request.headers', json_build_object('x-responsable', micaela)::text, true) from ids \\g /dev/null\n` +
    `select (retail.fn_actor_persona_id() = micaela)::text from ids;`,
  "true"
);

caso(
  "persona de Dynamic SIN acceso a retail → rechazada",
  `insert into public.personas (id, nombres, apellidos, estado, sede_base_id) select '33333333-3333-4333-8333-0000000000c1', 'Sin', 'Acceso', 'activo', sede_tru from ids;\n` +
    marca(`'33333333-3333-4333-8333-0000000000c1'::uuid`, "sede_tru", "entrada", HOY("00:01")) + como(T_VENTAS_AUTH) +
    encabezados({ "x-responsable": "33333333-3333-4333-8333-0000000000c1" }) + actor,
  "42501|responsable_sin_acceso"
);

caso("responsable que no es un uuid → rechazado", como(T_VENTAS_AUTH) + encabezados({ "x-responsable": "no-es-uuid" }) + actor, (s) => s.startsWith("22P02|"));

// ---------------- Venta sin conexión: vale la hora de la venta ----------------
caso(
  "x-momento dentro del turno (entró 00:01, salió hace 1 s; venta de hace 1 min) → firma",
  marca("micaela", "sede_tru", "entrada", HOY("00:01")) + marca("micaela", "sede_tru", "salida_final", `now() - interval '1 second'`) + como(T_VENTAS_AUTH) +
    `select set_config('request.headers', json_build_object('x-responsable', micaela, 'x-momento', (now() - interval '1 minute')::text)::text, true) from ids \\g /dev/null\n` +
    `select (retail.fn_actor_persona_id() = micaela)::text from ids;`,
  (s) => s === "true" || /* justo pasada la medianoche de Lima no hay «hace 1 minuto» del mismo día */ s.includes("responsable_no_presente")
);
caso(
  "x-momento de hace 8 días → fuera de rango",
  como(T_VENTAS_AUTH) + `select set_config('request.headers', json_build_object('x-responsable', micaela, 'x-momento', (now() - interval '8 days')::text)::text, true) from ids \\g /dev/null\n` + actor,
  (s) => s.startsWith("22007|")
);

// ---------------- Los permisos son de la CUENTA, no de quien firma ----------------
caso(
  "terminal de ventas firmando con la LÍDER Felipe → sigue sin ser líder",
  marca("felipe", "sede_tru", "entrada", HOY("00:01")) + como(T_VENTAS_AUTH) +
    `select set_config('request.headers', json_build_object('x-responsable', felipe)::text, true) from ids \\g /dev/null\n` +
    `select (retail.fn_actor_persona_id() = felipe)::text || ',' || retail.fn_es_lider()::text from ids;`,
  "true,false"
);
caso(
  "terminal de ventas: caja sí; inventario, catálogo y descuento por etiqueta no",
  como(T_VENTAS_AUTH) + `select concat_ws(',', fn_puede_gestionar_caja(), fn_puede_ajustar_inventario(), fn_puede_editar_catalogo(), fn_puede_dar_descuento_por_etiqueta(), fn_es_terminal('ventas'), fn_mi_terminal());`,
  "t,f,f,f,t,Terminal Ventas TRU"
);
caso(
  "terminal administrativa: inventario, catálogo y cuentas de proveedor sí; caja no",
  como(T_ADMIN_AUTH) + `select concat_ws(',', fn_puede_gestionar_caja(), fn_puede_ajustar_inventario(), fn_puede_editar_catalogo(), fn_puede_editar_cuentas_proveedor(), fn_mi_terminal());`,
  "f,t,t,t,Terminal Administrativa TRU"
);
caso(
  "la terminal opera su tienda y ninguna otra",
  como(T_VENTAS_AUTH) + `select concat_ws(',', fn_ubicacion_actual_persona() = tru, fn_puede_operar_ubicacion(tru), fn_puede_operar_ubicacion(lim)) from ids;`,
  "t,t,f"
);
caso(
  "la cabecera de la terminal: su nombre, su tienda, nunca líder",
  como(T_VENTAS_AUTH) + `select concat_ws(',', count(*), max(nombre), bool_or(es_lider), max(ubicacion_nombre)) from fn_persona_actual_resumen();`,
  "1,Terminal Ventas TRU,f,Tienda Trujillo"
);
caso(
  "terminal DESACTIVADA: deja de ser terminal y pierde sus poderes al instante",
  `update retail.terminales set activo = false where auth_user_id = '${T_VENTAS_AUTH}';\n` + como(T_VENTAS_AUTH) +
    `select concat_ws(',', fn_es_terminal(), fn_puede_gestionar_caja(), coalesce(fn_ubicacion_actual_persona()::text, 'sin tienda'), (select count(*) from fn_persona_actual_resumen()));`,
  "f,f,sin tienda,0"
);

// ---------------- Sesión de PERSONA (interruptor apagado) ----------------
caso("persona sin responsable → firma ella misma (como antes)", como(MICAELA_AUTH) + `select (retail.fn_actor_persona_id() = micaela)::text from ids;`, "true");
caso(
  "persona con responsable presente y tienda → firma el responsable",
  marca(`'${ROSA}'::uuid`, "sede_tru", "entrada", HOY("00:01")) + como(MICAELA_AUTH) +
    `select set_config('request.headers', json_build_object('x-responsable', '${ROSA}', 'x-ubicacion', tru)::text, true) from ids \\g /dev/null\n` +
    `select (retail.fn_actor_persona_id() = '${ROSA}'::uuid)::text;`,
  "true"
);
caso(
  "persona con responsable pero SIN tienda → rechazada",
  como(MICAELA_AUTH) + encabezados({ "x-responsable": ROSA }) + actor,
  "42501|ubicacion_requerida"
);
caso(
  "persona con responsable de una tienda que NO opera (Micaela → Lima) → rechazada",
  como(MICAELA_AUTH) + `select set_config('request.headers', json_build_object('x-responsable', '${ROSA}', 'x-ubicacion', lim)::text, true) from ids \\g /dev/null\n` + actor,
  "42501|ubicacion_requerida"
);
caso("operación que NO es de tienda: la persona firma a su nombre aunque mande responsable", como(MICAELA_AUTH) + encabezados({ "x-responsable": ROSA }) + `select (retail.fn_actor_persona_id(false) = micaela)::text from ids;`, "true");
caso("sin sesión (SQL Editor, scripts) → nadie, igual que antes", actorValor, "NULL");

// ---------------- Sesión de PERSONA con el interruptor ENCENDIDO (20260923160000, decisión de Felipe) ----------------
// La base de pruebas puede no tener la fila de la empresa (en producción existe): se crea si falta, dentro de la transacción.
const ENCENDER = `insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;\n`;
caso("interruptor: arranca apagado (valor por defecto de la columna)", `select retail.fn_exige_responsable()::text;`, "false");
caso("interruptor encendido: persona SIN responsable → rechazada", ENCENDER + como(MICAELA_AUTH) + actor, "42501|responsable_requerido");
caso(
  "interruptor encendido: persona con responsable presente → firma el responsable",
  ENCENDER + marca(`'${ROSA}'::uuid`, "sede_tru", "entrada", HOY("00:01")) + como(MICAELA_AUTH) +
    `select set_config('request.headers', json_build_object('x-responsable', '${ROSA}', 'x-ubicacion', tru)::text, true) from ids \\g /dev/null\n` +
    `select (retail.fn_actor_persona_id() = '${ROSA}'::uuid)::text;`,
  "true"
);
caso(
  "interruptor encendido: el LÍDER tampoco guarda sin responsable (un mismo flujo para todos)",
  ENCENDER + como(FELIPE_AUTH) + actor,
  "42501|responsable_requerido"
);
caso(
  "interruptor encendido: nadie marcó entrada en la tienda → rechazada aunque elija a alguien",
  ENCENDER + como(MICAELA_AUTH) + `select set_config('request.headers', json_build_object('x-responsable', '${ROSA}', 'x-ubicacion', tru)::text, true) from ids \\g /dev/null\n` + actor,
  "42501|responsable_no_presente"
);
caso(
  "interruptor encendido: lo que NO es de tienda sigue firmando a nombre de la persona",
  ENCENDER + como(MICAELA_AUTH) + `select (retail.fn_actor_persona_id(false) = micaela)::text from ids;`,
  "true"
);

// ---------------- terminal_id ----------------
caso(
  "el disparador está en las 10 tablas",
  `select count(*) from pg_trigger where tgname = 'trg_sellar_terminal' and not tgisinternal;`,
  (s) => Number(s) >= 9 // `transferencia_recepciones` puede no existir en bases viejas
);
caso(
  "un insert hecho por la terminal queda con su terminal_id; uno de una persona, vacío",
  `create temp table sello (terminal_id uuid);
   create trigger t before insert on sello for each row execute function retail.fn_sellar_terminal();
   grant insert, select on sello to authenticated;\n` +
    como(T_VENTAS_AUTH) + `insert into sello default values;\n` + como(MICAELA_AUTH) + `insert into sello default values;\n` +
    `select string_agg(case when s.terminal_id = t.id then 'terminal' when s.terminal_id is null then 'vacio' else 'otro' end, ',')
       from sello s left join retail.terminales t on t.auth_user_id = '${T_VENTAS_AUTH}';`,
  "terminal,vacio"
);

// ---------------- La pantalla: solo el líder ----------------
caso("fn_terminales(): el líder las ve", como(FELIPE_AUTH) + `select count(*) from fn_terminales();`, "2");
caso("fn_terminales(): una colaboradora no", como(MICAELA_AUTH) + `select pg_temp.intento('select * from retail.fn_terminales()');`, (s) => s.startsWith("42501|"));
caso(
  "desactivar y reactivar (líder)",
  como(FELIPE_AUTH) +
    `select desactivar_terminal(id) from retail.terminales where auth_user_id = '${T_VENTAS_AUTH}' \\g /dev/null\n` +
    `select activo::text from retail.terminales where auth_user_id = '${T_VENTAS_AUTH}';\n` +
    `select reactivar_terminal(id) from retail.terminales where auth_user_id = '${T_VENTAS_AUTH}' \\g /dev/null\n` +
    `select activo::text from retail.terminales where auth_user_id = '${T_VENTAS_AUTH}';`,
  "false\ntrue"
);
caso(
  "no se reactiva si otra ACTIVA de la tienda ya usa su nombre",
  `update retail.terminales set activo = false where auth_user_id = '${T_VENTAS_AUTH}';
   insert into auth.users (id, aud, role, email) values ('33333333-3333-4333-8333-0000000000a3', 'authenticated', 'authenticated', 'nueva@prueba.local');
   insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) select tru, 'terminal ventas tru', retail.fn_rol_por_clave('terminal_ventas'), '33333333-3333-4333-8333-0000000000a3'::uuid from ids;\n` +
    como(FELIPE_AUTH) + `select pg_temp.intento(format('select retail.reactivar_terminal(%L)', id)) from retail.terminales where auth_user_id = '${T_VENTAS_AUTH}';`,
  (s) => s.startsWith("23505|") && s.includes("ya tiene otra terminal activa")
);
caso(
  "una colaboradora no desactiva",
  como(MICAELA_AUTH) + `select pg_temp.intento(format('select retail.desactivar_terminal(%L)', id)) from retail.terminales where auth_user_id = '${T_VENTAS_AUTH}';`,
  (s) => s.startsWith("42501|")
);
caso(
  "RLS: como rol de la API, la terminal solo ve su propia fila y no puede escribir",
  como(T_VENTAS_AUTH) + `set local role authenticated;\nselect count(*) from retail.terminales;\nselect pg_temp.intento('update retail.terminales set activo = false');`,
  (s) => s.startsWith("1\n") && s.includes("42501|")
);

// ---------------- Retiro del ADR-0160 ----------------
caso("colaboradores.terminal queda retirada", `select pg_temp.intento('update retail.colaboradores set terminal = ''ventas''');`, (s) => s.startsWith("23514|"));
caso("agregar_terminal explica el camino nuevo", como(FELIPE_AUTH) + `select pg_temp.intento('select retail.agregar_terminal(null, null, ''ventas'')');`, (s) => s.startsWith("0A000|"));
caso(
  "candado de Dynamic: no hay terminal activa sin cuenta",
  `select pg_temp.intento($$insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id, activo) select lim, 'X', retail.fn_rol_por_clave('terminal_ventas'), null, true from ids$$);`,
  (s) => s.startsWith("23514|")
);


// ---------------- Sin tipo: tienda + nombre + rol (20260923040000) ----------------
const OTRA_AUTH = "33333333-3333-4333-8333-0000000000a4";
const otraCuenta = `insert into auth.users (id, aud, role, email) values ('${OTRA_AUTH}', 'authenticated', 'authenticated', 'otra@prueba.local');\n`;
const alta = (nombre, rol, extra = "") =>
  `select pg_temp.intento(format($q$insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id${extra ? ", tipo" : ""}) values (%L, %L, %s, %L${extra ? ", " + extra : ""})$q$, tru, ${nombre}, ${rol}, '${OTRA_AUTH}')) from ids;`;
caso(
  "dos terminales en la MISMA tienda con distinto rol: las dos activas",
  otraCuenta + alta(`'Terminal Caja 2 TRU'`, `'retail.fn_rol_por_clave(''terminal_administrativa'')'`) + `\nselect count(*) from retail.terminales where ubicacion_id = (select tru from ids) and activo;`,
  "SIN_ERROR\n3"
);
caso(
  "nombre repetido entre activas de la misma tienda (sin importar mayúsculas ni espacios) → rechazado",
  otraCuenta + alta(`'  terminal VENTAS tru '`, `'retail.fn_rol_por_clave(''terminal_ventas'')'`),
  (s) => s.startsWith("23505|")
);
caso(
  "el mismo nombre en OTRA tienda sí entra",
  otraCuenta + `select pg_temp.intento(format($q$insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values (%L, 'Terminal Ventas TRU', retail.fn_rol_por_clave('terminal_ventas'), '${OTRA_AUTH}')$q$, lim)) from ids;`,
  "SIN_ERROR"
);
caso(
  "una DESACTIVADA no ocupa el nombre",
  `update retail.terminales set activo = false where auth_user_id = '${T_VENTAS_AUTH}';\n` + otraCuenta + alta(`'Terminal Ventas TRU'`, `'retail.fn_rol_por_clave(''terminal_ventas'')'`),
  "SIN_ERROR"
);
caso("sin rol ni tipo → rechazada (falla cerrado)", otraCuenta + alta(`'Sin rol'`, `'null'`), (s) => s.startsWith("23502|"));
caso(
  "LEGADO: sin rol pero con tipo → el rol de ese tipo, como antes",
  otraCuenta + alta(`'Legado'`, `'null'`, "'administrativa'") + `\nselect r.clave from retail.terminales t join retail.roles r on r.id = t.rol_id where t.auth_user_id = '${OTRA_AUTH}';`,
  "SIN_ERROR\nterminal_administrativa"
);
caso("el rol Líder no se le da a una terminal", otraCuenta + alta(`'Con líder'`, `'retail.fn_rol_por_clave(''lider'')'`), (s) => s.startsWith("23514|"));
caso(
  "un rol ARCHIVADO no se le da a una terminal",
  `insert into retail.roles (nombre, archivado_at) values ('Rol viejo', now());\n` + otraCuenta +
    alta(`'Con archivado'`, `'(select id from retail.roles where nombre = ''Rol viejo'')'`),
  (s) => s.startsWith("23514|") && s.includes("archivado")
);
caso(
  "solo en una tienda ACTIVA: en un almacén se rechaza",
  otraCuenta + `select pg_temp.intento(format($q$insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values (%L, 'En almacén', retail.fn_rol_por_clave('terminal_ventas'), '${OTRA_AUTH}')$q$, (select id from retail.ubicaciones where tipo <> 'tienda' limit 1)));`,
  (s) => s.startsWith("23514|")
);
caso(
  "PERMISOS POR ROL: una terminal con un rol a medida (Caja + Existencias) cierra caja y ajusta stock, pero no edita el catálogo",
  `insert into retail.roles (nombre) values ('Caja y stock');
   insert into retail.rol_modulos (rol_id, modulo) select id, m from retail.roles, unnest(array['caja','existencias']) m where nombre = 'Caja y stock';
   update retail.terminales set rol_id = (select id from retail.roles where nombre = 'Caja y stock') where auth_user_id = '${T_VENTAS_AUTH}';\n` +
    como(T_VENTAS_AUTH) +
    `select concat_ws(',', fn_puede_gestionar_caja(), fn_puede_ajustar_inventario(), fn_puede_editar_catalogo(), fn_ve_modulo('vender'), fn_es_terminal(), fn_es_terminal('ventas'), fn_es_terminal('administrativa'), (select count(*) from fn_mis_modulos()));`,
  "t,t,f,f,t,f,t,2"
);
caso(
  "fn_terminales(): trae rol y correo, ya no el tipo",
  como(FELIPE_AUTH) + `select string_agg(nombre || '|' || rol_nombre || '|' || correo, ',' order by nombre) from fn_terminales();`,
  "Terminal Administrativa TRU|Terminal administrativa|terminal-admin-tru@prueba.local,Terminal Ventas TRU|Terminal de ventas|terminal-ventas-tru@prueba.local"
);
caso(
  "la columna tipo queda como legado: admite vacío y el índice por tipo ya no existe",
  `select concat_ws(',', (select is_nullable from information_schema.columns where table_schema = 'retail' and table_name = 'terminales' and column_name = 'tipo'),
     to_regclass('retail.terminales_una_activa_por_tipo_y_tienda') is null, to_regclass('retail.terminales_nombre_unico_activa') is not null);`,
  "YES,t,t"
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE}${EN_SECO ? ", en seco" : ""})`);
process.exit(fallas ? 1 : 0);

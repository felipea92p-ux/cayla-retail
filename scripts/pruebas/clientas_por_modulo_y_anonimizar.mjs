#!/usr/bin/env node
/**
 * Pruebas de la actualización 2026-09-28 de la ficha de clienta (ADR-0249; migraciones
 * `20260928190000_clientas_por_modulo_y_anonimizar_todo.sql` —PARTE 1, funciones— y
 * `20260928190100_clientas_politicas_por_modulo.sql` —PARTE 2, políticas—).
 *
 * EL PROBLEMA. Tres decisiones de Felipe que la base tiene que hacer cumplir, no la pantalla:
 *   (c) la ficha es del módulo «Clientas»: sus 11 funciones y la lectura directa de la tabla le preguntan a la CUENTA si su
 *       rol lo ve (42501 + hint `clientas_sin_modulo`), antes de resolver al responsable del combo;
 *   (a) la clienta con ficha archivada que vuelve y se registra con su DNI se reactiva sola, con su historial;
 *   (b) anonimizar borra todo: ni en `clientas`, ni en `clientas_fusiones`, ni en `retail.actividad` queda su DNI, su nombre o
 *       su celular, y ninguna frase nueva de la actividad de Clientas los lleva.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated` para
 * que los permisos y la política se evalúen de verdad):
 *   1. Las 11 funciones, cuenta por cuenta: una terminal sin el módulo y una persona a la que se le quitó reciben 42501
 *      `clientas_sin_modulo` en las 11 y no cambia nada; el líder, una integrante con el módulo y una terminal de ventas con
 *      responsable presente pasan (exportar sigue siendo solo del Admin). Una terminal sin responsable recibe
 *      `responsable_requerido` en las que guardan: el módulo se pregunta ANTES del responsable, y en ese orden.
 *   2. La política: sin el módulo, 0 filas; con él, la ficha. `clientas_fusiones` sin políticas ni permisos para la API.
 *   3. (a) Reactivar al registrar: mismo id, historial intacto, version+1, visible otra vez, una sola línea de actividad y
 *      sin nombre. La anonimizada que vuelve es una ficha nueva; la que se unió a otra encuentra la que se conservó; y el
 *      candado nuevo `clientas_fusionada_implica_anonimizada` hace imposible una ficha unida con datos.
 *   4. (b) Anonimizar deja CERO rastro del DNI, del nombre y de los celulares en todas las columnas de clientas,
 *      clientas_fusiones y actividad (cada fila entera como texto, jsonb incluido), también de las fichas que se le unieron
 *      y de un apartado suyo (apartar, abonar, avisar y editar anotan actividad); y antes de anonimizar, ninguna frase de la
 *      actividad (Clientas ni Apartados) los lleva.
 *   5. Estructura: las 11 empiezan por `fn_exigir_modulo('clientas')` (lo primero que corre); el vigilante nombra toda
 *      función security definer nueva que toque la ficha sin él; otro vigilante nombra toda función que anota actividad
 *      leyendo las columnas de la clienta de un apartado; el ayudante no lo ejecuta nadie de la API; y los md5 «después»
 *      escritos en la PARTE 1 son los de las funciones vivas.
 *   6. CONTROL y pegado: se deshace el cambio dentro de la transacción (las funciones y la política que tiene producción hoy,
 *      verificadas por md5 contra los «antes» de la PARTE 1) y el ataque PASA; se pegan los archivos tal como están en disco
 *      y el ataque se cierra; pegarlos dos veces, o en el orden equivocado, deja lo mismo; con una función cambiada en vivo
 *      la PARTE 1 aborta sin pisar nada; y la limpieza de la actividad vieja (Clientas y Apartados) la deja sin nombres, con
 *      las mismas filas, una sola vez.
 *
 * FUERA A PROPÓSITO: los datos que un apartado o un comprobante copiaron al hacerse (documentos de esa operación; ADR-0249).
 *
 * USO
 *   pnpm pruebas:clientas-modulo                  → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:clientas-modulo --base cayla_x   → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const leer = (nombre) => readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8");
const PARTE_1 = leer("20260928190000_clientas_por_modulo_y_anonimizar_todo.sql");
const PARTE_2 = leer("20260928190100_clientas_politicas_por_modulo.sql");

// La tabla del candado de versión de la PARTE 1: firma → md5 normalizado «antes» (main = producción) y «después».
const VERSIONES = [...PARTE_1.matchAll(/\('(retail\.[a-z_]+\([^']*\))',\s+(null|'([0-9a-f]{32})'),\s+'([0-9a-f]{32})'\)/g)].map((m) => ({
  firma: m[1],
  antes: m[3] ?? null,
  despues: m[4],
}));
if (VERSIONES.length !== 14) {
  console.error(
    `✗ La tabla de versiones de la PARTE 1 debería tener 14 filas (el ayudante, las 11 y las 2 de la actividad de Apartados) y tiene ${VERSIONES.length}.`
  );
  process.exit(1);
}

// Seed local: Felipe (líder y admin), Micaela (integrante de Trujillo, con Clientas por su rol).
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
// Creadas dentro de cada caso: dos terminales de Trujillo y Rosa, la responsable presente de la terminal de ventas.
const T_ALMACEN = "33333333-3333-4333-8333-0000000000c1"; // rol Terminal Almacén: SIN Clientas
const T_VENTAS = "33333333-3333-4333-8333-0000000000c2"; // rol Terminal de ventas: CON Clientas
const ROSA = "33333333-3333-4333-8333-0000000000c3";
// Tres fichas con id fijo (los textos de `pg_temp.intento` van entre $q$, donde psql no reemplaza variables).
const FICHA = "77777777-7777-4777-8777-000000000001"; // activa, con DNI
const ARCHIVADA = "77777777-7777-4777-8777-000000000002"; // archivada, con DNI
const OTRA = "77777777-7777-4777-8777-000000000003"; // activa, solo celular (para unir)

const SIN_MODULO = "42501|clientas_sin_modulo";
const SIN_RESPONSABLE = "42501|responsable_requerido";
const SOLO_ADMIN = "P0001|Solo un Admin puede exportar la lista completa de clientas.";

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

/** Lo que todo caso necesita, dentro de su transacción. */
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
-- Intenta una sentencia y devuelve «SQLSTATE|hint» (o «SQLSTATE|mensaje» si no hay hint), o SIN_ERROR. No es security
-- definer: corre con los permisos de quien la llama, así se prueba a la cuenta y no a la dueña de la función.
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
grant execute on function pg_temp.intento(text) to authenticated, anon;

-- Una persona firma a su nombre, como hoy en el mostrador (la base local lo puede tener cambiado).
update retail.configuracion_empresa set exige_responsable = false;

-- Roles en un estado conocido (así están en producción el 2026-09-28): Integrante y Terminal de ventas CON Clientas,
-- Terminal Almacén SIN ella. La pantalla Roles y accesos edita estos roles en la base local: se fijan aquí.
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('terminal_administrativa') and modulo = 'clientas';
insert into retail.rol_modulos (rol_id, modulo)
  select retail.fn_rol_por_clave(c), 'clientas' from unnest(array['integrante', 'terminal_ventas']) c
  on conflict do nothing;

-- La asistencia de Dynamic (la base local no la tiene): Rosa marcó entrada en Trujillo hace un segundo.
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values ('${ROSA}', 'Rosa', 'Prueba', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);

insert into auth.users (id, aud, role, email) values
  ('${T_ALMACEN}', 'authenticated', 'authenticated', 'terminal-almacen-clientas-modulo@prueba.local'),
  ('${T_VENTAS}', 'authenticated', 'authenticated', 'terminal-ventas-clientas-modulo@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values
  (:'tru', 'Terminal Almacén clientas-modulo', retail.fn_rol_por_clave('terminal_administrativa'), '${T_ALMACEN}'),
  (:'tru', 'Terminal Ventas clientas-modulo', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS}');

-- Las tres fichas de la prueba.
insert into retail.clientas (id, dni, nombre, telefono_whatsapp, whatsapp_consentimiento_en, cumple_dia, cumple_mes) values
  ('${FICHA}', '90777001', 'Ficha Protegida Prueba', '987777001', now(), 7, 3),
  ('${OTRA}', null, 'Otra Ficha Prueba', '987777003', null, null, null);
insert into retail.clientas (id, dni, nombre, archivada_en, motivo_archivo) values
  ('${ARCHIVADA}', '90777002', 'Ficha Archivada Prueba', now(), 'prueba');

-- Cuántas líneas de actividad de Clientas había antes del caso (la base la comparten otras pruebas).
select count(*) as act0 from retail.actividad where modulo = 'clientas' \\gset
`;

/** Cambia de cuenta. `responsable`: el uuid que viaja en `x-responsable` (el combo de la terminal), o nada. */
const como = (auth, { responsable = null } = {}) =>
  `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', ${responsable ? `json_build_object('x-responsable', '${responsable}')::text` : "'{}'"}, true) as _h \\gset
set local role authenticated;
`;
const comoAnon = `reset role;\nset local request.jwt.claims = '{"role":"anon"}';\nset local role anon;\n`;
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);\n`;

// Las 11, en un orden que deja pasar a quien tiene el módulo (archivar va al final: después la ficha ya no se edita).
const LLAMADAS = {
  registrar_clienta: `select retail.registrar_clienta('90777010', 'Alta Prueba Modulo', null, false, null, null)`,
  buscar_clienta: `select * from retail.buscar_clienta('90777001')`,
  editar_clienta: `select retail.editar_clienta('${FICHA}', '90777001', 'Ficha Protegida Prueba', '987777001', false, false, null, null, null, null)`,
  fn_clienta_compras: `select * from retail.fn_clienta_compras('${FICHA}')`,
  fn_clienta_cambios: `select * from retail.fn_clienta_cambios('${FICHA}')`,
  fn_clienta_devoluciones: `select * from retail.fn_clienta_devoluciones('${FICHA}')`,
  fn_clienta_separaciones: `select * from retail.fn_clienta_separaciones('${FICHA}')`,
  reactivar_clienta: `select retail.reactivar_clienta('${ARCHIVADA}', null)`,
  unir_clientas: `select retail.unir_clientas('${FICHA}', '${OTRA}', null, null)`,
  exportar_clientas: `select * from retail.exportar_clientas()`,
  archivar_clienta: `select retail.archivar_clienta('${FICHA}', 'motivo de prueba', false, null)`,
};
const LAS_11 = Object.keys(LLAMADAS);
const TODAS = Object.values(LLAMADAS).map(intento).join("");
const LEEN = new Set(["buscar_clienta", "fn_clienta_compras", "fn_clienta_cambios", "fn_clienta_devoluciones", "fn_clienta_separaciones"]);
/** Lo esperado, función por función, en el orden de LLAMADAS. */
const esperado = (f) => LAS_11.map(f).join("\n");

/** Como postgres: ¿cambió algo? «nuevas|ficha activa|archivada sigue|otra sin unir|actividad nueva». */
const NADA_CAMBIO = `reset role;
select (select count(*) from retail.clientas where dni = '90777010')
    || '|' || (select (archivada_en is null)::text from retail.clientas where id = '${FICHA}')
    || '|' || (select (archivada_en is not null)::text from retail.clientas where id = '${ARCHIVADA}')
    || '|' || (select (fusionada_en_id is null)::text from retail.clientas where id = '${OTRA}')
    || '|' || ((select count(*) from retail.actividad where modulo = 'clientas') - :act0);
`;

/**
 * Un apartado de la clienta con su vida entera, como lo dejaría la caja: se aparta, abona, se le avisa por WhatsApp y se
 * editan sus prendas. Cada paso anota su línea en Apartados con las funciones vivas de la base (las de hoy o las de
 * producción, según el caso). Se escribe directo como `postgres` (sin caja ni stock: lo que se prueba es la actividad,
 * no el apartado; eso lo prueba separaciones.mjs), y el disparador diferido de «apartó» se corre en el momento.
 */
const APARTADO = ({ codigo, clienta = "null", nombres, apellidos, celular, como = "sep" }) => `reset role;
insert into retail.separaciones (codigo, ubicacion_id, caja_id, clienta_id, clienta_nombres, clienta_apellidos, clienta_celular,
  comprobante_tipo, creado_por, total, adelanto, vence_el, devolucion_medio, devolucion_numero)
values ('${codigo}', :'tru', (select id from retail.cajas order by id limit 1), ${clienta}, '${nombres}', '${apellidos}', '${celular}',
  'boleta', (select id from public.personas where auth_user_id = '${FELIPE}'), 100, 50, current_date + 7, 'yape', '999888777')
returning id as ${como} \\gset
set constraints retail.actividad_separacion_creada immediate;
insert into retail.separacion_abonos (separacion_id, monto, vence_antes, vence_despues) values (:'${como}', 10, current_date + 7, current_date + 7);
insert into retail.separacion_avisos (separacion_id) values (:'${como}');
insert into retail.separacion_ediciones (separacion_id, items_antes, items_despues, total_antes, total_despues)
  values (:'${como}', '[]', '[]', 100, 90);
`;
/** Las cuatro líneas de Apartados de un apartado (la suya y las de su abono, su aviso y su edición). */
const DEL_APARTADO = (como = "sep") => `(a.modulo = 'apartados' and (split_part(a.registro_id, ':', 1) = :'${como}'
  or a.registro_id in (select id::text from retail.separacion_abonos where separacion_id = :'${como}'
                       union all select id::text from retail.separacion_avisos where separacion_id = :'${como}'
                       union all select id::text from retail.separacion_ediciones where separacion_id = :'${como}')))`;

const md5Norm = (expr) =>
  `md5(regexp_replace(regexp_replace(regexp_replace(${expr}, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))`;
/** Una línea por firma de la tabla de versiones: el md5 normalizado vivo (vacío si no existe). */
const MD5_VIVOS = VERSIONES.map(
  (v) => `select coalesce((select ${md5Norm("p.prosrc")} from pg_proc p where p.oid = to_regprocedure('${v.firma}')), 'NO_EXISTE');\n`
).join("");

// ---- El estado de producción ANTES de la PARTE 1 y la PARTE 2 (control) ----
// Las funciones del paso 2 tal como están en main y en producción (los archivos de #543), y `registrar_clienta` como está
// viva: su cuerpo de 20260922140000 con el reemplazo de 20260923100000. La prueba (6) exige que sus md5 sean los «antes» de
// la PARTE 1: si no, este control no reproduciría producción.
const REGISTRAR_ANTES = (() => {
  const t = leer("20260922140000_ficha_de_clienta_v1_backend.sql");
  const ini = t.indexOf("create or replace function retail.registrar_clienta(");
  const fin = t.indexOf("$$;", ini) + 3;
  const cuerpo = t.slice(ini, fin);
  const viejo = "select id into v_persona from public.personas where auth_user_id = auth.uid();";
  if (ini < 0 || !cuerpo.includes(viejo)) throw new Error("No encontré registrar_clienta en 20260922140000 con su búsqueda de persona");
  return cuerpo.replace(viejo, "v_persona := retail.fn_actor_persona_id(true);") + "\n";
})();
// Las dos funciones de la actividad de Apartados, tal cual las dejó 20260927120000 (así están en producción).
const funcionDe = (archivo, firma) => {
  const t = leer(archivo);
  const ini = t.indexOf(`create or replace function ${firma}`);
  if (ini < 0) throw new Error(`No encontré ${firma} en ${archivo}`);
  return t.slice(ini, t.indexOf("$$;", ini) + 3) + "\n";
};
const APARTADOS_ANTES =
  funcionDe("20260927120000_apartados_actividad_y_editar.sql", "retail.fn_actividad_separacion(") +
  funcionDe("20260927120000_apartados_actividad_y_editar.sql", "retail.trg_actividad_separacion_hijas(");
const DESHACER = `reset role;
${leer("20260928160000_editar_archivar_reactivar_clienta.sql")}
${leer("20260928170000_unir_clientas.sql")}
${leer("20260928180000_clienta_actividad_y_exportar.sql")}
${REGISTRAR_ANTES}
${APARTADOS_ANTES}
drop function if exists retail.fn_exigir_modulo(text);
alter table retail.clientas drop constraint if exists clientas_fusionada_implica_anonimizada;
grant select, insert, update, delete on retail.clientas_fusiones to authenticated;
drop policy if exists clientas_fusiones_select on retail.clientas_fusiones;
drop policy if exists clientas_select on retail.clientas;
create policy clientas_select on retail.clientas for select using ((select auth.role()) = 'authenticated');
`;
const PEGAR = (archivo) => `reset role;\n${archivo}\nset local search_path = retail, public, extensions;\n`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperadoCaso) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperadoCaso === "function" ? esperadoCaso(obtenido) : obtenido === esperadoCaso;
  if (!bien) {
    fallas++;
    const e = typeof esperadoCaso === "function" ? "(condición)" : esperadoCaso.split("\n").join("\n              ");
    console.log(`✗ ${nombre}\n    esperado: ${e}\n    obtenido: ${obtenido.split("\n").join("\n              ")}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// =====================================================================================================================
// 1. Las 11 funciones, cuenta por cuenta
// =====================================================================================================================
caso(
  "(1) Terminal Almacén (rol SIN Clientas), sin responsable: 42501 clientas_sin_modulo en las 11 —antes que «elige quién»— y no cambia nada",
  como(T_ALMACEN) + TODAS + NADA_CAMBIO,
  esperado(() => SIN_MODULO) + "\n0|true|true|true|0"
);
caso(
  "(1) Terminal Almacén CON un responsable presente: igual, 42501 clientas_sin_modulo en las 11 (decide la cuenta, no el responsable)",
  como(T_ALMACEN, { responsable: ROSA }) + TODAS + NADA_CAMBIO,
  esperado(() => SIN_MODULO) + "\n0|true|true|true|0"
);
caso(
  "(1) una persona (Micaela) a la que se le quitó Clientas de su rol: lo mismo en las 11 — decide el módulo, no el tipo de cuenta",
  `delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';\n` +
    como(MICAELA) + TODAS + NADA_CAMBIO,
  esperado(() => SIN_MODULO) + "\n0|true|true|true|0"
);
caso(
  "(1) el líder (Felipe, también Admin): pasan las 11",
  como(FELIPE) + TODAS,
  esperado(() => "SIN_ERROR")
);
caso(
  "(1) una integrante CON el módulo (Micaela): pasan las 11; exportar sigue siendo solo del Admin",
  como(MICAELA) + TODAS,
  esperado((f) => (f === "exportar_clientas" ? SOLO_ADMIN : "SIN_ERROR"))
);
caso(
  "(1) Terminal de ventas CON el módulo y responsable presente (Rosa): pasan las 11; exportar, solo el Admin; y firma Rosa",
  como(T_VENTAS, { responsable: ROSA }) + TODAS +
    `reset role;\nselect (select created_por from retail.clientas where dni = '90777010') = '${ROSA}'::uuid;\n`,
  esperado((f) => (f === "exportar_clientas" ? SOLO_ADMIN : "SIN_ERROR")) + "\nt"
);
caso(
  "(1) Terminal de ventas CON el módulo y SIN responsable: lee, y lo que guarda pide «elige quién» (el módulo pasó primero)",
  como(T_VENTAS) + TODAS,
  esperado((f) => (f === "exportar_clientas" ? SOLO_ADMIN : LEEN.has(f) ? "SIN_ERROR" : SIN_RESPONSABLE))
);
caso(
  "(1) anon: no ejecuta ninguna de las 11",
  comoAnon + TODAS,
  (s) => s.split("\n").length === 11 && s.split("\n").every((l) => /^42501\|permission denied for (function|schema)/.test(l))
);

// =====================================================================================================================
// 2. La política
// =====================================================================================================================
const LEE_DIRECTO = `select count(*) from retail.clientas where id in ('${FICHA}', '${ARCHIVADA}', '${OTRA}');\n`;
caso(
  "(2) lectura directa de la tabla: sin el módulo 0 filas (Terminal Almacén, Micaela sin Clientas); con él, las 3 (líder, integrante, terminal de ventas)",
  como(T_ALMACEN) + LEE_DIRECTO +
    como(FELIPE) + LEE_DIRECTO +
    como(MICAELA) + LEE_DIRECTO +
    como(T_VENTAS) + LEE_DIRECTO +
    `reset role;\ndelete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';\n` +
    como(MICAELA) + LEE_DIRECTO,
  "0\n3\n3\n3\n0"
);
caso(
  "(2) clientas_fusiones: sin políticas, y la API no la lee (ni el líder: la leen solo funciones security definer)",
  `select count(*) from pg_policy where polrelid = 'retail.clientas_fusiones'::regclass;\n` +
    como(FELIPE) + intento(`select count(*) from retail.clientas_fusiones`),
  "0\n42501|permission denied for table clientas_fusiones"
);
caso(
  "(2) la política de clientas es UNA, de lectura, y pregunta por el módulo",
  `select string_agg(polname || ':' || polcmd::text || ':' || replace(pg_get_expr(polqual, polrelid), 'retail.', ''), ',') from pg_policy where polrelid = 'retail.clientas'::regclass;\n`,
  "clientas_select:r:( SELECT fn_ve_modulo('clientas'::text) AS fn_ve_modulo)"
);

// =====================================================================================================================
// 3. (a) La clienta archivada que vuelve
// =====================================================================================================================
caso(
  "(3) registrar con el DNI de una ficha archivada la REACTIVA: mismo id, sin archivo, version+1, completa lo nuevo, conserva su venta y vuelve al buscador",
  como(FELIPE) +
    `select retail.registrar_clienta('90777600', 'Rebeca Vuelve Prueba', null, false, null, null) as id1 \\gset
reset role;
insert into retail.ventas (id, ubicacion_id, cliente_id, estado, es_prueba) values (gen_random_uuid(), :'tru', :'id1', 'completada', true) returning id as venta \\gset
${como(FELIPE)}select retail.archivar_clienta(:'id1', 'ya no compra', false, null) as v_archivada \\gset
select retail.registrar_clienta('90777600', null, '987776000', false, null, null) as id2 \\gset
reset role;
select :'id1' = :'id2',
       archivada_en is null and archivada_por is null and motivo_archivo is null,
       version = :v_archivada + 1,
       nombre, telefono_whatsapp
  from retail.clientas where id = :'id1';
select cliente_id = :'id1'::uuid from retail.ventas where id = :'venta';
${como(FELIPE)}select count(*) from retail.buscar_clienta('90777600');
`,
  "t|t|t|Rebeca Vuelve Prueba|987776000\nt\n1"
);
caso(
  "(3) la reactivación deja UNA línea de actividad, sin nombre ni DNI; registrarla otra vez (ya activa) no deja otra",
  como(FELIPE) +
    `select retail.registrar_clienta('90777601', 'Rebeca Dos Prueba', '987776001', false, null, null) as id1 \\gset
select retail.archivar_clienta(:'id1', 'ya no compra', false, null) as _v \\gset
select retail.registrar_clienta('90777601', 'Rebeca Dos Prueba', null, false, null, null) as _r1 \\gset
select retail.registrar_clienta('90777601', 'Rebeca Dos Prueba', null, false, null, null) as _r2 \\gset
reset role;
select count(*), string_agg(descripcion, ','), bool_and(a::text !~* '(rebeca|90777601|987776001)')
  from retail.actividad a where a.modulo = 'clientas' and a.accion = 'reactivar' and a.registro_id = :'id1';
`,
  "1|reactivó una clienta archivada al volver a registrarla|t"
);
caso(
  "(3) la anonimizada que vuelve con su DNI es una ficha NUEVA (pidió que la olvidaran)",
  como(FELIPE) +
    `select retail.registrar_clienta('90777602', 'Olvidada Prueba', null, false, null, null) as id1 \\gset
select retail.archivar_clienta(:'id1', 'pedido de la clienta', true, null) as _v \\gset
select retail.registrar_clienta('90777602', 'Olvidada Prueba', null, false, null, null) as id2 \\gset
reset role;
select :'id1' <> :'id2', (select anonimizada from retail.clientas where id = :'id1'), (select archivada_en is null from retail.clientas where id = :'id2');
`,
  "t|t|t"
);
caso(
  "(3) la que se unió a otra: su DNI la lleva a la ficha que se CONSERVÓ, y si esa estaba archivada, la reactiva",
  como(FELIPE) +
    `select retail.registrar_clienta(null, 'Unida Celular Prueba', '987776100', false, null, null) as queda \\gset
select retail.registrar_clienta('90777603', 'Unida DNI Prueba', null, false, null, null) as se_va \\gset
select (retail.unir_clientas(:'queda', :'se_va', null, null)).dni as dni_que_queda \\gset
select retail.archivar_clienta(:'queda', 'se fue de viaje', false, null) as _v \\gset
select retail.registrar_clienta('90777603', null, null, false, null, null) as vuelve \\gset
reset role;
select :'dni_que_queda', :'vuelve' = :'queda', (select archivada_en is null from retail.clientas where id = :'queda');
`,
  "90777603|t|t"
);
caso(
  "(3) estado imposible: una ficha unida a otra que deja de estar anonimizada viola clientas_fusionada_implica_anonimizada",
  como(FELIPE) +
    `select retail.registrar_clienta(null, 'Imposible Uno', '987776200', false, null, null) as a \\gset
select retail.registrar_clienta(null, 'Imposible Dos', '987776201', false, null, null) as b \\gset
select (retail.unir_clientas(:'a', :'b', null, null)).id as _u \\gset
reset role;
` + intento(`update retail.clientas set anonimizada = false, nombre = 'Imposible Dos' where fusionada_en_id is not null and nombre = 'Clienta anonimizada' and id <> '${FICHA}'`),
  (s) => s.startsWith("23514|") && s.includes("clientas_fusionada_implica_anonimizada")
);

// =====================================================================================================================
// 4. (b) Anonimizar borra todo
// =====================================================================================================================
// Una persona con tres fichas (Z se unió a Y, Y se unió a X), editada, archivada con un motivo que la nombra, registrada de
// nuevo (se reactiva), con un apartado a su nombre (apartar, abonar, avisar, editar) y anonimizada con otro motivo que la
// nombra. Cada fila entera, como texto (jsonb incluido).
const RASTRO = ["90777555", "zorayda", "pruebaclientas", "huamanchumo", "987770001", "987770002", "987770003"];
const cuentaRastro = (tabla) =>
  `(select count(*) from retail.${tabla} x where x::text ~* '(${RASTRO.join("|")})')`;
const RECORRIDO = `${como(FELIPE)}select retail.registrar_clienta(null, 'Zorayda Q', '987770003', false, null, null) as z \\gset
select retail.registrar_clienta(null, 'Zorayda Pruebaclientas', '987770002', true, 12::smallint, 5::smallint) as y \\gset
select (retail.unir_clientas(:'y', :'z', null, null)).id as _u1 \\gset
select retail.registrar_clienta('90777555', 'Zorayda Pruebaclientas Huamanchumo', '987770001', true, 12::smallint, 5::smallint) as x \\gset
select (retail.unir_clientas(:'x', :'y', null, null)).id as _u2 \\gset
select retail.editar_clienta(:'x', '90777555', 'Zorayda Pruebaclientas Huamanchumo', '987770001', false, false, 12::smallint, 5::smallint, '{"superior": "M"}'::jsonb, null) as _e \\gset
select retail.archivar_clienta(:'x', 'Zorayda Pruebaclientas se mudó a Arequipa (DNI 90777555)', false, null) as _a \\gset
select retail.registrar_clienta('90777555', 'Zorayda Pruebaclientas Huamanchumo', null, false, null, null) as _r \\gset
${APARTADO({ codigo: "APT-TRU-9955", clienta: ":'x'", nombres: "Zorayda", apellidos: "Pruebaclientas Huamanchumo", celular: "987770001" })}reset role;
`;
caso(
  "(4) ANTES de anonimizar: las fusiones SÍ guardan a la persona (la evidencia para deshacer a mano) y ninguna línea de actividad —de Clientas ni de su apartado— la nombra",
  RECORRIDO +
    `select ${cuentaRastro("clientas_fusiones")} > 0,
            (select count(*) from retail.actividad a where a.modulo = 'clientas' and a.registro_id in (:'x', :'y', :'z')) >= 5,
            (select count(*) from retail.actividad a where ${DEL_APARTADO()}),
            (select count(*) from retail.actividad a where (a.modulo = 'clientas' and a.registro_id in (:'x', :'y', :'z') or ${DEL_APARTADO()})
                                                         and a::text ~* '(${RASTRO.join("|")})'),
            (select count(*) from retail.actividad a where ${DEL_APARTADO()} and (a.descripcion !~ ' la clienta( |:|$)' or a.detalle ? 'clienta'));
`,
  "t|t|4|0|0"
);
caso(
  "(4) anonimizar deja CERO rastro del DNI, del nombre y de los tres celulares en clientas, clientas_fusiones y actividad (y el motivo escrito no se guarda)",
  RECORRIDO +
    `${como(FELIPE)}select retail.archivar_clienta(:'x', 'Zorayda Pruebaclientas pidió que la borren, DNI 90777555', true, null) as _anon \\gset
reset role;
select ${cuentaRastro("clientas")}, ${cuentaRastro("clientas_fusiones")}, ${cuentaRastro("actividad")},
       (select motivo_archivo from retail.clientas where id = :'x'),
       (select count(*) from retail.clientas_fusiones where clienta_mantiene_id in (:'x', :'y') and ficha_fusionada ? 'anonimizada_en'),
       (select detalle ->> 'fusiones_limpiadas' from retail.actividad where modulo = 'clientas' and accion = 'anonimizar' and registro_id = :'x'),
       (select count(*) from retail.actividad a where ${DEL_APARTADO()});
`,
  "0|0|0|Anonimizada (Ley 29733)|2|2|4"
);
caso(
  "(4) las frases de la actividad de Clientas dicen «una clienta» (editar, archivar, reactivar, unir, anonimizar)",
  RECORRIDO +
    `${como(FELIPE)}select retail.archivar_clienta(:'x', 'pedido', true, null) as _anon \\gset
reset role;
select string_agg(distinct accion || '=' || descripcion, ' ; ' order by accion || '=' || descripcion)
  from retail.actividad where modulo = 'clientas' and registro_id in (:'x', :'y', :'z') and accion <> 'unir';
select count(*) from retail.actividad where modulo = 'clientas' and registro_id in (:'x', :'y') and accion = 'unir'
   and descripcion ~ '^unió dos fichas de una misma clienta: ';
`,
  "anonimizar=anonimizó la ficha de una clienta (Ley 29733) ; archivar=archivó la ficha de una clienta ; editar=editó la ficha de una clienta ; reactivar=reactivó una clienta archivada al volver a registrarla\n2"
);

// =====================================================================================================================
// 5. Estructura
// =====================================================================================================================
const SIN_COMENTARIOS = `regexp_replace(regexp_replace(p.prosrc, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g')`;
caso(
  "(5) las 11 empiezan por fn_exigir_modulo('clientas'): es lo primero que corre (antes de leer o de resolver quién firma)",
  `select coalesce(string_agg(p.proname, ',' order by p.proname), 'todas')
     from pg_proc p
    where p.pronamespace = 'retail'::regnamespace
      and p.proname in (${LAS_11.map((n) => `'${n}'`).join(", ")})
      and regexp_replace(${SIN_COMENTARIOS}, '\\s+', '', 'g') !~ '^(select|(declare.*)?beginperform)retail\\.fn_exigir_modulo\\(''clientas''\\);';\n` +
    `select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in (${LAS_11.map((n) => `'${n}'`).join(", ")});\n`,
  "todas\n11"
);
// LISTA BLANCA: funciones security definer que citan la tabla o sus columnas y NO son una puerta a la ficha (leídas el
// 2026-09-28): fn_ventas_del_dia (solo cli.nombre, o «Cliente varios»), separar_prendas (solo pregunta si la ficha existe),
// bajar_al_piso, fn_aplicar_movimiento y fn_conciliacion_contable («clientas» en un mensaje o un título).
const LISTA_BLANCA = ["fn_ventas_del_dia", "separar_prendas", "bajar_al_piso", "fn_aplicar_movimiento", "fn_conciliacion_contable"];
const VIGILANTE = (condicion) => `select coalesce(string_agg(x.proname, ',' order by x.proname), 'ninguna')
  from (select p.proname, ${SIN_COMENTARIOS} as src, pg_get_function_result(p.oid) as retorna
          from pg_proc p
         where p.pronamespace = 'retail'::regnamespace and p.prosecdef
           and p.proname not in (${LISTA_BLANCA.map((n) => `'${n}'`).join(", ")})) x
 where (x.proname ~ 'clienta' or x.retorna ~* 'clientas' or x.src ~* '(\\mclientas\\M|telefono_whatsapp|whatsapp_consentimiento_en|cumple_dia|cumple_mes)')
   and ${condicion};\n`;
caso(
  "(5) vigilante: las funciones security definer que tocan la ficha son exactamente las 11, y todas llevan el candado del módulo",
  VIGILANTE("true") + VIGILANTE(`x.src !~ 'fn_exigir_modulo\\(''clientas''\\)'`),
  `${[...LAS_11].sort().join(",")}\nninguna`
);
caso(
  "(5) el vigilante muerde: una función NUEVA que devuelve el DNI sin el candado (o con el candado solo en un comentario) sale nombrada",
  `create function retail.zz_vigilante_sin_candado() returns text language plpgsql security definer as $fn$ begin return (select dni from retail.clientas limit 1); end; $fn$;
create function retail.zz_vigilante_comentario() returns text language plpgsql security definer as $fn$
begin
  -- perform retail.fn_exigir_modulo('clientas');
  return (select telefono_whatsapp from retail.clientas limit 1);
end; $fn$;
create function retail.zz_vigilante_con_candado() returns text language plpgsql security definer as $fn$
begin
  perform retail.fn_exigir_modulo('clientas');
  return (select dni from retail.clientas limit 1);
end; $fn$;
` + VIGILANTE(`x.src !~ 'fn_exigir_modulo\\(''clientas''\\)'`),
  "zz_vigilante_comentario,zz_vigilante_sin_candado"
);
// Toda función que anota actividad (llama a fn_actividad_anotar) y lee las columnas de la clienta que un apartado copió al
// hacerse: la actividad no las guarda (ADR-0249, 2026-09-28). Sin comentarios, para que citarlas en uno no cuente.
const VIGILANTE_ACTIVIDAD = `select coalesce(string_agg(x.proname, ',' order by x.proname), 'ninguna')
  from (select p.proname, ${SIN_COMENTARIOS} as src from pg_proc p where p.pronamespace = 'retail'::regnamespace) x
 where x.src ~ 'fn_actividad_anotar\\s*\\('
   and x.src ~* '\\m(clienta_nombres|clienta_apellidos|clienta_celular|clienta_dni)\\M';\n`;
caso(
  "(5) vigilante de la actividad: ninguna función que anota actividad lee el nombre, el celular o el DNI de la clienta de un apartado",
  VIGILANTE_ACTIVIDAD,
  "ninguna"
);
caso(
  "(5) …y muerde: una función nueva que anota con el nombre del apartado sale nombrada (citarlo en un comentario no cuenta)",
  `create function retail.zz_actividad_con_nombre(p_id uuid) returns void language plpgsql security definer as $fn$
declare s retail.separaciones;
begin
  select * into s from retail.separaciones where id = p_id;
  perform retail.fn_actividad_anotar('apartados', 'x', 'apartó para ' || s.clienta_nombres, null, null, null, null, 'separaciones', p_id::text, now(), '{}', 'vivo');
end; $fn$;
create function retail.zz_actividad_comentario(p_id uuid) returns void language plpgsql security definer as $fn$
begin
  -- antes decía: 'apartó para ' || s.clienta_nombres
  perform retail.fn_actividad_anotar('apartados', 'x', 'apartó para la clienta', null, null, null, null, 'separaciones', p_id::text, now(), '{}', 'vivo');
end; $fn$;
` + VIGILANTE_ACTIVIDAD,
  "zz_actividad_con_nombre"
);
caso(
  "(5) el ayudante fn_exigir_modulo no lo ejecuta nadie de la API; y dice el nombre del módulo en castellano",
  `select has_function_privilege('authenticated', 'retail.fn_exigir_modulo(text)', 'execute'),
          has_function_privilege('anon', 'retail.fn_exigir_modulo(text)', 'execute');\n` +
    `create function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$ declare m text; begin execute p_sql; return 'SIN_ERROR'; exception when others then get stacked diagnostics m = message_text; return m; end; $f$;\n` +
    `grant execute on function pg_temp.mensaje(text) to authenticated;\n` +
    como(T_ALMACEN) + `select pg_temp.mensaje($q$select retail.buscar_clienta('x')$q$);\n`,
  "f|f\nTu rol no tiene el módulo «Clientas». Pídele al líder que lo active en Roles y accesos."
);
caso(
  "(5) los md5 «después» escritos en la PARTE 1 son los de las funciones vivas (si alguien edita una sin actualizar la tabla, esto lo dice)",
  MD5_VIVOS,
  VERSIONES.map((v) => v.despues).join("\n")
);

// =====================================================================================================================
// 6. CONTROL y pegado (desde el estado de producción de hoy)
// =====================================================================================================================
caso(
  "(6) el control reproduce producción: las 11 con los md5 «antes» de la PARTE 1, y sin el ayudante",
  DESHACER + MD5_VIVOS,
  VERSIONES.map((v) => v.antes ?? "NO_EXISTE").join("\n")
);
const ATAQUE = `${como(T_ALMACEN)}${LEE_DIRECTO}${intento(LLAMADAS.buscar_clienta)}${intento(LLAMADAS.fn_clienta_separaciones)}`;
caso(
  "(6) CONTROL con el cambio deshecho: Terminal Almacén lee la ficha por la tabla y por las funciones (el ataque PASA)",
  DESHACER + ATAQUE,
  "3\nSIN_ERROR\nSIN_ERROR"
);
caso(
  "(6) CONTROL con el cambio deshecho: Micaela sin Clientas registra una ficha (el ataque PASA)",
  DESHACER +
    `delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';\n` +
    como(MICAELA) + intento(LLAMADAS.registrar_clienta) + `reset role;\nselect count(*) from retail.clientas where dni = '90777010';\n`,
  "SIN_ERROR\n1"
);
const DESPUES_DE_PEGAR =
  ATAQUE + como(FELIPE) + LEE_DIRECTO + intento(LLAMADAS.buscar_clienta) + `reset role;\n` + MD5_VIVOS +
  `select string_agg(polname || ':' || replace(pg_get_expr(polqual, polrelid), 'retail.', ''), ',' order by polname) from pg_policy where polrelid in ('retail.clientas'::regclass, 'retail.clientas_fusiones'::regclass);\n`;
const CERRADO = ["0", SIN_MODULO, SIN_MODULO, "3", "SIN_ERROR", ...VERSIONES.map((v) => v.despues), "clientas_select:( SELECT fn_ve_modulo('clientas'::text) AS fn_ve_modulo)"].join("\n");
caso(
  "(6) pegar la PARTE 1 y la PARTE 2 (tal como están en disco) sobre producción cierra las dos puertas y deja pasar al líder",
  DESHACER + PEGAR(PARTE_1) + PEGAR(PARTE_2) + DESPUES_DE_PEGAR,
  CERRADO
);
caso(
  "(6) pegarlas dos veces cada una deja lo mismo",
  DESHACER + PEGAR(PARTE_1) + PEGAR(PARTE_1) + PEGAR(PARTE_2) + PEGAR(PARTE_2) + DESPUES_DE_PEGAR,
  CERRADO
);
caso(
  "(6) pegarlas en el orden equivocado (PARTE 2 antes que la 1) deja lo mismo",
  DESHACER + PEGAR(PARTE_2) + PEGAR(PARTE_1) + DESPUES_DE_PEGAR,
  CERRADO
);
caso(
  "(6) solo la PARTE 1: cierra las funciones; la lectura directa sigue abierta hasta la PARTE 2 (por eso van las dos)",
  DESHACER + PEGAR(PARTE_1) + ATAQUE,
  `3\n${SIN_MODULO}\n${SIN_MODULO}`
);
caso(
  "(6) solo la PARTE 2: cierra la lectura directa; las funciones siguen abiertas hasta la PARTE 1",
  DESHACER + PEGAR(PARTE_2) + ATAQUE,
  "0\nSIN_ERROR\nSIN_ERROR"
);
// Una función cambiada en vivo (md5 que no es ni «antes» ni «después»): la PARTE 1 aborta con un mensaje claro y NO la pisa.
const CAMBIADA_EN_VIVO = `create or replace function retail.buscar_clienta(p_termino text, p_incluir_archivadas boolean default false)
returns setof retail.clientas language sql stable security definer set search_path = retail, public, extensions as $q$
  select * from retail.clientas where nullif(btrim(p_termino), '') is not null and dni = btrim(p_termino) limit 5;
$q$;\n`;
caso(
  "(6) candado de versión: con buscar_clienta cambiada en vivo, la PARTE 1 aborta con un mensaje claro",
  DESHACER + CAMBIADA_EN_VIVO + PEGAR(PARTE_1),
  (o) => o.startsWith("ERROR_DE_SCRIPT") && o.includes("buscar_clienta(text,boolean) cambió desde que se escribió esta migración")
);
caso(
  "(6) …y no pisa NADA: ni esa función ni las otras 10 (todo el pegado se deshace)",
  // Sin ON_ERROR_STOP y dentro de un savepoint: si el candado aborta, se vuelve al savepoint para mirar qué quedó. Si NO
  // abortara, no se revierte nada y las funciones ya reemplazadas lo delatan.
  DESHACER + CAMBIADA_EN_VIVO +
    `\\set ON_ERROR_STOP off\nsavepoint antes_de_pegar;\n${PARTE_1}\n\\if :ERROR\nrollback to savepoint antes_de_pegar;\n\\endif\n\\set ON_ERROR_STOP on\n` +
    `set local search_path = retail, public, extensions;\n` +
    `select position('limit 5' in prosrc) > 0 from pg_proc where oid = 'retail.buscar_clienta(text,boolean)'::regprocedure;\n` +
    `select to_regprocedure('retail.fn_exigir_modulo(text)') is null;\n` +
    `select ${md5Norm("prosrc")} from pg_proc where oid = 'retail.registrar_clienta(text,text,text,boolean,smallint,smallint)'::regprocedure;\n` +
    `select ${md5Norm("prosrc")} from pg_proc where oid = 'retail.fn_actividad_separacion(uuid,text,text)'::regprocedure;\n`,
  `t\nt\n${VERSIONES.find((v) => v.firma.startsWith("retail.registrar_clienta")).antes}\n${VERSIONES.find((v) => v.firma.startsWith("retail.fn_actividad_separacion")).antes}`
);
// La actividad que las funciones de hoy escriben con el nombre (las de Clientas y las de un apartado suyo): la PARTE 1 la
// reescribe una vez, sin tocar cuántas filas hay.
const ACTIVIDAD_VIEJA = `${como(FELIPE)}${intento(LLAMADAS.editar_clienta)}${intento(`select retail.archivar_clienta('${FICHA}', 'Ficha Protegida se mudó', false, null)`)}${intento(`select retail.reactivar_clienta('${FICHA}', null)`)}${APARTADO({ codigo: "APT-TRU-9902", clienta: `'${FICHA}'`, nombres: "Ficha", apellidos: "Protegida Prueba", celular: "987777001", como: "sepv" })}reset role;
select count(*) from retail.actividad a where a.modulo = 'clientas' and a.registro_id = '${FICHA}' and a::text ~* '(protegida|90777001)';
select count(*) from retail.actividad a where ${DEL_APARTADO("sepv")} and a::text ~* 'protegida';
`;
const ACTIVIDAD_LIMPIA = `select count(*) from retail.actividad a where a.modulo = 'clientas' and a.registro_id = '${FICHA}' and a::text ~* '(protegida|90777001)';
select count(*) from retail.actividad a where a.modulo = 'clientas' and a.registro_id = '${FICHA}';
select string_agg(descripcion, ',' order by id) from retail.actividad a where a.modulo = 'clientas' and a.registro_id = '${FICHA}';
select count(*) from retail.actividad a where ${DEL_APARTADO("sepv")} and (a::text ~* 'protegida' or a.detalle ? 'clienta');
select count(*) from retail.actividad a where ${DEL_APARTADO("sepv")};
select count(*) from retail.actividad a where ${DEL_APARTADO("sepv")} and a.descripcion ~ ' la clienta( |:|$)';
select tgenabled from pg_trigger where tgrelid = 'retail.actividad'::regclass and tgname = 'trg_actividad_inmutable';
`;
const VIEJA = "SIN_ERROR\nSIN_ERROR\nSIN_ERROR\n3\n4\n";
const LIMPIA = "0\n3\neditó la ficha de una clienta,archivó la ficha de una clienta,reactivó la ficha de una clienta\n0\n4\n4\nO";
caso(
  "(6) la actividad vieja (Clientas con el nombre y el motivo escrito, Apartados con el nombre) queda sin datos de la clienta al pegar la PARTE 1, con las mismas filas y el candado igual",
  DESHACER + ACTIVIDAD_VIEJA + PEGAR(PARTE_1) + ACTIVIDAD_LIMPIA,
  VIEJA + LIMPIA
);
caso(
  "(6) …y pegarla otra vez no vuelve a tocar la actividad (idempotente), ni el candado queda apagado",
  DESHACER + ACTIVIDAD_VIEJA + PEGAR(PARTE_1) + PEGAR(PARTE_1) + ACTIVIDAD_LIMPIA +
    intento(`update retail.actividad set descripcion = 'x' where modulo in ('clientas', 'apartados')`),
  (o) => o.startsWith(VIEJA + LIMPIA + "\n42501|La actividad no se edita ni se borra")
);
caso(
  "(6) CONTROL del vigilante de la actividad: con las funciones de producción nombra las dos de Apartados",
  DESHACER + VIGILANTE_ACTIVIDAD,
  "fn_actividad_separacion,trg_actividad_separacion_hijas"
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

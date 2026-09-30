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
 *      y de un apartado suyo (apartar, abonar, avisar y editar anotan actividad); antes de anonimizar, ninguna frase de la
 *      actividad (Clientas ni Apartados) los lleva; y las cinco ramas de la actividad de un apartado (apartó, entregó,
 *      liberó, devolvió, extendió) dicen «la clienta» sin su nombre, celular ni DNI.
 *   5. Estructura: las 11 empiezan por `fn_exigir_modulo('clientas')` (lo primero que corre); el vigilante nombra toda
 *      función security definer nueva que toque la ficha sin él; otro vigilante nombra toda función que anota actividad
 *      leyendo las columnas de la clienta de un apartado; el ayudante no lo ejecuta nadie de la API; y los md5 «después»
 *      escritos en la PARTE 1 son los de las funciones vivas (las cinco que la tanda 1a del club volvió a cambiar —ADR-0288,
 *      20260930160000—, con los «después» de la 1a; y las tres de ellas que la 1b volvió a cambiar —20260930200000—, con los
 *      de la 1b). Desde la 1b, las funciones security definer que tocan la ficha son las 11 y las 5 del club, todas con el
 *      candado del módulo; y la persona de la sección 4 es socia con publicidad: anonimizar tampoco deja rastro en
 *      `club_permisos` y escribe sus dos `revoca`.
 *   6. CONTROL y pegado: a las 11 funciones vivas se les quita su primera línea (el candado del módulo) y la tabla vuelve a
 *      la política de antes: el ataque PASA (los casos de 1 y 2 muerden); la PARTE 2 pegada, una o dos veces, cierra la
 *      lectura directa y deja las funciones como estaban; con la actividad de Apartados de antes, el vigilante y las cinco
 *      ramas la delatan; y pegar HOY la PARTE 1 aborta sin pisar nada. Hasta el 2026-09-30 esta sección reproducía
 *      producción ANTES de la PARTE 1 y la pegaba encima: por qué eso dejó de ser reproducible, al principio de la sección 6.
 *   7. Dos cajas a la vez con el mismo DNI, en dos conexiones reales: la segunda espera en la lectura de la ficha
 *      (`for update`), antes de decidir si «vuelve» (ROLLBACK). Con BASE_DESECHABLE=1, además la misma carrera con COMMIT
 *      sobre una ficha archivada: una sola línea «reactivó» (deja una ficha de prueba; no corre en el CI).
 *
 * FUERA A PROPÓSITO: los datos que un apartado o un comprobante copiaron al hacerse (documentos de esa operación; ADR-0249).
 *
 * USO
 *   pnpm pruebas:clientas-modulo                  → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:clientas-modulo --base cayla_x   → contra otra base del mismo contenedor
 *   BASE_DESECHABLE=1 pnpm pruebas:clientas-modulo → además (7b), que commitea: SOLO contra un Postgres desechable
 */

import { execFileSync, spawn } from "node:child_process";
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

// La tanda 1a del club (ADR-0288, 20260930160000) volvió a cambiar cinco de las 14: registrar_clienta y editar_clienta
// cambiaron de firma (las de arriba ya no existen: «después» nulo) y buscar, archivar y unir, de cuerpo. Su propia tabla
// de versiones: firma → «antes» (= el «después» de la PARTE 1) y «después» (null = que la firma ya no exista).
const PASO_1A = leer("20260930160000_club_paso1a_venta_ligada_y_documento.sql");
const VERSIONES_1A = [...PASO_1A.matchAll(/\('(retail\.[a-z_]+\([^']*\))',\s+'([0-9a-f]{32})',\s+(null|'([0-9a-f]{32})')\)/g)].map((m) => ({
  firma: m[1],
  antes: m[2],
  despues: m[4] ?? null,
}));
// La cadena no se corta: cada una de las cinco que la 1a tocó partió de lo que dejó la PARTE 1.
const cortadas = VERSIONES.filter((v) => VERSIONES_1A.some((w) => w.firma === v.firma && w.antes !== v.despues));
if (VERSIONES_1A.filter((w) => VERSIONES.some((v) => v.firma === w.firma)).length !== 5 || cortadas.length) {
  console.error(
    `✗ La tabla de versiones de la 1a debería repetir 5 firmas de la PARTE 1 con su «después» como «antes»; no calzan: ${cortadas.map((v) => v.firma).join(", ") || "(faltan firmas)"}.`
  );
  process.exit(1);
}
// La tanda 1b del club (ADR-0288, 20260930200000) volvió a cambiar tres de esas cinco (buscar, archivar y unir, de cuerpo)
// y soltó las dos firmas de registrar_clienta y editar_clienta que había creado la 1a. Su tabla: firma → «antes» (null = la
// firma todavía no existía) y «después» (null = la firma deja de existir).
const PASO_1B = leer("20260930200000_club_paso1b_parte1_whatsapp_tienda.sql") + "\n" + leer("20260930200100_club_paso1b_parte2_permisos_y_qr.sql");
const VERSIONES_1B = [
  ...PASO_1B.matchAll(/\('(retail\.[a-z_]+\([^']*\))',\s+(null|'([0-9a-f]{32})'),\s+(null|'([0-9a-f]{32})')\)/g),
].map((m) => ({ firma: m[1], antes: m[3] ?? null, despues: m[5] ?? null }));
// Tampoco se corta aquí: cada una de las 14 que la 1b tocó partió de lo que dejó la 1a.
const cortadas1b = VERSIONES_1B.filter((w) => VERSIONES_1A.some((v) => v.firma === w.firma && v.despues !== w.antes));
if (VERSIONES_1B.filter((w) => VERSIONES.some((v) => v.firma === w.firma)).length !== 3 || cortadas1b.length) {
  console.error(
    `✗ La tabla de versiones de la 1b debería repetir 3 firmas de la PARTE 1 con el «después» de la 1a como «antes»; no calzan: ${cortadas1b.map((v) => v.firma).join(", ") || "(faltan firmas)"}.`
  );
  process.exit(1);
}
/**
 * El md5 que cada una de las 14 tiene que tener HOY: el «después» de la 1b si la 1b la tocó; si no, el de la 1a si la 1a la
 * tocó; si no, el de la PARTE 1.
 */
const DESPUES_HOY = VERSIONES.map((v) => {
  const b = VERSIONES_1B.find((x) => x.firma === v.firma);
  if (b) return b.despues ?? "NO_EXISTE";
  const w = VERSIONES_1A.find((x) => x.firma === v.firma);
  return w ? (w.despues ?? "NO_EXISTE") : v.despues;
});
/** La firma de registrar_clienta que vive hoy (la de la 1b). */
const REGISTRAR_HOY = "registrar_clienta(text,text,text,text,smallint,smallint,smallint)";
// Las funciones del club de la 1b que tocan la ficha: security definer y con el candado del módulo, como las 11.
const DEL_CLUB = ["registrar_baja_whatsapp", "registrar_desde_whatsapp", "registrar_mensaje_publicidad", "resumen_clienta_caja", "unirse_al_club"];

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

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

/** Una sesión de psql que corre en paralelo con las demás (para la carrera de la sección 7). */
function psqlEnParalelo(sql) {
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
-- Intenta una sentencia y devuelve «SQLSTATE|hint» si el hint es uno de los nuestros (un identificador estable como
-- 'clientas_sin_modulo'), o «SQLSTATE|mensaje» si no, o SIN_ERROR. El Postgres de Supabase (el del CI) le agrega a un
-- «permission denied» la pista «Grant the required privileges…», que uno sin parches no pone: esa no cuenta. No es security
-- definer: corre con los permisos de quien la llama, así se prueba a la cuenta y no a la dueña de la función.
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else v_msg end;
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
insert into retail.clientas (id, documento_numero, nombre, telefono_whatsapp, whatsapp_consentimiento_en, cumple_dia, cumple_mes) values
  ('${FICHA}', '90777001', 'Ficha Protegida Prueba', '987777001', now(), 7, 3),
  ('${OTRA}', null, 'Otra Ficha Prueba', '987777003', null, null, null);
insert into retail.clientas (id, documento_numero, nombre, archivada_en, motivo_archivo) values
  ('${ARCHIVADA}', '90777002', 'Ficha Archivada Prueba', now(), 'prueba');

-- Cuántas líneas de actividad de Clientas había antes del caso (la base la comparten otras pruebas).
select count(*) as act0 from retail.actividad where modulo = 'clientas' \\gset
`;

/** Cambia de cuenta. `responsable`: el uuid que viaja en `x-responsable` (el combo de la terminal), o nada. */
// El rol va en los dos claims: el auth.role() de Supabase lee `claim.role` o `claims->>'role'`, y un stub local de Dynamic
// puede leer solo el primero (la política de antes, que usa el control de la sección 6, pregunta por auth.role()).
const como = (auth, { responsable = null } = {}) =>
  `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', ${responsable ? `json_build_object('x-responsable', '${responsable}')::text` : "'{}'"}, true) as _h \\gset
set local role authenticated;
`;
const comoAnon = `reset role;\nset local request.jwt.claim.role = 'anon';\nset local request.jwt.claims = '{"role":"anon"}';\nset local role anon;\n`;
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);\n`;

// Las 11, en un orden que deja pasar a quien tiene el módulo (archivar va al final: después la ficha ya no se edita).
const LLAMADAS = {
  registrar_clienta: `select retail.registrar_clienta('dni', '90777010', 'Alta Prueba Modulo', null, null, null)`,
  buscar_clienta: `select * from retail.buscar_clienta('90777001')`,
  editar_clienta: `select retail.editar_clienta('${FICHA}', 'dni', '90777001', 'Ficha Protegida Prueba', '987777001', null, null, null, null, null)`,
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
select (select count(*) from retail.clientas where documento_numero = '90777010')
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

// ---- CONTROL: la ficha SIN el candado del módulo (lo que la PARTE 1 y la PARTE 2 cerraron) ----
// Desde la tanda 1a del club ya no se puede recrear la versión de ANTES de cada función (por qué, al principio de la
// sección 6). Lo que la PARTE 1 cerró en las 11 fue su primera línea, `fn_exigir_modulo('clientas')`: aquí se le quita esa
// línea a la versión VIVA de cada una (pg_get_functiondef, dentro de la transacción del caso) y la tabla vuelve a la
// política de antes de la PARTE 2 («cualquiera con sesión»). Aborta si alguna no la tiene exactamente una vez: el control
// nunca «pasa» por no haber quitado nada.
const SIN_CANDADO = `reset role;
do $sin_candado$
declare
  r record;
  v_def text;
  v_linea constant text := 'retail.fn_exigir_modulo(''clientas'');';
begin
  for r in select p.oid from pg_proc p
            where p.pronamespace = 'retail'::regnamespace and p.proname in (${LAS_11.map((n) => `'${n}'`).join(", ")}) loop
    v_def := pg_get_functiondef(r.oid);
    if (length(v_def) - length(replace(v_def, v_linea, ''))) / length(v_linea) <> 1 then
      raise exception '% no lleva el candado del módulo exactamente una vez', r.oid::regprocedure;
    end if;
    execute replace(replace(v_def, 'perform ' || v_linea, ''), 'select ' || v_linea, '');
  end loop;
end
$sin_candado$;
drop policy if exists clientas_select on retail.clientas;
create policy clientas_select on retail.clientas for select using ((select auth.role()) = 'authenticated');
`;
// Las dos funciones de la actividad de Apartados, tal cual las dejó 20260927120000 (así estaban en producción antes de la
// PARTE 1). No leen `clientas`: la tanda 1a no las toca y siguen pudiéndose recrear.
const funcionDe = (archivo, firma) => {
  const t = leer(archivo);
  const ini = t.indexOf(`create or replace function ${firma}`);
  if (ini < 0) throw new Error(`No encontré ${firma} en ${archivo}`);
  return t.slice(ini, t.indexOf("$$;", ini) + 3) + "\n";
};
const APARTADOS_ANTES =
  "reset role;\n" +
  funcionDe("20260927120000_apartados_actividad_y_editar.sql", "retail.fn_actividad_separacion(") +
  funcionDe("20260927120000_apartados_actividad_y_editar.sql", "retail.trg_actividad_separacion_hijas(");
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
    `reset role;\nselect (select created_por from retail.clientas where documento_numero = '90777010') = '${ROSA}'::uuid;\n`,
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
    `select retail.registrar_clienta('dni', '90777600', 'Rebeca Vuelve Prueba', null, null, null) as id1 \\gset
reset role;
insert into retail.ventas (id, ubicacion_id, cliente_id, estado, es_prueba) values (gen_random_uuid(), :'tru', :'id1', 'completada', true) returning id as venta \\gset
${como(FELIPE)}select retail.archivar_clienta(:'id1', 'ya no compra', false, null) as v_archivada \\gset
select retail.registrar_clienta('dni', '90777600', null, '987776000', null, null) as id2 \\gset
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
    `select retail.registrar_clienta('dni', '90777601', 'Rebeca Dos Prueba', '987776001', null, null) as id1 \\gset
select retail.archivar_clienta(:'id1', 'ya no compra', false, null) as _v \\gset
select retail.registrar_clienta('dni', '90777601', 'Rebeca Dos Prueba', null, null, null) as _r1 \\gset
select retail.registrar_clienta('dni', '90777601', 'Rebeca Dos Prueba', null, null, null) as _r2 \\gset
reset role;
select count(*), string_agg(descripcion, ','), bool_and(a::text !~* '(rebeca|90777601|987776001)')
  from retail.actividad a where a.modulo = 'clientas' and a.accion = 'reactivar' and a.registro_id = :'id1';
`,
  "1|reactivó una clienta archivada al volver a registrarla|t"
);
caso(
  "(3) la anonimizada que vuelve con su DNI es una ficha NUEVA (pidió que la olvidaran)",
  como(FELIPE) +
    `select retail.registrar_clienta('dni', '90777602', 'Olvidada Prueba', null, null, null) as id1 \\gset
select retail.archivar_clienta(:'id1', 'pedido de la clienta', true, null) as _v \\gset
select retail.registrar_clienta('dni', '90777602', 'Olvidada Prueba', null, null, null) as id2 \\gset
reset role;
select :'id1' <> :'id2', (select anonimizada from retail.clientas where id = :'id1'), (select archivada_en is null from retail.clientas where id = :'id2');
`,
  "t|t|t"
);
caso(
  "(3) la que se unió a otra: su DNI la lleva a la ficha que se CONSERVÓ, y si esa estaba archivada, la reactiva",
  como(FELIPE) +
    `select retail.registrar_clienta('dni', null, 'Unida Celular Prueba', '987776100', null, null) as queda \\gset
select retail.registrar_clienta('dni', '90777603', 'Unida DNI Prueba', null, null, null) as se_va \\gset
select (retail.unir_clientas(:'queda', :'se_va', null, null)).documento_numero as dni_que_queda \\gset
select retail.archivar_clienta(:'queda', 'se fue de viaje', false, null) as _v \\gset
select retail.registrar_clienta('dni', '90777603', null, null, null, null) as vuelve \\gset
reset role;
select :'dni_que_queda', :'vuelve' = :'queda', (select archivada_en is null from retail.clientas where id = :'queda');
`,
  "90777603|t|t"
);
caso(
  "(3) estado imposible: una ficha unida a otra que deja de estar anonimizada viola clientas_fusionada_implica_anonimizada",
  como(FELIPE) +
    `select retail.registrar_clienta('dni', null, 'Imposible Uno', '987776200', null, null) as a \\gset
select retail.registrar_clienta('dni', null, 'Imposible Dos', '987776201', null, null) as b \\gset
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
/**
 * Las tres fichas de la misma persona: Z se une a Y, e Y a X (la que se conserva). X es socia del club con publicidad (ADR-0288
 * tanda 1b; antes de la 1b, X e Y tenían el permiso de WhatsApp marcado al registrarlas).
 */
const TRES_FICHAS = `${como(FELIPE)}select retail.registrar_clienta('dni', null, 'Zorayda Q', '987770003', null, null) as z \\gset
select retail.registrar_clienta('dni', null, 'Zorayda Pruebaclientas', '987770002', 12::smallint, 5::smallint) as y \\gset
select (retail.unir_clientas(:'y', :'z', null, null)).id as _u1 \\gset
select retail.registrar_clienta('dni', '90777555', 'Zorayda Pruebaclientas Huamanchumo', '987770001', 12::smallint, 5::smallint) as x \\gset
select codigo_club as _cx from retail.unirse_al_club(:'x', '987770001') \\gset
select retail.registrar_mensaje_publicidad(:'x', '987770001') as _px \\gset
select (retail.unir_clientas(:'x', :'y', null, null)).id as _u2 \\gset
`;
const RECORRIDO = `${TRES_FICHAS}select retail.editar_clienta(:'x', 'dni', '90777555', 'Zorayda Pruebaclientas Huamanchumo', '987770001', 12::smallint, 5::smallint, null, '{"superior": "M"}'::jsonb, null) as _e \\gset
select retail.archivar_clienta(:'x', 'Zorayda Pruebaclientas se mudó a Arequipa (DNI 90777555)', false, null) as _a \\gset
select retail.registrar_clienta('dni', '90777555', 'Zorayda Pruebaclientas Huamanchumo', null, null, null) as _r \\gset
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
  "(4) anonimizar deja CERO rastro del DNI, del nombre y de los tres celulares en clientas, clientas_fusiones, actividad y club_permisos (y el motivo escrito no se guarda); escribe los dos `revoca` del club",
  RECORRIDO +
    `${como(FELIPE)}select retail.archivar_clienta(:'x', 'Zorayda Pruebaclientas pidió que la borren, DNI 90777555', true, null) as _anon \\gset
reset role;
select ${cuentaRastro("clientas")}, ${cuentaRastro("clientas_fusiones")}, ${cuentaRastro("actividad")}, ${cuentaRastro("club_permisos")},
       (select count(*) from retail.club_permisos where clienta_id = :'x' and accion = 'revoca' and medio = 'anonimizar'),
       (select motivo_archivo from retail.clientas where id = :'x'),
       (select count(*) from retail.clientas_fusiones where clienta_mantiene_id in (:'x', :'y') and ficha_fusionada ? 'anonimizada_en'),
       (select detalle ->> 'fusiones_limpiadas' from retail.actividad where modulo = 'clientas' and accion = 'anonimizar' and registro_id = :'x'),
       (select count(*) from retail.actividad a where ${DEL_APARTADO()});
`,
  "0|0|0|0|2|Anonimizada (Ley 29733)|2|2|4"
);
caso(
  "(4) las frases de la actividad de Clientas dicen «una clienta» (editar, archivar, reactivar, unir, anonimizar, y las del club: unirse y su publicidad)",
  RECORRIDO +
    `${como(FELIPE)}select retail.archivar_clienta(:'x', 'pedido', true, null) as _anon \\gset
reset role;
select string_agg(distinct accion || '=' || descripcion, ' ; ' order by accion || '=' || descripcion)
  from retail.actividad where modulo = 'clientas' and registro_id in (:'x', :'y', :'z') and accion <> 'unir';
select count(*) from retail.actividad where modulo = 'clientas' and registro_id in (:'x', :'y') and accion = 'unir'
   and descripcion ~ '^unió dos fichas de una misma clienta: ';
`,
  "anonimizar=anonimizó la ficha de una clienta (Ley 29733) ; archivar=archivó la ficha de una clienta ; editar=editó la ficha de una clienta ; " +
    "publicidad_whatsapp=registró que una clienta escribió a la tienda pidiendo publicidad por WhatsApp ; reactivar=reactivó una clienta archivada al volver a registrarla ; " +
    "unirse_club=unió a una clienta al club (su «sí» en caja)\n2"
);
// Las cinco ramas de fn_actividad_separacion, una por una: apartó, entregó, liberó (sola y a mano), devolvió el adelanto
// y extendió. El recorrido de arriba solo pasa por apartar, abonar, avisar y editar; aquí se llama a la función directo
// sobre un apartado con nombre, apellidos, celular y DNI (cada rama escribe su línea sin mirar el estado: el paso de un
// estado a otro lo prueba separaciones.mjs), para que ninguna rama quede sin prueba de comportamiento.
const RAMAS_DEL_APARTADO = `reset role;
insert into retail.separaciones (codigo, ubicacion_id, caja_id, clienta_nombres, clienta_apellidos, clienta_celular, clienta_dni,
  comprobante_tipo, creado_por, total, adelanto, vence_el, devolucion_medio, devolucion_numero, devolucion_medio_real)
values ('APT-TRU-9956', :'tru', (select id from retail.cajas order by id limit 1), 'Zorayda', 'Pruebaclientas Huamanchumo', '987770001', '90777555',
  'boleta', (select id from public.personas where auth_user_id = '${FELIPE}'), 100, 50, current_date + 7, 'yape', '999888777', 'yape')
returning id as ramas \\gset
set constraints retail.actividad_separacion_creada immediate;
select retail.fn_actividad_separacion(:'ramas', r) from unnest(array['apartado_entregado', 'apartado_liberado', 'adelanto_devuelto', 'apartado_extendido']) r;
update retail.separaciones set liberada_por = (select id from public.personas where auth_user_id = '${FELIPE}'), liberada_motivo = 'clienta_desistio'
 where id = :'ramas';
select retail.fn_actividad_separacion(:'ramas', 'apartado_liberado');
`;
const LINEAS_DE_LAS_RAMAS = `(a.modulo = 'apartados' and a.tabla = 'separaciones' and split_part(a.registro_id, ':', 1) = :'ramas')`;
caso(
  "(4) las cinco ramas de la actividad de un apartado (apartó, entregó, liberó sola y a mano, devolvió, extendió) dicen «la clienta» y ninguna lleva su nombre, celular ni DNI",
  `${RAMAS_DEL_APARTADO}select count(*), count(distinct a.accion), count(*) filter (where a.descripcion ~ ' la clienta( |:|$)'),
       count(*) filter (where a::text ~* '(${RASTRO.join("|")})')
  from retail.actividad a where ${LINEAS_DE_LAS_RAMAS};
`,
  "6|5|6|0"
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
// bajar_al_piso, fn_aplicar_movimiento y fn_conciliacion_contable («clientas» en un mensaje o un título). Y desde la tanda 1a
// del club (ADR-0288 D-1, 2026-09-30), registrar_venta: lee solo id, anonimizada y fusionada_en_id de la ficha que manda
// Cobrar, para ligarle la venta, y no devuelve nada de ella. No exige el módulo a propósito (cabecera de 20260930160000,
// «DECIDÍ»): el id solo sale de buscar_clienta, que sí lo exige, y exigirlo aquí haría fallar una venta entera encolada sin
// conexión si al rol le quitaron el módulo en el camino.
const LISTA_BLANCA = ["fn_ventas_del_dia", "separar_prendas", "bajar_al_piso", "fn_aplicar_movimiento", "fn_conciliacion_contable", "registrar_venta"];
const VIGILANTE = (condicion) => `select coalesce(string_agg(x.proname, ',' order by x.proname), 'ninguna')
  from (select p.proname, ${SIN_COMENTARIOS} as src, pg_get_function_result(p.oid) as retorna
          from pg_proc p
         where p.pronamespace = 'retail'::regnamespace and p.prosecdef
           and p.proname not in (${LISTA_BLANCA.map((n) => `'${n}'`).join(", ")})) x
 where (x.proname ~ 'clienta' or x.retorna ~* 'clientas' or x.src ~* '(\\mclientas\\M|telefono_whatsapp|whatsapp_consentimiento_en|cumple_dia|cumple_mes)')
   and ${condicion};\n`;
caso(
  "(5) vigilante: las funciones security definer que tocan la ficha son exactamente las 11 y las 5 del club (tanda 1b), y todas llevan el candado del módulo",
  VIGILANTE("true") + VIGILANTE(`x.src !~ 'fn_exigir_modulo\\(''clientas''\\)'`),
  `${[...LAS_11, ...DEL_CLUB].sort().join(",")}\nninguna`
);
caso(
  "(5) el vigilante muerde: una función NUEVA que devuelve el DNI sin el candado (o con el candado solo en un comentario) sale nombrada",
  `create function retail.zz_vigilante_sin_candado() returns text language plpgsql security definer as $fn$ begin return (select documento_numero from retail.clientas limit 1); end; $fn$;
create function retail.zz_vigilante_comentario() returns text language plpgsql security definer as $fn$
begin
  -- perform retail.fn_exigir_modulo('clientas');
  return (select telefono_whatsapp from retail.clientas limit 1);
end; $fn$;
create function retail.zz_vigilante_con_candado() returns text language plpgsql security definer as $fn$
begin
  perform retail.fn_exigir_modulo('clientas');
  return (select documento_numero from retail.clientas limit 1);
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
  "(5) los md5 «después» escritos en la PARTE 1 son los de las funciones vivas; las que las tandas 1a y 1b del club volvieron a cambiar, con el «después» de la última que las tocó (si alguien edita una sin actualizar su tabla, esto lo dice)",
  MD5_VIVOS,
  DESPUES_HOY.join("\n")
);

// =====================================================================================================================
// 6. CONTROL y pegado
// =====================================================================================================================
// POR QUÉ ESTA SECCIÓN CAMBIÓ EL 2026-09-30. Hasta la tanda 1a del club (ADR-0288, 20260930160000), aquí se reproducía
// producción ANTES de la PARTE 1 —recreando desde sus archivos las 11 funciones de antes (20260928160000 a 180000 y
// registrar_clienta de 20260922140000), sin el ayudante ni el candado nuevo— y se pegaban encima la PARTE 1 y la PARTE 2
// tal como están en disco: el ataque pasaba, y se cerraba; pegarlas dos veces o al revés dejaba lo mismo; el candado de
// versión abortaba con una función cambiada en vivo; y la PARTE 1 limpiaba la actividad y las anonimizadas de antes
// (sus secciones 13 y 14). Con la 1a eso dejó de ser reproducible, por el esquema y no por la prueba:
//   - `clientas.dni` pasó a llamarse `documento_numero`: el `buscar_clienta` de antes (language sql) ya ni se crea
//     («column "dni" does not exist»), y las de antes en plpgsql se crearían pero fallarían al correr;
//   - la PARTE 1 aborta en su candado de versión, a propósito: la firma que conocía de registrar_clienta ya no existe.
// Reconstruir ese «antes» obligaría a deshacer la 1a dentro de la prueba (y mañana la 1b, y así): una cadena de migraciones
// al revés para volver a probar un archivo que producción ya tiene (lo confirma la 1a: sus «antes» son los «después» de la
// PARTE 1, y el arranque de esta prueba lo exige). Por eso se retiraron: el control por md5 de las funciones de antes,
// pegar la PARTE 1 (una o dos veces, antes o después de la 2, o sola), su candado con una función cambiada en vivo, y la
// limpieza de la actividad y de las anonimizadas de antes (una sola vez, y en producción no había nada que limpiar).
// Lo que la 1a pega hoy —candado de versión, pegarla dos veces, una función cambiada en vivo— lo prueba
// scripts/pruebas/club_venta_ligada.mjs (casos «g»).
// Lo que sigue siendo reproducible, y es lo que hace de esta prueba una prueba (que sus casos muerden), se queda:
// - el ataque con las funciones vivas SIN su candado y la política de antes (SIN_CANDADO, arriba);
// - la PARTE 2 (solo políticas: no nombra `dni`), pegada sobre la política de antes;
// - el vigilante de la actividad y las cinco ramas con la actividad de Apartados de antes;
// - y que pegar HOY la PARTE 1 por error no pisa nada (ni deshace la 1a).
const ATAQUE = `${como(T_ALMACEN)}${LEE_DIRECTO}${intento(LLAMADAS.buscar_clienta)}${intento(LLAMADAS.fn_clienta_separaciones)}`;
const QUEDAN_CON_CANDADO = `reset role;
select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in (${LAS_11.map((n) => `'${n}'`).join(", ")})
   and p.prosrc ~ 'fn_exigir_modulo';
`;
caso(
  "(6) CONTROL sin el candado del módulo (ninguna de las 11 lo conserva) y con la política de antes: Terminal Almacén lee la ficha por la tabla y por las funciones (el ataque PASA)",
  SIN_CANDADO + QUEDAN_CON_CANDADO + ATAQUE,
  "0\n3\nSIN_ERROR\nSIN_ERROR"
);
caso(
  "(6) CONTROL de (1): sin el candado, Terminal Almacén ya no recibe clientas_sin_modulo en ninguna de las 11 (lee, y lo que guarda pide «elige quién»)",
  SIN_CANDADO + como(T_ALMACEN) + TODAS,
  (s) => s.split("\n").length === LAS_11.length && !s.split("\n").includes(SIN_MODULO)
);
caso(
  "(6) CONTROL sin el candado: Micaela sin Clientas registra una ficha (el ataque PASA)",
  SIN_CANDADO +
    `delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';\n` +
    como(MICAELA) + intento(LLAMADAS.registrar_clienta) + `reset role;\nselect count(*) from retail.clientas where documento_numero = '90777010';\n`,
  "SIN_ERROR\n1"
);
const POLITICAS = `reset role;
select string_agg(polname || ':' || replace(pg_get_expr(polqual, polrelid), 'retail.', ''), ',' order by polname) from pg_policy where polrelid in ('retail.clientas'::regclass, 'retail.clientas_fusiones'::regclass);
`;
caso(
  "(6) pegar la PARTE 2 (tal como está en disco) sobre la política de antes cierra la lectura directa y deja pasar al líder; las funciones siguen abiertas hasta tener su candado (por eso eran dos partes)",
  SIN_CANDADO + PEGAR(PARTE_2) + ATAQUE + como(FELIPE) + LEE_DIRECTO + POLITICAS,
  "0\nSIN_ERROR\nSIN_ERROR\n3\nclientas_select:( SELECT fn_ve_modulo('clientas'::text) AS fn_ve_modulo)"
);
caso(
  "(6) pegar la PARTE 2 dos veces deja lo mismo: una sola política, la del módulo",
  SIN_CANDADO + PEGAR(PARTE_2) + PEGAR(PARTE_2) + ATAQUE + como(FELIPE) + LEE_DIRECTO + POLITICAS,
  "0\nSIN_ERROR\nSIN_ERROR\n3\nclientas_select:( SELECT fn_ve_modulo('clientas'::text) AS fn_ve_modulo)"
);
caso(
  "(6) pegar HOY la PARTE 1 (ya superada por la 1a) aborta con un mensaje claro: su candado no encuentra la firma vieja de registrar_clienta",
  PEGAR(PARTE_1),
  (o) =>
    o.startsWith("ERROR_DE_SCRIPT") &&
    o.includes("retail.registrar_clienta(text,text,text,boolean,smallint,smallint) no existe en esta base")
);
caso(
  "(6) …y no pisa NADA: las 14 siguen con los md5 de hoy, y la registrar_clienta de hoy (la de la 1b) sigue siendo la única",
  // Sin ON_ERROR_STOP y dentro de un savepoint: si el candado aborta, se vuelve al savepoint para mirar qué quedó. Si NO
  // abortara, no se revierte nada y las funciones ya reemplazadas lo delatan.
  `\\set ON_ERROR_STOP off\nsavepoint antes_de_pegar;\n${PARTE_1}\n\\if :ERROR\nrollback to savepoint antes_de_pegar;\n\\endif\n\\set ON_ERROR_STOP on\n` +
    `set local search_path = retail, public, extensions;\n` +
    MD5_VIVOS +
    `select string_agg(p.oid::regprocedure::text, ',') from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_clienta';\n`,
  `${DESPUES_HOY.join("\n")}\n${REGISTRAR_HOY}`
);
caso(
  "(6) CONTROL del vigilante de la actividad: con las funciones de Apartados de antes de la PARTE 1 nombra las dos",
  APARTADOS_ANTES + VIGILANTE_ACTIVIDAD,
  "fn_actividad_separacion,trg_actividad_separacion_hijas"
);
caso(
  "(6) CONTROL de las cinco ramas: con las funciones de Apartados de antes de la PARTE 1, las 6 líneas del apartado llevan su nombre",
  `${APARTADOS_ANTES}${RAMAS_DEL_APARTADO}select count(*), count(*) filter (where a::text ~* '(${RASTRO.join("|")})')
  from retail.actividad a where ${LINEAS_DE_LAS_RAMAS};
`,
  "6|6"
);

// =====================================================================================================================
// 7. Dos cajas registran a la vez a la misma clienta (dos conexiones reales)
// =====================================================================================================================
// La caja A registra un DNI que ya tiene ficha y se queda con la transacción abierta; la caja B espera a verla dormida con
// la fila tomada y registra el mismo DNI. `registrar_clienta` toma la ficha con `for update` ANTES de mirar si estaba
// archivada: B tiene que esperar en ESA lectura, no más abajo. Sin el `for update`, B lee la ficha todavía archivada, decide
// que «vuelve», y recién espera en el alta: cuando A confirma, anota una segunda «reactivó» (7b lo muestra con COMMIT).
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
/** La sesión A: registra el DNI, duerme con la fila tomada y termina con `fin` (rollback o commit). */
const cajaA = (app, dni, fin) => `set application_name = '${app}';
begin;
set local search_path = retail, public, extensions;
${como(FELIPE)}select retail.registrar_clienta('dni', '${dni}', null, null, null, null);
select pg_sleep(3);
${fin};
`;
/** Antes de la sesión B: espera (hasta 10 s) a que A esté dormida con su transacción abierta, y dice si la vio. */
const esperarA = (app) => `do $espera$ begin
  for i in 1..200 loop
    perform pg_stat_clear_snapshot();
    exit when exists (select 1 from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep');
    perform pg_sleep(0.05);
  end loop;
end $espera$;
select exists (select 1 from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep');
`;
async function carrera(nombre, fn) {
  casos++;
  let obtenido;
  let bien;
  try {
    [bien, obtenido] = await fn();
  } catch (e) {
    [bien, obtenido] = [false, `ERROR_DE_SCRIPT ${e.message}`];
  }
  if (!bien) fallas++;
  console.log(`${bien ? "✓" : "✗"} ${nombre}${bien ? "" : `\n    obtenido: ${String(obtenido).split("\n").join("\n              ")}`}`);
}

await carrera(
  "(7a) dos cajas a la vez con el mismo DNI: la segunda ESPERA en la lectura de la ficha (`for update`), antes de decidir si estaba archivada (sin COMMIT: las dos terminan en ROLLBACK)",
  async () => {
    const dni = correr(
      `select documento_numero from retail.clientas where documento_tipo = 'dni' and documento_numero is not null and not anonimizada order by documento_numero limit 1;`
    );
    if (!dni.ok || !dni.salida) return [false, `no hay ninguna ficha con DNI en la base (el seed trae 8): ${dni.mensaje ?? ""}`];
    const app = `clientas_modulo_a_${Date.now()}`;
    const a = psqlEnParalelo(cajaA(app, dni.salida, "rollback"));
    await dormir(100);
    const b = await psqlEnParalelo(`${esperarA(app)}begin;
set local search_path = retail, public, extensions;
create function pg_temp.donde_espera(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_contexto text;
begin
  execute p_sql;
  return 'SIN_ESPERA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_contexto = pg_exception_context;
  return v_estado || '|' || case when v_contexto ~* 'for update' then 'en la lectura de la ficha'
                                 else 'en otra sentencia: ' || regexp_replace(v_contexto, '\\s+', ' ', 'g') end;
end $f$;
grant execute on function pg_temp.donde_espera(text) to authenticated;
set local lock_timeout = '1s';
${como(FELIPE)}select pg_temp.donde_espera($q$select retail.registrar_clienta('dni', '${dni.salida}', null, null, null, null)$q$);
rollback;
`);
    const ra = await a;
    const obtenido = `${ra.ok ? "A ok" : `A falló: ${ra.mensaje}`}\n${b.ok ? b.salida : `B falló: ${b.mensaje}`}`;
    return [obtenido === "A ok\nt\n55P03|en la lectura de la ficha", obtenido];
  }
);

// (7b) La misma carrera con COMMIT, para ver el resultado de negocio: una sola ficha, reactivada, y UNA sola línea
// «reactivó». Deja rastro (una ficha de prueba y su línea de actividad, que no se borra), así que solo corre contra un
// Postgres desechable, como bajada_al_piso_concurrencia: BASE_DESECHABLE=1. En el CI no corre (su Postgres lo comparten
// todos los pasos); ahí vigila (7a).
if (process.env.BASE_DESECHABLE === "1") {
  await carrera(
    "(7b) con COMMIT: dos cajas registran a la vez a la misma clienta ARCHIVADA → la misma ficha, reactivada, y una sola línea «reactivó»",
    async () => {
      const prep = correr(`select d from (select '8' || lpad(floor(random() * 1e7)::int::text, 7, '0') as d from generate_series(1, 50)) x
 where not exists (select 1 from retail.clientas c where c.documento_tipo = 'dni' and c.documento_numero = x.d) limit 1 \\gset
insert into retail.clientas (documento_numero, nombre, archivada_en, motivo_archivo)
  values (:'d', 'Prueba de concurrencia clientas-modulo', now(), 'prueba de concurrencia') returning id || '|' || documento_numero;`);
      if (!prep.ok) return [false, prep.mensaje];
      const [id, dni] = prep.salida.split("|");
      const app = `clientas_modulo_a_${Date.now()}`;
      const a = psqlEnParalelo(cajaA(app, dni, "commit"));
      await dormir(100);
      const b = await psqlEnParalelo(`${esperarA(app)}begin;
set local search_path = retail, public, extensions;
${como(FELIPE)}select retail.registrar_clienta('dni', '${dni}', null, null, null, null);
commit;
`);
      const ra = await a;
      const fin = correr(`select count(*) from retail.actividad a where a.modulo = 'clientas' and a.accion = 'reactivar' and a.registro_id = '${id}';
select count(*) || '|' || bool_and(archivada_en is null) from retail.clientas where documento_tipo = 'dni' and documento_numero = '${dni}';`);
      const obtenido = [ra.ok ? ra.salida : `A falló: ${ra.mensaje}`, b.ok ? b.salida : `B falló: ${b.mensaje}`, fin.ok ? fin.salida : fin.mensaje]
        .join("\n")
        .replace(/\n+/g, "\n");
      return [obtenido === `${id}\nt\n${id}\n1\n1|true`, obtenido];
    }
  );
} else {
  console.log("· (7b) la carrera con COMMIT no corrió: solo corre con BASE_DESECHABLE=1 (deja una ficha de prueba y su línea de actividad)");
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Pruebas de las acciones sin responsable (migración `20260929230000_acciones_sin_responsable.sql`) — CAYLA V2.
 *
 * QUÉ PRUEBA. Que las 28 acciones que se soltaron del combo «Responsable» (2026-09-29, de las 30 que Felipe marcó) se puedan hacer sin elegir a nadie,
 * y que TODO lo demás siga exigiéndolo:
 *   · persona + clave de la lista + sin asistencia → firma ella (no pide responsable ni marca de entrada);
 *   · terminal + clave de la lista → la acción queda SIN persona (NULL), no se rechaza;
 *   · terminal o persona SIN clave, o con una clave que no está en la lista (la caja, la venta…) → el candado de siempre
 *     (`responsable_requerido`): un encabezado inventado no abre nada;
 *   · con un responsable elegido, la clave no cambia nada: firma el responsable y le pide estar presente;
 *   · «volver»: con la tabla vacía, todo vuelve a exigir responsable;
 *   · la tabla no se lee ni se escribe desde la API (RLS sin políticas).
 *
 * CÓMO. Mismo patrón que `terminales_sin_persona.mjs`: cada caso en su transacción con ROLLBACK; la terminal, Rosa y la
 * asistencia de Dynamic se crean dentro. El encabezado HTTP se simula con `request.headers`, como hace PostgREST.
 *
 * USO
 *   pnpm pruebas:responsable-omitido                 → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:responsable-omitido --base cayla_x  → contra otra base del mismo contenedor
 *   … --en-seco                                       → carga la migración dentro de cada caso (la base aún no la tiene)
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
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260929230000_acciones_sin_responsable.sql"), "utf8");

const MICAELA_AUTH = "22222222-2222-4222-8222-000000000003"; // colaboradora de Trujillo (seed), no es admin
const T_VENTAS_AUTH = "33333333-3333-4333-8333-0000000000a1"; // cuenta de la terminal de ventas de Trujillo
const ROSA = "33333333-3333-4333-8333-0000000000b1"; // integrante de Trujillo, sin cuenta (la responsable)

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
-- El interruptor de producción: TODA operación de tienda exige responsable.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
delete from public.marcajes;
delete from public.jornadas;
create temp table ids as
  select (select id from retail.ubicaciones where nombre = 'Tienda Trujillo') as tru,
         (select sede_dynamic_id from retail.ubicaciones where nombre = 'Tienda Trujillo') as sede_tru,
         (select id from public.personas where auth_user_id = '${MICAELA_AUTH}') as micaela;
grant select on ids to authenticated;
insert into auth.users (id, aud, role, email) values ('${T_VENTAS_AUTH}', 'authenticated', 'authenticated', 'terminal-ventas-tru@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  select tru, 'Terminal Ventas TRU', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS_AUTH}'::uuid from ids;
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) select '${ROSA}', 'Rosa', 'Prueba', 'activo', sede_tru from ids;
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) select '${ROSA}', 'colaborador', tru from ids;
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const conEncabezados = (obj) => `select set_config('request.headers', '${JSON.stringify(obj)}', true) \\g /dev/null\n`;
const marca = (persona, sede, tipo, hora) =>
  `insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca) select ${persona}, ${sede}, '${tipo}', ${hora} from ids;\n`;
const HOY = (hhmm) => `((now() at time zone 'America/Lima')::date + time '${hhmm}') at time zone 'America/Lima'`;
const actor = `select pg_temp.intento('select retail.fn_actor_persona_id()');`;
const actorValor = `select coalesce(retail.fn_actor_persona_id()::text, 'NULL');`;

// Pasada la medianoche de Lima los casos de «hoy 00:01» no tienen pasado (ver `terminales_sin_persona.mjs`).
const DIA_MS = 24 * 3600e3;
const msDelDiaLima = () => (((Date.now() - 5 * 3600e3) % DIA_MS) + DIA_MS) % DIA_MS;
if (msDelDiaLima() < 3 * 60e3 || msDelDiaLima() > DIA_MS - 30e3) {
  const espera = (3 * 60e3 - msDelDiaLima() + DIA_MS) % DIA_MS;
  console.log(`Pasada la medianoche de Lima espero ${Math.ceil(espera / 1000)} s.`);
  await new Promise((listo) => setTimeout(listo, espera));
}

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

// ---------------- Terminal ----------------
caso("terminal + acción soltada (conteo_cerrar) + sin responsable → firma NADIE (NULL), sin error", como(T_VENTAS_AUTH) + conEncabezados({ "x-responsable-omitido": "conteo_cerrar" }) + actorValor, "NULL");
caso("terminal + acción soltada, sin error de rechazo", como(T_VENTAS_AUTH) + conEncabezados({ "x-responsable-omitido": "color_rechazar" }) + actor, "SIN_ERROR");
caso("terminal SIN clave → el candado de siempre", como(T_VENTAS_AUTH) + actor, "42501|responsable_requerido");
caso("terminal con una clave que NO está en la lista (caja_cerrar) → rechazada: un encabezado inventado no abre nada", como(T_VENTAS_AUTH) + conEncabezados({ "x-responsable-omitido": "caja_cerrar" }) + actor, "42501|responsable_requerido");
caso("terminal con clave vacía → rechazada", como(T_VENTAS_AUTH) + conEncabezados({ "x-responsable-omitido": "  " }) + actor, "42501|responsable_requerido");
caso(
  "terminal con responsable presente + clave → firma el RESPONSABLE (la clave no cambia nada)",
  marca(`'${ROSA}'::uuid`, "sede_tru", "entrada", HOY("00:01")) + como(T_VENTAS_AUTH) +
    conEncabezados({ "x-responsable": ROSA, "x-responsable-omitido": "conteo_cerrar" }) + `select (retail.fn_actor_persona_id() = '${ROSA}'::uuid)::text;`,
  "true"
);
caso(
  "terminal con responsable NO presente + clave → sigue rechazada (elegir a alguien sigue pasando por el candado)",
  como(T_VENTAS_AUTH) + conEncabezados({ "x-responsable": ROSA, "x-responsable-omitido": "conteo_cerrar" }) + actor,
  "42501|responsable_no_presente"
);

// ---------------- Persona ----------------
caso("persona SIN clave y con el interruptor encendido → pide responsable (no cambia lo de siempre)", como(MICAELA_AUTH) + actor, "42501|responsable_requerido");
caso(
  "persona + acción soltada + SIN marca de entrada → firma ella misma",
  como(MICAELA_AUTH) + conEncabezados({ "x-responsable-omitido": "color_rechazar" }) + `select (retail.fn_actor_persona_id() = micaela)::text from ids;`,
  "true"
);
caso("persona con una clave que NO está en la lista → pide responsable", como(MICAELA_AUTH) + conEncabezados({ "x-responsable-omitido": "registrar_venta" }) + actor, "42501|responsable_requerido");

// ---------------- Sin sesión y el uso de siempre ----------------
caso("sin sesión (scripts) → nadie, como antes", `set local request.jwt.claim.sub = '';\nset local request.jwt.claims = '{}';\n` + actorValor, "NULL");
caso(
  "fn_actor_persona_id(false) de una persona sigue igual (compara con la cuenta)",
  como(MICAELA_AUTH) + `select (retail.fn_actor_persona_id(false) = micaela)::text from ids;`,
  "true"
);

// ---------------- «Volver» ----------------
caso(
  "VOLVER: con la tabla vacía, la terminal vuelve a exigir responsable aunque mande la clave",
  `delete from retail.acciones_sin_responsable;\n` + como(T_VENTAS_AUTH) + conEncabezados({ "x-responsable-omitido": "conteo_cerrar" }) + actor,
  "42501|responsable_requerido"
);
caso(
  "VOLVER: con la tabla vacía, la persona vuelve a pedir responsable",
  `delete from retail.acciones_sin_responsable;\n` + como(MICAELA_AUTH) + conEncabezados({ "x-responsable-omitido": "conteo_cerrar" }) + actor,
  "42501|responsable_requerido"
);

// ---------------- La lista ----------------
// 28 de la siembra (20260929230000) y, con todas las migraciones, 3 más de Avisos del club (20261002170000) y 3 de la cola de arranque
// de ventas sin registrar (cerrar, reabrir e identificar: 20261005100100, 20261005110000 y 20261005120000; ADR-0334). Es el MISMO número que
// fija `apps/web/lib/responsable-omitido.test.ts`, que lo cuenta leyendo las migraciones: sumar una acción es sumarla en los dos.
// Menos una: Editar producto (`producto_confirmar_cambios`) vuelve a pedir responsable desde 20261006180100 (ADR-0354).
const TOTAL = EN_SECO ? "28" : "33";
caso(`la lista tiene las ${TOTAL} acciones soltadas`, `select count(*) from retail.acciones_sin_responsable;`, TOTAL);
caso("la caja, la venta y los cambios NO están en la lista", `select count(*) from retail.acciones_sin_responsable where clave ~ '(caja|venta|cambio_prenda|devolucion|gasto|cierre_mes)';`, "0");
caso(
  "la API no lee ni escribe la lista (RLS sin políticas, sin permisos)",
  `set local role authenticated;\nselect pg_temp.intento('select * from retail.acciones_sin_responsable') || ',' || pg_temp.intento($$delete from retail.acciones_sin_responsable$$);`,
  // El texto lo pone Supabase (a veces con un GRANT sugerido): basta que las dos vayan con 42501 (sin permiso).
  (s) => s.split(",").length >= 2 && s.startsWith("42501|") && s.includes(",42501|")
);
caso(
  `la migración se puede pegar dos veces (re-ejecutable): sigue habiendo ${TOTAL}`,
  (EN_SECO ? MIGRACION : "") + `select count(*) from retail.acciones_sin_responsable;`,
  TOTAL
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE}${EN_SECO ? ", en seco" : ""})`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Prueba de ADR-0208 «Frescura del piso», paso 4b — la libreta de «Ya decidí» (`retail.frescura_decisiones`):
 *   PARTE 1  20261001100000_frescura_decisiones_tabla.sql       la tabla y sus candados
 *   PARTE 2  20261001100100_frescura_decisiones_funciones.sql   quién puede, anotar, anular y leer
 *   PARTE 3  20261001100200_frescura_decisiones_en_eliminar.sql eliminar un producto con historia conoce la libreta
 *
 * POR QUÉ. Una decisión anotada dice «esta prenda ya no está por decidir»: si la base dejara anotar dos a la vez, perder
 * una, editar una vieja o anular lo que no existe, la pantalla mostraría a la encargada una historia que no pasó. Esos
 * estados los tiene que impedir la BASE (un constraint vale más que diez validaciones en el código), y eso solo se ve
 * INSERTANDO directamente como `postgres` (T1) y con carreras de verdad (T5, cada una con COMMIT).
 *
 * QUÉ CUBRE
 *   T0  forma: una sola versión de cada función, security definer donde toca, anon sin EXECUTE.
 *   T1  ESQUEMA (INSERT directo: lo tiene que rechazar la BASE). Cada candado tiene su MUTANTE: se quita el constraint y la
 *       misma fila tiene que pasar (si no, la prueba no vigilaba nada). Los casos que ya pasaron a mano en PG17 y el que
 *       encontró esta prueba: «anular sin anterior» daba NULL en el CHECK y el CHECK deja pasar el NULL.
 *
 * CÓMO. Cada caso corre en una transacción con ROLLBACK (no deja nada), como frescura_bajadas.mjs; las carreras (T5)
 * confirman de verdad y limpian lo suyo. El `docker` de las pruebas del repo es un contenedor local; con Homebrew se
 * antepone un `docker` falso al PATH (ver memoria postgres-desechable-sin-docker).
 *
 * USO
 *   pnpm pruebas:frescura-decisiones    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

let fallos = 0;
let total = 0;
function afirmar(nombre, condicion, detalle = "") {
  total += 1;
  if (condicion) console.log(`  ✔ ${nombre}`);
  else {
    fallos += 1;
    console.log(`  ✘ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}

/** Las líneas `CLAVE|valor` que imprime un caso, por clave (las que no tienen esa forma se ignoran). */
function parsear(salida) {
  const otras = {};
  for (const linea of salida.split("\n")) {
    if (/^[A-Z][A-Z0-9_]*\|/.test(linea)) {
      const [clave, ...resto] = linea.split("|");
      otras[clave] = resto.join("|");
    }
  }
  return otras;
}

function correr(titulo, sql, verificar) {
  console.log(`\n${titulo}`);
  let salida;
  try {
    salida = psql(sql);
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el caso no corrió: ${String(e.stderr || e.message).split("\n").filter(Boolean).slice(0, 4).join(" / ")}`);
    return;
  }
  verificar(parsear(salida));
}

/** Todo caso empieza igual: el líder en sesión y una prenda + sede con las que colgar los renglones. */
const PRELUDIO = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as ubic2 from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
select id as prod from retail.productos where referencia = 'Blusa Emma' \\gset
select id as prod2 from retail.productos where referencia = 'Blusa Valentina' \\gset
select id as pers from public.personas where auth_user_id = '${FELIPE}' \\gset
select codigo as col from retail.colores order by codigo limit 1 \\gset
select codigo as col2 from retail.colores order by codigo offset 1 limit 1 \\gset

-- Ejecuta un SQL y devuelve «ok» o el error con el NOMBRE del constraint que lo rechazó: la BASE es la que dice que no.
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $$
declare v_estado text; v_msg text; v_c text; v_h text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_c = constraint_name, v_h = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'constraint', v_c, 'hint', nullif(v_h, ''), 'msg', v_msg);
end $$;
-- Como intento, pero devuelve lo que la llamada responde (un jsonb): {ok:true, r:{…}} o el error.
create function pg_temp.llamar(p_sql text) returns jsonb language plpgsql as $$
declare v_estado text; v_msg text; v_c text; v_h text; v_r jsonb;
begin
  execute p_sql into v_r;
  return jsonb_build_object('ok', true, 'r', v_r);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_c = constraint_name, v_h = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'constraint', v_c, 'hint', nullif(v_h, ''), 'msg', v_msg);
end $$;

-- Un renglón directo en la tabla (como postgres, sin pasar por ninguna función).
create function pg_temp.ins(
  p_ubic uuid, p_prod uuid, p_color text, p_accion text,
  p_ant uuid default null, p_ant_accion text default null, p_transf uuid default null, p_nota text default null,
  p_plazo integer default 7, p_pers uuid default null, p_token uuid default gen_random_uuid(), p_id uuid default gen_random_uuid()
) returns jsonb language plpgsql as $$
declare v_pers uuid := coalesce(p_pers, current_setting('prueba.pers')::uuid); r jsonb;
begin
  r := pg_temp.intento(format(
    'insert into retail.frescura_decisiones (id, ubicacion_id, producto_id, color_codigo, accion, anterior_id, anterior_accion, transferencia_id, nota, plazo_dias, persona_id, token_cliente)
     values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %s, %L, %L)',
    p_id, p_ubic, p_prod, p_color, p_accion, p_ant, p_ant_accion, p_transf, p_nota,
    coalesce(p_plazo::text, 'null'), v_pers, p_token));
  return r || jsonb_build_object('id', p_id);
end $$;
select set_config('prueba.pers', :'pers', true) as _1 \\gset

-- El n-ésimo color del catálogo: cada fila mala usa el suyo, así ninguna choca con otra por accidente.
create function pg_temp.k(n integer) returns text language sql as $$ select codigo from retail.colores order by codigo offset n limit 1 $$;
-- Una cabeza nueva (primera línea de una libreta) y su id: el antecedente propio de una fila mala.
create function pg_temp.cab(p_ubic uuid, p_prod uuid, p_color text, p_accion text default 'cambie_lugar') returns uuid language sql as $$
  select (pg_temp.ins(p_ubic, p_prod, p_color, p_accion) ->> 'id')::uuid
$$;

-- «ok» / el constraint que lo rechazó, en una palabra para comparar.
create function pg_temp.res(r jsonb) returns text language sql as $$
  select case when (r ->> 'ok')::boolean then 'ok' else (r ->> 'estado') || ':' || coalesce(nullif(r ->> 'hint', ''), nullif(r ->> 'constraint', ''), '-') end
$$;
`;

// ---------------------------------------------------------------------------------------------------------------------
// T1 · el esquema
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Cada fila mala del esquema: [clave, constraint que la debe rechazar, SQL de la fila mala]. Cada una lleva SU PROPIA prenda
 * (`pg_temp.k(n)`, un color distinto) y, si responde a un renglón, SU PROPIO antecedente: así, sin el constraint que la
 * vigila, la fila pasa limpia (el mutante) y no la frena otro candado por accidente.
 */
const MALAS = [
  ["cabeza_con_color", "23505:frescura_decisiones_una_cabeza", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(0), 'cambie_lugar')`],
  ["cabeza_sin_color", "23505:frescura_decisiones_una_cabeza", `pg_temp.ins(:'ubic', :'prod', null, 'cambie_lugar')`],
  ["bifurca", "23505:frescura_decisiones_una_respuesta", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(0), 'hasta_agotar', :'a', 'cambie_lugar')`],
  ["otro_color", "23503:frescura_decisiones_misma_prenda", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(3), 'hasta_agotar', pg_temp.cab(:'ubic', :'prod', pg_temp.k(2)), 'cambie_lugar')`],
  ["otra_sede", "23503:frescura_decisiones_misma_prenda", `pg_temp.ins(:'ubic2', :'prod', pg_temp.k(4), 'hasta_agotar', pg_temp.cab(:'ubic', :'prod', pg_temp.k(4)), 'cambie_lugar')`],
  ["otro_modelo", "23503:frescura_decisiones_misma_prenda", `pg_temp.ins(:'ubic', :'prod2', pg_temp.k(5), 'hasta_agotar', pg_temp.cab(:'ubic', :'prod', pg_temp.k(5)), 'cambie_lugar')`],
  ["accion_anterior_falsa", "23503:frescura_decisiones_misma_prenda", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(6), 'hasta_agotar', pg_temp.cab(:'ubic', :'prod', pg_temp.k(6)), 'rebaje')`],
  ["anula_una_anulacion", "23514:frescura_decisiones_anula_una_decision", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(7), 'anulacion', (pg_temp.ins(:'ubic', :'prod', pg_temp.k(7), 'anulacion', pg_temp.cab(:'ubic', :'prod', pg_temp.k(7)), 'cambie_lugar', null, null, null) ->> 'id')::uuid, 'anulacion', null, null, null)`],
  ["anula_sin_anterior", "23514:frescura_decisiones_anula_una_decision", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(8), 'anulacion', null, null, null, null, null)`],
  ["traslado_sin_traslado", "23514:frescura_decisiones_traslado", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(9), 'traslade')`],
  ["traslado_de_otra_accion", "23514:frescura_decisiones_traslado", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(10), 'rebaje', null, null, :'tr')`],
  ["nota_vacia", "23514:frescura_decisiones_nota", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(11), 'cambie_lugar', null, null, null, '   ')`],
  ["nota_281", "23514:frescura_decisiones_nota", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(12), 'cambie_lugar', null, null, null, repeat('a', 281))`],
  ["anterior_sin_accion", "23514:frescura_decisiones_anterior_coherente", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(13), 'hasta_agotar', pg_temp.cab(:'ubic', :'prod', pg_temp.k(13)), null)`],
  ["se_responde_a_si_misma", "23514:frescura_decisiones_anterior_coherente", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(14), 'cambie_lugar', :'yo', 'cambie_lugar', null, null, 7, null, gen_random_uuid(), :'yo')`],
  ["accion_inventada", "23514:frescura_decisiones_accion_valida", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(15), 'regalar')`],
  ["plazo_0", "23514:frescura_decisiones_plazo", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(16), 'cambie_lugar', null, null, null, null, 0)`],
  ["plazo_31", "23514:frescura_decisiones_plazo", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(17), 'cambie_lugar', null, null, null, null, 31)`],
  ["decision_sin_plazo", "23514:frescura_decisiones_plazo", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(18), 'cambie_lugar', null, null, null, null, null)`],
  ["anulacion_con_plazo", "23514:frescura_decisiones_plazo", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(19), 'anulacion', pg_temp.cab(:'ubic', :'prod', pg_temp.k(19)), 'cambie_lugar', null, null, 7)`],
  ["marca_repetida", "23505:frescura_decisiones_token_unico", `pg_temp.ins(:'ubic', :'prod', pg_temp.k(20), 'cambie_lugar', null, null, null, null, 7, null, :'tok')`],
];

/** Lo que necesitan las filas malas: una libreta buena a → b (cambie_lugar, anulada), una cabeza sin color, una con marca y un traslado. */
const ARMAR_T1 = `
select gen_random_uuid() as a, gen_random_uuid() as b, gen_random_uuid() as tok, gen_random_uuid() as yo \\gset
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, numero)
  values (:'ubic', :'ubic2', 'en_transito', (select coalesce(max(numero), 0) + 1 from retail.transferencias)) returning id as tr \\gset
select pg_temp.res(pg_temp.ins(:'ubic', :'prod', pg_temp.k(0), 'cambie_lugar', null, null, null, null, 7, null, gen_random_uuid(), :'a')) as p_a \\gset
select pg_temp.res(pg_temp.ins(:'ubic', :'prod', pg_temp.k(0), 'anulacion', :'a', 'cambie_lugar', null, null, null, null, gen_random_uuid(), :'b')) as p_b \\gset
select pg_temp.res(pg_temp.ins(:'ubic', :'prod', null, 'cambie_lugar')) as p_c \\gset
select pg_temp.res(pg_temp.ins(:'ubic', :'prod', pg_temp.k(1), 'cambie_lugar', null, null, null, null, 7, null, :'tok')) as p_d \\gset
`;

// Las filas malas de MALAS repetidas con el constraint QUITADO: tienen que pasar. Cada quitar va en su propia transacción.
const QUITAR = {
  "23505:frescura_decisiones_una_cabeza": "drop index retail.frescura_decisiones_una_cabeza",
  "23505:frescura_decisiones_una_respuesta": "alter table retail.frescura_decisiones drop constraint frescura_decisiones_una_respuesta",
  "23503:frescura_decisiones_misma_prenda": "alter table retail.frescura_decisiones drop constraint frescura_decisiones_misma_prenda",
  "23514:frescura_decisiones_anula_una_decision": "alter table retail.frescura_decisiones drop constraint frescura_decisiones_anula_una_decision",
  "23514:frescura_decisiones_traslado": "alter table retail.frescura_decisiones drop constraint frescura_decisiones_traslado",
  "23514:frescura_decisiones_nota": "alter table retail.frescura_decisiones drop constraint frescura_decisiones_nota",
  "23514:frescura_decisiones_anterior_coherente": "alter table retail.frescura_decisiones drop constraint frescura_decisiones_anterior_coherente",
  "23514:frescura_decisiones_accion_valida": "alter table retail.frescura_decisiones drop constraint frescura_decisiones_accion_valida",
  "23514:frescura_decisiones_plazo": "alter table retail.frescura_decisiones drop constraint frescura_decisiones_plazo",
  "23505:frescura_decisiones_token_unico": "alter table retail.frescura_decisiones drop constraint frescura_decisiones_token_unico",
};

correr(
  "T1 · el esquema: cada estado imposible lo rechaza la base, con su nombre",
  `${PRELUDIO}${ARMAR_T1}
select 'BUENAS|' || :'p_a' || ',' || :'p_b' || ',' || :'p_c' || ',' || :'p_d';
${MALAS.map(([k, , expr]) => `select '${k.toUpperCase()}|' || pg_temp.res(${expr});`).join("\n")}
-- Una decisión DESPUÉS de una anulación pasa (la libreta sigue: anotar de nuevo lo que se quitó).
select 'DESPUES_DE_ANULAR|' || pg_temp.res(pg_temp.ins(:'ubic', :'prod', pg_temp.k(0), 'hasta_agotar', :'b', 'anulacion', null, null, 12));
-- Un traslado válido se enlaza.
select 'TRASLADO_OK|' || pg_temp.res(pg_temp.ins(:'ubic', :'prod', pg_temp.k(21), 'traslade', null, null, :'tr', null, 14));
-- Cada persona puede tener el mismo color en otra sede: es OTRA libreta.
select 'OTRA_SEDE_OK|' || pg_temp.res(pg_temp.ins(:'ubic2', :'prod', pg_temp.k(0), 'cambie_lugar'));
-- persona_id nulo → not null.
select 'SIN_FIRMA|' || (pg_temp.intento(format($q$insert into retail.frescura_decisiones (ubicacion_id, producto_id, color_codigo, accion, plazo_dias, persona_id, token_cliente)
  values (%L, %L, %L, 'cambie_lugar', 7, null, gen_random_uuid())$q$, :'ubic', :'prod', pg_temp.k(22))) ->> 'estado');
-- Nada se edita ni se borra ni se trunca (E6): el disparador dice 42501.
select 'UPDATE|' || (pg_temp.intento(format('update retail.frescura_decisiones set nota = %L where id = %L', 'x', :'a')) ->> 'estado');
select 'DELETE|' || (pg_temp.intento(format('delete from retail.frescura_decisiones where id = %L', :'b')) ->> 'estado');
select 'TRUNCATE|' || (pg_temp.intento('truncate retail.frescura_decisiones') ->> 'estado');
-- La columna generada no se puede escribir: no puede mentir.
select 'CLAVE_ESCRITA|' || (pg_temp.intento(format($q$insert into retail.frescura_decisiones (ubicacion_id, producto_id, color_codigo, color_clave, accion, plazo_dias, persona_id, token_cliente)
  values (%L, %L, %L, 'mentira', 'cambie_lugar', 7, %L, gen_random_uuid())$q$, :'ubic', :'prod', pg_temp.k(23), :'pers')) ->> 'estado');
-- La clave sale sola del color: sin color, cadena vacía.
select 'CLAVE_GENERADA|' || count(*) filter (where color_clave = coalesce(color_codigo, '')) || ',' || count(*) filter (where color_codigo is null and color_clave = '') || ',' || count(*) from retail.frescura_decisiones;
-- Nadie de la tienda lee ni escribe la tabla por la API (RLS sin políticas + revoke).
select 'PRIVILEGIOS|' || has_table_privilege('anon', 'retail.frescura_decisiones', 'select') || ',' || has_table_privilege('authenticated', 'retail.frescura_decisiones', 'select')
  || ',' || has_table_privilege('authenticated', 'retail.frescura_decisiones', 'insert') || ',' || (select relrowsecurity from pg_class where oid = 'retail.frescura_decisiones'::regclass)
  || ',' || (select count(*) from pg_policy where polrelid = 'retail.frescura_decisiones'::regclass);
rollback;`,
  (o) => {
    afirmar("las cuatro filas buenas de la libreta entran (una cabeza, su anulación, una libreta sin color, otra con color)", o.BUENAS === "ok,ok,ok,ok", `BUENAS=${o.BUENAS}`);
    for (const [k, esperado] of MALAS) afirmar(`${k.replaceAll("_", " ")} → ${esperado}`, o[k.toUpperCase()] === esperado, `${k.toUpperCase()}=${o[k.toUpperCase()]}`);
    afirmar("una decisión después de una anulación pasa", o.DESPUES_DE_ANULAR === "ok", `=${o.DESPUES_DE_ANULAR}`);
    afirmar("un traslado válido se enlaza", o.TRASLADO_OK === "ok", `=${o.TRASLADO_OK}`);
    afirmar("la misma prenda en OTRA sede es otra libreta", o.OTRA_SEDE_OK === "ok", `=${o.OTRA_SEDE_OK}`);
    afirmar("persona_id nulo → 23502", o.SIN_FIRMA === "23502", `=${o.SIN_FIRMA}`);
    afirmar("UPDATE, DELETE y TRUNCATE → 42501 (nada se edita, borra ni trunca)", o.UPDATE === "42501" && o.DELETE === "42501" && o.TRUNCATE === "42501", `${o.UPDATE},${o.DELETE},${o.TRUNCATE}`);
    afirmar("color_clave es generada: escribirla es un error (428C9)", o.CLAVE_ESCRITA === "428C9", `=${o.CLAVE_ESCRITA}`);
    {
      const [igual, vacias, todas] = (o.CLAVE_GENERADA ?? "").split(",").map(Number);
      afirmar("color_clave sale sola: el color, o cadena vacía sin color", igual === todas && vacias >= 1 && todas > 0, `=${o.CLAVE_GENERADA}`);
    }
    afirmar("anon y authenticated no leen ni escriben la tabla; RLS encendido y sin ninguna política", o.PRIVILEGIOS === "false,false,false,true,0", `=${o.PRIVILEGIOS}`);
  },
);

// Los MUTANTES: sin el constraint, la misma fila mala PASA. Si no pasara, la prueba de arriba no vigilaba nada.
const porConstraint = new Map();
for (const m of MALAS) (porConstraint.get(m[1]) ?? porConstraint.set(m[1], []).get(m[1])).push(m);
for (const [constraint, filas] of porConstraint) {
  const quitar = QUITAR[constraint];
  correr(
    `T1 · mutante sin ${constraint.split(":")[1]}: sus filas malas tienen que PASAR`,
    `${PRELUDIO}${ARMAR_T1}
${quitar};
${filas.map(([k, , expr]) => `select '${k.toUpperCase()}|' || pg_temp.res(${expr});`).join("\n")}
rollback;`,
    (o) => {
      for (const [k] of filas) afirmar(`sin ${constraint.split(":")[1]}, «${k.replaceAll("_", " ")}» pasa (la prueba lo vigila)`, o[k.toUpperCase()] === "ok", `${k.toUpperCase()}=${o[k.toUpperCase()]}`);
    },
  );
}


// EL AGUJERO DEL NULL (lo encontró esta prueba al escribir T1): `accion <> 'anulacion' or anterior_accion in (…)` da NULL
// —no falso— cuando no hay anterior, y un CHECK deja pasar el NULL. Con el check «ingenuo» una anulación como primera línea
// (que anula nada) entraba. El constraint de verdad termina en `is true`; este caso fija por qué.
correr(
  "T1 · el check «ingenuo» (sin `is true`) deja pasar una anulación sin anterior; el de la migración no",
  `${PRELUDIO}${ARMAR_T1}
select 'REAL|' || pg_temp.res(pg_temp.ins(:'ubic', :'prod', pg_temp.k(8), 'anulacion', null, null, null, null, null));
alter table retail.frescura_decisiones drop constraint frescura_decisiones_anula_una_decision;
alter table retail.frescura_decisiones add constraint frescura_decisiones_anula_una_decision
  check (accion <> 'anulacion' or anterior_accion in ('cambie_lugar', 'hasta_agotar', 'traslade', 'rebaje'));
select 'INGENUO|' || pg_temp.res(pg_temp.ins(:'ubic', :'prod', pg_temp.k(8), 'anulacion', null, null, null, null, null));
rollback;`,
  (o) => {
    afirmar("con el check de la migración, «anular sin anterior» → 23514", o.REAL === "23514:frescura_decisiones_anula_una_decision", `REAL=${o.REAL}`);
    afirmar("con el check ingenuo (sin `is true`) PASA: por eso el constraint termina en `is true`", o.INGENUO === "ok", `INGENUO=${o.INGENUO}`);
  },
);


// =====================================================================================================================
// PARTE 2 — las funciones. Preludio ampliado: asistencia de Dynamic, personas, una prenda con stock en el piso y helpers.
// =====================================================================================================================

const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const SANDRA = "22222222-2222-4222-8222-000000000005"; // otra persona del equipo (seed): no marca entrada en estas pruebas
const TERMINAL_TRU = "33333333-3333-4333-8333-0000000000f4";

const PRELUDIO_F = `${PRELUDIO}
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;   -- como en producción (el ROLLBACK lo deshace)
-- fn_actor_persona_id consulta la asistencia de Dynamic: en un Postgres sin Dynamic esas tablas no existen.
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz, fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
update retail.ubicaciones set sede_dynamic_id = gen_random_uuid() where id = :'ubic' and sede_dynamic_id is null;
select sede_dynamic_id as sede_d from retail.ubicaciones where id = :'ubic' \\gset
select id as micaela_p from public.personas where auth_user_id = '${MICAELA}' \\gset
select id as sandra_p from public.personas where auth_user_id = '${SANDRA}' \\gset
select id as sp from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select set_config('prueba.ubic', :'ubic', true) as _a, set_config('prueba.ubic2', :'ubic2', true) as _b \\gset
-- Micaela marcó entrada hace 2 horas en Trujillo: está presente y puede ser responsable.
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values (:'micaela_p', :'sede_d', 'entrada', now() - interval '2 hours', (now() at time zone 'America/Lima')::date);

-- Una prenda nueva (modelo con UNA variante de ese color) con \`p_n\` unidades en el piso de la sede; devuelve el id del modelo.
create function pg_temp.prenda(p_ref text, p_color text, p_n integer default 5, p_ubic uuid default null) returns uuid language plpgsql as $$
declare p uuid; v uuid; m uuid; u uuid := coalesce(p_ubic, current_setting('prueba.ubic')::uuid);
begin
  insert into retail.productos (referencia, marca_id, proveedor_id)
    select 'ZZ DEC ' || p_ref, mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1 returning id into p;
  insert into retail.variantes (producto_id, sku, precio, costo, color_codigo) values (p, 'ZZ-DEC-' || p_ref, 100, 40, p_color) returning id into v;
  -- El stock nace de un movimiento real (una entrada al piso): el libro y el stock cuadran, como en la tienda.
  if p_n > 0 then
    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
      values (v, u, (select id from retail.sububicaciones where ubicacion_id = u and tipo = 'piso_venta'), 'entrada', p_n, 'recepcion') returning id into m;
    perform retail.fn_aplicar_movimiento(m);
  end if;
  return p;
end $$;
-- ¿El permiso helper coincide con la expresión en línea del paso 4, y para qué sedes da true? (TRU, Lima, sin sede)
create function pg_temp.matriz() returns text language sql as $$
  select bool_and(retail.fn_puede_frescura(u) is not distinct from coalesce(retail.fn_puede_operar_ubicacion(u) and (retail.fn_es_lider() or retail.fn_ve_modulo('frescura')), false))::text
         || ':' || string_agg(coalesce(retail.fn_puede_frescura(u), false)::int::text, '' order by n)
    from (values (1, current_setting('prueba.ubic')::uuid), (2, current_setting('prueba.ubic2')::uuid), (3, null::uuid)) t(n, u)
$$;
`;

/** Cambia de sesión (cuenta y encabezados de PostgREST). \`resp\`: variable psql con el uuid del responsable. */
const como = (uid, { resp = null, sede = true } = {}) => {
  const campos = [resp ? `'x-responsable', :'${resp}'` : null, sede ? `'x-ubicacion', :'ubic'` : null].filter(Boolean).join(", ");
  return `set local request.jwt.claim.sub = '${uid}';
set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
select set_config('request.headers', ${campos ? `json_build_object(${campos})::text` : "'{}'"}, true) as _h \\gset
`;
};

/** \`pg_temp.llamar\` de una función de la libreta con sus argumentos (expresiones SQL: \`:'ubic'\`, \`null\`, \`'texto'\`…). */
const rpc = (fn, ...args) => `pg_temp.llamar(format('select to_jsonb(retail.${fn}(${args.map(() => "%L").join(", ")}))', ${args.join(", ")}))`;
const anotar = ({ tok = "gen_random_uuid()", u = ":'ubic'", prod = ":'prod'", col = ":'col'", ant = "null", accion = "cambie_lugar", plazo = "7", tr = "null", nota = "null" } = {}) =>
  rpc("anotar_decision_frescura", tok, u, prod, col, ant, `'${accion}'`, plazo, tr, nota);
const anular = ({ tok = "gen_random_uuid()", id, nota = "null" }) => rpc("anular_decision_frescura", tok, id, nota);
/** Guarda en la variable psql \`nombre\` el id que devolvió una llamada guardada en \`r\`. */
const idDe = (r, nombre) => `select (:'${r}'::jsonb) -> 'r' ->> 'id' as ${nombre} \\gset\n`;
const MODULO_INTEGRANTE = `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'frescura');`;
const SIN_MODULO = `delete from retail.rol_modulos where modulo = 'frescura';`;

// ---------------------------------------------------------------------------------------------------------------------
correr(
  "T0 · forma: una sola versión de cada función, security definer donde toca, anon sin EXECUTE",
  `${PRELUDIO}
select 'FIRMAS|' || (select string_agg(proname || '=' || n, ',' order by proname) from (
  select proname, count(*) as n from pg_proc where pronamespace = 'retail'::regnamespace
     and proname in ('fn_puede_frescura', 'fn_puede_decidir_frescura', 'anotar_decision_frescura', 'anular_decision_frescura', 'fn_frescura_decisiones', 'fn_frescura_aviso_version')
   group by proname) x);
select 'DEFINER|' || (select string_agg(proname || '=' || prosecdef, ',' order by proname) from pg_proc where pronamespace = 'retail'::regnamespace
     and proname in ('anotar_decision_frescura', 'anular_decision_frescura', 'fn_frescura_decisiones', 'fn_frescura_aviso_version'));
select 'ANON|' || has_function_privilege('anon', 'retail.anotar_decision_frescura(uuid,uuid,uuid,text,uuid,text,integer,uuid,text)', 'execute')
  || ',' || has_function_privilege('anon', 'retail.anular_decision_frescura(uuid,uuid,text)', 'execute')
  || ',' || has_function_privilege('anon', 'retail.fn_frescura_decisiones(uuid,integer)', 'execute')
  || ',' || has_function_privilege('anon', 'retail.fn_puede_frescura(uuid)', 'execute')
  || ',' || has_function_privilege('anon', 'retail.fn_puede_decidir_frescura(uuid,text)', 'execute');
select 'AUTH|' || has_function_privilege('authenticated', 'retail.anotar_decision_frescura(uuid,uuid,uuid,text,uuid,text,integer,uuid,text)', 'execute')
  || ',' || has_function_privilege('authenticated', 'retail.anular_decision_frescura(uuid,uuid,text)', 'execute')
  || ',' || has_function_privilege('authenticated', 'retail.fn_frescura_decisiones(uuid,integer)', 'execute')
  || ',' || has_function_privilege('authenticated', 'retail.fn_puede_frescura(uuid)', 'execute')
  || ',' || has_function_privilege('authenticated', 'retail.fn_puede_decidir_frescura(uuid,text)', 'execute')
  || ',' || has_function_privilege('authenticated', 'retail.fn_frescura_aviso_version(uuid,uuid,text)', 'execute');
rollback;`,
  (o) => {
    afirmar("las seis funciones existen con UNA sola firma cada una", o.FIRMAS === "anotar_decision_frescura=1,anular_decision_frescura=1,fn_frescura_aviso_version=1,fn_frescura_decisiones=1,fn_puede_decidir_frescura=1,fn_puede_frescura=1", `=${o.FIRMAS}`);
    afirmar("las que escriben o leen la libreta son security definer", o.DEFINER === "anotar_decision_frescura=true,anular_decision_frescura=true,fn_frescura_aviso_version=true,fn_frescura_decisiones=true", `=${o.DEFINER}`);
    afirmar("anon no ejecuta ninguna", o.ANON === "false,false,false,false,false", `=${o.ANON}`);
    afirmar("authenticated ejecuta las cinco públicas y NO la interna (fn_frescura_aviso_version)", o.AUTH === "true,true,true,true,true,false", `=${o.AUTH}`);
  },
);

// ---------------------------------------------------------------------------------------------------------------------
correr(
  "T2 · permisos: el líder en las tres sedes; con el módulo, solo su sede; «La rebajé» solo del líder; sin el módulo, nada",
  `${PRELUDIO_F}
select pg_temp.k(0) as col \\gset
select pg_temp.prenda('T2A', :'col') as prod \\gset
select pg_temp.prenda('T2B', :'col') as prod_b \\gset
${SIN_MODULO}
-- EL LÍDER
${como(FELIPE)}
select 'LIDER_MATRIZ|' || pg_temp.matriz();
select ${anotar({ accion: "cambie_lugar" })} as r_lider \\gset
select 'LIDER_ANOTA|' || pg_temp.res(:'r_lider'::jsonb);
${idDe("r_lider", "d_lider")}
select ${anotar({ prod: ":'prod_b'", accion: "rebaje" })} as r_rebaje \\gset
select 'LIDER_REBAJA|' || pg_temp.res(:'r_rebaje'::jsonb);
${idDe("r_rebaje", "d_rebaje")}
-- UNA INTEGRANTE SIN EL MÓDULO (Micaela): ni matriz, ni anotar, ni anular, ni leer
${como(MICAELA, { resp: "micaela_p" })}
select 'SIN_MATRIZ|' || pg_temp.matriz();
select 'SIN_ANOTA|' || pg_temp.res(${anotar({ prod: ":'prod_b'", ant: ":'d_rebaje'", accion: "hasta_agotar" })});
select 'SIN_ANULA|' || pg_temp.res(${anular({ id: ":'d_lider'" })});
select 'SIN_LEE|' || pg_temp.res(${rpc("fn_frescura_decisiones", ":'ubic'", "120")});
-- CON EL MÓDULO EN SU ROL
${MODULO_INTEGRANTE}
select 'CON_MATRIZ|' || pg_temp.matriz();
select 'CON_ANOTA|' || pg_temp.res(${anotar({ ant: ":'d_lider'", accion: "hasta_agotar", plazo: "15" })});
select 'CON_REBAJA|' || pg_temp.res(${anotar({ prod: ":'prod_b'", ant: ":'d_rebaje'", accion: "rebaje" })});
select 'CON_ANULA_REBAJA|' || pg_temp.res(${anular({ id: ":'d_rebaje'" })});
select 'CON_OTRA_SEDE|' || pg_temp.res(${anotar({ u: ":'ubic2'" })});
select 'CON_LEE|' || pg_temp.res(${rpc("fn_frescura_decisiones", ":'ubic'", "120")});
select 'CON_LEE_OTRA|' || pg_temp.res(${rpc("fn_frescura_decisiones", ":'ubic2'", "120")});
-- El líder sí puede quitar su propia rebaja.
${como(FELIPE)}
select 'LIDER_ANULA_REBAJA|' || pg_temp.res(${anular({ id: ":'d_rebaje'" })});
-- LA TERMINAL DE VENTAS de Trujillo: sin el módulo no, con él sí (en su sede), firmando con la persona que elige.
insert into auth.users (id, aud, role, email) values ('${TERMINAL_TRU}', 'authenticated', 'authenticated', 'terminal-frescura-decisiones@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values (:'ubic', 'ZZ Terminal Ventas TRU', retail.fn_rol_por_clave('terminal_ventas'), '${TERMINAL_TRU}');
${SIN_MODULO}
${como(TERMINAL_TRU, { resp: "micaela_p" })}
select 'TERM_SIN|' || pg_temp.res(${anotar({ prod: ":'prod_b'", ant: ":'d_rebaje'" })});
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('terminal_ventas'), 'frescura');
select 'TERM_MATRIZ|' || pg_temp.matriz();
rollback;`,
  (o) => {
    afirmar("el líder: el helper coincide con la expresión en línea del paso 4 y da true en Trujillo y Lima (y en «sin sede»: el líder lo opera todo; anotar ahí falla después, sin piso)", o.LIDER_MATRIZ === "true:111", `=${o.LIDER_MATRIZ}`);
    afirmar("el líder anota una decisión", o.LIDER_ANOTA === "ok", `=${o.LIDER_ANOTA}`);
    afirmar("el líder anota «La rebajé»", o.LIDER_REBAJA === "ok", `=${o.LIDER_REBAJA}`);
    afirmar("sin el módulo, el helper coincide con el paso 4 y da false en todas partes", o.SIN_MATRIZ === "true:000", `=${o.SIN_MATRIZ}`);
    afirmar("sin el módulo: anotar → frescura_sin_permiso", o.SIN_ANOTA === "P0001:frescura_sin_permiso", `=${o.SIN_ANOTA}`);
    afirmar("sin el módulo: anular → frescura_sin_permiso", o.SIN_ANULA === "P0001:frescura_sin_permiso", `=${o.SIN_ANULA}`);
    afirmar("sin el módulo: leer → frescura_sin_permiso", o.SIN_LEE === "P0001:frescura_sin_permiso", `=${o.SIN_LEE}`);
    afirmar("con el módulo, el helper coincide con el paso 4 y da true SOLO en su sede (Trujillo)", o.CON_MATRIZ === "true:100", `=${o.CON_MATRIZ}`);
    afirmar("con el módulo anota en su sede", o.CON_ANOTA === "ok", `=${o.CON_ANOTA}`);
    afirmar("con el módulo, «La rebajé» → frescura_rebaja_solo_lider (la rebaja la decide el líder)", o.CON_REBAJA === "P0001:frescura_rebaja_solo_lider", `=${o.CON_REBAJA}`);
    afirmar("con el módulo no quita la rebaja del líder → frescura_rebaja_solo_lider", o.CON_ANULA_REBAJA === "P0001:frescura_rebaja_solo_lider", `=${o.CON_ANULA_REBAJA}`);
    afirmar("con el módulo, otra sede (Lima) → frescura_sin_permiso", o.CON_OTRA_SEDE === "P0001:frescura_sin_permiso", `=${o.CON_OTRA_SEDE}`);
    afirmar("con el módulo lee su sede", o.CON_LEE === "ok", `=${o.CON_LEE}`);
    afirmar("con el módulo no lee otra sede", o.CON_LEE_OTRA === "P0001:frescura_sin_permiso", `=${o.CON_LEE_OTRA}`);
    afirmar("el líder sí quita su propia rebaja", o.LIDER_ANULA_REBAJA === "ok", `=${o.LIDER_ANULA_REBAJA}`);
    afirmar("la terminal de ventas de TRU SIN el módulo → frescura_sin_permiso", o.TERM_SIN === "P0001:frescura_sin_permiso", `=${o.TERM_SIN}`);
    afirmar("…y CON el módulo, el helper coincide con el paso 4 y da true solo en su tienda", o.TERM_MATRIZ === "true:100", `=${o.TERM_MATRIZ}`);
  },
);

// ---------------------------------------------------------------------------------------------------------------------
correr(
  "T3 · firma: quien firma es el responsable del combo, no la cuenta; sin responsable o ausente, no se anota nada",
  `${PRELUDIO_F}
select pg_temp.k(0) as col \\gset
select pg_temp.prenda('T3A', :'col') as prod_a \\gset
select pg_temp.prenda('T3B', :'col') as prod_b \\gset
select pg_temp.prenda('T3C', :'col') as prod_c \\gset
select pg_temp.prenda('T3D', :'col') as prod_d \\gset
select pg_temp.prenda('T3E', :'col') as prod_e \\gset
${SIN_MODULO}
${MODULO_INTEGRANTE}
select count(*) as antes from retail.frescura_decisiones \\gset
-- El líder (Admin) firma él mismo, sin asistencia y sin encabezado de responsable.
${como(FELIPE, { sede: false })}
select ${anotar({ prod: ":'prod_a'" })} as r1 \\gset
${idDe("r1", "id1")}
select 'ADMIN|' || (select (persona_id = :'pers')::text || ',' || coalesce(terminal_id::text, 'sin_terminal') from retail.frescura_decisiones where id = :'id1');
-- Micaela, presente, eligiéndose a sí misma: firma Micaela.
${como(MICAELA, { resp: "micaela_p" })}
select ${anotar({ prod: ":'prod_b'" })} as r2 \\gset
${idDe("r2", "id2")}
select 'INTEGRANTE|' || (select (persona_id = :'micaela_p')::text from retail.frescura_decisiones where id = :'id2');
-- Sin responsable elegido: el combo obliga a elegir.
${como(MICAELA, { sede: true })}
select 'SIN_RESP|' || pg_temp.res(${anotar({ prod: ":'prod_c'" })});
-- Con una persona que no marcó entrada: no puede ser responsable.
${como(MICAELA, { resp: "sandra_p" })}
select 'AUSENTE|' || pg_temp.res(${anotar({ prod: ":'prod_c'" })});
-- El líder puede poner de responsable a una persona presente (Micaela): firma ella, no la cuenta.
${como(FELIPE, { resp: "micaela_p" })}
select ${anotar({ prod: ":'prod_d'" })} as r3 \\gset
${idDe("r3", "id3")}
select 'ADMIN_ELIGE|' || (select (persona_id = :'micaela_p')::text from retail.frescura_decisiones where id = :'id3');
-- La terminal de ventas: firma la persona que elige y queda desde qué terminal se anotó.
insert into auth.users (id, aud, role, email) values ('${TERMINAL_TRU}', 'authenticated', 'authenticated', 'terminal-frescura-decisiones@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values (:'ubic', 'ZZ Terminal Ventas TRU', retail.fn_rol_por_clave('terminal_ventas'), '${TERMINAL_TRU}');
select id as term_id from retail.terminales where auth_user_id = '${TERMINAL_TRU}' \\gset
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('terminal_ventas'), 'frescura');
${como(TERMINAL_TRU, { resp: "micaela_p" })}
select ${anotar({ prod: ":'prod_e'" })} as r4 \\gset
${idDe("r4", "id4")}
select 'TERMINAL|' || (select (persona_id = :'micaela_p')::text || ',' || (terminal_id = :'term_id')::text from retail.frescura_decisiones where id = :'id4');
${como(TERMINAL_TRU, { sede: true })}
select 'TERM_SIN_RESP|' || pg_temp.res(${anotar({ prod: ":'prod_c'" })});
-- Las cuatro que fallaron no escribieron nada: solo las cuatro buenas.
select 'FILAS|' || (count(*) - :antes) from retail.frescura_decisiones;
rollback;`,
  (o) => {
    afirmar("el Admin firma a su nombre, sin terminal", o.ADMIN === "true,sin_terminal", `=${o.ADMIN}`);
    afirmar("una integrante presente firma a su nombre (persona_id es el responsable, no la cuenta)", o.INTEGRANTE === "true", `=${o.INTEGRANTE}`);
    afirmar("sin responsable elegido → responsable_requerido", o.SIN_RESP === "42501:responsable_requerido", `=${o.SIN_RESP}`);
    afirmar("un responsable que no marcó entrada → responsable_no_presente", o.AUSENTE === "42501:responsable_no_presente", `=${o.AUSENTE}`);
    afirmar("el Admin pone de responsable a una persona presente: firma ella, no la cuenta", o.ADMIN_ELIGE === "true", `=${o.ADMIN_ELIGE}`);
    afirmar("la terminal firma con la persona elegida y guarda desde qué terminal se anotó", o.TERMINAL === "true,true", `=${o.TERMINAL}`);
    afirmar("la terminal sin responsable → responsable_requerido", o.TERM_SIN_RESP === "42501:responsable_requerido", `=${o.TERM_SIN_RESP}`);
    afirmar("solo se escribieron las 4 buenas: lo que falló no dejó nada", o.FILAS === "4", `=${o.FILAS}`);
  },
);

// ---------------------------------------------------------------------------------------------------------------------
correr(
  "T4 · marca: el mismo toque no anota dos veces; el reintento responde aunque la responsable ya se fue; otros datos con la misma marca se rechazan",
  `${PRELUDIO_F}
select pg_temp.k(0) as col \\gset
select pg_temp.prenda('T4A', :'col') as prod \\gset
select pg_temp.prenda('T4B', :'col') as prod_b \\gset
${SIN_MODULO}
${MODULO_INTEGRANTE}
select count(*) as antes from retail.frescura_decisiones \\gset
${como(MICAELA, { resp: "micaela_p" })}
select gen_random_uuid() as tok \\gset
-- El primer toque.
select ${anotar({ tok: ":'tok'" })} as r1 \\gset
${idDe("r1", "id1")}
select 'PRIMERO|' || pg_temp.res(:'r1'::jsonb) || ',' || ((:'r1'::jsonb) -> 'r' ->> 'repetida');
-- El reintento (un corte de red): la libreta YA tiene esa línea y el mismo p_anterior_id (null) ya no es la última;
-- si la versión se mirara antes que la marca diría «otra persona acaba de anotar» de sí misma.
select ${anotar({ tok: ":'tok'" })} as r2 \\gset
select 'REINTENTO|' || pg_temp.res(:'r2'::jsonb) || ',' || ((:'r2'::jsonb) -> 'r' ->> 'repetida') || ',' || ((:'r2'::jsonb) -> 'r' ->> 'id' = :'id1')::text;
select 'UNA_FILA|' || count(*) from retail.frescura_decisiones where token_cliente = :'tok';
-- La misma marca con OTROS datos: la base no lo repite ni lo confunde.
select 'OTRA_ACCION|' || pg_temp.res(${anotar({ tok: ":'tok'", accion: "hasta_agotar" })});
select 'OTRO_PLAZO|' || pg_temp.res(${anotar({ tok: ":'tok'", plazo: "9" })});
select 'OTRA_NOTA|' || pg_temp.res(${anotar({ tok: ":'tok'", nota: "'algo distinto'" })});
select 'OTRA_PRENDA|' || pg_temp.res(${anotar({ tok: ":'tok'", prod: ":'prod_b'" })});
-- Micaela marca su SALIDA después: ya no está presente. El reintento del MISMO toque igual responde (la marca va antes de la firma)…
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values (:'micaela_p', :'sede_d', 'salida', now() - interval '1 minute', (now() at time zone 'America/Lima')::date);
select ${anotar({ tok: ":'tok'" })} as r3 \\gset
select 'REINTENTO_TRAS_SALIDA|' || pg_temp.res(:'r3'::jsonb) || ',' || ((:'r3'::jsonb) -> 'r' ->> 'repetida');
-- …pero un toque NUEVO sí topa con que ya no está de turno (la firma sigue funcionando).
select 'NUEVO_TRAS_SALIDA|' || pg_temp.res(${anotar({ prod: ":'prod_b'" })});
-- Una cuenta que perdió el permiso, con la marca válida de otra persona: recibe «sin permiso», no el renglón guardado.
${SIN_MODULO}
select 'SIN_PERMISO_CON_MARCA_AJENA|' || pg_temp.res(${anotar({ tok: ":'tok'" })});
-- Quitar lo anotado, con marca: el reintento igual, otra decisión con la misma marca se rechaza.
${MODULO_INTEGRANTE}
delete from public.marcajes where tipo = 'salida' and persona_id = :'micaela_p';
select gen_random_uuid() as tok_a, gen_random_uuid() as tok_b \\gset
select ${anotar({ prod: ":'prod_b'" })} as r4 \\gset
${idDe("r4", "id4")}
select ${anular({ tok: ":'tok_a'", id: ":'id1'", nota: "'me equivoqué'" })} as r5 \\gset
select 'ANULA|' || pg_temp.res(:'r5'::jsonb) || ',' || ((:'r5'::jsonb) -> 'r' ->> 'repetida');
select ${anular({ tok: ":'tok_a'", id: ":'id1'", nota: "'me equivoqué'" })} as r6 \\gset
select 'ANULA_REINTENTO|' || pg_temp.res(:'r6'::jsonb) || ',' || ((:'r6'::jsonb) -> 'r' ->> 'repetida') || ',' || ((:'r6'::jsonb) -> 'r' ->> 'id' = (:'r5'::jsonb) -> 'r' ->> 'id')::text;
select 'ANULA_OTRA_DECISION|' || pg_temp.res(${anular({ tok: ":'tok_a'", id: ":'id4'" })});
select 'ANULA_OTRA_NOTA|' || pg_temp.res(${anular({ tok: ":'tok_a'", id: ":'id1'", nota: "'otra cosa'" })});
select 'FILAS|' || (count(*) - :antes) from retail.frescura_decisiones;
rollback;`,
  (o) => {
    afirmar("el primer toque anota y no es repetido", o.PRIMERO === "ok,false", `=${o.PRIMERO}`);
    afirmar("el reintento con el mismo p_anterior_id devuelve el MISMO renglón (repetida), no «otra persona acaba de anotar»", o.REINTENTO === "ok,true,true", `=${o.REINTENTO}`);
    afirmar("y hay una sola fila con esa marca", o.UNA_FILA === "1", `=${o.UNA_FILA}`);
    afirmar("la misma marca con otra acción / otro plazo / otra nota / otra prenda → frescura_token_reusado",
      [o.OTRA_ACCION, o.OTRO_PLAZO, o.OTRA_NOTA, o.OTRA_PRENDA].every((x) => x === "P0001:frescura_token_reusado"), `=${[o.OTRA_ACCION, o.OTRO_PLAZO, o.OTRA_NOTA, o.OTRA_PRENDA]}`);
    afirmar("el reintento DESPUÉS de que la responsable marcó su salida responde igual (repetida)", o.REINTENTO_TRAS_SALIDA === "ok,true", `=${o.REINTENTO_TRAS_SALIDA}`);
    afirmar("…y un toque nuevo sí topa con responsable_no_presente", o.NUEVO_TRAS_SALIDA === "42501:responsable_no_presente", `=${o.NUEVO_TRAS_SALIDA}`);
    afirmar("una cuenta sin permiso con la marca válida de otra persona → frescura_sin_permiso, nunca el renglón guardado", o.SIN_PERMISO_CON_MARCA_AJENA === "P0001:frescura_sin_permiso", `=${o.SIN_PERMISO_CON_MARCA_AJENA}`);
    afirmar("quitar lo anotado: anota la anulación; el reintento devuelve la misma", o.ANULA === "ok,false" && o.ANULA_REINTENTO === "ok,true,true", `${o.ANULA} / ${o.ANULA_REINTENTO}`);
    afirmar("quitar con la misma marca otra decisión, u otra nota → frescura_token_reusado",
      o.ANULA_OTRA_DECISION === "P0001:frescura_token_reusado" && o.ANULA_OTRA_NOTA === "P0001:frescura_token_reusado", `${o.ANULA_OTRA_DECISION} / ${o.ANULA_OTRA_NOTA}`);
    afirmar("solo quedaron las 3 filas buenas (la decisión, la de la otra prenda y la anulación)", o.FILAS === "3", `=${o.FILAS}`);
  },
);

// ---------------------------------------------------------------------------------------------------------------------
correr(
  "T6 · validaciones del momento: algo colgado, la prenda, el traslado (14 días, sin anular, de esta sede, con la prenda), el plazo y la versión",
  `${PRELUDIO_F}
select pg_temp.k(0) as col \\gset
select pg_temp.k(1) as col2 \\gset
select pg_temp.prenda('T6', :'col') as prod \\gset
select id as vid from retail.variantes where producto_id = :'prod' \\gset
select pg_temp.prenda('T6X', :'col', 5) as prod_x \\gset
select pg_temp.prenda('T6N', :'col', 5) as prod_n \\gset
select pg_temp.prenda('T6M1', :'col', 5) as prod_m1 \\gset
select pg_temp.prenda('T6M2', :'col', 5) as prod_m2 \\gset
${como(FELIPE, { sede: false })}
-- Nada libre colgado: todo apartado, o el piso en 0.
select pg_temp.prenda('T6APARTADA', :'col', 3) as prod_ap \\gset
update retail.stock set cantidad_apartada = 3 where variante_id = (select id from retail.variantes where producto_id = :'prod_ap');
select 'TODO_APARTADO|' || pg_temp.res(${anotar({ prod: ":'prod_ap'" })});
select pg_temp.prenda('T6VACIA', :'col', 0) as prod_0 \\gset
select 'PISO_EN_CERO|' || pg_temp.res(${anotar({ prod: ":'prod_0'" })});
-- Solo hay algo en el ALMACÉN: no está colgada.
select pg_temp.prenda('T6ALMACEN', :'col', 0) as prod_alm \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values ((select id from retail.variantes where producto_id = :'prod_alm'), :'ubic', (select id from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda'), 'entrada', 4, 'recepcion') returning id as m_alm \\gset
select retail.fn_aplicar_movimiento(:'m_alm') as _alm \\gset
select 'SOLO_ALMACEN|' || pg_temp.res(${anotar({ prod: ":'prod_alm'" })});
-- Una prenda de prueba, la «Prenda sin registrar», un color que el modelo no tiene, un modelo que no existe.
select pg_temp.prenda('T6PRUEBA', :'col') as prod_pr \\gset
update retail.productos set es_prueba = true where id = :'prod_pr';
select 'ES_PRUEBA|' || pg_temp.res(${anotar({ prod: ":'prod_pr'" })});
select 'CENTINELA|' || pg_temp.res(${anotar({ prod: "'11111111-1111-4111-8111-111111111111'" })});
select 'OTRO_COLOR|' || pg_temp.res(${anotar({ col: ":'col2'" })});
select 'NO_EXISTE|' || pg_temp.res(${anotar({ prod: "gen_random_uuid()" })});
-- El Taller (sin piso ni almacén separados).
select 'TALLER|' || pg_temp.res(${anotar({ u: ":'taller'" })});
-- Acción, plazo y nota.
select 'ACCION_INVENTADA|' || pg_temp.res(${anotar({ accion: "regalar" })});
select 'ANULACION_POR_ANOTAR|' || pg_temp.res(${anotar({ accion: "anulacion" })});
select 'PLAZO_0|' || pg_temp.res(${anotar({ plazo: "0" })});
select 'PLAZO_31|' || pg_temp.res(${anotar({ plazo: "31" })});
select 'PLAZO_NULO|' || pg_temp.res(${anotar({ plazo: "null" })});
select 'NOTA_281|' || pg_temp.res(${anotar({ nota: "repeat('a', 281)" })});
select 'NOTA_280|' || pg_temp.res(${anotar({ prod: ":'prod_n'", nota: "repeat('a', 280)" })});
-- Una nota en blanco es «sin nota» (no un rechazo del CHECK); una con espacios alrededor se guarda recortada.
select ${anotar({ prod: ":'prod_m1'", nota: "'   '" })} as r_m1 \\gset
${idDe("r_m1", "d_m1")}
select 'NOTA_EN_BLANCO|' || pg_temp.res(:'r_m1'::jsonb) || ',' || coalesce((select nota from retail.frescura_decisiones where id = :'d_m1'), 'sin_nota');
select ${anotar({ prod: ":'prod_m2'", nota: "'  la puse en la entrada  '" })} as r_m2 \\gset
${idDe("r_m2", "d_m2")}
select 'NOTA_RECORTADA|' || pg_temp.res(:'r_m2'::jsonb) || ',' || coalesce((select nota from retail.frescura_decisiones where id = :'d_m2'), 'sin_nota');
-- «La trasladé»: sin traslado, con un traslado de otra acción, anulado, de otra sede, sin la prenda, de hace 15 días…
select 'TRASLADO_FALTA|' || pg_temp.res(${anotar({ accion: "traslade" })});
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, numero)
  values (:'ubic', :'ubic2', 'en_transito', (select coalesce(max(numero), 0) + 1 from retail.transferencias)) returning id as t_ok \\gset
insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (:'t_ok', :'vid', 2);
select 'TRASLADO_DE_OTRA_ACCION|' || pg_temp.res(${anotar({ accion: "cambie_lugar", tr: ":'t_ok'" })});
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, numero, anulado_en, motivo_anulacion)
  values (:'ubic', :'ubic2', 'anulada', (select max(numero) + 1 from retail.transferencias), now(), 'prueba') returning id as t_anul \\gset
insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (:'t_anul', :'vid', 2);
select 'TRASLADO_ANULADO|' || pg_temp.res(${anotar({ accion: "traslade", tr: ":'t_anul'" })});
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, numero)
  values (:'ubic2', :'ubic', 'en_transito', (select max(numero) + 1 from retail.transferencias)) returning id as t_otra \\gset
insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (:'t_otra', :'vid', 2);
select 'TRASLADO_DE_OTRA_SEDE|' || pg_temp.res(${anotar({ accion: "traslade", tr: ":'t_otra'" })});
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, numero)
  values (:'ubic', :'ubic2', 'en_transito', (select max(numero) + 1 from retail.transferencias)) returning id as t_otra_prenda \\gset
insert into retail.transferencia_items (transferencia_id, variante_id, cantidad)
  values (:'t_otra_prenda', (select id from retail.variantes where producto_id = :'prod_x'), 2);
select 'TRASLADO_SIN_LA_PRENDA|' || pg_temp.res(${anotar({ accion: "traslade", tr: ":'t_otra_prenda'" })});
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, numero, created_at)
  values (:'ubic', :'ubic2', 'en_transito', (select max(numero) + 1 from retail.transferencias), now() - interval '15 days') returning id as t_viejo \\gset
insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (:'t_viejo', :'vid', 2);
select 'TRASLADO_DE_15_DIAS|' || pg_temp.res(${anotar({ accion: "traslade", tr: ":'t_viejo'" })});
-- …y uno de hace 13 días, de esta sede y con la prenda, sí.
update retail.transferencias set created_at = now() - interval '13 days' where id = :'t_ok';
select ${anotar({ accion: "traslade", tr: ":'t_ok'", plazo: "14" })} as r_ok \\gset
select 'TRASLADO_VALIDO|' || pg_temp.res(:'r_ok'::jsonb);
${idDe("r_ok", "d_ok")}
select 'TRASLADO_ENLAZADO|' || (select (transferencia_id = :'t_ok')::text || ',' || plazo_dias from retail.frescura_decisiones where id = :'d_ok');
-- La versión: la pantalla creyó que la libreta estaba vacía, pero ya hay una línea → PT409 con el nombre de quien anotó.
select ${anotar({ prod: ":'prod_x'" })} as r_v1 \\gset
${idDe("r_v1", "d_v1")}
select ${anotar({ prod: ":'prod_x'", accion: "hasta_agotar" })} as r_v2 \\gset
select 'VERSION|' || pg_temp.res(:'r_v2'::jsonb);
select 'VERSION_TEXTO|' || ((:'r_v2'::jsonb) ->> 'msg');
select 'VERSION_AL_DIA|' || pg_temp.res(${anotar({ prod: ":'prod_x'", ant: ":'d_v1'", accion: "hasta_agotar", plazo: "12" })});
-- Un antecedente que no es de esta prenda.
select 'ANTERIOR_AJENO|' || pg_temp.res(${anotar({ prod: ":'prod_x'", ant: ":'d_ok'", accion: "hasta_agotar" })});
select 'ANTERIOR_INEXISTENTE|' || pg_temp.res(${anotar({ prod: ":'prod_x'", ant: "gen_random_uuid()", accion: "hasta_agotar" })});
-- Anular: lo que no existe, lo que ya tiene otra encima, una anulación.
select 'ANULAR_NO_EXISTE|' || pg_temp.res(${anular({ id: "gen_random_uuid()" })});
select 'ANULAR_CON_OTRA_ENCIMA|' || pg_temp.res(${anular({ id: ":'d_v1'" })});
select ${anular({ id: ":'d_ok'" })} as r_a \\gset
${idDe("r_a", "d_anul")}
select 'ANULAR_UNA_ANULACION|' || pg_temp.res(${anular({ id: ":'d_anul'" })});
rollback;`,
  (o) => {
    const h = (k, esperado, texto) => afirmar(texto, o[k] === esperado, `${k}=${o[k]}`);
    h("TODO_APARTADO", "P0001:frescura_nada_colgado", "todo lo colgado está apartado → frescura_nada_colgado (lo apartado ya tiene dueña)");
    h("PISO_EN_CERO", "P0001:frescura_nada_colgado", "el piso en 0 → frescura_nada_colgado");
    h("SOLO_ALMACEN", "P0001:frescura_nada_colgado", "solo hay algo en el almacén → frescura_nada_colgado (no está colgada)");
    h("ES_PRUEBA", "P0001:frescura_producto_invalido", "un producto de prueba → frescura_producto_invalido");
    h("CENTINELA", "P0001:frescura_producto_invalido", "la «Prenda sin registrar» → frescura_producto_invalido");
    h("OTRO_COLOR", "P0001:frescura_producto_invalido", "un color que el modelo no tiene → frescura_producto_invalido");
    h("NO_EXISTE", "P0001:frescura_producto_invalido", "un modelo que no existe → frescura_producto_invalido");
    h("TALLER", "P0001:frescura_sede_sin_piso", "el Taller (sin piso separado) → frescura_sede_sin_piso");
    h("ACCION_INVENTADA", "P0001:frescura_accion_invalida", "una acción inventada → frescura_accion_invalida");
    h("ANULACION_POR_ANOTAR", "P0001:frescura_accion_invalida", "«anulacion» no se anota: se quita con anular → frescura_accion_invalida");
    h("PLAZO_0", "P0001:frescura_plazo_invalido", "plazo 0 → frescura_plazo_invalido");
    h("PLAZO_31", "P0001:frescura_plazo_invalido", "plazo 31 → frescura_plazo_invalido");
    h("PLAZO_NULO", "P0001:frescura_plazo_invalido", "sin plazo → frescura_plazo_invalido");
    h("NOTA_281", "P0001:frescura_nota_larga", "una nota de 281 letras → frescura_nota_larga");
    h("NOTA_280", "ok", "una nota de 280 letras entra");
    h("NOTA_EN_BLANCO", "ok,sin_nota", "una nota en blanco se guarda como «sin nota» (no se rechaza)");
    h("NOTA_RECORTADA", "ok,la puse en la entrada", "una nota con espacios alrededor se guarda recortada");
    h("TRASLADO_FALTA", "P0001:frescura_traslado_no_calza", "«La trasladé» sin traslado → frescura_traslado_no_calza");
    h("TRASLADO_DE_OTRA_ACCION", "P0001:frescura_traslado_no_calza", "un traslado colgado de otra acción → frescura_traslado_no_calza");
    h("TRASLADO_ANULADO", "P0001:frescura_traslado_no_calza", "un traslado anulado → frescura_traslado_no_calza");
    h("TRASLADO_DE_OTRA_SEDE", "P0001:frescura_traslado_no_calza", "un traslado que sale de OTRA sede → frescura_traslado_no_calza");
    h("TRASLADO_SIN_LA_PRENDA", "P0001:frescura_traslado_no_calza", "un traslado que no lleva esta prenda → frescura_traslado_no_calza");
    h("TRASLADO_DE_15_DIAS", "P0001:frescura_traslado_no_calza", "un traslado de hace 15 días → frescura_traslado_no_calza");
    h("TRASLADO_VALIDO", "ok", "un traslado de hace 13 días, de esta sede y con la prenda, entra");
    h("TRASLADO_ENLAZADO", "true,14", "…queda enlazado a ese traslado, con su plazo de 14 días");
    h("VERSION", "PT409:version_cambiada", "la pantalla creía la libreta vacía pero ya hay una línea → PT409 version_cambiada");
    afirmar("…y el aviso dice quién anotó, qué y cuándo (no «hace un momento»)",
      /Otra persona acaba de anotar una decisión sobre esta prenda \(«La cambié de lugar», Felipe, el \d\d\/\d\d a las \d\d:\d\d\)/.test(o.VERSION_TEXTO ?? ""), `=${o.VERSION_TEXTO}`);
    h("VERSION_AL_DIA", "ok", "con la última línea correcta, la nueva decisión entra");
    h("ANTERIOR_AJENO", "P0001:frescura_anterior_invalido", "un antecedente de otra prenda → frescura_anterior_invalido");
    h("ANTERIOR_INEXISTENTE", "P0001:frescura_anterior_invalido", "un antecedente que no existe → frescura_anterior_invalido");
    h("ANULAR_NO_EXISTE", "P0001:frescura_decision_inexistente", "quitar lo que no existe → frescura_decision_inexistente");
    h("ANULAR_CON_OTRA_ENCIMA", "PT409:version_cambiada", "quitar una decisión que ya tiene otra encima → PT409 version_cambiada");
    h("ANULAR_UNA_ANULACION", "P0001:frescura_no_anulable", "quitar una anulación → frescura_no_anulable («eso ya está quitado»)");
  },
);

// ---------------------------------------------------------------------------------------------------------------------
correr(
  "T7 · lectura: la última línea de cada libreta aunque sea vieja; las ventas de «La rebajé» con su motivo; cuándo entró el traslado; los traslados recientes",
  `${PRELUDIO_F}
select pg_temp.k(0) as col \\gset
select pg_temp.k(1) as col2 \\gset
select pg_temp.prenda('T7A', :'col') as prod_a \\gset
select pg_temp.prenda('T7B', :'col') as prod_b \\gset
select pg_temp.prenda('T7C', :'col') as prod_c \\gset
select id as va from retail.variantes where producto_id = :'prod_a' \\gset
select id as vb from retail.variantes where producto_id = :'prod_b' \\gset
select id as vc from retail.variantes where producto_id = :'prod_c' \\gset
-- A: una cabeza de hace 200 días (no es la última) y su respuesta de hace 100 (la última, MÁS VIEJA que la ventana de 30 días).
select gen_random_uuid() as a1, gen_random_uuid() as a2 \\gset
insert into retail.frescura_decisiones (id, ubicacion_id, producto_id, color_codigo, accion, plazo_dias, persona_id, token_cliente, creado_en)
  values (:'a1', :'ubic', :'prod_a', :'col', 'cambie_lugar', 7, :'pers', gen_random_uuid(), now() - interval '200 days');
insert into retail.frescura_decisiones (id, ubicacion_id, producto_id, color_codigo, accion, anterior_id, anterior_accion, plazo_dias, persona_id, token_cliente, creado_en)
  values (:'a2', :'ubic', :'prod_a', :'col', 'hasta_agotar', :'a1', 'cambie_lugar', 15, :'pers', gen_random_uuid(), now() - interval '100 days');
-- B: «La rebajé» hace 5 días y lo que se vendió de la prenda desde entonces.
select gen_random_uuid() as b1 \\gset
insert into retail.frescura_decisiones (id, ubicacion_id, producto_id, color_codigo, accion, plazo_dias, persona_id, token_cliente, creado_en)
  values (:'b1', :'ubic', :'prod_b', :'col', 'rebaje', 15, :'pers', gen_random_uuid(), now() - interval '5 days');
create function pg_temp.venta(p_var uuid, p_n integer, p_cuando timestamptz, p_estado text, p_desc numeric, p_motivo text) returns void language plpgsql as $$
declare vt uuid; u uuid := current_setting('prueba.ubic')::uuid;
begin
  if p_estado = 'anulada' then
    insert into retail.ventas (ubicacion_id, estado, anulado_en, motivo_anulacion, created_at) values (u, 'anulada', p_cuando + interval '1 minute', 'prueba', p_cuando) returning id into vt;
  else
    insert into retail.ventas (ubicacion_id, estado, created_at) values (u, 'completada', p_cuando) returning id into vt;
  end if;
  -- Un descuento de campaña siempre cita su etiqueta (venta_items_campana_coherente).
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario, descuento_unitario, motivo_descuento, descuento_etiqueta_id)
    values (vt, p_var, p_n, 100, 40, p_desc, p_motivo, case when p_motivo = 'campana' then (select id from retail.etiquetas order by created_at, id limit 1) end);
end $$;
-- sin descuento
select pg_temp.venta(:'vb', 1, now() - interval '4 days', 'completada', 0, null) as _1 \\gset
-- descuento de campaña
select pg_temp.venta(:'vb', 2, now() - interval '3 days', 'completada', 10, 'campana') as _2 \\gset
select pg_temp.venta(:'vb', 1, now() - interval '2 days', 'completada', 15, 'liquidacion_temporada') as _3 \\gset
-- anulada: no cuenta
select pg_temp.venta(:'vb', 4, now() - interval '1 day', 'anulada', 0, null) as _4 \\gset
-- antes de la decisión: no cuenta
select pg_temp.venta(:'vb', 7, now() - interval '9 days', 'completada', 0, null) as _5 \\gset
-- otra prenda: no cuenta
select pg_temp.venta(:'va', 3, now() - interval '2 days', 'completada', 0, null) as _6 \\gset
-- C: «La trasladé» con un traslado que YA entró a Lima (una recepción con su movimiento) y otro que no.
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, numero, created_at)
  values (:'ubic', :'ubic2', 'recibido_con_diferencia', (select coalesce(max(numero), 0) + 1 from retail.transferencias), now() - interval '4 days') returning id as tc \\gset
insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (:'tc', :'vc', 3);
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
  values (:'vc', :'ubic2', 'entrada', 3, 'recepcion', now() - interval '3 days') returning id as mc \\gset
insert into retail.transferencia_recepciones (transferencia_id, variante_id, cantidad_recibida, movimiento_id) values (:'tc', :'vc', 3, :'mc');
select gen_random_uuid() as c1 \\gset
insert into retail.frescura_decisiones (id, ubicacion_id, producto_id, color_codigo, accion, transferencia_id, plazo_dias, persona_id, token_cliente, creado_en)
  values (:'c1', :'ubic', :'prod_c', :'col', 'traslade', :'tc', 14, :'pers', gen_random_uuid(), now() - interval '2 days');
-- Traslados: uno anulado y uno de otra sede y uno de hace 20 días no entran a «recientes».
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, numero, anulado_en, motivo_anulacion, created_at)
  values (:'ubic', :'ubic2', 'anulada', (select max(numero) + 1 from retail.transferencias), now(), 'prueba', now() - interval '3 days') returning id as t_anul \\gset
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, numero, created_at)
  values (:'ubic2', :'ubic', 'en_transito', (select max(numero) + 1 from retail.transferencias), now() - interval '3 days') returning id as t_otra \\gset
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, numero, created_at)
  values (:'ubic', :'ubic2', 'cerrada', (select max(numero) + 1 from retail.transferencias), now() - interval '20 days') returning id as t_vieja \\gset
${como(FELIPE, { sede: false })}
select ${rpc("fn_frescura_decisiones", ":'ubic'", "30")} as lec \\gset
select 'OK|' || pg_temp.res(:'lec'::jsonb);
select (:'lec'::jsonb) -> 'r' -> 'decisiones' as dec, (:'lec'::jsonb) -> 'r' -> 'traslados_recientes' as tras \\gset
-- A: solo la última línea (la de hace 100 días); la cabeza de hace 200 no.
select 'A_LINEAS|' || (select count(*) from jsonb_array_elements(:'dec'::jsonb) e where e ->> 'producto_id' = :'prod_a')
  || ',' || (select string_agg(e ->> 'accion', ',') from jsonb_array_elements(:'dec'::jsonb) e where e ->> 'producto_id' = :'prod_a');
select 'A_FIRMA|' || (select e ->> 'persona' from jsonb_array_elements(:'dec'::jsonb) e where e ->> 'producto_id' = :'prod_a');
-- B: 3 ventas cuentan (sin descuento, campaña y liquidación); no la anulada, ni la anterior, ni la de otra prenda.
select 'B_VENTAS|' || (select count(*) from jsonb_array_elements(e -> 'ventas') v) || ':' ||
  (select string_agg(coalesce(v ->> 2, 'sin_descuento') || '=' || (v ->> 1), ',' order by v ->> 0) from jsonb_array_elements(e -> 'ventas') v)
  from jsonb_array_elements(:'dec'::jsonb) e where e ->> 'producto_id' = :'prod_b';
select 'B_SIN_TRASLADO|' || (select (e -> 'traslado') is null or e -> 'traslado' = 'null'::jsonb from jsonb_array_elements(:'dec'::jsonb) e where e ->> 'producto_id' = :'prod_b');
-- C: el traslado con su destino, estado, unidades y cuándo ENTRÓ (el movimiento de la recepción, no la fecha del traslado).
select 'C_TRASLADO|' || (e -> 'traslado' ->> 'destino') || ',' || (e -> 'traslado' ->> 'estado') || ',' || (e -> 'traslado' ->> 'unidades') || ',' || (e -> 'traslado' ->> 'anulado')
  || ',' || ((e -> 'traslado' ->> 'recibido_en')::timestamptz between now() - interval '3 days 1 minute' and now() - interval '2 days 23 hours 59 minutes')::text
  from jsonb_array_elements(:'dec'::jsonb) e where e ->> 'producto_id' = :'prod_c';
select 'C_VENTAS_NULAS|' || (select coalesce(e -> 'ventas' = 'null'::jsonb or (e -> 'ventas') is null, false) from jsonb_array_elements(:'dec'::jsonb) e where e ->> 'producto_id' = :'prod_c');
-- Traslados recientes: el de C (hace 4 días, de esta sede, no anulado). No el anulado, ni el de otra sede, ni el de hace 20 días.
select 'RECIENTES|' || (select count(*) from jsonb_array_elements(:'tras'::jsonb) t) || ':' ||
  coalesce((select string_agg(t ->> 'destino' || '/' || (t -> 'prendas' -> 0 ->> 'unidades'), ',') from jsonb_array_elements(:'tras'::jsonb) t), '');
-- Un traslado que se cerró antes de llevar recepciones por línea: entró cuando se confirmó.
update retail.transferencias set confirmado_en = now() - interval '3 days 12 hours', estado = 'completada' where id = :'tc';
delete from retail.transferencia_recepciones where transferencia_id = :'tc';
select ${rpc("fn_frescura_decisiones", ":'ubic'", "30")} as lec2 \\gset
select 'C_CONFIRMADO|' || (select ((e -> 'traslado' ->> 'recibido_en')::timestamptz between now() - interval '3 days 12 hours 1 minute' and now() - interval '3 days 11 hours 59 minutes')::text
  from jsonb_array_elements((:'lec2'::jsonb) -> 'r' -> 'decisiones') e where e ->> 'producto_id' = :'prod_c');
-- Ventana fuera de 1..120.
select 'DIAS_0|' || pg_temp.res(${rpc("fn_frescura_decisiones", ":'ubic'", "0")});
select 'DIAS_121|' || pg_temp.res(${rpc("fn_frescura_decisiones", ":'ubic'", "121")});
-- Sin decisiones en la sede: listas vacías, no nulos.
select 'VACIA|' || ((:'lec'::jsonb) -> 'r' ->> 'ahora' is not null)::text;
select 'LIMA_VACIA|' || (select (r -> 'r' -> 'decisiones')::text || ',' || (r -> 'r' -> 'traslados_recientes' -> 0 ->> 'destino') from (select ${rpc("fn_frescura_decisiones", ":'ubic2'", "30")} as r) x);
rollback;`,
  (o) => {
    afirmar("Felipe lee la sede", o.OK === "ok", `=${o.OK}`);
    afirmar("de la libreta A sale SOLO su última línea aunque tenga 100 días (y no la cabeza de 200): la pantalla responde a ella", o.A_LINEAS === "1,hasta_agotar", `=${o.A_LINEAS}`);
    afirmar("cada renglón trae quién firmó, con nombre y apellido", (o.A_FIRMA ?? "").startsWith("Felipe "), `=${o.A_FIRMA}`);
    afirmar("«La rebajé»: cuenta las ventas de esa prenda desde ese día (sin descuento, campaña y liquidación) y no la anulada, ni la anterior, ni la de otra prenda",
      o.B_VENTAS === "3:sin_descuento=1,campana=2,liquidacion_temporada=1", `=${o.B_VENTAS}`);
    afirmar("solo «La trasladé» trae traslado, y solo «La rebajé» trae ventas", o.B_SIN_TRASLADO === "true" && o.C_VENTAS_NULAS === "true", `${o.B_SIN_TRASLADO} / ${o.C_VENTAS_NULAS}`);
    afirmar("«La trasladé»: destino, estado, unidades y cuándo ENTRÓ a la tienda destino (el movimiento de su recepción)", o.C_TRASLADO === "Tienda Lima,recibido_con_diferencia,3,false,true", `=${o.C_TRASLADO}`);
    afirmar("un traslado sin recepciones por línea entró cuando se confirmó", o.C_CONFIRMADO === "true", `=${o.C_CONFIRMADO}`);
    afirmar("traslados recientes: solo el de esta sede, sin anular y de menos de 14 días", o.RECIENTES === "1:Tienda Lima/3", `=${o.RECIENTES}`);
    afirmar("una ventana de 0 o de 121 días se rechaza", o.DIAS_0 === "P0001:-" && o.DIAS_121 === "P0001:-", `${o.DIAS_0} / ${o.DIAS_121}`);
    afirmar("otra sede sin decisiones: lista vacía (no nula) y sus propios traslados", o.LIMA_VACIA === "[],Tienda Trujillo", `=${o.LIMA_VACIA}`);
  },
);


// ---------------------------------------------------------------------------------------------------------------------
// T8 · eliminar un producto con decisiones (parte 3): la libreta es historia «de stock» que un Admin borra con respaldo
// ---------------------------------------------------------------------------------------------------------------------
const RESTAURAR = readFileSync(join(RAIZ, "scripts/purga/restaurar-purga.sql"), "utf8").replace(/^(begin|commit);.*\[\[transaccion\]\].*$/gm, "");
correr(
  "T8 · eliminar con su historia: la libreta cuenta como historia de stock, se respalda, se borra, el candado vuelve a su modo y restaurar la devuelve fila por fila",
  `${PRELUDIO_F}
select pg_temp.k(0) as col \\gset
select pg_temp.prenda('T8A', :'col') as prod \\gset
select pg_temp.prenda('T8B', :'col') as prod_otra \\gset
select pg_temp.prenda('T8C', :'col', 0) as prod_sin_stock \\gset
${como(FELIPE, { sede: false })}
-- La prenda A tiene DOS renglones en su libreta; la B, uno (no se debe tocar); la C (sin stock) tiene uno insertado directo.
select ${anotar({ tok: "gen_random_uuid()" })} as r1 \\gset
${idDe("r1", "d1")}
select ${anotar({ ant: ":'d1'", accion: "hasta_agotar", plazo: "12" })} as r2 \\gset
select ${anotar({ prod: ":'prod_otra'" })} as r3 \\gset
insert into retail.frescura_decisiones (ubicacion_id, producto_id, color_codigo, accion, plazo_dias, persona_id, token_cliente)
  values (:'ubic', :'prod_sin_stock', :'col', 'cambie_lugar', 7, :'pers', gen_random_uuid());
select md5(string_agg(to_jsonb(d)::text, ',' order by d.id)) as huella_antes from retail.frescura_decisiones d where d.producto_id = :'prod' \\gset
select tgenabled as modo_antes from pg_trigger where tgrelid = 'retail.frescura_decisiones'::regclass and tgname = 'frescura_decisiones_inmutable' \\gset
-- La historia de la prenda A: unas decisiones de Frescura, borrables.
select 'HISTORIA|' || (select n || ':' || borrable from retail.fn_producto_historia(:'prod') where concepto = 'decisiones de Frescura');
-- Sin historia NO se puede eliminar (el Líder): la libreta cuenta, y la razón la nombra.
select 'SE_PUEDE|' || (select puede::text || ':' || (razon like '%decisiones de Frescura (1)%')::text from retail.fn_producto_se_puede_eliminar(:'prod_sin_stock'));
select 'ELIMINAR_SIMPLE|' || pg_temp.res(pg_temp.intento(format('select retail.eliminar_producto(%L)', :'prod_sin_stock')));
select 'SIGUE_LA_SIN_STOCK|' || (select count(*) from retail.frescura_decisiones where producto_id = :'prod_sin_stock');
-- Lo que pregunta la ventana del Admin: con historia, puede.
select 'COMO|' || (select nivel || ':' || puedes::text from retail.fn_producto_como_eliminar(:'prod'));
-- Eliminar con su historia (Admin).
select retail.eliminar_producto_con_historia(:'prod') as ref \\gset
select 'ELIMINADO|' || (select count(*) from retail.productos where id = :'prod') || ',' || (select count(*) from retail.frescura_decisiones where producto_id = :'prod');
select 'OTRA_INTACTA|' || (select count(*) from retail.frescura_decisiones where producto_id = :'prod_otra');
select 'RESPALDO|' || (select count(*) from respaldo_purgas.filas where tabla = 'frescura_decisiones' and fila ->> 'producto_id' = :'prod');
select 'MODO|' || (select tgenabled = :'modo_antes' from pg_trigger where tgrelid = 'retail.frescura_decisiones'::regclass and tgname = 'frescura_decisiones_inmutable')
  || ',' || (select tgenabled::text from pg_trigger where tgrelid = 'retail.frescura_decisiones'::regclass and tgname = 'frescura_decisiones_sin_truncate');
-- El candado sigue frenando a cualquier otro: editar o borrar por fuera sigue siendo imposible.
select 'CANDADO_SIGUE|' || (pg_temp.intento(format('delete from retail.frescura_decisiones where producto_id = %L', :'prod_otra')) ->> 'estado');
-- Volver atrás: el script de restauración devuelve las filas, idénticas.
select purga as nombre_purga from respaldo_purgas.filas where tabla = 'productos' and fila ->> 'id' = :'prod' limit 1 \\gset
select set_config('cayla_purga.nombre', :'nombre_purga', true) as _n \\gset
${RESTAURAR}
select 'RESTAURADAS|' || (select count(*) from retail.frescura_decisiones where producto_id = :'prod')
  || ',' || (select md5(string_agg(to_jsonb(d)::text, ',' order by d.id)) = :'huella_antes' from retail.frescura_decisiones d where d.producto_id = :'prod');
rollback;`,
  (o) => {
    afirmar("la libreta cuenta como historia de stock: 2 decisiones, borrables", o.HISTORIA === "2:true", `=${o.HISTORIA}`);
    afirmar("sin historia no se puede eliminar (el Líder): la razón nombra «decisiones de Frescura (1)»", o.SE_PUEDE === "false:true", `=${o.SE_PUEDE}`);
    afirmar("…y eliminar_producto lo frena con su pista, sin borrar la libreta", o.ELIMINAR_SIMPLE === "P0001:producto_con_historia" && o.SIGUE_LA_SIN_STOCK === "1", `${o.ELIMINAR_SIMPLE} / ${o.SIGUE_LA_SIN_STOCK}`);
    afirmar("la ventana del Admin dice: con historia, puede", o.COMO === "con_historia:true", `=${o.COMO}`);
    afirmar("el Admin elimina el producto y su libreta desaparece con él", o.ELIMINADO === "0,0", `=${o.ELIMINADO}`);
    afirmar("la libreta de OTRA prenda no se toca", o.OTRA_INTACTA === "1", `=${o.OTRA_INTACTA}`);
    afirmar("las 2 filas quedaron respaldadas en respaldo_purgas.filas", o.RESPALDO === "2", `=${o.RESPALDO}`);
    afirmar("el candado volvió a su modo (y el de TRUNCATE nunca se apagó)", o.MODO === "true,O", `=${o.MODO}`);
    afirmar("después, borrar por fuera sigue dando 42501", o.CANDADO_SIGUE === "42501", `=${o.CANDADO_SIGUE}`);
    afirmar("restaurar-purga devuelve las 2 decisiones, IDÉNTICAS fila por fila", o.RESTAURADAS === "2,true", `=${o.RESTAURADAS}`);
  },
);

// ---------------------------------------------------------------------------------------------------------------------
// T5 · CARRERAS DE VERDAD: dos conexiones, cada una con su COMMIT. Con ROLLBACK no se puede ver que la segunda espera a la
// primera: el `if` de la función NO alcanza (las dos ven la libreta vacía); la frenan los índices únicos de la parte 1.
// ---------------------------------------------------------------------------------------------------------------------

/** Corre un script de psql en un proceso aparte (para lanzar varios a la vez) y devuelve su salida y sus errores. */
function psqlAparte(sql) {
  return new Promise((resolver) => {
    const p = spawn("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-t", "-A", "-F", "|", "-v", "VERBOSITY=verbose", "-f", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (codigo) => resolver({ out: out.trim(), err, codigo }));
    p.stdin.end(sql);
  });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
/** La última línea de lo que imprimió psql (la anterior es el `{}` del set_config de la sesión). */
const ultima = (out) => out.split("\n").filter(Boolean).pop() ?? "";
/** Lo que un error de psql dice: «PT409 version_cambiada …» (código, pista, texto). */
function errorDe({ err }) {
  const m = /ERROR:\s+(\w{5}):\s*(.*)/.exec(err);
  const h = /HINT:\s+(\S+)/.exec(err);
  return m ? { estado: m[1], hint: h ? h[1] : null, msg: m[2] } : null;
}

const SESION_FELIPE = `set request.jwt.claim.sub = '${FELIPE}'; set request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}'; select set_config('request.headers', '{}', false);`;
/** Un intento que se queda `pausa` segundos con su fila SIN confirmar, para que el otro llegue mientras tanto. */
const conPausa = (llamada, pausa) => `${SESION_FELIPE}
begin;
select ${llamada}::jsonb ->> 'id' as id;
select pg_sleep(${pausa});
commit;`;
const llamarSQL = (fn, ...args) => `to_jsonb(retail.${fn}(${args.join(", ")}))`;

async function carreras() {
  console.log("\nT5 · carreras: dos conexiones a la vez, cada una con COMMIT (limpia lo suyo al terminar)");
  const limpiar = `
alter table retail.frescura_decisiones disable trigger frescura_decisiones_inmutable;
delete from retail.frescura_decisiones where producto_id in (select producto_id from retail.variantes where sku like 'ZZ-DEC-CARRERA%');
alter table retail.frescura_decisiones enable trigger frescura_decisiones_inmutable;
create temp table if not exists _carrera_prod as select producto_id from retail.variantes where sku like 'ZZ-DEC-CARRERA%';
delete from retail.codigos_barras where variante_id in (select id from retail.variantes where sku like 'ZZ-DEC-CARRERA%');
delete from retail.stock where variante_id in (select id from retail.variantes where sku like 'ZZ-DEC-CARRERA%');
delete from retail.variantes where sku like 'ZZ-DEC-CARRERA%';
delete from retail.productos where id in (select producto_id from _carrera_prod);
drop table if exists _carrera_prod;`;
  try {
    psql(limpiar); // por si una corrida anterior murió a la mitad
    // Cuatro prendas (una por escenario) con stock en el piso de Trujillo, confirmadas de verdad.
    const setup = psql(`
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as sp from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select codigo as col from retail.colores order by codigo limit 1 \\gset
select id as pers from public.personas where auth_user_id = '${FELIPE}' \\gset
create temp table nuevas (n integer, prod uuid);
do $$
declare p uuid; v uuid; i integer;
begin
  for i in 1..4 loop
    insert into retail.productos (referencia, marca_id, proveedor_id)
      select 'ZZ DEC CARRERA' || i, mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1 returning id into p;
    insert into retail.variantes (producto_id, sku, precio, costo, color_codigo)
      values (p, 'ZZ-DEC-CARRERA' || i, 100, 40, (select codigo from retail.colores order by codigo limit 1)) returning id into v;
    insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
      values (v, (select id from retail.ubicaciones where nombre = 'Tienda Trujillo'), (select s.id from retail.sububicaciones s join retail.ubicaciones u on u.id = s.ubicacion_id where u.nombre = 'Tienda Trujillo' and s.tipo = 'piso_venta'), 5);
  end loop;
end $$;
-- La libreta de la prenda 2 ya tiene una decisión (el punto de partida de las carreras «sobre el mismo anterior»).
select v.producto_id as prod2 from retail.variantes v where v.sku = 'ZZ-DEC-CARRERA2' \\gset
insert into retail.frescura_decisiones (ubicacion_id, producto_id, color_codigo, accion, plazo_dias, persona_id, token_cliente)
  values (:'ubic', :'prod2', :'col', 'cambie_lugar', 7, :'pers', gen_random_uuid()) returning id as x2 \\gset
select v.producto_id as prod3 from retail.variantes v where v.sku = 'ZZ-DEC-CARRERA3' \\gset
insert into retail.frescura_decisiones (ubicacion_id, producto_id, color_codigo, accion, plazo_dias, persona_id, token_cliente)
  values (:'ubic', :'prod3', :'col', 'cambie_lugar', 7, :'pers', gen_random_uuid()) returning id as x3 \\gset
select 'U|' || :'ubic' || '|' || :'col' || '|' || (select producto_id from retail.variantes where sku = 'ZZ-DEC-CARRERA1') || '|' || :'prod2' || '|' || :'x2' || '|' || :'prod3' || '|' || :'x3' || '|' || (select producto_id from retail.variantes where sku = 'ZZ-DEC-CARRERA4');`);
    const [, ubic, col, p1, p2, x2, p3, x3, p4] = setup.split("\n").find((l) => l.startsWith("U|")).split("|");
    const cuenta = (prod) => Number(psql(`select count(*) from retail.frescura_decisiones where producto_id = '${prod}';`).trim());
    const tk = () => `'${randomUUID()}'`;
    const anotarSQL = (prod, ant, accion, token) => llamarSQL("anotar_decision_frescura", token, `'${ubic}'`, `'${prod}'`, `'${col}'`, ant ? `'${ant}'` : "null", `'${accion}'`, "7", "null", "null");

    // R1 · dos PRIMERAS decisiones a la vez (la libreta vacía): las dos ven «vacía», la segunda espera en el índice único.
    let A = psqlAparte(conPausa(anotarSQL(p1, null, "cambie_lugar", tk()), 2));
    await dormir(700);
    let B = psqlAparte(`${SESION_FELIPE}\nselect ${anotarSQL(p1, null, "hasta_agotar", tk())}::jsonb ->> 'id';`);
    let [a, b] = await Promise.all([A, B]);
    let eb = errorDe(b);
    afirmar("dos primeras decisiones a la vez: una entra", /^[0-9a-f-]{36}$/.test(ultima(a.out)) && errorDe(a) === null, `A=${a.out} ${a.err}`);
    afirmar("…y la otra recibe PT409 version_cambiada (no un error crudo de Postgres) con el nombre de la que ganó", eb?.estado === "PT409" && eb?.hint === "version_cambiada" && /Felipe/.test(eb?.msg ?? "") && /La cambié de lugar/.test(eb?.msg ?? ""), `B=${JSON.stringify(eb)} ${b.out}`);
    afirmar("…y la libreta quedó con UNA sola línea", cuenta(p1) === 1, `filas=${cuenta(p1)}`);

    // R2 · dos sobre el MISMO anterior (la libreta ya tenía una línea).
    A = psqlAparte(conPausa(anotarSQL(p2, x2, "hasta_agotar", tk()), 2));
    await dormir(700);
    B = psqlAparte(`${SESION_FELIPE}\nselect ${anotarSQL(p2, x2, "rebaje", tk())}::jsonb ->> 'id';`);
    [a, b] = await Promise.all([A, B]);
    eb = errorDe(b);
    afirmar("dos sobre el mismo anterior: una entra y la otra recibe PT409 version_cambiada", errorDe(a) === null && eb?.estado === "PT409" && eb?.hint === "version_cambiada", `A=${a.out}${a.err} B=${JSON.stringify(eb)}`);
    afirmar("…y la libreta creció en UNA línea (2 en total)", cuenta(p2) === 2, `filas=${cuenta(p2)}`);

    // R3 · una anota y otra quita LO MISMO a la vez: gana una.
    A = psqlAparte(conPausa(anotarSQL(p3, x3, "hasta_agotar", tk()), 2));
    await dormir(700);
    B = psqlAparte(`${SESION_FELIPE}\nselect ${llamarSQL("anular_decision_frescura", tk(), `'${x3}'`, "null")}::jsonb ->> 'id';`);
    [a, b] = await Promise.all([A, B]);
    eb = errorDe(b);
    afirmar("una anota y otra quita lo anotado a la vez: gana una y la otra recibe PT409 version_cambiada", errorDe(a) === null && eb?.estado === "PT409" && eb?.hint === "version_cambiada", `A=${a.out}${a.err} B=${JSON.stringify(eb)}`);
    afirmar("…y la libreta creció en UNA línea (2 en total)", cuenta(p3) === 2, `filas=${cuenta(p3)}`);

    // R4 · la MISMA marca en dos conexiones: la segunda espera el candado de la marca y devuelve lo mismo, sin anotar dos veces.
    const mismaMarca = tk();
    A = psqlAparte(conPausa(anotarSQL(p4, null, "cambie_lugar", mismaMarca), 2));
    await dormir(700);
    B = psqlAparte(`${SESION_FELIPE}\nselect ${anotarSQL(p4, null, "cambie_lugar", mismaMarca)}::jsonb ->> 'repetida', ${anotarSQL(p4, null, "cambie_lugar", mismaMarca)}::jsonb ->> 'id';`);
    [a, b] = await Promise.all([A, B]);
    const idA = ultima(a.out);
    afirmar("la misma marca en dos conexiones: la segunda devuelve el MISMO renglón, marcado repetida", errorDe(a) === null && errorDe(b) === null && ultima(b.out) === `true|${idA}`, `A=${a.out} B=${b.out} ${b.err}`);
    afirmar("…y hay UNA sola fila", cuenta(p4) === 1, `filas=${cuenta(p4)}`);
  } finally {
    psql(limpiar);
    const resto = Number(psql(`select count(*) from retail.variantes where sku like 'ZZ-DEC-CARRERA%';`).trim());
    afirmar("las carreras limpiaron lo suyo (ningún producto de prueba queda)", resto === 0, `quedan=${resto}`);
  }
}
await carreras();

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);

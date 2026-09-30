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

import { execFileSync } from "node:child_process";

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
select id as prod from retail.productos where referencia = 'Blusa Emma' \\gset
select id as prod2 from retail.productos where referencia = 'Blusa Valentina' \\gset
select id as pers from public.personas where auth_user_id = '${FELIPE}' \\gset
select codigo as col from retail.colores order by codigo limit 1 \\gset
select codigo as col2 from retail.colores order by codigo offset 1 limit 1 \\gset

-- Ejecuta un SQL y devuelve «ok» o el error con el NOMBRE del constraint que lo rechazó: la BASE es la que dice que no.
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $$
declare v_estado text; v_msg text; v_c text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_c = constraint_name;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'constraint', v_c, 'msg', v_msg);
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
  select case when (r ->> 'ok')::boolean then 'ok' else (r ->> 'estado') || ':' || coalesce(r ->> 'constraint', '-') end
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

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);

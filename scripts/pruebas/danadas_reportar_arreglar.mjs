#!/usr/bin/env node
/**
 * Prueba de ADR-0328, actividad 10 — Dañadas: reportar desde Existencias y «Se arregló»
 * (`20261005110000_danadas_reportar_y_se_arreglo.sql`).
 *
 * QUÉ CUBRE
 *   D1 forma: una sola versión de cada función con la firma del contrato; anon no las ejecuta y authenticated sí;
 *      security definer con el search_path de la casa; los candados nuevos de `prendas_danadas` existen; la migración no
 *      crea políticas ni quita disparadores (ADR-0195); pegada dos veces deja lo mismo; su guarda aborta si ya hubiera dos
 *      dañadas con el mismo movimiento de entrada.
 *   D2 permisos de reportar: el líder en cualquier tienda; un rol SIN Existencias no (42501, `danada_sin_modulo`); con SOLO
 *      Existencias sí; en otra tienda no; el Taller no tiene cuarentena.
 *   D3 firma: una terminal con Existencias y responsable presente reporta y firma la responsable; sin responsable, 42501.
 *   D4 todo o nada y lo apartado: con 3 en el piso y 2 apartadas, reportar 2 no mueve NADA y lo dice (con el detalle en
 *      JSON); reportar 1 pasa y lo apartado sigue en el piso.
 *   D5 efecto: piso (o almacén) −n, cuarentena +n, total igual; UN traslado interno con la nota = lo que tiene; UNA fila
 *      'en_cuarentena' con `motivo_reporte`; lo reportado deja de contar para la venta (sale del piso y desde la cuarentena
 *      no se vende); no es pérdida (traslado; si la actividad 14 ya está, `fn_perdida_razon` lo confirma).
 *   D6 idempotencia: misma marca y mismos datos → ya_registrada, un solo movimiento y una sola dañada, aunque la responsable
 *      ya no esté; la misma marca con otro motivo, otra cantidad u otro lugar se rechaza; la marca de un intento fallido
 *      queda libre.
 *   D7 validaciones: sin marca, lugar inválido, cantidad 0, motivo vacío o corto o largo, la «Prenda sin registrar», una
 *      prenda que no existe.
 *   D8 candados del esquema: sin origen o con dos se rechaza; «se arregló» sin nota se rechaza; dos dañadas con el mismo
 *      movimiento de entrada se rechazan.
 *   A1 «Se arregló»: solo el líder (una integrante con Existencias no); exige nota; firma el responsable, no la cuenta;
 *      vuelve al ALMACÉN (no al piso), con un traslado interno cuarentena→almacén, firma y nota; no es pérdida.
 *
 * Las carreras con COMMIT (dos líderes a la vez, el mismo reporte dos veces, dos por la última libre) no caben aquí: van en
 * `danadas_concurrencia.mjs`, solo contra una base desechable.
 *   A2 idempotencia y estados: el reintento del mismo arreglo devuelve ya_registrada; otra marca sobre una ya resuelta,
 *      «ya se resolvió como Se arregló»; las salidas viejas (Se botó) siguen funcionando sobre una reportada.
 *
 * CÓMO. Igual que `retirar_del_piso.mjs`: cada caso en su transacción con ROLLBACK (nunca se commitea nada), sesión simulada
 * con `request.jwt.claim.sub` y el encabezado de PostgREST con `request.headers`. Las prendas son NUEVAS en cada caso
 * (producto «Blusa Dañada Prueba» con 3 tallas).
 *
 * USO
 *   pnpm pruebas:danadas-reportar-arreglar    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = "20261005110000_danadas_reportar_y_se_arreglo.sql";
const TEXTO_MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", MIGRACION), "utf8");
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const T_ALMACEN = "33333333-3333-4333-8333-0000000000d1"; // cuenta de una terminal administrativa de Trujillo (esta prueba)
const ROSA = "33333333-3333-4333-8333-0000000000d2"; // integrante de Trujillo sin cuenta, marcó entrada: la responsable
const LUZ = "33333333-3333-4333-8333-0000000000d3"; // integrante de Trujillo sin cuenta, NO marcó entrada

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
function correr(sql) {
  try {
    return { ok: true, lineas: psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim().split("\n") };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const PRELUDIO = `
begin;
create function pg_temp.reportar(p_u uuid, p_v uuid, p_n integer, p_desde text, p_motivo text, p_token uuid) returns jsonb
language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_detail text;
begin
  return jsonb_build_object('ok', true, 'res', retail.reportar_danada(p_u, p_v, p_n, p_desde, p_motivo, p_token));
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint, v_detail = pg_exception_detail;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg, 'detail', nullif(v_detail, ''));
end;
$f$;
create function pg_temp.arreglar(p_id uuid, p_nota text, p_token uuid) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  return jsonb_build_object('ok', true, 'res', retail.arreglar_prenda_danada(p_id, p_nota, p_token));
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
set local request.jwt.claim.sub = '${FELIPE}';
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, x.nombre, x.tipo from unnest(array[:'tru', :'lim']::uuid[]) u
  cross join (values ('Piso de venta', 'piso_venta'), ('Almacén de tienda', 'almacen_tienda'), ('Cuarentena', 'cuarentena')) x(nombre, tipo)
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = x.tipo);
select id as piso_t from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as alm_t from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as cua_t from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'cuarentena' \\gset
select id as piso_l from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' \\gset
select id as cua_l from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'cuarentena' \\gset
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Dañada Prueba', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as prod \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prod', t.id, :'color', 'DAN-PRUEBA-' || t.n, 50
    from (select id, row_number() over (order by valor, id) as n from retail.tallas) t where t.n <= 3;
select id as va from retail.variantes where sku = 'DAN-PRUEBA-1' \\gset
select id as vb from retail.variantes where sku = 'DAN-PRUEBA-2' \\gset
select id as vc from retail.variantes where sku = 'DAN-PRUEBA-3' \\gset
-- Trujillo: va 3 en el piso y 4 en el almacén; vb 1 en el piso; vc 3 en el piso (2 se apartan abajo). Lima: va 2 en el piso.
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x.v, x.u, x.s, 'entrada', x.n, 'prueba dañadas: colchón'
    from (values (:'va'::uuid, :'tru'::uuid, :'piso_t'::uuid, 3), (:'va', :'tru', :'alm_t', 4), (:'vb', :'tru', :'piso_t', 1),
                 (:'vc', :'tru', :'piso_t', 3), (:'va', :'lim', :'piso_l', 2)) x(v, u, s, n);
select count(*) as _colchon from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  where m.variante_id in (:'va', :'vb', :'vc') and m.tipo = 'entrada') x \\gset
select retail.apartar_stock(:'vc', :'tru', 2, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 3, null, :'piso_t', null) as _ap \\gset
-- La terminal del almacén de Trujillo y dos integrantes sin cuenta: Rosa marcó entrada, Luz no.
insert into auth.users (id, aud, role, email) values ('${T_ALMACEN}', 'authenticated', 'authenticated', 'terminal-almacen-danadas@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id)
  values (:'tru', 'Terminal Almacén TRU (prueba dañadas)', 'administrativa', '${T_ALMACEN}') returning id as t_almacen \\gset
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values
  ('${ROSA}', 'Rosa', 'Dañada', 'activo', :'sede_tru'), ('${LUZ}', 'Luz', 'Dañada', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru'), ('${LUZ}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
\\set rosa '${ROSA}'
\\set luz '${LUZ}'
select id as felipe_p from public.personas where auth_user_id = '${FELIPE}' \\gset
select gen_random_uuid() as tok1 \\gset
select gen_random_uuid() as tok2 \\gset
select gen_random_uuid() as tok3 \\gset
`;

/** Cambia de sesión (como `postgres`). `resp`/`ubicacion`: variables psql que van en el encabezado. */
const sesion = (auth, { resp = null, ubicacion = null } = {}) => {
  const campos = [resp ? `'x-responsable', :'${resp}'` : null, ubicacion ? `'x-ubicacion', :'${ubicacion}'` : null].filter(Boolean).join(", ");
  return `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', json_build_object(${campos})::text, true) as _h \\gset
`;
};
const COMO_API = "set local role authenticated;\n";
const COMO_POSTGRES = "reset role;\n";
const soloModulos = (clave, modulos) =>
  `${COMO_POSTGRES}delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('${clave}');\n` +
  (modulos.length
    ? `insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('${clave}'), unnest(array[${modulos.map((m) => `'${m}'`).join(", ")}]);\n`
    : "");
const SIN_EXISTENCIAS_EN_NINGUN_ROL = `${COMO_POSTGRES}delete from retail.rol_modulos where modulo = 'existencias';\n`;
const TERMINAL_CON_MODULO = `${COMO_POSTGRES}insert into retail.rol_modulos (rol_id, modulo)
  select retail.fn_rol_por_clave('terminal_administrativa'), 'existencias'
  where not exists (select 1 from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('terminal_administrativa') and modulo = 'existencias');\n`;
const reportar = (v, n, desde, motivo, tok, ubic = "tru") => `pg_temp.reportar(:'${ubic}', :'${v}', ${n}, ${desde}, ${motivo}, ${tok})`;
const cant = (v, sub, ubic = "tru") =>
  `coalesce((select cantidad from retail.stock where variante_id = :'${v}' and ubicacion_id = :'${ubic}' and sububicacion_id = :'${sub}'), 0)`;
const CONTADORES = `concat_ws(',', (select count(*) from retail.movimientos), (select count(*) from retail.prendas_danadas), (select count(*) from retail.movimientos_internos_intentos))`;
/** Reporta como el líder y guarda el id de la dañada en `:did`. */
const REPORTE_DE_VA = `${sesion(FELIPE)}${COMO_API}select ${reportar("va", 2, "'piso'", "'Mancha en la manga'", ":'tok1'")} as rep \\gset
${COMO_POSTGRES}select (:'rep')::jsonb -> 'res' ->> 'id' as did \\gset
`;

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle = "") {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 2000).replace(/\n/g, "\n    ")}`);
  }
}
/** Corre el caso y le pasa sus líneas de salida a `verificar` (string = la última línea exacta; función = libre). */
function caso(nombre, sql, verificar) {
  const r = correr(sql);
  if (!r.ok) return esperar(nombre, false, r.mensaje);
  let ok = false;
  try {
    ok = typeof verificar === "string" ? r.lineas[r.lineas.length - 1] === verificar : !!verificar(r.lineas);
  } catch {
    ok = false;
  }
  esperar(nombre, ok, typeof verificar === "string" ? `esperaba «${verificar}», salió:\n${r.lineas.join("\n")}` : r.lineas.join("\n"));
}
const json = (linea) => JSON.parse(linea);
const error = (linea, hint, estado = "P0001") => {
  const j = json(linea);
  return j.ok === false && j.estado === estado && j.hint === hint;
};

// ===========================================================================
// D1 · Forma
// ===========================================================================

caso(
  "D1 · una sola versión de cada función, con la firma del contrato",
  `select string_agg(proname || '(' || pg_get_function_identity_arguments(oid) || ')', ';' order by proname)
     from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('reportar_danada', 'arreglar_prenda_danada');`,
  "arreglar_prenda_danada(p_id uuid, p_nota text, p_token uuid);reportar_danada(p_ubicacion_id uuid, p_variante_id uuid, p_cantidad integer, p_desde text, p_motivo text, p_token uuid)"
);
caso(
  "D1 · anon no las ejecuta, authenticated sí; security definer con el search_path fijo de la casa",
  `select string_agg(concat_ws(',', has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'),
                    coalesce(p.proconfig::text like '%search_path=retail, public, extensions%', false), p.prosecdef), ';' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('reportar_danada', 'arreglar_prenda_danada');`,
  "f,t,t,t;f,t,t,t"
);
caso(
  "D1 · los candados nuevos de prendas_danadas existen (tres orígenes, «se arregló» con nota, un movimiento de entrada por dañada)",
  `select concat_ws(',',
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'prendas_danadas_un_origen'),
  (select position('se_arreglo' in pg_get_constraintdef(oid)) > 0 from pg_constraint where conname = 'prendas_danadas_estado_check'),
  (select count(*) from pg_constraint where conname in ('prendas_danadas_arreglo_con_nota', 'prendas_danadas_motivo_reporte_valido')),
  (select indisunique from pg_index where indexrelid = 'retail.prendas_danadas_movimiento_entrada_unico'::regclass));`,
  "CHECK ((num_nonnulls(devolucion_item_id, cambio_id, motivo_reporte) = 1)),t,2,t"
);
{
  const sinComentarios = TEXTO_MIGRACION.replace(/--[^\n]*/g, "");
  esperar(
    "D1 · la migración no crea políticas ni quita disparadores (ADR-0195: en el SQL Editor sería un 40P01)",
    !/\bdrop\s+trigger\b|\b(create|drop)\s+policy\b/i.test(sinComentarios)
  );
  esperar("D1 · ningún `select … into` dentro de un texto entre comillas (ADR-0288)", !/'[^'\n]*\bselect\b[^'\n]*\binto\b[^'\n]*'/i.test(sinComentarios));
}
caso(
  "D1 · pegada dos veces sobre la base de hoy: sin error, una sola firma de cada función y los mismos candados",
  `select pg_temp.intento(${"$"}m$${TEXTO_MIGRACION.replace(/\\/g, "\\\\")}${"$"}m$) ->> 'ok' as p1 \\gset
select pg_temp.intento(${"$"}m$${TEXTO_MIGRACION.replace(/\\/g, "\\\\")}${"$"}m$) ->> 'ok' as p2 \\gset
select concat_ws(',', :'p1', :'p2',
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('reportar_danada', 'arreglar_prenda_danada')),
  (select count(*) from pg_constraint where conrelid = 'retail.prendas_danadas'::regclass and contype = 'c'));`,
  "true,true,2,7"
);
caso(
  "D1 · la guarda: con dos dañadas que comparten movimiento de entrada, la migración aborta y lo dice",
  `drop index retail.prendas_danadas_movimiento_entrada_unico;
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'va', :'tru', :'cua_t', 'entrada', 2, 'prueba dañadas: guarda') returning id as mg \\gset
insert into retail.prendas_danadas (variante_id, ubicacion_id, cantidad, movimiento_entrada_id, motivo_reporte)
  values (:'va', :'tru', 1, :'mg', 'uno'), (:'va', :'tru', 1, :'mg', 'dos');
select pg_temp.intento(${"$"}m$${TEXTO_MIGRACION.replace(/\\/g, "\\\\")}${"$"}m$) as r \\gset
select concat_ws(',', (:'r')::jsonb ->> 'ok', position('mismo movimiento de entrada' in (:'r')::jsonb ->> 'msg') > 0);`,
  "false,t"
);

// ===========================================================================
// D2 · Permisos de reportar
// ===========================================================================

caso(
  "D2 · el líder reporta en cualquier tienda (Trujillo y Lima)",
  `${sesion(FELIPE)}${COMO_API}select ${reportar("va", 1, "'piso'", "'Mancha'", ":'tok1'")};
select ${reportar("va", 1, "'piso'", "'Mancha'", ":'tok2'", "lim")};
${COMO_POSTGRES}select concat_ws(',', ${cant("va", "cua_t")}, ${cant("va", "cua_l", "lim")});`,
  (l) => json(l.at(-3)).ok && json(l.at(-2)).ok && l.at(-1) === "1,1"
);
caso(
  "D2 · integrante SIN Existencias → 42501 «tu rol no tiene el módulo «Existencias»», nada se mueve",
  `${SIN_EXISTENCIAS_EN_NINGUN_ROL}select ${CONTADORES} as antes \\gset
${sesion(MICAELA)}${COMO_API}select ${reportar("va", 1, "'piso'", "'Mancha'", ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "danada_sin_modulo", "42501") && json(l.at(-2)).msg.includes("«Existencias»") && l.at(-1) === "t"
);
caso(
  "D2 · rol con SOLO Existencias: reporta (quien ve el módulo hace lo que hay dentro, ADR-0306)",
  `${soloModulos("integrante", ["existencias"])}${sesion(MICAELA)}${COMO_API}select ${reportar("va", 1, "'piso'", "'Mancha'", ":'tok1'")};`,
  (l) => json(l.at(-1)).ok === true
);
caso(
  "D2 · integrante con Existencias, en OTRA tienda → «no es tu sede», nada se mueve",
  `${soloModulos("integrante", ["existencias"])}select ${CONTADORES} as antes \\gset
${sesion(MICAELA)}${COMO_API}select ${reportar("va", 1, "'piso'", "'Mancha'", ":'tok1'", "lim")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "danada_sin_tienda") && l.at(-1) === "t"
);
caso(
  "D2 · el Taller (sin piso, almacén ni cuarentena) → «aquí no se reportan prendas dañadas»",
  `${sesion(FELIPE)}${COMO_API}select ${reportar("va", 1, "'piso'", "'Mancha'", ":'tok1'", "taller")};`,
  (l) => error(l.at(-1), "danada_sede_sin_cuarentena")
);

// ===========================================================================
// D3 · Firma
// ===========================================================================

caso(
  "D3 · TERMINAL con Existencias + responsable presente: reporta y firma Rosa (usuario_id y terminal_id del movimiento)",
  `${TERMINAL_CON_MODULO}${sesion(T_ALMACEN, { resp: "rosa" })}${COMO_API}select ${reportar("va", 1, "'piso'", "'Mancha'", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok',
  (select m.usuario_id = :'rosa' and m.terminal_id = :'t_almacen' from retail.movimientos m
    where m.id = ((:'r')::jsonb -> 'res' ->> 'movimiento_id')::uuid));`,
  "true,t"
);
caso(
  "D3 · terminal SIN responsable → 42501 «Elige quién hace esta operación» y nada se escribe",
  `${TERMINAL_CON_MODULO}select ${CONTADORES} as antes \\gset
${sesion(T_ALMACEN)}${COMO_API}select ${reportar("va", 1, "'piso'", "'Mancha'", ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "responsable_requerido", "42501") && l.at(-1) === "t"
);

// ===========================================================================
// D4 · Todo o nada y lo apartado
// ===========================================================================

caso(
  "D4 · 3 en el piso y 2 apartadas: reportar 2 no mueve NADA, dice cuántas hay libres y por qué, y trae el detalle",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${reportar("vc", 2, "'piso'", "'Mancha'", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint',
  (:'r')::jsonb ->> 'msg' = 'No se reportó nada. ' || retail.fn_prenda_corta(:'vc') || ': pides 2 y en el piso hay 1 libre (2 apartadas para clientes: si es una de ellas, libera primero el apartado). Puede que otra persona ya la haya movido: revisa el piso.',
  ((:'r')::jsonb ->> 'detail')::jsonb ->> 'hay', ((:'r')::jsonb ->> 'detail')::jsonb ->> 'apartadas',
  ${CONTADORES} = :'antes', ${cant("vc", "piso_t")});`,
  "danada_sin_alcance,t,1,2,t,3"
);
caso(
  "D4 · reportar 1 (lo libre) pasa y lo apartado sigue en el piso, intacto",
  `${sesion(FELIPE)}${COMO_API}select ${reportar("vc", 1, "'piso'", "'Mancha'", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${cant("vc", "piso_t")}, ${cant("vc", "cua_t")},
  (select cantidad_apartada from retail.stock where variante_id = :'vc' and ubicacion_id = :'tru' and sububicacion_id = :'piso_t'));`,
  "true,2,1,2"
);
caso(
  "D4 · desde el almacén, pedir más de lo que hay → nada se mueve",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${reportar("va", 5, "'almacen'", "'Mancha'", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint', position('en el almacén hay 4 libres' in (:'r')::jsonb ->> 'msg') > 0, ${CONTADORES} = :'antes');`,
  "danada_sin_alcance,t,t"
);

// ===========================================================================
// D5 · Efecto: dónde queda la prenda y qué se escribe
// ===========================================================================

caso(
  "D5 · desde el piso: piso −2, cuarentena +2, total igual; UN traslado interno piso→cuarentena con la nota; UNA dañada abierta con su motivo",
  `select ${cant("va", "piso_t")} + ${cant("va", "alm_t")} + ${cant("va", "cua_t")} as total_va \\gset
${REPORTE_DE_VA}select concat_ws(',', (:'rep')::jsonb -> 'res' ->> 'ya_registrada', (:'rep')::jsonb -> 'res' ->> 'unidades',
  ${cant("va", "piso_t")}, ${cant("va", "alm_t")}, ${cant("va", "cua_t")},
  ${cant("va", "piso_t")} + ${cant("va", "alm_t")} + ${cant("va", "cua_t")} = :total_va,
  (select count(*) from retail.movimientos where variante_id = :'va' and tipo = 'traslado'),
  (select bool_and(motivo = 'movimiento_interno' and ubicacion_id = :'tru' and ubicacion_destino_id = :'tru'
                   and sububicacion_id = :'piso_t' and sububicacion_destino_id = :'cua_t' and nota = 'Mancha en la manga'
                   and usuario_id = :'felipe_p')
     from retail.movimientos where variante_id = :'va' and tipo = 'traslado'),
  (select concat_ws('/', pd.estado, pd.cantidad, pd.motivo_reporte, pd.devolucion_item_id is null and pd.cambio_id is null,
                    pd.movimiento_entrada_id = ((:'rep')::jsonb -> 'res' ->> 'movimiento_id')::uuid)
     from retail.prendas_danadas pd where pd.id = :'did'));`,
  "false,2,1,4,2,t,1,t,en_cuarentena/2/Mancha en la manga/t/t"
);
caso(
  "D5 · desde el almacén: almacén −1 y cuarentena +1 (el piso no se toca)",
  `${sesion(FELIPE)}${COMO_API}select ${reportar("va", 1, "'almacen'", "'Botón descosido'", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${cant("va", "piso_t")}, ${cant("va", "alm_t")}, ${cant("va", "cua_t")},
  (select sububicacion_id = :'alm_t' from retail.movimientos where id = ((:'r')::jsonb -> 'res' ->> 'movimiento_id')::uuid));`,
  "true,3,3,1,t"
);
caso(
  "D5 · la caja ya no la puede cobrar: la única del piso se reportó (vender del piso no alcanza) y desde la cuarentena no se vende",
  `${sesion(FELIPE)}${COMO_API}select ${reportar("vb", 1, "'piso'", "'Roto en la costura'", ":'tok1'")} as r \\gset
${COMO_POSTGRES}insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vb', :'tru', :'piso_t', 'salida', 1, 'venta') returning id as m_piso \\gset
select pg_temp.intento(format('select retail.fn_aplicar_movimiento(%L)', :'m_piso')) as vender_piso \\gset
select pg_temp.intento(format('insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo) values (%L, %L, %L, ''salida'', 1, ''venta'')', :'vb', :'tru', :'cua_t')) as vender_cua \\gset
select concat_ws(',', (:'r')::jsonb ->> 'ok', ${cant("vb", "piso_t")}, ${cant("vb", "cua_t")},
  (:'vender_piso')::jsonb ->> 'ok', position('Stock insuficiente' in (:'vender_piso')::jsonb ->> 'msg') > 0,
  (:'vender_cua')::jsonb ->> 'ok', position('Cuarentena' in (:'vender_cua')::jsonb ->> 'msg') > 0);`,
  "true,0,1,false,t,false,t"
);
caso(
  "D5 · reportar no es perder: el movimiento es un traslado dentro de la sede (y, si ya existe la definición única, no cuenta)",
  // `fn_perdida_razon` es de la actividad 14 (PR #784): se llama por texto para que la prueba corra con o sin ella.
  `create function pg_temp.perdida(p_mov uuid) returns text language plpgsql as $f$
declare v text;
begin
  if to_regprocedure('retail.fn_perdida_razon(text, text, integer)') is null then return 'sin-act14'; end if;
  execute 'select coalesce(retail.fn_perdida_razon(tipo, motivo, cantidad), ''null'') from retail.movimientos where id = $1' into v using p_mov;
  return v;
end;
$f$;
${REPORTE_DE_VA}select concat_ws(',',
  (select tipo = 'traslado' and ubicacion_id = ubicacion_destino_id from retail.movimientos where id = ((:'rep')::jsonb -> 'res' ->> 'movimiento_id')::uuid),
  pg_temp.perdida(((:'rep')::jsonb -> 'res' ->> 'movimiento_id')::uuid));`,
  (l) => /^t,(sin-act14|null)$/.test(l.at(-1))
);

// ===========================================================================
// D6 · Idempotencia
// ===========================================================================

caso(
  "D6 · misma marca y mismos datos → ya_registrada con el MISMO id; un solo movimiento y una sola dañada",
  `${REPORTE_DE_VA}${sesion(FELIPE)}${COMO_API}select ${reportar("va", 2, "'piso'", "'  Mancha en la manga '", ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r2')::jsonb -> 'res' ->> 'ya_registrada', (:'r2')::jsonb -> 'res' ->> 'id' = :'did',
  ${cant("va", "piso_t")}, ${cant("va", "cua_t")},
  (select count(*) from retail.movimientos where variante_id = :'va' and tipo = 'traslado'),
  (select count(*) from retail.prendas_danadas where variante_id = :'va'));`,
  "true,t,1,2,1,1"
);
caso(
  // Con el piso ya en 1, la pre-validación diría «no alcanza»; la marca se mira antes y responde «ya estaba».
  "D6 · el reintento responde aunque la responsable ya no esté de turno y aunque el piso ya no alcance",
  `${TERMINAL_CON_MODULO}${sesion(T_ALMACEN, { resp: "rosa" })}${COMO_API}select ${reportar("va", 3, "'piso'", "'Mancha'", ":'tok1'")} as r1 \\gset
${sesion(T_ALMACEN, { resp: "luz" })}${COMO_API}select ${reportar("va", 3, "'piso'", "'Mancha'", ":'tok1'")} as r2 \\gset
${sesion(T_ALMACEN)}${COMO_API}select ${reportar("va", 3, "'piso'", "'Mancha'", ":'tok1'")} as r3 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'ok', (:'r2')::jsonb -> 'res' ->> 'ya_registrada', (:'r3')::jsonb -> 'res' ->> 'ya_registrada',
  ${cant("va", "piso_t")}, (select count(*) from retail.prendas_danadas where variante_id = :'va'));`,
  "true,true,true,0,1"
);
caso(
  "D6 · la misma marca con otro motivo, otra cantidad u otro lugar → mover_interno_token_reusado, nada más se mueve",
  `${REPORTE_DE_VA}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${reportar("va", 2, "'piso'", "'Otra cosa'", ":'tok1'")} as a \\gset
select ${reportar("va", 1, "'piso'", "'Mancha en la manga'", ":'tok1'")} as b \\gset
select ${reportar("va", 2, "'almacen'", "'Mancha en la manga'", ":'tok1'")} as c \\gset
${COMO_POSTGRES}select concat_ws(',', (:'a')::jsonb ->> 'hint', (:'b')::jsonb ->> 'hint', (:'c')::jsonb ->> 'hint', ${CONTADORES} = :'antes');`,
  "mover_interno_token_reusado,mover_interno_token_reusado,mover_interno_token_reusado,t"
);
caso(
  "D6 · la marca de un intento que falló (no alcanzaba) queda libre: corregido, la MISMA marca reporta",
  `${sesion(FELIPE)}${COMO_API}select ${reportar("va", 9, "'piso'", "'Mancha'", ":'tok1'")} as r1 \\gset
select ${reportar("va", 1, "'piso'", "'Mancha'", ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'hint', (:'r2')::jsonb ->> 'ok', (:'r2')::jsonb -> 'res' ->> 'ya_registrada', ${cant("va", "cua_t")});`,
  "danada_sin_alcance,true,false,1"
);

// ===========================================================================
// D7 · Validaciones
// ===========================================================================

caso(
  "D7 · sin marca, lugar inválido, cantidad 0, motivo vacío / de 2 letras / de 201 → cada uno con su hint, y nada se mueve",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${reportar("va", 1, "'piso'", "'Mancha'", "null")};
select ${reportar("va", 1, "'vitrina'", "'Mancha'", ":'tok1'")};
select ${reportar("va", 0, "'piso'", "'Mancha'", ":'tok1'")};
select ${reportar("va", 1, "'piso'", "'   '", ":'tok1'")};
select ${reportar("va", 1, "'piso'", "'ab'", ":'tok1'")};
select ${reportar("va", 1, "'piso'", "repeat('x', 201)", ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) =>
    error(l.at(-7), "danada_sin_token") &&
    error(l.at(-6), "danada_desde_invalido") &&
    error(l.at(-5), "danada_cantidad_invalida") &&
    error(l.at(-4), "danada_sin_motivo") &&
    error(l.at(-3), "danada_sin_motivo") &&
    error(l.at(-2), "danada_motivo_largo") &&
    l.at(-1) === "t"
);
caso(
  "D7 · la «Prenda sin registrar» y una prenda que no existe no se reportan",
  `${sesion(FELIPE)}${COMO_API}select pg_temp.reportar(:'tru', '22222222-2222-4222-8222-222222222222', 1, 'piso', 'Mancha', :'tok1');
select pg_temp.reportar(:'tru', gen_random_uuid(), 1, 'piso', 'Mancha', :'tok2');`,
  (l) => error(l.at(-2), "danada_no_es_prenda") && error(l.at(-1), "danada_no_existe")
);

// ===========================================================================
// D8 · Candados del esquema (lo que la base hace imposible, aunque alguien escriba directo)
// ===========================================================================

caso(
  "D8 · una dañada sin origen, o con reporte Y otro origen, se rechaza; con motivo de 2 letras también",
  `insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'va', :'tru', :'cua_t', 'entrada', 1, 'prueba dañadas: candado') returning id as mc \\gset
select concat_ws(',',
  (pg_temp.intento(format('insert into retail.prendas_danadas (variante_id, ubicacion_id, cantidad, movimiento_entrada_id) values (%L, %L, 1, %L)', :'va', :'tru', :'mc'))) ->> 'msg' like '%prendas_danadas_un_origen%',
  (pg_temp.intento(format('insert into retail.prendas_danadas (variante_id, ubicacion_id, cantidad, movimiento_entrada_id, motivo_reporte, cambio_id) values (%L, %L, 1, %L, ''Mancha'', (select id from retail.cambios limit 1))', :'va', :'tru', :'mc'))) ->> 'ok',
  (pg_temp.intento(format('insert into retail.prendas_danadas (variante_id, ubicacion_id, cantidad, movimiento_entrada_id, motivo_reporte) values (%L, %L, 1, %L, ''ab'')', :'va', :'tru', :'mc'))) ->> 'msg' like '%prendas_danadas_motivo_reporte_valido%');`,
  "t,false,t"
);
caso(
  "D8 · «se arregló» sin nota se rechaza; dos dañadas con el mismo movimiento de entrada, también",
  `${REPORTE_DE_VA}select concat_ws(',',
  (pg_temp.intento(format('update retail.prendas_danadas set estado = ''se_arreglo'', movimiento_salida_id = movimiento_entrada_id, resuelto_en = now(), nota = null where id = %L', :'did'))) ->> 'msg' like '%prendas_danadas_arreglo_con_nota%',
  (pg_temp.intento(format('insert into retail.prendas_danadas (variante_id, ubicacion_id, cantidad, movimiento_entrada_id, motivo_reporte) select variante_id, ubicacion_id, 1, movimiento_entrada_id, ''Otra'' from retail.prendas_danadas where id = %L', :'did'))) ->> 'msg' like '%prendas_danadas_movimiento_entrada_unico%');`,
  "t,t"
);

// ===========================================================================
// A1 · «Se arregló»
// ===========================================================================

caso(
  "A1 · una integrante CON Existencias no puede: «Solo un líder decide…», y nada se mueve",
  `${REPORTE_DE_VA}${soloModulos("integrante", ["existencias"])}select ${CONTADORES} as antes \\gset
${sesion(MICAELA)}${COMO_API}select pg_temp.arreglar(:'did', 'Se cosió el botón', :'tok2') as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint', ${CONTADORES} = :'antes', (select estado from retail.prendas_danadas where id = :'did'));`,
  "arreglo_solo_lider,t,en_cuarentena"
);
caso(
  "A1 · sin nota (o de 2 letras) se rechaza; nada se mueve",
  `${REPORTE_DE_VA}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.arreglar(:'did', '  ', :'tok2') as a \\gset
select pg_temp.arreglar(:'did', 'ok', :'tok2') as b \\gset
select pg_temp.arreglar(:'did', 'Se cosió', null) as c \\gset
${COMO_POSTGRES}select concat_ws(',', (:'a')::jsonb ->> 'hint', (:'b')::jsonb ->> 'hint', (:'c')::jsonb ->> 'hint', ${CONTADORES} = :'antes');`,
  "arreglo_sin_nota,arreglo_sin_nota,arreglo_sin_token,t"
);
caso(
  // Felipe es a la vez la cuenta y el responsable en el caso de abajo: este separa las dos (firmar con la cuenta en vez del
  // responsable pasaba las demás pruebas, mutación MQ1 de la revisión).
  "A1 · el líder operando con responsable (Rosa, de turno en Trujillo): firma Rosa, no la cuenta (resuelto_por y usuario_id del movimiento)",
  `${REPORTE_DE_VA}${sesion(FELIPE, { resp: "rosa", ubicacion: "tru" })}${COMO_API}select pg_temp.arreglar(:'did', 'Se cosió el botón', :'tok2') as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok',
  (select resuelto_por = :'rosa' from retail.prendas_danadas where id = :'did'),
  (select usuario_id = :'rosa' from retail.movimientos where id = ((:'r')::jsonb -> 'res' ->> 'movimiento_id')::uuid));`,
  "true,t,t"
);
caso(
  "A1 · el líder: cuarentena −2 y ALMACÉN +2 (el piso no se toca); traslado interno cuarentena→almacén con la nota; la dañada queda «se_arreglo» firmada",
  `${REPORTE_DE_VA}select ${cant("va", "piso_t")} as piso0 \\gset
select ${cant("va", "alm_t")} as alm0 \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.arreglar(:'did', 'Se cosió el botón', :'tok2') as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', (:'r')::jsonb -> 'res' ->> 'ya_registrada', (:'r')::jsonb -> 'res' ->> 'unidades',
  ${cant("va", "cua_t")}, ${cant("va", "piso_t")} = :piso0, ${cant("va", "alm_t")} - :alm0,
  (select tipo = 'traslado' and motivo = 'movimiento_interno' and sububicacion_id = :'cua_t' and sububicacion_destino_id = :'alm_t'
          and ubicacion_id = ubicacion_destino_id and nota = 'Se cosió el botón' and usuario_id = :'felipe_p'
     from retail.movimientos where id = ((:'r')::jsonb -> 'res' ->> 'movimiento_id')::uuid),
  (select concat_ws('/', estado, nota, resuelto_por = :'felipe_p', resuelto_en is not null,
                    movimiento_salida_id = ((:'r')::jsonb -> 'res' ->> 'movimiento_id')::uuid)
     from retail.prendas_danadas where id = :'did'));`,
  "true,false,2,0,t,2,t,se_arreglo/Se cosió el botón/t/t/t"
);

// ===========================================================================
// A2 · Idempotencia y estados
// ===========================================================================

caso(
  "A2 · el reintento del MISMO arreglo devuelve ya_registrada sin mover nada; con otra marca, «ya se resolvió como Se arregló»",
  `${REPORTE_DE_VA}${sesion(FELIPE)}${COMO_API}select pg_temp.arreglar(:'did', 'Se cosió el botón', :'tok2') as r1 \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.arreglar(:'did', 'Se cosió el botón', :'tok2') as r2 \\gset
select pg_temp.arreglar(:'did', 'Se cosió el botón', :'tok3') as r3 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r2')::jsonb -> 'res' ->> 'ya_registrada', (:'r3')::jsonb ->> 'hint',
  position('«Se arregló»' in (:'r3')::jsonb ->> 'msg') > 0, ${CONTADORES} = :'antes');`,
  "true,arreglo_ya_resuelta,t,t"
);
caso(
  "A2 · después de «Se arregló», las otras salidas la rechazan («ya se resolvió»)",
  `${REPORTE_DE_VA}${sesion(FELIPE)}${COMO_API}select pg_temp.arreglar(:'did', 'Se cosió el botón', :'tok2') as r1 \\gset
select pg_temp.intento(format('select retail.resolver_prenda_danada(%L, ''se_boto'')', :'did')) as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'ok', (:'r2')::jsonb ->> 'ok', position('ya se resolvió' in (:'r2')::jsonb ->> 'msg') > 0);`,
  "true,false,t"
);
caso(
  "A2 · las salidas de siempre siguen funcionando sobre una prenda reportada (Se botó: sale de la cuarentena)",
  `${REPORTE_DE_VA}${sesion(FELIPE)}${COMO_API}select pg_temp.intento(format('select retail.resolver_prenda_danada(%L, ''se_boto'', ''Sin arreglo'')', :'did')) as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${cant("va", "cua_t")}, (select estado from retail.prendas_danadas where id = :'did'));`,
  "true,0,se_boto"
);
caso(
  "A2 · arreglar una dañada que no existe → «ya no está en la lista»",
  `${sesion(FELIPE)}${COMO_API}select pg_temp.arreglar(gen_random_uuid(), 'Se cosió el botón', :'tok2');`,
  (l) => error(l.at(-1), "arreglo_no_existe")
);

console.log(`\n${total - fallos}/${total} pruebas en verde.`);
process.exit(fallos ? 1 : 0);

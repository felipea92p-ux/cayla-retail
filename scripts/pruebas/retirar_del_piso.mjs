#!/usr/bin/env node
/**
 * Prueba de ADR-0300 «Subir a almacén» — `retirar_del_piso` (`20261001150000_retirar_del_piso.sql`): sube varias tallas del
 * piso al almacén de una tienda en UNA transacción.
 *
 * QUÉ CUBRE
 *   P1 forma: una sola versión con la firma del contrato; anon no la ejecuta y authenticated sí; la migración no crea
 *      políticas ni quita disparadores (CLAUDE.md, «Políticas y deadlocks»).
 *   P2 permisos (ADR-0306: «Bajada al piso» ya no es módulo, es una función de Existencias): el líder en cualquier
 *      tienda; sin Existencias no (ni con Conteos y Traslados); con SOLO Existencias sí; con solo Vender no (igual que
 *      `mover_entre_piso_y_almacen`, ADR-0240); en otra tienda no.
 *   P3 firma: terminal con Existencias y responsable presente sube y firma la responsable; sin responsable o con una
 *      ausente, 42501; reintentar algo ya guardado responde aunque la responsable ya no esté.
 *   P4 todo o nada: una lista con dos líneas imposibles no sube NINGUNA (ni la que alcanzaba), nombra las dos y trae el
 *      detalle en JSON; lo apartado para clientas no se sube; inexistente y «Prenda sin registrar».
 *   P5 libro: piso −n, almacén +n, total igual; UNA fila `traslado`/`movimiento_interno` piso→almacén por talla con su
 *      nota, idéntica a la que escribe `mover_entre_piso_y_almacen`; una talla archivada con prendas en el piso SÍ se sube
 *      (es la limpieza que la bajada no permite).
 *   P6 idempotencia: misma marca y misma lista (en otro orden, repetidas sumadas) → ya_registrada y el stock se mueve UNA
 *      vez, aunque el piso ya esté en cero; la misma marca con otra cantidad se rechaza y no mueve nada; la marca de un
 *      intento que falló queda libre.
 *   P7 forma de la lista y de la tienda: sin marca, vacía, línea inválida, nota de más de 200 caracteres, más de 300
 *      tallas, el Taller (sin piso ni almacén).
 *
 * CÓMO. Igual que `bajada_al_piso.mjs`: cada caso en su transacción con ROLLBACK (nunca se commitea nada), sesión simulada
 * con `request.jwt.claim.sub` y el encabezado de PostgREST con `request.headers`. Las prendas son NUEVAS en cada caso
 * (producto «Blusa Retiro Prueba» con 6 tallas) y su stock de partida se arma en el PISO de Trujillo.
 *
 * USO
 *   pnpm pruebas:retirar-del-piso    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = "20261001150000_retirar_del_piso.sql";
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const T_ALMACEN = "33333333-3333-4333-8333-0000000000c3"; // cuenta de una terminal administrativa de Trujillo (esta prueba)
const ROSA = "33333333-3333-4333-8333-0000000000e1"; // integrante de Trujillo sin cuenta, marcó entrada: la responsable
const LUZ = "33333333-3333-4333-8333-0000000000e2"; // integrante de Trujillo sin cuenta, NO marcó entrada

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
create function pg_temp.retirar(p_ubicacion uuid, p_items jsonb, p_nota text, p_token uuid) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_detail text;
begin
  return jsonb_build_object('ok', true, 'res', retail.retirar_del_piso(p_ubicacion, p_items, p_nota, p_token));
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint, v_detail = pg_exception_detail;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg, 'detail', nullif(v_detail, ''));
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
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'almacen_tienda');
select id as piso_t from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as alm_t from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as piso_l from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' \\gset
select id as alm_l from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'almacen_tienda' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
-- Prendas propias: seis tallas de un producto nuevo. vx se archiva (con prendas en el piso, como datos viejos).
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Retiro Prueba', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as prod \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prod', t.id, :'color', 'RET-PRUEBA-' || t.n, 50
    from (select id, row_number() over (order by valor, id) as n from retail.tallas) t where t.n <= 6;
select id as va from retail.variantes where sku = 'RET-PRUEBA-1' \\gset
select id as vb from retail.variantes where sku = 'RET-PRUEBA-2' \\gset
select id as vc from retail.variantes where sku = 'RET-PRUEBA-3' \\gset
select id as vd from retail.variantes where sku = 'RET-PRUEBA-4' \\gset
select id as ve from retail.variantes where sku = 'RET-PRUEBA-5' \\gset
select id as vx from retail.variantes where sku = 'RET-PRUEBA-6' \\gset
-- PISO de Trujillo: va 10, vb 10, vc 5, vd 4, vx 5 (ve queda sin nada). Piso de Lima: va 5.
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x.v, x.u, x.s, 'entrada', x.n, 'prueba retirar del piso: colchón'
    from (values (:'va'::uuid, :'tru'::uuid, :'piso_t'::uuid, 10), (:'vb', :'tru', :'piso_t', 10), (:'vc', :'tru', :'piso_t', 5),
                 (:'vd', :'tru', :'piso_t', 4), (:'vx', :'tru', :'piso_t', 5), (:'va', :'lim', :'piso_l', 5)) x(v, u, s, n);
select count(*) as _colchon from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  where m.variante_id in (:'va', :'vb', :'vc', :'vd', :'vx') and m.tipo = 'entrada') x \\gset
-- Talla archivada CON prendas en el piso: se arma sin disparadores, solo dentro de esta transacción.
set local session_replication_role = replica;
update retail.variantes set activo = false where id = :'vx';
set local session_replication_role = origin;
-- Apartadas para clientas en el PISO de Trujillo: vc 3 (quedan 2 libres).
select retail.apartar_stock(:'vc', :'tru', 3, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 3, null, :'piso_t', null) as _ap1 \\gset
-- La terminal del almacén de Trujillo y dos integrantes sin cuenta: Rosa marcó entrada, Luz no.
insert into auth.users (id, aud, role, email) values ('${T_ALMACEN}', 'authenticated', 'authenticated', 'terminal-almacen-retiro@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id)
  values (:'tru', 'Terminal Almacén TRU (prueba retiro)', 'administrativa', '${T_ALMACEN}') returning id as t_almacen \\gset
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values
  ('${ROSA}', 'Rosa', 'Prueba', 'activo', :'sede_tru'), ('${LUZ}', 'Luz', 'Prueba', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru'), ('${LUZ}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
\\set rosa '${ROSA}'
\\set luz '${LUZ}'
select gen_random_uuid() as tok1 \\gset
select gen_random_uuid() as tok2 \\gset
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
/** Ningún rol con Existencias (desde ADR-0306 el candado de subir y bajar es ver Existencias). */
const SIN_EXISTENCIAS_EN_NINGUN_ROL = `${COMO_POSTGRES}delete from retail.rol_modulos where modulo = 'existencias';\n`;
const TERMINAL_CON_MODULO = `${COMO_POSTGRES}insert into retail.rol_modulos (rol_id, modulo)
  select retail.fn_rol_por_clave('terminal_administrativa'), 'existencias'
  where not exists (select 1 from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('terminal_administrativa') and modulo = 'existencias');\n`;
/** [["va", 3], ["vb", 2]] → la lista jsonb de la RPC. */
const lista = (...pares) =>
  `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', ${n})`).join(", ")})`;
const retirar = (ubic, items, tok, nota = "null") => `pg_temp.retirar(:'${ubic}', ${items}, ${nota}, ${tok})`;
const cant = (v, sub, ubic = "tru") =>
  `coalesce((select cantidad from retail.stock where variante_id = :'${v}' and ubicacion_id = :'${ubic}' and sububicacion_id = :'${sub}'), 0)`;
const CONTADORES = `concat_ws(',', (select count(*) from retail.movimientos), (select count(*) from retail.movimientos_internos_intentos))`;

const MSG = {
  sinToken: "Falta la marca de este intento. Cierra la ventana y vuelve a abrirla.",
  sinModulo: "No puedes mover prendas entre el piso y el almacén: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.",
  sinTienda: "No tienes permiso para mover mercadería en esa tienda.",
  vacia: "No hay prendas para subir: elige al menos una.",
  lineaInvalida: "Cada prenda necesita un código válido y al menos 1 unidad.",
  notaLarga: "La nota admite hasta 200 caracteres.",
  sinPiso: "Esta tienda todavía no separa piso y almacén: no hay nada que subir.",
  otraPersona: ". Puede que otra persona ya las haya movido: revisa el piso y corrige esas líneas.",
};

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
  } catch (e) {
    ok = false;
  }
  esperar(nombre, ok, typeof verificar === "string" ? `esperaba «${verificar}», salió:\n${r.lineas.join("\n")}` : r.lineas.join("\n"));
}
const json = (linea) => JSON.parse(linea);
const error = (linea, hint, msg) => {
  const j = json(linea);
  return j.ok === false && j.estado === "P0001" && j.hint === hint && (msg === undefined || j.msg === msg);
};

// ===========================================================================
// P1 · Forma
// ===========================================================================

caso(
  "P1 · una sola versión de retirar_del_piso, con la firma del contrato",
  `select count(*) || '|' || string_agg(pg_get_function_identity_arguments(oid), ';')
     from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'retirar_del_piso';`,
  "1|p_ubicacion_id uuid, p_items jsonb, p_nota text, p_token uuid"
);
caso(
  "P1 · anon no la ejecuta, authenticated sí, y corre con el search_path fijo de la casa",
  `select concat_ws(',', has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'),
                    coalesce(p.proconfig::text like '%search_path=retail, public, extensions%', false), p.prosecdef)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'retirar_del_piso';`,
  "f,t,t,t"
);
{
  // Sin los comentarios: la cabecera puede explicar la regla sin romperla.
  const sinComentarios = readFileSync(join(RAIZ, "supabase", "migrations", MIGRACION), "utf8").replace(/--[^\n]*/g, "");
  esperar(
    "P1 · la migración no crea políticas, ni quita disparadores, ni altera tablas (ADR-0195: en el SQL Editor sería un 40P01)",
    !/\bdrop\s+trigger\b|\b(create|drop)\s+policy\b|\balter\s+table\b/i.test(sinComentarios)
  );
}

// ===========================================================================
// P2 · Permisos
// ===========================================================================

caso(
  "P2 · el líder sube en cualquier tienda (Trujillo y Lima)",
  `${sesion(FELIPE)}${COMO_API}select ${retirar("tru", lista(["va", 2]), ":'tok1'")};
select ${retirar("lim", lista(["va", 1]), ":'tok2'")};
${COMO_POSTGRES}select concat_ws(',', ${cant("va", "piso_t")}, ${cant("va", "piso_l", "lim")});`,
  (l) => json(l.at(-3)).ok && json(l.at(-2)).ok && l.at(-1) === "8,4"
);
caso(
  "P2 · integrante SIN Existencias → «tu rol no tiene el módulo «Existencias»», nada se mueve",
  `${SIN_EXISTENCIAS_EN_NINGUN_ROL}select ${CONTADORES} as antes \\gset
${sesion(MICAELA)}${COMO_API}select ${retirar("tru", lista(["va", 1]), ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "bajada_sin_modulo", MSG.sinModulo) && l.at(-1) === "t"
);
caso(
  "P2 · rol con SOLO Existencias: sube (el candado es ver el módulo)",
  `${soloModulos("integrante", ["existencias"])}${sesion(MICAELA)}${COMO_API}select ${retirar("tru", lista(["va", 2]), ":'tok1'")};`,
  (l) => json(l.at(-1)).ok === true
);
caso(
  "P2 · rol con Conteos y Traslados (sin Existencias) o SOLO Vender → rechazado (mover piso↔almacén es de Existencias, ADR-0306)",
  `${soloModulos("integrante", ["conteos", "traslados"])}${sesion(MICAELA)}${COMO_API}select ${retirar("tru", lista(["va", 1]), ":'tok1'")};
${soloModulos("integrante", ["vender"])}${sesion(MICAELA)}${COMO_API}select ${retirar("tru", lista(["va", 1]), ":'tok2'")};`,
  (l) => error(l.at(-2), "bajada_sin_modulo", MSG.sinModulo) && error(l.at(-1), "bajada_sin_modulo", MSG.sinModulo)
);
caso(
  "P2 · integrante con Existencias, en OTRA tienda → «No tienes permiso para mover mercadería en esa tienda.»",
  `${soloModulos("integrante", ["existencias"])}${sesion(MICAELA)}${COMO_API}select ${retirar("lim", lista(["va", 1]), ":'tok1'")};`,
  (l) => error(l.at(-1), "retiro_sin_tienda", MSG.sinTienda)
);

// ===========================================================================
// P3 · Firma (terminal y responsable)
// ===========================================================================

caso(
  "P3 · TERMINAL cuyo rol tiene el módulo + responsable presente: sube, y firma Rosa (usuario_id y terminal_id)",
  `${TERMINAL_CON_MODULO}${sesion(T_ALMACEN, { resp: "rosa" })}${COMO_API}select ${retirar("tru", lista(["va", 2], ["vb", 1]), ":'tok1'")} as r \\gset
${COMO_POSTGRES}select (:'r')::jsonb ->> 'ok';
select concat_ws(',', count(*), bool_and(m.usuario_id = :'rosa' and m.terminal_id = :'t_almacen'))
  from retail.movimientos m where m.motivo = 'movimiento_interno' and m.variante_id in (:'va', :'vb');`,
  (l) => l.at(-2) === "true" && l.at(-1) === "2,t"
);
caso(
  "P3 · terminal SIN x-responsable → 42501 «Elige quién hace esta operación» y nada se escribe",
  `${TERMINAL_CON_MODULO}select ${CONTADORES} as antes \\gset
${sesion(T_ALMACEN)}${COMO_API}select ${retirar("tru", lista(["va", 1]), ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => {
    const j = json(l.at(-2));
    return j.estado === "42501" && j.hint === "responsable_requerido" && j.msg.startsWith("Elige quién hace esta operación") && l.at(-1) === "t";
  }
);
caso(
  "P3 · terminal con responsable AUSENTE (sin marcar entrada) → 42501 responsable_no_presente",
  `${TERMINAL_CON_MODULO}${sesion(T_ALMACEN, { resp: "luz" })}${COMO_API}select ${retirar("tru", lista(["va", 1]), ":'tok1'")};`,
  (l) => {
    const j = json(l.at(-1));
    return j.estado === "42501" && j.hint === "responsable_no_presente";
  }
);
caso(
  // Un reintento de algo ya guardado no escribe nada: la marca se mira ANTES de pedir responsable. Si no, la pantalla
  // leería el 42501 como «no se guardó» y la colaboradora podría subir dos veces.
  "P3 · reintento con la misma marca y la misma lista, con la responsable YA fuera de turno (o sin responsable) → ya_registrada",
  `${TERMINAL_CON_MODULO}${sesion(T_ALMACEN, { resp: "rosa" })}${COMO_API}select ${retirar("tru", lista(["va", 2], ["vb", 1]), ":'tok1'")} as r1 \\gset
${sesion(T_ALMACEN, { resp: "luz" })}${COMO_API}select ${retirar("tru", lista(["vb", 1], ["va", 2]), ":'tok1'")} as r2 \\gset
${sesion(T_ALMACEN)}${COMO_API}select ${retirar("tru", lista(["va", 2], ["vb", 1]), ":'tok1'")} as r3 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'ok', (:'r2')::jsonb -> 'res' ->> 'ya_registrada', (:'r3')::jsonb -> 'res' ->> 'ya_registrada',
  (select count(*) from retail.movimientos where motivo = 'movimiento_interno' and variante_id in (:'va', :'vb')));`,
  "true,true,true,2"
);

// ===========================================================================
// P4 · Todo o nada y el mensaje de lo que no alcanza
// ===========================================================================

caso(
  "P4 · 3 líneas con la 2ª y la 3ª imposibles → UN error que nombra las dos, detail JSON de 2, y no se mueve NADA (ni la 1ª)",
  `select ${CONTADORES} as antes \\gset
select ${cant("va", "piso_t")} || ',' || ${cant("va", "alm_t")} as va_antes \\gset
${sesion(FELIPE)}${COMO_API}select ${retirar("tru", lista(["va", 1], ["vb", 99], ["vc", 3]), ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',',
  (:'r')::jsonb ->> 'hint',
  ((:'r')::jsonb ->> 'msg') like 'No se subió nada. %',
  position(retail.fn_prenda_corta(:'vb') || ': pides 99 y en el piso hay 10' in (:'r')::jsonb ->> 'msg') > 0,
  position(retail.fn_prenda_corta(:'vc') || ': pides 3 y en el piso hay 2 (3 apartadas para clientas)' in (:'r')::jsonb ->> 'msg') > 0,
  ((:'r')::jsonb ->> 'msg') like '%${MSG.otraPersona}',
  position(retail.fn_prenda_corta(:'va') in (:'r')::jsonb ->> 'msg') = 0,
  jsonb_array_length(((:'r')::jsonb ->> 'detail')::jsonb),
  (select string_agg(e ->> 'motivo' || ':' || (e ->> 'pide') || ':' || (e ->> 'hay') || ':' || (e ->> 'apartadas'), ';' order by e ->> 'pide')
     from jsonb_array_elements(((:'r')::jsonb ->> 'detail')::jsonb) e),
  (select bool_and((e ->> 'variante_id')::uuid in (:'vb', :'vc')) from jsonb_array_elements(((:'r')::jsonb ->> 'detail')::jsonb) e),
  ${CONTADORES} = :'antes',
  ${cant("va", "piso_t")} || ',' || ${cant("va", "alm_t")} = :'va_antes');`,
  "retiro_sin_alcance,t,t,t,t,t,2,sin_alcance:3:2:3;sin_alcance:99:10:0,t,t,t"
);
caso(
  "P4 · apartadas: 5 en el piso y 3 apartadas — pedir 3 falla con «(3 apartadas para clientas)», pedir 2 pasa y lo apartado sigue en el piso",
  `${sesion(FELIPE)}${COMO_API}select ${retirar("tru", lista(["vc", 3]), ":'tok1'")} as r \\gset
select ${retirar("tru", lista(["vc", 2]), ":'tok2'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',',
  (:'r')::jsonb ->> 'msg' = 'No se subió nada. ' || retail.fn_prenda_corta(:'vc') || ': pides 3 y en el piso hay 2 (3 apartadas para clientas)${MSG.otraPersona}',
  (:'r2')::jsonb ->> 'ok', ${cant("vc", "piso_t")}, ${cant("vc", "alm_t")},
  (select cantidad_apartada from retail.stock where variante_id = :'vc' and ubicacion_id = :'tru' and sububicacion_id = :'piso_t'));`,
  "t,true,3,2,3"
);
caso(
  "P4 · una talla que no existe en el catálogo, y la «Prenda sin registrar»: no se suben y nada se mueve",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.retirar(:'tru', jsonb_build_array(jsonb_build_object('variante_id', gen_random_uuid(), 'cantidad', 1)), null, :'tok1') as r1 \\gset
select pg_temp.retirar(:'tru', jsonb_build_array(jsonb_build_object('variante_id', '22222222-2222-4222-8222-222222222222', 'cantidad', 1)), null, :'tok2') as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'hint', ((:'r1')::jsonb ->> 'detail')::jsonb -> 0 ->> 'motivo',
  (:'r2')::jsonb ->> 'hint', ((:'r2')::jsonb ->> 'detail')::jsonb -> 0 ->> 'motivo', ${CONTADORES} = :'antes');`,
  "retiro_sin_alcance,no_existe,retiro_sin_alcance,no_es_prenda,t"
);

// ===========================================================================
// P5 · Libro
// ===========================================================================

caso(
  "P5 · piso −n, almacén +n, total igual; UNA fila traslado/movimiento_interno piso→almacén por talla, con la nota en las dos",
  `select ${cant("va", "piso_t")} + ${cant("va", "alm_t")} as total_va \\gset
${sesion(FELIPE)}${COMO_API}select ${retirar("tru", lista(["va", 3], ["vb", 2]), ":'tok1'", "'Fin de temporada'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', (:'r')::jsonb -> 'res' ->> 'ya_registrada', (:'r')::jsonb -> 'res' ->> 'lineas', (:'r')::jsonb -> 'res' ->> 'unidades',
  ${cant("va", "piso_t")}, ${cant("va", "alm_t")}, ${cant("va", "piso_t")} + ${cant("va", "alm_t")} = :total_va,
  ${cant("vb", "piso_t")}, ${cant("vb", "alm_t")},
  (select count(*) from retail.movimientos where motivo = 'movimiento_interno' and variante_id in (:'va', :'vb')),
  (select bool_and(tipo = 'traslado' and sububicacion_id = :'piso_t' and sububicacion_destino_id = :'alm_t'
                   and ubicacion_id = :'tru' and ubicacion_destino_id = :'tru' and nota = 'Fin de temporada')
     from retail.movimientos where motivo = 'movimiento_interno' and variante_id in (:'va', :'vb')));`,
  "true,false,2,5,7,3,t,8,2,2,t"
);
caso(
  "P5 · la fila es IDÉNTICA a la que escribe «Retirar del piso» por mover_entre_piso_y_almacen (mismo tipo, motivo, lugares, nota y firma)",
  `${sesion(FELIPE)}${COMO_API}select ${retirar("tru", lista(["va", 1]), ":'tok1'", "'misma nota'")} as r \\gset
select pg_temp.intento(format('select retail.mover_entre_piso_y_almacen(%L, %L, 1, %L, %L, %L)', :'tru', :'vb', :'piso_t', :'alm_t', 'misma nota')) as m \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', (:'m')::jsonb ->> 'ok',
  (select count(distinct (tipo, motivo, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, cantidad, nota, usuario_id))
     from retail.movimientos where motivo = 'movimiento_interno' and variante_id in (:'va', :'vb')));`,
  "true,true,1"
);
caso(
  "P5 · una talla ARCHIVADA con prendas en el piso SÍ se sube (limpiar el piso: lo que la bajada no permite)",
  `${sesion(FELIPE)}${COMO_API}select ${retirar("tru", lista(["vx", 5]), ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${cant("vx", "piso_t")}, ${cant("vx", "alm_t")});`,
  "true,0,5"
);

// ===========================================================================
// P6 · Idempotencia
// ===========================================================================

caso(
  "P6 · misma marca y misma lista (en otro orden, repetidas sumadas) → ya_registrada, y el stock se mueve UNA vez",
  `select ${cant("va", "piso_t")} as p0 \\gset
${sesion(FELIPE)}${COMO_API}select ${retirar("tru", lista(["va", 2], ["vb", 1]), ":'tok1'")} as r1 \\gset
select ${retirar("tru", lista(["vb", 1], ["va", 1], ["va", 1]), ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',',
  (:'r1')::jsonb -> 'res' ->> 'ya_registrada', (:'r2')::jsonb -> 'res' ->> 'ya_registrada',
  (:'r2')::jsonb -> 'res' ->> 'lineas', (:'r2')::jsonb -> 'res' ->> 'unidades',
  :p0 - ${cant("va", "piso_t")},
  (select count(*) from retail.movimientos where motivo = 'movimiento_interno' and variante_id in (:'va', :'vb')));`,
  "false,true,2,3,2,2"
);
caso(
  // La pantalla reenvía tras un corte de red: aunque ya se haya subido TODO el piso, la respuesta es «ya estaba», no «no alcanza».
  "P6 · con el piso ya en cero, reenviar la misma lista responde ya_registrada (la pre-validación no corre sobre lo ya guardado)",
  `${sesion(FELIPE)}${COMO_API}select ${retirar("tru", lista(["va", 10]), ":'tok1'")} as r1 \\gset
select ${retirar("tru", lista(["va", 10]), ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'ok', (:'r2')::jsonb ->> 'ok', (:'r2')::jsonb -> 'res' ->> 'ya_registrada', ${cant("va", "piso_t")}, ${cant("va", "alm_t")});`,
  "true,true,true,0,10"
);
caso(
  "P6 · la misma marca con OTRA cantidad se rechaza (mover_interno_token_reusado) y no se mueve nada más",
  `${sesion(FELIPE)}${COMO_API}select ${retirar("tru", lista(["va", 2], ["vb", 1]), ":'tok1'")} as r1 \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${retirar("tru", lista(["va", 2], ["vb", 2]), ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r2')::jsonb ->> 'ok', (:'r2')::jsonb ->> 'hint', ${CONTADORES} = :'antes');`,
  "false,mover_interno_token_reusado,t"
);
caso(
  "P6 · la marca de un intento que falló queda libre: corregida la lista, la MISMA marca sube",
  `${sesion(FELIPE)}${COMO_API}select ${retirar("tru", lista(["va", 1], ["vb", 99]), ":'tok1'")} as r1 \\gset
select ${retirar("tru", lista(["va", 1], ["vb", 1]), ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'hint', (:'r2')::jsonb ->> 'ok', (:'r2')::jsonb -> 'res' ->> 'ya_registrada', ${cant("va", "alm_t")}, ${cant("vb", "alm_t")});`,
  "retiro_sin_alcance,true,false,1,1"
);

// ===========================================================================
// P7 · Forma de la lista y de la tienda
// ===========================================================================

caso(
  "P7 · sin marca → «Falta la marca de este intento…» y nada se mueve",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.retirar(:'tru', ${lista(["va", 1])}, null, null) as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint', (:'r')::jsonb ->> 'msg' = '${MSG.sinToken}', ${CONTADORES} = :'antes');`,
  "retiro_sin_token,t,t"
);
caso(
  "P7 · lista vacía o que no es lista → «elige al menos una»",
  `${sesion(FELIPE)}${COMO_API}select pg_temp.retirar(:'tru', '[]'::jsonb, null, :'tok1');
select pg_temp.retirar(:'tru', '{}'::jsonb, null, :'tok2');`,
  (l) => error(l.at(-2), "retiro_vacio", MSG.vacia) && error(l.at(-1), "retiro_vacio", MSG.vacia)
);
caso(
  "P7 · una línea sin cantidad válida (0, negativa, con decimales) o sin código de prenda válido",
  `${sesion(FELIPE)}${COMO_API}select ${retirar("tru", lista(["va", 0]), ":'tok1'")};
select ${retirar("tru", lista(["va", -1]), ":'tok1'")};
select pg_temp.retirar(:'tru', jsonb_build_array(jsonb_build_object('variante_id', :'va', 'cantidad', 1.5)), null, :'tok1');
select pg_temp.retirar(:'tru', jsonb_build_array(jsonb_build_object('variante_id', 'no-es-uuid', 'cantidad', 1)), null, :'tok1');`,
  (l) => l.slice(-4).every((x) => error(x, "retiro_linea_invalida", MSG.lineaInvalida))
);
caso(
  "P7 · una nota de más de 200 caracteres se rechaza; de 200 pasa",
  `${sesion(FELIPE)}${COMO_API}select ${retirar("tru", lista(["va", 1]), ":'tok1'", "repeat('x', 201)")};
select ${retirar("tru", lista(["va", 1]), ":'tok2'", "repeat('x', 200)")};`,
  (l) => error(l.at(-2), "retiro_nota_larga", MSG.notaLarga) && json(l.at(-1)).ok === true
);
caso(
  "P7 · más de 300 tallas distintas → «hasta 300», sin efectos",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.retirar(:'tru',
  (select jsonb_agg(jsonb_build_object('variante_id', gen_random_uuid(), 'cantidad', 1)) from generate_series(1, 301)), null, :'tok1') as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint', ${CONTADORES} = :'antes');`,
  "retiro_muy_largo,t"
);
caso(
  "P7 · el Taller (sin piso ni almacén) → «Esta tienda todavía no separa piso y almacén…», sin efectos",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${retirar("taller", lista(["va", 1]), ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "retiro_tienda_sin_piso", MSG.sinPiso) && l.at(-1) === "t"
);

console.log(`\n${total - fallos}/${total} pruebas en verde.`);
process.exit(fallos ? 1 : 0);

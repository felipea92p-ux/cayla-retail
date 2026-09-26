#!/usr/bin/env node
/**
 * Prueba de ADR-0208 «Frescura del piso», paso 1 — `bajar_al_piso`, sus tablas y su diagnóstico
 * (`20260926000000_bajada_piso_modulo.sql`, `20260926000100_bajada_piso_tablas.sql`, `20260926000200_bajada_piso_funciones.sql`).
 *
 * QUÉ CUBRE
 *   P1 forma: una sola versión con la firma del contrato; anon no la ejecuta, authenticated sí; las dos tablas con RLS,
 *      sin políticas y sin privilegios; fn_prenda_corta y fn_verificar_bajadas solo para otras funciones; el módulo nace
 *      sin rol; firma con el responsable una sola vez y sin el patrón viejo de auth.uid(); los cuatro disparadores
 *      (editar/borrar y vaciar, en las dos tablas); y que ninguna de las cinco partes quite un disparador ni cree una
 *      política (CLAUDE.md, «Políticas y deadlocks»: en el SQL Editor de producción es el 40P01 de ADR-0195).
 *   P2 permisos: el líder baja en cualquier tienda; sin el módulo no; con SOLO «Bajada al piso» baja y sigue sin poder
 *      ajustar ni cerrar un conteo; con SOLO Existencias no baja por aquí pero «Reponer» (mover_interno) le sigue
 *      funcionando (no hay implicación); con solo Vender no; en otra tienda no; un rol «limitado como hoy» con el módulo sí.
 *   P3 firma: terminal con el módulo y responsable presente baja y firma la responsable; sin responsable, 42501; con
 *      responsable ausente, 42501; terminal sin el módulo, no.
 *   P4 todo o nada: una lista con dos líneas imposibles no baja NINGUNA (ni la que alcanzaba), nombra las dos y trae el
 *      detalle en JSON; apartadas (singular y plural), archivada, «Prenda sin registrar», inexistente y «Y 1 prenda más» /
 *      «Y N prendas más».
 *   P5 libro: piso +n, almacén −n, total igual; filas traslado almacén→piso idénticas a las de mover_interno; ítems 1 a 1;
 *      fn_verificar_bajadas da cero filas (y detecta un documento vacío y una línea falsa).
 *   P6 idempotencia: mismo token y misma lista (en otro orden) → misma bajada, sin mover dos veces; otra lista → aviso
 *      con la hora y las prendas ya guardadas, el DETAIL con esas líneas ([{variante_id, cantidad}] en orden de prenda)
 *      para que la pantalla deje solo lo que faltaba, y nada se repite; otra tienda → aviso; sin token → aviso; el token
 *      de un intento que falló queda libre.
 *   P7 forma de la lista; P8 tienda sin piso ni almacén; P9 inmutabilidad (editar, borrar y vaciar) y unicidad; P10 la
 *      regla de la pre-validación coincide con la del motor (fn_aplicar_movimiento).
 *
 * CÓMO. Igual que `gastos.mjs` y `actor_firma_las_operaciones.mjs`: cada caso en su transacción con ROLLBACK (nunca se
 * commitea nada), sesión simulada con `request.jwt.claim.sub` y el encabezado de PostgREST con `request.headers`. Las
 * prendas son NUEVAS en cada caso (producto «Blusa Bajada Prueba» con 6 tallas): no se asume ningún stock de partida.
 * `pg_temp.bajar` llama a la RPC y devuelve el resultado o el error (estado, hint, mensaje y detalle) como JSON.
 *
 * USO
 *   pnpm pruebas:bajada-al-piso    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const PARTES = [
  "20260926000000_bajada_piso_modulo.sql",
  "20260926000100_bajada_piso_tablas.sql",
  "20260926000200_bajada_piso_funciones.sql",
  "20260926000300_frescura_lectura_bajadas.sql",
  "20260926000400_reposicion_no_toca_el_piso.sql",
];
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const T_ALMACEN = "33333333-3333-4333-8333-0000000000c2"; // cuenta de una terminal administrativa de Trujillo
const ROSA = "33333333-3333-4333-8333-0000000000d1"; // integrante de Trujillo sin cuenta, marcó entrada: la responsable
const LUZ = "33333333-3333-4333-8333-0000000000d2"; // integrante de Trujillo sin cuenta, NO marcó entrada

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
create function pg_temp.bajar(p_ubicacion uuid, p_items jsonb, p_token uuid) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_detail text;
begin
  return jsonb_build_object('ok', true, 'res', retail.bajar_al_piso(p_ubicacion, p_items, p_token));
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
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
-- Prendas propias: seis tallas de un producto nuevo. va..ve activas; vx se archiva.
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Bajada Prueba', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as prod \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prod', t.id, :'color', 'BAJ-PRUEBA-' || t.n, 50
    from (select id, row_number() over (order by valor, id) as n from retail.tallas) t where t.n <= 6;
select id as va from retail.variantes where sku = 'BAJ-PRUEBA-1' \\gset
select id as vb from retail.variantes where sku = 'BAJ-PRUEBA-2' \\gset
select id as vc from retail.variantes where sku = 'BAJ-PRUEBA-3' \\gset
select id as vd from retail.variantes where sku = 'BAJ-PRUEBA-4' \\gset
select id as ve from retail.variantes where sku = 'BAJ-PRUEBA-5' \\gset
select id as vx from retail.variantes where sku = 'BAJ-PRUEBA-6' \\gset
-- Almacén de Trujillo: va 10, vb 10, vc 5, vd 10, ve 4, vx 5. Almacén de Lima: va 10.
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x.v, x.u, x.s, 'entrada', x.n, 'prueba bajada al piso: colchón'
    from (values (:'va'::uuid, :'tru'::uuid, :'alm_t'::uuid, 10), (:'vb', :'tru', :'alm_t', 10), (:'vc', :'tru', :'alm_t', 5),
                 (:'vd', :'tru', :'alm_t', 10), (:'ve', :'tru', :'alm_t', 4), (:'vx', :'tru', :'alm_t', 5),
                 (:'va', :'lim', :'alm_l', 10)) x(v, u, s, n);
select count(*) as _colchon from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  where m.variante_id in (:'va', :'vb', :'vc', :'vd', :'ve', :'vx') and m.tipo = 'entrada') x \\gset
update retail.variantes set activo = false where id = :'vx';
-- Apartadas para clientas en el almacén de Trujillo: vc 3 (quedan 2 libres) y ve 1 (quedan 3 libres).
select retail.apartar_stock(:'vc', :'tru', 3, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 3, null, :'alm_t', null) as _ap1 \\gset
select retail.apartar_stock(:'ve', :'tru', 1, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 3, null, :'alm_t', null) as _ap2 \\gset
-- La terminal del almacén de Trujillo y dos integrantes sin cuenta: Rosa marcó entrada, Luz no.
insert into auth.users (id, aud, role, email) values ('${T_ALMACEN}', 'authenticated', 'authenticated', 'terminal-almacen-bajada@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id)
  values (:'tru', 'Terminal Almacén TRU (prueba bajada)', 'administrativa', '${T_ALMACEN}') returning id as t_almacen \\gset
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values
  ('${ROSA}', 'Rosa', 'Prueba', 'activo', :'sede_tru'), ('${LUZ}', 'Luz', 'Prueba', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru'), ('${LUZ}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
\\set rosa '${ROSA}'
\\set luz '${LUZ}'
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
/** Deja al rol con clave `clave` con exactamente esos módulos (como `postgres`, dentro de la transacción). */
const soloModulos = (clave, modulos) =>
  `${COMO_POSTGRES}delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('${clave}');\n` +
  (modulos.length
    ? `insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('${clave}'), unnest(array[${modulos.map((m) => `'${m}'`).join(", ")}]);\n`
    : "");
/** Ningún rol con el módulo, sea cual sea el estado de la base local (en una base recién armada ya es así). */
const SIN_BAJADA_EN_NINGUN_ROL = `${COMO_POSTGRES}delete from retail.rol_modulos where modulo = 'bajada_piso';\n`;
/** [["va", 3], ["vb", 2]] → la lista jsonb de la RPC. */
const lista = (...pares) =>
  `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', ${n})`).join(", ")})`;
const bajar = (ubic, items, tok) => `pg_temp.bajar(:'${ubic}', ${items}, ${tok})`;
const cant = (v, sub, ubic = "tru") =>
  `coalesce((select cantidad from retail.stock where variante_id = :'${v}' and ubicacion_id = :'${ubic}' and sububicacion_id = :'${sub}'), 0)`;
const CONTADORES = `concat_ws(',', (select count(*) from retail.movimientos), (select count(*) from retail.bajadas_piso), (select count(*) from retail.bajada_piso_items))`;

const MSG = {
  sinToken: "Falta la marca de este intento. Recarga la página y vuelve a escanear.",
  sinModulo: "No puedes bajar prendas al piso: tu rol no tiene el módulo «Bajada al piso». Pídele al líder que lo active.",
  sinTienda: "No tienes permiso para mover mercadería en esa tienda.",
  vacia: "No hay prendas para bajar: escanea al menos una.",
  lineaInvalida: "Cada prenda necesita un código válido y al menos 1 unidad.",
  muyLarga: "Una bajada admite hasta 300 prendas distintas: confirma esta y arma otra.",
  tokenAjeno: "Ese intento ya se usó en otra tienda. Recarga la página y vuelve a escanear.",
  sinPiso: "Esta tienda todavía no separa piso y almacén: no hay nada que bajar.",
  otraPersona: ". Puede que otra persona ya las haya bajado: revisa el piso y corrige esas líneas.",
  inmutable: "Una bajada registrada no se edita ni se borra. Si te equivocaste, registra el movimiento contrario.",
  sinVaciar: "El historial de movimientos no se vacía.",
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
  "P1 · una sola versión de bajar_al_piso, con la firma del contrato",
  `select count(*) || '|' || string_agg(pg_get_function_identity_arguments(oid), ';')
     from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'bajar_al_piso';`,
  "1|p_ubicacion_id uuid, p_items jsonb, p_token uuid"
);
caso(
  "P1 · permisos: authenticated ejecuta bajar_al_piso, anon no; fn_prenda_corta y fn_verificar_bajadas no las ejecuta nadie de afuera",
  `select concat_ws(',',
     has_function_privilege('authenticated', 'retail.bajar_al_piso(uuid, jsonb, uuid)', 'execute'),
     has_function_privilege('anon', 'retail.bajar_al_piso(uuid, jsonb, uuid)', 'execute'),
     has_function_privilege('authenticated', 'retail.fn_prenda_corta(uuid)', 'execute'),
     has_function_privilege('anon', 'retail.fn_prenda_corta(uuid)', 'execute'),
     has_function_privilege('authenticated', 'retail.fn_verificar_bajadas()', 'execute'),
     has_function_privilege('anon', 'retail.fn_verificar_bajadas()', 'execute'));`,
  "t,f,f,f,f,f"
);
caso(
  "P1 · anon llamando la RPC → «permission denied for function»",
  `set local role anon;
select pg_temp.intento('select retail.bajar_al_piso(null, null, null)');`,
  (l) => json(l.at(-1)).msg.includes("permission denied for function bajar_al_piso")
);
caso(
  "P1 · authenticated sí entra a la función (sin token responde el mensaje de la marca)",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["va", 1]), "null")};`,
  (l) => error(l.at(-1), "bajada_sin_token", MSG.sinToken)
);
caso(
  "P1 · las dos tablas: RLS encendido, sin políticas y sin privilegios para public/anon/authenticated",
  `select concat_ws(',',
     (select bool_and(relrowsecurity) from pg_class where oid in ('retail.bajadas_piso'::regclass, 'retail.bajada_piso_items'::regclass)),
     (select count(*) from pg_policies where schemaname = 'retail' and tablename in ('bajadas_piso', 'bajada_piso_items')),
     (select bool_or(has_table_privilege(r, t, p)) from unnest(array['anon', 'authenticated']) r,
        unnest(array['retail.bajadas_piso', 'retail.bajada_piso_items']) t, unnest(array['select', 'insert', 'update', 'delete']) p));`,
  "t,0,f"
);
caso(
  "P1 · ni el líder lee las tablas directo: select → permission denied",
  `${sesion(FELIPE)}${COMO_API}select pg_temp.intento('select count(*) from retail.bajadas_piso');
select pg_temp.intento('select count(*) from retail.bajada_piso_items');`,
  (l) => l.slice(-2).every((x) => json(x).msg.includes("permission denied for table"))
);
caso(
  // «Nace sin rol» lo vigila `lib/modulos.test.ts` sobre las migraciones: aquí la base local puede tenerlo encendido a mano.
  // El texto de Existencias es el de 20260926170000 (nombra el retiro del bloque 2), que corre después de la 0000.
  "P1 · el módulo: Inventario, orden 85, delegable, no siempre-del-líder; Existencias dice «reponer y retirar del piso»",
  `select concat_ws('|', m.grupo, m.nombre, m.orden, m.solo_lider::int, m.delegable::int,
     (select incluye from retail.modulos where clave = 'existencias'))
     from retail.modulos m where m.clave = 'bajada_piso';`,
  "Inventario|Bajada al piso|85|0|1|Consultar stock, reponer y retirar del piso, ajustar stock, apartar prendas"
);
caso(
  "P1 · firma con el responsable UNA vez (fn_actor_persona_id(true)) y sin el patrón viejo de auth.uid()",
  `select concat_ws(',', (length(d) - length(replace(d, 'fn_actor_persona_id(', ''))) / length('fn_actor_persona_id('),
     d ~ 'fn_actor_persona_id\\(true\\)', d ~* 'auth_user_id\\s*=\\s*auth\\.uid', d ~ 'fn_bloquear_en_orden\\(')
     from (select pg_get_functiondef('retail.bajar_al_piso(uuid, jsonb, uuid)'::regprocedure) d) x;`,
  "1,t,f,t"
);
caso(
  "P1 · cuatro disparadores: editar/borrar por fila y vaciar (TRUNCATE) por sentencia, en las dos tablas",
  `select string_agg(tgname || ':' || p.proname, ',' order by tgname)
     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where tgrelid in ('retail.bajadas_piso'::regclass, 'retail.bajada_piso_items'::regclass) and not tgisinternal;`,
  "bajada_piso_items_inmutables:fn_bajada_piso_es_inmutable,bajada_piso_items_sin_truncate:fn_historial_sin_truncate," +
    "bajadas_piso_inmutables:fn_bajada_piso_es_inmutable,bajadas_piso_sin_truncate:fn_historial_sin_truncate"
);
{
  // Sin los comentarios: la cabecera puede explicar la regla sin romperla.
  const prohibido = /\bdrop\s+trigger\b|\b(create|drop)\s+policy\b/i;
  const culpables = PARTES.filter((f) =>
    prohibido.test(readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8").replace(/--[^\n]*/g, ""))
  );
  esperar("P1 · ninguna de las cinco partes quita un disparador ni crea o quita una política", culpables.length === 0, culpables.join(", "));
}

// ===========================================================================
// P2 · Permisos
// ===========================================================================

caso(
  "P2 · el líder baja en cualquier tienda (Trujillo y Lima)",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["va", 2]), ":'tok1'")};
select ${bajar("lim", lista(["va", 1]), ":'tok2'")};
${COMO_POSTGRES}select concat_ws(',', ${cant("va", "piso_t")}, ${cant("va", "piso_l", "lim")});`,
  (l) => json(l.at(-3)).ok && json(l.at(-2)).ok && l.at(-1) === "2,1"
);
caso(
  "P2 · integrante SIN el módulo → «tu rol no tiene el módulo «Bajada al piso»», nada se mueve",
  `${SIN_BAJADA_EN_NINGUN_ROL}select ${CONTADORES} as antes \\gset
${sesion(MICAELA)}${COMO_API}select ${bajar("tru", lista(["va", 1]), ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "bajada_sin_modulo", MSG.sinModulo) && l.at(-1) === "t"
);
caso(
  "P2 · rol con SOLO «Bajada al piso»: baja, y sigue sin poder ajustar stock ni cerrar un conteo",
  `insert into retail.conteos (ubicacion_id, sububicacion_id) select :'tru', :'alm_t'
   where not exists (select 1 from retail.conteos where ubicacion_id = :'tru' and estado = 'abierto');
select id as conteo from retail.conteos where ubicacion_id = :'tru' and estado = 'abierto' \\gset
${soloModulos("integrante", ["bajada_piso"])}${sesion(MICAELA)}${COMO_API}select ${bajar("tru", lista(["va", 2]), ":'tok1'")};
select pg_temp.intento(format('select retail.registrar_movimiento(%L, %L, ''ajuste'', 1, ''conteo_fisico'', null, %L)', :'va', :'tru', :'piso_t'));
select pg_temp.intento(format('select retail.cerrar_conteo(%L)', :'conteo'));`,
  (l) =>
    json(l.at(-3)).ok &&
    json(l.at(-2)).msg.startsWith("Solo un líder de equipo puede ajustar stock") &&
    json(l.at(-1)).msg.startsWith("Solo un líder puede cerrar un conteo")
);
caso(
  "P2 · rol con SOLO Existencias: NO baja por bajar_al_piso, pero «Reponer» (mover_interno) le sigue funcionando",
  `${soloModulos("integrante", ["existencias"])}${sesion(MICAELA)}${COMO_API}select ${bajar("tru", lista(["va", 1]), ":'tok1'")};
select pg_temp.intento(format('select retail.mover_interno(%L, %L, 1, %L, %L, null)', :'tru', :'va', :'alm_t', :'piso_t'));
${COMO_POSTGRES}select ${cant("va", "piso_t")};`,
  (l) => error(l.at(-3), "bajada_sin_modulo", MSG.sinModulo) && json(l.at(-2)).ok && l.at(-1) === "1"
);
caso(
  "P2 · rol con solo Vender → rechazado",
  `${soloModulos("integrante", ["vender"])}${sesion(MICAELA)}${COMO_API}select ${bajar("tru", lista(["va", 1]), ":'tok1'")};`,
  (l) => error(l.at(-1), "bajada_sin_modulo", MSG.sinModulo)
);
caso(
  "P2 · integrante con el módulo, en OTRA tienda → «No tienes permiso para mover mercadería en esa tienda.»",
  `${soloModulos("integrante", ["bajada_piso"])}${sesion(MICAELA)}${COMO_API}select ${bajar("lim", lista(["va", 1]), ":'tok1'")};`,
  (l) => error(l.at(-1), "bajada_sin_tienda", MSG.sinTienda)
);
caso(
  "P2 · un rol «limitado como hoy» con el módulo SÍ baja (el candado es ver el módulo, no la capacidad de escritura)",
  `${soloModulos("integrante", ["bajada_piso"])}update retail.roles set limitado_como_hoy = true where clave = 'integrante';
${sesion(MICAELA)}${COMO_API}select ${bajar("tru", lista(["va", 1]), ":'tok1'")};`,
  (l) => json(l.at(-1)).ok === true
);

// ===========================================================================
// P3 · Firma (terminal y responsable)
// ===========================================================================

const TERMINAL_CON_MODULO = `${COMO_POSTGRES}insert into retail.rol_modulos (rol_id, modulo)
  select retail.fn_rol_por_clave('terminal_administrativa'), 'bajada_piso'
  where not exists (select 1 from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('terminal_administrativa') and modulo = 'bajada_piso');\n`;
caso(
  "P3 · TERMINAL cuyo rol tiene el módulo + responsable presente: baja, y firma Rosa (movimientos, documento y terminal_id)",
  `${TERMINAL_CON_MODULO}${sesion(T_ALMACEN, { resp: "rosa" })}${COMO_API}select ${bajar("tru", lista(["va", 2], ["vb", 1]), ":'tok1'")} as r \\gset
${COMO_POSTGRES}select (:'r')::jsonb ->> 'ok';
select concat_ws(',',
  (select persona_id = :'rosa' from retail.bajadas_piso where token_cliente = :'tok1'),
  (select bool_and(m.usuario_id = :'rosa' and m.terminal_id = :'t_almacen') from retail.bajada_piso_items i
     join retail.bajadas_piso b on b.id = i.bajada_id join retail.movimientos m on m.id = i.movimiento_id where b.token_cliente = :'tok1'),
  (select count(*) from retail.bajada_piso_items i join retail.bajadas_piso b on b.id = i.bajada_id where b.token_cliente = :'tok1'));`,
  (l) => l.at(-2) === "true" && l.at(-1) === "t,t,2"
);
caso(
  "P3 · terminal SIN x-responsable → 42501 «Elige quién hace esta operación» y nada se escribe",
  `${TERMINAL_CON_MODULO}select ${CONTADORES} as antes \\gset
${sesion(T_ALMACEN)}${COMO_API}select ${bajar("tru", lista(["va", 1]), ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => {
    const j = json(l.at(-2));
    return j.estado === "42501" && j.hint === "responsable_requerido" && j.msg.startsWith("Elige quién hace esta operación") && l.at(-1) === "t";
  }
);
caso(
  "P3 · terminal con responsable AUSENTE (sin marcar entrada) → 42501 responsable_no_presente",
  `${TERMINAL_CON_MODULO}${sesion(T_ALMACEN, { resp: "luz" })}${COMO_API}select ${bajar("tru", lista(["va", 1]), ":'tok1'")};`,
  (l) => {
    const j = json(l.at(-1));
    return j.estado === "42501" && j.hint === "responsable_no_presente";
  }
);
caso(
  // Un reintento de algo ya guardado no escribe nada: la marca se mira ANTES de pedir responsable. Si no, la pantalla
  // leería el 42501 como «no se guardó», soltaría la marca de envío y la colaboradora podría bajar dos veces.
  "P3 · reintento con la misma marca y la misma lista, con la responsable YA fuera de turno (o sin responsable) → «ya estaba registrada»",
  `${TERMINAL_CON_MODULO}${sesion(T_ALMACEN, { resp: "rosa" })}${COMO_API}select ${bajar("tru", lista(["va", 2], ["vb", 1]), ":'tok1'")} as r1 \\gset
${sesion(T_ALMACEN, { resp: "luz" })}${COMO_API}select ${bajar("tru", lista(["vb", 1], ["va", 2]), ":'tok1'")} as r2 \\gset
${sesion(T_ALMACEN)}${COMO_API}select ${bajar("tru", lista(["va", 2], ["vb", 1]), ":'tok1'")} as r3 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'ok', (:'r2')::jsonb -> 'res' ->> 'ya_registrada', (:'r3')::jsonb -> 'res' ->> 'ya_registrada',
  (:'r2')::jsonb -> 'res' ->> 'bajada_id' = (:'r1')::jsonb -> 'res' ->> 'bajada_id',
  (select count(*) from retail.bajadas_piso where token_cliente = :'tok1'));`,
  "true,true,true,t,1"
);
caso(
  "P3 · una marca NUEVA con la responsable fuera de turno sigue rechazada (el responsable solo se salta al comprobar lo ya guardado)",
  `${TERMINAL_CON_MODULO}select ${CONTADORES} as antes \\gset
${sesion(T_ALMACEN, { resp: "luz" })}${COMO_API}select ${bajar("tru", lista(["va", 1]), ":'tok2'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => json(l.at(-2)).hint === "responsable_no_presente" && l.at(-1) === "t"
);
caso(
  "P3 · terminal cuyo rol NO tiene el módulo → rechazada aunque haya responsable presente",
  `${SIN_BAJADA_EN_NINGUN_ROL}${sesion(T_ALMACEN, { resp: "rosa" })}${COMO_API}select ${bajar("tru", lista(["va", 1]), ":'tok1'")};`,
  (l) => error(l.at(-1), "bajada_sin_modulo", MSG.sinModulo)
);
caso(
  "P3 · persona (Micaela) sin encabezado y sin «exige responsable»: firma ella",
  `${soloModulos("integrante", ["bajada_piso"])}${sesion(MICAELA)}${COMO_API}select ${bajar("tru", lista(["va", 1]), ":'tok1'")};
${COMO_POSTGRES}select (select persona_id = :'micaela' from retail.bajadas_piso where token_cliente = :'tok1')::text;`,
  (l) => json(l.at(-2)).ok && l.at(-1) === "true"
);

// ===========================================================================
// P4 · Todo o nada y el mensaje de lo que no alcanza
// ===========================================================================

caso(
  "P4 · 3 líneas con la 2ª y la 3ª imposibles → UN error que nombra las dos, detail JSON de 2, y no se mueve NADA (ni la 1ª)",
  `select ${CONTADORES} as antes \\gset
select ${cant("va", "alm_t")} || ',' || ${cant("va", "piso_t")} as va_antes \\gset
${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["va", 1], ["vb", 99], ["vc", 3]), ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',',
  (:'r')::jsonb ->> 'hint',
  ((:'r')::jsonb ->> 'msg') like 'No se bajó nada. %',
  position(retail.fn_prenda_corta(:'vb') || ': pides 99 y en el almacén hay 10' in (:'r')::jsonb ->> 'msg') > 0,
  position(retail.fn_prenda_corta(:'vc') || ': pides 3 y en el almacén hay 2 (3 apartadas para clientas)' in (:'r')::jsonb ->> 'msg') > 0,
  ((:'r')::jsonb ->> 'msg') like '%${MSG.otraPersona}',
  position(retail.fn_prenda_corta(:'va') in (:'r')::jsonb ->> 'msg') = 0,
  jsonb_array_length(((:'r')::jsonb ->> 'detail')::jsonb),
  (select string_agg(e ->> 'motivo' || ':' || (e ->> 'pide') || ':' || (e ->> 'hay') || ':' || (e ->> 'apartadas'), ';' order by e ->> 'pide')
     from jsonb_array_elements(((:'r')::jsonb ->> 'detail')::jsonb) e),
  (select bool_and((e ->> 'variante_id')::uuid in (:'vb', :'vc')) from jsonb_array_elements(((:'r')::jsonb ->> 'detail')::jsonb) e),
  ${CONTADORES} = :'antes',
  ${cant("va", "alm_t")} || ',' || ${cant("va", "piso_t")} = :'va_antes');`,
  "bajada_sin_alcance,t,t,t,t,t,2,sin_alcance:3:2:3;sin_alcance:99:10:0,t,t,t"
);
caso(
  "P4 · apartadas: 5 en el almacén y 3 apartadas — pedir 3 falla con «(3 apartadas para clientas)», pedir 2 pasa",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["vc", 3]), ":'tok1'")} as r \\gset
select ${bajar("tru", lista(["vc", 2]), ":'tok2'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',',
  (:'r')::jsonb ->> 'msg' = 'No se bajó nada. ' || retail.fn_prenda_corta(:'vc') || ': pides 3 y en el almacén hay 2 (3 apartadas para clientas)${MSG.otraPersona}',
  (:'r2')::jsonb ->> 'ok', ${cant("vc", "alm_t")}, ${cant("vc", "piso_t")},
  (select cantidad_apartada from retail.stock where variante_id = :'vc' and ubicacion_id = :'tru' and sububicacion_id = :'alm_t'));`,
  "t,true,3,2,3"
);
caso(
  "P4 · UNA apartada: el mensaje la dice en singular, «(1 apartada para una clienta)»",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["ve", 4]), ":'tok1'")} as r \\gset
${COMO_POSTGRES}select (:'r')::jsonb ->> 'msg' = 'No se bajó nada. ' || retail.fn_prenda_corta(:'ve') || ': pides 4 y en el almacén hay 3 (1 apartada para una clienta)${MSG.otraPersona}';`,
  "t"
);
caso(
  "P4 · prenda archivada → «… está archivada: no se baja al piso.» (sin la frase de «otra persona»)",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["vx", 1]), ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint',
  (:'r')::jsonb ->> 'msg' = 'No se bajó nada. ' || retail.fn_prenda_corta(:'vx') || ' está archivada: no se baja al piso.',
  ((:'r')::jsonb ->> 'detail')::jsonb -> 0 ->> 'motivo');`,
  "bajada_sin_alcance,t,archivada"
);
caso(
  "P4 · la «Prenda sin registrar» (centinela) no se baja",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", `'[{"variante_id": "22222222-2222-4222-8222-222222222222", "cantidad": 1}]'::jsonb`, ":'tok1'")};`,
  (l) => {
    const j = json(l.at(-1));
    return (
      error(l.at(-1), "bajada_sin_alcance", "No se bajó nada. La «Prenda sin registrar» no es una prenda real: no se baja al piso.") &&
      JSON.parse(j.detail)[0].motivo === "no_es_prenda"
    );
  }
);
caso(
  "P4 · una prenda que no existe en el catálogo",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", `jsonb_build_array(jsonb_build_object('variante_id', gen_random_uuid(), 'cantidad', 1))`, ":'tok1'")};`,
  (l) =>
    error(l.at(-1), "bajada_sin_alcance", "No se bajó nada. Hay una prenda que ya no existe en el catálogo.") &&
    JSON.parse(json(l.at(-1)).detail)[0].motivo === "no_existe"
);
caso(
  "P4 · 300 prendas imposibles: el mensaje nombra 5 y dice «Y 295 prendas más»; el detail trae 50",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", `(select jsonb_agg(jsonb_build_object('variante_id', gen_random_uuid(), 'cantidad', 1)) from generate_series(1, 300))`, ":'tok1'")};`,
  (l) => {
    const j = json(l.at(-1));
    return (
      error(l.at(-1), "bajada_sin_alcance") &&
      j.msg === `No se bajó nada. ${Array(5).fill("Hay una prenda que ya no existe en el catálogo").join(". ")}. Y 295 prendas más.` &&
      JSON.parse(j.detail).length === 50
    );
  }
);
caso(
  "P4 · 6 prendas imposibles: nombra 5 y dice «Y 1 prenda más» (singular)",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", `(select jsonb_agg(jsonb_build_object('variante_id', gen_random_uuid(), 'cantidad', 1)) from generate_series(1, 6))`, ":'tok1'")};`,
  (l) =>
    error(
      l.at(-1),
      "bajada_sin_alcance",
      `No se bajó nada. ${Array(5).fill("Hay una prenda que ya no existe en el catálogo").join(". ")}. Y 1 prenda más.`
    ) && JSON.parse(json(l.at(-1)).detail).length === 6
);

// ===========================================================================
// P5 · El libro
// ===========================================================================

caso(
  "P5 · piso +n, almacén −n, total igual; filas traslado/movimiento_interno almacén→piso de la tienda; ítems 1 a 1; respuesta",
  `select ${cant("va", "alm_t")} as a0 \\gset
select ${cant("va", "piso_t")} as p0 \\gset
select (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'va' and ubicacion_id = :'tru') as t0 \\gset
${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["va", 3], ["vb", 2]), ":'tok1'")} as r \\gset
${COMO_POSTGRES}select (:'r')::jsonb -> 'res' ->> 'bajada_id' as bid \\gset
select concat_ws(',',
  (:'r')::jsonb -> 'res' ->> 'ya_registrada', (:'r')::jsonb -> 'res' ->> 'lineas', (:'r')::jsonb -> 'res' ->> 'unidades',
  :a0 - ${cant("va", "alm_t")}, ${cant("va", "piso_t")} - :p0,
  (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'va' and ubicacion_id = :'tru') = :t0,
  (select count(*) from retail.bajada_piso_items i join retail.movimientos m on m.id = i.movimiento_id
    where i.bajada_id = :'bid' and m.tipo = 'traslado' and m.motivo = 'movimiento_interno'
      and m.ubicacion_id = :'tru' and m.ubicacion_destino_id = :'tru' and m.sububicacion_id = :'alm_t' and m.sububicacion_destino_id = :'piso_t'
      and m.variante_id = i.variante_id and m.cantidad = i.cantidad and m.usuario_id = :'felipe'),
  (select count(distinct movimiento_id) from retail.bajada_piso_items where bajada_id = :'bid'),
  (select count(*) from retail.fn_verificar_bajadas()));`,
  "false,2,5,3,3,t,2,2,0"
);
caso(
  "P5 · la fila que escribe la bajada es indistinguible de la de «Reponer» (mover_interno directo), salvo id y hora",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["vd", 2]), ":'tok1'")} as r \\gset
select retail.mover_interno(:'tru', :'vd', 2, :'alm_t', :'piso_t', null) as m2 \\gset
${COMO_POSTGRES}select (select to_jsonb(m) - 'id' - 'created_at' from retail.movimientos m
          where m.id = (select i.movimiento_id from retail.bajada_piso_items i join retail.bajadas_piso b on b.id = i.bajada_id where b.token_cliente = :'tok1'))
     = (select to_jsonb(m) - 'id' - 'created_at' from retail.movimientos m where m.id = :'m2');`,
  "t"
);
caso(
  "P5 · fn_verificar_bajadas SÍ ve un documento sin líneas y una línea cuyo movimiento no es almacén→piso",
  `insert into retail.bajadas_piso (token_cliente, ubicacion_id, persona_id, huella) values (:'tok1', :'tru', :'felipe', md5('x')) returning id as vacia \\gset
insert into retail.bajadas_piso (token_cliente, ubicacion_id, persona_id, huella) values (:'tok2', :'tru', :'felipe', md5('y')) returning id as falsa \\gset
insert into retail.bajada_piso_items (movimiento_id, bajada_id, variante_id, cantidad)
  select id, :'falsa', variante_id, cantidad from retail.movimientos where variante_id = :'ve' and tipo = 'entrada' limit 1;
select string_agg(bajada_id::text, ',' order by bajada_id::text) = (select string_agg(x, ',' order by x) from unnest(array[:'vacia', :'falsa']) x)
  from retail.fn_verificar_bajadas();`,
  "t"
);

// ===========================================================================
// P6 · Idempotencia
// ===========================================================================

caso(
  "P6 · mismo token y misma lista (en otro orden, repetidas sumadas) → misma bajada, ya_registrada, y el stock se mueve UNA vez",
  `select ${cant("va", "alm_t")} as a0 \\gset
${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["va", 2], ["vb", 1]), ":'tok1'")} as r1 \\gset
select ${bajar("tru", lista(["vb", 1], ["va", 1], ["va", 1]), ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',',
  (:'r1')::jsonb -> 'res' ->> 'bajada_id' = (:'r2')::jsonb -> 'res' ->> 'bajada_id',
  (:'r1')::jsonb -> 'res' ->> 'ya_registrada', (:'r2')::jsonb -> 'res' ->> 'ya_registrada',
  (:'r2')::jsonb -> 'res' ->> 'lineas', (:'r2')::jsonb -> 'res' ->> 'unidades',
  (:'r1')::jsonb -> 'res' ->> 'registrada_en' = (:'r2')::jsonb -> 'res' ->> 'registrada_en',
  :a0 - ${cant("va", "alm_t")},
  (select count(*) from retail.bajadas_piso where token_cliente = :'tok1'));`,
  "t,false,true,2,3,t,2,1"
);
caso(
  // Contrato con la pantalla: la red se cortó después de guardar [va×2, vb×1] y ella siguió escaneando vc. El DETAIL
  // trae lo YA guardado (en orden de prenda) para que la pantalla lo reste y le deje solo vc con una marca nueva.
  "P6 · mismo token con OTRA lista → «ya se guardó a las HH:MM con 3 prendas…», DETAIL = las líneas guardadas, y no se repite nada",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["vb", 1], ["va", 2]), ":'tok1'")} as r1 \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["va", 2], ["vb", 1], ["vc", 1]), ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r2')::jsonb ->> 'estado', (:'r2')::jsonb ->> 'hint',
  (:'r2')::jsonb ->> 'msg' = 'Esa bajada ya se guardó a las ' || to_char(now() at time zone 'America/Lima', 'HH24:MI')
    || ' con 3 prendas. No se repitió: la pantalla te deja solo lo que faltaba.',
  ((:'r2')::jsonb ->> 'detail')::jsonb
    = (select jsonb_agg(jsonb_build_object('variante_id', v, 'cantidad', c) order by v)
         from (values (:'va'::uuid, 2), (:'vb'::uuid, 1)) x(v, c)),
  ${CONTADORES} = :'antes');`,
  "P0001,bajada_token_reusado,t,t,t"
);
caso(
  "P6 · el DETAIL del token reusado es JSON plano: cada línea con variante_id (texto) y cantidad (número), nada más",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["va", 2], ["vb", 1]), ":'tok1'")} as r1 \\gset
select ${bajar("tru", lista(["va", 1]), ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select (:'r2')::jsonb ->> 'detail';`,
  (l) => {
    const d = JSON.parse(l.at(-1));
    return (
      Array.isArray(d) &&
      d.length === 2 &&
      d.every((x) => Object.keys(x).sort().join(",") === "cantidad,variante_id" && typeof x.variante_id === "string" && Number.isInteger(x.cantidad)) &&
      d[0].variante_id < d[1].variante_id &&
      d.map((x) => x.cantidad).sort().join(",") === "1,2"
    );
  }
);
caso(
  "P6 · con UNA prenda guardada el aviso va en singular: «… con 1 prenda. No se repitió…»",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["vd", 1]), ":'tok1'")} as r1 \\gset
select ${bajar("tru", lista(["vd", 2]), ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r2')::jsonb ->> 'hint',
  (:'r2')::jsonb ->> 'msg' = 'Esa bajada ya se guardó a las ' || to_char(now() at time zone 'America/Lima', 'HH24:MI')
    || ' con 1 prenda. No se repitió: la pantalla te deja solo lo que faltaba.',
  ((:'r2')::jsonb ->> 'detail')::jsonb = jsonb_build_array(jsonb_build_object('variante_id', :'vd'::uuid, 'cantidad', 1)),
  ${cant("vd", "piso_t")});`,
  "bajada_token_reusado,t,t,1"
);
caso(
  "P6 · mismo token en OTRA tienda → «Ese intento ya se usó en otra tienda…»",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["va", 1]), ":'tok1'")};
select ${bajar("lim", lista(["va", 1]), ":'tok1'")};`,
  (l) => json(l.at(-2)).ok && error(l.at(-1), "bajada_token_ajeno", MSG.tokenAjeno)
);
caso(
  "P6 · el token de un intento que falló queda libre: el reintento corregido guarda (ya_registrada = false)",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["va", 999]), ":'tok1'")};
select ${bajar("tru", lista(["va", 1]), ":'tok1'")};`,
  (l) => error(l.at(-2), "bajada_sin_alcance") && json(l.at(-1)).ok && json(l.at(-1)).res.ya_registrada === false
);

// ===========================================================================
// P7 · Forma de la lista
// ===========================================================================

const LINEAS_INVALIDAS = [
  `'[{"variante_id": "${FELIPE}", "cantidad": 0}]'`,
  `'[{"variante_id": "${FELIPE}", "cantidad": -1}]'`,
  `'[{"variante_id": "${FELIPE}", "cantidad": "tres"}]'`,
  `'[{"variante_id": "${FELIPE}", "cantidad": 1.5}]'`,
  `'[{"variante_id": "${FELIPE}", "cantidad": 1000000}]'`,
  `'[{"variante_id": "${FELIPE}"}]'`,
  `'[{"variante_id": "abc", "cantidad": 1}]'`,
  `'[{"cantidad": 1}]'`,
  `'[1]'`,
];
caso(
  "P7 · lista vacía, que no es lista o nula → «No hay prendas para bajar: escanea al menos una.»",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", "'[]'::jsonb", ":'tok1'")};
select ${bajar("tru", "'{}'::jsonb", ":'tok1'")};
select ${bajar("tru", "null", ":'tok1'")};`,
  (l) => l.slice(-3).every((x) => error(x, "bajada_vacia", MSG.vacia))
);
caso(
  `P7 · cantidad 0 / negativa / texto / decimal / 7 cifras / sin cantidad, código inválido o sin código, elemento que no es objeto (${LINEAS_INVALIDAS.length})`,
  `${sesion(FELIPE)}${COMO_API}${LINEAS_INVALIDAS.map((x) => `select ${bajar("tru", `${x}::jsonb`, ":'tok1'")};`).join("\n")}`,
  (l) => l.slice(-LINEAS_INVALIDAS.length).every((x) => error(x, "bajada_linea_invalida", MSG.lineaInvalida))
);
caso(
  "P7 · 301 prendas distintas → «Una bajada admite hasta 300 prendas distintas…»",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", `(select jsonb_agg(jsonb_build_object('variante_id', gen_random_uuid(), 'cantidad', 1)) from generate_series(1, 301))`, ":'tok1'")};`,
  (l) => error(l.at(-1), "bajada_muy_larga", MSG.muyLarga)
);
caso(
  "P7 · la misma prenda repetida se suma: UNA línea y UNA fila de libro con la suma",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["va", 1], ["va", 2]), ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb -> 'res' ->> 'lineas', (:'r')::jsonb -> 'res' ->> 'unidades',
  (select string_agg(m.cantidad::text, ';') from retail.bajada_piso_items i join retail.movimientos m on m.id = i.movimiento_id
     join retail.bajadas_piso b on b.id = i.bajada_id where b.token_cliente = :'tok1'));`,
  "1,3,3"
);

// ===========================================================================
// P8 · Tienda sin piso ni almacén
// ===========================================================================

caso(
  "P8 · el Taller (sin piso ni almacén) → «Esta tienda todavía no separa piso y almacén…», sin efectos",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${bajar("taller", lista(["va", 1]), ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "bajada_tienda_sin_piso", MSG.sinPiso) && l.at(-1) === "t"
);

// ===========================================================================
// P9 · Inmutabilidad y unicidad
// ===========================================================================

caso(
  "P9 · UPDATE y DELETE sobre el documento y sus líneas → el disparador lo impide (incluso como postgres)",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["va", 1]), ":'tok1'")} as r \\gset
${COMO_POSTGRES}select pg_temp.intento(format('update retail.bajadas_piso set huella = md5(''z'') where token_cliente = %L', :'tok1'));
select pg_temp.intento(format('delete from retail.bajadas_piso where token_cliente = %L', :'tok1'));
select pg_temp.intento(format('update retail.bajada_piso_items set cantidad = 9 where bajada_id = %L', (:'r')::jsonb -> 'res' ->> 'bajada_id'));
select pg_temp.intento(format('delete from retail.bajada_piso_items where bajada_id = %L', (:'r')::jsonb -> 'res' ->> 'bajada_id'));`,
  (l) => l.slice(-4).every((x) => json(x).msg === MSG.inmutable)
);
caso(
  "P9 · TRUNCATE de las líneas, del documento con CASCADE o de las dos juntas → el disparador lo impide y nada se pierde (incluso como postgres)",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["va", 1]), ":'tok1'")} as r \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
select pg_temp.intento('truncate retail.bajada_piso_items');
select pg_temp.intento('truncate retail.bajadas_piso cascade');
select pg_temp.intento('truncate retail.bajada_piso_items, retail.bajadas_piso');
select ${CONTADORES} = :'antes';`,
  (l) => l.slice(-4, -1).every((x) => json(x).msg.startsWith(MSG.sinVaciar)) && l.at(-1) === "t"
);
caso(
  "P9 · un segundo documento con el mismo token → violación de unique; una línea con la centinela → check",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["va", 1]), ":'tok1'")} as r \\gset
${COMO_POSTGRES}select pg_temp.intento(format('insert into retail.bajadas_piso (token_cliente, ubicacion_id, persona_id, huella) values (%L, %L, %L, md5(''w''))', :'tok1', :'tru', :'felipe'));
select pg_temp.intento(format('insert into retail.bajada_piso_items (movimiento_id, bajada_id, variante_id, cantidad)
  select id, %L, ''22222222-2222-4222-8222-222222222222'', 1 from retail.movimientos where variante_id = %L and tipo = ''entrada'' limit 1',
  (:'r')::jsonb -> 'res' ->> 'bajada_id', :'vb'));`,
  (l) => {
    const [u, c] = l.slice(-2).map(json);
    return u.estado === "23505" && u.msg.includes("bajadas_piso_token_key") && c.estado === "23514" && c.msg.includes("bajada_piso_items_no_centinela");
  }
);

// ===========================================================================
// P10 · La pre-validación y el motor dicen lo mismo
// ===========================================================================

caso(
  "P10 · ve: 4 en el almacén y 1 apartada → pedir exactamente 3 pasa",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["ve", 3]), ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${cant("ve", "alm_t")}, ${cant("ve", "piso_t")});`,
  "true,1,3"
);
caso(
  "P10 · pedir 4 (disponible + 1): la pre-validación dice «hay 3» y mover_interno directo dice «Stock insuficiente en origen: hay 3»",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", lista(["ve", 4]), ":'tok1'")} as r \\gset
select pg_temp.intento(format('select retail.mover_interno(%L, %L, 4, %L, %L, null)', :'tru', :'ve', :'alm_t', :'piso_t')) as m \\gset
${COMO_POSTGRES}select concat_ws(',',
  (:'r')::jsonb ->> 'msg' = 'No se bajó nada. ' || retail.fn_prenda_corta(:'ve') || ': pides 4 y en el almacén hay 3 (1 apartada para una clienta)${MSG.otraPersona}',
  ((:'m')::jsonb ->> 'msg') like 'Stock insuficiente en origen: hay 3 y se pide trasladar 4%');`,
  "t,t"
);

console.log(`\n${total - fallos}/${total} pruebas en verde.`);
process.exit(fallos ? 1 : 0);

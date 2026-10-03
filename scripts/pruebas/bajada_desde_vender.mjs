#!/usr/bin/env node
/**
 * Prueba de ADR-0321 — `bajar_al_piso_desde_vender` (`20261003233000_bajar_al_piso_desde_vender.sql`): la caja registra la
 * bajada al piso que se olvidó y la prenda entra al ticket sin ir a Existencias.
 *
 * QUÉ CUBRE
 *   P1 forma: una sola versión con la firma del contrato; anon no la ejecuta y authenticated sí; la migración no crea
 *      políticas, ni quita disparadores, ni altera tablas (CLAUDE.md, «Políticas y deadlocks»).
 *   P2 permisos (ADR-0306: el botón vive en Vender, así que es de Vender): el líder en cualquier tienda; un rol con SOLO
 *      Vender sí (sin Existencias); un rol sin Vender no (aunque tenga Existencias); en otra tienda no.
 *   P3 firma: la Terminal de ventas (Vender sin Existencias, como en la siembra) con responsable presente baja y firma la
 *      responsable; sin responsable, 42501; reintentar algo ya guardado responde aunque la responsable ya no esté.
 *   P4 cuánto baja: solo lo que FALTA para el ticket (0 si otra persona ya la registró); lo apartado no cuenta ni en el piso
 *      ni en el almacén; sin almacén libre, no mueve nada y dice cuánto hay.
 *   P5 libro: piso +n, almacén −n, total igual; UNA fila traslado/movimiento_interno almacén→piso con la nota «Bajada
 *      registrada desde Vender», igual (salvo la nota) a la que escribe «Reponer» (`bajar_al_piso`).
 *   P6 idempotencia: la misma marca devuelve ya_registrada y el stock se mueve UNA vez; la misma marca con otra prenda se
 *      rechaza y no mueve nada.
 *   P7 forma de los datos: sin marca, cantidad fuera de rango, la «Prenda sin registrar», una prenda que no existe, el Taller.
 *
 * CÓMO. Igual que `retirar_del_piso.mjs`: cada caso en su transacción con ROLLBACK (nunca se commitea nada), sesión simulada
 * con `request.jwt.claim.sub` y el encabezado de PostgREST con `request.headers`. Las prendas son NUEVAS en cada caso
 * (producto «Blusa Caja Prueba» con 5 tallas) y su stock de partida se arma en el ALMACÉN (y algo en el piso) de Trujillo.
 *
 * USO
 *   pnpm pruebas:bajada-desde-vender    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = "20261003233000_bajar_al_piso_desde_vender.sql";
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const T_VENTAS = "33333333-3333-4333-8333-0000000000d4"; // cuenta de una Terminal de ventas de Trujillo (esta prueba)
const ROSA = "33333333-3333-4333-8333-0000000000e5"; // integrante de Trujillo sin cuenta, marcó entrada: la responsable
const LUZ = "33333333-3333-4333-8333-0000000000e6"; // integrante de Trujillo sin cuenta, NO marcó entrada

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
create function pg_temp.bajar(p_ubicacion uuid, p_variante uuid, p_necesario integer, p_token uuid) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_detail text;
begin
  return jsonb_build_object('ok', true, 'res', retail.bajar_al_piso_desde_vender(p_ubicacion, p_variante, p_necesario, p_token));
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint, v_detail = pg_exception_detail;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg, 'detail', nullif(v_detail, ''));
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
-- Prendas propias: cinco tallas de un producto nuevo.
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Caja Prueba', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as prod \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prod', t.id, :'color', 'CAJA-PRUEBA-' || t.n, 50
    from (select id, row_number() over (order by valor, id) as n from retail.tallas) t where t.n <= 5;
select id as va from retail.variantes where sku = 'CAJA-PRUEBA-1' \\gset
select id as vb from retail.variantes where sku = 'CAJA-PRUEBA-2' \\gset
select id as vc from retail.variantes where sku = 'CAJA-PRUEBA-3' \\gset
select id as vd from retail.variantes where sku = 'CAJA-PRUEBA-4' \\gset
select id as ve from retail.variantes where sku = 'CAJA-PRUEBA-5' \\gset
-- Trujillo: va almacén 3 (piso 0, el caso del aviso); vb piso 1 y almacén 2; vc almacén 2 (las 2 apartadas); vd almacén 1;
-- ve piso 1 (apartada) y almacén 2. Lima: va almacén 2.
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x.v, x.u, x.s, 'entrada', x.n, 'prueba bajada desde vender: colchón'
    from (values (:'va'::uuid, :'tru'::uuid, :'alm_t'::uuid, 3), (:'vb', :'tru', :'piso_t', 1), (:'vb', :'tru', :'alm_t', 2),
                 (:'vc', :'tru', :'alm_t', 2), (:'vd', :'tru', :'alm_t', 1), (:'ve', :'tru', :'piso_t', 1),
                 (:'ve', :'tru', :'alm_t', 2), (:'va', :'lim', :'alm_l', 2)) x(v, u, s, n);
select count(*) as _colchon from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  where m.variante_id in (:'va', :'vb', :'vc', :'vd', :'ve') and m.tipo = 'entrada') x \\gset
-- Apartadas para clientas: las 2 de vc en el ALMACÉN y la única de ve en el PISO.
select retail.apartar_stock(:'vc', :'tru', 2, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 3, null, :'alm_t', null) as _ap1 \\gset
select retail.apartar_stock(:'ve', :'tru', 1, 'Eva Ríos', '999333444', retail.fn_hoy_lima() + 3, null, :'piso_t', null) as _ap2 \\gset
-- La Terminal de ventas de Trujillo (su rol ve Vender y NO Existencias, como en la siembra) y dos integrantes sin cuenta:
-- Rosa marcó entrada, Luz no.
insert into auth.users (id, aud, role, email) values ('${T_VENTAS}', 'authenticated', 'authenticated', 'terminal-ventas-caja@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id)
  values (:'tru', 'Terminal Ventas TRU (prueba caja)', 'ventas', '${T_VENTAS}') returning id as t_ventas \\gset
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

/** Cambia de sesión (como `postgres`). `resp`: variable psql que va en el encabezado `x-responsable`. */
const sesion = (auth, { resp = null } = {}) => {
  const campos = resp ? `'x-responsable', :'${resp}'` : "";
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
/** La Terminal de ventas como en la siembra: Vender sí, Existencias no. */
const TERMINAL_VENDER_SIN_EXISTENCIAS = soloModulos("terminal_ventas", ["vender", "caja"]);
const bajar = (ubic, v, necesario, tok) => `pg_temp.bajar(:'${ubic}', :'${v}', ${necesario}, ${tok})`;
const cant = (v, sub, ubic = "tru") =>
  `coalesce((select cantidad from retail.stock where variante_id = :'${v}' and ubicacion_id = :'${ubic}' and sububicacion_id = :'${sub}'), 0)`;
const CONTADORES = `concat_ws(',', (select count(*) from retail.movimientos), (select count(*) from retail.movimientos_internos_intentos))`;
const INTERNOS = (vs) => `(select count(*) from retail.movimientos where motivo = 'movimiento_interno' and variante_id in (${vs.map((v) => `:'${v}'`).join(", ")}))`;

const MSG = {
  sinToken: "Falta la marca de este intento. Vuelve a escanear la prenda.",
  sinModulo: "No puedes registrar la bajada desde Vender: tu rol no tiene el módulo «Vender». Pídele al líder que lo active.",
  sinTienda: "No tienes permiso para mover mercadería en esa tienda.",
  cantidad: "La cantidad de la prenda en el ticket no es válida.",
  noEsPrenda: "Esa prenda no está en el catálogo: no hay nada que bajar al piso.",
  sinPiso: "Esta tienda todavía no separa piso y almacén: no hay bajada que registrar.",
  otraPersona: "). Puede que otra persona ya la haya bajado, vendido o apartado: revisa Existencias.",
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
  "P1 · una sola versión de bajar_al_piso_desde_vender, con la firma del contrato",
  `select count(*) || '|' || string_agg(pg_get_function_identity_arguments(oid), ';')
     from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'bajar_al_piso_desde_vender';`,
  "1|p_ubicacion_id uuid, p_variante_id uuid, p_piso_necesario integer, p_token uuid"
);
caso(
  "P1 · anon no la ejecuta, authenticated sí, security definer y con el search_path fijo de la casa",
  `select concat_ws(',', has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'),
                    coalesce(p.proconfig::text like '%search_path=retail, public, extensions%', false), p.prosecdef)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'bajar_al_piso_desde_vender';`,
  "f,t,t,t"
);
{
  // Sin los comentarios: la cabecera puede explicar la regla sin romperla.
  const sinComentarios = readFileSync(join(RAIZ, "supabase", "migrations", MIGRACION), "utf8").replace(/--[^\n]*/g, "");
  esperar(
    "P1 · la migración no crea políticas, ni quita disparadores, ni altera tablas (ADR-0195: en el SQL Editor sería un 40P01)",
    !/\bdrop\s+trigger\b|\b(create|drop)\s+policy\b|\balter\s+table\b/i.test(sinComentarios)
  );
  // ADR-0288: el SQL Editor toma un `select … into` entre comillas simples por una tabla nueva y agrega líneas que rompen el pegado.
  esperar("P1 · la migración no tiene `select … into` (ADR-0288)", !/\bselect\b[^;]*?\binto\b/i.test(sinComentarios.replace(/\$fn\$[\s\S]*?\$fn\$/g, "")));
}

// ===========================================================================
// P2 · Permisos
// ===========================================================================

caso(
  "P2 · el líder baja en cualquier tienda (Trujillo y Lima)",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")};
select pg_temp.bajar(:'lim', :'va', 1, :'tok2');
${COMO_POSTGRES}select concat_ws(',', ${cant("va", "piso_t")}, ${cant("va", "alm_t")}, ${cant("va", "piso_l", "lim")}, ${cant("va", "alm_l", "lim")});`,
  (l) => json(l.at(-3)).ok && json(l.at(-2)).ok && l.at(-1) === "1,2,1,1"
);
caso(
  "P2 · integrante con SOLO Vender (sin Existencias): baja — el botón es de Vender (ADR-0306)",
  `${soloModulos("integrante", ["vender"])}${sesion(MICAELA)}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', (:'r')::jsonb -> 'res' ->> 'bajadas', ${cant("va", "piso_t")});`,
  "true,1,1"
);
caso(
  "P2 · integrante SIN Vender (con Existencias, Conteos y Traslados) → «tu rol no tiene el módulo «Vender»», nada se mueve",
  `${soloModulos("integrante", ["existencias", "conteos", "traslados"])}select ${CONTADORES} as antes \\gset
${sesion(MICAELA)}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "bajada_vender_sin_modulo", MSG.sinModulo) && l.at(-1) === "t"
);
caso(
  "P2 · integrante con Vender, en OTRA tienda → «No tienes permiso para mover mercadería en esa tienda.»",
  `${soloModulos("integrante", ["vender"])}${sesion(MICAELA)}${COMO_API}select pg_temp.bajar(:'lim', :'va', 1, :'tok1');`,
  (l) => error(l.at(-1), "bajada_vender_sin_tienda", MSG.sinTienda)
);

// ===========================================================================
// P3 · Firma (Terminal de ventas y responsable)
// ===========================================================================

caso(
  "P3 · TERMINAL DE VENTAS (Vender sin Existencias) + responsable presente: baja, y firma Rosa (usuario_id y terminal_id)",
  `${TERMINAL_VENDER_SIN_EXISTENCIAS}${sesion(T_VENTAS, { resp: "rosa" })}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok',
  (select count(*) || ':' || bool_and(m.usuario_id = :'rosa' and m.terminal_id = :'t_ventas')
     from retail.movimientos m where m.motivo = 'movimiento_interno' and m.variante_id = :'va'));`,
  "true,1:true"
);
caso(
  "P3 · terminal SIN x-responsable → 42501 «Elige quién hace esta operación» y nada se escribe",
  `${TERMINAL_VENDER_SIN_EXISTENCIAS}select ${CONTADORES} as antes \\gset
${sesion(T_VENTAS)}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => {
    const j = json(l.at(-2));
    return j.estado === "42501" && j.hint === "responsable_requerido" && j.msg.startsWith("Elige quién hace esta operación") && l.at(-1) === "t";
  }
);
caso(
  "P3 · terminal con responsable AUSENTE (sin marcar entrada) → 42501 responsable_no_presente",
  `${TERMINAL_VENDER_SIN_EXISTENCIAS}${sesion(T_VENTAS, { resp: "luz" })}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")};`,
  (l) => {
    const j = json(l.at(-1));
    return j.estado === "42501" && j.hint === "responsable_no_presente";
  }
);
caso(
  // Un reintento de algo ya guardado no escribe nada: la marca se mira ANTES de pedir responsable. Si no, la caja leería el
  // 42501 como «no se guardó» y podría pedir la bajada otra vez.
  "P3 · reintento con la misma marca y la responsable YA fuera de turno (o sin responsable) → ya_registrada, una sola fila",
  `${TERMINAL_VENDER_SIN_EXISTENCIAS}${sesion(T_VENTAS, { resp: "rosa" })}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")} as r1 \\gset
${sesion(T_VENTAS, { resp: "luz" })}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")} as r2 \\gset
${sesion(T_VENTAS)}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")} as r3 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'ok', (:'r2')::jsonb -> 'res' ->> 'ya_registrada', (:'r3')::jsonb -> 'res' ->> 'ya_registrada',
  (:'r3')::jsonb -> 'res' ->> 'bajadas', (:'r3')::jsonb -> 'res' ->> 'piso', (:'r3')::jsonb -> 'res' ->> 'almacen', ${INTERNOS(["va"])});`,
  "true,true,true,1,1,2,1"
);

// ===========================================================================
// P4 · Cuánto baja
// ===========================================================================

caso(
  "P4 · piso 0 y almacén 3, el ticket necesita 1 → baja 1 y responde lo libre DESPUÉS (piso 1, almacén 2)",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb -> 'res' ->> 'ya_registrada', (:'r')::jsonb -> 'res' ->> 'bajadas',
  (:'r')::jsonb -> 'res' ->> 'piso', (:'r')::jsonb -> 'res' ->> 'almacen', (:'r')::jsonb -> 'res' ->> 'movimiento_id' is not null,
  ${cant("va", "piso_t")}, ${cant("va", "alm_t")});`,
  "false,1,1,2,t,1,2"
);
caso(
  "P4 · el piso YA alcanza (otra persona registró la bajada mientras tanto) → bajadas 0 y no se mueve nada",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${bajar("tru", "vb", 1, ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb -> 'res' ->> 'bajadas', (:'r')::jsonb -> 'res' ->> 'piso', (:'r')::jsonb -> 'res' ->> 'almacen',
  (:'r')::jsonb -> 'res' ->> 'movimiento_id' is null, ${CONTADORES} = :'antes');`,
  "0,1,2,t,t"
);
caso(
  "P4 · la del piso ya está en el ticket y escanean otra (necesita 2, piso 1) → baja SOLO la que falta",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", "vb", 2, ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb -> 'res' ->> 'bajadas', ${cant("vb", "piso_t")}, ${cant("vb", "alm_t")});`,
  "1,2,1"
);
caso(
  "P4 · lo apartado en el PISO no cuenta como libre: piso 1 apartada, necesita 1 → baja 1 (la apartada sigue en el piso)",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", "ve", 1, ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb -> 'res' ->> 'bajadas', (:'r')::jsonb -> 'res' ->> 'piso', ${cant("ve", "piso_t")},
  (select cantidad_apartada from retail.stock where variante_id = :'ve' and ubicacion_id = :'tru' and sububicacion_id = :'piso_t'));`,
  "1,1,2,1"
);
caso(
  "P4 · todo lo del almacén está APARTADO → «no hay ninguna», detail con lo libre, y no se mueve nada",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${bajar("tru", "vc", 1, ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint',
  (:'r')::jsonb ->> 'msg' = retail.fn_prenda_corta(:'vc') || ': en el almacén de Tienda Trujillo no queda libre para bajar (no hay ninguna${MSG.otraPersona}',
  ((:'r')::jsonb ->> 'detail')::jsonb ->> 'almacen', ((:'r')::jsonb ->> 'detail')::jsonb ->> 'falta', ${CONTADORES} = :'antes');`,
  "bajada_vender_sin_almacen,t,0,1,t"
);
caso(
  "P4 · faltan 2 y el almacén tiene 1 → «hay 1 y faltan 2», todo o nada: no baja la que había",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", "vd", 2, ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint', position('(hay 1 y faltan 2)' in (:'r')::jsonb ->> 'msg') > 0,
  ${cant("vd", "piso_t")}, ${cant("vd", "alm_t")});`,
  "bajada_vender_sin_almacen,t,0,1"
);

// ===========================================================================
// P5 · Libro
// ===========================================================================

caso(
  "P5 · piso +1, almacén −1, total igual; UNA fila traslado/movimiento_interno almacén→piso con la nota «Bajada registrada desde Vender»",
  `select ${cant("va", "piso_t")} + ${cant("va", "alm_t")} as total_va \\gset
${sesion(FELIPE)}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', ${cant("va", "piso_t")} + ${cant("va", "alm_t")} = :total_va, ${INTERNOS(["va"])},
  (select bool_and(tipo = 'traslado' and cantidad = 1 and sububicacion_id = :'alm_t' and sububicacion_destino_id = :'piso_t'
                   and ubicacion_id = :'tru' and ubicacion_destino_id = :'tru' and nota = 'Bajada registrada desde Vender')
     from retail.movimientos where motivo = 'movimiento_interno' and variante_id = :'va'));`,
  "t,1,t"
);
caso(
  "P5 · la fila es IGUAL (salvo la nota) a la que escribe «Reponer» con bajar_al_piso: mismo tipo, motivo, lugares, cantidad y firma",
  `${soloModulos("integrante", ["vender", "existencias"])}${sesion(MICAELA)}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")} as r \\gset
select retail.bajar_al_piso(:'tru', jsonb_build_array(jsonb_build_object('variante_id', :'vd', 'cantidad', 1)), :'tok2') as b \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok',
  (select count(distinct (tipo, motivo, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, cantidad, usuario_id))
     from retail.movimientos where motivo = 'movimiento_interno' and variante_id in (:'va', :'vd')));`,
  "true,1"
);

// ===========================================================================
// P6 · Idempotencia
// ===========================================================================

caso(
  "P6 · la misma marca dos veces → la segunda ya_registrada, y el stock se mueve UNA vez",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")} as r1 \\gset
select ${bajar("tru", "va", 1, ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb -> 'res' ->> 'ya_registrada', (:'r2')::jsonb -> 'res' ->> 'ya_registrada',
  (:'r1')::jsonb -> 'res' ->> 'movimiento_id' = (:'r2')::jsonb -> 'res' ->> 'movimiento_id', ${cant("va", "piso_t")}, ${INTERNOS(["va"])});`,
  "false,true,t,1,1"
);
caso(
  "P6 · la misma marca con OTRA prenda se rechaza (mover_interno_token_reusado) y no se mueve nada más",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", "va", 1, ":'tok1'")} as r1 \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${bajar("tru", "vd", 1, ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r2')::jsonb ->> 'ok', (:'r2')::jsonb ->> 'hint', ${CONTADORES} = :'antes');`,
  "false,mover_interno_token_reusado,t"
);

// ===========================================================================
// P7 · Forma de los datos y de la tienda
// ===========================================================================

caso(
  "P7 · sin marca → «Falta la marca de este intento…» y nada se mueve",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.bajar(:'tru', :'va', 1, null) as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint', (:'r')::jsonb ->> 'msg' = '${MSG.sinToken}', ${CONTADORES} = :'antes');`,
  "bajada_vender_sin_token,t,t"
);
caso(
  "P7 · cantidad necesaria 0, negativa, nula o de más de 999 → rechazada",
  `${sesion(FELIPE)}${COMO_API}select ${bajar("tru", "va", 0, ":'tok1'")};
select ${bajar("tru", "va", -1, ":'tok1'")};
select ${bajar("tru", "va", "null", ":'tok1'")};
select ${bajar("tru", "va", 1000, ":'tok1'")};`,
  (l) => l.slice(-4).every((x) => error(x, "bajada_vender_cantidad_invalida", MSG.cantidad))
);
caso(
  "P7 · una prenda que no existe y la «Prenda sin registrar» → «no está en el catálogo», sin efectos",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.bajar(:'tru', gen_random_uuid(), 1, :'tok1') as r1 \\gset
select pg_temp.bajar(:'tru', '22222222-2222-4222-8222-222222222222', 1, :'tok2') as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'hint', (:'r2')::jsonb ->> 'hint', (:'r2')::jsonb ->> 'msg' = '${MSG.noEsPrenda}', ${CONTADORES} = :'antes');`,
  "bajada_vender_no_es_prenda,bajada_vender_no_es_prenda,t,t"
);
caso(
  "P7 · el Taller (sin piso ni almacén) → «Esta tienda todavía no separa piso y almacén…», sin efectos",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.bajar(:'taller', :'va', 1, :'tok1');
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "bajada_vender_tienda_sin_piso", MSG.sinPiso) && l.at(-1) === "t"
);

console.log(`\n${total - fallos}/${total} pruebas en verde.`);
process.exit(fallos ? 1 : 0);

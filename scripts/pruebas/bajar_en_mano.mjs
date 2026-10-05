#!/usr/bin/env node
/**
 * Prueba de ADR-0328, actividad 9 — «La tengo en la mano» en Bajar al piso (`20261004223000_bajadas_en_mano_tabla.sql` y
 * `20261004223100_bajar_en_mano_funcion.sql`): si el sistema dice 0 en el almacén y la asesora tiene la prenda en la mano,
 * `bajar_en_mano` corrige el almacén (+1, «Encontré prendas») y la cuelga, en una sola transacción.
 *
 * QUÉ CUBRE
 *   P1 forma: una sola versión con la firma del contrato; anon no la ejecuta y authenticated sí; security definer con el
 *      search_path de la casa; la tabla con RLS y sin privilegios para la web; las migraciones no crean políticas, no quitan
 *      disparadores, no alteran tablas en uso y no tienen `select … into` fuera de los cuerpos (ADR-0195, ADR-0288).
 *   P2 permisos: el líder; una integrante con SOLO Existencias (el ajuste se lo da Existencias); sin Existencias no (aunque
 *      tenga Conteos y Traslados, que sí dejan ajustar); en otra tienda no.
 *   P3 firma: la Terminal administrativa con responsable presente → la corrección, la bajada y su movimiento los firma la
 *      responsable; sin responsable, 42501 y nada escrito; un reintento con la responsable ya fuera responde «ya registrada».
 *   P4 el corazón: almacén 0 → corrige +1 y cuelga (almacén sigue 0, piso +1, UNA corrección con la nota automática y UNA
 *      bajada de 1 unidad, unidas por su marca); con nota de la persona; almacén con libre → cuelga SIN corregir; solo
 *      apartadas → no; la prenda nunca entró a la tienda → no; tope de 5 correcciones por prenda, tienda y día; el día es el
 *      de LIMA (con la sesión en UTC, como producción: 23:59 de ayer no cuenta, 00:10 de hoy sí); la que no corrigió no
 *      cuenta para el tope; la respuesta trae lo LIBRE del piso (sin lo apartado); la nota larga no.
 *   P5 todo o nada: si la bajada falla después de corregir, no queda la corrección (ni la marca, ni la bajada).
 *   P6 idempotencia: la misma marca dos veces escribe UNA vez y la segunda dice «ya registrada»; la misma marca con otra prenda,
 *      en otra tienda, o la marca de una bajada escaneada se rechazan sin escribir. (Lo que pasa con dos conexiones a la vez
 *      —el candado de la prenda y el de la marca— lo prueba `bajar_en_mano_concurrencia.mjs`, con COMMIT.)
 *   P7 Frescura: la bajada en la mano es una bajada real para `fn_bajadas_del_piso_nucleo` (con su bajada_id, 1 unidad, no
 *      es carga inicial) y `fn_verificar_bajadas` / `fn_verificar_bajadas_en_mano` siguen en cero.
 *   P8 la marca no se edita ni se borra a mano, pero sí se va en cascada con su movimiento (como lo borra «Eliminar con
 *      historia»), sin frenarlo.
 *   P9 forma de los datos: sin marca, la «Prenda sin registrar», una prenda que no existe, una archivada, el Taller.
 *
 * CÓMO. Igual que `bajada_desde_vender.mjs`: cada caso en su transacción con ROLLBACK (nunca se commitea nada), sesión simulada
 * con `request.jwt.claim.sub` y el encabezado de PostgREST con `request.headers`. Las prendas son NUEVAS en cada caso
 * (producto «Blusa Mano Prueba» con 5 tallas) y su stock de partida se arma en Trujillo.
 *
 * USO
 *   pnpm pruebas:bajar-en-mano    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACIONES = ["20261004223000_bajadas_en_mano_tabla.sql", "20261004223100_bajar_en_mano_funcion.sql"];
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const T_ADMIN = "33333333-3333-4333-8333-0000000000d9"; // cuenta de una Terminal administrativa de Trujillo (esta prueba)
const ROSA = "33333333-3333-4333-8333-0000000000e9"; // integrante de Trujillo sin cuenta, marcó entrada: la responsable
const LUZ = "33333333-3333-4333-8333-0000000000ea"; // integrante de Trujillo sin cuenta, NO marcó entrada
const NOTA = "La tenía en la mano al bajarla";

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
create function pg_temp.mano(p_ubicacion uuid, p_variante uuid, p_nota text, p_token uuid) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  return jsonb_build_object('ok', true, 'res', retail.bajar_en_mano(p_ubicacion, p_variante, p_nota, p_token));
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
select id as alm_l from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'almacen_tienda' \\gset
-- Prendas propias: cinco tallas de un producto nuevo.
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Mano Prueba', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as prod \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prod', t.id, :'color', 'MANO-PRUEBA-' || t.n, 50
    from (select id, row_number() over (order by valor, id) as n from retail.tallas) t where t.n <= 5;
select id as va from retail.variantes where sku = 'MANO-PRUEBA-1' \\gset
select id as vb from retail.variantes where sku = 'MANO-PRUEBA-2' \\gset
select id as vc from retail.variantes where sku = 'MANO-PRUEBA-3' \\gset
select id as vd from retail.variantes where sku = 'MANO-PRUEBA-4' \\gset
select id as ve from retail.variantes where sku = 'MANO-PRUEBA-5' \\gset
-- Trujillo: va tuvo 2 en el almacén y se vendieron/ajustaron a 0 (almacén 0, piso 0: el caso del aviso, con historia);
-- vb piso 1 y almacén 0 («¿ya estaba colgada?»: la base no lo decide); vc almacén 2 (las 2 se apartan); vd almacén 1 (otra
-- persona la recibió); ve NUNCA entró a Trujillo (solo Lima, almacén 2).
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x.v, x.u, x.s, 'entrada', x.n, 'prueba en la mano: colchón'
    from (values (:'va'::uuid, :'tru'::uuid, :'alm_t'::uuid, 2), (:'vb', :'tru', :'piso_t', 1),
                 (:'vc', :'tru', :'alm_t', 2), (:'vd', :'tru', :'alm_t', 1), (:'ve', :'lim', :'alm_l', 2)) x(v, u, s, n);
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'va', :'tru', :'alm_t', 'salida', 2, 'prueba en la mano: se fueron');
select count(*) as _colchon from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  where m.variante_id in (:'va', :'vb', :'vc', :'vd', :'ve') order by m.created_at, m.tipo) x \\gset
select retail.apartar_stock(:'vc', :'tru', 2, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 3, null, :'alm_t', null) as _ap \\gset
-- La Terminal administrativa de Trujillo (su rol ve Existencias, como en la siembra) y dos integrantes sin cuenta: Rosa
-- marcó entrada, Luz no.
insert into auth.users (id, aud, role, email) values ('${T_ADMIN}', 'authenticated', 'authenticated', 'terminal-admin-mano@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id)
  values (:'tru', 'Terminal Admin TRU (prueba mano)', 'administrativa', '${T_ADMIN}') returning id as t_admin \\gset
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values
  ('${ROSA}', 'Rosa', 'Prueba', 'activo', :'sede_tru'), ('${LUZ}', 'Luz', 'Prueba', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru'), ('${LUZ}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
\\set rosa '${ROSA}'
select gen_random_uuid() as tok1 \\gset
select gen_random_uuid() as tok2 \\gset
select gen_random_uuid() as tok3 \\gset
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
const mano = (ubic, v, nota, tok) => `pg_temp.mano(:'${ubic}', :'${v}', ${nota}, ${tok})`;
const cant = (v, sub, ubic = "tru") =>
  `coalesce((select cantidad from retail.stock where variante_id = :'${v}' and ubicacion_id = :'${ubic}' and sububicacion_id = :'${sub}'), 0)`;
const CONTADORES = `concat_ws(',', (select count(*) from retail.movimientos), (select count(*) from retail.bajadas_piso),
  (select count(*) from retail.bajada_piso_items), (select count(*) from retail.bajadas_en_mano))`;
const AJUSTES = (v) => `(select count(*) from retail.movimientos where tipo = 'ajuste' and motivo = 'reposicion' and variante_id = :'${v}')`;
const INTERNOS = (v) => `(select count(*) from retail.movimientos where motivo = 'movimiento_interno' and variante_id = :'${v}')`;
const r = (campo, v = "r") => `((:'${v}')::jsonb -> 'res' ->> '${campo}')`;

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
  const res = correr(sql);
  if (!res.ok) return esperar(nombre, false, res.mensaje);
  let ok = false;
  try {
    ok = typeof verificar === "string" ? res.lineas[res.lineas.length - 1] === verificar : !!verificar(res.lineas);
  } catch {
    ok = false;
  }
  esperar(nombre, ok, typeof verificar === "string" ? `esperaba «${verificar}», salió:\n${res.lineas.join("\n")}` : res.lineas.join("\n"));
}
const json = (linea) => JSON.parse(linea);
const error = (linea, hint, inicio) => {
  const j = json(linea);
  return j.ok === false && j.estado === "P0001" && j.hint === hint && (inicio === undefined || j.msg.startsWith(inicio));
};

// ===========================================================================
// P1 · Forma
// ===========================================================================

caso(
  "P1 · una sola versión de bajar_en_mano, con la firma del contrato",
  `select count(*) || '|' || string_agg(pg_get_function_identity_arguments(oid), ';')
     from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'bajar_en_mano';`,
  "1|p_ubicacion_id uuid, p_variante_id uuid, p_nota text, p_token uuid"
);
caso(
  "P1 · anon no la ejecuta, authenticated sí, security definer y con el search_path fijo de la casa",
  `select concat_ws(',', has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'),
                    coalesce(p.proconfig::text like '%search_path=retail, public, extensions%', false), p.prosecdef)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'bajar_en_mano';`,
  "f,t,t,t"
);
caso(
  "P1 · la tabla bajadas_en_mano: RLS encendido sin políticas, la web no la lee ni la escribe, el diagnóstico no es de la web",
  `select concat_ws(',', c.relrowsecurity,
     (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'bajadas_en_mano'),
     has_table_privilege('authenticated', 'retail.bajadas_en_mano', 'select'), has_table_privilege('anon', 'retail.bajadas_en_mano', 'insert'),
     has_function_privilege('authenticated', 'retail.fn_verificar_bajadas_en_mano()', 'execute'))
     from pg_class c where c.oid = 'retail.bajadas_en_mano'::regclass;`,
  "t,0,f,f,f"
);
for (const archivo of MIGRACIONES) {
  // Sin los comentarios: la cabecera puede explicar la regla sin romperla.
  const sinComentarios = readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8").replace(/--[^\n]*/g, "");
  // El único `alter table` permitido es el que enciende RLS en la tabla NUEVA (no está en uso: ADR-0195 no aplica).
  const alters = [...sinComentarios.matchAll(/\balter\s+table\s+([\w.]+)/gi)].map((m) => m[1]);
  esperar(
    `P1 · ${archivo}: sin políticas, sin «drop trigger» y sin alter de tablas en uso (ADR-0195)`,
    !/\bdrop\s+trigger\b|\b(create|drop)\s+policy\b/i.test(sinComentarios) && alters.every((t) => t === "retail.bajadas_en_mano"),
    alters.join(", ")
  );
  // ADR-0288: el SQL Editor toma un `select … into` entre comillas simples por una tabla nueva y agrega líneas que rompen el pegado.
  esperar(`P1 · ${archivo}: sin «select … into» fuera de los cuerpos (ADR-0288)`, !/\bselect\b[^;]*?\binto\b/i.test(sinComentarios.replace(/\$(fn|f)\$[\s\S]*?\$\1\$/g, "")));
  esperar(`P1 · ${archivo}: con lock_timeout de 3 s`, /set\s+lock_timeout\s*=\s*'3s'/i.test(sinComentarios));
}

// ===========================================================================
// P2 · Permisos
// ===========================================================================

caso(
  "P2 · el líder corrige y cuelga en Trujillo",
  `${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${r("corregida")}, ${cant("va", "piso_t")}, ${cant("va", "alm_t")});`,
  "true,true,1,0"
);
caso(
  "P2 · integrante con SOLO Existencias: corrige y cuelga (ajustar y bajar son funciones de Existencias, ADR-0306)",
  `${soloModulos("integrante", ["existencias"])}${sesion(MICAELA)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${r("corregida")}, ${cant("va", "piso_t")});`,
  "true,true,1"
);
caso(
  "P2 · integrante SIN Existencias (con Conteos y Traslados, que sí dejan ajustar) → «tu rol no tiene el módulo «Existencias»», nada se escribe",
  `${soloModulos("integrante", ["conteos", "traslados", "vender"])}select ${CONTADORES} as antes \\gset
${sesion(MICAELA)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "en_mano_sin_modulo", "No puedes corregir y colgar prendas: tu rol no tiene el módulo «Existencias»") && l.at(-1) === "t"
);
caso(
  "P2 · integrante con Existencias, en OTRA tienda → «No tienes permiso para mover mercadería en esa tienda.»",
  `${soloModulos("integrante", ["existencias"])}${sesion(MICAELA)}${COMO_API}select pg_temp.mano(:'lim', :'va', null, :'tok1');`,
  (l) => error(l.at(-1), "en_mano_sin_tienda", "No tienes permiso para mover mercadería en esa tienda.")
);

// ===========================================================================
// P3 · Firma
// ===========================================================================

caso(
  "P3 · TERMINAL ADMINISTRATIVA + responsable presente: firma Rosa la corrección, el movimiento de la bajada y la bajada",
  `${sesion(T_ADMIN, { resp: "rosa" })}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok',
  (select bool_and(m.usuario_id = :'rosa' and m.terminal_id = :'t_admin') from retail.movimientos m
    where m.id in (${r("ajuste_movimiento_id")}::uuid, ${r("movimiento_id")}::uuid)),
  (select b.persona_id = :'rosa' from retail.bajadas_piso b where b.id = ${r("bajada_id")}::uuid));`,
  "true,t,t"
);
caso(
  "P3 · terminal SIN x-responsable → 42501 «Elige quién hace esta operación» y nada se escribe",
  `select ${CONTADORES} as antes \\gset
${sesion(T_ADMIN)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => {
    const j = json(l.at(-2));
    return j.estado === "42501" && j.hint === "responsable_requerido" && l.at(-1) === "t";
  }
);
caso(
  // Un reintento de algo ya guardado no escribe nada: la marca se mira ANTES de pedir responsable.
  "P3 · reintento con la misma marca y la responsable YA fuera de turno (o sin responsable) → ya_registrada, una sola corrección y una sola bajada",
  `${sesion(T_ADMIN, { resp: "rosa" })}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r1 \\gset
${sesion(T_ADMIN)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', ${r("ya_registrada", "r1")}, ${r("ya_registrada", "r2")}, ${r("corregida", "r2")},
  ${r("bajada_id", "r1")} = ${r("bajada_id", "r2")}, ${r("piso", "r2")}, ${AJUSTES("va")}, ${INTERNOS("va")});`,
  "false,true,true,t,1,1,1"
);

// ===========================================================================
// P4 · El corazón: corregir solo lo que hace falta
// ===========================================================================

caso(
  "P4 · almacén 0 y piso 0 (con historia): +1 en el almacén «Encontré prendas» y −1 al piso; almacén sigue 0, piso 1, respuesta con lo libre",
  `${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', ${r("ya_registrada")}, ${r("corregida")}, ${r("piso")}, ${r("almacen")},
  ${cant("va", "piso_t")}, ${cant("va", "alm_t")}, ${AJUSTES("va")}, ${INTERNOS("va")},
  (select m.cantidad = 1 and m.sububicacion_id = :'alm_t' and m.nota = '${NOTA}'
     from retail.movimientos m where m.id = ${r("ajuste_movimiento_id")}::uuid),
  (select count(*) || ':' || sum(i.cantidad) from retail.bajada_piso_items i where i.bajada_id = ${r("bajada_id")}::uuid),
  (select e.ajuste_movimiento_id::text = ${r("ajuste_movimiento_id")} from retail.bajadas_en_mano e where e.bajada_id = ${r("bajada_id")}::uuid));`,
  "false,true,1,0,1,0,1,1,t,1:1,t"
);
caso(
  "P4 · la nota de la persona va detrás de la automática, con los espacios ordenados",
  `${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "E'  Venía   en un\\n fardo  '", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select nota from retail.movimientos where id = ${r("ajuste_movimiento_id")}::uuid;`,
  `${NOTA} · Venía en un fardo`
);
caso(
  "P4 · nota de más de 200 caracteres → «La nota admite hasta 200 caracteres», nada se escribe",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "repeat('x', 201)", ":'tok1'")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "en_mano_nota_larga", "La nota admite hasta 200 caracteres") && l.at(-1) === "t"
);
caso(
  "P4 · el almacén YA tiene una libre (otra persona la recibió): cuelga SIN corregir (corregida false, sin ajuste), almacén −1",
  `${sesion(FELIPE)}${COMO_API}select ${mano("tru", "vd", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', ${r("corregida")}, ${r("ajuste_movimiento_id")} is null, ${cant("vd", "piso_t")}, ${cant("vd", "alm_t")},
  ${AJUSTES("vd")}, ${INTERNOS("vd")}, (select count(*) from retail.bajadas_en_mano where bajada_id = ${r("bajada_id")}::uuid and ajuste_movimiento_id is null));`,
  "false,t,1,0,0,1,1"
);
caso(
  "P4 · el piso ya la cuenta (piso 1, almacén 0): la base NO decide «ya estaba colgada»; si la persona dice que es otra, corrige y suma",
  `${sesion(FELIPE)}${COMO_API}select ${mano("tru", "vb", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', ${r("corregida")}, ${cant("vb", "piso_t")}, ${cant("vb", "alm_t")});`,
  "true,2,0"
);
caso(
  "P4 · en el almacén solo hay APARTADAS (2 para un cliente) → «hay 2 apartadas para clientes», nada se escribe",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${mano("tru", "vc", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint', position('hay 2 apartadas para clientes' in (:'r')::jsonb ->> 'msg') > 0, ${CONTADORES} = :'antes');`,
  "en_mano_apartada,t,t"
);
caso(
  "P4 · la prenda NUNCA entró a Trujillo (solo está en Lima) → «nunca entró», nada se escribe (no es una corrección)",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${mano("tru", "ve", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint', position('nunca entró a Tienda Trujillo' in (:'r')::jsonb ->> 'msg') > 0, ${CONTADORES} = :'antes');`,
  "en_mano_sin_historia,t,t"
);
caso(
  "P4 · tope del día: 5 correcciones de la misma prenda pasan; la 6.ª se rechaza y no escribe nada",
  `${sesion(FELIPE)}${COMO_API}select count(*) filter (where (x ->> 'ok')::boolean and (x -> 'res' ->> 'corregida')::boolean) as cinco
  from (select pg_temp.mano(:'tru', :'va', null, gen_random_uuid()) as x from generate_series(1, 5)) y \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', :'cinco', (:'r')::jsonb ->> 'hint', position('Hoy ya se corrigieron 5 de' in (:'r')::jsonb ->> 'msg') > 0,
  ${CONTADORES} = :'antes', ${cant("va", "piso_t")});`,
  "5,en_mano_tope_del_dia,t,t,5"
);
// El día del tope es el de LIMA, no el de la base (UTC en producción y en el CI) ni «las últimas 24 h». Se fija la zona de la
// sesión en UTC (como producción) y se mueve la hora de 5 correcciones a cada lado de la medianoche de Lima: la de un minuto
// antes NO cuenta (ayer) y la de 10 minutos después SÍ (hoy). Entre las dos, a cualquier hora en que corra la prueba, cae un
// tope por día UTC o por 24 h hacia atrás (revisión adversarial: esos mutantes sobrevivían).
const CINCO_Y_MOVER = (desplazamiento) => `${COMO_POSTGRES}set local timezone = 'UTC';
${sesion(FELIPE)}${COMO_API}select count(*) as _cinco from (select pg_temp.mano(:'tru', :'va', null, gen_random_uuid()) as x from generate_series(1, 5)) y \\gset
${COMO_POSTGRES}alter table retail.bajadas_piso disable trigger bajadas_piso_inmutables;
update retail.bajadas_piso b set created_at = (retail.fn_hoy_lima()::timestamp at time zone 'America/Lima') + interval '${desplazamiento}'
 where b.id in (select e.bajada_id from retail.bajadas_en_mano e where e.ajuste_movimiento_id is not null);
alter table retail.bajadas_piso enable trigger bajadas_piso_inmutables;
${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}`;
caso(
  "P4 · tope por día de LIMA: 5 correcciones a las 23:59 de ayer (Lima) no cuentan — la de hoy pasa",
  `${CINCO_Y_MOVER("-1 minute")}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${r("corregida")});`,
  "true,true"
);
caso(
  "P4 · tope por día de LIMA: 5 correcciones a las 00:10 de hoy (Lima) sí cuentan — la 6.ª se rechaza",
  `${CINCO_Y_MOVER("10 minutes")}select (:'r')::jsonb ->> 'hint';`,
  "en_mano_tope_del_dia"
);
caso(
  "P4 · la respuesta trae lo LIBRE del piso (sin lo apartado para un cliente), no el total",
  `${COMO_POSTGRES}select retail.apartar_stock(:'vb', :'tru', 1, 'Bea Ruiz', '999333444', retail.fn_hoy_lima() + 3, null, :'piso_t', null) as _ap_piso \\gset
${sesion(FELIPE)}${COMO_API}select ${mano("tru", "vb", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', ${r("corregida")}, ${r("piso")}, ${r("almacen")}, ${cant("vb", "piso_t")});`,
  "true,1,0,2"
);
caso(
  "P4 · el tope es por prenda: con 5 correcciones de una, otra prenda de la misma tienda sigue pudiendo",
  `${sesion(FELIPE)}${COMO_API}select count(*) as _n from (select pg_temp.mano(:'tru', :'va', null, gen_random_uuid()) as x from generate_series(1, 5)) y \\gset
select ${mano("tru", "vb", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${r("corregida")});`,
  "true,true"
);
caso(
  "P4 · lo que se colgó SIN corregir no cuenta para el tope",
  `${COMO_POSTGRES}insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vd', :'tru', :'alm_t', 'entrada', 5, 'prueba en la mano: llegan 5') returning id as m5 \\gset
select retail.fn_aplicar_movimiento(:'m5') as _a \\gset
${sesion(FELIPE)}${COMO_API}select count(*) filter (where not (x -> 'res' ->> 'corregida')::boolean) as sin_corregir
  from (select pg_temp.mano(:'tru', :'vd', null, gen_random_uuid()) as x from generate_series(1, 6)) y \\gset
select ${mano("tru", "vd", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', :'sin_corregir', (:'r')::jsonb ->> 'ok', ${r("corregida")});`,
  "6,true,true"
);

// ===========================================================================
// P5 · Todo o nada
// ===========================================================================

caso(
  "P5 · si la bajada falla DESPUÉS de corregir, no queda la corrección, ni la bajada, ni la marca",
  `select ${CONTADORES} as antes \\gset
create or replace function retail.bajar_al_piso(p_ubicacion_id uuid, p_items jsonb, p_token uuid) returns jsonb
  language plpgsql as $f$ begin raise exception 'la bajada se cayó a propósito' using hint = 'prueba_caida'; end $f$;
${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint', ${CONTADORES} = :'antes', ${AJUSTES("va")}, ${cant("va", "alm_t")}, ${cant("va", "piso_t")});`,
  "prueba_caida,t,0,0,0"
);

// ===========================================================================
// P6 · Idempotencia
// ===========================================================================

caso(
  "P6 · la misma marca dos veces → la segunda ya_registrada con la misma bajada, y se escribe UNA vez",
  `${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r1 \\gset
select ${mano("tru", "va", "null", ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', ${r("ya_registrada", "r2")}, ${r("bajada_id", "r1")} = ${r("bajada_id", "r2")},
  ${r("ajuste_movimiento_id", "r1")} = ${r("ajuste_movimiento_id", "r2")}, ${cant("va", "piso_t")}, ${AJUSTES("va")}, ${INTERNOS("va")});`,
  "true,t,t,1,1,1"
);
caso(
  "P6 · la misma marca con OTRA prenda se rechaza (en_mano_token_reusado) y no escribe nada más",
  `${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r1 \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${mano("tru", "vb", "null", ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r2')::jsonb ->> 'hint', ${CONTADORES} = :'antes');`,
  "en_mano_token_reusado,t"
);
caso(
  // La pantalla guarda la marca en el aparato y la reusa al reabrir la ventana: si se cruzara de tienda (otra pestaña, otra
  // sede elegida), la base no puede responder «ya registrada» con lo de otra tienda.
  "P6 · la misma marca en OTRA tienda se rechaza (en_mano_token_reusado), no responde «ya registrada» y no escribe nada",
  `${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r1 \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${mano("lim", "va", "null", ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r2')::jsonb ->> 'hint', ${CONTADORES} = :'antes');`,
  "en_mano_token_reusado,t"
);
caso(
  "P6 · la marca de una bajada ESCANEADA (bajar_al_piso) no se toma por una en la mano",
  `${COMO_POSTGRES}insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'va', :'tru', :'alm_t', 'entrada', 1, 'prueba en la mano: llega 1') returning id as m1 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a \\gset
${sesion(FELIPE)}${COMO_API}select retail.bajar_al_piso(:'tru', jsonb_build_array(jsonb_build_object('variante_id', :'va', 'cantidad', 1)), :'tok1') as b \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint', ${CONTADORES} = :'antes');`,
  "en_mano_token_reusado,t"
);

// ===========================================================================
// P7 · Frescura la cuenta como bajada real
// ===========================================================================

caso(
  "P7 · fn_bajadas_del_piso_nucleo ve la bajada en la mano con su bajada_id, 1 unidad y sin ser carga inicial; los diagnósticos en 0",
  `${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}
-- Los diagnósticos, ANTES de mover la hora (la corrección y la bajada se escribieron en la misma transacción: misma hora).
select concat_ws(',', (select count(*) from retail.fn_verificar_bajadas() v where v.bajada_id = ${r("bajada_id")}::uuid),
  (select count(*) from retail.fn_verificar_bajadas_en_mano())) as diagnosticos \\gset
-- Lo recién escrito tiene created_at = now() de ESTA transacción y la lectura va hasta now() sin incluirlo ([desde, hasta)):
-- en la vida real la lectura es otra transacción, posterior. Se corre 1 minuto hacia atrás por fuera de los disparadores
-- (solo postgres y solo en esta transacción, que termina en ROLLBACK), como en frescura_bajadas.mjs.
set constraints retail.trg_actividad_movimientos, retail.trg_actividad_conteo_nuevo, retail.trg_actividad_traslado_nuevo immediate;
alter table retail.movimientos disable trigger movimientos_inmutables;
update retail.movimientos set created_at = created_at - interval '1 minute'
 where id in (${r("ajuste_movimiento_id")}::uuid, ${r("movimiento_id")}::uuid);
alter table retail.movimientos enable always trigger movimientos_inmutables;
select concat_ws(',',
  (select count(*) || ':' || bool_and(n.bajada_id::text = ${r("bajada_id")} and n.cantidad = 1 and not n.es_carga_inicial and n.estado = 'en_curso')
     from retail.fn_bajadas_del_piso_nucleo(:'tru', now() - interval '1 hour', now(), 10) n where n.variante_id = :'va'),
  :'diagnosticos');`,
  "1:true,0,0"
);
caso(
  "P7 · fn_verificar_bajadas_en_mano ve una corrección que no es de la bajada (mutación a mano, por fuera de los disparadores)",
  `${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select retail.registrar_movimiento(:'va', :'tru', 'ajuste', 2, 'otro', 'otra cosa', :'alm_t') as otro \\gset
alter table retail.bajadas_en_mano disable trigger bajadas_en_mano_inmutables;
update retail.bajadas_en_mano set ajuste_movimiento_id = :'otro' where bajada_id = ${r("bajada_id")}::uuid;
alter table retail.bajadas_en_mano enable trigger bajadas_en_mano_inmutables;
select count(*) from retail.fn_verificar_bajadas_en_mano() where bajada_id = ${r("bajada_id")}::uuid;`,
  "1"
);

// ===========================================================================
// P8 · La marca no se edita ni se borra a mano; se va en cascada con su movimiento
// ===========================================================================

caso(
  "P8 · editar o borrar la marca a mano se rechaza",
  `${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'paso'; exception when others then return 'rechazo'; end $f$;
select concat_ws(',',
  pg_temp.intento(format('update retail.bajadas_en_mano set ajuste_movimiento_id = null where bajada_id = %L', ${r("bajada_id")})),
  pg_temp.intento(format('delete from retail.bajadas_en_mano where bajada_id = %L', ${r("bajada_id")})),
  pg_temp.intento('truncate retail.bajadas_en_mano'));`,
  "rechazo,rechazo,rechazo"
);
caso(
  "P8 · si «Eliminar con historia» borra el movimiento de la corrección, la marca se va en cascada y no lo frena",
  `${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}
set constraints retail.trg_actividad_movimientos, retail.trg_actividad_conteo_nuevo, retail.trg_actividad_traslado_nuevo immediate;
alter table retail.movimientos disable trigger movimientos_inmutables;
delete from retail.movimientos where id = ${r("ajuste_movimiento_id")}::uuid;
alter table retail.movimientos enable always trigger movimientos_inmutables;
select count(*) from retail.bajadas_en_mano where bajada_id = ${r("bajada_id")}::uuid;`,
  "0"
);

caso(
  "P8 · «Eliminar con historia» (Admin, ADR-0252) borra un producto corregido en la mano sin frenarse: la marca se va con él",
  `${COMO_POSTGRES}insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Mano Eliminar', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as prod_x \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prod_x', t.id, :'color', 'MANO-ELIMINAR-1', 50 from retail.tallas t order by t.valor, t.id limit 1 returning id as vx \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vx', :'tru', :'alm_t', 'entrada', 1, 'prueba en la mano: llega') returning id as mx1 \\gset
select retail.fn_aplicar_movimiento(:'mx1') as _a \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vx', :'tru', :'alm_t', 'salida', 1, 'prueba en la mano: se fue') returning id as mx2 \\gset
select retail.fn_aplicar_movimiento(:'mx2') as _b \\gset
${sesion(FELIPE)}${COMO_API}select ${mano("tru", "vx", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select (select count(*) from retail.bajadas_en_mano where bajada_id = ${r("bajada_id")}::uuid) as antes \\gset
-- Actividad (ADR-0207) deja eventos diferidos en la transacción: se disparan antes, como pasaría en otra transacción.
set constraints retail.trg_actividad_movimientos, retail.trg_actividad_conteo_nuevo, retail.trg_actividad_traslado_nuevo immediate;
${sesion(FELIPE)}select retail.eliminar_producto_con_historia(:'prod_x') as ref \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', :'antes', (select count(*) from retail.productos where id = :'prod_x'),
  (select count(*) from retail.bajadas_en_mano where bajada_id = ${r("bajada_id")}::uuid), (select count(*) from retail.fn_verificar_bajadas_en_mano()));`,
  "true,1,0,0,0"
);

// ===========================================================================
// P9 · Forma de los datos y de la tienda
// ===========================================================================

caso(
  "P9 · sin marca → «Falta la marca de este intento…» y nada se escribe",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.mano(:'tru', :'va', null, null) as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint', ${CONTADORES} = :'antes');`,
  "en_mano_sin_token,t"
);
caso(
  "P9 · una prenda que no existe y la «Prenda sin registrar» → «no está en el catálogo», sin efectos",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.mano(:'tru', gen_random_uuid(), null, :'tok1') as r1 \\gset
select pg_temp.mano(:'tru', '22222222-2222-4222-8222-222222222222', null, :'tok2') as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'hint', (:'r2')::jsonb ->> 'hint', ${CONTADORES} = :'antes');`,
  "en_mano_no_es_prenda,en_mano_no_es_prenda,t"
);
caso(
  "P9 · una prenda archivada → «está archivada: no se cuelga en el piso», sin efectos",
  `${COMO_POSTGRES}update retail.variantes set activo = false where id = :'va';
select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${mano("tru", "va", "null", ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint', position('está archivada' in (:'r')::jsonb ->> 'msg') > 0, ${CONTADORES} = :'antes');`,
  "en_mano_archivada,t,t"
);
caso(
  "P9 · el Taller (sin piso ni almacén) → «Esta tienda todavía no separa piso y almacén…», sin efectos",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.mano(:'taller', :'va', null, :'tok1') as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint', ${CONTADORES} = :'antes');`,
  "en_mano_tienda_sin_piso,t"
);

console.log(`\n${total - fallos}/${total} pruebas en verde.`);
process.exit(fallos ? 1 : 0);

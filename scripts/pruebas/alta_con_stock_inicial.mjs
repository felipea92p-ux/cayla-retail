#!/usr/bin/env node
/**
 * Prueba de ADR-0212 «Nuevo producto con su stock de hoy» — `crear_producto_con_stock_inicial` y
 * `fn_cargar_stock_inicial` (`supabase/migrations/20260926130000_alta_producto_con_stock_inicial.sql`).
 *
 * QUÉ CUBRE
 *   F1 forma: una sola versión de cada función con la firma del contrato; authenticated llama la RPC y anon no; la
 *      carga interna no la llama nadie de afuera; las 11 primeras de la firma son EXACTAMENTE las de
 *      `crear_producto_con_variantes` (si esa cambia, esto avisa); firma con el responsable una vez; la migración no
 *      toca tablas ni políticas ni disparadores (se pega sola en el SQL Editor).
 *   F2 almacén: las cantidades entran como «carga_inicial» al almacén de la tienda, firmadas; vacío y 0 no cargan.
 *   F3 piso: con `p_al_piso` quedan en el piso, con UNA bajada (Frescura ve su hora) y el almacén en cero.
 *   F4 doble clic: el mismo token devuelve el mismo producto y no carga dos veces.
 *   F5 sin cantidades: el alta de siempre, sin tienda y sin movimientos.
 *   F6 cantidades mal escritas (decimal, negativa, texto, 10000): no se crea nada.
 *   F7 todo o nada: cantidades sin tienda, otra tienda, un Taller sin piso con «al piso», un rol sin «Bajada al piso»:
 *      en todos, ni producto ni stock.
 *   F8 permisos: integrante con Productos carga en SU tienda (firma ella); sin Productos no crea nada.
 *   F9 terminal: con responsable presente firma la responsable; sin responsable, 42501 y nada.
 *   F10 el candado: la carga inicial es solo para una prenda SIN movimientos en esa tienda (en otra tienda, sí);
 *       y una prenda repetida en la lista se rechaza.
 *
 * CÓMO. Igual que `bajada_al_piso.mjs`: cada caso en su transacción con ROLLBACK (nunca se commitea nada), sesión
 * simulada con `request.jwt.claim(s)` y el encabezado de PostgREST con `request.headers`. `pg_temp.crear` llama a la RPC
 * y devuelve el resultado o el error (estado, hint, mensaje) como JSON.
 *
 * USO
 *   pnpm pruebas:alta-con-stock-inicial    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = "20260926130000_alta_producto_con_stock_inicial.sql";
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const T_CAJA = "33333333-3333-4333-8333-0000000000e2"; // cuenta de una terminal de Trujillo
const ROSA = "33333333-3333-4333-8333-0000000000e1"; // integrante de Trujillo sin cuenta, marcó entrada: la responsable

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
create function pg_temp.crear(p_ref text, p_variantes jsonb, p_token uuid, p_ubicacion uuid, p_al_piso boolean) returns jsonb
language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  return jsonb_build_object('ok', true, 'id', retail.crear_producto_con_stock_inicial(
    p_ref, current_setting('prueba.cat')::uuid, p_variantes, null, p_token, null, null, false, null,
    current_setting('prueba.marca')::uuid, current_setting('prueba.prov')::uuid, p_ubicacion, p_al_piso));
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
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'almacen_tienda');
delete from retail.sububicaciones s where s.ubicacion_id = :'taller'
  and not exists (select 1 from retail.stock x where x.sububicacion_id = s.id)
  and not exists (select 1 from retail.movimientos m where m.sububicacion_id = s.id or m.sububicacion_destino_id = s.id);
select id as piso_t from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as alm_t from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as alm_l from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'almacen_tienda' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
-- Una categoría que no exige tejido ni patrón, con dos de sus tallas; una pareja marca-proveedor; dos colores.
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and (select count(*) from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id) >= 2
  order by c.nombre limit 1 \\gset
select t.id as t1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo
  where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select t.id as t2 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo
  where ct.categoria_id = :'cat' order by t.id offset 1 limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
select codigo as c2 from retail.colores where activo order by codigo offset 1 limit 1 \\gset
select set_config('prueba.cat', :'cat', true) as _1, set_config('prueba.marca', :'marca', true) as _2,
       set_config('prueba.prov', :'prov', true) as _3 \\gset
-- La terminal de Trujillo y una integrante sin cuenta que marcó entrada (la responsable).
insert into auth.users (id, aud, role, email) values ('${T_CAJA}', 'authenticated', 'authenticated', 'terminal-caja-alta@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id)
  values (:'tru', 'Terminal Caja TRU (prueba alta)', 'administrativa', '${T_CAJA}') returning id as t_caja \\gset
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values ('${ROSA}', 'Rosa', 'Prueba Alta', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
\\set rosa '${ROSA}'
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
/** Deja al rol con clave `clave` con exactamente esos módulos, y sin el «limitado como hoy» (como `postgres`). */
const soloModulos = (clave, modulos) =>
  `${COMO_POSTGRES}update retail.roles set limitado_como_hoy = false where clave = '${clave}';
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('${clave}');\n` +
  (modulos.length
    ? `insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('${clave}'), unnest(array[${modulos.map((m) => `'${m}'`).join(", ")}]);\n`
    : "");

/** Las 4 celdas de la matriz (t1/t2 × c1/c2) con sus cantidades, en el formato que manda la pantalla. `undefined` = sin la clave. */
const celdas = (q11, q21, q12, q22) =>
  `jsonb_build_array(${[
    ["t1", "c1", q11],
    ["t2", "c1", q21],
    ["t1", "c2", q12],
    ["t2", "c2", q22],
  ]
    .map(
      ([t, c, q]) =>
        `jsonb_build_object('talla_id', :'${t}', 'color_codigo', :'${c}', 'precio', 59, 'costo', 20${q === undefined ? "" : `, 'cantidad', ${q}`})`
    )
    .join(", ")})`;
const crear = (ref, variantes, tok, ubic, alPiso = false) =>
  `pg_temp.crear('${ref}', ${variantes}, ${tok}, ${ubic ? `:'${ubic}'` : "null"}, ${alPiso})`;
const REF = "Sandalia Carga Inicial Prueba";
/** El id de la variante (t, c) del producto recién creado con ese nombre. */
const vid = (t, c) =>
  `(select v.id from retail.variantes v join retail.productos p on p.id = v.producto_id
     where p.referencia = '${REF}' and v.talla_id = :'${t}' and v.color_codigo = :'${c}')`;
const cant = (t, c, sub, ubic = "tru") =>
  `coalesce((select sum(cantidad) from retail.stock where variante_id = ${vid(t, c)} and ubicacion_id = :'${ubic}'${
    sub === null ? " and sububicacion_id is null" : sub ? ` and sububicacion_id = :'${sub}'` : ""
  }), 0)`;
const CONTADORES = `concat_ws(',', (select count(*) from retail.productos), (select count(*) from retail.variantes), (select count(*) from retail.movimientos), (select count(*) from retail.bajadas_piso))`;

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
const error = (linea, hint, estado = "P0001") => {
  const j = json(linea);
  return j.ok === false && j.estado === estado && j.hint === hint;
};

const FIRMA_ALTA =
  "p_referencia text, p_categoria_id uuid, p_variantes jsonb, p_descripcion text, p_token uuid, p_tejido_id uuid, p_patron_id uuid, " +
  "p_confirmo_distinto boolean, p_etiqueta_ids uuid[], p_marca_id uuid, p_proveedor_id uuid";

// ===========================================================================
// F1 · Forma
// ===========================================================================

caso(
  "F1 · una sola versión de cada función, con la firma del contrato",
  `select (select count(*) || '|' || string_agg(pg_get_function_identity_arguments(oid), ';') from pg_proc
            where pronamespace = 'retail'::regnamespace and proname = 'crear_producto_con_stock_inicial')
     || '#' ||
          (select count(*) || '|' || string_agg(pg_get_function_identity_arguments(oid), ';') from pg_proc
            where pronamespace = 'retail'::regnamespace and proname = 'fn_cargar_stock_inicial');`,
  `1|${FIRMA_ALTA}, p_ubicacion_id uuid, p_al_piso boolean#1|p_ubicacion_id uuid, p_items jsonb, p_nota text`
);
caso(
  "F1 · las 11 primeras de la firma son exactamente las de crear_producto_con_variantes (si esa cambia, esto avisa)",
  `select pg_get_function_identity_arguments(oid) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'crear_producto_con_variantes';`,
  FIRMA_ALTA
);
caso(
  "F1 · permisos: authenticated llama la RPC y anon no; la carga interna no la llama nadie de afuera",
  `select concat_ws(',',
     has_function_privilege('authenticated', 'retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean)', 'execute'),
     has_function_privilege('anon', 'retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean)', 'execute'),
     has_function_privilege('authenticated', 'retail.fn_cargar_stock_inicial(uuid, jsonb, text)', 'execute'),
     has_function_privilege('anon', 'retail.fn_cargar_stock_inicial(uuid, jsonb, text)', 'execute'));`,
  "t,f,f,f"
);
caso(
  "F1 · la carga firma con el responsable UNA vez, toma los candados en orden y no usa el patrón viejo de auth.uid()",
  `select concat_ws(',', (length(d) - length(replace(d, 'fn_actor_persona_id(', ''))) / length('fn_actor_persona_id('),
     d ~ 'fn_actor_persona_id\\(true\\)', d ~* 'auth_user_id\\s*=\\s*auth\\.uid', d ~ 'fn_bloquear_en_orden\\(')
     from (select pg_get_functiondef('retail.fn_cargar_stock_inicial(uuid, jsonb, text)'::regprocedure) d) x;`,
  "1,t,f,t"
);
{
  // Sin los comentarios: la cabecera puede explicar la regla sin romperla.
  const sql = readFileSync(join(RAIZ, "supabase", "migrations", MIGRACION), "utf8").replace(/--[^\n]*/g, "");
  const prohibido = /\b(drop|create)\s+trigger\b|\b(create|drop|alter)\s+policy\b|\balter\s+table\b|\bdrop\s+function\b/i;
  esperar(
    "F1 · la migración no toca tablas, políticas, disparadores ni borra funciones (se pega sola en el SQL Editor, ADR-0195)",
    !prohibido.test(sql),
    sql.match(prohibido)?.[0]
  );
  esperar("F1 · todas las tablas y funciones van con `retail.` o bajo `set search_path` (CLAUDE.md)", /set search_path = retail, public, extensions;/.test(sql));
}

// ===========================================================================
// F2 · Carga al almacén
// ===========================================================================

caso(
  "F2 · líder en Trujillo: 3 y 2 entran al almacén; la celda con 0 y la vacía no cargan; las 4 variantes existen",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 2, "''"), ":'tok1'", "tru")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok',
  (select count(*) from retail.variantes v join retail.productos p on p.id = v.producto_id where p.referencia = '${REF}'),
  ${cant("t1", "c1", "alm_t")}, ${cant("t1", "c2", "alm_t")}, ${cant("t2", "c1", "")}, ${cant("t2", "c2", "")},
  ${cant("t1", "c1", "piso_t")});`,
  "true,4,3,2,0,0,0"
);
caso(
  "F2 · el libro: 2 entradas «carga_inicial» al almacén, firmadas por Felipe, con su nota; nada más",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 2, "''"), ":'tok1'", "tru")} as r \\gset
${COMO_POSTGRES}select string_agg(concat_ws(':', m.tipo, m.motivo, m.cantidad, m.sububicacion_id = :'alm_t', m.usuario_id = :'felipe',
    m.nota = 'Lo que ya había en tienda, cargado al crear el producto'), ',' order by m.cantidad)
  from retail.movimientos m join retail.variantes v on v.id = m.variante_id join retail.productos p on p.id = v.producto_id
  where p.referencia = '${REF}';`,
  "entrada:carga_inicial:2:t:t:t,entrada:carga_inicial:3:t:t:t"
);
caso(
  "F2 · las cantidades también se aceptan como texto (\"4\"), como las manda un formulario",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas("'4'", undefined, undefined, undefined), ":'tok1'", "tru")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${cant("t1", "c1", "alm_t")});`,
  "true,4"
);

// ===========================================================================
// F3 · Colgadas en el piso
// ===========================================================================

caso(
  "F3 · con «al piso»: quedan en el piso, el almacén en cero, UNA bajada con 2 líneas firmada por Felipe",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 2, 0), ":'tok1'", "tru", true)} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok',
  ${cant("t1", "c1", "piso_t")}, ${cant("t1", "c2", "piso_t")}, ${cant("t1", "c1", "alm_t")}, ${cant("t1", "c2", "alm_t")},
  (select count(*) from retail.bajadas_piso where token_cliente = :'tok1' and persona_id = :'felipe'),
  (select count(*) from retail.bajada_piso_items i join retail.bajadas_piso b on b.id = i.bajada_id where b.token_cliente = :'tok1'));`,
  "true,3,2,0,0,1,2"
);
caso(
  "F3 · el libro con «al piso»: entrada al almacén + traslado almacén→piso por cada prenda (Frescura ve la bajada)",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 2, 0), ":'tok1'", "tru", true)} as r \\gset
${COMO_POSTGRES}select string_agg(m.tipo || ':' || coalesce(m.motivo, ''), ',' order by m.created_at, m.tipo)
  from retail.movimientos m join retail.variantes v on v.id = m.variante_id join retail.productos p on p.id = v.producto_id
  where p.referencia = '${REF}';`,
  (l) => {
    const partes = l.at(-1).split(",").sort();
    return partes.join(",") === "entrada:carga_inicial,entrada:carga_inicial,traslado:movimiento_interno,traslado:movimiento_interno";
  }
);

// ===========================================================================
// F4 · Doble clic
// ===========================================================================

caso(
  "F4 · el mismo token dos veces: el mismo producto, y el stock NO se duplica (3, no 6)",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 2, 0), ":'tok1'", "tru")} as r1 \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${COMO_API}select ${crear(REF, celdas(3, 0, 2, 0), ":'tok1'", "tru")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'id' = (:'r2')::jsonb ->> 'id', ${CONTADORES} = :'antes', ${cant("t1", "c1", "alm_t")});`,
  "t,t,3"
);

// ===========================================================================
// F5 · Sin cantidades
// ===========================================================================

caso(
  "F5 · sin cantidades (0 o sin la clave) y sin tienda: el alta de siempre, 4 variantes y ningún movimiento",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(0, undefined, "''", "null"), ":'tok1'", null)} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok',
  (select count(*) from retail.variantes v join retail.productos p on p.id = v.producto_id where p.referencia = '${REF}'),
  (select count(*) from retail.movimientos m join retail.variantes v on v.id = m.variante_id join retail.productos p on p.id = v.producto_id where p.referencia = '${REF}'));`,
  "true,4,0"
);

// ===========================================================================
// F6 · Cantidades mal escritas
// ===========================================================================

for (const [como, valor] of [
  ["con decimales (2.5)", "2.5"],
  ["negativa (-1)", "-1"],
  ["texto («dos»)", "'dos'"],
  ["de 5 cifras (10000)", "10000"],
]) {
  caso(
    `F6 · cantidad ${como} → «Cada cantidad tiene que ser un número entero de 0 a 9999» y no se crea nada`,
    `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(valor, 1, 1, 1), ":'tok1'", "tru")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
    (l) => error(l.at(-2), "carga_cantidad_invalida") && l.at(-1) === "t"
  );
}

// ===========================================================================
// F7 · Todo o nada
// ===========================================================================

caso(
  "F7 · cantidades sin tienda → «Falta la tienda» y no se crea el producto",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 0, 0), ":'tok1'", null)};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "carga_sin_tienda") && l.at(-1) === "t"
);
caso(
  "F7 · «al piso» en el Taller (no separa piso y almacén) → falla la bajada y NO queda ni el producto ni su carga",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 0, 0), ":'tok1'", "taller", true)};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "bajada_tienda_sin_piso") && l.at(-1) === "t"
);
caso(
  "F7 · en el Taller sin «al piso»: la carga entra sin sububicación (la tienda no separa piso y almacén)",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 0, 0), ":'tok1'", "taller")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${cant("t1", "c1", null, "taller")});`,
  "true,3"
);

// ===========================================================================
// F8 · Permisos
// ===========================================================================

caso(
  "F8 · integrante con Productos, en SU tienda: crea y carga, y firma ella",
  `${soloModulos("integrante", ["productos"])}${sesion(MICAELA)}${COMO_API}select ${crear(REF, celdas(2, 0, 0, 0), ":'tok1'", "tru")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${cant("t1", "c1", "alm_t")},
  (select bool_and(m.usuario_id = :'micaela') from retail.movimientos m where m.variante_id = ${vid("t1", "c1")}));`,
  "true,2,t"
);
caso(
  "F8 · integrante con Productos, en OTRA tienda (Lima) → «Solo puedes cargar stock en la tienda donde estás» y nada",
  `${soloModulos("integrante", ["productos"])}select ${CONTADORES} as antes \\gset
${sesion(MICAELA)}${COMO_API}select ${crear(REF, celdas(2, 0, 0, 0), ":'tok1'", "lim")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "carga_sin_tienda") && l.at(-1) === "t"
);
caso(
  "F8 · integrante con Productos pero SIN «Bajada al piso», pidiendo «al piso» → rechazada por la bajada y nada",
  `${soloModulos("integrante", ["productos"])}select ${CONTADORES} as antes \\gset
${sesion(MICAELA)}${COMO_API}select ${crear(REF, celdas(2, 0, 0, 0), ":'tok1'", "tru", true)};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "bajada_sin_modulo") && l.at(-1) === "t"
);
caso(
  "F8 · integrante SIN Productos → no puede crear (candado de catálogo) y nada se escribe",
  `${soloModulos("integrante", [])}select ${CONTADORES} as antes \\gset
${sesion(MICAELA)}${COMO_API}select ${crear(REF, celdas(2, 0, 0, 0), ":'tok1'", "tru")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => json(l.at(-2)).ok === false && json(l.at(-2)).msg.startsWith("Solo un líder puede dar de alta") && l.at(-1) === "t"
);

// ===========================================================================
// F9 · Terminal y responsable
// ===========================================================================

caso(
  "F9 · TERMINAL con Productos + responsable presente: crea y carga, y firma Rosa (con la terminal)",
  `${soloModulos("terminal_administrativa", ["productos"])}${sesion(T_CAJA, { resp: "rosa" })}${COMO_API}select ${crear(REF, celdas(2, 0, 1, 0), ":'tok1'", "tru")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok',
  (select count(*) || ':' || bool_and(m.usuario_id = :'rosa') || ':' || bool_and(m.terminal_id = :'t_caja')
     from retail.movimientos m join retail.variantes v on v.id = m.variante_id join retail.productos p on p.id = v.producto_id where p.referencia = '${REF}'));`,
  "true,2:true:true"
);
caso(
  "F9 · terminal SIN responsable → 42501 «Elige quién hace esta operación» y no queda ni el producto",
  `${soloModulos("terminal_administrativa", ["productos"])}select ${CONTADORES} as antes \\gset
${sesion(T_CAJA)}${COMO_API}select ${crear(REF, celdas(2, 0, 0, 0), ":'tok1'", "tru")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "responsable_requerido", "42501") && l.at(-1) === "t"
);

// ===========================================================================
// F10 · El candado de la carga inicial (función interna, llamada como la llaman otras funciones)
// ===========================================================================

caso(
  "F10 · una prenda que YA tiene movimientos en Trujillo no admite otra carga inicial ahí; en Lima (sin historia) sí",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 0, 0), ":'tok1'", "tru")} as r \\gset
${COMO_POSTGRES}select ${vid("t1", "c1")} as v11 \\gset
select pg_temp.intento(format('select retail.fn_cargar_stock_inicial(%L, %L::jsonb)', :'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'v11', 'cantidad', 1))));
select pg_temp.intento(format('select retail.fn_cargar_stock_inicial(%L, %L::jsonb)', :'lim',
  jsonb_build_array(jsonb_build_object('variante_id', :'v11', 'cantidad', 1))));
select concat_ws(',', ${cant("t1", "c1", "alm_t")}, ${cant("t1", "c1", "alm_l", "lim")});`,
  (l) => error(l.at(-3), "carga_con_historia") && json(l.at(-2)).ok && l.at(-1) === "3,1"
);
caso(
  "F10 · la misma prenda dos veces en una carga → «Una prenda aparece dos veces» y nada",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(0, 0, 0, 0), ":'tok1'", null)} as r \\gset
${COMO_POSTGRES}select ${vid("t1", "c1")} as v11 \\gset
select pg_temp.intento(format('select retail.fn_cargar_stock_inicial(%L, %L::jsonb)', :'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'v11', 'cantidad', 1), jsonb_build_object('variante_id', :'v11', 'cantidad', 2))));
select ${cant("t1", "c1", "")};`,
  (l) => error(l.at(-2), "carga_repetida") && l.at(-1) === "0"
);

console.log(`\n${total - fallos}/${total} pruebas en verde.`);
process.exit(fallos ? 1 : 0);

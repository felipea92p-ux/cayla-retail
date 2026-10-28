#!/usr/bin/env node
/**
 * Prueba de ADR-0328 (actualización 2026-10-28) «Nuevo producto con la carga cerrada: lo que tienes entra como llegada» —
 * `crear_producto_con_llegada` (`supabase/migrations/20261028221000_alta_con_llegada.sql`).
 *
 * QUÉ CUBRE
 *   L1 forma: una sola versión con la firma del contrato; authenticated la llama y anon no; la migración no toca tablas ni políticas.
 *   L2 la llegada: el producto nace con sus 4 variantes y las cantidades entran como «recepcion» (entrada con lote) al almacén de
 *      entrada de la tienda, del proveedor elegido, firmadas; NUNCA como «carga_inicial»; la celda con 0 no entra; el costo viaja.
 *   L3 doble clic: el mismo token devuelve el mismo producto, un solo lote y las mismas unidades.
 *   L4 todo o nada: sin proveedor, sin unidades, una cantidad mal escrita, un nombre que ya existe: no queda ni producto ni lote.
 *   L5 permisos: integrante con Productos en SU tienda crea y recibe (firma ella); en OTRA tienda, nada; sin Productos, nada.
 *
 * CÓMO. Igual que `alta_con_stock_inicial.mjs`: cada caso en su transacción con ROLLBACK, sesión simulada con
 * `request.jwt.claim(s)`, y `pg_temp.crear` que devuelve el resultado o el error como JSON.
 *
 * USO
 *   pnpm pruebas:alta-con-llegada    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = "20261028221000_alta_con_llegada.sql";
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)

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
create function pg_temp.crear(p_ref text, p_variantes jsonb, p_token uuid, p_ubicacion uuid, p_proveedor uuid) returns jsonb
language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  return jsonb_build_object('ok', true, 'id', retail.crear_producto_con_llegada(
    p_ref, current_setting('prueba.cat')::uuid, p_variantes, p_ubicacion, p_proveedor, null, p_token, null, null, false, null,
    current_setting('prueba.marca')::uuid));
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
set local request.jwt.claim.sub = '${FELIPE}';
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'almacen_tienda');
select retail.fn_sububicacion_por_defecto(:'tru', 'entrada') as ent_t \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
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
select set_config('prueba.cat', :'cat', true) as _1, set_config('prueba.marca', :'marca', true) as _2 \\gset
select gen_random_uuid() as tok1 \\gset
select gen_random_uuid() as tok2 \\gset
`;

const sesion = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
`;
const COMO_API = "set local role authenticated;\n";
const COMO_POSTGRES = "reset role;\n";
const soloModulos = (clave, modulos) =>
  `${COMO_POSTGRES}update retail.roles set limitado_como_hoy = false where clave = '${clave}';
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('${clave}');\n` +
  (modulos.length
    ? `insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('${clave}'), unnest(array[${modulos.map((m) => `'${m}'`).join(", ")}]);\n`
    : "");

/** Las 4 celdas (t1/t2 × c1/c2) con sus cantidades, como las manda la pantalla. `undefined` = sin la clave. */
const celdas = (q11, q21, q12, q22) =>
  `jsonb_build_array(${[
    ["t1", "c1", q11],
    ["t2", "c1", q21],
    ["t1", "c2", q12],
    ["t2", "c2", q22],
  ]
    .map(([t, c, q]) => `jsonb_build_object('talla_id', :'${t}', 'color_codigo', :'${c}', 'precio', 59, 'costo', 20${q === undefined ? "" : `, 'cantidad', ${q}`})`)
    .join(", ")})`;
const crear = (ref, variantes, tok, ubic, prov = ":'prov'") => `pg_temp.crear('${ref}', ${variantes}, ${tok}, :'${ubic}', ${prov})`;
const REF = "Sandalia Llegada Prueba";
const vid = (t, c) =>
  `(select v.id from retail.variantes v join retail.productos p on p.id = v.producto_id
     where p.referencia = '${REF}' and v.talla_id = :'${t}' and v.color_codigo = :'${c}')`;
const enStock = (t, c, sub, ubic = "tru") =>
  `coalesce((select sum(cantidad) from retail.stock where variante_id = ${vid(t, c)} and ubicacion_id = :'${ubic}'${sub ? ` and sububicacion_id = :'${sub}'` : ""}), 0)`;
const CONTADORES = `concat_ws(',', (select count(*) from retail.productos), (select count(*) from retail.variantes), (select count(*) from retail.movimientos), (select count(*) from retail.lotes))`;

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

const FIRMA =
  "p_referencia text, p_categoria_id uuid, p_variantes jsonb, p_ubicacion_id uuid, p_proveedor_id uuid, p_descripcion text, " +
  "p_token uuid, p_tejido_id uuid, p_patron_id uuid, p_confirmo_distinto boolean, p_etiqueta_ids uuid[], p_marca_id uuid, " +
  "p_temporada text, p_empresa_id uuid";
const REGPROC = "retail.crear_producto_con_llegada(text, uuid, jsonb, uuid, uuid, text, uuid, uuid, uuid, boolean, uuid[], uuid, text, uuid)";

// ===========================================================================
// L1 · Forma
// ===========================================================================

caso(
  "L1 · una sola versión, con la firma del contrato",
  `select count(*) || '|' || string_agg(pg_get_function_identity_arguments(oid), ';') from pg_proc
    where pronamespace = 'retail'::regnamespace and proname = 'crear_producto_con_llegada';`,
  `1|${FIRMA}`
);
caso(
  "L1 · authenticated la llama y anon no",
  `select concat_ws(',', has_function_privilege('authenticated', '${REGPROC}', 'execute'), has_function_privilege('anon', '${REGPROC}', 'execute'));`,
  "t,f"
);
{
  const sql = readFileSync(join(RAIZ, "supabase", "migrations", MIGRACION), "utf8").replace(/--[^\n]*/g, "");
  const prohibido = /\b(drop|create)\s+trigger\b|\b(create|drop|alter)\s+policy\b|\balter\s+table\b|\bdrop\s+function\b/i;
  esperar("L1 · la migración no toca tablas, políticas, disparadores ni borra funciones (ADR-0195)", !prohibido.test(sql), sql.match(prohibido)?.[0]);
  esperar("L1 · todo bajo `set search_path` (CLAUDE.md)", /set search_path = retail, public, extensions;/.test(sql));
}

// ===========================================================================
// L2 · La llegada
// ===========================================================================

caso(
  "L2 · líder en Trujillo: 4 variantes; 3 y 2 entran al almacén de entrada; la celda con 0 y la vacía no",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 2, "''"), ":'tok1'", "tru")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok',
  (select count(*) from retail.variantes v join retail.productos p on p.id = v.producto_id where p.referencia = '${REF}'),
  ${enStock("t1", "c1", "ent_t")}, ${enStock("t1", "c2", "ent_t")}, ${enStock("t2", "c1")}, ${enStock("t2", "c2")});`,
  "true,4,3,2,0,0"
);
caso(
  "L2 · el libro: 2 entradas «recepcion» con UN lote del proveedor, firmadas por Felipe; ni una «carga_inicial»",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 2, "''"), ":'tok1'", "tru")} as r \\gset
${COMO_POSTGRES}select concat_ws(',',
  (select string_agg(m.tipo || ':' || m.motivo || ':' || m.cantidad || ':' || (m.usuario_id = :'felipe'), ';' order by m.cantidad)
     from retail.movimientos m join retail.variantes v on v.id = m.variante_id join retail.productos p on p.id = v.producto_id
    where p.referencia = '${REF}'),
  (select count(distinct m.lote_id) from retail.movimientos m join retail.variantes v on v.id = m.variante_id
     join retail.productos p on p.id = v.producto_id where p.referencia = '${REF}'),
  (select l.proveedor_id = :'prov' and l.recibido_por = :'felipe' and l.nota like 'Llegó con el alta%' and l.ubicacion_id = :'tru'
     from retail.lotes l where l.id = (select m.lote_id from retail.movimientos m where m.variante_id = ${vid("t1", "c1")} limit 1)));`,
  "entrada:recepcion:2:true;entrada:recepcion:3:true,1,t"
);
caso(
  "L2 · el producto queda con su proveedor y su marca, y el costo de la variante sigue en 20",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 0, 0), ":'tok1'", "tru")} as r \\gset
${COMO_POSTGRES}select concat_ws(',',
  (select p.proveedor_id = :'prov' and p.marca_id = :'marca' from retail.productos p where p.referencia = '${REF}'),
  (select v.costo from retail.variantes v where v.id = ${vid("t1", "c1")}));`,
  (l) => /^t,20(\.0+)?$/.test(l.at(-1))
);

// ===========================================================================
// L3 · Doble clic
// ===========================================================================

caso(
  "L3 · el mismo token dos veces: el mismo producto, un solo lote, 3 unidades (no 6)",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 0, 0), ":'tok1'", "tru")} as a \\gset
select ${crear(REF, celdas(3, 0, 0, 0), ":'tok1'", "tru")} as b \\gset
${COMO_POSTGRES}select concat_ws(',', (:'a')::jsonb ->> 'id' = (:'b')::jsonb ->> 'id', ${enStock("t1", "c1")},
  (select count(*) from retail.lotes l where l.nota like 'Llegó con el alta%'
     and exists (select 1 from retail.movimientos m where m.lote_id = l.id and m.variante_id = ${vid("t1", "c1")})));`,
  "t,3,1"
);

// ===========================================================================
// L4 · Todo o nada
// ===========================================================================

caso(
  "L4 · sin proveedor → «Elige el proveedor» y no se crea nada",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 0, 0), ":'tok1'", "tru", "null")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "llegada_sin_proveedor") && l.at(-1) === "t"
);
caso(
  "L4 · sin ni una unidad → «Escribe cuántas llegaron» y no se crea nada",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(0, 0, "''", undefined), ":'tok1'", "tru")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "llegada_sin_unidades") && l.at(-1) === "t"
);
caso(
  "L4 · una cantidad con decimales → «Cada cantidad…» y no se crea nada",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas("2.5", 1, 0, 0), ":'tok1'", "tru")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "carga_cantidad_invalida") && l.at(-1) === "t"
);
caso(
  "L4 · un nombre que ya existe (otro token) → el segundo no crea producto ni lote",
  `${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(3, 0, 0, 0), ":'tok1'", "tru")} as a \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${crear(REF, celdas(1, 0, 0, 0), ":'tok2'", "tru")} as b \\gset
${COMO_POSTGRES}select concat_ws(',', (:'b')::jsonb ->> 'ok', ${CONTADORES} = :'antes', ${enStock("t1", "c1")});`,
  "false,t,3"
);

// ===========================================================================
// L5 · Permisos
// ===========================================================================

caso(
  "L5 · integrante con Productos, en SU tienda: crea y recibe, y firma ella",
  `${soloModulos("integrante", ["productos"])}${sesion(MICAELA)}${COMO_API}select ${crear(REF, celdas(2, 0, 0, 0), ":'tok1'", "tru")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${enStock("t1", "c1")},
  (select bool_and(m.usuario_id = :'micaela') from retail.movimientos m where m.variante_id = ${vid("t1", "c1")}));`,
  "true,2,t"
);
caso(
  "L5 · integrante con Productos, en OTRA tienda (Lima) → «No tienes permiso para recibir» y nada",
  `${soloModulos("integrante", ["productos"])}select ${CONTADORES} as antes \\gset
${sesion(MICAELA)}${COMO_API}select ${crear(REF, celdas(2, 0, 0, 0), ":'tok1'", "lim")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "llegada_sin_permiso") && l.at(-1) === "t"
);
caso(
  "L5 · integrante SIN Productos → no crea (candado de catálogo) y nada se escribe",
  `${soloModulos("integrante", [])}select ${CONTADORES} as antes \\gset
${sesion(MICAELA)}${COMO_API}select ${crear(REF, celdas(2, 0, 0, 0), ":'tok1'", "tru")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => json(l.at(-2)).ok === false && l.at(-1) === "t"
);

console.log(`\n${total - fallos}/${total} pruebas en verde.`);
process.exit(fallos ? 1 : 0);

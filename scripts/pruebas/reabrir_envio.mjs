#!/usr/bin/env node
/**
 * Pruebas de reabrir un envío ya recibido (ADR-0393, actividad 4; decisión 5 de Felipe, 2026-10-13) — migración
 * `20261013180000_reabrir_envio.sql` (y las de las actividades 2 y 3, que escriben lo que esta lee).
 *
 * LO QUE VIGILA. Que una sede pueda reabrir lo que cerró para cuadrarlo («encontramos las 2 que faltaban») mientras Compras no haya
 * resuelto lo que faltó: lo que faltó o sobró deja de valer (sale de «Nos debe») sin borrarse, lo pendiente vuelve al borrador, lo que ya
 * entró al stock no se toca ni se mete dos veces, y queda el rastro de cada cierre y reapertura. Que reabrir y resolver una deuda a la
 * vez se pongan en fila. Que la base no deje contar menos de lo que ya entró, aunque se escriba a mano.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK, con los candados diferidos revisados al final; las migraciones se cargan DOS
 * veces dentro de cada caso). Las personas son las de `pendientes_de_envio.mjs`.
 *   A  REABRIR: cuadrar un faltante; lo pendiente vuelve al borrador; el freno de Compras (deuda resuelta, reposición que saldó otra);
 *      lo contado no baja de lo que entró; permisos y estados; el doble clic; «Nos debe» y el detalle leen lo que vale; el rastro.
 *   F  LA FORMA: permisos, RLS y que ninguna función lea la tabla de diferencias sin filtrar.
 *   D  DOS SESIONES REALES (COMMIT; solo en un banco propio o en el CI): reabrir y resolver la deuda a la vez, en los dos órdenes.
 *
 * USO
 *   node scripts/pruebas/reabrir_envio.mjs                                → contra el stack local compartido (sin los casos D)
 *   node scripts/pruebas/reabrir_envio.mjs --contenedor supabase_db_x     → contra otro stack (un banco de pruebas propio)
 *   node scripts/pruebas/reabrir_envio.mjs --sin-migracion                → sin cargar las migraciones: tiene que FALLAR
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const COMPARTIDO = "supabase_db_cayla-retail";
const CONTENEDOR = arg("--contenedor", COMPARTIDO);
// Los casos de dos sesiones hacen COMMIT (y lo deshacen al final): nunca en la base local compartida, donde trabajan otras sesiones.
const DOS_SESIONES = Boolean(process.env.CI) || CONTENEDOR !== COMPARTIDO || process.argv.includes("--dos-sesiones");
const BASE = arg("--base", "postgres");
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
const MIGRACIONES = SIN_MIGRACION
  ? ""
  : [
      "20261013170000_recepcion_un_solo_camino_de_cierre.sql",
      "20261013171000_conteo_de_envio.sql",
      "20261013172000_cerrar_conteo_con_pendientes.sql",
      "20261013173000_resolver_pendiente_de_envio.sql",
      // ADR-0393: reabrir un envío recibido; «Nos debe» lee lo que vale.
      "20261013180000_reabrir_envio.sql",
    ]
      .map((f) =>
        readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8")
          .replace(/^set lock_timeout.*$/m, "")
          .replace(/^reset lock_timeout;$/m, ""),
      )
      .join("\n");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const SANDRA = "22222222-2222-4222-8222-000000000005";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psqlAsync(sql) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS_PSQL, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - inicio }));
    p.stdin.write(sql);
    p.stdin.end();
  });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
const como = (auth) =>
  `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;
// Micaela elige en el combo «Responsable» a ella misma, en Trujillo (marcó su entrada en el preludio).
const EN_TIENDA = `select set_config('request.headers', json_build_object('x-responsable', :'micaela_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null\n`;
const SIN_ENCABEZADOS = `select set_config('request.headers', '', true) \\g /dev/null\n`;

// Cada llamada devuelve su respuesta (jsonb) o {error, hint, msg, detail}.
const atrapa = (nombre, firma, llamada) => `
create function pg_temp.${nombre}(${firma}) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_detail text;
begin
  return (${llamada})::jsonb;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint, v_detail = pg_exception_detail;
  return jsonb_build_object('error', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg, 'detail', nullif(v_detail, ''));
end;
$f$;
grant execute on function pg_temp.${nombre}(${firma.replace(/p_\w+ /g, "")}) to authenticated;`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
${MIGRACIONES}
${MIGRACIONES}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
-- «OK» si respondió, o «sqlstate|hint|mensaje» si falló.
create function pg_temp.e(p jsonb) returns text language sql as $f$
  select case when p ? 'error' then (p ->> 'error') || '|' || coalesce(p ->> 'hint', '') || '|' || (p ->> 'msg') else 'OK' end;
$f$;
grant execute on function pg_temp.e(jsonb) to authenticated;
-- Solo la pista de un error (o «OK»): para las listas largas de rechazos.
create function pg_temp.h(p jsonb) returns text language sql as $f$
  select case when p ? 'error' then coalesce(p ->> 'hint', p ->> 'error') else 'OK' end;
$f$;
grant execute on function pg_temp.h(jsonb) to authenticated;
${atrapa("abre", "p_id uuid, p_version integer", "retail.abrir_despacho(p_id, p_version)")}
${atrapa(
  "prepara",
  "p_d uuid, p_item uuid, p_cat uuid, p_marca uuid, p_prod uuid, p_ref text, p_vars jsonb, p_precio numeric, p_desc text, p_tej uuid, p_pat uuid, p_conf boolean, p_token uuid, p_prov uuid",
  "retail.preparar_prenda_al_recibir(p_d, p_item, p_cat, p_marca, p_prod, p_ref, p_vars, p_precio, p_desc, p_tej, p_pat, p_conf, p_token, p_prov)",
)}
${atrapa(
  "recibe",
  "p_id uuid, p_version integer, p_lineas jsonb, p_extras jsonb, p_nota text, p_token uuid",
  "retail.recibir_despacho(p_id, p_version, p_lineas, p_extras, p_nota, p_token)",
)}
${atrapa(
  "guarda",
  "p_d uuid, p_item uuid, p_cont integer, p_sep jsonb, p_ver integer, p_extra integer, p_prov uuid, p_cat uuid, p_marca uuid",
  "retail.guardar_conteo_envio(p_d, p_item, p_cont, p_sep, p_ver, p_extra, p_prov, p_cat, p_marca)",
)}
${atrapa("conteos", "p_d uuid", "retail.fn_envio_conteos(p_d)")}
${atrapa(
  "cierra",
  "p_d uuid, p_version integer, p_lineas jsonb, p_nota text, p_token uuid",
  "retail.cerrar_conteo_envio(p_d, p_version, p_lineas, p_nota, p_token)",
)}
${atrapa(
  "resuelve",
  "p_d uuid, p_item uuid, p_extra integer, p_pend uuid, p_sep jsonb, p_conf boolean, p_token uuid",
  "retail.resolver_pendiente_envio(p_d, p_item, p_extra, p_pend, p_sep, p_conf, p_token)",
)}
${atrapa("pendientes", "p_u uuid", "retail.fn_recepcion_pendientes(p_u)")}
${atrapa("reabre", "p_d uuid, p_version integer, p_motivo text, p_token uuid", "retail.reabrir_envio(p_d, p_version, p_motivo, p_token)")}
${atrapa(
  "salda",
  "p_dif uuid, p_forma text, p_cantidad integer, p_nota text, p_token uuid",
  "retail.resolver_deuda_proveedor(p_dif, p_forma, p_cantidad, p_nota, p_token)",
)}
${atrapa("detalle", "p_d uuid", "retail.fn_envio_detalle(p_d)")}

-- Datos propios de la prueba, creados como Felipe (líder): la prenda de catálogo nace aprobada.
select set_config('request.jwt.claim.sub', '${FELIPE}', true) \\g /dev/null
select set_config('request.jwt.claims', '{"sub":"${FELIPE}","role":"authenticated"}', true) \\g /dev/null
insert into retail.proveedores (nombre) values ('Proveedor Conteo Prueba') returning id as prov \\gset
insert into retail.proveedores (nombre) values ('Proveedor Conteo Dos') returning id as prov2 \\gset
insert into retail.marcas (nombre) values ('Marca Conteo Prueba') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('Chompas Conteo', 'accesorios') returning id as cat \\gset
insert into retail.categorias (nombre, familia) values ('Gorros Conteo', 'accesorios') returning id as cat2 \\gset
insert into retail.categorias (nombre, familia, activo) values ('Bufandas Conteo Inactiva', 'accesorios', false) returning id as cat_off \\gset
select id as t_s from retail.tallas where valor = 'S' \\gset
select id as t_m from retail.tallas where valor = 'M' \\gset
select id as t_l from retail.tallas where valor = 'L' \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat', :'t_s'), (:'cat', :'t_m'), (:'cat', :'t_l'), (:'cat2', :'t_s');
select codigo as c1 from retail.colores where activo order by orden, codigo limit 1 \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select p.id as sandra_p from public.personas p where p.auth_user_id = '${SANDRA}' \\gset
select nullif(btrim(concat_ws(' ', nombres, apellidos)), '') as micaela_n from public.personas where id = :'micaela_p' \\gset
select nullif(btrim(concat_ws(' ', nombres, apellidos)), '') as sandra_n from public.personas where id = :'sandra_p' \\gset
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
-- Como en producción: el responsable obligatorio encendido; Micaela marcó su entrada en Trujillo.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values (:'micaela_p', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
-- Una prenda del catálogo de esa categoría y marca (talla S activa, L inactiva) y una de otra categoría.
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov');
insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat', 'Chompa Catálogo Conteo', :'marca', :'prov')
  returning id as prod_p \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo) values (:'prod_p', :'t_s', :'c1', 79.90, 25)
  returning id as pv_s \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo, activo) values (:'prod_p', :'t_l', :'c1', 79.90, 25, false)
  returning id as pv_l \\gset
insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat2', 'Gorro Conteo', :'marca', :'prov')
  returning id as prod_g \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo) values (:'prod_g', :'t_s', :'c1', 39.90, 12)
  returning id as pg_s \\gset
-- O1 directo a Trujillo (prov), la hace Felipe: l1 = 10 «Chompa cuello alto» a S/ 30; l2 = 4 a S/ 50.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, fecha_entrega_estimada, creada_por)
  values (:'prov', :'tru', retail.fn_hoy_lima() + 7, :'felipe_p') returning id as o1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario)
  values (:'o1', 1, :'cat', :'marca', 'Chompa cuello alto', 10, 30) returning id as l1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o1', 2, :'cat', :'marca', 4, 50) returning id as l2 \\gset
-- O2 directo a Lima, de prov2.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov2', :'lim', :'felipe_p')
  returning id as o2 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o2', 1, :'cat', :'marca', 6, 20) returning id as l_o2 \\gset
-- O3 directo a Trujillo, la hace Micaela.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'micaela_p')
  returning id as o3 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o3', 1, :'cat', :'marca', 3, 30) returning id as l_o3 \\gset
select set_config('request.jwt.claim.sub', '', true) \\g /dev/null
select set_config('request.jwt.claims', '', true) \\g /dev/null
`;

// Micaela con un rol de prueba (sin clave, como los roles a medida) que ve SOLO esos módulos. Se va con el ROLLBACK.
const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba conteo ' || substr(md5(random()::text), 1, 8)) returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
`;
const MICAELA_RECIBE = `${rolDeMicaela("recibir")}${como(MICAELA)}${EN_TIENDA}`;

// SQL de jsonb.
const J = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const A = (...xs) => `jsonb_build_array(${xs.join(", ")})`;
const V = (v, cantidad, danadas = 0, sol = null) =>
  J({ variante_id: `:'${v}'`, cantidad, danadas, danada_solucion: sol ? `'${sol}'` : "null::text" });
const LIN = (di, vars, { falt = null } = {}) =>
  J({
    despacho_item_id: `:'${di}'`,
    costo_unitario: "null::numeric",
    confirma_costo: "false",
    variantes: A(...vars),
    faltante_causa: falt ? `'${falt}'` : "null::text",
    sobrante_causa: "null::text",
  });
const MATRIZ = (...pares) => A(...pares.map(([t, c]) => J({ talla_id: `:'${t}'`, color_codigo: `:'${c}'` })));
// Lo separado: prendas [producto, cantidad, variantes?] y nuevas [cantidad, descripción?].
const SEP = (prendas = [], nuevas = []) =>
  J({
    prendas: A(...prendas.map(([p, n, vars]) => J({ producto_id: `:'${p}'`, cantidad: n, ...(vars ? { variantes: A(...vars) } : {}) }))),
    nuevas: A(...nuevas.map(([n, d]) => J({ cantidad: n, ...(d ? { descripcion: `'${d}'` } : {}) }))),
  });
const VACIO = "'{}'::jsonb";

// Felipe (líder, Admin: firma él sin combo) envía, y la versión queda en :v_<nombre>. `lineas`: [[orden_compra_item, cantidad]].
const ENVIA = (nombre, lineas, { sede = ":'tru'" } = {}) => `
${como(FELIPE)}${SIN_ENCABEZADOS}
select (retail.crear_envio(${sede}, ${A(...lineas.map(([l, n]) => J({ orden_compra_item_id: `:'${l}'`, cantidad: n })))}, 'T001-88', null, null) ->> 'despacho_id') as ${nombre} \\gset
reset role;
select version as v_${nombre} from retail.despachos where id = :'${nombre}' \\gset
`;
const ITEM = (envio, l) => `select id as di_${l} from retail.despacho_items where despacho_id = :'${envio}' and orden_compra_item_id = :'${l}' \\gset\n`;
const ABRE = (envio) => `select pg_temp.abre(:'${envio}', :v_${envio}) as ab_${envio} \\gset
select (:'ab_${envio}'::jsonb ->> 'version')::int as v_${envio} \\gset
`;
// La prenda nueva de la línea l1 (tallas S y M en el color c1): su producto en :prod_n y sus variantes en :v_s y :v_m.
const PRENDA_NUEVA = (envio) => `
select pg_temp.prepara(:'${envio}', :'di_l1', null, null, null, 'Chompa Trenzada Conteo', ${MATRIZ(["t_s", "c1"], ["t_m", "c1"])}, 89.90, null, null, null, false, gen_random_uuid(), null) as prep \\gset
select (x ->> 'id') as v_s from jsonb_array_elements(:'prep'::jsonb -> 'variantes') x where x ->> 'talla' = 'S' \\gset
select (x ->> 'id') as v_m from jsonb_array_elements(:'prep'::jsonb -> 'variantes') x where x ->> 'talla' = 'M' \\gset
select producto_id as prod_n from retail.variantes where id = :'v_s' \\gset
`;
// El escenario de casi todos los casos: el envío d1 (l1 = 10 y l2 = 4) a Trujillo, abierto por Micaela, con la prenda nueva en l1.
const BASE_D1 = `${ENVIA("d1", [["l1", 10], ["l2", 4]])}${ITEM("d1", "l1")}${ITEM("d1", "l2")}${MICAELA_RECIBE}${ABRE("d1")}${PRENDA_NUEVA("d1")}`;
const GUARDA = (envio, item, contadas, sep = VACIO, version = "null::int", { extra = "null::int", prov = "null::uuid", cat = "null::uuid", marca = "null::uuid" } = {}) =>
  `pg_temp.guarda(:'${envio}', ${item ? `:'${item}'` : "null::uuid"}, ${contadas}, ${sep}, ${version}, ${extra}, ${prov}, ${cat}, ${marca})`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nset constraints all immediate;\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => /ERROR|DETAIL|HINT|CONTEXT|LINE/.test(l)).slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}


// El stock de una variante en Trujillo, en todas sus sububicaciones.
const STOCK_TRU = (v) => `coalesce((select sum(s.cantidad) from retail.stock s where s.variante_id = :'${v}' and s.ubicacion_id = :'tru'), 0)`;
// Felipe registra el papel (una boleta) de la O1: [[línea, cantidad, costo]]. Su compra queda en :<nombre>.
const PAPEL_O1 = (nombre, numero, lineas) => `
${como(FELIPE)}${SIN_ENCABEZADOS}
select (retail.registrar_comprobante_orden(:'o1', 'boleta', 'B077', '${numero}',
  ${A(...lineas.map(([l, n, c]) => J({ orden_compra_item_id: `:'${l}'`, cantidad: n, costo_unitario: c })))},
  null, 'credito', retail.fn_hoy_lima() + 30, true, null, null, null, null) ->> 'compra_id') as ${nombre} \\gset
reset role;
`;

// Las versiones de los conteos que «vio» quien cierra: :k_<línea> (y :k_x<posición> para lo de fuera de la guía). Vuelve como Micaela.
const VERS = (envio, items = [], extras = []) => `
reset role;
${items.map((i) => `select version as k_${i} from retail.despacho_conteos where despacho_id = :'${envio}' and despacho_item_id = :'di_${i}' \\gset`).join("\n")}
${extras.map((x) => `select version as k_x${x} from retail.despacho_conteos where despacho_id = :'${envio}' and extra_posicion = ${x} \\gset`).join("\n")}
${como(MICAELA)}${EN_TIENDA}`;
// Lo que decide quien cierra por un conteo: [línea | {extra}], con la versión que vio y, si hace falta, costo, causas y nota.
const DEC = (item, { costo = null, confirma = false, falt = null, sobr = null, nota = null, version = null } = {}) =>
  J({
    ...(typeof item === "number" ? { extra_posicion: item } : { despacho_item_id: `:'di_${item}'` }),
    version: version ?? (typeof item === "number" ? `:k_x${item}` : `:k_${item}`),
    costo_unitario: costo === null ? "null::numeric" : `${costo}`,
    confirma_costo: confirma ? "true" : "false",
    faltante_causa: falt ? `'${falt}'` : "null::text",
    sobrante_causa: sobr ? `'${sobr}'` : "null::text",
    nota: nota ? `'${nota}'` : "null::text",
  });
const CIERRA = (envio, decs, { nota = "null::text", token = "null::uuid", version = null } = {}) =>
  `pg_temp.cierra(:'${envio}', ${version ?? `:v_${envio}`}, ${A(...decs)}, ${nota}, ${token})`;
const RESUELVE = (envio, item, pendiente, sep, { confirma = false, token = "null::uuid" } = {}) =>
  `pg_temp.resuelve(:'${envio}', ${typeof item === "number" ? "null::uuid" : `:'di_${item}'`}, ${typeof item === "number" ? item : "null::int"}, ` +
  `${pendiente ? `:'${pendiente}'` : "null::uuid"}, ${sep}, ${confirma ? "true" : "false"}, ${token})`;
// Las cuentas de una línea, leídas como postgres: contadas:en_stock:en_pendientes:sin_separar.
const CUENTAS = (envio, item) =>
  `(select concat_ws(':', c.contadas, c.en_stock, c.en_pendientes, c.sin_separar) from retail.fn_envio_cuentas(array[:'${envio}'::uuid]) c ` +
  `where c.despacho_item_id = :'di_${item}')`;
const limpio = (expr) => `regexp_replace(${expr}, 'ENV-[0-9]{6}', 'ENV', 'g')`;
// El escenario del cierre con pendientes, sobre BASE_D1: l1 contadas 10 = 4 con tallas (3 S y 1 M de la nueva) + 3 «Chompa Catálogo»
// sin tallas + 2 nuevas + 1 sin separar; l2 contadas 2 de 4 («no vino»), nada separado. Quien cierra: Micaela.
const CIERRE_CON_PENDIENTES = `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_n", 4, [V("v_s", 3), V("v_m", 1)]], ["prod_p", 3]], [[2, "Chompa con capucha"]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 2)} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   select ${CIERRA("d1", [DEC("l1"), DEC("l2", { falt: "no_vino" })], { nota: "'Un fardo'" })} as cierre \\gset
   reset role;
   select id as pend_det from retail.despacho_pendientes where despacho_id = :'d1' and tipo = 'detalle' \\gset
   select id as pend_new from retail.despacho_pendientes where despacho_id = :'d1' and tipo = 'crear' \\gset
   ${como(MICAELA)}${EN_TIENDA}`;


// La versión del envío después de un cierre o una reapertura (los dos la suben): :v_<envío>. Vuelve como Micaela.
const VER = (envio) => `
reset role;
select version as v_${envio} from retail.despachos where id = :'${envio}' \\gset
${como(MICAELA)}${EN_TIENDA}`;
const REABRE = (envio, motivo, { token = "null::uuid", version = null } = {}) =>
  `pg_temp.reabre(:'${envio}', ${version ?? `:v_${envio}`}, ${motivo === null ? "null::text" : `'${motivo}'`}, ${token})`;
// Lo que el proveedor de la prueba todavía debe de Chompas Conteo · Marca Conteo Prueba (leído como postgres).
const DEBE = `retail.fn_nos_debe_pendiente(:'prov', :'cat', :'marca', null)`;
const VIGENTES = (envio) => `(select count(*) from retail.despacho_diferencias where despacho_id = :'${envio}' and vigente)`;
const TODAS = (envio) => `(select count(*) from retail.despacho_diferencias where despacho_id = :'${envio}')`;
// El escenario de reabrir: d1 cerrado con l1 = 10 (todo con tallas) y l2 = 2 de 4 (con tallas), «no vino» lo que faltó: el proveedor debe 2.
const CON_FALTANTE = `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_n", 10, [V("v_s", 6), V("v_m", 4)]]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 2, SEP([["prod_p", 2, [V("pv_s", 2)]]]))} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   select ${CIERRA("d1", [DEC("l1"), DEC("l2", { falt: "no_vino" })])} \\g /dev/null
   reset role;
   select id as dif from retail.despacho_diferencias where despacho_id = :'d1' \\gset
   ${VER("d1")}`;

// A. REABRIR PARA CUADRAR -------------------------------------------------------------------------------------------------
caso(
  "A1 reabrir para cuadrar: lo que faltó sale de «Nos debe» (no se borra), lo que entró queda; al contar las 2 y cerrar, cuadra y queda el rastro",
  `${CON_FALTANTE}
   reset role;
   select ${DEBE} as debe0 \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select ${REABRE("d1", "Encontramos las 2 que faltaban")} as r \\gset
   reset role;
   select concat_ws(':', (select estado from retail.despachos where id = :'d1'), ${VIGENTES("d1")}, ${TODAS("d1")}, ${DEBE},
                    ${STOCK_TRU("pv_s")}) as tras \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select ${GUARDA("d1", "di_l2", 4, SEP([["prod_p", 2, [V("pv_s", 2)]]]))} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   ${VER("d1")}
   select ${CIERRA("d1", [DEC("l1"), DEC("l2")])} as c2 \\gset
   reset role;
   select concat_ws(' / ', :debe0, :'r'::jsonb ->> 'estado', :'tras',
     concat_ws(':', :'c2'::jsonb ->> 'unidades', :'c2'::jsonb ->> 'faltan', (select estado from retail.despachos where id = :'d1'),
               ${VIGENTES("d1")}, ${TODAS("d1")}, ${DEBE}, ${STOCK_TRU("pv_s")}),
     (select string_agg(c.tipo || coalesce(':' || c.motivo, '') || coalesce(':faltan=' || (c.resultado ->> 'faltan'), ''), ' > ' order by c.hecho_en, c.id)
        from retail.despacho_cierres c where c.despacho_id = :'d1'),
     (select ${limpio("a.descripcion")} from retail.actividad a where a.registro_id = :'d1'::text and a.accion = 'despacho_reabierto'));`,
  "2 / abierto / abierto:0:1:0:2 / 14:0:cerrado:0:1:0:4 / cierre:faltan=2 > reapertura:Encontramos las 2 que faltaban > cierre:faltan=0 / " +
    "reabrió ENV: Encontramos las 2 que faltaban",
);
caso(
  "A2 lo pendiente vuelve al borrador de su línea (lo que todavía no entró); lo que entró no se toca; al cerrar de nuevo vuelve a quedar pendiente",
  `${CIERRE_CON_PENDIENTES}
   select ${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 1, [V("pv_s", 1)]]]))} \\g /dev/null
   ${VER("d1")}
   select ${REABRE("d1", "Faltaba revisar las bolsas")} as r \\gset
   select pg_temp.conteos(:'d1') as c \\gset
   reset role;
   select (select x from jsonb_array_elements(:'c'::jsonb -> 'conteos') x where x ->> 'despacho_item_id' = :'di_l1') as l1 \\gset
   select concat_ws(':', (select string_agg(estado, ',' order by estado) from retail.despacho_pendientes where despacho_id = :'d1'),
                    :'l1'::jsonb ->> 'en_stock', :'l1'::jsonb ->> 'sin_separar', :'l1'::jsonb ->> 'separadas',
                    (select string_agg(p ->> 'nombre' || '=' || (p ->> 'cantidad') || ':' || coalesce(p ->> 'variantes', 'sin tallas'), ',')
                       from jsonb_array_elements(:'l1'::jsonb -> 'separado' -> 'prendas') p),
                    (select string_agg((n ->> 'cantidad') || '=' || (n ->> 'descripcion'), ',') from jsonb_array_elements(:'l1'::jsonb -> 'separado' -> 'nuevas') n)) as tras \\gset
   ${VERS("d1", ["l1", "l2"])}
   ${VER("d1")}
   select ${CIERRA("d1", [DEC("l1"), DEC("l2", { falt: "no_vino" })])} as c2 \\gset
   reset role;
   select concat_ws(' / ', :'r'::jsonb ->> 'pendientes_vueltos', :'tras',
     concat_ws(':', :'c2'::jsonb ->> 'unidades', :'c2'::jsonb ->> 'por_detallar', :'c2'::jsonb ->> 'faltan', ${VIGENTES("d1")}, ${TODAS("d1")}),
     (select string_agg(x.tipo || '=' || x.cantidad, ',' order by x.tipo desc) from retail.despacho_pendientes x
       where x.despacho_id = :'d1' and x.estado = 'pendiente'),
     ${CUENTAS("d1", "l1")});`,
  "2 / anulado,anulado:5:1:4:Chompa Catálogo Conteo=2:sin tallas:2=Chompa con capucha / 5:7:2:1:2 / detalle=2,crear=2 / 10:5:4:1",
);
caso(
  "A3 no se reabre si Compras ya resolvió lo que faltó, ni si lo de más de un envío ya saldó lo que el proveedor debía de otro",
  `${CON_FALTANTE}
   reset role;
   insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'felipe_p') returning id as o5 \\gset
   insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
     values (:'o5', 1, :'cat', :'marca', 3, 30) returning id as l5 \\gset
   ${ENVIA("d2", [["l5", 3]])}${ITEM("d2", "l5")}
   ${como(MICAELA)}${EN_TIENDA}${ABRE("d2")}
   select ${GUARDA("d2", "di_l5", 5, SEP([["prod_p", 5, [V("pv_s", 5)]]]))} \\g /dev/null
   ${VERS("d2", ["l5"])}
   select pg_temp.e(${CIERRA("d2", [DEC("l5", { sobr: "reposicion_faltante", confirma: true })])}) as cierra_d2 \\gset
   ${VER("d1")}
   ${VER("d2")}
   select pg_temp.e(${REABRE("d1", "Encontramos dos")}) as r1 \\gset
   select pg_temp.e(${REABRE("d2", "Contamos mal")}) as r2 \\gset
   select pg_temp.conteos(:'d1') as c1 \\gset
   reset role;
   select concat_ws(' / ', :'cierra_d2', :'r1', :'r2', :'c1'::jsonb -> 'reabrir' ->> 'se_puede', :'c1'::jsonb -> 'reabrir' ->> 'por_que_no',
     (select estado from retail.despachos where id = :'d1'), ${DEBE});`,
  (o) =>
    /^OK \/ P0001\|reabrir_deuda_resuelta\|Compras ya resolvió parte de lo que faltó en ENV-\d{6}: ya no se reabre \/ P0001\|reabrir_reposicion_saldo\|Lo de más de ENV-\d{6} ya saldó lo que el proveedor debía de otro envío: ya no se reabre \/ false \/ reabrir_deuda_resuelta \/ cerrado \/ 0$/.test(o),
);
caso(
  "A4 con el envío reabierto, lo contado no baja de lo que entró y lo separado es lo que falta; aunque se escriba a mano, la base no deja",
  `${CON_FALTANTE}
   select ${REABRE("d1", "Revisar")} \\g /dev/null
   select concat_ws(' / ',
     pg_temp.e(${GUARDA("d1", "di_l1", 8)}),
     pg_temp.e(${GUARDA("d1", "di_l2", 3, SEP([["prod_p", 2, [V("pv_s", 2)]]]))}),
     pg_temp.e(${GUARDA("d1", "di_l2", 3, SEP([["prod_p", 1, [V("pv_s", 1)]]]))})) as g \\gset
   reset role;
   select concat_ws(' / ', :'g',
     pg_temp.intento($q$update retail.despacho_conteos set contadas = 5 where despacho_item_id = '$q$ || :'di_l1' || $q$';
                        set constraints all immediate$q$));`,
  (o) =>
    /^P0001\|conteo_menos_que_stock\|De Chompas Conteo · Marca Conteo Prueba · Chompa cuello alto ya entraron 10 al stock: lo contado no puede ser menos \/ P0001\|conteo_separado_de_mas\|De Chompas Conteo · Marca Conteo Prueba ya entraron 2 al stock y separaste 2: queda 1 por separar \/ OK \/ 23514\|En una línea de ENV-\d{6} lo que entró al stock \(10\) y lo pendiente \(0\) pasan de lo contado \(5\): recarga la pantalla$/.test(o),
);
caso(
  "A5 motivo obligatorio, versión vieja, quien compró, sin Recibir, ya abierto; el formulario de la fase 4 no cierra un envío reabierto",
  `${CON_FALTANTE}
   select pg_temp.h(${REABRE("d1", "")}) as sin_motivo \\gset
   select pg_temp.h(${REABRE("d1", "Revisar", { version: ":v_d1 - 1" })}) as vieja \\gset
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select pg_temp.h(${REABRE("d1", "Revisar")}) as compro \\gset
   ${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select pg_temp.h(${REABRE("d1", "Revisar")}) as sin_modulo \\gset
   ${rolDeMicaela("recibir")}${como(MICAELA)}${EN_TIENDA}
   select ${REABRE("d1", "Revisar")} \\g /dev/null
   ${VER("d1")}
   select pg_temp.h(${REABRE("d1", "Otra vez")}) as abierto \\gset
   select pg_temp.e(pg_temp.recibe(:'d1', :v_d1, ${A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)]))}, '[]'::jsonb, null, null)) as fase4 \\gset
   select concat_ws(' / ', :'sin_motivo', :'vieja', :'compro', :'sin_modulo', :'abierto', :'fase4');`,
  "reabrir_motivo / version_cambiada / recibir_quien_compro / recibir_sin_modulo / envio_ya_abierto / " +
    "P0001|envio_reabierto|Este envío se reabrió: ciérralo desde el conteo",
);
caso(
  "A6 doble clic: el mismo token no reabre dos veces; con otro motivo no",
  `${CON_FALTANTE}
   select gen_random_uuid() as tk \\gset
   select ${REABRE("d1", "Revisar", { token: ":'tk'" })} as r1 \\gset
   select ${REABRE("d1", "Revisar", { token: ":'tk'" })} as r2 \\gset
   select pg_temp.h(${REABRE("d1", "Otro", { token: ":'tk'" })}) as r3 \\gset
   reset role;
   select concat_ws(' / ', :'r1'::jsonb ->> 'repetido', :'r2'::jsonb ->> 'repetido', :'r3',
     (select count(*) from retail.despacho_cierres where despacho_id = :'d1' and tipo = 'reapertura'));`,
  "false / true / recepcion_otros_datos / 1",
);
caso(
  "A7 «Nos debe» y el detalle del envío leen lo que vale: una deuda que dejó de valer no se resuelve; la historia queda",
  `${CON_FALTANTE}
   select ${REABRE("d1", "Revisar")} \\g /dev/null
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   select pg_temp.h(pg_temp.salda(:'dif', 'repuesta', 1, 'Llegó con la agencia', gen_random_uuid())) as salda \\gset
   select pg_temp.detalle(:'d1') as det \\gset
   reset role;
   select concat_ws(' / ', :'salda', jsonb_array_length(:'det'::jsonb -> 'diferencias'), ${TODAS("d1")},
     (select vigente from retail.despacho_diferencias where id = :'dif'), ${DEBE});`,
  "nos_debe_no_existe / 0 / 1 / f / 0",
);
caso(
  "A8 lo que lee la pantalla: el rastro de cierres y reaperturas con quién, y si se puede reabrir (solo cerrado)",
  `${CON_FALTANTE}
   select pg_temp.conteos(:'d1') as c1 \\gset
   select ${REABRE("d1", "Encontramos las 2")} \\g /dev/null
   select pg_temp.conteos(:'d1') as c2 \\gset
   reset role;
   select concat_ws(' / ', :'c1'::jsonb -> 'reabrir' ->> 'se_puede', coalesce(:'c1'::jsonb -> 'reabrir' ->> 'por_que_no', '-'),
     (select string_agg(c ->> 'tipo' || ':' || coalesce(c ->> 'motivo', '-') || ':' || ((c -> 'hecho_por' ->> 'nombre') = :'micaela_n'), ' > ')
        from jsonb_array_elements(:'c2'::jsonb -> 'cierres') c),
     coalesce(:'c2'::jsonb ->> 'reabrir', 'sin reabrir'));`,
  "true / - / cierre:-:true > reapertura:Encontramos las 2:true / sin reabrir",
);

// F. LA FORMA --------------------------------------------------------------------------------------------------------------
caso(
  "F1 reabrir_envio security definer con sus permisos; el rastro con RLS y sin lectura directa; la vista cerrada; nadie lee la tabla sin filtrar",
  `reset role;
   select concat_ws(' / ',
     (select p.prosecdef || ':' || has_function_privilege('authenticated', p.oid, 'execute') || ':' || has_function_privilege('anon', p.oid, 'execute')
        from pg_proc p where p.oid = 'retail.reabrir_envio(uuid,integer,text,uuid)'::regprocedure),
     (select c.relrowsecurity || ':' || has_table_privilege('authenticated', c.oid, 'select') from pg_class c where c.oid = 'retail.despacho_cierres'::regclass),
     has_table_privilege('authenticated', 'retail.despacho_diferencias_vigentes', 'select'),
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.prokind = 'f' and position('from retail.despacho_diferencias x' in pg_get_functiondef(p.oid)) > 0));`,
  "true:true:false / true:false / f / 0",
);

// D. DOS SESIONES A LA VEZ --------------------------------------------------------------------------------------------------
// Un envío de prueba cerrado con una deuda de 3 («no vino»), COMMITEADO (sin la migración en el preludio: corre sobre la base ya
// migrada). Se borra entero al terminar —y al empezar, si una corrida anterior se cortó— (session_replication_role = replica).
const MARCA_D = "ZZ Reabrir dos sesiones";
const LIMPIAR_D = `
begin;
set local session_replication_role = replica;
create temp table _prov on commit drop as select p.id from retail.proveedores p where p.nombre like '${MARCA_D}%';
create temp table _env on commit drop as
  select distinct di.despacho_id as id
    from retail.despacho_items di
    join retail.orden_compra_items i on i.id = di.orden_compra_item_id
    join retail.ordenes_compra o on o.id = i.orden_compra_id
   where o.proveedor_id in (select id from _prov);
delete from retail.actividad a
 where a.tabla in ('despachos', 'proveedor_deuda_resoluciones')
   and (a.registro_id in (select id::text from _env)
        or a.registro_id in (select r.id::text from retail.proveedor_deuda_resoluciones r
                              where r.despacho_id in (select id from _env)
                                 or r.diferencia_id in (select x.id from retail.despacho_diferencias x where x.despacho_id in (select id from _env))));
delete from retail.proveedor_deuda_resoluciones r
 where r.diferencia_id in (select x.id from retail.despacho_diferencias x where x.despacho_id in (select id from _env));
delete from retail.despacho_cierres c where c.despacho_id in (select id from _env);
delete from retail.despacho_diferencias x where x.despacho_id in (select id from _env);
delete from retail.despacho_conteos k where k.despacho_id in (select id from _env);
delete from retail.despacho_items di where di.despacho_id in (select id from _env);
delete from retail.despachos d where d.id in (select id from _env);
delete from retail.orden_compra_items i where i.orden_compra_id in (select o.id from retail.ordenes_compra o where o.proveedor_id in (select id from _prov));
delete from retail.ordenes_compra o where o.proveedor_id in (select id from _prov);
delete from retail.proveedores p where p.id in (select id from _prov);
commit;
select count(*) from retail.proveedores where nombre like '${MARCA_D}%';
`;
// Devuelve «despacho|versión|diferencia».
const CREAR_D = `
set client_min_messages = warning;
begin;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as sandra_p from public.personas p where p.auth_user_id = '${SANDRA}' \\gset
select id as cat from retail.categorias where activo order by id limit 1 \\gset
select id as marca from retail.marcas where activo order by id limit 1 \\gset
insert into retail.proveedores (nombre) values ('${MARCA_D} ' || substr(md5(random()::text), 1, 8)) returning id as prov \\gset
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'felipe_p') returning id as o \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o', 1, :'cat', :'marca', 3, 20) returning id as l \\gset
insert into retail.despachos (ubicacion_destino_id, despachado_por) values (:'tru', :'felipe_p') returning id as d \\gset
insert into retail.despacho_items (despacho_id, orden_compra_item_id, cantidad, categoria_id, marca_id, precio_unitario)
  values (:'d', :'l', 3, :'cat', :'marca', 20) returning id as di \\gset
update retail.despachos set estado = 'abierto', abierto_por = :'sandra_p', abierto_en = now() where id = :'d';
insert into retail.despacho_conteos (despacho_id, despacho_item_id, contadas, costo_unitario, contado_por) values (:'d', :'di', 0, 20, :'sandra_p');
insert into retail.despacho_diferencias (despacho_id, despacho_item_id, proveedor_id, categoria_id, marca_id, tipo, causa, cantidad,
                                         costo_unitario, creado_por)
  values (:'d', :'di', :'prov', :'cat', :'marca', 'faltante', 'no_vino', 3, 20, :'sandra_p') returning id as x \\gset
update retail.despachos set estado = 'cerrado', cerrado_por = :'sandra_p', cerrado_en = now() where id = :'d';
commit;
select :'d' || '|' || (select version from retail.despachos where id = :'d') || '|' || :'x';
`;
const SANDRA_HACE = (llamada) => `
set client_min_messages = warning;
begin;
${como(SANDRA)}${SIN_ENCABEZADOS}
${atrapa("hace", "p_x integer", llamada)}
select coalesce(j ->> 'hint', case when j ? 'error' then j ->> 'error' else 'OK' end) from (select pg_temp.hace(0) as j) q;
`;
function anotar(nombre, ok, esperado, obtenido) {
  casos++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  }
}
async function dosSesiones(nombre, primera, segunda, revisar, esperado) {
  if (!DOS_SESIONES) {
    console.log(`⤳ ${nombre}: se salta en la base local compartida (hace COMMIT); córrela con --contenedor <banco propio>`);
    return;
  }
  try {
    psql(LIMPIAR_D);
    const [d, version, x] = psql(CREAR_D).trim().split("\n").filter(Boolean).at(-1).split("|");
    const p1 = psqlAsync(`${SANDRA_HACE(primera(d, version, x))}\nselect pg_sleep(1.5);\ncommit;\n`);
    await dormir(400);
    const p2 = psqlAsync(`${SANDRA_HACE(segunda(d, version, x))}\nrollback;\n`);
    const [s1, s2] = await Promise.all([p1, p2]);
    const r1 = s1.stdout.trim().split("\n").filter(Boolean).at(-1);
    const r2 = s2.stdout.trim().split("\n").filter(Boolean).at(-1);
    const obtenido = `s1=${r1} · s2=${r2} · ${s2.ms > 900 ? "esperó" : `no esperó (${s2.ms} ms)`} · ${psql(revisar(d, x)).trim()}`;
    const ok = s1.code === 0 && s2.code === 0 && obtenido === esperado;
    anotar(nombre, ok, esperado, ok ? obtenido : `${obtenido}\n    s1: ${s1.stderr.trim()}\n    s2: ${s2.stderr.trim()}`);
  } catch (e) {
    anotar(nombre, false, "sin error", String(e.stderr ?? e.message).split("\n").slice(0, 4).join(" "));
  } finally {
    try {
      const quedan = psql(LIMPIAR_D).trim().split("\n").filter(Boolean).at(-1);
      if (quedan !== "0") console.log(`⚠ quedaron ${quedan} proveedores «${MARCA_D}» sin borrar`);
    } catch (e) {
      console.log(`⚠ no se pudo borrar el envío de prueba: ${String(e.stderr ?? e.message).split("\n")[0]}`);
    }
  }
}
const ESTADO_D = (d, x) =>
  `select 'vigente=' || (select vigente from retail.despacho_diferencias where id = '${x}') || ' · resuelto=' ||
     coalesce((select sum(cantidad) from retail.proveedor_deuda_resoluciones where diferencia_id = '${x}'), 0) || ' · ' ||
     (select estado from retail.despachos where id = '${d}');`;
await dosSesiones(
  "D1 reabrir y resolver la deuda a la vez, reabrir primero: la deuda espera y después ya no existe",
  (d, version) => `retail.reabrir_envio('${d}', ${version}, 'Encontramos las 3', gen_random_uuid())`,
  (d, version, x) => `retail.resolver_deuda_proveedor('${x}', 'repuesta', 2, 'Llegó con la agencia', gen_random_uuid())`,
  ESTADO_D,
  "s1=OK · s2=nos_debe_no_existe · esperó · vigente=false · resuelto=0 · abierto",
);
await dosSesiones(
  "D2 lo mismo, resolver primero: reabrir espera y después ya no se puede",
  (d, version, x) => `retail.resolver_deuda_proveedor('${x}', 'repuesta', 2, 'Llegó con la agencia', gen_random_uuid())`,
  (d, version) => `retail.reabrir_envio('${d}', ${version}, 'Encontramos las 3', gen_random_uuid())`,
  ESTADO_D,
  "s1=OK · s2=reabrir_deuda_resuelta · esperó · vigente=true · resuelto=2 · cerrado",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);

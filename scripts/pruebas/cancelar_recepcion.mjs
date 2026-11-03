#!/usr/bin/env node
/**
 * Pruebas de cancelar la recepción de un envío sin aviso (ADR-0605, Felipe 2026-11-03) — migración `20261103173000_cancelar_recepcion_sin_aviso.sql`
 * (y las de la recepción, que escriben lo que esta lee).
 *
 * LO QUE VIGILA. Que un envío que llegó sin aviso y se abrió por error (o llegó a otra sede) se pueda cancelar sin dejar un estado imposible:
 * queda ANULADO con quién, cuándo y por qué; lo contado queda como historia y no mete nada al stock; y NO se cancela lo que ya metió prendas,
 * lo cerrado, lo que vino de Compras ni lo que no es de la sede de quien lo pide.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las migraciones se cargan DOS veces dentro de cada caso).
 *   C  CANCELAR: lo normal (con lo contado y lo pendiente), el reintento, el motivo, la versión, los permisos, y lo que se niega.
 *   F  LA FORMA: security definer, authenticated sí, anon no; el candado de apertura y el camino del estado.
 *
 * USO
 *   node scripts/pruebas/cancelar_recepcion.mjs                              → contra el stack local compartido
 *   node scripts/pruebas/cancelar_recepcion.mjs --contenedor supabase_db_x   → contra otro stack (un banco de pruebas propio)
 *   node scripts/pruebas/cancelar_recepcion.mjs --sin-migracion              → sin cargar las migraciones: tiene que FALLAR
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
const cargar = (archivos) =>
  archivos
    .map((f) =>
      readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8")
        .replace(/^set lock_timeout.*$/m, "")
        .replace(/^reset lock_timeout;$/m, ""),
    )
    .join("\n");
// Las anteriores se cargan UNA vez (la de reabrir ancla su reemplazo en el texto original de `fn_despachos_camino`, que la mía ya cambió: en producción
// cada una corre una vez y en orden). La mía, DOS veces: tiene que poder pegarse otra vez.
const MIGRACIONES_PREVIAS = SIN_MIGRACION
  ? ""
  : cargar([
      "20261013170000_recepcion_un_solo_camino_de_cierre.sql",
      "20261013171000_conteo_de_envio.sql",
      "20261013172000_cerrar_conteo_con_pendientes.sql",
      "20261013173000_resolver_pendiente_de_envio.sql",
      "20261013180000_reabrir_envio.sql",
      "20261013183000_envio_sin_aviso.sql",
      "20261014205000_corregir_guia_al_cerrar.sql",
    ]);
const MIGRACIONES = SIN_MIGRACION ? "" : cargar(["20261103173000_cancelar_recepcion_sin_aviso.sql"]);

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
${MIGRACIONES_PREVIAS}
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
${atrapa("pone", "p_d uuid, p_prov uuid", "retail.poner_proveedor_envio(p_d, p_prov)")}
${atrapa("cancela", "p_d uuid, p_version integer, p_motivo text", "retail.cancelar_recepcion_envio(p_d, p_version, p_motivo)")}
${atrapa("guia", "p_d uuid, p_g text", "retail.corregir_guia_envio(p_d, p_g)")}
${atrapa(
  "sinaviso",
  "p_u uuid, p_prov uuid, p_guia text, p_nota text, p_token uuid",
  "retail.abrir_envio_sin_aviso(p_u, p_prov, p_guia, p_nota, p_token)",
)}

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
    if (process.env.DEPURAR) console.log(String(e.stderr ?? e.message));
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


// Micaela abre un envío sin aviso en Trujillo, del proveedor de la prueba: :<nombre> y su versión :v_<nombre>.
const SIN_AVISO = (nombre, { prov = ":'prov'", sede = ":'tru'", token = "gen_random_uuid()" } = {}) => `
select pg_temp.sinaviso(${sede}, ${prov}, 'G-77', null, ${token}) as sa_${nombre} \\gset
select (:'sa_${nombre}'::jsonb ->> 'despacho_id') as ${nombre} \\gset
select (:'sa_${nombre}'::jsonb ->> 'version')::int as v_${nombre} \\gset
`;
// Lo de un envío sin aviso se guarda como «lo que no estaba en la guía»: [categoría, contadas, separado]; el proveedor es el del envío.
const EXTRA = (envio, cat, contadas, sep = VACIO, extra = "null::int") =>
  `pg_temp.guarda(:'${envio}', null, ${contadas}, ${sep}, null::int, ${extra}, null::uuid, :'${cat}', :'marca')`;
const COSTO = (v) => `(select costo from retail.variantes where id = :'${v}')`;

// C. CANCELAR -----------------------------------------------------------------------------------------------------------
const ESTADO = (envio) => `(select estado || ':' || (abierto_por is not null) || ':' || (anulado_por is not null) || ':' || coalesce(motivo_anulacion, '-') from retail.despachos where id = :'${envio}')`;
caso(
  "C1 cancelar uno abierto sin aviso, con lo contado y lo pendiente: queda anulado con su motivo y sin perder quién lo abrió; lo contado queda; nada entra al stock",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select ${EXTRA("d", "cat", 3, SEP([], [[2, "Chompa con capucha"]]))} \\g /dev/null
   select pg_temp.e(pg_temp.cancela(:'d', :v_d, 'Se abrió por error')) as cancela \\gset
   reset role;
   select concat_ws(' / ', :'cancela', ${ESTADO("d")},
     (select count(*) from retail.despacho_conteos where despacho_id = :'d'),
     (select count(*) from retail.despacho_pendientes where despacho_id = :'d' and estado = 'pendiente'),
     (select count(*) from retail.despacho_recibidos where despacho_id = :'d'),
     (select count(*) from retail.actividad a where a.registro_id = :'d'::text and a.accion = 'despacho_cancelado'));`,
  "OK / anulado:true:true:Se abrió por error / 1 / 0 / 0 / 1",
);
caso(
  "C2 el mismo pedido otra vez (doble clic) responde sin cambiar nada; con otro motivo, no",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select pg_temp.cancela(:'d', :v_d, 'Se abrió por error') as uno \\gset
   select (:'uno'::jsonb ->> 'version')::int as v1 \\gset
   select (pg_temp.cancela(:'d', :v_d, 'Se abrió por error') ->> 'repetido') as repetido \\gset
   select pg_temp.h(pg_temp.cancela(:'d', :v_d, 'Llegó a otra sede')) as otro \\gset
   reset role;
   select concat_ws(' / ', :'repetido', :'otro', (select version = :v1 from retail.despachos where id = :'d'));`,
  "true / envio_ya_anulado / t",
);
caso(
  "C3 sin motivo, con motivo corto o de más de 300 letras no; sin versión, o con una vieja (PT409), tampoco",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select concat_ws(' / ',
     pg_temp.h(pg_temp.cancela(:'d', :v_d, null)), pg_temp.h(pg_temp.cancela(:'d', :v_d, '  ')), pg_temp.h(pg_temp.cancela(:'d', :v_d, 'ab')),
     pg_temp.h(pg_temp.cancela(:'d', :v_d, repeat('x', 301))), pg_temp.h(pg_temp.cancela(:'d', null, 'Se abrió por error')),
     pg_temp.h(pg_temp.cancela(:'d', :v_d + 5, 'Se abrió por error'))) as hs \\gset
   reset role;
   select concat_ws(' / ', :'hs', (select estado from retail.despachos where id = :'d'));`,
  "cancelar_motivo / cancelar_motivo / cancelar_motivo / cancelar_motivo / envio_sin_version / version_cambiada / abierto",
);
caso(
  "C4 un envío que vino de Compras no se cancela desde la sede",
  `${BASE_D1}
   select pg_temp.h(pg_temp.cancela(:'d1', :v_d1, 'Se abrió por error')) as h \\gset
   reset role;
   select concat_ws(' / ', :'h', (select estado from retail.despachos where id = :'d1'));`,
  "envio_con_aviso_no_se_cancela / abierto",
);
caso(
  "C5 uno cerrado no se cancela; reabierto (que ya metió stock) tampoco: se cuadra y se cierra",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select ${EXTRA("d", "cat", 3, SEP([["prod_p", 3, [V("pv_s", 3)]]]))} \\g /dev/null
   ${VERS("d", [], [1])}
   select pg_temp.cierra(:'d', :v_d, ${A(DEC(1))}, null::text, null::uuid) as cierre \\gset
   ${VER("d")}
   select pg_temp.h(pg_temp.cancela(:'d', :v_d, 'Se abrió por error')) as cerrado \\gset
   select pg_temp.reabre(:'d', :v_d, 'Faltaba una', null::uuid) as reabierto \\gset
   ${VER("d")}
   select pg_temp.h(pg_temp.cancela(:'d', :v_d, 'Se abrió por error')) as reabierto_h \\gset
   reset role;
   select concat_ws(' / ', :'cerrado', :'reabierto_h', (select estado from retail.despachos where id = :'d'));`,
  "envio_cerrado / envio_ya_tuvo_stock / abierto",
);
caso(
  "C6 sin responsable, sin el módulo Recibir, de otra sede o ya anulado no se puede",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   ${SIN_ENCABEZADOS}
   select pg_temp.h(pg_temp.cancela(:'d', :v_d, 'Se abrió por error')) as sin_resp \\gset
   ${rolDeMicaela("vender")}${como(MICAELA)}${EN_TIENDA}
   select pg_temp.h(pg_temp.cancela(:'d', :v_d, 'Se abrió por error')) as sin_modulo \\gset
   ${MICAELA_RECIBE}
   select pg_temp.cancela(:'d', :v_d, 'Se abrió por error') as ok \\gset
   select pg_temp.h(pg_temp.cancela(:'d', :v_d, 'Otro motivo')) as ya \\gset
   select concat_ws(' / ', :'sin_resp', :'sin_modulo', pg_temp.h(:'ok'::jsonb), :'ya');`,
  (o) => /^responsable_requerido \/ recibir_sin_modulo \/ OK \/ envio_ya_anulado$/.test(o),
);
caso(
  "C7 uno en camino no se cancela aquí (se anula desde Compras)",
  `${BASE_D1.split("${ABRE")[0] === BASE_D1 ? "" : ""}${ENVIA("d2", [["l1", 10]])}${MICAELA_RECIBE}
   select pg_temp.h(pg_temp.cancela(:'d2', :v_d2, 'Se abrió por error')) as h \\gset
   reset role;
   select concat_ws(' / ', :'h', (select estado from retail.despachos where id = :'d2'));`,
  "envio_sin_abrir / en_camino",
);

// F. LA FORMA ------------------------------------------------------------------------------------------------------------
caso(
  "F1 cancelar_recepcion_envio security definer: authenticated sí, anon no; abierto → anulado por otro camino (un UPDATE directo) no pasa",
  `reset role;
   select concat_ws(' / ',
     (select p.prosecdef || ':' || has_function_privilege('authenticated', p.oid, 'execute') || ':' || has_function_privilege('anon', p.oid, 'execute')
        from pg_proc p where p.oid = 'retail.cancelar_recepcion_envio(uuid,integer,text)'::regprocedure));`,
  "true:true:false",
);
caso(
  "F2 abierto → anulado con un UPDATE a mano (sin pasar por la función) lo frena el camino del envío; el candado de apertura sigue exigiendo quién y cuándo en abierto",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   reset role;
   select concat_ws(' / ',
     pg_temp.intento($$update retail.despachos set estado = 'anulado', anulado_por = (select id from public.personas limit 1), anulado_en = now(), motivo_anulacion = 'a mano' where id = '$$ || :'d' || $$'$$) ~ 'no pasa a anulado',
     pg_temp.intento($$update retail.despachos set abierto_por = null where id = '$$ || :'d' || $$'$$) ~ 'despachos_apertura');`,
  "t / t",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Pruebas del cierre con pendientes y de «Hacer ahora» de un envío (ADR-0393, actividad 3; Felipe 2026-10-13) — migraciones
 * `20261013172000_cerrar_conteo_con_pendientes.sql` y `20261013173000_resolver_pendiente_de_envio.sql` (y las dos de la actividad 2,
 * que escriben lo que estas leen).
 *
 * LO QUE VIGILA. Que al cerrar lo contado con la cara A entre al stock SOLO lo que tiene talla y color (decisión 1), que lo demás quede a
 * la vista como pendiente (sin tallas: «detalle»; nuevo: «crear»; lo no separado: «sin separar», calculado) y que lo que faltó o sobró
 * se mida con lo CONTADO, no con lo que ya tiene tallas. Que quien cierra firme lo que vio (si alguien guardó una línea después, no se
 * cierra). Que «Hacer ahora» meta lo pendiente al stock como el cierre —costo del cierre, papel de Compras hasta su cupo— sin pasar
 * nunca de lo que quedaba y sin entrar dos veces con un doble clic. Que la BASE no deje descuadrar una línea aunque se escriba a mano
 * (en stock + pendientes + sin separar = contadas). Y el número del aviso de la decisión 4.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK, con los candados diferidos revisados al final; las cuatro migraciones se cargan
 * DOS veces dentro de cada caso: se pueden pegar dos veces). Micaela es de Tienda Trujillo y no es líder (un rol de prueba con los
 * módulos que pide cada caso; firma ella en el combo «Responsable»); Felipe es líder y Admin y hace las órdenes y los envíos; Sandra es
 * líder y Admin y cuenta a la vez que Micaela.
 *   C  CERRAR: todo con tallas (como con el formulario); con pendientes; toda línea contada y su causa; firmar lo que se vio; lo de fuera
 *      de la guía; el doble clic; permisos y estados.
 *   R  «HACER AHORA»: un «detalle» por partes; nunca más de lo que queda; desde lo sin separar; «crear» con la prenda creada con el envío
 *      cerrado; el doble clic; costo atípico, envío abierto y quien compró; el papel hasta su cupo.
 *   I  EL CANDADO DE LA BASE: lo que entra más lo pendiente nunca pasa de lo contado, aunque se escriba a mano; lo de un envío cerrado
 *      solo lo anota «Hacer ahora».
 *   L  LECTURAS: el número de la sede (decisión 4); la línea con lo que está en el stock, lo sin separar y sus pendientes.
 *   F  LA FORMA: funciones security definer con sus permisos; tablas con RLS sin políticas.
 *
 * USO
 *   node scripts/pruebas/pendientes_de_envio.mjs                                → contra el stack local compartido
 *   node scripts/pruebas/pendientes_de_envio.mjs --contenedor supabase_db_x     → contra otro stack (un banco de pruebas propio)
 *   node scripts/pruebas/pendientes_de_envio.mjs --sin-migracion                → sin cargar las migraciones: contra una base sin el
 *                                                                                  cambio, la prueba tiene que FALLAR
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
      // ADR-0393: lo que llega sin aviso, con el mismo conteo.
      "20261013183000_envio_sin_aviso.sql",
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

// C. CERRAR LO CONTADO ----------------------------------------------------------------------------------------------------
caso(
  "C1 todo con tallas: entra como con el formulario, sin pendientes; la respuesta dice lo contado y que no queda nada por detallar",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_n", 10, [V("v_s", 6), V("v_m", 4)]]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 4, SEP([["prod_p", 4, [V("pv_s", 4)]]]))} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   select ${CIERRA("d1", [DEC("l1"), DEC("l2")])} as r \\gset
   reset role;
   select concat_ws(' / ', (select estado from retail.despachos where id = :'d1'),
     concat_ws(':', :'r'::jsonb ->> 'unidades', :'r'::jsonb ->> 'contadas', :'r'::jsonb ->> 'por_detallar', :'r'::jsonb ->> 'faltan'),
     (select count(*) from retail.despacho_pendientes where despacho_id = :'d1') || ' pendientes',
     ${CUENTAS("d1", "l1")}, ${CUENTAS("d1", "l2")},
     (select string_agg(m.cantidad || '@' || coalesce(s.tipo, '?'), ',' order by m.cantidad desc)
        from retail.movimientos m join retail.lotes l on l.id = m.lote_id left join retail.sububicaciones s on s.id = m.sububicacion_id
       where l.despacho_id = :'d1'),
     (select string_agg(costo_unitario::text, ',' order by costo_unitario) from retail.despacho_conteos where despacho_id = :'d1'));`,
  "cerrado / 14:14:0:0 / 0 pendientes / 10:10:0:0 / 4:4:0:0 / 6@almacen_tienda,4@almacen_tienda,4@almacen_tienda / 30.00,50.00",
);
caso(
  "C2 con pendientes: entra lo que tiene tallas; sin tallas queda «detalle», lo nuevo «crear», el resto sin separar; lo que faltó se mide con lo contado",
  `${CIERRE_CON_PENDIENTES}
   reset role;
   select concat_ws(' / ',
     concat_ws(':', :'cierre'::jsonb ->> 'unidades', :'cierre'::jsonb ->> 'contadas', :'cierre'::jsonb ->> 'por_detallar',
               :'cierre'::jsonb ->> 'faltan', :'cierre'::jsonb ->> 'sobran'),
     (select string_agg(x.tipo || ':' || x.cantidad || ':' || coalesce(p.referencia, x.descripcion) || ':' || x.estado
                        || ':' || (x.anotado_por = :'micaela_p'), ',' order by x.tipo desc)
        from retail.despacho_pendientes x left join retail.productos p on p.id = x.producto_id where x.despacho_id = :'d1'),
     ${CUENTAS("d1", "l1")}, ${CUENTAS("d1", "l2")},
     (select string_agg(x.tipo || ':' || x.causa || ':' || x.cantidad, ',') from retail.despacho_diferencias x where x.despacho_id = :'d1'),
     (select count(*) from retail.lotes where despacho_id = :'d1') || ' lote',
     (select ${limpio("a.descripcion")} from retail.actividad a where a.registro_id = :'d1'::text and a.accion = 'despacho_recibido'));`,
  "4:12:8:2:0 / detalle:3:Chompa Catálogo Conteo:pendiente:true,crear:2:Chompa con capucha:pendiente:true / 10:4:5:1 / 2:0:0:2 / " +
    "faltante:no_vino:2 / 1 lote / recibió ENV (4 prendas; 8 por detallar; faltan 2)",
);
caso(
  "C3 toda línea se cuenta, aunque sea en 0; sin decidir qué pasó con lo que falta o sobra no se cierra",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 8)} \\g /dev/null
   ${VERS("d1", ["l1"])}
   select pg_temp.h(${CIERRA("d1", [DEC("l1", { falt: "no_vino" })])}) as sin_l2 \\gset
   select ${GUARDA("d1", "di_l2", 6, VACIO, "null::int")} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   select pg_temp.e(${CIERRA("d1", [DEC("l1"), DEC("l2", { sobr: "regalo" })])}) as sin_falt \\gset
   select pg_temp.e(${CIERRA("d1", [DEC("l1", { falt: "no_vino" }), DEC("l2")])}) as sin_sobr \\gset
   select pg_temp.h(${CIERRA("d1", [DEC("l1", { falt: "no_vino" }), DEC("l2", { sobr: "regalo", falt: "se_perdio" })])}) as de_mas \\gset
   reset role;
   select concat_ws(' / ', :'sin_l2', :'sin_falt', :'sin_sobr', :'de_mas', (select estado from retail.despachos where id = :'d1'));`,
  (o) =>
    /^recepcion_falta_linea \/ P0001\|recepcion_faltante_causa\|Faltan 2 de Chompas Conteo · Marca Conteo Prueba · Chompa cuello alto: elige qué pasó \/ P0001\|recepcion_sobrante_causa\|Vinieron 2 de más de Chompas Conteo · Marca Conteo Prueba: elige qué pasa con ellas \/ recepcion_faltante_causa \/ abierto$/.test(o),
);
caso(
  "C4 firmar es certificar lo que se vio: si alguien guardó una línea o agregó otra después, no se cierra; una línea repetida o ajena tampoco",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_n", 10, [V("v_s", 6), V("v_m", 4)]]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 4)} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   select ${GUARDA("d1", "di_l2", 3)} \\g /dev/null
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(${CIERRA("d1", [DEC("l1"), DEC("l2")])}) as cambio \\gset
   ${VERS("d1", ["l1", "l2"])}
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   select ${GUARDA("d1", null, 2, VACIO, "null::int", { extra: "null::int", prov: ":'prov'", cat: ":'cat2'", marca: ":'marca'" })} \\g /dev/null
   ${como(MICAELA)}${EN_TIENDA}
   select concat_ws(' / ', :'cambio',
     pg_temp.e(${CIERRA("d1", [DEC("l1"), DEC("l2", { falt: "no_vino" })])}),
     pg_temp.h(${CIERRA("d1", [DEC("l1"), DEC("l1"), DEC("l2", { falt: "no_vino" })])}),
     pg_temp.h(${CIERRA("d1", [DEC("l1"), DEC("l2", { falt: "no_vino" }), J({ despacho_item_id: "gen_random_uuid()", version: "1" })])}));`,
  (o) =>
    o ===
    "PT409|conteo_cambiado|Chompas Conteo · Marca Conteo Prueba cambió mientras cerrabas (lo guardó " +
      o.match(/lo guardó ([^)]+)\)/)?.[1] +
      "): revisa y vuelve a cerrar / PT409|conteo_cambiado|Gorros Conteo · Marca Conteo Prueba se contó mientras cerrabas (lo guardó " +
      o.match(/lo guardó ([^)]+)\)/)?.[1] +
      "): revisa y vuelve a cerrar / recepcion_linea_repetida / recepcion_linea_ajena",
);
caso(
  "C5 lo de fuera de la guía: sobra con su causa y su costo (sin costo no se cierra); lo que quedó en 0 se quitó y no deja nada",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_n", 10, [V("v_s", 6), V("v_m", 4)]]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 4, SEP([["prod_p", 4, [V("pv_s", 4)]]]))} \\g /dev/null
   select ${GUARDA("d1", null, 3, SEP([["prod_g", 3, [V("pg_s", 3)]]]), "null::int", { prov: ":'prov'", cat: ":'cat2'", marca: ":'marca'" })} \\g /dev/null
   select ${GUARDA("d1", null, 2, VACIO, "null::int", { prov: ":'prov'", cat: ":'cat2'", marca: ":'marca'" })} \\g /dev/null
   select ${GUARDA("d1", null, 0, VACIO, "null::int", { extra: "2" })} \\g /dev/null
   ${VERS("d1", ["l1", "l2"], [1, 2])}
   select pg_temp.e(${CIERRA("d1", [DEC("l1"), DEC("l2"), DEC(1, { sobr: "regalo" }), DEC(2)])}) as sin_costo \\gset
   select ${CIERRA("d1", [DEC("l1"), DEC("l2"), DEC(1, { sobr: "regalo", costo: 12 }), DEC(2)])} as r \\gset
   reset role;
   select concat_ws(' / ', :'sin_costo', :'r'::jsonb ->> 'unidades',
     (select string_agg(x.tipo || ':' || x.causa || ':' || x.cantidad || ':' || x.extra_posicion || ':' || x.costo_unitario, ',')
        from retail.despacho_diferencias x where x.despacho_id = :'d1'),
     (select string_agg(r.extra_posicion || ':' || r.cantidad, ',') from retail.despacho_recibidos r
       where r.despacho_id = :'d1' and r.extra_posicion is not null));`,
  "P0001|recepcion_costo|Escribe el costo de Gorros Conteo · Marca Conteo Prueba (fuera de la guía) / 17 / sobrante:regalo:3:1:12.00 / 1:3",
);
caso(
  "C6 doble clic: el mismo token responde lo mismo sin escribir de nuevo; el mismo token con otros datos no",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_n", 4, [V("v_s", 4)]]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 4)} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   select gen_random_uuid() as tk \\gset
   select ${CIERRA("d1", [DEC("l1"), DEC("l2")], { token: ":'tk'" })} as r1 \\gset
   reset role;
   select count(*) as mov1 from retail.movimientos \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select ${CIERRA("d1", [DEC("l1"), DEC("l2")], { token: ":'tk'" })} as r2 \\gset
   select pg_temp.h(${CIERRA("d1", [DEC("l1"), DEC("l2")], { token: ":'tk'", nota: "'otra'" })}) as r3 \\gset
   reset role;
   select concat_ws(' / ', :'r1'::jsonb = :'r2'::jsonb, (select count(*) from retail.movimientos) - :mov1, :'r3',
     (select count(*) from retail.despacho_pendientes where despacho_id = :'d1'));`,
  "t / 0 / recepcion_otros_datos / 0",
);
caso(
  "C7 quien hizo la orden no cierra; sin Recibir no; un envío en camino o anulado tampoco",
  `${ENVIA("d3", [["l_o3", 3]])}${ITEM("d3", "l_o3")}
   ${ENVIA("d_camino", [["l2", 1]])}
   ${como(SANDRA)}${SIN_ENCABEZADOS}${ABRE("d3")}
   select ${GUARDA("d3", "di_l_o3", 3)} \\g /dev/null
   ${VERS("d3", ["l_o3"])}
   reset role;
   ${MICAELA_RECIBE}
   select pg_temp.h(${CIERRA("d3", [DEC("l_o3")])}) as suya \\gset
   select pg_temp.h(pg_temp.cierra(:'d_camino', :v_d_camino, '[]'::jsonb, null, null)) as camino \\gset
   ${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select concat_ws(' / ', :'suya', :'camino', pg_temp.h(${CIERRA("d3", [DEC("l_o3")])}));`,
  "recibir_quien_compro / envio_sin_abrir / recibir_sin_modulo",
);

// R. «HACER AHORA» CON EL ENVÍO CERRADO -----------------------------------------------------------------------------------
caso(
  "R1 un pendiente «detalle» se termina por partes, con el costo del cierre; cuando entró todo sale de la lista",
  `${CIERRE_CON_PENDIENTES}
   select ${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 2, [V("pv_s", 2)]]]))} as r1 \\gset
   reset role;
   select concat_ws(':', estado, ${CUENTAS("d1", "l1")}) as tras1 from retail.despacho_pendientes where id = :'pend_det' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select ${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 1, [V("pv_s", 1)]]]))} as r2 \\gset
   reset role;
   select concat_ws(' / ', concat_ws(':', :'r1'::jsonb ->> 'entraron', :'r1'::jsonb ->> 'quedaron_pendientes',
                                     :'r1'::jsonb -> 'linea' ->> 'en_stock', :'r1'::jsonb -> 'linea' ->> 'sin_separar'),
     :'tras1',
     (select concat_ws(':', estado, resuelto_por = :'micaela_p', resuelto_en is not null) from retail.despacho_pendientes where id = :'pend_det'),
     ${CUENTAS("d1", "l1")},
     (select string_agg(r.cantidad || '@' || r.costo_unitario, ',' order by r.creado_en, r.cantidad desc) from retail.despacho_recibidos r
       where r.pendiente_id = :'pend_det'),
     (select ${STOCK_TRU("pv_s")}),
     (select string_agg(${limpio("a.descripcion")}, ' | ' order by a.ocurrio_at, a.descripcion) from retail.actividad a
       where a.registro_id = :'d1'::text and a.accion = 'despacho_pendiente_resuelto'));`,
  "2:0:6:1 / pendiente:10:6:3:1 / resuelto:t:t / 10:7:2:1 / 2@30.00,1@30.00 / 3 / detalló 1 prenda de ENV | detalló 2 prendas de ENV",
);
caso(
  "R2 nunca más de lo que queda; un pendiente se termina con tallas (ni sin tallas ni nuevas); vacío no",
  `${CIERRE_CON_PENDIENTES}
   select concat_ws(' / ',
     pg_temp.e(${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 4, [V("pv_s", 4)]]]))}),
     pg_temp.e(${RESUELVE("d1", "l1", null, SEP([], [[2]]))}),
     pg_temp.h(${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 1]]))}),
     pg_temp.h(${RESUELVE("d1", "l1", "pend_det", SEP([], [[1]]))}),
     pg_temp.h(${RESUELVE("d1", "l1", "pend_det", SEP())}),
     pg_temp.h(${RESUELVE("d1", "l2", "pend_det", SEP([["prod_p", 1, [V("pv_s", 1)]]]))}),
     pg_temp.h(${RESUELVE("d1", "l1", "pend_det", SEP([["prod_g", 1, [V("pg_s", 1)]]]))}));`,
  "P0001|pendiente_de_mas|De este pendiente quedan 3 y pusiste 4: si llegaron más, reabre el conteo / " +
    "P0001|separado_de_mas|De Chompas Conteo · Marca Conteo Prueba · Chompa cuello alto quedan 1 sin separar y pusiste 2: si llegaron más, reabre el conteo / " +
    "pendiente_solo_tallas / pendiente_solo_tallas / pendiente_vacio / pendiente_ajeno / recepcion_prenda_ajena",
);
caso(
  "R3 desde lo sin separar: lo que trae tallas entra y lo demás queda pendiente; la línea cuadra",
  `${CIERRE_CON_PENDIENTES}
   select ${RESUELVE("d1", "l2", null, SEP([["prod_p", 1, [V("pv_s", 1)]]], [[1, "Gorro raro"]]))} as r \\gset
   reset role;
   select concat_ws(' / ', :'r'::jsonb ->> 'entraron', :'r'::jsonb ->> 'quedaron_pendientes', ${CUENTAS("d1", "l2")},
     (select string_agg(x.tipo || ':' || x.cantidad || ':' || coalesce(x.descripcion, '-'), ',') from retail.despacho_pendientes x
       where x.despacho_id = :'d1' and x.despacho_item_id = :'di_l2'),
     (select count(*) from retail.despacho_recibidos r where r.despacho_item_id = :'di_l2' and r.pendiente_id is null),
     (select count(*) from retail.despacho_diferencias where despacho_id = :'d1'));`,
  "1 / 1 / 2:1:1:0 / crear:1:Gorro raro / 1 / 1",
);
caso(
  "R4 «crear»: con el envío cerrado se crea la prenda (mientras quede algo por detallar) y su pendiente se termina; sin nada por detallar, ya no",
  `${CIERRE_CON_PENDIENTES}
   select pg_temp.prepara(:'d1', :'di_l1', null, null, null, 'Chompa Capucha Conteo', ${MATRIZ(["t_s", "c1"])}, 99.90, null, null, null, false, gen_random_uuid(), null) as prep2 \\gset
   select (:'prep2'::jsonb -> 'variantes' -> 0 ->> 'id') as v_cap \\gset
   reset role;
   select producto_id as prod_cap from retail.variantes where id = :'v_cap' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select ${RESUELVE("d1", "l1", "pend_new", SEP([["prod_cap", 2, [V("v_cap", 2)]]]))} as r \\gset
   select ${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 3, [V("pv_s", 3)]]]))} \\g /dev/null
   select ${RESUELVE("d1", "l1", null, SEP([["prod_n", 1, [V("v_m", 1)]]]))} \\g /dev/null
   select ${RESUELVE("d1", "l2", null, SEP([["prod_p", 2, [V("pv_s", 2)]]]))} \\g /dev/null
   select pg_temp.h(pg_temp.prepara(:'d1', :'di_l1', null, null, null, 'Chompa Tarde Conteo', ${MATRIZ(["t_s", "c1"])}, 99.90, null, null, null, false, gen_random_uuid(), null)) as tarde \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'prep2'::jsonb), :'r'::jsonb ->> 'entraron',
     (select estado from retail.despacho_pendientes where id = :'pend_new'),
     (select string_agg(estado, ',' order by estado) from retail.despacho_pendientes where despacho_id = :'d1'),
     ${CUENTAS("d1", "l1")}, ${CUENTAS("d1", "l2")},
     (retail.fn_recepcion_resultado(:'d1') ->> 'por_detallar'), :'tarde');`,
  "OK / 2 / resuelto / resuelto,resuelto / 10:10:0:0 / 2:2:0:0 / 0 / envio_ya_recibido",
);
caso(
  "R5 doble clic en «Hacer ahora»: no entra dos veces; el mismo token con otros datos no",
  `${CIERRE_CON_PENDIENTES}
   select gen_random_uuid() as tk \\gset
   select ${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 2, [V("pv_s", 2)]]]), { token: ":'tk'" })} as r1 \\gset
   select ${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 2, [V("pv_s", 2)]]]), { token: ":'tk'" })} as r2 \\gset
   select pg_temp.h(${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 1, [V("pv_s", 1)]]]), { token: ":'tk'" })}) as r3 \\gset
   reset role;
   select concat_ws(' / ', :'r1'::jsonb ->> 'repetido', :'r2'::jsonb ->> 'repetido', :'r2'::jsonb ->> 'entraron', :'r3',
     (select sum(cantidad) from retail.despacho_recibidos where pendiente_id = :'pend_det'),
     (select count(*) from retail.despacho_separaciones where despacho_id = :'d1'));`,
  "false / true / 2 / recepcion_otros_datos / 2 / 1",
);
caso(
  "R6 con el envío abierto se separa en el conteo; quien hizo la orden no; costo atípico: se confirma",
  `${BASE_D1}
   select pg_temp.h(${RESUELVE("d1", "l1", null, SEP([["prod_p", 1, [V("pv_s", 1)]]]))}) as abierto \\gset
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_p", 3]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 4)} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   select ${CIERRA("d1", [DEC("l1", { costo: 80 }), DEC("l2")])} \\g /dev/null
   reset role;
   select id as pend_det from retail.despacho_pendientes where despacho_id = :'d1' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.h(${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 1, [V("pv_s", 1)]]]))}) as atipico \\gset
   select pg_temp.e(${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 1, [V("pv_s", 1)]]]), { confirma: true })}) as confirmado \\gset
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select concat_ws(' / ', :'abierto', :'atipico', :'confirmado',
     pg_temp.h(${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 1, [V("pv_s", 1)]]]), { confirma: true })}));`,
  "pendiente_envio_abierto / recepcion_costo_atipico / OK / recibir_quien_compro",
);
caso(
  "R7 el papel de Compras se carga hasta su cupo también con lo que se detalla después",
  `${PAPEL_O1("comp_a", "4401", [["l1", 6, 30]])}${CIERRE_CON_PENDIENTES}
   select ${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 3, [V("pv_s", 3)]]]))} \\g /dev/null
   reset role;
   select concat_ws(' / ',
     (select string_agg(coalesce(r.pendiente_id::text = :'pend_det', false) || ':' || r.cantidad || ':' || (r.compra_item_id is not null), ','
                        order by r.creado_en, r.pendiente_id nulls first, r.compra_item_id nulls last, r.cantidad desc)
        from retail.despacho_recibidos r where r.despacho_item_id = :'di_l1'),
     (select sum(m.cantidad) from retail.movimientos m join retail.compra_items ci on ci.id = m.compra_item_id where ci.compra_id = :'comp_a'));`,
  "false:3:true,false:1:true,true:2:true,true:1:false / 6",
);

// I. EL CANDADO DE LA BASE: LA LÍNEA SIEMPRE CUADRA ------------------------------------------------------------------------
caso(
  "I1 aunque se escriba a mano: lo pendiente no pasa de lo contado, un pendiente no se resuelve sin entrar, no vuelve, no cambia ni se borra",
  `${CIERRE_CON_PENDIENTES}
   reset role;
   select concat_ws(' / ',
     pg_temp.intento($q$insert into retail.despacho_pendientes (despacho_id, despacho_item_id, tipo, cantidad, descripcion, anotado_por)
                        values ('$q$ || :'d1' || $q$', '$q$ || :'di_l1' || $q$', 'crear', 2, null, '$q$ || :'micaela_p' || $q$');
                        set constraints all immediate$q$),
     pg_temp.intento($q$update retail.despacho_pendientes set estado = 'resuelto', resuelto_por = '$q$ || :'micaela_p' || $q$', resuelto_en = now()
                        where id = '$q$ || :'pend_det' || $q$'; set constraints all immediate$q$),
     pg_temp.intento($q$update retail.despacho_pendientes set cantidad = 1 where id = '$q$ || :'pend_det' || $q$'$q$),
     pg_temp.intento($q$delete from retail.despacho_pendientes where id = '$q$ || :'pend_det' || $q$'$q$),
     pg_temp.intento($q$update retail.despacho_pendientes set estado = 'anulado', resuelto_por = '$q$ || :'micaela_p' || $q$', resuelto_en = now()
                        where id = '$q$ || :'pend_new' || $q$'; update retail.despacho_pendientes set estado = 'pendiente', resuelto_por = null,
                        resuelto_en = null where id = '$q$ || :'pend_new' || $q$'$q$),
     pg_temp.intento($q$insert into retail.despacho_pendientes (despacho_id, despacho_item_id, tipo, cantidad, anotado_por)
                        values ('$q$ || :'d1' || $q$', '$q$ || :'di_l1' || $q$', 'detalle', 1, '$q$ || :'micaela_p' || $q$')$q$));`,
  (o) =>
    /^23514\|En una línea de ENV-\d{6} lo que entró al stock \(4\) y lo pendiente \(7\) pasan de lo contado \(10\): recarga la pantalla \/ 23514\|En ENV-\d{6} un pendiente de 3 quedó resuelto con 0 adentro: recarga la pantalla \/ 42501\|Un pendiente no cambia: se resuelve, o se anula reabriendo el envío \/ 42501\|Un pendiente no se borra: se resuelve, o se anula reabriendo el envío \/ 42501\|Ese pendiente ya salió de la lista: no vuelve \/ 23514\|new row for relation "despacho_pendientes" violates check constraint "despacho_pendientes_que"$/.test(o),
);
caso(
  "I2 lo recibido de un envío cerrado solo lo anota «Hacer ahora»; un pendiente en un envío en camino no",
  `${CIERRE_CON_PENDIENTES}
   ${ENVIA("d_camino", [["l_o3", 1]])}${ITEM("d_camino", "l_o3")}
   reset role;
   select concat_ws(' / ',
     pg_temp.intento($q$insert into retail.despacho_recibidos (despacho_id, despacho_item_id, proveedor_id, categoria_id, marca_id, variante_id,
                        cantidad, danadas, costo_unitario, creado_por)
                        select despacho_id, despacho_item_id, proveedor_id, categoria_id, marca_id, variante_id, 1, 0, costo_unitario, creado_por
                          from retail.despacho_recibidos where despacho_id = '$q$ || :'d1' || $q$' limit 1$q$),
     pg_temp.intento($q$insert into retail.despacho_pendientes (despacho_id, despacho_item_id, tipo, cantidad, anotado_por)
                        values ('$q$ || :'d_camino' || $q$', '$q$ || :'di_l_o3' || $q$', 'crear', 1, '$q$ || :'micaela_p' || $q$')$q$));`,
  "23514|Solo se anota lo que llegó de un envío abierto / 23514|Solo queda pendiente lo de un envío que se abrió",
);

// L. LO QUE LEE LA PANTALLA ------------------------------------------------------------------------------------------------
caso(
  "L1 el número de la decisión 4: por sede, lo que queda por separar, detallar y crear, y desde cuándo; con Productos también se ve",
  `${CIERRE_CON_PENDIENTES}
   select pg_temp.pendientes(:'tru') as p \\gset
   select pg_temp.pendientes(:'lim') as plim \\gset
   ${rolDeMicaela("productos")}${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(pg_temp.pendientes(:'tru')) as con_productos \\gset
   ${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select pg_temp.h(pg_temp.pendientes(:'tru')) as sin_modulo \\gset
   reset role;
   select concat_ws(' / ',
     concat_ws(':', :'p'::jsonb ->> 'por_separar', :'p'::jsonb ->> 'por_detallar', :'p'::jsonb ->> 'por_crear', :'p'::jsonb ->> 'total',
               (:'p'::jsonb ->> 'desde') is not null, jsonb_array_length(:'p'::jsonb -> 'envios'),
               (:'p'::jsonb -> 'envios' -> 0 ->> 'despacho_id') = :'d1'),
     concat_ws(':', :'plim'::jsonb ->> 'total', jsonb_array_length(:'plim'::jsonb -> 'envios')), :'con_productos', :'sin_modulo');`,
  "3:3:2:8:t:1:t / 0:0 / OK / recibir_sin_modulo",
);
caso(
  "L2 la línea como la lee la pantalla: lo que está en el stock, lo sin separar y sus pendientes con lo que queda de cada uno",
  `${CIERRE_CON_PENDIENTES}
   select ${RESUELVE("d1", "l1", "pend_det", SEP([["prod_p", 1, [V("pv_s", 1)]]]))} \\g /dev/null
   select pg_temp.conteos(:'d1') as c \\gset
   reset role;
   select (select x from jsonb_array_elements(:'c'::jsonb -> 'conteos') x where x ->> 'despacho_item_id' = :'di_l1') as l1 \\gset
   select concat_ws(' / ', :'l1'::jsonb ->> 'en_stock', :'l1'::jsonb ->> 'sin_separar',
     (select string_agg(p ->> 'tipo' || ':' || (p ->> 'cantidad') || ':' || (p ->> 'quedan') || ':' || coalesce(p -> 'producto' ->> 'nombre', p ->> 'descripcion')
                        || ':' || (p -> 'anotado_por' ->> 'nombre' = :'micaela_n'), ',' order by p ->> 'tipo' desc)
        from jsonb_array_elements(:'l1'::jsonb -> 'pendientes') p));`,
  "5 / 1 / detalle:3:2:Chompa Catálogo Conteo:true,crear:2:2:Chompa con capucha:true",
);
caso(
  "L3 con el envío abierto, «sin separar» es lo contado que el borrador no separó",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_p", 3]], [[2]]))} as g \\gset
   select concat_ws(':', :'g'::jsonb ->> 'en_stock', :'g'::jsonb ->> 'sin_separar', jsonb_array_length(:'g'::jsonb -> 'pendientes'));`,
  "0:5:0",
);

// F. LA FORMA --------------------------------------------------------------------------------------------------------------
caso(
  "F1 una función por nombre, security definer, authenticated sí y anon no; las internas cerradas; RLS sin políticas; nadie lee directo",
  `reset role;
   select concat_ws(' / ',
     (select string_agg(p.proname || ':' || p.prosecdef || ':' || has_function_privilege('authenticated', p.oid, 'execute')
                        || ':' || has_function_privilege('anon', p.oid, 'execute'), ',' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname in ('cerrar_conteo_envio', 'resolver_pendiente_envio', 'fn_recepcion_pendientes',
                                                     'fn_recepcion_cerrar', 'fn_envio_cuentas', 'fn_envio_linea_cuadra')),
     (select string_agg(c.relname || ':' || c.relrowsecurity || ':' || has_table_privilege('authenticated', c.oid, 'select')
                        || ':' || (select count(*) from pg_policies p where p.schemaname = 'retail' and p.tablename = c.relname), ','
                        order by c.relname)
        from pg_class c where c.oid in ('retail.despacho_pendientes'::regclass, 'retail.despacho_separaciones'::regclass)));`,
  "cerrar_conteo_envio:true:true:false,fn_envio_cuentas:true:false:false,fn_envio_linea_cuadra:true:false:false," +
    "fn_recepcion_cerrar:true:false:false,fn_recepcion_pendientes:true:true:false,resolver_pendiente_envio:true:true:false / " +
    "despacho_pendientes:true:false:0,despacho_separaciones:true:false:0",
);


// D. DOS SESIONES A LA VEZ --------------------------------------------------------------------------------------------------
// Un envío de prueba de 3 COMMITEADO, sin stock (sin la migración en el preludio: corre sobre la base ya migrada). Se borra entero al
// terminar —y al empezar, si una corrida anterior se cortó—, también sus filas «solo se agregan» (session_replication_role = replica).
const MARCA_D = "ZZ Pendientes dos sesiones";
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
delete from retail.actividad a where a.tabla = 'despachos' and a.registro_id in (select id::text from _env);
delete from retail.despacho_separaciones x where x.despacho_id in (select id from _env);
delete from retail.despacho_pendientes x where x.despacho_id in (select id from _env);
delete from retail.despacho_conteos k where k.despacho_id in (select id from _env);
delete from retail.despacho_items di where di.despacho_id in (select id from _env);
delete from retail.despachos d where d.id in (select id from _env);
delete from retail.orden_compra_items i where i.orden_compra_id in (select o.id from retail.ordenes_compra o where o.proveedor_id in (select id from _prov));
delete from retail.ordenes_compra o where o.proveedor_id in (select id from _prov);
delete from retail.proveedores p where p.id in (select id from _prov);
commit;
select count(*) from retail.proveedores where nombre like '${MARCA_D}%';
`;
// El envío abierto con su línea contada en 3 (nada separado); `cerrado` lo deja cerrado. Devuelve «despacho|línea|versión».
const CREAR_D = (cerrado) => `
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
insert into retail.despacho_conteos (despacho_id, despacho_item_id, contadas, costo_unitario, contado_por) values (:'d', :'di', 3, 20, :'sandra_p');
-- Y 3 de algo que no estaba en la guía (posición 1): ahí no hay línea pedida que tomar, solo el envío.
insert into retail.despacho_conteos (despacho_id, extra_posicion, proveedor_id, categoria_id, marca_id, contadas, costo_unitario, contado_por)
  values (:'d', 1, :'prov', :'cat', :'marca', 3, 20, :'sandra_p');
${cerrado ? "update retail.despachos set estado = 'cerrado', cerrado_por = :'sandra_p', cerrado_en = now() where id = :'d';" : ""}
commit;
select :'d' || '|' || :'di' || '|' || (select version from retail.despachos where id = :'d');
`;
// Sandra (líder y Admin: firma ella sola) en su propia sesión: la pista del error o «OK».
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

async function dosSesiones(nombre, cerrado, primera, segunda, revisar, esperado) {
  if (!DOS_SESIONES) {
    console.log(`⤳ ${nombre}: se salta en la base local compartida (hace COMMIT); córrela con --contenedor <banco propio>`);
    return;
  }
  try {
    psql(LIMPIAR_D);
    const [d, di, version] = psql(CREAR_D(cerrado)).trim().split("\n").filter(Boolean).at(-1).split("|");
    // La primera hace lo suyo y se queda con el envío tomado 1.5 s antes de confirmar.
    const p1 = psqlAsync(`${SANDRA_HACE(primera(d, di, version))}\nselect pg_sleep(1.5);\ncommit;\n`);
    await dormir(400);
    // La segunda llega mientras tanto: espera el candado y, cuando la primera confirma, ve lo que dejó.
    const p2 = psqlAsync(`${SANDRA_HACE(segunda(d, di, version))}\nrollback;\n`);
    const [s1, s2] = await Promise.all([p1, p2]);
    const r1 = s1.stdout.trim().split("\n").filter(Boolean).at(-1);
    const r2 = s2.stdout.trim().split("\n").filter(Boolean).at(-1);
    const obtenido = `s1=${r1} · s2=${r2} · ${s2.ms > 900 ? "esperó" : `no esperó (${s2.ms} ms)`} · ${psql(revisar(d, di)).trim()}`;
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

const NUEVAS_2 = `'{"prendas": [], "nuevas": [{"cantidad": 2}]}'::jsonb`;
await dosSesiones(
  "D1 dos personas separan a la vez lo sin separar de la misma línea (3): la primera aparta 2, la segunda espera, ve que queda 1 y no pasa",
  true,
  (d, di) => `retail.resolver_pendiente_envio('${d}', '${di}', null, null, ${NUEVAS_2}, false, gen_random_uuid())`,
  (d, di) => `retail.resolver_pendiente_envio('${d}', '${di}', null, null, ${NUEVAS_2}, false, gen_random_uuid())`,
  (d) => `select 'pendientes=' || coalesce(sum(cantidad), 0) from retail.despacho_pendientes where despacho_id = '${d}';`,
  "s1=OK · s2=separado_de_mas · esperó · pendientes=2",
);
await dosSesiones(
  "D3 lo mismo con algo que no estaba en la guía (sin línea pedida que tomar): el envío es el que pone en fila",
  true,
  (d) => `retail.resolver_pendiente_envio('${d}', null, 1, null, ${NUEVAS_2}, false, gen_random_uuid())`,
  (d) => `retail.resolver_pendiente_envio('${d}', null, 1, null, ${NUEVAS_2}, false, gen_random_uuid())`,
  (d) => `select 'pendientes=' || coalesce(sum(cantidad), 0) from retail.despacho_pendientes where despacho_id = '${d}' and extra_posicion = 1;`,
  "s1=OK · s2=separado_de_mas · esperó · pendientes=2",
);
await dosSesiones(
  "D2 alguien guarda una línea mientras otra persona cierra: el cierre espera, ve el número nuevo y no firma lo que no vio",
  false,
  (d, di) => `retail.guardar_conteo_envio('${d}', '${di}', 2, null, 1, null, null, null, null)`,
  (d, di, version) => `retail.cerrar_conteo_envio('${d}', ${version}, jsonb_build_array(jsonb_build_object('despacho_item_id', '${di}', 'version', 1)), null, gen_random_uuid())`,
  (d, di) => `select 'contadas=' || (select contadas from retail.despacho_conteos where despacho_id = '${d}' and despacho_item_id = '${di}') || ' · ' || (select estado from retail.despachos where id = '${d}');`,
  "s1=OK · s2=conteo_cambiado · esperó · contadas=2 · abierto",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Pruebas del costo propio por prenda al cerrar un envío (ADR-0519; Felipe 2026-10-26) — migración
 * `20261026164000_costo_por_prenda_en_la_recepcion.sql`.
 *
 * LO QUE VIGILA. Que quien cierra un conteo pueda ponerle a cada prenda que separó un costo distinto del de su línea: que la prenda con
 * tallas entre al stock (promedio de su variante y fila de lo recibido) con SU costo y las demás con el de la línea; que lo que se detalle
 * después («Hacer ahora») entre con el costo de su prenda; que el costo se valide como el de la línea; que un costo propio fuera de lo
 * normal pida confirmar; que lo escrito vuelva en la lectura del conteo; y que sin costos propios todo siga idéntico (la línea manda).
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga DOS veces dentro de cada caso, así se prueba que se puede
 * pegar dos veces). Felipe (líder y Admin) hace las órdenes y los envíos; Micaela, de Tienda Trujillo y con un rol de prueba con Recibir,
 * cuenta y cierra. El resto de las migraciones ya están en la base (el CI las aplica todas): esta prueba solo recarga la suya.
 *   K  CERRAR con costo por prenda: el costo de cada una y el de la línea; sin costos propios, igual que antes; lo que se lee de vuelta.
 *   H  HACER AHORA: lo pendiente de una prenda entra con su costo.
 *   V  VALIDAR: lo que se rechaza, lo que se ignora y el costo atípico.
 *   S  LA FORMA: las piezas internas cerradas y la columna.
 *
 * USO
 *   node scripts/pruebas/costo_por_prenda.mjs                              → contra el stack local compartido
 *   node scripts/pruebas/costo_por_prenda.mjs --contenedor supabase_db_x   → contra otro stack (un banco de pruebas propio)
 *   node scripts/pruebas/costo_por_prenda.mjs --sin-migracion              → sin cargar la migración: contra una base sin el cambio,
 *                                                                             la prueba tiene que FALLAR
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
const MIGRACIONES = SIN_MIGRACION
  ? ""
  : readFileSync(join(RAIZ, "supabase", "migrations", "20261026164000_costo_por_prenda_en_la_recepcion.sql"), "utf8")
      .replace(/^set lock_timeout.*$/m, "")
      .replace(/^reset lock_timeout;$/m, "");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const SANDRA = "22222222-2222-4222-8222-000000000005";

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
// ADR-0517: un Admin recibe lo que él mismo compró. Para probar que quien compra sigue frenado, Felipe baja a «integrante» en Dynamic (sigue
// siendo líder aquí) y firma por el combo «Responsable» como cualquier cuenta que no es Admin: se elige a sí mismo, de turno.
const FELIPE_SIN_SER_ADMIN = `reset role;\nupdate public.personas set rol = 'integrante' where auth_user_id = '${FELIPE}';\n`;
const FELIPE_EN_TIENDA = `select set_config('request.headers', json_build_object('x-responsable', :'felipe_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null\n`;

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
  values (:'micaela_p', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date),
         (:'felipe_p', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
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


// Lo que decide quien cierra por un conteo, con costos propios por prenda: `costos` = [[producto, costo]] (el producto es una variable de psql).
const COSTOS = (pares) => `jsonb_build_object(${pares.map(([p, c]) => `:'${p}'::text, ${c}`).join(", ")})`;
const DEC_K = (item, { costo = null, costos = null, confirma = false, falt = null } = {}) =>
  J({
    despacho_item_id: `:'di_${item}'`,
    version: `:k_${item}`,
    costo_unitario: costo === null ? "null::numeric" : `${costo}`,
    ...(costos ? { costos_prendas: typeof costos === "string" ? costos : COSTOS(costos) } : {}),
    confirma_costo: confirma ? "true" : "false",
    faltante_causa: falt ? `'${falt}'` : "null::text",
    sobrante_causa: "null::text",
    nota: "null::text",
  });
// Lo que quedó recibido de una línea: «cantidad@costo» por fila, en orden estable.
const RECIBIDOS = (item) =>
  `(select string_agg(r.cantidad || '@' || r.costo_unitario, ',' order by r.costo_unitario, r.cantidad desc, r.variante_id) from retail.despacho_recibidos r where r.despacho_item_id = :'di_${item}')`;

// K. CERRAR CON COSTO POR PRENDA ------------------------------------------------------------------------------------------
caso(
  "K1 una prenda con costo propio entra con él y las demás con el de la línea: la fila de lo recibido, el costo de cada variante y el conteo lo dicen",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_n", 10, [V("v_s", 6), V("v_m", 4)]]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 4, SEP([["prod_p", 4, [V("pv_s", 4)]]]))} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   select ${CIERRA("d1", [DEC_K("l1", { costos: [["prod_n", "35.5"]] }), DEC_K("l2")])} as r \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb),
     ${RECIBIDOS("l1")}, ${RECIBIDOS("l2")},
     (select costo from retail.variantes where id = :'v_s') || ',' || (select costo from retail.variantes where id = :'v_m'),
     replace((select k.costos_prendas::text from retail.despacho_conteos k where k.despacho_item_id = :'di_l1'), :'prod_n', '%PROD_N%'),
     (select k.costos_prendas::text from retail.despacho_conteos k where k.despacho_item_id = :'di_l2'));`,
  "OK / 6@35.50,4@35.50 / 4@50.00 / 35.50,35.50 / " + '{"%PROD_N%": 35.5}' + " / {}",
);
caso(
  "K2 sin costos propios, todo igual que antes: cada variante entra con el costo de su línea y el conteo no guarda ningún costo de prenda",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_n", 10, [V("v_s", 6), V("v_m", 4)]]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 4, SEP([["prod_p", 4, [V("pv_s", 4)]]]))} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   select ${CIERRA("d1", [DEC_K("l1", { costo: 31 }), DEC_K("l2")])} as r \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), ${RECIBIDOS("l1")}, ${RECIBIDOS("l2")},
     (select count(*) from retail.despacho_conteos k where k.despacho_id = :'d1' and k.costos_prendas <> '{}'::jsonb));`,
  "OK / 6@31.00,4@31.00 / 4@50.00 / 0",
);
caso(
  "K3 el costo de la línea cambia solo a las prendas SIN costo propio: la que tiene el suyo no se mueve",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_n", 6, [V("v_s", 6)]], ["prod_p", 4, [V("pv_s", 4)]]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 4)} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   select ${CIERRA("d1", [DEC_K("l1", { costo: 33, costos: [["prod_p", "45"]] }), DEC_K("l2")])} as r \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), ${RECIBIDOS("l1")},
     (select k.costo_unitario || ':' || (k.costos_prendas ->> :'prod_p') from retail.despacho_conteos k where k.despacho_item_id = :'di_l1'));`,
  "OK / 6@33.00,4@45.00 / 33.00:45",
);
caso(
  "K4 la lectura del conteo trae el costo propio de las prendas, para que la pantalla lo muestre al reabrir o recargar",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_n", 10, [V("v_s", 6), V("v_m", 4)]]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 4, SEP([["prod_p", 4, [V("pv_s", 4)]]]))} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   select ${CIERRA("d1", [DEC_K("l1", { costos: [["prod_n", "35.5"]] }), DEC_K("l2")])} \\g /dev/null
   select pg_temp.conteos(:'d1') as lec \\gset
   select concat_ws(' / ',
     replace((select c ->> 'costos_prendas' from jsonb_array_elements(:'lec'::jsonb -> 'conteos') c where c ->> 'despacho_item_id' = :'di_l1'), :'prod_n', '%PROD_N%'),
     (select c ->> 'costos_prendas' from jsonb_array_elements(:'lec'::jsonb -> 'conteos') c where c ->> 'despacho_item_id' = :'di_l2'));`,
  '{"%PROD_N%": 35.5} / {}',
);

// H. HACER AHORA ----------------------------------------------------------------------------------------------------------
caso(
  "H1 lo pendiente de una prenda entra con su costo al detallarse («Hacer ahora»), y lo que entró al cerrar conserva el de la línea",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_n", 4, [V("v_s", 3), V("v_m", 1)]], ["prod_p", 3]], [[2, "Chompa con capucha"]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 2)} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   select ${CIERRA("d1", [DEC_K("l1", { costos: [["prod_p", "41.5"]] }), DEC_K("l2", { falt: "no_vino" })])} as r \\gset
   reset role;
   select id as pend_det from retail.despacho_pendientes where despacho_id = :'d1' and tipo = 'detalle' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.resuelve(:'d1', :'di_l1', null::int, :'pend_det', ${SEP([["prod_p", 3, [V("pv_s", 3)]]])}, false, null::uuid) as h \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), pg_temp.e(:'h'::jsonb),
     (select string_agg(r.cantidad || '@' || r.costo_unitario, ',' order by r.costo_unitario, r.cantidad desc) from retail.despacho_recibidos r
       where r.despacho_item_id = :'di_l1' and r.pendiente_id is null),
     (select string_agg(r.cantidad || '@' || r.costo_unitario, ',') from retail.despacho_recibidos r where r.pendiente_id = :'pend_det'));`,
  "OK / OK / 3@30.00,1@30.00 / 3@41.50",
);

caso(
  "H2 una prenda NUEVA (todavía sin crear) lleva su costo por su descripción: al crearla y resolver su pendiente entra con él; las demás con el de la línea",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_n", 4, [V("v_s", 3), V("v_m", 1)]], ["prod_p", 3]], [[2, "Chompa con capucha"]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 2)} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   select ${CIERRA("d1", [DEC_K("l1", { costos: "jsonb_build_object('nueva:Chompa con capucha'::text, 41.5)" }), DEC_K("l2", { falt: "no_vino" })])} as r \\gset
   reset role;
   select id as pend_new from retail.despacho_pendientes where despacho_id = :'d1' and tipo = 'crear' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.prepara(:'d1', :'di_l1', null, null, null, 'Chompa Capucha Costo', ${MATRIZ(["t_s", "c1"])}, 99.90, null, null, null, false, gen_random_uuid(), null) as prep2 \\gset
   select (:'prep2'::jsonb -> 'variantes' -> 0 ->> 'id') as v_cap \\gset
   reset role;
   select producto_id as prod_cap from retail.variantes where id = :'v_cap' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.resuelve(:'d1', :'di_l1', null::int, :'pend_new', ${SEP([["prod_cap", 2, [V("v_cap", 2)]]])}, false, null::uuid) as h \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), pg_temp.e(:'h'::jsonb),
     (select k.costos_prendas::text from retail.despacho_conteos k where k.despacho_item_id = :'di_l1'),
     (select string_agg(r.cantidad || '@' || r.costo_unitario, ',') from retail.despacho_recibidos r where r.pendiente_id = :'pend_new'),
     (select costo from retail.variantes where id = :'v_cap'),
     ${RECIBIDOS("l1")});`,
  'OK / OK / {"nueva:Chompa con capucha": 41.5} / 2@41.50 / 41.50 / 3@30.00,1@30.00,2@41.50',
);

// V. VALIDAR --------------------------------------------------------------------------------------------------------------
caso(
  "V1 un costo propio se valida como el de la línea (negativo, sobre 99 999.99, tres decimales, texto), y vacío o null es «el de la línea»",
  `reset role;
   select jsonb_build_object('prendas', jsonb_build_array(jsonb_build_object('producto_id', :'prod_p', 'cantidad', 2))) as sep \\gset
   select concat_ws(' / ',
     pg_temp.intento(format('select retail.fn_envio_costos_prendas(jsonb_build_object(%L, jsonb_build_object(%L, -1)), %L::jsonb, %L)', 'costos_prendas', :'prod_p', :'sep', 'x')),
     pg_temp.intento(format('select retail.fn_envio_costos_prendas(jsonb_build_object(%L, jsonb_build_object(%L, 100000)), %L::jsonb, %L)', 'costos_prendas', :'prod_p', :'sep', 'x')),
     pg_temp.intento(format('select retail.fn_envio_costos_prendas(jsonb_build_object(%L, jsonb_build_object(%L, 12.345)), %L::jsonb, %L)', 'costos_prendas', :'prod_p', :'sep', 'x')),
     pg_temp.intento(format('select retail.fn_envio_costos_prendas(jsonb_build_object(%L, jsonb_build_object(%L, %L)), %L::jsonb, %L)', 'costos_prendas', :'prod_p', 'abc', :'sep', 'x')),
     retail.fn_envio_costos_prendas(jsonb_build_object('costos_prendas', jsonb_build_object(:'prod_p', '')), :'sep'::jsonb, 'x')::text,
     retail.fn_envio_costos_prendas(jsonb_build_object('costos_prendas', jsonb_build_object(:'prod_p', null)), :'sep'::jsonb, 'x')::text,
     retail.fn_envio_costos_prendas(jsonb_build_object('costos_prendas', jsonb_build_object(:'prod_p', '0')), :'sep'::jsonb, 'x')::text = jsonb_build_object(:'prod_p'::text, 0)::text);`,
  [
    "P0001|El costo de una prenda de x va de S/ 0 a S/ 99 999.99, con hasta dos decimales",
    "P0001|El costo de una prenda de x va de S/ 0 a S/ 99 999.99, con hasta dos decimales",
    "P0001|El costo de una prenda de x va de S/ 0 a S/ 99 999.99, con hasta dos decimales",
    "P0001|El costo de una prenda de x no se entiende: escribe solo números",
    "{}",
    "{}",
    "t",
  ].join(" / "),
);
caso(
  "V2 una prenda que no está separada en esa línea se ignora (la pantalla pudo quedarse vieja), y sin la clave o con otra forma no hay costos propios",
  `reset role;
   select jsonb_build_object('prendas', jsonb_build_array(jsonb_build_object('producto_id', :'prod_p', 'cantidad', 2))) as sep \\gset
   select concat_ws(' / ',
     retail.fn_envio_costos_prendas(jsonb_build_object('costos_prendas', jsonb_build_object(:'prod_g', 50)), :'sep'::jsonb, 'x')::text,
     retail.fn_envio_costos_prendas('{}'::jsonb, :'sep'::jsonb, 'x')::text,
     retail.fn_envio_costos_prendas(jsonb_build_object('costos_prendas', 'texto'), :'sep'::jsonb, 'x')::text,
     retail.fn_envio_costos_prendas(jsonb_build_object('costos_prendas', jsonb_build_array(1)), :'sep'::jsonb, 'x')::text,
     retail.fn_envio_costos_prendas(null, :'sep'::jsonb, 'x')::text,
     retail.fn_envio_costos_prendas(jsonb_build_object('costos_prendas', jsonb_build_object('nueva:Otra', 20)), :'sep'::jsonb, 'x')::text,
     retail.fn_envio_costos_prendas(jsonb_build_object('costos_prendas', jsonb_build_object('nueva:Gorra', 20, 'nueva:gorra', 30)),
       jsonb_build_object('nuevas', jsonb_build_array(jsonb_build_object('descripcion', 'Gorra', 'cantidad', 2))), 'x')::text);`,
  '{} / {} / {} / {} / {} / {} / {"nueva:Gorra": 20}',
);
caso(
  "V3 un costo propio fuera de lo normal pide confirmar aunque el de la línea esté bien, y confirmado entra; sin confirmar no escribe nada",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_n", 10, [V("v_s", 6), V("v_m", 4)]]]))} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 4, SEP([["prod_p", 4, [V("pv_s", 4)]]]))} \\g /dev/null
   ${VERS("d1", ["l1", "l2"])}
   select ${CIERRA("d1", [DEC_K("l1"), DEC_K("l2", { costos: [["prod_p", "2500"]] })])} as sin \\gset
   select ${CIERRA("d1", [DEC_K("l1"), DEC_K("l2", { costos: [["prod_p", "2500"]], confirma: true })])} as con \\gset
   reset role;
   select concat_ws(' / ', pg_temp.h(:'sin'::jsonb), pg_temp.h(:'con'::jsonb), ${RECIBIDOS("l2")},
     (select estado from retail.despachos where id = :'d1'));`,
  "recepcion_costo_atipico / OK / 4@2500.00 / cerrado",
);

// S. LA FORMA -------------------------------------------------------------------------------------------------------------
caso(
  "S1 las piezas internas son de la base (ni authenticated ni anon las ejecutan) y la columna nace vacía y con forma de objeto",
  `reset role;
   select concat_ws(' / ',
     (select string_agg(p.proname || ':' || p.prosecdef || ':' || has_function_privilege('authenticated', p.oid, 'execute') || ':' || has_function_privilege('anon', p.oid, 'execute'),
                        ',' order by p.proname)
        from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_envio_costos_prendas', 'fn_recepcion_costos_a_variantes')),
     (select column_default || ':' || is_nullable from information_schema.columns where table_schema = 'retail' and table_name = 'despacho_conteos' and column_name = 'costos_prendas'),
     (select count(*) from pg_constraint where conrelid = 'retail.despacho_conteos'::regclass and conname = 'despacho_conteos_costos_prendas_objeto'));`,
  "fn_envio_costos_prendas:true:false:false,fn_recepcion_costos_a_variantes:true:false:false / '{}'::jsonb:NO / 1",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Pruebas del conteo guardado de un envío (ADR-0393, actividad 2; Felipe 2026-10-13) — migraciones
 * `20261013170000_recepcion_un_solo_camino_de_cierre.sql` y `20261013171000_conteo_de_envio.sql`.
 *
 * LO QUE VIGILA. Que lo contado de un envío quede en la base línea por línea desde el primer número (un F5 no lo borra), que varias
 * personas cuenten a la vez y gane el último CON AVISO de lo que pisó (decisión 9 de Felipe), que lo separado («¿Qué chompas son?»)
 * nunca pase de lo contado ni traiga prendas de otra categoría, que se pueda anotar lo que no estaba en la guía, y que lo recibido con
 * el formulario de la fase 4 deje también su conteo. Los permisos son los de recibir: el módulo Recibir, la sede del envío y que quien
 * firma no haya hecho ninguna de sus órdenes (decisión 17 de ADR-0362).
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las dos migraciones se cargan DOS veces dentro de cada caso, así se prueba que
 * se pueden pegar dos veces). Micaela es de Tienda Trujillo y no es líder (un rol de prueba con los módulos que pide cada caso; marcó su
 * entrada y firma ella en el combo «Responsable»); Felipe es líder y Admin y hace las órdenes y los envíos; Sandra es líder y Admin.
 *   P  PERMISOS: sin Recibir, 42501 al guardar y al leer; otra sede no; quien hizo la orden no; sin elegir responsable no.
 *   E  ESTADOS: en camino, anulado y cerrado no se cuentan.
 *   G  GUARDAR: la primera vez (versión 1, quién); de nuevo sobre lo visto (sin aviso); lo mismo dos veces (sin aviso); otra persona
 *      sin haberlo visto (guarda lo suyo y devuelve lo pisado).
 *   S  LO SEPARADO: prendas conocidas con y sin tallas y nuevas por cantidad, con sus nombres; la forma mala, lo que pasa de lo contado
 *      y lo ajeno (otra categoría, una prenda que no existe, una talla de otra prenda o inactiva) se rechazan sin escribir.
 *   X  FUERA DE LA GUÍA: anotar (posición 1, 2…), corregir; una posición que no existe, un proveedor ajeno o una categoría inactiva no.
 *   L  LECTURA: las líneas del envío primero y lo de fuera de la guía después, con quién contó; un envío que no existe da null.
 *   R  RECIBIR CON EL FORMULARIO: cada línea queda con su conteo todo detallado y su costo; lo de fuera de la guía que no vino queda en
 *      0; cerrado, ni se guarda, ni se borra, ni se cambia.
 *   F  LA FORMA: una función por nombre, security definer, authenticated sí y anon no; las internas cerradas; RLS sin políticas; nadie
 *      lee directo; lo separado nunca pasa de lo contado aunque se escriba a mano.
 *
 * USO
 *   node scripts/pruebas/conteo_de_envio.mjs                                → contra el stack local compartido
 *   node scripts/pruebas/conteo_de_envio.mjs --contenedor supabase_db_x     → contra otro stack (un banco de pruebas propio)
 *   node scripts/pruebas/conteo_de_envio.mjs --sin-migracion                → sin cargar las migraciones: contra una base sin el
 *                                                                               cambio, la prueba tiene que FALLAR
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
  : ["20261013170000_recepcion_un_solo_camino_de_cierre.sql", "20261013171000_conteo_de_envio.sql"]
      .map((f) =>
        readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8")
          .replace(/^set lock_timeout.*$/m, "")
          .replace(/^reset lock_timeout;$/m, ""),
      )
      .join("\n");

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

const QUIEN_COMPRO = "42501|recibir_quien_compro|Hiciste esta orden: la tiene que recibir otra persona de la tienda";

// P. PERMISOS -------------------------------------------------------------------------------------------------------------
caso(
  "P1 sin Recibir (con Existencias): 42501 al guardar y al leer lo contado",
  `${ENVIA("d1", [["l1", 10]])}${ITEM("d1", "l1")}
   ${como(SANDRA)}${SIN_ENCABEZADOS}${ABRE("d1")}
   ${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select concat_ws(' / ', pg_temp.e(${GUARDA("d1", "di_l1", 3)}), pg_temp.e(pg_temp.conteos(:'d1')));`,
  [
    "42501|recibir_sin_modulo|Contar un envío necesita el módulo «Recibir mercadería» en tu rol",
    "42501|envios_sin_modulo|Ver un envío necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol",
  ].join(" / "),
);
caso(
  "P2 otra sede no; quien hizo la orden no; sin elegir responsable no",
  `${ENVIA("d_lim", [["l_o2", 2]], { sede: ":'lim'" })}${ITEM("d_lim", "l_o2")}
   ${ENVIA("d3", [["l_o3", 3]])}${ITEM("d3", "l_o3")}
   ${ENVIA("d1", [["l1", 10]])}${ITEM("d1", "l1")}
   ${como(SANDRA)}${SIN_ENCABEZADOS}${ABRE("d_lim")}${ABRE("d3")}${ABRE("d1")}
   ${MICAELA_RECIBE}
   select pg_temp.e(${GUARDA("d_lim", "di_l_o2", 2)}) as otra \\gset
   select pg_temp.e(${GUARDA("d3", "di_l_o3", 3)}) as suya \\gset
   ${SIN_ENCABEZADOS}
   select pg_temp.e(${GUARDA("d1", "di_l1", 3)}) as sin_resp \\gset
   reset role;
   select concat_ws(' / ', :'otra', :'suya', :'sin_resp', (select count(*) from retail.despacho_conteos where despacho_id in (:'d_lim', :'d3', :'d1')));`,
  [
    "42501|recibir_otra_sede|Este envío va a Tienda Lima: lo recibe esa tienda",
    QUIEN_COMPRO,
    "42501|responsable_requerido|Elige quién hace esta operación",
    "0",
  ].join(" / "),
);

// E. ESTADOS DEL ENVÍO ----------------------------------------------------------------------------------------------------
caso(
  "E1 en camino, anulado y cerrado no se cuentan",
  `${ENVIA("d_camino", [["l_o3", 2]])}${ITEM("d_camino", "l_o3")}
   ${ENVIA("d_anul", [["l_o3", 1]])}${ITEM("d_anul", "l_o3")}
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.anular_envio(:'d_anul', :v_d_anul, 'Prueba: no llega') \\g /dev/null
   ${BASE_D1}
   select ${`pg_temp.recibe(:'d1', :v_d1, ${A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [], { falt: "no_vino" }))}, '[]'::jsonb, null, null)`} \\g /dev/null
   select concat_ws(' / ', pg_temp.h(${GUARDA("d_camino", "di_l_o3", 1)}), pg_temp.h(${GUARDA("d_anul", "di_l_o3", 1)}),
     pg_temp.e(${GUARDA("d1", "di_l1", 1, VACIO, "1")}));`,
  "envio_sin_abrir / envio_anulado / P0001|envio_ya_recibido|Este envío ya se recibió: para corregir lo contado, reábrelo",
);

// G. GUARDAR: GANA EL ÚLTIMO, CON AVISO -----------------------------------------------------------------------------------
caso(
  "G1 la primera vez: versión 1, quién contó y sin aviso; lo que no se separó no se inventa",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10)} as g \\gset
   select concat_ws(':', :'g'::jsonb ->> 'contadas', :'g'::jsonb ->> 'separadas', :'g'::jsonb ->> 'version',
     (:'g'::jsonb -> 'contado_por' ->> 'nombre') = :'micaela_n', coalesce(:'g'::jsonb ->> 'pisaste', 'sin aviso'),
     jsonb_typeof(:'g'::jsonb -> 'categoria'), jsonb_array_length(:'g'::jsonb -> 'separado' -> 'prendas'));`,
  "10:0:1:t:sin aviso:null:0",
);
caso(
  "G2 de nuevo sobre lo visto, sin aviso; y lo mismo otra vez con una versión vieja tampoco avisa (un reintento)",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 8)} as g1 \\gset
   select ${GUARDA("d1", "di_l1", 10, VACIO, "1")} as g2 \\gset
   select ${GUARDA("d1", "di_l1", 10, VACIO, "1")} as g3 \\gset
   select concat_ws(':', :'g2'::jsonb ->> 'version', coalesce(:'g2'::jsonb ->> 'pisaste', '-'),
     :'g3'::jsonb ->> 'version', coalesce(:'g3'::jsonb ->> 'pisaste', '-'), :'g3'::jsonb ->> 'contadas');`,
  "2:-:3:-:10",
);
caso(
  "G3 otra persona sin haber visto lo de Micaela: guarda lo suyo y le devuelve lo pisado (cuántas, quién y su versión)",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 8, SEP([["prod_p", 2]]))} as g1 \\gset
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   select ${GUARDA("d1", "di_l1", 10)} as g2 \\gset
   select concat_ws(':', :'g2'::jsonb ->> 'contadas', (:'g2'::jsonb -> 'contado_por' ->> 'nombre') = :'sandra_n',
     :'g2'::jsonb -> 'pisaste' ->> 'contadas', (:'g2'::jsonb -> 'pisaste' -> 'contado_por' ->> 'nombre') = :'micaela_n',
     :'g2'::jsonb -> 'pisaste' ->> 'version', :'g2'::jsonb -> 'pisaste' -> 'separado' -> 'prendas' -> 0 ->> 'nombre',
     :'g2'::jsonb ->> 'version');`,
  "10:t:8:t:1:Chompa Catálogo Conteo:2",
);

// S. LO SEPARADO ----------------------------------------------------------------------------------------------------------
caso(
  "S1 prendas conocidas (una con sus tallas, otra sin) y nuevas por cantidad, con sus nombres; las tallas en 0 no cuentan",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10, SEP([["prod_p", 3, [V("pv_s", 3)]], ["prod_n", 4, [V("v_s", 4), V("v_m", 0)]]], [[2, "Chompa con capucha"]]))} as g \\gset
   select concat_ws(':', :'g'::jsonb ->> 'separadas',
     :'g'::jsonb -> 'separado' -> 'prendas' -> 0 ->> 'nombre', :'g'::jsonb -> 'separado' -> 'prendas' -> 0 -> 'variantes' -> 0 ->> 'talla',
     :'g'::jsonb -> 'separado' -> 'prendas' -> 1 ->> 'nombre',
     jsonb_array_length(:'g'::jsonb -> 'separado' -> 'prendas' -> 1 -> 'variantes'),
     :'g'::jsonb -> 'separado' -> 'nuevas' -> 0 ->> 'descripcion', :'g'::jsonb -> 'separado' -> 'nuevas' -> 0 ->> 'cantidad');`,
  "9:Chompa Catálogo Conteo:S:Chompa Trenzada Conteo:1:Chompa con capucha:2",
);
caso(
  "S2 la forma mala se rechaza sin escribir: pasa de lo contado, prenda repetida, tallas que no suman, cantidades, descripción larga",
  `${BASE_D1}
   select concat_ws(' / ',
     pg_temp.h(${GUARDA("d1", "di_l1", 3, SEP([["prod_p", 2]], [[2]]))}),
     pg_temp.h(${GUARDA("d1", "di_l1", 9, SEP([["prod_p", 2], ["prod_p", 1]]))}),
     pg_temp.h(${GUARDA("d1", "di_l1", 9, SEP([["prod_p", 3, [V("pv_s", 2)]]]))}),
     pg_temp.h(${GUARDA("d1", "di_l1", 9, SEP([["prod_p", 0]]))}),
     pg_temp.h(${GUARDA("d1", "di_l1", 9, SEP([], [[0]]))}),
     pg_temp.h(${GUARDA("d1", "di_l1", 9, SEP([], [[1, "x".repeat(201)]]))}),
     pg_temp.h(${GUARDA("d1", "di_l1", 9, "'[1]'::jsonb")}),
     pg_temp.h(${GUARDA("d1", "di_l1", -1)}),
     jsonb_array_length(pg_temp.conteos(:'d1') -> 'conteos'));`,
  "conteo_separado_de_mas / conteo_prenda_repetida / conteo_detalle_no_suma / conteo_cantidad / conteo_cantidad / conteo_nueva_descripcion / conteo_separado / conteo_contadas / 0",
);
caso(
  "S3 lo ajeno se rechaza: otra categoría, una prenda que no existe, una talla de otra prenda, una talla inactiva",
  `${BASE_D1}
   select concat_ws(' / ',
     pg_temp.e(${GUARDA("d1", "di_l1", 9, SEP([["prod_g", 1]]))}),
     pg_temp.h(${GUARDA("d1", "di_l1", 9, `jsonb_build_object('prendas', jsonb_build_array(jsonb_build_object('producto_id', gen_random_uuid(), 'cantidad', 1)), 'nuevas', '[]'::jsonb)`)}),
     pg_temp.h(${GUARDA("d1", "di_l1", 9, SEP([["prod_p", 1, [V("v_s", 1)]]]))}),
     pg_temp.h(${GUARDA("d1", "di_l1", 9, SEP([["prod_p", 1, [V("pv_l", 1)]]]))}),
     jsonb_array_length(pg_temp.conteos(:'d1') -> 'conteos'));`,
  "P0001|conteo_prenda_ajena|Una de las prendas de Chompas Conteo · Marca Conteo Prueba · Chompa cuello alto es de otra categoría o marca: búscala en su línea / conteo_prenda_no_existe / conteo_variante_ajena / conteo_variante_ajena / 0",
);

// X. FUERA DE LA GUÍA -----------------------------------------------------------------------------------------------------
caso(
  "X1 anotar lo que no estaba en la guía (posición 1 y 2, el único proveedor del envío), y corregirlo",
  `${BASE_D1}
   select ${GUARDA("d1", null, 3, SEP([["prod_g", 1]]), "null::int", { cat: ":'cat2'", marca: ":'marca'" })} as x1 \\gset
   select ${GUARDA("d1", null, 2, VACIO, "null::int", { cat: ":'cat'", marca: ":'marca'" })} as x2 \\gset
   select ${GUARDA("d1", null, 5, SEP([["prod_g", 2]]), "1", { extra: "1" })} as x1b \\gset
   select concat_ws(':', :'x1'::jsonb ->> 'extra_posicion', :'x1'::jsonb -> 'proveedor' ->> 'nombre', :'x1'::jsonb -> 'categoria' ->> 'nombre',
     :'x2'::jsonb ->> 'extra_posicion', :'x1b'::jsonb ->> 'contadas', :'x1b'::jsonb ->> 'version', coalesce(:'x1b'::jsonb ->> 'pisaste', '-'),
     :'x1b'::jsonb -> 'categoria' ->> 'nombre');`,
  "1:Proveedor Conteo Prueba:Gorros Conteo:2:5:2:-:Gorros Conteo",
);
caso(
  "X2 no: una posición que no existe, un proveedor que no viene en el envío, una categoría inactiva",
  `${BASE_D1}
   select concat_ws(' / ',
     pg_temp.h(${GUARDA("d1", null, 1, VACIO, "null::int", { extra: "9" })}),
     pg_temp.h(${GUARDA("d1", null, 1, VACIO, "null::int", { prov: ":'prov2'", cat: ":'cat2'", marca: ":'marca'" })}),
     pg_temp.h(${GUARDA("d1", null, 1, VACIO, "null::int", { cat: ":'cat_off'", marca: ":'marca'" })}),
     pg_temp.h(${GUARDA("d1", "di_l1", 1, VACIO, "null::int", { extra: "1" })}),
     jsonb_array_length(pg_temp.conteos(:'d1') -> 'conteos'));`,
  "conteo_extra_no_existe / recepcion_extra_proveedor / recepcion_extra_categoria / conteo_linea / 0",
);

// L. LECTURA --------------------------------------------------------------------------------------------------------------
caso(
  "L1 lo contado de un envío: las líneas en su orden, después lo de fuera de la guía, con quién contó; uno que no existe da null",
  `${BASE_D1}
   select ${GUARDA("d1", null, 3, VACIO, "null::int", { cat: ":'cat2'", marca: ":'marca'" })} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 4)} \\g /dev/null
   select ${GUARDA("d1", "di_l1", 10)} \\g /dev/null
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   select ${GUARDA("d1", "di_l2", 3, VACIO, "1")} \\g /dev/null
   ${MICAELA_RECIBE}
   select pg_temp.conteos(:'d1') as c \\gset
   select concat_ws(' / ', :'c'::jsonb ->> 'estado',
     (select string_agg(concat_ws(':', coalesce(x ->> 'extra_posicion', 'línea'), x ->> 'contadas',
                                  case x -> 'contado_por' ->> 'nombre' when :'micaela_n' then 'Micaela' when :'sandra_n' then 'Sandra' end), ',' order by o)
        from jsonb_array_elements(:'c'::jsonb -> 'conteos') with ordinality t(x, o)),
     coalesce(pg_temp.conteos(gen_random_uuid()) ->> 'estado', 'null'));`,
  "abierto / línea:10:Micaela,línea:3:Sandra,1:3:Micaela / null",
);

// R. RECIBIR CON EL FORMULARIO DE LA FASE 4 -------------------------------------------------------------------------------
caso(
  "R1 recibir con el formulario deja cada línea con su conteo todo detallado y su costo; lo de fuera de la guía que no vino queda en 0",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 5)} \\g /dev/null
   select ${GUARDA("d1", null, 3, VACIO, "null::int", { cat: ":'cat2'", marca: ":'marca'" })} \\g /dev/null
   select pg_temp.e(pg_temp.recibe(:'d1', :v_d1, ${A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [], { falt: "no_vino" }))}, '[]'::jsonb, null, null)) as r \\gset
   reset role;
   select concat_ws(' / ', :'r',
     (select concat_ws(':', k.contadas, jsonb_array_length(k.separado -> 'prendas'), k.separado -> 'prendas' -> 0 ->> 'cantidad',
                       jsonb_array_length(k.separado -> 'prendas' -> 0 -> 'variantes'), k.costo_unitario, k.version,
                       (k.separado -> 'prendas' -> 0 ->> 'producto_id') = :'prod_n', k.contado_por = :'micaela_p')
        from retail.despacho_conteos k where k.despacho_item_id = :'di_l1'),
     (select concat_ws(':', k.contadas, jsonb_array_length(k.separado -> 'prendas'), k.costo_unitario)
        from retail.despacho_conteos k where k.despacho_item_id = :'di_l2'),
     (select concat_ws(':', k.extra_posicion, k.contadas, k.version) from retail.despacho_conteos k
       where k.despacho_id = :'d1' and k.extra_posicion is not null),
     (select d.estado from retail.despachos d where d.id = :'d1'));`,
  "OK / 10:1:10:2:30.00:2:t:t / 0:0:50.00 / 1:0:2 / cerrado",
);
caso(
  "R2 cerrado: lo contado no se guarda, no se borra ni se cambia, aunque sea a mano",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10)} \\g /dev/null
   select pg_temp.recibe(:'d1', :v_d1, ${A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [], { falt: "no_vino" }))}, '[]'::jsonb, null, null) \\g /dev/null
   reset role;
   select concat_ws(' / ',
     pg_temp.intento(format('delete from retail.despacho_conteos where despacho_id = %L', :'d1')),
     pg_temp.intento(format('update retail.despacho_conteos set contadas = 1 where despacho_id = %L', :'d1')),
     pg_temp.intento(format('insert into retail.despacho_conteos (despacho_id, extra_posicion, proveedor_id, categoria_id, marca_id, contadas, contado_por) values (%L, 7, %L, %L, %L, 1, %L)', :'d1', :'prov', :'cat', :'marca', :'micaela_p')));`,
  "42501|Lo contado de un envío no se borra: se corrige, o se deja en 0 / 23514|Solo se cuenta un envío abierto / 23514|Solo se cuenta un envío abierto",
);

// F. LA FORMA -------------------------------------------------------------------------------------------------------------
caso(
  "F1 una función por nombre, security definer, authenticated sí y anon no; las internas cerradas; RLS sin políticas; nadie lee directo",
  `select concat_ws(' / ',
     (select string_agg(p.proname || ':' || p.prosecdef || ':' || has_function_privilege('authenticated', p.oid, 'execute') || ':'
                        || has_function_privilege('anon', p.oid, 'execute'), ',' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname in ('guardar_conteo_envio', 'fn_envio_conteos', 'fn_envio_leer_separado', 'fn_envio_conteo_json',
                                                     'fn_envio_separado_con_nombres', 'fn_envio_persona', 'fn_recepcion_conteos_detallados',
                                                     'fn_recepcion_entrar')),
     (select c.relrowsecurity from pg_class c where c.oid = 'retail.despacho_conteos'::regclass),
     (select count(*) from pg_policies p where p.schemaname = 'retail' and p.tablename = 'despacho_conteos'),
     has_table_privilege('authenticated', 'retail.despacho_conteos', 'select'));`,
  [
    "fn_envio_conteo_json:true:false:false,fn_envio_conteos:true:true:false,fn_envio_leer_separado:false:false:false,"
      + "fn_envio_persona:true:false:false,fn_envio_separado_con_nombres:true:false:false,fn_recepcion_conteos_detallados:true:false:false,"
      + "fn_recepcion_entrar:true:false:false,guardar_conteo_envio:true:true:false",
    "t",
    "0",
    "f",
  ].join(" / "),
);
caso(
  "F2 lo separado nunca pasa de lo contado, aunque se escriba a mano (el candado es de la tabla)",
  `${BASE_D1}
   reset role;
   select pg_temp.intento(format(
     'insert into retail.despacho_conteos (despacho_id, despacho_item_id, contadas, separado, contado_por) values (%L, %L, 2, %L, %L)',
     :'d1', :'di_l1', ${SEP([], [[3]])}, :'micaela_p'));`,
  (o) => o.startsWith("23514|") && o.includes("despacho_conteos_separado_cabe"),
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);

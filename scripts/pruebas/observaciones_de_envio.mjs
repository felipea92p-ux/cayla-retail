#!/usr/bin/env node
/**
 * Pruebas de las observaciones de un envío (ADR-0507) — migración `20261024235000_observaciones_de_envio.sql`.
 *
 * LO QUE VIGILA. Que lo que la persona vio al contar («prenda rota», «prenda faltante»…) quede escrito en el envío, a nombre de quien
 * firma, sin poder anotarse en un envío que no está abierto, sin duplicarse con un reintento y sin poder borrarse ni editarse. Los permisos
 * son los de recibir: el módulo Recibir, la sede del envío y que quien firma no haya hecho ninguna de sus órdenes (decisión 17 de ADR-0362).
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las migraciones se cargan DOS veces dentro de cada caso, así se prueba que se
 * pueden pegar dos veces). Micaela es de Tienda Trujillo y no es líder; Felipe hace las órdenes y los envíos.
 *   P  PERMISOS: sin Recibir, otra sede, quien hizo la orden y sin elegir responsable no anotan ni leen de más.
 *   E  ESTADOS: en camino, cerrado y anulado no admiten observaciones.
 *   R  REGISTRAR: queda a nombre de quien firma, de una línea o del envío entero; el mismo token no la repite; sin token se anotan dos.
 *   X  RECHAZOS: tipo que no está en la lista, mensaje vacío o largo, línea de otro envío.
 *   I  INMUTABLE: ni borrar ni editar una observación, ni escribirla a mano en un envío cerrado.
 *   L  LECTURA: en el orden en que se anotaron, con quién; en un envío cerrado también; un envío que no existe da null.
 *   F  LA FORMA: una función por nombre, security definer, authenticated sí y anon no; RLS sin políticas; nadie lee directo.
 *
 * USO
 *   node scripts/pruebas/observaciones_de_envio.mjs                              → contra el stack local compartido
 *   node scripts/pruebas/observaciones_de_envio.mjs --contenedor supabase_db_x   → contra otro stack (un banco de pruebas propio)
 *   node scripts/pruebas/observaciones_de_envio.mjs --sin-migracion              → sin cargar las migraciones: contra una base sin el
 *                                                                                   cambio, la prueba tiene que FALLAR
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
  : [
      "20261013170000_recepcion_un_solo_camino_de_cierre.sql",
      "20261013171000_conteo_de_envio.sql",
      "20261013172000_cerrar_conteo_con_pendientes.sql",
      "20261013173000_resolver_pendiente_de_envio.sql",
      "20261013180000_reabrir_envio.sql",
      // ADR-0393: lo que llega sin aviso, con el mismo conteo.
      "20261013183000_envio_sin_aviso.sql",
      // ADR-0507: las observaciones al contar.
      "20261024235000_observaciones_de_envio.sql",
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
${atrapa("observa", "p_d uuid, p_item uuid, p_tipo text, p_msg text, p_token uuid", "retail.registrar_observacion_envio(p_d, p_item, p_tipo, p_msg, p_token)")}
${atrapa("observaciones", "p_d uuid", "retail.fn_envio_observaciones(p_d)")}

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
const OBS = (envio, item, tipo, msg, token = "null::uuid") => `pg_temp.observa(:'${envio}', ${item ? `:'${item}'` : "null::uuid"}, '${tipo}', '${msg}', ${token})`;
// El escenario de casi todos los casos: el envío d1 (l1 = 10 y l2 = 4) a Trujillo, abierto por Micaela.
const ABIERTO = `${ENVIA("d1", [["l1", 10], ["l2", 4]])}${ITEM("d1", "l1")}${ITEM("d1", "l2")}${MICAELA_RECIBE}${ABRE("d1")}`;

// P. PERMISOS -------------------------------------------------------------------------------------------------------------
caso(
  "P1 sin Recibir (con Existencias): 42501 al anotar y al leer",
  `${ENVIA("d1", [["l1", 10]])}${ITEM("d1", "l1")}
   ${como(SANDRA)}${SIN_ENCABEZADOS}${ABRE("d1")}
   ${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select concat_ws(' / ', pg_temp.e(${OBS("d1", "di_l1", "prenda_rota", "rota")}), pg_temp.e(pg_temp.observaciones(:'d1')));`,
  [
    "42501|recibir_sin_modulo|Anotar una observación necesita el módulo «Recibir mercadería» en tu rol",
    "42501|envios_sin_modulo|Ver un envío necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol",
  ].join(" / "),
);
caso(
  "P2 otra sede no; quien hizo la orden no; sin elegir responsable no; y no queda nada escrito",
  `${ENVIA("d_lim", [["l_o2", 2]], { sede: ":'lim'" })}${ITEM("d_lim", "l_o2")}
   ${ENVIA("d3", [["l_o3", 3]])}${ITEM("d3", "l_o3")}
   ${ENVIA("d1", [["l1", 10]])}${ITEM("d1", "l1")}
   ${como(SANDRA)}${SIN_ENCABEZADOS}${ABRE("d_lim")}${ABRE("d3")}${ABRE("d1")}
   ${MICAELA_RECIBE}
   select pg_temp.e(${OBS("d_lim", "di_l_o2", "otro", "x")}) as otra \\gset
   select pg_temp.e(${OBS("d3", "di_l_o3", "otro", "x")}) as suya \\gset
   ${SIN_ENCABEZADOS}
   select pg_temp.e(${OBS("d1", "di_l1", "otro", "x")}) as sin_resp \\gset
   reset role;
   select concat_ws(' / ', :'otra', :'suya', :'sin_resp', (select count(*) from retail.despacho_observaciones where despacho_id in (:'d_lim', :'d3', :'d1')));`,
  [
    "42501|recibir_otra_sede|Este envío va a Tienda Lima: lo recibe esa tienda",
    QUIEN_COMPRO,
    "42501|responsable_requerido|Elige quién hace esta operación",
    "0",
  ].join(" / "),
);

// E. ESTADOS DEL ENVÍO ----------------------------------------------------------------------------------------------------
caso(
  "E1 en camino, anulado y cerrado no admiten observaciones",
  `${ENVIA("d_camino", [["l_o3", 2]])}${ITEM("d_camino", "l_o3")}
   ${ENVIA("d_anul", [["l_o3", 1]])}${ITEM("d_anul", "l_o3")}
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.anular_envio(:'d_anul', :v_d_anul, 'Prueba: no llega') \\gset
   ${ABIERTO}
   select ${`pg_temp.recibe(:'d1', :v_d1, ${A(LIN("di_l1", [], { falt: "no_vino" }), LIN("di_l2", [], { falt: "no_vino" }))}, '[]'::jsonb, null, null)`} \\g /dev/null
   select concat_ws(' / ', pg_temp.h(${OBS("d_camino", "di_l_o3", "otro", "x")}), pg_temp.h(${OBS("d_anul", "di_l_o3", "otro", "x")}),
     pg_temp.h(${OBS("d1", "di_l1", "otro", "x")}));`,
  "envio_sin_abrir / envio_anulado / envio_ya_recibido",
);

// R. REGISTRAR ------------------------------------------------------------------------------------------------------------
caso(
  "R1 queda a nombre de quien firma, de la línea, con el mensaje limpio; la del envío entero va sin línea",
  `${ABIERTO}
   select ${OBS("d1", "di_l1", "prenda_rota", "  2 con la costura abierta  ")} as o1 \\gset
   select ${OBS("d1", null, "empaque_danado", "Caja mojada")} as o2 \\gset
   reset role;
   select concat_ws(' / ', :'o1'::jsonb ->> 'tipo', :'o1'::jsonb ->> 'mensaje', (:'o1'::jsonb -> 'creado_por' ->> 'nombre') = :'micaela_n',
     (:'o1'::jsonb ->> 'despacho_item_id') = :'di_l1', :'o2'::jsonb ->> 'despacho_item_id' is null,
     (select count(*) from retail.despacho_observaciones where despacho_id = :'d1' and creado_por = :'micaela_p'));`,
  "prenda_rota / 2 con la costura abierta / t / t / t / 2",
);
caso(
  "R2 el mismo token devuelve la misma observación sin anotar otra; sin token se anotan dos",
  `${ABIERTO}
   select gen_random_uuid() as tk \\gset
   select ${OBS("d1", "di_l1", "prenda_faltante", "faltan 2", ":'tk'::uuid")} as a \\gset
   select ${OBS("d1", "di_l1", "prenda_faltante", "faltan 2", ":'tk'::uuid")} as b \\gset
   select ${OBS("d1", "di_l2", "otro", "sin token")} as c \\gset
   select ${OBS("d1", "di_l2", "otro", "sin token")} as d \\gset
   reset role;
   select concat_ws(' / ', (:'a'::jsonb ->> 'id') = (:'b'::jsonb ->> 'id'), (select count(*) from retail.despacho_observaciones where despacho_id = :'d1'));`,
  "t / 3",
);

// X. RECHAZOS -------------------------------------------------------------------------------------------------------------
caso(
  "X1 un tipo que no está en la lista, un mensaje vacío o largo y una línea de otro envío se rechazan sin escribir",
  `${ENVIA("d_otro", [["l_o3", 2]])}${ITEM("d_otro", "l_o3")}
   ${ABIERTO}
   select concat_ws(' / ',
     pg_temp.h(${OBS("d1", "di_l1", "inventado", "x")}),
     pg_temp.h(pg_temp.observa(:'d1', :'di_l1', null, 'x', null)),
     pg_temp.h(${OBS("d1", "di_l1", "otro", "   ")}),
     pg_temp.h(pg_temp.observa(:'d1', :'di_l1', 'otro', repeat('a', 301), null)),
     pg_temp.h(${OBS("d1", "di_l_o3", "otro", "x")})) as r \\gset
   reset role;
   select concat_ws(' / ', :'r', (select count(*) from retail.despacho_observaciones where despacho_id in (:'d1', :'d_otro')));`,
  "observacion_tipo / observacion_tipo / observacion_mensaje / observacion_mensaje_largo / observacion_linea_ajena / 0",
);

// I. INMUTABLE ------------------------------------------------------------------------------------------------------------
caso(
  "I1 una observación no se borra ni se edita; a mano, tampoco en un envío cerrado",
  `${ABIERTO}
   select ${OBS("d1", "di_l1", "prenda_rota", "rota")} as o \\gset
   reset role;
   select concat_ws(' / ',
     pg_temp.intento(format('delete from retail.despacho_observaciones where id = %L', :'o'::jsonb ->> 'id')),
     pg_temp.intento(format('update retail.despacho_observaciones set mensaje = %L where id = %L', 'cambiada', :'o'::jsonb ->> 'id')),
     (select count(*) from retail.despacho_observaciones where despacho_id = :'d1' and mensaje = 'rota'));`,
  "42501|Una observación no se borra ni se cambia: si te equivocaste, anota otra / 42501|Una observación no se borra ni se cambia: si te equivocaste, anota otra / 1",
);
caso(
  "I2 escrita a mano, una observación de un envío cerrado o de una línea ajena no entra",
  `${ENVIA("d_otro", [["l_o3", 2]])}${ITEM("d_otro", "l_o3")}
   ${ABIERTO}
   reset role;
   select concat_ws(' / ',
     pg_temp.intento(format('insert into retail.despacho_observaciones (despacho_id, despacho_item_id, tipo, mensaje, creado_por) values (%L, %L, %L, %L, %L)',
       :'d1', :'di_l_o3', 'otro', 'x', :'micaela_p')),
     pg_temp.intento(format('insert into retail.despacho_observaciones (despacho_id, tipo, mensaje, creado_por) values (%L, %L, %L, %L)',
       :'d_otro', 'otro', 'x', :'micaela_p')));`,
  "23514|Esa línea no es de este envío / 23514|Solo se anotan observaciones en un envío abierto",
);

// L. LECTURA --------------------------------------------------------------------------------------------------------------
caso(
  "L1 se leen en el orden en que se anotaron, con quién; en un envío cerrado también; uno que no existe da null",
  `${ABIERTO}
   select ${OBS("d1", "di_l1", "prenda_rota", "primera")} as a \\gset
   select ${OBS("d1", "di_l2", "prenda_faltante", "segunda")} as b \\gset
   select pg_temp.observaciones(:'d1') as lec \\gset
   select coalesce(pg_temp.observaciones(gen_random_uuid())::text, 'null') as inexistente \\gset
   select concat_ws(' / ',
     (select string_agg(x ->> 'mensaje', ',') from jsonb_array_elements(:'lec'::jsonb -> 'observaciones') x),
     (select x -> 'creado_por' ->> 'nombre' from jsonb_array_elements(:'lec'::jsonb -> 'observaciones') x limit 1) = :'micaela_n',
     :'inexistente');`,
  "primera,segunda / t / null",
);

// F. LA FORMA -------------------------------------------------------------------------------------------------------------
caso(
  "F1 una función por nombre, security definer, authenticated sí y anon no; las internas cerradas; RLS sin políticas; nadie lee directo",
  `select concat_ws(' / ',
     (select string_agg(p.proname || ':' || p.prosecdef || ':' || has_function_privilege('authenticated', p.oid, 'execute') || ':'
                        || has_function_privilege('anon', p.oid, 'execute'), ',' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname in ('registrar_observacion_envio', 'fn_envio_observaciones', 'fn_envio_observacion_json')),
     (select c.relrowsecurity from pg_class c where c.oid = 'retail.despacho_observaciones'::regclass),
     (select count(*) from pg_policies p where p.schemaname = 'retail' and p.tablename = 'despacho_observaciones'),
     has_table_privilege('authenticated', 'retail.despacho_observaciones', 'select'));`,
  "fn_envio_observacion_json:true:false:false,fn_envio_observaciones:true:true:false,registrar_observacion_envio:true:true:false / t / 0 / f",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Pruebas del precio de venta desde la recepción (Felipe 2026-10-24) — migración `20261024225000_precio_de_venta_desde_la_recepcion.sql`.
 *
 * LO QUE VIGILA. Que quien recibe cambie el precio de una prenda de SU envío (para todas las sedes o solo para la suya) sin ver
 * Productos; que lo anterior no se reescriba (el cambio es una fila nueva en el historial y lo vendido guarda su precio); y que esa
 * puerta no sirva para otra cosa: otra sede, el que hizo la orden, un envío que no está abierto, una prenda que no es del envío, un
 * precio bajo el costo, y el precio por sede de Productos sigue pidiendo Productos.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga DOS veces: se puede pegar dos veces). Micaela es de
 * Tienda Trujillo y no es líder (un rol de prueba con solo Recibir); Felipe es líder y hace las órdenes.
 *   P  PERMISOS: sin Recibir no; otra sede no; quien hizo la orden no; sin abrir no; una prenda ajena no.
 *   T  TODAS LAS SEDES: cambia el precio de las tallas activas (no las inactivas), deja el rastro con quien firma.
 *   S  SOLO ESTA SEDE: precio propio con el motivo «Recepción ENV-…»; el general no se toca; otra sede sigue con el general.
 *   M  MALOS PRECIOS: cero, negativo, NaN, más del tope, bajo el costo y un alcance que no existe se rechazan sin escribir.
 *   F  LA FORMA: security definer, authenticated sí y anon no; el guardián de Productos sigue cerrado y no queda la marca puesta.
 *
 * USO
 *   node scripts/pruebas/precio_desde_recepcion.mjs                         → contra el stack local compartido
 *   node scripts/pruebas/precio_desde_recepcion.mjs --contenedor supabase_db_x
 *   node scripts/pruebas/precio_desde_recepcion.mjs --sin-migracion         → contra una base sin el cambio: tiene que FALLAR
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
  : readFileSync(join(RAIZ, "supabase", "migrations", "20261024225000_precio_de_venta_desde_la_recepcion.sql"), "utf8")
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
${atrapa("cambia", "p_d uuid, p_prod uuid, p_precio numeric, p_alcance text", "retail.cambiar_precio_en_recepcion(p_d, p_prod, p_precio, p_alcance)")}

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

const QUIEN_COMPRO = "42501|recibir_quien_compro|Hiciste esta orden: la tiene que recibir otra persona de la tienda";
const cambia = (envio, prod, precio, alcance) => `pg_temp.cambia(:'${envio}', :'${prod}', ${precio}, '${alcance}')`;
// El envío d1 a Trujillo (l1 = 10 «Chompa cuello alto»), abierto por Micaela con la prenda del catálogo (prod_p) separada en l1.
const ENVIO = `${ENVIA("d1", [["l1", 10], ["l2", 4]])}${ITEM("d1", "l1")}${ITEM("d1", "l2")}${MICAELA_RECIBE}${ABRE("d1")}
   select pg_temp.e(${GUARDA("d1", "di_l1", 10, SEP([["prod_p", 10]]))}) as sep \\gset
   ${MICAELA_RECIBE}`;

// P. PERMISOS -------------------------------------------------------------------------------------------------------------
caso(
  "P1 sin Recibir (con Existencias): 42501",
  `${ENVIO}
   ${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(${cambia("d1", "prod_p", 99.9, "todas")});`,
  "42501|recibir_sin_modulo|Cambiar el precio desde la recepción necesita el módulo «Recibir mercadería» en tu rol",
);
caso(
  "P2 el que hizo la orden no; el envío de otra sede no; sin abrir no",
  `${ENVIA("d_lim", [["l_o2", 2]], { sede: ":'lim'" })}${ITEM("d_lim", "l_o2")}
   ${ENVIA("d1", [["l1", 10]])}${ITEM("d1", "l1")}
   ${como(SANDRA)}${SIN_ENCABEZADOS}${ABRE("d_lim")}
   ${MICAELA_RECIBE}
   select pg_temp.e(${cambia("d_lim", "prod_p", 99.9, "todas")}) as otra \\gset
   select pg_temp.e(${cambia("d1", "prod_p", 99.9, "todas")}) as sin_abrir \\gset
   select concat_ws(' / ', :'otra', :'sin_abrir');`,
  (o) => o.startsWith("42501|recibir_otra_sede|") && o.includes("precio_envio_no_abierto"),
);
caso(
  "P2b quien hizo la orden (un líder que no es Admin: el Admin sí puede, ADR-0517) no cambia el precio de su propio envío",
  `${ENVIO}
   reset role;
   ${FELIPE_SIN_SER_ADMIN}${como(FELIPE)}${FELIPE_EN_TIENDA}
   select pg_temp.e(${cambia("d1", "prod_p", 99.9, "todas")});`,
  QUIEN_COMPRO,
);
caso(
  "P3 una prenda que no es de este envío no se toca (aunque sea del catálogo)",
  `${ENVIO}
   select pg_temp.e(${cambia("d1", "prod_g", 99.9, "todas")});`,
  "P0001|precio_prenda_ajena|Esa prenda no es de este envío",
);

// T. TODAS LAS SEDES ------------------------------------------------------------------------------------------------------
caso(
  "T1 cambia las tallas activas (no la inactiva), sin Productos, con el rastro de quien firma",
  `${ENVIO}
   select ${cambia("d1", "prod_p", 99.9, "todas")} as r \\gset
   reset role;
   select concat_ws(':', :'r'::jsonb ->> 'alcance', :'r'::jsonb ->> 'variantes',
     (select precio from retail.variantes where id = :'pv_s'), (select precio from retail.variantes where id = :'pv_l'),
     (select count(*) from retail.historial_producto_cambios h where h.entidad_id = :'pv_s' and h.campo = 'precio'
        and h.valor_anterior = '79.90' and h.valor_nuevo = '99.90' and h.usuario_id = :'micaela_p'));`,
  "todas:1:99.90:79.90:1",
);

// S. SOLO ESTA SEDE -------------------------------------------------------------------------------------------------------
caso(
  "S1 precio propio de Trujillo con su motivo; el general no se toca y Lima sigue con el general",
  `${ENVIO}
   select ${cambia("d1", "prod_p", 89.9, "sede")} as r \\gset
   reset role;
   select concat_ws(':', :'r'::jsonb ->> 'alcance', (select precio from retail.variantes where id = :'pv_s'),
     (select ps.precio || '/' || ps.motivo like '%Recepción ENV-%' from retail.precios_sede_prenda ps
       where ps.producto_id = :'prod_p' and ps.ubicacion_id = :'tru' and ps.archivado_en is null),
     retail.fn_precio_en_sede(:'pv_s', :'lim'));`,
  (o) => o.startsWith("sede:79.90:") && o.endsWith(":79.90"),
);

// M. MALOS PRECIOS --------------------------------------------------------------------------------------------------------
caso(
  "M1 cero, negativo, NaN, sobre el tope, bajo el costo y un alcance que no existe: nada se escribe",
  `${ENVIO}
   select concat_ws(' / ',
     pg_temp.h(${cambia("d1", "prod_p", 0, "todas")}), pg_temp.h(${cambia("d1", "prod_p", -5, "todas")}),
     pg_temp.h(${cambia("d1", "prod_p", "'NaN'::numeric", "todas")}), pg_temp.h(${cambia("d1", "prod_p", 5000.01, "todas")}),
     pg_temp.h(${cambia("d1", "prod_p", 24.99, "todas")}), pg_temp.h(${cambia("d1", "prod_p", 24.99, "sede")}),
     pg_temp.h(${cambia("d1", "prod_p", 99.9, "todas").replace("'todas')", "'regalo')")}),
     (select precio from retail.variantes where id = :'pv_s'));`,
  "precio_invalido / precio_invalido / precio_invalido / precio_invalido / precio_bajo_costo / precio_sede_bajo_costo / precio_alcance / 79.90",
);

// F. LA FORMA -------------------------------------------------------------------------------------------------------------
caso(
  "F1 security definer, authenticated sí y anon no; el guardián de Productos cerrado; Micaela sin Productos no pone un precio de sede por su cuenta; no queda la marca puesta",
  `${ENVIO}
   select ${cambia("d1", "prod_p", 89.9, "sede")} as r \\gset
   select pg_temp.intento(format('select retail.poner_precio_sede(%L, %L, 70, %L)', :'prod_p', :'tru', 'a mano')) as directo \\gset
   reset role;
   select concat_ws(' / ',
     (select p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')
        from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'cambiar_precio_en_recepcion'),
     has_function_privilege('authenticated', 'retail.fn_precio_sede_exigir(uuid,uuid)', 'execute'),
     left(:'directo', 5), coalesce(current_setting('retail.precio_desde_recepcion', true), '-'));`,
  "t / f / 42501 / off",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);

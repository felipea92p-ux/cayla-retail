#!/usr/bin/env node
/**
 * Pruebas de la recepción en la sede de un envío de orden de compra (ADR-0362, fase 4; Felipe 2026-10-12) — migraciones
 * `20261013001000_recepcion_de_envio_esquema.sql` y `20261013002000_recepcion_de_envio.sql`. Contrato:
 * docs/compras/ordenes-de-compra-2026-10/contrato-recepcion-de-envio.md.
 *
 * LO QUE VIGILA. Que la tienda reciba un envío ENV-… (o una orden «directo» sin guía) con SOLO el módulo «Recibir mercadería»: que lo
 * abra, cree ahí la prenda que llegó aunque no edite el catálogo (decisión 49), cuente talla por talla y entre el stock al almacén (lo
 * dañado a la cuarentena con su fila en `prendas_danadas`), con el costo que corrigió quien recibe promediado, un lote por proveedor y
 * las entradas cargadas al papel hasta su cupo (decisión 9). Que lo que faltó o sobró quede con su causa (14 y 15), que quien hizo la
 * orden no la reciba ni siendo líder (17), que un reintento no duplique y que un costo atípico pida confirmar.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las dos migraciones se cargan DOS veces dentro de cada caso, así se prueba que
 * se pueden pegar dos veces y corren con la base al día o sin ella). Micaela es de Tienda Trujillo y no es líder (un rol de prueba con
 * los módulos que pide cada caso, y marcó su entrada: firma ella en el combo «Responsable»); Felipe es líder y Admin, y hace las
 * órdenes y los envíos; Sandra es líder y Admin. El responsable obligatorio va encendido, como en producción.
 *   P  PERMISOS: sin Recibir, 42501 en todo; otra sede no; quien hizo la orden no la recibe, ni el líder (otro líder sí); sin elegir
 *      responsable, no.
 *   A  ABRIR: en camino → abierto (repetido, lo mismo); versión vieja; anulado y cerrado; abierto, la compradora ya no lo anula.
 *   N  PRENDA NUEVA con solo Recibir: nace pendiente, con la categoría, marca y costo de la línea, el precio sugerido y la pareja
 *      marca–proveedor registrada; el mismo token devuelve la misma; los candados del alta mandan con su mensaje.
 *   E  PRENDA EXISTENTE: se le crea la talla que faltaba (precio y costo de la hermana) y se reactiva la desactivada; otra
 *      categoría no.
 *   R  RECIBIR: completo (stock, costo promediado, lote, papel hasta el cupo, cerrado, actividad); el cupo que se acaba a mitad de una
 *      variante y dos comprobantes (el más antiguo primero); faltante y sobrante con causa (y sin ella, error); dañadas a la
 *      cuarentena; lo que no estaba en la guía; dos proveedores, dos lotes; lo que no se acepta.
 *   T  EL MISMO TOKEN: misma huella, lo mismo sin duplicar; otra huella, error; otro token sobre un envío recibido, error.
 *   C  COSTO ATÍPICO: sin confirmar no escribe nada y dice cuál (JSON en detail); confirmado, entra y deja constancia en el lote.
 *   D  ORDEN DIRECTA SIN GUÍA: crea el envío abierto con lo que queda; el mismo token, lo mismo; sin nada pendiente, entra al abierto;
 *      «Por repartir», anulada y quien la hizo, no.
 *   L  LECTURAS: los envíos por recibir (en camino y abiertos, con quién hizo la orden), las órdenes directas, el detalle (con cómo se
 *      cerró) y las prendas para «Ya la tengo».
 *   S  LA FORMA: security definer, authenticated sí y anon no, internas cerradas, RLS sin políticas, solo se agrega, la recepción solo
 *      al cerrar, y la marca del alta no abre nada desde fuera.
 *
 * USO
 *   node scripts/pruebas/recepcion_de_envio.mjs                                → contra el stack local compartido
 *   node scripts/pruebas/recepcion_de_envio.mjs --contenedor supabase_db_x     → contra otro stack (un banco de pruebas propio)
 *   node scripts/pruebas/recepcion_de_envio.mjs --sin-migracion                → sin cargar las migraciones: contra una base sin el
 *                                                                                  cambio, la prueba tiene que FALLAR
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
  : ["20261013001000_recepcion_de_envio_esquema.sql", "20261013002000_recepcion_de_envio.sql"]
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
${atrapa("abre", "p_id uuid, p_version integer", "retail.abrir_despacho(p_id, p_version)")}
${atrapa("sin_guia", "p_orden uuid, p_token uuid", "retail.recibir_orden_sin_envio(p_orden, p_token)")}
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

-- Datos propios de la prueba, creados como Felipe (líder): la prenda de catálogo nace aprobada.
select set_config('request.jwt.claim.sub', '${FELIPE}', true) \\g /dev/null
select set_config('request.jwt.claims', '{"sub":"${FELIPE}","role":"authenticated"}', true) \\g /dev/null
insert into retail.proveedores (nombre) values ('Proveedor Recepción Prueba') returning id as prov \\gset
insert into retail.proveedores (nombre) values ('Proveedor Recepción Dos') returning id as prov2 \\gset
insert into retail.proveedores (nombre) values ('Proveedor Catálogo Recepción') returning id as prov3 \\gset
insert into retail.marcas (nombre) values ('Marca Recepción Prueba') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('Chompas Recepción', 'accesorios') returning id as cat \\gset
insert into retail.categorias (nombre, familia) values ('Gorros Recepción', 'accesorios') returning id as cat2 \\gset
select id as t_s from retail.tallas where valor = 'S' \\gset
select id as t_m from retail.tallas where valor = 'M' \\gset
select id as t_l from retail.tallas where valor = 'L' \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat', :'t_s'), (:'cat', :'t_m'), (:'cat', :'t_l'), (:'cat2', :'t_s');
select codigo as c1 from retail.colores where activo order by orden, codigo limit 1 \\gset
select codigo as c2 from retail.colores where activo order by orden, codigo limit 1 offset 1 \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select p.id as sandra_p from public.personas p where p.auth_user_id = '${SANDRA}' \\gset
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as alm_t from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as cua_t from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'cuarentena' \\gset
-- Como en producción: el responsable obligatorio encendido; Micaela marcó su entrada en Trujillo.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values (:'micaela_p', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
-- Una prenda que ya existe en el catálogo (de esa categoría y marca, de otro proveedor): talla S a S/ 79.90, costo S/ 25, con 2 en
-- el almacén de Trujillo. La pareja marca–proveedor de la orden (prov) NO está registrada: la registra la recepción.
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov3');
insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat', 'Chompa Catálogo Recepción', :'marca', :'prov3')
  returning id as prod_p \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo) values (:'prod_p', :'t_s', :'c1', 79.90, 25)
  returning id as pv_s \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo, activo) values (:'prod_p', :'t_l', :'c1', 79.90, 25, false)
  returning id as pv_l \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'pv_s', :'tru', :'alm_t', 'entrada', 2, 'prueba recepción: colchón') returning id as m0 \\gset
select retail.fn_aplicar_movimiento(:'m0') \\g /dev/null
-- O1 directo a Trujillo (prov), la hace Felipe: l1 = 10 «Chompa cuello alto» a S/ 30; l2 = 4 a S/ 50 con S/ 20 de descuento (neto 45).
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, fecha_entrega_estimada, creada_por)
  values (:'prov', :'tru', retail.fn_hoy_lima() + 7, :'felipe_p') returning id as o1, numero as n1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario)
  values (:'o1', 1, :'cat', :'marca', 'Chompa cuello alto', 10, 30) returning id as l1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento)
  values (:'o1', 2, :'cat', :'marca', 4, 50, 20) returning id as l2 \\gset
-- O2 «Por repartir», de prov2: l_o2 = 6 a S/ 20.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov2', null, :'felipe_p')
  returning id as o2, numero as n2 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o2', 1, :'cat', :'marca', 6, 20) returning id as l_o2 \\gset
-- O3 directo a Trujillo, la hace Micaela.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'micaela_p')
  returning id as o3, numero as n3 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o3', 1, :'cat', :'marca', 3, 30) returning id as l_o3 \\gset
select retail.fn_orden_compra_numero_texto(:n1) as oc1 \\gset
select set_config('request.jwt.claim.sub', '', true) \\g /dev/null
select set_config('request.jwt.claims', '', true) \\g /dev/null
`;

// Micaela con un rol de prueba (sin clave, como los roles a medida) que ve SOLO esos módulos. Se va con el ROLLBACK.
const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba recepción ' || substr(md5(random()::text), 1, 8)) returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
`;
const MICAELA_RECIBE = `${rolDeMicaela("recibir")}${como(MICAELA)}${EN_TIENDA}`;

// SQL de jsonb.
const J = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const A = (...xs) => `jsonb_build_array(${xs.join(", ")})`;
const V = (v, cantidad, danadas = 0, sol = null) =>
  J({ variante_id: `:'${v}'`, cantidad, danadas, danada_solucion: sol ? `'${sol}'` : "null::text" });
const LIN = (di, vars, { costo = "null::numeric", confirma = "false", falt = null, sobr = null, nota = null } = {}) =>
  J({
    despacho_item_id: `:'${di}'`,
    costo_unitario: costo,
    confirma_costo: confirma,
    variantes: A(...vars),
    faltante_causa: falt ? `'${falt}'` : "null::text",
    sobrante_causa: sobr ? `'${sobr}'` : "null::text",
    ...(nota ? { nota: `'${nota}'` } : {}),
  });
const EXTRA = ({ prov = "null::uuid", cat = ":'cat'", marca = ":'marca'", costo = "40", confirma = "false", vars, sobr = "'cobra_aparte'" }) =>
  J({ proveedor_id: prov, categoria_id: cat, marca_id: marca, costo_unitario: costo, confirma_costo: confirma, variantes: A(...vars), sobrante_causa: sobr });
const MATRIZ = (...pares) => A(...pares.map(([t, c]) => J({ talla_id: t ? `:'${t}'` : "null::uuid", color_codigo: c ? `:'${c}'` : "null::text" })));

// Felipe (líder, Admin: firma él sin combo) envía, y la versión queda en :v_<nombre>. `lineas`: [[orden_compra_item, cantidad]].
const ENVIA = (nombre, lineas, { sede = ":'tru'", guia = "'T001-77'" } = {}) => `
${como(FELIPE)}${SIN_ENCABEZADOS}
select (retail.crear_envio(${sede}, ${A(...lineas.map(([l, n]) => J({ orden_compra_item_id: `:'${l}'`, cantidad: n })))}, ${guia}, null, null) ->> 'despacho_id') as ${nombre} \\gset
reset role;
select version as v_${nombre} from retail.despachos where id = :'${nombre}' \\gset
`;
// Su línea (despacho_item) de una línea pedida: :di_<línea>.
const ITEM = (envio, l) => `select id as di_${l} from retail.despacho_items where despacho_id = :'${envio}' and orden_compra_item_id = :'${l}' \\gset\n`;
// Felipe registra el papel (una boleta) de la O1: [[línea, cantidad, costo, sugerido?]]. Su compra queda en :<nombre>.
const PAPEL = (nombre, numero, lineas) => `
${como(FELIPE)}${SIN_ENCABEZADOS}
select (retail.registrar_comprobante_orden(:'o1', 'boleta', 'B077', '${numero}',
  ${A(...lineas.map(([l, n, c, s]) => J({ orden_compra_item_id: `:'${l}'`, cantidad: n, costo_unitario: c, ...(s ? { precio_venta_sugerido: s } : {}) })))},
  null, 'credito', retail.fn_hoy_lima() + 30, true, null, null, null, null) ->> 'compra_id') as ${nombre} \\gset
reset role;
`;
// Micaela abre el envío (la versión nueva queda en :v_<envío>).
const ABRE = (envio) => `select pg_temp.abre(:'${envio}', :v_${envio}) as ab_${envio} \\gset
select (:'ab_${envio}'::jsonb ->> 'version')::int as v_${envio} \\gset
`;
// La prenda nueva de la línea l1 (tallas S y M en el color c1, precio sugerido 89.90): :v_s y :v_m.
const PREPARA_NUEVA = (envio, token = "gen_random_uuid()") =>
  `pg_temp.prepara(:'${envio}', :'di_l1', null, null, null, 'Chompa Trenzada Recepción', ${MATRIZ(["t_s", "c1"], ["t_m", "c1"])}, 89.90, ` +
  `'Tejido grueso', null, null, false, ${token}, null)`;
const PRENDA_NUEVA = (envio, token = "gen_random_uuid()") => `
select ${PREPARA_NUEVA(envio, token)} as prep \\gset
select (x ->> 'id') as v_s from jsonb_array_elements(:'prep'::jsonb -> 'variantes') x where x ->> 'talla' = 'S' \\gset
select (x ->> 'id') as v_m from jsonb_array_elements(:'prep'::jsonb -> 'variantes') x where x ->> 'talla' = 'M' \\gset
`;
// El escenario de casi todos los casos: el envío d1 (l1 = 10 y l2 = 4) a Trujillo, abierto por Micaela, con la prenda nueva en l1.
const BASE_D1 = (papel = "") => `${papel}${ENVIA("d1", [["l1", 10], ["l2", 4]])}${ITEM("d1", "l1")}${ITEM("d1", "l2")}${MICAELA_RECIBE}${ABRE("d1")}${PRENDA_NUEVA("d1")}`;
const RECIBE = (envio, lineas, { extras = "'[]'::jsonb", nota = "null::text", token = "null::uuid", version = null } = {}) =>
  `pg_temp.recibe(:'${envio}', ${version ?? `:v_${envio}`}, ${lineas}, ${extras}, ${nota}, ${token})`;
const CLAVES = (expr) => `(select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(${expr}) k)`;
const STOCK = (v, sub) => `coalesce((select s.cantidad from retail.stock s where s.variante_id = :'${v}' and s.ubicacion_id = :'tru' and s.sububicacion_id = :'${sub}'), 0)`;
const limpio = (expr) => `regexp_replace(replace(${expr}, :'oc1', 'OC1'), 'ENV-[0-9]{6}', 'ENV', 'g')`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    // Al final se disparan los candados diferidos (el tope de lo enviado, el reparto del papel, la gestora): si algo quedó mal
    // guardado, el caso falla aquí.
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

const SIN_MODULO = "42501|recibir_sin_modulo|Recibir un envío necesita el módulo «Recibir mercadería» en tu rol";
const QUIEN_COMPRO = "42501|recibir_quien_compro|Hiciste esta orden: la tiene que recibir otra persona de la tienda";

// P. PERMISOS -------------------------------------------------------------------------------------------------------------
caso(
  "P1 sin Recibir (con Existencias): 42501 al abrir, preparar, recibir, recibir sin guía y leer los envíos y las prendas",
  `${ENVIA("d1", [["l1", 10]])}${ITEM("d1", "l1")}
   ${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select concat_ws(' / ',
     pg_temp.e(pg_temp.abre(:'d1', :v_d1)),
     pg_temp.e(pg_temp.prepara(:'d1', :'di_l1', null, null, null, 'X', ${MATRIZ(["t_s", "c1"])}, 50, null, null, null, false, null, null)),
     pg_temp.e(${RECIBE("d1", A())}),
     pg_temp.e(pg_temp.sin_guia(:'o1', null)),
     pg_temp.intento(format('select retail.fn_envios_por_recibir(%L)', :'tru')),
     pg_temp.intento(format('select retail.fn_prendas_para_recibir(%L, %L, null)', :'cat', :'marca')));`,
  [SIN_MODULO, SIN_MODULO, SIN_MODULO, SIN_MODULO,
    "42501|Ver los envíos necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol",
    "42501|Ver las prendas para recibir necesita el módulo «Recibir mercadería» u «Órdenes de compra» en tu rol"].join(" / "),
);
caso(
  "P2 otra sede no; sin elegir responsable no; quien hizo la orden no (ni el líder); otro líder sí",
  `${ENVIA("d_lim", [["l_o2", 2]], { sede: ":'lim'" })}
   ${ENVIA("d3", [["l_o3", 3]])}
   ${ENVIA("d1", [["l1", 10]])}
   ${MICAELA_RECIBE}
   select pg_temp.e(pg_temp.abre(:'d_lim', :v_d_lim)) as otra \\gset
   select pg_temp.e(pg_temp.abre(:'d3', :v_d3)) as suya \\gset
   ${SIN_ENCABEZADOS}
   select pg_temp.e(pg_temp.abre(:'d1', :v_d1)) as sin_resp \\gset
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select pg_temp.e(pg_temp.abre(:'d1', :v_d1)) as lider_compro \\gset
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   select pg_temp.abre(:'d1', :v_d1) as otro_lider \\gset
   reset role;
   select concat_ws(' / ', :'otra', :'suya', :'sin_resp', :'lider_compro', pg_temp.e(:'otro_lider'::jsonb),
     (select d.estado || ':' || (d.abierto_por = :'sandra_p') from retail.despachos d where d.id = :'d1'));`,
  ["42501|recibir_otra_sede|Este envío va a Tienda Lima: lo recibe esa tienda", QUIEN_COMPRO,
    "42501|responsable_requerido|Elige quién hace esta operación", QUIEN_COMPRO, "OK", "abierto:true"].join(" / "),
);

caso(
  "P3 quien hizo la orden tampoco prepara la prenda ni cierra la recepción (aunque otro la haya abierto), y el detalle se lo avisa",
  `${ENVIA("d1", [["l1", 10]])}${ITEM("d1", "l1")}
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   select (pg_temp.abre(:'d1', :v_d1) ->> 'version')::int as v_d1 \\gset
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select concat_ws(' / ',
     pg_temp.e(${PREPARA_NUEVA("d1")}),
     pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("pv_s", 10)])))}),
     retail.fn_envio_detalle(:'d1') ->> 'creado_por_mi');`,
  [QUIEN_COMPRO, QUIEN_COMPRO, "true"].join(" / "),
);

// A. ABRIR ----------------------------------------------------------------------------------------------------------------
caso(
  "A1 abrir: en camino → abierto con quién y cuándo; repetido, lo mismo; versión vieja PT409; abierto, la compradora ya no lo anula",
  `${ENVIA("d1", [["l1", 10]])}${ENVIA("d2", [["l2", 4]])}
   ${MICAELA_RECIBE}
   select pg_temp.abre(:'d1', :v_d1) as a1 \\gset
   select pg_temp.abre(:'d1', :v_d1) as a2 \\gset
   select pg_temp.e(pg_temp.abre(:'d2', :v_d2 + 5)) as vieja \\gset
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select pg_temp.intento(format('select retail.anular_envio(%L, %s, %L)', :'d1', (:'a1'::jsonb ->> 'version')::int, 'No va')) as anula \\gset
   reset role;
   select concat_ws(' / ', ${CLAVES(":'a1'::jsonb")}, (:'a1'::jsonb ->> 'estado') || ':' || ((:'a1'::jsonb ->> 'version')::int - :v_d1),
     :'a1' = :'a2', :'vieja',
     (select d.estado || ':' || (d.abierto_por = :'micaela_p') || ':' || (d.abierto_en is not null) || ':' || d.version
        from retail.despachos d where d.id = :'d1'),
     :'anula');`,
  "despacho_id,estado,numero,version / abierto:1 / t / PT409|version_cambiada|Alguien cambió este envío: recarga / abierto:true:true:2 / " +
    "P0001|Este envío ya se abrió en la sede: no se anula",
);
caso(
  "A2 un envío anulado no se abre; uno recibido tampoco",
  `${ENVIA("d1", [["l1", 10]])}${ENVIA("d2", [["l2", 4]])}
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.anular_envio(:'d1', :v_d1, 'Se mandó mal') \\g /dev/null
   reset role;
   update retail.despachos set estado = 'abierto', abierto_por = :'sandra_p', abierto_en = now() where id = :'d2';
   update retail.despachos set estado = 'cerrado', cerrado_por = :'sandra_p', cerrado_en = now() where id = :'d2';
   select version as v_d1 from retail.despachos where id = :'d1' \\gset
   select version as v_d2 from retail.despachos where id = :'d2' \\gset
   ${MICAELA_RECIBE}
   select concat_ws(' / ', pg_temp.e(pg_temp.abre(:'d1', :v_d1)), pg_temp.e(pg_temp.abre(:'d2', :v_d2)));`,
  "P0001|envio_anulado|Este envío se anuló: ya no llega / P0001|envio_ya_recibido|Este envío ya se recibió",
);

// N. PRENDA NUEVA ---------------------------------------------------------------------------------------------------------
caso(
  "N1 con solo Recibir crea la prenda nueva: pendiente, categoría y marca de la línea, costo de la línea, precio sugerido, pareja registrada",
  `${ENVIA("d1", [["l1", 10]])}${ITEM("d1", "l1")}
   ${MICAELA_RECIBE}
   select (select count(*) from retail.marca_proveedores where marca_id = :'marca' and proveedor_id = :'prov') as par0 \\gset
   ${PRENDA_NUEVA("d1")}
   select current_setting('retail.alta_al_recibir', true) as marca_despues \\gset
   reset role;
   select concat_ws(' / ',
     ${CLAVES(":'prep'::jsonb")},
     (:'prep'::jsonb ->> 'nombre') || ':' || (:'prep'::jsonb ->> 'estado_alta'),
     (select pr.estado_alta || ':' || (pr.categoria_id = :'cat') || ':' || (pr.marca_id = :'marca') || ':' || (pr.proveedor_id = :'prov') || ':'
             || (pr.propuesto_por = :'micaela_p') || ':' || pr.descripcion
        from retail.productos pr where pr.id = (:'prep'::jsonb ->> 'producto_id')::uuid),
     (select string_agg(t.valor || ':' || v.precio || ':' || v.costo || ':' || (v.codigo is not null), ',' order by t.valor)
        from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = (:'prep'::jsonb ->> 'producto_id')::uuid),
     ${CLAVES(":'prep'::jsonb -> 'variantes' -> 0")},
     :par0 || '→' || (select count(*) from retail.marca_proveedores where marca_id = :'marca' and proveedor_id = :'prov'),
     coalesce(nullif(:'marca_despues', ''), 'apagada'));`,
  "codigo,estado_alta,nombre,producto_id,variantes / Chompa Trenzada Recepción:pendiente / pendiente:true:true:true:true:Tejido grueso / " +
    "M:89.90:30.00:true,S:89.90:30.00:true / codigo,color,color_codigo,color_hex,id,talla,talla_id / 0→1 / apagada",
);
caso(
  "N2 el mismo token devuelve la misma prenda; otro token con el mismo nombre y marca: «ya existe» (el candado del alta, tal cual)",
  `${ENVIA("d1", [["l1", 10]])}${ITEM("d1", "l1")}
   ${MICAELA_RECIBE}
   select gen_random_uuid() as tok \\gset
   ${PRENDA_NUEVA("d1", ":'tok'")}
   select :'prep' as prep1 \\gset
   ${PRENDA_NUEVA("d1", ":'tok'")}
   select :'prep' as prep2 \\gset
   select ${PREPARA_NUEVA("d1")} as prep \\gset
   reset role;
   select concat_ws(' / ', ((:'prep1'::jsonb ->> 'producto_id') = (:'prep2'::jsonb ->> 'producto_id')),
     (select count(*) from retail.productos where referencia = 'Chompa Trenzada Recepción'),
     pg_temp.e(:'prep'::jsonb));`,
  "t / 1 / P0001|nombre_duplicado|Ya existe un producto llamado \"Chompa Trenzada Recepción\". Búscalo en Productos en vez de crearlo otra vez.",
);
caso(
  "N3 la marca del alta no abre nada desde fuera: sin ella, o con ella puesta a mano y sin Recibir, «solo un líder»; con Recibir y sin ella, tampoco",
  `${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select set_config('retail.alta_al_recibir', 'si', true) \\g /dev/null
   select pg_temp.intento(format('select retail.crear_producto_con_variantes(%L, %L::uuid, %L::jsonb, null, null, null, null, false, null, %L::uuid, %L::uuid)',
     'Chompa Colada', :'cat', jsonb_build_array(jsonb_build_object('talla_id', :'t_s', 'precio', 50))::text, :'marca', :'prov3')) as a_mano \\gset
   ${rolDeMicaela("recibir")}${como(MICAELA)}${EN_TIENDA}
   select set_config('retail.alta_al_recibir', '', true) \\g /dev/null
   select pg_temp.intento(format('select retail.crear_producto_con_variantes(%L, %L::uuid, %L::jsonb, null, null, null, null, false, null, %L::uuid, %L::uuid)',
     'Chompa Colada', :'cat', jsonb_build_array(jsonb_build_object('talla_id', :'t_s', 'precio', 50))::text, :'marca', :'prov3')) as sin_marca \\gset
   reset role;
   select concat_ws(' / ', :'a_mano', :'sin_marca', (select count(*) from retail.productos where referencia = 'Chompa Colada'),
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('retail', 'public', 'graphql_public') and p.proname = 'set_config'));`,
  "P0001|Solo un líder puede dar de alta un producto nuevo / P0001|Solo un líder puede dar de alta un producto nuevo / 0 / 0",
);

// E. PRENDA EXISTENTE -----------------------------------------------------------------------------------------------------
caso(
  "E1 una prenda que ya existe: crea la talla que faltaba (precio y costo de la hermana; el sugerido si viene), reactiva la desactivada; otra categoría no",
  `${ENVIA("d1", [["l1", 10], ["l2", 4]])}${ITEM("d1", "l1")}${ITEM("d1", "l2")}
   ${MICAELA_RECIBE}
   select pg_temp.prepara(:'d1', :'di_l2', null, null, :'prod_p', null, ${MATRIZ(["t_s", "c1"], ["t_m", "c1"], ["t_l", "c1"])}, null, null, null,
     null, false, null, null) as e1 \\gset
   select pg_temp.prepara(:'d1', :'di_l2', null, null, :'prod_p', null, ${MATRIZ(["t_m", "c2"])}, 99.50, null, null, null, false, null, null) as e2 \\gset
   reset role;
   insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat2', 'Gorro Recepción', :'marca', :'prov3')
     returning id as gorro \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(pg_temp.prepara(:'d1', :'di_l1', null, null, :'gorro', null, ${MATRIZ(["t_s", "c1"])}, null, null, null, null, false, null, null)) as ajena \\gset
   reset role;
   select concat_ws(' / ',
     (:'e1'::jsonb ->> 'producto_id') = :'prod_p',
     (select string_agg(t.valor || '-' || (v.color_codigo = :'c1') || ':' || v.precio || ':' || v.costo || ':' || v.activo, ','
                        order by t.valor, (v.color_codigo = :'c1') desc)
        from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = :'prod_p'),
     jsonb_array_length(:'e1'::jsonb -> 'variantes') || '→' || jsonb_array_length(:'e2'::jsonb -> 'variantes'),
     :'ajena');`,
  "t / L-true:79.90:25.00:true,M-true:79.90:25.00:true,M-false:99.50:25.00:true,S-true:79.90:25.00:true / 3→4 / " +
    "P0001|recepcion_prenda_ajena|Esa prenda es de otra categoría o marca: elige una de Chompas Recepción · Marca Recepción Prueba",
);

caso(
  "E2 la prenda que llegó en un envío ya tiene historia: no se elimina (la frenan su ingreso del proveedor y su costo), ni con historia",
  `${BASE_D1()}
   select ${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)])))} as r \\gset
   reset role;
   select (:'prep'::jsonb ->> 'producto_id') as nueva \\gset
   select string_agg(h.concepto || ':' || h.borrable, ',' order by h.orden) as historia from retail.fn_producto_historia(:'nueva') h \\gset
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select concat_ws(' / ', :'historia',
     split_part(pg_temp.intento(format('select retail.eliminar_producto_con_historia(%L)', :'nueva')), ':', 1));`,
  "movimientos de stock:true,unidades en stock:true,costos registrados:false,ingresos recibidos de un proveedor:false / " +
    "P0001|No se puede eliminar «Chompa Trenzada Recepción»",
);

// R. RECIBIR --------------------------------------------------------------------------------------------------------------
caso(
  "R1 completo: stock al almacén, costo promediado, un lote, el papel hasta su cupo, cerrado con quién, cuándo y la nota, y en Actividad",
  `${BASE_D1(PAPEL("comp", "501", [["l1", 10, 30, 89.9]]))}
   reset role;
   select count(*) as mov0 from retail.movimientos \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.recibe(:'d1', :v_d1,
     ${A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)]))}, '[]'::jsonb, '  Llegó en dos bolsas  ', null) as r \\gset
   reset role;
   select concat_ws(' / ',
     ${CLAVES(":'r'::jsonb")},
     (:'r'::jsonb ->> 'unidades') || ':' || (:'r'::jsonb ->> 'buenas') || ':' || (:'r'::jsonb ->> 'danadas') || ':' || (:'r'::jsonb ->> 'faltan')
       || ':' || (:'r'::jsonb ->> 'sobran') || ':' || jsonb_array_length(:'r'::jsonb -> 'lotes'),
     ${STOCK("v_s", "alm_t")} || ',' || ${STOCK("v_m", "alm_t")} || ',' || ${STOCK("pv_s", "alm_t")},
     (select costo from retail.variantes where id = :'v_s') || ',' || (select costo from retail.variantes where id = :'v_m') || ','
       || (select costo from retail.variantes where id = :'pv_s'),
     (select l.proveedor_id = :'prov' and l.despacho_id = :'d1' and l.numero_guia = 'T001-77' and l.recibido_por = :'micaela_p'
             and l.ubicacion_id = :'tru' and ${limpio("l.nota")} = 'Envío ENV · Llegó en dos bolsas'
        from retail.lotes l where l.id = (:'r'::jsonb -> 'lotes' ->> 0)::uuid),
     (select string_agg((m.compra_item_id is not null) || '@' || m.cantidad || ':' || m.motivo || ':' || (m.sububicacion_id = :'alm_t')
                        || ':' || (m.usuario_id = :'micaela_p'), ',' order by m.cantidad desc, m.compra_item_id nulls last)
        from retail.movimientos m where m.lote_id = (:'r'::jsonb -> 'lotes' ->> 0)::uuid),
     ((select count(*) from retail.movimientos) - :mov0) || ' movimientos',
     (select c.recibido_cantidad || ':' || c.estado_recepcion from retail.compras c where c.id = :'comp'),
     (select d.estado || ':' || (d.cerrado_por = :'micaela_p') || ':' || (d.cerrado_en is not null) || ':' || d.nota_recepcion || ':'
             || (d.version - :v_d1) || ':' || (d.recepcion_huella is not null) || ':' || coalesce(d.recepcion_token::text, 'sin token')
        from retail.despachos d where d.id = :'d1'),
     (select string_agg(r.cantidad || ':' || r.danadas || ':' || r.costo_unitario || ':' || (r.compra_item_id is not null), ',' order by r.costo_unitario, r.cantidad desc)
        from retail.despacho_recibidos r where r.despacho_id = :'d1'),
     (select count(*) from retail.despacho_diferencias x where x.despacho_id = :'d1') || ' diferencias',
     (select ${limpio("a.descripcion")} || ':' || a.modulo || ':' || (a.persona_id = :'micaela_p') || ':' || (a.ubicacion_id = :'tru')
        from retail.actividad a where a.accion = 'despacho_recibido' and a.registro_id = :'d1'));`,
  "buenas,danadas,despacho_id,faltan,lotes,numero,sobran,unidades / 14:14:0:0:0:1 / 6,4,6 / 30.00,30.00,38.33 / t / " +
    "true@6:recepcion:true:true,true@4:recepcion:true:true,false@4:recepcion:true:true / 3 movimientos / 10:recibida / " +
    "cerrado:true:true:Llegó en dos bolsas:1:true:sin token / 6:0:30.00:true,4:0:30.00:true,4:0:45.00:false / 0 diferencias / " +
    "recibió ENV (14 prendas):recibir:true:true",
);
caso(
  "R2 el cupo del papel: dos comprobantes (el más antiguo primero); se acaba a mitad de una variante y lo que pasa entra sin papel",
  `${PAPEL("comp_a", "601", [["l1", 3, 30]])}${PAPEL("comp_b", "602", [["l1", 4, 30]])}
   update retail.compras set created_at = created_at - interval '1 hour' where id = :'comp_a';
   ${BASE_D1()}
   select pg_temp.recibe(:'d1', :v_d1, ${A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)]))}, '[]'::jsonb, null, null) as r \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb),
     (select string_agg(case when v.id = :'v_s' then 'S' else 'M' end || ':' || r.cantidad || '@'
                        || case r.compra_item_id when (select id from retail.compra_items where compra_id = :'comp_a') then 'A'
                                                 when (select id from retail.compra_items where compra_id = :'comp_b') then 'B' else '-' end,
                        ',' order by case when v.id = :'v_s' then 1 else 2 end, r.compra_item_id = (select id from retail.compra_items where compra_id = :'comp_b'), r.compra_item_id nulls last)
        from retail.despacho_recibidos r join retail.variantes v on v.id = r.variante_id where r.despacho_item_id = :'di_l1'),
     (select string_agg(c.recibido_cantidad || '/' || c.facturado_cantidad, ',' order by c.numero) from retail.compras c where c.id in (:'comp_a', :'comp_b')),
     (select count(*) from retail.costo_historial h where h.variante_id = :'v_s' and h.cantidad_nueva = 6));`,
  "OK / S:3@A,S:3@B,M:1@B,M:3@- / 3/3,4/4 / 1",
);
caso(
  "R3 faltante: con causa queda la deuda (costo de la línea); sin causa, error; con causa sin faltar, error",
  `${BASE_D1()}
   select pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 5), V("v_m", 3)]), LIN("di_l2", [V("pv_s", 4)])))}) as sin_causa \\gset
   select pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)], { falt: "no_vino" }), LIN("di_l2", [V("pv_s", 4)])))}) as de_mas \\gset
   select ${RECIBE("d1", A(LIN("di_l1", [V("v_s", 5), V("v_m", 3)], { falt: "no_vino", costo: "28.50", nota: "El proveedor dice que lo manda el lunes" }), LIN("di_l2", [V("pv_s", 4)])))} as r \\gset
   reset role;
   select concat_ws(' / ', :'sin_causa', :'de_mas', (:'r'::jsonb ->> 'faltan') || ':' || (:'r'::jsonb ->> 'unidades'),
     (select x.tipo || ':' || x.causa || ':' || x.cantidad || ':' || x.costo_unitario || ':' || (x.proveedor_id = :'prov') || ':' || x.nota
        from retail.despacho_diferencias x where x.despacho_id = :'d1'),
     (select string_agg(v.costo::text, ',' order by v.id = :'v_s' desc) from retail.variantes v where v.id in (:'v_s', :'v_m')));`,
  "P0001|recepcion_faltante_causa|Faltan 2 de Chompas Recepción · Marca Recepción Prueba · Chompa cuello alto: elige qué pasó / " +
    "P0001|recepcion_faltante_causa|De Chompas Recepción · Marca Recepción Prueba · Chompa cuello alto no falta nada: quita «qué pasó» / " +
    "2:12 / faltante:no_vino:2:28.50:true:El proveedor dice que lo manda el lunes / 28.50,28.50",
);
caso(
  "R4 sobrante: con causa queda anotado y TODO lo contado entra al costo de la línea; sin causa, error",
  `${BASE_D1()}
   select pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 7), V("v_m", 5)]), LIN("di_l2", [V("pv_s", 4)])))}) as sin_causa \\gset
   select ${RECIBE("d1", A(LIN("di_l1", [V("v_s", 7), V("v_m", 5)], { sobr: "regalo" }), LIN("di_l2", [V("pv_s", 4)])))} as r \\gset
   reset role;
   select concat_ws(' / ', :'sin_causa', (:'r'::jsonb ->> 'sobran') || ':' || (:'r'::jsonb ->> 'unidades'),
     (select x.tipo || ':' || x.causa || ':' || x.cantidad || ':' || x.costo_unitario from retail.despacho_diferencias x where x.despacho_id = :'d1'),
     ${STOCK("v_s", "alm_t")} || ',' || ${STOCK("v_m", "alm_t")},
     (select string_agg(h.cantidad_nueva || '@' || h.costo_unitario_nuevo, ',' order by h.cantidad_nueva desc) from retail.costo_historial h
       where h.variante_id in (:'v_s', :'v_m')));`,
  "P0001|recepcion_sobrante_causa|Vinieron 2 de más de Chompas Recepción · Marca Recepción Prueba · Chompa cuello alto: elige qué pasa con ellas / " +
    "2:16 / sobrante:regalo:2:30.00 / 7,5 / 7@30.00,5@30.00",
);
caso(
  "R5 dañadas: van a la cuarentena con su fila en prendas_danadas (sin proveedor: va en el lote) y cuentan en el costo; sin «¿tiene arreglo?», error",
  `${BASE_D1()}
   select pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6, 2), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)])))}) as sin_sol \\gset
   select pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6, 7, "pendiente"), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)])))}) as de_mas \\gset
   select ${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6, 2, "pendiente"), V("v_m", 4, 1, "sin_solucion")]), LIN("di_l2", [V("pv_s", 4)])))} as r \\gset
   reset role;
   select concat_ws(' / ', :'sin_sol', :'de_mas',
     (:'r'::jsonb ->> 'buenas') || ':' || (:'r'::jsonb ->> 'danadas'),
     ${STOCK("v_s", "alm_t")} || '+' || ${STOCK("v_s", "cua_t")} || ',' || ${STOCK("v_m", "alm_t")} || '+' || ${STOCK("v_m", "cua_t")},
     (select string_agg(pd.cantidad || ':' || pd.estado || ':' || ${limpio("pd.motivo_reporte")} || ':' || pd.nota || ':' || coalesce(pd.proveedor_id::text, 'sin proveedor')
                        || ':' || (m.sububicacion_id = :'cua_t') || ':' || (l.proveedor_id = :'prov'), ',' order by pd.cantidad desc)
        from retail.prendas_danadas pd join retail.movimientos m on m.id = pd.movimiento_entrada_id join retail.lotes l on l.id = m.lote_id
       where pd.variante_id in (:'v_s', :'v_m')),
     (select string_agg(r.cantidad || ':' || r.danadas || ':' || coalesce(r.danada_solucion, '-') || ':' || (r.movimiento_id is not null) || ':'
                        || (r.movimiento_danada_id is not null), ',' order by r.cantidad desc)
        from retail.despacho_recibidos r where r.despacho_item_id = :'di_l1'),
     (select string_agg(h.cantidad_nueva::text, ',' order by h.cantidad_nueva desc) from retail.costo_historial h where h.variante_id in (:'v_s', :'v_m')),
     (select ${limpio("a.descripcion")} from retail.actividad a where a.accion = 'despacho_recibido' and a.registro_id = :'d1'));`,
  "P0001|recepcion_danada_solucion|En Chompas Recepción · Marca Recepción Prueba · Chompa cuello alto llegaron prendas dañadas: di si tienen arreglo / " +
    "P0001|recepcion_danadas|Las dañadas de Chompas Recepción · Marca Recepción Prueba · Chompa cuello alto van de 0 a lo que llegó de esa talla y color / " +
    "11:3 / 4+2,3+1 / 2:en_cuarentena:Llegó dañada en ENV:Tiene arreglo:sin proveedor:true:true,1:en_cuarentena:Llegó dañada en ENV:Sin arreglo:sin proveedor:true:true / " +
    "6:2:pendiente:true:true,4:1:sin_solucion:true:true / 6,4 / recibió ENV (14 prendas: 11 buenas, 3 dañadas)",
);
caso(
  "R6 lo que no estaba en la guía: entra sin papel, con su costo y su causa; sin costo o sin causa, error",
  `${BASE_D1(PAPEL("comp", "701", [["l1", 10, 30]]))}
   select pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)])), { extras: A(EXTRA({ costo: "null::numeric", vars: [V("pv_s", 3)] })) })}) as sin_costo \\gset
   select pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)])), { extras: A(EXTRA({ sobr: "null::text", vars: [V("pv_s", 3)] })) })}) as sin_causa \\gset
   select pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)])), { extras: A(EXTRA({ vars: [V("pv_s", 0)] })) })}) as vacio \\gset
   select ${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)])), { extras: A(EXTRA({ vars: [V("pv_s", 3)] })) })} as r \\gset
   reset role;
   select concat_ws(' / ', :'sin_costo', :'sin_causa', :'vacio',
     (:'r'::jsonb ->> 'unidades') || ':' || (:'r'::jsonb ->> 'sobran') || ':' || jsonb_array_length(:'r'::jsonb -> 'lotes'),
     (select r.extra_posicion || ':' || r.cantidad || ':' || r.costo_unitario || ':' || coalesce(r.compra_item_id::text, 'sin papel') || ':' || (r.proveedor_id = :'prov')
        from retail.despacho_recibidos r where r.despacho_id = :'d1' and r.despacho_item_id is null),
     (select x.extra_posicion || ':' || x.tipo || ':' || x.causa || ':' || x.cantidad || ':' || x.costo_unitario
        from retail.despacho_diferencias x where x.despacho_id = :'d1'),
     ${STOCK("pv_s", "alm_t")},
     (select v.costo from retail.variantes v where v.id = :'pv_s'));`,
  "P0001|recepcion_costo|Escribe el costo de Chompas Recepción · Marca Recepción Prueba (fuera de la guía) / " +
    "P0001|recepcion_sobrante_causa|Elige qué pasa con Chompas Recepción · Marca Recepción Prueba (fuera de la guía) / " +
    "P0001|recepcion_extra_vacio|Cuenta lo que llegó de Chompas Recepción · Marca Recepción Prueba (fuera de la guía) o quítalo / " +
    // pv_s: 2 a S/ 25 + 4 a S/ 45 (la línea) = 6 a S/ 38.33; + 3 a S/ 40 (fuera de la guía) = 9 a S/ 38.89.
    "17:3:1 / 1:3:40.00:sin papel:true / 1:sobrante:cobra_aparte:3:40.00 / 9 / 38.89",
);
caso(
  "R7 dos proveedores en una guía: un lote cada uno; lo que no estaba en la guía pide de cuál proveedor es",
  `${ENVIA("d1", [["l1", 10], ["l_o2", 6]])}${ITEM("d1", "l1")}${ITEM("d1", "l_o2")}
   ${MICAELA_RECIBE}${ABRE("d1")}${PRENDA_NUEVA("d1")}
   select pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 10)]), LIN("di_l_o2", [V("pv_s", 6)])), { extras: A(EXTRA({ vars: [V("v_m", 1)] })) })}) as sin_prov \\gset
   select ${RECIBE("d1", A(LIN("di_l1", [V("v_s", 10)]), LIN("di_l_o2", [V("pv_s", 6)])), { extras: A(EXTRA({ prov: ":'prov2'", vars: [V("v_m", 1)] })) })} as r \\gset
   reset role;
   select concat_ws(' / ', :'sin_prov', jsonb_array_length(:'r'::jsonb -> 'lotes'),
     (select string_agg(case l.proveedor_id when :'prov' then 'prov' else 'prov2' end || ':'
                        || (select sum(m.cantidad) from retail.movimientos m where m.lote_id = l.id), ',' order by l.proveedor_id = :'prov' desc)
        from retail.lotes l where l.despacho_id = :'d1'));`,
  "P0001|recepcion_extra_proveedor|Este envío trae varios proveedores: elige de cuál es lo que no estaba en la guía (fila 1) / 2 / prov:10,prov2:7",
);
caso(
  "R8 lo que no se acepta (sin escribir nada): sin abrir, versión vieja, falta una línea, línea repetida o ajena, talla repetida, costo raro, nota larga, prenda de otra categoría",
  `${BASE_D1()}
   ${ENVIA("d2", [["l_o3", 3]])}${ITEM("d2", "l_o3")}
   ${ENVIA("d4", [["l_o2", 2]])}
   insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat2', 'Gorro Recepción', :'marca', :'prov3')
     returning id as gorro \\gset
   insert into retail.variantes (producto_id, talla_id, precio, costo) values (:'gorro', :'t_s', 30, 10) returning id as gv \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select concat_ws(' / ',
     pg_temp.e(${RECIBE("d4", A())}),
     pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 10)]), LIN("di_l2", [V("pv_s", 4)])), { version: ":v_d1 - 1" })}),
     pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 10)])))}),
     pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 10)]), LIN("di_l1", [V("v_s", 10)])))}),
     pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 10)]), LIN("di_l_o3", [V("pv_s", 4)])))}),
     pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 10)]), LIN("di_l2", [V("pv_s", 2), V("pv_s", 2)])))}),
     pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 10)], { costo: "30.555" }), LIN("di_l2", [V("pv_s", 4)])))}),
     pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 10)]), LIN("di_l2", [V("pv_s", 4)])), { nota: "repeat('x', 501)" })}),
     pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("gv", 10)]), LIN("di_l2", [V("pv_s", 4)])))})) as r \\gset
   reset role;
   select ${limpio(":'r'")} || ' / ' || (select d.estado || ':' || (select count(*) from retail.despacho_recibidos r where r.despacho_id = d.id)
                                        from retail.despachos d where d.id = :'d1');`,
  [
    "P0001|envio_sin_abrir|Este envío todavía no se abrió: pulsa «Empezar a recibir»",
    "PT409|version_cambiada|Alguien cambió este envío: recarga",
    "P0001|recepcion_falta_linea|Falta contar Chompas Recepción · Marca Recepción Prueba (línea 2 de la OC1): cuéntala, aunque no haya llegado nada",
    "P0001|recepcion_linea_repetida|La línea 2 se repite: cada línea del envío va una sola vez",
    "P0001|recepcion_linea_ajena|La línea 2 no es de este envío: recarga la pantalla",
    "P0001|recepcion_variante_repetida|En Chompas Recepción · Marca Recepción Prueba se repite una talla y color: cuéntala una sola vez",
    "P0001|recepcion_costo|El costo de Chompas Recepción · Marca Recepción Prueba · Chompa cuello alto va de S/ 0 a S/ 99 999.99, con hasta dos decimales",
    "P0001|recepcion_nota|La nota es muy larga: hasta 500 letras",
    "P0001|recepcion_prenda_ajena|Una de las prendas de Chompas Recepción · Marca Recepción Prueba · Chompa cuello alto es de otra categoría o marca: elígela de nuevo",
    "abierto:0",
  ].join(" / "),
);

// T. EL MISMO TOKEN -------------------------------------------------------------------------------------------------------
caso(
  "T1 el mismo token con la misma huella devuelve lo mismo y no duplica; con otros datos, error; otro token sobre un envío recibido, error",
  `${BASE_D1()}
   select gen_random_uuid() as tok \\gset
   reset role;
   select count(*) as mov0 from retail.movimientos \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select ${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)])), { token: ":'tok'" })} as r1 \\gset
   select ${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)])), { token: ":'tok'" })} as r2 \\gset
   select pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 5), V("v_m", 5)]), LIN("di_l2", [V("pv_s", 4)])), { token: ":'tok'" })}) as r3 \\gset
   select pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)])), { token: "gen_random_uuid()" })}) as r4 \\gset
   reset role;
   select concat_ws(' / ', :'r1' = :'r2', (select count(*) from retail.movimientos) - :mov0, :'r3', :'r4',
     (select (d.recepcion_token = :'tok') from retail.despachos d where d.id = :'d1'));`,
  "t / 3 / P0001|recepcion_otros_datos|Esa recepción ya se guardó con otros datos: recarga la pantalla / " +
    "P0001|envio_ya_recibido|Este envío ya se recibió / t",
);

// C. COSTO ATÍPICO --------------------------------------------------------------------------------------------------------
caso(
  "C1 costo atípico: sin confirmar no escribe nada y dice cuál (detail en JSON); confirmado, entra y deja constancia en el lote",
  `${BASE_D1()}
   reset role;
   select count(*) as mov0 from retail.movimientos \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.recibe(:'d1', :v_d1, ${A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)], { costo: "80" }))}, '[]'::jsonb, null, null) as r1 \\gset
   reset role;
   select count(*) as mov1 from retail.movimientos \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.recibe(:'d1', :v_d1, ${A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)], { costo: "80", confirma: "true" }))}, '[]'::jsonb, null, null) as r2 \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r1'::jsonb),
     (select string_agg(${CLAVES("x")} || '=' || (x ->> 'motivo') || ':' || (x ->> 'costo') || ':' || (x ->> 'vigente') || ':' || (x ->> 'precio') || ':'
                        || ((x ->> 'despacho_item_id') = :'di_l2') || ':' || ((x ->> 'variante_id') = :'pv_s'), ' | ')
        from jsonb_array_elements((:'r1'::jsonb ->> 'detail')::jsonb) x),
     :mov1 - :mov0, pg_temp.e(:'r2'::jsonb),
     (select ${limpio("l.nota")} from retail.lotes l where l.despacho_id = :'d1'),
     (select v.costo from retail.variantes v where v.id = :'pv_s'));`,
  "P0001|recepcion_costo_atipico|Hay un costo fuera de lo normal: revísalo y confírmalo para recibir / " +
    "costo,costo_unitario,costo_vigente,despacho_item_id,extra,motivo,precio,sku,variante_id,vigente=mayor_que_precio:80:25.00:79.90:true:true / 0 / OK / " +
    "Envío ENV · Costo atípico confirmado en 1 talla o color / 61.67",
);

caso(
  "C2 un rol que recibe pero no ve los costos de Compras (limitado como hoy) no confirma un costo atípico: el aviso, sin cifras",
  `${BASE_D1()}
   reset role;
   update retail.roles set limitado_como_hoy = true where id = :'rol';
   ${como(MICAELA)}${EN_TIENDA}
   select ${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)], { costo: "80", confirma: "true" })))} as r \\gset
   reset role;
   select pg_temp.e(:'r'::jsonb) || ' / ' || coalesce(:'r'::jsonb ->> 'detail', 'sin detalle');`,
  "P0001|recepcion_costo_atipico_sin_permiso|Hay un costo fuera de lo normal y tu rol no puede confirmarlo: pídeselo a quien ve los costos de Compras / sin detalle",
);

// D. ORDEN DIRECTA SIN GUÍA -----------------------------------------------------------------------------------------------
caso(
  "D1 una orden directo sin guía: crea el envío abierto con lo que le queda; el mismo token, lo mismo; sin nada pendiente, entra al abierto",
  `${MICAELA_RECIBE}
   select retail.fn_ordenes_directas_por_recibir(:'tru') as antes \\gset
   select gen_random_uuid() as tok \\gset
   select pg_temp.sin_guia(:'o1', :'tok') as s1 \\gset
   select pg_temp.sin_guia(:'o1', :'tok') as s2 \\gset
   select pg_temp.sin_guia(:'o1', gen_random_uuid()) as s3 \\gset
   select retail.fn_ordenes_directas_por_recibir(:'tru') as despues \\gset
   reset role;
   select concat_ws(' / ',
     (select (x ->> 'unidades_por_enviar') || ':' || (x ->> 'creada_por_mi') || ':' || (x ->> 'proveedor') || ':' || ${CLAVES("x")}
        from jsonb_array_elements(:'antes'::jsonb) x where x ->> 'orden_id' = :'o1'),
     (select string_agg(x ->> 'creada_por_mi', ',') from jsonb_array_elements(:'antes'::jsonb) x where x ->> 'orden_id' = :'o3'),
     ${CLAVES(":'s1'::jsonb")}, (:'s1'::jsonb ->> 'estado') || ':' || (:'s1'::jsonb ->> 'version'),
     :'s1' = :'s2', (:'s3'::jsonb ->> 'despacho_id') = (:'s1'::jsonb ->> 'despacho_id'),
     (select d.estado || ':' || coalesce(d.numero_guia, 'sin guía') || ':' || d.nota || ':' || (d.despachado_por = :'micaela_p') || ':' || (d.abierto_por = :'micaela_p')
        from retail.despachos d where d.id = (:'s1'::jsonb ->> 'despacho_id')::uuid),
     (select string_agg(di.cantidad || 'x' || di.precio_unitario, ',' order by di.cantidad desc) from retail.despacho_items di
       where di.despacho_id = (:'s1'::jsonb ->> 'despacho_id')::uuid),
     (select count(*) from jsonb_array_elements(:'despues'::jsonb) x where x ->> 'orden_id' = :'o1'),
     (select ${limpio("a.descripcion")} from retail.actividad a where a.accion = 'despacho_sin_guia'
         and a.registro_id = :'s1'::jsonb ->> 'despacho_id'));`,
  "14:false:Proveedor Recepción Prueba:creada_por_mi,fecha_entrega_estimada,numero,orden_id,proveedor,proveedor_id,unidades_por_enviar / true / " +
    "despacho_id,estado,numero,version / abierto:2 / t / t / abierto:sin guía:Llegó directo a la tienda, sin guía:true:true / 10x30.00,4x45.00 / 0 / " +
    "empezó a recibir sin guía la OC1 (Proveedor Recepción Prueba) en la ENV",
);
caso(
  "D2 sin guía no: una «Por repartir», una anulada, una que hizo quien recibe, ni una que llega a otra sede",
  `reset role;
   update retail.ordenes_compra set estado = 'anulada', anulada_por = :'felipe_p', anulada_en = now(), motivo_anulacion = 'Prueba'
    where id = :'o1';
   insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'lim', :'felipe_p')
     returning id as o_lim \\gset
   insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
     values (:'o_lim', 1, :'cat', :'marca', 2, 30);
   ${MICAELA_RECIBE}
   select concat_ws(' / ', pg_temp.e(pg_temp.sin_guia(:'o2', null)), pg_temp.e(pg_temp.sin_guia(:'o1', null)), pg_temp.e(pg_temp.sin_guia(:'o3', null)),
     pg_temp.e(pg_temp.sin_guia(:'o_lim', null)));`,
  "P0001|orden_por_repartir|Esta orden es «Por repartir»: llega a Lima y se recibe con los envíos que salen de ahí / " +
    "P0001|orden_compra_anulada|Esta orden está anulada: ya no se recibe / " + QUIEN_COMPRO + " / " +
    "42501|recibir_otra_sede|Esta orden llega a Tienda Lima: la recibe esa tienda",
);

// L. LECTURAS -------------------------------------------------------------------------------------------------------------
caso(
  "L1 los envíos por recibir de una sede: en camino y abiertos (no anulados, cerrados ni de otra sede), con su estado y quién hizo la orden",
  `${ENVIA("d1", [["l1", 4]])}${ENVIA("d2", [["l1", 3]])}${ENVIA("d3", [["l1", 2]])}${ENVIA("d4", [["l1", 1]])}
   ${ENVIA("d_lim", [["l_o2", 2]], { sede: ":'lim'" })}
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.anular_envio(:'d3', :v_d3, 'No va') \\g /dev/null
   reset role;
   update retail.despachos set estado = 'abierto', abierto_por = :'sandra_p', abierto_en = now() where id in (:'d2', :'d4');
   update retail.despachos set estado = 'cerrado', cerrado_por = :'sandra_p', cerrado_en = now() where id = :'d4';
   ${MICAELA_RECIBE}
   select retail.fn_envios_por_recibir(:'tru') as mica \\gset
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.fn_envios_por_recibir(:'tru') as feli \\gset
   reset role;
   select concat_ws(' / ',
     (select string_agg(case x ->> 'id' when :'d1' then 'd1' when :'d2' then 'd2' else 'otro' end || ':' || (x ->> 'estado') || ':' || (x ->> 'unidades')
                        || ':' || (x ->> 'creado_por_mi'), ',' order by (x ->> 'numero'))
        from jsonb_array_elements(:'mica'::jsonb) x where x ->> 'id' in (:'d1', :'d2', :'d3', :'d4', :'d_lim')),
     (select string_agg(x ->> 'creado_por_mi', ',') from jsonb_array_elements(:'feli'::jsonb) x where x ->> 'id' in (:'d1', :'d2')),
     ${CLAVES(":'mica'::jsonb -> 0")});`,
  "d1:en_camino:4:false,d2:abierto:3:false / true,true / " +
    "abierto_en,abierto_por,creado_por_mi,despachado_en,despachado_por,estado,id,lineas,nota,numero,numero_guia,ordenes,proveedores," +
    "unidades,version",
);
caso(
  "L2 el detalle: categoría, marca y orden como objetos, precio sugerido del papel, proveedores; cerrado, cómo se cerró",
  `${BASE_D1(PAPEL("comp", "801", [["l1", 10, 30, 89.9]]))}
   select retail.fn_envio_detalle(:'d1') as antes \\gset
   select ${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6, 1, "pendiente"), V("v_m", 3)], { falt: "se_perdio" }), LIN("di_l2", [V("pv_s", 4)])), { nota: "'Todo bien'" })} as r \\gset
   select retail.fn_envio_detalle(:'d1') as despues \\gset
   reset role;
   select concat_ws(' / ',
     ${CLAVES(":'antes'::jsonb -> 'lineas' -> 0")},
     ${CLAVES(":'antes'::jsonb -> 'lineas' -> 0 -> 'categoria'")} || ';' || ${CLAVES(":'antes'::jsonb -> 'lineas' -> 0 -> 'marca'")} || ';'
       || ${CLAVES(":'antes'::jsonb -> 'lineas' -> 0 -> 'orden'")},
     (select string_agg(coalesce(l ->> 'precio_venta_sugerido', '-'), ',' order by (l ->> 'posicion')::int) from jsonb_array_elements(:'antes'::jsonb -> 'lineas') l),
     (select string_agg(p ->> 'nombre', ',') from jsonb_array_elements(:'antes'::jsonb -> 'proveedores') p),
     (:'antes'::jsonb ->> 'creado_por_mi') || ':' || jsonb_array_length(:'antes'::jsonb -> 'recibidos') || ':' || coalesce(:'antes'::jsonb ->> 'recepcion', 'sin recepción'),
     (:'despues'::jsonb ->> 'estado') || ':' || (:'despues'::jsonb ->> 'nota_recepcion') || ':' || (:'despues'::jsonb -> 'recepcion' ->> 'faltan'),
     (select string_agg((x ->> 'prenda') || ' ' || (x ->> 'talla') || ':' || (x ->> 'cantidad') || ':' || (x ->> 'danadas') || ':' || (x ->> 'costo_unitario'), ','
                        order by o)
        from jsonb_array_elements(:'despues'::jsonb -> 'recibidos') with ordinality t(x, o)),
     (select string_agg((x ->> 'tipo') || ':' || (x ->> 'causa') || ':' || (x ->> 'cantidad'), ',') from jsonb_array_elements(:'despues'::jsonb -> 'diferencias') x));`,
  "cantidad,categoria,categoria_id,compra_item_id,descripcion,id,marca,marca_id,orden,orden_compra_id,orden_compra_item_id,posicion," +
    "precio_unitario,precio_venta_sugerido,proveedor / familia,id,nombre,prefijo;id,nombre;id,numero / 89.90,- / Proveedor Recepción Prueba / " +
    "false:0:sin recepción / cerrado:Todo bien:1 / Chompa Trenzada Recepción M:3:0:30.00,Chompa Trenzada Recepción S:6:1:30.00," +
    "Chompa Catálogo Recepción S:4:0:45.00 / faltante:se_perdio:1",
);
caso(
  "L3 las prendas para «Ya la tengo»: de esa categoría y marca, activas, con sus variantes (costo y precio); la búsqueda primero",
  `${MICAELA_RECIBE}
   reset role;
   insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat', 'Chompa Trenzada Azul', :'marca', :'prov3')
     returning id as p2 \\gset
   insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id, estado) values (:'cat', 'Chompa Vieja', :'marca', :'prov3', 'descontinuado');
   insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat2', 'Gorro Trenzado', :'marca', :'prov3');
   ${como(MICAELA)}${EN_TIENDA}
   select retail.fn_prendas_para_recibir(:'cat', :'marca', 'TRÉNZADA') as q \\gset
   select retail.fn_prendas_para_recibir(:'cat', :'marca', null) as todas \\gset
   reset role;
   select concat_ws(' / ',
     (select string_agg((x ->> 'nombre') || ':' || (x ->> 'coincide'), ',' order by o) from jsonb_array_elements(:'q'::jsonb) with ordinality t(x, o)),
     (select string_agg(x ->> 'nombre', ',' order by o) from jsonb_array_elements(:'todas'::jsonb) with ordinality t(x, o)),
     (select ${CLAVES("x -> 'variantes' -> 0")} || ':' || (x -> 'variantes' -> 0 ->> 'costo') || ':' || (x -> 'variantes' -> 0 ->> 'precio')
        from jsonb_array_elements(:'q'::jsonb) x where x ->> 'id' = :'prod_p'));`,
  "Chompa Trenzada Azul:true,Chompa Catálogo Recepción:false / Chompa Catálogo Recepción,Chompa Trenzada Azul / " +
    "codigo,color,color_codigo,color_hex,costo,id,precio,talla,talla_id:25.00:79.90",
);

// S. LA FORMA -------------------------------------------------------------------------------------------------------------
const PUBLICAS = "('abrir_despacho', 'recibir_orden_sin_envio', 'preparar_prenda_al_recibir', 'recibir_despacho', 'fn_envios_por_recibir', " +
  "'fn_ordenes_directas_por_recibir', 'fn_envio_detalle', 'fn_prendas_para_recibir')";
const INTERNAS = "('fn_recepcion_quien_mira', 'fn_recepcion_exigir', 'fn_recepcion_leer_variantes', 'fn_recepcion_resultado')";
const DE_RETAIL = (lista) => `from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ${lista}`;
caso(
  "S1 una función por nombre, security definer, authenticated sí y anon no; las internas cerradas; RLS sin políticas; nadie lee directo",
  `select concat_ws(',',
     (select count(*) ${DE_RETAIL(PUBLICAS)}),
     (select bool_and(p.prosecdef) ${DE_RETAIL(PUBLICAS)}),
     (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) ${DE_RETAIL(PUBLICAS)}),
     (select bool_or(has_function_privilege('anon', p.oid, 'execute')) ${DE_RETAIL(PUBLICAS)}),
     (select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) ${DE_RETAIL(INTERNAS)}),
     (select string_agg(c.relname || ':' || c.relrowsecurity, ' ' order by c.relname) from pg_class c
       where c.oid in ('retail.despacho_recibidos'::regclass, 'retail.despacho_diferencias'::regclass)),
     (select count(*) from pg_policies where schemaname = 'retail' and tablename in ('despacho_recibidos', 'despacho_diferencias')),
     has_table_privilege('authenticated', 'retail.despacho_recibidos', 'select'),
     has_table_privilege('authenticated', 'retail.despacho_diferencias', 'insert'),
     (select count(*) from retail.acciones_sin_responsable where clave like 'recib%' or clave like 'despacho%'));`,
  "8,t,t,f,f,despacho_diferencias:true despacho_recibidos:true,0,f,f,0",
);
caso(
  "S2 solo se agrega: lo recibido no se cambia ni se borra, ni se suma a un envío cerrado; lo de la recepción solo al cerrar y no cambia",
  `${BASE_D1()}
   select ${RECIBE("d1", A(LIN("di_l1", [V("v_s", 6), V("v_m", 4)]), LIN("di_l2", [V("pv_s", 4)])), { nota: "'Ok'" })} as r \\gset
   reset role;
   select concat_ws(' / ',
     pg_temp.intento(format('update retail.despacho_recibidos set cantidad = 1 where despacho_id = %L', :'d1')),
     pg_temp.intento(format('delete from retail.despacho_recibidos where despacho_id = %L', :'d1')),
     pg_temp.intento(format('insert into retail.despacho_diferencias (despacho_id, despacho_item_id, proveedor_id, categoria_id, marca_id, tipo, causa, cantidad, costo_unitario, creado_por) values (%L, %L, %L, %L, %L, %L, %L, 1, 1, %L)',
       :'d1', :'di_l1', :'prov', :'cat', :'marca', 'faltante', 'no_vino', :'micaela_p')),
     pg_temp.intento(format('update retail.despachos set nota_recepcion = %L where id = %L', 'Otra cosa', :'d1')),
     pg_temp.intento(format('update retail.despachos set cerrado_por = %L where id = %L', :'sandra_p', :'d1')));
   `,
  "42501|Lo que se recibió de un envío no se cambia ni se borra: queda como se cerró / " +
    "42501|Lo que se recibió de un envío no se cambia ni se borra: queda como se cerró / " +
    "23514|Solo se anota lo que llegó de un envío abierto / " +
    "23514|Cómo se recibió un envío se escribe al cerrarlo y ya no se cambia / " +
    "23514|Quién y cuándo abrió y recibió un envío ya recibido no se cambia",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Pruebas de «Nos debe», lo que el proveedor le debe a CAYLA (ADR-0362, fase 5a; Felipe 2026-10-12) — migración
 * `20261013015000_nos_debe.sql`. Contrato: docs/compras/ordenes-de-compra-2026-10/contrato-nos-debe.md.
 *
 * LO QUE VIGILA. Que un faltante «No vino» de una recepción sea una deuda del proveedor que se ve (la ficha, el resumen, el detalle del
 * envío) y se cierra con la prenda (decisión 14): a mano con una nota, o en la próxima recepción marcando lo de más como «Es la reposición
 * de lo que faltó», que salda las deudas de la más antigua a la más nueva. Que lo resuelto nunca pase de lo debido —ni con dos personas a
 * la vez—, que solo un «No vino» sea deuda, que lo resuelto no se cambie ni se borre y que pasar a saldo a favor o cobrar un depósito
 * (fase 5b, dinero) responda «Todavía no».
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga DOS veces dentro de cada caso, así se prueba que se puede
 * pegar dos veces y corre con la base al día). Micaela es de Tienda Trujillo y no es líder (un rol de prueba con los módulos que pide cada
 * caso, y marcó su entrada: firma ella en el combo «Responsable»); Felipe es líder y Admin, hace las órdenes, los papeles y los envíos;
 * Sandra es líder y Admin. El responsable obligatorio va encendido, como en producción.
 *   N  LA DEUDA: nace solo de un faltante «no vino» (no de «se perdió» ni de «llegó a otra sede»); la ficha y el resumen la leen con su
 *      monto sin IGV, y con el IGV al lado si su papel es una factura con IGV.
 *   M  A MANO: «Llegó la reposición» con nota; la cantidad, la nota, lo saldado y lo que pasa de lo debido; el mismo token; la actividad;
 *      la deuda saldada pasa a «cerradas».
 *   B  FASE 5B: saldo a favor y depósito responden «Todavía no» sin escribir nada.
 *   P  PERMISOS: Proveedores o Recibir resuelven; la plata de Compras y Órdenes de compra solo leen; sin módulos, 42501; sin elegir
 *      responsable, no.
 *   R  EN LA RECEPCIÓN: la reposición salda la más antigua primero y no pasa de lo debido; no salda una deuda de la misma recepción;
 *      fuera de la guía y con dos proveedores; el detalle del envío dice cuándo ofrecerla (y no cuenta las deudas del propio envío).
 *   T  LOS CANDADOS DE LA TABLA (sin pasar por las funciones): no pasa de lo debido, solo deudas «no vino», solo se agrega, una reposición
 *      de otra categoría no, y lo marcado como reposición se reparte entero al confirmar.
 *   S  LA FORMA: security definer, authenticated sí y anon no, internas cerradas, RLS sin políticas, nadie lee la tabla directo.
 *   C  DOS SESIONES A LA VEZ: la segunda espera la deuda bloqueada y ve lo que dejó la primera (no pasa de lo debido). Hace COMMIT de un
 *      envío de prueba y lo borra al terminar (deshace lo suyo), así que NO corre contra la base local compartida: solo en el CI (cada tanda
 *      tiene su base) o con `--contenedor` de un banco propio.
 *
 * USO
 *   node scripts/pruebas/nos_debe.mjs                                → contra el stack local compartido (sin el caso C)
 *   node scripts/pruebas/nos_debe.mjs --contenedor supabase_db_x     → contra otro stack (un banco de pruebas propio), con el caso C
 *   node scripts/pruebas/nos_debe.mjs --sin-migracion                → sin cargar la migración: contra una base sin el cambio, la prueba
 *                                                                      tiene que FALLAR
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
const BASE = arg("--base", "postgres");
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
// El caso de dos sesiones hace COMMIT (y lo deshace al final): nunca en la base local compartida, donde trabajan otras sesiones.
const DOS_SESIONES = Boolean(process.env.CI) || CONTENEDOR !== COMPARTIDO || process.argv.includes("--dos-sesiones");
const MIGRACIONES = SIN_MIGRACION
  ? ""
  : [
      // ADR-0393: 20261013015000 (la 5a) ya no se recarga. Ya está en producción, y desde 20261013172000 sus dos bloques sobre
      // recibir_despacho (validar y saldar la reposición) viven en fn_recepcion_cerrar: re-pegarla encima falla a propósito (sus anclas
      // ya no están ahí). Se recarga la cadena que hoy escribe lo que esta prueba mira, en su orden.
      "20261013170000_recepcion_un_solo_camino_de_cierre.sql",
      // ADR-0393: el conteo guardado; recibir_despacho deja también el conteo de cada línea.
      "20261013171000_conteo_de_envio.sql",
      // ADR-0393: el cierre único (fn_recepcion_cerrar) con la reposición adentro, y los pendientes.
      "20261013172000_cerrar_conteo_con_pendientes.sql",
      // ADR-0393: «Hacer ahora» con lo pendiente y el número del aviso.
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
function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
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
-- «SIN_ERROR», o «sqlstate|hint|mensaje» si falló.
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
-- Lo mismo, pero además dispara al momento los candados diferidos de lo que escribió (y si fallan, lo deshace).
create function pg_temp.diferido(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  set constraints all immediate;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
-- «OK» si respondió, o «sqlstate|hint|mensaje» si falló.
create function pg_temp.e(p jsonb) returns text language sql as $f$
  select case when p ? 'error' then (p ->> 'error') || '|' || coalesce(p ->> 'hint', '') || '|' || (p ->> 'msg') else 'OK' end;
$f$;
grant execute on function pg_temp.e(jsonb) to authenticated;
${atrapa("abre", "p_id uuid, p_version integer", "retail.abrir_despacho(p_id, p_version)")}
${atrapa(
  "recibe",
  "p_id uuid, p_version integer, p_lineas jsonb, p_extras jsonb, p_nota text, p_token uuid",
  "retail.recibir_despacho(p_id, p_version, p_lineas, p_extras, p_nota, p_token)",
)}
${atrapa(
  "resuelve",
  "p_dif uuid, p_forma text, p_cantidad integer, p_nota text, p_token uuid",
  "retail.resolver_deuda_proveedor(p_dif, p_forma, p_cantidad, p_nota, p_token)",
)}
${atrapa("debe", "p_prov uuid", "retail.fn_proveedor_nos_debe(p_prov)")}
${atrapa("resumen", "p_nada integer", "retail.fn_nos_debe_resumen()")}
${atrapa("detalle", "p_id uuid", "retail.fn_envio_detalle(p_id)")}

-- Datos propios de la prueba, creados como Felipe (líder): la prenda de catálogo nace aprobada.
select set_config('request.jwt.claim.sub', '${FELIPE}', true) \\g /dev/null
select set_config('request.jwt.claims', '{"sub":"${FELIPE}","role":"authenticated"}', true) \\g /dev/null
insert into retail.proveedores (nombre) values ('Proveedor Nos Debe Prueba') returning id as prov \\gset
insert into retail.proveedores (nombre) values ('Proveedor Nos Debe Dos') returning id as prov2 \\gset
insert into retail.marcas (nombre) values ('Marca Nos Debe Prueba') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('Polos Nos Debe', 'accesorios') returning id as cat \\gset
insert into retail.categorias (nombre, familia) values ('Chompas Nos Debe', 'accesorios') returning id as cat2 \\gset
select id as t_s from retail.tallas where valor = 'S' \\gset
select id as t_m from retail.tallas where valor = 'M' \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat', :'t_s'), (:'cat', :'t_m'), (:'cat2', :'t_s');
select codigo as c1 from retail.colores where activo order by orden, codigo limit 1 \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select p.id as sandra_p from public.personas p where p.auth_user_id = '${SANDRA}' \\gset
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as alm_t from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
-- Como en producción: el responsable obligatorio encendido; Micaela marcó su entrada en Trujillo.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values (:'micaela_p', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
-- Las prendas que llegan (de catálogo, con el costo de la orden: ningún costo atípico).
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov'), (:'marca', :'prov2');
insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat', 'Polo Nos Debe', :'marca', :'prov')
  returning id as p_polo \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo) values (:'p_polo', :'t_s', :'c1', 59.90, 20)
  returning id as vp_s \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo) values (:'p_polo', :'t_m', :'c1', 59.90, 20)
  returning id as vp_m \\gset
insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat2', 'Chompa Nos Debe', :'marca', :'prov')
  returning id as p_chompa \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo) values (:'p_chompa', :'t_s', :'c1', 89.90, 30)
  returning id as vc_s \\gset
-- O1 directo a Trujillo (prov), la hace Felipe: l1 = 20 polos a S/ 20; l2 = 6 chompas a S/ 30; l3 = 4 polos a S/ 20.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'felipe_p')
  returning id as o1, numero as n1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario)
  values (:'o1', 1, :'cat', :'marca', 'Polo básico', 20, 20) returning id as l1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o1', 2, :'cat2', :'marca', 6, 30) returning id as l2 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario)
  values (:'o1', 3, :'cat', :'marca', 'Polo cuello V', 4, 20) returning id as l3 \\gset
-- O2 directo a Trujillo (prov2), la hace Felipe: l4 = 5 polos a S/ 22.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov2', :'tru', :'felipe_p')
  returning id as o2 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o2', 1, :'cat', :'marca', 5, 22) returning id as l4 \\gset
select retail.fn_orden_compra_numero_texto(:n1) as oc1 \\gset
select set_config('request.jwt.claim.sub', '', true) \\g /dev/null
select set_config('request.jwt.claims', '', true) \\g /dev/null
`;

// Micaela con un rol de prueba (sin clave, como los roles a medida) que ve SOLO esos módulos. Se va con el ROLLBACK.
const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba nos debe ' || substr(md5(random()::text), 1, 8)) returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
`;
const MICAELA_CON = (...modulos) => `${rolDeMicaela(...modulos)}${como(MICAELA)}${EN_TIENDA}`;

// SQL de jsonb.
const J = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const A = (...xs) => `jsonb_build_array(${xs.join(", ")})`;
const V = (v, cantidad) => J({ variante_id: `:'${v}'`, cantidad, danadas: 0, danada_solucion: "null::text" });
const LIN = (di, vars, { costo = "null::numeric", falt = null, sobr = null, nota = null } = {}) =>
  J({
    despacho_item_id: `:'${di}'`,
    costo_unitario: costo,
    confirma_costo: "false",
    variantes: A(...vars),
    faltante_causa: falt ? `'${falt}'` : "null::text",
    sobrante_causa: sobr ? `'${sobr}'` : "null::text",
    ...(nota ? { nota: `'${nota}'` } : {}),
  });
const EXTRA = ({ prov = "null::uuid", cat = ":'cat'", marca = ":'marca'", costo = "20", vars, sobr = "'reposicion_faltante'" }) =>
  J({ proveedor_id: prov, categoria_id: cat, marca_id: marca, costo_unitario: costo, confirma_costo: "false", variantes: A(...vars), sobrante_causa: sobr });

// Felipe (líder, Admin: firma él sin combo) envía, y la versión queda en :v_<nombre>. `lineas`: [[orden_compra_item, cantidad]].
const ENVIA = (nombre, lineas) => `
${como(FELIPE)}${SIN_ENCABEZADOS}
select (retail.crear_envio(:'tru', ${A(...lineas.map(([l, n]) => J({ orden_compra_item_id: `:'${l}'`, cantidad: n })))}, 'T001-88', null, null) ->> 'despacho_id') as ${nombre} \\gset
reset role;
select version as v_${nombre} from retail.despachos where id = :'${nombre}' \\gset
`;
// La línea (despacho_item) de una línea pedida en un envío: :<variable> (por defecto :di_<línea>).
const ITEM = (envio, l, variable = `di_${l}`) =>
  `select id as ${variable} from retail.despacho_items where despacho_id = :'${envio}' and orden_compra_item_id = :'${l}' \\gset\n`;
// Felipe registra el papel de la O1: [[línea, cantidad, costo]].
const PAPEL = (nombre, tipo, serie, numero, lineas) => `
${como(FELIPE)}${SIN_ENCABEZADOS}
select (retail.registrar_comprobante_orden(:'o1', '${tipo}', '${serie}', '${numero}',
  ${A(...lineas.map(([l, n, c]) => J({ orden_compra_item_id: `:'${l}'`, cantidad: n, costo_unitario: c })))},
  null, 'credito', retail.fn_hoy_lima() + 30, true, null, null, null, null) ->> 'compra_id') as ${nombre} \\gset
reset role;
`;
// Micaela (con Recibir) abre el envío (la versión nueva queda en :v_<envío>).
const ABRE = (envio) => `select pg_temp.abre(:'${envio}', :v_${envio}) as ab_${envio} \\gset
select (:'ab_${envio}'::jsonb ->> 'version')::int as v_${envio} \\gset
`;
const RECIBE = (envio, lineas, { extras = "'[]'::jsonb", nota = "null::text", token = "null::uuid" } = {}) =>
  `pg_temp.recibe(:'${envio}', :v_${envio}, ${lineas}, ${extras}, ${nota}, ${token})`;
/**
 * Una deuda: Felipe envía `enviadas` de la línea `l`, Micaela (que ya tiene Recibir) abre el envío y cuenta `recibidas` de `variante`
 * (polos S, si no se dice); lo que falta «no vino». El envío queda en :d_<x>, su línea en :di_<x>, la respuesta de la recepción («OK» o el
 * error) en :rec_<x> y la deuda (la diferencia) en :<x>.
 */
const DEUDA = (x, l, enviadas, recibidas, variante = "vp_s") => `
${ENVIA(`d_${x}`, [[l, enviadas]])}${ITEM(`d_${x}`, l, `di_${x}`)}
${como(MICAELA)}${EN_TIENDA}
${ABRE(`d_${x}`)}
select pg_temp.e(${RECIBE(`d_${x}`, A(LIN(`di_${x}`, recibidas > 0 ? [V(variante, recibidas)] : [], { falt: "no_vino" })))}) as rec_${x} \\gset
reset role;
select id as ${x} from retail.despacho_diferencias where despacho_id = :'d_${x}' and tipo = 'faltante' and causa = 'no_vino' \\gset
`;
const CLAVES = (expr) => `(select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(${expr}) k)`;
const STOCK = (v) => `coalesce((select s.cantidad from retail.stock s where s.variante_id = :'${v}' and s.ubicacion_id = :'tru' and s.sububicacion_id = :'alm_t'), 0)`;
const limpio = (expr) => `regexp_replace(replace(${expr}, :'oc1', 'OC1'), 'ENV-[0-9]{6}', 'ENV', 'g')`;
// Lo resuelto y lo pendiente de una deuda: «resuelto/cantidad».
const ESTADO = (x) =>
  `(select coalesce(sum(r.cantidad), 0) || '/' || (select d.cantidad from retail.despacho_diferencias d where d.id = :'${x}')
      from retail.proveedor_deuda_resoluciones r where r.diferencia_id = :'${x}')`;

let casos = 0;
let fallas = 0;
function anotar(nombre, ok, esperado, obtenido) {
  casos++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  }
}
function caso(nombre, sql, esperado) {
  let obtenido;
  try {
    // Al final se disparan los candados diferidos (el tope de lo enviado, la reposición repartida): si algo quedó mal guardado, el caso
    // falla aquí.
    obtenido = psql(`${PRELUDIO}${sql}\nset constraints all immediate;\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => /ERROR|DETAIL|HINT|CONTEXT|LINE/.test(l)).slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  anotar(nombre, ok, typeof esperado === "function" ? "(ver la condición)" : esperado, obtenido);
}

const SIN_MODULO_RESOLVER = "42501|nos_debe_sin_modulo|Marcar lo que repuso un proveedor necesita el módulo «Proveedores» o «Recibir mercadería» en tu rol";
const SIN_MODULO_LEER = "42501|nos_debe_sin_modulo|Ver lo que te debe un proveedor necesita el módulo «Proveedores», la plata de Compras, «Órdenes de compra» o «Recibir mercadería» en tu rol";
const SIN_MODULO_RESUMEN = "42501|nos_debe_sin_modulo|Ver lo que te deben los proveedores necesita el módulo «Proveedores», la plata de Compras, «Órdenes de compra» o «Recibir mercadería» en tu rol";
const TODAVIA_NO = "P0001|nos_debe_todavia_no|Todavía no: lo decide Felipe con el contador";
const NO_ES_DEUDA = "P0001|nos_debe_no_es_deuda|Eso no es una deuda del proveedor: solo lo que «no vino» se repone";

// N. LA DEUDA -------------------------------------------------------------------------------------------------------------
caso(
  "N1 la deuda nace solo de un faltante «no vino» (no de «se perdió» ni «llegó a otra sede»), y la ficha y el resumen la leen",
  `${rolDeMicaela("recibir", "proveedores")}
   ${ENVIA("d1", [["l1", 10], ["l2", 6], ["l3", 4]])}${ITEM("d1", "l1")}${ITEM("d1", "l2")}${ITEM("d1", "l3")}
   ${como(MICAELA)}${EN_TIENDA}
   ${ABRE("d1")}
   select ${RECIBE("d1", A(
     LIN("di_l1", [V("vp_s", 4), V("vp_m", 3)], { falt: "no_vino", nota: "Faltó una bolsa" }),
     LIN("di_l2", [V("vc_s", 5)], { falt: "se_perdio" }),
     LIN("di_l3", [V("vp_s", 3)], { falt: "otra_sede" })))} as r \\gset
   select pg_temp.debe(:'prov') as f \\gset
   select pg_temp.resumen(0) as res \\gset
   reset role;
   select id as x_perdio from retail.despacho_diferencias where despacho_id = :'d1' and causa = 'se_perdio' \\gset
   select id as x_otra from retail.despacho_diferencias where despacho_id = :'d1' and causa = 'otra_sede' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(pg_temp.resuelve(:'x_perdio', 'repuesta', 1, 'Llegó', null)) as perdio \\gset
   select pg_temp.e(pg_temp.resuelve(:'x_otra', 'repuesta', 1, 'Llegó', null)) as otra \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb),
     ${CLAVES(":'f'::jsonb")},
     (:'f'::jsonb ->> 'deudas') || ':' || (:'f'::jsonb ->> 'unidades') || ':' || (:'f'::jsonb ->> 'monto') || ':' || (:'f'::jsonb ->> 'monto_con_igv')
       || ':' || jsonb_array_length(:'f'::jsonb -> 'abiertas') || ':' || jsonb_array_length(:'f'::jsonb -> 'cerradas'),
     ${CLAVES(":'f'::jsonb -> 'abiertas' -> 0")},
     (select ${limpio("x ->> 'envio'")} || ':' || (x -> 'sede' ->> 'nombre') || ':' || ${limpio("x -> 'orden' ->> 'numero'")} || ':'
             || (x -> 'categoria' ->> 'nombre') || ':' || (x -> 'marca' ->> 'nombre') || ':' || (x ->> 'descripcion') || ':'
             || (x ->> 'cantidad') || ':' || (x ->> 'resuelto') || ':' || (x ->> 'pendiente') || ':' || (x ->> 'estado') || ':'
             || (x ->> 'costo_unitario') || ':' || (x ->> 'monto') || ':' || (x ->> 'monto_pendiente') || ':' || (x ->> 'con_igv') || ':'
             || coalesce(x ->> 'monto_pendiente_con_igv', '-') || ':' || coalesce(x ->> 'papel', 'sin papel') || ':' || (x ->> 'nota') || ':'
             || (x ->> 'anotado_por') || ':' || jsonb_array_length(x -> 'resoluciones') || ':' || ((x ->> 'despacho_id') = :'d1')
        from jsonb_array_elements(:'f'::jsonb -> 'abiertas') x),
     (select (x ->> 'proveedor') || ':' || (x ->> 'deudas') || ':' || (x ->> 'unidades') || ':' || (x ->> 'monto') || ':' || (x ->> 'monto_con_igv')
             || ':' || ${CLAVES("x -> 'detalle' -> 0")} || '=' || (x -> 'detalle' -> 0 ->> 'categoria') || '·' || (x -> 'detalle' -> 0 ->> 'marca')
             || '·' || (x -> 'detalle' -> 0 ->> 'unidades') || '·' || (x -> 'detalle' -> 0 ->> 'monto')
        from jsonb_array_elements(:'res'::jsonb) x where x ->> 'proveedor_id' = :'prov'),
     (select count(*) from jsonb_array_elements(:'res'::jsonb) x where x ->> 'proveedor_id' = :'prov2') || ' de prov2',
     :'perdio', :'otra');`,
  [
    "OK",
    "abiertas,cerradas,deudas,monto,monto_con_igv,proveedor,unidades",
    "1:3:60.00:60.00:1:0",
    "anotado_por,cantidad,categoria,con_igv,costo_unitario,descripcion,despacho_id,diferencia_id,envio,estado,fecha,marca,monto," +
      "monto_pendiente,monto_pendiente_con_igv,nota,orden,papel,pendiente,proveedor,resoluciones,resuelto,saldada_en,sede",
    "ENV:Tienda Trujillo:OC1:Polos Nos Debe:Marca Nos Debe Prueba:Polo básico:3:0:3:por_reponer:20.00:60.00:60.00:false:-:sin papel:" +
      "Faltó una bolsa:Micaela Vendedora:0:true",
    "Proveedor Nos Debe Prueba:1:3:60.00:60.00:categoria,categoria_id,marca,marca_id,monto,unidades=Polos Nos Debe·Marca Nos Debe Prueba·3·60.00",
    "0 de prov2",
    NO_ES_DEUDA,
    NO_ES_DEUDA,
  ].join(" / "),
);
caso(
  "N2 con factura con IGV, el monto sin IGV y al lado lo que de verdad se pagó (con su 18 %); con boleta, sin IGV",
  `${PAPEL("fac", "factura", "F001", "901", [["l1", 10, 20]])}
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${PAPEL("bol", "boleta", "B001", "902", [["l2", 6, 30]])}
   ${ENVIA("d2", [["l2", 6]])}${ITEM("d2", "l2")}
   ${como(MICAELA)}${EN_TIENDA}
   ${ABRE("d2")}
   select pg_temp.e(${RECIBE("d2", A(LIN("di_l2", [V("vc_s", 4)], { falt: "no_vino" })))}) as r2 \\gset
   select pg_temp.debe(:'prov') as f \\gset
   select pg_temp.resumen(0) as res \\gset
   reset role;
   select concat_ws(' / ', :'rec_x1', :'r2',
     (select string_agg((x -> 'categoria' ->> 'nombre') || ':' || (x ->> 'monto_pendiente') || ':' || (x ->> 'con_igv') || ':'
                        || coalesce(x ->> 'monto_pendiente_con_igv', '-') || ':' || (x -> 'papel' ->> 'tipo') || ' ' || (x -> 'papel' ->> 'serie')
                        || '-' || (x -> 'papel' ->> 'numero'), ', ' order by x -> 'categoria' ->> 'nombre')
        from jsonb_array_elements(:'f'::jsonb -> 'abiertas') x),
     (:'f'::jsonb ->> 'monto') || ':' || (:'f'::jsonb ->> 'monto_con_igv'),
     (select (x ->> 'monto') || ':' || (x ->> 'monto_con_igv') || ':' || jsonb_array_length(x -> 'detalle')
        from jsonb_array_elements(:'res'::jsonb) x where x ->> 'proveedor_id' = :'prov'));`,
  // 3 polos a S/ 20 = 60.00 (factura: 70.80 con IGV) + 2 chompas a S/ 30 = 60.00 (boleta: sin IGV).
  "OK / OK / Chompas Nos Debe:60.00:false:-:boleta B001-902, Polos Nos Debe:60.00:true:70.80:factura F001-901 / 120.00:130.80 / 120.00:130.80:2",
);

// M. A MANO -----------------------------------------------------------------------------------------------------------------
caso(
  "M1 «Llegó la reposición» a mano: pide cantidad y nota, no pasa de lo debido, el mismo token no duplica, salda y pasa a cerradas",
  `${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select gen_random_uuid() as tok \\gset
   select pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 2, '   ', :'tok')) as sin_nota \\gset
   select pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 0, 'La trajo el proveedor', null)) as cero \\gset
   select pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 4, 'La trajo el proveedor', null)) as de_mas \\gset
   select pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 2, repeat('x', 301), null)) as larga \\gset
   select pg_temp.resuelve(:'x1', ' Repuesta ', 2, '  La trajo el proveedor el lunes  ', :'tok') as m1 \\gset
   select pg_temp.resuelve(:'x1', 'repuesta', 2, 'La trajo el proveedor el lunes', :'tok') as m1b \\gset
   select pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 1, 'La trajo el proveedor el lunes', :'tok')) as otro \\gset
   select pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 2, 'El resto', null)) as de_mas2 \\gset
   select pg_temp.resuelve(:'x1', 'repuesta', 1, 'El resto llegó con la agencia', null) as m2 \\gset
   select pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 1, 'Otra vez', null)) as saldada \\gset
   select pg_temp.debe(:'prov') as f \\gset
   select pg_temp.resumen(0) as res \\gset
   reset role;
   select concat_ws(' / ', :'sin_nota', :'cero', :'de_mas', :'larga',
     ${CLAVES(":'m1'::jsonb")}, (:'m1'::jsonb ->> 'resolucion_id') = (:'m1b'::jsonb ->> 'resolucion_id'),
     (:'m1'::jsonb -> 'deuda' ->> 'resuelto') || ':' || (:'m1'::jsonb -> 'deuda' ->> 'pendiente') || ':' || (:'m1'::jsonb -> 'deuda' ->> 'estado'),
     :'otro', :'de_mas2',
     (:'m2'::jsonb -> 'deuda' ->> 'pendiente') || ':' || (:'m2'::jsonb -> 'deuda' ->> 'estado') || ':' || ((:'m2'::jsonb -> 'deuda' ->> 'saldada_en') is not null),
     :'saldada',
     (select string_agg(r.forma || ':' || r.cantidad || ':' || r.nota || ':' || (r.creado_por = :'micaela_p') || ':' || coalesce(r.despacho_id::text, 'a mano')
                        || ':' || (r.token_cliente is not null), ',' order by r.cantidad desc)
        from retail.proveedor_deuda_resoluciones r where r.diferencia_id = :'x1'),
     jsonb_array_length(:'f'::jsonb -> 'abiertas') || ':' || jsonb_array_length(:'f'::jsonb -> 'cerradas') || ':' || (:'f'::jsonb ->> 'unidades'),
     (select ${CLAVES("x -> 'resoluciones' -> 0")} || '=' || string_agg((r ->> 'forma') || ':' || (r ->> 'cantidad') || ':' || coalesce(r ->> 'envio', 'a mano') || ':' || (r ->> 'creado_por'), ',' order by (r ->> 'cantidad')::int desc)
        from jsonb_array_elements(:'f'::jsonb -> 'cerradas') x cross join lateral jsonb_array_elements(x -> 'resoluciones') r group by x),
     (select count(*) from jsonb_array_elements(:'res'::jsonb) x where x ->> 'proveedor_id' = :'prov') || ' en el resumen',
     (select string_agg(${limpio("a.descripcion")} || ':' || a.modulo || ':' || (a.persona_id = :'micaela_p') || ':' || (a.ubicacion_id = :'tru')
                        || ':' || (a.detalle ? 'monto'), ',' order by a.id)
        from retail.actividad a where a.accion = 'deuda_repuesta' and a.detalle ->> 'diferencia_id' = :'x1'));`,
  [
    "P0001|nos_debe_nota|Escribe una nota: cómo llegó la reposición",
    "P0001|nos_debe_cantidad|Escribe cuántas llegaron: desde 1",
    "P0001|nos_debe_pasa_de_lo_debido|De esta deuda quedan 3 por reponer: no puedes marcar 4",
    "P0001|nos_debe_nota|La nota es muy larga: hasta 300 letras",
    "deuda,resolucion_id",
    "t",
    "2:1:por_reponer",
    "P0001|nos_debe_otros_datos|Esa reposición ya se guardó con otros datos: recarga la pantalla",
    "P0001|nos_debe_pasa_de_lo_debido|De esta deuda queda 1 por reponer: no puedes marcar 2",
    "0:saldada:true",
    "P0001|nos_debe_saldada|Esta deuda ya está saldada: no queda nada por reponer",
    "repuesta:2:La trajo el proveedor el lunes:true:a mano:true,repuesta:1:El resto llegó con la agencia:true:a mano:false",
    "0:1:0",
    "cantidad,creado_en,creado_por,despacho_id,envio,forma,id,nota=repuesta:2:a mano:Micaela Vendedora,repuesta:1:a mano:Micaela Vendedora",
    "0 en el resumen",
    "marcó que Proveedor Nos Debe Prueba repuso 2 de Polos Nos Debe · Marca Nos Debe Prueba (faltaron en la ENV):proveedores:true:true:false," +
      "marcó que Proveedor Nos Debe Prueba repuso 1 de Polos Nos Debe · Marca Nos Debe Prueba (faltaron en la ENV):proveedores:true:true:false",
  ].join(" / "),
);

caso(
  "M2 una deuda saldada se ve en «cerradas» 90 días (por su última resolución) y después ya no; una abierta se ve siempre",
  `${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 8)}
   ${DEUDA("x2", "l3", 4, 3)}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 2, 'Llegó con la agencia', null)) as m \\gset
   reset role;
   -- Las dos deudas y la reposición, de hace mucho: la abierta sigue; la saldada, a los 89 días sí y a los 91 ya no.
   set local session_replication_role = replica;
   update retail.despacho_diferencias set creado_en = now() - interval '200 days' where id in (:'x1', :'x2');
   update retail.proveedor_deuda_resoluciones set creado_en = now() - interval '89 days' where diferencia_id = :'x1';
   set local session_replication_role = origin;
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.debe(:'prov') as f89 \\gset
   reset role;
   set local session_replication_role = replica;
   update retail.proveedor_deuda_resoluciones set creado_en = now() - interval '91 days' where diferencia_id = :'x1';
   set local session_replication_role = origin;
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.debe(:'prov') as f91 \\gset
   reset role;
   select concat_ws(' / ', :'m',
     jsonb_array_length(:'f89'::jsonb -> 'abiertas') || ':' || jsonb_array_length(:'f89'::jsonb -> 'cerradas'),
     jsonb_array_length(:'f91'::jsonb -> 'abiertas') || ':' || jsonb_array_length(:'f91'::jsonb -> 'cerradas'),
     (:'f91'::jsonb -> 'abiertas' -> 0 ->> 'descripcion') || ':' || (:'f91'::jsonb ->> 'unidades'));`,
  "OK / 1:1 / 1:0 / Polo cuello V:1",
);

// B. FASE 5B ----------------------------------------------------------------------------------------------------------------
caso(
  "B1 pasar a saldo a favor o marcar que depositó: «Todavía no» (fase 5b), sin escribir nada; otra forma o una deuda que no existe, no",
  `${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select concat_ws(' / ',
     pg_temp.e(pg_temp.resuelve(:'x1', 'saldo_a_favor', 3, 'Que lo descuente', null)),
     pg_temp.e(pg_temp.resuelve(:'x1', 'DEPOSITO', 3, 'Depositó', null)),
     pg_temp.e(pg_temp.resuelve(:'x1', 'regalo', 3, 'x', null)),
     pg_temp.e(pg_temp.resuelve(:'x1', null, 3, 'x', null)),
     pg_temp.e(pg_temp.resuelve(gen_random_uuid(), 'repuesta', 1, 'Llegó', null)),
     coalesce(pg_temp.debe(gen_random_uuid())::text, 'nulo')) as r \\gset
   reset role;
   select :'r' || ' / ' || ${ESTADO("x1")};`,
  [TODAVIA_NO, TODAVIA_NO,
    "P0001|nos_debe_forma|No se entiende cómo se resolvió la deuda: elige «Llegó la reposición»",
    "P0001|nos_debe_forma|No se entiende cómo se resolvió la deuda: elige «Llegó la reposición»",
    "P0001|nos_debe_no_existe|Esa deuda no existe: recarga la pantalla",
    "nulo",
    "0/3"].join(" / "),
);

// P. PERMISOS ---------------------------------------------------------------------------------------------------------------
caso(
  "P1 sin módulos (solo Existencias): 42501 al leer, al ver el resumen y al resolver; tampoco una deuda que no existe se adivina",
  `${rolDeMicaela("recibir")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${MICAELA_CON("existencias")}
   select concat_ws(' / ', pg_temp.e(pg_temp.debe(:'prov')), pg_temp.e(pg_temp.resumen(0)),
     pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 1, 'Llegó', null)),
     pg_temp.e(pg_temp.resuelve(gen_random_uuid(), 'repuesta', 1, 'Llegó', null))) as r \\gset
   reset role;
   select :'r' || ' / ' || ${ESTADO("x1")};`,
  [SIN_MODULO_LEER, SIN_MODULO_RESUMEN, SIN_MODULO_RESOLVER, SIN_MODULO_RESOLVER, "0/3"].join(" / "),
);
caso(
  "P2 la plata de Compras (Facturas) y Órdenes de compra leen pero no resuelven; Recibir lee y resuelve; Proveedores resuelve",
  `${rolDeMicaela("recibir")}
   ${DEUDA("x1", "l1", 10, 6)}
   ${MICAELA_CON("facturas_compra")}
   select concat_ws(':', pg_temp.e(pg_temp.debe(:'prov')), pg_temp.e(pg_temp.resumen(0)),
     pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 1, 'Llegó', null))) as facturas \\gset
   ${MICAELA_CON("ordenes_compra")}
   select concat_ws(':', pg_temp.e(pg_temp.debe(:'prov')), pg_temp.e(pg_temp.resumen(0)),
     pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 1, 'Llegó', null))) as ordenes \\gset
   ${MICAELA_CON("recibir")}
   select concat_ws(':', pg_temp.e(pg_temp.debe(:'prov')), pg_temp.e(pg_temp.resumen(0)),
     pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 1, 'Llegó en una caja aparte', null))) as recibir \\gset
   ${MICAELA_CON("proveedores")}
   select concat_ws(':', pg_temp.e(pg_temp.debe(:'prov')), pg_temp.e(pg_temp.resumen(0)),
     pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 1, 'La trajo el chofer', null))) as proveedores \\gset
   reset role;
   select concat_ws(' / ', :'facturas', :'ordenes', :'recibir', :'proveedores', ${ESTADO("x1")},
     (select string_agg(a.modulo, ',' order by a.id) from retail.actividad a where a.accion = 'deuda_repuesta' and a.detalle ->> 'diferencia_id' = :'x1'));`,
  [
    `OK:OK:${SIN_MODULO_RESOLVER}`,
    `OK:OK:${SIN_MODULO_RESOLVER}`,
    "OK:OK:OK",
    "OK:OK:OK",
    "2/4",
    "recibir,proveedores",
  ].join(" / "),
);
caso(
  "P3 sin elegir responsable no se anota; un líder Admin (Sandra) firma él solo",
  `${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${SIN_ENCABEZADOS}
   select pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 1, 'Llegó', null)) as sin_resp \\gset
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   select pg_temp.e(pg_temp.resuelve(:'x1', 'repuesta', 1, 'Llegó con el chofer', null)) as sandra \\gset
   reset role;
   select concat_ws(' / ', :'sin_resp', :'sandra', ${ESTADO("x1")},
     (select string_agg((r.creado_por = :'sandra_p')::text, ',') from retail.proveedor_deuda_resoluciones r where r.diferencia_id = :'x1'));`,
  "42501|responsable_requerido|Elige quién hace esta operación / OK / 1/3 / true",
);

// R. EN LA RECEPCIÓN --------------------------------------------------------------------------------------------------------
caso(
  "R1 la reposición en la recepción salda la deuda más antigua primero, no pasa de lo debido, y el detalle dice cuándo ofrecerla",
  `${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 4, 2)}
   ${DEUDA("x2", "l1", 3, 1)}
   -- La deuda del segundo envío se anotó ANTES (el envío de menor número no manda: manda cuándo se anotó el faltante).
   set local session_replication_role = replica;
   update retail.despacho_diferencias set creado_en = creado_en - interval '1 day' where id = :'x1';
   update retail.despacho_diferencias set creado_en = creado_en - interval '2 days' where id = :'x2';
   set local session_replication_role = origin;
   ${ENVIA("d3", [["l1", 3], ["l2", 6]])}${ITEM("d3", "l1")}${ITEM("d3", "l2")}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.detalle(:'d3') as antes \\gset
   ${ABRE("d3")}
   select pg_temp.e(${RECIBE("d3", A(LIN("di_l1", [V("vp_s", 8)], { sobr: "reposicion_faltante" }), LIN("di_l2", [V("vc_s", 6)])))}) as de_mas \\gset
   select pg_temp.e(${RECIBE("d3", A(LIN("di_l1", [V("vp_s", 6)], { sobr: "reposicion_faltante" }), LIN("di_l2", [V("vc_s", 7)], { sobr: "reposicion_faltante" })))}) as otra_cat \\gset
   reset role;
   select ${STOCK("vp_s")} as stock0 \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select ${RECIBE("d3", A(LIN("di_l1", [V("vp_s", 4), V("vp_m", 2)], { sobr: "reposicion_faltante", nota: "Vino la reposición" }), LIN("di_l2", [V("vc_s", 6)])))} as r \\gset
   select pg_temp.detalle(:'d3') as despues \\gset
   select pg_temp.debe(:'prov') as f \\gset
   reset role;
   select id as sob from retail.despacho_diferencias where despacho_id = :'d3' and tipo = 'sobrante' \\gset
   select concat_ws(' / ', :'rec_x1', :'rec_x2',
     (select string_agg((l -> 'categoria' ->> 'nombre') || '=' || (l ->> 'deuda_pendiente'), ',' order by (l ->> 'posicion')::int)
        from jsonb_array_elements(:'antes'::jsonb -> 'lineas') l),
     (select string_agg(${CLAVES("x")} || '=' || (x ->> 'pendiente') || '@' || (x ->> 'costo_unitario') || ':' || ((x ->> 'proveedor_id') = :'prov')
                        || ':' || ((x ->> 'categoria_id') = :'cat'), ',')
        from jsonb_array_elements(:'antes'::jsonb -> 'deudas_del_proveedor') x),
     :'de_mas', :'otra_cat',
     pg_temp.e(:'r'::jsonb) || ':' || (:'r'::jsonb ->> 'sobran') || ':' || (:'r'::jsonb ->> 'unidades'),
     ${STOCK("vp_s")} - :stock0 || '+' || ${STOCK("vp_m")},
     (select x.tipo || ':' || x.causa || ':' || x.cantidad || ':' || x.costo_unitario || ':' || x.nota from retail.despacho_diferencias x where x.id = :'sob'),
     'x2 ' || ${ESTADO("x2")} || ', x1 ' || ${ESTADO("x1")},
     (select string_agg(case r.diferencia_id when :'x2' then 'x2' else 'x1' end || ':' || r.cantidad || ':' || r.forma || ':' || (r.despacho_id = :'d3')
                        || ':' || (r.sobrante_id = :'sob') || ':' || (r.creado_por = :'micaela_p') || ':' || coalesce(r.nota, 'sin nota'), ',' order by r.cantidad desc)
        from retail.proveedor_deuda_resoluciones r where r.despacho_id = :'d3'),
     (select string_agg((l -> 'categoria' ->> 'nombre') || '=' || (l ->> 'deuda_pendiente'), ',' order by (l ->> 'posicion')::int)
        from jsonb_array_elements(:'despues'::jsonb -> 'lineas') l),
     (select string_agg((x ->> 'tipo') || ':' || (x ->> 'causa') || ':' || (x ->> 'cantidad'), ',') from jsonb_array_elements(:'despues'::jsonb -> 'diferencias') x),
     (select string_agg(${limpio("x ->> 'envio'")} || ':' || (x ->> 'pendiente') || ':' || coalesce((select string_agg(${limpio("r ->> 'envio'")} || ':' || (r ->> 'cantidad'), ';')
                                                                                              from jsonb_array_elements(x -> 'resoluciones') r), '-'),
                        ',' order by x ->> 'fecha')
        from jsonb_array_elements(:'f'::jsonb -> 'abiertas') x),
     jsonb_array_length(:'f'::jsonb -> 'cerradas'));`,
  [
    "OK", "OK",
    "Polos Nos Debe=4,Chompas Nos Debe=0",
    "categoria_id,costo_unitario,marca_id,pendiente,proveedor_id=4@20.00:true:true",
    "P0001|recepcion_reposicion_de_mas|Marcaste 5 como reposición de Polos Nos Debe · Marca Nos Debe Prueba, pero Proveedor Nos Debe Prueba " +
      "solo debe 4: lo que pase de eso es un sobrante con otra causa",
    "P0001|recepcion_reposicion_sin_deuda|Proveedor Nos Debe Prueba no debe nada de Chompas Nos Debe · Marca Nos Debe Prueba: elige otra causa para lo de más",
    "OK:3:12",
    "4+2",
    "sobrante:reposicion_faltante:3:20.00:Vino la reposición",
    "x2 2/2, x1 1/2",
    "x2:2:repuesta:true:true:true:sin nota,x1:1:repuesta:true:true:true:sin nota",
    "Polos Nos Debe=1,Chompas Nos Debe=0",
    "sobrante:reposicion_faltante:3",
    "ENV:1:ENV:1",
    "1",
  ].join(" / "),
);
caso(
  "R2 no salda una deuda de la MISMA recepción: lo que falta en una línea y sobra en otra es un cruce, no una reposición",
  `${rolDeMicaela("recibir", "proveedores")}
   ${ENVIA("d1", [["l1", 4], ["l3", 4]])}${ITEM("d1", "l1")}${ITEM("d1", "l3")}
   ${como(MICAELA)}${EN_TIENDA}
   ${ABRE("d1")}
   select pg_temp.e(${RECIBE("d1", A(LIN("di_l1", [V("vp_s", 2)], { falt: "no_vino" }), LIN("di_l3", [V("vp_s", 6)], { sobr: "reposicion_faltante" })))}) as r \\gset
   reset role;
   select :'r' || ' / ' || (select d.estado from retail.despachos d where d.id = :'d1');`,
  "P0001|recepcion_reposicion_sin_deuda|Proveedor Nos Debe Prueba no debe nada de Polos Nos Debe · Marca Nos Debe Prueba: elige otra causa para lo de más / abierto",
);
caso(
  "R3 fuera de la guía: la reposición del proveedor que debe salda su deuda; la del que no debe, no; dos líneas juntas no pasan de lo debido",
  `${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 5, 3)}
   ${ENVIA("d2", [["l2", 6], ["l4", 5]])}${ITEM("d2", "l2")}${ITEM("d2", "l4")}
   ${como(MICAELA)}${EN_TIENDA}
   ${ABRE("d2")}
   select pg_temp.detalle(:'d2') as det \\gset
   select pg_temp.e(${RECIBE("d2", A(LIN("di_l2", [V("vc_s", 6)]), LIN("di_l4", [V("vp_s", 5)])), { extras: A(EXTRA({ prov: ":'prov2'", vars: [V("vp_m", 1)] })) })}) as sin_deuda \\gset
   select pg_temp.e(${RECIBE("d2", A(LIN("di_l2", [V("vc_s", 6)]), LIN("di_l4", [V("vp_s", 5)])), { extras: A(EXTRA({ prov: ":'prov'", vars: [V("vp_m", 2)] }), EXTRA({ prov: ":'prov'", vars: [V("vp_s", 1)] })) })}) as juntas \\gset
   select ${RECIBE("d2", A(LIN("di_l2", [V("vc_s", 6)]), LIN("di_l4", [V("vp_s", 5)])), { extras: A(EXTRA({ prov: ":'prov'", vars: [V("vp_m", 1)] }), EXTRA({ prov: ":'prov'", vars: [V("vp_s", 1)] })) })} as r \\gset
   reset role;
   select concat_ws(' / ', :'rec_x1',
     (select string_agg(case when (x ->> 'proveedor_id') = :'prov' then 'prov' else 'prov2' end || ':' || (x ->> 'pendiente'), ',')
        from jsonb_array_elements(:'det'::jsonb -> 'deudas_del_proveedor') x),
     (select string_agg((l -> 'proveedor' ->> 'nombre') || '=' || (l ->> 'deuda_pendiente'), ',' order by (l ->> 'posicion')::int)
        from jsonb_array_elements(:'det'::jsonb -> 'lineas') l),
     :'sin_deuda', :'juntas', pg_temp.e(:'r'::jsonb) || ':' || (:'r'::jsonb ->> 'sobran'),
     ${ESTADO("x1")},
     (select string_agg(r.cantidad || '@' || x.extra_posicion, ',' order by x.extra_posicion)
        from retail.proveedor_deuda_resoluciones r join retail.despacho_diferencias x on x.id = r.sobrante_id where r.diferencia_id = :'x1'));`,
  [
    "OK",
    "prov:2",
    "Proveedor Nos Debe Dos=0,Proveedor Nos Debe Prueba=0",
    "P0001|recepcion_reposicion_sin_deuda|Proveedor Nos Debe Dos no debe nada de Polos Nos Debe · Marca Nos Debe Prueba: elige otra causa para lo de más",
    "P0001|recepcion_reposicion_de_mas|Marcaste 3 como reposición de Polos Nos Debe · Marca Nos Debe Prueba, pero Proveedor Nos Debe Prueba " +
      "solo debe 2: lo que pase de eso es un sobrante con otra causa",
    "OK:2",
    "2/2",
    "1@1,1@2",
  ].join(" / "),
);

caso(
  "L1 el detalle del envío conserva todo lo que devolvía (fases 3 y 4) y suma deuda_pendiente por línea y deudas_del_proveedor",
  `${rolDeMicaela("recibir", "ordenes_compra")}
   ${ENVIA("d1", [["l1", 2]])}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.detalle(:'d1') as det \\gset
   reset role;
   select concat_ws(' / ', ${CLAVES(":'det'::jsonb")}, ${CLAVES(":'det'::jsonb -> 'lineas' -> 0")},
     (:'det'::jsonb -> 'lineas' -> 0 ->> 'deuda_pendiente') || ':' || (:'det'::jsonb ->> 'deudas_del_proveedor'));`,
  [
    "abierto_en,abierto_por,anulado_en,anulado_por,cerrado_en,cerrado_por,creado_por_mi,despachado_en,despachado_por,deudas_del_proveedor," +
      "diferencias,estado,id,lineas,motivo_anulacion,nota,nota_recepcion,numero,numero_guia,proveedores,recepcion,recibidos,sede,unidades,version",
    "cantidad,categoria,categoria_id,compra_item_id,descripcion,deuda_pendiente,id,marca,marca_id,orden,orden_compra_id,orden_compra_item_id," +
      "posicion,precio_unitario,precio_venta_sugerido,proveedor",
    "0:[]",
  ].join(" / "),
);

// T. LOS CANDADOS DE LA TABLA -----------------------------------------------------------------------------------------------
caso(
  "T1 la tabla sola (sin la función): no pasa de lo debido, solo deudas «no vino», no se cambia ni se borra, la forma va con su recepción",
  `${rolDeMicaela("recibir")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${ENVIA("d2", [["l2", 6]])}${ITEM("d2", "l2")}
   ${como(MICAELA)}${EN_TIENDA}
   ${ABRE("d2")}
   select pg_temp.e(${RECIBE("d2", A(LIN("di_l2", [V("vc_s", 5)], { falt: "se_perdio" })))}) as r2 \\gset
   reset role;
   select id as x_perdio from retail.despacho_diferencias where despacho_id = :'d2' \\gset
   insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, nota, creado_por)
     values (:'x1', 'repuesta', 2, 'Prueba', :'micaela_p') returning id as res1 \\gset
   select concat_ws(' / ', :'rec_x1', :'r2',
     pg_temp.intento(format('insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, nota, creado_por) values (%L, %L, 2, %L, %L)',
       :'x1', 'repuesta', 'Prueba', :'micaela_p')),
     pg_temp.intento(format('insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, nota, creado_por) values (%L, %L, 1, %L, %L)',
       :'x_perdio', 'repuesta', 'Prueba', :'micaela_p')),
     pg_temp.intento(format('insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, nota, creado_por) values (%L, %L, 1, %L, %L)',
       gen_random_uuid(), 'repuesta', 'Prueba', :'micaela_p')),
     pg_temp.intento(format('update retail.proveedor_deuda_resoluciones set cantidad = 1 where id = %L', :'res1')),
     pg_temp.intento(format('delete from retail.proveedor_deuda_resoluciones where id = %L', :'res1')),
     pg_temp.intento(format('insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, despacho_id, creado_por) values (%L, %L, 1, %L, %L)',
       :'x1', 'repuesta', :'d2', :'micaela_p')),
     pg_temp.intento(format('insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, creado_por) values (%L, %L, 1, %L)',
       :'x1', 'canje', :'micaela_p')),
     pg_temp.intento(format('insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, nota, creado_por) values (%L, %L, 1, %L, %L)',
       :'x1', 'repuesta', '  ', :'micaela_p')),
     ${ESTADO("x1")});`,
  [
    "OK",
    "OK",
    "23514|nos_debe_pasa_de_lo_debido|De esta deuda queda 1 por reponer: no se puede marcar 2",
    "23514|nos_debe_no_es_deuda|Eso no es una deuda del proveedor: solo lo que «no vino» se repone",
    "23503|nos_debe_no_existe|Esa deuda no existe: recarga la pantalla",
    "42501|nos_debe_inmutable|Lo resuelto de una deuda no se cambia ni se borra: queda como se marcó",
    "42501|nos_debe_inmutable|Lo resuelto de una deuda no se cambia ni se borra: queda como se marcó",
    "23514||new row for relation \"proveedor_deuda_resoluciones\" violates check constraint \"proveedor_deuda_resoluciones_recepcion\"",
    "23514||new row for relation \"proveedor_deuda_resoluciones\" violates check constraint \"proveedor_deuda_resoluciones_forma\"",
    "23514||new row for relation \"proveedor_deuda_resoluciones\" violates check constraint \"proveedor_deuda_resoluciones_nota\"",
    "2/3",
  ].join(" / "),
);
caso(
  "T2 la reposición que llega en una recepción: de otra categoría o de otra recepción no salda; solo «repuesta»; se reparte entera al confirmar",
  `${rolDeMicaela("recibir")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${DEUDA("x2", "l2", 4, 2, "vc_s")}
   ${ENVIA("d3", [["l1", 2], ["l2", 2]])}${ITEM("d3", "l1", "di_d3_l1")}${ITEM("d3", "l2", "di_d3_l2")}
   ${como(MICAELA)}${EN_TIENDA}
   ${ABRE("d3")}
   reset role;
   -- Con el envío abierto, a mano (sin recibir_despacho): una chompa que llegó como reposición.
   insert into retail.despacho_diferencias (despacho_id, despacho_item_id, proveedor_id, categoria_id, marca_id, tipo, causa, cantidad, costo_unitario, creado_por)
     values (:'d3', :'di_d3_l2', :'prov', :'cat2', :'marca', 'sobrante', 'reposicion_faltante', 1, 30, :'micaela_p') returning id as sob \\gset
   select concat_ws(' / ', :'rec_x1', :'rec_x2',
     -- La chompa no salda la deuda de polos.
     pg_temp.intento(format('insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, despacho_id, sobrante_id, creado_por) values (%L, %L, 1, %L, %L, %L)',
       :'x1', 'repuesta', :'d3', :'sob', :'micaela_p')),
     -- Ni dice haber llegado en otra recepción que la suya.
     pg_temp.intento(format('insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, despacho_id, sobrante_id, creado_por) values (%L, %L, 1, %L, %L, %L)',
       :'x2', 'repuesta', :'d_x1', :'sob', :'micaela_p')),
     -- Lo que llegó en una recepción es «repuesta», nunca un depósito.
     pg_temp.intento(format('insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, despacho_id, sobrante_id, creado_por) values (%L, %L, 1, %L, %L, %L)',
       :'x2', 'deposito', :'d3', :'sob', :'micaela_p')),
     -- No reparte más de lo que trajo.
     pg_temp.intento(format('insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, despacho_id, sobrante_id, creado_por) values (%L, %L, 2, %L, %L, %L)',
       :'x2', 'repuesta', :'d3', :'sob', :'micaela_p')),
     -- «reposicion_faltante» es un sobrante, nunca un faltante.
     pg_temp.intento(format('insert into retail.despacho_diferencias (despacho_id, despacho_item_id, proveedor_id, categoria_id, marca_id, tipo, causa, cantidad, costo_unitario, creado_por) values (%L, %L, %L, %L, %L, %L, %L, 1, 20, %L)',
       :'d3', :'di_d3_l1', :'prov', :'cat', :'marca', 'faltante', 'reposicion_faltante', :'micaela_p'))) as r \\gset
   -- La chompa salda la deuda de chompas: así queda repartida y el caso cierra limpio.
   insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, despacho_id, sobrante_id, creado_por)
     values (:'x2', 'repuesta', 1, :'d3', :'sob', :'micaela_p');
   -- Un polo que llega como reposición y nadie reparte: al confirmar, el candado diferido lo frena (y se deshace).
   select :'r' || ' / ' || pg_temp.diferido(format('insert into retail.despacho_diferencias (despacho_id, despacho_item_id, proveedor_id, categoria_id, marca_id, tipo, causa, cantidad, costo_unitario, creado_por) values (%L, %L, %L, %L, %L, %L, %L, 1, 20, %L)',
       :'d3', :'di_d3_l1', :'prov', :'cat', :'marca', 'sobrante', 'reposicion_faltante', :'micaela_p'))
     || ' / ' || ${ESTADO("x2")} || ' / ' || (select count(*) from retail.despacho_diferencias where despacho_id = :'d3');`,
  [
    "OK", "OK",
    "23514|nos_debe_reposicion_ajena|Esa reposición no corresponde a esta deuda: es de otra recepción, otro proveedor, otra categoría u otra marca",
    "23514|nos_debe_reposicion_ajena|Esa reposición no corresponde a esta deuda: es de otra recepción, otro proveedor, otra categoría u otra marca",
    "23514||new row for relation \"proveedor_deuda_resoluciones\" violates check constraint \"proveedor_deuda_resoluciones_recepcion\"",
    "23514|nos_debe_reposicion_descuadrada|La reposición trajo 1 y ya se repartieron 0: no alcanza para 2",
    "23514||new row for relation \"despacho_diferencias\" violates check constraint \"despacho_diferencias_causa\"",
    "23514|nos_debe_reposicion_descuadrada|Lo que llegó como reposición (1) tiene que saldar exactamente lo que el proveedor debía (salda 0)",
    "1/2",
    "1",
  ].join(" / "),
);

// S. LA FORMA ---------------------------------------------------------------------------------------------------------------
const PUBLICAS = "('fn_proveedor_nos_debe', 'fn_nos_debe_resumen', 'resolver_deuda_proveedor')";
const INTERNAS = "('fn_nos_debe_deuda', 'fn_nos_debe_pendiente', 'fn_nos_debe_del_envio', 'fn_nos_debe_tasa_igv', " +
  "'fn_proveedor_deuda_resoluciones_candado', 'fn_reposicion_repartida')";
const DE_RETAIL = (lista) => `from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ${lista}`;
// El último valor: ninguna acción de la deuda DEL PROVEEDOR firma sin el combo «Responsable». La deuda del fondo por rendir
// (`fondo_deuda_*`, 1419, ADR-0362 fase 6 · actividad 7) es del personal y firma sin combo por la decisión 39: no entra en la cuenta.
caso(
  "S1 una función por nombre, security definer, authenticated sí y anon no; las internas cerradas; RLS sin políticas; nadie lee directo",
  `select concat_ws(',',
     (select count(*) ${DE_RETAIL(PUBLICAS)}),
     (select bool_and(p.prosecdef) ${DE_RETAIL(PUBLICAS)}),
     (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) ${DE_RETAIL(PUBLICAS)}),
     (select bool_or(has_function_privilege('anon', p.oid, 'execute')) ${DE_RETAIL(PUBLICAS)}),
     (select count(*) ${DE_RETAIL(INTERNAS)}),
     (select bool_or(has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) ${DE_RETAIL(INTERNAS)}),
     (select c.relrowsecurity from pg_class c where c.oid = 'retail.proveedor_deuda_resoluciones'::regclass),
     (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'proveedor_deuda_resoluciones'),
     has_table_privilege('authenticated', 'retail.proveedor_deuda_resoluciones', 'select'),
     has_table_privilege('authenticated', 'retail.proveedor_deuda_resoluciones', 'insert'),
     has_table_privilege('anon', 'retail.proveedor_deuda_resoluciones', 'select'),
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail'
        and p.proname in ('recibir_despacho', 'fn_envio_detalle')),
     (select count(*) from retail.acciones_sin_responsable where (clave like '%deuda%' and clave not like 'fondo%') or clave like 'nos_debe%'));`,
  "3,t,t,f,6,f,t,0,f,f,f,2,0",
);

// C. DOS SESIONES A LA VEZ --------------------------------------------------------------------------------------------------
// Un envío de prueba con una deuda de 3, COMMITEADO (sin la migración en el preludio: corre sobre la base ya migrada). Se borra entero al
// terminar —y al empezar, si una corrida anterior se cortó—, también sus filas «solo se agregan» (session_replication_role = replica).
const MARCA_C = "ZZ Nos debe dos sesiones";
const LIMPIAR_C = `
begin;
set local session_replication_role = replica;
create temp table _prov on commit drop as select p.id from retail.proveedores p where p.nombre like '${MARCA_C}%';
create temp table _dif on commit drop as select x.id from retail.despacho_diferencias x where x.proveedor_id in (select id from _prov);
create temp table _env on commit drop as
  select distinct di.despacho_id as id
    from retail.despacho_items di
    join retail.orden_compra_items i on i.id = di.orden_compra_item_id
    join retail.ordenes_compra o on o.id = i.orden_compra_id
   where o.proveedor_id in (select id from _prov);
delete from retail.actividad a where a.tabla = 'proveedor_deuda_resoluciones'
  and a.registro_id in (select r.id::text from retail.proveedor_deuda_resoluciones r where r.diferencia_id in (select id from _dif));
delete from retail.proveedor_deuda_resoluciones r where r.diferencia_id in (select id from _dif);
delete from retail.despacho_diferencias x where x.id in (select id from _dif);
delete from retail.despacho_items di where di.despacho_id in (select id from _env);
delete from retail.despachos d where d.id in (select id from _env);
delete from retail.orden_compra_items i where i.orden_compra_id in (select o.id from retail.ordenes_compra o where o.proveedor_id in (select id from _prov));
delete from retail.ordenes_compra o where o.proveedor_id in (select id from _prov);
delete from retail.proveedores p where p.id in (select id from _prov);
commit;
select count(*) from retail.proveedores where nombre like '${MARCA_C}%';
`;
const CREAR_C = `
set client_min_messages = warning;
begin;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as sandra_p from public.personas p where p.auth_user_id = '${SANDRA}' \\gset
select id as cat from retail.categorias order by id limit 1 \\gset
select id as marca from retail.marcas order by id limit 1 \\gset
insert into retail.proveedores (nombre) values ('${MARCA_C} ' || substr(md5(random()::text), 1, 8)) returning id as prov \\gset
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'felipe_p') returning id as o \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o', 1, :'cat', :'marca', 3, 20) returning id as l \\gset
insert into retail.despachos (ubicacion_destino_id, despachado_por) values (:'tru', :'felipe_p') returning id as d \\gset
insert into retail.despacho_items (despacho_id, orden_compra_item_id, cantidad, categoria_id, marca_id, precio_unitario)
  values (:'d', :'l', 3, :'cat', :'marca', 20) returning id as di \\gset
update retail.despachos set estado = 'abierto', abierto_por = :'sandra_p', abierto_en = now() where id = :'d';
insert into retail.despacho_diferencias (despacho_id, despacho_item_id, proveedor_id, categoria_id, marca_id, tipo, causa, cantidad,
                                         costo_unitario, creado_por)
  values (:'d', :'di', :'prov', :'cat', :'marca', 'faltante', 'no_vino', 3, 20, :'sandra_p') returning id as x \\gset
update retail.despachos set estado = 'cerrado', cerrado_por = :'sandra_p', cerrado_en = now() where id = :'d';
commit;
select :'x';
`;
// Sandra (líder y Admin: firma ella sola) marca que llegaron 2 de las 3: «OK» o «sqlstate|hint|mensaje».
const SANDRA_MARCA_2 = (x) => `
set client_min_messages = warning;
begin;
${como(SANDRA)}${SIN_ENCABEZADOS}
${atrapa("resuelve", "p_dif uuid, p_forma text, p_cantidad integer, p_nota text, p_token uuid", "retail.resolver_deuda_proveedor(p_dif, p_forma, p_cantidad, p_nota, p_token)")}
select case when j ? 'error' then (j ->> 'error') || '|' || coalesce(j ->> 'hint', '') || '|' || (j ->> 'msg') else 'OK' end
  from (select pg_temp.resuelve('${x}', 'repuesta', 2, 'Llegó con la agencia', gen_random_uuid()) as j) q;
`;

async function dosSesiones() {
  const nombre = "C1 dos sesiones a la vez sobre la misma deuda de 3: la primera marca 2, la segunda espera, ve que queda 1 y no pasa de lo debido";
  if (!DOS_SESIONES) {
    console.log(`⤳ ${nombre}: se salta en la base local compartida (hace COMMIT); córrela con --contenedor <banco propio>`);
    return;
  }
  try {
    psql(LIMPIAR_C);
    const x = psql(CREAR_C).trim().split("\n").filter(Boolean).at(-1);
    // La primera marca 2 y se queda con la deuda bloqueada 1.5 s antes de confirmar.
    const p1 = psqlAsync(`${SANDRA_MARCA_2(x)}\nselect pg_sleep(1.5);\ncommit;\n`);
    await dormir(400);
    // La segunda pide 2 mientras tanto: espera el candado y, cuando la primera confirma, ve que queda 1.
    const p2 = psqlAsync(`${SANDRA_MARCA_2(x)}\nrollback;\n`);
    const [s1, s2] = await Promise.all([p1, p2]);
    const r1 = s1.stdout.trim().split("\n").filter(Boolean).at(-1);
    const r2 = s2.stdout.trim().split("\n").filter(Boolean).at(-1);
    const total = psql(`select coalesce(sum(r.cantidad), 0) from retail.proveedor_deuda_resoluciones r where r.diferencia_id = '${x}';`).trim();
    const esperado = "s1=OK · s2=P0001|nos_debe_pasa_de_lo_debido|De esta deuda queda 1 por reponer: no puedes marcar 2 · esperó · resuelto=2";
    const obtenido = `s1=${r1} · s2=${r2} · ${s2.ms > 900 ? "esperó" : `no esperó (${s2.ms} ms)`} · resuelto=${total}`;
    const ok = s1.code === 0 && s2.code === 0 && obtenido === esperado;
    anotar(nombre, ok, esperado, ok ? obtenido : `${obtenido}\n    s1: ${s1.stderr.trim()}\n    s2: ${s2.stderr.trim()}`);
  } catch (e) {
    anotar(nombre, false, "sin error", String(e.stderr ?? e.message).split("\n").slice(0, 4).join(" "));
  } finally {
    try {
      const quedan = psql(LIMPIAR_C).trim().split("\n").filter(Boolean).at(-1);
      if (quedan !== "0") console.log(`⚠ quedaron ${quedan} proveedores «${MARCA_C}» sin borrar`);
    } catch (e) {
      console.log(`⚠ no se pudo borrar el envío de prueba de C1: ${String(e.stderr ?? e.message).split("\n")[0]}`);
    }
  }
}

await dosSesiones();

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);

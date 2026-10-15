#!/usr/bin/env node
/**
 * Pruebas de «Nos debe», lo que el proveedor le debe a CAYLA (ADR-0362, fase 5a; Felipe 2026-10-12) — migración
 * `20261013015000_nos_debe.sql`. Contrato: docs/compras/ordenes-de-compra-2026-10/contrato-nos-debe.md.
 *
 * LO QUE VIGILA. Que un faltante «No vino» de una recepción sea una deuda del proveedor que se ve (la ficha, el resumen, el detalle del
 * envío) y se cierra con la prenda (decisión 14): a mano con una nota, o en la próxima recepción marcando lo de más como «Es la reposición
 * de lo que faltó», que salda las deudas de la más antigua a la más nueva. Que lo resuelto nunca pase de lo debido —ni con dos personas a
 * la vez—, que solo un «No vino» sea deuda y que lo resuelto no se cambie ni se borre. Y la fase 5b (actividad 1, migraciones
 * `20261015145000` y `20261015150000`, actividades 1 a 3): «Pasar a saldo a favor» cierra en el papel lo que no llegó, registra el
 * documento interno DI-… que baja la deuda del comprobante (con su IGV si es una factura), deja el resto a favor y no entra a Impuestos; y
 * «Llegó su nota de crédito» le adjunta la nota del proveedor, que desde su fecha baja el crédito fiscal.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga DOS veces dentro de cada caso, así se prueba que se puede
 * pegar dos veces y corre con la base al día). Micaela es de Tienda Trujillo y no es líder (un rol de prueba con los módulos que pide cada
 * caso, y marcó su entrada: firma ella en el combo «Responsable»); Felipe es líder y Admin, hace las órdenes, los papeles y los envíos;
 * Sandra es líder y Admin. El responsable obligatorio va encendido, como en producción.
 *   N  LA DEUDA: nace solo de un faltante «no vino» (no de «se perdió» ni de «llegó a otra sede»); la ficha y el resumen la leen con su
 *      monto sin IGV, y con el IGV al lado si su papel es una factura con IGV.
 *   M  A MANO: «Llegó la reposición» con nota; la cantidad, la nota, lo saldado y lo que pasa de lo debido; el mismo token; la actividad;
 *      la deuda saldada pasa a «cerradas».
 *   B  «Depositó» todavía no (llega en la actividad 5); pasar a saldo a favor lo que nadie facturó, no; otra forma, no.
 *   A  A SALDO A FAVOR (5b, actividad 1): con boleta, el documento interno DI-… baja la deuda del comprobante (cierre «no llegó» en el
 *      papel, sin IGV), queda en la ficha y en el Diario (421 contra 201) y no en Impuestos; con el comprobante ya saldado, lo que sobra
 *      queda a favor del proveedor; con factura (actividad 2), el documento lleva su IGV, que espera la nota del proveedor en la cuenta
 *      puente 4019 (no baja el crédito fiscal ni entra a Impuestos), y si ya estaba pagada queda entera a favor; lo que no se facturó no
 *      tiene plata; Proveedores sí, Recibir solo no; el mismo token devuelve lo mismo; una nota del proveedor no usa la serie DI- ni vuelve
 *      a acreditar lo que ya saldó un DI.
 *   V  LA NOTA DEL PROVEEDOR (5b, actividad 3, «Llegó su nota de crédito»): se adjunta a documentos internos de una factura sin mover
 *      plata; desde su fecha baja el crédito fiscal (Impuestos, registro de compras) y el Diario saca su IGV de la cuenta puente; lo que no
 *      se acepta (sin Notas de crédito, otro comprobante, serie, fecha, monto distinto); una nota para dos documentos; la tabla sola no
 *      deja dos notas para un documento ni se edita.
 *   D  «DEPOSITÓ» (5b, actividad 5): documento interno y reembolso de lo que quedó a favor en una transacción, a la cuenta donde entró;
 *      lo que no se acepta (todavía se le debe, monto distinto, medio, fecha, referencia, cuenta, sin Proveedores); con factura, el IGV
 *      espera en la cuenta puente; y el saldo a favor que lee la ficha con Proveedores solo (antes S/ 0).
 *   I  EL AVISO DEL IGV (5b, actividad 4): `fn_igv_en_espera` cuenta las prendas de una factura que no llegaron y los documentos que
 *      esperan la nota del proveedor, con su IGV; salen al resolver o adjuntar; cada parte, solo para quien puede actuar.
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
      // Fase 5b, actividad 1: pasar a saldo a favor con el documento interno (esquema y funciones).
      "20261015145000_nos_debe_saldo_a_favor_esquema.sql",
      "20261015150000_nos_debe_saldo_a_favor.sql",
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
${atrapa(
  "deposita",
  "p_dif uuid, p_cantidad integer, p_nota text, p_token uuid, p_dep jsonb",
  "retail.registrar_deposito_deuda(p_dif, p_cantidad, p_nota, p_token, p_dep)",
)}
${atrapa("debe", "p_prov uuid", "retail.fn_proveedor_nos_debe(p_prov)")}
${atrapa("devuelve", "p_id uuid, p_nota text, p_token uuid", "retail.devolver_danada_al_proveedor(p_id, p_nota, p_token)")}
${atrapa("devolvibles", "p_ubic uuid", "retail.fn_danadas_devolvibles(p_ubic)")}
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
const SIN_DEPOSITO = "P0001|nos_debe_deposito_monto|Faltan los datos del depósito: cuánto, cómo y cuándo";
const FORMA = "P0001|nos_debe_forma|No se entiende cómo se resolvió la deuda: elige «Llegó la reposición», «Pasar a saldo a favor» o «Depositó»";
const SIN_PAPEL_TODO =
  "P0001|nos_debe_sin_papel|Esas prendas no están en ningún comprobante con cupo: no se facturaron, así que no hay plata que pasar a saldo a favor. Si el proveedor las cobra después, regístralo y vuelve a intentarlo";
const NO_ES_DEUDA = "P0001|nos_debe_no_es_deuda|Eso no es una deuda del proveedor: solo se repone lo que «no vino» o lo que le devolviste";

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
    "anotado_por,cantidad,categoria,causa,con_igv,costo_unitario,descripcion,despacho_id,diferencia_id,envio,estado,fecha,marca,monto," +
      "monto_pendiente,monto_pendiente_con_igv,nota,orden,papel,pendiente,prenda_danada_id,proveedor,resoluciones,resuelto,saldada_en,sede,sin_papel",
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
    "deuda,documentos,resolucion_id",
    "t",
    "2:1:por_reponer",
    "P0001|nos_debe_otros_datos|Eso ya se guardó con otros datos: recarga la pantalla",
    "P0001|nos_debe_pasa_de_lo_debido|De esta deuda queda 1 por reponer: no puedes marcar 2",
    "0:saldada:true",
    "P0001|nos_debe_saldada|Esta deuda ya está saldada: no queda nada por reponer",
    "repuesta:2:La trajo el proveedor el lunes:true:a mano:true,repuesta:1:El resto llegó con la agencia:true:a mano:false",
    "0:1:0",
    "cantidad,creado_en,creado_por,despacho_id,documento,envio,forma,id,monto,nota=repuesta:2:a mano:Micaela Vendedora,repuesta:1:a mano:Micaela Vendedora",
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
  "B1 «Depositó» sin sus datos, no; a saldo a favor lo que nadie facturó, no (no hay plata); sin escribir nada; otra forma o una deuda que no existe, no",
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
  [SIN_PAPEL_TODO, SIN_DEPOSITO, FORMA, FORMA,
    "P0001|nos_debe_no_existe|Esa deuda no existe: recarga la pantalla",
    "nulo",
    "0/3"].join(" / "),
);

// A. A SALDO A FAVOR (fase 5b, actividad 1) --------------------------------------------------------------------------------
// El número del documento interno sale de una secuencia, que no vuelve atrás con el ROLLBACK: se compara como «DI-N».
const DI = (expr) => `regexp_replace(${expr}, 'DI-[0-9]+', 'DI-N', 'g')`;
caso(
  "A1 con boleta: pasa 2 de 3 a saldo a favor con el documento interno DI-…: cierra en el papel y baja la deuda del comprobante, sin IGV; la ficha, el Diario (421 contra 201), no Impuestos",
  `${PAPEL("bol", "boleta", "B001", "902", [["l1", 10, 20]])}
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select gen_random_uuid() as tok \\gset
   select pg_temp.resuelve(:'x1', 'saldo_a_favor', 2, null, :'tok') as a \\gset
   select pg_temp.debe(:'prov') as f \\gset
   reset role;
   select (:'a'::jsonb -> 'documentos' -> 0 ->> 'nota_credito_id') as nc \\gset
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select coalesce(string_agg(x.cuenta || ':' || x.debe || ':' || x.haber, ',' order by x.cuenta), '-') as diario,
          coalesce(min(x.glosa) filter (where x.cuenta = '421'), '-') as glosa
     from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) x where x.origen_id = :'nc' \\gset
   reset role;
   -- Impuestos es interna (la leen Finanzas con su permiso): se pregunta como la base.
   select count(*) as imp from retail.fn_impuestos_compras(retail.fn_hoy_lima(), retail.fn_hoy_lima()) x where x.id = :'nc' \\gset
   select concat_ws(' / ', pg_temp.e(:'a'::jsonb), ${CLAVES(":'a'::jsonb")},
     (select ${DI("d ->> 'documento'")} || ':' || (d ->> 'comprobante') || ':' || (d ->> 'cantidad') || ':' || (d ->> 'monto')
             || ':' || (d ->> 'baja_deuda') || ':' || (d ->> 'a_favor') from jsonb_array_elements(:'a'::jsonb -> 'documentos') d),
     (:'a'::jsonb -> 'deuda' ->> 'pendiente') || ':' || (:'a'::jsonb -> 'deuda' ->> 'monto_pendiente'),
     (select c.notas_credito || ':' || c.saldo || ':' || c.recibido_cantidad || ':' || c.cerrado_cantidad from retail.compras c where c.id = :'bol'),
     (select string_agg(k.motivo || ':' || k.cantidad || ':' || (k.ubicacion_id = :'tru') || ':' || (k.usuario_id = :'micaela_p'), ',')
        from retail.compra_item_cierres k join retail.compra_items i on i.id = k.compra_item_id where i.compra_id = :'bol'),
     (select n.interna || ':' || n.motivo || ':' || n.subtotal || ':' || n.igv || ':' || n.monto || ':' || n.aplicado || ':'
             || (n.fecha = retail.fn_hoy_lima()) || ':' || (n.cierre_id is not null) from retail.compra_notas_credito n where n.id = :'nc'),
     (select count(*) from retail.proveedor_creditos k where k.proveedor_id = :'prov') || ' en el libro',
     (select string_agg(r.forma || ':' || r.cantidad || ':' || (r.nota_credito_id = :'nc') || ':' || (r.token_cliente = :'tok'), ',')
        from retail.proveedor_deuda_resoluciones r where r.diferencia_id = :'x1'),
     (select (x ->> 'pendiente') || ':' || ${DI("x -> 'resoluciones' -> 0 ->> 'documento'")} || ':' || (x -> 'resoluciones' -> 0 ->> 'monto')
        from jsonb_array_elements(:'f'::jsonb -> 'abiertas') x),
     :'diario', ${DI(":'glosa'")}, :'imp' || ' en Impuestos',
     (select string_agg(a.modulo || ':' || ${DI(limpio("a.descripcion"))} || ':' || (a.detalle ? 'monto'), ',') from retail.actividad a
       where a.accion = 'deuda_saldo_a_favor' and a.detalle ->> 'diferencia_id' = :'x1'));`,
  [
    "OK",
    "deuda,documentos,resolucion_id",
    "DI-N:B001-902:2:40.00:40.00:0.00",
    "1:20.00",
    "40.00:160.00:7:2",
    "no_llego:2:true:true",
    "true:faltante:40.00:0.00:40.00:40.00:true:true",
    "0 en el libro",
    "saldo_a_favor:2:true:true",
    "1:DI-N:40.00",
    "201:0:40.00,421:40.00:0",
    "Documento interno DI-N",
    "0 en Impuestos",
    "proveedores:pasó a saldo a favor 2 de Polos Nos Debe · Marca Nos Debe Prueba que debe Proveedor Nos Debe Prueba (faltaron en la ENV): DI-N:false",
  ].join(" / "),
);
caso(
  "A2 con el comprobante ya pagado: el documento interno no tiene deuda que bajar y todo queda a favor del proveedor, en positivo",
  `${PAPEL("bol", "boleta", "B001", "902", [["l1", 10, 20]])}
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.registrar_pago_compra(:'bol', 200.00, 'transferencia') as pg \\gset
   reset role;
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.resuelve(:'x1', 'saldo_a_favor', 3, 'Que lo descuente del próximo pedido', null) as a \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'a'::jsonb),
     (select (d ->> 'monto') || ':' || (d ->> 'baja_deuda') || ':' || (d ->> 'a_favor') from jsonb_array_elements(:'a'::jsonb -> 'documentos') d),
     (select c.saldo from retail.compras c where c.id = :'bol'),
     (select string_agg(k.tipo || ':' || k.monto || ':' || (k.nota_credito_id = (:'a'::jsonb -> 'documentos' -> 0 ->> 'nota_credito_id')::uuid), ',')
        from retail.proveedor_creditos k where k.proveedor_id = :'prov'),
     retail.fn_saldo_favor_proveedor(:'prov'),
     (select r.nota from retail.proveedor_deuda_resoluciones r where r.diferencia_id = :'x1'));`,
  "OK / 60.00:0.00:60.00 / 0.00 / nota_credito:60.00:true / 60.00 / Que lo descuente del próximo pedido",
);
caso(
  "A3 con factura: el documento interno lleva su IGV; el Diario baja la deuda (421) y lo que costó (201), y el IGV espera en la cuenta puente 4019, no en la 4011; Impuestos no cambia hasta la nota del proveedor",
  `${PAPEL("fac", "factura", "F001", "901", [["l1", 10, 20]])}
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select coalesce(sum(igv_compras), 0) || ':' || coalesce(sum(igv_notas_credito), 0) as igv_antes from retail.fn_igv_credito_fiscal(retail.fn_hoy_lima()) \\gset
   reset role;
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.resuelve(:'x1', 'saldo_a_favor', 1, null, null) as a \\gset
   reset role;
   select (:'a'::jsonb -> 'documentos' -> 0 ->> 'nota_credito_id') as nc \\gset
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select coalesce(string_agg(x.cuenta || ':' || x.debe || ':' || x.haber, ',' order by x.cuenta), '-') as diario,
          coalesce(min(x.glosa) filter (where x.cuenta = '4019'), '-') as glosa,
          (sum(x.debe) = sum(x.haber))::text as cuadra
     from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) x where x.origen_id = :'nc' \\gset
   select coalesce(sum(igv_compras), 0) || ':' || coalesce(sum(igv_notas_credito), 0) as igv_despues from retail.fn_igv_credito_fiscal(retail.fn_hoy_lima()) \\gset
   reset role;
   select count(*) as imp from retail.fn_impuestos_compras(retail.fn_hoy_lima(), retail.fn_hoy_lima()) x where x.id = :'nc' \\gset
   select concat_ws(' / ', pg_temp.e(:'a'::jsonb),
     (select (d ->> 'comprobante') || ':' || (d ->> 'cantidad') || ':' || (d ->> 'monto') || ':' || (d ->> 'igv') || ':' || (d ->> 'baja_deuda')
             || ':' || (d ->> 'a_favor') from jsonb_array_elements(:'a'::jsonb -> 'documentos') d),
     (select n.interna || ':' || n.subtotal || ':' || n.igv || ':' || n.monto || ':' || n.aplicado from retail.compra_notas_credito n where n.id = :'nc'),
     (select c.notas_credito || ':' || c.saldo from retail.compras c where c.id = :'fac'),
     :'diario', :'glosa', :'cuadra', :'imp' || ' en Impuestos', (:'igv_antes' = :'igv_despues' and :'igv_antes' <> '0:0')::text,
     (select k.tipo || ':' || k.nombre from retail.cuentas k where k.codigo = '4019'));`,
  [
    "OK",
    "F001-901:1:23.60:3.60:23.60:0.00",
    "true:20.00:3.60:23.60:23.60",
    "23.60:212.40",
    "201:0:20.00,4019:0:3.60,421:23.60:0",
    "IGV por regularizar: falta la nota de crédito del proveedor",
    "true",
    "0 en Impuestos",
    "true",
    "pasivo:IGV por regularizar (falta la nota de crédito del proveedor)",
  ].join(" / "),
);
caso(
  "A8 con factura ya pagada: el documento interno, con su IGV, queda entero a favor del proveedor; el IGV igual espera en la cuenta puente",
  `${PAPEL("fac", "factura", "F001", "901", [["l1", 10, 20]])}
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.registrar_pago_compra(:'fac', 236.00, 'transferencia') as pg \\gset
   reset role;
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.resuelve(:'x1', 'saldo_a_favor', 3, null, null) as a \\gset
   reset role;
   select (:'a'::jsonb -> 'documentos' -> 0 ->> 'nota_credito_id') as nc \\gset
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select coalesce(string_agg(x.cuenta || ':' || x.debe || ':' || x.haber, ',' order by x.cuenta), '-') as diario
     from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) x where x.origen_id = :'nc' \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'a'::jsonb),
     (select (d ->> 'monto') || ':' || (d ->> 'igv') || ':' || (d ->> 'baja_deuda') || ':' || (d ->> 'a_favor') from jsonb_array_elements(:'a'::jsonb -> 'documentos') d),
     (select c.saldo from retail.compras c where c.id = :'fac'),
     (select string_agg(k.tipo || ':' || k.monto, ',') from retail.proveedor_creditos k where k.proveedor_id = :'prov'),
     retail.fn_saldo_favor_proveedor(:'prov'), :'diario');`,
  "OK / 70.80:10.80:0.00:70.80 / 0.00 / nota_credito:70.80 / 70.80 / 201:0:60.00,4019:0:10.80,421:70.80:0",
);
caso(
  "A4 lo que no se facturó no tiene plata: de 3, con solo 1 en el papel, pasar 3 no; pasar 1 sí, y lo que queda se valora al costo recibido",
  `${PAPEL("bol", "boleta", "B001", "902", [["l1", 8, 20]])}
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(pg_temp.resuelve(:'x1', 'saldo_a_favor', 3, null, null)) as tres \\gset
   select pg_temp.resuelve(:'x1', 'saldo_a_favor', 1, null, null) as uno \\gset
   reset role;
   select concat_ws(' / ', :'tres', pg_temp.e(:'uno'::jsonb),
     (:'uno'::jsonb -> 'deuda' ->> 'pendiente') || ':' || (:'uno'::jsonb -> 'deuda' ->> 'sin_papel') || ':' || (:'uno'::jsonb -> 'deuda' ->> 'monto_pendiente'),
     ${ESTADO("x1")});`,
  "P0001|nos_debe_sin_papel|De esas 3, solo 1 está en un comprobante con cupo y las otras 2 no se facturaron: no hay plata que pasar a saldo a favor por ellas. Pasa 1 / OK / 2:2:40.00 / 1/3",
);
caso(
  "A5 pasar a saldo a favor es de Proveedores: con Recibir solo, 42501; sin elegir responsable, no; con Proveedores, sí",
  `${PAPEL("bol", "boleta", "B001", "902", [["l1", 10, 20]])}
   ${rolDeMicaela("recibir")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${MICAELA_CON("recibir")}
   select pg_temp.e(pg_temp.resuelve(:'x1', 'saldo_a_favor', 1, null, null)) as solo_recibir \\gset
   ${MICAELA_CON("proveedores")}
   ${SIN_ENCABEZADOS}
   select pg_temp.e(pg_temp.resuelve(:'x1', 'saldo_a_favor', 1, null, null)) as sin_responsable \\gset
   ${EN_TIENDA}
   select pg_temp.e(pg_temp.resuelve(:'x1', 'saldo_a_favor', 1, null, null)) as con_proveedores \\gset
   reset role;
   select concat_ws(' / ', :'solo_recibir', :'sin_responsable', :'con_proveedores', ${ESTADO("x1")});`,
  "42501|nos_debe_sin_modulo|Pasar a saldo a favor lo que debe un proveedor necesita el módulo «Proveedores» en tu rol / " +
    "42501|responsable_requerido|Elige quién hace esta operación / OK / 1/3",
);
caso(
  "A6 el mismo token devuelve el mismo documento (no hace otro DI); el mismo token con otra cantidad, no",
  `${PAPEL("bol", "boleta", "B001", "902", [["l1", 10, 20]])}
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select gen_random_uuid() as tok \\gset
   select pg_temp.resuelve(:'x1', 'saldo_a_favor', 2, null, :'tok') as a1 \\gset
   select pg_temp.resuelve(:'x1', 'saldo_a_favor', 2, null, :'tok') as a2 \\gset
   select pg_temp.e(pg_temp.resuelve(:'x1', 'saldo_a_favor', 1, null, :'tok')) as otro \\gset
   reset role;
   select concat_ws(' / ', (:'a1'::jsonb ->> 'resolucion_id') = (:'a2'::jsonb ->> 'resolucion_id'),
     (:'a1'::jsonb -> 'documentos' -> 0 ->> 'documento') = (:'a2'::jsonb -> 'documentos' -> 0 ->> 'documento'),
     :'otro', (select count(*) from retail.compra_notas_credito n where n.compra_id = :'bol'), ${ESTADO("x1")});`,
  "t / t / P0001|nos_debe_otros_datos|Eso ya se guardó con otros datos: recarga la pantalla / 1 / 2/3",
);
caso(
  "A7 una nota del proveedor no usa la serie DI- ni vuelve a acreditar por faltante lo que ya saldó un documento interno",
  `${PAPEL("bol", "boleta", "B001", "902", [["l1", 10, 20]])}
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(pg_temp.resuelve(:'x1', 'saldo_a_favor', 3, null, null)) as a \\gset
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select concat_ws(' / ', :'a',
     pg_temp.intento(format('select retail.registrar_nota_credito_compra(%L, %L, retail.fn_hoy_lima(), 10, %L, null)', :'bol', 'di-000777', 'descuento')),
     pg_temp.intento(format('select retail.registrar_nota_credito_compra(%L, %L, retail.fn_hoy_lima(), 60, %L, null)', :'bol', 'NC01-9', 'faltante'))) as r \\gset
   reset role;
   select :'r';`,
  "OK / P0001||La serie DI- es de los documentos internos de CAYLA: escribe la serie y el número de la nota del proveedor / " +
    "P0001||B001-902 ya tiene documentos internos por lo que no llegó: la nota del proveedor se adjunta a ellos con «Llegó su nota de crédito»",
);

// V. LA NOTA DEL PROVEEDOR (fase 5b, actividad 3: «Llegó su nota de crédito») ------------------------------------------------
// Un error con la fecha del día adentro se compara sin ella.
const SIN_FECHA = (expr) => `regexp_replace(${expr}, '[0-9]{2}/[0-9]{2}/[0-9]{4}', 'DD/MM/AAAA', 'g')`;
const ADJUNTA = (ids, serie, fecha, monto, token = "'null'") =>
  `pg_temp.intento(format('select retail.adjuntar_nota_proveedor(array[%s]::uuid[], %L, %s, %s, %s)', ${ids}, ${serie}, ${fecha}, ${monto}, ${token}))`;
caso(
  "V1 «Llegó su nota de crédito»: la nota del proveedor se adjunta al documento interno de la factura sin mover plata; desde su fecha, su IGV baja el crédito fiscal (Impuestos y registro) y sale de la cuenta puente en el Diario; el mismo token no hace otra",
  `${PAPEL("fac", "factura", "F001", "901", [["l1", 10, 20]])}
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.resuelve(:'x1', 'saldo_a_favor', 3, null, null) as a \\gset
   reset role;
   select (:'a'::jsonb -> 'documentos' -> 0 ->> 'nota_credito_id') as di \\gset
   select c.saldo as saldo_antes from retail.compras c where c.id = :'fac' \\gset
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select coalesce(sum(igv_notas_credito), 0) as nc_antes from retail.fn_igv_credito_fiscal(retail.fn_hoy_lima()) \\gset
   select gen_random_uuid() as tok \\gset
   select retail.adjuntar_nota_proveedor(array[:'di']::uuid[], ' fc01-000777 ', retail.fn_hoy_lima(), 70.80, :'tok') as np \\gset
   select retail.adjuntar_nota_proveedor(array[:'di']::uuid[], 'FC01-000777', retail.fn_hoy_lima(), 70.80, :'tok') as np2 \\gset
   select pg_temp.intento(format('select retail.adjuntar_nota_proveedor(array[%L]::uuid[], %L, retail.fn_hoy_lima(), 70.80, %L)', :'di', 'FC01-000778', :'tok')) as otro \\gset
   select coalesce(sum(igv_notas_credito), 0) as nc_despues from retail.fn_igv_credito_fiscal(retail.fn_hoy_lima()) \\gset
   select coalesce(string_agg(x.cuenta || ':' || x.debe || ':' || x.haber, ',' order by x.cuenta), '-') as diario,
          coalesce(min(x.glosa) filter (where x.cuenta = '4019'), '-') as glosa
     from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) x where x.origen_id = (:'np'::jsonb ->> 'nota_proveedor_id')::uuid \\gset
   select coalesce(string_agg((t.nota_credito_id = :'di')::text || ':' || t.serie_numero || ':' || (t.fecha = retail.fn_hoy_lima()), ','), '-') as tablero
     from retail.fn_notas_proveedor_tablero() t where t.nota_credito_id = :'di' \\gset
   select count(*) as reg from retail.fn_impuestos_registro_compras(retail.fn_hoy_lima()) r
    where r.tipo = 'nota_credito' and r.serie = 'FC01' and r.numero = '000777' and r.ref_serie = 'F001' and r.ref_numero = '901'
      and r.igv = -10.80 and r.base = -60.00 and r.total = -70.80 and r.da_credito \\gset
   reset role;
   select concat_ws(' / ', ${CLAVES(":'np'::jsonb")},
     (:'np'::jsonb ->> 'serie_numero') || ':' || (:'np'::jsonb ->> 'subtotal') || ':' || (:'np'::jsonb ->> 'igv') || ':' || (:'np'::jsonb ->> 'monto')
       || ':' || ${DI("(:'np'::jsonb -> 'documentos' ->> 0)")} || ':' || (:'np'::jsonb ->> 'comprobante'),
     ((:'np'::jsonb ->> 'nota_proveedor_id') = (:'np2'::jsonb ->> 'nota_proveedor_id'))::text, :'otro',
     ((select c.saldo from retail.compras c where c.id = :'fac') = :'saldo_antes'::numeric)::text,
     (select count(*) from retail.proveedor_creditos k where k.proveedor_id = :'prov') || ' en el libro',
     (:'nc_despues'::numeric - :'nc_antes'::numeric)::text,
     (select count(*) from retail.fn_impuestos_compras(retail.fn_hoy_lima(), retail.fn_hoy_lima()) x
       where x.id = (:'np'::jsonb ->> 'nota_proveedor_id')::uuid and x.origen = 'nota_credito' and x.igv = -10.80 and x.da_credito) || ' en Impuestos',
     :'reg' || ' en el registro', :'diario', :'glosa', :'tablero',
     (select string_agg(a.modulo || ':' || ${DI("a.descripcion")} || ':' || (a.persona_id = :'felipe_p'), ',') from retail.actividad a
       where a.accion = 'nota_proveedor_adjunta' and a.detalle ->> 'compra_id' = :'fac'));`,
  [
    "comprobante,documentos,fecha,igv,monto,nota_proveedor_id,serie_numero,subtotal",
    "FC01-000777:60.00:10.80:70.80:DI-N:F001-901",
    "true",
    "P0001|nota_proveedor_otros_datos|Eso ya se guardó con otros datos: recarga la pantalla",
    "true",
    "0 en el libro",
    "10.80",
    "1 en Impuestos",
    "1 en el registro",
    "4011:0:10.80,4019:10.80:0",
    "Nota de crédito FC01-000777 del proveedor: el IGV sale de por regularizar",
    "true:FC01-000777:true",
    "notas_credito:adjuntó la nota FC01-000777 de Proveedor Nos Debe Prueba a DI-N (F001-901):true",
  ].join(" / "),
);
caso(
  "V2 la nota del proveedor: sin Notas de crédito, 42501; solo a documentos internos de UNA factura; la serie, la fecha y el monto como el papel (y el monto igual a lo que no llegó); sin escribir nada",
  `${PAPEL("fac", "factura", "F001", "901", [["l1", 10, 20]])}
   ${PAPEL("fac2", "factura", "F001", "902", [["l2", 6, 30]])}
   ${PAPEL("bol", "boleta", "B001", "903", [["l3", 4, 25]])}
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${DEUDA("x2", "l2", 6, 4, "vc_s")}
   ${DEUDA("x3", "l3", 4, 3)}
   ${como(MICAELA)}${EN_TIENDA}
   select (pg_temp.resuelve(:'x1', 'saldo_a_favor', 1, null, null) -> 'documentos' -> 0 ->> 'nota_credito_id') as di1 \\gset
   select (pg_temp.resuelve(:'x2', 'saldo_a_favor', 2, null, null) -> 'documentos' -> 0 ->> 'nota_credito_id') as di3 \\gset
   select (pg_temp.resuelve(:'x3', 'saldo_a_favor', 1, null, null) -> 'documentos' -> 0 ->> 'nota_credito_id') as di4 \\gset
   select ${ADJUNTA("quote_literal(:'di1')", "'FC01-1'", "'retail.fn_hoy_lima()'", "'23.60'")} as sin_modulo \\gset
   reset role;
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select concat_ws(' / ',
     :'sin_modulo',
     ${ADJUNTA("''", "'FC01-1'", "'retail.fn_hoy_lima()'", "'23.60'")},
     ${ADJUNTA("quote_literal(:'di4')", "'FC01-1'", "'retail.fn_hoy_lima()'", "'25.00'")},
     ${ADJUNTA("quote_literal(:'di1') || ', ' || quote_literal(:'di3')", "'FC01-1'", "'retail.fn_hoy_lima()'", "'94.40'")},
     ${ADJUNTA("quote_literal(:'di1')", "'  '", "'retail.fn_hoy_lima()'", "'23.60'")},
     ${ADJUNTA("quote_literal(:'di1')", "'di-000001'", "'retail.fn_hoy_lima()'", "'23.60'")},
     ${ADJUNTA("quote_literal(:'di1')", "repeat('9', 31)", "'retail.fn_hoy_lima()'", "'23.60'")},
     ${ADJUNTA("quote_literal(:'di1')", "'FC01-1'", "'retail.fn_hoy_lima() + 1'", "'23.60'")},
     ${SIN_FECHA(ADJUNTA("quote_literal(:'di1')", "'FC01-1'", "'retail.fn_hoy_lima() - 1'", "'23.60'"))},
     ${ADJUNTA("quote_literal(:'di1')", "'FC01-1'", "'retail.fn_hoy_lima()'", "'23.00'")},
     ${ADJUNTA("quote_literal(:'di1')", "'FC01-1'", "'retail.fn_hoy_lima()'", "'23.601'")},
     ${ADJUNTA("quote_literal(:'di1')", "'FC01-1'", "'null'", "'23.60'")}) as r \\gset
   reset role;
   select :'r' || ' / ' || (select count(*) from retail.compra_notas_proveedor p where p.compra_id in (:'fac', :'fac2', :'bol')) || ' notas del proveedor';`,
  [
    "42501|nota_proveedor_sin_modulo|Adjuntar la nota de crédito de un proveedor necesita el módulo «Notas de crédito» en tu rol",
    "P0001|nota_proveedor_documentos|Elige qué documento interno respalda la nota",
    "P0001|nota_proveedor_documentos|La nota del proveedor solo se adjunta a documentos internos de una factura: recarga la pantalla",
    "P0001|nota_proveedor_documentos|Una nota del proveedor es de un solo comprobante: elige documentos internos del mismo",
    "P0001|nota_proveedor_serie|Escribe la serie y el número de la nota del proveedor",
    "P0001|nota_proveedor_serie|La serie DI- es de los documentos internos de CAYLA: escribe la de la nota del proveedor",
    "P0001|nota_proveedor_serie|La serie y el número de la nota van hasta 30 letras",
    "P0001|nota_proveedor_fecha|La fecha de la nota no puede ser futura",
    "P0001|nota_proveedor_fecha|La nota no puede ser anterior al comprobante (emitido el DD/MM/AAAA)",
    "P0001|nota_proveedor_monto|La nota dice S/ 23.00, pero lo que no llegó suma S/ 23.60 (base S/ 20.00 + IGV S/ 3.60): pídele al proveedor que la corrija",
    "P0001|nota_proveedor_monto|El monto de la nota admite como máximo 2 decimales",
    "P0001|nota_proveedor_fecha|Elige la fecha de la nota",
    "0 notas del proveedor",
  ].join(" / "),
);
caso(
  "V3 una nota para dos documentos internos del mismo comprobante; después, cada uno ya tiene la suya y la serie no se repite; la tabla sola tampoco deja dos notas para un documento, ni editar ni borrar",
  `${PAPEL("fac", "factura", "F001", "901", [["l1", 10, 20]])}
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select (pg_temp.resuelve(:'x1', 'saldo_a_favor', 1, null, null) -> 'documentos' -> 0 ->> 'nota_credito_id') as di1 \\gset
   select (pg_temp.resuelve(:'x1', 'saldo_a_favor', 1, null, null) -> 'documentos' -> 0 ->> 'nota_credito_id') as di2 \\gset
   select (pg_temp.resuelve(:'x1', 'saldo_a_favor', 1, null, null) -> 'documentos' -> 0 ->> 'nota_credito_id') as di3 \\gset
   reset role;
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.adjuntar_nota_proveedor(array[:'di1', :'di2']::uuid[], 'FC01-5', retail.fn_hoy_lima(), 47.20, null) as np \\gset
   select concat_ws(' / ',
     ${ADJUNTA("quote_literal(:'di3')", "'FC01-5'", "'retail.fn_hoy_lima()'", "'23.60'")},
     ${ADJUNTA("quote_literal(:'di1')", "'FC01-6'", "'retail.fn_hoy_lima()'", "'23.60'")}) as despues \\gset
   select count(*) as tablero from retail.fn_notas_proveedor_tablero() t where t.nota_credito_id in (:'di1', :'di2') and t.serie_numero = 'FC01-5' \\gset
   reset role;
   select concat_ws(' / ',
     (:'np'::jsonb ->> 'monto') || ':' || (:'np'::jsonb ->> 'igv') || ':' || jsonb_array_length(:'np'::jsonb -> 'documentos'),
     ${DI(":'despues'")},
     :'tablero' || ' en el tablero',
     pg_temp.intento(format($q$with n as (insert into retail.compra_notas_proveedor (compra_id, serie_numero, fecha, subtotal, igv, monto)
                                          values (%L, 'FC01-9', retail.fn_hoy_lima(), 20, 3.60, 23.60) returning id)
                               insert into retail.compra_notas_proveedor_documentos (nota_proveedor_id, nota_credito_id) select n.id, %L from n$q$,
                             :'fac', :'di1')),
     pg_temp.intento($q$update retail.compra_notas_proveedor set fecha = fecha$q$),
     pg_temp.intento($q$delete from retail.compra_notas_proveedor_documentos$q$),
     pg_temp.intento(format($q$insert into retail.compra_notas_proveedor (compra_id, serie_numero, fecha, subtotal, igv, monto)
                               values (%L, 'FC01-10', retail.fn_hoy_lima(), 20, 0, 20)$q$, :'fac')));`,
  [
    "47.20:7.20:2",
    "P0001|nota_proveedor_serie|La nota FC01-5 ya está registrada en F001-901",
    "P0001|nota_proveedor_ya_adjunta|Ya tiene su nota del proveedor: DI-N (FC01-5). Recarga la pantalla",
    "2 en el tablero",
    "23505||duplicate key value violates unique constraint \"compra_notas_proveedor_documentos_una\"",
    "P0001||Los cierres de línea y las notas de crédito no se editan ni se borran. Para corregir un error, registra un documento nuevo — así queda constancia de qué pasó.",
    "P0001||Los cierres de línea y las notas de crédito no se editan ni se borran. Para corregir un error, registra un documento nuevo — así queda constancia de qué pasó.",
    "23514||new row for relation \"compra_notas_proveedor\" violates check constraint \"compra_notas_proveedor_cifras\"",
  ].join(" / "),
);

// D. «DEPOSITÓ» (fase 5b, actividad 5) ------------------------------------------------------------------------------------------
// El proveedor devuelve en plata lo que no mandó: documento interno + reembolso de lo que quedó a favor, en una transacción.
const DEPOSITO = (monto, extra = "") =>
  `jsonb_build_object('monto', ${monto}, 'metodo', 'efectivo', 'fecha', retail.fn_hoy_lima(), 'referencia', 'Recibo 12', 'cuenta_id', :'fuerte'${extra})`;
const FUERTE = `select id as fuerte from retail.cuentas_dinero where tipo = 'caja_fuerte' and nombre like '%Trujillo' \\gset\n`;
caso(
  "D1 «Depositó» con el comprobante ya pagado: documento interno y reembolso en una transacción, a la cuenta donde entró; el saldo a favor queda en cero; el mismo token no repite; la actividad",
  `${PAPEL("bol", "boleta", "B001", "902", [["l1", 10, 20]])}
   ${FUERTE}
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.registrar_pago_compra(:'bol', 200.00, 'transferencia') as pg \\gset
   reset role;
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select gen_random_uuid() as tok \\gset
   select pg_temp.deposita(:'x1', 2, 'Lo devolvió en efectivo', :'tok', ${DEPOSITO("40.00")}) as d \\gset
   select pg_temp.deposita(:'x1', 2, 'Lo devolvió en efectivo', :'tok', ${DEPOSITO("40.00")}) as d2 \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'d'::jsonb), ((:'d'::jsonb ->> 'resolucion_id') = (:'d2'::jsonb ->> 'resolucion_id'))::text,
     (select ${DI("d ->> 'documento'")} || ':' || (d ->> 'monto') || ':' || (d ->> 'baja_deuda') || ':' || (d ->> 'a_favor')
        from jsonb_array_elements(:'d'::jsonb -> 'documentos') d),
     (select string_agg(k.tipo || ':' || k.monto || ':' || coalesce(k.metodo, '-') || ':' || coalesce(k.referencia, '-') || ':'
                        || coalesce((k.cuenta_dinero_id = :'fuerte')::text, '-'), ',' order by k.tipo)
        from retail.proveedor_creditos k where k.proveedor_id = :'prov'),
     retail.fn_saldo_favor_proveedor(:'prov'),
     (select string_agg(r.forma || ':' || r.cantidad || ':' || (r.nota_credito_id is not null), ',') from retail.proveedor_deuda_resoluciones r
       where r.diferencia_id = :'x1'),
     (select count(*) from retail.compra_notas_credito n where n.compra_id = :'bol') || ' documento',
     (select string_agg(a.modulo || ':' || ${DI(limpio("a.descripcion"))}, ',') from retail.actividad a
       where a.accion = 'deuda_deposito' and a.detalle ->> 'diferencia_id' = :'x1'));`,
  [
    "OK",
    "true",
    "DI-N:40.00:0.00:40.00",
    "nota_credito:40.00:-:-:-,reembolso:40.00:efectivo:Recibo 12:true",
    "0.00",
    "deposito:2:true",
    "1 documento",
    "proveedores:registró que Proveedor Nos Debe Prueba depositó lo de 2 de Polos Nos Debe · Marca Nos Debe Prueba (faltaron en la ENV): DI-N",
  ].join(" / "),
);
caso(
  "D2 «Depositó» lo que no se acepta: si todavía se le debe el comprobante, no hay nada que depositar; el monto tiene que ser lo que quedó a favor; medio, fecha, referencia y cuenta; con Recibir solo, 42501; sin escribir nada",
  `${PAPEL("bol", "boleta", "B001", "902", [["l1", 10, 20]])}
   ${FUERTE}
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(pg_temp.deposita(:'x1', 2, null, null, ${DEPOSITO("40.00")})) as impaga \\gset
   reset role;
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.registrar_pago_compra(:'bol', 200.00, 'transferencia') as pg \\gset
   reset role;
   ${como(MICAELA)}${EN_TIENDA}
   select concat_ws(' / ', :'impaga',
     pg_temp.e(pg_temp.deposita(:'x1', 2, null, null, ${DEPOSITO("30.00")})),
     pg_temp.e(pg_temp.deposita(:'x1', 2, null, null, ${DEPOSITO("0")})),
     pg_temp.e(pg_temp.deposita(:'x1', 2, null, null, ${DEPOSITO("40.001")})),
     pg_temp.e(pg_temp.deposita(:'x1', 2, null, null, ${DEPOSITO("40.00", ", 'metodo', 'cheque'")})),
     pg_temp.e(pg_temp.deposita(:'x1', 2, null, null, ${DEPOSITO("40.00", ", 'fecha', retail.fn_hoy_lima() + 1")})),
     pg_temp.e(pg_temp.deposita(:'x1', 2, null, null, ${DEPOSITO("40.00", ", 'fecha', retail.fn_hoy_lima() - 400")})),
     pg_temp.e(pg_temp.deposita(:'x1', 2, null, null, ${DEPOSITO("40.00", ", 'referencia', repeat('x', 61)")})),
     pg_temp.e(pg_temp.deposita(:'x1', 2, null, null, ${DEPOSITO("40.00", ", 'cuenta_id', gen_random_uuid()")}))) as r \\gset
   reset role;
   ${MICAELA_CON("recibir")}
   select pg_temp.e(pg_temp.deposita(:'x1', 2, null, null, ${DEPOSITO("40.00")})) as solo_recibir \\gset
   reset role;
   select concat_ws(' / ', :'r', :'solo_recibir', ${ESTADO("x1")},
     (select count(*) from retail.compra_notas_credito n where n.compra_id = :'bol') || ' documentos',
     (select count(*) from retail.proveedor_creditos k where k.proveedor_id = :'prov' and k.tipo = 'reembolso') || ' reembolsos');`,
  [
    "P0001|nos_debe_deposito_sin_sobrante|Todavía le debes ese comprobante: lo que no llegó solo baja tu deuda (S/ 40.00). No hace falta que te deposite: usa «Pasar a saldo a favor»",
    "P0001|nos_debe_deposito_monto|El depósito es de S/ 30.00, pero lo que no llegó deja S/ 40.00 a tu favor (después de bajar lo que le debías): revisa el monto",
    "P0001|nos_debe_deposito_monto|Escribe cuánto te depositó",
    "P0001|nos_debe_deposito_monto|El monto del depósito admite como máximo 2 decimales",
    "P0001|nos_debe_deposito_metodo|Elige cómo te devolvió la plata",
    "P0001|nos_debe_deposito_fecha|La fecha del depósito no puede ser futura",
    "P0001|nos_debe_deposito_fecha|El depósito no puede ser anterior a la recepción donde faltaron",
    "P0001|nos_debe_deposito_referencia|La referencia va hasta 60 letras",
    "P0001|nos_debe_deposito_cuenta|Esa cuenta ya no está: elige otra",
    "42501|nos_debe_sin_modulo|Registrar que un proveedor depositó lo que debe necesita el módulo «Proveedores» en tu rol",
    "0/3",
    "0 documentos",
    "0 reembolsos",
  ].join(" / "),
);
caso(
  "D3 «Depositó» con factura ya pagada: el reembolso lleva su IGV, y ese IGV espera la nota del proveedor en la cuenta puente",
  `${PAPEL("fac", "factura", "F001", "901", [["l1", 10, 20]])}
   ${FUERTE}
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.registrar_pago_compra(:'fac', 236.00, 'transferencia') as pg \\gset
   reset role;
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.deposita(:'x1', 1, null, null, ${DEPOSITO("23.60")}) as d \\gset
   reset role;
   select (:'d'::jsonb -> 'documentos' -> 0 ->> 'nota_credito_id') as nc \\gset
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select coalesce(string_agg(x.cuenta || ':' || x.debe || ':' || x.haber, ',' order by x.cuenta), '-') as diario
     from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) x where x.origen_id = :'nc' \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'d'::jsonb),
     (select string_agg(k.tipo || ':' || k.monto, ',' order by k.tipo) from retail.proveedor_creditos k where k.proveedor_id = :'prov'),
     retail.fn_saldo_favor_proveedor(:'prov'), :'diario');`,
  "OK / nota_credito:23.60,reembolso:23.60 / 0.00 / 201:0:20.00,4019:0:3.60,421:23.60:0",
);
caso(
  "D4 con Proveedores solo, el saldo a favor de la ficha se lee entero (antes salía S/ 0); sin Proveedores ni la plata de Compras, 42501",
  `${PAPEL("bol", "boleta", "B001", "902", [["l1", 10, 20]])}
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.registrar_pago_compra(:'bol', 200.00, 'transferencia') as pg \\gset
   reset role;
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.resuelve(:'x1', 'saldo_a_favor', 3, null, null) as a \\gset
   reset role;
   ${MICAELA_CON("proveedores")}
   select retail.fn_saldo_favor_visible(:'prov') as visible, retail.fn_saldo_favor_proveedor(:'prov') as de_siempre \\gset
   reset role;
   ${MICAELA_CON("existencias")}
   select pg_temp.intento(format('select retail.fn_saldo_favor_visible(%L)', :'prov')) as sin_modulo \\gset
   reset role;
   select concat_ws(' / ', :'visible', :'de_siempre', :'sin_modulo');`,
  "60.00 / 0.00 / 42501||Ver el saldo a favor de un proveedor necesita el módulo «Proveedores» o la plata de Compras en tu rol",
);

// I. EL AVISO DEL IGV (fase 5b, actividad 4) ------------------------------------------------------------------------------------
// `fn_igv_en_espera` cuenta en toda la base: el caso compara contra lo que había al empezar (el banco puede traer datos). Una diferencia
// de cero se escribe «0» aunque las dos cifras traigan céntimos (10.80 − 10.80 da 0.00).
caso(
  "I1 el aviso del IGV: las prendas de una factura que no llegaron (no las de una boleta) y los documentos que esperan su nota, con su IGV; salen al resolver o adjuntar; cada parte solo para quien puede actuar",
  `create function pg_temp.cifra(n numeric) returns text language sql as $f$
     select case when n = 0 then '0' else to_char(n, 'FM999999990.00') end
   $f$;
   create function pg_temp.igv(j jsonb, b jsonb) returns text language sql as $f$
     select coalesce(((j -> 'sin_nota' ->> 'documentos')::int - coalesce((b -> 'sin_nota' ->> 'documentos')::int, 0)) || ':'
              || pg_temp.cifra((j -> 'sin_nota' ->> 'igv')::numeric - coalesce((b -> 'sin_nota' ->> 'igv')::numeric, 0)), 'nulo')
       || ' | ' || coalesce(((j -> 'faltantes' ->> 'prendas')::int - coalesce((b -> 'faltantes' ->> 'prendas')::int, 0)) || ':'
              || ((j -> 'faltantes' ->> 'facturas')::int - coalesce((b -> 'faltantes' ->> 'facturas')::int, 0)) || ':'
              || pg_temp.cifra((j -> 'faltantes' ->> 'igv')::numeric - coalesce((b -> 'faltantes' ->> 'igv')::numeric, 0)), 'nulo')
   $f$;
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.fn_igv_en_espera() as base \\gset
   reset role;
   ${PAPEL("fac", "factura", "F001", "901", [["l1", 10, 20]])}
   ${PAPEL("bol", "boleta", "B001", "903", [["l3", 4, 25]])}
   ${rolDeMicaela("recibir", "proveedores")}
   ${DEUDA("x1", "l1", 10, 7)}
   ${DEUDA("x3", "l3", 4, 3)}
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.fn_igv_en_espera() as antes \\gset
   reset role;
   ${como(MICAELA)}${EN_TIENDA}
   select (pg_temp.resuelve(:'x1', 'saldo_a_favor', 2, null, null) -> 'documentos' -> 0 ->> 'nota_credito_id') as di \\gset
   select retail.fn_igv_en_espera() as micaela \\gset
   reset role;
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select retail.fn_igv_en_espera() as medio \\gset
   select retail.adjuntar_nota_proveedor(array[:'di']::uuid[], 'FC01-77', retail.fn_hoy_lima(), 47.20, null) is not null as adjunta \\gset
   select retail.fn_igv_en_espera() as despues \\gset
   reset role;
   ${MICAELA_CON("recibir")}
   select retail.fn_igv_en_espera() as solo_recibir \\gset
   reset role;
   select concat_ws(' / ', pg_temp.igv(:'antes', :'base'), pg_temp.igv(:'micaela', :'base'), pg_temp.igv(:'medio', :'base'),
     pg_temp.igv(:'despues', :'base'), pg_temp.igv(:'solo_recibir', :'base'));`,
  ["0:0 | 3:1:10.80", "nulo | 1:1:3.60", "1:7.20 | 1:1:3.60", "0:0 | 1:1:3.60", "nulo | nulo"].join(" / "),
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
    "23514||new row for relation \"proveedor_deuda_resoluciones\" violates check constraint \"proveedor_deuda_resoluciones_con_plata\"",
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

// La fase 5b: lo que lee y escribe la web, security definer con authenticated y sin anon; lo interno, cerrado; las tablas de la nota del
// proveedor, con RLS, sin políticas y sin lectura directa.
const PUBLICAS_5B = "('fn_deuda_valor', 'adjuntar_nota_proveedor', 'fn_notas_proveedor_tablero', 'fn_igv_en_espera', 'fn_saldo_favor_visible', " +
  "'registrar_deposito_deuda', 'devolver_danada_al_proveedor', 'fn_danadas_devolvibles')";
const INTERNAS_5B = "('fn_deuda_papel', 'fn_deuda_valor_de', 'fn_pasar_deuda_a_saldo_a_favor', 'fn_deuda_documentos_de', 'fn_nota_proveedor_resumen', " +
  "'fn_asientos_nota_proveedor')";
caso(
  "S2 la fase 5b: las públicas security definer, authenticated sí y anon no; las internas cerradas; las tablas de la nota del proveedor con RLS, sin políticas y sin lectura directa",
  `select concat_ws(',',
     (select count(*) ${DE_RETAIL(PUBLICAS_5B)}),
     (select bool_and(p.prosecdef) ${DE_RETAIL(PUBLICAS_5B)}),
     (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) ${DE_RETAIL(PUBLICAS_5B)}),
     (select bool_or(has_function_privilege('anon', p.oid, 'execute')) ${DE_RETAIL(PUBLICAS_5B)}),
     (select count(*) ${DE_RETAIL(INTERNAS_5B)}),
     (select bool_or(has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) ${DE_RETAIL(INTERNAS_5B)}),
     (select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('retail.compra_notas_proveedor'::regclass, 'retail.compra_notas_proveedor_documentos'::regclass)),
     (select count(*) from pg_policies where schemaname = 'retail' and tablename in ('compra_notas_proveedor', 'compra_notas_proveedor_documentos')),
     has_table_privilege('authenticated', 'retail.compra_notas_proveedor', 'select'),
     has_table_privilege('authenticated', 'retail.compra_notas_proveedor_documentos', 'select'),
     has_table_privilege('anon', 'retail.compra_notas_proveedor', 'select'));`,
  "8,t,t,f,6,f,t,0,f,f,f",
);

// E. «DEVOLVER AL PROVEEDOR» LO QUE LLEGÓ DAÑADO (fase 5b, actividad 6a) -------------------------------------------------------------
// Felipe 2026-10-15: solo lo que llegó dañado en una recepción, el grupo entero, lo hace quien tiene Existencias. Queda como deuda «por
// reponer» (causa `devuelta`) con las mismas salidas que un faltante; su plata llega con la actividad 6b.
const VD = (v, cantidad, danadas) => J({ variante_id: `:'${v}'`, cantidad, danadas, danada_solucion: "'sin_solucion'" });
/**
 * Lo que llega dañado: Felipe envía `enviadas` de la línea `l`; Micaela (que ya tiene Recibir) las recibe todas, `danadas` dañadas y sin
 * arreglo. El envío queda en :d_<x>, su línea en :di_<x>, la respuesta de la recepción en :rec_<x> y la prenda de la cuarentena en :<x>.
 */
const DANADA = (x, l, enviadas, danadas, variante = "vp_s") => `
${ENVIA(`d_${x}`, [[l, enviadas]])}${ITEM(`d_${x}`, l, `di_${x}`)}
${como(MICAELA)}${EN_TIENDA}
${ABRE(`d_${x}`)}
select pg_temp.e(${RECIBE(`d_${x}`, A(LIN(`di_${x}`, [VD(variante, enviadas, danadas)])))}) as rec_${x} \\gset
reset role;
select pd.id as ${x} from retail.prendas_danadas pd
  join retail.despacho_recibidos r on r.movimiento_danada_id = pd.movimiento_entrada_id
 where r.despacho_id = :'d_${x}' \\gset
`;
const CUARENTENA = (v) =>
  `coalesce((select s.cantidad from retail.stock s join retail.sububicaciones sb on sb.id = s.sububicacion_id
              where s.variante_id = :'${v}' and s.ubicacion_id = :'tru' and sb.tipo = 'cuarentena'), 0)`;
caso(
  "E1 «Devolver al proveedor» lo que llegó dañado: sale de la cuarentena sin tocar lo recibido, queda devuelta a SU proveedor y nace la deuda «por reponer» (causa devuelta) que lee «Nos debe»; el mismo token no repite; la actividad",
  `${rolDeMicaela("recibir", "existencias")}
   ${DANADA("p1", "l1", 5, 2)}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.devolvibles(:'tru') as antes \\gset
   select gen_random_uuid() as tok \\gset
   select pg_temp.devuelve(:'p1', 'La tela vino rota', :'tok') as r \\gset
   select pg_temp.devuelve(:'p1', 'La tela vino rota', :'tok') as r2 \\gset
   select pg_temp.devolvibles(:'tru') as despues \\gset
   select pg_temp.debe(:'prov') as nd \\gset
   reset role;
   select concat_ws(' / ', :'rec_p1', pg_temp.e(:'r'::jsonb),
     (:'r'::jsonb ->> 'ya_registrada') || ':' || (:'r2'::jsonb ->> 'ya_registrada') || ':'
       || ((:'r'::jsonb ->> 'diferencia_id') = (:'r2'::jsonb ->> 'diferencia_id')) || ':' || (:'r'::jsonb ->> 'proveedor'),
     (select count(*) || ':' || min(e ->> 'proveedor') || ':' || min(${limpio("e ->> 'envio'")}) || ':' || min(e ->> 'arreglo')
        from jsonb_array_elements(:'antes'::jsonb) e where e ->> 'id' = :'p1'),
     (select count(*) from jsonb_array_elements(:'despues'::jsonb) e where e ->> 'id' = :'p1') || ' después',
     (select pd.estado || ':' || (pd.proveedor_id = :'prov') || ':' || m.motivo || ':' || m.cantidad || ':' || (m.compra_item_id is null) || ':' || pd.nota
        from retail.prendas_danadas pd join retail.movimientos m on m.id = pd.movimiento_salida_id where pd.id = :'p1'),
     ${CUARENTENA("vp_s")} || ' en cuarentena',
     (select x.tipo || ':' || x.causa || ':' || x.cantidad || ':' || x.costo_unitario || ':' || (x.despacho_id = :'d_p1') || ':'
             || (x.despacho_item_id = :'di_p1') || ':' || x.vigente || ':' || x.nota
        from retail.despacho_diferencias x where x.prenda_danada_id = :'p1'),
     (select d ->> 'causa' || ':' || (d ->> 'pendiente') || ':' || (d ->> 'sin_papel') || ':' || (d ->> 'monto_pendiente') || ':'
             || ((d ->> 'prenda_danada_id') = :'p1')
        from jsonb_array_elements(:'nd'::jsonb -> 'abiertas') d where d ->> 'diferencia_id' = (:'r'::jsonb ->> 'diferencia_id')),
     (select string_agg(a.modulo || ':' || ${limpio("a.descripcion")}, ',') from retail.actividad a
       where a.accion = 'danada_devuelta' and a.detalle ->> 'prenda_danada_id' = :'p1'));`,
  [
    "OK",
    "OK",
    "false:true:true:Proveedor Nos Debe Prueba",
    "1:Proveedor Nos Debe Prueba:ENV:Sin arreglo",
    "0 después",
    "devuelta_proveedor:true:cuarentena_devuelta_proveedor:2:true:La tela vino rota",
    "0 en cuarentena",
    "faltante:devuelta:2:20.00:true:true:true:La tela vino rota",
    "devuelta:2:2:40.00:true",
    "existencias:devolvió al proveedor Proveedor Nos Debe Prueba: 2 de Polos Nos Debe (llegaron con daño en ENV)",
  ].join(" / "),
);
caso(
  "E2 «Devolver al proveedor» lo que no se acepta: sin Existencias, 42501; sin responsable; sin token; nota larga; lo que no llegó dañado en una recepción; ya resuelta; el mismo token con otra nota; sin escribir nada",
  `${rolDeMicaela("recibir", "existencias")}
   ${DANADA("p1", "l1", 5, 2)}
   ${como(MICAELA)}${EN_TIENDA}
   -- Una prenda buena del almacén se reporta dañada en la tienda: llega a Dañadas por otro camino.
   select (retail.reportar_danada(:'tru', :'vp_s', 1, 'almacen', 'Mancha en la manga', gen_random_uuid()) ->> 'id') as rep \\gset
   select gen_random_uuid() as tok \\gset
   select concat_ws(' / ',
     pg_temp.e(pg_temp.devuelve(:'p1', null, null)),
     pg_temp.e(pg_temp.devuelve(:'p1', repeat('x', 201), gen_random_uuid())),
     pg_temp.e(pg_temp.devuelve(:'rep', null, gen_random_uuid()))) as r \\gset
   ${SIN_ENCABEZADOS}
   select pg_temp.e(pg_temp.devuelve(:'p1', null, gen_random_uuid())) as sin_resp \\gset
   reset role;
   ${MICAELA_CON("recibir")}
   select pg_temp.e(pg_temp.devuelve(:'p1', null, gen_random_uuid())) as sin_modulo \\gset
   reset role;
   select concat_ws(' / ', :'r', :'sin_resp', :'sin_modulo',
     (select estado from retail.prendas_danadas where id = :'p1'),
     (select count(*) from retail.despacho_diferencias where prenda_danada_id = :'p1') || ' deudas') as antes \\gset
   ${MICAELA_CON("recibir", "existencias")}
   select pg_temp.e(pg_temp.devuelve(:'p1', null, :'tok')) as primera \\gset
   select pg_temp.e(pg_temp.devuelve(:'p1', 'otra nota', :'tok')) as otra_nota \\gset
   select pg_temp.e(pg_temp.devuelve(:'p1', null, gen_random_uuid())) as otra_vez \\gset
   reset role;
   select concat_ws(' / ', :'antes', :'primera', :'otra_nota', :'otra_vez');`,
  [
    "P0001|danada_devolver_sin_token|Falta la marca de este intento. Cierra la ventana y vuelve a abrirla.",
    "P0001|danada_devolver_nota_larga|La nota va hasta 200 letras",
    "P0001|danada_devolver_no_es_de_recepcion|Solo se devuelve al proveedor lo que llegó dañado en una recepción: esta prenda llegó a Dañadas de otra forma.",
    "42501|responsable_requerido|Elige quién hace esta operación",
    "42501|danada_devolver_sin_modulo|Devolver al proveedor una prenda dañada necesita el módulo Existencias en tu rol",
    "en_cuarentena",
    "0 deudas",
    "OK",
    "P0001|token_reusado|Lo que mandas ahora no es lo que se mandó la primera vez. Revisa si el envío anterior se guardó antes de volver a intentar.",
    "P0001|danada_devolver_ya_resuelta|Esta prenda ya se resolvió como «Devuelta al proveedor». Recarga la pantalla.",
  ].join(" / "),
);
caso(
  "E3 lo devuelto se salda como un faltante: «Llegó la reposición» a mano y la reposición que llega en otra recepción; su plata todavía no (sin papel hasta la actividad 6b)",
  `${rolDeMicaela("recibir", "existencias", "proveedores")}
   ${DANADA("p1", "l1", 5, 3)}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.devuelve(:'p1', null, gen_random_uuid()) ->> 'diferencia_id' as x \\gset
   select pg_temp.e(pg_temp.resuelve(:'x', 'repuesta', 1, 'La trajo el chofer', null)) as mano \\gset
   select pg_temp.e(pg_temp.resuelve(:'x', 'saldo_a_favor', 1, null, null)) as plata \\gset
   reset role;
   select ${ESTADO("x")} as tras_mano \\gset
   -- Otro envío de la misma línea trae 2 de más: son la reposición de lo devuelto.
   ${ENVIA("d2", [["l1", 3]])}${ITEM("d2", "l1")}
   ${como(MICAELA)}${EN_TIENDA}
   ${ABRE("d2")}
   select pg_temp.e(${RECIBE("d2", A(LIN("di_l1", [V("vp_s", 5)], { sobr: "reposicion_faltante" })))}) as rec2 \\gset
   select pg_temp.debe(:'prov') as nd \\gset
   reset role;
   select concat_ws(' / ', :'mano', :'plata', :'tras_mano', :'rec2', ${ESTADO("x")},
     (select string_agg(r.forma || ':' || r.cantidad || ':' || coalesce((r.despacho_id = :'d2')::text, 'a mano'), ',' order by r.cantidad)
        from retail.proveedor_deuda_resoluciones r where r.diferencia_id = :'x'),
     (select d ->> 'estado' from jsonb_array_elements(:'nd'::jsonb -> 'cerradas') d where d ->> 'diferencia_id' = :'x'));`,
  [
    "OK",
    "P0001|nos_debe_sin_papel|Esas prendas no están en ningún comprobante con cupo: no se facturaron, así que no hay plata que pasar a saldo a favor. Si el proveedor las cobra después, regístralo y vuelve a intentarlo",
    "1/3",
    "OK",
    "3/3",
    "repuesta:1:a mano,repuesta:2:true",
    "saldada",
  ].join(" / "),
);
caso(
  "E4 reabrir el envío donde llegó dañada no apaga la deuda de lo devuelto (no es del conteo); lo que faltó en ese envío, sí",
  `${rolDeMicaela("recibir", "existencias")}
   ${ENVIA("d_p1", [["l1", 5]])}${ITEM("d_p1", "l1", "di_p1")}
   ${como(MICAELA)}${EN_TIENDA}
   ${ABRE("d_p1")}
   -- Llegan 4 de 5 (1 no vino) y 2 de las 4, dañadas.
   select pg_temp.e(${RECIBE("d_p1", A(LIN("di_p1", [VD("vp_s", 4, 2)], { falt: "no_vino" })))}) as rec \\gset
   reset role;
   select pd.id as p1 from retail.prendas_danadas pd join retail.despacho_recibidos r on r.movimiento_danada_id = pd.movimiento_entrada_id
    where r.despacho_id = :'d_p1' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(pg_temp.devuelve(:'p1', null, gen_random_uuid())) as dev \\gset
   reset role;
   select version as v_d_p1 from retail.despachos where id = :'d_p1' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.intento(format('select retail.reabrir_envio(%L, %s, %L, gen_random_uuid())', :'d_p1', :v_d_p1, 'Encontramos la que faltaba')) as reabre \\gset
   reset role;
   select concat_ws(' / ', :'rec', :'dev', :'reabre',
     (select string_agg(x.causa || ':' || x.vigente, ',' order by x.causa) from retail.despacho_diferencias x where x.despacho_id = :'d_p1'));`,
  "OK / OK / SIN_ERROR / devuelta:true,no_vino:false",
);
caso(
  "E6 dos tallas dañadas de la misma línea son dos deudas, que conviven con lo que no vino en esa línea; «Nos debe» las suma",
  `${rolDeMicaela("recibir", "existencias")}
   ${ENVIA("d_p", [["l1", 6]])}${ITEM("d_p", "l1", "di_p")}
   ${como(MICAELA)}${EN_TIENDA}
   ${ABRE("d_p")}
   -- Llegan 5 de 6 (1 no vino): 3 S (2 dañadas) y 2 M (1 dañada).
   select pg_temp.e(${RECIBE("d_p", A(LIN("di_p", [VD("vp_s", 3, 2), VD("vp_m", 2, 1)], { falt: "no_vino" })))}) as rec \\gset
   reset role;
   select (select pd.id from retail.prendas_danadas pd join retail.despacho_recibidos r on r.movimiento_danada_id = pd.movimiento_entrada_id
            where r.despacho_id = :'d_p' and r.variante_id = :'vp_s') as ps,
          (select pd.id from retail.prendas_danadas pd join retail.despacho_recibidos r on r.movimiento_danada_id = pd.movimiento_entrada_id
            where r.despacho_id = :'d_p' and r.variante_id = :'vp_m') as pm \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(pg_temp.devuelve(:'ps', null, gen_random_uuid())) as dev_s \\gset
   select pg_temp.e(pg_temp.devuelve(:'pm', null, gen_random_uuid())) as dev_m \\gset
   select pg_temp.debe(:'prov') as nd \\gset
   reset role;
   select concat_ws(' / ', :'rec', :'dev_s', :'dev_m',
     (select string_agg(x.causa || ':' || x.cantidad, ',' order by x.causa, x.cantidad) from retail.despacho_diferencias_vigentes x where x.despacho_id = :'d_p'),
     (:'nd'::jsonb ->> 'unidades') || ' por reponer');`,
  "OK / OK / OK / devuelta:1,devuelta:2,no_vino:1 / 4 por reponer",
);
caso(
  "E5 la tabla sola: la deuda de lo devuelto no nace sin la función con el envío cerrado, no nace sin su prenda, es una por prenda y no se edita",
  `${rolDeMicaela("recibir", "existencias")}
   ${DANADA("p1", "l1", 5, 2)}
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.devuelve(:'p1', null, gen_random_uuid()) ->> 'diferencia_id' as x \\gset
   reset role;
   select concat_ws(' / ',
     pg_temp.intento(format($q$insert into retail.despacho_diferencias (despacho_id, despacho_item_id, proveedor_id, categoria_id, tipo, causa, cantidad, costo_unitario, creado_por, prenda_danada_id)
       values (%L, %L, %L, %L, 'faltante', 'devuelta', 1, 20, %L, %L)$q$, :'d_p1', :'di_p1', :'prov', :'cat', :'micaela_p', :'p1')),
     pg_temp.intento(format($q$select set_config('retail.devolviendo_danada', 'si', true);
       insert into retail.despacho_diferencias (despacho_id, despacho_item_id, proveedor_id, categoria_id, tipo, causa, cantidad, costo_unitario, creado_por)
       values (%L, %L, %L, %L, 'faltante', 'devuelta', 1, 20, %L)$q$, :'d_p1', :'di_p1', :'prov', :'cat', :'micaela_p')),
     pg_temp.intento(format($q$select set_config('retail.devolviendo_danada', 'si', true);
       insert into retail.despacho_diferencias (despacho_id, despacho_item_id, proveedor_id, categoria_id, tipo, causa, cantidad, costo_unitario, creado_por, prenda_danada_id)
       values (%L, %L, %L, %L, 'faltante', 'devuelta', 1, 20, %L, %L)$q$, :'d_p1', :'di_p1', :'prov', :'cat', :'micaela_p', :'p1')),
     pg_temp.intento(format($q$update retail.despacho_diferencias set cantidad = 1 where id = %L$q$, :'x')));`,
  [
    "23514|recepcion_envio_no_abierto|Solo se anota lo que llegó de un envío abierto",
    "23514||new row for relation \"despacho_diferencias\" violates check constraint \"despacho_diferencias_devuelta_con_su_prenda\"",
    "23505||duplicate key value violates unique constraint \"despacho_diferencias_una_por_prenda\"",
    "42501|recepcion_inmutable|Lo que se recibió de un envío no se cambia ni se borra: queda como se cerró",
  ].join(" / "),
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

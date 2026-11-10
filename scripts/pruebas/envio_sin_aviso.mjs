#!/usr/bin/env node
/**
 * Pruebas del envío sin aviso (ADR-0393, actividad 4; decisiones 2 y 10 de Felipe, 2026-10-13) — migración
 * `20261013183000_envio_sin_aviso.sql` (y las de las actividades 2 a 4, que escriben lo que esta lee).
 *
 * LO QUE VIGILA. Que lo que llega sin orden de compra se reciba con el mismo conteo y los mismos pendientes que un envío de Compras: la
 * sede lo abre al llegar («¿de quién?»), cuenta por categoría y cierra. Como no hubo guía, nada falta ni sobra (no deja deudas). El costo
 * sigue ADR-0330: lo escribe solo quien ve el dinero de Compras, y lo que entra sin costo no toca el costo de la prenda.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK, con los candados diferidos revisados al final; las migraciones se cargan DOS
 * veces dentro de cada caso). Las personas son las de `pendientes_de_envio.mjs`.
 *   S  SIN AVISO: abrir (sede, proveedor, token, permisos); contar y cerrar sin costo; la regla del costo; el costo fuera de lo normal; lo pendiente se termina igual
 *      (la prenda nueva con el proveedor del envío); el formulario de la fase 4 no lo cierra, y se reabre sin freno.
 *   P  SIN PROVEEDOR (Felipe 2026-10-14): se abre y se cuenta sin saber de quién es; el cierre lo pide; se pone una sola vez y se pasa
 *      a lo contado; sus permisos.
 *   G  LA GUÍA AL CERRAR (Felipe 2026-10-14, `20261014205000`): se escribe o corrige con el envío abierto; la misma otra vez no cambia
 *      nada; vacía o larga no; en camino, sin responsable o sin Recibir no; deja su rastro y se cierra con la versión nueva.
 *   M  SIN MARCA (Felipe 2026-10-14): lo de fuera de la guía se cuenta sin marca, entra al stock así, la prenda nueva nace sin marca y el
 *      detalle del envío no pierde la fila; en un envío de Compras, lo de más sin marca deja su diferencia.
 *   Z  MODELOS EN 0 (Felipe 2026-11-03): un modelo agregado nace en 0, con descripción y nombre por defecto; se guarda, el nombre por defecto no
 *      deja cerrar lo contado, y lo que quedó en 0 se descarta sin dejar pendiente.
 *   W  CREAR LA PRENDA (Felipe 2026-11-03): al recibir, tejido y patrón son opcionales y lo creado no sale solo en la web, sin importar quién
 *      lo crea ni si un líder lo aprueba después. Nuevo producto sigue igual.
 *   A  LLEVAR AL STOCK AHORA (Felipe 2026-11-03): un modelo entra sin cerrar el envío; doble clic, otra versión, de más, otra prenda; lo que falta se mide al
 *      cierre final; se corrige mientras siga en el almacén; sin proveedor sale a nombre de «Por confirmar»; lo demás sigue por repartir.
 *   F  LA FORMA: permisos y RLS.
 *
 * USO
 *   node scripts/pruebas/envio_sin_aviso.mjs                                → contra el stack local compartido
 *   node scripts/pruebas/envio_sin_aviso.mjs --contenedor supabase_db_x     → contra otro stack (un banco de pruebas propio)
 *   node scripts/pruebas/envio_sin_aviso.mjs --sin-migracion                → sin cargar las migraciones: tiene que FALLAR
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
      // ADR-0393: la guía se corrige al cerrar.
      "20261014205000_corregir_guia_al_cerrar.sql",
      // ADR-0604 (act. 2026-11-03): modelos en 0, con descripción y nombre por defecto.
      "20261103182000_modelos_en_cero_al_contar.sql",
      // Un costo fuera de lo normal también pide confirmar sin aviso; lo que cuesta hoy cada prenda.
      "20261103222000_costo_fuera_de_lo_normal_sin_aviso.sql",
      // Un nombre pendiente no frena y sin nada contado no se cierra.
      "20261104000000_recepcion_cierre_sin_nombre_y_vacio.sql",
      // El proveedor se corrige, con rastro.
      "20261104001000_corregir_proveedor_de_envio_sin_aviso.sql",
      // Lo que se parece, en todas las marcas.
      "20261104002000_parecidas_al_recibir_en_todas_las_marcas.sql",
      // Crear la prenda: tejido y patrón opcionales, nada sale solo en la web.
      "20261104003000_prenda_al_recibir_sin_tela_ni_web.sql",
      // Un modelo sale a la venta sin cerrar el envío.
      "20261104005000_salida_anticipada_de_un_modelo.sql",
      "20261104012000_a_conector_y_correccion_no_es_perdida.sql",
      // Lo contado como nuevo pasa a su categoría de verdad, con el envío cerrado (casos S3f y S3g).
      "20261106230000_cambiar_categoria_de_lo_contado.sql",
      // Y a su marca de verdad (caso S3h).
      "20261107142000_cambiar_marca_de_lo_contado.sql",
      // Sin nada escrito, la galería de la categoría entera (caso S3e).
      "20261107183000_galeria_de_la_categoria_al_recibir.sql",
      // La talla o el color agregado por error se quita; lo que la prenda ya tenía, no (caso S3i).
      "20261107191000_quitar_combinacion_nacida_al_recibir.sql",
      // Cada línea es de su proveedor; el cierre lo pide por línea (casos P1, A8 y S5).
      "20261107192000_proveedor_por_linea_sin_aviso.sql",
      // Quien recibe pone el costo de lo que recibe, también en una terminal (casos S3 y S3c).
      "20261107194000_costo_al_recibir_para_quien_recibe.sql",
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
${atrapa("costos_hoy", "p_vars uuid[]", "retail.fn_costos_de_hoy(p_vars)")}
${atrapa("parecidas", "p_cat uuid, p_q text", "retail.fn_parecidas_para_recibir(p_cat, p_q)")}
${atrapa("corrige", "p_d uuid, p_prov uuid, p_motivo text", "retail.corregir_proveedor_envio(p_d, p_prov, p_motivo)")}
${atrapa("cambia_cat", "p_d uuid, p_pend uuid, p_cat uuid", "retail.cambiar_categoria_de_pendiente(p_d, p_pend, p_cat)")}
${atrapa("cambia_linea", "p_d uuid, p_pend uuid, p_cat uuid, p_marca uuid", "retail.cambiar_linea_de_pendiente(p_d, p_pend, p_cat, p_marca)")}
${atrapa("quitables", "p_d uuid", "retail.fn_combinaciones_quitables(p_d)")}
${atrapa("quita", "p_d uuid, p_vars uuid[]", "retail.quitar_combinaciones_al_recibir(p_d, p_vars)")}
${atrapa(
  "prepara",
  "p_d uuid, p_item uuid, p_cat uuid, p_marca uuid, p_prod uuid, p_ref text, p_vars jsonb, p_precio numeric, p_desc text, p_tej uuid, p_pat uuid, p_conf boolean, p_token uuid, p_prov uuid",
  "retail.preparar_prenda_al_recibir(p_d, p_item, p_cat, p_marca, p_prod, p_ref, p_vars, p_precio, p_desc, p_tej, p_pat, p_conf, p_token, p_prov)",
)}
${atrapa(
  "lleva",
  "p_d uuid, p_item uuid, p_extra integer, p_ver integer, p_prod uuid, p_vars jsonb, p_costo numeric, p_conf boolean, p_token uuid",
  "retail.llevar_al_stock_ahora(p_d, p_item, p_extra, p_ver, p_prod, p_vars, p_costo, p_conf, p_token)",
)}
${atrapa("corrige_salida", "p_id uuid, p_motivo text, p_token uuid", "retail.corregir_salida(p_id, p_motivo, p_token)")}
${atrapa("salidas", "p_d uuid", "retail.fn_salidas_del_envio(p_d)")}
${atrapa(
  "alta",
  "p_ref text, p_cat uuid, p_vars jsonb, p_tej uuid, p_pat uuid",
  "to_jsonb(retail.crear_producto_con_variantes(p_referencia => p_ref, p_categoria_id => p_cat, p_variantes => p_vars, p_tejido_id => p_tej, p_patron_id => p_pat))",
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
${atrapa("pone_marca", "p_d uuid, p_marca uuid, p_prov uuid", "retail.poner_proveedor_de_marca(p_d, p_marca, p_prov)")}
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

// S. SIN AVISO -----------------------------------------------------------------------------------------------------------
caso(
  "S1 abrir: en la sede y de un proveedor, abierto y sin líneas; el mismo token, el mismo envío; otra sede, proveedor inactivo, sin responsable o sin Recibir no",
  `${MICAELA_RECIBE}
   select gen_random_uuid() as tk \\gset
   ${SIN_AVISO("d", { token: ":'tk'" })}
   select pg_temp.sinaviso(:'tru', :'prov', 'G-77', null, :'tk') as otra_vez \\gset
   select pg_temp.h(pg_temp.sinaviso(:'tru', :'prov2', 'G-77', null, :'tk')) as otro_prov \\gset
   select pg_temp.h(pg_temp.sinaviso(:'lim', :'prov', null, null, gen_random_uuid())) as lima \\gset
   reset role;
   insert into retail.proveedores (nombre, activo) values ('Proveedor Inactivo Sin Aviso', false) returning id as prov_off \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.h(pg_temp.sinaviso(:'tru', :'prov_off', null, null, gen_random_uuid())) as inactivo \\gset
   ${SIN_ENCABEZADOS}
   select pg_temp.h(pg_temp.sinaviso(:'tru', :'prov', null, null, gen_random_uuid())) as sin_resp \\gset
   ${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select pg_temp.h(pg_temp.sinaviso(:'tru', :'prov', null, null, gen_random_uuid())) as sin_modulo \\gset
   ${rolDeMicaela("recibir")}${como(MICAELA)}${EN_TIENDA}
   select pg_temp.conteos(:'d') as c \\gset
   reset role;
   select concat_ws(' / ',
     concat_ws(':', (select estado from retail.despachos where id = :'d'), (select count(*) from retail.despacho_items where despacho_id = :'d'),
               :'c'::jsonb ->> 'origen', :'c'::jsonb -> 'proveedores' -> 0 ->> 'nombre', (select numero_guia from retail.despachos where id = :'d')),
     concat_ws(':', :'otra_vez'::jsonb ->> 'repetido', (:'otra_vez'::jsonb ->> 'despacho_id') = :'d'),
     :'otro_prov', :'lima', :'inactivo', :'sin_resp', :'sin_modulo');`,
  "abierto:0:sin_aviso:Proveedor Conteo Prueba:G-77 / true:t / recepcion_otros_datos / recibir_otra_sede / recepcion_proveedor / " +
    "responsable_requerido / recibir_sin_modulo",
);
caso(
  "S2 contar y cerrar: todo es «fuera de la guía» y nada sobra; entra sin costo y no toca el costo de la prenda; lo demás queda pendiente",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select ${EXTRA("d", "cat2", 3, SEP([["prod_g", 3, [V("pg_s", 3)]]]))} \\g /dev/null
   select ${EXTRA("d", "cat", 5, SEP([["prod_p", 2, [V("pv_s", 2)]]], [[1, "Chompa con lazo"]]))} \\g /dev/null
   ${VERS("d", [], [1, 2])}
   select ${CIERRA("d", [DEC(1), DEC(2)])} as r \\gset
   reset role;
   select concat_ws(' / ',
     concat_ws(':', :'r'::jsonb ->> 'unidades', :'r'::jsonb ->> 'contadas', :'r'::jsonb ->> 'por_detallar', :'r'::jsonb ->> 'faltan',
               :'r'::jsonb ->> 'sobran'),
     (select count(*) from retail.despacho_diferencias where despacho_id = :'d'),
     (select string_agg(coalesce(r.costo_unitario::text, 'sin costo'), ',') from retail.despacho_recibidos r where r.despacho_id = :'d'),
     ${COSTO("pg_s")}, ${COSTO("pv_s")}, ${STOCK_TRU("pg_s")}, ${STOCK_TRU("pv_s")},
     (select string_agg((l.proveedor_id = :'prov'::uuid)::text, ',') from retail.lotes l where l.despacho_id = :'d'),
     (select string_agg(x.tipo || '=' || x.cantidad, ',') from retail.despacho_pendientes x where x.despacho_id = :'d'),
     (select ${limpio("a.descripcion")} from retail.actividad a where a.registro_id = :'d'::text and a.accion = 'despacho_sin_aviso'));`,
  "5:8:3:0:0 / 0 / sin costo,sin costo / 12.00 / 25.00 / 3 / 2 / true / crear=1 / abrió ENV: llegó sin aviso de Proveedor Conteo Prueba",
);
caso(
  "S3 el costo: quien recibe lo escribe aunque no vea el dinero de Compras (también una terminal, 20261107194000), y promedia",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select ${EXTRA("d", "cat2", 3, SEP([["prod_g", 3, [V("pg_s", 3)]]]))} \\g /dev/null
   ${VERS("d", [], [1])}
   select pg_temp.e(${CIERRA("d", [DEC(1, { costo: 15 })])}) as micaela \\gset
   reset role;
   select concat_ws(' / ', :'micaela',
     (select string_agg(r.costo_unitario::text, ',') from retail.despacho_recibidos r where r.despacho_id = :'d'), ${COSTO("pg_s")});`,
  "OK / 15.00 / 15.00",
);
caso(
  "S3b un costo fuera de lo normal pide confirmar también sin aviso (la causa vacía no lo salta): sin confirmar no entra nada; confirmado, entra; sin costo, no pregunta",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select ${EXTRA("d", "cat2", 3, SEP([["prod_g", 3, [V("pg_s", 3)]]]))} \\g /dev/null
   ${VERS("d", [], [1])}
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   select pg_temp.e(${CIERRA("d", [DEC(1, { costo: 999 })])}) as sin_confirmar \\gset
   reset role;
   select (select count(*) from retail.despacho_recibidos r where r.despacho_id = :'d') as tras_rechazo, ${COSTO("pg_s")} as costo_igual \\gset
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   select pg_temp.e(${CIERRA("d", [DEC(1, { costo: 999, confirma: true })])}) as confirmado \\gset
   reset role;
   select concat_ws(' / ', :'sin_confirmar', :'tras_rechazo', :'costo_igual', :'confirmado',
     (select string_agg(r.costo_unitario::text, ',') from retail.despacho_recibidos r where r.despacho_id = :'d'),
     (select l.nota like '%Costo atípico confirmado%' from retail.lotes l where l.despacho_id = :'d'));`,
  "P0001|recepcion_costo_atipico|Hay un costo fuera de lo normal: revísalo y confírmalo para recibir / 0 / 12.00 / OK / 999.00 / t",
);
caso(
  "S3c lo que cuesta hoy cada prenda, para decirlo antes de cambiarlo: lo lee quien ve el dinero de Compras o quien recibe; quien no, no",
  `${MICAELA_RECIBE}
   select pg_temp.e(pg_temp.costos_hoy(array[:'pg_s'::uuid])) as recibe \\gset
   ${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(pg_temp.costos_hoy(array[:'pg_s'::uuid])) as micaela \\gset
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   select retail.fn_costos_de_hoy(array[:'pg_s'::uuid, :'pv_s'::uuid]) as sandra \\gset
   reset role;
   select concat_ws(' / ', :'recibe', :'micaela', :'sandra'::jsonb ->> :'pg_s', :'sandra'::jsonb ->> :'pv_s',
     has_function_privilege('anon', 'retail.fn_costos_de_hoy(uuid[])', 'execute'));`,
  "OK / 42501|sin_dinero_de_compras|Tu rol no ve el costo de lo que recibe / 12.00 / 25.00 / f",
);
caso(
  "S3d corregir el proveedor: solo quien ve el dinero, con motivo y a otro distinto; cambia envío, conteos, lote y recibido, sin tocar stock ni costo; queda en la Actividad",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select ${EXTRA("d", "cat2", 3, SEP([["prod_g", 3, [V("pg_s", 3)]]]))} \\g /dev/null
   ${VERS("d", [], [1])}
   select ${CIERRA("d", [DEC(1)])} as r \\gset
   select pg_temp.h(pg_temp.corrige(:'d', :'prov2', 'Era de otro')) as micaela \\gset
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   select pg_temp.h(pg_temp.corrige(:'d', :'prov2', 'x')) as sin_motivo \\gset
   select pg_temp.h(pg_temp.corrige(:'d', :'prov', 'Es el mismo')) as igual \\gset
   select pg_temp.e(pg_temp.corrige(:'d', :'prov2', 'Compras dijo que era de otro')) as bien \\gset
   reset role;
   select concat_ws(' / ', :'micaela', :'sin_motivo', :'igual', :'bien',
     (select s.proveedor_id = :'prov2'::uuid from retail.despachos_sin_aviso s where s.despacho_id = :'d'),
     (select bool_and(k.proveedor_id = :'prov2'::uuid) from retail.despacho_conteos k where k.despacho_id = :'d'),
     (select bool_and(l.proveedor_id = :'prov2'::uuid) from retail.lotes l where l.despacho_id = :'d'),
     (select bool_and(r.proveedor_id = :'prov2'::uuid) from retail.despacho_recibidos r where r.despacho_id = :'d'),
     ${STOCK_TRU("pg_s")}, ${COSTO("pg_s")},
     (select count(*) from retail.actividad a where a.registro_id = :'d'::text and a.accion = 'despacho_sin_aviso_proveedor_corregido'));`,
  "sin_dinero_de_compras / corregir_motivo / proveedor_igual / OK / t / t / t / t / 3 / 12.00 / 1",
);
caso(
  "S3d2 abierto sin proveedor y cerrado con el de su marca: se corrige el de sus líneas (y queda como el del envío)",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d", { prov: "null::uuid" })}
   select ${EXTRA("d", "cat2", 3, SEP([["prod_g", 3, [V("pg_s", 3)]]]))} \\g /dev/null
   ${VERS("d", [], [1])}
   select pg_temp.e(${CIERRA("d", [DEC(1)])}) as cierra \\gset
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   select pg_temp.e(pg_temp.corrige(:'d', :'prov2', 'Compras dijo que era de otro')) as bien \\gset
   reset role;
   select concat_ws(' / ', :'cierra', :'bien',
     (select s.proveedor_id = :'prov2'::uuid from retail.despachos_sin_aviso s where s.despacho_id = :'d'),
     (select bool_and(k.proveedor_id = :'prov2'::uuid) from retail.despacho_conteos k where k.despacho_id = :'d'),
     (select bool_and(l.proveedor_id = :'prov2'::uuid) from retail.lotes l where l.despacho_id = :'d'));`,
  "OK / OK / t / t / t",
);
// Lo contado en una categoría que no era: el modelo pasa a una línea de la correcta y lo contado se mueve con él, sin descuadrar nada (Felipe 2026-11-06).
const SIN_AVISO_CON_DOS_MODELOS = `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select ${EXTRA("d", "cat2", 5, SEP([], [[3, "Modelo Tres"], [2, "Modelo Dos"]]))} \\g /dev/null
   ${VERS("d", [], [1])}
   select ${CIERRA("d", [DEC(1)])} as r \\gset
   reset role;
   select id as pend3 from retail.despacho_pendientes where despacho_id = :'d' and descripcion = 'Modelo Tres' \\gset
   select id as pend2 from retail.despacho_pendientes where despacho_id = :'d' and descripcion = 'Modelo Dos' \\gset
   select id as cat_otra from retail.categorias where activo and id <> :'cat2'::uuid order by nombre limit 1 \\gset
   ${como(MICAELA)}${EN_TIENDA}`;
const LINEAS_DE = (d) =>
  `(select string_agg(concat_ws(':', k.extra_posicion, k.categoria_id = :'cat2'::uuid, k.contadas, jsonb_array_length(k.separado -> 'nuevas')), ',' order by k.extra_posicion)
      from retail.despacho_conteos k where k.despacho_id = :'${d}')`;
caso(
  "S3f pasar un modelo a su categoría: lo contado se mueve con él, el otro modelo se queda, cada línea cuadra, y la prenda de la categoría nueva ya se puede ligar; queda en la Actividad",
  `${SIN_AVISO_CON_DOS_MODELOS}
   select pg_temp.e(pg_temp.cambia_cat(:'d', :'pend3', :'cat_otra')) as cambio \\gset
   select pg_temp.e(pg_temp.cambia_cat(:'d', :'pend3', :'cat_otra')) as otra_vez \\gset
   reset role;
   select concat_ws(' / ', :'cambio', :'otra_vez',
     ${LINEAS_DE("d")},
     (select string_agg(x.descripcion || ':' || x.extra_posicion || ':' || x.tipo || ':' || x.cantidad, ',' order by x.extra_posicion) from retail.despacho_pendientes x where x.despacho_id = :'d'),
     (select string_agg(c.extra_posicion || ':' || c.en_pendientes || ':' || c.sin_separar, ',' order by c.extra_posicion) from retail.fn_envio_cuentas(array[:'d'::uuid]) c),
     (select sum(k.contadas) from retail.despacho_conteos k where k.despacho_id = :'d'),
     (select count(*) from retail.actividad a where a.registro_id = :'d'::text and a.accion = 'despacho_pendiente_categoria_cambiada'));`,
  "OK / OK / 1:t:2:1,2:f:3:1 / Modelo Dos:1:crear:2,Modelo Tres:2:crear:3 / 1:2:0,2:3:0 / 5 / 1",
);
caso(
  "S3g no se puede con el envío abierto ni con otra categoría inactiva, ni sin responsable, ni sin Recibir; los candados no dejan moverlo a mano; reabrir lo devuelve a la línea nueva",
  `${SIN_AVISO_CON_DOS_MODELOS}
   select pg_temp.h(pg_temp.cambia_cat(:'d', :'pend3', gen_random_uuid())) as sin_categoria \\gset
   ${como(MICAELA)}${SIN_ENCABEZADOS}
   select pg_temp.h(pg_temp.cambia_cat(:'d', :'pend3', :'cat_otra')) as sin_responsable \\gset
   reset role;
   select pg_temp.intento($q$update retail.despacho_pendientes set extra_posicion = 9 where id = '$q$ || :'pend3' || $q$'$q$) as a_mano \\gset
   select pg_temp.intento($q$update retail.despacho_conteos set contadas = 1 where despacho_id = '$q$ || :'d' || $q$'$q$) as conteo_a_mano \\gset
   ${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select pg_temp.h(pg_temp.cambia_cat(:'d', :'pend3', :'cat_otra')) as sin_modulo \\gset
   ${rolDeMicaela("recibir")}${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(pg_temp.cambia_cat(:'d', :'pend3', :'cat_otra')) as bien \\gset
   reset role;
   select version as ver from retail.despachos where id = :'d' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(pg_temp.reabre(:'d', :ver, 'Faltó contar otra cosa', gen_random_uuid())) as reabierto \\gset
   select pg_temp.h(pg_temp.cambia_cat(:'d', :'pend2', :'cat_otra')) as abierto \\gset
   reset role;
   select concat_ws(' / ', :'sin_categoria', :'sin_responsable', :'a_mano', :'conteo_a_mano', :'sin_modulo', :'bien', :'reabierto', :'abierto',
     (select k.separado -> 'nuevas' -> 0 ->> 'descripcion' from retail.despacho_conteos k where k.despacho_id = :'d' and k.categoria_id = :'cat_otra'::uuid));`,
  "recepcion_extra_categoria / responsable_requerido / 42501|Un pendiente no cambia: se resuelve, o se anula reabriendo el envío / 23514|Solo se cuenta un envío abierto / recibir_sin_modulo / OK / OK / categoria_envio_no_cerrado / Modelo Tres",
);
caso(
  "S3h pasar un modelo a otra marca (y a sin marca): lo contado se mueve, una marca inactiva no, y la de antes sigue llamando con la marca de su línea",
  `${SIN_AVISO_CON_DOS_MODELOS}
   reset role;
   select id as marca_otra from retail.marcas where activo and id <> :'marca'::uuid order by nombre limit 1 \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.h(pg_temp.cambia_linea(:'d', :'pend3', :'cat2', gen_random_uuid())) as marca_inactiva \\gset
   select pg_temp.e(pg_temp.cambia_linea(:'d', :'pend3', :'cat2', :'marca_otra')) as a_otra \\gset
   select pg_temp.e(pg_temp.cambia_linea(:'d', :'pend2', :'cat2', null)) as a_sin_marca \\gset
   select pg_temp.e(pg_temp.cambia_cat(:'d', :'pend3', :'cat_otra')) as vieja \\gset
   reset role;
   select concat_ws(' / ', :'marca_inactiva', :'a_otra', :'a_sin_marca', :'vieja',
     (select string_agg(concat_ws(':', k.extra_posicion, k.categoria_id = :'cat2'::uuid, coalesce((k.marca_id = :'marca_otra'::uuid)::text, 'sin'), k.contadas), ',' order by k.extra_posicion)
        from retail.despacho_conteos k where k.despacho_id = :'d'),
     (select sum(k.contadas) from retail.despacho_conteos k where k.despacho_id = :'d'),
     (select bool_and(c.sin_separar = 0) from retail.fn_envio_cuentas(array[:'d'::uuid]) c));`,
  "recepcion_marca / OK / OK / OK / 1:t:false:0,2:t:true:0,3:t:sin:2,4:f:true:3 / 5 / t",
);
caso(
  "S3e lo que se parece sale con cualquier marca y dice cuál; sin Recibir no se lee; sin nada escrito, toda la categoría y nada «coincide»",
  `${MICAELA_RECIBE}
   select retail.fn_parecidas_para_recibir(:'cat2', (select referencia from retail.productos where id = :'prod_g')) as r \\gset
   select (jsonb_array_length(retail.fn_parecidas_para_recibir(:'cat2', '  ')) > 0
           and not exists (select 1 from jsonb_array_elements(retail.fn_parecidas_para_recibir(:'cat2', '  ')) x where (x ->> 'coincide')::boolean)) as vacio \\gset
   ${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select pg_temp.h(pg_temp.parecidas(:'cat2', 'x')) as sin_modulo \\gset
   reset role;
   select concat_ws(' / ', :'r'::jsonb -> 0 ->> 'coincide', (:'r'::jsonb -> 0 -> 'marca' ->> 'id') = :'marca', :'vacio', :'sin_modulo');`,
  "true / t / t / recibir_sin_modulo",
);
caso(
  "S3i lo agregado en el envío se quita (también lo reactivado); lo que la prenda ya tenía, lo repartido y la última no; todo o nada, y dos veces no es error",
  `${BASE_D1}
   reset role;
   select codigo as c2 from retail.colores where activo and codigo <> :'c1' order by orden, codigo limit 1 \\gset
   select id as t_l from retail.tallas where valor = 'L' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   -- A una prenda que ya existía se le suma un color (nace aquí) y la talla L que estaba desactivada (se reactiva aquí).
   select pg_temp.prepara(:'d1', :'di_l1', null, null, :'prod_p', null, ${MATRIZ(["t_s", "c2"], ["t_l", "c1"])}, null, null, null, null, false, gen_random_uuid(), null) as mas \\gset
   reset role;
   select id as p_c2 from retail.variantes where producto_id = :'prod_p' and color_codigo = :'c2' \\gset
   select id as p_l from retail.variantes where producto_id = :'prod_p' and talla_id = :'t_l' \\gset
   select id as p_s from retail.variantes where producto_id = :'prod_p' and talla_id = :'t_s' and color_codigo = :'c1' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select jsonb_array_length(pg_temp.quitables(:'d1')) as antes \\gset
   select pg_temp.h(pg_temp.quita(:'d1', array[:'p_s'::uuid])) as ya_era \\gset
   -- La nueva tiene dos tallas: la segunda sería la última, y nada se quita.
   select pg_temp.h(pg_temp.quita(:'d1', array[:'v_s'::uuid, :'v_m'::uuid])) as ultima \\gset
   select pg_temp.e(pg_temp.quita(:'d1', array[:'p_c2'::uuid, :'p_l'::uuid])) as bien \\gset
   select (pg_temp.quita(:'d1', array[:'p_c2'::uuid])) ->> 'quitadas' as otra_vez \\gset
   select ${GUARDA("d1", "di_l1", 3, SEP([["prod_n", 3, [V("v_s", 3)]]]))} \\g /dev/null
   select pg_temp.h(pg_temp.quita(:'d1', array[:'v_s'::uuid])) as repartida \\gset
   reset role;
   select concat_ws(' / ', :'antes', :'ya_era', :'ultima', :'bien', :'otra_vez', :'repartida',
     (select string_agg(v.activo::text, ',' order by v.id = :'p_c2'::uuid desc) from retail.variantes v where v.id in (:'p_c2', :'p_l')),
     (select count(*) from retail.variantes v where v.id in (:'v_s', :'v_m') and v.activo),
     (select count(*) from retail.actividad a where a.accion = 'despacho_combinacion_quitada' and a.registro_id = :'d1'));`,
  "4 / combinacion_no_nacio_aqui / combinacion_ultima / OK / 0 / combinacion_repartida / false,false / 2 / 1",
);
caso(
  "S4 lo pendiente se termina igual: la prenda nueva se crea con el proveedor del envío y entra sin costo",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select ${EXTRA("d", "cat", 4, SEP([], [[4, "Chompa nueva"]]))} \\g /dev/null
   ${VERS("d", [], [1])}
   select ${CIERRA("d", [DEC(1)])} \\g /dev/null
   reset role;
   select id as pend from retail.despacho_pendientes where despacho_id = :'d' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.prepara(:'d', null, :'cat', :'marca', null, 'Chompa Sin Aviso Conteo', ${MATRIZ(["t_s", "c1"])}, 89.90, null, null, null, false, gen_random_uuid(), null) as prep \\gset
   select (:'prep'::jsonb -> 'variantes' -> 0 ->> 'id') as v_sa \\gset
   reset role;
   select producto_id as prod_sa from retail.variantes where id = :'v_sa' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select ${RESUELVE("d", 1, "pend", SEP([["prod_sa", 4, [V("v_sa", 4)]]]))} as r \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'prep'::jsonb),
     (select pr.proveedor_id = :'prov' from retail.productos pr where pr.id = :'prod_sa'),
     :'r'::jsonb ->> 'entraron', (select estado from retail.despacho_pendientes where id = :'pend'), ${STOCK_TRU("v_sa")},
     (select coalesce(string_agg(coalesce(r.costo_unitario::text, 'sin costo'), ','), '-') from retail.despacho_recibidos r where r.pendiente_id = :'pend'));`,
  "OK / t / 4 / resuelto / 4 / sin costo",
);
caso(
  "S5 el formulario de la fase 4 no cierra un envío sin aviso; se reabre sin freno (no deja deudas) y se vuelve a cerrar",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select ${EXTRA("d", "cat2", 2, SEP([["prod_g", 2, [V("pg_s", 2)]]]))} \\g /dev/null
   select pg_temp.e(pg_temp.recibe(:'d', :v_d, '[]'::jsonb, ${A(J({ categoria_id: ":'cat2'", marca_id: ":'marca'", costo_unitario: "null::numeric", variantes: A(V("pg_s", 2)), sobrante_causa: "'regalo'" }))}, null, null)) as fase4 \\gset
   ${VERS("d", [], [1])}
   select ${CIERRA("d", [DEC(1)])} \\g /dev/null
   ${VER("d")}
   select pg_temp.e(${REABRE("d", "Llegó otra bolsa")}) as reabre \\gset
   select ${EXTRA("d", "cat2", 3, SEP([["prod_g", 1, [V("pg_s", 1)]]]), "1")} \\g /dev/null
   ${VERS("d", [], [1])}
   ${VER("d")}
   select ${CIERRA("d", [DEC(1)])} as r \\gset
   reset role;
   select concat_ws(' / ', :'fase4', :'reabre', :'r'::jsonb ->> 'unidades', :'r'::jsonb ->> 'sobran', ${STOCK_TRU("pg_s")},
     (select count(*) from retail.despacho_diferencias where despacho_id = :'d'));`,
  "P0001|envio_sin_aviso|Este envío llegó sin aviso: ciérralo desde el conteo / OK / 3 / 0 / 3 / 0",
);
// P. SIN PROVEEDOR -------------------------------------------------------------------------------------------------------
caso(
  "P1 sin proveedor: se abre y se cuenta; una línea puede traer el suyo; el cierre pide el que falta; se pone una sola vez (el mismo, otra vez, no hace nada) y entra con su lote",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d", { prov: "null::uuid" })}
   reset role;
   -- La marca de la prueba con DOS proveedores: así no se adivina de quién es lo contado (20261107192000).
   insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov2') on conflict do nothing;
   ${como(MICAELA)}${EN_TIENDA}
   select ${EXTRA("d", "cat2", 3, SEP([["prod_g", 3, [V("pg_s", 3)]]]))} \\g /dev/null
   select pg_temp.h(pg_temp.guarda(:'d', null, 1, ${VACIO}, null::int, null::int, :'prov', :'cat', :'marca')) as con_prov \\gset
   select pg_temp.conteos(:'d') as c \\gset
   ${VERS("d", [], [1, 2])}
   select pg_temp.h(${CIERRA("d", [DEC(1), DEC(2)])}) as sin_prov \\gset
   select pg_temp.e(pg_temp.pone(:'d', :'prov')) as pone \\gset
   select pg_temp.pone(:'d', :'prov') ->> 'repetido' as otra_vez \\gset
   select pg_temp.h(pg_temp.pone(:'d', :'prov2')) as otro \\gset
   select pg_temp.e(${CIERRA("d", [DEC(1), DEC(2)])}) as cierra \\gset
   reset role;
   select concat_ws(' / ',
     concat_ws(':', :'c'::jsonb ->> 'proveedor_por_confirmar', jsonb_array_length(:'c'::jsonb -> 'proveedores')),
     :'con_prov', :'sin_prov', :'pone', :'otra_vez', :'otro', :'cierra',
     (select string_agg((l.proveedor_id = :'prov'::uuid)::text, ',') from retail.lotes l where l.despacho_id = :'d'),
     (select string_agg((k.proveedor_id = :'prov'::uuid)::text, ',') from retail.despacho_conteos k where k.despacho_id = :'d'),
     ${STOCK_TRU("pg_s")},
     (select ${limpio("a.descripcion")} from retail.actividad a where a.registro_id = :'d'::text and a.accion = 'despacho_sin_aviso'));`,
  "true:1 / OK / envio_sin_proveedor / OK / true / envio_proveedor_puesto / OK / true / true,true / 3 / " +
    "abrió ENV: llegó sin aviso (cada marca con su proveedor)",
);
caso(
  "S5 un envío sin aviso de dos proveedores: la marca dice de quién es, otro se puede elegir, lo sin marca se pone antes de cerrar y cada uno entra con su lote",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d", { prov: "null::uuid" })}
   -- Miramhe-like: la marca de la prueba tiene un solo proveedor (:prov), así que lo suyo es de él sin decirlo.
   select pg_temp.e(pg_temp.guarda(:'d', null, 3, ${SEP([["prod_p", 3, [V("pv_s", 3)]]])}, null::int, null::int, null::uuid, :'cat', :'marca')) as por_marca \\gset
   -- Otro modelo de la misma marca, que llegó de otro proveedor: se puede elegir.
   select pg_temp.e(pg_temp.guarda(:'d', null, 1, ${VACIO}, null::int, null::int, :'prov2', :'cat2', :'marca')) as elegido \\gset
   -- Lo sin marca no se puede saber.
   select pg_temp.e(pg_temp.guarda(:'d', null, 2, ${VACIO}, null::int, null::int, null::uuid, :'cat2', null::uuid)) as sin_marca \\gset
   select pg_temp.conteos(:'d') as c \\gset
   ${VERS("d", [], [1, 2, 3])}
   select pg_temp.e(${CIERRA("d", [DEC(1), DEC(2), DEC(3)])}) as falta \\gset
   select pg_temp.h(pg_temp.pone_marca(:'d', null, gen_random_uuid())) as inactivo \\gset
   select pg_temp.e(pg_temp.pone_marca(:'d', null, :'prov2')) as pone \\gset
   ${VERS("d", [], [1, 2, 3])}
   select pg_temp.e(${CIERRA("d", [DEC(1), DEC(2), DEC(3)])}) as cierra \\gset
   select pg_temp.h(pg_temp.pone_marca(:'d', null, :'prov')) as cerrado \\gset
   reset role;
   select concat_ws(' / ', :'por_marca', :'elegido', :'sin_marca',
     concat_ws(':', :'c'::jsonb ->> 'proveedor_por_confirmar', jsonb_array_length(:'c'::jsonb -> 'proveedores')),
     regexp_replace(:'falta', '^.*Falta de quién llegó ([^:]*):.*$', '\\1'), :'inactivo', :'pone', :'cierra', :'cerrado',
     (select string_agg(case k.proveedor_id when :'prov'::uuid then 'uno' when :'prov2'::uuid then 'dos' else 'nadie' end, ',' order by k.extra_posicion)
        from retail.despacho_conteos k where k.despacho_id = :'d'),
     (select count(*) from retail.lotes l where l.despacho_id = :'d' and l.proveedor_id = :'prov'),
     (select s.proveedor_id is null from retail.despachos_sin_aviso s where s.despacho_id = :'d'),
     (select count(*) from retail.actividad a where a.registro_id = :'d'::text and a.accion = 'despacho_sin_aviso_proveedor_de_marca'));`,
  "OK / OK / OK / true:2 / lo sin marca / recepcion_proveedor / OK / OK / envio_no_abierto / uno,dos,dos / 1 / t / 1",
);
caso(
  "P2 poner el proveedor: no a un envío de Compras, sin responsable, uno inactivo ni sin Recibir; nada queda puesto",
  `${ENVIA("d1", [["l1", 10]])}${MICAELA_RECIBE}${ABRE("d1")}
   select pg_temp.h(pg_temp.pone(:'d1', :'prov')) as de_compras \\gset
   ${SIN_AVISO("d", { prov: "null::uuid" })}
   ${SIN_ENCABEZADOS}
   select pg_temp.h(pg_temp.pone(:'d', :'prov')) as sin_resp \\gset
   reset role;
   insert into retail.proveedores (nombre, activo) values ('Proveedor Inactivo Poner', false) returning id as prov_off \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.h(pg_temp.pone(:'d', :'prov_off')) as inactivo \\gset
   ${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select pg_temp.h(pg_temp.pone(:'d', :'prov')) as sin_modulo \\gset
   reset role;
   select concat_ws(' / ', :'de_compras', :'sin_resp', :'inactivo', :'sin_modulo',
     (select coalesce(proveedor_id::text, 'vacío') from retail.despachos_sin_aviso where despacho_id = :'d'));`,
  "envio_no_es_sin_aviso / responsable_requerido / recepcion_proveedor / recibir_sin_modulo / vacío",
);

// G. LA GUÍA AL CERRAR ---------------------------------------------------------------------------------------------------
caso(
  "G1 corregir la guía: con el envío abierto; la misma otra vez no cambia nada; vacía o larga no; se cierra con la versión nueva; cerrado no",
  `${ENVIA("d1", [["l1", 10]])}${ITEM("d1", "l1")}${MICAELA_RECIBE}${ABRE("d1")}
   select pg_temp.guia(:'d1', 'T001-555') as g \\gset
   select pg_temp.guia(:'d1', 'T001-555') ->> 'repetido' as otra \\gset
   select pg_temp.h(pg_temp.guia(:'d1', '   ')) as vacia \\gset
   select pg_temp.h(pg_temp.guia(:'d1', repeat('x', 41))) as larga \\gset
   select (:'g'::jsonb ->> 'version')::int as v_d1 \\gset
   select ${GUARDA("d1", "di_l1", 10)} \\g /dev/null
   ${VERS("d1", ["l1"])}
   select pg_temp.e(${CIERRA("d1", [DEC("l1")])}) as cierra \\gset
   select pg_temp.h(pg_temp.guia(:'d1', 'T001-999')) as cerrado \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'g'::jsonb), :'otra', :'vacia', :'larga', :'cierra', :'cerrado',
     (select numero_guia from retail.despachos where id = :'d1'),
     (select ${limpio("a.descripcion")} from retail.actividad a where a.registro_id = :'d1'::text and a.accion = 'despacho_guia'));`,
  "OK / true / recepcion_guia / recepcion_guia / OK / envio_no_abierto / T001-555 / corrigió la guía de ENV: T001-88 → T001-555",
);
caso(
  "G2 la guía no se corrige en camino, sin responsable ni sin Recibir; nada cambia",
  `${ENVIA("d1", [["l1", 10]])}${MICAELA_RECIBE}
   select pg_temp.h(pg_temp.guia(:'d1', 'T001-1')) as en_camino \\gset
   ${ABRE("d1")}
   ${SIN_ENCABEZADOS}
   select pg_temp.h(pg_temp.guia(:'d1', 'T001-1')) as sin_resp \\gset
   ${rolDeMicaela("existencias")}${como(MICAELA)}${EN_TIENDA}
   select pg_temp.h(pg_temp.guia(:'d1', 'T001-1')) as sin_modulo \\gset
   reset role;
   select concat_ws(' / ', :'en_camino', :'sin_resp', :'sin_modulo', (select numero_guia from retail.despachos where id = :'d1'));`,
  "envio_no_abierto / responsable_requerido / recibir_sin_modulo / T001-88",
);

// Z. MODELOS EN 0 --------------------------------------------------------------------------------------------------------
const NUEVA = (cantidad, nombre, extra = {}) => ({ cantidad, descripcion: nombre, ...extra });
const SEPJ = (nuevas, prendas = []) => `'${JSON.stringify({ prendas, nuevas }).replaceAll("'", "''")}'::jsonb`;
caso(
  "Z1 un modelo en 0 se guarda con su descripción y su nombre por defecto; sin nombre no; la nota larga no; lo negativo no; y no suma a lo contado",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select pg_temp.guarda(:'d', null, 0, ${SEPJ([NUEVA(0, "Chompa 1", { por_defecto: true, nota: "  cuello alto  " }), NUEVA(0, "Chompa Luna")])}, null::int, null::int, null::uuid, :'cat', :'marca') as g \\gset
   select pg_temp.e(:'g'::jsonb) as bien \\gset
   select pg_temp.h(pg_temp.guarda(:'d', null, 0, ${SEPJ([NUEVA(0, null)])}, null::int, null::int, null::uuid, :'cat', :'marca')) as sin_nombre \\gset
   select pg_temp.h(pg_temp.guarda(:'d', null, 1, ${SEPJ([NUEVA(1, null, { por_defecto: true })])}, null::int, null::int, null::uuid, :'cat', :'marca')) as defecto_sin_nombre \\gset
   select pg_temp.h(pg_temp.guarda(:'d', null, 0, ${SEPJ([NUEVA(0, "Larga", { nota: "x".repeat(201) })])}, null::int, null::int, null::uuid, :'cat', :'marca')) as nota_larga \\gset
   select pg_temp.h(pg_temp.guarda(:'d', null, 1, ${SEPJ([NUEVA(-1, "Negativa")])}, null::int, null::int, null::uuid, :'cat', :'marca')) as negativa \\gset
   reset role;
   select concat_ws(' / ', :'bien', :'sin_nombre', :'defecto_sin_nombre', :'nota_larga', :'negativa',
     (select concat_ws(':', k.contadas, retail.fn_envio_total_separado(k.separado), k.separado -> 'nuevas' -> 0 ->> 'descripcion', k.separado -> 'nuevas' -> 0 ->> 'nota',
                       k.separado -> 'nuevas' -> 0 ->> 'por_defecto', k.separado -> 'nuevas' -> 1 ->> 'descripcion', coalesce(k.separado -> 'nuevas' -> 1 ->> 'por_defecto', 'sin marca'))
        from retail.despacho_conteos k where k.despacho_id = :'d'));`,
  "OK / conteo_cantidad / conteo_cantidad / conteo_nueva_descripcion / conteo_cantidad / 0:0:Chompa 1:cuello alto:true:Chompa Luna:sin marca",
);
caso(
  "Z2 un modelo contado con nombre por defecto cierra y queda pendiente de crear; lo que quedó en 0 no deja rastro",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select pg_temp.guarda(:'d', null, 2, ${SEPJ([NUEVA(2, "Chompa 1", { por_defecto: true }), NUEVA(0, "Chompa 2", { por_defecto: true }), NUEVA(0, "Chompa Sol")])}, null::int, null::int, null::uuid, :'cat', :'marca') \\g /dev/null
   ${VERS("d", [], [1])}
   select ${CIERRA("d", [DEC(1)])} as r \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb),
     (select string_agg(x.tipo || '=' || x.cantidad || '=' || x.descripcion, ',' order by x.descripcion) from retail.despacho_pendientes x where x.despacho_id = :'d'),
     (select estado from retail.despachos where id = :'d'),
     (select count(*) from retail.despacho_recibidos r where r.despacho_id = :'d'));`,
  "OK / crear=2=Chompa 1 / cerrado / 0",
);
caso(
  "Z2b sin aviso y con todo en 0 no se cierra: se cuenta o se cancela; nada se escribe",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select pg_temp.guarda(:'d', null, 0, ${SEPJ([NUEVA(0, "Chompa Sol")])}, null::int, null::int, null::uuid, :'cat', :'marca') \\g /dev/null
   ${VERS("d", [], [1])}
   select pg_temp.e(${CIERRA("d", [DEC(1)])}) as vacio \\gset
   reset role;
   select concat_ws(' / ', :'vacio', (select estado from retail.despachos where id = :'d'), (select count(*) from retail.despacho_cierres c where c.despacho_id = :'d'));`,
  "P0001|envio_vacio|No contaste nada: cuenta lo que llegó o cancela la recepción / abierto / 0",
);
caso(
  "Z3 una prenda del catálogo en 0 se guarda y no deja pendiente; un envío con todo en 0 con nombre por defecto no frena por el nombre",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select pg_temp.e(pg_temp.guarda(:'d', null, 0, jsonb_build_object('prendas', jsonb_build_array(jsonb_build_object('producto_id', :'prod_p'::uuid, 'cantidad', 0)), 'nuevas', ${SEPJ([NUEVA(0, "Chompa 1", { por_defecto: true })])} -> 'nuevas'), null::int, null::int, null::uuid, :'cat', :'marca')) as en_cero \\gset
   select pg_temp.e(pg_temp.guarda(:'d', null, 3, jsonb_build_object('prendas', jsonb_build_array(jsonb_build_object('producto_id', :'prod_p'::uuid, 'cantidad', 0)), 'nuevas', ${SEPJ([NUEVA(3, "Chompa Sol")])} -> 'nuevas'), null::int, 1::int, null::uuid, null::uuid, null::uuid)) as contado \\gset
   ${VERS("d", [], [1])}
   select ${CIERRA("d", [DEC(1)])} as r \\gset
   reset role;
   select concat_ws(' / ', :'en_cero', :'contado', pg_temp.e(:'r'::jsonb),
     (select string_agg(x.tipo || '=' || x.cantidad, ',') from retail.despacho_pendientes x where x.despacho_id = :'d'));`,
  "OK / OK / OK / crear=3",
);

caso(
  "Z4 hasta 500 modelos por línea: lo que cuesta guardar tiene techo aunque esté en 0",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select pg_temp.e(pg_temp.guarda(:'d', null, 0, jsonb_build_object('prendas', '[]'::jsonb, 'nuevas', (select jsonb_agg(jsonb_build_object('cantidad', 0, 'descripcion', 'M' || i)) from generate_series(1, 500) i)), null::int, null::int, null::uuid, :'cat', :'marca')) as caben \\gset
   select pg_temp.h(pg_temp.guarda(:'d', null, 0, jsonb_build_object('prendas', '[]'::jsonb, 'nuevas', (select jsonb_agg(jsonb_build_object('cantidad', 0, 'descripcion', 'M' || i)) from generate_series(1, 501) i)), null::int, 1::int, null::uuid, null::uuid, null::uuid)) as demasiados \\gset
   reset role;
   select concat_ws(' / ', :'caben', :'demasiados');`,
  "OK / conteo_separado",
);

// M. SIN MARCA ----------------------------------------------------------------------------------------------------------
caso(
  "M1 sin marca: se cuenta y entra al stock sin marca; una prenda con marca no es de esa línea; la nueva nace sin marca; el detalle la muestra",
  `reset role;
   insert into retail.productos (categoria_id, referencia) values (:'cat2', 'Gorro Sin Marca Conteo') returning id as prod_sm \\gset
   insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo) values (:'prod_sm', :'t_s', :'c1', 29.90, 10)
     returning id as sm_s \\gset
   ${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select pg_temp.e(pg_temp.guarda(:'d', null, 4, ${SEP([["prod_sm", 2, [V("sm_s", 2)]]], [[2, "Gorro tejido"]])}, null::int, null::int, null::uuid, :'cat2', null::uuid)) as guarda \\gset
   select pg_temp.h(pg_temp.guarda(:'d', null, 1, ${SEP([["prod_g", 1]])}, null::int, null::int, null::uuid, :'cat2', null::uuid)) as ajena \\gset
   ${VERS("d", [], [1])}
   select pg_temp.e(${CIERRA("d", [DEC(1)])}) as cierra \\gset
   reset role;
   select id as pend from retail.despacho_pendientes where despacho_id = :'d' and tipo = 'crear' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.prepara(:'d', null, :'cat2', null, null, 'Gorro Tejido Sin Marca', ${MATRIZ(["t_s", "c1"])}, 35.00, null, null, null, false, gen_random_uuid(), null) as prep \\gset
   select (:'prep'::jsonb -> 'variantes' -> 0 ->> 'id') as v_nm \\gset
   reset role;
   select producto_id as prod_nm from retail.variantes where id = :'v_nm' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(${RESUELVE("d", 1, "pend", SEP([["prod_nm", 2, [V("v_nm", 2)]]]))}) as resuelve \\gset
   select pg_temp.detalle(:'d') as det \\gset
   reset role;
   select concat_ws(' / ', :'guarda', :'ajena', :'cierra', pg_temp.e(:'prep'::jsonb),
     (select coalesce(pr.marca_id::text, 'sin marca') || ':' || (pr.proveedor_id = :'prov')::text from retail.productos pr where pr.id = :'prod_nm'),
     :'resuelve', (select estado from retail.despacho_pendientes where id = :'pend'),
     ${STOCK_TRU("sm_s")}, ${STOCK_TRU("v_nm")},
     (select count(*) || ':' || count(*) filter (where r.marca_id is null) from retail.despacho_recibidos r where r.despacho_id = :'d'),
     (select count(*) || ':' || count(*) filter (where x -> 'marca' = 'null'::jsonb) from jsonb_array_elements(:'det'::jsonb -> 'recibidos') x));`,
  "OK / conteo_prenda_ajena / OK / OK / sin marca:true / OK / resuelto / 2 / 2 / 2:2 / 2:2",
);
caso(
  "M2 en un envío de Compras, lo que no estaba en la guía puede venir sin marca: su sobrante queda anotado con su causa",
  `${BASE_D1}
   select ${GUARDA("d1", "di_l1", 10)} \\g /dev/null
   select ${GUARDA("d1", "di_l2", 4)} \\g /dev/null
   select pg_temp.e(pg_temp.guarda(:'d1', null, 2, ${VACIO}, null::int, null::int, null::uuid, :'cat2', null::uuid)) as extra \\gset
   ${VERS("d1", ["l1", "l2"], [1])}
   select pg_temp.e(${CIERRA("d1", [DEC("l1"), DEC("l2"), DEC(1, { sobr: "regalo", costo: 10 })])}) as cierra \\gset
   reset role;
   select concat_ws(' / ', :'extra', :'cierra',
     (select count(*) from retail.despacho_diferencias x where x.despacho_id = :'d1' and x.marca_id is null and x.vigente and x.tipo = 'sobrante' and x.causa = 'regalo'));`,
  "OK / OK / 1",
);
// Una categoría de Indumentaria, la familia que exige tejido y patrón en Nuevo producto.
const CON_TELA = `reset role;
   insert into retail.categorias (nombre, familia) values ('Polos Conteo', 'indumentaria') returning id as cat3 \\gset
   insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat3', :'t_s');
   select id as tej from retail.tejidos where activo order by nombre limit 1 \\gset
   select id as pat from retail.patrones where activo order by nombre limit 1 \\gset
   insert into retail.categoria_tejidos (categoria_id, tejido_id) values (:'cat3', :'tej');
   insert into retail.categoria_patrones (categoria_id, patron_id) values (:'cat3', :'pat');
`;
const LA_PRENDA = (prep) => `(select v.producto_id from retail.variantes v where v.id = (:'${prep}'::jsonb -> 'variantes' -> 0 ->> 'id')::uuid)`;
caso(
  "W1 al recibir, en una familia que los exige, tejido y patrón son opcionales; el elegido se guarda igual",
  `${CON_TELA}
   ${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select pg_temp.prepara(:'d', null, :'cat3', null, null, 'Polo Sin Tela Conteo', ${MATRIZ(["t_s", "c1"])}, 49.90, null, null, null, false, gen_random_uuid(), null) as sin \\gset
   select pg_temp.prepara(:'d', null, :'cat3', null, null, 'Polo Con Tela Conteo', ${MATRIZ(["t_s", "c1"])}, 49.90, null, :'tej', :'pat', false, gen_random_uuid(), null) as con \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'sin'::jsonb), pg_temp.e(:'con'::jsonb),
     (select (tejido_id is null) || ':' || (patron_id is null) from retail.productos where id = ${LA_PRENDA("sin")}),
     (select (tejido_id = :'tej') || ':' || (patron_id = :'pat') from retail.productos where id = ${LA_PRENDA("con")}));`,
  "OK / OK / true:true / true:true",
);
caso(
  "W2 lo creado al recibir no sale solo en la web: lo cree quien lo cree, y aunque un líder lo apruebe después; la bandera no queda puesta",
  `${CON_TELA}
   ${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select pg_temp.prepara(:'d', null, :'cat3', null, null, 'Polo De Micaela Conteo', ${MATRIZ(["t_s", "c1"])}, 49.90, null, null, null, false, gen_random_uuid(), null) as mica \\gset
   reset role;
   select id as p_mica, estado_alta as alta_mica from retail.productos where id = ${LA_PRENDA("mica")} \\gset
   ${como(FELIPE)}
   select set_config('request.headers', json_build_object('x-responsable', :'felipe_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null
   update retail.productos set estado_alta = 'aprobado' where id = :'p_mica';
   select pg_temp.prepara(:'d', null, :'cat3', null, null, 'Polo De Lider Conteo', ${MATRIZ(["t_s", "c1"])}, 49.90, null, null, null, false, gen_random_uuid(), null) as lider \\gset
   select coalesce(current_setting('retail.alta_al_recibir', true), '') as bandera \\gset
   reset role;
   select concat_ws(' / ', :'alta_mica', pg_temp.e(:'lider'::jsonb), nullif(:'bandera', ''),
     (select publicado from retail.vitrina_productos where producto_id = :'p_mica'),
     (select v.publicado from retail.vitrina_productos v where v.producto_id = ${LA_PRENDA("lider")}));`,
  "pendiente / OK / f / f",
);
caso(
  "W3 Nuevo producto sigue igual: sin tejido no se crea, y lo que crea un líder se muestra en la web",
  `${CON_TELA}
   ${como(FELIPE)}
   select set_config('request.headers', json_build_object('x-responsable', :'felipe_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null
   select pg_temp.h(pg_temp.alta('Polo Alta Sin Tela', :'cat3', ${A(J({ talla_id: ":'t_s'", color_codigo: ":'c1'", precio: "49.90" }))}, null, null)) as sin_tela \\gset
   select pg_temp.alta('Polo Alta Con Tela', :'cat3', ${A(J({ talla_id: ":'t_s'", color_codigo: ":'c1'", precio: "49.90" }))}, :'tej', :'pat') as con_tela \\gset
   reset role;
   select concat_ws(' / ', :'sin_tela',
     (select v.publicado from retail.vitrina_productos v join retail.productos p on p.id = v.producto_id where p.referencia = 'Polo Alta con Tela'));`,
  "tejido_obligatorio / t",
);
caso(
  "W4 «a» es un conector si le sigue otra palabra: «Polo a Rayas», «A Rayas» y «Blusa A»; corregir una tanda no es pérdida",
  `reset role;
   select concat_ws(' / ', retail.fn_titulo_referencia('polo a rayas'), retail.fn_titulo_referencia('a rayas'), retail.fn_titulo_referencia('blusa a'), retail.fn_es_perdida('salida', 'correccion_recepcion', 1));`,
  "Polo a Rayas / A Rayas / Blusa A / f",
);
// Un envío sin aviso con una prenda del catálogo contada: 10, de ellas 4 repartidas en S.
const CON_PRENDA = `${MICAELA_RECIBE}
   ${SIN_AVISO("d")}
   select pg_temp.e(pg_temp.guarda(:'d', null, 10, ${SEP([["prod_p", 10]])}, null::int, null::int, null::uuid, :'cat', :'marca')) as g \\gset
   reset role;
   select k.version as ver, k.extra_posicion as extra from retail.despacho_conteos k where k.despacho_id = :'d' \\gset
   select coalesce((select cantidad from retail.stock where variante_id = :'pv_s' and ubicacion_id = :'tru' and sububicacion_id = retail.fn_sububicacion_por_defecto(:'tru', 'entrada')), 0) as antes \\gset
   ${como(MICAELA)}${EN_TIENDA}
`;
const LLEVA = (n, { ver = ":'ver'", token = "gen_random_uuid()", prod = ":'prod_p'", costo = "null::numeric", conf = "false", extra = ":'extra'" } = {}) =>
  `pg_temp.lleva(:'d', null, ${extra}, ${ver}, ${prod}, ${A(V("pv_s", n))}, ${costo}, ${conf}, ${token})`;
const EN_ALMACEN = `(select coalesce(sum(s.cantidad), 0) from retail.stock s where s.variante_id = :'pv_s' and s.ubicacion_id = :'tru' and s.sububicacion_id = retail.fn_sububicacion_por_defecto(:'tru', 'entrada'))`;
const CUENTAS_D = `(select c.contadas || ':' || c.en_stock || ':' || c.sin_separar from retail.fn_envio_cuentas(array[:'d'::uuid]) c)`;
caso(
  "A1 lleva 4 de 10: entra al stock, lo contado no cambia, lo demás sigue por repartir y el envío sigue abierto",
  `${CON_PRENDA}
   select ${LLEVA(4)} as r \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), :'r'::jsonb ->> 'unidades', ${EN_ALMACEN} - :antes,
     (select estado from retail.despachos where id = :'d'), ${CUENTAS_D},
     (select (x ->> 'cantidad') || ':' || coalesce(x ->> 'variantes', 'sin repartir') from retail.despacho_conteos k cross join lateral jsonb_array_elements(k.separado -> 'prendas') x where k.despacho_id = :'d'),
     (select count(*) from retail.despacho_diferencias x where x.despacho_id = :'d'));`,
  "OK / 4 / 4 / abierto / 10:4:6 / 6:sin repartir / 0",
);
caso(
  "A2 un doble clic con el mismo token mete una sola vez; el mismo token con otros datos se rechaza",
  `${CON_PRENDA}
   select gen_random_uuid() as t \\gset
   select ${LLEVA(4, { token: ":'t'" })} as r1 \\gset
   select ${LLEVA(4, { token: ":'t'" })} as r2 \\gset
   select pg_temp.h(${LLEVA(3, { token: ":'t'", ver: ":'ver'::int + 1" })}) as otro \\gset
   reset role;
   select concat_ws(' / ', :'r2'::jsonb ->> 'repetido', :'otro', ${EN_ALMACEN} - :antes, (select count(*) from retail.despacho_salidas s where s.despacho_id = :'d'));`,
  "true / salida_otros_datos / 4 / 1",
);
caso(
  "A3 los rechazos claros y sin nada escrito: otra versión, de más, sin repartir, otra prenda",
  `${CON_PRENDA}
   select pg_temp.h(${LLEVA(1, { ver: ":'ver'::int + 5" })}) as a \\gset
   select pg_temp.h(${LLEVA(11)}) as b \\gset
   select pg_temp.h(${LLEVA(0)}) as c \\gset
   select pg_temp.h(${LLEVA(1, { prod: ":'prod_g'" })}) as e \\gset
   reset role;
   select concat_ws(' / ', :'a', :'b', :'c', :'e', ${EN_ALMACEN} - :antes, (select count(*) from retail.despacho_salidas s where s.despacho_id = :'d'));`,
  "conteo_cambiado / salida_de_mas / salida_vacia / salida_prenda_no_esta / 0 / 0",
);
caso(
  "A4 quien recibe escribe el costo de lo que lleva al stock, aunque no vea el dinero de Compras (20261107194000)",
  `${CON_PRENDA}
   select pg_temp.e(${LLEVA(1, { costo: "1" })}) as con_costo \\gset
   reset role;
   -- El costo de la prenda queda en su conteo (costos_prendas) y entra con ella.
   select concat_ws(' / ', :'con_costo', (select k.costos_prendas ->> lower(:'prod_p') from retail.despacho_conteos k where k.despacho_id = :'d'));`,
  "OK / 1",
);
caso(
  "A5 lo que ya salió cuenta al cierre final; el cierre no lo mete dos veces",
  `${CON_PRENDA}
   select ${LLEVA(10)} as r \\gset
   reset role;
   select k.version as ver2 from retail.despacho_conteos k where k.despacho_id = :'d' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   ${VERS("d", [], [1])}
   select pg_temp.e(${CIERRA("d", [DEC(1)])}) as cierra \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), :'cierra', ${EN_ALMACEN} - :antes, (select estado from retail.despachos where id = :'d'), ${CUENTAS_D},
     (select count(*) from retail.despacho_diferencias x where x.despacho_id = :'d'));`,
  "OK / OK / 10 / cerrado / 10:10:0 / 0",
);
caso(
  "A6 corregir devuelve el stock y las unidades, deja el movimiento y el archivo; dos veces no; con motivo; otro token ya corregida",
  `${CON_PRENDA}
   select ${LLEVA(4)} as r \\gset
   select gen_random_uuid() as t \\gset
   select pg_temp.h(pg_temp.corrige_salida((:'r'::jsonb ->> 'salida_id')::uuid, 'x', :'t')) as sin_motivo \\gset
   select pg_temp.corrige_salida((:'r'::jsonb ->> 'salida_id')::uuid, 'Era otra talla', :'t') as c1 \\gset
   select pg_temp.corrige_salida((:'r'::jsonb ->> 'salida_id')::uuid, 'Era otra talla', :'t') as c2 \\gset
   select pg_temp.h(pg_temp.corrige_salida((:'r'::jsonb ->> 'salida_id')::uuid, 'Era otra talla', gen_random_uuid())) as otra \\gset
   select pg_temp.salidas(:'d') as vigentes \\gset
   reset role;
   select concat_ws(' / ', :'sin_motivo', pg_temp.e(:'c1'::jsonb), :'c2'::jsonb ->> 'repetido', :'otra', jsonb_array_length(:'vigentes'::jsonb), ${EN_ALMACEN} - :antes, ${CUENTAS_D},
     (select x ->> 'cantidad' from retail.despacho_conteos k cross join lateral jsonb_array_elements(k.separado -> 'prendas') x where k.despacho_id = :'d'),
     (select count(*) from retail.movimientos m where m.motivo = 'correccion_recepcion' and m.variante_id = :'pv_s'),
     (select jsonb_array_length(s.recibidos_archivados) from retail.despacho_salidas s where s.despacho_id = :'d'),
     (select count(*) from retail.despacho_recibidos r where r.despacho_id = :'d'));`,
  "corregir_motivo / OK / true / salida_ya_corregida / 0 / 0 / 10:0:10 / 10 / 1 / 1 / 0",
);
caso(
  "A7 lo que ya bajó del almacén no se corrige aquí",
  `${CON_PRENDA}
   select ${LLEVA(4)} as r \\gset
   reset role;
   update retail.stock s set cantidad = 0 where s.variante_id = :'pv_s' and s.ubicacion_id = :'tru' and s.sububicacion_id = retail.fn_sububicacion_por_defecto(:'tru', 'entrada');
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.h(pg_temp.corrige_salida((:'r'::jsonb ->> 'salida_id')::uuid, 'Era otra talla', gen_random_uuid())) as bajo \\gset
   reset role;
   select concat_ws(' / ', :'bajo', (select count(*) from retail.despacho_recibidos r where r.despacho_id = :'d'));`,
  "salida_ya_bajo / 1",
);
caso(
  "A8 sin proveedor sale a nombre de «Por confirmar», no cierra hasta tenerlo y al ponerlo pasa al real",
  `${MICAELA_RECIBE}
   ${SIN_AVISO("d", { prov: "null::uuid" })}
   reset role;
   -- La marca de la prueba con DOS proveedores: así no se adivina de quién es lo contado (20261107192000).
   insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov2') on conflict do nothing;
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(pg_temp.guarda(:'d', null, 5, ${SEP([["prod_p", 5]])}, null::int, null::int, null::uuid, :'cat', :'marca')) as g \\gset
   reset role;
   select k.version as ver, k.extra_posicion as extra from retail.despacho_conteos k where k.despacho_id = :'d' \\gset
   select id as pc from retail.proveedores where por_confirmar \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select ${LLEVA(5)} as r \\gset
   ${VERS("d", [], [1])}
   select pg_temp.h(${CIERRA("d", [DEC(1)])}) as no_cierra \\gset
   reset role;
   select (select count(*) from retail.lotes l where l.despacho_id = :'d' and l.proveedor_id = :'pc') as con_pc \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.e(retail.poner_proveedor_envio(:'d', :'prov')) as pone \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), :'no_cierra', :con_pc, :'pone',
     (select count(*) from retail.lotes l where l.despacho_id = :'d' and l.proveedor_id = :'prov'),
     (select count(*) from retail.despacho_recibidos x where x.despacho_id = :'d' and x.proveedor_id = :'pc'),
     (select count(*) from retail.proveedores p where p.por_confirmar and not p.activo));`,
  "OK / envio_sin_proveedor / 1 / OK / 1 / 0 / 1",
);
caso(
  "A9 en un envío de Compras, solo una línea sale; lo demás se cuenta después y lo que falta se mide contando lo que ya salió",
  `${BASE_D1}
   select pg_temp.e(${GUARDA("d1", "di_l1", 8, SEP([["prod_p", 8]]))}) as g \\gset
   reset role;
   select k.version as ver from retail.despacho_conteos k where k.despacho_id = :'d1' and k.despacho_item_id = :'di_l1' \\gset
   ${como(MICAELA)}${EN_TIENDA}
   select pg_temp.lleva(:'d1', :'di_l1', null, :ver, :'prod_p', ${A(V("pv_s", 8))}, null::numeric, false, gen_random_uuid()) as r \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), (select estado from retail.despachos where id = :'d1'),
     (select count(*) from retail.despacho_diferencias x where x.despacho_id = :'d1'),
     (select r.costo_unitario from retail.despacho_recibidos r where r.despacho_id = :'d1'));`,
  "OK / abierto / 0 / 30.00",
);
caso(
  "A11 lo dañado entra a cuarentena y esa tanda no se deshace aquí: va a Ajustar stock",
  `reset role;
   insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
   select :'tru', 'Cuarentena prueba', 'cuarentena' where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'tru' and s.tipo = 'cuarentena');
   ${CON_PRENDA}
   select pg_temp.lleva(:'d', null, :'extra', :'ver', :'prod_p', ${A(J({ variante_id: ":'pv_s'", cantidad: 3, danadas: 1, danada_solucion: "'pendiente'" }))}, null::numeric, false, gen_random_uuid()) as r \\gset
   select pg_temp.h(pg_temp.corrige_salida((:'r'::jsonb ->> 'salida_id')::uuid, 'Era otra talla', gen_random_uuid())) as no_se \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), :'no_se',
     (select sum(r.danadas) from retail.despacho_recibidos r where r.despacho_id = :'d'));`,
  "OK / salida_no_se_deshace / 1",
);
caso(
  "A12 un costo fuera de lo normal pide confirmar a quien ve el dinero; confirmado entra, con otro token",
  // Por el costo de la línea: esta suite recarga el cierre de antes del costo por prenda (ADR-0519); ese camino lo cubre el navegador.
  `${CON_PRENDA}
   reset role;
   update retail.despacho_conteos k set costo_unitario = 200 where k.despacho_id = :'d';
   ${como(FELIPE)}
   select set_config('request.headers', json_build_object('x-responsable', :'felipe_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null
   select pg_temp.h(${LLEVA(1)}) as pide \\gset
   select ${LLEVA(1, { conf: "true" })} as confirma \\gset
   reset role;
   select concat_ws(' / ', :'pide', pg_temp.e(:'confirma'::jsonb), (select count(*) from retail.despacho_salidas s where s.despacho_id = :'d'));`,
  "recepcion_costo_atipico / OK / 1",
);
caso(
  "A10 permisos: sin Recibir no; la tabla con RLS y sin lectura directa",
  `reset role;
   select concat_ws(' / ',
     (select p.prosecdef || ':' || has_function_privilege('authenticated', p.oid, 'execute') || ':' || has_function_privilege('anon', p.oid, 'execute')
        from pg_proc p where p.oid = 'retail.llevar_al_stock_ahora(uuid,uuid,integer,integer,uuid,jsonb,numeric,boolean,uuid)'::regprocedure),
     (select p.prosecdef || ':' || has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.oid = 'retail.corregir_salida(uuid,text,uuid)'::regprocedure),
     (select c.relrowsecurity || ':' || has_table_privilege('authenticated', c.oid, 'select')
        from pg_class c where c.oid = 'retail.despacho_salidas'::regclass));`,
  "true:true:false / true:true / true:false",
);
caso(
  "F1 abrir_envio_sin_aviso security definer con sus permisos; la tabla con RLS, sin políticas y sin lectura directa",
  `reset role;
   select concat_ws(' / ',
     (select p.prosecdef || ':' || has_function_privilege('authenticated', p.oid, 'execute') || ':' || has_function_privilege('anon', p.oid, 'execute')
        from pg_proc p where p.oid = 'retail.abrir_envio_sin_aviso(uuid,uuid,text,text,uuid)'::regprocedure),
     (select p.prosecdef || ':' || has_function_privilege('authenticated', p.oid, 'execute') || ':' || has_function_privilege('anon', p.oid, 'execute')
        from pg_proc p where p.oid = 'retail.poner_proveedor_envio(uuid,uuid)'::regprocedure),
     (select c.relrowsecurity || ':' || has_table_privilege('authenticated', c.oid, 'select')
             || ':' || (select count(*) from pg_policies p where p.schemaname = 'retail' and p.tablename = 'despachos_sin_aviso')
        from pg_class c where c.oid = 'retail.despachos_sin_aviso'::regclass));`,
  "true:true:false / true:true:false / true:false:0",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);

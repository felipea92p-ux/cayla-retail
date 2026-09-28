#!/usr/bin/env node
/**
 * Prueba de ADR-0257 «corregir el color y la talla de una variante que ya existe» (D-136, D-137, D-138) contra el
 * Postgres LOCAL: migración `20260928235500_corregir_color_y_talla_de_variantes.sql`.
 *
 * QUÉ CUBRE (los números son los del contrato de la base)
 *   1. BOD-0003 tal cual: una prenda «Sin color» S/M/L con su carga inicial (8/5/4 en Trujillo) se corrige a Negro desde
 *      la ficha, por una integrante NO líder que edita el catálogo: mismo id, mismo stock, mismos movimientos; códigos
 *      nuevos …-NEG-S; los viejos siguen en codigos_barras apuntando a la MISMA variante; historial 'color' y 'codigo'
 *      firmado por ella; la versión de la prenda sube. Ida y vuelta: al volver a «Sin color» recupera su código.
 *   2. D-138: corregir hacia una combinación que ya existe (activa, desactivada, o «Sin color» contra «Sin color») se
 *      rechaza (hint variante_ya_existe) nombrando esa variante, y NADA del guardado se aplica, ni las correcciones
 *      anteriores del mismo payload.
 *   3. D-136: una variante vendida (venta_items), separada (separacion_items) o que una clienta se llevó en un cambio
 *      (cambios.variante_nueva_id, que no escribe venta_items): la integrante no la corrige (correccion_solo_lider), ni
 *      por la ficha ni por la RPC, y fn_variantes_estado la marca vendida; el líder sí.
 *   4. El candado: color, talla, código y prenda no se cambian con un update directo por la API (identidad_variante),
 *      ni siendo líder; el precio sí; y postgres (el camino de las funciones) sí.
 *   5. Una segunda «Sin color S» la frena variantes_identidad_unica (CONTROL: sin el índice, entraba).
 *   6. D-137: corregida la Negro S a Azul, una Negro S nueva nace …-NEG-S-2 y el código viejo sigue resolviendo a la
 *      corregida.
 *   7. Fotos y temporada del color siguen al color cuando el viejo se queda sin variantes (y si el nuevo ya tenía
 *      temporada, manda la suya); si queda una variante del color viejo, no se mueve nada; las fotos generales nunca.
 *   8. Una prenda no queda con variantes activas «Sin color» junto a otras con color (mezcla_sin_color); desactivadas sí.
 *   9. Talla no habilitada en la categoría, color inactivo o inexistente: error y nada cambia (también al agregar).
 *  10. La ficha vieja (manda el mismo color y talla): no cambia nada, no deja filas de identidad en el historial, no pide
 *      líder aunque la variante esté vendida.
 *  11. Intercambiar S↔M en un guardado: choque y nada cambia.
 *  12. Versión: corregir la sube; guardar con la versión vieja da PT409 (también tras una corrección directa).
 *  13. fn_variantes_estado: stock por sede, apartado, vendida; '[]' sin permiso; anon no la ejecuta.
 *  14. fn_productos: una variante con color sin foto propia muestra la foto general.
 *  15. Desactivar y reactivar deja filas 'activo' en el historial.
 *  16. Candados (T8), con DOS sesiones reales: un cierre de producción (movimiento → costo) contra una corrección de esa
 *      variante ya no termina en 40P01; y la ficha vieja no espera a una operación que tiene tomada una de sus variantes.
 *   +  Permisos de las funciones nuevas, variante de otra prenda, la guarda de duplicados y que la migración se pega dos
 *      veces.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK (el Postgres local no cambia). La escena se arma como postgres con la
 * sesión de Felipe (líder); cada caso cambia a la sesión de quien guarda con `request.jwt.claim(s)` + `set local role
 * authenticated`, como PostgREST. `pg_temp.guardar` llama a `catalogo_actualizar_producto` con los datos actuales de la
 * prenda y las variantes que se le pasen; `pg_temp.ficha` arma esas variantes como las manda la pantalla (todas, con los
 * cambios pedidos primero y en ese orden). Ambos devuelven el resultado o el error (estado, hint, mensaje) como JSON: el
 * error deshace SOLO esa llamada (subtransacción), igual que una llamada de la API. Las carreras (16) abren dos
 * conexiones a la vez sobre una prenda de la semilla y también terminan en ROLLBACK: nada queda commiteado.
 *
 * USO
 *   pnpm pruebas:corregir-variantes    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260928235500_corregir_color_y_talla_de_variantes.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante con Productos (seed): edita el catálogo, no es líder
const NADIE = "22222222-2222-4222-8222-0000000000ff"; // una sesión sin persona: no edita el catálogo

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

/** Otra conexión, en paralelo: devuelve su código de salida, sus filas «clave|valor» y su stderr. */
function sesionParalela(sql) {
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS_PSQL, { stdio: ["pipe", "pipe", "pipe"] });
    let salida = "";
    let err = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, filas: filasDe(salida), err }));
    p.stdin.end(sql);
  });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Las filas «clave|valor» de una salida de psql, como { clave: valor }. */
function filasDe(salida) {
  const filas = {};
  for (const linea of salida.split("\n").filter(Boolean)) {
    const i = linea.indexOf("|");
    if (i > 0) filas[linea.slice(0, i)] = linea.slice(i + 1);
  }
  return filas;
}

/** Ayudantes de sesión (pg_temp): sin escribir nada, para que las carreras de dos sesiones también los usen. */
const FUNCIONES = `
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_det text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint, v_det = pg_exception_detail;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg, 'detail', nullif(v_det, ''));
end;
$f$;
-- La fila de la prenda (como postgres: la ficha la leyó al abrir).
create function pg_temp.producto(p uuid) returns jsonb language sql security definer as $f$
  select to_jsonb(x) from retail.productos x where x.id = p;
$f$;
-- Las variantes como las manda la ficha: TODAS, con su costo (la API no lo lee: como postgres), los cambios pedidos
-- primero y en ese orden, y las nuevas (sin id) donde se pidan.
create function pg_temp.ficha(p_producto uuid, p_cambios jsonb default '[]') returns jsonb language sql security definer as $f$
  with base as (
    select v.id, jsonb_build_object('id', v.id, 'color_codigo', v.color_codigo, 'talla_id', v.talla_id, 'sku', v.sku,
                                    'precio', v.precio, 'costo', v.costo, 'activo', v.activo) as fila
      from retail.variantes v where v.producto_id = p_producto),
  cambios as (
    select nullif(c ->> 'id', '')::uuid as id, c, ord from jsonb_array_elements(p_cambios) with ordinality as t(c, ord))
  select coalesce(jsonb_agg(x.fila order by x.o1, x.o2), '[]'::jsonb) from (
    select coalesce(b.fila, '{}'::jsonb) || coalesce(c.c, '{}'::jsonb) as fila, coalesce(c.ord, 1000000) as o1, b.id::text as o2
      from base b full join cambios c on c.id = b.id) x;
$f$;
create function pg_temp.guardar(p_producto uuid, p_variantes jsonb, p_version integer default null) returns jsonb
language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_det text; p jsonb; v_ver integer;
begin
  p := pg_temp.producto(p_producto);
  v_ver := retail.catalogo_actualizar_producto(
    p_producto_id => p_producto, p_referencia => p ->> 'referencia', p_estado => p ->> 'estado', p_variantes => p_variantes,
    p_categoria_id => (p ->> 'categoria_id')::uuid, p_descripcion => p ->> 'descripcion',
    p_stock_minimo => (p ->> 'stock_minimo')::integer, p_temporada => p ->> 'temporada',
    p_permitir_venta_sin_stock => (p ->> 'permitir_venta_sin_stock')::boolean,
    p_tejido_id => (p ->> 'tejido_id')::uuid, p_patron_id => (p ->> 'patron_id')::uuid, p_version_esperada => p_version);
  return jsonb_build_object('ok', true, 'version', v_ver);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint, v_det = pg_exception_detail;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg, 'detail', nullif(v_det, ''));
end;
$f$;
-- Una entrada de stock como la carga inicial: el movimiento y su aplicación.
create function pg_temp.entrada(p_variante uuid, p_ubic uuid, p_sub uuid, p_cant integer) returns void language plpgsql as $f$
declare v_mov uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
    values (p_variante, p_ubic, p_sub, 'entrada', p_cant, 'carga_inicial') returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
end;
$f$;
-- Lo que no debe moverse al corregir: la huella de una prenda (identidad, códigos, historial y versión).
create function pg_temp.huella(p uuid) returns text language sql security definer as $f$
  select md5(concat_ws('#',
    (select string_agg(concat_ws(':', v.id, v.color_codigo, v.talla_id, v.codigo, v.activo, v.precio), ',' order by v.id)
       from retail.variantes v where v.producto_id = p),
    (select string_agg(cb.codigo || '>' || cb.variante_id, ',' order by cb.codigo)
       from retail.codigos_barras cb join retail.variantes v on v.id = cb.variante_id where v.producto_id = p),
    (select count(*) from retail.historial_producto_cambios h
      where h.entidad_id = p or h.entidad_id in (select id from retail.variantes where producto_id = p)),
    (select string_agg(pf.id || ':' || coalesce(pf.color_codigo, '-'), ',' order by pf.id) from retail.producto_fotos pf where pf.producto_id = p),
    (select string_agg(t.color_codigo || ':' || t.temporada, ',' order by t.color_codigo) from retail.producto_color_temporadas t where t.producto_id = p),
    (select version from retail.productos where id = p)));
$f$;
grant execute on function pg_temp.intento(text), pg_temp.guardar(uuid, jsonb, integer), pg_temp.ficha(uuid, jsonb),
  pg_temp.producto(uuid), pg_temp.huella(uuid) to authenticated;
`;

const ESCENA = `
begin;
${FUNCIONES}
-- La escena se arma con la sesión de Felipe (líder): las prendas nacen aprobadas, como desde Nuevo producto.
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'almacen_tienda');
select id as alm_t from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as alm_l from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'almacen_tienda' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
-- Bodys (BOD): S, M, L y XL habilitadas; XXL no.
select id as cat from retail.categorias where prefijo = 'BOD' \\gset
select t.id as t_s from retail.tallas t join retail.categoria_tallas ct on ct.talla_id = t.id and ct.categoria_id = :'cat' where t.valor = 'S' \\gset
select t.id as t_m from retail.tallas t join retail.categoria_tallas ct on ct.talla_id = t.id and ct.categoria_id = :'cat' where t.valor = 'M' \\gset
select t.id as t_l from retail.tallas t join retail.categoria_tallas ct on ct.talla_id = t.id and ct.categoria_id = :'cat' where t.valor = 'L' \\gset
select t.id as t_xl from retail.tallas t join retail.categoria_tallas ct on ct.talla_id = t.id and ct.categoria_id = :'cat' where t.valor = 'XL' \\gset
select t.id as t_xxl from retail.tallas t where t.valor = 'XXL'
  and not exists (select 1 from retail.categoria_tallas ct where ct.talla_id = t.id and ct.categoria_id = :'cat') \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores order by created_at limit 1 \\gset

-- A · BOD-0003 tal cual: «Sin color» S/M/L con su carga inicial 8/5/4 en el almacén de Trujillo.
insert into retail.productos (referencia, estado, categoria_id, marca_id, proveedor_id)
  values ('ZZ Body Amir Prueba', 'activo', :'cat', :'marca', :'prov') returning id as pa \\gset
insert into retail.variantes (producto_id, talla_id, precio, costo) values (:'pa', :'t_s', 59, 20) returning id as a_s \\gset
insert into retail.variantes (producto_id, talla_id, precio, costo) values (:'pa', :'t_m', 59, 20) returning id as a_m \\gset
insert into retail.variantes (producto_id, talla_id, precio, costo) values (:'pa', :'t_l', 59, 20) returning id as a_l \\gset
select pg_temp.entrada(:'a_s', :'tru', :'alm_t', 8) as _1, pg_temp.entrada(:'a_m', :'tru', :'alm_t', 5) as _2,
       pg_temp.entrada(:'a_l', :'tru', :'alm_t', 4) as _3 \\gset
select codigo as pa_cod from retail.productos where id = :'pa' \\gset

-- B · colores: Negro S (vendida), Negro M (DESACTIVADA), Azul marino S/M/L.
insert into retail.productos (referencia, estado, categoria_id, marca_id, proveedor_id)
  values ('ZZ Body Colores Prueba', 'activo', :'cat', :'marca', :'prov') returning id as pb \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo) values (:'pb', 'NEG', :'t_s', 69, 25) returning id as b_negs \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo, activo) values (:'pb', 'NEG', :'t_m', 69, 25, false) returning id as b_negm \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo) values (:'pb', 'AZM', :'t_s', 69, 25) returning id as b_azms \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo) values (:'pb', 'AZM', :'t_m', 69, 25) returning id as b_azmm \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo) values (:'pb', 'AZM', :'t_l', 69, 25) returning id as b_azml \\gset
insert into retail.ventas (ubicacion_id) values (:'tru') returning id as venta \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (:'venta', :'b_negs', 1, 69, 25)
  returning id as vi_negs \\gset
select codigo as b_negs_cod from retail.variantes where id = :'b_negs' \\gset
select codigo as pb_cod from retail.productos where id = :'pb' \\gset

-- C · fotos y temporada: Negro S/M, Beige L (una clienta la separó); una foto del Negro y una general; Negro de
-- invierno y Beige de verano.
insert into retail.productos (referencia, estado, categoria_id, marca_id, proveedor_id)
  values ('ZZ Body Fotos Prueba', 'activo', :'cat', :'marca', :'prov') returning id as pc \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo) values (:'pc', 'NEG', :'t_s', 79, 30) returning id as c_negs \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo) values (:'pc', 'NEG', :'t_m', 79, 30) returning id as c_negm \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo) values (:'pc', 'BEI', :'t_l', 79, 30) returning id as c_beil \\gset
insert into retail.producto_fotos (producto_id, url, orden, es_principal, color_codigo)
  values (:'pc', 'https://prueba.local/negro.jpg', 0, true, 'NEG') returning id as f_neg \\gset
insert into retail.producto_fotos (producto_id, url, orden, es_principal, color_codigo)
  values (:'pc', 'https://prueba.local/general.jpg', 1, false, null) returning id as f_gen \\gset
insert into retail.producto_color_temporadas (producto_id, color_codigo, temporada)
  values (:'pc', 'NEG', 'invierno'), (:'pc', 'BEI', 'verano');
-- La separación va sin sus cabeceras (caja, clienta, apartado): solo importa que exista la línea.
set local session_replication_role = replica;
insert into retail.separacion_items (separacion_id, variante_id, cantidad, precio_unitario, apartado_id)
  values (gen_random_uuid(), :'c_beil', 1, 79, gen_random_uuid());
set local session_replication_role = origin;
select codigo as pc_cod from retail.productos where id = :'pc' \\gset
select codigo as c_negs_cod from retail.variantes where id = :'c_negs' \\gset
`;

/** Cambia a la sesión de esa cuenta, como PostgREST (desde postgres). */
const sesion = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const COMO_POSTGRES = "reset role;\n";

/** Una transacción con ROLLBACK: escena → cuerpo. Devuelve { clave: valor } de las filas «clave|valor». */
function correr(cuerpo) {
  return filasDe(psql(`${ESCENA}\n${cuerpo}\nrollback;\n`));
}

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 8).join("\n    ")}`);
  }
}
async function casoAsync(nombre, fn) {
  total++;
  try {
    const detalle = await fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 8).join("\n    ")}`);
  }
}
/** Falla con el detalle si alguna clave no tiene el valor esperado. */
function espera(filas, esperado) {
  const malas = Object.entries(esperado).filter(([k, v]) => filas[k] !== v);
  if (malas.length) return malas.map(([k, v]) => `${k}: esperaba «${v}», salió «${filas[k]}»`).join("\n") + `\n${JSON.stringify(filas)}`;
}
const json = (texto) => JSON.parse(texto ?? "null");
/** Un error con ese hint (y ese estado, si se pide). */
function error(r, hint, estado) {
  if (!r || r.ok !== false || r.hint !== hint || (estado && r.estado !== estado)) return `esperaba el error ${hint}${estado ? ` (${estado})` : ""}: ${JSON.stringify(r)}`;
}

/** Un cambio de la ficha: `{ id, ...}` con psql-variables para los uuid. */
const cambio = (id, campos = {}) =>
  `jsonb_build_object('id', :'${id}'${Object.entries(campos).map(([k, v]) => `, '${k}', ${v}`).join("")})`;
const nueva = (campos) => `jsonb_build_object(${Object.entries(campos).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const ficha = (producto, cambios = []) => `pg_temp.ficha(:'${producto}', jsonb_build_array(${cambios.join(", ")}))`;
const guardar = (producto, cambios = [], version = null) =>
  `select 'r', pg_temp.guardar(:'${producto}', ${ficha(producto, cambios)}${version ? `, ${version}` : ""});\n`;
const HUELLA = (producto, clave = "huella") => `select '${clave}', pg_temp.huella(:'${producto}');\n`;
/** Corrección directa por la API (la RPC nueva). */
const corregir = (producto, variante, datos) =>
  `select 'r', pg_temp.intento(format('select retail.fn_corregir_identidad_variante(%L, %L, %L)', :'${producto}', :'${variante}', ${datos}));\n`;

// ===========================================================================
// 1 · BOD-0003 tal cual
// ===========================================================================

const CORREGIR_A_NEGRO = guardar("pa", [
  cambio("a_s", { color_codigo: "'NEG'" }),
  cambio("a_m", { color_codigo: "'NEG'" }),
  cambio("a_l", { color_codigo: "'NEG'" }),
]);

caso("1 · una integrante NO líder corrige «Sin color» S/M/L a Negro desde la ficha: mismo id, stock y movimientos intactos", () => {
  const f = correr(`
select string_agg(concat_ws(':', variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada), ',' order by variante_id, sububicacion_id) as stock_antes
  from retail.stock where variante_id in (:'a_s', :'a_m', :'a_l') \\gset
select md5(string_agg(to_jsonb(m)::text, ',' order by m.id)) as mov_antes from retail.movimientos m where m.variante_id in (:'a_s', :'a_m', :'a_l') \\gset
select version as ver_antes from retail.productos where id = :'pa' \\gset
${sesion(MICAELA)}
select 'es_lider', retail.fn_es_lider()::text;
select 'edita', retail.fn_puede_editar_catalogo()::text;
${CORREGIR_A_NEGRO}
${COMO_POSTGRES}
select 'variantes', count(*) from retail.variantes where producto_id = :'pa';
select 'colores', string_agg(coalesce(color_codigo, '-'), ',') from retail.variantes where id in (:'a_s', :'a_m', :'a_l');
select 'codigos', bool_and(v.codigo = :'pa_cod' || '-NEG-' || t.valor)::text
  from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = :'pa';
select 'viejos_suenan', bool_and(exists (select 1 from retail.codigos_barras cb where cb.codigo = :'pa_cod' || '-' || t.valor and cb.variante_id = v.id))::text
  from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = :'pa';
select 'nuevos_suenan', bool_and(exists (select 1 from retail.codigos_barras cb where cb.codigo = v.codigo and cb.variante_id = v.id))::text
  from retail.variantes v where v.producto_id = :'pa';
select 'stock_igual', (string_agg(concat_ws(':', variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada), ',' order by variante_id, sububicacion_id) = :'stock_antes')::text
  from retail.stock where variante_id in (:'a_s', :'a_m', :'a_l');
select 'mov_igual', (md5(string_agg(to_jsonb(m)::text, ',' order by m.id)) = :'mov_antes')::text from retail.movimientos m where m.variante_id in (:'a_s', :'a_m', :'a_l');
select 'firma', bool_and(h.usuario_id = :'micaela')::text from retail.historial_producto_cambios h
  where h.entidad = 'variante' and h.entidad_id in (:'a_s', :'a_m', :'a_l');
select 'filas_historial', count(*) from retail.historial_producto_cambios h
  where h.entidad = 'variante' and h.entidad_id in (:'a_s', :'a_m', :'a_l') and h.campo in ('color', 'codigo');
select 'version_sube', ((select version from retail.productos where id = :'pa') > :ver_antes)::text;
`);
  const r = json(f.r);
  if (!r?.ok) return `el guardado falló: ${f.r}`;
  return espera(f, {
    es_lider: "false",
    edita: "true",
    variantes: "3",
    colores: "NEG,NEG,NEG",
    codigos: "true",
    viejos_suenan: "true",
    nuevos_suenan: "true",
    stock_igual: "true",
    mov_igual: "true",
    firma: "true",
    filas_historial: "6",
    version_sube: "true",
  });
});

caso("1 · …el historial de la S dice exactamente codigo viejo→nuevo y color ∅→NEG", () => {
  const f = correr(`${sesion(MICAELA)}${CORREGIR_A_NEGRO}${COMO_POSTGRES}
select 'esperado', 'codigo:' || :'pa_cod' || '-S>' || :'pa_cod' || '-NEG-S,color:∅>NEG';
select 'historial_s', string_agg(h.campo || ':' || coalesce(h.valor_anterior, '∅') || '>' || coalesce(h.valor_nuevo, '∅'), ',' order by h.campo)
  from retail.historial_producto_cambios h where h.entidad = 'variante' and h.entidad_id = :'a_s';`);
  if (f.historial_s !== f.esperado) return `esperaba «${f.esperado}», salió «${f.historial_s}»`;
});

caso("1 · ida y vuelta: volver a «Sin color» le devuelve su código y no duplica nada en codigos_barras", () => {
  const f = correr(`${sesion(MICAELA)}${CORREGIR_A_NEGRO}
${guardar("pa", [cambio("a_s", { color_codigo: "null" }), cambio("a_m", { color_codigo: "''" }), cambio("a_l", { color_codigo: "null" })]).replace("'r'", "'r2'")}
${COMO_POSTGRES}
select 'codigo_s', (codigo = :'pa_cod' || '-S')::text from retail.variantes where id = :'a_s';
select 'barras_s', string_agg(codigo, ',' order by codigo) = :'pa_cod' || '-NEG-S,' || :'pa_cod' || '-S' from retail.codigos_barras where variante_id = :'a_s';`);
  if (!json(f.r)?.ok || !json(f.r2)?.ok) return `${f.r} / ${f.r2}`;
  return espera(f, { codigo_s: "true", barras_s: "t" });
});

// ===========================================================================
// 2 · D-138: choque con una variante que ya existe
// ===========================================================================

caso("2 · hacia una combinación ACTIVA: variante_ya_existe, nombra su código, y NADA del guardado se aplica", () => {
  const f = correr(`${HUELLA("pb", "antes")}${sesion(MICAELA)}
${guardar("pb", [cambio("b_azml", { color_codigo: "'NEG'" }), cambio("b_azms", { color_codigo: "'NEG'" })])}
${COMO_POSTGRES}${HUELLA("pb", "despues")}
select 'azml', color_codigo from retail.variantes where id = :'b_azml';`);
  const r = json(f.r);
  return (
    error(r, "variante_ya_existe") ??
    (r.msg.startsWith("Ya existe Negro S en esta prenda (") && r.msg.includes(`-NEG-S). Elige otra combinación`) ? null : `mensaje: ${r.msg}`) ??
    (f.antes === f.despues ? null : "la prenda cambió") ??
    espera(f, { azml: "AZM" })
  );
});

caso("2 · hacia una combinación DESACTIVADA: variante_ya_existe y dice «reactívala en vez de corregir esta»", () => {
  const f = correr(`${HUELLA("pb", "antes")}${sesion(MICAELA)}
${guardar("pb", [cambio("b_azmm", { color_codigo: "'NEG'" })])}
${COMO_POSTGRES}${HUELLA("pb", "despues")}`);
  const r = json(f.r);
  return (
    error(r, "variante_ya_existe") ??
    (r.msg.includes("está desactivada: reactívala en vez de corregir esta") && r.msg.startsWith("Ya existe Negro M en esta prenda (")
      ? null
      : `mensaje: ${r.msg}`) ??
    (f.antes === f.despues ? null : "la prenda cambió")
  );
});

caso("2 · «Sin color» cuenta como un color: Sin color S → M choca con la Sin color M", () => {
  const f = correr(`${HUELLA("pa", "antes")}${sesion(MICAELA)}
${guardar("pa", [cambio("a_s", { talla_id: ":'t_m'" })])}
${COMO_POSTGRES}${HUELLA("pa", "despues")}`);
  const r = json(f.r);
  return (
    error(r, "variante_ya_existe") ??
    (r.msg.startsWith("Ya existe Sin color M en esta prenda (") ? null : `mensaje: ${r.msg}`) ??
    (f.antes === f.despues ? null : "la prenda cambió")
  );
});

caso("2 · el detalle del error trae el id de la variante que ya existe (para que la ficha la señale)", () => {
  const f = correr(`${sesion(MICAELA)}${guardar("pb", [cambio("b_azms", { color_codigo: "'NEG'" })])}${COMO_POSTGRES}
select 'negs', :'b_negs';`);
  const r = json(f.r);
  return error(r, "variante_ya_existe") ?? (r.detail === f.negs ? null : `detalle ${r.detail}, esperaba ${f.negs}`);
});

// ===========================================================================
// 3 · D-136: vendida o separada, solo líder
// ===========================================================================

caso("3 · vendida: la integrante no la corrige (correccion_solo_lider, 42501) y nada cambia", () => {
  const f = correr(`${HUELLA("pb", "antes")}${sesion(MICAELA)}
${guardar("pb", [cambio("b_negs", { color_codigo: "'BEI'" })])}
${COMO_POSTGRES}${HUELLA("pb", "despues")}`);
  const r = json(f.r);
  return error(r, "correccion_solo_lider", "42501") ?? (r.msg.includes("ya se vendió (o una clienta la apartó): solo un líder") ? null : r.msg) ?? (f.antes === f.despues ? null : "la prenda cambió");
});

caso("3 · vendida: el líder sí la corrige", () => {
  const f = correr(`${sesion(FELIPE)}${guardar("pb", [cambio("b_negs", { color_codigo: "'BEI'" })])}${COMO_POSTGRES}
select 'color', color_codigo from retail.variantes where id = :'b_negs';
select 'firma', bool_and(usuario_id = :'felipe')::text from retail.historial_producto_cambios where entidad_id = :'b_negs' and campo = 'color';`);
  return json(f.r)?.ok ? espera(f, { color: "BEI", firma: "true" }) : f.r;
});

caso("3 · separada por una clienta: la integrante no le corrige la talla; el líder sí, y el historial dice L→M (el valor, no el uuid)", () => {
  const f = correr(`${sesion(MICAELA)}${guardar("pc", [cambio("c_beil", { talla_id: ":'t_m'" })])}
${sesion(FELIPE)}${guardar("pc", [cambio("c_beil", { talla_id: ":'t_m'" })]).replace("'r'", "'r2'")}
${COMO_POSTGRES}
select 'talla', t.valor from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.id = :'c_beil';
select 'historial', string_agg(campo || ':' || valor_anterior || '>' || valor_nuevo, ',' order by campo) from retail.historial_producto_cambios
 where entidad_id = :'c_beil' and campo in ('talla', 'codigo');
select 'esperado', 'codigo:' || :'pc_cod' || '-BEI-L>' || :'pc_cod' || '-BEI-M,talla:L>M';`);
  return error(json(f.r), "correccion_solo_lider", "42501") ?? (json(f.r2)?.ok ? null : f.r2) ?? espera(f, { talla: "M", historial: f.esperado });
});

// registrar_cambio escribe `cambios` y el movimiento de salida de la prenda nueva, NO `venta_items` (su definición viva:
// inserts en cambios, movimientos y prendas_danadas). Sin mirar `cambios.variante_nueva_id`, la Azul marino S que una
// clienta se llevó a cambio de su Negro S pasaba por «nunca vendida» y cualquiera le cambiaba el color.
caso("3 · la que una clienta se llevó en un CAMBIO (cambios.variante_nueva_id, sin venta_items): cuenta como vendida; la integrante no la corrige, el líder sí", () => {
  const f = correr(`${COMO_POSTGRES}
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, motivo)
  values (:'vi_negs', :'tru', :'b_azms', 1, 'otro_color');
select 'venta_items_azms', count(*) from retail.venta_items where variante_id = :'b_azms';
${HUELLA("pb", "antes")}${sesion(MICAELA)}
select 'vendida', (select e ->> 'vendida' from jsonb_array_elements(retail.fn_variantes_estado(:'pb')) e where e ->> 'variante_id' = :'b_azms');
${guardar("pb", [cambio("b_azms", { color_codigo: "'BEI'" })])}
${corregir("pb", "b_azms", `'{"color_codigo":"BEI"}'`).replace("'r'", "'r_rpc'")}
${COMO_POSTGRES}${HUELLA("pb", "despues")}
${sesion(FELIPE)}${guardar("pb", [cambio("b_azms", { color_codigo: "'BEI'" })]).replace("'r'", "'r2'")}
${COMO_POSTGRES}
select 'color', color_codigo from retail.variantes where id = :'b_azms';`);
  return (
    espera(f, { venta_items_azms: "0", vendida: "true" }) ??
    error(json(f.r), "correccion_solo_lider", "42501") ??
    error(json(f.r_rpc), "correccion_solo_lider", "42501") ??
    (f.antes === f.despues ? null : "la prenda cambió") ??
    (json(f.r2)?.ok ? null : `el líder: ${f.r2}`) ??
    espera(f, { color: "BEI" })
  );
});

// ===========================================================================
// 4 · El candado de la tabla
// ===========================================================================

const DIRECTO = (set, clave) => `select '${clave}', pg_temp.intento(format('update retail.variantes set ${set} where id = %L', :'a_s'));\n`;

caso("4 · update directo por la API (siendo líder): color, talla, código y prenda → identidad_variante; precio y el mismo color pasan", () => {
  const f = correr(`${sesion(FELIPE)}
${DIRECTO("color_codigo = ''NEG''", "color")}
${DIRECTO("talla_id = ''' || :'t_xl' || '''", "talla")}
${DIRECTO("codigo = ''ZZ-OTRO''", "codigo")}
${DIRECTO("producto_id = ''' || :'pb' || '''", "producto")}
${DIRECTO("precio = 61", "precio")}
${DIRECTO("color_codigo = null, talla_id = talla_id", "mismo")}
${COMO_POSTGRES}
select 'estado', concat_ws(':', color_codigo, precio) from retail.variantes where id = :'a_s';`);
  for (const k of ["color", "talla", "codigo", "producto"]) {
    const e = error(json(f[k]), "identidad_variante", "42501");
    if (e) return `${k}: ${e}`;
  }
  if (!json(f.precio)?.ok) return `precio: ${f.precio}`;
  if (!json(f.mismo)?.ok) return `mismo valor: ${f.mismo}`;
  return espera(f, { estado: "61.00" });
});

caso("4 · postgres (el camino de las funciones SECURITY DEFINER) sí cambia la identidad", () => {
  const f = correr(`${COMO_POSTGRES}${DIRECTO("color_codigo = ''NEG''", "color")}`);
  if (!json(f.color)?.ok) return f.color;
});

// ===========================================================================
// 5 · Una segunda «Sin color S»
// ===========================================================================

const SEGUNDA_S = guardar("pa", [nueva({ talla_id: ":'t_s'", precio: 59, costo: 20 })]);

caso("5 · una segunda «Sin color S» por la ficha la frena variantes_identidad_unica (23505)", () => {
  const f = correr(`${sesion(MICAELA)}${SEGUNDA_S}${COMO_POSTGRES}select 'n', count(*) from retail.variantes where producto_id = :'pa';`);
  const r = json(f.r);
  if (r?.ok !== false || r.estado !== "23505" || !r.msg.includes("variantes_identidad_unica")) return f.r;
  return espera(f, { n: "3" });
});

caso("5 · …y también un insert directo como postgres", () => {
  const f = correr(`${COMO_POSTGRES}select 'r', pg_temp.intento(format('insert into retail.variantes (producto_id, talla_id, precio) values (%L, %L, 59)', :'pa', :'t_s'));`);
  const r = json(f.r);
  if (r?.ok !== false || r.estado !== "23505" || !r.msg.includes("variantes_identidad_unica")) return f.r;
});

caso("5 · CONTROL: sin el índice, la segunda «Sin color S» entraba (el hueco existía)", () => {
  const f = correr(`${COMO_POSTGRES}drop index retail.variantes_identidad_unica;
${sesion(MICAELA)}${SEGUNDA_S}${COMO_POSTGRES}select 'n', count(*) from retail.variantes where producto_id = :'pa';`);
  if (!json(f.r)?.ok) return f.r;
  return espera(f, { n: "4" });
});

// ===========================================================================
// 6 · D-137: el código viejo sigue siendo de la corregida
// ===========================================================================

caso("6 · Negro S → Azul marino S; después una Negro S nueva nace …-NEG-S-2 y el código viejo sigue resolviendo a la corregida", () => {
  const f = correr(`${sesion(MICAELA)}
${guardar("pc", [cambio("c_negs", { color_codigo: "'AZM'" })])}
${guardar("pc", [nueva({ talla_id: ":'t_s'", color_codigo: "'NEG'", precio: 79, costo: 30 })]).replace("'r'", "'r2'")}
${COMO_POSTGRES}
select 'corregida', (codigo = :'pc_cod' || '-AZM-S')::text from retail.variantes where id = :'c_negs';
select 'nueva', (codigo = :'pc_cod' || '-NEG-S-2')::text from retail.variantes where producto_id = :'pc' and color_codigo = 'NEG' and talla_id = :'t_s';
select 'viejo_resuelve', (variante_id = :'c_negs')::text from retail.codigos_barras where codigo = :'c_negs_cod';
select 'nueva_suena', count(*) from retail.codigos_barras cb join retail.variantes v on v.id = cb.variante_id
 where v.producto_id = :'pc' and v.color_codigo = 'NEG' and v.talla_id = :'t_s' and cb.codigo = v.codigo;
select 'nueva_sin_fila_codigo', count(*) from retail.historial_producto_cambios h join retail.variantes v on v.id = h.entidad_id
 where v.producto_id = :'pc' and v.color_codigo = 'NEG' and v.talla_id = :'t_s' and h.campo = 'codigo';`);
  if (!json(f.r)?.ok || !json(f.r2)?.ok) return `${f.r} / ${f.r2}`;
  return espera(f, { corregida: "true", nueva: "true", viejo_resuelve: "true", nueva_suena: "1", nueva_sin_fila_codigo: "0" });
});

// ===========================================================================
// 7 · Fotos y temporada siguen al color
// ===========================================================================

const FOTOS_Y_TEMPORADA = `${COMO_POSTGRES}
select 'foto_neg', coalesce(color_codigo, '-') from retail.producto_fotos where id = :'f_neg';
select 'foto_gen', coalesce(color_codigo, '-') from retail.producto_fotos where id = :'f_gen';
select 'temporadas', string_agg(color_codigo || '=' || temporada, ',' order by color_codigo) from retail.producto_color_temporadas where producto_id = :'pc';
select 'historial_temporada', string_agg(campo || ':' || coalesce(valor_anterior, '∅') || '>' || coalesce(valor_nuevo, '∅'), ',' order by campo)
  from retail.historial_producto_cambios where entidad = 'producto' and entidad_id = :'pc' and campo like 'temporada:%';
`;

caso("7 · todo el Negro pasa a Azul marino (que no tenía temporada): la foto del Negro y su temporada se van al Azul; la general no se mueve", () => {
  const f = correr(`${sesion(MICAELA)}${guardar("pc", [cambio("c_negs", { color_codigo: "'AZM'" }), cambio("c_negm", { color_codigo: "'AZM'" })])}${FOTOS_Y_TEMPORADA}`);
  if (!json(f.r)?.ok) return f.r;
  return espera(f, {
    foto_neg: "AZM",
    foto_gen: "-",
    temporadas: "AZM=invierno,BEI=verano",
    historial_temporada: "temporada:AZM:∅>invierno,temporada:NEG:invierno>∅",
  });
});

caso("7 · todo el Negro pasa a Beige (que YA tenía temporada): manda la del Beige y la del Negro se borra; la foto se va al Beige", () => {
  const f = correr(`${sesion(MICAELA)}${guardar("pc", [cambio("c_negs", { color_codigo: "'BEI'" }), cambio("c_negm", { color_codigo: "'BEI'" })])}${FOTOS_Y_TEMPORADA}`);
  if (!json(f.r)?.ok) return f.r;
  return espera(f, { foto_neg: "BEI", foto_gen: "-", temporadas: "BEI=verano", historial_temporada: "temporada:NEG:invierno>∅" });
});

caso("7 · si queda una variante del Negro (solo la S pasa a Azul), ni la foto ni la temporada se mueven", () => {
  const f = correr(`${sesion(MICAELA)}${guardar("pc", [cambio("c_negs", { color_codigo: "'AZM'" })])}${FOTOS_Y_TEMPORADA}`);
  if (!json(f.r)?.ok) return f.r;
  return espera(f, { foto_neg: "NEG", foto_gen: "-", temporadas: "BEI=verano,NEG=invierno" });
});

caso("7 · el Negro pasa a «Sin color» (y el Beige se desactiva): su foto queda como general y su temporada se borra", () => {
  const f = correr(`${sesion(FELIPE)}${guardar("pc", [
    cambio("c_negs", { color_codigo: "null" }),
    cambio("c_negm", { color_codigo: "null" }),
    cambio("c_beil", { activo: "false" }),
  ])}${FOTOS_Y_TEMPORADA}`);
  if (!json(f.r)?.ok) return f.r;
  return espera(f, { foto_neg: "-", foto_gen: "-", temporadas: "BEI=verano" });
});

caso("7 · de «Sin color» a Negro: las fotos generales no se mueven", () => {
  const f = correr(`${COMO_POSTGRES}insert into retail.producto_fotos (producto_id, url, orden, es_principal) values (:'pa', 'https://prueba.local/a.jpg', 0, true) returning id as f_a \\gset
${sesion(MICAELA)}${CORREGIR_A_NEGRO}${COMO_POSTGRES}
select 'foto_a', coalesce(color_codigo, '-') from retail.producto_fotos where id = :'f_a';`);
  if (!json(f.r)?.ok) return f.r;
  return espera(f, { foto_a: "-" });
});

// ===========================================================================
// 8 · «Sin color» junto a colores
// ===========================================================================

caso("8 · corregir solo la S a Negro dejaría «Sin color» M/L junto a Negro S: mezcla_sin_color y nada cambia", () => {
  const f = correr(`${HUELLA("pa", "antes")}${sesion(MICAELA)}${guardar("pa", [cambio("a_s", { color_codigo: "'NEG'" })])}${COMO_POSTGRES}${HUELLA("pa", "despues")}`);
  return error(json(f.r), "mezcla_sin_color") ?? (f.antes === f.despues ? null : "la prenda cambió");
});

caso("8 · …pero corregir la S y desactivar M y L sí pasa (las desactivadas no cuentan)", () => {
  const f = correr(`${sesion(MICAELA)}${guardar("pa", [
    cambio("a_s", { color_codigo: "'NEG'" }),
    cambio("a_m", { activo: "false" }),
    cambio("a_l", { activo: "false" }),
  ])}`);
  if (!json(f.r)?.ok) return f.r;
});

caso("8 · agregar una «Sin color» a una prenda con colores: mezcla_sin_color", () => {
  const f = correr(`${sesion(MICAELA)}${guardar("pb", [nueva({ talla_id: ":'t_xl'", precio: 69, costo: 25 })])}`);
  return error(json(f.r), "mezcla_sin_color");
});

// ===========================================================================
// 9 · Lo nuevo tiene que valer
// ===========================================================================

caso("9 · talla no habilitada en la categoría (XXL en Bodys): talla_no_habilitada y nada cambia", () => {
  const f = correr(`${HUELLA("pa", "antes")}${sesion(MICAELA)}${guardar("pa", [cambio("a_s", { talla_id: ":'t_xxl'" })])}${COMO_POSTGRES}${HUELLA("pa", "despues")}`);
  return error(json(f.r), "talla_no_habilitada") ?? (f.antes === f.despues ? null : "la prenda cambió");
});

caso("9 · color desactivado en el vocabulario: color_inactivo al corregir y al agregar", () => {
  const f = correr(`${COMO_POSTGRES}update retail.colores set activo = false where codigo = 'BLA';
${sesion(MICAELA)}
${guardar("pb", [cambio("b_azml", { color_codigo: "'BLA'" })])}
${guardar("pb", [nueva({ talla_id: ":'t_xl'", color_codigo: "'BLA'", precio: 69, costo: 25 })]).replace("'r'", "'r2'")}`);
  return error(json(f.r), "color_inactivo") ?? error(json(f.r2), "color_inactivo");
});

caso("9 · color que no existe: color_inactivo (no un 23503 sin traducir)", () => {
  const f = correr(`${sesion(MICAELA)}${guardar("pb", [cambio("b_azml", { color_codigo: "'ZZQ'" })])}`);
  return error(json(f.r), "color_inactivo");
});

// ===========================================================================
// 10 · La ficha vieja
// ===========================================================================

caso("10 · la ficha vieja (mismo color y talla) guarda como siempre: sin filas de identidad, sin pedir líder aunque esté vendida", () => {
  const f = correr(`select version as v0 from retail.productos where id = :'pb' \\gset
${sesion(MICAELA)}${guardar("pb")}${COMO_POSTGRES}
select 'filas', count(*) from retail.historial_producto_cambios
 where entidad_id in (select id from retail.variantes where producto_id = :'pb') and campo in ('color', 'talla', 'codigo', 'activo');
select 'version', (select version from retail.productos where id = :'pb') - :v0;`);
  if (!json(f.r)?.ok) return f.r;
  return espera(f, { filas: "0", version: "1" });
});

caso("10 · corregir sin cambiar nada por la RPC directa: no pide permisos ni toca la versión", () => {
  const f = correr(`select version as v0 from retail.productos where id = :'pb' \\gset
${sesion(NADIE)}${corregir("pb", "b_negs", `'{"color_codigo":"NEG"}'`)}${COMO_POSTGRES}
select 'version', (select version from retail.productos where id = :'pb') - :v0;`);
  if (!json(f.r)?.ok) return f.r;
  return espera(f, { version: "0" });
});

// ===========================================================================
// 11 · Intercambio
// ===========================================================================

caso("11 · intercambiar S↔M en un guardado: variante_ya_existe y nada cambia", () => {
  const f = correr(`${HUELLA("pb", "antes")}${sesion(MICAELA)}
${guardar("pb", [cambio("b_azms", { talla_id: ":'t_m'" }), cambio("b_azmm", { talla_id: ":'t_s'" })])}
${COMO_POSTGRES}${HUELLA("pb", "despues")}`);
  return error(json(f.r), "variante_ya_existe") ?? (f.antes === f.despues ? null : "la prenda cambió");
});

// ===========================================================================
// 12 · Versión
// ===========================================================================

caso("12 · corregir sube la versión (y la devuelve); guardar después con la versión vieja da PT409", () => {
  const f = correr(`select version as v0 from retail.productos where id = :'pa' \\gset
${sesion(MICAELA)}
${guardar("pa", [cambio("a_s", { color_codigo: "'NEG'" }), cambio("a_m", { color_codigo: "'NEG'" }), cambio("a_l", { color_codigo: "'NEG'" })], ":v0")}
${guardar("pa", [], ":v0").replace("'r'", "'r2'")}
${COMO_POSTGRES}
select 'actual', version from retail.productos where id = :'pa';
select 'sube', ((select version from retail.productos where id = :'pa') > :v0)::text;`);
  const r = json(f.r);
  if (!r?.ok) return f.r;
  if (String(r.version) !== f.actual) return `devolvió ${r.version}, la actual es ${f.actual}`;
  return error(json(f.r2), "version_cambiada", "PT409") ?? espera(f, { sube: "true" });
});

caso("12 · una corrección directa (fn_corregir_identidad_variante) sube la versión: la ficha abierta antes recibe PT409", () => {
  const f = correr(`select version as v0 from retail.productos where id = :'pb' \\gset
${sesion(FELIPE)}
${corregir("pb", "b_azml", `'{"color_codigo":"BEI"}'`)}
${guardar("pb", [], ":v0").replace("'r'", "'r2'")}
${COMO_POSTGRES}
select 'version', (select version from retail.productos where id = :'pb') - :v0;
select 'color', color_codigo from retail.variantes where id = :'b_azml';`);
  if (!json(f.r)?.ok) return f.r;
  return error(json(f.r2), "version_cambiada", "PT409") ?? espera(f, { version: "1", color: "BEI" });
});

// ===========================================================================
// 13 · fn_variantes_estado
// ===========================================================================

caso("13 · fn_variantes_estado: stock por sede (por nombre, sin ceros), apartado, vendida y separada", () => {
  const f = correr(`${COMO_POSTGRES}
select pg_temp.entrada(:'a_s', :'lim', :'alm_l', 2) as _e \\gset
update retail.stock set cantidad_apartada = 1 where variante_id = :'a_s' and ubicacion_id = :'tru';
${sesion(MICAELA)}
select 'a', (select jsonb_object_agg(e ->> 'variante_id', e - 'variante_id') from jsonb_array_elements(retail.fn_variantes_estado(:'pa')) e)::text;
select 'n_b', jsonb_array_length(retail.fn_variantes_estado(:'pb'));
select 'vendida_b', (select string_agg((e ->> 'vendida'), ',' order by (e ->> 'variante_id') = :'b_negs' desc, e ->> 'variante_id')
  from jsonb_array_elements(retail.fn_variantes_estado(:'pb')) e);
select 'separada_c', (select e ->> 'vendida' from jsonb_array_elements(retail.fn_variantes_estado(:'pc')) e where e ->> 'variante_id' = :'c_beil');
select 'sin_stock', (select (e -> 'sedes')::text || ':' || (e ->> 'stock') from jsonb_array_elements(retail.fn_variantes_estado(:'pb')) e where e ->> 'variante_id' = :'b_azms');
${COMO_POSTGRES}
select 'esperado_s', jsonb_build_object('stock', 10, 'apartado', 1, 'vendida', false, 'sedes', jsonb_build_array(
  jsonb_build_object('ubicacion_id', :'lim', 'nombre', 'Tienda Lima', 'cantidad', 2),
  jsonb_build_object('ubicacion_id', :'tru', 'nombre', 'Tienda Trujillo', 'cantidad', 8)))::text;
select 'esperado_m', jsonb_build_object('stock', 5, 'apartado', 0, 'vendida', false, 'sedes', jsonb_build_array(
  jsonb_build_object('ubicacion_id', :'tru', 'nombre', 'Tienda Trujillo', 'cantidad', 5)))::text;
select 'id_s', :'a_s';
select 'id_m', :'a_m';`);
  const a = json(f.a);
  if (JSON.stringify(a[f.id_s]) !== JSON.stringify(json(f.esperado_s))) return `S: ${JSON.stringify(a[f.id_s])}\n   esperado ${f.esperado_s}`;
  if (JSON.stringify(a[f.id_m]) !== JSON.stringify(json(f.esperado_m))) return `M: ${JSON.stringify(a[f.id_m])}\n   esperado ${f.esperado_m}`;
  return espera(f, { n_b: "5", vendida_b: "true,false,false,false,false", separada_c: "true", sin_stock: "[]:0" });
});

caso("13 · fn_variantes_estado: '[]' a quien no edita el catálogo; anon no la ejecuta", () => {
  const f = correr(`${sesion(NADIE)}select 'r', retail.fn_variantes_estado(:'pa')::text;
${COMO_POSTGRES}select 'anon', has_function_privilege('anon', 'retail.fn_variantes_estado(uuid)', 'execute')::text;`);
  return espera(f, { r: "[]", anon: "false" });
});

// ===========================================================================
// 14 · fn_productos: la foto general cuando el color no tiene la suya
// ===========================================================================

caso("14 · fn_productos: el Beige (sin foto propia) muestra la general; el Negro, la suya", () => {
  const f = correr(`${sesion(MICAELA)}
select 'bei', foto_url from retail.fn_productos(p_busqueda => 'ZZ Body Fotos Prueba') where variante_id = :'c_beil';
select 'neg', foto_url from retail.fn_productos(p_busqueda => 'ZZ Body Fotos Prueba') where variante_id = :'c_negs';`);
  return espera(f, { bei: "https://prueba.local/general.jpg", neg: "https://prueba.local/negro.jpg" });
});

// ===========================================================================
// 15 · Activar y desactivar dejan rastro
// ===========================================================================

caso("15 · desactivar y reactivar una variante deja dos filas 'activo' en su historial, firmadas", () => {
  const f = correr(`${sesion(MICAELA)}
${guardar("pb", [cambio("b_azml", { activo: "false" })])}
${guardar("pb", [cambio("b_azml", { activo: "true" })]).replace("'r'", "'r2'")}
${COMO_POSTGRES}
select 'activo', string_agg(valor_anterior || '>' || valor_nuevo, ',' order by created_at, valor_anterior desc)
  from retail.historial_producto_cambios where entidad = 'variante' and entidad_id = :'b_azml' and campo = 'activo';
select 'firma', bool_and(usuario_id = :'micaela')::text from retail.historial_producto_cambios where entidad_id = :'b_azml' and campo = 'activo';`);
  if (!json(f.r)?.ok || !json(f.r2)?.ok) return `${f.r} / ${f.r2}`;
  return espera(f, { activo: "true>false,false>true", firma: "true" });
});

// ===========================================================================
// + Permisos, variante ajena, guarda y re-pegado
// ===========================================================================

caso("+ sin permiso de catálogo, corregir de verdad por la RPC da 42501 (catalogo_sin_permiso)", () => {
  const f = correr(`${sesion(NADIE)}${corregir("pb", "b_azml", `'{"color_codigo":"BEI"}'`)}`);
  return error(json(f.r), "catalogo_sin_permiso", "42501");
});

caso("+ una variante de otra prenda: variante_de_otra_prenda", () => {
  const f = correr(`${sesion(FELIPE)}${corregir("pa", "b_azml", `'{"color_codigo":"BEI"}'`)}`);
  return error(json(f.r), "variante_de_otra_prenda");
});

caso("+ permisos: authenticated ejecuta corregir y estado; anon no; fn_codigo_variante_libre no la ejecuta la API", () => {
  const f = correr(`${COMO_POSTGRES}
select 'permisos', concat_ws(',',
  has_function_privilege('authenticated', 'retail.fn_corregir_identidad_variante(uuid, uuid, jsonb)', 'execute'),
  has_function_privilege('anon', 'retail.fn_corregir_identidad_variante(uuid, uuid, jsonb)', 'execute'),
  has_function_privilege('authenticated', 'retail.fn_variantes_estado(uuid)', 'execute'),
  has_function_privilege('authenticated', 'retail.fn_codigo_variante_libre(text, uuid)', 'execute'),
  has_function_privilege('anon', 'retail.fn_codigo_variante_libre(text, uuid)', 'execute'));`);
  return espera(f, { permisos: "t,f,t,f,f" });
});

caso("+ la guarda: con dos variantes iguales ya existentes («Sin color», sin talla), la migración aborta nombrándolas en vez de un 23505 anónimo", () => {
  try {
    psql(`begin;
drop index retail.variantes_identidad_unica;
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Guarda Duplicados', 'activo', marca_id, proveedor_id from retail.marca_proveedores order by created_at limit 1
  returning id as p \\gset
insert into retail.variantes (producto_id, precio) values (:'p', 10), (:'p', 10);
${MIGRACION}
rollback;`);
    return "la migración pasó con duplicados";
  } catch (e) {
    const msg = String(e.stderr ?? e.message);
    if (!msg.includes("20260928235500: hay variantes repetidas") || !msg.includes("GEN-")) return msg.split("\n").slice(0, 4).join("\n");
  }
});

caso("+ la migración se puede pegar dos veces: un candado, un índice, cada función parchada una sola vez", () => {
  const salida = psql(`begin;\n${MIGRACION}\n${MIGRACION}
select 'x', (select count(*) from pg_trigger where tgname = 'variantes_identidad_solo_por_funcion')
  || ',' || (select count(*) from pg_indexes where indexname = 'variantes_identidad_unica')
  || ',' || (select count(*) from pg_constraint where conname = 'variantes_producto_talla_color_unico')
  || ',' || (select string_agg(((length(prosrc) - length(replace(prosrc, '20260928235500', ''))) / 14)::text, ',' order by proname)
               from pg_proc where pronamespace = 'retail'::regnamespace
                and proname in ('catalogo_actualizar_producto', 'fn_asignar_codigo_variante', 'fn_productos', 'fn_registrar_cambio_producto'));
rollback;`);
  const linea = salida.split("\n").find((l) => l.startsWith("x|"));
  // catalogo_actualizar_producto lleva la marca en sus 4 bloques (candados, corrección, color de la nueva, mezcla); las
  // otras, en 1.
  if (linea !== "x|1,1,0,4,1,1,1") return `salió ${linea}`;
});

// ===========================================================================
// 16 · Candados (T8): dos sesiones reales
// ===========================================================================
// Las dos sesiones terminan en ROLLBACK y trabajan sobre una prenda YA commiteada de la semilla (la escena de arriba no
// sirve: nadie más la ve, y armarla toma catalogo_version). Se elige una variante con color de una prenda activa sin
// «Sin color», y un color activo que la prenda no tiene (la corrección no choca con nada).
function prendaDeLaCarrera() {
  return filasDe(
    psql(`
with elegida as (
  select v.id as v, v.producto_id as p,
         (select co.codigo from retail.colores co
           where co.activo and not exists (select 1 from retail.variantes o where o.producto_id = v.producto_id and o.color_codigo = co.codigo)
           order by co.codigo limit 1) as c
    from retail.variantes v join retail.productos pr on pr.id = v.producto_id
   where v.activo and v.color_codigo is not null and pr.estado = 'activo'
     and not exists (select 1 from retail.variantes o where o.producto_id = v.producto_id and o.color_codigo is null)
   order by pr.codigo, v.id limit 1),
lugar as (select ubicacion_id as u, id as sub from retail.sububicaciones where tipo = 'almacen_tienda' order by ubicacion_id, id limit 1)
select 'v', v::text from elegida union all select 'p', p::text from elegida union all select 'c', c from elegida
union all select 'u', u::text from lugar union all select 'sub', sub::text from lugar;`),
  );
}
/** Una operación de la tienda que ya citó la variante (su inserción toma FOR KEY SHARE) y la tiene tomada un rato. */
const TIENE_LA_VARIANTE = (d, despues) => `begin;
${FUNCIONES}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values ('${d.v}', '${d.u}', '${d.sub}', 'entrada', 2, 'produccion') returning id as mov \\gset
select 'a_toma', extract(epoch from clock_timestamp());
${despues}
select 'a_suelta', extract(epoch from clock_timestamp());
rollback;
`;
/** La ficha de Felipe (líder) guarda esa prenda con su versión; `cambios` como los manda la pantalla. */
const LA_FICHA = (d, cambios) => `begin;
${FUNCIONES}
set local lock_timeout = '10s';
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
select version as ver from retail.productos where id = '${d.p}' \\gset
set local role authenticated;
select 'b_empieza', extract(epoch from clock_timestamp());
select 'r', pg_temp.guardar('${d.p}', pg_temp.ficha('${d.p}', ${cambios}), :ver);
select 'b_termina', extract(epoch from clock_timestamp());
reset role;
select 'color', color_codigo from retail.variantes where id = '${d.v}';
rollback;
`;

await casoAsync("16 · el Taller cierra una producción (movimiento y después costo) mientras Felipe corrige el color de esa variante: ninguna de las dos cae con 40P01", async () => {
  const d = prendaDeLaCarrera();
  if (!d.v || !d.c || !d.sub) return `la semilla no trae una prenda para la carrera: ${JSON.stringify(d)}`;
  // A toma la variante al insertar el movimiento; 1,5 s después recalcula el costo (update de la variante y
  // catalogo_version), como cerrar_produccion. B entra en medio. Con la variante bloqueada DESPUÉS de catalogo_version
  // (la primera versión de ADR-0257), A caía con «deadlock detected … catalogo_version».
  const a = sesionParalela(
    TIENE_LA_VARIANTE(
      d,
      `select pg_sleep(1.5);
select 'a', pg_temp.intento(format('select retail.fn_recalcular_costo_variante(%L, 2, 15, %L, %L)', '${d.v}', 'produccion', :'mov'));`,
    ),
  );
  await dormir(500);
  const b = sesionParalela(LA_FICHA(d, `jsonb_build_array(jsonb_build_object('id', '${d.v}', 'color_codigo', '${d.c}'))`));
  const [ra, rb] = await Promise.all([a, b]);
  if (ra.code || rb.code) return `A (${ra.code}): ${ra.err}\nB (${rb.code}): ${rb.err}`;
  if (!json(ra.filas.a)?.ok) return `el cierre de producción cayó: ${ra.filas.a}`;
  if (!json(rb.filas.r)?.ok) return `la ficha cayó: ${rb.filas.r}`;
  if (!(Number(rb.filas.b_empieza) < Number(ra.filas.a_suelta))) return "no hubo carrera: la ficha empezó cuando el cierre ya había soltado";
  return espera(rb.filas, { color: d.c });
});

await casoAsync("16 · la ficha vieja (manda el mismo color y talla de todas) no espera a una operación que tiene tomada una de sus variantes", async () => {
  const d = prendaDeLaCarrera();
  // A tiene la variante 2 s. B guarda la ficha sin corregir nada: no debe bloquear ninguna variante (antes, cada
  // guardado tomaba FOR UPDATE de todas y esperaba a A entero).
  const a = sesionParalela(TIENE_LA_VARIANTE(d, "select pg_sleep(2);"));
  await dormir(500);
  const b = sesionParalela(LA_FICHA(d, "'[]'::jsonb"));
  const [ra, rb] = await Promise.all([a, b]);
  if (ra.code || rb.code) return `A (${ra.code}): ${ra.err}\nB (${rb.code}): ${rb.err}`;
  if (!json(rb.filas.r)?.ok) return `la ficha cayó: ${rb.filas.r}`;
  if (!(Number(rb.filas.b_empieza) < Number(ra.filas.a_suelta))) return "no hubo carrera: la ficha empezó cuando A ya había soltado";
  if (!(Number(rb.filas.b_termina) < Number(ra.filas.a_suelta)))
    return `la ficha esperó a A: terminó ${(Number(rb.filas.b_termina) - Number(ra.filas.a_suelta)).toFixed(3)} s después de que A soltó`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);

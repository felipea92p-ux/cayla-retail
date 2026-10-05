#!/usr/bin/env node
/**
 * Prueba de `scripts/purga/purgar-producto-de-prueba.sql` (ADR-0224): deshacer POR COMPLETO un producto de prueba y los
 * documentos de prueba que lo tocaron (ventas, separaciones, compras), sin dejar el libro de movimientos descuadrado y
 * sin tocar jamás un comprobante que llegó a SUNAT en producción.
 *
 * DOS ESCENARIOS
 *   · «Top Aurora» (el caso real del 2026-09-26): un producto con dos variantes, cada una con una reposición (ajuste) al
 *     piso; UNA venta con una nota interna donde el producto va MEZCLADO con prendas de otros productos; y una serie de
 *     notas cuyo número siguiente ya avanzó.
 *   · «Con documentos» (los 4 productos reales del 2026-09-28: Polo Básico, Blusa Carlita, Test de Produto 2, Blusa Xd):
 *     carga inicial al almacén, bajada al piso, movimiento interno piso → almacén con su marca de reintento, una línea de
 *     conteo con su ajuste (en un conteo que también cuenta otra prenda), un pedido no atendido; una venta con nota
 *     interna mezclada con otra prenda, una venta con boleta del entorno de pruebas de SUNAT (sandbox), una separación
 *     entregada (boleta de anticipo + boleta de la entrega que descuenta el anticipo) y otra abierta; una compra a crédito
 *     repartida entre dos tiendas, reasignada, recibida en parte (envío, lote, costo) y con un faltante cerrado. Y, al
 *     lado, una venta de OTRA prenda con una boleta que llegó a SUNAT en PRODUCCIÓN, que no se toca nunca.
 *
 * QUÉ CUBRE
 *   · ENSAYO (el modo por defecto): termina con una excepción que trae el resumen y NO deja nada escrito (la base entera,
 *     tabla por tabla, es la misma de antes).
 *   · DEFINITIVO: todo lo del producto y sus documentos desaparece; las prendas de OTROS productos vuelven exactamente a su
 *     stock de antes de la venta; la serie de notas vuelve a su número y la de boletas NO; queda una línea en Actividad por
 *     documento y otra por el producto; el libro de movimientos cuadra con el stock en TODA la base; los candados de
 *     historial vuelven a su modo (movimientos en ALWAYS); la boleta de producción, la caja y la línea de conteo de la
 *     otra prenda siguen idénticas.
 *   · RESPALDO: restaurarlo con `restaurar-purga.sql` devuelve la base a como estaba, FILA POR FILA en todas las tablas
 *     (menos Actividad, el historial del producto y la versión del catálogo, que solo avanzan).
 *   · RECHAZOS (no se borra nada, y el mensaje dice qué impide): el producto en otra venta, separación o compra no
 *     nombrada; un documento nombrado que no tiene el producto; una separación o compra con otras prendas; una
 *     separación pagada en efectivo; una compra con un pago; un comprobante que llegó a SUNAT en producción (LA LÍNEA
 *     ROJA); uno que intentó salir sin decir a qué entorno; uno que se está enviando ahora; una venta anulada; un aviso a
 *     la clienta (una tabla que cita la separación); una mención SIN llave foránea (una proforma); un libro que ya no
 *     cuadraba; parámetros faltantes; el producto o la venta inexistentes.
 *   · LA SERIE de notas no retrocede si la nota purgada NO era la última: sin huecos ni repetidos.
 *   · Repetirla no hace nada: el producto ya no existe.
 *
 * CÓMO. Cada caso arma el escenario con las funciones reales (`crear_producto_con_variantes`, `registrar_venta`,
 * `bajar_al_piso`, `separar_prendas`, `entregar_separacion`, `registrar_compra`, `recibir_envio`…), corre el script SIN su
 * begin/commit (marcados [[transaccion]]) dentro de la transacción de la prueba y termina SIEMPRE en ROLLBACK: la base
 * local compartida no queda con nada.
 *
 * USO
 *   pnpm pruebas:purgar-producto    → con las migraciones ya aplicadas en el Postgres local
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

// El script tal cual, sin su begin/commit: la prueba lo envuelve en su propia transacción con ROLLBACK.
// `PURGA_SCRIPT`: apunta la prueba a una copia mutada del script (prueba de mutación: la prueba TIENE que ponerse en rojo).
const CUERPO = readFileSync(process.env.PURGA_SCRIPT ?? join(RAIZ, "scripts/purga/purgar-producto-de-prueba.sql"), "utf8").replace(/^(begin|commit);.*\[\[transaccion\]\].*$/gm, "").split("-- [[resumen-final]]")[0];
// En producción el script corre en su propia transacción, con la escena ya confirmada: se disparan antes los disparadores
// diferidos de Actividad (ADR-0207), o su «alter table … disable trigger» choca con los eventos pendientes de la escena.
// Solo esos: las demás comprobaciones diferidas siguen al final, como en producción.
const CUERPO_TRAS_LA_ESCENA = `set constraints retail.trg_actividad_movimientos, retail.trg_actividad_conteo_nuevo, retail.trg_actividad_traslado_nuevo immediate;\n${CUERPO}`;
const RESTAURAR = readFileSync(process.env.RESTAURAR_SCRIPT ?? join(RAIZ, "scripts/purga/restaurar-purga.sql"), "utf8").replace(/^(begin|commit);.*\[\[transaccion\]\].*$/gm, "");
// Para volver a correrlo dentro de la misma transacción (lo temporal del script ya existe).
const LIMPIAR = `drop table if exists zz_prod, zz_var, zz_venta, zz_sep, zz_compra, zz_item, zz_compra_item, zz_comp, zz_mov, zz_borrar, zz_hoja,
  zz_tablas, zz_sunat_produccion, zz_purga, zz_restaura, zz_candado, zz_resumen, zz_traslado, zz_traslado_item, zz_traslado_recep, zz_proforma;
drop function if exists pg_temp.libro_descuadra(), pg_temp.lista(text), pg_temp.fuera_de_la_lista(text, text);
`;

function psql(sql, tolerante = false) {
  const r = spawnSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", `ON_ERROR_STOP=${tolerante ? 0 : 1}`, "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  return { estado: r.status, salida: (r.stdout ?? "").trim(), err: r.stderr ?? "" };
}
/** Corre y devuelve las líneas de salida; `err` trae lo que psql escribió por su canal de errores (avisos y errores). */
function correr(sql, tolerante = false) {
  const r = psql(`${sql}\nrollback;\n`, tolerante);
  return { ok: r.estado === 0, lineas: r.salida ? r.salida.split("\n") : [], err: r.err };
}

// La base entera, tabla por tabla (una línea «tabla:md5» por tabla de retail): para probar que un ensayo no dejó nada y
// que restaurar devuelve cada fila. `p_excluir`: las tablas que solo avanzan (Actividad, historial, versión del catálogo).
const FOTO = `
create or replace function pg_temp.foto(p_excluir text[] default '{}') returns text language plpgsql as $f$
declare r record; v text; v_todo text := '';
begin
  for r in select c.relname from pg_class c where c.relnamespace = 'retail'::regnamespace and c.relkind = 'r'
             and c.relname <> all (p_excluir) order by 1 loop
    execute format('select md5(coalesce(string_agg(to_jsonb(t)::text, '','' order by to_jsonb(t)::text), '''')) from retail.%I t', r.relname) into v;
    v_todo := v_todo || r.relname || ':' || v || ' ';
  end loop;
  return v_todo;
end $f$;
-- Qué tablas cambiaron entre dos fotos (vacío si ninguna).
create or replace function pg_temp.distintas(a text, b text) returns text language sql as $f$
  select coalesce(string_agg(x, ','), '') from (
    select split_part(e, ':', 1) as x from unnest(string_to_array(btrim(a), ' ')) e
    except
    select split_part(e, ':', 1) from unnest(string_to_array(btrim(a), ' ')) e where e = any (string_to_array(btrim(b), ' '))) d
$f$;
`;
const QUEDAN_IGUAL = "array['actividad', 'historial_producto_cambios', 'catalogo_version']";

/**
 * El escenario «Top Aurora». `nota`: la venta lleva nota interna (`true`) o boleta (`false`). Deja estas variables psql:
 * ubic, prod, cod_prod, va, vb (variantes del producto), o1, o2 (prendas de otros productos), pre_o1, pre_o2 (su stock
 * ANTES de la venta), venta, serie_nv, num_nv (la nota), nombre_purga (el del respaldo), caja_id.
 */
const escena = ({ nota = true } = {}) => `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
-- Una serie de notas de venta en Lima (Trujillo ya trae la suya en producción; el seed de Lima no): empieza en el 3.
insert into retail.series_comprobantes (tipo, serie, ubicacion_id, siguiente_numero)
  select 'nota_venta', 'NV09', :'ubic', 3
  where not exists (select 1 from retail.series_comprobantes where tipo = 'nota_venta' and ubicacion_id = :'ubic');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba purga') as caja_id \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
select id as sub_alm from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset
-- El producto de prueba, con dos variantes.
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and (select count(*) from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id) >= 2
  order by c.nombre limit 1 \\gset
select t.id as t1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select t.id as t2 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id offset 1 limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
select retail.crear_producto_con_variantes('Top Purga Prueba', :'cat', jsonb_build_array(
    jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'precio', 65, 'costo', 20),
    jsonb_build_object('talla_id', :'t2', 'color_codigo', :'c1', 'precio', 65, 'costo', 20)),
  null, gen_random_uuid(), null, null, false, null, :'marca', :'prov') as prod \\gset
select codigo as cod_prod from retail.productos where id = :'prod' \\gset
select id as va from retail.variantes where producto_id = :'prod' order by codigo limit 1 \\gset
select id as vb from retail.variantes where producto_id = :'prod' order by codigo offset 1 limit 1 \\gset
-- La reposición: un ajuste al piso por variante (como los 8 de Top Aurora).
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo) values (:'va', :'ubic', :'sub_piso', 'ajuste', 10, 'reposicion') returning id as m1 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo) values (:'vb', :'ubic', :'sub_piso', 'ajuste', 10, 'reposicion') returning id as m2 \\gset
select retail.fn_aplicar_movimiento(:'m2') as _2 \\gset
-- Otras prendas (de otros productos) con su stock.
select id as o1, precio as p1 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as o2, precio as p2 from retail.variantes where sku <> 'BLU-EMMA-NEG-M' and producto_id <> :'prod' and precio is not null order by sku limit 1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo) values (:'o1', :'ubic', :'sub_piso', 'entrada', 5, 'colchon') returning id as m3 \\gset
select retail.fn_aplicar_movimiento(:'m3') as _3 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo) values (:'o2', :'ubic', :'sub_piso', 'entrada', 5, 'colchon') returning id as m4 \\gset
select retail.fn_aplicar_movimiento(:'m4') as _4 \\gset
select coalesce(sum(cantidad), 0) as pre_o1 from retail.stock where variante_id = :'o1' \\gset
select coalesce(sum(cantidad), 0) as pre_o2 from retail.stock where variante_id = :'o2' \\gset
-- LA venta de prueba: el producto (3 + 2 prendas) mezclado con otras prendas (1 + 2), en efectivo.
select retail.registrar_venta(:'ubic', jsonb_build_array(
    jsonb_build_object('variante_id', :'va', 'cantidad', 3, 'precio_unitario', 65, 'descuento_unitario', 0),
    jsonb_build_object('variante_id', :'vb', 'cantidad', 2, 'precio_unitario', 65, 'descuento_unitario', 0),
    jsonb_build_object('variante_id', :'o1', 'cantidad', 1, 'precio_unitario', :'p1', 'descuento_unitario', 0),
    jsonb_build_object('variante_id', :'o2', 'cantidad', 2, 'precio_unitario', :'p2', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 65 * 5 + :p1 + 2 * :p2)), null, gen_random_uuid(), ${
    nota ? "'nota_venta'" : "'boleta'"
  }) as venta \\gset
select serie as serie_nv, numero as num_nv from retail.comprobantes where venta_id = :'venta' \\gset
select 'purga ' || :'cod_prod' || ' ' || to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') as nombre_purga \\gset
${FOTO}
`;

/**
 * El escenario «con documentos» (los 4 productos reales del 2026-09-28, en uno). Deja, además de lo de arriba: v1 (nota
 * interna, mezclada con o2), v2 (boleta sandbox), s1 + v3 (separación entregada: boleta de anticipo y boleta de la
 * entrega), s2 (separación abierta), compra + compra_item + envio_id + lote_id, conteo + ci_otro (la línea de la otra
 * prenda), v_real + comp_real (la boleta de OTRA prenda que llegó a SUNAT en producción), serie_bol (la serie de boletas).
 */
const escenaDocs = () => `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select p.id as yo from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
insert into retail.series_comprobantes (tipo, serie, ubicacion_id, siguiente_numero)
  select 'nota_venta', 'NV09', :'ubic', 3
  where not exists (select 1 from retail.series_comprobantes where tipo = 'nota_venta' and ubicacion_id = :'ubic');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba purga') as caja_id \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
select id as sub_alm from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and (select count(*) from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id) >= 2
  order by c.nombre limit 1 \\gset
select t.id as t1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select t.id as t2 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id offset 1 limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
select retail.crear_producto_con_variantes('Polo Purga Docs', :'cat', jsonb_build_array(
    jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'precio', 50, 'costo', 20),
    jsonb_build_object('talla_id', :'t2', 'color_codigo', :'c1', 'precio', 50, 'costo', 20)),
  null, gen_random_uuid(), null, null, false, null, :'marca', :'prov') as prod \\gset
select codigo as cod_prod from retail.productos where id = :'prod' \\gset
select id as va from retail.variantes where producto_id = :'prod' order by codigo limit 1 \\gset
select id as vb from retail.variantes where producto_id = :'prod' order by codigo offset 1 limit 1 \\gset
-- Carga inicial al almacén (como Test de Produto 2).
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id) values (:'va', :'ubic', :'sub_alm', 'entrada', 10, 'carga_inicial', :'yo') returning id as m1 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id) values (:'vb', :'ubic', :'sub_alm', 'entrada', 10, 'carga_inicial', :'yo') returning id as m2 \\gset
select retail.fn_aplicar_movimiento(:'m2') as _2 \\gset
-- Bajada al piso (traslado almacén → piso con su bajada y sus líneas).
select retail.bajar_al_piso(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'va', 'cantidad', 6), jsonb_build_object('variante_id', :'vb', 'cantidad', 6)), gen_random_uuid()) as bajada \\gset
-- Un movimiento interno piso → almacén con su marca de reintento (como Blusa Carlita).
select retail.mover_entre_piso_y_almacen(:'ubic', :'va', 1, :'sub_piso', :'sub_alm', null, gen_random_uuid()) as mint \\gset
-- Una línea del cuadre del piso (ADR-0328) sobre ese traslado interno: la purga la conoce, la respalda y la devuelve. Su
-- cabecera (la fecha del cuadre de la sede) no cita al producto y se queda.
insert into retail.cuadres_piso (ubicacion_id, persona_id, token_cliente, huella, escaneo_desde, resumen, nota)
  values (:'ubic', :'yo', gen_random_uuid(), md5('purga'), now(), '{}'::jsonb, 'prueba de la purga') returning id as cuadre \\gset
insert into retail.cuadre_piso_items (movimiento_id, cuadre_id, variante_id, sentido, cantidad) values (:'mint', :'cuadre', :'va', 'al_almacen', 1);
-- Otras prendas (de otros productos) con su stock.
select id as o1, precio as p1 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as o2, precio as p2 from retail.variantes where sku <> 'BLU-EMMA-NEG-M' and producto_id <> :'prod' and precio is not null order by sku limit 1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo) values (:'o1', :'ubic', :'sub_piso', 'entrada', 5, 'colchon') returning id as m3 \\gset
select retail.fn_aplicar_movimiento(:'m3') as _3 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo) values (:'o2', :'ubic', :'sub_piso', 'entrada', 5, 'colchon') returning id as m4 \\gset
select retail.fn_aplicar_movimiento(:'m4') as _4 \\gset
select coalesce(sum(cantidad), 0) as pre_o2 from retail.stock where variante_id = :'o2' \\gset
-- Un conteo con una línea del producto (con su ajuste) y otra de otra prenda (que se queda, con la cabecera).
insert into retail.conteos (ubicacion_id, sububicacion_id) values (:'ubic', :'sub_piso') returning id as conteo \\gset
insert into retail.conteo_items (conteo_id, variante_id, cantidad_sistema, cantidad_contada) values (:'conteo', :'vb', 6, 5) returning id as ci \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, conteo_item_id) values (:'vb', :'ubic', :'sub_piso', 'ajuste', -1, 'conteo_fisico', :'ci') returning id as m5 \\gset
select retail.fn_aplicar_movimiento(:'m5') as _5 \\gset
update retail.conteo_items set movimiento_id = :'m5' where id = :'ci';
insert into retail.conteo_items (conteo_id, variante_id, cantidad_sistema, cantidad_contada) values (:'conteo', :'o1', 5, 5) returning id as ci_otro \\gset
-- Un pedido que no se pudo atender.
insert into retail.pedidos_no_atendidos (ubicacion_id, producto_id) values (:'ubic', :'prod');
-- Dos renglones de la libreta de «Ya decidí» (Frescura del piso, ADR-0208 paso 4b): la purga la conoce, la respalda y la
-- devuelve; sin esto, un producto decidido pararía la purga («otra parte del sistema todavía lo usa»).
insert into retail.frescura_decisiones (ubicacion_id, producto_id, color_codigo, accion, plazo_dias, persona_id, token_cliente)
  values (:'ubic', :'prod', :'c1', 'cambie_lugar', 7, :'yo', gen_random_uuid()) returning id as fd1 \\gset
insert into retail.frescura_decisiones (ubicacion_id, producto_id, color_codigo, accion, anterior_id, anterior_accion, plazo_dias, persona_id, token_cliente)
  values (:'ubic', :'prod', :'c1', 'hasta_agotar', :'fd1', 'cambie_lugar', 12, :'yo', gen_random_uuid());
-- Venta 1: nota interna, el producto mezclado con otra prenda (esas 2 prendas vuelven a su stock).
select retail.registrar_venta(:'ubic', jsonb_build_array(
    jsonb_build_object('variante_id', :'va', 'cantidad', 1, 'precio_unitario', 50, 'descuento_unitario', 0),
    jsonb_build_object('variante_id', :'o2', 'cantidad', 2, 'precio_unitario', :'p2', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 50 + 2 * :p2)), null, gen_random_uuid(), 'nota_venta') as v1 \\gset
select serie as serie_nv, numero as num_nv from retail.comprobantes where venta_id = :'v1' \\gset
-- Venta 2: boleta que fue al entorno de pruebas de SUNAT (como B004-28).
select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'vb', 'cantidad', 1, 'precio_unitario', 50, 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 50)), null, gen_random_uuid(), 'boleta') as v2 \\gset
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox', enviado_at = now(), respuesta_sunat = '{"ok": true}' where venta_id = :'v2';
select serie as serie_bol from retail.comprobantes where venta_id = :'v2' \\gset
-- Separación 1, entregada: boleta de anticipo + boleta de la entrega que lo descuenta (como APT-TRU-0004). Separación 2,
-- abierta con su apartado (como APT-TRU-0005). Los adelantos, por Yape y tarjeta: no entran a la caja.
select retail.separar_prendas(p_ubicacion_id => :'ubic', p_items => jsonb_build_array(jsonb_build_object('variante_id', :'va', 'cantidad', 1, 'precio_unitario', 50)),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 20)), p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Prueba',
  p_clienta_celular => '987111222', p_devolucion_medio => 'yape') as s1 \\gset
select retail.entregar_separacion(:'s1', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 30))) as v3 \\gset
select retail.separar_prendas(p_ubicacion_id => :'ubic', p_items => jsonb_build_array(jsonb_build_object('variante_id', :'vb', 'cantidad', 1, 'precio_unitario', 50)),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 15)), p_clienta_nombres => 'Bea', p_clienta_apellidos => 'Prueba',
  p_clienta_celular => '987111333', p_devolucion_medio => 'yape') as s2 \\gset
-- Compra: factura a crédito repartida entre Lima y Trujillo, reasignada, recibida en parte en Lima y con un faltante cerrado
-- (como F001-000022 de Blusa Xd).
select retail.registrar_compra(:'prov', 'F001', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), 'credito', :'ubic',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'va', 'descripcion', 'Polo', 'cantidad', 10, 'costo_unitario', 30,
     'destinos', jsonb_build_array(jsonb_build_object('ubicacion_id', :'ubic', 'cantidad', 5), jsonb_build_object('ubicacion_id', :'tru', 'cantidad', 5)))),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as compra \\gset
select id as compra_item from retail.compra_items where compra_id = :'compra' \\gset
select retail.reasignar_reparto_compra(:'compra_item', :'tru', :'ubic', 1, 'error_de_tienda') as _r \\gset
select retail.recibir_envio(:'ubic', jsonb_build_array(jsonb_build_object('compra_item_id', :'compra_item', 'variante_id', :'va', 'cantidad', 4)), p_token => gen_random_uuid()) as envio \\gset
select (:'envio'::jsonb ->> 'envio_id') as envio_id, (:'envio'::jsonb -> 'lotes' -> 0 ->> 'lote_id') as lote_id \\gset
select retail.cerrar_linea_compra(:'compra_item', 2, 'no_llego', null, :'ubic') as _cierre \\gset
-- Una venta de OTRA prenda con una boleta que llegó a SUNAT en producción (como B004-2): no se toca nunca.
select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'o1', 'cantidad', 1, 'precio_unitario', :'p1', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'p1')), null, gen_random_uuid(), 'boleta') as v_real \\gset
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'produccion', enviado_at = now(), respuesta_sunat = '{"ok": true}' where venta_id = :'v_real';
select id as comp_real, md5(to_jsonb(c)::text) as huella_real from retail.comprobantes c where venta_id = :'v_real' \\gset
select 'purga ' || :'cod_prod' || ' ' || to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') as nombre_purga \\gset
${FOTO}
`;

/** Los parámetros del script (y el modo, si es definitivo), dentro de la transacción. `null` deja el parámetro sin poner. */
const params = ({ producto = ":'cod_prod'", ventas = ":'venta'", separaciones = null, compras = null, definitivo = false } = {}) =>
  `select set_config('cayla_purga.producto', ${producto === null ? "''" : producto}, true) as _p \\gset
select set_config('cayla_purga.ventas', ${ventas === null ? "''" : ventas}, true) as _v \\gset
select set_config('cayla_purga.separaciones', ${separaciones === null ? "'-'" : separaciones}, true) as _s \\gset
select set_config('cayla_purga.compras', ${compras === null ? "'-'" : compras}, true) as _c \\gset
${definitivo ? "select set_config('cayla_purga.modo', 'definitivo', true) as _m \\gset\n" : ""}`;

// Los documentos del escenario «con documentos», tal como se nombran en producción.
const DOCS = {
  ventas: `:'v1' || ',' || :'v2' || ',' || :'v3'`,
  separaciones: `:'s1' || ',' || :'s2'`,
  compras: `:'compra'`,
};
const paramsDocs = (extra = {}) => params({ ...DOCS, ...extra });

const purgaDefinitiva = () => `${params({ definitivo: true })}${CUERPO_TRAS_LA_ESCENA}`;
const purgaDocsDefinitiva = () => `${paramsDocs({ definitivo: true })}${CUERPO_TRAS_LA_ESCENA}`;

// Lo que queda de la ficha y de la venta (todo en cero si la purga corrió).
const RESTOS = `select concat_ws(',',
  (select count(*) from retail.productos where codigo = :'cod_prod'),
  (select count(*) from retail.variantes where id in (:'va', :'vb')),
  (select count(*) from retail.codigos_barras where variante_id in (:'va', :'vb')),
  (select count(*) from retail.stock where variante_id in (:'va', :'vb')),
  (select count(*) from retail.movimientos where variante_id in (:'va', :'vb')),
  (select count(*) from retail.ventas where id = :'venta'),
  (select count(*) from retail.venta_items where venta_id = :'venta'),
  (select count(*) from retail.venta_pagos where venta_id = :'venta'),
  (select count(*) from retail.comprobantes where venta_id = :'venta'));`;
// Lo que existe ANTES de purgar: 1 producto, 2 variantes, 2 códigos, 2 stock, 4 movimientos del producto, 1 venta,
// 4 líneas, 1 pago, 1 comprobante.
const RESTOS_ANTES = "1,2,2,2,4,1,4,1,1";
const RESTOS_NADA = "0,0,0,0,0,0,0,0,0";

// Lo mismo para el escenario «con documentos»: producto | variantes | movimientos | stock | ventas | comprobantes |
// separaciones | apartados | pagos de separación | compra | líneas de compra | reparto | reasignaciones | cierres | lote |
// envío | costos | línea de conteo | bajadas | marcas de reintento | pedido no atendido | anticipos | líneas del cuadre del piso.
const RESTOS_DOCS = `select concat_ws(',',
  (select count(*) from retail.productos where id = :'prod'),
  (select count(*) from retail.variantes where producto_id = :'prod'),
  (select count(*) from retail.movimientos where variante_id in (:'va', :'vb')),
  (select count(*) from retail.stock where variante_id in (:'va', :'vb')),
  (select count(*) from retail.ventas where id in (:'v1', :'v2', :'v3')),
  (select count(*) from retail.comprobantes where venta_id in (:'v1', :'v2', :'v3') or separacion_id in (:'s1', :'s2')),
  (select count(*) from retail.separaciones where id in (:'s1', :'s2')),
  (select count(*) from retail.apartados where variante_id in (:'va', :'vb')),
  (select count(*) from retail.separacion_pagos where separacion_id in (:'s1', :'s2')),
  (select count(*) from retail.compras where id = :'compra'),
  (select count(*) from retail.compra_items where compra_id = :'compra'),
  (select count(*) from retail.compra_item_destinos where compra_item_id = :'compra_item'),
  (select count(*) from retail.compra_reasignaciones where compra_item_id = :'compra_item'),
  (select count(*) from retail.compra_item_cierres where compra_item_id = :'compra_item'),
  (select count(*) from retail.lotes where id = :'lote_id'),
  (select count(*) from retail.envios where id = :'envio_id'),
  (select count(*) from retail.costo_historial where variante_id in (:'va', :'vb')),
  (select count(*) from retail.conteo_items where id = :'ci'),
  (select count(*) from retail.bajada_piso_items where variante_id in (:'va', :'vb')),
  (select count(*) from retail.movimientos_internos_intentos where movimiento_id in (select id from retail.movimientos where variante_id in (:'va', :'vb'))),
  (select count(*) from retail.pedidos_no_atendidos where producto_id = :'prod'),
  (select count(*) from retail.comprobante_anticipos where comprobante_id in (select id from retail.comprobantes where venta_id = :'v3')),
  (select count(*) from retail.cuadre_piso_items where variante_id in (:'va', :'vb')));`;
// Antes: 1 producto, 2 variantes, 12 movimientos del producto (2 cargas, 2 bajadas, 1 interno, 1 ajuste de conteo,
// 3 salidas por venta, 2 apartados, 1 liberación… más la recepción), sus filas de stock, 3 ventas, 5 comprobantes,
// 2 separaciones, 2 apartados, 2 pagos de separación, la compra con su línea, 2 destinos, 1 reasignación, 1 cierre, 1 lote,
// 1 envío, 1 costo, 1 línea de conteo, 2 bajadas, 1 marca de reintento, 1 pedido no atendido, 1 anticipo, 1 línea del cuadre.
const RESTOS_DOCS_NADA = "0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0";

const SERIE = `(select siguiente_numero from retail.series_comprobantes where tipo = 'nota_venta' and serie = :'serie_nv')`;
const SERIE_BOL = `(select siguiente_numero from retail.series_comprobantes s where s.tipo = 'boleta' and s.serie = :'serie_bol' and s.ubicacion_id = :'ubic')`;
const LIBRO = "pg_temp.libro_descuadra()";
const CANDADOS = `(select string_agg(tgname::text || '=' || tgenabled::text, ',' order by tgname) from pg_trigger
   where tgname in ('movimientos_inmutables', 'movimientos_sin_truncate', 'bajada_piso_items_inmutables', 'movimientos_internos_intentos_inmutables',
                    'costo_historial_sin_update', 'compra_reasignaciones_inmutables', 'compra_item_cierres_inmutables'))`;
let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1500)}`);
  }
}
const ultimas = (r) => r.lineas;

function main() {
  const sonda = psql("select 1;");
  if (sonda.estado !== 0) {
    console.error(`No pude hablar con el Postgres local (${CONTENEDOR_LOCAL}):\n${sonda.err}`);
    process.exit(2);
  }
  const candadosAntes = psql(`select ${CANDADOS};`).salida;

  // ========================================================================================================
  // ESCENARIO «TOP AURORA» (el caso de 2026-09-26)
  // ========================================================================================================

  // 1. ENSAYO: el modo por defecto termina en excepción con el resumen y no deja nada escrito (ni el respaldo).
  {
    const r = correr(
      `${escena()}
${RESTOS}
select pg_temp.foto() as foto_antes \\gset
savepoint antes_del_ensayo;
${params()}${CUERPO_TRAS_LA_ESCENA}
rollback to savepoint antes_del_ensayo;
${RESTOS}
select count(*) from respaldo_purgas.filas;
select ${SERIE};
select '[' || pg_temp.distintas(:'foto_antes', pg_temp.foto()) || ']';`,
      true
    );
    const [antes, despues, respaldo, , distintas] = ultimas(r);
    esperar("ensayo: el escenario existe antes (1 producto, 2 variantes, 4 movimientos del producto, 1 venta, 4 líneas)", r.ok && antes === RESTOS_ANTES, r);
    esperar("ensayo: termina con una excepción que dice ENSAYO OK y trae el resumen", /ENSAYO OK — no quedó nada escrito/.test(r.err) && /productos 1 · variantes 2 · movimientos 6 · ventas 1 · líneas de venta 4 · pagos 1 · comprobantes 1 · prendas devueltas a stock \(en 2 filas\) 3/.test(r.err), r.err.slice(0, 900));
    esperar("ensayo: el resumen promete 0 filas descuadradas antes y después, y cita el respaldo", /0 filas descuadradas antes y 0 después/.test(r.err) && /respaldo_purgas\.filas, purga «purga /.test(r.err), r.err.slice(0, 900));
    esperar("ensayo: no queda nada escrito — todo sigue como estaba", r.ok && despues === RESTOS_ANTES, r);
    // Desde ADR-0252 el esquema `respaldo_purgas` lo crea una migración (existe siempre): lo que no puede quedar es una FILA.
    esperar("ensayo: no quedó ninguna fila de respaldo (la excepción la deshizo)", r.ok && respaldo === "0", r);
    esperar("ensayo: la base entera, tabla por tabla, es la misma de antes", r.ok && distintas === "[]", r);
  }

  // 2. DEFINITIVO: el producto y su venta desaparecen; lo ajeno vuelve a su stock; la serie retrocede; el libro cuadra.
  {
    const r = correr(
      `${escena()}
${RESTOS}
${purgaDefinitiva()}
${RESTOS}
select concat_ws(',', (select coalesce(sum(cantidad), 0) = :pre_o1 from retail.stock where variante_id = :'o1'), (select coalesce(sum(cantidad), 0) = :pre_o2 from retail.stock where variante_id = :'o2'));
select ${SERIE} = :num_nv;
select ${LIBRO};
select count(*) from retail.actividad where accion = 'prueba_deshecha' and registro_id = :'venta';
select count(*) from pg_trigger where tgrelid = 'retail.movimientos'::regclass and tgname in ('movimientos_inmutables', 'movimientos_sin_truncate') and tgenabled = 'A';
select tabla || ':' || n from (select tabla, count(*) as n from respaldo_purgas.filas where purga = :'nombre_purga' group by 1) x where tabla in ('productos', 'variantes', 'movimientos', 'ventas', 'venta_items', 'venta_pagos', 'comprobantes', 'series_comprobantes', 'stock_antes') order by 1;`
    );
    const l = ultimas(r);
    const [antes, despues, ajenas, serie, libro, actividad, candados, ...respaldo] = l;
    esperar("definitivo: antes de purgar existe todo", r.ok && antes === RESTOS_ANTES, r);
    esperar("definitivo: después NO queda nada — producto, variantes, códigos, stock, movimientos, venta, líneas, pagos, comprobante", r.ok && despues === RESTOS_NADA, r);
    esperar("definitivo: las prendas de OTROS productos vuelven EXACTAMENTE a su stock de antes de la venta", r.ok && ajenas === "t,t", r);
    esperar("definitivo: la serie de notas retrocede al número de la nota purgada (era la última)", r.ok && serie === "t", r);
    esperar("definitivo: el libro de movimientos cuadra con el stock en toda la base (0 descuadres)", r.ok && libro === "0", r);
    esperar("definitivo: queda UNA línea en Actividad que cuenta qué pasó con la venta", r.ok && actividad === "1", r);
    esperar("definitivo: los dos candados de movimientos quedaron en ALWAYS", r.ok && candados === "2", r);
    esperar(
      "definitivo: cada fila quedó respaldada (1 producto, 2 variantes, 6 movimientos, 1 venta, 4 líneas, 1 pago, 1 comprobante, 1 serie, 2 stocks de otras prendas)",
      r.ok &&
        JSON.stringify([...respaldo].sort()) ===
          JSON.stringify(["comprobantes:1", "movimientos:6", "productos:1", "series_comprobantes:1", "stock_antes:2", "variantes:2", "venta_items:4", "venta_pagos:1", "ventas:1"].sort()),
      r
    );
  }

  // 3. RESPALDO: restaurarlo con el script de restauración devuelve la base al estado de antes, fila por fila.
  {
    const tablas = ["productos", "variantes", "codigos_barras", "stock", "ventas", "venta_items", "movimientos", "venta_pagos", "comprobantes"];
    const iguales = (t) =>
      `(select coalesce(bool_and(exists (select 1 from retail.${t} x where to_jsonb(x) = f.fila)), false) from respaldo_purgas.filas f where f.purga = :'nombre_purga' and f.tabla = '${t}')`;
    const r = correr(
      `${escena()}
select (select sum(cantidad) from retail.stock where variante_id = :'o1') as post_o1, (select sum(cantidad) from retail.stock where variante_id = :'o2') as post_o2 \\gset
select ${SERIE} as serie_antes \\gset
select pg_temp.foto(${QUEDAN_IGUAL}) as foto_antes \\gset
${purgaDefinitiva()}
${RESTOS}
drop function pg_temp.libro_descuadra();
select set_config('cayla_purga.nombre', :'nombre_purga', true) as _n \\gset
${RESTAURAR}
${RESTOS}
select concat_ws(',', ${tablas.map(iguales).join(", ")});
select concat_ws(',', (select sum(cantidad) = :post_o1 from retail.stock where variante_id = :'o1'), (select sum(cantidad) = :post_o2 from retail.stock where variante_id = :'o2'), ${SERIE} = :serie_antes);
select ${LIBRO};
select count(*) from retail.actividad where accion = 'purga_restaurada' and registro_id = :'venta';
select current_setting('session_replication_role');
select '[' || pg_temp.distintas(:'foto_antes', pg_temp.foto(${QUEDAN_IGUAL})) || ']';`
    );
    const [nada, restos, filas, ajenas, libro, actividad, rol, distintas] = ultimas(r);
    esperar("respaldo: tras purgar no queda nada; tras restaurar vuelve el producto, la venta y todo (1,2,2,2,4,1,4,1,1)", r.ok && nada === RESTOS_NADA && restos === RESTOS_ANTES, r);
    esperar("respaldo: cada fila restaurada es IDÉNTICA a la respaldada (9 tablas, comparadas como jsonb)", r.ok && filas === tablas.map(() => "t").join(","), r);
    esperar("respaldo: el stock de las otras prendas y la serie vuelven a como estaban tras la venta", r.ok && ajenas === "t,t,t", r);
    esperar("respaldo: el libro de movimientos cuadra otra vez", r.ok && libro === "0", r);
    esperar("respaldo: queda una línea en Actividad que cuenta la restauración", r.ok && actividad === "1", r);
    esperar("respaldo: los disparadores vuelven a su modo normal (origin) al terminar", r.ok && rol === "origin", r);
    esperar("respaldo: la base entera vuelve a ser la de antes, tabla por tabla (salvo Actividad, historial y versión del catálogo)", r.ok && distintas === "[]", r);
  }

  // 4. Repetirla no hace nada: el producto ya no existe.
  {
    const r = correr(`${escena()}
${purgaDefinitiva()}
${LIMPIAR}
${params({ definitivo: true })}${CUERPO_TRAS_LA_ESCENA}`);
    esperar("repetir la purga: se rechaza — ya no hay un producto con ese código", !r.ok && /No encuentro exactamente un producto con código/.test(r.err), r);
  }

  // 5. RECHAZOS: no se borra nada, y el mensaje dice qué impide.
  const rechazo = (nombre, preparar, patron, opciones = {}) => {
    const r = correr(`${escena(opciones)}
${preparar}
${params()}${CUERPO_TRAS_LA_ESCENA}`);
    esperar(nombre, !r.ok && patron.test(r.err), r.err.slice(0, 1200));
    // Lo importante: nada quedó borrado. Misma corrida hasta la excepción, con un savepoint, y se compara lo de antes con lo de después.
    const s = correr(
      `${escena(opciones)}
${preparar}
${RESTOS}
savepoint s1;
${params()}${CUERPO_TRAS_LA_ESCENA}
rollback to savepoint s1;
${RESTOS}`,
      true
    );
    const [antes, despues] = s.lineas.slice(-2);
    esperar(`${nombre.split(":")[0]}: y no quedó nada borrado (lo de antes de correr el script es lo de después)`, s.ok && antes !== undefined && antes === despues && antes.startsWith("1,"), s);
  };

  rechazo(
    "rechazo: el producto también está en OTRA venta que no se pidió borrar",
    `select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'va', 'cantidad', 1, 'precio_unitario', 65, 'descuento_unitario', 0)),
       jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 65)), null, gen_random_uuid()) as otra \\gset`,
    /NO SE BORRA NADA[\s\S]*OTRAS ventas/
  );
  // Antes esto se rechazaba (venta_anulacion_items sin dueño reconocido, y su entrada de reversa contaba como
  // «otra prenda» sin salida simple). Ahora venta_anulacion_items es una hoja de la venta y la reversa se reconoce:
  // la purga tiene que dejar todo limpio, sin devolver el stock ajeno dos veces (5b lo comprueba solo).
  {
    const r = correr(
      `${escena()}
select retail.anular_venta(:'venta', 'prueba automatizada', (select jsonb_agg(jsonb_build_object('venta_item_id', vi.id, 'condicion', 'vendible')) from retail.venta_items vi where vi.venta_id = :'venta')) as _a \\gset
${RESTOS}
${purgaDefinitiva()}
${RESTOS}
select count(*) from retail.venta_anulacion_items where venta_id = :'venta';`
    );
    const [antes, despues, anulaciones] = ultimas(r);
    // 6 movimientos (no 4): anular_venta agrega una entrada de reversa por cada línea, y 2 de las 4 líneas son de este producto.
    esperar(
      "definitivo: una venta ya anulada por línea se purga limpio (venta_anulacion_items se va con ella, sin devolver el stock ajeno dos veces)",
      r.ok && antes === "1,2,2,2,6,1,4,1,1" && despues === RESTOS_NADA && anulaciones === "0",
      r
    );
  }
  rechazo(
    "rechazo: un cambio de prenda sobre esa venta (sus movimientos nacen de un cambio: historia con otro dueño)",
    `select id as item_va from retail.venta_items where venta_id = :'venta' and variante_id = :'va' \\gset
     select retail.registrar_cambio(:'item_va', :'ubic', :'vb', 1, null, gen_random_uuid()) as cambio_id \\gset`,
    /NO SE BORRA NADA[\s\S]*movimiento\(s\) del producto vienen de un traslado entre sedes, una devolución, un cambio[\s\S]*cambios citan a/
  );
  rechazo(
    "rechazo: si el stock ya NO cuadraba con los movimientos antes de empezar, no se toca nada",
    `update retail.stock set cantidad = cantidad + 1 where variante_id = :'o1' and sububicacion_id = :'sub_piso';`,
    /NO SE BORRA NADA[\s\S]*ya NO cuadraba/
  );
  rechazo(
    "rechazo: una mención SIN llave foránea (una proforma que lleva la variante escrita en su jsonb)",
    `insert into retail.proformas (ubicacion_id, items, total, numero)
       values (:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'va', 'cantidad', 1)), 65, (select coalesce(max(numero), 0) + 1 from retail.proformas));`,
    /NO SE BORRA NADA[\s\S]*proformas mencionan lo que se borraría \(sin llave foránea\)/
  );

  // 5b. Una boleta que NUNCA salió de la base ya no frena: se purga, y la serie de boletas no retrocede (es de SUNAT).
  {
    const r = correr(
      `${escena({ nota: false })}
select serie as serie_bol from retail.comprobantes where venta_id = :'venta' \\gset
select (select siguiente_numero from retail.series_comprobantes where tipo = 'boleta' and serie = :'serie_bol' and ubicacion_id = :'ubic') as bol_antes \\gset
${purgaDefinitiva()}
${RESTOS}
select (select siguiente_numero from retail.series_comprobantes where tipo = 'boleta' and serie = :'serie_bol' and ubicacion_id = :'ubic') = :bol_antes;`
    );
    const [restos, serieBol] = ultimas(r);
    esperar("boleta que nunca se envió (pendiente, sin intentos): se purga con su venta", r.ok && restos === RESTOS_NADA, r);
    esperar("y la serie de boletas NO retrocede: ese número pudo verlo el PSE", r.ok && serieBol === "t", r);
  }

  // 6. Parámetros y producto inexistente.
  {
    const r = correr(`${escena()}\n${params({ producto: null, ventas: null })}${CUERPO_TRAS_LA_ESCENA}`);
    esperar("parámetros faltantes: se rechaza con instrucciones", !r.ok && /Faltan parámetros/.test(r.err), r.err.slice(0, 600));
    const s = correr(`${escena()}\n${params({ producto: "'ZZZ-9999'" })}${CUERPO_TRAS_LA_ESCENA}`);
    esperar("un código de producto que no existe se rechaza", !s.ok && /No encuentro exactamente un producto con código «ZZZ-9999»/.test(s.err), s.err.slice(0, 600));
    const t = correr(`${escena()}\n${params({ ventas: "gen_random_uuid()::text" })}${CUERPO_TRAS_LA_ESCENA}`);
    esperar("un id de venta que no existe se rechaza (pedí 1 y encontré 0)", !t.ok && /Pedí 1 venta\(s\) y encontré 0/.test(t.err), t.err.slice(0, 600));
  }

  // 7. LA SERIE no retrocede si la nota purgada no era la última: sin huecos ni repetidos.
  {
    const r = correr(
      `${escena()}
-- Otra nota de venta, DESPUÉS, solo con otras prendas: la nota del producto de prueba ya no es la última de la serie.
select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'o1', 'cantidad', 1, 'precio_unitario', :'p1', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'p1')), null, gen_random_uuid(), 'nota_venta') as otra \\gset
select ${SERIE} as serie_antes \\gset
${purgaDefinitiva()}
${RESTOS}
select ${SERIE} = :serie_antes;
select count(*) from retail.comprobantes where venta_id = :'otra';
select ${LIBRO};`
    );
    const [restos, serieIgual, otra, libro] = ultimas(r);
    esperar("serie no última: se purga igual (la otra venta no se toca)", r.ok && restos === RESTOS_NADA && otra === "1", r);
    esperar("serie no última: el contador NO retrocede — no habría números repetidos", r.ok && serieIgual === "t", r);
    esperar("serie no última: el libro sigue cuadrando", r.ok && libro === "0", r);
  }

  // ========================================================================================================
  // ESCENARIO «CON DOCUMENTOS» (los 4 productos de 2026-09-28)
  // ========================================================================================================

  // 8. ENSAYO con documentos: el resumen cuenta cada clase de documento y la base queda exactamente igual.
  {
    const r = correr(
      `${escenaDocs()}
${RESTOS_DOCS}
select pg_temp.foto() as foto_antes \\gset
savepoint antes_del_ensayo;
${paramsDocs()}${CUERPO_TRAS_LA_ESCENA}
rollback to savepoint antes_del_ensayo;
${RESTOS_DOCS}
select '[' || pg_temp.distintas(:'foto_antes', pg_temp.foto()) || ']';`,
      true
    );
    const [antes, despues, distintas] = ultimas(r);
    esperar("docs · el escenario tiene de todo antes (ventas, comprobantes, separaciones, compra, lote, envío, costo, conteo, bajadas…)", r.ok && antes && !antes.split(",").includes("0"), r);
    esperar(
      "docs · ensayo: ENSAYO OK con el resumen de cada clase (3 ventas, 5 comprobantes: 1 nota, 1 sandbox, 3 sin enviar; 2 separaciones; 1 compra, lote, envío y costo)",
      /ENSAYO OK/.test(r.err) &&
        /ventas 3 · líneas de venta 4 · pagos 4 · comprobantes 5 · prendas devueltas a stock \(en 1 filas\) 2 · notas de venta internas 1 · comprobantes del entorno de pruebas de SUNAT 1 · comprobantes que nunca se enviaron 3 · separaciones 2 · pagos de separación 2 · apartados 2 · compras 1 · ingresos de proveedor \(lotes\) 1 · envíos 1 · costos registrados 1 · líneas de conteo 1 · líneas de bajada al piso 2 · pedidos no atendidos 1/.test(r.err),
      r.err.slice(0, 1500)
    );
    esperar("docs · ensayo: el resumen dice que la boleta de producción no se tocó", /comprobantes de SUNAT en producción: 1 antes y los mismos después/.test(r.err), r.err.slice(0, 1500));
    esperar("docs · ensayo: nada quedó escrito — la base entera, tabla por tabla, es la de antes", r.ok && despues === antes && distintas === "[]", r);
  }

  // 9. DEFINITIVO con documentos.
  {
    const r = correr(
      `${escenaDocs()}
select ${SERIE_BOL} as bol_antes \\gset
${purgaDocsDefinitiva()}
${RESTOS_DOCS}
select (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'o2') = :pre_o2;
select ${LIBRO};
select ${CANDADOS};
select (select md5(to_jsonb(c)::text) from retail.comprobantes c where c.id = :'comp_real') = :'huella_real', (select count(*) from retail.ventas where id = :'v_real');
select (select count(*) from retail.conteos where id = :'conteo') || ',' || (select count(*) from retail.conteo_items where id = :'ci_otro');
select ${SERIE} = :num_nv, (select siguiente_numero from retail.series_comprobantes where tipo = 'nota_venta' and serie = :'serie_nv');
select ${SERIE_BOL} = :bol_antes;
select string_agg(modulo || ':' || tabla, ',' order by modulo, tabla) from retail.actividad where accion = 'prueba_deshecha' and detalle ->> 'producto' = :'cod_prod';
select count(*) from retail.historial_producto_cambios where entidad_id = :'prod' and campo = 'eliminado';
select count(*) from retail.cajas where id = :'caja_id' and estado = 'abierta';`
    );
    const [restos, o2, libro, candados, real, conteo, serie, serieBol, actividad, historial, caja] = ultimas(r);
    esperar("docs · definitivo: no queda NADA del producto ni de sus documentos (23 clases de filas en cero)", r.ok && restos === RESTOS_DOCS_NADA, r);
    esperar("docs · definitivo: la otra prenda de la venta vuelve EXACTAMENTE a su stock de antes", r.ok && o2 === "t", r);
    esperar("docs · definitivo: el libro de movimientos cuadra con el stock en toda la base", r.ok && libro === "0", r);
    esperar("docs · definitivo: los 7 candados de historial quedaron en su modo (movimientos en ALWAYS)", r.ok && candados === candadosAntes, { candados, candadosAntes });
    esperar("docs · definitivo: LA LÍNEA ROJA — la boleta de producción y su venta siguen idénticas", r.ok && real === "t|1", r);
    esperar("docs · definitivo: el conteo y la línea de la otra prenda se quedan", r.ok && conteo === "1,1", r);
    esperar("docs · definitivo: la serie de notas retrocede (la nota era la última)", r.ok && serie.startsWith("t|"), r);
    esperar("docs · definitivo: la serie de boletas NO retrocede", r.ok && serieBol === "t", r);
    esperar(
      "docs · definitivo: una línea de Actividad por documento (3 ventas, 2 separaciones, 1 compra) y una por el producto, cada una en su módulo",
      r.ok && actividad === "apartados:separaciones,apartados:separaciones,facturas_compra:compras,productos:productos,vender:ventas,vender:ventas,vender:ventas",
      r
    );
    esperar("docs · definitivo: el historial del producto dice que se eliminó (igual que ADR-0252)", r.ok && historial === "1", r);
    esperar("docs · definitivo: la caja no se toca", r.ok && caja === "1", r);
  }

  // 10. RESPALDO con documentos: purgar y restaurar deja la base entera como estaba, fila por fila.
  {
    const r = correr(
      `${escenaDocs()}
${RESTOS_DOCS}
select pg_temp.foto(${QUEDAN_IGUAL}) as foto_antes \\gset
${purgaDocsDefinitiva()}
drop function pg_temp.libro_descuadra();
select set_config('cayla_purga.nombre', :'nombre_purga', true) as _n \\gset
${RESTAURAR}
${RESTOS_DOCS}
select '[' || pg_temp.distintas(:'foto_antes', pg_temp.foto(${QUEDAN_IGUAL})) || ']';
select string_agg(modulo || ':' || tabla, ',' order by modulo, tabla) from retail.actividad where accion = 'purga_restaurada' and detalle ->> 'purga' = :'nombre_purga';
select ${LIBRO};`
    );
    const [antes, despues, distintas, actividad, libro] = ultimas(r);
    esperar("docs · respaldo: tras restaurar vuelven todas las filas (mismos conteos que antes de purgar)", r.ok && despues === antes, r);
    esperar("docs · respaldo: la base entera vuelve a ser la de antes, tabla por tabla (salvo Actividad, historial y versión del catálogo)", r.ok && distintas === "[]", r);
    esperar(
      "docs · respaldo: una línea de Actividad por documento y otra por el producto cuentan la restauración",
      r.ok && actividad === "apartados:separaciones,apartados:separaciones,facturas_compra:compras,productos:productos,vender:ventas,vender:ventas,vender:ventas",
      r
    );
    esperar("docs · respaldo: el libro cuadra después de restaurar", r.ok && libro === "0", r);
  }

  // 10b. Restaurar DESPUÉS de que la tienda siguió vendiendo: la serie de boletas no vuelve atrás (repetiría un número) y a
  // la otra prenda se le resta lo devuelto en vez de pisar su stock con el número viejo (se perdería la venta nueva).
  {
    const r = correr(
      `${escenaDocs()}
select (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'o2') as post_o2 \\gset
${purgaDocsDefinitiva()}
select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'o2', 'cantidad', 1, 'precio_unitario', :'p2', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'p2')), null, gen_random_uuid(), 'boleta') as v_nueva \\gset
select ${SERIE_BOL} as bol_tras_venta \\gset
drop function pg_temp.libro_descuadra();
select set_config('cayla_purga.nombre', :'nombre_purga', true) as _n \\gset
${RESTAURAR}
select ${SERIE_BOL} = :bol_tras_venta;
select (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'o2') = :post_o2 - 1;
select count(*) from retail.ventas where id in (:'v1', :'v2', :'v3', :'v_nueva');
select ${LIBRO};`
    );
    const [serieBol, o2, ventas, libro] = ultimas(r);
    esperar("docs · restaurar tras una venta nueva: la serie de boletas sigue donde iba (no repite un número)", r.ok && serieBol === "t", r);
    esperar("docs · restaurar tras una venta nueva: la otra prenda queda con la venta vieja Y la nueva descontadas", r.ok && o2 === "t", r);
    esperar("docs · restaurar tras una venta nueva: vuelven las 3 ventas de prueba y la nueva se queda", r.ok && ventas === "4", r);
    esperar("docs · restaurar tras una venta nueva: el libro cuadra", r.ok && libro === "0", r);
  }

  // 10c. Si después de la purga la serie de notas reutilizó el número de la nota purgada, restaurar se niega con un mensaje
  // claro (ese número ya es de otra venta) y no toca nada.
  {
    const r = correr(
      `${escena()}
${purgaDefinitiva()}
select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'o1', 'cantidad', 1, 'precio_unitario', :'p1', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'p1')), null, gen_random_uuid(), 'nota_venta') as otra \\gset
select (select numero from retail.comprobantes where venta_id = :'otra') = :num_nv;
drop function pg_temp.libro_descuadra();
select set_config('cayla_purga.nombre', :'nombre_purga', true) as _n \\gset
${RESTAURAR}`
    );
    esperar("restaurar: la nota nueva tomó el número devuelto por la purga", r.lineas[0] === "t", r);
    esperar("restaurar: se niega con un mensaje claro — ese número ya lo tiene otro comprobante", !r.ok && /Esos números ya los tiene otro comprobante/.test(r.err), r.err.slice(0, 800));
  }

  // 11. RECHAZOS con documentos: no se borra nada, y el mensaje dice qué impide.
  const rechazoDocs = (nombre, preparar, patron, extra = {}) => {
    const r = correr(
      `${escenaDocs()}
${preparar}
${RESTOS_DOCS}
select pg_temp.foto() as foto_antes \\gset
savepoint s1;
${paramsDocs(extra)}${CUERPO_TRAS_LA_ESCENA}
rollback to savepoint s1;
${RESTOS_DOCS}
select '[' || pg_temp.distintas(:'foto_antes', pg_temp.foto()) || ']';`,
      true
    );
    const [antes, despues, distintas] = r.lineas.slice(-3);
    esperar(nombre, patron.test(r.err) && !/ENSAYO OK/.test(r.err), r.err.slice(0, 1400));
    esperar(`${nombre.split(":")[0]}: y la base quedó intacta`, r.ok && antes !== undefined && antes === despues && distintas === "[]", r.lineas.slice(-3));
  };

  rechazoDocs(
    "docs · rechazo: LA LÍNEA ROJA — una boleta que llegó a SUNAT en producción no se borra ni pidiéndolo",
    `update retail.comprobantes set entorno_transmision = 'produccion' where venta_id = :'v2';`,
    // ERROR y no un aviso: la línea roja corta ahí mismo, antes de mirar nada más.
    /ERROR:\s+\[purga\] NO SE BORRA NADA: 1 comprobante\(s\) de esos documentos llegaron a SUNAT en producción/
  );
  rechazoDocs(
    "docs · rechazo: una boleta que ya intentó salir sin decir a qué entorno se revisa con el PSE",
    `update retail.comprobantes set intentos_transmision = 1, ultimo_intento_transmision_at = now() where venta_id = :'v3';`,
    /ya intentaron salir a SUNAT sin decir a qué entorno/
  );
  rechazoDocs(
    "docs · rechazo: una boleta que el envío automático acaba de tomar (se está enviando ahora)",
    `update retail.comprobantes set proximo_reintento_at = now() + interval '5 minutes' where separacion_id = :'s2';`,
    /se están enviando a SUNAT justo ahora/
  );
  rechazoDocs(
    "docs · rechazo: una separación del producto que no se nombró (y dice cuál)",
    `select codigo as cod_s2 from retail.separaciones where id = :'s2' \\gset`,
    /separación\(es\) que no pediste borrar[\s\S]*APT-/,
    { separaciones: `:'s1'` }
  );
  rechazoDocs("docs · rechazo: una compra del producto que no se nombró", "", /compra\(s\) que no pediste borrar/, { compras: null });
  rechazoDocs(
    "docs · rechazo: una venta nombrada que no tiene el producto (un id equivocado no se lleva una venta real)",
    `select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'o1', 'cantidad', 1, 'precio_unitario', :'p1', 'descuento_unitario', 0)),
       jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'p1')), null, gen_random_uuid(), 'nota_venta') as v_otra \\gset`,
    /venta\(s\) nombrada\(s\) no tienen este producto/,
    { ventas: `:'v1' || ',' || :'v2' || ',' || :'v3' || ',' || :'v_otra'` }
  );
  rechazoDocs(
    "docs · rechazo: una separación que también aparta otra prenda",
    `select retail.separar_prendas(p_ubicacion_id => :'ubic', p_items => jsonb_build_array(jsonb_build_object('variante_id', :'va', 'cantidad', 1, 'precio_unitario', 50),
        jsonb_build_object('variante_id', :'o1', 'cantidad', 1, 'precio_unitario', :'p1')),
      p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 10)), p_clienta_nombres => 'Cira', p_clienta_apellidos => 'Prueba',
      p_clienta_celular => '987111444', p_devolucion_medio => 'yape') as s3 \\gset`,
    /apartan 2 prenda\(s\) de otros productos/,
    { separaciones: `:'s1' || ',' || :'s2' || ',' || :'s3'` }
  );
  rechazoDocs(
    "docs · rechazo: una separación pagada en efectivo (ese dinero entró a la caja con su movimiento)",
    `select retail.separar_prendas(p_ubicacion_id => :'ubic', p_items => jsonb_build_array(jsonb_build_object('variante_id', :'va', 'cantidad', 1, 'precio_unitario', 50)),
      p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 10, 'recibido', 10)), p_clienta_nombres => 'Dora', p_clienta_apellidos => 'Prueba',
      p_clienta_celular => '987111555', p_devolucion_medio => 'yape') as s3 \\gset`,
    /entraron en efectivo a una caja[\s\S]*caja_movimientos citan a separaciones/,
    { separaciones: `:'s1' || ',' || :'s2' || ',' || :'s3'` }
  );
  rechazoDocs(
    "docs · rechazo: una compra con un pago al proveedor (salió dinero)",
    `select retail.registrar_pago_compra(:'compra', 10, 'transferencia', null, retail.fn_hoy_lima()) as _pago \\gset`,
    /compra_pagos citan a compras/
  );
  rechazoDocs(
    "docs · rechazo: una compra que también trae otra prenda",
    `select retail.registrar_compra(:'prov', 'F001', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), 'credito', :'ubic',
       jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'vb', 'descripcion', 'Polo', 'cantidad', 2, 'costo_unitario', 30),
                         jsonb_build_object('producto_id', (select producto_id from retail.variantes where id = :'o1'), 'variante_id', :'o1', 'descripcion', 'Otra', 'cantidad', 2, 'costo_unitario', 30)),
       p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as compra2 \\gset`,
    /traen 1 línea\(s\) de otros productos/,
    { compras: `:'compra' || ',' || :'compra2'` }
  );
  rechazoDocs(
    "docs · rechazo: el ingreso del proveedor (el lote) también trajo otra prenda",
    `insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id)
       values (:'o1', :'ubic', :'sub_alm', 'entrada', 1, 'recepcion', :'lote_id') returning id as m_lote \\gset
     select retail.fn_aplicar_movimiento(:'m_lote') as _l \\gset`,
    /el ingreso del proveedor también trajo 1 movimiento\(s\) de otras prendas[\s\S]*movimientos citan a lotes/
  );
  rechazoDocs(
    "docs · rechazo: un aviso a la clienta de una separación (una tabla que cita lo que se borra y el script no conoce)",
    `select retail.registrar_aviso_separacion(:'s2') as _aviso \\gset`,
    /separacion_avisos citan a separaciones que se borrarían/
  );

  console.log(`\n${casos - fallos}/${casos} casos pasaron.`);
  if (fallos > 0) process.exit(1);
}

main();

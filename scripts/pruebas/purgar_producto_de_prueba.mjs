#!/usr/bin/env node
/**
 * Prueba de `scripts/purga/purgar-producto-de-prueba.sql` (ADR-0224): deshacer POR COMPLETO un producto de prueba y la
 * venta de prueba que lo tocó, sin dejar el libro de movimientos descuadrado.
 *
 * EL ESCENARIO reproduce el caso real (Top Aurora, 2026-09-26): un producto con dos variantes, cada una con una reposición
 * (ajuste) al piso; UNA venta con una nota interna donde el producto va MEZCLADO con prendas de otros productos (que
 * también salieron de stock por esa venta); y una serie de notas cuyo número siguiente ya avanzó.
 *
 * QUÉ CUBRE
 *   · ENSAYO (el modo por defecto): termina con una excepción que trae el resumen y NO deja nada escrito (ni el respaldo).
 *   · DEFINITIVO: el producto, sus variantes, códigos, stock, movimientos, la venta, sus líneas, pagos y comprobante
 *     desaparecen; las prendas de OTROS productos vuelven exactamente a su stock de antes de la venta; la serie de notas
 *     vuelve a su número; queda UNA línea en Actividad; el libro de movimientos cuadra con el stock en TODA la base; los
 *     candados de `movimientos` quedan en ALWAYS.
 *   · RESPALDO: cada fila borrada está en `respaldo_purgas.filas`, y restaurarla (con las reglas de la receta del
 *     encabezado) devuelve la base al estado de antes, FILA POR FILA, con el libro cuadrando. Es la prueba de que la
 *     purga se puede deshacer.
 *   · RECHAZOS (no se borra nada): el producto en otra venta; un comprobante que no es nota interna; una venta ya
 *     anulada (deja filas que la citan); un movimiento del producto que no es un ajuste simple (un traslado); un libro que
 *     ya no cuadraba antes de empezar; una mención SIN llave foránea; parámetros faltantes; el producto inexistente.
 *   · LA SERIE no retrocede si la nota purgada NO era la última (otra nota se emitió después): sin huecos ni repetidos.
 *   · Repetirla no hace nada: el producto ya no existe.
 *
 * CÓMO. Cada caso arma el escenario con las funciones reales (`crear_producto_con_variantes`, `registrar_venta`,
 * `anular_venta`), corre el script SIN su begin/commit (marcados [[transaccion]]) dentro de la transacción de la prueba y
 * termina SIEMPRE en ROLLBACK: la base local compartida no queda con nada.
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
const RESTAURAR = readFileSync(join(RAIZ, "scripts/purga/restaurar-purga.sql"), "utf8").replace(/^(begin|commit);.*\[\[transaccion\]\].*$/gm, "");
// Para volver a correrlo dentro de la misma transacción (lo temporal del script ya existe).
const LIMPIAR = `drop table if exists zz_prod, zz_var, zz_venta, zz_item, zz_comp, zz_pago, zz_mov, zz_purga, zz_restaura, zz_resumen;
drop function if exists pg_temp.libro_descuadra();
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

/**
 * El escenario. `nota`: la venta lleva nota interna (`true`) o boleta (`false`). Deja estas variables psql: ubic, prod,
 * cod_prod, va, vb (variantes del producto), o1, o2 (prendas de otros productos), pre_o1, pre_o2 (su stock ANTES de
 * la venta), venta, serie_nv, num_nv (la nota), nombre_purga (el del respaldo), caja_id.
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
`;

/** Los dos parámetros del script (y el modo, si es definitivo), dentro de la transacción. */
const params = ({ producto = ":'cod_prod'", ventas = ":'venta'", definitivo = false } = {}) =>
  `select set_config('cayla_purga.producto', ${producto === null ? "''" : producto}, true) as _p \\gset
select set_config('cayla_purga.ventas', ${ventas === null ? "''" : ventas}, true) as _v \\gset
${definitivo ? "select set_config('cayla_purga.modo', 'definitivo', true) as _m \\gset\n" : ""}`;

const purgaDefinitiva = () => `${params({ definitivo: true })}${CUERPO}`;

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

const SERIE = `(select siguiente_numero from retail.series_comprobantes where tipo = 'nota_venta' and serie = :'serie_nv')`;
const LIBRO = "pg_temp.libro_descuadra()";
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

  // 1. ENSAYO: el modo por defecto termina en excepción con el resumen y no deja nada escrito (ni el respaldo).
  {
    const r = correr(
      `${escena()}
${RESTOS}
savepoint antes_del_ensayo;
${params()}${CUERPO}
rollback to savepoint antes_del_ensayo;
${RESTOS}
select count(*) from information_schema.tables where table_schema = 'respaldo_purgas';
select ${SERIE};`,
      true
    );
    const [antes, despues, respaldo] = ultimas(r);
    esperar("ensayo: el escenario existe antes (1 producto, 2 variantes, 4 movimientos del producto, 1 venta, 4 líneas)", r.ok && antes === RESTOS_ANTES, r);
    esperar("ensayo: termina con una excepción que dice ENSAYO OK y trae el resumen", /ENSAYO OK — no quedó nada escrito/.test(r.err) && /productos 1 · variantes 2 · movimientos 6 · ventas 1 · líneas de venta 4 · pagos 1 · comprobantes 1 · prendas devueltas a stock \(en 2 filas\) 3/.test(r.err), r.err.slice(0, 900));
    esperar("ensayo: el resumen promete 0 filas descuadradas antes y después, y cita el respaldo", /0 filas descuadradas antes y 0 después/.test(r.err) && /respaldo_purgas\.filas, purga «purga /.test(r.err), r.err.slice(0, 900));
    esperar("ensayo: no queda nada escrito — todo sigue como estaba", r.ok && despues === RESTOS_ANTES, r);
    esperar("ensayo: ni el esquema de respaldo se creó (la excepción lo deshizo)", r.ok && respaldo === "0", r);
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
    esperar("definitivo: queda UNA línea en Actividad que cuenta qué pasó", r.ok && actividad === "1", r);
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
select current_setting('session_replication_role');`
    );
    const [nada, restos, filas, ajenas, libro, actividad, rol] = ultimas(r);
    esperar("respaldo: tras purgar no queda nada; tras restaurar vuelve el producto, la venta y todo (1,2,2,2,4,1,4,1,1)", r.ok && nada === RESTOS_NADA && restos === RESTOS_ANTES, r);
    esperar("respaldo: cada fila restaurada es IDÉNTICA a la respaldada (9 tablas, comparadas como jsonb)", r.ok && filas === tablas.map(() => "t").join(","), r);
    esperar("respaldo: el stock de las otras prendas y la serie vuelven a como estaban tras la venta", r.ok && ajenas === "t,t,t", r);
    esperar("respaldo: el libro de movimientos cuadra otra vez", r.ok && libro === "0", r);
    esperar("respaldo: queda una línea en Actividad que cuenta la restauración", r.ok && actividad === "1", r);
    esperar("respaldo: los disparadores vuelven a su modo normal (origin) al terminar", r.ok && rol === "origin", r);
  }

  // 4. Repetirla no hace nada: el producto ya no existe.
  {
    const r = correr(`${escena()}
${purgaDefinitiva()}
${LIMPIAR}
${params({ definitivo: true })}${CUERPO}`);
    esperar("repetir la purga: se rechaza — ya no hay un producto con ese código", !r.ok && /No encuentro exactamente un producto con código/.test(r.err), r);
  }

  // 5. RECHAZOS: no se borra nada, y el mensaje dice qué impide.
  const rechazo = (nombre, preparar, patron, opciones = {}) => {
    const r = correr(`${escena(opciones)}
${preparar}
${params()}${CUERPO}`);
    esperar(nombre, !r.ok && patron.test(r.err), r.err.slice(0, 1200));
    // Lo importante: nada quedó borrado. Misma corrida hasta la excepción, con un savepoint, y se compara lo de antes con lo de después.
    const s = correr(
      `${escena(opciones)}
${preparar}
${RESTOS}
savepoint s1;
${params()}${CUERPO}
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
  rechazo("rechazo: un comprobante que no es nota interna (una boleta) no se borra jamás con un script", "", /NO SE BORRA NADA[\s\S]*no son notas internas/, { nota: false });
  rechazo(
    "rechazo: una venta ya anulada deja filas que la citan (anulación por línea)",
    `select retail.anular_venta(:'venta', 'prueba automatizada', (select jsonb_agg(jsonb_build_object('venta_item_id', vi.id, 'condicion', 'vendible')) from retail.venta_items vi where vi.venta_id = :'venta')) as _a \\gset`,
    /NO SE BORRA NADA[\s\S]*citan a/
  );
  rechazo(
    "rechazo: un movimiento del producto que no es un ajuste simple (un traslado piso → almacén)",
    `insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, ubicacion_destino_id, sububicacion_destino_id, motivo)
       values (:'va', :'ubic', :'sub_piso', 'traslado', 1, :'ubic', :'sub_alm', 'prueba') returning id as mt \\gset
     select retail.fn_aplicar_movimiento(:'mt') as _t \\gset`,
    /NO SE BORRA NADA[\s\S]*no son ajustes simples/
  );
  rechazo(
    "rechazo: si el stock ya NO cuadraba con los movimientos antes de empezar, no se toca nada",
    `update retail.stock set cantidad = cantidad + 1 where variante_id = :'o1' and sububicacion_id = :'sub_piso';`,
    /NO SE BORRA NADA[\s\S]*ya NO cuadraba/
  );

  // 6. Parámetros y producto inexistente.
  {
    const r = correr(`${escena()}\n${params({ producto: null, ventas: null })}${CUERPO}`);
    esperar("parámetros faltantes: se rechaza con instrucciones", !r.ok && /Faltan parámetros/.test(r.err), r.err.slice(0, 600));
    const s = correr(`${escena()}\n${params({ producto: "'ZZZ-9999'" })}${CUERPO}`);
    esperar("un código de producto que no existe se rechaza", !s.ok && /No encuentro exactamente un producto con código «ZZZ-9999»/.test(s.err), s.err.slice(0, 600));
    const t = correr(`${escena()}\n${params({ ventas: "gen_random_uuid()::text" })}${CUERPO}`);
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

  console.log(`\n${casos - fallos}/${casos} casos pasaron.`);
  if (fallos > 0) process.exit(1);
}

main();

#!/usr/bin/env node
/**
 * Prueba de integración de `retail.fn_movimientos` / `fn_movimientos_resumen` /
 * `fn_movimientos_busqueda` (Movimientos con «Referencia» y búsqueda por proceso,
 * ADR-0127, migración 20260919155000) contra el Postgres LOCAL.
 *
 * Lo que ninguna prueba de TypeScript puede verificar:
 *   · cada fila trae el NÚMERO real de su traslado y de su conteo;
 *   · «traslado 24», «conteo 12», «boleta 184», «venta 184» (con o sin #, n°, nro, ceros a la
 *     izquierda) devuelven SOLO los movimientos de ese proceso y no se mezclan con prendas;
 *   · «B001-000184» / «F001-210» / «T001-34» (serie + número: boleta o factura de venta, factura
 *     de compra, guía) encuentran los movimientos del documento y, además, las prendas cuyo
 *     código se le parezca (se suman, no se esconden);
 *   · una boleta trae los movimientos de su venta, de su devolución y de su cambio (las tres
 *     vías por las que un movimiento llega a una venta);
 *   · la búsqueda se combina con tipo / proceso / sububicación (AND, no OR);
 *   · la lista y las tarjetas del resumen cuentan lo mismo;
 *   · una sola firma viva por función, `anon` sin EXECUTE, y quien no puede operar una sede
 *     sigue sin poder ver sus movimientos.
 *
 * Los números de los fixtures (987001, 987184…) son a propósito absurdos: en el Postgres
 * compartido hay datos de siembra y una búsqueda por «traslado 1» los traería.
 *
 * Mismo mecanismo que `fn_resumen_variantes.mjs`: `docker exec … psql`, `set local
 * request.jwt.claim.sub` y `ROLLBACK` SIEMPRE — no deja nada en el Postgres compartido
 * (regla: no ensuciar la base local; jamás `db reset`).
 *
 * USO
 *   pnpm pruebas:fn-movimientos-referencias    → necesita el stack local levantado
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
}

/** Todo caso empieza igual: Tienda Lima con sus tres sububicaciones, el Taller, un proveedor y quien se pida. */
function prelude({ persona = FELIPE, sede = "Tienda Lima" } = {}) {
  return `
begin;
set local request.jwt.claim.sub = '${persona}';
select id as ubic from retail.ubicaciones where nombre = '${sede}' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset

-- Autocuración: este Postgres compartido puede no tener las tres sububicaciones para esa sede.
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select id as sp from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select id as sa from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset

-- Un proveedor cualquiera (la siembra trae dos; por si una base vacía no trajera ninguno).
insert into retail.proveedores (nombre) select 'ZZ Proveedor de prueba' where not exists (select 1 from retail.proveedores);
select id as prov from retail.proveedores order by created_at limit 1 \\gset

-- Un producto + variante de prueba. Desde ADR-0109 todo producto lleva marca y proveedor (NOT NULL, con llave
-- compuesta a marca_proveedores): se usa la pareja que esa misma migración siembra (CAYLA / CAYLA SAC). En un
-- Postgres local que todavía no la aplicó esas columnas no existen y el alta va sin ellas.
create function pg_temp.variante(sku text, ref text default null) returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'productos' and column_name = 'marca_id') then
    insert into retail.productos (referencia, estado, marca_id, proveedor_id)
      select coalesce(ref, 'ZZ ' || sku), 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
      returning id into p;
  else
    insert into retail.productos (referencia, estado) values (coalesce(ref, 'ZZ ' || sku), 'activo') returning id into p;
  end if;
  insert into retail.variantes (producto_id, sku, precio, costo, activo) values (p, sku, 100, 40, true) returning id into v;
  return v;
end $$;

-- Un movimiento del ledger con la referencia de su proceso (no toca \`stock\`: estas pruebas miran el historial).
create function pg_temp.mov(v uuid, tipo text, cant int, u uuid, sub uuid, motivo text,
                            ti uuid default null, trc uuid default null, cti uuid default null, vi uuid default null,
                            di uuid default null, camb uuid default null, lo uuid default null, ci uuid default null)
returns uuid language sql as $$
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo,
                                  transferencia_item_id, transferencia_recepcion_id, conteo_item_id, venta_item_id,
                                  devolucion_item_id, cambio_id, lote_id, compra_item_id)
  values (v, u, sub, tipo, cant, motivo, ti, trc, cti, vi, di, camb, lo, ci) returning id
$$;

-- Cuántas filas devuelve la lista con esa búsqueda (y, si se pide, tipo / proceso / sububicación).
create function pg_temp.n(u uuid, q text, cat text default null, mot text default null, sub uuid default null) returns int language sql as $$
  select count(*)::int from retail.fn_movimientos(u, p_busqueda => q, p_categoria => cat, p_motivo => mot, p_sububicacion_id => sub, p_limite => 200)
$$;
-- Cuántos movimientos cuentan las tarjetas del resumen con esa misma búsqueda.
create function pg_temp.nr(u uuid, q text) returns int language sql as $$
  select coalesce(sum(movimientos), 0)::int from retail.fn_movimientos_resumen(u, p_busqueda => q)
$$;
`;
}

/** Los fixtures que comparten las verificaciones de búsqueda: un traslado, un conteo, una venta con su devolución y su
 *  cambio, y una recepción con guía y factura de compra. Cada uno con un número imposible de confundir. */
const FIXTURES = `
-- Una prenda por proceso: A viaja en el traslado, B se cuenta, C se vende / se devuelve / se cambia,
-- D es lo que se lleva en el cambio y E se recibe con guía y factura.
-- (En psql, lo que sigue a \\gset en la misma línea son argumentos: nada de comentarios al final.)
select pg_temp.variante('ZZ-MOV-A') as va \\gset
select pg_temp.variante('ZZ-MOV-B') as vb \\gset
select pg_temp.variante('ZZ-MOV-C') as vc \\gset
select pg_temp.variante('ZZ-MOV-D') as vd \\gset
select pg_temp.variante('ZZ-MOV-E') as ve \\gset
select producto_id as pe from retail.variantes where id = :'ve' \\gset

-- Traslado 987001: sale del Taller (pierna de salida, por su línea) y llega a Tienda Lima (pierna de llegada, por su recepción).
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, numero) values (:'taller', :'ubic', 'en_transito', 987001) returning id as tr \\gset
insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (:'tr', :'va', 4) returning id as ti \\gset
insert into retail.transferencia_recepciones (transferencia_id, variante_id, cantidad_recibida) values (:'tr', :'va', 4) returning id as trc \\gset
select pg_temp.mov(:'va', 'salida', 4, :'taller', null, 'traslado_salida', ti => :'ti') as m_sal \\gset
select pg_temp.mov(:'va', 'entrada', 4, :'ubic', :'sa', 'traslado_entrada', trc => :'trc') as m_lle \\gset

-- Una prenda cuyo NOMBRE dice «traslado 987001»: la referencia inequívoca no debe traerla.
select pg_temp.variante('ZZ-MOV-ENGANO', 'ZZ traslado 987001') as vz \\gset
select pg_temp.mov(:'vz', 'entrada', 1, :'ubic', :'sa', 'recepcion') as m_eng \\gset

-- Conteo 987002: el sistema decía 5, se contaron 3.
insert into retail.conteos (ubicacion_id, sububicacion_id, estado, numero) values (:'ubic', :'sp', 'cerrado', 987002) returning id as cn \\gset
insert into retail.conteo_items (conteo_id, variante_id, cantidad_sistema, cantidad_contada) values (:'cn', :'vb', 5, 3) returning id as cti \\gset
select pg_temp.mov(:'vb', 'ajuste', -2, :'ubic', :'sp', 'conteo', cti => :'cti') as m_cnt \\gset

-- Boleta B987-987184: la venta (1 movimiento), su devolución (1) y su cambio (2: entra lo devuelto, sale lo nuevo).
insert into retail.ventas (ubicacion_id, estado) values (:'ubic', 'completada') returning id as vt \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (:'vt', :'vc', 2, 100, 40) returning id as vi \\gset
insert into retail.comprobantes (venta_id, ubicacion_id, tipo, serie, numero, total, estado, entorno_transmision) values (:'vt', :'ubic', 'boleta', 'B987', 987184, 200, 'aceptado', 'sandbox');
select pg_temp.mov(:'vc', 'salida', 2, :'ubic', :'sp', 'venta', vi => :'vi') as m_ven \\gset
insert into retail.devoluciones (venta_id, ubicacion_id, motivo, estado, aprobado_en) values (:'vt', :'ubic', 'talla', 'aprobada', now()) returning id as de \\gset
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (:'de', :'vi', 1, 'vendible') returning id as di \\gset
select pg_temp.mov(:'vc', 'entrada', 1, :'ubic', :'sp', 'devolucion', di => :'di') as m_dev \\gset
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad) values (:'vi', :'ubic', :'vd', 1) returning id as ca \\gset
select pg_temp.mov(:'vc', 'entrada', 1, :'ubic', :'sp', 'cambio', camb => :'ca') as m_cam1 \\gset
select pg_temp.mov(:'vd', 'salida', 1, :'ubic', :'sp', 'cambio', camb => :'ca') as m_cam2 \\gset

-- Recepción: guía T987-0034 y factura de compra F987-000210.
insert into retail.lotes (ubicacion_id, proveedor_id, numero_guia) values (:'ubic', :'prov', 'T987-0034') returning id as lo \\gset
-- ubicacion_gestion_id: ADR-0184 la exige en toda factura vigente.
insert into retail.compras (proveedor_id, tipo, serie, numero, condicion, subtotal, igv, total, ubicacion_gestion_id) values (:'prov', 'factura', 'F987', '000210', 'contado', 100, 18, 118, :'ubic') returning id as cp \\gset
insert into retail.compra_items (compra_id, producto_id, cantidad, costo_unitario) values (:'cp', :'pe', 5, 20) returning id as ci \\gset
select pg_temp.mov(:'ve', 'entrada', 5, :'ubic', :'sa', 'recepcion', lo => :'lo', ci => :'ci') as m_rec \\gset
`;

/** Una línea `K|clave|valor` por verificación: la prueba las lee por clave. */
const K = (clave, expresion) => `select 'K|${clave}|' || (${expresion})::text;`;

function parsear(salida) {
  const d = {};
  for (const linea of salida.split("\n")) {
    if (!linea.startsWith("K|")) continue;
    const [, clave, ...resto] = linea.split("|");
    d[clave] = resto.join("|");
  }
  return d;
}

let fallos = 0;
let total = 0;
function afirmar(nombre, condicion, detalle = "") {
  total += 1;
  if (condicion) console.log(`  ✔ ${nombre}`);
  else {
    fallos += 1;
    console.log(`  ✘ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}
/** Compara el valor que devolvió la base con el esperado y, si no coincide, dice ambos. */
const igual = (d, clave, esperado, nombre) => afirmar(nombre, d[clave] === String(esperado), `${clave}=${JSON.stringify(d[clave])} esperado=${JSON.stringify(String(esperado))}`);

function correr(titulo, sql, verificar) {
  console.log(`\n${titulo}`);
  let salida;
  try {
    salida = psql(sql).trim();
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del caso falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 4).join(" ")}`);
    return;
  }
  verificar(parsear(salida), salida);
}

// ---------------------------------------------------------------------------
// 1. Traslado: el número viaja en la fila y «traslado N» encuentra SOLO ese proceso
// ---------------------------------------------------------------------------
correr(
  "1. Traslado 987001: la fila trae su número, y escribirlo (como se escriba) trae solo sus movimientos",
  `${prelude()}
${FIXTURES}
${K("lima", "pg_temp.n(:'ubic', 'traslado 987001')")}
${K("fila_lima", "(select f.transferencia_numero || '|' || f.categoria || '|' || f.delta || '|' || f.transferencia_estado from retail.fn_movimientos(:'ubic', p_busqueda => 'traslado 987001') f)")}
${K("taller", "pg_temp.n(:'taller', 'traslado 987001')")}
${K("fila_taller", "(select f.transferencia_numero || '|' || f.categoria || '|' || f.delta from retail.fn_movimientos(:'taller', p_busqueda => 'traslado 987001') f)")}
${K("mayus", "pg_temp.n(:'ubic', 'Traslado 987001')")}
${K("almohadilla", "pg_temp.n(:'ubic', 'traslado #987001')")}
${K("nro_grado", "pg_temp.n(:'ubic', 'traslado n° 987001')")}
${K("nro_ord", "pg_temp.n(:'ubic', 'TRASLADO Nº 987001')")}
${K("nro_abrev", "pg_temp.n(:'ubic', 'traslados nro. 987001')")}
${K("ceros", "pg_temp.n(:'ubic', 'traslado 0987001')")}
${K("pegado", "pg_temp.n(:'ubic', 'traslado987001')")}
${K("otro_numero", "pg_temp.n(:'ubic', 'traslado 987002')")}
${K("numero_parcial", "pg_temp.n(:'ubic', 'traslado 87001')")}
${K("engano_por_nombre", "(select count(*) from retail.fn_movimientos(:'ubic', p_busqueda => 'traslado 987001', p_limite => 200) f where f.id = :'m_eng')")}
${K("engano_es_prenda", "pg_temp.n(:'ubic', 'zz traslado 987001')")}
rollback;`,
  (d) => {
    igual(d, "lima", 1, "en Tienda Lima solo aparece la llegada (la salida es del Taller)");
    igual(d, "fila_lima", "987001|transferencia|4|en_transito", "la fila trae el número, es «transferencia», suma 4 y conserva su estado");
    igual(d, "taller", 1, "en el Taller solo aparece la salida");
    igual(d, "fila_taller", "987001|transferencia|-4", "la salida trae el mismo número y resta 4");
    for (const [clave, texto] of [
      ["mayus", "Traslado 987001"],
      ["almohadilla", "traslado #987001"],
      ["nro_grado", "traslado n° 987001"],
      ["nro_ord", "TRASLADO Nº 987001"],
      ["nro_abrev", "traslados nro. 987001"],
      ["ceros", "traslado 0987001 (ceros a la izquierda)"],
    ]) {
      igual(d, clave, 1, `«${texto}» encuentra lo mismo`);
    }
    igual(d, "pegado", 1, "«traslado987001», pegado, también se entiende (igual que en la búsqueda de Traslados)");
    igual(d, "otro_numero", 0, "un número que no existe no trae nada (y no rompe)");
    igual(d, "numero_parcial", 0, "el número es exacto: 87001 no es 987001");
    igual(d, "engano_por_nombre", 0, "una prenda que se llama «traslado 987001» no se cuela: es una referencia, no un nombre");
    igual(d, "engano_es_prenda", 1, "…pero buscándola como prenda («zz traslado 987001») sí aparece");
  },
);

// ---------------------------------------------------------------------------
// 2. Conteo
// ---------------------------------------------------------------------------
correr(
  "2. Conteo 987002: la fila trae su número y «conteo N» lo encuentra",
  `${prelude()}
${FIXTURES}
${K("uno", "pg_temp.n(:'ubic', 'conteo 987002')")}
${K("fila", "(select f.conteo_numero || '|' || f.conteo_cantidad_sistema || '|' || f.conteo_cantidad_contada || '|' || f.delta from retail.fn_movimientos(:'ubic', p_busqueda => 'conteo 987002') f)")}
${K("plural_nro", "pg_temp.n(:'ubic', 'Conteos n° 987002')")}
${K("otro", "pg_temp.n(:'ubic', 'conteo 987003')")}
${K("no_es_traslado", "pg_temp.n(:'ubic', 'traslado 987002')")}
rollback;`,
  (d) => {
    igual(d, "uno", 1, "«conteo 987002» trae el ajuste de ese conteo");
    igual(d, "fila", "987002|5|3|-2", "la fila trae el número, lo que decía el sistema (5), lo contado (3) y el ajuste (−2)");
    igual(d, "plural_nro", 1, "«Conteos n° 987002» también");
    igual(d, "otro", 0, "otro número de conteo no trae nada");
    igual(d, "no_es_traslado", 0, "el 987002 es un conteo: como traslado no existe");
  },
);

// ---------------------------------------------------------------------------
// 3. Boleta: la venta, su devolución y su cambio salen juntas
// ---------------------------------------------------------------------------
correr(
  "3. Boleta B987-987184: «boleta 987184», «venta 987184» y «B987-987184» traen la venta, su devolución y su cambio",
  `${prelude()}
${FIXTURES}
${K("boleta", "pg_temp.n(:'ubic', 'boleta 987184')")}
${K("venta", "pg_temp.n(:'ubic', 'venta 987184')")}
${K("comprobante", "pg_temp.n(:'ubic', 'comprobante 987184')")}
${K("factura", "pg_temp.n(:'ubic', 'factura 987184')")}
${K("serie_guion", "pg_temp.n(:'ubic', 'B987-987184')")}
${K("serie_espacio", "pg_temp.n(:'ubic', 'b987 987184')")}
${K("con_palabra", "pg_temp.n(:'ubic', 'Boleta B987-987184')")}
${K("otra_serie", "pg_temp.n(:'ubic', 'B988-987184')")}
${K("otro_numero", "pg_temp.n(:'ubic', 'B987-000184')")}
${K("fila_venta", "(select f.comprobante_tipo || '|' || f.comprobante_numero || '|' || f.comprobante_estado from retail.fn_movimientos(:'ubic', p_busqueda => 'boleta 987184', p_motivo => 'venta') f)")}
${K("vias", "(select string_agg(distinct f.motivo, ',' order by f.motivo) from retail.fn_movimientos(:'ubic', p_busqueda => 'boleta 987184', p_limite => 200) f)")}
${K("dev_tiene_comprobante", "(select f.comprobante_numero || '|' || (f.devolucion_id is not null) from retail.fn_movimientos(:'ubic', p_busqueda => 'boleta 987184', p_motivo => 'devolucion') f)")}
${K("solo_salidas", "pg_temp.n(:'ubic', 'boleta 987184', 'salida')")}
${K("solo_entradas", "pg_temp.n(:'ubic', 'boleta 987184', 'entrada')")}
${K("solo_devolucion", "pg_temp.n(:'ubic', 'boleta 987184', null, 'devolucion')")}
${K("en_piso", "pg_temp.n(:'ubic', 'boleta 987184', null, null, :'sp')")}
${K("en_almacen", "pg_temp.n(:'ubic', 'boleta 987184', null, null, :'sa')")}
rollback;`,
  (d) => {
    igual(d, "boleta", 4, "«boleta 987184» trae 4 movimientos: la venta (1), la devolución (1) y el cambio (2)");
    igual(d, "venta", 4, "«venta 987184» (boleta o factura) trae los mismos");
    igual(d, "comprobante", 4, "«comprobante 987184» también");
    igual(d, "factura", 0, "es una boleta: como factura no existe");
    igual(d, "serie_guion", 4, "«B987-987184» (serie + número) los trae");
    igual(d, "serie_espacio", 4, "«b987 987184» también");
    igual(d, "con_palabra", 4, "«Boleta B987-987184», tal como la escribe la columna Referencia, también");
    igual(d, "otra_serie", 0, "otra serie no coincide");
    igual(d, "otro_numero", 0, "otro número no coincide (B987-000184 ≠ B987-987184)");
    igual(d, "fila_venta", "boleta|B987-987184|aceptado", "la fila de la venta trae su comprobante");
    igual(d, "vias", "cambio,devolucion,venta", "llegan por las tres vías: línea vendida, devolución y cambio");
    igual(d, "dev_tiene_comprobante", "B987-987184|true", "la devolución también muestra el comprobante de la venta que devolvió");
    igual(d, "solo_salidas", 2, "combinada con «Salidas»: la venta y lo que salió en el cambio");
    igual(d, "solo_entradas", 2, "combinada con «Entradas»: la devolución y lo que volvió en el cambio");
    igual(d, "solo_devolucion", 1, "combinada con el proceso «Devolución»: una sola");
    igual(d, "en_piso", 4, "combinada con «Piso»: los 4 (todo pasó en el piso)");
    igual(d, "en_almacen", 0, "combinada con «Almacén»: ninguno — la búsqueda se combina con Y, no con O");
  },
);

// ---------------------------------------------------------------------------
// 4. Recepción: guía y factura de compra
// ---------------------------------------------------------------------------
correr(
  "4. Recepción con guía T987-0034 y factura F987-000210",
  `${prelude()}
${FIXTURES}
${K("factura", "pg_temp.n(:'ubic', 'F987-210')")}
${K("factura_completa", "pg_temp.n(:'ubic', 'Factura F987-000210')")}
${K("guia", "pg_temp.n(:'ubic', 'T987-34')")}
${K("guia_completa", "pg_temp.n(:'ubic', 'Guía T987-0034')")}
${K("factura_otra", "pg_temp.n(:'ubic', 'F987-211')")}
${K("fila", "(select f.compra_documento || '|' || f.lote_guia || '|' || (f.proveedor_nombre is not null) from retail.fn_movimientos(:'ubic', p_busqueda => 'F987-210') f)")}
rollback;`,
  (d) => {
    igual(d, "factura", 1, "«F987-210» encuentra la recepción de esa factura de compra");
    igual(d, "factura_completa", 1, "«Factura F987-000210» también");
    igual(d, "guia", 1, "«T987-34» encuentra la recepción de esa guía");
    igual(d, "guia_completa", 1, "«Guía T987-0034» también");
    igual(d, "factura_otra", 0, "otro número de factura no trae nada");
    igual(d, "fila", "F987-000210|T987-0034|true", "la fila trae factura, guía y proveedor");
  },
);

// ---------------------------------------------------------------------------
// 5. La búsqueda por prenda no cambió, y una serie-número SUMA prendas parecidas
// ---------------------------------------------------------------------------
correr(
  "5. Prenda por SKU/nombre como siempre; un código de prenda parecido a un documento no lo esconde",
  `${prelude()}
${FIXTURES}
select pg_temp.variante('B987-987184') as vs \\gset
select pg_temp.mov(:'vs', 'entrada', 1, :'ubic', :'sa', 'recepcion') as m_sku \\gset
${K("sku", "pg_temp.n(:'ubic', 'zz-mov-a')")}
${K("nombre", "pg_temp.n(:'ubic', 'zz zz-mov-b')")}
${K("nada", "pg_temp.n(:'ubic', 'zzzz-no-existe-jamas')")}
${K("solo_palabra", "(select count(*) || '|' || bool_and(f.id = :'m_eng') from retail.fn_movimientos(:'ubic', p_busqueda => 'traslado', p_limite => 200) f)")}
${K("solo_numero", "(select count(*) || '|' || bool_and(f.id = :'m_eng') from retail.fn_movimientos(:'ubic', p_busqueda => '987001', p_limite => 200) f)")}
${K("sin_busqueda", "(select count(*) >= 8 from retail.fn_movimientos(:'ubic', p_limite => 200))")}
${K("sku_que_parece_boleta", "pg_temp.n(:'ubic', 'B987-987184')")}
${K("boleta_exclusiva", "pg_temp.n(:'ubic', 'boleta 987184')")}
rollback;`,
  (d) => {
    igual(d, "sku", 1, "buscar el SKU trae los movimientos de esa prenda en la sede (la llegada del traslado)");
    igual(d, "nombre", 1, "buscar por nombre de la prenda también");
    igual(d, "nada", 0, "una búsqueda sin coincidencias devuelve cero filas, sin error");
    // La prenda señuelo de los fixtures se llama «ZZ traslado 987001»: lo único que puede traer una búsqueda de prenda.
    igual(d, "solo_palabra", "1|true", "«traslado» a secas no es una referencia (sin número): se busca como prenda y trae solo la prenda que se llama así, no los traslados");
    igual(d, "solo_numero", "1|true", "un número suelto no es una referencia (no se sabe de qué proceso): se busca como prenda, no como Traslado 987001");
    igual(d, "sin_busqueda", "true", "sin búsqueda la lista sigue devolviendo todo");
    igual(d, "sku_que_parece_boleta", 5, "«B987-987184» trae los 4 de la boleta Y la prenda cuyo SKU es exactamente eso (se suman, no se esconden)");
    igual(d, "boleta_exclusiva", 4, "«boleta 987184» es exclusiva: solo la boleta, no la prenda");
  },
);

// ---------------------------------------------------------------------------
// 6. La lista y las tarjetas de arriba cuentan lo mismo
// ---------------------------------------------------------------------------
correr(
  "6. fn_movimientos_resumen usa la misma búsqueda que la lista",
  `${prelude()}
${FIXTURES}
${K("traslado_lista", "pg_temp.n(:'ubic', 'traslado 987001')")}
${K("traslado_resumen", "pg_temp.nr(:'ubic', 'traslado 987001')")}
${K("boleta_lista", "pg_temp.n(:'ubic', 'boleta 987184')")}
${K("boleta_resumen", "pg_temp.nr(:'ubic', 'boleta 987184')")}
${K("factura_lista", "pg_temp.n(:'ubic', 'F987-210')")}
${K("factura_resumen", "pg_temp.nr(:'ubic', 'F987-210')")}
${K("nada_resumen", "pg_temp.nr(:'ubic', 'traslado 987002')")}
${K("boleta_unidades", "(select sum(unidades) from retail.fn_movimientos_resumen(:'ubic', p_busqueda => 'boleta 987184'))")}
${K("boleta_delta", "(select sum(delta) from retail.fn_movimientos_resumen(:'ubic', p_busqueda => 'boleta 987184'))")}
rollback;`,
  (d) => {
    igual(d, "traslado_resumen", d.traslado_lista, "traslado: el resumen cuenta lo mismo que la lista");
    igual(d, "boleta_resumen", d.boleta_lista, "boleta: el resumen cuenta lo mismo que la lista");
    igual(d, "factura_resumen", d.factura_lista, "factura de compra: el resumen cuenta lo mismo que la lista");
    igual(d, "nada_resumen", 0, "una referencia que no existe: el resumen tampoco cuenta nada");
    // 2 vendidas (−2) + 1 devuelta (+1) + cambio: vuelve 1 (+1) y sale 1 (−1) = −1 de saldo; 2+1+1+1 = 5 unidades tocadas.
    igual(d, "boleta_unidades", 5, "las unidades tocadas por la boleta: 2 + 1 + 1 + 1");
    igual(d, "boleta_delta", -1, "el efecto neto sobre el stock de la sede: −2 + 1 + 1 − 1");
  },
);

// ---------------------------------------------------------------------------
// 7. Permisos: quien no opera una sede sigue sin verla; la que sí, la ve
// ---------------------------------------------------------------------------
const INTENTAR = `
create function pg_temp.intentar(u uuid, q text) returns text language plpgsql as $$
begin
  perform 1 from retail.fn_movimientos(u, p_busqueda => q);
  return 'OK';
exception when others then
  return 'ERROR: ' || sqlerrm;
end $$;
`;
correr(
  "7. Una colaboradora fijada a Tienda Trujillo no ve los movimientos de Tienda Lima (ni por la búsqueda por referencia)",
  `${prelude({ persona: MICAELA, sede: "Tienda Lima" })}
${INTENTAR}
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
${K("ajena_lista", "pg_temp.intentar(:'ubic', null)")}
${K("ajena_referencia", "pg_temp.intentar(:'ubic', 'traslado 1')")}
${K("propia", "pg_temp.intentar(:'trujillo', 'traslado 1')")}
${K("propia_boleta", "pg_temp.intentar(:'trujillo', 'B001-000184')")}
rollback;`,
  (d) => {
    afirmar("Lima, sin búsqueda: rechazada", /^ERROR: No tienes permiso/.test(d.ajena_lista ?? ""), `ajena_lista=${d.ajena_lista}`);
    afirmar("Lima, con «traslado 1»: rechazada (la búsqueda no abre una puerta lateral)", /^ERROR: No tienes permiso/.test(d.ajena_referencia ?? ""), `ajena_referencia=${d.ajena_referencia}`);
    igual(d, "propia", "OK", "su propia sede (Trujillo) la puede ver, buscando por referencia");
    igual(d, "propia_boleta", "OK", "…y buscando por serie-número");
  },
);

// ---------------------------------------------------------------------------
// 8. Firma: una sola función viva por nombre y `anon` sin EXECUTE
// ---------------------------------------------------------------------------
correr(
  "8. Firma: una sola sobrecarga de cada función, `anon` no ejecuta y `authenticated` sí",
  `${prelude()}
${K("n_lista", "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_movimientos')")}
${K("n_resumen", "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_movimientos_resumen')")}
${K("n_busqueda", "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_movimientos_busqueda')")}
${K("n_comprobante", "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_movimientos_de_comprobante')")}
${K("anon_lista", "has_function_privilege('anon', 'retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid)'::regprocedure, 'EXECUTE')")}
${K("anon_resumen", "has_function_privilege('anon', 'retail.fn_movimientos_resumen(uuid, date, date, text, text, uuid, uuid)'::regprocedure, 'EXECUTE')")}
${K("anon_busqueda", "has_function_privilege('anon', 'retail.fn_movimientos_busqueda(text)'::regprocedure, 'EXECUTE')")}
${K("anon_comprobante", "has_function_privilege('anon', 'retail.fn_movimientos_de_comprobante(text[], text, integer)'::regprocedure, 'EXECUTE')")}
${K("auth_lista", "has_function_privilege('authenticated', 'retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid)'::regprocedure, 'EXECUTE')")}
${K("auth_resumen", "has_function_privilege('authenticated', 'retail.fn_movimientos_resumen(uuid, date, date, text, text, uuid, uuid)'::regprocedure, 'EXECUTE')")}
-- Las dos columnas nuevas van AL FINAL de la salida: quien lee por posición no nota nada.
${K("ultimas", "(select (array_agg(x order by ord desc))[1] || ',' || (array_agg(x order by ord desc))[2] from (select unnest(p.proargnames) as x, generate_subscripts(p.proargnames, 1) as ord from pg_proc p where p.oid = 'retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid)'::regprocedure) t)")}
rollback;`,
  (d) => {
    for (const [clave, nombre] of [
      ["n_lista", "fn_movimientos"],
      ["n_resumen", "fn_movimientos_resumen"],
      ["n_busqueda", "fn_movimientos_busqueda"],
      ["n_comprobante", "fn_movimientos_de_comprobante"],
    ]) {
      igual(d, clave, 1, `hay UNA sola ${nombre} (dos sobrecargas harían ambigua la llamada por nombre de PostgREST)`);
    }
    for (const [clave, nombre] of [
      ["anon_lista", "fn_movimientos"],
      ["anon_resumen", "fn_movimientos_resumen"],
      ["anon_busqueda", "fn_movimientos_busqueda"],
      ["anon_comprobante", "fn_movimientos_de_comprobante"],
    ]) {
      igual(d, clave, "false", `anon NO puede ejecutar ${nombre}`);
    }
    igual(d, "auth_lista", "true", "authenticated puede ejecutar fn_movimientos");
    igual(d, "auth_resumen", "true", "authenticated puede ejecutar fn_movimientos_resumen");
    afirmar("las dos columnas nuevas son las ÚLTIMAS de la salida (quien lee por posición no nota nada)", d.ultimas === "conteo_numero,transferencia_numero", `ultimas=${d.ultimas}`);
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);

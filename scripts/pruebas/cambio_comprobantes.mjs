#!/usr/bin/env node
/**
 * Un cambio de prenda emite su nota de crédito y su boleta nueva (ADR-0672, migración 20261116220000).
 *
 * QUÉ SE PRUEBA. Que al guardar un cambio salen los dos papeles correctos y que NO se toca la caja ni la venta original:
 *   1. Color o talla (mismo precio): nota por lo pagado, boleta por lo mismo; la caja no se mueve; la venta sigue viva.
 *   2. Prenda más cara (efectivo): boleta − nota = +70 y la caja espera +70; el registro de ventas suma +70.
 *   3. Prenda más barata (efectivo): boleta − nota = −70 y la caja espera −70; el registro de ventas suma −70.
 *   4. Comprada con descuento, por otro modelo: la nota va por lo PAGADO (con su descuento), la boleta a lista.
 *   5. Comprada con descuento, mismo modelo (ADR-0655): la boleta repite el descuento y la diferencia es 0.
 *   6. Una de dos unidades: la nota es «07» (por ítem) y declara una sola.
 *   7. La boleta original todavía sin aceptar por SUNAT: el cambio se rechaza y no queda nada escrito (decisión 1).
 *   8. La venta con nota de venta: el cambio se guarda y no emite papeles (decisión 2).
 *   9. Factura: la nota lleva serie F y el papel nuevo es factura al mismo RUC.
 *  10. Doble clic con el mismo token: un solo cambio y dos papeles, no cuatro.
 *  11. Cambio en otra tienda por quien no opera la tienda de la boleta: la nota sale en la serie de la tienda de la boleta.
 *  12. MUTANTE: si el cambio no emite papeles, el caso 1 lo ve.
 *  13. La migración se puede pegar dos veces.
 *  14. Una prenda por varias, con descuento: la del mismo modelo conserva su descuento en su línea; la otra va a lista (ADR-0470/0655).
 *  15. Una por dos unidades de otra prenda, en efectivo: la caja espera lo mismo que dicen los papeles.
 *  16. Si el envío al guardar no llegó, el reintento automático toma los dos papeles (no tienen venta y aun así entran a la cola).
 *  17. El vigía de /chaos (INV-30) ve lo que vigila: limpio tras un cambio; con la boleta del cambio retocada a mano, la ve.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK (nunca se commitea nada). Si la base no tiene la migración, se aplica dentro de cada
 * transacción (el CI ya la tiene). Las series de la prueba (B901, B902, BC91, FC91) se crean y se archivan dentro de la transacción.
 *
 * USO
 *   pnpm pruebas:cambio-comprobantes            (otra base del mismo Postgres: PRUEBAS_BASE=mi_copia)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { INVARIANTES } from "../chaos/invariantes.mjs";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = join(RAIZ, "supabase", "migrations", "20261116220000_cambio_emite_sus_comprobantes.sql");
const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const BASE = process.env.PRUEBAS_BASE ?? "postgres";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante fija a Tienda Trujillo (seed)
const SQL_MIGRACION = readFileSync(MIGRACION, "utf8");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

function correr(sql, { forzarMigracion = false } = {}) {
  const yaEsta = psql("select to_regprocedure('retail.fn_emitir_comprobantes_del_cambio(uuid, jsonb)') is not null;").trim() === "t";
  const migracion = forzarMigracion || !yaEsta ? SQL_MIGRACION : "";
  try {
    const salida = psql(`begin;\n${migracion}\n${PRELUDIO}\n${sql}\nrollback;\n`).trim().split("\n").filter((x) => x !== "");
    return { ok: true, lineas: salida };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// Lima con caja fresca, stock de sobra y series propias de la prueba; Trujillo con su stock y su serie propia.
const PRELUDIO = `
create function pg_temp.intentar(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end $f$;
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as ubic_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'ubic', :'ubic_tru']::uuid[]) u
   where not exists (select 1 from retail.sububicaciones where ubicacion_id = u and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'ubic', :'ubic_tru']::uuid[]) u
   where not exists (select 1 from retail.sububicaciones where ubicacion_id = u and tipo = 'almacen_tienda');
update retail.series_comprobantes set archivada_at = now(), motivo_archivo = 'prueba automatizada (se revierte)'
 where ubicacion_id in (:'ubic', :'ubic_tru') and tipo in ('boleta', 'nota_credito') and archivada_at is null;
insert into retail.series_comprobantes (ubicacion_id, tipo, serie) values
  (:'ubic', 'boleta', 'B901'), (:'ubic', 'nota_credito', 'BC91'), (:'ubic', 'nota_credito', 'FC91'), (:'ubic_tru', 'boleta', 'B902');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 500.00, 'prueba automatizada') as caja_id \\gset
select id as v_m from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v_s from retail.variantes where sku = 'BLU-EMMA-NEG-S' \\gset
select id as v_ves from retail.variantes where sku = 'VES-SOFI-NEG-M' \\gset
with m as (
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select v, u, retail.fn_sububicacion_por_defecto(u, 'venta'), 'entrada', 50, 'colchón de prueba'
    from unnest(array[:'v_m', :'v_s', :'v_ves']::uuid[]) v cross join unnest(array[:'ubic', :'ubic_tru']::uuid[]) u
  returning id
)
select count(retail.fn_aplicar_movimiento(m.id)) as _stock from m \\gset
`;

/** Una venta en Lima pagada con tarjeta (no ensucia la caja), con su papel; `aceptada` la marca como aceptada por SUNAT. */
function venta({ variante, cantidad = 1, descuento = 0, tipo = "boleta", aceptada = true }) {
  const doc = tipo === "factura" ? `, 'ruc', '20100070970', 'Empresa de prueba SAC'` : "";
  const motivo = descuento > 0 ? `, 'motivo_descuento', 'liquidacion_temporada'` : "";
  return `
select retail.fn_precio_en_sede(:'${variante}', :'ubic') as p_venta \\gset
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'${variante}', 'cantidad', ${cantidad},
    'precio_unitario', (:'p_venta')::numeric, 'descuento_unitario', ${descuento}${motivo})),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', ((:'p_venta')::numeric - ${descuento}) * ${cantidad})),
  null, gen_random_uuid(), '${tipo}'${doc}) as venta_id \\gset
${aceptada ? `update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where venta_id = :'venta_id';` : ""}
select id as venta_item from retail.venta_items where venta_id = :'venta_id' \\gset
select esperado as esp_antes from retail.fn_calcular_esperado_caja(:'caja_id') \\gset
`;
}

const cambio = ({ nueva, cantidad = 1, metodo = null, ubic = "ubic", token = "gen_random_uuid()" }) =>
  `select retail.registrar_cambio(:'venta_item', :'${ubic}', :'${nueva}', ${cantidad}, ${metodo ? `'${metodo}'` : "null"}, ${token}) as cambio_id \\gset`;

/** Una prenda por varias (ADR-0470): `salidas` = [[variante, cantidad], …]. */
const cambioVarias = ({ salidas, metodo = null }) =>
  `select retail.registrar_cambio_varias(:'venta_item', :'ubic',
     jsonb_build_array(${salidas.map(([v, c]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', ${c})`).join(", ")}),
     1, ${metodo ? `'${metodo}'` : "null"}, gen_random_uuid()) as cambio_id \\gset`;

// Todo lo que se mira de un cambio, en una línea JSON.
const LEER = `
select json_build_object(
  'n', (select count(*) from retail.comprobantes where cambio_id = :'cambio_id'),
  'dif', (select diferencia from retail.cambios where id = :'cambio_id'),
  'venta_estado', (select estado from retail.ventas where id = :'venta_id'),
  'orig', (select row_to_json(x) from (select id, cliente_tipo_doc || ':' || coalesce(cliente_num_doc, '') as doc, ubicacion_id
             from retail.comprobantes where venta_id = :'venta_id' and tipo in ('boleta', 'factura') limit 1) x),
  'nc', (select row_to_json(x) from (select total, subtotal, igv, motivo, serie, ubicacion_id, comprobante_original_id, venta_id, estado, items,
           cliente_tipo_doc || ':' || coalesce(cliente_num_doc, '') as doc
           from retail.comprobantes where cambio_id = :'cambio_id' and tipo = 'nota_credito') x),
  'bol', (select row_to_json(x) from (select total, subtotal, igv, tipo, serie, ubicacion_id, venta_id, estado, items,
           cliente_tipo_doc || ':' || coalesce(cliente_num_doc, '') as doc
           from retail.comprobantes where cambio_id = :'cambio_id' and tipo <> 'nota_credito') x),
  'delta_caja', (select esperado from retail.fn_calcular_esperado_caja(:'caja_id')) - (:'esp_antes')::numeric,
  'registro', (select coalesce(sum(x.signo * x.total), 0) from retail.fn_impuestos_ventas(retail.fn_hoy_lima(), retail.fn_hoy_lima()) x
                 join retail.comprobantes c on c.id = x.comprobante_id where c.cambio_id = :'cambio_id')
)::text;
`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  if (ok) {
    console.log(`✓ ${nombre}`);
  } else {
    fallos++;
    console.log(`✗ ${nombre}`);
    console.log(`    ${typeof detalle === "string" ? detalle.slice(0, 1500) : JSON.stringify(detalle).slice(0, 1500)}`);
  }
}

const num = (x) => Number(x);
const leer = (r) => (r.ok ? JSON.parse(r.lineas.at(-1)) : null);
/** Lo que vale cada caso de negocio: dos papeles sin venta, ligados al original, la caja que solo ve la diferencia, el registro igual. */
function papelesSanos(h, { ubicBoleta } = {}) {
  return (
    h &&
    num(h.n) === 2 &&
    h.venta_estado !== "anulada" &&
    h.nc && h.bol &&
    h.nc.venta_id === null && h.bol.venta_id === null &&
    h.nc.comprobante_original_id === h.orig.id &&
    h.nc.ubicacion_id === h.orig.ubicacion_id &&
    (ubicBoleta ? h.bol.ubicacion_id === ubicBoleta : h.bol.ubicacion_id === h.orig.ubicacion_id) &&
    h.nc.doc === h.orig.doc && h.bol.doc === h.orig.doc &&
    h.nc.estado === "pendiente" && h.bol.estado === "pendiente" &&
    Math.abs(num(h.bol.total) - num(h.nc.total) - num(h.dif)) < 0.001 &&
    Math.abs(num(h.registro) - num(h.dif)) < 0.001 &&
    Math.abs(num(h.nc.subtotal) + num(h.nc.igv) - num(h.nc.total)) < 0.001 &&
    Math.abs(num(h.bol.subtotal) + num(h.bol.igv) - num(h.bol.total)) < 0.001
  );
}
/** Σ (precio − descuento) × cantidad de los ítems de un papel. */
const sumaItems = (p) => p.items.reduce((s, it) => s + (num(it.precio_unitario) - num(it.descuento_unitario ?? 0)) * num(it.cantidad), 0);

// 1. Color o talla.
{
  const r = correr(`${venta({ variante: "v_m" })}\n${cambio({ nueva: "v_s" })}\n${LEER}`);
  const h = leer(r);
  esperar(
    "1 · color o talla: nota y boleta por S/ 79.90, la caja no se mueve, la venta sigue viva",
    papelesSanos(h) && num(h.dif) === 0 && num(h.nc.total) === 79.9 && num(h.bol.total) === 79.9 && num(h.delta_caja) === 0 &&
      h.nc.motivo === "06" && h.nc.serie === "BC91" && h.bol.serie === "B901" && h.bol.tipo === "boleta" &&
      Math.abs(sumaItems(h.nc) - 79.9) < 0.001 && Math.abs(sumaItems(h.bol) - 79.9) < 0.001,
    r.ok ? h : r.mensaje,
  );
}

// 2. Prenda más cara, diferencia en efectivo.
{
  const r = correr(`${venta({ variante: "v_m" })}\n${cambio({ nueva: "v_ves", metodo: "efectivo" })}\n${LEER}`);
  const h = leer(r);
  esperar(
    "2 · más cara: nota S/ 79.90, boleta S/ 149.90, la caja espera +70 y el registro suma +70",
    papelesSanos(h) && num(h.dif) === 70 && num(h.nc.total) === 79.9 && num(h.bol.total) === 149.9 && num(h.delta_caja) === 70 &&
      Math.abs(sumaItems(h.bol) - 149.9) < 0.001,
    r.ok ? h : r.mensaje,
  );
}

// 3. Prenda más barata, diferencia en efectivo.
{
  const r = correr(`${venta({ variante: "v_ves" })}\n${cambio({ nueva: "v_m", metodo: "efectivo" })}\n${LEER}`);
  const h = leer(r);
  esperar(
    "3 · más barata: nota S/ 149.90, boleta S/ 79.90, la caja espera −70 y el registro suma −70",
    papelesSanos(h) && num(h.dif) === -70 && num(h.nc.total) === 149.9 && num(h.bol.total) === 79.9 && num(h.delta_caja) === -70,
    r.ok ? h : r.mensaje,
  );
}

// 4. Comprada con descuento, por otro modelo (pagada con tarjeta: la caja no se mueve).
{
  const r = correr(`${venta({ variante: "v_m", descuento: 10 })}\n${cambio({ nueva: "v_ves", metodo: "tarjeta" })}\n${LEER}`);
  const h = leer(r);
  esperar(
    "4 · con descuento, otro modelo: la nota va por lo pagado (S/ 69.90, con su descuento) y la boleta a lista (S/ 149.90)",
    papelesSanos(h) && num(h.dif) === 80 && num(h.nc.total) === 69.9 && num(h.nc.items[0].descuento_unitario) === 10 &&
      num(h.bol.total) === 149.9 && num(h.delta_caja) === 0,
    r.ok ? h : r.mensaje,
  );
}

// 5. Comprada con descuento, mismo modelo: conserva el descuento (ADR-0655).
{
  const r = correr(`${venta({ variante: "v_m", descuento: 10 })}\n${cambio({ nueva: "v_s" })}\n${LEER}`);
  const h = leer(r);
  esperar(
    "5 · con descuento, mismo modelo: diferencia 0 y la boleta dice lista S/ 79.90 con S/ 10 de descuento",
    papelesSanos(h) && num(h.dif) === 0 && num(h.nc.total) === 69.9 && num(h.bol.total) === 69.9 &&
      num(h.bol.items[0].precio_unitario) === 79.9 && num(h.bol.items[0].descuento_unitario) === 10,
    r.ok ? h : r.mensaje,
  );
}

// 6. Una de dos unidades.
{
  const r = correr(`${venta({ variante: "v_m", cantidad: 2 })}\n${cambio({ nueva: "v_s" })}\n${LEER}`);
  const h = leer(r);
  esperar(
    "6 · una de dos unidades: la nota es «07» y declara una sola",
    papelesSanos(h) && h.nc.motivo === "07" && num(h.nc.items[0].cantidad) === 1 && num(h.nc.total) === 79.9,
    r.ok ? h : r.mensaje,
  );
}

// 7. Boleta original sin aceptar: se rechaza y no queda nada.
{
  const r = correr(`${venta({ variante: "v_m", aceptada: false })}
select pg_temp.intentar(format('select retail.registrar_cambio(%L, %L, %L, 1, null, gen_random_uuid())', :'venta_item', :'ubic', :'v_s'));
select (select count(*) from retail.cambios where venta_item_id = :'venta_item') || '|' ||
       (select count(*) from retail.comprobantes where cambio_id is not null);`);
  const msg = r.ok ? r.lineas.at(-2) : "";
  esperar(
    "7 · la boleta original aún no llega a SUNAT: el cambio espera y no queda nada escrito",
    r.ok && msg.includes("todavía no está aceptada por SUNAT") && r.lineas.at(-1) === "0|0",
    r.ok ? r.lineas : r.mensaje,
  );
}

// 8. Nota de venta: no hay papel de SUNAT que corregir.
{
  const r = correr(`${venta({ variante: "v_m", tipo: "nota_venta", aceptada: false })}\n${cambio({ nueva: "v_s" })}\n${LEER}`);
  const h = leer(r);
  esperar("8 · venta con nota de venta: el cambio se guarda y no emite papeles", h && num(h.n) === 0 && num(h.dif) === 0, r.ok ? h : r.mensaje);
}

// 9. Factura: nota con serie F y factura nueva al mismo RUC.
{
  const r = correr(`${venta({ variante: "v_m", tipo: "factura" })}\n${cambio({ nueva: "v_ves", metodo: "tarjeta" })}\n${LEER}`);
  const h = leer(r);
  esperar(
    "9 · factura: la nota lleva serie F (FC91) y el papel nuevo es factura al mismo RUC",
    papelesSanos(h) && h.nc.serie === "FC91" && h.bol.tipo === "factura" && h.bol.serie.startsWith("F") && h.bol.doc === "ruc:20100070970",
    r.ok ? h : r.mensaje,
  );
}

// 10. Doble clic con el mismo token.
{
  const r = correr(`${venta({ variante: "v_m" })}
select gen_random_uuid() as tok \\gset
${cambio({ nueva: "v_s", token: ":'tok'" })}
${cambio({ nueva: "v_s", token: ":'tok'" })}
select (select count(*) from retail.cambios where venta_item_id = :'venta_item') || '|' ||
       (select count(*) from retail.comprobantes c join retail.cambios k on k.id = c.cambio_id where k.venta_item_id = :'venta_item');`);
  esperar("10 · doble clic con el mismo token: un cambio y dos papeles, no cuatro", r.ok && r.lineas.at(-1) === "1|2", r.ok ? r.lineas : r.mensaje);
}

// 11. Cambio en Trujillo de una compra de Lima, por quien solo opera Trujillo.
{
  const r = correr(`${venta({ variante: "v_m" })}
set local request.jwt.claim.sub = '${MICAELA}';
select retail.fn_puede_operar_ubicacion(:'ubic') as opera_lima \\gset
${cambio({ nueva: "v_s", ubic: "ubic_tru" })}
set local request.jwt.claim.sub = '${FELIPE}';
${LEER}
select :'opera_lima';`);
  const h = r.ok ? JSON.parse(r.lineas.at(-2)) : null;
  esperar(
    "11 · en otra tienda: la nota sale en la serie de Lima (la de la boleta) y la boleta en la de Trujillo, aunque quien cambia no opere Lima",
    r.ok && r.lineas.at(-1) === "f" && h && h.nc.serie === "BC91" && h.bol.serie === "B902" &&
      num(h.n) === 2 && Math.abs(num(h.bol.total) - num(h.nc.total) - num(h.dif)) < 0.001,
    r.ok ? r.lineas : r.mensaje,
  );
}

// 14. Una por varias, con descuento: la blusa del mismo modelo conserva su descuento en su propia línea; el vestido va a lista.
{
  const r = correr(`${venta({ variante: "v_m", descuento: 10 })}\n${cambioVarias({ salidas: [["v_s", 1], ["v_ves", 1]], metodo: "tarjeta" })}\n${LEER}`);
  const h = leer(r);
  const blusa = h?.bol?.items.find((it) => num(it.descuento_unitario) === 10);
  esperar(
    "14 · una por varias con descuento: nota S/ 69.90, boleta S/ 219.80 con la blusa a S/ 79.90 − 10 y el vestido a lista",
    papelesSanos(h) && num(h.dif) === 149.9 && num(h.nc.total) === 69.9 && num(h.bol.total) === 219.8 &&
      h.bol.items.length === 2 && blusa && num(blusa.precio_unitario) === 79.9 && Math.abs(sumaItems(h.bol) - 219.8) < 0.001,
    r.ok ? h : r.mensaje,
  );
}

// 15. Una por dos vestidos, diferencia en efectivo: la caja espera lo mismo que dicen los papeles.
{
  const r = correr(`${venta({ variante: "v_m" })}\n${cambioVarias({ salidas: [["v_ves", 2]], metodo: "efectivo" })}\n${LEER}`);
  const h = leer(r);
  esperar(
    "15 · una por dos vestidos en efectivo: boleta S/ 299.80 − nota S/ 79.90 = la caja espera +219.90",
    papelesSanos(h) && num(h.dif) === 219.9 && num(h.bol.total) === 299.8 && num(h.delta_caja) === 219.9 &&
      h.bol.items.length === 1 && num(h.bol.items[0].cantidad) === 2,
    r.ok ? h : r.mensaje,
  );
}

// 16. Si el envío al guardar no llegó (sin red), el reintento automático toma los dos papeles: no tienen venta y aun así entran a la cola.
{
  const r = correr(`${venta({ variante: "v_m" })}\n${cambio({ nueva: "v_ves", metodo: "tarjeta" })}
update retail.comprobantes set created_at = now() - interval '3 minutes' where cambio_id = :'cambio_id';
select (select count(*) from retail.fn_tomar_comprobantes_para_reintento(:'ubic', 20) t(id)
          join retail.comprobantes c on c.id = t.id where c.cambio_id = :'cambio_id')
       || '|' || (select count(*) from retail.comprobantes where cambio_id = :'cambio_id');`);
  esperar("16 · sin red al guardar: el reintento automático toma la nota y la boleta del cambio", r.ok && r.lineas.at(-1) === "2|2", r.ok ? r.lineas : r.mensaje);
}

// 17. El vigía de /chaos (INV-30) ve lo que vigila: limpio tras un cambio de verdad; con la boleta del cambio retocada a mano, lo ve.
{
  const inv = INVARIANTES.find((i) => i.id === "INV-30");
  const r = inv
    ? correr(`${venta({ variante: "v_m" })}\n${cambio({ nueva: "v_ves", metodo: "efectivo" })}
select count(*) from (${inv.sql}) x;
${inv.corrompe}
select count(*) from (${inv.sql}) x;`)
    : { ok: false, mensaje: "INV-30 no está en scripts/chaos/invariantes.mjs" };
  esperar("17 · el vigía de /chaos (INV-30): limpio tras el cambio, y ve la boleta retocada", r.ok && r.lineas.at(-2) === "0" && num(r.lineas.at(-1)) >= 1, r.ok ? r.lineas : r.mensaje);
}

// 12. MUTANTE: un cambio que no emite papeles (como antes de la migración) lo ve el caso 1.
{
  const r = correr(`create or replace function retail.fn_emitir_comprobantes_del_cambio(p_cambio_id uuid, p_items_boleta jsonb default null)
  returns void language plpgsql as $m$ begin return; end $m$;
${venta({ variante: "v_m" })}\n${cambio({ nueva: "v_s" })}\n${LEER}`);
  const h = leer(r);
  esperar("12 · MUTANTE: si el cambio no emite papeles, la prueba lo ve", h && !papelesSanos(h) && num(h.n) === 0, r.ok ? h : r.mensaje);
}

// 13. Pegar dos veces.
{
  const r = correr(`${SQL_MIGRACION}\n${venta({ variante: "v_m" })}\n${cambio({ nueva: "v_s" })}\n${LEER}`, { forzarMigracion: true });
  const h = leer(r);
  esperar("13 · la migración se puede pegar dos veces y el cambio sigue emitiendo sus dos papeles", papelesSanos(h), r.ok ? h : r.mensaje);
}

console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} caso(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Prueba de ADR-0671 «Un cambio con diferencia de precio emite su nota de crédito y su comprobante nuevo»
 * (`supabase/migrations/20261116212000_…parte1_columnas.sql` y `20261116213000_…parte2_funciones.sql`, Felipe 2026-11-16).
 *
 * EL PROBLEMA. Un cambio cobraba o devolvía la diferencia sin ningún comprobante: la boleta seguía diciendo la prenda de antes y lo cobrado
 * de más entraba sin documento.
 *
 * QUÉ CUBRE (la venta de partida: BLU-EMMA-NEG-M de lista con S/ 10 de descuento en Tienda Lima; cada caso, con su comprobante):
 *    1. Sin diferencia (otra talla del mismo modelo): no sale ningún documento; el stock se mueve como siempre.
 *    2. Más cara, boleta aceptada: boleta nueva (sin venta, colgada del cambio) + nota 06 por lo pagado; nuevo − nota = diferencia; las
 *       líneas suman su total; el stock y los movimientos, como siempre.
 *    3. Más barata: boleta nueva por la prenda barata + nota por lo pagado; la diferencia es negativa y cuadra igual.
 *    4. Boleta original todavía sin aceptar: la boleta nueva sale ya; la nota queda por emitir. Al aceptarse, el barrido la emite una sola vez.
 *    5. El mismo modelo en una talla que cuesta S/ 5 más: también emite; la línea nueva conserva el descuento.
 *    6. Una por varias: una línea por prenda, con el mismo modelo a su precio con descuento y la otra a su precio.
 *    7. Un regalo: la boleta nueva sale al cliente que se indica; la nota, siempre al de la compra.
 *    8. Una boleta nueva de más de S/ 700 sin documento se rechaza y no queda NADA (ni el cambio, ni stock movido, ni un número gastado).
 *    9. Factura: nota F… y factura nueva al mismo RUC, aunque la pantalla mande otro cliente.
 *   10. Nota de venta: nota de venta nueva (IGV 0), sin nota de crédito.
 *   11. Candados: el comprobante nuevo no se anula ni se libera por separado; la original con la nota por emitir no se libera.
 *   12. Doble clic con el mismo token: un cambio, un comprobante nuevo, una nota.
 *   13. Una venta de prueba no emite nada.
 *   14. previsualizar_documentos_cambio dice lo mismo que va a pasar (ahora / después / el problema del documento).
 *   15. Si el barrido no puede emitir (la tienda sin serie de nota), anota el error y no se cae.
 *   16. Dos prendas en la boleta y se cambia una: nota 07 con solo esa prenda.
 *   17. MUTANTE: con fn_documentos_del_cambio vacía, el caso 2 no tiene documentos, y la prueba lo ve.
 *   18. Las dos partes de la migración se pueden pegar dos veces.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK (nunca se commitea nada), como Felipe (líder) con `request.jwt.claim.sub`. Si la base no
 * tiene la migración, se aplica dentro de cada transacción (el CI la tiene).
 *
 * USO
 *   pnpm pruebas:cambio-con-comprobantes
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const PARTE1 = readFileSync(join(RAIZ, "supabase", "migrations", "20261116212000_cambio_con_comprobantes_parte1_columnas.sql"), "utf8");
const PARTE2 = readFileSync(join(RAIZ, "supabase", "migrations", "20261116213000_cambio_con_comprobantes_parte2_funciones.sql"), "utf8");
const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const YA_ESTA =
  psql("select to_regprocedure('retail.registrar_cambio(uuid,uuid,uuid,integer,text,uuid,text,text,jsonb)') is not null;").trim() === "t";

function correr(sql, { venta = "boleta", extra = "" } = {}) {
  const migracion = YA_ESTA ? "" : `${PARTE1}\n${PARTE2}\n`;
  try {
    const salida = psql(`begin;\n${migracion}${PRELUDIO}\n${extra}\n${VENTA(venta)}\n${sql}\nrollback;\n`);
    return { ok: true, lineas: salida.trim().split("\n").filter((x) => x !== "") };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// `pg_temp.intentar(sql)` devuelve «ok» o «mensaje :: pista» en vez de abortar. `pg_temp.docs(línea)` resume los documentos del cambio de
// esa línea de venta, y `pg_temp.cuadra(línea)` comprueba nuevo − nota = diferencia y que las líneas de cada documento sumen su total.
const PRELUDIO = `
create function pg_temp.intentar(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_hint text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
  return v_msg || ' :: ' || coalesce(nullif(v_hint, ''), '-');
end $f$;
create function pg_temp.docs(p_item uuid) returns text language sql as $f$
  select coalesce((select 'nuevo=' || n.tipo || '|' || n.total || '|' || n.igv || '|' || n.cliente_tipo_doc || '|' || coalesce(n.cliente_num_doc, '-')
                          || '|' || n.estado || '|' || (case when n.venta_id is null then 'sin-venta' else 'con-venta' end)
                     from retail.comprobantes n join retail.cambios c on c.id = n.cambio_id
                    where c.venta_item_id = p_item and n.tipo <> 'nota_credito'), 'nuevo=no')
    || ' ' || coalesce((select 'nota=' || n.total || '|' || n.motivo || '|' || left(n.serie, 1) || '|' || n.cliente_tipo_doc || '|' || coalesce(n.cliente_num_doc, '-')
                          from retail.comprobantes n join retail.cambios c on c.id = n.cambio_id
                         where c.venta_item_id = p_item and n.tipo = 'nota_credito'), 'nota=no')
    || ' ' || 'pend=' || (select count(*) from retail.cambio_notas cn join retail.cambios c on c.id = cn.cambio_id
                           where c.venta_item_id = p_item
                             and not exists (select 1 from retail.comprobantes x where x.cambio_id = cn.cambio_id and x.tipo = 'nota_credito'));
$f$;
create function pg_temp.suma_lineas(p_items jsonb) returns numeric language sql as $f$
  select round(sum(((e ->> 'precio_unitario')::numeric - coalesce((e ->> 'descuento_unitario')::numeric, 0)) * (e ->> 'cantidad')::numeric), 2)
    from jsonb_array_elements(p_items) e;
$f$;
-- nuevo − lo pagado = diferencia; la nota, si la hay, es exactamente lo pagado (así nuevo − nota = diferencia); y cada documento suma sus líneas.
create function pg_temp.cuadra(p_item uuid) returns boolean language sql as $f$
  select bool_and(
           round(coalesce((select n.total from retail.comprobantes n where n.cambio_id = c.id and n.tipo <> 'nota_credito'), 0)
                 - round((vi.precio_unitario - vi.descuento_unitario) * c.cantidad, 2), 2) = c.diferencia
           and coalesce((select n.total = round((vi.precio_unitario - vi.descuento_unitario) * c.cantidad, 2)
                           from retail.comprobantes n where n.cambio_id = c.id and n.tipo = 'nota_credito'), true)
           and coalesce((select bool_and(pg_temp.suma_lineas(n.items) = n.total and round(n.subtotal + n.igv, 2) = n.total)
                           from retail.comprobantes n where n.cambio_id = c.id), true))
    from retail.cambios c join retail.venta_items vi on vi.id = c.venta_item_id where c.venta_item_id = p_item;
$f$;
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 500.00, 'prueba automatizada') as caja_id \\gset
-- Series de nota de crédito (B y F) y de nota de venta: la semilla local solo trae boleta y factura.
insert into retail.series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero)
  select :'ubic', 'nota_credito', 'BC01', 1
  where not exists (select 1 from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'nota_credito' and serie like 'B%' and archivada_at is null);
insert into retail.series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero)
  select :'ubic', 'nota_credito', 'FC01', 1
  where not exists (select 1 from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'nota_credito' and serie like 'F%' and archivada_at is null);
insert into retail.series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero)
  select :'ubic', 'nota_venta', 'NV91', 1
  where not exists (select 1 from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'nota_venta' and archivada_at is null);
select id as v_old from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v_s from retail.variantes where sku = 'BLU-EMMA-NEG-S' \\gset
select id as v_l from retail.variantes where sku = 'BLU-EMMA-NEG-L' \\gset
select id as v_ves from retail.variantes where sku = 'VES-SOFI-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x, :'ubic', :'sub_piso', 'entrada', 50, 'colchón de prueba' from unnest(array[:'v_old', :'v_s', :'v_l', :'v_ves']::uuid[]) x;
select count(*) as _aplicados from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  where m.ubicacion_id = :'ubic' and m.motivo = 'colchón de prueba' and m.created_at = now()) a \\gset
select retail.fn_precio_en_sede(:'v_old', :'ubic') as precio_old \\gset
select retail.fn_precio_en_sede(:'v_ves', :'ubic') as precio_ves \\gset
select gen_random_uuid() as tok \\gset
`;

/** La venta de partida: una blusa con S/ 10 de descuento y el comprobante pedido (boleta, factura o nota de venta). */
const VENTA = (tipo) => `
select retail.registrar_venta(
  p_ubicacion_id => :'ubic',
  p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', (:'precio_old')::numeric,
                                                  'descuento_unitario', 10, 'motivo_descuento', 'liquidacion_temporada')),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'precio_old')::numeric - 10)),
  p_token => gen_random_uuid(),
  p_tipo_comprobante => '${tipo}',
  p_cliente_tipo_doc => '${tipo === "factura" ? "ruc" : "sin_documento"}',
  p_cliente_num_doc => ${tipo === "factura" ? "'20123456789'" : "null"},
  p_cliente_nombre => ${tipo === "factura" ? "'Empresa de Prueba SAC'" : "null"}) as venta_id \\gset
select id as venta_item from retail.venta_items where venta_id = :'venta_id' and variante_id = :'v_old' \\gset
select id as original from retail.comprobantes where venta_id = :'venta_id' \\gset
`;

const ACEPTAR = `update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where id = :'original';`;
const CAMBIAR = (variante, metodo = "tarjeta") =>
  `select pg_temp.intentar(format('select retail.registrar_cambio(%L, %L, %L, 1, %L, %L)', :'venta_item', :'ubic', :'${variante}', '${metodo}', :'tok'));`;
const CAMBIAR_A = (variante, cliente) =>
  `select pg_temp.intentar(format('select retail.registrar_cambio(p_venta_item_id => %L, p_ubicacion_id => %L, p_variante_nueva_id => %L, p_cantidad => 1, p_metodo_pago_diferencia => %L, p_token => %L, p_cliente => %L::jsonb)', :'venta_item', :'ubic', :'${variante}', 'tarjeta', :'tok', '${cliente}'));`;
const CAMBIAR_VARIAS = (salidas) =>
  `select pg_temp.intentar(format('select retail.registrar_cambio_varias(%L, %L, %L::jsonb, 1, %L, %L)', :'venta_item', :'ubic',
     jsonb_build_array(${salidas.map((v) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', 1)`).join(", ")})::text, 'tarjeta', :'tok'));`;
const DOCS = `select pg_temp.docs(:'venta_item');`;
const CUADRA = `select pg_temp.cuadra(:'venta_item');`;
const DIFERENCIA = `select coalesce((select diferencia from retail.cambios where venta_item_id = :'venta_item'), -999);`;
const MOVS = `select count(*) from retail.movimientos m join retail.cambios c on c.id = m.cambio_id where c.venta_item_id = :'venta_item';`;
const PAGADO = "((:'precio_old')::numeric - 10)";

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}
const fijo = (n) => Number(n).toFixed(2);

// 1 · sin diferencia
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR("v_s")}\n${DOCS}\n${MOVS}`);
  const l = r.ok ? r.lineas : [];
  esperar("1 · sin diferencia (otra talla del mismo modelo): ningún documento, y el stock se mueve como siempre",
    r.ok && l[0] === "ok" && l[1] === "nuevo=no nota=no pend=0" && l[2] === "2", r.ok ? l : r.mensaje);
}

// 2 · más cara, boleta aceptada
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\n${DOCS}\n${CUADRA}\n${MOVS}\nselect ${PAGADO}, (:'precio_ves')::numeric;`);
  const l = r.ok ? r.lineas : [];
  const [pagado, ves] = (l[4] ?? "").split("|");
  esperar("2 · más cara, boleta aceptada: boleta nueva sin venta + nota 06 por lo pagado; nuevo − nota = diferencia; dos movimientos",
    r.ok && l[0] === "ok" && Number(ves) > Number(pagado)
      && l[1] === `nuevo=boleta|${fijo(ves)}|${fijo(Number(ves) - Math.round((Number(ves) / 1.18) * 100) / 100)}|sin_documento|-|pendiente|sin-venta nota=${fijo(pagado)}|06|B|sin_documento|- pend=0`
      && l[2] === "t" && l[3] === "2",
    r.ok ? l : r.mensaje);
}

// 3 · más barata
{
  const r = correr(`update retail.variantes set precio = 50 where id = :'v_ves';\n${ACEPTAR}\n${CAMBIAR("v_ves")}\n${DOCS}\n${CUADRA}\n${DIFERENCIA}\nselect ${PAGADO};`);
  const l = r.ok ? r.lineas : [];
  esperar("3 · más barata: boleta nueva por S/ 50 + nota por lo pagado; la diferencia es negativa y cuadra",
    r.ok && l[0] === "ok" && l[1].startsWith("nuevo=boleta|50.00|") && l[1].includes(`nota=${fijo(l[4])}|06|B`) && l[2] === "t"
      && Number(l[3]) === Number(fijo(50 - Number(l[4]))),
    r.ok ? l : r.mensaje);
}

// 4 · original sin aceptar: la nota espera y el barrido la emite una sola vez
{
  const r = correr(`${CAMBIAR("v_ves")}\n${DOCS}\n${ACEPTAR}\nselect retail.fn_emitir_notas_de_cambios_pendientes();\n${DOCS}\nselect retail.fn_emitir_notas_de_cambios_pendientes();\n${CUADRA}`);
  const l = r.ok ? r.lineas : [];
  esperar("4 · boleta original sin aceptar: la boleta nueva sale ya y la nota queda por emitir",
    r.ok && l[0] === "ok" && l[1].startsWith("nuevo=boleta|") && l[1].endsWith("nota=no pend=1"), r.ok ? l : r.mensaje);
  esperar("    …al aceptarse la original, el barrido la emite (1) y no la repite (0); todo cuadra",
    r.ok && l[2] === "1" && l[3].includes("|06|B|") && l[3].endsWith("pend=0") && l[4] === "0" && l[5] === "t", r.ok ? l : r.mensaje);
}

// 5 · mismo modelo, talla más cara
{
  const r = correr(`update retail.variantes set precio = precio + 5 where id = :'v_s';\n${ACEPTAR}\n${CAMBIAR("v_s")}\n${DOCS}\n${CUADRA}
select (n.items -> 0 ->> 'precio_unitario') || '|' || (n.items -> 0 ->> 'descuento_unitario') from retail.comprobantes n join retail.cambios c on c.id = n.cambio_id
 where c.venta_item_id = :'venta_item' and n.tipo = 'boleta';\nselect ${PAGADO}, (:'precio_old')::numeric + 5;`);
  const l = r.ok ? r.lineas : [];
  const [pagado, listaS] = (l[4] ?? "").split("|");
  const [pu, du] = (l[3] ?? "").split("|");
  esperar("5 · el mismo modelo en una talla S/ 5 más cara también emite, y la línea nueva conserva el descuento",
    r.ok && l[0] === "ok" && l[1].startsWith(`nuevo=boleta|${fijo(Number(pagado) + 5)}|`) && l[2] === "t"
      && Number(pu) === Number(listaS) && Number(du) === 10,
    r.ok ? l : r.mensaje);
}

// 6 · una por varias
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR_VARIAS(["v_s", "v_ves"])}\n${DOCS}\n${CUADRA}
select jsonb_array_length(n.items) from retail.comprobantes n join retail.cambios c on c.id = n.cambio_id where c.venta_item_id = :'venta_item' and n.tipo = 'boleta';
select ${PAGADO} + (:'precio_ves')::numeric;`);
  const l = r.ok ? r.lineas : [];
  esperar("6 · una por varias: una línea por prenda (la misma blusa con su descuento y el vestido a su precio), y cuadra",
    r.ok && l[0] === "ok" && l[1].startsWith(`nuevo=boleta|${fijo(l[4])}|`) && l[2] === "t" && l[3] === "2", r.ok ? l : r.mensaje);
}

// 7 · un regalo
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR_A("v_ves", '{"tipo_doc": "dni", "num_doc": "12345678", "nombre": "Cliente de regalo"}')}\n${DOCS}`);
  const l = r.ok ? r.lineas : [];
  esperar("7 · un regalo: la boleta nueva sale al DNI indicado; la nota, al cliente de la compra",
    r.ok && l[0] === "ok" && l[1].includes("|dni|12345678|pendiente|") && l[1].includes("nota=") && l[1].includes("|B|sin_documento|-"),
    r.ok ? l : r.mensaje);
}

// 8 · más de S/ 700 sin documento
{
  const r = correr(`update retail.variantes set precio = 800 where id = :'v_ves';
select coalesce(sum(cantidad), 0) as antes from retail.stock where variante_id = :'v_ves' and ubicacion_id = :'ubic' \\gset
select siguiente_numero as serie_antes from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'boleta' and archivada_at is null \\gset
${ACEPTAR}\n${CAMBIAR("v_ves")}
select (select count(*) from retail.cambios where venta_item_id = :'venta_item') || '|'
    || (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_ves' and ubicacion_id = :'ubic'), 0) - :'antes'::numeric) || '|'
    || ((select siguiente_numero from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'boleta' and archivada_at is null) - :'serie_antes'::integer);
${CAMBIAR_A("v_ves", '{"tipo_doc": "dni", "num_doc": "12345678", "nombre": "Cliente"}')}
${DOCS}`);
  const l = r.ok ? r.lineas : [];
  esperar("8 · boleta nueva de más de S/ 700 sin documento: se rechaza y no queda nada (ni cambio, ni stock, ni número)",
    r.ok && /más de S\/ 700/.test(l[0] ?? "") && (l[0] ?? "").endsWith(":: documento_invalido") && l[1] === "0|0|0", r.ok ? l : r.mensaje);
  esperar("    …con el DNI del cliente, el mismo cambio sale",
    r.ok && l[2] === "ok" && l[3].startsWith("nuevo=boleta|800.00|") && l[3].includes("|dni|12345678|"), r.ok ? l : r.mensaje);
}

// 9 · factura
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR_A("v_ves", '{"tipo_doc": "dni", "num_doc": "12345678", "nombre": "Otra persona"}')}\n${DOCS}\n${CUADRA}`, { venta: "factura" });
  const l = r.ok ? r.lineas : [];
  esperar("9 · factura: nota F… y factura nueva al mismo RUC, aunque llegue otro cliente",
    r.ok && l[0] === "ok" && l[1].startsWith("nuevo=factura|") && l[1].includes("|ruc|20123456789|") && l[1].includes("|F|ruc|20123456789")
      && l[2] === "t",
    r.ok ? l : r.mensaje);
}

// 10 · nota de venta
{
  const r = correr(`${CAMBIAR("v_ves")}\n${DOCS}\n${CUADRA}`, { venta: "nota_venta" });
  const l = r.ok ? r.lineas : [];
  esperar("10 · nota de venta: nota de venta nueva con IGV 0, sin nota de crédito",
    r.ok && l[0] === "ok" && /^nuevo=nota_venta\|[0-9.]+\|0\.00\|.*\|interna\|sin-venta nota=no pend=0$/.test(l[1] ?? "") && l[2] === "t",
    r.ok ? l : r.mensaje);
}

// 11 · candados
{
  const r = correr(`${CAMBIAR("v_ves")}
select n.id as nuevo from retail.comprobantes n join retail.cambios c on c.id = n.cambio_id where c.venta_item_id = :'venta_item' and n.tipo = 'boleta' \\gset
select pg_temp.intentar(format('select retail.marcar_comprobante_no_emitido(%L, %L)', :'nuevo', 'prueba automatizada'));
select pg_temp.intentar(format('select retail.marcar_comprobante_no_emitido(%L, %L)', :'original', 'prueba automatizada'));
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where id = :'nuevo';
select pg_temp.intentar(format('select retail.anular_comprobante(%L, %L, true)', :'nuevo', 'prueba automatizada'));`);
  const l = r.ok ? r.lineas : [];
  esperar("11 · el comprobante nuevo no se libera ni se anula por separado; la original con su nota por emitir no se libera",
    r.ok && l[0] === "ok" && (l[1] ?? "").endsWith(":: documento_de_un_cambio") && (l[2] ?? "").endsWith(":: original_de_un_cambio")
      && (l[3] ?? "").endsWith(":: documento_de_un_cambio"),
    r.ok ? l : r.mensaje);
}

// 12 · doble clic
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\n${CAMBIAR("v_ves")}
select (select count(*) from retail.cambios where venta_item_id = :'venta_item') || '|'
    || (select count(*) from retail.comprobantes n join retail.cambios c on c.id = n.cambio_id where c.venta_item_id = :'venta_item');`);
  const l = r.ok ? r.lineas : [];
  esperar("12 · doble clic con el mismo token: un cambio y sus dos documentos, no cuatro",
    r.ok && l[0] === "ok" && l[1] === "ok" && l[2] === "1|2", r.ok ? l : r.mensaje);
}

// 13 · venta de prueba
{
  const r = correr(`${ACEPTAR}\nupdate retail.ventas set es_prueba = true where id = :'venta_id';\n${CAMBIAR("v_ves")}\n${DOCS}`);
  const l = r.ok ? r.lineas : [];
  esperar("13 · una venta de prueba no emite nada", r.ok && l[0] === "ok" && l[1] === "nuevo=no nota=no pend=0", r.ok ? l : r.mensaje);
}

// 14 · previsualizar
{
  const PREVIA = (total, cliente = "null") =>
    `select (x ->> 'emite') || '|' || coalesce(x -> 'nuevo' ->> 'tipo', '-') || '|' || coalesce(x -> 'nota' ->> 'cuando', '-') || '|' || coalesce(x ->> 'problema', '-')
       from retail.previsualizar_documentos_cambio(:'venta_item', :'ubic', 1, ${total}, ${cliente}) x;`;
  const r = correr(`${PREVIA(`${PAGADO}`)}\n${PREVIA("120")}\n${ACEPTAR}\n${PREVIA("120")}\n${PREVIA("800")}
${PREVIA("800", `'{"tipo_doc": "dni", "num_doc": "12345678"}'::jsonb`)}`);
  const l = r.ok ? r.lineas : [];
  esperar("14 · previsualizar: sin diferencia no emite; con la original sin aceptar la nota va «después», aceptada «ahora»; S/ 800 sin documento dice el problema",
    r.ok && l[0].startsWith("false|") && l[1] === "true|boleta|despues|-" && l[2] === "true|boleta|ahora|-"
      && /^true\|boleta\|ahora\|Una boleta de más de S\/ 700/.test(l[3] ?? "") && l[4] === "true|boleta|ahora|-",
    r.ok ? l : r.mensaje);
}

// 15 · el barrido no se cae
{
  const r = correr(`${CAMBIAR("v_ves")}
update retail.series_comprobantes set archivada_at = now(), motivo_archivo = 'prueba automatizada' where ubicacion_id = :'ubic' and tipo = 'nota_credito';
${ACEPTAR}
select retail.fn_emitir_notas_de_cambios_pendientes();
select cn.intentos || '|' || (cn.ultimo_error is not null) from retail.cambio_notas cn join retail.cambios c on c.id = cn.cambio_id where c.venta_item_id = :'venta_item';
${DOCS}`);
  const l = r.ok ? r.lineas : [];
  esperar("15 · si la tienda no tiene serie de nota, el barrido anota el error, no emite nada y no se cae",
    r.ok && l[0] === "ok" && l[1] === "0" && l[2] === "1|true" && l[3].endsWith("nota=no pend=1"), r.ok ? l : r.mensaje);
}

// 16 · dos prendas en la boleta, se cambia una
{
  const r = correr(`select retail.registrar_venta(
  p_ubicacion_id => :'ubic',
  p_items => jsonb_build_array(
    jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', (:'precio_old')::numeric, 'descuento_unitario', 10, 'motivo_descuento', 'liquidacion_temporada'),
    jsonb_build_object('variante_id', :'v_l', 'cantidad', 1, 'precio_unitario', (:'precio_old')::numeric, 'descuento_unitario', 0)),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 2 * (:'precio_old')::numeric - 10)),
  p_token => gen_random_uuid(), p_tipo_comprobante => 'boleta') as venta_id \\gset
select id as venta_item from retail.venta_items where venta_id = :'venta_id' and variante_id = :'v_old' \\gset
select id as original from retail.comprobantes where venta_id = :'venta_id' \\gset
${ACEPTAR}\n${CAMBIAR("v_ves")}\n${DOCS}\n${CUADRA}
select jsonb_array_length(n.items) || '|' || (n.items -> 0 ->> 'variante_id' = :'v_old') from retail.comprobantes n join retail.cambios c on c.id = n.cambio_id
 where c.venta_item_id = :'venta_item' and n.tipo = 'nota_credito';`);
  const l = r.ok ? r.lineas : [];
  esperar("16 · dos prendas en la boleta y se cambia una: nota 07 con solo esa prenda",
    r.ok && l[0] === "ok" && l[1].includes("|07|B|") && l[2] === "t" && l[3] === "1|true", r.ok ? l : r.mensaje);
}

// 17 · MUTANTE
{
  const r = correr(`create or replace function retail.fn_documentos_del_cambio(p_cambio_id uuid, p_items_nuevo jsonb, p_total_nuevo numeric, p_cliente jsonb)
returns void language plpgsql as $m$ begin return; end $m$;
${ACEPTAR}\n${CAMBIAR("v_ves")}\n${DOCS}`);
  const l = r.ok ? r.lineas : [];
  esperar("17 · MUTANTE: con fn_documentos_del_cambio vacía, el cambio más caro queda sin documentos, y la prueba lo ve",
    r.ok && l[0] === "ok" && l[1] === "nuevo=no nota=no pend=0", r.ok ? l : r.mensaje);
}

// 19 a 22 · Las carreras de /chaos (2026-11-16, semilla 671): liberar o anular la boleta original MIENTRAS se guarda un cambio sobre esa
// venta, y al revés. Antes, liberar y anular revisaban «¿hay un cambio esperando?» y RECIÉN después bloqueaban la boleta, y el cambio
// decidía «la nota espera» con el estado viejo y bloqueaba al final: quedaban una original liberada (o anulada) con su nota por emitir o
// colgando para siempre. Ahora el primero que llega bloquea la boleta y el otro espera ANTES de revisar nada.
// Cómo, sin dejar nada guardado: dos psql de verdad sobre una línea de venta YA confirmada (se elige sola). La sesión A toma la boleta
// (con un cambio, o con un candado) y se queda quieta sin confirmar; la B intenta lo otro con `lock_timeout` corto y tiene que cortarse
// esperando en el candado NUEVO (la primera línea de su contexto). Las dos terminan en ROLLBACK. Si la base no tiene una línea así, se omite.
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function psqlEnParalelo(sql) {
  return new Promise((resolver) => {
    const p = spawn("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-t", "-A", "-F", "|", "-f", "-"]);
    let salida = "";
    let error = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (error += d));
    p.on("close", (codigo) => resolver({ codigo, salida: salida.trim(), error }));
    p.stdin.end(sql);
  });
}
/** Lo que dejó B: «código|la función más adentro de su contexto», o «SIN_ERROR». Un candado que se corta dice «while locking tuple…»
 *  y la sentencia antes que la función: lo que importa es en qué función y en qué instrucción esperaba. */
function lecturaDeB(r) {
  const err = r.error;
  if (!/ERROR/.test(err)) return "SIN_ERROR";
  const codigo = (err.match(/ERROR:\s+([0-9A-Z]{5}):/) ?? [])[1] ?? "?";
  const contexto = (err.split("CONTEXT:")[1] ?? "").split("LOCATION:")[0] ?? "";
  const funcion = contexto.split("\n").map((x) => x.trim()).find((x) => x.startsWith("PL/pgSQL function")) ?? contexto.trim().split("\n")[0];
  return `${codigo}|${funcion}`;
}
const LINEA_CONFIRMADA = psql(`
select vi.id || '|' || v.ubicacion_id || '|' || o.id || '|' ||
       (select n.id from retail.variantes n where n.sku = case when var.sku = 'VES-SOFI-NEG-M' then 'CAS-LUCI-BEI-M' else 'VES-SOFI-NEG-M' end)
  from retail.venta_items vi
  join retail.ventas v on v.id = vi.venta_id
  join retail.variantes var on var.id = vi.variante_id
  join lateral retail.fn_original_del_cambio(v.id) o on true
 where o.id is not null and o.tipo in ('boleta', 'factura') and o.estado not in ('anulado', 'no_emitido') and o.anulacion_solicitada_at is null
   and coalesce(v.estado, '') <> 'anulada' and not coalesce(v.es_prueba, false)
   and retail.fn_hoy_lima() - (v.created_at at time zone 'America/Lima')::date <= 10
   and vi.cantidad > coalesce((select sum(c.cantidad) from retail.cambios c where c.venta_item_id = vi.id), 0)
   and not exists (select 1 from retail.devolucion_items di where di.venta_item_id = vi.id)
   and not exists (select 1 from retail.prendas_por_regularizar pr where pr.venta_item_id = vi.id)
   and round(vi.precio_unitario - vi.descuento_unitario, 2) not in (149.90, 159.90)
 order by v.created_at desc
 limit 1;`).trim();
if (!YA_ESTA) {
  console.log("· 19 a 22 · omitidas: la base no tiene ADR-0671 aplicado (las carreras necesitan las funciones de verdad)");
} else if (!LINEA_CONFIRMADA) {
  console.log("· 19 a 22 · omitidas: la base no tiene una línea de venta confirmada, con boleta viva, que se pueda cambiar");
} else {
  const [item, ubic, orig, nueva] = LINEA_CONFIRMADA.split("|");
  const PREPARA = `begin;
set local request.jwt.claim.sub = '${FELIPE}';
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select '${ubic}', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = '${ubic}' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select '${ubic}', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = '${ubic}' and tipo = 'almacen_tienda');
with m as (
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values ('${nueva}', '${ubic}', retail.fn_sububicacion_por_defecto('${ubic}', 'venta'), 'entrada', 5, 'prueba de carrera') returning id)
select retail.fn_aplicar_movimiento(m.id) from m;
`;
  const CAMBIO = `select retail.registrar_cambio('${item}', '${ubic}', '${nueva}', 1, 'tarjeta', gen_random_uuid());`;
  const QUIETA = "select pg_sleep(4);\nrollback;\n";
  const B = (cuerpo) => `\\set VERBOSITY verbose\nbegin;\nset local request.jwt.claim.sub = '${FELIPE}';\n${cuerpo}\nrollback;\n`;
  const carrera = async (a, b) => {
    const pa = psqlEnParalelo(a);
    await dormir(1500);
    const rb = await psqlEnParalelo(b);
    await pa;
    return lecturaDeB(rb);
  };

  const l19 = await carrera(`${PREPARA}${CAMBIO}\n${QUIETA}`,
    B(`set local lock_timeout = '1500ms';\nselect retail.marcar_comprobante_no_emitido('${orig}', 'prueba de carrera');`));
  esperar("19 · liberar la boleta mientras se guarda un cambio sobre esa venta: liberar espera en el candado ANTES de revisar (no decide con lo viejo)",
    /^55P03\|PL\/pgSQL function (retail\.)?marcar_comprobante_no_emitido\(uuid,text\) line \d+ at PERFORM/.test(l19), l19);

  const l20 = await carrera(`${PREPARA}${CAMBIO}\n${QUIETA}`,
    B(`set local lock_timeout = '1500ms';\nselect retail.anular_comprobante('${orig}', 'prueba de carrera', true);`));
  esperar("20 · anular la boleta mientras se guarda un cambio sobre esa venta: anular espera en el candado ANTES de revisar",
    /^55P03\|PL\/pgSQL function (retail\.)?anular_comprobante\(uuid,text,boolean,jsonb\) line \d+ at PERFORM/.test(l20), l20);

  const l21 = await carrera(`begin;\nselect 1 from retail.comprobantes where id = '${orig}' for update;\n${QUIETA}`,
    `\\set VERBOSITY verbose\n${PREPARA}set local lock_timeout = '1500ms';\n${CAMBIO}\nrollback;\n`);
  esperar("21 · un cambio mientras alguien libera o anula su boleta: el cambio espera en el candado ANTES de decidir «la nota espera»",
    /^55P03\|PL\/pgSQL function (retail\.)?fn_documentos_del_cambio\(uuid,jsonb,numeric,jsonb\) line \d+ at PERFORM/.test(l21), l21);
}

// 22 · el orden normal de la carrera 21: liberada la boleta, el cambio ya no deja una nota por emitir sobre ella (sale solo el comprobante nuevo).
{
  const r = correr(`select pg_temp.intentar(format('select retail.marcar_comprobante_no_emitido(%L, %L)', :'original', 'prueba automatizada'));
${CAMBIAR("v_ves")}\n${DOCS}\n${CUADRA}`);
  const l = r.ok ? r.lineas : [];
  esperar("22 · con la boleta ya liberada, el cambio emite solo el comprobante nuevo: sin nota ni nota por emitir sobre una boleta que no llegó a SUNAT",
    r.ok && l[0] === "ok" && l[1] === "ok" && l[2].startsWith("nuevo=boleta|") && l[2].endsWith("nota=no pend=0") && l[3] === "t", r.ok ? l : r.mensaje);
}

// 18 · pegar dos veces
{
  let ok = true;
  let detalle = "";
  try {
    const salida = psql(`begin;\n${PARTE1}\n${PARTE2}\n${PARTE1}\n${PARTE2}\n${PRELUDIO}\n${VENTA("boleta")}\n${ACEPTAR}\n${CAMBIAR("v_ves")}\n${CUADRA}\nrollback;\n`);
    const l = salida.trim().split("\n").filter((x) => x !== "");
    ok = l.at(-2) === "ok" && l.at(-1) === "t";
    detalle = l.slice(-4);
  } catch (e) {
    ok = false;
    detalle = `${e.stderr ?? ""}`;
  }
  esperar("18 · las dos partes de la migración se pueden pegar dos veces, y el cambio sigue cuadrando", ok, detalle);
}

console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} caso(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Prueba de ADR-0195 F3b — la cuenta sellada en cada movimiento de plata (`20260925150000_finanzas_cuenta_sellada.sql`).
 *
 * QUÉ CUBRE (situaciones de docs/PLAN-FINANZAS.md §7 bis)
 *   · 1, 2, 5 Vender: cada cobro sella su cuenta sola (efectivo → cajón; Yape, tarjeta → la de «A qué cuenta entra cada
 *     cobro»); el anticipo no tiene cuenta; sin cuenta configurada queda en nulo y la venta NO falla;
 *   · 3 apartados, 4 cambios: igual, solos;
 *   · 9 devolución a una clienta y 10 devolución del adelanto: «Sale de» (la elegida) o la de la tienda;
 *   · 6 reembolso de un proveedor: «Entra a»; al cajón, con su ingreso de caja;
 *   · 11 pagos de Compras y Por pagar, 12 pagos de Producción: «Sale de»; del cajón crea su egreso y resta del cierre;
 *   · 13 gastos y activos: «Salió de» (cajón con su egreso, caja fuerte sin egreso, tarjeta de crédito);
 *   · 19 cierre de caja: «¿A qué banco?»;
 *   · un egreso respalda UNA sola cosa, ahora también un pago a un proveedor;
 *   · los saldos usan lo sellado (cambiar la configuración no mueve lo pasado) y lo pasado se completa una vez;
 *   · lo sellado no cambia; permisos.
 *
 * CÓMO. Igual que `cuentas_dinero.mjs`: cada escenario en su transacción con ROLLBACK, sesión simulada con
 * `request.jwt.claim.sub`. La base local la usan otras sesiones: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:cuenta-sellada    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
`;
// El saldo de una cuenta hoy, visto por el líder; y el nombre de una cuenta (para leer las salidas).
const AYUDAS = `
create function pg_temp.saldo(p_id uuid) returns numeric language sql as $f$
  select saldo from retail.fn_cuentas_dinero_saldos() where id = p_id;
$f$;
create function pg_temp.cta(p_id uuid) returns text language sql as $f$
  select coalesce((select nombre from retail.cuentas_dinero where id = p_id), '-');
$f$;
`;

/** Trujillo y Lima con sus cajones y cajas fuertes; cuatro cuentas nuevas (BCP con S/ 1,000, Interbank en cero, el POS
 *  y la Visa); en Trujillo el Yape y las transferencias entran al BCP, el Plin a Interbank y la tarjeta al POS; Lima no
 *  configuró nada. La caja de Trujillo abierta con S/ 1,000, stock de sobra y una variante `:v` a precio `:precio`. */
const ESCENA = `
begin;
${INTENTO}
${AYUDAS}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as cajon_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'cajon' \\gset
select id as cajon_lim from retail.cuentas_dinero where ubicacion_id = :'lim' and tipo = 'cajon' \\gset
select id as fuerte_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'caja_fuerte' \\gset
select id as rendir from retail.cuentas_dinero where tipo = 'por_rendir' \\gset
select retail.crear_cuenta_dinero('BCP prueba F3b', 'banco', 1000, retail.fn_hoy_lima() - 20) as bcp \\gset
select retail.crear_cuenta_dinero('Interbank prueba F3b', 'banco', 0, retail.fn_hoy_lima() - 20) as ibk \\gset
select retail.crear_cuenta_dinero('Niubiz prueba F3b', 'por_abonar', 0, retail.fn_hoy_lima() - 20) as pos \\gset
select retail.crear_cuenta_dinero('Visa prueba F3b', 'tarjeta_credito', 0, retail.fn_hoy_lima() - 20) as visa \\gset
select retail.guardar_medio_de_cobro(:'tru', 'yape', :'bcp') as _m1 \\gset
select retail.guardar_medio_de_cobro(:'tru', 'transferencia', :'bcp') as _m2 \\gset
select retail.guardar_medio_de_cobro(:'tru', 'plin', :'ibk') as _m3 \\gset
select retail.guardar_medio_de_cobro(:'tru', 'tarjeta', :'pos') as _m4 \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'tru', :'lim']::uuid[]) u
   where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'piso_venta');
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT98' when 'factura' then 'FT98' else serie end, siguiente_numero = 1
 where ubicacion_id = :'tru' and tipo in ('boleta', 'factura');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id in (:'tru', :'lim') and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 1000.00, 'prueba automatizada') as caja \\gset
select id as v, precio as precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select :'v', u, retail.fn_sububicacion_por_defecto(u, 'venta'), 'entrada', 50, 'colchón de prueba' from unnest(array[:'tru', :'lim']::uuid[]) u;
select count(*) as _st from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
 where m.variante_id = :'v' and m.motivo = 'colchón de prueba' and m.created_at = now()) x \\gset
select id as prov from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select v.producto_id as prod from retail.variantes v where v.id = :'v' \\gset
`;

/** Una factura de mercadería a crédito de S/ 1,180 (20 u × 50 + IGV) de `:prov`, con destino Trujillo. */
const compra = (nombre) => `
select retail.registrar_compra(:'prov', 'TSB', 'F3B' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9), 'credito', :'tru',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'v', 'cantidad', 20, 'costo_unitario', 50)),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima() - 5, p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as ${nombre} \\gset
`;
const venta = (nombre, ubic, pagos) => `
select retail.registrar_venta(:'${ubic}',
  jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', 100, 'descuento_unitario', 0)),
  jsonb_build_array(${pagos.map(([m, monto]) => `jsonb_build_object('metodo', '${m}', 'monto', ${monto})`).join(", ")}),
  null, gen_random_uuid(), p_descuento_pct => 0) as ${nombre} \\gset
`;
const esperado = `(select esperado from retail.fn_calcular_esperado_caja(:'caja'))`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1200)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. Vender (situaciones 1, 2 y 5): la cuenta se sella sola, el mostrador no elige nada.
{
  const r = correr(`${ESCENA}
update retail.variantes set precio = 100 where id = :'v';
${venta("v1", "tru", [["efectivo", 40], ["yape", 35], ["tarjeta", 25]])}
select string_agg(metodo || ':' || pg_temp.cta(cuenta_dinero_id), ',' order by metodo) from retail.venta_pagos where venta_id = :'v1';
select retail.abrir_caja(:'lim', 100.00, 'prueba automatizada') as caja_lim \\gset
${venta("v2", "lim", [["yape", 100]])}
select count(*), bool_and(cuenta_dinero_id is null) from retail.venta_pagos where venta_id = :'v2';
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'v1', 'anticipo', 5) returning pg_temp.cta(cuenta_dinero_id);
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values (:'v1', 'yape', 1, :'fuerte_tru') returning pg_temp.cta(cuenta_dinero_id);
select pg_temp.intento(format('update retail.venta_pagos set cuenta_dinero_id = %L where venta_id = %L and metodo = ''yape''', :'ibk', :'v1'));`);
  const [tru, lim, anticipo, malElegida, cambiar] = lineas(r);
  esperar("una venta en TRU sella efectivo → cajón, Yape → BCP y tarjeta → POS, sin que nadie elija", r.ok && tru === "efectivo:Cajón · Tienda Trujillo,tarjeta:Niubiz prueba F3b,yape:BCP prueba F3b", r);
  esperar("en una tienda sin el medio configurado el cobro queda «sin cuenta» y la venta NO falla", r.ok && lim === "1|t", r);
  esperar("el anticipo (lo que ya entró al abonar) no tiene cuenta", r.ok && anticipo === "-", r);
  esperar("el sello nunca tumba un cobro: una cuenta que no sirve queda en «sin cuenta»", r.ok && malElegida === "-", r);
  esperar("la cuenta de un cobro no se cambia después", r.ok && cambiar.includes("se sella al cobrar"), r);
}

// 2. Lo pasado no se mueve: cambiar a qué banco cae el Yape no mueve lo ya cobrado; los saldos usan lo sellado.
//    (Se miden diferencias: la base local tiene historia de Trujillo que el BCP de prueba hereda al configurarse.)
{
  const r = correr(`${ESCENA}
update retail.variantes set precio = 100 where id = :'v';
select pg_temp.saldo(:'bcp') as b0, pg_temp.saldo(:'ibk') as i0 \\gset
${venta("v1", "tru", [["yape", 100]])}
select pg_temp.saldo(:'bcp') - :b0, pg_temp.saldo(:'ibk') - :i0;
select retail.guardar_medio_de_cobro(:'tru', 'yape', :'ibk') as _cambio \\gset
select pg_temp.saldo(:'bcp') - :b0, pg_temp.saldo(:'ibk') - :i0;
${venta("v2", "tru", [["yape", 100]])}
select pg_temp.saldo(:'bcp') - :b0, pg_temp.saldo(:'ibk') - :i0;
select pg_temp.cta(cuenta_dinero_id) from retail.venta_pagos where venta_id = :'v2';`);
  const [trasVenta, trasCambio, trasOtra, segunda] = lineas(r);
  esperar("el Yape cobrado suma en el BCP", r.ok && trasVenta === "100.00|0.00", r);
  esperar("cambiar HOY el Yape a Interbank no mueve lo cobrado: sigue en el BCP (la cuenta está sellada)", r.ok && trasCambio === "100.00|0.00", r);
  esperar("lo cobrado después del cambio entra a Interbank", r.ok && trasOtra === "100.00|100.00" && segunda === "Interbank prueba F3b", r);
}

// 3. Apartados (3) y cambios (4): solos, como la venta.
{
  const r = correr(`${ESCENA}
select retail.separar_prendas(
    p_ubicacion_id => :'tru', p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', :'precio'::numeric)),
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'plin', 'monto', 30), jsonb_build_object('metodo', 'efectivo', 'monto', 20, 'recibido', 20)),
    p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '987 111 222',
    p_devolucion_medio => 'yape') as sep \\gset
select string_agg(metodo || ':' || pg_temp.cta(cuenta_dinero_id), ',' order by metodo) from retail.separacion_pagos where separacion_id = :'sep';
update retail.variantes set precio = 100 where id = :'v';
${venta("v1", "tru", [["efectivo", 100]])}
select id as item from retail.venta_items where venta_id = :'v1' \\gset
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, usuario_id, caja_id)
  values (:'item', :'tru', :'v', 1, 20, 'plin', null, :'caja') returning pg_temp.cta(cuenta_dinero_id);
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, usuario_id, caja_id)
  values (:'item', :'tru', :'v', 1, 0, null, null, :'caja') returning pg_temp.cta(cuenta_dinero_id);`);
  const [apartado, cambioPlin, cambioSinDif] = lineas(r);
  esperar("el adelanto de un apartado sella Plin → Interbank y efectivo → cajón", r.ok && apartado === "efectivo:Cajón · Tienda Trujillo,plin:Interbank prueba F3b", r);
  esperar("la diferencia de un cambio con Plin entra a Interbank, sola", r.ok && cambioPlin === "Interbank prueba F3b", r);
  esperar("un cambio sin diferencia no tiene cuenta", r.ok && cambioSinDif === "-", r);
}

// 4. Devolución a una clienta (9): efectivo del cajón; otro medio, «Sale de» (la elegida) o la de la tienda.
{
  const r = correr(`${ESCENA}
update retail.variantes set precio = 100 where id = :'v';
${venta("v1", "tru", [["tarjeta", 100]])}
select id as item from retail.venta_items where venta_id = :'v1' \\gset
${cambiaA(MICAELA)}
select retail.crear_devolucion(:'v1', :'tru', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'cantidad', 1, 'condicion', 'vendible')), 'prueba', 'otro') as d1 \\gset
${cambiaA(FELIPE)}
select pg_temp.intento(format('select retail.aprobar_devolucion(%L, 30, ''yape'', %L)', :'d1', :'fuerte_tru'));
select pg_temp.saldo(:'ibk');
select count(*) from retail.aprobar_devolucion(:'d1', 30, 'yape', :'ibk');
select pg_temp.cta(reembolso_cuenta_id) from retail.devoluciones where id = :'d1';
select pg_temp.saldo(:'ibk');
select pg_temp.intento(format('update retail.devoluciones set reembolso_cuenta_id = %L where id = %L', :'bcp', :'d1'));
${venta("v2", "tru", [["efectivo", 100]])}
select id as item2 from retail.venta_items where venta_id = :'v2' \\gset
${cambiaA(MICAELA)}
select retail.crear_devolucion(:'v2', :'tru', jsonb_build_array(jsonb_build_object('venta_item_id', :'item2', 'cantidad', 1, 'condicion', 'vendible')), 'prueba', 'otro') as d2 \\gset
${cambiaA(FELIPE)}
select ${esperado} as e0 \\gset
select count(*) from retail.aprobar_devolucion(:'d2', 40, 'efectivo', :'ibk');
select pg_temp.cta(reembolso_cuenta_id), :e0 - ${esperado} from retail.devoluciones where id = :'d2';
${venta("v3", "tru", [["tarjeta", 100]])}
select id as item3 from retail.venta_items where venta_id = :'v3' \\gset
${cambiaA(MICAELA)}
select retail.crear_devolucion(:'v3', :'tru', jsonb_build_array(jsonb_build_object('venta_item_id', :'item3', 'cantidad', 1, 'condicion', 'vendible')), 'prueba', 'otro') as d3 \\gset
${cambiaA(FELIPE)}
select count(*) from retail.aprobar_devolucion(:'d3', 25, 'transferencia');
select pg_temp.cta(reembolso_cuenta_id) from retail.devoluciones where id = :'d3';`);
  const [noSirve, ibkAntes, _n1, sellada, ibkDespues, cambiar, _n2, efectivo, _n3, propuesta] = lineas(r);
  esperar("«Sale de» no acepta una caja fuerte para un Yape", r.ok && noSirve.includes("banco o billetera"), r);
  esperar("el reembolso por Yape sale de la cuenta elegida (Interbank) y baja su saldo", r.ok && sellada === "Interbank prueba F3b" && Number(ibkAntes) - Number(ibkDespues) === 30, r);
  esperar("la cuenta de un reembolso no se cambia después de aprobarlo", r.ok && cambiar.includes("se sella al aprobarlo"), r);
  esperar("en efectivo sale del cajón (lo que se eligió no cuenta) y resta del cierre como siempre", r.ok && efectivo === "Cajón · Tienda Trujillo|40.00", r);
  esperar("sin elegir, se sella la cuenta de la tienda para ese medio (transferencia → BCP)", r.ok && propuesta === "BCP prueba F3b", r);
  void _n1; void _n2; void _n3;
}

// 5. Devolución del adelanto de un apartado (10): «Sale de».
{
  const r = correr(`${ESCENA}
select retail.separar_prendas(
    p_ubicacion_id => :'tru', p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', :'precio'::numeric)),
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 50)),
    p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '987 111 222',
    p_devolucion_medio => 'yape') as sep \\gset
select retail.liberar_separacion(:'sep', 'clienta_desistio') as _l \\gset
select pg_temp.saldo(:'bcp') as b0, pg_temp.saldo(:'ibk') as i0 \\gset
select (retail.registrar_devolucion_separacion(:'sep', 'transferencia', 'OP-99', '12345678901234567890', :'ibk')) is not null;
select pg_temp.cta(devolucion_cuenta_id) from retail.separaciones where id = :'sep';
select :b0 - pg_temp.saldo(:'bcp'), :i0 - pg_temp.saldo(:'ibk');`);
  const [_ok, cuenta, saldos] = lineas(r);
  esperar("el adelanto devuelto por transferencia sale de la cuenta elegida", r.ok && cuenta === "Interbank prueba F3b", r);
  esperar("y el libro lo resta de esa cuenta, no de la del Yape que lo cobró", r.ok && saldos === "0.00|50.00", r);
  void _ok;
}

// 6. Pagos a proveedores (11): «Sale de». Del cajón crea su egreso y resta del cierre; de la caja fuerte, no.
{
  const r = correr(`${ESCENA}
${compra("c1")}
select ${esperado} as e0 \\gset
select pg_temp.saldo(:'bcp') as b0, pg_temp.saldo(:'fuerte_tru') as f0 \\gset
select cardinality(retail.registrar_pagos_compra(:'c1', jsonb_build_array(
  jsonb_build_object('monto', 100, 'metodo', 'efectivo', 'cuenta_id', :'cajon_tru'),
  jsonb_build_object('monto', 200, 'metodo', 'transferencia', 'cuenta_id', :'bcp', 'referencia', 'OP-1'))));
select string_agg(metodo || ':' || pg_temp.cta(cuenta_dinero_id) || ':' || (caja_movimiento_id is not null), ',' order by metodo) from retail.compra_pagos where compra_id = :'c1';
select m.motivo, m.monto, left(m.nota, 28) from retail.compra_pagos cp join retail.caja_movimientos m on m.id = cp.caja_movimiento_id where cp.compra_id = :'c1';
select :e0 - ${esperado}, :b0 - pg_temp.saldo(:'bcp');
select retail.registrar_pago_compras_medios(:'prov', jsonb_build_array(jsonb_build_object('compra_id', :'c1', 'monto', 80)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 80, 'cuenta_id', :'fuerte_tru'))) is not null;
select :f0 - pg_temp.saldo(:'fuerte_tru'), :e0 - ${esperado};
select pg_temp.intento(format('select retail.registrar_pagos_compra(%L, jsonb_build_array(jsonb_build_object(''monto'', 10, ''metodo'', ''transferencia'', ''cuenta_id'', %L)))', :'c1', :'cajon_tru'));
select pg_temp.intento(format('select retail.registrar_pagos_compra(%L, jsonb_build_array(jsonb_build_object(''monto'', 10, ''metodo'', ''efectivo'', ''cuenta_id'', %L)), retail.fn_hoy_lima() - 1)', :'c1', :'cajon_tru'));
select pg_temp.intento(format('select retail.registrar_pagos_compra(%L, jsonb_build_array(jsonb_build_object(''monto'', 10, ''metodo'', ''efectivo'', ''cuenta_id'', %L)))', :'c1', :'cajon_lim'));
select pg_temp.intento(format('update retail.compra_pagos set cuenta_dinero_id = %L where compra_id = %L and metodo = ''transferencia''', :'ibk', :'c1'));`);
  const [_n, filas, egreso, cierreYBanco, _p2, fuerte, otroMedio, ayer, cajaCerrada, cambiar] = lineas(r);
  esperar("cada medio del pago sella su cuenta; el efectivo del cajón trae su egreso", r.ok && filas === "efectivo:Cajón · Tienda Trujillo:true,transferencia:BCP prueba F3b:false", r);
  esperar("el egreso es «Pago a proveedor», del mismo monto y dice a quién", r.ok && egreso === "Pago a proveedor|100.00|Pago a Textiles Andina SAC ·", r);
  esperar("el pago del cajón resta del esperado del cierre; el del BCP baja el BCP", r.ok && cierreYBanco === "100.00|200.00", r);
  esperar("de la caja fuerte (Por pagar, varios medios): baja la caja fuerte y NO toca el cierre", r.ok && fuerte === "80.00|100.00", r);
  esperar("una transferencia no sale de un cajón", r.ok && otroMedio.includes("banco o billetera"), r);
  esperar("lo que sale del cajón es de hoy", r.ok && ayer.includes("es de hoy"), r);
  esperar("con la caja cerrada no sale del cajón (dice que se abra o se elija otra)", r.ok && cajaCerrada.includes("no está abierta"), r);
  esperar("la cuenta de un pago no se cambia después", r.ok && cambiar.includes("se sella al pagar"), r);
  void _n; void _p2;
}

// 7. Pago al contado al registrar la factura, pago sin decir la cuenta (la web de hoy) y lo pasado.
{
  const r = correr(`${ESCENA}
select retail.registrar_compra(:'prov', 'TSB', 'F3B' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9), 'contado', :'tru',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'v', 'cantidad', 2, 'costo_unitario', 50)),
  p_fecha_emision => retail.fn_hoy_lima(),
  p_pago => jsonb_build_array(jsonb_build_object('monto', 118.00, 'metodo', 'efectivo', 'cuenta_id', :'rendir'))) as c0 \\gset
select pg_temp.cta(cuenta_dinero_id) from retail.compra_pagos where compra_id = :'c0';
${compra("c1")}
select coalesce((select n from retail.fn_dinero_sin_cuenta() where origen = 'pago'), 0) as n0,
       coalesce((select monto from retail.fn_dinero_sin_cuenta() where origen = 'pago'), 0) as s0 \\gset
select retail.registrar_pago_compras(:'prov', 'efectivo', jsonb_build_array(jsonb_build_object('compra_id', :'c1', 'monto', 90))) is not null;
select retail.registrar_pago_compras(:'prov', 'transferencia', jsonb_build_array(jsonb_build_object('compra_id', :'c1', 'monto', 60)), p_ubicacion_id => :'tru') is not null;
select string_agg(metodo || ':' || pg_temp.cta(cuenta_dinero_id) || ':' || (caja_movimiento_id is not null), ',' order by metodo) from retail.compra_pagos where compra_id = :'c1';
select origen, n - :n0, monto - :s0 from retail.fn_dinero_sin_cuenta() where origen = 'pago';
select 'pago:' || id as clave from retail.compra_pagos where compra_id = :'c1' and metodo = 'efectivo' \\gset
select count(*) from retail.fn_pagos_sin_cuenta() where clave = :'clave';
select pg_temp.saldo(:'fuerte_tru') as f0 \\gset
select pg_temp.intento(format('select retail.asignar_cuenta_pasada(%L, %L)', :'clave', :'bcp'));
select retail.asignar_cuenta_pasada(:'clave', :'fuerte_tru') is not null;
select :f0 - pg_temp.saldo(:'fuerte_tru'), (select count(*) from retail.fn_pagos_sin_cuenta() where clave = :'clave'),
       (select count(*) from retail.caja_movimientos where caja_id = :'caja' and motivo = 'Pago a proveedor');
select pg_temp.intento(format('select retail.asignar_cuenta_pasada(%L, %L)', :'clave', :'rendir'));
${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.asignar_cuenta_pasada(%L, %L)', :'clave', :'rendir'));`);
  const [contado, _a, _b, sinCuenta, avisoSin, enLista, noSirve, _asig, asignada, dosVeces, noLider] = lineas(r);
  esperar("al contado, al registrar la factura, sale de lo que tiene el líder", r.ok && contado === "Efectivo entregado al líder", r);
  esperar("la web de hoy (sin cuenta): el efectivo queda «sin cuenta» y NO crea egreso; la transferencia se sella con la de la tienda", r.ok && sinCuenta === "efectivo:-:false,transferencia:BCP prueba F3b:false", r);
  esperar("el aviso «sin cuenta» lo cuenta", r.ok && avisoSin === "pago|1|-90.00", r);
  esperar("y la lista para decirlo lo muestra", r.ok && enLista === "1", r);
  esperar("decirlo después valida la cuenta con el medio (efectivo no es un banco)", r.ok && noSirve.includes("no guarda efectivo"), r);
  esperar("dicho una vez: baja la caja fuerte, sale de la lista y NO crea egresos ni toca la caja", r.ok && asignada === "90.00|0|0", r);
  esperar("no se dice dos veces", r.ok && dosVeces.includes("ya dice de qué cuenta"), r);
  esperar("decir lo pasado es solo del líder", r.ok && noLider.includes("solo del líder"), r);
  void _a; void _b; void _asig;
}

// 8. Un egreso respalda UNA sola cosa: el del pago a un proveedor no es gasto, ni «no es gasto», ni depósito.
{
  const r = correr(`${ESCENA}
${compra("c1")}
select (retail.registrar_pagos_compra(:'c1', jsonb_build_array(jsonb_build_object('monto', 100, 'metodo', 'efectivo', 'cuenta_id', :'cajon_tru'))))[1] as pago \\gset
select caja_movimiento_id as egreso from retail.compra_pagos where id = :'pago' \\gset
select retail.fn_egreso_ya_usado(:'egreso');
select count(*) from retail.fn_egresos_sin_clasificar(:'tru') where id = :'egreso';
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''transporte'', ''taxi'', retail.fn_hoy_lima(), 100, null, ''efectivo'', null, %L)', :'tru', :'egreso'));
select pg_temp.intento(format('select retail.marcar_egreso_no_gasto(%L, ''deposito'')', :'egreso'));
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''deposito'', 100, %L, %L, null, null, 0, null, %L)', :'cajon_tru', :'bcp', :'egreso'));
select retail.registrar_movimiento_caja(:'caja', 'egreso', 70, 'Otro', 'taxi', false, null::uuid) as egreso2 \\gset
select retail.registrar_gasto(:'tru', 'transporte', 'taxi', retail.fn_hoy_lima(), 70, null, 'efectivo', null, :'egreso2') is not null;
${compra("c2")}
select pg_temp.intento(format('insert into retail.compra_pagos (compra_id, fecha, monto, metodo, cuenta_dinero_id, caja_movimiento_id) values (%L, retail.fn_hoy_lima(), 70, ''efectivo'', %L, %L)', :'c2', :'cajon_tru', :'egreso2'));
select pg_temp.intento(format('insert into retail.compra_pagos (compra_id, fecha, monto, metodo, cuenta_dinero_id, caja_movimiento_id) values (%L, retail.fn_hoy_lima(), 100, ''efectivo'', %L, %L)', :'c2', :'cajon_tru', :'egreso'));`);
  const [usado, sinClasificar, gasto, noGasto, deposito, _g, pagoDeGasto, pagoDoble] = lineas(r);
  esperar("el egreso del pago cuenta como usado («pago»)", r.ok && usado === "pago", r);
  esperar("y no aparece en «Egresos de caja por clasificar»", r.ok && sinClasificar === "0", r);
  esperar("no se clasifica como gasto", r.ok && gasto.includes("el pago a un proveedor"), r);
  esperar("no se marca «no es gasto»", r.ok && noGasto.includes("el pago a un proveedor"), r);
  esperar("no se toma como depósito al banco", r.ok && deposito.includes("el pago a un proveedor"), r);
  esperar("el egreso de un gasto no respalda un pago", r.ok && pagoDeGasto.includes("ya se usó"), r);
  esperar("el egreso de un pago no respalda otro pago", r.ok && pagoDoble.includes("ya es el pago a un proveedor"), r);
  void _g;
}

// 9. Gastos y activos (13): «Salió de».
{
  const r = correr(`${ESCENA}
select ${esperado} as e0 \\gset
select pg_temp.saldo(:'fuerte_tru') as f0, pg_temp.saldo(:'visa') as t0 \\gset
select retail.registrar_gasto(:'tru', 'transporte', 'taxi de la caja fuerte', retail.fn_hoy_lima(), 30, null, 'efectivo', p_cuenta_id => :'fuerte_tru') as g1 \\gset
select medio_pago, caja_movimiento_id is null, pg_temp.cta(cuenta_dinero_id) from retail.gastos where id = :'g1';
select :f0 - pg_temp.saldo(:'fuerte_tru'), :e0 - ${esperado};
select retail.registrar_gasto(null, 'servicios_basicos', 'hosting', retail.fn_hoy_lima(), 50, null, 'tarjeta') as g2 \\gset
select pg_temp.cta(cuenta_dinero_id), :t0 - pg_temp.saldo(:'visa') from retail.gastos where id = :'g2';
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'luz', retail.fn_hoy_lima(), 118, jsonb_build_object('tipo', 'factura', 'proveedor_id', :'prov',
  'serie', 'L001', 'numero', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), 'condicion', 'contado'), 'efectivo', p_cuenta_id => :'cajon_tru') as g3 \\gset
select g.caja_movimiento_id is not null, cp.caja_movimiento_id = g.caja_movimiento_id, pg_temp.cta(cp.cuenta_dinero_id), retail.fn_egreso_ya_usado(g.caja_movimiento_id)
  from retail.gastos g join retail.compra_pagos cp on cp.compra_id = g.compra_id where g.id = :'g3';
select :e0 - ${esperado};
select retail.registrar_activo(:'tru', 'equipos', 'Impresora', retail.fn_hoy_lima(), 300, null, 'transferencia', p_cuenta_id => :'ibk') as a1 \\gset
select pg_temp.cta(cuenta_dinero_id), pg_temp.saldo(:'ibk') from retail.activos_fijos where id = :'a1';
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''transporte'', ''taxi'', retail.fn_hoy_lima(), 10, null, ''efectivo'', p_cuenta_id => %L)', :'tru', :'bcp'));
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''transporte'', ''taxi'', retail.fn_hoy_lima(), 10, null, ''efectivo'')', :'tru'));`);
  const [fuerte, fuerteSaldo, tarjeta, factura, cierre, activo, bancoEfectivo, sinDecir] = lineas(r);
  esperar("un gasto en efectivo de la caja fuerte: sin egreso de caja, con su cuenta", r.ok && fuerte === "efectivo|t|Caja fuerte · Tienda Trujillo", r);
  esperar("baja la caja fuerte y no toca el cierre", r.ok && fuerteSaldo === "30.00|0.00", r);
  esperar("con tarjeta sube la deuda de la tarjeta de crédito", r.ok && tarjeta === "Visa prueba F3b|50.00", r);
  esperar("con factura del cajón: el gasto y el pago comparten SU egreso y el pago dice «cajón»", r.ok && factura === "t|t|Cajón · Tienda Trujillo|gasto", r);
  esperar("y ese egreso resta del cierre", r.ok && cierre === "118.00", r);
  esperar("un activo por transferencia sale de la cuenta elegida", r.ok && activo === "Interbank prueba F3b|-300.00", r);
  esperar("en efectivo no se elige un banco", r.ok && bancoEfectivo.includes("no guarda efectivo"), r);
  esperar("en efectivo hay que decir de dónde salió", r.ok && sinDecir.includes("uno de los dos"), r);
}

// 10. Reembolso de un proveedor (6): «Entra a». Al cajón, con su ingreso de caja.
{
  const r = correr(`${ESCENA}
select retail.registrar_compra(:'prov', 'TSB', 'F3B' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9), 'contado', :'taller',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'v', 'cantidad', 24, 'costo_unitario', 50)),
  p_fecha_emision => retail.fn_hoy_lima(),
  p_pago => jsonb_build_array(jsonb_build_object('monto', 1416.00, 'metodo', 'transferencia', 'cuenta_id', :'bcp'))) as c0 \\gset
select (array_agg(id order by cantidad desc))[1] as c0_item from retail.compra_items where compra_id = :'c0' \\gset
select retail.recibir_compras(:'taller', jsonb_build_array(jsonb_build_object('compra_item_id', :'c0_item', 'variante_id', :'v', 'cantidad', 20))) as _lote \\gset
select retail.cerrar_linea_compra(:'c0_item', 4, 'no_llego') as _k0 \\gset
select retail.registrar_nota_credito_compra(:'c0', 'FC01-80', retail.fn_hoy_lima(), 236.00, 'faltante') as _n0 \\gset
select ${esperado} as e0 \\gset
select retail.registrar_reembolso_proveedor(:'prov', 100, 'efectivo', null, null, null, :'cajon_tru') as r1 \\gset
select pg_temp.cta(cuenta_dinero_id), (select m.tipo || ':' || m.motivo || ':' || m.monto from retail.caja_movimientos m where m.id = caja_movimiento_id)
  from retail.proveedor_creditos where id = :'r1';
select ${esperado} - :e0;
select pg_temp.saldo(:'ibk') as i0 \\gset
select retail.registrar_reembolso_proveedor(:'prov', 36, 'transferencia', 'OP-7', null, null, :'ibk') as r2 \\gset
select pg_temp.cta(cuenta_dinero_id), pg_temp.saldo(:'ibk') - :i0 from retail.proveedor_creditos where id = :'r2';
select pg_temp.intento(format('select retail.registrar_reembolso_proveedor(%L, 10, ''yape'', null, null, null, %L)', :'prov', :'fuerte_tru'));`);
  const [cajon, cierre, banco, noSirve] = lineas(r);
  esperar("el reembolso en efectivo entra al cajón con su ingreso de caja", r.ok && cajon === "Cajón · Tienda Trujillo|ingreso:Reembolso de proveedor:100.00", r);
  esperar("y suma al esperado del cierre", r.ok && cierre === "100.00", r);
  esperar("por transferencia entra al banco elegido", r.ok && banco === "Interbank prueba F3b|36.00", r);
  esperar("un Yape no entra a una caja fuerte", r.ok && noSirve.includes("banco o billetera"), r);
}

// 11. Pagos del Taller (12): «Sale de».
{
  const r = correr(`${ESCENA}
select retail.guardar_proveedor_produccion(null, 'Textiles Prueba F3b SAC', 'tela') as pprov \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('T-F3B-LINO', 'Lino F3b', 'tela', 'metro') returning id as ins \\gset
select retail.registrar_comprobante_produccion(:'pprov', 'F001', '900', 'credito',
  jsonb_build_array(jsonb_build_object('insumo_id', :'ins', 'cantidad', 10, 'costo_unitario', 10)), p_fecha_vencimiento => current_date + 30) as cid \\gset
select ${esperado} as e0 \\gset
select retail.registrar_pago_comprobante_produccion(:'cid', jsonb_build_array(
  jsonb_build_object('metodo', 'efectivo', 'monto', 50, 'cuenta_id', :'cajon_tru'),
  jsonb_build_object('metodo', 'transferencia', 'monto', 30, 'cuenta_id', :'bcp'))) is not null;
select string_agg(metodo || ':' || pg_temp.cta(cuenta_dinero_id) || ':' || (caja_movimiento_id is not null), ',' order by metodo) from retail.comprobantes_produccion_pagos where comprobante_id = :'cid';
select :e0 - ${esperado};
select retail.registrar_comprobante_produccion(:'pprov', 'F001', '901', 'contado',
  jsonb_build_array(jsonb_build_object('insumo_id', :'ins', 'cantidad', 1, 'costo_unitario', 100)),
  p_pago => jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 118, 'cuenta_id', :'fuerte_tru'))) as cid2 \\gset
select pg_temp.cta(cuenta_dinero_id) from retail.comprobantes_produccion_pagos where comprobante_id = :'cid2';
select detalle from retail.fn_dinero_libro(retail.fn_hoy_lima()) where clave like 'pagoprod:%' and cuenta_id = :'bcp';`);
  const [_ok, filas, cierre, contado, libro] = lineas(r);
  void _ok;
  esperar("cada medio del pago del Taller sella su cuenta; el del cajón trae su egreso", r.ok && filas === "efectivo:Cajón · Tienda Trujillo:true,transferencia:BCP prueba F3b:false", r);
  esperar("y el del cajón resta del cierre de esa tienda", r.ok && cierre === "50.00", r);
  esperar("al contado, al registrar el comprobante, también", r.ok && contado === "Caja fuerte · Tienda Trujillo", r);
  esperar("el libro de saldos ya ve los pagos del Taller", r.ok && libro?.startsWith("Pago del Taller a Textiles Prueba F3b SAC"), r);
}

// 12. Cierre de caja (19): «¿A qué banco?».
{
  const r = correr(`${ESCENA}
select pg_temp.saldo(:'ibk') as i0 \\gset
select pg_temp.intento(format('select * from retail.cerrar_caja(%L, 1000, 600, ''banco'', ''OP-5'', %L)', :'caja', :'fuerte_tru'));
select monto_trasladado from retail.cerrar_caja(:'caja', 1000, 600, 'banco', 'OP-5', :'ibk');
select pg_temp.cta(t.cuenta_dinero_id) from retail.caja_traslados t where t.caja_id = :'caja';
select pg_temp.saldo(:'ibk') - :i0;
select retail.abrir_caja(:'tru', 400.00, 'prueba automatizada') as caja2 \\gset
select monto_trasladado from retail.cerrar_caja(:'caja2', 400, 100, 'caja_fuerte');
select pg_temp.cta(t.cuenta_dinero_id) from retail.caja_traslados t where t.caja_id = :'caja2';
select retail.abrir_caja(:'tru', 300.00, 'prueba automatizada') as caja3 \\gset
select monto_trasladado from retail.cerrar_caja(:'caja3', 300, 50, 'banco', null);
select pg_temp.cta(t.cuenta_dinero_id) from retail.caja_traslados t where t.caja_id = :'caja3';`);
  const [noBanco, _t1, banco, saldo, _t2, fuerte, _t3, propuesta] = lineas(r);
  esperar("el depósito del cierre va a un banco, no a una caja fuerte", r.ok && noBanco.includes("banco o billetera"), r);
  esperar("el traslado al banco guarda a cuál fue", r.ok && banco === "Interbank prueba F3b", r);
  esperar("y sube ese banco", r.ok && saldo === "600.00", r);
  esperar("a la caja fuerte, la de su tienda, sola", r.ok && fuerte === "Caja fuerte · Tienda Trujillo", r);
  esperar("al banco sin decir cuál (la web de hoy), el de las transferencias de la tienda", r.ok && propuesta === "BCP prueba F3b", r);
  void _t1; void _t2; void _t3;
}

// 13. Qué cuentas se eligen y quién.
{
  const r = correr(`${ESCENA}
select string_agg(tipo, ',' order by tipo) from (select distinct tipo from retail.fn_cuentas_para_elegir('pago', :'tru')) x;
select pg_temp.cta(id) from retail.fn_cuentas_para_elegir('pago', :'tru') where 'yape' = any (propuesta_para);
select pg_temp.cta(id) from retail.fn_cuentas_para_elegir('pago', :'tru') where 'efectivo' = any (propuesta_para);
select pg_temp.cta(id) from retail.fn_cuentas_para_elegir('pago', :'tru') where 'tarjeta' = any (propuesta_para);
select pg_temp.cta(id) from retail.fn_cuentas_para_elegir('cobro', :'tru') where 'tarjeta' = any (propuesta_para);
select caja_abierta from retail.fn_cuentas_para_elegir('pago', :'tru') where id = :'cajon_tru';
${cambiaA(MICAELA)}
select count(*) filter (where id = :'cajon_tru'), count(*) filter (where id = :'cajon_lim'), count(*) filter (where id = :'rendir'), count(*) filter (where id = :'bcp')
  from retail.fn_cuentas_para_elegir('pago', :'tru');
select pg_temp.intento(format('select retail.fn_cuenta_sellada(''pago'', ''efectivo'', null, null, %L)', :'rendir'));
select pg_temp.intento(format('select retail.fn_cuenta_sellada(''pago'', ''efectivo'', null, null, %L)', :'fuerte_tru'));
select pg_temp.intento('select retail.fn_pagos_sin_cuenta()');`);
  const [tipos, yape, efectivo, tarjetaPago, tarjetaCobro, abierta, micaela, rendir, suya, lista] = lineas(r);
  esperar("el líder elige entre bancos, POS, tarjeta, cajones, cajas fuertes y lo que tiene el líder", r.ok && tipos === "banco,caja_fuerte,cajon,por_abonar,por_rendir,tarjeta_credito", r);
  esperar("para un Yape de TRU propone la cuenta de su Yape", r.ok && yape === "BCP prueba F3b", r);
  esperar("para efectivo con la caja abierta, el cajón", r.ok && efectivo === "Cajón · Tienda Trujillo", r);
  esperar("al pagar con tarjeta, la tarjeta de crédito; al devolver a una clienta, el POS", r.ok && tarjetaPago === "Visa prueba F3b" && tarjetaCobro === "Niubiz prueba F3b", r);
  esperar("dice si la caja de ese cajón está abierta", r.ok && abierta === "t", r);
  esperar("la colaboradora ve su cajón y los bancos; no el cajón de Lima ni lo que tiene el líder", r.ok && micaela === "1|0|0|1", r);
  esperar("lo que tiene el líder solo lo mueve el líder", r.ok && rendir.includes("solo lo mueve el líder"), r);
  esperar("la caja fuerte de su tienda sí", r.ok && suya !== "" && !suya.includes("no es de tu tienda") && !suya.includes("solo"), r);
  esperar("la lista de lo pasado es solo del líder", r.ok && lista.includes("solo del líder"), r);
}

// 14. Permisos: nadie lee lo nuevo directo; las internas no se abren.
{
  const r = correr(`${ESCENA}
select has_function_privilege('anon', 'retail.fn_cuentas_para_elegir(text, uuid)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_cuentas_para_elegir(text, uuid)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_cuenta_sellada(text, text, uuid, date, uuid)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_movimiento_de_cajon(uuid, text, numeric, date, text, text)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_dinero_libro(date)', 'execute'),
       has_table_privilege('authenticated', 'retail.cuentas_asignadas', 'select'),
       has_function_privilege('anon', 'retail.asignar_cuenta_pasada(text, uuid)', 'execute');
select (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = f)
  from unnest(array['cerrar_caja', 'aprobar_devolucion', 'registrar_devolucion_separacion', 'registrar_reembolso_proveedor',
                    'registrar_nota_credito_compra', 'fn_insertar_reembolso_proveedor', 'registrar_gasto', 'registrar_activo',
                    'fn_comprobante_y_pago']) f;
select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) and not bool_or(has_function_privilege('anon', p.oid, 'execute'))
  from pg_proc p where p.pronamespace = 'retail'::regnamespace
   and p.proname in ('cerrar_caja', 'aprobar_devolucion', 'registrar_devolucion_separacion', 'registrar_reembolso_proveedor',
                     'registrar_nota_credito_compra', 'registrar_gasto', 'registrar_activo');
select not has_function_privilege('authenticated', 'retail.fn_comprobante_y_pago(text,uuid,date,numeric,text,jsonb,text,uuid,uuid,text,text,uuid,uuid)', 'execute'),
       not has_function_privilege('authenticated', 'retail.fn_insertar_reembolso_proveedor(uuid,numeric,text,text,date,text,uuid,uuid,uuid)', 'execute');`);
  const [privs, ...resto] = lineas(r);
  const firmas = resto.slice(0, 9);
  const [abiertas, internas] = resto.slice(9);
  esperar("permisos: anon no lee las cuentas; authenticated sí; las internas, el libro y la tabla nueva, nadie", r.ok && privs === "f|t|f|f|f|f|f", r);
  esperar("cada función con firma nueva quedó con UNA sola firma (sin sobrecargas)", r.ok && firmas.length === 9 && firmas.every((n) => n === "1"), r);
  esperar("las RPC con firma nueva conservan su permiso (authenticated sí, anon no)", r.ok && abiertas === "t", r);
  esperar("las internas con firma nueva siguen cerradas", r.ok && internas === "t|t", r);
}

// 15. La migración se puede volver a pegar: la segunda vez no cambia nada.
{
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const migracion = readFileSync(join(raiz, "supabase", "migrations", "20260925150000_finanzas_cuenta_sellada.sql"), "utf8");
  const huella = `select md5(string_agg(pg_get_functiondef(p.oid), '' order by p.oid::regprocedure::text)) from pg_proc p
 where p.pronamespace = 'retail'::regnamespace and p.proname in ('cerrar_caja', 'aprobar_devolucion', 'registrar_devolucion_separacion',
   'registrar_reembolso_proveedor', 'registrar_nota_credito_compra', 'fn_insertar_reembolso_proveedor', 'registrar_gasto', 'registrar_activo',
   'fn_comprobante_y_pago', 'registrar_compra', 'registrar_pagos_compra', 'registrar_pago_compras_medios', 'registrar_comprobante_produccion',
   'registrar_pago_comprobante_produccion', 'fn_egreso_ya_usado', 'fn_gastos_validar', 'fn_activos_validar', 'fn_egresos_no_gasto_validar',
   'fn_movimientos_dinero_validar', 'fn_dinero_libro');`;
  const r = correr(`begin;
set local client_min_messages = warning;
${huella}
${migracion}
${huella}`);
  const [antes, despues] = lineas(r).filter((l) => /^[0-9a-f]{32}$/.test(l));
  esperar("pegarla dos veces deja exactamente las mismas funciones", r.ok && antes && antes === despues, r);
}

console.log(fallos === 0 ? `\nTodo en orden (${casos} casos)` : `\n${fallos} de ${casos} casos fallaron`);
process.exit(fallos === 0 ? 0 : 1);

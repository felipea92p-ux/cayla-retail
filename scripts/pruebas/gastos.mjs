#!/usr/bin/env node
/**
 * Prueba de ADR-0195 F2 — gastos, con o sin factura de proveedor
 * (`20260924235000_finanzas_plan_de_cuentas_y_categorias_gasto.sql` y `20260924235100_finanzas_gastos_y_comprobante_de_proveedor.sql`).
 *
 * QUÉ CUBRE
 *   · los tres caminos sin comprobante: A (Yape), B (efectivo del cajón: crea su egreso) y C (clasificar un egreso ya
 *     registrado); «no es gasto» y su reversión; nada se cuenta dos veces;
 *   · con comprobante (decisión A): la cabecera `compras` con naturaleza gasto, el IGV de la factura, el pago al contado
 *     (incluido en efectivo del cajón), la factura a crédito en Por pagar y su pago por tienda;
 *   · decisión B: con el módulo Gastos, solo su tienda y nunca «de la empresa»; sin el módulo, nada;
 *   · los candados: no se edita ni se borra, se anula (y con pagos no se anula), la factura doble, la naturaleza fija, el
 *     recibo por honorarios solo como gasto, doble clic, y nadie lee las tablas directo;
 *   · Compras sigue igual: la lista, las compras del mes y las métricas del proveedor no cuentan gastos; la deuda sí.
 *
 * CÓMO. Igual que `configuracion_caja_campanas.mjs`: cada escenario en su transacción con ROLLBACK (nunca se commitea nada
 * en el Postgres local compartido), sesión simulada con `request.jwt.claim.sub`, `pg_temp.intento` para leer el error.
 *
 * USO
 *   pnpm pruebas:gastos    → con las migraciones ya aplicadas en el local
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

/** Trujillo y Lima, un proveedor de luz de prueba, la caja de Trujillo abierta de cero (S/ 100) y un egreso «Otro» que la
 *  tienda registró sin decir qué fue. Deja `:tru`, `:lim`, `:prov`, `:caja`, `:egreso` y `:base_sin` (los egresos por
 *  clasificar que ya había: la base local tiene datos de otras sesiones y el CI no, así que se cuenta el nuestro). */
const ESCENA = `
begin;
${INTENTO}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.proveedores (nombre, activo) values ('Luz del Norte (prueba F2)', true) returning id as prov \\gset
select (select count(*) from (select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 100.00, 'prueba automatizada') as caja \\gset
select count(*) as base_sin from retail.fn_egresos_sin_clasificar(:'tru') \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 12.50, 'Otro', 'mototaxi al banco', false, null::uuid) as egreso \\gset
`;
const conModuloGastos = `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'gastos');\n`;
const MES = `'2026-09-01'::date, '2026-09-30'::date`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 800)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. Sin comprobante: A, B y C. El egreso clasificado deja de estar «por clasificar»; nada se cuenta dos veces.
{
  const r = correr(`${ESCENA}
select count(*) from retail.fn_egresos_sin_clasificar(:'tru') where id = :'egreso';
select retail.registrar_gasto(:'tru', 'publicidad', 'Anuncio en Instagram', '2026-09-20', 150, null, 'yape') as a \\gset
select retail.registrar_gasto(:'tru', 'suministros', 'Bolsas', '2026-09-24', 40, null, 'efectivo', :'caja') as b \\gset
select retail.registrar_gasto(:'tru', 'transporte', 'Mototaxi', '2026-09-24', 12.50, null, 'efectivo', null, :'egreso') as c \\gset
select motivo, nota from retail.caja_movimientos where id = (select caja_movimiento_id from retail.gastos where id = :'b');
select count(*) - :base_sin from retail.fn_egresos_sin_clasificar(:'tru');
select (p->>'total')::numeric, (p->>'n')::int, (p->>'igv')::numeric, (p->>'egresos_sin_clasificar')::int - :base_sin from retail.fn_gastos_panel(${MES}, :'tru') p;
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''transporte'', ''Otra vez'', ''2026-09-24'', 12.50, null, ''efectivo'', null, %L)', :'tru', :'egreso'));`);
  const [antes, mov, despues, panel, doble] = lineas(r);
  esperar("antes: el egreso de la tienda está por clasificar", r.ok && Number(antes) === 1, r);
  esperar("B: el efectivo del cajón crea su egreso «Otro» con la nota del gasto", r.ok && mov === "Otro|Gasto · Suministros y útiles — Bolsas", r);
  esperar("C: al clasificarlo, ya no queda nada por clasificar (el de B nació clasificado)", r.ok && Number(despues) === 0, r);
  esperar("el panel suma los tres (150 + 40 + 12.50), sin IGV", r.ok && panel === "202.50|3|0.00|0", r);
  esperar("el mismo egreso no respalda dos gastos", r.ok && doble.includes("ya es un gasto"), r);
}

// 2. «No es gasto»: sale de por clasificar, bloquea el gasto y se revierte.
{
  const r = correr(`${ESCENA}
select retail.marcar_egreso_no_gasto(:'egreso', 'deposito') as m \\gset
select count(*) from retail.fn_egresos_sin_clasificar(:'tru') where id = :'egreso';
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''transporte'', ''Mototaxi'', ''2026-09-24'', 12.50, null, ''efectivo'', null, %L)', :'tru', :'egreso'));
select pg_temp.intento(format('select retail.marcar_egreso_no_gasto(%L, ''otro'')', :'egreso'));
select retail.revertir_egreso_no_gasto(:'m') as _r \\gset
select count(*) from retail.fn_egresos_sin_clasificar(:'tru') where id = :'egreso';`);
  const [tras, gasto, otro, revertido] = lineas(r);
  esperar("marcado como depósito, ya no está por clasificar", r.ok && Number(tras) === 0, r);
  esperar("un egreso marcado «no es gasto» no se vuelve gasto", r.ok && gasto.includes("no es gasto"), r);
  esperar("«otro» exige decir qué fue (o ya estaba marcado)", r.ok && otro !== "SIN_ERROR", r);
  esperar("revertida la marca, vuelve a estar por clasificar", r.ok && Number(revertido) === 1, r);
}

// 3. Factura a crédito: cabecera de gasto con IGV, en Por pagar (no en la lista de Compras), y se paga por tienda.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Luz de septiembre', '2026-09-20', 648, jsonb_build_object('tipo','factura','proveedor_id',:'prov','serie','s120','numero','560233','condicion','credito','fecha_vencimiento','2026-10-12')) as g \\gset
select compra_id as compra from retail.gastos where id = :'g' \\gset
select naturaleza, tipo, serie, igv, subtotal, total, saldo, estado_pago, estado_recepcion, (ubicacion_gestion_id = :'tru') from retail.compras where id = :'compra';
select count(*) from retail.listar_compras(p_limite => 200) where id = :'compra';
select count(*) from retail.listar_compras(p_limite => 200, p_con_saldo => true, p_orden => 'vencimiento', p_naturaleza => 'todas') where id = :'compra';
select total, saldo from retail.fn_deuda_visible() where compra_id = :'compra';
select total from retail.compra_parte_por_tienda where compra_id = :'compra' and ubicacion_id = :'tru';
select retail.registrar_pagos_compra(:'compra', '[{"metodo":"transferencia","monto":600,"referencia":"op 1"}]'::jsonb, '2026-09-24', null, :'tru') as _p \\gset
select saldo, estado_pago from retail.compras where id = :'compra';
select pg_temp.intento(format('select retail.registrar_pagos_compra(%L, ''[{"metodo":"yape","monto":100}]''::jsonb, ''2026-09-24'', null, %L)', :'compra', :'tru'));
select (p->>'por_pagar')::numeric, (p->>'igv')::numeric from retail.fn_gastos_panel(${MES}, :'tru') p;`);
  const [cab, enLista, enPorPagar, deuda, parte, trasPago, sobrepago, panel] = lineas(r);
  esperar("la cabecera es un gasto: factura S120, IGV 98.85, saldo 648, «recibida» (nada que recibir), de Trujillo", r.ok && cab === "gasto|factura|S120|98.85|549.15|648.00|648.00|pendiente|recibida|t", r);
  esperar("no aparece en la lista de Facturas de proveedor (mercadería)", r.ok && Number(enLista) === 0, r);
  esperar("sí aparece en Por pagar", r.ok && Number(enPorPagar) === 1, r);
  esperar("la deuda visible del líder la cuenta entera", r.ok && deuda === "648.00|648.00", r);
  esperar("su parte por tienda es el total, en Trujillo", r.ok && parte === "648.00", r);
  esperar("se paga por tienda desde Por pagar (queda S/ 48)", r.ok && trasPago === "48.00|parcial", r);
  esperar("no se paga más que su parte", r.ok && sobrepago !== "SIN_ERROR", r);
  esperar("el panel de gastos muestra lo que falta pagar y el IGV", r.ok && panel === "48.00|98.85", r);
}

// 4. Factura al contado: transferencia (pagada) y efectivo del cajón (con su egreso). Boleta y recibo por honorarios sin IGV.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'alquileres', 'Alquiler de septiembre', '2026-09-05', 2500, jsonb_build_object('tipo','factura','proveedor_id',:'prov','serie','F001','numero','77','condicion','contado'), 'transferencia', null, null, 'op 998') as a \\gset
select c.saldo, c.estado_pago, p.metodo, p.referencia, (p.ubicacion_id = :'tru') from retail.gastos g join retail.compras c on c.id = g.compra_id join retail.compra_pagos p on p.compra_id = c.id where g.id = :'a';
select retail.registrar_gasto(:'tru', 'suministros', 'Útiles', '2026-09-24', 35.40, jsonb_build_object('tipo','boleta','proveedor_id',:'prov','serie','B001','numero','5','condicion','contado'), 'efectivo', :'caja') as b \\gset
select g.igv, c.igv, m.monto, m.motivo, p.metodo from retail.gastos g join retail.compras c on c.id = g.compra_id join retail.caja_movimientos m on m.id = g.caja_movimiento_id join retail.compra_pagos p on p.compra_id = c.id where g.id = :'b';
select retail.registrar_gasto(null, 'asesoria', 'Contador de septiembre', '2026-09-24', 800, jsonb_build_object('tipo','recibo_por_honorarios','proveedor_id',:'prov','serie','E001','numero','12','condicion','credito','fecha_vencimiento','2026-10-05')) as h \\gset
select c.tipo, c.igv, c.ubicacion_gestion_id is null, g.ubicacion_id is null from retail.gastos g join retail.compras c on c.id = g.compra_id where g.id = :'h';`);
  const [transf, efectivo, honorarios] = lineas(r);
  esperar("contado por transferencia: pagada, con su referencia, a nombre de Trujillo", r.ok && transf === "0.00|pagada|transferencia|op 998|t", r);
  esperar("boleta en efectivo del cajón: sin IGV, con su egreso de caja y su pago en efectivo", r.ok && efectivo === "0.00|0.00|35.40|Otro|efectivo", r);
  esperar("recibo por honorarios «de la empresa»: sin IGV, sin tienda gestora", r.ok && honorarios === "recibo_por_honorarios|0.00|t|t", r);
}

// 5. Candados de datos.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'publicidad', 'Volantes', '2026-09-20', 90, null, 'yape', null, null, null, '11111111-1111-4111-8111-111111111111'::uuid) as g1 \\gset
select retail.registrar_gasto(:'tru', 'publicidad', 'Volantes', '2026-09-20', 90, null, 'yape', null, null, null, '11111111-1111-4111-8111-111111111111'::uuid) as g2 \\gset
select (:'g1' = :'g2'), (select count(*) from retail.gastos where token_cliente = '11111111-1111-4111-8111-111111111111');
select pg_temp.intento(format('update retail.gastos set monto_total = 1 where id = %L', :'g1'));
select pg_temp.intento(format('delete from retail.gastos where id = %L', :'g1'));
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''otros'', ''x'', ''2026-09-20'', 10, null, ''yape'')', :'tru'));
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''publicidad'', ''x'', ''2099-01-01'', 10, null, ''yape'')', :'tru'));
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''publicidad'', ''x'', ''2026-09-20'', 10, null, ''efectivo'')', :'tru'));
select id as merca, proveedor_id as pm, serie as sm, numero as nm from retail.compras where naturaleza = 'mercaderia' limit 1 \\gset
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''servicios_basicos'', ''Luz'', ''2026-09-20'', 10, jsonb_build_object(''tipo'',''factura'',''proveedor_id'',%L,''serie'',%L,''numero'',%L,''condicion'',''contado''), ''yape'')', :'tru', :'pm', :'sm', :'nm'));
select pg_temp.intento(format('update retail.compras set naturaleza = ''gasto'' where id = %L', :'merca'));
select pg_temp.intento(format('update retail.compras set tipo = ''recibo_por_honorarios'', igv = 0, subtotal = total where id = %L', :'merca'));`);
  const [token, editar, borrar, cat, futura, efectivoSinCaja, doble, naturaleza, rxh] = lineas(r);
  esperar("doble clic: el mismo token devuelve el mismo gasto, una sola fila", r.ok && token === "t|1", r);
  esperar("un gasto no se edita (solo se anula)", r.ok && editar.includes("solo cambia para anularse"), r);
  esperar("un gasto no se borra", r.ok && borrar.includes("no se borra"), r);
  esperar("no hay categoría «otros»", r.ok && cat.startsWith("Elige una categoría"), r);
  esperar("la fecha no puede ser futura", r.ok && futura.includes("futura"), r);
  esperar("en efectivo, sale de la caja o clasifica un egreso", r.ok && efectivoSinCaja.includes("caja abierta"), r);
  esperar("una factura de mercadería no entra de nuevo como gasto", r.ok && doble.includes("ya está registrado"), r);
  esperar("un comprobante no cambia de naturaleza", r.ok && naturaleza.includes("naturaleza"), r);
  esperar("el recibo por honorarios nunca es de mercadería", r.ok && rxh.includes("compras_honorarios_solo_gasto"), r);
}

// 6. Anular: sin comprobante libera el egreso (la plata sí salió); con factura sin pagos anula la factura; con pagos, no.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'transporte', 'Mototaxi', '2026-09-24', 12.50, null, 'efectivo', null, :'egreso') as c \\gset
select retail.anular_gasto(:'c', 'se registró en la tienda equivocada') as _a \\gset
select count(*) from retail.fn_egresos_sin_clasificar(:'tru') where id = :'egreso';
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Agua', '2026-09-20', 80, jsonb_build_object('tipo','boleta','proveedor_id',:'prov','serie','B9','numero','1','condicion','credito','fecha_vencimiento','2026-10-01')) as cred \\gset
select retail.anular_gasto(:'cred', 'número mal tipeado') as _b \\gset
select c.estado from retail.gastos g join retail.compras c on c.id = g.compra_id where g.id = :'cred';
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Cable', '2026-09-20', 90, jsonb_build_object('tipo','boleta','proveedor_id',:'prov','serie','B9','numero','3','condicion','credito','fecha_vencimiento','2026-10-01')) as cable \\gset
select compra_id as compra_cable from retail.gastos where id = :'cable' \\gset
select pg_temp.intento(format('select retail.anular_compra(%L, ''desde compras'')', :'compra_cable'));
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Internet', '2026-09-20', 120, jsonb_build_object('tipo','boleta','proveedor_id',:'prov','serie','B9','numero','2','condicion','contado'), 'yape') as pag \\gset
select pg_temp.intento(format('select retail.anular_gasto(%L, ''error'')', :'pag'));
select (p->>'n')::int from retail.fn_gastos_panel(${MES}, :'tru') p;`);
  const [libera, compraAnulada, desdeCompras, conPagos, vigentes] = lineas(r);
  esperar("anular el gasto del cajón devuelve el egreso a «por clasificar»", r.ok && Number(libera) === 1, r);
  esperar("anular un gasto a crédito sin pagos anula su factura", r.ok && compraAnulada === "anulada", r);
  esperar("la factura de un gasto no se anula sola desde Compras", r.ok && desdeCompras.includes("anúlalo desde Finanzas"), r);
  esperar("un gasto con factura ya pagada no se anula", r.ok && conPagos.includes("ya tiene pagos"), r);
  esperar("los anulados no suman en el panel (quedan 2 vigentes: el cable y el internet)", r.ok && Number(vigentes) === 2, r);
}

// 7. Decisión B: con el módulo, solo su tienda; «de la empresa» solo el líder; sin el módulo, nada.
{
  const r = correr(`${ESCENA}${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''publicidad'', ''x'', ''2026-09-20'', 10, null, ''yape'')', :'tru'));
select pg_temp.intento('select retail.fn_gastos_panel(''2026-09-01'', ''2026-09-30'')');
${conModuloGastos}
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''publicidad'', ''Afiches'', ''2026-09-20'', 10, null, ''yape'')', :'tru'));
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''publicidad'', ''x'', ''2026-09-20'', 10, null, ''yape'')', :'lim'));
select pg_temp.intento('select retail.registrar_gasto(null, ''asesoria'', ''x'', ''2026-09-20'', 10, null, ''yape'')');
select array_length(retail.fn_gastos_ubicaciones(), 1), (retail.fn_gastos_ubicaciones())[1] = :'tru';
select retail.registrar_proveedor_de_gasto('Contadora Ríos (prueba F2)', '10999888771') = retail.registrar_proveedor_de_gasto('  contadora ríos (prueba f2) ', null);
select count(*) from retail.fn_gastos_lista(${MES}) where ubicacion_id is distinct from :'tru';`);
  const [sinModulo, sinModuloLee, suTienda, otraTienda, empresa, ubics, proveedorUnico, ajenos] = lineas(r);
  esperar("sin el módulo Gastos no registra", r.ok && sinModulo.includes("módulo Gastos"), r);
  esperar("sin el módulo Gastos no ve el panel", r.ok && sinModuloLee.includes("módulo Gastos"), r);
  esperar("con el módulo, registra en su tienda", r.ok && suTienda === "SIN_ERROR", r);
  esperar("con el módulo, no en otra tienda", r.ok && otraTienda.includes("solo de tu tienda"), r);
  esperar("«de la empresa», solo el líder", r.ok && empresa.includes("Solo el líder"), r);
  esperar("ve una sola ubicación: la suya", r.ok && ubics === "1|t", r);
  esperar("suma el proveedor de su gasto; el mismo nombre (sin importar mayúsculas) no crea otra ficha", r.ok && proveedorUnico === "t", r);
  esperar("la lista no le muestra gastos de otras tiendas ni de la empresa", r.ok && Number(ajenos) === 0, r);
}

// 7b. La tienda con Gastos y Por pagar: registra su luz a crédito, la ve en SU deuda y la paga; gasta en efectivo de SU cajón.
{
  const r = correr(`${ESCENA}${cambiaA(MICAELA)}
${conModuloGastos}insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'por_pagar');
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Luz de la tienda', '2026-09-20', 300, jsonb_build_object('tipo','boleta','proveedor_id',:'prov','serie','B7','numero','3','condicion','credito','fecha_vencimiento','2026-10-10')) as g \\gset
select compra_id as compra from retail.gastos where id = :'g' \\gset
select total, saldo, gestionada from retail.fn_deuda_visible() where compra_id = :'compra';
select retail.registrar_pagos_compra(:'compra', '[{"metodo":"yape","monto":300}]'::jsonb, '2026-09-24', null, :'tru') as _p \\gset
select estado_pago from retail.compras where id = :'compra';
select retail.registrar_gasto(:'tru', 'transporte', 'Envío de encomienda', '2026-09-24', 18, null, 'efectivo', :'caja') as e \\gset
select m.monto, m.motivo from retail.gastos g join retail.caja_movimientos m on m.id = g.caja_movimiento_id where g.id = :'e';`);
  const [deuda, pagada, cajon] = lineas(r);
  esperar("su luz a crédito está en SU deuda, entera y gestionada por ella", r.ok && deuda === "300.00|300.00|t", r);
  esperar("la paga desde Por pagar a nombre de su tienda", r.ok && pagada === "pagada", r);
  esperar("gasta en efectivo de su cajón: el egreso sale de su caja", r.ok && cajon === "18.00|Otro", r);
}

// 8. Compras sigue igual: lista, compras del mes y métricas del proveedor no cuentan gastos; nadie lee las tablas directo.
{
  const r = correr(`${ESCENA}
select compras_mes, igv_mes from retail.resumen_compras_extra() \\gset antes_
select count(*) as n_antes from retail.listar_compras(p_limite => 200) \\gset
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Luz', retail.fn_hoy_lima(), 648, jsonb_build_object('tipo','factura','proveedor_id',:'prov','serie','S1','numero','9','condicion','credito','fecha_vencimiento', retail.fn_hoy_lima() + 10)) as g \\gset
select (compras_mes = :'antes_compras_mes'::numeric and igv_mes = :'antes_igv_mes'::numeric) from retail.resumen_compras_extra();
select (select count(*) from retail.listar_compras(p_limite => 200)) = :'n_antes'::int;
select facturas, saldo from retail.fn_proveedores() where id = :'prov';
select facturas_vigentes from retail.fn_proveedor_metricas_compras(:'prov');
select count(*) from retail.fn_facturas_para_nota_credito(null, :'prov', 'todas', 50);
set local role authenticated;
select pg_temp.intento('select count(*) from retail.gastos');
select pg_temp.intento('select count(*) from retail.categorias_gasto');
select count(*) from retail.fn_categorias_gasto();`);
  const [mes, lista, prov, metricas, nc, gastosDirecto, catDirecto, categorias] = lineas(r);
  esperar("las compras y el IGV del mes de Compras no cambian con un gasto", r.ok && mes === "t", r);
  esperar("la lista de Facturas de proveedor no cambia", r.ok && lista === "t", r);
  esperar("el proveedor de luz: 0 facturas de mercadería, pero se le deben S/ 648", r.ok && prov === "0|648.00", r);
  esperar("las métricas del proveedor no cuentan el gasto", r.ok && Number(metricas) === 0, r);
  esperar("no se le cuelga una nota de crédito de mercadería a un gasto", r.ok && Number(nc) === 0, r);
  esperar("nadie lee `gastos` directo (ni el líder)", r.ok && gastosDirecto.includes("permission denied"), r);
  esperar("nadie lee `categorias_gasto` directo", r.ok && catDirecto.includes("permission denied"), r);
  esperar("las 10 categorías se leen por su función", r.ok && Number(categorias) === 10, r);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);

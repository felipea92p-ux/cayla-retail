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
 *   · Luz, Agua, Internet y Telefonía (ADR-0477, `20261022205000_categorias_gasto_luz_agua_internet_telefonia.sql`): existen en la
 *     cuenta 636 y en su orden, un fijo las acepta con su ficha, un código inventado se rechaza, y un gasto en cualquiera de ellas
 *     suma en la MISMA línea del Estado de resultados y del Presupuesto que «Servicios básicos» (el contador no ve cambio).
 *
 * CÓMO. Igual que `configuracion_caja_campanas.mjs`: cada escenario en su transacción con ROLLBACK (nunca se commitea nada
 * en el Postgres local compartido), sesión simulada con `request.jwt.claim.sub`, `pg_temp.intento` para leer el error.
 *
 * LAS FECHAS. Septiembre de 2026 (`MES` y los gastos del 5 al 24) es un rango explícito que ya pasó, no «este mes»:
 * `registrar_gasto` solo rechaza una fecha futura, y el panel, la lista y Por pagar se piden con ese rango. Por eso esas
 * fechas se quedan fijas y no vencen. Lo único que mira el mes en curso (las compras del mes de Compras, caso 8) va con
 * `retail.fn_hoy_lima()`. Revisado el 2026-10-01 con «hoy» simulado en cinco fechas (ver la bitácora de ese día).
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
  esperar("el mismo egreso no respalda dos gastos", r.ok && doble.includes("ya se usó"), r);
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
  // Micaela maneja la caja de Trujillo (abierta en la escena): sin Gastos registra desde Caja solo el gasto de hoy (caso 11, ADR-0491).
  esperar("sin el módulo Gastos no registra un gasto de otra fecha", r.ok && sinModulo.includes("gasto de hoy"), r);
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
  // 13 desde los gastos del viaje (ADR-0362 fase 6 · actividad 3, 20261013221000): «Traer la mercadería» (609) y «Viaje de compra» (631).
  // 18 desde Luz, Agua, Internet, Telefonía y Software (ADR-0477, 20261022205000): son 5 filas nuevas del catálogo.
  esperar("las 18 categorías se leen por su función", r.ok && Number(categorias) === 18, r);
}

// 9. El gasto rápido de Caja pagado con el Yape o el Plin de la tienda (ADR-0368, act. 2026-10-12): lo que manda la hoja (sin caja y
//    sin cuenta) cae en la cuenta donde entra ese medio en la tienda y NO toca el cajón: ni egreso ni cambio en lo esperado del cierre.
{
  const r = correr(`${ESCENA}
select retail.crear_cuenta_dinero('BCP prueba gasto rápido', 'banco', 0, retail.fn_hoy_lima() - 5) as bcp \\gset
select retail.crear_cuenta_dinero('Interbank prueba gasto rápido', 'banco', 0, retail.fn_hoy_lima() - 5) as ibk \\gset
select retail.guardar_medio_de_cobro(:'tru', 'yape', :'bcp') as _m1 \\gset
select retail.guardar_medio_de_cobro(:'tru', 'plin', :'ibk') as _m2 \\gset
select retail.fn_calcular_esperado_caja(:'caja')::text as esperado_antes \\gset
select count(*) as movs_antes from retail.caja_movimientos where caja_id = :'caja' \\gset
${cambiaA(MICAELA)}${conModuloGastos}
select retail.registrar_gasto(p_ubicacion_id => :'tru', p_categoria => 'transporte', p_descripcion => 'Movilidad', p_fecha => retail.fn_hoy_lima(),
  p_monto_total => 5, p_comprobante => null, p_medio_pago => 'yape', p_caja_id => null, p_caja_movimiento_id => null, p_referencia => null,
  p_token => gen_random_uuid()) as gy \\gset
select retail.registrar_gasto(p_ubicacion_id => :'tru', p_categoria => 'suministros', p_descripcion => 'Bolsas — para la campaña', p_fecha => retail.fn_hoy_lima(),
  p_monto_total => 12, p_comprobante => null, p_medio_pago => 'plin', p_caja_id => null, p_caja_movimiento_id => null, p_referencia => null,
  p_token => gen_random_uuid()) as gp \\gset
${cambiaA(FELIPE)}
select retail.fn_calcular_esperado_caja(:'caja')::text = :'esperado_antes';
select count(*) = :'movs_antes'::int from retail.caja_movimientos where caja_id = :'caja';
select medio_pago, caja_movimiento_id is null, cuenta_dinero_id = :'bcp' from retail.gastos where id = :'gy';
select medio_pago, caja_movimiento_id is null, cuenta_dinero_id = :'ibk' from retail.gastos where id = :'gp';
select count(*) from retail.fn_gastos_lista(retail.fn_hoy_lima(), retail.fn_hoy_lima(), :'tru') where id in (:'gy', :'gp') and caja_movimiento_id is null and medio_pago in ('yape', 'plin');`);
  const [esperado, movs, yape, plin, enLista] = lineas(r);
  esperar("un gasto por Yape o Plin desde Caja no cambia lo esperado del cajón", r.ok && esperado === "t", r);
  esperar("…ni crea un movimiento de caja", r.ok && movs === "t", r);
  esperar("el de Yape cae en la cuenta donde entra el Yape de la tienda", r.ok && yape === "yape|t|t", r);
  esperar("el de Plin, en la del Plin", r.ok && plin === "plin|t|t", r);
  esperar("los dos salen en la lista del día con su medio (así los muestra «Gastos del turno»)", r.ok && Number(enLista) === 2, r);
}

// 10. Luz, Agua, Internet y Telefonía (ADR-0477, 20261022205000): son categorías propias, pero la MISMA cuenta 636 que «Servicios
//     básicos» (`servicios_basicos`, que conserva su código y su nombre; solo cambian sus ejemplos). Para el contador nada cambia: el Estado de resultados y el Presupuesto
//     agrupan por cuenta; lo que cambia es que la lista de Gastos y la ficha del fijo ya hablan de «Luz» o de «Agua».
{
  const ORIGINALES = "'alquileres','servicios_basicos','transporte','suministros','mantenimiento','publicidad','asesoria','gastos_bancarios','tributos','seguros','atencion_personal','traer_mercaderia','viaje_compra'";
  const NUEVAS = "'luz','agua','internet','telefonia'";
  const TODAS_LAS_NUEVAS = "'luz','agua','internet','telefonia','software'";
  const FICHA = (b, c) => `'{"beneficiario": "${b}", "codigo_servicio": "${c}"}'::jsonb`;
  const fijo = (cat, desc, b, c, alias) =>
    `select retail.guardar_gasto_fijo(null, :'tru', '${cat}', '${desc}', null, 'factura', 120, true, 5, 'dia', ${FICHA(b, c)}) as ${alias} \\gset`;
  const fichaDe = (alias) =>
    `select (select categoria from retail.gastos_fijos where id = :'${alias}') || '|' || coalesce(codigo_servicio, '-') || '|' || coalesce(beneficiario, '-') from retail.fn_gasto_fijo_ficha(:'${alias}');`;
  const gasto = (cat, desc, dia, monto) =>
    `select retail.registrar_gasto(:'tru', '${cat}', '${desc}', '2026-09-${dia}', ${monto}, null, 'yape') as _g_${cat} \\gset`;

  // 10a. El catálogo: las 4 nuevas, en la cuenta 636 y activas; el orden de la lista; lo que ya existía no cambió.
  const a = correr(`${ESCENA}
select count(*) from retail.categorias_gasto where codigo in (${NUEVAS}) and cuenta_pcge = '636' and activo;
select nombre || '|' || ejemplos from retail.categorias_gasto where codigo = 'servicios_basicos';
select count(distinct orden) from retail.categorias_gasto where codigo in (${ORIGINALES}, ${TODAS_LAS_NUEVAS});
select string_agg(codigo, ',' order by n) from (select codigo, n from retail.fn_categorias_gasto() with ordinality as t(codigo, nombre, ejemplos, cuenta, cuenta_nombre, n) order by n limit 7) x;
select count(*) from retail.fn_categorias_gasto() where codigo in (${NUEVAS}) and cuenta = '636' and cuenta_nombre = 'Servicios básicos';
select string_agg(codigo || '=' || cuenta, ',' order by codigo collate "C") from retail.fn_categorias_gasto() where codigo in (${ORIGINALES});
select cuenta_pcge || '|' || activo::text from retail.categorias_gasto where codigo = 'software';
select nombre from retail.cuentas where codigo = '639';
select count(*) from retail.fn_categorias_gasto() where codigo = 'software' and cuenta = '639' and cuenta_nombre = 'Otros servicios de terceros';`);
  const [cuatro, otros, ordenes, lista, lasCuatro, cuentas, software, cuenta639, softwareEnLista] = lineas(a);
  esperar("Luz, Agua, Internet y Telefonía existen, activas y en la cuenta 636", a.ok && Number(cuatro) === 4, a);
  esperar("«servicios_basicos» conserva su código y su nombre, y sus ejemplos ya no prometen luz, agua, teléfono ni internet", a.ok && otros === "Servicios básicos|Baño, gas, vigilancia u otro servicio del local", a);
  esperar("las 18 categorías conocidas tienen un orden cada una (ninguno repetido)", a.ok && Number(ordenes) === 18, a);
  esperar("«Software y suscripciones» existe, activa y en la cuenta 639", a.ok && software === "639|true", a);
  esperar("la cuenta 639 ya no dice «(bancarios)»: la comparten las comisiones del banco y el software", a.ok && cuenta639 === "Otros servicios de terceros" && Number(softwareEnLista) === 1, a);
  esperar("la lista abre: Alquileres, Luz, Agua, Internet, Telefonía, Software, Servicios básicos", a.ok && lista === "alquileres,luz,agua,internet,telefonia,software,servicios_basicos", a);
  esperar("la función de la lista trae las 4 con su cuenta «Servicios básicos»", a.ok && Number(lasCuatro) === 4, a);
  esperar("las 13 de antes siguen con su código y su cuenta, sin moverse",
    a.ok && cuentas === "alquileres=635,asesoria=632,atencion_personal=625,gastos_bancarios=639,mantenimiento=634,publicidad=637,seguros=651,servicios_basicos=636,suministros=656,tributos=64,transporte=631,traer_mercaderia=609,viaje_compra=631".split(",").sort().join(","), a);

  // 10b. Un fijo acepta cada una con su ficha (suministro o línea + quién cobra); un código inventado se rechaza en criollo.
  const b = correr(`${ESCENA}
${fijo("luz", "Luz de la tienda", "Empresa de luz", "SUM-LUZ-1", "f_luz")}
${fijo("agua", "Agua de la tienda", "Empresa de agua", "SUM-AGUA-1", "f_agua")}
${fijo("internet", "Internet de la tienda", "Empresa de internet", "CLI-NET-1", "f_net")}
${fijo("telefonia", "Celular de la tienda", "Operadora", "LIN-TEL-1", "f_tel")}
${fichaDe("f_luz")}
${fichaDe("f_agua")}
${fichaDe("f_net")}
${fichaDe("f_tel")}
select pg_temp.intento(format('select retail.guardar_gasto_fijo(null, %L, ''luzz'', ''Luz'', null, ''factura'', 100, false, 5, ''dia'')', :'tru'));
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''luzz'', ''Luz'', ''2026-09-10'', 100, null, ''yape'')', :'tru'));`);
  const [fl, fa, fi, ft, fijoMalo, gastoMalo] = lineas(b);
  esperar("un fijo de Luz guarda su categoría y su ficha (suministro y empresa)", b.ok && fl === "luz|SUM-LUZ-1|Empresa de luz", b);
  esperar("un fijo de Agua, igual", b.ok && fa === "agua|SUM-AGUA-1|Empresa de agua", b);
  esperar("un fijo de Internet, igual", b.ok && fi === "internet|CLI-NET-1|Empresa de internet", b);
  esperar("un fijo de Telefonía, igual", b.ok && ft === "telefonia|LIN-TEL-1|Operadora", b);
  esperar("un código de categoría inventado se rechaza en un fijo: «Elige una categoría de la lista.»", b.ok && fijoMalo === "Elige una categoría de la lista.", b);
  esperar("y también al registrar un gasto", b.ok && gastoMalo === "Elige una categoría de la lista.", b);

  // 10c. Un gasto en cada una suma en la MISMA línea 636 del Estado de resultados y del Presupuesto que «Servicios básicos».
  //      100.10 + 50.20 + 80 + 40.55 + 25 = 295.85. «servicios_basicos» sigue aceptándose (los botones de Caja siguen ahí, ADR-0477).
  const c = correr(`${ESCENA}
select coalesce(sum((x->>'monto')::numeric), 0) as base_636 from retail.fn_estado_resultados('2026-09-01', '2026-09-30', :'tru') e, jsonb_array_elements(e.detalle_gastos) x where e.ubicacion_id = :'tru' and x->>'cuenta' = '636' \\gset
${gasto("luz", "Luz tienda", "10", "100.10")}
${gasto("agua", "Agua tienda", "11", "50.20")}
${gasto("internet", "Internet tienda", "12", "80")}
${gasto("telefonia", "Celular tienda", "13", "40.55")}
${gasto("servicios_basicos", "Baño tienda", "14", "25")}
select count(*) from retail.fn_estado_resultados('2026-09-01', '2026-09-30', :'tru') e, jsonb_array_elements(e.detalle_gastos) x where e.ubicacion_id = :'tru' and x->>'cuenta' = '636' and x->>'nombre' = 'Servicios básicos';
select sum((x->>'monto')::numeric) - :base_636 from retail.fn_estado_resultados('2026-09-01', '2026-09-30', :'tru') e, jsonb_array_elements(e.detalle_gastos) x where e.ubicacion_id = :'tru' and x->>'cuenta' = '636';
select count(*), sum((x->>'monto')::numeric) from jsonb_array_elements(retail.fn_gastos_panel('2026-09-01', '2026-09-30', :'tru') -> 'por_categoria') x where x->>'categoria' in (${NUEVAS}, 'servicios_basicos') and x->>'cuenta' = '636';
select string_agg(x->>'categoria' || '=' || (x->>'nombre'), ',' order by x->>'categoria') from jsonb_array_elements(retail.fn_gastos_panel('2026-09-01', '2026-09-30', :'tru') -> 'por_categoria') x where x->>'cuenta' = '636';
select count(*) from retail.fn_presupuesto_lineas('2026-09-01') where cuenta = '636';`);
  const [lineaUnica, sumaER, panel, nombres, presupuesto] = lineas(c);
  esperar("el Estado de resultados junta las cinco en UNA sola línea, la 636 «Servicios básicos»", c.ok && Number(lineaUnica) === 1, c);
  esperar("y esa línea sube exactamente 295.85", c.ok && Number(sumaER) === 295.85, c);
  esperar("la lista de Gastos sí las separa: 5 categorías, todas con cuenta 636, que suman 295.85", c.ok && panel === "5|295.85", c);
  esperar("cada una con su nombre propio en el panel", c.ok && nombres === "agua=Agua,internet=Internet,luz=Luz,servicios_basicos=Servicios básicos,telefonia=Telefonía", c);
  esperar("el Presupuesto sigue con UNA sola línea para la cuenta 636", c.ok && Number(presupuesto) === 1, c);
}

// 11. Desde Caja, sin el módulo Gastos (ADR-0491, 20261023212000): quien maneja la caja abierta de su tienda registra el gasto de HOY
//     al contado (del cajón, Yape o Plin; con boleta de un proveedor que ya existe). Otra fecha, a crédito, clasificar un egreso, otro
//     medio u otra tienda, no. Lee de los gastos de su tienda solo lo que pasó por la caja o por el Yape o el Plin.
{
  const sinCajaDeGastos = (sql) => `select pg_temp.intento(format(${sql}));`;
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'alquileres', 'Alquiler (prueba Caja)', retail.fn_hoy_lima(), 2500, null, 'transferencia') as alquiler \\gset
${cambiaA(MICAELA)}
select retail.registrar_gasto(:'tru', 'transporte', 'Movilidad (prueba Caja)', retail.fn_hoy_lima(), 6, null, 'yape') as y \\gset
select retail.registrar_gasto(:'tru', 'suministros', 'Bolsas (prueba Caja)', retail.fn_hoy_lima(), 15, null, 'efectivo', :'caja') as e \\gset
select retail.registrar_gasto(:'tru', 'mantenimiento', 'Arreglo (prueba Caja)', retail.fn_hoy_lima(), 30, jsonb_build_object('tipo','boleta','proveedor_id',:'prov','serie','B31','numero','1','condicion','contado'), 'plin') as b \\gset
select m.monto, m.motivo from retail.gastos g join retail.caja_movimientos m on m.id = g.caja_movimiento_id where g.id = :'e';
${sinCajaDeGastos(`'select retail.registrar_gasto(%L, ''transporte'', ''x'', retail.fn_hoy_lima() - 1, 6, null, ''yape'')', :'tru'`)}
${sinCajaDeGastos(`'select retail.registrar_gasto(%L, ''mantenimiento'', ''x'', retail.fn_hoy_lima(), 30, jsonb_build_object(''tipo'',''boleta'',''proveedor_id'',%L,''serie'',''B31'',''numero'',''2'',''condicion'',''credito'',''fecha_vencimiento'', retail.fn_hoy_lima() + 9))', :'tru', :'prov'`)}
${sinCajaDeGastos(`'select retail.registrar_gasto(%L, ''transporte'', ''x'', retail.fn_hoy_lima(), 12.50, null, ''efectivo'', null, %L)', :'tru', :'egreso'`)}
${sinCajaDeGastos(`'select retail.registrar_gasto(%L, ''transporte'', ''x'', retail.fn_hoy_lima(), 6, null, ''transferencia'')', :'tru'`)}
${sinCajaDeGastos(`'select retail.registrar_gasto(%L, ''transporte'', ''x'', retail.fn_hoy_lima(), 6, null, ''yape'')', :'lim'`)}
select string_agg(descripcion, ',' order by descripcion) from retail.fn_gastos_de_caja(:'tru', retail.fn_hoy_lima()) where descripcion like '%(prueba Caja)';
${sinCajaDeGastos(`'select count(*) from retail.fn_gastos_de_caja(%L, retail.fn_hoy_lima())', :'lim'`)}
${sinCajaDeGastos(`'select retail.anular_gasto(%L, ''me equivoqué de monto'')', :'y'`)}
${cambiaA(FELIPE)}
select count(*) from retail.fn_gastos_de_caja(:'tru', retail.fn_hoy_lima()) where descripcion like '%(prueba Caja)';
select medio_pago from retail.fn_gastos_de_caja(:'tru', retail.fn_hoy_lima()) where id = :'b';
select count(*) from retail.fn_gastos_lista(retail.fn_hoy_lima(), retail.fn_hoy_lima(), :'tru') where descripcion like '%(prueba Caja)';
set local role authenticated;
${sinCajaDeGastos(`'select retail.fn_puede_registrar_gasto(%L, retail.fn_hoy_lima(), null, ''yape'', null, null, null)', :'tru'`)}`);
  const [cajon, otraFecha, credito, clasificar, transferencia, otraTienda, lee, leeOtra, anular, leeLider, medioBoleta, enFinanzas, directo] = lineas(r);
  esperar("Caja sin Gastos: el efectivo sale del cajón abierto como su egreso «Otro»", r.ok && cajon === "15.00|Otro", r);
  esperar("…un gasto de otra fecha, no (gasto_fuera_de_caja)", r.ok && otraFecha.startsWith("Desde Caja se registra el gasto de hoy"), r);
  esperar("…a crédito, no", r.ok && credito.startsWith("Desde Caja se registra el gasto de hoy"), r);
  esperar("…clasificar un egreso ya hecho, no (es de Finanzas ▸ Gastos)", r.ok && clasificar.startsWith("Desde Caja se registra el gasto de hoy"), r);
  esperar("…por transferencia, no (solo cajón, Yape o Plin)", r.ok && transferencia.startsWith("Desde Caja se registra el gasto de hoy"), r);
  esperar("…en otra tienda, no", r.ok && otraTienda.includes("módulo Gastos"), r);
  esperar("lee los tres suyos y no el alquiler pagado por transferencia", r.ok && lee === "Arreglo (prueba Caja),Bolsas (prueba Caja),Movilidad (prueba Caja)", r);
  esperar("no lee los gastos de otra tienda", r.ok && leeOtra.includes("módulo Gastos"), r);
  esperar("anular sigue siendo de Finanzas ▸ Gastos", r.ok && anular !== "SIN_ERROR", r);
  esperar("con Gastos (el líder) la misma lectura trae también el alquiler", r.ok && Number(leeLider) === 4, r);
  esperar("la boleta dice su medio por su pago (plin)", r.ok && medioBoleta === "plin", r);
  esperar("los tres de Caja quedan en Finanzas ▸ Gastos, como cualquier gasto", r.ok && Number(enFinanzas) === 4, r);
  esperar("la regla no se llama desde el navegador", r.ok && directo.includes("permission denied"), r);
}

// 11b. Con la caja cerrada, o sin el módulo Caja, no se registra desde Caja.
{
  const r = correr(`${ESCENA}
select retail.cerrar_caja(:'caja', 87.50) as _c \\gset
${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''transporte'', ''x'', retail.fn_hoy_lima(), 6, null, ''yape'')', :'tru'));
select pg_temp.intento(format('select count(*) from retail.fn_gastos_de_caja(%L, retail.fn_hoy_lima())', :'tru'));
${cambiaA(FELIPE)}
select retail.abrir_caja(:'tru', 100.00, 'prueba automatizada') as _a \\gset
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'caja';
${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''transporte'', ''x'', retail.fn_hoy_lima(), 6, null, ''yape'')', :'tru'));`);
  const [cerrada, leeCerrada, sinCaja] = lineas(r);
  esperar("con la caja cerrada lo dice (caja_cerrada)", r.ok && cerrada.includes("está cerrada"), r);
  esperar("con la caja cerrada no lee los gastos de la tienda", r.ok && leeCerrada.includes("caja abierta"), r);
  esperar("sin el módulo Caja (ni Gastos), no registra", r.ok && sinCaja.includes("módulo Gastos"), r);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);

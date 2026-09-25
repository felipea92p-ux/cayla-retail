#!/usr/bin/env node
/**
 * Prueba de ADR-0195 F2b — activos fijos y gastos fijos del mes (`20260925000000_finanzas_activos_fijos_y_gastos_fijos.sql`).
 *
 * QUÉ CUBRE
 *   · activo con factura (costo SIN IGV, cabecera `compras` de naturaleza activo, en Por pagar si es a crédito), sin
 *     comprobante del cajón y clasificando un egreso; la depreciación en línea recta desde el mes siguiente, que se
 *     detiene en la vida útil y en la baja (`fn_activos_lista`, `fn_depreciacion_mes`);
 *   · un egreso de caja respalda UNA sola cosa: gasto, activo o «no es gasto»;
 *   · anular (sin pagos) y dar de baja; no se edita ni se borra; la factura de un activo no se anula desde Compras;
 *   · gastos fijos: registrado / viene / falta, uno por mes, archivar, y los que el sistema propone;
 *   · decisión B: con el módulo Gastos, solo su tienda; nadie lee las tablas directo;
 *   · la lista de gastos dice cómo se pagó también cuando el gasto tiene comprobante;
 *   · «No es fijo» (20260925102000): lo descartado deja de proponerse.
 *
 * CÓMO. Igual que `gastos.mjs`: cada escenario en su transacción con ROLLBACK, sesión simulada con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:activos-y-fijos    → con las migraciones ya aplicadas en el local
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

/** Trujillo y Lima, un proveedor de prueba, la caja de Trujillo abierta de cero y un egreso «Otro» de S/ 500 que la
 *  tienda registró sin decir qué fue. Deja `:tru`, `:lim`, `:prov`, `:caja`, `:egreso`. */
const ESCENA = `
begin;
${INTENTO}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.proveedores (nombre, activo) values ('Muebles Roble (prueba F2b)', true) returning id as prov \\gset
select (select count(*) from (select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 100.00, 'prueba automatizada') as caja \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 500, 'Otro', 'estante', false, null::uuid) as egreso \\gset
`;
const conModulo = (m) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${m}');\n`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 800)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. Activo con factura al contado: costo sin IGV, cuenta y vida útil del tipo, depreciación desde el mes siguiente.
{
  const r = correr(`${ESCENA}
select retail.registrar_activo(:'tru', 'muebles', 'Estante en L', '2026-06-15', 2360, jsonb_build_object('tipo','factura','proveedor_id',:'prov','serie','F001','numero','140','condicion','contado'), 'transferencia') as a \\gset
select a.costo, a.cuenta_codigo, a.vida_util_meses, a.tasa_anual, c.naturaleza, c.igv, c.total, c.estado_pago from retail.activos_fijos a join retail.compras c on c.id = a.compra_id where a.id = :'a';
select depreciacion_mensual, meses_depreciados, depreciacion_acumulada, valor_hoy from retail.fn_activos_lista('2026-06-30') where id = :'a';
select depreciacion_mensual, meses_depreciados, depreciacion_acumulada, valor_hoy from retail.fn_activos_lista('2026-09-24') where id = :'a';
select count(*) from retail.listar_compras(p_limite => 200) where id = (select compra_id from retail.activos_fijos where id = :'a');`);
  const [cab, junio, sept, lista] = lineas(r);
  esperar("factura de S/ 2,360: costo S/ 2,000 sin IGV, cuenta 335, 10 años (10 %), cabecera de activo pagada", r.ok && cab === "2000.00|335|120|0.1000|activo|360.00|2360.00|pagada", r);
  esperar("el mes de la compra no se deprecia", r.ok && junio === "16.67|0|0.00|2000.00", r);
  esperar("a septiembre van 3 meses: S/ 50.00 depreciados (desde la tasa exacta, sin arrastrar redondeos), vale S/ 1,950", r.ok && sept === "16.67|3|50.00|1950.00", r);
  esperar("no aparece en la lista de Facturas de proveedor (mercadería)", r.ok && Number(lista) === 0, r);
}

// 2. Sin comprobante, efectivo del cajón; y clasificando el egreso de la tienda. Un egreso respalda UNA sola cosa.
{
  const r = correr(`${ESCENA}
select retail.registrar_activo(:'tru', 'equipos_computo', 'Laptop de caja', '2026-09-20', 1800, null, 'efectivo', :'caja') as a \\gset
select m.monto, m.motivo, left(m.nota, 30), a.costo, a.vida_util_meses from retail.activos_fijos a join retail.caja_movimientos m on m.id = a.caja_movimiento_id where a.id = :'a';
select retail.registrar_activo(:'tru', 'muebles', 'Estante', '2026-09-20', 500, null, 'efectivo', null, :'egreso') as b \\gset
select count(*) from retail.fn_egresos_sin_clasificar(:'tru') where id = :'egreso';
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''suministros'', ''x'', ''2026-09-20'', 500, null, ''efectivo'', null, %L)', :'tru', :'egreso'));
select pg_temp.intento(format('select retail.marcar_egreso_no_gasto(%L, ''deposito'')', :'egreso'));
select pg_temp.intento(format('select retail.registrar_activo(%L, ''muebles'', ''Otro estante'', ''2026-09-20'', 500, null, ''efectivo'', null, %L)', :'tru', :'egreso'));`);
  const [cajon, clasificado, gasto, marca, otro] = lineas(r);
  esperar("sin comprobante en efectivo: sale del cajón con su egreso, cuesta lo pagado, 4 años", r.ok && cajon === "1800.00|Otro|Activo · Computadoras y tablet|1800.00|48", r);
  esperar("clasificado como activo, el egreso ya no está por clasificar", r.ok && Number(clasificado) === 0, r);
  esperar("ese egreso ya no puede ser un gasto", r.ok && (gasto.includes("ya se usó") || gasto.includes("ya es un activo")), r);
  esperar("ni marcarse «no es gasto»", r.ok && marca.includes("ya es un activo"), r);
  esperar("ni otro activo", r.ok && otro.includes("ya se usó"), r);
}

// 3. A crédito: en Por pagar, parte entera de su tienda; y la depreciación que suma cada mes.
{
  const r = correr(`${ESCENA}
select retail.registrar_activo(:'tru', 'maquinaria', 'Remalladora', '2026-09-10', 1180, jsonb_build_object('tipo','factura','proveedor_id',:'prov','serie','F002','numero','9','condicion','credito','fecha_vencimiento','2026-10-10')) as a \\gset
select compra_id as compra from retail.activos_fijos where id = :'a' \\gset
select count(*) from retail.listar_compras(p_limite => 200, p_con_saldo => true, p_orden => 'vencimiento', p_naturaleza => 'todas') where id = :'compra';
select total, saldo from retail.fn_deuda_visible() where compra_id = :'compra';
select total from retail.compra_parte_por_tienda where compra_id = :'compra' and ubicacion_id = :'tru';
select retail.registrar_activo(:'tru', 'equipos', 'Impresora de etiquetas', '2025-06-15', 1200, null, 'yape', null, null, null, 12) as b \\gset
select coalesce((select monto from retail.fn_depreciacion_mes('2025-06-01') where ubicacion_id = :'tru'), 0);
select coalesce((select monto from retail.fn_depreciacion_mes('2025-07-01') where ubicacion_id = :'tru'), 0);
select coalesce((select monto from retail.fn_depreciacion_mes('2026-06-01') where ubicacion_id = :'tru'), 0);
select coalesce((select monto from retail.fn_depreciacion_mes('2026-07-01') where ubicacion_id = :'tru'), 0);
select meses_depreciados, valor_hoy from retail.fn_activos_lista() where id = :'b';
select retail.registrar_activo(:'lim', 'muebles', 'Mostrador', '2016-01-10', 2000, null, 'yape') as c \\gset
select sum(coalesce((select monto from retail.fn_depreciacion_mes(m::date) where ubicacion_id = :'lim'), 0)) from generate_series('2016-01-01'::date, '2026-08-01'::date, interval '1 month') m;`);
  const [porPagar, deuda, parte, jun25, jul25, jun26, jul26, acabado, sumaVida] = lineas(r);
  esperar("el activo a crédito está en Por pagar", r.ok && Number(porPagar) === 1, r);
  esperar("y en la deuda visible, entero", r.ok && deuda === "1180.00|1180.00", r);
  esperar("su parte por tienda es el total, en Trujillo", r.ok && parte === "1180.00", r);
  esperar("depreciación del mes: 0 el mes de compra, S/ 100 del siguiente al 12.º, 0 al acabarse la vida útil", r.ok && [jun25, jul25, jun26, jul26].map(Number).join(",") === "0,100,100,0", r);
  esperar("acabada su vida útil, vale cero", r.ok && acabado === "12|0.00", r);
  esperar("los 120 meses de un mostrador de S/ 2,000 suman exactamente S/ 2,000", r.ok && sumaVida === "2000.00", r);
}

// 4. Anular, dar de baja, no editar ni borrar; la factura de un activo no se anula desde Compras.
{
  const r = correr(`${ESCENA}
select retail.registrar_activo(:'tru', 'muebles', 'Vitrina', '2026-09-01', 590, jsonb_build_object('tipo','boleta','proveedor_id',:'prov','serie','B1','numero','1','condicion','credito','fecha_vencimiento','2026-10-01')) as cred \\gset
select compra_id as compra from retail.activos_fijos where id = :'cred' \\gset
select pg_temp.intento(format('select retail.anular_compra(%L, ''desde compras'')', :'compra'));
select retail.anular_activo(:'cred', 'mal registrado') as _a \\gset
select a.estado, c.estado from retail.activos_fijos a join retail.compras c on c.id = a.compra_id where a.id = :'cred';
select retail.registrar_activo(:'tru', 'muebles', 'Mesa', '2026-08-01', 300, jsonb_build_object('tipo','boleta','proveedor_id',:'prov','serie','B1','numero','2','condicion','contado'), 'yape') as pag \\gset
select pg_temp.intento(format('select retail.anular_activo(%L, ''error'')', :'pag'));
select pg_temp.intento(format('select retail.dar_de_baja_activo(%L, ''2026-07-01'', ''se rompió'')', :'pag'));
select retail.dar_de_baja_activo(:'pag', '2026-09-20', 'se rompió') as _b \\gset
select estado, meses_depreciados from retail.fn_activos_lista('2027-01-31') where id = :'pag';
select pg_temp.intento(format('update retail.activos_fijos set nombre = ''x'' where id = %L', :'pag'));
select pg_temp.intento(format('delete from retail.activos_fijos where id = %L', :'pag'));`);
  const [desdeCompras, anulado, conPagos, bajaAntes, baja, editar, borrar] = lineas(r);
  esperar("la factura de un activo no se anula desde Compras", r.ok && desdeCompras.includes("anúlalo desde Finanzas"), r);
  esperar("anular un activo a crédito sin pagos anula su factura", r.ok && anulado === "anulado|anulada", r);
  esperar("con la factura pagada no se anula: se da de baja", r.ok && conPagos.includes("dalo de baja"), r);
  esperar("la baja no puede ser antes de la compra", r.ok && bajaAntes.includes("desde la compra"), r);
  esperar("dado de baja en septiembre, deja de depreciarse ahí (1 mes, aunque el corte sea enero)", r.ok && baja === "baja|1", r);
  esperar("un activo dado de baja no se modifica", r.ok && editar.includes("no se modifica"), r);
  esperar("un activo no se borra", r.ok && borrar.includes("no se borra"), r);
}

// 5. Candados de datos y permisos de activos.
{
  const r = correr(`${ESCENA}
select pg_temp.intento(format('select retail.registrar_activo(%L, ''muebles'', ''x'', ''2026-09-01'', 100, jsonb_build_object(''tipo'',''recibo_por_honorarios'',''proveedor_id'',%L,''serie'',''E1'',''numero'',''1'',''condicion'',''contado''), ''yape'')', :'tru', :'prov'));
select pg_temp.intento(format('select retail.registrar_activo(%L, ''muebles'', ''x'', ''2026-09-01'', 100, null, ''yape'', null, null, null, 6)', :'tru'));
select pg_temp.intento('select retail.registrar_activo(null, ''muebles'', ''x'', ''2026-09-01'', 100, null, ''yape'')');
select pg_temp.intento(format('select retail.registrar_activo(%L, ''no_existe'', ''x'', ''2026-09-01'', 100, null, ''yape'')', :'tru'));
${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.registrar_activo(%L, ''muebles'', ''x'', ''2026-09-01'', 100, null, ''yape'')', :'tru'));
${conModulo("gastos")}
select pg_temp.intento(format('select retail.registrar_activo(%L, ''muebles'', ''Perchero'', ''2026-09-01'', 100, null, ''yape'')', :'tru'));
select pg_temp.intento(format('select retail.registrar_activo(%L, ''muebles'', ''x'', ''2026-09-01'', 100, null, ''yape'')', :'lim'));
select count(*) from retail.fn_activos_lista() where ubicacion_id <> :'tru';
set local role authenticated;
select pg_temp.intento('select count(*) from retail.activos_fijos');
select count(*) from retail.fn_tipos_activo();`);
  const [rxh, vida, sinUbic, tipo, sinModulo, suTienda, otra, ajenos, directo, tipos] = lineas(r);
  esperar("un activo no llega con recibo por honorarios", r.ok && rxh.includes("honorarios"), r);
  esperar("vida útil de menos de un año: rechazada", r.ok && vida.includes("vida útil"), r);
  esperar("un activo siempre está en una ubicación", r.ok && sinUbic.includes("elige dónde"), r);
  esperar("el tipo sale de la lista", r.ok && tipo.includes("tipo de activo"), r);
  esperar("sin el módulo Gastos no registra activos", r.ok && sinModulo.includes("módulo Gastos"), r);
  esperar("con el módulo, en su tienda sí", r.ok && suTienda === "SIN_ERROR", r);
  esperar("con el módulo, en otra no", r.ok && otra.includes("solo de tu tienda"), r);
  esperar("y solo ve los activos de su tienda", r.ok && Number(ajenos) === 0, r);
  esperar("nadie lee `activos_fijos` directo", r.ok && directo.includes("permission denied"), r);
  esperar("los 6 tipos de activo se leen por su función", r.ok && Number(tipos) === 6, r);
}

// 6. Gastos fijos: falta / viene / registrado, uno por mes, archivar.
{
  const r = correr(`${ESCENA}
select retail.guardar_gasto_fijo(null, :'tru', 'servicios_basicos', 'Luz de la tienda', :'prov', 'boleta', 180, true, 10) as f \\gset
select estado, fecha_esperada, monto_variable from retail.fn_gastos_fijos_mes('2026-09-01', :'tru') where id = :'f';
select estado from retail.fn_gastos_fijos_mes('2026-10-01', :'tru') where id = :'f';
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Luz de septiembre', '2026-09-12', 176.40, null, 'yape', null, null, null, null, :'f') as g \\gset
select estado, gasto_monto from retail.fn_gastos_fijos_mes('2026-09-01', :'tru') where id = :'f';
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''servicios_basicos'', ''Otra luz'', ''2026-09-20'', 10, null, ''yape'', null, null, null, null, %L)', :'tru', :'f'));
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''servicios_basicos'', ''Luz agosto'', ''2026-08-12'', 170, null, ''yape'', null, null, null, null, %L)', :'tru', :'f'));
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''servicios_basicos'', ''Luz'', ''2026-09-12'', 10, null, ''yape'', null, null, null, null, %L)', :'lim', :'f'));
select pg_temp.intento(format('select retail.guardar_gasto_fijo(null, %L, ''servicios_basicos'', ''x'', null, ''boleta'', 10, false, 31)', :'tru'));
select retail.archivar_gasto_fijo(:'f') as _x \\gset
select count(*) from retail.fn_gastos_fijos_mes('2026-09-01', :'tru') where id = :'f';`);
  const [falta, viene, registrado, dobleMes, otroMes, otraTienda, dia31, archivado] = lineas(r);
  esperar("pasó su día (10) y no hay gasto: falta, esperado el 2026-09-10, monto variable", r.ok && falta === "falta|2026-09-10|t", r);
  esperar("en octubre todavía viene", r.ok && viene === "por_llegar", r);
  esperar("con su gasto registrado: registrado, con lo pagado de verdad", r.ok && registrado === "registrado|176.40", r);
  esperar("un solo gasto por fijo en el mismo mes", r.ok && dobleMes.includes("ya tiene su gasto de este mes"), r);
  esperar("el mes anterior es otro mes: sí se registra", r.ok && otroMes === "SIN_ERROR", r);
  esperar("el fijo de una tienda no se usa en otra", r.ok && otraTienda.includes("otra tienda"), r);
  esperar("el día va hasta el 28", r.ok && dia31.includes("28"), r);
  esperar("archivado, deja de aparecer", r.ok && Number(archivado) === 0, r);
}

// 7. Lo que se repite se propone como fijo; ya guardado, deja de proponerse. Permisos de fijos.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'publicidad', 'Anuncio mensual', '2026-06-08', 100, null, 'yape') as g1 \\gset
select retail.registrar_gasto(:'tru', 'publicidad', 'Anuncio mensual', '2026-07-09', 120, null, 'yape') as g2 \\gset
select retail.registrar_gasto(:'tru', 'publicidad', 'Anuncio de agosto', '2026-08-09', 110, null, 'yape') as g3 \\gset
select meses, monto, dia_del_mes, descripcion, comprobante_tipo from retail.fn_gastos_fijos_sugeridos() where ubicacion_id = :'tru' and categoria = 'publicidad';
select retail.guardar_gasto_fijo(null, :'tru', 'publicidad', 'Anuncio mensual', null, 'sin_comprobante', 110, false, 9) as f \\gset
select count(*) from retail.fn_gastos_fijos_sugeridos() where ubicacion_id = :'tru' and categoria = 'publicidad';
${cambiaA(MICAELA)}${conModulo("gastos")}
select pg_temp.intento(format('select retail.guardar_gasto_fijo(null, %L, ''alquileres'', ''Alquiler'', null, ''factura'', 2500, false, 1)', :'tru'));
select pg_temp.intento(format('select retail.guardar_gasto_fijo(null, %L, ''alquileres'', ''Alquiler'', null, ''factura'', 2500, false, 1)', :'lim'));
select pg_temp.intento('select retail.guardar_gasto_fijo(null, null, ''asesoria'', ''Contador'', null, ''recibo_por_honorarios'', 800, false, 5)');
set local role authenticated;
select pg_temp.intento('select count(*) from retail.gastos_fijos');`);
  const [sugerido, yaNo, suTienda, otra, empresa, directo] = lineas(r);
  esperar("3 meses seguidos: se propone con el promedio (S/ 110), el día más común (9) y la última descripción", r.ok && sugerido === "3|110.00|9|Anuncio de agosto|sin_comprobante", r);
  esperar("guardado como fijo, deja de proponerse", r.ok && Number(yaNo) === 0, r);
  esperar("con el módulo, guarda fijos de su tienda", r.ok && suTienda === "SIN_ERROR", r);
  esperar("de otra tienda, no", r.ok && otra.includes("esa tienda"), r);
  esperar("«de la empresa», solo el líder", r.ok && empresa.includes("esa tienda"), r);
  esperar("nadie lee `gastos_fijos` directo", r.ok && directo.includes("permission denied"), r);
}

// 8. La lista de gastos dice cómo se pagó también con comprobante (el medio sale de su pago).
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Luz con factura', '2026-09-12', 118, jsonb_build_object('tipo', 'factura', 'proveedor_id', :'prov', 'serie', 'F001', 'numero', '4401', 'condicion', 'contado'), 'transferencia', null, null, 'op 55') as g \\gset
select retail.registrar_gasto(:'tru', 'suministros', 'Bolsas sin factura', '2026-09-12', 20, null, 'yape') as g2 \\gset
select medio_pago, compra_id is not null from retail.fn_gastos_lista('2026-09-01', '2026-09-30', :'tru') where id = :'g';
select medio_pago, compra_id is null from retail.fn_gastos_lista('2026-09-01', '2026-09-30', :'tru') where id = :'g2';`);
  const [conFactura, sinFactura] = lineas(r);
  esperar("con factura al contado, la lista dice «transferencia» (antes, nada)", r.ok && conFactura === "transferencia|t", r);
  esperar("sin comprobante, el medio del gasto", r.ok && sinFactura === "yape|t", r);
}

// 9. «No es fijo»: lo descartado deja de proponerse; cada quien descarta solo lo que ve.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'transporte', 'Mototaxi', '2026-06-08', 8, null, 'yape') as g1 \\gset
select retail.registrar_gasto(:'tru', 'transporte', 'Mototaxi', '2026-07-09', 9, null, 'yape') as g2 \\gset
select retail.registrar_gasto(:'tru', 'transporte', 'Mototaxi', '2026-08-09', 7, null, 'yape') as g3 \\gset
select count(*) from retail.fn_gastos_fijos_sugeridos() where ubicacion_id = :'tru' and categoria = 'transporte' and proveedor_id is null;
select retail.descartar_fijo_sugerido(:'tru', 'transporte', null);
select count(*) from retail.fn_gastos_fijos_sugeridos() where ubicacion_id = :'tru' and categoria = 'transporte' and proveedor_id is null;
select pg_temp.intento(format('select retail.descartar_fijo_sugerido(%L, ''transporte'', null)', :'tru'));
${cambiaA(MICAELA)}${conModulo("gastos")}
select pg_temp.intento(format('select retail.descartar_fijo_sugerido(%L, ''publicidad'', null)', :'tru'));
select pg_temp.intento(format('select retail.descartar_fijo_sugerido(%L, ''publicidad'', null)', :'lim'));
select pg_temp.intento('select retail.descartar_fijo_sugerido(null, ''asesoria'', null)');
set local role authenticated;
select pg_temp.intento('select count(*) from retail.gastos_fijos_descartados');`);
  const [antes, , despues, repetido, suTienda, otra, empresa, directo] = lineas(r); // la 2.ª es el void del descarte
  esperar("tres mototaxis seguidos se proponen como fijo", r.ok && Number(antes) === 1, r);
  esperar("«No es fijo»: deja de proponerse", r.ok && Number(despues) === 0, r);
  esperar("descartarlo otra vez no falla ni duplica", r.ok && repetido === "SIN_ERROR", r);
  esperar("con el módulo, descarta los de su tienda", r.ok && suTienda === "SIN_ERROR", r);
  esperar("los de otra tienda, no", r.ok && otra.includes("No ves"), r);
  esperar("los de la empresa, solo el líder", r.ok && empresa.includes("Solo el líder"), r);
  esperar("nadie lee los descartes directo", r.ok && directo.includes("permission denied"), r);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);

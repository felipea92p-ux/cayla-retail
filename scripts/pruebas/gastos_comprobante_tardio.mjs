#!/usr/bin/env node
/**
 * Prueba de ADR-0588 — «Llegó el comprobante»: un gasto pagado sin comprobante recibe su boleta, factura o recibo por honorarios
 * (`20261031154000_gastos_llego_el_comprobante.sql`).
 *
 * QUÉ CUBRE
 *   · «como si se registró con él» (la decisión de Felipe): el gasto, su comprobante y su pago quedan IGUALES a los de un gasto registrado con ese
 *     comprobante al contado, por transferencia y en efectivo del cajón; y el saldo de cada cuenta y el egreso del cajón no se mueven;
 *   · la fecha del papel va al comprobante (Impuestos) y la del pago sigue siendo la del gasto; el IGV de la factura (por la tasa o el que dice el
 *     papel); una boleta no lleva IGV; la marca «Sin comprobante» se va de la lista; queda el rastro;
 *   · dos toques: el mismo papel devuelve lo que ya quedó; otro papel se rechaza;
 *   · todo o nada: tipo, proveedor, serie, fecha futura, IGV fuera de rango, comprobante repetido;
 *   · lo que no recibe comprobante aquí: anulado, del viaje, desde un fondo por rendir; y un mes cerrado;
 *   · las marcas: sin la de este gasto no se cambia el comprobante ni la cuenta; con ella, nada más que el pago;
 *   · permisos por tienda.
 *
 * CÓMO. Igual que `gastos.mjs`: cada escenario en su transacción con ROLLBACK (nunca se commitea nada en el Postgres local compartido), sesión
 * simulada con `request.jwt.claim.sub`, `pg_temp.intento` para leer el error. Septiembre de 2026, un mes que ya pasó.
 *
 * USO
 *   pnpm pruebas:gastos-comprobante-tardio    → con las migraciones ya aplicadas en el local
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

/** Cómo quedó un gasto con comprobante, sin ids ni fechas de creación: lo que tiene que ser igual entre «llegó después» y «se registró con él». */
const HUELLA = `
create function pg_temp.huella(p_gasto uuid) returns text language sql as $f$
  select concat_ws('|',
    'gasto', g.categoria, g.monto_total, g.igv, coalesce(g.medio_pago, '-'), (g.cuenta_dinero_id is null), (g.caja_movimiento_id is not null), g.estado,
    'comp', c.tipo, c.condicion, c.naturaleza, c.subtotal, c.igv, c.total, c.pagado, c.estado, (c.ubicacion_gestion_id is not distinct from g.ubicacion_id),
    'pago', p.metodo, p.monto, (p.cuenta_dinero_id is not null), (p.caja_movimiento_id is not distinct from g.caja_movimiento_id), (p.ubicacion_id is not distinct from g.ubicacion_id), p.fecha = g.fecha)
    from retail.gastos g join retail.compras c on c.id = g.compra_id join retail.compra_pagos p on p.compra_id = c.id
   where g.id = p_gasto
$f$;
create function pg_temp.saldos() returns text language sql as $f$
  select string_agg(s.nombre || '=' || s.saldo, ',' order by s.nombre) from retail.fn_cuentas_dinero_saldos(null, null) s
$f$;
`;

/** Trujillo, un proveedor de prueba y la caja de Trujillo abierta de cero (S/ 500). Deja `:tru`, `:lim`, `:prov`, `:caja`. */
const ESCENA = `
begin;
${INTENTO}
${HUELLA}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.proveedores (nombre, activo) values ('Remalladoras del Norte (prueba ADR-0588)', true) returning id as prov \\gset
select (select count(*) from (select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 500.00, 'prueba automatizada') as caja \\gset
`;
const papel = (tipo, numero, extra = "") => `jsonb_build_object('tipo', '${tipo}', 'proveedor_id', :'prov', 'serie', 'F001', 'numero', '${numero}'${extra})`;
const agregar = (gasto, comprobante) => `select pg_temp.intento(format('select retail.agregar_comprobante_a_gasto(%L, %L)', ${gasto}, ${comprobante}))`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 900)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. «Como si se registró con él», por transferencia: mismo gasto, mismo comprobante, mismo pago; los saldos no se mueven.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'mantenimiento', 'Arreglo de la remalladora', '2026-09-20', 472, null, 'transferencia') as tarde \\gset
select pg_temp.saldos() as saldos_antes \\gset
select retail.agregar_comprobante_a_gasto(:'tarde', ${papel("factura", "100", ", 'fecha_emision', '2026-09-22'")}) ->> 'igv';
select pg_temp.saldos() = :'saldos_antes';
select retail.registrar_gasto(:'tru', 'mantenimiento', 'Arreglo de la remalladora', '2026-09-20', 472,
  ${papel("factura", "101", ", 'condicion', 'contado'")}, 'transferencia') as directo \\gset
select pg_temp.huella(:'tarde') = pg_temp.huella(:'directo'), pg_temp.huella(:'tarde');
select c.fecha_emision || '|' || p.fecha from retail.gastos g join retail.compras c on c.id = g.compra_id join retail.compra_pagos p on p.compra_id = c.id where g.id = :'tarde';
select comprobante_tipo || '|' || comprobante from retail.fn_gastos_lista('2026-09-01', '2026-09-30', :'tru') where id = :'tarde';
select campo || ':' || antes || '>' || despues from retail.gasto_correcciones where gasto_id = :'tarde';`);
  const [igv, saldos, igual, fechas, enLista, rastro] = lineas(r);
  esperar("la factura de S/ 472 lleva su IGV por la tasa (S/ 72)", r.ok && igv === "72.00", r);
  esperar("los saldos de todas las cuentas no se mueven", r.ok && saldos === "t", r);
  esperar("queda igual que uno registrado con su factura al contado", r.ok && igual.startsWith("t|"), r);
  esperar("el papel lleva su fecha (Impuestos) y el pago, la del gasto", r.ok && fechas === "2026-09-22|2026-09-20", r);
  esperar("la lista ya lo ve con su factura", r.ok && enLista === "factura|F001-100", r);
  esperar("y queda el rastro", r.ok && rastro === "comprobante:Sin comprobante>Factura F001-100", r);
}

// 2. «Como si se registró con él», en efectivo del cajón: el pago toma el MISMO egreso; la caja y los saldos no se mueven.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'mantenimiento', 'Repuesto', '2026-09-20', 118, null, 'efectivo', :'caja') as tarde \\gset
select caja_movimiento_id as egreso from retail.gastos where id = :'tarde' \\gset
select count(*) || '|' || sum(monto) as caja_antes from retail.caja_movimientos where caja_id = :'caja' \\gset
select pg_temp.saldos() as saldos_antes \\gset
select retail.agregar_comprobante_a_gasto(:'tarde', ${papel("boleta", "200")}) ->> 'igv';
select (count(*) || '|' || sum(monto)) = :'caja_antes' from retail.caja_movimientos where caja_id = :'caja';
select pg_temp.saldos() = :'saldos_antes';
select p.caja_movimiento_id = :'egreso' from retail.compra_pagos p join retail.gastos g on g.compra_id = p.compra_id where g.id = :'tarde';
select retail.registrar_gasto(:'tru', 'mantenimiento', 'Repuesto', '2026-09-20', 118, ${papel("boleta", "201", ", 'condicion', 'contado'")}, 'efectivo', :'caja') as directo \\gset
select pg_temp.huella(:'tarde') = pg_temp.huella(:'directo'), pg_temp.huella(:'tarde');`);
  const [igv, caja, saldos, mismoEgreso, igual] = lineas(r);
  esperar("una boleta no lleva IGV", r.ok && igv === "0", r);
  esperar("el cajón no se mueve (ningún egreso nuevo)", r.ok && caja === "t", r);
  esperar("los saldos de todas las cuentas no se mueven", r.ok && saldos === "t", r);
  esperar("el pago se une al MISMO egreso del cajón", r.ok && mismoEgreso === "t", r);
  esperar("queda igual que uno registrado con su boleta al contado del cajón", r.ok && igual.startsWith("t|"), r);
}

// 3. El IGV que dice el papel; dos toques; otro papel se rechaza.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'suministros', 'Útiles', '2026-09-20', 236, null, 'yape') as g \\gset
select retail.agregar_comprobante_a_gasto(:'g', ${papel("factura", "300", ", 'igv', 30")});
select retail.agregar_comprobante_a_gasto(:'g', ${papel("factura", "300", ", 'igv', 30")});
${agregar(`:'g'`, papel("factura", "301"))};
select count(*) from retail.compras where proveedor_id = :'prov';`);
  const [primero, segundo, otro, compras] = lineas(r);
  esperar("el IGV que dice el papel (S/ 30)", r.ok && primero.includes('"igv": 30') && primero.includes('"ya_estaba": false'), r);
  esperar("el segundo toque con el mismo papel devuelve lo que ya quedó", r.ok && segundo.includes('"ya_estaba": true'), r);
  esperar("otro papel se rechaza: ya tiene su comprobante", r.ok && otro.includes("ya tiene su comprobante"), r);
  esperar("y hay un solo comprobante", r.ok && compras === "1", r);
}

// 4. Todo o nada.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'suministros', 'Útiles', '2026-09-20', 236, null, 'yape') as g \\gset
select retail.registrar_gasto(:'tru', 'suministros', 'Cajas', '2026-09-21', 118, ${papel("factura", "999", ", 'condicion', 'contado'")}, 'yape') as _otro \\gset
${agregar(`:'g'`, `jsonb_build_object('tipo', 'ticket', 'proveedor_id', :'prov', 'serie', 'F001', 'numero', '1')`)};
${agregar(`:'g'`, `jsonb_build_object('tipo', 'factura', 'serie', 'F001', 'numero', '1')`)};
${agregar(`:'g'`, papel("factura", ""))};
${agregar(`:'g'`, papel("factura", "2", ", 'fecha_emision', (retail.fn_hoy_lima() + 3)::text"))};
${agregar(`:'g'`, papel("factura", "3", ", 'igv', 236"))};
${agregar(`:'g'`, papel("factura", "999"))};
select compra_id is null and medio_pago = 'yape' from retail.gastos where id = :'g';`);
  const [tipo, prov, serie, futura, igv, repetido, intacto] = lineas(r);
  esperar("un tipo que no es comprobante se rechaza", r.ok && tipo.includes("factura, boleta o recibo"), r);
  esperar("sin proveedor se rechaza", r.ok && prov.includes("Elige el proveedor"), r);
  esperar("sin número se rechaza", r.ok && serie.includes("serie y el número"), r);
  esperar("una fecha futura se rechaza", r.ok && futura.includes("futura"), r);
  esperar("un IGV igual al total se rechaza", r.ok && igv.includes("entre cero y el total"), r);
  esperar("un comprobante ya registrado se rechaza", r.ok && repetido.includes("ya está registrado"), r);
  esperar("y el gasto quedó como estaba", r.ok && intacto === "t", r);
}

// 5. Lo que no recibe comprobante aquí: anulado, del viaje, desde un fondo; y un mes cerrado.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'suministros', 'Útiles', '2026-09-20', 236, null, 'yape') as g \\gset
select retail.registrar_gasto(:'tru', 'suministros', 'Otro', '2026-09-21', 50, null, 'yape') as anulado \\gset
select retail.anular_gasto(:'anulado', 'se registró dos veces');
${agregar(`:'anulado'`, papel("boleta", "1"))};
${cambiaA("")}
set local session_replication_role = replica;
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, persona_id) values ('Fondo de prueba ADR-0588', 'fondo', '1413', (select persona_id from retail.colaboradores where persona_id is not null limit 1)) returning id as fondo \\gset
insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, medio_pago, cuenta_dinero_id) values (:'tru', 'suministros', 'Del fondo', '2026-09-20', 40, 'efectivo', :'fondo') returning id as del_fondo \\gset
insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, medio_pago) values (:'tru', 'viaje_compra', 'Pasaje', '2026-09-20', 40, 'yape') returning id as viaje \\gset
set local session_replication_role = origin;
${cambiaA(FELIPE)}
${agregar(`:'del_fondo'`, papel("boleta", "2"))};
${agregar(`:'viaje'`, papel("boleta", "3"))};
${cambiaA("")}
set local session_replication_role = replica;
insert into retail.periodos (mes, alcance, ubicacion_id, estado, cierre_id) values ('2026-09-01', 'ubicacion', :'tru', 'cerrado', gen_random_uuid());
set local session_replication_role = origin;
${cambiaA(FELIPE)}
${agregar(`:'g'`, papel("factura", "4", ", 'fecha_emision', '2026-10-02'"))};`);
  const [anulado, fondo, viaje, cerrado] = lineas(r);
  esperar("un gasto anulado no recibe comprobante", r.ok && anulado.includes("anulado"), r);
  esperar("uno pagado desde un fondo va en la rendición", r.ok && fondo.includes("rendición"), r);
  esperar("uno del viaje va en Compras", r.ok && viaje.includes("viaje de compra"), r);
  esperar("con el mes del gasto cerrado no se puede (aunque el papel sea de octubre), y lo dice para qué", r.ok && cerrado.includes("cerrado") && cerrado.includes("para agregarle su comprobante"), r);
}

// 6. Las marcas: sin la de este gasto no se cambia el comprobante ni la cuenta; con ella, nada más que el pago.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'suministros', 'Útiles', '2026-09-20', 236, null, 'yape') as g \\gset
select retail.registrar_gasto(:'tru', 'suministros', 'Cajas', '2026-09-21', 118, ${papel("factura", "500", ", 'condicion', 'contado'")}, 'yape') as conpapel \\gset
select compra_id as comp from retail.gastos where id = :'conpapel' \\gset
${cambiaA("")}
select pg_temp.intento(format('update retail.gastos set compra_id = %L, medio_pago = null, cuenta_dinero_id = null where id = %L', :'comp', :'g'));
select set_config('retail.gastos_comprobante_tardio', :'g', true);
select pg_temp.intento(format('update retail.gastos set categoria = %L where id = %L', 'bolsas', :'g'));
select pg_temp.intento(format('update retail.gastos set cuenta_dinero_id = null where id = %L', :'g'));
select set_config('retail.gastos_comprobante_tardio', '', true);
select pg_temp.intento(format('update retail.gastos set cuenta_dinero_id = null where id = %L', :'g'));`);
  const [sinMarca, , cambiaOtro, sinComprobante, , cuentaSinMarca] = lineas(r);
  esperar("sin la marca, un gasto no recibe un comprobante a mano", r.ok && sinMarca.includes("solo cambia para anularse"), r);
  esperar("con la marca, la categoría no cambia", r.ok && cambiaOtro.includes("solo pasa su pago al comprobante"), r);
  esperar("con la marca, soltar la cuenta sin comprobante no se puede", r.ok && sinComprobante !== "SIN_ERROR", r);
  esperar("sin la marca, la cuenta de un gasto no cambia", r.ok && cuentaSinMarca !== "SIN_ERROR", r);
}

// 7. Permisos por tienda.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'lim', 'suministros', 'Útiles de Lima', '2026-09-20', 236, null, 'yape') as lima \\gset
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'gastos') on conflict do nothing;
${cambiaA(MICAELA)}
${agregar(`:'lima'`, papel("boleta", "1"))};`);
  const [otraTienda] = lineas(r);
  esperar("con el módulo, no cambia un gasto de otra tienda", r.ok && otraTienda.includes("No puedes cambiar"), r);
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} ${fallos === 1 ? "falla" : "fallas"}.`);
process.exit(fallos === 0 ? 0 : 1);

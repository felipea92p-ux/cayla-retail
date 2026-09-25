#!/usr/bin/env node
/**
 * Prueba de ADR-0195 F7 — el Balance (`20260925170000_finanzas_balance.sql`).
 *
 * QUÉ CUBRE
 *   · Saldos de arranque: se proponen con lo que el sistema ya sabe; se registran UNA vez; tienen que cuadrar (el capital
 *     se escribe, no se calcula); una corrección es una fila nueva con motivo; no se editan ni se borran; la fecha no
 *     cambia.
 *   · El diario suma lo que el Balance necesitaba: plata del dueño (aporte, préstamo, retiro, devolución), abono del POS
 *     con su comisión, traslado del cierre al banco y faltante al cerrar; y lo que se le devuelve a una clienta con
 *     tarjeta sale por el POS (105), no por la tarjeta de crédito de CAYLA (451).
 *   · El Balance a una fecha cuadra con saldos de arranque y operaciones de cada tipo, línea por línea (números a mano),
 *     y las utilidades del mes anterior pasan a «acumuladas».
 *   · La comprobación: cada cuenta por dos caminos. Plata «sin cuenta» cuadra con nota; un egreso sin clasificar, una
 *     factura con fecha anterior al arranque, un descuadre del diario y prendas de Producción NO cuadran: el Balance no
 *     se dibuja y se dice por qué y por cuánto. El IGV contra Impuestos se muestra sin bloquear.
 *   · Lo que es de la tienda: su caja, su mercadería, sus muebles, su parte de las facturas, lo invertido y cuánto rinde.
 *   · Permisos: el líder ve todo; con «Reportes financieros», su tienda y nada más; sin él, nada; nadie lee la tabla.
 *
 * LA ESCENA vive en MARZO Y ABRIL DE 2024 (la base local no tiene datos de nadie ahí) con una prenda de prueba propia:
 * todo lo que ya existía en la base queda dentro de los saldos de arranque (se registran con la propuesta del sistema),
 * así que los números de abajo son los de la escena y están calculados a mano.
 *
 * CÓMO. Igual que `estado_resultados.mjs`: cada escena en su transacción con ROLLBACK (la base la comparten otras
 * sesiones), sesión simulada con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:balance    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
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
const conModulo = (m) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${m}');\n`;

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
/** Cada verificación sale como una línea `caso|t`. Se exige que estén TODAS y en verdadero. */
function verificar(titulo, r, esperados) {
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  const lineas = new Map(
    r.salida
      .split("\n")
      .filter((l) => l.includes("|"))
      .map((l) => {
        const i = l.lastIndexOf("|");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
  for (const caso of esperados)
    esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-900) });
}
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

const AYUDANTES = `
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
create temp table k (n text primary key, id uuid not null default gen_random_uuid());
create function pg_temp.k(p text) returns uuid language sql as $f$
  insert into k (n) values (p) on conflict (n) do update set n = excluded.n returning id
$f$;
-- Un movimiento de inventario con su fecha, aplicado al stock como lo hace el sistema (fn_aplicar_movimiento).
create function pg_temp.mov(p_n text, p_var uuid, p_ubic uuid, p_tipo text, p_cant int, p_motivo text, p_cuando timestamptz,
                            p_venta_item uuid default null, p_compra_item uuid default null) returns uuid language plpgsql as $f$
begin
  insert into retail.movimientos (id, variante_id, ubicacion_id, tipo, cantidad, motivo, created_at, venta_item_id, compra_item_id)
  values (pg_temp.k(p_n), p_var, p_ubic, p_tipo, p_cant, p_motivo, p_cuando, p_venta_item, p_compra_item);
  perform retail.fn_aplicar_movimiento(pg_temp.k(p_n));
  return pg_temp.k(p_n);
end $f$;
-- Una entrada que cambia el costo promedio (lo que hace fn_recalcular_costo_variante, pero con la fecha de la escena).
create function pg_temp.entrada_con_costo(p_n text, p_var uuid, p_ubic uuid, p_cant int, p_costo numeric, p_motivo text, p_cuando timestamptz,
                                          p_compra_item uuid default null) returns void language plpgsql as $f$
declare v_sp int; v_ant numeric; v_res numeric;
begin
  select coalesce(sum(cantidad), 0) into v_sp from retail.stock where variante_id = p_var;
  select costo into v_ant from retail.variantes where id = p_var;
  v_res := case when v_sp = 0 then p_costo else round((v_sp * v_ant + p_cant * p_costo) / (v_sp + p_cant), 2) end;
  insert into retail.movimientos (id, variante_id, ubicacion_id, tipo, cantidad, motivo, created_at, compra_item_id)
  values (pg_temp.k(p_n), p_var, p_ubic, 'entrada', p_cant, p_motivo, p_cuando, p_compra_item);
  insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
  values (p_var, v_sp, v_ant, p_cant, p_costo, v_res, case when p_motivo = 'produccion' then 'produccion' else 'compra' end, pg_temp.k(p_n), p_cuando);
  update retail.variantes set costo = v_res where id = p_var;
  perform retail.fn_aplicar_movimiento(pg_temp.k(p_n));
end $f$;
-- Una venta de una línea, en una caja, con sus cobros [{m, v}] y la salida de su prenda.
create function pg_temp.vender(p_n text, p_ubic uuid, p_caja uuid, p_cuando timestamptz, p_var uuid, p_cant int, p_precio numeric,
                               p_costo numeric, p_pagos jsonb) returns void language plpgsql as $f$
declare x jsonb;
begin
  insert into retail.ventas (id, ubicacion_id, caja_id, estado, created_at) values (pg_temp.k(p_n), p_ubic, p_caja, 'completada', p_cuando);
  insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (pg_temp.k(p_n || 'i'), pg_temp.k(p_n), p_var, p_cant, p_precio, 0, p_costo);
  for x in select * from jsonb_array_elements(p_pagos) loop
    insert into retail.venta_pagos (venta_id, metodo, monto) values (pg_temp.k(p_n), x ->> 'm', (x ->> 'v')::numeric);
  end loop;
  perform pg_temp.mov(p_n || 'm', p_var, p_ubic, 'salida', p_cant, 'venta', p_cuando, pg_temp.k(p_n || 'i'));
end $f$;
-- Una caja ya cerrada, con sus números (como la deja cerrar_caja).
create function pg_temp.caja(p_n text, p_ubic uuid, p_abre timestamptz, p_cierra timestamptz, p_apertura numeric, p_esperada numeric,
                             p_sistema numeric, p_real numeric, p_fondo numeric) returns uuid language sql as $f$
  insert into retail.cajas (id, ubicacion_id, estado, monto_apertura, monto_apertura_esperado, abierta_en, cerrada_en,
                            monto_cierre_sistema, monto_cierre_real, diferencia, monto_fondo, motivo_diferencia_apertura)
  values (pg_temp.k(p_n), p_ubic, 'cerrada', p_apertura, p_esperada, p_abre, p_cierra, p_sistema, p_real, p_real - p_sistema, p_fondo,
          case when p_esperada is not null and p_apertura <> p_esperada then 'prueba F7' end)
  returning id
$f$;
`;

// ============================================================================================================================
// LA ESCENA (hora de Lima, precios CON IGV al 18 %). TRU = Tienda Trujillo, LIM = Tienda Lima. Prenda P1 cuesta 40 y se
// vende a 100; P2 cuesta 100. Cuentas nuevas desde el 1-mar-2024: BCP (saldo 5,000), POS y Visa en cero.
//   Antes del arranque: P1 entra 10 u a 40 (el 10-feb) y la caja de TRU cierra el 28-feb dejando S/ 150.
//   ARRANQUE el 1-mar-2024 con la propuesta del sistema + IGV por pagar 300, préstamo del dueño 2,000, utilidades 1,000 y
//   el capital que falta para que cuadre (lo pone la prueba, como lo pondría el contador).
//   Marzo:
//     5-mar  caja de TRU: abre con 150; V1 2 × P1 en efectivo 200, V2 1 × P1 con tarjeta 100, V3 1 × P1 por Yape 100;
//            mototaxi 20 del cajón (gasto); se esperaban 330, se cuentan 325 (faltan 5); 200 al banco; quedan 125.
//     2-mar  factura de P2 (10 u × 100 = 1,000 + IGV 180) a crédito, toda para TRU; el 3 llegan 6.
//     8-mar  mostrador para TRU, 1,200 por transferencia, 5 años (deprecia 20 al mes desde abril).
//    10-mar  el POS abona 97 al BCP y se queda 3 de comisión (gasto de la empresa, 639).
//    12-mar  el dueño aporta 1,000 y presta 500 al BCP.
//    15-mar  merma de 1 P1 en TRU (40) · internet de la empresa 300 por transferencia (sin cuenta: la empresa no tiene
//            banco de transferencias configurado).
//    18-mar  separación en LIM: adelanto 118 por Yape (100 + IGV 18); su caja abre y cierra en cero.
//    20-mar  se pagan 500 de la factura de P2 por transferencia.
//    25-mar  retiro de utilidades 300 · 26-mar  se le devuelven 200 del préstamo al dueño.
// ============================================================================================================================
const ESCENA = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
insert into retail.productos (id, referencia, marca_id, proveedor_id) values (pg_temp.k('PROD'), 'F7-BALANCE-1', :'marca', :'prov'), (pg_temp.k('PROD2'), 'F7-BALANCE-2', :'marca', :'prov');
insert into retail.variantes (id, producto_id, precio, costo) values (pg_temp.k('P1'), pg_temp.k('PROD'), 100, 40);
insert into retail.variantes (id, producto_id, precio, costo) values (pg_temp.k('P2'), pg_temp.k('PROD2'), 150, 100);
select pg_temp.k('P1') as p1 \\gset
select pg_temp.k('P2') as p2 \\gset

-- Cuentas y a dónde entra cada cobro (desde enero: la primera configuración vale para todo lo anterior).
select retail.crear_cuenta_dinero('BCP prueba F7', 'banco', 5000, '2024-03-01') as bcp \\gset
select retail.crear_cuenta_dinero('Niubiz prueba F7', 'por_abonar', 0, '2024-03-01') as pos \\gset
select retail.crear_cuenta_dinero('Visa prueba F7', 'tarjeta_credito', 0, '2024-03-01') as visa \\gset
insert into retail.medios_de_cobro (ubicacion_id, medio, cuenta_id, vigente_desde) values
  (:'tru', 'yape', :'bcp', '2024-01-01'), (:'tru', 'tarjeta', :'pos', '2024-01-01'), (:'tru', 'transferencia', :'bcp', '2024-01-01'),
  (:'lim', 'yape', :'bcp', '2024-01-01');

-- Antes del arranque.
select pg_temp.entrada_con_costo('E0', :'p1', :'tru', 10, 40, 'recepcion', '2024-02-10 10:00-05');
select pg_temp.caja('C0', :'tru', '2024-02-28 09:00-05', '2024-02-28 20:00-05', 150, null, 150, 150, 150);

-- EL ARRANQUE: la propuesta del sistema para el 1-mar + lo que dice el contador; el capital, lo que falta para cuadrar.
create temp table prop as select * from retail.fn_saldos_iniciales_propuesta('2024-03-01');
create temp table prop_sis as select * from prop where origen = 'sistema';
select (select jsonb_agg(jsonb_build_object('cuenta', cuenta, 'monto', monto, 'origen', 'sistema')) from prop_sis)
    || jsonb_build_array(
         jsonb_build_object('cuenta', '4011', 'monto', 300), jsonb_build_object('cuenta', '47', 'monto', 2000),
         jsonb_build_object('cuenta', '591', 'monto', 1000),
         jsonb_build_object('cuenta', '50', 'monto',
           (select sum(case when tipo = 'activo' and cuenta not like '39%' then monto when cuenta like '39%' then -monto
                            when tipo = 'pasivo' then -monto else 0 end) from prop_sis) - 300 - 2000 - 1000)) as lineas \\gset
select retail.registrar_saldo_inicial('2024-03-01', :'lineas'::jsonb) as filas_arranque \\gset
-- Para comparar después: lo que valía la mercadería al arrancar (todo lo que ya había en la base, más la P1 de febrero).
select monto as m201_0 from prop where cuenta = '201' \\gset

-- Marzo. La factura de P2: 10 u para TRU; llegan 6 el 3.
insert into retail.compras (id, proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
values (pg_temp.k('CM1'), :'prov', 'factura', 'F7M', '1', '2024-03-02', 'credito', '2024-04-02', 1000, 180, 1180, 'mercaderia', :'tru');
insert into retail.compra_items (id, compra_id, producto_id, variante_id, cantidad, costo_unitario) values (pg_temp.k('CM1i'), pg_temp.k('CM1'), pg_temp.k('PROD2'), :'p2', 10, 100);
insert into retail.compra_item_destinos (compra_item_id, ubicacion_id, cantidad) values (pg_temp.k('CM1i'), :'tru', 10);
select pg_temp.entrada_con_costo('R1', :'p2', :'tru', 6, 100, 'recepcion', '2024-03-03 11:00-05', pg_temp.k('CM1i'));

-- La caja del 5 en TRU.
select pg_temp.caja('C1', :'tru', '2024-03-05 09:00-05', '2024-03-05 20:00-05', 150, 150, 330, 325, 125) as c1 \\gset
select pg_temp.vender('V1', :'tru', :'c1', '2024-03-05 10:00-05', :'p1', 2, 100, 40, '[{"m":"efectivo","v":200}]');
select pg_temp.vender('V2', :'tru', :'c1', '2024-03-05 11:00-05', :'p1', 1, 100, 40, '[{"m":"tarjeta","v":100}]');
select pg_temp.vender('V3', :'tru', :'c1', '2024-03-05 12:00-05', :'p1', 1, 100, 40, '[{"m":"yape","v":100}]');
insert into retail.caja_movimientos (id, caja_id, tipo, monto, motivo, created_at) values (pg_temp.k('EG1'), :'c1', 'egreso', 20, 'Movilidad', '2024-03-05 13:00-05');
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, caja_movimiento_id)
values (pg_temp.k('G1'), :'tru', 'transporte', 'Mototaxi F7', '2024-03-05', 20, 0, 'efectivo', pg_temp.k('EG1'));
insert into retail.caja_traslados (id, caja_id, destino, monto, creado_en) values (pg_temp.k('T1'), :'c1', 'banco', 200, '2024-03-05 20:00-05');

-- El mostrador, la merma y el internet.
insert into retail.activos_fijos (id, ubicacion_id, tipo, nombre, cuenta_codigo, costo, vida_util_meses, tasa_anual, fecha_adquisicion, medio_pago, estado)
values (pg_temp.k('A1'), :'tru', 'muebles', 'Mostrador F7', '335', 1200, 60, 0.20, '2024-03-08', 'transferencia', 'activo');
select pg_temp.mov('M1', :'p1', :'tru', 'ajuste', -1, 'merma', '2024-03-15 12:00-05');
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago)
values (pg_temp.k('G2'), null, 'servicios_basicos', 'Internet oficina F7', '2024-03-15', 300, 0, 'transferencia');

-- La plata que cambia de lugar y la del dueño (con la MISMA función de Cuentas y dinero).
select retail.registrar_movimiento_dinero('abono_tarjeta', 97, :'pos', :'bcp', '2024-03-10', 'Lote 1', 3) as abono \\gset
select retail.registrar_movimiento_dinero('aporte', 1000, null, :'bcp', '2024-03-12', 'Aporte F7') as aporte \\gset
select retail.registrar_movimiento_dinero('prestamo', 500, null, :'bcp', '2024-03-12', 'Préstamo F7') as prestamo \\gset
select retail.registrar_movimiento_dinero('retiro', 300, :'bcp', null, '2024-03-25', 'Retiro F7') as retiro \\gset
select retail.registrar_movimiento_dinero('devolucion_prestamo', 200, :'bcp', null, '2024-03-26', 'Devolución F7') as devolucion \\gset

-- La separación de LIM (su caja abre y cierra en cero).
select pg_temp.caja('C2', :'lim', '2024-03-18 09:00-05', '2024-03-18 20:00-05', 0, null, 0, 0, 0) as c2 \\gset
select p.id as felipe from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
insert into retail.separaciones (id, codigo, ubicacion_id, caja_id, clienta_nombres, clienta_apellidos, clienta_celular, comprobante_tipo,
       creado_por, total, adelanto, vence_el, devolucion_medio, devolucion_numero, estado, created_at)
values (pg_temp.k('SEP1'), 'F7-' || left(pg_temp.k('SEP1')::text, 8), :'lim', :'c2', 'Ana', 'Prueba', '999888777', 'boleta',
        :'felipe', 236, 118, '2024-04-18', 'yape', '999888777', 'abierta', '2024-03-18 10:00-05');
insert into retail.separacion_pagos (separacion_id, metodo, monto, created_at) values (pg_temp.k('SEP1'), 'yape', 118, '2024-03-18 10:00-05');

-- El pago de la factura.
insert into retail.compra_pagos (id, compra_id, fecha, monto, metodo, ubicacion_id) values (pg_temp.k('PG1'), pg_temp.k('CM1'), '2024-03-20', 500, 'transferencia', :'tru');
`;

// El Balance del 31-mar-2024 (a mano):
//   Caja 101 = 150 + 200 (V1) − 20 (mototaxi) − 5 (faltante) − 200 (al banco) = 125 = el fondo que dejó la caja.
//   Bancos 104 = 5,000 + 100 (Yape) + 200 (cierre) + 97 (abono) + 1,000 + 500 − 300 − 200 − 500 (factura) − 1,200 (mostrador)
//                − 300 (internet) + 118 (adelanto) = 4,515. Cuentas y dinero dice 4,815: el internet no dice de qué cuenta
//                salió (sin cuenta) → cuadra con nota.
//   POS 105 = 100 − 97 − 3 = 0 · Mercaderías 201 = lo del arranque + 1,000 (factura) − 160 (4 × 40 vendidas) − 40 (merma)
//   = arranque + 800; por el otro camino: P1 5 × 40 + P2 6 × 100 + 4 por recibir × 100 = lo mismo.
//   Mostrador 1,200 (sin depreciar en marzo) · IGV por pagar = 300 + 61.01 (ventas) + 18 (adelanto) − 180 (factura) = 199.01
//   Facturas 421 = 1,180 − 500 = 680 · Adelantos 122 = 100 · Préstamo del dueño 47 = 2,000 + 500 − 200 = 2,300 ·
//   Aportes 52 = 1,000 · Utilidades acumuladas 591 = 1,000 − 300 (retiro) = 700.
//   Resultado de marzo: TRU 338.99 de ventas − 160 − 40 − 20 − 5 = 113.99; empresa − 300 − 3 = −303 → CAYLA −189.01.
const CASOS_MARZO = `
create temp table bal as select * from retail.fn_balance_general('2024-03-31');
create temp table con as select * from retail.fn_conciliacion_contable('2024-03-31');
create temp table dia as select * from retail.fn_asientos('2024-03-01', '2024-03-31');
select 'A1 el arranque quedó registrado (una fila por cuenta) y cuadra', (select :filas_arranque >= 8) and (select estado = 'ok' from con where clave = 'arranque' and orden = 1);
select 'A2 la propuesta traía la caja de TRU (150, el fondo del 28-feb) y el BCP (5,000, su saldo inicial)', (select monto = 150 from prop where cuenta = '101') and (select monto = 5000 from prop where cuenta = '104');
select 'A3 la propuesta marca qué calcula el sistema y qué escribe el líder (capital y utilidades, a mano)', (select origen = 'sistema' from prop where cuenta = '201') and (select bool_and(origen = 'manual') from prop where cuenta in ('50', '591', '4011'));
select 'B1 Caja 101 = 125 (el fondo que dejó la caja)', (select monto = 125 from bal where cuenta = '101');
select 'B2 Bancos 104 = 4,515', (select monto = 4515 from bal where cuenta = '104');
select 'B3 Tarjeta por abonar 105 = 0 (el abono y la comisión la vaciaron)', (select coalesce(sum(monto), 0) = 0 from bal where cuenta = '105');
select 'B4 Mercaderías 201 = lo del arranque + 800', (select monto = :m201_0 + 800 from bal where cuenta = '201');
select 'B5 la 201 dice cuánto está facturado por recibir (400)', (select (detalle ->> 'por_recibir')::numeric = 400 from bal where cuenta = '201');
select 'B6 Muebles 335 = 1,200 y sin depreciación en marzo', (select monto = 1200 from bal where cuenta = '335') and not exists (select 1 from bal where cuenta = '391' and monto <> 0);
select 'B7 IGV por pagar 4011 = 199.01', (select monto = 199.01 and seccion = 'pasivo' from bal where cuenta = '4011');
select 'B8 Facturas por pagar 421 = 680', (select monto = 680 from bal where cuenta = '421');
select 'B9 Adelantos de clientas 122 = 100', (select monto = 100 from bal where cuenta = '122');
select 'B10 Préstamo del dueño 47 = 2,300 (lo de antes + 500 − 200)', (select monto = 2300 from bal where cuenta = '47');
select 'B11 Aportes 52 = 1,000', (select monto = 1000 from bal where cuenta = '52');
select 'B12 Utilidades acumuladas 591 = 700 (1,000 − el retiro)', (select monto = 700 from bal where cuenta = '591');
select 'B13 Resultado de marzo = −189.01 (TRU 113.99, la empresa −303)', (select monto = -189.01 from bal where cuenta = 'resultado_mes');
select 'B14 lo que tiene = lo que debe + lo tuyo',
  (select sum(monto) filter (where seccion = 'activo') = sum(monto) filter (where seccion in ('pasivo', 'patrimonio')) from bal);
select 'C1 la comprobación: el diario cuadra, la ecuación y la caja, sin bloquear', (select bool_and(estado = 'ok') from con where clave in ('diario', 'ecuacion', '101'));
select 'C2 bancos cuadra con NOTA: 300 que todavía no dicen a qué cuenta fueron', (select estado = 'nota' and diferencia = -300 and diario = 4515 and otro = 4815 from con where clave = '104')
  and (select (causas -> 0 ->> 'clave') = 'sin_cuenta' and (causas -> 0 ->> 'monto')::numeric = -300 from con where clave = '104');
select 'C3 mercaderías, activos, facturas y adelantos: los dos caminos dan lo mismo', (select bool_and(estado = 'ok') from con where clave in ('201', '33', '421', '122'));
select 'C4 el IGV contra Impuestos se muestra para revisar y no bloquea', (select estado = 'revisar' and not bloquea from con where clave = '4011');
select 'C5 nada bloquea: el Balance se dibuja', (select count(*) = 0 from con where bloquea and estado in ('no_cuadra', 'falta'));
select 'D1 aporte: 104 contra 52 · préstamo: 104 contra 47', (select sum(debe) filter (where cuenta = '104') = 1000 and sum(haber) filter (where cuenta = '52') = 1000 from dia where origen_id = :'aporte')
  and (select sum(haber) filter (where cuenta = '47') = 500 from dia where origen_id = :'prestamo');
select 'D2 retiro: 591 contra 104 · devolución de préstamo: 47 contra 104', (select sum(debe) filter (where cuenta = '591') = 300 and sum(haber) filter (where cuenta = '104') = 300 from dia where origen_id = :'retiro')
  and (select sum(debe) filter (where cuenta = '47') = 200 from dia where origen_id = :'devolucion');
select 'D3 abono del POS: 104 = 97 contra 105; la comisión (639) sale de la 105', (select sum(debe) filter (where cuenta = '104') = 97 and sum(haber) filter (where cuenta = '105') = 97 from dia where origen_id = :'abono')
  and (select sum(haber) filter (where cuenta = '105') = 3 and sum(debe) filter (where cuenta = '639') = 3 from dia where regla = 'gasto' and cuenta in ('105', '639'));
select 'D4 el traslado del cierre al banco: 104 contra 101', (select sum(debe) filter (where cuenta = '104') = 200 and sum(haber) filter (where cuenta = '101') = 200 from dia where regla = 'traslado_banco');
select 'D5 el faltante de 5 al cerrar: 6599 contra 101, en TRU', (select sum(debe) filter (where cuenta = '6599') = 5 and sum(haber) filter (where cuenta = '101') = 5 and bool_and(ubicacion_id = :'tru') from dia where regla = 'diferencia_caja');
select 'D6 el Estado de resultados de TRU suma el faltante (gastos 25 = mototaxi 20 + faltante 5) y da 113.99', (select gastos_operacion = 25 and resultado = 113.99 from retail.fn_estado_resultados('2024-03-01', '2024-03-31') where ubicacion_id = :'tru');
select 'D7 cada asiento nuevo cuadra', (select count(*) = 0 from retail.fn_asientos_descuadrados('2024-03-01', '2024-03-31'));
`;

// Abril: el mostrador deprecia 20; marzo pasa a «acumuladas».
const CASOS_ABRIL = `
create temp table bal as select * from retail.fn_balance_general('2024-04-30');
create temp table con as select * from retail.fn_conciliacion_contable('2024-04-30');
select 'E1 abril: depreciación acumulada 391 = −20 dentro de lo que tiene', (select monto = -20 and seccion = 'activo' from bal where cuenta = '391');
select 'E2 abril: el resultado del mes es la depreciación (−20)', (select monto = -20 from bal where cuenta = 'resultado_mes');
select 'E3 abril: marzo pasó a utilidades acumuladas (700 − 189.01 = 510.99)', (select monto = 510.99 from bal where cuenta = '591');
select 'E4 abril: todo cuadra y los activos dan lo mismo por los dos caminos', (select count(*) = 0 from con where bloquea and estado in ('no_cuadra', 'falta')) and (select diario = 1180 and estado = 'ok' from con where clave = '33');
select 'E5 abril: lo que tiene = lo que debe + lo tuyo', (select sum(monto) filter (where seccion = 'activo') = sum(monto) filter (where seccion in ('pasivo', 'patrimonio')) from bal);
select 'E6 el último día antes del arranque: el Balance son los saldos de arranque, sin diario', (select count(*) > 0 from retail.fn_balance_general('2024-02-29'))
  and (select bool_and(estado <> 'no_cuadra') from retail.fn_conciliacion_contable('2024-02-29'));
select 'E7 antes de eso no hay Balance: la comprobación dice que falta y no dibuja nada', (select count(*) = 1 and bool_and(estado = 'falta' and bloquea and clave = 'corte') from retail.fn_conciliacion_contable('2024-02-15'))
  and (select count(*) = 0 from retail.fn_balance_general('2024-02-15'));
`;

// Lo que es de la tienda (31-mar contra el día antes del arranque, para aislar la escena de lo que ya había).
//   TRU: caja 150 → 125; mercadería −200 (P1: 10 → 5 u × 40) + 600 (P2) = +400; mostrador 1,200; su parte de la factura 680.
//   Invertido: −25 + 400 + 1,200 − 680 = +895. Utilidad de marzo 113.99, ventas 338.99.
const CASOS_TIENDA = `
create temp table t0 as select * from retail.fn_balance_por_tienda('2024-02-29');
create temp table t1 as select * from retail.fn_balance_por_tienda('2024-03-31');
select 'T1 TRU: cajón y caja fuerte 150 → 125', (select caja = 150 from t0 where ubicacion_id = :'tru') and (select caja = 125 and caja_visible from t1 where ubicacion_id = :'tru');
select 'T2 TRU: su mercadería sube 400 (vendió 5 de P1 y le llegaron 6 de P2)', (select t1.mercaderia - t0.mercaderia = 400 from t0, t1 where t0.ubicacion_id = :'tru' and t1.ubicacion_id = :'tru');
select 'T3 TRU: sus muebles 1,200 y su parte de la factura 680', (select activos_fijos = 1200 and facturas_por_pagar = 680 from t1 where ubicacion_id = :'tru');
select 'T4 TRU: lo invertido sube 895', (select t1.invertido - t0.invertido = 895 from t0, t1 where t0.ubicacion_id = :'tru' and t1.ubicacion_id = :'tru');
select 'T5 TRU: utilidad de marzo 113.99 sobre ventas de 338.99, y rinde = utilidad ÷ invertido', (select utilidad_mes = 113.99 and ventas_mes = 338.99 and rinde = round(113.99 / invertido, 4) from t1 where ubicacion_id = :'tru');
select 'T6 el banco, el capital y el IGV no se reparten: LIM no tiene el Yape de su adelanto ni la deuda de TRU', (select caja = 0 and facturas_por_pagar = 0 from t1 where ubicacion_id = :'lim');
select 'T7 el Taller aparece como unidad, sin «rinde» (no vende)', (select rinde is null from t1 where tipo = 'taller');
select 'T8 fn_balance_general(corte, TRU) dice lo mismo en líneas', (select sum(monto) filter (where seccion = 'activo') - sum(monto) filter (where seccion = 'pasivo') from retail.fn_balance_general('2024-03-31', :'tru'))
  = (select invertido from t1 where ubicacion_id = :'tru');
`;

// Una caja más en TRU el 25-mar con un egreso que nadie clasificó: la caja real tiene 15 menos; el diario no sabe qué fue.
const CASOS_SIN_CLASIFICAR = `
select pg_temp.caja('C3', :'tru', '2024-03-25 09:00-05', '2024-03-25 20:00-05', 125, 125, 110, 110, 110) as c3 \\gset
insert into retail.caja_movimientos (caja_id, tipo, monto, motivo, created_at) values (:'c3', 'egreso', 15, 'Varios', '2024-03-25 12:00-05');
create temp table con as select * from retail.fn_conciliacion_contable('2024-03-31');
select 'N1 un egreso sin clasificar: la caja NO cuadra (diario 125, cajas 110) y bloquea', (select estado = 'no_cuadra' and bloquea and diario = 125 and otro = 110 and diferencia = 15 from con where clave = '101');
select 'N1 y dice por qué: «egresos de caja sin clasificar» por 15', (select (causas -> 0 ->> 'clave') = 'sin_clasificar' and (causas -> 0 ->> 'monto')::numeric = 15 from con where clave = '101');
select 'N1 el diario y la ecuación siguen bien (el problema es lo que falta registrar)', (select bool_and(estado = 'ok') from con where clave in ('diario', 'ecuacion'));
`;

// Una factura de mercadería con fecha de FEBRERO registrada en marzo: cambió lo que había al arrancar.
const CASOS_ANTES = `
insert into retail.compras (id, proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
values (pg_temp.k('CM0'), :'prov', 'factura', 'F7M', '0', '2024-02-20', 'credito', '2024-03-20', 200, 36, 236, 'mercaderia', :'tru');
create temp table con as select * from retail.fn_conciliacion_contable('2024-03-31');
select 'N2 una factura con fecha anterior al arranque: facturas por pagar NO cuadra (680 contra 916)', (select estado = 'no_cuadra' and diario = 680 and otro = 916 from con where clave = '421');
select 'N2 y lo explica entero: «cambió lo que había al arrancar» por −236', (select jsonb_array_length(causas) = 1 and (causas -> 0 ->> 'clave') = 'antes_del_arranque' and (causas -> 0 ->> 'monto')::numeric = -236 from con where clave = '421');
select 'N2 la corrección sin motivo no pasa', (select pg_temp.intento($$select retail.registrar_saldo_inicial('2024-03-01', '[{"cuenta":"421","monto":236},{"cuenta":"591","monto":764}]'::jsonb)$$) like '%motivo%');
select 'N2 la corrección que no cuadra no pasa', (select pg_temp.intento($$select retail.registrar_saldo_inicial('2024-03-01', '[{"cuenta":"421","monto":236}]'::jsonb, 'Factura de febrero registrada tarde')$$) like '%no cuadran%');
select 'N2 la fecha del arranque no cambia', (select pg_temp.intento($$select retail.registrar_saldo_inicial('2024-02-01', '[{"cuenta":"591","monto":1}]'::jsonb, 'Cambio de fecha de prueba')$$) like '%no cambia%');
select retail.registrar_saldo_inicial('2024-03-01', '[{"cuenta":"421","monto":236},{"cuenta":"591","monto":764}]'::jsonb, 'Factura de febrero registrada tarde') as corregidas \\gset
select 'N2 con la corrección (421 + 236, utilidades − 236, con motivo) vuelve a cuadrar', :corregidas = 2 and (select estado = 'ok' from retail.fn_conciliacion_contable('2024-03-31') where clave = '421');
select 'N2 la fila reemplazada queda a la vista, no vigente, y la nueva lleva su motivo',
  (select count(*) filter (where not vigente) = 2 and count(*) filter (where vigente and motivo = 'Factura de febrero registrada tarde') = 2 from retail.fn_saldos_iniciales() where cuenta in ('421', '591'));
select 'N2 un saldo de arranque no se edita ni se borra', (select pg_temp.intento($$update retail.saldos_iniciales set debe = 1 where cuenta = '50'$$) like '%no se edita%')
  and (select pg_temp.intento($$delete from retail.saldos_iniciales where cuenta = '50'$$) like '%no se edita%');
`;

// El diario se descuadra (un cobro que no suma lo vendido) y entran prendas por Producción.
const CASOS_DESCUADRE = `
update retail.venta_pagos set monto = 190 where venta_id = pg_temp.k('V1');
select pg_temp.entrada_con_costo('PR1', :'p1', :'tru', 3, 40, 'produccion', '2024-03-22 12:00-05');
create temp table con as select * from retail.fn_conciliacion_contable('2024-03-31');
select 'N3 un asiento descuadrado: «el diario cuadra» NO, con el asiento y la diferencia (−10)', (select estado = 'no_cuadra' and bloquea and diferencia = -10 and jsonb_array_length(causas) = 1 from con where clave = 'diario');
select 'N5 prendas de Producción: la mercadería NO cuadra y lo explica (−120: 3 × 40)', (select estado = 'no_cuadra' and diferencia = -120 from con where clave = '201')
  and (select (causas -> 0 ->> 'clave') = 'produccion' and (causas -> 0 ->> 'monto')::numeric = -120 from con where clave = '201');
`;

// El arranque tiene que cuadrar, y se registra una sola vez (en una base sin arranque: la escena se arma sin registrarlo).
const CASOS_ARRANQUE = `
select 'N4 sin arranque la comprobación dice que falta y el Balance no se dibuja', (select count(*) = 1 and bool_and(clave = 'arranque' and estado = 'falta') from retail.fn_conciliacion_contable('2024-03-31'))
  and (select count(*) = 0 from retail.fn_balance_general('2024-03-31'));
select 'N4 un arranque que no cuadra no se registra (el capital no se calcula)', (select pg_temp.intento($$select retail.registrar_saldo_inicial('2024-03-01', '[{"cuenta":"104","monto":5000},{"cuenta":"50","monto":4999}]'::jsonb)$$) like '%no cuadran%');
select 'N4 una cuenta de resultados no va en un arranque', (select pg_temp.intento($$select retail.registrar_saldo_inicial('2024-03-01', '[{"cuenta":"7011","monto":10},{"cuenta":"104","monto":10}]'::jsonb)$$) like '%no va en un saldo de arranque%');
select retail.registrar_saldo_inicial('2024-03-01', '[{"cuenta":"104","monto":5000},{"cuenta":"50","monto":5000}]'::jsonb) as uno \\gset
select 'N4 el primero se registra; el segundo pide motivo (es una corrección)', :uno = 2
  and (select pg_temp.intento($$select retail.registrar_saldo_inicial('2024-03-01', '[{"cuenta":"104","monto":5000},{"cuenta":"50","monto":5000}]'::jsonb)$$) like '%motivo%');
select 'N4 una corrección que no cambia nada no deja fila', (select retail.registrar_saldo_inicial('2024-03-01', '[{"cuenta":"104","monto":5000}]'::jsonb, 'Nada que cambiar') = 0);
`;

// Permisos: Micaela (Tienda Trujillo).
const CASOS_PERMISOS = `
${cambiaA(MICAELA)}
select 'P1 sin «Reportes financieros» no ve ni lo de su tienda', (select pg_temp.intento($$select * from retail.fn_balance_por_tienda('2024-03-31')$$) like '%Reportes financieros%');
${conModulo("reportes_financieros")}
select 'P2 con el módulo ve SU tienda y nada más', (select count(*) = 1 and bool_and(ubicacion_id = :'tru') from retail.fn_balance_por_tienda('2024-03-31'));
select 'P3 con el módulo ve lo que es de su tienda en líneas', (select count(*) = 4 from retail.fn_balance_general('2024-03-31', :'tru'));
select 'P4 no ve lo de otra tienda', (select pg_temp.intento(format($$select * from retail.fn_balance_general('2024-03-31', %L)$$, :'lim')) like '%esa tienda%');
select 'P5 el Balance de CAYLA entera, la comprobación y los saldos de arranque son del líder',
  (select pg_temp.intento($$select * from retail.fn_balance_general('2024-03-31')$$) like '%líder%')
  and (select pg_temp.intento($$select * from retail.fn_conciliacion_contable('2024-03-31')$$) like '%líder%')
  and (select pg_temp.intento($$select * from retail.fn_saldos_iniciales()$$) like '%líder%')
  and (select pg_temp.intento($$select * from retail.fn_saldos_iniciales_propuesta('2024-03-01')$$) like '%líder%')
  and (select pg_temp.intento($$select retail.registrar_saldo_inicial('2024-03-01', '[{"cuenta":"50","monto":1}]'::jsonb, 'Intento de prueba')$$) like '%líder%');
reset role;
select 'P6 nadie lee la tabla directo ni llama a las piezas internas; anon no llama a nada',
  not has_table_privilege('authenticated', 'retail.saldos_iniciales', 'select')
  and not has_function_privilege('authenticated', 'retail.fn_bal_otro_camino(date)', 'execute')
  and not has_function_privilege('authenticated', 'retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])', 'execute')
  and not has_function_privilege('anon', 'retail.fn_balance_general(date,uuid)', 'execute')
  and not has_function_privilege('anon', 'retail.registrar_saldo_inicial(date,jsonb,text)', 'execute')
  and has_function_privilege('authenticated', 'retail.fn_conciliacion_contable(date)', 'execute');
`;

// Lo que se le devuelve a una clienta con tarjeta sale por el POS (105), no por la tarjeta de crédito de CAYLA (451).
const CASOS_TARJETA = `
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, aprobado_en)
values (pg_temp.k('D1'), pg_temp.k('V2'), :'tru', 'talla', 'aprobada', 100, 'tarjeta', '2024-03-06 10:00-05');
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (pg_temp.k('D1'), pg_temp.k('V2i'), 1, 'vendible');
select 'F1 la devolución con tarjeta sale de la 105 (el POS), no de la 451', (select sum(haber) filter (where cuenta = '105') = 100 and coalesce(sum(haber) filter (where cuenta = '451'), 0) = 0 from retail.fn_asientos('2024-03-01', '2024-03-31') where origen_id = pg_temp.k('D1'));
`;

function main() {
  console.log("F7 · El Balance (saldos de arranque, comprobación y lo que es de cada tienda)\n");
  const base = `${ESCENA}\n`;
  verificar("Marzo", correr(base + CASOS_MARZO), casosDe(CASOS_MARZO));
  verificar("Abril", correr(base + CASOS_ABRIL), casosDe(CASOS_ABRIL));
  verificar("Tienda", correr(base + CASOS_TIENDA), casosDe(CASOS_TIENDA));
  verificar("Sin clasificar", correr(base + CASOS_SIN_CLASIFICAR), casosDe(CASOS_SIN_CLASIFICAR));
  verificar("Antes del arranque", correr(base + CASOS_ANTES), casosDe(CASOS_ANTES));
  verificar("Descuadre y Producción", correr(base + CASOS_DESCUADRE), casosDe(CASOS_DESCUADRE));
  verificar("Permisos", correr(base + CASOS_PERMISOS), casosDe(CASOS_PERMISOS));
  verificar("Tarjeta", correr(base + CASOS_TARJETA), casosDe(CASOS_TARJETA));
  // Sin arranque: la escena sin la parte que lo registra.
  const sinArranque = ESCENA.replace(/-- EL ARRANQUE:[\s\S]*?-- Marzo\./, "-- Marzo.");
  verificar("Arranque", correr(sinArranque + CASOS_ARRANQUE), casosDe(CASOS_ARRANQUE));

  console.log(`\n${casos - fallos}/${casos} casos en verde`);
  if (fallos) process.exit(1);
}
// La escena se reusa para sacar los datos de la comparación visual con el spike; la prueba corre solo si se llama directo.
export { ESCENA, CASOS_SIN_CLASIFICAR, FELIPE, MICAELA, psql };
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

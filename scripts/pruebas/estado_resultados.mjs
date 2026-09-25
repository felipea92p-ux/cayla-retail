#!/usr/bin/env node
/**
 * Prueba de ADR-0195 F5 — el diario derivado, el Estado de resultados y el reporte de campañas
 * (`20260925130000_finanzas_diario_y_estado_de_resultados.sql`). Porta y adapta las verificaciones del PR #170
 * (`estado_resultados_aislado.sql`, `estado_resultados_volumen.sql`) a la base local compartida.
 *
 * QUÉ CUBRE
 *   · el diario cuadra: debe = haber por asiento y en total; un cobro que no suma lo vendido SE AVISA;
 *   · cada regla: venta (efectivo 101, Yape/transferencia 104, tarjeta 105, adelanto 122), anulación (vendible o merma),
 *     devolución (por sus líneas), cambio, mermas (al costo de ESA fecha; qué no es merma), separación (adelanto y su
 *     devolución), gasto con y sin factura, factura de mercadería, nota de crédito de proveedor, pago y reembolso,
 *     activo (alta, depreciación y baja) y planilla de Dynamic;
 *   · la frontera del mes es la medianoche de LIMA; la anulación va en el mes en que se anula; cambiar la tasa de IGV
 *     no mueve un mes pasado;
 *   · el Estado de resultados por tienda, Taller, «de la empresa» y el consolidado (suma exacta);
 *   · permisos: el líder ve todo; con «Reportes financieros», su tienda y nada más; sin él, nada; la planilla, solo quien
 *     la ve en Dynamic;
 *   · campañas: la pasada contra sus días normales (y un día con otra campaña no cuenta como normal), la que viene con su
 *     meta y su margen normal;
 *   · volumen: un año de datos sintéticos (≈ 20 mil tickets) y cuánto tarda.
 *
 * LOS NÚMEROS ESPERADOS ESTÁN CALCULADOS A MANO (comentarios de cada escena), no salen de las funciones.
 *
 * CÓMO. Igual que `activos_y_gastos_fijos.mjs`: cada escena en su transacción con ROLLBACK (la base la comparten otras
 * sesiones), sesión simulada con `request.jwt.claim.sub`. El Estado de resultados se prueba en SEPTIEMBRE DE 2030, un mes
 * sin datos de nadie más; la planilla de Dynamic se simula con una vista y una `public.fn_es_admin_o_lider()` de ensayo.
 *
 * USO
 *   pnpm pruebas:estado-resultados    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
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
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1200)}`);
  }
}
/** Cada verificación de la escena sale como una línea `caso|t`. Se exige que estén TODAS y en verdadero. */
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
  for (const caso of esperados) esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-600) });
}
/** Saca los nombres de caso de un bloque SQL: cada `select 'NOMBRE',` de verificación. */
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
-- Llaves con nombre (S1, S1i, D1…) para cada fila de la escena, sin chocar con otra corrida en paralelo.
create temp table k (n text primary key, id uuid not null default gen_random_uuid());
create function pg_temp.k(p text) returns uuid language sql as $f$
  insert into k (n) values (p) on conflict (n) do update set n = excluded.n returning id
$f$;
-- Un cambio de costo de una prenda (costo_historial necesita su movimiento de entrada).
create function pg_temp.historial(p_var uuid, p_ant numeric, p_res numeric, p_cuando timestamptz) returns void language sql as $f$
  with m as (
    insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
    select p_var, (select id from retail.ubicaciones where nombre = 'Tienda Trujillo'), 'entrada', 1, 'recepcion', p_cuando
    returning id
  )
  insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
  select p_var, 0, p_ant, 1, p_res, p_res, 'compra', m.id, p_cuando from m
$f$;
-- Una venta de UNA línea con sus cobros (jsonb [{m, v}]); si viene anulada, con la condición de la prenda.
create function pg_temp.vender(p_n text, p_ubic uuid, p_cuando timestamptz, p_var uuid, p_cant int, p_precio numeric, p_desc numeric,
                               p_costo numeric, p_pagos jsonb, p_anulada timestamptz default null, p_condicion text default null,
                               p_etiqueta uuid default null) returns void language plpgsql as $f$
declare x jsonb;
begin
  insert into retail.ventas (id, ubicacion_id, estado, anulado_en, motivo_anulacion, created_at)
  values (pg_temp.k(p_n), p_ubic, case when p_anulada is null then 'completada' else 'anulada' end, p_anulada,
          case when p_anulada is null then null else 'prueba F5' end, p_cuando);
  insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario, motivo_descuento, descuento_etiqueta_id)
  values (pg_temp.k(p_n || 'i'), pg_temp.k(p_n), p_var, p_cant, p_precio, p_desc, p_costo,
          case when p_etiqueta is not null then 'campana' when p_desc > 0 then 'cerrar_venta' end, p_etiqueta);
  for x in select * from jsonb_array_elements(p_pagos) loop
    insert into retail.venta_pagos (venta_id, metodo, monto) values (pg_temp.k(p_n), x ->> 'm', (x ->> 'v')::numeric);
  end loop;
  if p_condicion is not null then
    insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) values (pg_temp.k(p_n), pg_temp.k(p_n || 'i'), p_condicion);
  end if;
end $f$;
-- La planilla de Dynamic, de ensayo: la vista puente y la puerta de Dynamic (se abre con prueba.planilla = 'si').
create function public.fn_es_admin_o_lider() returns boolean language sql stable as $f$
  select coalesce(current_setting('prueba.planilla', true), 'no') = 'si'
$f$;
insert into public.sedes (codigo, nombre, tipo) values ('ZTAL', 'Taller de ensayo F5', 'taller'), ('ZCCO', 'Central de ensayo F5', 'central');
create view retail.planilla_por_sede as
select * from (values
  ('TRU'::text,  'tienda'::text,  'f5f5f5f5-0000-4000-8000-0000000000a1'::uuid, '2030-07-29'::date, '2030-08-28'::date, 12::bigint, 10000.00::numeric, 2000.00::numeric, 12000.00::numeric),
  ('TRU',        'tienda',        'f5f5f5f5-0000-4000-8000-0000000000a2'::uuid, '2030-08-29'::date, '2030-09-28'::date, 13::bigint, 12642.37, 1914.47, 14556.84),
  ('ZTAL',       'taller',        'f5f5f5f5-0000-4000-8000-0000000000a2'::uuid, '2030-08-29'::date, '2030-09-28'::date, 5::bigint,  4214.00, 879.69, 5093.69),
  ('ZCCO',       'central',       'f5f5f5f5-0000-4000-8000-0000000000a2'::uuid, '2030-08-29'::date, '2030-09-28'::date, 5::bigint,  6585.64, 435.42, 7021.06)
) v (sede_codigo, sede_tipo, periodo_id, fecha_ini, fecha_fin, personas, pagado, provisiones, costo_total);
`;

// ============================================================================================================================
// LA ESCENA DE SEPTIEMBRE DE 2030 (hora de Lima, precios CON IGV al 18 %). TRU = Tienda Trujillo, LIM = Tienda Lima.
//   IGV = round(total − total/1.18, 2): 200 → 30.51 (neta 169.49) · 90 → 13.73 (76.27) · 150 → 22.88 (127.12) ·
//   100 → 15.25 (84.75) · 30 → 4.58 (25.42) · 236 → 36.00 (200.00) · adelanto 118 → 18.00 (100) · 59 → 9.00 (50)
// Prendas: vA costó 40 hasta el 5-sep y 50 desde entonces · vB sin costo (0) · vN cuesta 60.
// ============================================================================================================================
const ESCENA = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tal from retail.ubicaciones where tipo = 'taller' order by activo desc, created_at limit 1 \\gset
select p.id as felipe from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select (select id from retail.cajas order by abierta_en desc nulls last limit 1) as caja \\gset
-- vA no puede tener historia de costo previa (se prueba «el costo que regía antes del primer cambio»); vB y vN, cualquiera:
-- su cambio de 2030 es el último antes de cada hecho.
-- En una base recién sembrada (el CI) todas las prendas ya tienen historia de costo: se crea una propia, sin talla ni
-- color (no choca con la llave producto·talla·color) y sin historia. Queda dentro de la transacción de la escena.
insert into retail.variantes (producto_id, sku, precio, costo)
select v.producto_id, 'PRUEBA-F5-VA', 100, 0 from retail.variantes v where v.id <> '22222222-2222-4222-8222-222222222222' order by v.id limit 1
returning id as va \\gset
select (array_agg(x.id order by x.id))[1] as vb, (array_agg(x.id order by x.id))[2] as vn
  from (select v.id from retail.variantes v where v.id not in ('22222222-2222-4222-8222-222222222222', :'va') order by v.id limit 2) x \\gset
insert into retail.proveedores (nombre, activo) values ('Proveedor de prueba F5', true) returning id as prov \\gset

select pg_temp.historial(:'va', 40, 50, '2030-09-05 12:00-05');
select pg_temp.historial(:'vb', 0, 0, '2030-08-01 12:00-05');
select pg_temp.historial(:'vn', 0, 60, '2030-08-01 12:00-05');

-- Ventas
select pg_temp.vender('S1', :'tru', '2030-09-10 12:00-05', :'va', 2, 100, 0, 40, '[{"m":"efectivo","v":200}]');
select pg_temp.vender('S2', :'tru', '2030-09-11 12:00-05', :'va', 1, 100, 10, 40, '[{"m":"tarjeta","v":50},{"m":"yape","v":40}]');
select pg_temp.vender('S3', :'lim', '2030-09-12 12:00-05', :'vb', 3, 50, 0, 0, '[{"m":"transferencia","v":150}]');
select pg_temp.vender('S4', :'tru', '2030-09-30 23:30-05', :'va', 1, 100, 0, 40, '[{"m":"efectivo","v":100}]');   -- 1-oct en UTC: es SEPTIEMBRE
select pg_temp.vender('S5', :'tru', '2030-10-01 00:10-05', :'va', 1, 100, 0, 40, '[{"m":"efectivo","v":100}]');   -- OCTUBRE
select pg_temp.vender('S6', :'tru', '2030-08-31 23:50-05', :'va', 1, 100, 0, 40, '[{"m":"efectivo","v":100}]');   -- AGOSTO
select pg_temp.vender('S7', :'tru', '2030-09-15 12:00-05', :'va', 1, 100, 0, 40, '[{"m":"efectivo","v":100}]', '2030-09-20 12:00-05', 'vendible');
select pg_temp.vender('S8', :'lim', '2030-09-16 12:00-05', :'va', 1, 100, 0, 40, '[{"m":"efectivo","v":100}]', '2030-09-22 12:00-05', 'danada_donar');
select pg_temp.vender('S9', :'tru', '2030-08-20 12:00-05', :'va', 1, 100, 0, 40, '[{"m":"efectivo","v":100}]', '2030-09-05 12:00-05', 'vendible');
-- Monto manual (sin costo por definición): no cuenta como «sin costo cargado».
select pg_temp.vender('S11', :'tru', '2030-09-25 12:00-05', '22222222-2222-4222-8222-222222222222', 1, 11.80, 0, 0, '[{"m":"efectivo","v":11.80}]');

-- Separación SEP1 (TRU): adelanto 118 por Yape el 2-sep, se entrega el 18-sep: venta S10 de 236 = adelanto + 118 en efectivo.
insert into retail.separaciones (id, codigo, ubicacion_id, caja_id, clienta_nombres, clienta_apellidos, clienta_celular, comprobante_tipo,
       creado_por, total, adelanto, vence_el, devolucion_medio, devolucion_numero, estado, created_at)
values (pg_temp.k('SEP1'), 'F5-' || left(pg_temp.k('SEP1')::text, 8), :'tru', :'caja', 'Ana', 'Prueba', '999888777', 'boleta',
        :'felipe', 236, 118, '2030-09-20', 'yape', '999888777', 'abierta', '2030-09-02 10:00-05');
insert into retail.separacion_pagos (separacion_id, metodo, monto, created_at) values (pg_temp.k('SEP1'), 'yape', 118, '2030-09-02 10:00-05');
select pg_temp.vender('S10', :'tru', '2030-09-18 12:00-05', :'va', 1, 236, 0, 40, '[{"m":"anticipo","v":118},{"m":"efectivo","v":118}]');
update retail.separaciones set estado = 'entregada', venta_id = pg_temp.k('S10'), entregada_en = '2030-09-18 12:00-05' where id = pg_temp.k('SEP1');
-- SEP2 (LIM): adelanto 59 por Plin el 3-sep; vence, se libera el 10 y se devuelve por transferencia el 12.
insert into retail.separaciones (id, codigo, ubicacion_id, caja_id, clienta_nombres, clienta_apellidos, clienta_celular, comprobante_tipo,
       creado_por, total, adelanto, vence_el, devolucion_medio, devolucion_numero, estado, liberada_en, liberada_motivo, devuelta_en,
       devolucion_medio_real, created_at)
values (pg_temp.k('SEP2'), 'F5-' || left(pg_temp.k('SEP2')::text, 8), :'lim', :'caja', 'Bea', 'Prueba', '999888776', 'boleta',
        :'felipe', 100, 59, '2030-09-09', 'yape', '999888776', 'devuelta', '2030-09-10 10:00-05', 'vencio', '2030-09-12 10:00-05',
        'transferencia', '2030-09-03 10:00-05');
insert into retail.separacion_pagos (separacion_id, metodo, monto, created_at) values (pg_temp.k('SEP2'), 'plin', 59, '2030-09-03 10:00-05');

-- Devoluciones sobre S1 (línea de 100 c/u, costo 40): D1 aprobada el 14-sep (reembolso_monto nulo: vale por la línea);
-- D2 pendiente y D3 rechazada no asientan.
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, aprobado_en) values
  (pg_temp.k('D1'), pg_temp.k('S1'), :'tru', 'talla', 'aprobada', null, 'efectivo', '2030-09-14 10:00-05'),
  (pg_temp.k('D2'), pg_temp.k('S1'), :'tru', 'talla', 'pendiente', null, null, null),
  (pg_temp.k('D3'), pg_temp.k('S1'), :'tru', 'talla', 'rechazada', 100, 'efectivo', '2030-09-14 11:00-05');
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values
  (pg_temp.k('D1'), pg_temp.k('S1i'), 1, 'vendible'), (pg_temp.k('D2'), pg_temp.k('S1i'), 1, 'vendible'), (pg_temp.k('D3'), pg_temp.k('S1i'), 1, 'vendible');

-- Cambio sobre S2 (90 cobrados, costo 40) por vN (costo 60): paga +30 en efectivo el 13-sep.
insert into retail.cambios (id, venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, motivo, condicion, created_at)
values (pg_temp.k('C1'), pg_temp.k('S2i'), :'tru', :'vn', 1, 30, 'efectivo', 'talla_chica', 'vendible', '2030-09-13 12:00-05');

-- Mermas y movimientos que NO son merma
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at) values
  (:'va', :'tru', 'ajuste', -2, 'merma',                         '2030-09-03 12:00-05'),  -- ANTES del cambio de costo: 2 × 40 = 80
  (:'va', :'lim', 'salida',  1, 'cuarentena_se_boto',            '2030-09-08 12:00-05'),  -- LIM, después: 50
  (:'va', :'tru', 'salida',  1, 'cuarentena_donada',             '2030-09-09 12:00-05'),  -- 50
  (:'va', :'tru', 'salida',  1, 'cuarentena_devuelta_proveedor', '2030-09-09 13:00-05'),  -- NO es merma
  (:'va', :'tru', 'ajuste', -1, 'conteo',                        '2030-09-20 12:00-05'),  -- faltante de conteo: 50
  (:'va', :'tru', 'ajuste',  3, 'conteo',                        '2030-09-20 12:05-05'),  -- sobrante: no se reconoce
  (:'va', :'tru', 'ajuste', -1, 'conteo_fisico',                 '2030-09-21 12:00-05'),  -- faltante del modal de ajuste: 50
  (:'vb', :'tru', 'ajuste', -2, 'merma',                         '2030-09-21 12:00-05'),  -- sin costo: 0 y se AVISA (2 u.)
  (:'va', :'tru', 'ajuste', -1, 'reposicion',                    '2030-09-21 13:00-05');  -- no es merma

-- Gastos. G1 TRU: factura de alquiler de 1,180 (1,000 + IGV 180) a crédito, con nota de crédito de 118 (100 + 18) el 25 y
-- un pago de 500 por transferencia el 28. G2 «de la empresa» 300 por transferencia. G3 anulado. G4 de octubre.
-- G5 Taller 400 por transferencia.
insert into retail.compras (id, proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
values (pg_temp.k('CG1'), :'prov', 'factura', 'F5G', '1', '2030-09-10', 'credito', '2030-10-10', 1000, 180, 1180, 'gasto', :'tru');
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, compra_id) values
  (pg_temp.k('G1'), :'tru', 'alquileres', 'Alquiler TRU', '2030-09-10', 1180, 180, pg_temp.k('CG1'));
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado, motivo_anulacion, anulado_en) values
  (pg_temp.k('G2'), null,    'servicios_basicos', 'Internet oficina', '2030-09-15', 300, 0, 'transferencia', 'vigente', null, null),
  (pg_temp.k('G3'), :'tru',  'alquileres', 'Anulado',    '2030-09-16', 999, 0, 'yape', 'anulado', 'registrado por error', '2030-09-17 10:00-05'),
  (pg_temp.k('G4'), :'tru',  'alquileres', 'De octubre', '2030-10-02', 500, 0, 'yape', 'vigente', null, null),
  (pg_temp.k('G5'), :'tal',  'alquileres', 'Alquiler del Taller', '2030-09-05', 400, 0, 'transferencia', 'vigente', null, null);
insert into retail.compra_notas_credito (id, compra_id, serie_numero, fecha, subtotal, igv, monto, motivo, aplicado)
values (pg_temp.k('NC1'), pg_temp.k('CG1'), 'NC5-1', '2030-09-25', 100, 18, 118, 'descuento', 0);
insert into retail.compra_pagos (id, compra_id, fecha, monto, metodo, ubicacion_id) values (pg_temp.k('PG1'), pg_temp.k('CG1'), '2030-09-28', 500, 'transferencia', :'tru');

-- Factura de MERCADERÍA de TRU: 2,360 (2,000 + 360) el 2-sep; pago de 1,000 en efectivo el 20 y 100 con saldo a favor
-- (no mueve plata: no asienta); el proveedor devuelve 50 por transferencia el 26.
insert into retail.compras (id, proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
values (pg_temp.k('CM1'), :'prov', 'factura', 'F5M', '1', '2030-09-02', 'credito', '2030-10-02', 2000, 360, 2360, 'mercaderia', :'tru');
insert into retail.compra_pagos (id, compra_id, fecha, monto, metodo, ubicacion_id) values
  (pg_temp.k('PM1'), pg_temp.k('CM1'), '2030-09-20', 1000, 'efectivo', :'tru'),
  (pg_temp.k('PM2'), pg_temp.k('CM1'), '2030-09-21', 100, 'saldo_a_favor', :'tru');
insert into retail.proveedor_creditos (id, proveedor_id, tipo, monto, fecha, compra_id, metodo) values (pg_temp.k('R1'), :'prov', 'reembolso', 50, '2030-09-26', pg_temp.k('CM1'), 'transferencia');

-- Activos. A1 TRU: estante con factura de 2,360 el 15-jun (costo 2,000, 10 años): septiembre deprecia 16.67.
-- A2 Taller: remalladora de 1,200 sin comprobante el 10-mar, 12 meses (100 al mes), dada de baja el 15-sep: septiembre
-- deprecia 100 y la baja pierde 600 (1,200 − 6 meses). A3 TRU: laptop de 590 por Yape el 20-sep (se deprecia desde oct).
insert into retail.compras (id, proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
values (pg_temp.k('CA1'), :'prov', 'factura', 'F5A', '1', '2030-06-15', 'contado', 2000, 360, 2360, 'activo', :'tru');
insert into retail.activos_fijos (id, ubicacion_id, tipo, nombre, cuenta_codigo, costo, vida_util_meses, tasa_anual, fecha_adquisicion, compra_id, medio_pago, estado, fecha_baja, motivo_baja) values
  (pg_temp.k('A1'), :'tru', 'muebles',    'Estante F5',     '335', 2000, 120, 0.10, '2030-06-15', pg_temp.k('CA1'), null, 'activo', null, null),
  (pg_temp.k('A2'), :'tal', 'maquinaria', 'Remalladora F5', '333', 1200, 12,  1.00, '2030-03-10', null, 'transferencia', 'baja', '2030-09-15', 'se malogró'),
  (pg_temp.k('A3'), :'tru', 'equipos_computo', 'Laptop F5', '336', 590, 48, 0.25, '2030-09-20', null, 'yape', 'activo', null, null);
`;

// Verificaciones del Estado de resultados de septiembre de 2030 como líder, con la planilla visible.
//   TRU ventas 396.43 = S1 169.49 + S2 76.27 + S4 84.75 + S7 84.75 − S7 84.75 − S9 84.75 − D1 84.75 + cambio 25.42 + S10 200
//       + S11 10 (Monto manual de 11.80)
//   TRU costo 140 = 80 + 40 + 40 + 40 − 40 − 40 − 40 + 20 (cambio: 60 − 40) + 40 (S10)
//   TRU mermas 230 = 80 (2 × 40, antes del cambio de costo) + 50 (donada) + 50 (conteo) + 50 (conteo_fisico) + 0 (sin costo)
//   TRU margen 26.43 · gastos: alquiler 1,000 − 100 (nota de crédito) = 900; planilla 14,556.84; depreciación 16.67
//       → 15,473.51 · resultado −15,447.08
//   LIM ventas 127.12 (S3; S8 se vende y se anula en el mes) · costo 0 · mermas 90 (S8 no vendible 40 + botada 50) → 37.12
//   Taller: alquiler 400 + planilla 5,093.69 + depreciación 100 + baja 600 = 6,193.69
//   De la empresa: internet 300 + planilla 7,021.06 = 7,321.06
//   CAYLA: ventas 523.55, costo 140, mermas 320, margen 63.55, gastos 28,988.26, resultado −28,924.71
const CASOS_ER = `
select set_config('prueba.planilla', 'si', true);
create temp table er as select * from retail.fn_estado_resultados('2030-09-01', '2030-09-30');
create temp table dia as select * from retail.fn_asientos('2030-09-01', '2030-09-30');
select 'E1 TRU ventas sin IGV = 396.43 (medianoche de Lima; anulación en el mes en que se anula; devolución por su línea)', (select ventas_netas = 396.43 from er where ubicacion_id = :'tru');
select 'E1 TRU costo de lo vendido = 140 (costo sellado; el cambio suma la diferencia de costo)', (select costo_ventas = 140 from er where ubicacion_id = :'tru');
select 'E1 TRU mermas = 230 (al costo de esa fecha; devuelto al proveedor y sobrantes no)', (select mermas = 230 from er where ubicacion_id = :'tru');
select 'E1 TRU margen bruto = 26.43', (select margen_bruto = 26.43 from er where ubicacion_id = :'tru');
select 'E1 TRU planilla = 14,556.84 (período de Dynamic que termina en septiembre; el de agosto no)', (select planilla = 14556.84 from er where ubicacion_id = :'tru');
select 'E1 TRU depreciación = 16.67 (el estante; la laptop recién desde octubre)', (select depreciacion = 16.67 from er where ubicacion_id = :'tru');
select 'E1 TRU gastos = 15,473.51 (el alquiler sin IGV y menos la nota de crédito: 900)', (select gastos_operacion = 15473.51 from er where ubicacion_id = :'tru');
select 'E1 TRU resultado = −15,447.08', (select resultado = -15447.08 from er where ubicacion_id = :'tru');
select 'E1 TRU alquiler (635) = 900 en el detalle', (select (x ->> 'monto')::numeric = 900 from er, jsonb_array_elements(detalle_gastos) x where ubicacion_id = :'tru' and x ->> 'cuenta' = '635');
select 'E1 TRU IGV de ventas = 71.37 (con el del adelanto al cobrarlo, sin contarlo dos veces al entregar)', (select igv_ventas = 71.37 from er where ubicacion_id = :'tru');
select 'E1 TRU avisa 2 prendas de merma sin costo y ninguna vendida sin costo (el Monto manual no cuenta)', (select mermas_sin_costo = 2 and unidades_sin_costo = 0 from er where ubicacion_id = :'tru');
select 'E1 TRU separa 3 orígenes de merma (a mano, cuarentena, conteo)', (select jsonb_array_length(detalle_mermas) = 3 from er where ubicacion_id = :'tru');
select 'E2 LIM ventas 127.12, costo 0, mermas 90 (anulación no vendible + botada), resultado 37.12', (select ventas_netas = 127.12 and costo_ventas = 0 and mermas = 90 and resultado = 37.12 from er where ubicacion_id = :'lim');
select 'E2 LIM avisa 3 prendas vendidas sin costo (el margen sale inflado)', (select unidades_sin_costo = 3 from er where ubicacion_id = :'lim');
select 'E2 LIM: el adelanto que se devolvió no deja IGV ni ventas', (select igv_ventas = 22.88 from er where ubicacion_id = :'lim');
select 'E3 Taller: alquiler 400 + planilla 5,093.69 + depreciación 100 + baja 600 = 6,193.69', (select ventas_netas = 0 and planilla = 5093.69 and depreciacion = 100 and gastos_operacion = 6193.69 and resultado = -6193.69 from er where ubicacion_id = :'tal');
select 'E3 Taller: la baja pierde lo que faltaba depreciar (655 = 600)', (select (x ->> 'monto')::numeric = 600 from er, jsonb_array_elements(detalle_gastos) x where ubicacion_id = :'tal' and x ->> 'cuenta' = '655');
select 'E4 De la empresa: internet 300 + planilla de la central 7,021.06', (select gastos_operacion = 7321.06 and ventas_netas = 0 from er where unidad = 'empresa');
select 'E4 consolidado: ventas 523.55, costo 140, mermas 320, margen 63.55', (select ventas_netas = 523.55 and costo_ventas = 140 and mermas = 320 and margen_bruto = 63.55 from er where unidad = 'consolidado');
select 'E4 consolidado: gastos 28,988.26 y resultado −28,924.71', (select gastos_operacion = 28988.26 and resultado = -28924.71 from er where unidad = 'consolidado');
select 'E4 el consolidado es la suma EXACTA de las filas (ventas, costo, mermas, gastos y resultado)',
  (select c.ventas_netas = s.v and c.costo_ventas = s.c and c.mermas = s.m and c.gastos_operacion = s.g and c.resultado = s.r
     from er c, (select sum(ventas_netas) v, sum(costo_ventas) c, sum(mermas) m, sum(gastos_operacion) g, sum(resultado) r from er where unidad <> 'consolidado') s
    where c.unidad = 'consolidado');
select 'E4 una fila por tienda, el Taller, la empresa y CAYLA; nadie descuadrado', (select count(*) filter (where unidad = 'consolidado') = 1 and count(*) filter (where unidad = 'empresa') = 1 and bool_and(asientos_descuadrados = 0) and bool_and(planilla_visible) from er);
select 'E5 cada asiento cuadra (debe = haber) y el diario entero también', (select count(*) = 0 from retail.fn_asientos_descuadrados('2030-09-01', '2030-09-30')) and (select round(sum(debe), 2) = round(sum(haber), 2) from dia);
select 'E5 cobros de venta: efectivo 101 = 629.80, tarjeta 105 = 50, Yape y transferencia 104 = 190, adelanto aplicado 122 = 100',
  (select sum(debe) filter (where cuenta = '101') = 629.80 and sum(debe) filter (where cuenta = '105') = 50 and sum(debe) filter (where cuenta = '104') = 190 and sum(debe) filter (where cuenta = '122') = 100 from dia where regla = 'venta');
select 'E5 lo cobrado en el diario (con el IGV del adelanto) = la suma de venta_pagos del mes (987.80)',
  (select sum(debe) from dia where regla = 'venta' and cuenta in ('101', '104', '105', '122')) + (select sum(debe) from dia where regla = 'venta' and cuenta = '4011')
  = (select sum(vp.monto) from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id where v.created_at >= '2030-09-01 00:00-05' and v.created_at < '2030-10-01 00:00-05');
select 'E5 las ventas de las 00:10 del 1-oct y de las 23:50 del 31-ago no están en septiembre', (select count(*) = 0 from dia where origen_id in (pg_temp.k('S5'), pg_temp.k('S6')));
select 'E5 una devolución pendiente o rechazada no asienta', (select count(*) = 0 from dia where origen_id in (pg_temp.k('D2'), pg_temp.k('D3')));
select 'E5 un gasto anulado o de otro mes no asienta', (select count(*) = 0 from dia where origen_id in (pg_temp.k('G3'), pg_temp.k('G4')));
select 'E5 el adelanto de SEP1: 104 = 118 contra 122 = 100 + IGV 18', (select sum(debe) filter (where cuenta = '104') = 118 and sum(haber) filter (where cuenta = '122') = 100 and sum(haber) filter (where cuenta = '4011') = 18 from dia where origen_id = pg_temp.k('SEP1'));
select 'E5 el adelanto devuelto de SEP2 sale por 104 y baja el 122 y el IGV', (select sum(haber) filter (where cuenta = '104') = 59 and sum(debe) filter (where cuenta = '122') = 50 and sum(debe) filter (where cuenta = '4011') = 9 from dia where regla = 'anticipo_devuelto');
select 'E5 la factura de gasto va a 421 (se le debe) y su pago sale del banco', (select sum(haber) filter (where cuenta = '421') = 1180 from dia where origen_id = pg_temp.k('G1')) and (select sum(debe) filter (where cuenta = '421') = 500 and sum(haber) filter (where cuenta = '104') = 500 from dia where origen_id = pg_temp.k('PG1'));
select 'E5 la factura de mercadería: 201 = 2,000 + IGV 360 contra 421 = 2,360; no toca resultados', (select sum(debe) filter (where cuenta = '201') = 2000 and sum(debe) filter (where cuenta = '4011') = 360 and sum(haber) filter (where cuenta = '421') = 2360 from dia where origen_id = pg_temp.k('CM1'));
select 'E5 pagar con saldo a favor no asienta; el pago en efectivo sale de la 101', (select count(*) = 0 from dia where origen_id = pg_temp.k('PM2')) and (select sum(haber) filter (where cuenta = '101') = 1000 from dia where origen_id = pg_temp.k('PM1'));
select 'E5 el reembolso del proveedor entra al banco y baja el 421', (select sum(debe) filter (where cuenta = '104') = 50 and sum(haber) filter (where cuenta = '421') = 50 from dia where origen_id = pg_temp.k('R1'));
select 'E5 la nota de crédito baja el 421 y el alquiler (635) y el IGV', (select sum(debe) filter (where cuenta = '421') = 118 and sum(haber) filter (where cuenta = '635') = 100 and sum(haber) filter (where cuenta = '4011') = 18 from dia where origen_id = pg_temp.k('NC1'));
select 'E5 el alta de la laptop: 336 = 590 contra el banco; no es gasto', (select sum(debe) filter (where cuenta = '336') = 590 and sum(haber) filter (where cuenta = '104') = 590 from dia where origen_id = pg_temp.k('A3') and regla = 'activo');
select 'E5 la baja: 391 = 600 + 655 = 600 contra 333 = 1,200', (select sum(debe) filter (where cuenta = '391') = 600 and sum(debe) filter (where cuenta = '655') = 600 and sum(haber) filter (where cuenta = '333') = 1200 from dia where regla = 'baja_activo');
select 'E5 la planilla: 62 contra 41, fechada al cierre del período', (select count(*) = 3 and bool_and(fecha = '2030-09-28') from dia where regla = 'planilla' and cuenta = '41');
select 'E5 la anulación con prenda no vendible pasa su costo a merma (659 = 40)', (select sum(debe) filter (where cuenta = '659') = 40 and sum(haber) filter (where cuenta = '691') = 40 from dia where origen_id = pg_temp.k('S8') and regla = 'anulacion');
select 'E5 pedir una tienda devuelve solo esa tienda', (select count(*) > 0 and bool_and(ubicacion_id = :'tru') from retail.fn_asientos('2030-09-01', '2030-09-30', :'tru'));
select 'E6 agosto: la depreciación del estante (16.66), la planilla de agosto y sus ventas (S9, anulada en septiembre, y la de las 23:50 del 31)', (select depreciacion = 16.66 and planilla = 12000 and ventas_netas = 169.50 from retail.fn_estado_resultados('2030-08-01', '2030-08-31') where ubicacion_id = :'tru');
`;

// Descuadre, permisos, planilla y tasa: sobre la misma escena, cada uno en su transacción.
const CASOS_DESCUADRE = `
update retail.venta_pagos set monto = 190 where venta_id = pg_temp.k('S1');   -- cobró 190 de una venta de 200
select 'D1 el Estado de resultados avisa 1 asiento descuadrado en TRU', (select asientos_descuadrados = 1 from retail.fn_estado_resultados('2030-09-01', '2030-09-30') where ubicacion_id = :'tru');
select 'D1 y dice cuál y por cuánto (−10)', (select count(*) = 1 and bool_and(diferencia = -10 and regla = 'venta') from retail.fn_asientos_descuadrados('2030-09-01', '2030-09-30'));
`;

const CASOS_SIN_PLANILLA = `
select set_config('prueba.planilla', 'no', true);
create temp table er as select * from retail.fn_estado_resultados('2030-09-01', '2030-09-30');
select 'P1 sin permiso en Dynamic no entra la planilla y se dice (planilla_visible = false)', (select bool_and(planilla = 0) and not bool_or(planilla_visible) from er);
select 'P1 TRU sin planilla: gastos 916.67 y resultado −890.24', (select gastos_operacion = 916.67 and resultado = -890.24 from er where ubicacion_id = :'tru');
select 'P1 consolidado sin planilla: resultado −2,253.12', (select resultado = -2253.12 from er where unidad = 'consolidado');
select 'P1 el diario no trae ninguna línea de planilla', (select count(*) = 0 from retail.fn_asientos('2030-09-01', '2030-09-30') where regla = 'planilla');
`;

const CASOS_PERMISOS = `
select set_config('prueba.planilla', 'no', true);
${cambiaA(MICAELA)}
select 'R1 sin el módulo, una colaboradora no ve el estado de resultados', (select pg_temp.intento($$select * from retail.fn_estado_resultados('2030-09-01', '2030-09-30')$$) like '%Reportes financieros%');
select 'R1 ni el diario', (select pg_temp.intento($$select * from retail.fn_asientos('2030-09-01', '2030-09-30')$$) like '%Reportes financieros%');
select 'R1 ni las campañas', (select pg_temp.intento($$select * from retail.fn_campanas_reporte()$$) like '%Reportes financieros%');
${conModulo("reportes_financieros")}
create temp table er as select * from retail.fn_estado_resultados('2030-09-01', '2030-09-30');
select 'R2 con el módulo ve SU tienda y nada más: ni la empresa ni el consolidado', (select count(*) = 1 and bool_and(ubicacion_id = :'tru' and unidad = 'tienda') from er);
select 'R2 sus números son los mismos que ve el líder (sin la planilla, que es de Dynamic)', (select ventas_netas = 396.43 and gastos_operacion = 916.67 from er);
select 'R2 su diario es solo de su tienda', (select count(*) > 0 and bool_and(ubicacion_id = :'tru') from retail.fn_asientos('2030-09-01', '2030-09-30'));
select 'R2 pedir otra tienda falla', (select pg_temp.intento(format('select * from retail.fn_estado_resultados(%L, %L, %L)', '2030-09-01', '2030-09-30', :'lim')) like '%esa ubicación%');
select 'R2 pedir el diario de otra tienda también', (select pg_temp.intento(format('select * from retail.fn_asientos(%L, %L, %L)', '2030-09-01', '2030-09-30', :'lim')) like '%esa ubicación%');
select 'R3 un rango al revés se rechaza', (select pg_temp.intento($$select * from retail.fn_asientos('2030-09-30', '2030-09-01')$$) like '%rango%');
`;

// La comisión del POS (F3): un gasto «de la empresa» que ya descontó el abono de tarjeta. Sale de la 105, no del banco.
const CASOS_COMISION = `
insert into retail.cuentas_dinero (id, nombre, tipo, cuenta_contable) values
  (pg_temp.k('POS'), 'POS de prueba F5', 'por_abonar', '105'), (pg_temp.k('BCO'), 'Banco de prueba F5', 'banco', '104');
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago)
values (pg_temp.k('GC'), null, 'gastos_bancarios', 'Comisión del POS', '2030-09-20', 12.50, 0, 'transferencia');
insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto, comision, gasto_comision_id)
values ('abono_tarjeta', '2030-09-20', pg_temp.k('POS'), pg_temp.k('BCO'), 487.50, 12.50, pg_temp.k('GC'));
create temp table dia as select * from retail.fn_asientos('2030-09-01', '2030-09-30');
select 'M1 la comisión del POS es gasto 639 y sale de la 105 (por abonar), no del banco', (select sum(debe) filter (where cuenta = '639') = 12.50 and sum(haber) filter (where cuenta = '105') = 12.50 and count(*) filter (where cuenta = '104') = 0 from dia where origen_id = pg_temp.k('GC'));
select 'M1 la tarjeta de crédito de CAYLA es la 451 (la de F3)', (select retail.fn_asiento_cuenta_de_medio('tarjeta', 'sale') = '451' and retail.fn_asiento_cuenta_de_medio('tarjeta', 'entra') = '105');
`;

const CASOS_TASA = `
select set_config('prueba.planilla', 'si', true);
insert into retail.parametros_tributarios (nombre, vigente_desde, valor, nota) values ('igv', '2030-10-01', 0.20, 'prueba F5');
select 'T1 septiembre NO cambia al cambiar la tasa desde octubre', (select ventas_netas = 396.43 from retail.fn_estado_resultados('2030-09-01', '2030-09-30') where ubicacion_id = :'tru');
-- S5 (1-oct, 100 al 20 %): IGV = 100 − 100/1.2 = 16.67 → 83.33. Gastos de octubre: G4 500 + estante 16.67 + laptop 12.29 (590 ÷ 48).
select 'T1 octubre usa el 20 %: la venta de 100 deja 83.33; el gasto de octubre (500) y la depreciación, en octubre', (select ventas_netas = 83.33 and gastos_operacion = 528.96 from retail.fn_estado_resultados('2030-10-01', '2030-10-31') where ubicacion_id = :'tru');
`;

// ============================================================================================================================
// CAMPAÑAS. Una tienda nueva (solo de esta escena) y ventanas sin ninguna otra campaña, elegidas contra las fechas que
// haya en la base (así la prueba no depende del día en que corre).
//   Pasada (7 días, 20 % de descuento, desde d0): cada día 2 prendas de 118 con 23.60 de descuento = 188.80 (160 sin IGV),
//   costo 40 c/u. Normal: los 14 días previos, 1 prenda de 118 (100) al día, costo 40; el día d0−3 rige OTRA campaña y
//   vende 11,800 más: no cuenta como normal. Esperado: vendió 1,120 · normal 700 (+60 %) · descuento 280 · margen 50 %
//   contra 60 % normal · margen extra = 1,120 × 0.5 − 700 × 0.6 = 140 · 14 prendas.
//   Viene (7 días desde hoy + 10, 15 %): meta normal 1,180 al día con IGV (1,000 sin IGV), sube 30 % → 1,534 (1,300);
//   meta de la campaña 9,100, normal 7,000. Margen normal: las dos ventas recientes (costo 30 sobre 100) = 70 %.
// ============================================================================================================================
const CAMPANAS = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select (select v.id from retail.variantes v where v.id <> '22222222-2222-4222-8222-222222222222' order by v.id limit 1) as va \\gset
insert into retail.ubicaciones (nombre, tipo) values ('Tienda de prueba F5', 'tienda') returning id as tc \\gset
select retail.fn_hoy_lima() as hoy \\gset
-- d0: la ventana [d0 − 56, d0 + 6] sin ninguna campaña de la base, y más vieja que las últimas 8 semanas.
select d::date as d0 from generate_series(:'hoy'::date - 63, :'hoy'::date - 400, interval '-1 day') d
 where not exists (select 1 from retail.etiquetas e where e.estilo = 'campana' and e.activo and e.estado = 'aprobado' and e.vigente_desde is not null
                    and daterange(e.vigente_desde, e.vigente_hasta, '[]') && daterange((d - interval '56 days')::date, (d + interval '6 days')::date, '[]'))
 order by d desc limit 1 \\gset
insert into retail.etiquetas (nombre, estilo, vigente_desde, vigente_hasta, descuento_pct, sedes_permitidas, estado, activo)
values ('Prueba F5 pasada', 'campana', :'d0', :'d0'::date + 6, 20, array[:'tc']::uuid[], 'aprobado', true) returning id as cp \\gset
insert into retail.etiquetas (nombre, estilo, vigente_desde, vigente_hasta, descuento_pct, sedes_permitidas, estado, activo)
values ('Prueba F5 otra', 'campana', :'d0'::date - 3, :'d0'::date - 3, null, array[:'tc']::uuid[], 'aprobado', true) returning id as co \\gset
insert into retail.etiquetas (nombre, estilo, vigente_desde, vigente_hasta, descuento_pct, sedes_permitidas, estado, activo)
values ('Prueba F5 viene', 'campana', :'hoy'::date + 10, :'hoy'::date + 16, 15, array[:'tc']::uuid[], 'aprobado', true) returning id as cv \\gset
insert into retail.etiquetas (nombre, estilo, vigente_desde, vigente_hasta, descuento_pct, sedes_permitidas, estado, activo)
values ('Prueba F5 sin efecto', 'campana', :'hoy'::date + 20, :'hoy'::date + 22, null, array[:'tc']::uuid[], 'aprobado', true) returning id as cs \\gset
insert into retail.ubicacion_metas_dia (ubicacion_id, dia_semana, meta) select :'tc', d, 1180 from generate_series(0, 6) d;
insert into retail.campana_efecto_caja (etiqueta_id, ubicacion_id, meta_pct, fondo) values (:'cv', :'tc', 30, null);

select pg_temp.vender('B' || i, :'tc', (:'d0'::date - i)::timestamp at time zone 'America/Lima' + interval '12 hours', :'va', 1, 118, 0, 40, '[{"m":"efectivo","v":118}]')
  from generate_series(1, 14) i;
select pg_temp.vender('X1', :'tc', (:'d0'::date - 3)::timestamp at time zone 'America/Lima' + interval '15 hours', :'va', 1, 11800, 0, 40, '[{"m":"efectivo","v":11800}]');
select pg_temp.vender('C' || i, :'tc', (:'d0'::date + i)::timestamp at time zone 'America/Lima' + interval '12 hours', :'va', 2, 118, 23.60, 40, '[{"m":"efectivo","v":188.80}]', null, null, :'cp')
  from generate_series(0, 6) i;
-- Dos ventas recientes en días sin campaña (margen 70 %).
select pg_temp.vender('R' || x.n, :'tc', x.d::timestamp at time zone 'America/Lima' + interval '12 hours', :'va', 1, 118, 0, 30, '[{"m":"yape","v":118}]')
  from (select row_number() over (order by d desc) as n, d::date as d from generate_series(:'hoy'::date - 1, :'hoy'::date - 56, interval '-1 day') d
         where not exists (select 1 from retail.etiquetas e where e.estilo = 'campana' and e.activo and e.estado = 'aprobado' and e.vigente_desde is not null
                            and d between e.vigente_desde and e.vigente_hasta
                            and (e.sedes_permitidas is null or cardinality(e.sedes_permitidas) = 0 or :'tc' = any (e.sedes_permitidas)))
         order by d desc limit 2) x;

create temp table cr as select * from retail.fn_campanas_reporte(:'tc');
select 'K1 la pasada: vendió 1,120 sin IGV en 7 días, 14 prendas', (select momento = 'pasada' and dias = 7 and ventas = 1120 and prendas = 14 from cr where etiqueta_id = :'cp');
select 'K1 su normal = 700: mismo día de la semana, 8 semanas antes, sin el día con otra campaña', (select normal = 700 from cr where etiqueta_id = :'cp');
select 'K1 se descontaron 280 sin IGV (venta_items.descuento_etiqueta_id)', (select descuento = 280 from cr where etiqueta_id = :'cp');
select 'K1 margen 50 % contra 60 % normal, y margen extra = +140', (select margen_pct = 0.5 and margen_normal_pct = 0.6 and margen_extra = 140 from cr where etiqueta_id = :'cp');
select 'K2 la que viene: 15 % de descuento, la meta sube 30 %', (select momento = 'viene' and descuento_pct = 15 and meta_pct = 30 and con_efecto from cr where etiqueta_id = :'cv');
select 'K2 meta de la campaña 9,100 sin IGV contra 7,000 normal (suma de las metas del día)', (select meta_campana = 9100 and meta_normal = 7000 from cr where etiqueta_id = :'cv');
select 'K2 su margen normal es el de las últimas 8 semanas sin campaña (70 %)', (select margen_normal_pct = 0.7 from cr where etiqueta_id = :'cv');
select 'K3 una campaña sin efecto en la caja lo dice (sin % de meta)', (select not con_efecto and meta_pct is null and meta_campana = meta_normal from cr where etiqueta_id = :'cs');
${cambiaA(MICAELA)}
${conModulo("reportes_financieros")}
select 'K4 con el módulo, una colaboradora no ve las campañas de otra tienda', (select count(*) = 0 from retail.fn_campanas_reporte() where etiqueta_id in (:'cp', :'cv'));
select 'K4 ni puede pedirlas', (select pg_temp.intento(format('select * from retail.fn_campanas_reporte(%L)', :'tc')) like '%esa ubicación%');
`;

// ============================================================================================================================
// VOLUMEN (lo que #170 midió con tres años en un Postgres efímero; aquí un año en la base local, dentro de ROLLBACK):
// ≈ 20 mil tickets en 2031 entre Trujillo y Lima, 1,8 líneas por ticket, 5 % anulados, 3 % con devolución, 1 % con cambio,
// 30 mil movimientos (2 % mermas) y 150 gastos al mes.
// ============================================================================================================================
const VOLUMEN = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select setseed(0.42);
create temp table ub as select id, row_number() over (order by nombre) as n from retail.ubicaciones where nombre in ('Tienda Trujillo', 'Tienda Lima');
create temp table vs as select id, row_number() over (order by id) as n from (select id from retail.variantes where id <> '22222222-2222-4222-8222-222222222222' order by id limit 40) x;
select count(*) as nvs from vs \\gset
insert into retail.ventas (id, ubicacion_id, estado, anulado_en, motivo_anulacion, created_at)
  select gen_random_uuid(), (select id from ub where n = 1 + (x.g % 2)),
         case when x.anula then 'anulada' else 'completada' end, case when x.anula then x.ts + interval '2 days' end,
         case when x.anula then 'volumen' end, x.ts
    from (select g, random() < 0.05 as anula, timestamptz '2031-01-01 09:00-05' + (random() * interval '364 days') as ts
            from generate_series(1, 20000) g) x;
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  select x.id, (select vs.id from vs where vs.n = x.k), 1 + floor(random() * 2)::int, round((60 + random() * 140)::numeric, 2), 0,
         case when random() < 0.8 then round((20 + random() * 50)::numeric, 2) else 0 end
    from (select v.id, 1 + floor(random() * :nvs)::int as k, case when random() < 0.45 then 1 when random() < 0.8 then 2 else 3 end as nl
            from retail.ventas v where v.created_at >= '2031-01-01') x,
         lateral generate_series(1, x.nl) l;
insert into retail.venta_pagos (venta_id, metodo, monto)
  select t.venta_id, (array['efectivo', 'tarjeta', 'yape', 'plin', 'transferencia'])[1 + floor(random() * 5)::int], t.tot
    from (select vi.venta_id, sum(vi.subtotal) as tot from retail.venta_items vi join retail.ventas v on v.id = vi.venta_id
           where v.created_at >= '2031-01-01' group by vi.venta_id) t;
insert into retail.devoluciones (venta_id, ubicacion_id, motivo, estado, reembolso_metodo, aprobado_en)
  select id, ubicacion_id, 'talla', 'aprobada', 'efectivo', created_at + interval '3 days'
    from retail.ventas where created_at >= '2031-01-01' and estado = 'completada' and random() < 0.03;
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion)
  select d.id, (select vi.id from retail.venta_items vi where vi.venta_id = d.venta_id limit 1), 1, 'vendible'
    from retail.devoluciones d where d.aprobado_en >= '2031-01-01';
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, motivo, condicion, created_at)
  select x.id, x.ubicacion_id, (select vs.id from vs where vs.n = 1), 1, 10, 'efectivo', 'talla_chica', 'vendible', x.created_at + interval '1 day'
    from (select vi.id, v.ubicacion_id, v.created_at from retail.venta_items vi join retail.ventas v on v.id = vi.venta_id
           where v.created_at >= '2031-01-01' and v.estado = 'completada' and random() < 0.01) x;
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
  select (select vs.id from vs where vs.n = x.k), (select ub.id from ub where ub.n = 1 + (x.g % 2)),
         case when x.r < 0.02 then 'ajuste' when x.r < 0.6 then 'entrada' else 'salida' end,
         case when x.r < 0.02 then -1 else 1 + floor(random() * 3)::int end,
         case when x.r < 0.01 then 'merma' when x.r < 0.02 then 'conteo' when x.r < 0.6 then 'recepcion' else 'venta' end,
         timestamptz '2031-01-01 09:00-05' + (random() * interval '364 days')
    from (select g, random() as r, 1 + floor(random() * :nvs)::int as k from generate_series(1, 30000) g) x;
insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago)
  select case when random() < 0.2 then null else (select id from ub where n = 1 + (g % 2)) end,
         (array['alquileres', 'servicios_basicos', 'transporte', 'suministros'])[1 + (g % 4)], 'gasto simulado',
         date '2031-01-01' + floor(random() * 364)::int, round((50 + random() * 900)::numeric, 2), 0, 'transferencia'
    from generate_series(1, 1800) g;
analyze retail.ventas; analyze retail.venta_items; analyze retail.movimientos;
create function pg_temp.medir(p_sql text) returns numeric language plpgsql as $f$
declare t timestamptz := clock_timestamp();
begin
  execute p_sql;
  return round(extract(epoch from clock_timestamp() - t) * 1000);
end $f$;
select 'volumen', (select count(*) from retail.ventas where created_at >= '2031-01-01'), (select count(*) from retail.venta_items vi join retail.ventas v on v.id = vi.venta_id where v.created_at >= '2031-01-01'),
       (select count(*) from retail.movimientos where created_at >= '2031-01-01');
select 'ms_er_mes', pg_temp.medir($$select count(*) from retail.fn_estado_resultados('2031-06-01', '2031-06-30')$$);
select 'ms_diario_mes', pg_temp.medir($$select count(*) from retail.fn_asientos('2031-06-01', '2031-06-30')$$);
select 'ms_diario_anio', pg_temp.medir($$select count(*) from retail.fn_asientos('2031-01-01', '2031-12-31')$$);
select 'ms_er_anio', pg_temp.medir($$select count(*) from retail.fn_estado_resultados('2031-01-01', '2031-12-31')$$);
select 'lineas_anio', (select count(*) from retail.fn_asientos('2031-01-01', '2031-12-31'));
select 'cuadra_anio', (select count(*) = 0 from retail.fn_asientos_descuadrados('2031-01-01', '2031-12-31'));
`;

// ---------------------------------------------------------------------------------------------------------------------------
verificar("Estado de resultados", correr(`${ESCENA}${CASOS_ER}`), casosDe(CASOS_ER));
verificar("Descuadre", correr(`${ESCENA}${CASOS_DESCUADRE}`), casosDe(CASOS_DESCUADRE));
verificar("Sin planilla", correr(`${ESCENA}${CASOS_SIN_PLANILLA}`), casosDe(CASOS_SIN_PLANILLA));
verificar("Permisos", correr(`${ESCENA}${CASOS_PERMISOS}`), casosDe(CASOS_PERMISOS));
verificar("Tasa", correr(`${ESCENA}${CASOS_TASA}`), casosDe(CASOS_TASA));
verificar("Comisión del POS", correr(`${ESCENA}${CASOS_COMISION}`), casosDe(CASOS_COMISION));
verificar("Campañas", correr(CAMPANAS), casosDe(CAMPANAS));

{
  const r = correr(VOLUMEN);
  const v = new Map((r.ok ? r.salida.split("\n") : []).map((l) => l.split("|")).map(([k, ...x]) => [k, x]));
  if (r.ok) {
    const [tickets, lineas, movs] = v.get("volumen") ?? [];
    console.log(`  volumen: ${tickets} tickets, ${lineas} líneas, ${movs} movimientos · diario del año: ${v.get("lineas_anio")?.[0]} líneas`);
    console.log(`  tiempos: estado de resultados de un mes ${v.get("ms_er_mes")?.[0]} ms · diario de un mes ${v.get("ms_diario_mes")?.[0]} ms · diario del año ${v.get("ms_diario_anio")?.[0]} ms · estado del año ${v.get("ms_er_anio")?.[0]} ms`);
  }
  esperar("V1 con un año de datos, el diario del año cuadra entero", r.ok && v.get("cuadra_anio")?.[0] === "t", r);
  esperar("V1 el estado de resultados de un mes tarda menos de 2 s", r.ok && Number(v.get("ms_er_mes")?.[0]) < 2000, r.ok ? v.get("ms_er_mes") : r);
  esperar("V1 el diario de un año entero, menos de 10 s", r.ok && Number(v.get("ms_diario_anio")?.[0]) < 10000, r.ok ? v.get("ms_diario_anio") : r);
}

console.log(fallos ? `\n${fallos} de ${casos} verificaciones fallaron` : `\nLas ${casos} verificaciones pasaron`);
process.exit(fallos ? 1 : 0);

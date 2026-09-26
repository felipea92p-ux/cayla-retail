#!/usr/bin/env node
/**
 * Prueba de ADR-0195 F9 — Cierre de mes (`20260925180000_finanzas_cierre_de_mes.sql`; ADR-0198).
 *
 * QUÉ CUBRE
 *   · cerrar una unidad congela su diario (las líneas de `fn_asientos`) con una huella SHA-256 que se puede recalcular;
 *   · con el mes cerrado NO se puede registrar, cambiar ni anular nada con fecha de ese mes en esa unidad: gastos, facturas
 *     (mercadería y gasto), pagos, notas de crédito, activos (su alta, su anulación y su baja, en todos los meses que
 *     deprecia), movimientos de dinero (las dos puntas), marcar una venta «de prueba» y cambiar el costo de una prenda vendida;
 *   · HOY sigue libre: gastos, pagos, notas y bajas con fecha de hoy; anular una venta o aprobar una devolución de hoy sobre
 *     una venta del mes cerrado va al mes de HOY y el mes cerrado no cambia;
 *   · las otras unidades del mismo mes siguen abiertas;
 *   · el consolidado exige todas las unidades; su huella es la de las huellas;
 *   · reabrir pide motivo, queda en la historia y reabre el consolidado; volver a cerrar crea la versión 2 sin borrar la 1;
 *   · los chequeos: cajas abiertas, egresos sin clasificar, prendas por regularizar y diario descuadrado BLOQUEAN; gastos
 *     fijos que faltan, bancos sin conciliar y prendas sin costo AVISAN y quedan guardados en el cierre;
 *   · `fn_diario` trae lo congelado aunque el diario vivo cambie, y el chequeo de la huella lo delata;
 *   · solo el líder (el módulo no se delega); nadie lee las tablas directo; lo congelado no se edita ni se borra.
 *
 * CÓMO. Igual que `estado_resultados.mjs`: cada bloque en su transacción con ROLLBACK (otros agentes prueban a la vez), sesión
 * simulada con `request.jwt.claim.sub`, y cada verificación es una línea `select 'caso', <verdadero>`. El mes de prueba es
 * MARZO DE 2025: ya terminó y no tiene datos de nadie.
 *
 * USO
 *   pnpm pruebas:cierre-mes    → con las migraciones ya aplicadas en el local
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
  for (const caso of esperados) esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-800) });
}
/** Los nombres de caso de un bloque SQL: cada `select 'NOMBRE',` de verificación. */
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
-- Una venta de UNA línea con sus cobros (jsonb [{m, v}]).
create function pg_temp.vender(p_n text, p_ubic uuid, p_cuando timestamptz, p_var uuid, p_precio numeric, p_costo numeric, p_pagos jsonb)
returns void language plpgsql as $f$
declare x jsonb;
begin
  insert into retail.ventas (id, ubicacion_id, estado, created_at) values (pg_temp.k(p_n), p_ubic, 'completada', p_cuando);
  insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (pg_temp.k(p_n || 'i'), pg_temp.k(p_n), p_var, 1, p_precio, 0, p_costo);
  for x in select * from jsonb_array_elements(p_pagos) loop
    insert into retail.venta_pagos (venta_id, metodo, monto) values (pg_temp.k(p_n), x ->> 'm', (x ->> 'v')::numeric);
  end loop;
end $f$;
-- El estado de una unidad de marzo de 2025 y uno de sus chequeos.
create function pg_temp.est(p_alcance text, p_ubic uuid) returns retail.periodos language sql as $f$
  select * from retail.periodos where mes = '2025-03-01' and alcance = p_alcance and ubicacion_id is not distinct from p_ubic
$f$;
create function pg_temp.chequeo(p_ubic uuid, p_clave text, p_alcance text default 'ubicacion') returns jsonb language sql as $f$
  select x from retail.fn_cierre_mes_estado('2025-03-01') e, jsonb_array_elements(e.chequeos) x
   where e.alcance = p_alcance and e.ubicacion_id is not distinct from p_ubic and x ->> 'clave' = p_clave
$f$;
`;

// ============================================================================================================================
// LA ESCENA: MARZO DE 2025 en Tienda Trujillo (TRU). Un anuncio por Yape (150), la luz con factura a crédito (236 = 200 + 36),
// una factura de mercadería a crédito (1,180), una vitrina comprada en febrero (1,200 por Yape; se deprecia S/ 10 al mes desde
// marzo) y una venta del 10 de marzo (100 en efectivo, costo 40). Todo antes de cerrar.
// ============================================================================================================================
const ESCENA = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tal from retail.ubicaciones where tipo = 'taller' order by activo desc, created_at limit 1 \\gset
select p.id as felipe from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select v.id as va from retail.variantes v where v.id <> '22222222-2222-4222-8222-222222222222' order by v.id limit 1 \\gset
select id as cf_tru from retail.cuentas_dinero where tipo = 'caja_fuerte' and ubicacion_id = :'tru' \\gset
select id as cf_lim from retail.cuentas_dinero where tipo = 'caja_fuerte' and ubicacion_id = :'lim' \\gset
select id as rendir from retail.cuentas_dinero where tipo = 'por_rendir' order by created_at limit 1 \\gset
insert into retail.proveedores (nombre, activo) values ('Proveedor de prueba F9', true) returning id as prov \\gset
select retail.registrar_gasto(:'tru', 'publicidad', 'Anuncio de marzo', '2025-03-10', 150, null, 'yape') as g1 \\gset
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Luz de marzo', '2025-03-12', 236,
  jsonb_build_object('tipo','factura','proveedor_id',:'prov','serie','F9A','numero','1','condicion','credito','fecha_vencimiento','2025-04-12')) as g2 \\gset
insert into retail.compras (proveedor_id, serie, numero, condicion, fecha_emision, fecha_vencimiento, subtotal, igv, total, ubicacion_gestion_id)
values (:'prov', 'F9M', '1', 'credito', '2025-03-15', '2025-04-15', 1000, 180, 1180, :'tru') returning id as c3 \\gset
select retail.registrar_activo(:'tru', 'muebles', 'Vitrina', '2025-02-10', 1200, null, 'yape') as a1 \\gset
select pg_temp.vender('S1', :'tru', '2025-03-10 12:00-05', :'va', 100, 40, '[{"m":"efectivo","v":100}]');
select pg_temp.vender('S4', :'tru', '2025-03-11 12:00-05', :'va', 100, 40, '[{"m":"yape","v":100}]');
`;

const HOY = "retail.fn_hoy_lima()";

// ---- A · Cerrar TRU congela su diario, y el candado por fecha ----------------------------------------------------------------
const CASOS_CIERRE = `
select 'A0 antes de cerrar: TRU está lista (ningún chequeo que bloquee)', (select bloqueantes = 0 and estado = 'abierto' from retail.fn_cierre_mes_estado('2025-03-01') where ubicacion_id = :'tru');
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'tru') as r \\gset
select 'A1 cerrar devuelve la huella (64 hex) y la versión 1', (select (:'r'::jsonb ->> 'huella') ~ '^[0-9a-f]{64}$' and (:'r'::jsonb ->> 'version')::int = 1);
select 'A1 el período queda cerrado con su cierre', (select estado = 'cerrado' and cierre_id = (:'r'::jsonb ->> 'cierre_id')::uuid from pg_temp.est('ubicacion', :'tru'));
select 'A1 lo congelado son exactamente las líneas del diario de TRU en marzo',
  (select count(*) from retail.diario_cerrado where cierre_id = (:'r'::jsonb ->> 'cierre_id')::uuid) = (select count(*) from retail.fn_asientos('2025-03-01', '2025-03-31', :'tru'))
  and (select count(*) from retail.fn_asientos('2025-03-01', '2025-03-31', :'tru')) = (:'r'::jsonb ->> 'lineas')::int;
select 'A1 incluye los gastos (anuncio y luz), la factura, la depreciación de la vitrina y la venta',
  (select count(distinct regla) = 4 and bool_or(regla = 'depreciacion' and debe = 10) from retail.diario_cerrado where cierre_id = (:'r'::jsonb ->> 'cierre_id')::uuid);
select 'A1 la huella se recalcula igual desde las líneas guardadas', (select retail.fn_huella_congelada((:'r'::jsonb ->> 'cierre_id')::uuid) = :'r'::jsonb ->> 'huella');
select 'A1 quién cerró: el líder (firma con el responsable)', (select cerrado_por = :'felipe' from retail.periodo_cierres where id = (:'r'::jsonb ->> 'cierre_id')::uuid);
select 'A2 no se cierra dos veces', (select pg_temp.intento(format('select retail.cerrar_periodo(%L, ''ubicacion'', %L)', '2025-03-01', :'tru')) like 'Marzo 2025 de Tienda Trujillo ya está cerrado%');
select 'A2 el mes en curso no se cierra', (select pg_temp.intento(format('select retail.cerrar_periodo(%L, ''ubicacion'', %L)', ${HOY}, :'tru')) = 'Solo se cierra un mes que ya terminó.');
select 'A3 registrar un gasto de TRU con fecha de marzo: «Marzo 2025 de Tienda Trujillo está cerrado: reábrelo con motivo o registra con fecha de …»',
  (select pg_temp.intento(format('select retail.registrar_gasto(%L, ''publicidad'', ''Otro anuncio'', ''2025-03-20'', 50, null, ''yape'')', :'tru'))
          like 'Marzo 2025 de Tienda Trujillo está cerrado: reábrelo con motivo o registra con fecha de %.');
select 'A3 anular un gasto de marzo: «… para anular este gasto.»',
  (select pg_temp.intento(format('select retail.anular_gasto(%L, ''se duplicó'')', :'g1')) = 'Marzo 2025 de Tienda Trujillo está cerrado: reábrelo con motivo para anular este gasto.');
select 'A3 ni el gasto con factura (ni su factura)', (select pg_temp.intento(format('select retail.anular_gasto(%L, ''no era'')', :'g2')) like '%está cerrado%');
select 'A3 Lima, el mismo mes, sigue abierta', (select pg_temp.intento(format('select retail.registrar_gasto(%L, ''publicidad'', ''Anuncio LIM'', ''2025-03-20'', 50, null, ''yape'')', :'lim')) = 'SIN_ERROR');
select 'A3 lo «de la empresa», el mismo mes, sigue abierto', (select pg_temp.intento('select retail.registrar_gasto(null, ''publicidad'', ''Anuncio general'', ''2025-03-20'', 50, null, ''yape'')') = 'SIN_ERROR');
select 'A3 HOY sigue libre: un gasto de TRU con fecha de hoy', (select pg_temp.intento(format('select retail.registrar_gasto(%L, ''publicidad'', ''Anuncio de hoy'', %L, 50, null, ''yape'')', :'tru', ${HOY})) = 'SIN_ERROR');
select 'A4 una factura de mercadería de TRU con fecha de marzo no entra',
  (select pg_temp.intento(format('insert into retail.compras (proveedor_id, serie, numero, condicion, fecha_emision, fecha_vencimiento, subtotal, igv, total, ubicacion_gestion_id) values (%L, ''F9M'', ''2'', ''credito'', ''2025-03-25'', ''2025-04-25'', 100, 18, 118, %L)', :'prov', :'tru')) like 'Marzo 2025 de Tienda Trujillo está cerrado%');
select 'A4 ni se anula la de marzo', (select pg_temp.intento(format('update retail.compras set estado = ''anulada'', motivo_anulacion = ''x'' where id = %L', :'c3')) = 'Marzo 2025 de Tienda Trujillo está cerrado: reábrelo con motivo para anular esta factura.');
select 'A4 ni cambia su monto ni su fecha', (select pg_temp.intento(format('update retail.compras set fecha_emision = ''2025-04-01'' where id = %L', :'c3')) like '%para cambiar esta factura.');
select 'A4 un pago con fecha de marzo no entra', (select pg_temp.intento(format('select retail.registrar_pago_compra(%L, 100, ''transferencia'', null, ''2025-03-28'')', :'c3')) like 'Marzo 2025 de Tienda Trujillo está cerrado%');
select 'A4 HOY: se paga la factura de marzo (el pago es de hoy)', (select pg_temp.intento(format('select retail.registrar_pago_compra(%L, 100, ''transferencia'', null, %L)', :'c3', ${HOY})) = 'SIN_ERROR');
select 'A4 y su saldo baja (el pago suma a «pagado» sin tocar el candado de la factura)', (select pagado = 100 from retail.compras where id = :'c3');
select 'A4 una nota de crédito con fecha de marzo no entra', (select pg_temp.intento(format('select retail.registrar_nota_credito_compra(%L, ''NC-9'', ''2025-03-29'', 118, ''descuento'')', :'c3')) like '%está cerrado%');
select 'A4 HOY: la nota de crédito de hoy sí', (select pg_temp.intento(format('select retail.registrar_nota_credito_compra(%L, ''NC-9'', %L, 118, ''descuento'')', :'c3', ${HOY})) = 'SIN_ERROR');
select 'A4 un reembolso del proveedor con fecha de marzo no entra', (select pg_temp.intento(format('insert into retail.proveedor_creditos (proveedor_id, tipo, monto, fecha, compra_id, metodo) values (%L, ''reembolso'', 10, ''2025-03-30'', %L, ''transferencia'')', :'prov', :'c3')) like '%está cerrado%');
select 'A5 un activo de TRU comprado en ENERO tampoco: se deprecia en marzo',
  (select pg_temp.intento(format('select retail.registrar_activo(%L, ''muebles'', ''Banca'', ''2025-01-15'', 600, null, ''yape'')', :'tru'))
          = 'Marzo 2025 de Tienda Trujillo está cerrado y este activo se deprecia en ese mes: reábrelo con motivo para registrarlo.');
select 'A5 uno comprado en abril sí (empieza a depreciarse en mayo)', (select pg_temp.intento(format('select retail.registrar_activo(%L, ''muebles'', ''Banca'', ''2025-04-10'', 600, null, ''yape'')', :'tru')) = 'SIN_ERROR');
select 'A5 la vitrina de febrero no se anula (sus depreciaciones de marzo desaparecerían)', (select pg_temp.intento(format('select retail.anular_activo(%L, ''error'')', :'a1')) = 'Marzo 2025 de Tienda Trujillo está cerrado: reábrelo con motivo para anular este activo.');
select 'A5 ni se da de baja con fecha de marzo', (select pg_temp.intento(format('select retail.dar_de_baja_activo(%L, ''2025-03-20'', ''se rompió'')', :'a1')) like '%para darlo de baja con esa fecha.');
select 'A5 HOY: sí se da de baja con fecha de hoy', (select pg_temp.intento(format('select retail.dar_de_baja_activo(%L, %L, ''se rompió'')', :'a1', ${HOY})) = 'SIN_ERROR');
select 'A6 un aporte del dueño a la caja fuerte de TRU con fecha de marzo no entra', (select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''aporte'', 100, null, %L, ''2025-03-15'')', :'cf_tru')) like 'Marzo 2025 de Tienda Trujillo está cerrado%');
select 'A6 a la caja fuerte de Lima sí', (select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''aporte'', 100, null, %L, ''2025-03-15'')', :'cf_lim')) = 'SIN_ERROR');
select 'A6 y al efectivo del líder (de la empresa) también', (select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''aporte'', 100, null, %L, ''2025-03-15'')', :'rendir')) = 'SIN_ERROR');
select 'A7 marcar «de prueba» una venta de marzo no se puede', (select pg_temp.intento(format('select retail.archivar_venta_prueba(%L)', pg_temp.k('S1'))) = 'Marzo 2025 de Tienda Trujillo está cerrado: reábrelo con motivo para marcar esta venta como de prueba.');
select 'A7 ni cambiar el costo de una prenda vendida en marzo (regularizar)', (select pg_temp.intento(format('update retail.venta_items set costo_unitario = 55 where id = %L', pg_temp.k('S1i'))) like '%para cambiar esta prenda vendida (regularizarla).');
select 'A7 HOY: vender hoy en TRU no choca con nada', (select pg_temp.intento(format('select pg_temp.vender(''S3'', %L, now(), %L, 50, 20, ''[{"m":"yape","v":50}]'')', :'tru', :'va')) = 'SIN_ERROR');
select 'A7 HOY: la venta de marzo SÍ se anula hoy (el mostrador no se bloquea)', (select pg_temp.intento(format('update retail.ventas set estado = ''anulada'', anulado_en = now(), motivo_anulacion = ''la clienta volvió'' where id = %L', pg_temp.k('S1'))) = 'SIN_ERROR');
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_metodo, aprobado_en) values (pg_temp.k('D1'), pg_temp.k('S4'), :'tru', 'talla', 'aprobada', 'yape', now());
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (pg_temp.k('D1'), pg_temp.k('S4i'), 1, 'vendible');
select 'A7 la anulación (de S1) y la devolución (de S4) de hoy van al mes de HOY', (select count(*) filter (where regla = 'anulacion') > 0 and count(*) filter (where regla = 'devolucion') > 0 from retail.fn_asientos(${HOY}, ${HOY}, :'tru') where origen_id in (pg_temp.k('S1'), pg_temp.k('D1')));
select 'A8 después de todo eso, el diario de marzo de TRU da la MISMA huella', (select (pg_temp.chequeo(:'tru', 'huella') ->> 'ok')::boolean);
select 'A8 y lo congelado no se tocó', (select retail.fn_huella_congelada((:'r'::jsonb ->> 'cierre_id')::uuid) = :'r'::jsonb ->> 'huella');
select 'A9 lo congelado no se edita', (select pg_temp.intento(format('update retail.diario_cerrado set debe = debe + 1 where cierre_id = %L', :'r'::jsonb ->> 'cierre_id')) like 'El diario de un mes cerrado no se modifica%');
select 'A9 ni se borra', (select pg_temp.intento(format('delete from retail.diario_cerrado where cierre_id = %L', :'r'::jsonb ->> 'cierre_id')) like 'El diario de un mes cerrado no se modifica%');
select 'A9 el cierre no cambia su huella', (select pg_temp.intento(format('update retail.periodo_cierres set huella = repeat(''0'', 64) where id = %L', :'r'::jsonb ->> 'cierre_id')) like 'Un cierre de mes no se edita%');
select 'A9 ni el período se borra', (select pg_temp.intento(format('delete from retail.periodos where mes = %L', '2025-03-01')) like 'Un período no se borra%');
select 'A10 fn_mes_cerrado: TRU marzo sí; Lima marzo, TRU abril y hoy no',
  retail.fn_mes_cerrado(:'tru', '2025-03-31') and not retail.fn_mes_cerrado(:'lim', '2025-03-31') and not retail.fn_mes_cerrado(:'tru', '2025-04-01') and not retail.fn_mes_cerrado(:'tru', ${HOY});
`;

// ---- B · El consolidado, reabrir y volver a cerrar ----------------------------------------------------------------------------
const CASOS_CONSOLIDADO = `
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'tru') as r1 \\gset
select 'B1 CAYLA entera no se cierra con unidades abiertas, y dice cuáles', (select pg_temp.intento('select retail.cerrar_periodo(''2025-03-01'', ''consolidado'')') like 'CAYLA entera se cierra cuando cerraron todas: falta %Tienda Lima%Taller%De la empresa.');
select 'B1 el consolidado cuenta cuántas faltan (las 3 que siguen abiertas, al menos)', (select bloqueantes >= 3 and estado = 'abierto' from retail.fn_cierre_mes_estado('2025-03-01') where alcance = 'consolidado');
select e.alcance, e.ubicacion_id, retail.cerrar_periodo('2025-03-01', e.alcance, e.ubicacion_id) from retail.fn_cierre_mes_estado('2025-03-01') e where e.alcance <> 'consolidado' and e.estado <> 'cerrado' \\g /dev/null
select retail.cerrar_periodo('2025-03-01', 'consolidado') as rc \\gset
select 'B2 con todas cerradas, CAYLA entera se cierra', (select estado = 'cerrado' from pg_temp.est('consolidado', null));
select 'B2 su huella es la de las huellas de sus unidades',
  (select c.huella = retail.fn_huella_de_textos(array(select concat_ws('|', p.alcance, coalesce(p.ubicacion_id::text, '-'), u.huella)
                                                        from retail.periodos p join retail.periodo_cierres u on u.id = p.cierre_id
                                                       where p.mes = '2025-03-01' and p.alcance <> 'consolidado'))
     from retail.periodo_cierres c where c.id = (:'rc'::jsonb ->> 'cierre_id')::uuid);
select 'B2 y suma las líneas de todas', (select c.lineas = (select sum(u.lineas) from retail.periodos p join retail.periodo_cierres u on u.id = p.cierre_id where p.mes = '2025-03-01' and p.alcance <> 'consolidado') from retail.periodo_cierres c where c.id = (:'rc'::jsonb ->> 'cierre_id')::uuid);
select 'B3 reabrir sin motivo no se puede', (select pg_temp.intento(format('select retail.reabrir_periodo(''2025-03-01'', ''ubicacion'', %L, ''  '')', :'tru')) = 'Di por qué se reabre (queda en la historia).');
select 'B3 CAYLA entera no se reabre sola (se reabre con una unidad)', (select pg_temp.intento('select retail.reabrir_periodo(''2025-03-01'', ''consolidado'', null, ''porque sí'')') like 'Se reabre una tienda%');
select retail.reabrir_periodo('2025-03-01', 'ubicacion', :'tru', 'llegó una factura de marzo tarde');
select 'B4 TRU queda reabierta y sin cierre vigente', (select estado = 'reabierto' and cierre_id is null from pg_temp.est('ubicacion', :'tru'));
select 'B4 la historia dice quién, cuándo y por qué', (select reabierto_por = :'felipe' and reabierto_en is not null and motivo_reapertura = 'llegó una factura de marzo tarde' from retail.periodo_cierres where id = (:'r1'::jsonb ->> 'cierre_id')::uuid);
select 'B4 reabrir TRU reabre CAYLA entera, con el motivo', (select p.estado = 'reabierto' and c.motivo_reapertura = 'Se reabrió Tienda Trujillo: llegó una factura de marzo tarde'
   from retail.periodos p join retail.periodo_cierres c on c.periodo_id = p.id where p.mes = '2025-03-01' and p.alcance = 'consolidado');
select 'B4 Lima sigue cerrada', (select estado = 'cerrado' from pg_temp.est('ubicacion', :'lim'));
select 'B5 reabierta, TRU acepta el gasto de marzo', (select pg_temp.intento(format('select retail.registrar_gasto(%L, ''publicidad'', ''Factura tardía'', ''2025-03-28'', 80, null, ''yape'')', :'tru')) = 'SIN_ERROR');
select 'B5 y Lima (cerrada) todavía no', (select pg_temp.intento(format('select retail.registrar_gasto(%L, ''publicidad'', ''x'', ''2025-03-28'', 80, null, ''yape'')', :'lim')) like 'Marzo 2025 de Tienda Lima está cerrado%');
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'tru') as r2 \\gset
select 'B6 volver a cerrar crea la versión 2, con otra huella (entró el gasto)', (select (:'r2'::jsonb ->> 'version')::int = 2 and (:'r2'::jsonb ->> 'huella') <> (:'r1'::jsonb ->> 'huella'));
select 'B6 la versión 1 sigue guardada, entera', (select count(*) = (:'r1'::jsonb ->> 'lineas')::int from retail.diario_cerrado where cierre_id = (:'r1'::jsonb ->> 'cierre_id')::uuid);
select 'B6 la historia de marzo tiene los dos cierres de TRU', (select count(*) = 2 from jsonb_array_elements(retail.fn_cierre_panel('2025-03-01') -> 'historia') h where h ->> 'ubicacion_id' = :'tru');
select 'B7 el panel: marzo con sus unidades y el consolidado al final', (select (p ->> 'mes') = '2025-03' and (p -> 'unidades' -> -1 ->> 'alcance') = 'consolidado' from (select retail.fn_cierre_panel('2025-03-01') p) x);
select 'B7 el panel ofrece los 12 meses que terminaron', (select jsonb_array_length(retail.fn_cierre_panel() -> 'meses') = 12);
select 'B7 pedir el mes en curso muestra el anterior', (select retail.fn_cierre_panel(${HOY}) ->> 'mes' = to_char(${HOY} - interval '1 month', 'YYYY-MM'));
`;

// ---- C · Los chequeos: los que bloquean y los que avisan ----------------------------------------------------------------------
const CASOS_CHEQUEOS = `
-- Una caja de TRU que se abrió el 30 de marzo y nunca se cerró, con un egreso que nadie clasificó.
select (select count(*) from (select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
insert into retail.cajas (ubicacion_id, estado, monto_apertura, abierta_en) values (:'tru', 'abierta', 100, '2025-03-30 09:00-05') returning id as caja \\gset
insert into retail.caja_movimientos (caja_id, tipo, monto, motivo, created_at) values (:'caja', 'egreso', 2300, 'Depósito bancario', '2025-03-31 18:00-05') returning id as egreso \\gset
select 'C1 una caja abierta del mes bloquea', (select not (x ->> 'ok')::boolean and (x ->> 'bloquea')::boolean and (x -> 'datos' ->> 'abiertas')::int = 1 and x -> 'datos' ->> 'desde' = '2025-03-30' from pg_temp.chequeo(:'tru', 'cajas') x);
select 'C1 un egreso sin clasificar bloquea, y dice cuál', (select not (x ->> 'ok')::boolean and (x -> 'datos' ->> 'n')::int = 1 and (x -> 'datos' ->> 'monto')::numeric = 2300 and x -> 'datos' ->> 'motivo' = 'Depósito bancario' from pg_temp.chequeo(:'tru', 'egresos') x);
select 'C1 cerrar con eso pendiente no se puede, y dice qué falta',
  (select pg_temp.intento(format('select retail.cerrar_periodo(''2025-03-01'', ''ubicacion'', %L)', :'tru')) = 'Todavía no se puede cerrar Marzo 2025 de Tienda Trujillo: falta cerrar las cajas del mes, clasificar los egresos de caja.');
select 'C1 todo o nada: no quedó ningún período ni línea congelada', (select count(*) = 0 from retail.periodos where mes = '2025-03-01') and (select count(*) = 0 from retail.periodo_cierres where mes = '2025-03-01');
update retail.cajas set estado = 'cerrada', cerrada_en = '2025-03-31 21:00-05', monto_cierre_real = 100, monto_cierre_sistema = 100, diferencia = 0 where id = :'caja';
select retail.marcar_egreso_no_gasto(:'egreso', 'deposito');
select 'C2 cerrada la caja y clasificado el egreso, los dos pasan', (select (pg_temp.chequeo(:'tru', 'cajas') ->> 'ok')::boolean and (pg_temp.chequeo(:'tru', 'egresos') ->> 'ok')::boolean);
-- Un descuadre (cobró 90 de una venta de 100) y una prenda vendida sin costo.
select pg_temp.vender('S2', :'tru', '2025-03-20 12:00-05', :'va', 100, 0, '[{"m":"yape","v":90}]');
select 'C3 un asiento descuadrado bloquea y dice cuál', (select not (x ->> 'ok')::boolean and (x ->> 'bloquea')::boolean and (x -> 'datos' ->> 'descuadrados')::int = 1 and x -> 'datos' ->> 'ejemplo' = 'venta:' || pg_temp.k('S2') from pg_temp.chequeo(:'tru', 'diario') x);
select 'C3 una prenda vendida sin costo avisa (no bloquea)', (select not (x ->> 'ok')::boolean and not (x ->> 'bloquea')::boolean and (x -> 'datos' ->> 'n')::int = 1 from pg_temp.chequeo(:'tru', 'sin_costo') x);
select 'C3 con el descuadre no se cierra', (select pg_temp.intento(format('select retail.cerrar_periodo(''2025-03-01'', ''ubicacion'', %L)', :'tru')) like '%falta que el diario cuadre.');
update retail.venta_pagos set monto = 100 where venta_id = pg_temp.k('S2');
-- Una prenda vendida en marzo sin variante (por regularizar).
insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado, vendido_en)
select pg_temp.k('S2i'), :'tru', 'Blusa sin código', (select id from retail.categorias limit 1), (select id from retail.tallas limit 1),
       (select codigo from retail.colores limit 1), 100, '2025-03-20 12:00-05';
select 'C4 una prenda por regularizar del mes bloquea', (select not (x ->> 'ok')::boolean and (x ->> 'bloquea')::boolean from pg_temp.chequeo(:'tru', 'regularizar') x);
update retail.prendas_por_regularizar set estado = 'anulada' where venta_item_id = pg_temp.k('S2i');
-- Un gasto fijo de TRU (alquiler, día 5) que en marzo no se registró.
select retail.guardar_gasto_fijo(null, :'tru', 'alquileres', 'Alquiler TRU', :'prov', 'factura', 2500, false, 5) as fijo \\gset
update retail.gastos_fijos set creado_en = '2025-01-01' where id = :'fijo';
select 'C5 el fijo que falta AVISA y dice cuál', (select not (x ->> 'ok')::boolean and not (x ->> 'bloquea')::boolean and x -> 'datos' -> 'cuales' = '["Alquiler TRU"]'::jsonb from pg_temp.chequeo(:'tru', 'fijos') x);
select retail.guardar_gasto_fijo(null, :'lim', 'alquileres', 'Alquiler LIM', :'prov', 'factura', 1800, false, 5) as fijo_lim \\gset
select 'C5 un fijo creado DESPUÉS del mes no cuenta', (select pg_temp.chequeo(:'lim', 'fijos') is null);
select 'C6 con solo avisos, TRU está lista (0 que bloqueen, 2 avisos)', (select bloqueantes = 0 and avisos = 2 from retail.fn_cierre_mes_estado('2025-03-01') where ubicacion_id = :'tru');
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'tru') as r \\gset
select 'C6 se cierra, y los avisos quedan guardados en el cierre', (select jsonb_array_length(avisos) = 2 and avisos @> '[{"clave":"fijos"},{"clave":"sin_costo"}]' from retail.periodo_cierres where id = (:'r'::jsonb ->> 'cierre_id')::uuid);
-- De la empresa: un banco que nunca se concilió.
select retail.crear_cuenta_dinero('BCP de prueba F9', 'banco', 0, '2025-01-01') as bcp \\gset
select 'C7 un banco sin conciliar al fin de mes AVISA en «de la empresa»', (select not (x ->> 'ok')::boolean and not (x ->> 'bloquea')::boolean and x -> 'datos' -> 'faltan' -> 0 ->> 'nombre' = 'BCP de prueba F9' from pg_temp.chequeo(null, 'conciliacion', 'empresa') x);
select retail.registrar_conciliacion(:'bcp', '2025-04-02', 0);
select 'C7 conciliado después del fin de mes, pasa', (select (x ->> 'ok')::boolean from pg_temp.chequeo(null, 'conciliacion', 'empresa') x);
select 'C8 el Taller sin caja no pide cierres de caja ni egresos', (select count(*) = 0 from retail.fn_cierre_mes_estado('2025-03-01') e, jsonb_array_elements(e.chequeos) x where e.ubicacion_id = :'tal' and x ->> 'clave' in ('cajas', 'egresos'))
  or exists (select 1 from retail.cajas where ubicacion_id = :'tal');
`;

// ---- D · Lo «de la empresa» y los movimientos de dinero (las dos puntas) --------------------------------------------------------
const CASOS_EMPRESA = `
select retail.crear_cuenta_dinero('BCP de prueba F9', 'banco', 0, '2025-01-01') as bcp \\gset
select retail.registrar_movimiento_dinero('aporte', 500, null, :'bcp', '2025-03-05') as m1 \\gset
select retail.registrar_gasto(null, 'publicidad', 'Anuncio general de marzo', '2025-03-06', 70, null, 'yape') as ge \\gset
select retail.cerrar_periodo('2025-03-01', 'empresa') as r \\gset
select 'D1 lo congelado de la empresa son solo sus líneas (ubicación nula)', (select count(*) > 0 and bool_and(ubicacion_id is null) from retail.diario_cerrado where cierre_id = (:'r'::jsonb ->> 'cierre_id')::uuid);
select 'D1 un gasto de la empresa con fecha de marzo no entra: «Marzo 2025 de la empresa está cerrado…»', (select pg_temp.intento('select retail.registrar_gasto(null, ''publicidad'', ''x'', ''2025-03-20'', 50, null, ''yape'')') like 'Marzo 2025 de la empresa está cerrado: reábrelo con motivo o registra con fecha de %');
select 'D1 ni se anula el de marzo', (select pg_temp.intento(format('select retail.anular_gasto(%L, ''error'')', :'ge')) like 'Marzo 2025 de la empresa está cerrado%');
select 'D1 TRU (abierta) sí registra en marzo', (select pg_temp.intento(format('select retail.registrar_gasto(%L, ''publicidad'', ''x'', ''2025-03-20'', 50, null, ''yape'')', :'tru')) = 'SIN_ERROR');
select 'D2 un aporte al banco con fecha de marzo no entra', (select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''aporte'', 100, null, %L, ''2025-03-15'')', :'bcp')) like 'Marzo 2025 de la empresa está cerrado%');
select 'D2 ni se anula el de marzo', (select pg_temp.intento(format('select retail.anular_movimiento_dinero(%L, ''error'')', :'m1')) = 'Marzo 2025 de la empresa está cerrado: reábrelo con motivo para anular este movimiento.');
select 'D2 un depósito de la caja fuerte de TRU (abierta) al banco (empresa, cerrada) tampoco: mira las dos puntas',
  (select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''deposito'', 50, %L, %L, ''2025-03-20'')', :'cf_tru', :'bcp')) like 'Marzo 2025 de la empresa está cerrado%');
select 'D2 HOY: el mismo depósito con fecha de hoy sí', (select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''aporte'', 50, null, %L, %L)', :'cf_tru', ${HOY})) = 'SIN_ERROR')
  and (select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''deposito'', 50, %L, %L, %L)', :'cf_tru', :'bcp', ${HOY})) = 'SIN_ERROR');
`;

// ---- E · fn_diario lee lo congelado; si el diario vivo cambia, la huella lo delata ----------------------------------------------
const CASOS_DIARIO = `
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'tru') as r \\gset
select 'E1 fn_diario de marzo de TRU = lo congelado, marcado «congelado»',
  (select count(*) = (:'r'::jsonb ->> 'lineas')::int and bool_and(congelado) from retail.fn_diario('2025-03-01', '2025-03-31', :'tru'));
select 'E1 fn_diario de Lima (abierta) = lo vivo', (select count(*) = (select count(*) from retail.fn_asientos('2025-03-01', '2025-03-31', :'lim')) and coalesce(bool_and(not congelado), true) from retail.fn_diario('2025-03-01', '2025-03-31', :'lim'));
select 'E1 abril de TRU (abierto) sale vivo junto a marzo congelado', (select bool_or(congelado) and bool_or(not congelado) from retail.fn_diario('2025-03-01', '2025-04-30', :'tru'));
-- Algo cambia el diario vivo de marzo SIN pasar por los candados (como si Dynamic cambiara una planilla ya cerrada).
set local session_replication_role = replica;
insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, medio_pago) values (:'tru', 'publicidad', 'Colado', '2025-03-25', 99, 'yape');
set local session_replication_role = origin;
select 'E2 fn_asientos (vivo) ya ve el cambio', (select count(*) = (:'r'::jsonb ->> 'lineas')::int + 2 from retail.fn_asientos('2025-03-01', '2025-03-31', :'tru'));
select 'E2 fn_diario sigue dando lo congelado', (select count(*) = (:'r'::jsonb ->> 'lineas')::int and bool_and(congelado) from retail.fn_diario('2025-03-01', '2025-03-31', :'tru'));
select 'E2 y el chequeo de la huella lo delata (avisa, no bloquea)', (select not (x ->> 'ok')::boolean and not (x ->> 'bloquea')::boolean and x -> 'datos' ->> 'congelada' = :'r'::jsonb ->> 'huella' from pg_temp.chequeo(:'tru', 'huella') x);
select 'E3 fn_periodos_mes: el líder ve TRU cerrada con su huella', (select count(*) = 1 from retail.fn_periodos_mes('2025-03-01') where ubicacion_id = :'tru' and estado = 'cerrado' and huella = :'r'::jsonb ->> 'huella');
`;

// ---- F · Solo el líder; nadie lee las tablas directo -----------------------------------------------------------------------------
const conModulo = (m) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${m}') on conflict do nothing;\n`;
const CASOS_PERMISOS = `
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'tru') as r \\gset
select 'F0 «Cierre de mes» no se le puede dar a un rol (no es delegable)', (select pg_temp.intento($$insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'cierre_mes')$$) like '«Cierre de mes» es solo del líder%');
${conModulo("reportes_financieros")}
${cambiaA(MICAELA)}
select 'F1 una colaboradora no ve el panel', (select pg_temp.intento('select retail.fn_cierre_panel()') = 'El cierre de mes es solo del líder.');
select 'F1 ni cierra', (select pg_temp.intento(format('select retail.cerrar_periodo(''2025-03-01'', ''ubicacion'', %L)', :'lim')) = 'Cerrar el mes es solo del líder.');
select 'F1 ni reabre', (select pg_temp.intento(format('select retail.reabrir_periodo(''2025-03-01'', ''ubicacion'', %L, ''porque sí, prueba'')', :'tru')) = 'Reabrir el mes es solo del líder.');
select 'F2 con «Reportes financieros» ve que SU tienda está cerrada (y nada más)', (select count(*) = 1 and bool_and(ubicacion_id = :'tru') from retail.fn_periodos_mes('2025-03-01'));
select 'F2 y fn_diario le da lo congelado de su tienda', (select count(*) = (:'r'::jsonb ->> 'lineas')::int and bool_and(congelado) from retail.fn_diario('2025-03-01', '2025-03-31', :'tru'));
select 'F2 pero no el de otra tienda', (select pg_temp.intento(format('select count(*) from retail.fn_diario(''2025-03-01'', ''2025-03-31'', %L)', :'lim')) = 'No puedes ver los números de esa ubicación.');
set local role authenticated;
select 'F3 nadie lee las tablas directo (períodos, cierres, diario congelado)',
  (select pg_temp.intento('select count(*) from retail.periodos') like 'permission denied%')
  and (select pg_temp.intento('select count(*) from retail.periodo_cierres') like 'permission denied%')
  and (select pg_temp.intento('select count(*) from retail.diario_cerrado') like 'permission denied%');
select 'F3 ni llama a los candados por su cuenta', (select pg_temp.intento('select retail.fn_exigir_mes_abierto(null, ''2025-03-01'')') like 'permission denied%');
reset role;
${cambiaA(FELIPE)}
select 'F4 el líder sí', (select jsonb_typeof(retail.fn_cierre_panel('2025-03-01')) = 'object');
`;

const BLOQUES = [
  ["A · cerrar TRU y el candado por fecha", CASOS_CIERRE],
  ["B · consolidado, reabrir y volver a cerrar", CASOS_CONSOLIDADO],
  ["C · chequeos que bloquean y que avisan", CASOS_CHEQUEOS],
  ["D · de la empresa y las dos puntas del dinero", CASOS_EMPRESA],
  ["E · fn_diario y la huella", CASOS_DIARIO],
  ["F · solo el líder", CASOS_PERMISOS],
];
for (const [titulo, casosSql] of BLOQUES) {
  verificar(titulo, correr(`${ESCENA}\n${casosSql}`), casosDe(casosSql));
}

console.log(`\n${casos - fallos} de ${casos} casos en verde.`);
if (fallos) {
  console.log(`${fallos} caso(s) fallaron.`);
  process.exit(1);
}

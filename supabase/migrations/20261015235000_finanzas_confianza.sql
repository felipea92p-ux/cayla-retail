-- ============================================================================
-- 20261015235000_finanzas_confianza.sql — CAYLA V2 (ADR-0417, Fase 1; Felipe 2026-10-15)
--
-- EL PROBLEMA PRIMERO. Finanzas responde «¿estoy ganando plata?» con un número que depende de lo que los otros módulos
-- registraron. Hoy el número sale con la misma cara tenga o no detrás los alquileres, las facturas o el costo de cada
-- prenda: la pantalla no dice qué tan cierto es. Medido el 15-oct-2026: el 64 % de la venta de octubre iba con costo 0,
-- cero gastos fijos cargados, cero facturas de proveedor, cero saldos de arranque y el banco nunca cuadrado. Una pantalla
-- bonita sobre eso haría creíble un número falso.
--
-- CONTRATO (Liskov)
--   PROMETE: `fn_finanzas_confianza(p_mes, p_ubicacion_id) → jsonb` con los HECHOS que hacen confiable (o no) el número del mes:
--            cuánto del costo es estimado o sigue en 0, cuántos gastos fijos hay y cuántos faltan registrar este mes, cuántas
--            entradas de mercadería llegaron sin factura y cuántas salidas de caja siguen sin clasificar, si hay saldos de
--            arranque para los bancos, si los cobros con tarjeta y QR pasan por una cuenta «por abonar» o caen directo al
--            banco, si la planilla del mes ya está pagada en Dynamic, y cuántos bancos se cuadraron este mes. No califica:
--            el porcentaje y las frases los pone la web (`lib/finanzas-confianza.ts`), que tiene su prueba.
--   ASUME:   quien llama ve el diario (`fn_diario_ubicaciones`); con una sede, los hechos son de esa sede (lo «de la
--            empresa» —bancos, saldos de arranque— entra igual, porque le pertenece a todas).
--   FALLA:   `insufficient_privilege` sin el módulo Reportes financieros o al pedir una sede que no se ve.
--   NO HACE: no escribe nada; no repite ninguna regla del diario (lee funciones que ya existen); no mira meses cerrados.
--
-- DECIDÍ: una función de HECHOS en la base y la calificación en la web. DESCARTÉ ponerle el porcentaje a la base: los pesos
--   («cuánto del número depende de cada fuente») son una decisión de diseño que se va a ajustar mirando, y cambiarlos no
--   debería pedir una migración. SE ROMPE SI: una fuente nueva de datos (SIRE, extracto) no se suma aquí: el medidor seguiría
--   diciendo lo mismo con ella conectada.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_finanzas_confianza(p_mes date default null, p_ubicacion_id uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_hoy date := retail.fn_hoy_lima();
  v_mes date := date_trunc('month', coalesce(p_mes, retail.fn_hoy_lima()))::date;
  v_fin_mes date;
  v_hasta date;
  v_ini timestamptz;
  v_fin timestamptz;
  v_costo jsonb;
  v_fijos jsonb;
  v_facturas jsonb;
  v_saldos jsonb;
  v_tarjeta jsonb;
  v_planilla jsonb;
  v_conciliacion jsonb;
  v_visible boolean;
begin
  if cardinality(v_ubics) = 0 then
    raise insufficient_privilege using message = 'El medidor de confianza necesita el módulo Reportes financieros';
  end if;
  if p_ubicacion_id is not null and not (p_ubicacion_id = any (v_ubics)) then
    raise insufficient_privilege using message = 'No ves los números de esa sede';
  end if;
  v_fin_mes := (v_mes + interval '1 month' - interval '1 day')::date;
  v_hasta := least(v_fin_mes, v_hoy);
  v_ini := (v_mes::timestamp at time zone 'America/Lima');
  v_fin := ((v_hasta + 1)::timestamp at time zone 'America/Lima');

  -- 1. El costo: cuánto de lo vendido lleva costo estimado o sigue en 0 (20261015233000).
  select jsonb_build_object(
           'unidades_estimadas', c.unidades_estimadas, 'venta_estimada', c.venta_estimada,
           'unidades_sin_costo', c.unidades_sin_costo, 'venta_sin_costo', c.venta_sin_costo,
           'unidades_total', c.unidades_total, 'venta_total', c.venta_total)
    into v_costo
    from retail.fn_costo_estimado_resumen(v_mes, v_hasta, p_ubicacion_id) c;

  -- 2. Los gastos fijos: cuántos hay, cuántas sedes activas tienen al menos uno y cuántos faltan registrar este mes.
  select jsonb_build_object(
           'configurados', (select count(*) from retail.gastos_fijos f
                             where f.activo and (p_ubicacion_id is null or f.ubicacion_id = p_ubicacion_id or f.ubicacion_id is null)
                               and (f.ubicacion_id is null or f.ubicacion_id = any (v_ubics))),
           'sedes_activas', (select count(*) from retail.ubicaciones u
                              where u.activo and u.tipo in ('tienda', 'taller') and u.id = any (v_ubics)
                                and (p_ubicacion_id is null or u.id = p_ubicacion_id)),
           'sedes_con_fijos', (select count(distinct f.ubicacion_id) from retail.gastos_fijos f join retail.ubicaciones u on u.id = f.ubicacion_id
                                where f.activo and u.activo and u.tipo in ('tienda', 'taller') and u.id = any (v_ubics)
                                  and (p_ubicacion_id is null or u.id = p_ubicacion_id)),
           'faltan_mes', (select count(*) from retail.fn_gastos_fijos_mes(v_mes, p_ubicacion_id, false) g where g.estado = 'falta'))
    into v_fijos;

  -- 3. Las facturas: mercadería que entró este mes sin factura (como lo mira el Balance) y salidas de caja sin clasificar.
  select jsonb_build_object(
           'lotes_sin_factura', (select count(distinct coalesce(m.lote_id, m.id)) from retail.movimientos m
                                   where m.created_at >= v_ini and m.created_at < v_fin
                                     and m.tipo = 'entrada' and m.motivo = 'recepcion' and m.compra_item_id is null
                                     and m.variante_id <> '22222222-2222-4222-8222-222222222222'
                                     and m.ubicacion_id = any (v_ubics)
                                     and (p_ubicacion_id is null or m.ubicacion_id = p_ubicacion_id)),
           'egresos_sin_clasificar', (select count(*) from retail.fn_egresos_sin_clasificar(p_ubicacion_id, 10000)))
    into v_facturas;

  -- 4. Los saldos de arranque: cuántos vigentes y cuántos bancos hay.
  select jsonb_build_object(
           'registrados', (select count(*) from retail.fn_saldos_iniciales() s where s.vigente),
           'bancos', (select count(*) from retail.cuentas_dinero c where c.tipo = 'banco' and c.archivada_en is null))
    into v_saldos;

  -- 5. Tarjeta y QR: ¿pasan por una cuenta «por abonar» (la comisión se puede registrar) o caen directo al banco?
  with vigentes as (
    select distinct on (m.ubicacion_id, m.medio) m.ubicacion_id, m.medio, m.cuenta_id
      from retail.medios_de_cobro m
     where m.medio in ('tarjeta', 'qr') and m.vigente_desde <= v_hasta
     order by m.ubicacion_id, m.medio, m.vigente_desde desc, m.created_at desc
  )
  select jsonb_build_object(
           'por_abonar_cuentas', (select count(*) from retail.cuentas_dinero c where c.tipo = 'por_abonar' and c.archivada_en is null),
           'directo_al_banco', coalesce((select bool_or(c.tipo = 'banco') from vigentes vg join retail.cuentas_dinero c on c.id = vg.cuenta_id
                                          where vg.ubicacion_id = any (v_ubics) and (p_ubicacion_id is null or vg.ubicacion_id = p_ubicacion_id)), false),
           'cobros_mes', (select coalesce(sum(p.monto), 0) from retail.venta_pagos p join retail.ventas v on v.id = p.venta_id
                           where p.metodo in ('tarjeta', 'qr') and v.estado = 'completada' and not coalesce(v.es_prueba, false)
                             and v.created_at >= v_ini and v.created_at < v_fin and v.ubicacion_id = any (v_ubics)
                             and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id)))
    into v_tarjeta;

  -- 6. La planilla: solo quien la ve en Dynamic sabe si el mes ya está pagado.
  v_visible := retail.fn_planilla_visible();
  select jsonb_build_object(
           'visible', v_visible,
           'mes_pagada', v_visible and exists (select 1 from retail.fn_planilla_periodos(v_mes, v_fin_mes) p
                                                where p_ubicacion_id is null or p.ubicacion_id = p_ubicacion_id))
    into v_planilla;

  -- 7. La conciliación: bancos cuadrados este mes contra bancos que hay.
  select jsonb_build_object(
           'bancos', (select count(*) from retail.cuentas_dinero c where c.tipo = 'banco' and c.archivada_en is null),
           'conciliados_mes', (select count(distinct k.cuenta_id) from retail.conciliaciones k join retail.cuentas_dinero c on c.id = k.cuenta_id
                                where k.estado = 'vigente' and c.tipo = 'banco' and c.archivada_en is null
                                  and k.fecha >= v_mes and k.fecha <= v_fin_mes))
    into v_conciliacion;

  return jsonb_build_object(
    'mes', v_mes, 'hasta', v_hasta, 'ubicacion_id', p_ubicacion_id, 'corte', retail.fn_finanzas_desde(),
    'costo', v_costo, 'fijos', v_fijos, 'facturas', v_facturas, 'saldos', v_saldos,
    'tarjeta', v_tarjeta, 'planilla', v_planilla, 'conciliacion', v_conciliacion);
end $$;
comment on function retail.fn_finanzas_confianza(date, uuid) is
  'Los hechos que hacen confiable el número de Finanzas de un mes (costo estimado, fijos, facturas, saldos de arranque, tarjeta, planilla, conciliación). La calificación la pone la web (ADR-0417).';

revoke all on function retail.fn_finanzas_confianza(date, uuid) from public, anon;
grant execute on function retail.fn_finanzas_confianza(date, uuid) to authenticated;

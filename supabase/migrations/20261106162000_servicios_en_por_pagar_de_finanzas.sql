-- ============================================================================
-- 20261106162000_servicios_en_por_pagar_de_finanzas.sql — CAYLA V2 (Felipe, 2026-11-06; ADR-0614, actualización)
-- Lo que se le debe a un servicio del Taller también sale en Finanzas ▸ Por pagar
--
-- EL PROBLEMA PRIMERO. ADR-0614 llevó la deuda de los servicios a Taller ▸ Por pagar, pero `fn_por_pagar_consolidado` solo lee facturas. Quien
-- miraba Finanzas veía menos deuda de la real, y la proyección de caja y el Resumen, que leen esa misma función, no contaban esa salida de plata.
--
-- LA DECISIÓN. Se suma una tercera rama a la misma función, y la deuda sigue DERIVADA (principio 4): sale de `fn_servicios_por_pagar`, no se copia.
-- La fila es de la unidad Taller, `origen = 'servicio'` y `naturaleza = 'servicio'`, su id es el de la fase, y total − pagado = devengado − lo que ya tiene papel.
-- Lo que ya tiene papel es una factura y sale por su rama, ahora con `naturaleza = 'servicio'` en vez de «insumo»: nada se cuenta dos veces.
--
-- SIN FECHA. Un servicio sin papel no tiene vencimiento: es lo que ya decidió `fn_deuda_consolidada` (vencido 0, sin próximo vencimiento), y
-- marcarlo vencido desde que devolvió las prendas sería inventar un plazo. `vence` es hoy, para que el calendario y la proyección cuenten esa
-- plata como una salida cercana; `fecha_vencimiento` queda nula, y la pantalla dice «Sin fecha». Nunca sale como vencido.
--
-- QUIÉN LA VE. Solo el líder, como la deuda de los servicios en el Taller: `fn_servicios_por_pagar` ya le responde cero filas a otra cuenta. Quien
-- tiene Estados financieros y no es líder sigue viendo la tela, pero no estos servicios, y su proyección queda por debajo de la del líder.
-- Abrírselo es una decisión de permisos: la cifra sale de `fn_fases_de_orden`, que pide el módulo Producción y poder operar en el Taller.
--
-- CONTRATO (Liskov)
--   PROMETE: `fn_por_pagar_consolidado` con la misma firma y las mismas columnas, una fila más por servicio con saldo. Ninguna escribe.
--   ASUME:   `proveedor_id` puede venir nulo: el paso quedó «Pendiente de registrar». La fila se llama «Servicios sin nombre», como en `fn_deuda_consolidada`.
--   FALLA:   si las anclas cambiaron, la migración aborta sin tocar nada.
--   NO HACE: no crea facturas ni pagos (eso es `pagar_servicio_de_orden`), no toca el costo de la prenda ni el Balance.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin `alter` de tablas, políticas ni `drop trigger`: ADR-0195 no aplica. Pegar ANTES de publicar la web:
-- la web vieja leería `naturaleza = 'servicio'` como mercadería.
-- COSTO. Para el líder, la lectura pasa por `fn_fases_de_orden` una vez por orden no anulada. La leen el Resumen y la proyección: si las órdenes crecen y se siente, esa es la causa.
--
-- VERIFICACIÓN (solo lectura):
--   select position('fn_servicios_por_pagar' in pg_get_functiondef('retail.fn_por_pagar_consolidado(uuid,date,boolean)'::regprocedure)) > 0;  → t
-- CÓMO SE DESHACE: los dos reemplazos al revés.
-- ============================================================================

set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- Una factura que documenta un paso de una orden es de un servicio, aunque viva en el mismo libro que la tela.
select pg_temp.reemplazar_anclado(
  'retail.fn_por_pagar_consolidado(uuid,date,boolean)',
  $v$select 'produccion'::text, k.id, 'insumo'::text, k.proveedor_id,$v$,
  $n$select 'produccion'::text, k.id,
           case when exists (select 1 from retail.comprobantes_produccion_items i where i.comprobante_id = k.id and i.fase_id is not null)
                then 'servicio'::text else 'insumo'::text end,
           k.proveedor_id,$n$
);

-- C. Lo que se le debe a un servicio y todavía no tiene papel (ADR-0614).
select pg_temp.reemplazar_anclado(
  'retail.fn_por_pagar_consolidado(uuid,date,boolean)',
  $v$and k.estado = 'vigente' and k.total - pg.pagado > 0
  )$v$,
  $n$and k.estado = 'vigente' and k.total - pg.pagado > 0
    union all
    -- C. Los servicios de las órdenes sin papel (ADR-0614): sin vencimiento, nunca salen como vencidos. Se deben hoy para el calendario y la proyección.
    select 'servicio'::text, s.fase_id, 'servicio'::text, s.proveedor_id, coalesce(s.proveedor, 'Servicios sin nombre'),
           s.numero_texto || ' · ' || s.fase, 'sin_comprobante'::text, s.producto,
           null::date, null::text, null::date,
           retail.fn_hoy_lima(),
           v_taller,
           (select u.nombre from retail.ubicaciones u where u.id = v_taller),
           false,
           s.devengado,
           s.falta
      from retail.fn_servicios_por_pagar() s
     where not v_empresa and (v_ubic is null or v_ubic = v_taller)
  )$n$
);

reset lock_timeout;

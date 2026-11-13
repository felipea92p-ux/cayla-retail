-- ============================================================================
-- 20261029160000 — «¿Me alcanza?» y la proyección de caja no cuentan la plata de Claudia (ADR-0560; actividad 16)
--
-- EL PROBLEMA PRIMERO. La proyección de caja (`fn_flujo_caja_proyeccion`, de donde sale «¿Me alcanza?») parte de lo que hay hoy en todas las cuentas de CAYLA. Pero parte de esa plata es de
-- Claudia: lo que sus ventas cobraron en cuentas de CAYLA y todavía no se le ha pagado. CAYLA planeaba con ella como si fuera suya. Felipe (2026-10-29): «restarla del disponible».
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `fn_claure_saldo_a(corte)` (interna): lo que se le debe a Claudia a esa fecha en todas las sedes donde opera: cobrado − devuelto − IGV − comisión − pagado (bancos y el efectivo
--            que se quedó con ella) − gastos suyos que pagó CAYLA: la MISMA cuenta que la pestaña CLAURE y el aviso del cierre. (2) `fn_flujo_caja_proyeccion` parte de «lo que hay en las cuentas
--            − lo que se le debe a Claudia» (nunca suma si ella le debe a CAYLA) y dice cuánto restó en `de_claudia`. Lo demás de la respuesta es EXACTAMENTE lo de antes.
--   ASUME:   `fn_claure_filas`, `fn_claure_gastos_base` y los pagos a CLAURE (`movimientos_dinero.tipo = pago_claure` y `caja_traslados.destino = claudia`) ya existen (actividades 1, 2, 8 y 11).
--   NO HACE: no cambia `fn_flujo_disponible` (lo usa también el flujo real, que debe cuadrar con las cuentas) ni los cobros futuros de la proyección: lo que CLAURE venda desde mañana
--            seguirá entrando a «lo que se espera cobrar» (queda en el backlog).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029154000. Una función nueva y tres reemplazos anclados sobre `fn_flujo_caja_proyeccion`: ABORTAN SIN CAMBIAR NADA si el texto no es el
-- esperado y dicen cuál. Sin políticas ni `alter table`; idempotente. SE ROMPE SI: otra migración reescribe la proyección y cambia esos textos.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Lo que se le debe a Claudia a una fecha, en todas las sedes donde opera ----------
create or replace function retail.fn_claure_saldo_a(p_corte date)
returns numeric
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_claure uuid;
  v_desde date;
  v_sedes uuid[];
  v_saldo numeric := 0;
begin
  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.clave = 'claure' and e.activo;
  if v_claure is null or v_desde is null or p_corte is null or p_corte < v_desde then
    return 0;
  end if;
  v_sedes := array(select es.ubicacion_id from retail.empresa_sedes es where es.empresa_id = v_claure);
  -- Lo cobrado en cuentas de CAYLA menos lo devuelto, el IGV (lo paga CAYLA) y la comisión del POS (la asume CLAURE): las mismas filas de la pantalla CLAURE.
  v_saldo := coalesce((select sum(f.monto - coalesce(f.igv, 0) - coalesce(f.comision, 0))
                         from retail.fn_claure_filas(v_sedes) f where f.contado and f.fecha <= p_corte), 0);
  -- Lo ya pagado: desde un banco y el efectivo del cajón que se quedó con ella.
  v_saldo := v_saldo - coalesce((select sum(d.monto) from retail.movimientos_dinero d where d.tipo = 'pago_claure' and d.estado = 'vigente' and d.fecha <= p_corte), 0);
  v_saldo := v_saldo - coalesce((select sum(t.monto) from retail.caja_traslados t join retail.cajas k on k.id = t.caja_id
                                  where t.destino = 'claudia' and not k.es_prueba and (t.creado_en at time zone 'America/Lima')::date <= p_corte), 0);
  -- Y la parte de CLAURE de los gastos que pagó CAYLA.
  v_saldo := v_saldo - coalesce((select sum(g.parte) from retail.fn_claure_gastos_base(v_desde, p_corte, true, null) g), 0);
  return round(v_saldo, 2);
end $$;

comment on function retail.fn_claure_saldo_a(date) is
  'ADR-0560 (interna): lo que se le debe a Claudia a esa fecha en todas las sedes donde opera CLAURE (cobrado − devuelto − IGV − comisión − pagado − efectivo que se quedó con ella − gastos suyos): la misma cuenta que la pestaña CLAURE y el aviso del cierre. Negativo si se le pagó de más.';
revoke all on function retail.fn_claure_saldo_a(date) from public, anon, authenticated;

-- ---------- 2. La proyección parte de lo que hay menos lo de Claudia ----------
select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$v$  v_fila record;$v$,
$n$  v_fila record;
  v_claudia numeric := 0;$n$,
1);

select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$v$  v_saldo := retail.fn_flujo_disponible(v_hoy);$v$,
$n$  -- ADR-0560, actividad 16: parte de lo que hay menos lo que es de Claudia (si ella le debe a CAYLA, no se suma).
  v_claudia := greatest(retail.fn_claure_saldo_a(v_hoy), 0);
  v_saldo := retail.fn_flujo_disponible(v_hoy) - v_claudia;$n$,
1);

select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$v$    'saldo_hoy', v_saldo, 'minimo_caja', v_minimo,$v$,
$n$    'saldo_hoy', v_saldo, 'de_claudia', v_claudia, 'minimo_caja', v_minimo,$n$,
1);

do $$
begin
  if position('fn_claure_saldo_a' in pg_get_functiondef('retail.fn_flujo_caja_proyeccion(integer)'::regprocedure)) = 0
     or position('''de_claudia'', v_claudia' in pg_get_functiondef('retail.fn_flujo_caja_proyeccion(integer)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: la proyección de caja no quedó sin la plata de Claudia';
  end if;
end $$;

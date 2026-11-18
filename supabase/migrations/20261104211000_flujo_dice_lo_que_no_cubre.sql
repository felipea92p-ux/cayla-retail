-- ============================================================================
-- 20261104211000 — El Flujo de efectivo dice lo que no cubre cuando una cuenta arrancó a mitad del período (ADR-0609)
--
-- EL PROBLEMA PRIMERO (Felipe, 2026-11-04, comparando octubre). Una cuenta con `saldo_desde` solo suma lo de ese día en adelante, y es
-- correcto: su saldo de arranque ya contiene lo anterior, y sumarlo lo contaría dos veces. Pero el Flujo no lo decía. Con bancos y máquinas
-- reiniciados a fin de mes (ADR-0552), octubre mostraba «entró» por menos de la mitad de lo cobrado, casi sin comisión de las máquinas, y
-- «Al empezar el mes» traía saldos de un día de FIN de mes (`fn_cuentas_dinero_saldos` suma `saldo_inicial` aunque el corte sea anterior a
-- `saldo_desde`). La identidad inicial + entró − salió ± ajustes = final se cumplía, así que nada avisaba: cuadraba y engañaba.
--
-- LA DECISIÓN. No se cambia ninguna cifra del Flujo ni la identidad: `entro`, `salio`, `saldo_inicial` y `saldo_final` leen igual, y de
-- ellos dependen el Resumen, la proyección y los días de caja. Se agrega `arranques`: por cada cuenta que arrancó después del primer día
-- del período, lo que su libro registró antes de arrancar. La pantalla lo muestra y deja de afirmar «subió» o «bajó», que ya no se puede saber.
--
-- CONTRATO de `fn_flujo_antes_del_arranque(p_desde, p_hasta)`, interna: una fila por cuenta (las mismas que suma el Flujo: ni cajón ni
-- tarjeta de crédito) con `saldo_desde > p_desde`, aunque no tenga movimientos, porque su saldo inicial igual está adelantado.
--   cobros − salidas + entre_cuentas = todo lo que el libro de esa cuenta registró en [p_desde, saldo_desde) dentro del período.
--   comision: lo que los depósitos de la máquina descontaron en ese tramo; ya está dentro de `entre_cuentas`, se informa aparte.
-- Solo lectura. Hereda el permiso de `fn_flujo_caja_real`, que es quien la llama.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Sin tablas ni políticas (no toma `auth` ni `storage`). `fn_flujo_caja_real` se reescribe desde
-- su definición viva, cambiando una línea ancla; si el ancla no aparece exactamente una vez, aborta entero. Pegarla dos veces no hace nada.
-- Verificado: `pnpm pruebas:cuadre-ventas-finanzas`.
--
-- SE ROMPE SI: una migración futura recrea `fn_flujo_caja_real` copiando un texto viejo del repo (la pantalla vuelve a callar; lo vigila la prueba).
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

create or replace function retail.fn_flujo_antes_del_arranque(p_desde date, p_hasta date)
returns jsonb
language sql stable set search_path = retail, public, extensions as $$
  with
  cuentas as (
    select c.id, c.nombre, c.tipo, c.saldo_desde, c.saldo_inicial, c.orden
      from retail.cuentas_dinero c
     where c.tipo not in ('cajon', 'tarjeta_credito') and c.saldo_desde > p_desde
  ),
  antes as (
    select l.cuenta_id, l.origen, l.monto
      from retail.fn_dinero_libro(p_hasta) l
      join cuentas c on c.id = l.cuenta_id
     where l.fecha >= p_desde and l.fecha < c.saldo_desde
  ),
  por_cuenta as (
    select a.cuenta_id,
           coalesce(sum(a.monto) filter (where a.origen = 'cobros'), 0) as cobros,
           coalesce(-sum(a.monto) filter (where a.origen in ('gasto', 'pago', 'activo', 'reembolso')), 0) as salidas,
           coalesce(sum(a.monto) filter (where a.origen not in ('cobros', 'gasto', 'pago', 'activo', 'reembolso')), 0) as entre_cuentas
      from antes a
     group by a.cuenta_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cuenta_id', c.id, 'cuenta', c.nombre, 'tipo', c.tipo, 'desde', c.saldo_desde, 'saldo_inicial', c.saldo_inicial,
           'cobros', coalesce(p.cobros, 0), 'salidas', coalesce(p.salidas, 0), 'entre_cuentas', coalesce(p.entre_cuentas, 0),
           'comision', coalesce((select sum(d.comision) from retail.movimientos_dinero d
                                  where d.estado = 'vigente' and d.tipo = 'abono_tarjeta' and d.cuenta_origen_id = c.id
                                    and d.fecha >= p_desde and d.fecha <= p_hasta and d.fecha < c.saldo_desde), 0))
         order by c.orden, c.nombre), '[]'::jsonb)
    from cuentas c
    left join por_cuenta p on p.cuenta_id = c.id;
$$;
comment on function retail.fn_flujo_antes_del_arranque(date, date) is
  'ADR-0609: por cada cuenta del Flujo que arrancó después de p_desde, lo que su libro registró antes de arrancar: no suma en el Flujo porque ya está dentro de su saldo de arranque. Interna, de solo lectura; la llama fn_flujo_caja_real.';
revoke all on function retail.fn_flujo_antes_del_arranque(date, date) from public, anon, authenticated;

select pg_temp.reemplazar('retail.fn_flujo_caja_real(date, date)',
$v$    'planilla_visible', retail.fn_flujo_planilla_visible(),$v$,
$n$    'arranques', retail.fn_flujo_antes_del_arranque(p_desde, v_hasta),
    'planilla_visible', retail.fn_flujo_planilla_visible(),$n$,
1);

do $$
begin
  if position('fn_flujo_antes_del_arranque' in pg_get_functiondef('retail.fn_flujo_caja_real(date, date)'::regprocedure)) = 0 then
    raise exception 'ADR-0609: fn_flujo_caja_real no quedó diciendo lo que no cubre';
  end if;
end $$;

drop function pg_temp.reemplazar(text, text, text, integer);
reset lock_timeout;

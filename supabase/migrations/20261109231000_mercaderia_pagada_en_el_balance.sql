-- ============================================================================
-- 20261109231000 — «Mercadería pagada» en el Balance: lo que la compradora ya pagó deja de verse como plata del fondo (ADR-0636, actividad 1)
--
-- EL PROBLEMA PRIMERO. La compradora recibe un fondo (1413) y paga en Gamarra; el papel queda «por completar» hasta que la tienda cierra el
-- conteo del envío, y recién ahí entra al libro (`completar_papel_compra`: sube la 201, baja la 1413). Desde ADR-0621 el Flujo y Cuentas y dinero
-- ya restan esa plata el día del papel, pero el Balance lee el diario y el diario no se entera hasta el cierre: mostraba como «Fondos por rendir»
-- plata que ya era mercadería. Medido en producción el 2026-11-09: 35 papeles por S/ 24,452 en la 1413 y S/ 0 de plata real en los fondos.
-- Felipe (2026-11-09): «para el flujo ese dinero ya no lo tenemos; ¿en qué momento ese costo se convierte en stock?». Eligió una línea calculada.
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `fn_mercaderia_pagada(corte)` (interna): un renglón por papel que `fn_fondo_por_completar(corte)` ya resta del fondo (mismo
--            conjunto, por construcción), con lo pagado, su base y su IGV (solo la factura separa IGV, con la MISMA cuenta que
--            `completar_papel_compra`: base = round(pagado / (1 + tasa), 2)) y si ya está en la tienda (todo mandado, todos sus envíos
--            cerrados: lo que le falta es el papel) o sigue en camino.
--            (2) `fn_balance_general` (CAYLA entera): la 1413 baja por lo pagado de esos papeles y aparecen dos líneas de activo por el
--            mismo total: `mercaderia_pagada` (la base, junto a la 201, con `detalle` = {papeles, en_camino, en_tienda}) y
--            `mercaderia_pagada_igv` (el IGV de las facturas, si hay). El total del activo NO cambia: es plata que cambió de casillero.
--            Al completarse el papel, los renglones se van en la misma transacción en que el diario asienta lo real: tampoco cambia.
--   ASUME:   `fn_fondo_por_completar` sigue devolviendo `clave = 'papel:' || id` y `origen = 'papel'`.
--   NO HACE: no toca el diario (`fn_asientos`), ni la comprobación (`fn_conciliacion_contable`, `fn_bal_otro_camino`), ni el Balance por tienda
--            (el fondo es de CAYLA entera). No incluye los gastos del viaje por completar (son gasto, no mercadería). Para un corte pasado usa
--            el estado de hoy del papel (la fecha de completado llega en la actividad 2). Un papel de antes del arranque que se complete cae
--            fuera del Balance: se corrige fijando de nuevo el arranque (decisión pendiente de Felipe, fuera de esta migración).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN. Una función nueva y tres reemplazos anclados sobre `fn_balance_general`: ABORTAN SIN CAMBIAR
-- NADA si el texto no es el esperado. Sin políticas, sin `alter table`, sin `drop trigger` (ADR-0195). Idempotente. La web vieja ignora las dos
-- líneas nuevas sin romperse (las dibuja con el nombre que trae la base): se puede pegar antes de publicar.
-- VERIFICACIÓN (solo lectura, como líder): select cuenta, monto, detalle from retail.fn_balance_general() where cuenta in ('1413','mercaderia_pagada','mercaderia_pagada_igv');
-- CÓMO SE DESHACE: los tres reemplazos al revés (el texto viejo está abajo) y `drop function retail.fn_mercaderia_pagada(date)`.
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

-- ---------- 1. Lo pagado que todavía no entra al libro, papel por papel ----------
create or replace function retail.fn_mercaderia_pagada(p_corte date)
returns table(papel_id uuid, fecha date, pagado numeric, base numeric, igv numeric, en_tienda boolean)
language sql
stable
set search_path = retail, public, extensions
as $$
  with x as (
    -- El MISMO conjunto que ya se resta del fondo en Cuentas y dinero y en el Flujo (ADR-0621): no hay segunda definición de «pagado».
    select p.id, p.fecha, p.tipo, -f.monto as pagado
      from retail.fn_fondo_por_completar(p_corte) f
      join retail.compra_papeles p on f.clave = 'papel:' || p.id::text
     where f.origen = 'papel'
  )
  select x.id, x.fecha, x.pagado,
         case when x.tipo = 'factura' then round(x.pagado / (1 + retail.fn_tasa_igv(x.fecha)), 2) else x.pagado end,
         case when x.tipo = 'factura' then x.pagado - round(x.pagado / (1 + retail.fn_tasa_igv(x.fecha)), 2) else 0 end,
         -- «En la tienda»: todo mandado y todos sus envíos cerrados (lo mismo que mira `fn_papel_pasa_solo`); lo que falta es el papel.
         not exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                      where o.papel_id = x.id and o.estado <> 'anulada' and retail.fn_compra_item_por_mandar(i.id) > 0)
         and not exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                           join retail.despacho_items di on di.orden_compra_item_id = i.id join retail.despachos d on d.id = di.despacho_id
                          where o.papel_id = x.id and o.estado <> 'anulada' and d.estado in ('en_camino', 'abierto'))
         and exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                       join retail.despacho_items di on di.orden_compra_item_id = i.id join retail.despachos d on d.id = di.despacho_id
                      where o.papel_id = x.id and o.estado <> 'anulada' and d.estado = 'cerrado')
    from x;
$$;

comment on function retail.fn_mercaderia_pagada(date) is
  'ADR-0636 (interna): los papeles de compra pagados desde un fondo que siguen por completar (el mismo conjunto de fn_fondo_por_completar), con lo pagado, su base, su IGV (solo factura) y si ya están en la tienda o en camino. La usa fn_balance_general para la línea «Mercadería pagada».';
revoke all on function retail.fn_mercaderia_pagada(date) from public, anon, authenticated;

-- ---------- 2. El Balance: la 1413 baja y la mercadería pagada aparece, por el mismo total ----------
select pg_temp.reemplazar('retail.fn_balance_general(date,uuid)',
$v$  sal as (
    select z.cuenta, sum(z.d) as d from (
      select v.cuenta, v.debe - v.haber as d from retail.fn_saldos_iniciales_vigentes() v
      union all
      select a.cuenta, a.debe - a.haber from a
    ) z group by z.cuenta
  ),$v$,
$n$  -- ADR-0636: lo que la compradora ya pagó y el libro todavía no ve (el papel espera el cierre del conteo).
  mp as materialized (
    select m.pagado, m.base, m.igv, m.en_tienda from retail.fn_mercaderia_pagada(v_corte) m
  ),
  sal as (
    select z.cuenta, sum(z.d) as d from (
      select v.cuenta, v.debe - v.haber as d from retail.fn_saldos_iniciales_vigentes() v
      union all
      select a.cuenta, a.debe - a.haber from a
      union all
      -- Esa plata ya no está en el fondo: sale de la 1413 y vuelve a aparecer abajo como «Mercadería pagada» (mismo total).
      select '1413'::text, -coalesce(sum(mp.pagado), 0) from mp
    ) z group by z.cuenta
  ),$n$,
1);

select pg_temp.reemplazar('retail.fn_balance_general(date,uuid)',
$v$    union all
    select 'patrimonio', 'resultado_mes', 'Resultado del mes', (select r.mes from res r), 999
  )$v$,
$n$    union all
    select 'patrimonio', 'resultado_mes', 'Resultado del mes', (select r.mes from res r), 999
    union all
    select 'activo', 'mercaderia_pagada', 'Mercadería pagada que todavía no entra al libro', t.base,
           (select k.orden from retail.cuentas k where k.codigo = '201')
      from (select coalesce(sum(mp.base), 0) as base from mp) t where t.base <> 0
    union all
    select 'activo', 'mercaderia_pagada_igv', 'IGV de la mercadería pagada', t.igv,
           (select k.orden from retail.cuentas k where k.codigo = '201')
      from (select coalesce(sum(mp.igv), 0) as igv from mp) t where t.igv <> 0
  )$n$,
1);

select pg_temp.reemplazar('retail.fn_balance_general(date,uuid)',
$v$           when 'resultado_mes' then jsonb_build_object('desde', greatest(v_mes, v_arr), 'hasta', v_corte)$v$,
$n$           when 'resultado_mes' then jsonb_build_object('desde', greatest(v_mes, v_arr), 'hasta', v_corte)
           when 'mercaderia_pagada' then (select jsonb_build_object('papeles', count(*),
                                                 'en_camino', coalesce(sum(mp.base) filter (where not mp.en_tienda), 0),
                                                 'en_tienda', coalesce(sum(mp.base) filter (where mp.en_tienda), 0)) from mp)$n$,
1);

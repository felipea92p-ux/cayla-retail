-- ============================================================================
-- 20261107021000 — Los pagos del Taller entran al diario (ADR-0619)
--
-- EL PROBLEMA PRIMERO. `comprobantes_produccion_pagos` sale del banco en Cuentas y dinero (`fn_dinero_libro`), pero
-- `fn_asientos` no tenía regla para él: dos ploteos del 6-nov (S/ 50 y S/ 38) dejaron la 104 en 377.64 contra 289.64.
-- La Comprobación marcó 88.00 y, por la regla de entonces, el Balance entero dejó de dibujarse.
--
-- LA DECISIÓN. Un pago del Taller es costo de la ropa, igual que la categoría de gasto «Maquila del Taller» (20261106234000):
-- va a la 231 (Productos en proceso) y sale de la cuenta de dinero que lo pagó; cuando la prenda entra al stock, la regla
-- `produccion` lo pasa de la 231 a la 201. Si el comprobante compra insumos (viene de una orden de insumos o una línea suya es
-- un insumo del catálogo), va a la 241 (Materias primas): de ahí sale al cortar la tela.
-- Al estar en el diario, las causas «pagos_taller» y «taller_cajon» de la comprobación ya no tienen razón de existir.
--
-- CONTRATO
--   PROMETE: (1) cada pago del Taller es un asiento que cuadra solo; (2) la 104 vuelve a coincidir con Cuentas y dinero;
--            (3) el Estado de resultados no cambia (231 y 241 son de balance); (4) repetir la migración no cambia nada.
--   ASUME:   que 20261106171000 ya está pegada (trae la 231, la 241 y `fn_asientos_produccion`).
--   NO HACE: no separa el IGV de un comprobante del Taller: hoy todos tienen IGV 0 (consultado el 2026-11-06); uno con IGV
--            iría entero a la 231 y su causa «igv_taller» lo seguiría mostrando. Tampoco devenga un comprobante a crédito:
--            asienta el pago el día que se paga (hoy todos son al contado). Un comprobante mixto (tela y un concepto libre) va
--            entero a la 241, y un concepto libre que no es de ninguna orden se queda en la 231 hasta que alguien lo reclasifique.
--            Tampoco corrige el arranque: los S/ 224 pagados en octubre por las órdenes #5 y #6 están fuera de la 231 de
--            arranque (ver ADR-0619, «Lo que queda»).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA SOLA EJECUCIÓN. Crea una función y reescribe dos desde su definición viva. Sin políticas,
-- sin `alter` de tablas en uso y sin `select … into` dentro de un texto entre comillas (ADR-0195, ADR-0288).
-- SE ROMPE SI: alguien cambió `fn_asientos` o `fn_bal_causas_dinero` después de escribir las anclas: el reemplazo lo dice y no
-- aplica nada.
-- DOWN: volver a pegar la definición anterior de `fn_asientos` y `fn_bal_causas_dinero`, y `drop function retail.fn_asientos_pagos_taller`.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.cambiar_pagos_taller(p_def text, p_viejo text, p_nuevo text)
returns text
language plpgsql
as $f$
begin
  if (length(p_def) - length(replace(p_def, p_viejo, ''))) / length(p_viejo) <> 1 then
    raise exception 'La función cambió desde que se escribió esta migración: no aparece una sola vez «%». Regenera el reemplazo desde su definición real.', p_viejo;
  end if;
  return replace(p_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. La regla ----------
create or replace function retail.fn_asientos_pagos_taller(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (f date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, ot text, oid uuid, glosa text)
language sql
stable
set search_path = retail, public, extensions
as $$
  with
  taller as (select u.id from retail.ubicaciones u where u.tipo = 'taller' order by u.created_at limit 1),
  -- Mismas filas que `fn_dinero_libro`: lo que Cuentas y dinero descuenta es lo que el diario asienta.
  pg as (
    select pp.id, pp.fecha, pp.monto, pp.metodo, (select t.id from taller t) as ubicacion_id,
           co.serie || '-' || co.numero as doc,
           case when co.orden_insumo_id is not null
                  or exists (select 1 from retail.comprobantes_produccion_items i where i.comprobante_id = co.id and i.insumo_id is not null)
                then '241' else '231' end as cta_costo,
           coalesce(cd.cuenta_contable, retail.fn_asiento_cuenta_de_medio(pp.metodo, 'sale')) as cta_dinero
      from retail.comprobantes_produccion_pagos pp
      join retail.comprobantes_produccion co on co.id = pp.comprobante_id
      left join retail.cuentas_dinero cd on cd.id = pp.cuenta_dinero_id
     where pp.fecha between p_desde and p_hasta
  )
  select pg.fecha, pg.ubicacion_id, 'pago_taller:' || pg.id, 'pago_taller', pg.cta_costo, pg.monto, 0::numeric,
         'comprobantes_produccion_pagos', pg.id, 'Pago del Taller · ' || pg.doc
    from pg where p_todo or pg.ubicacion_id = any (p_ubics)
  union all
  select pg.fecha, pg.ubicacion_id, 'pago_taller:' || pg.id, 'pago_taller', pg.cta_dinero, 0::numeric, pg.monto,
         'comprobantes_produccion_pagos', pg.id, 'Sale por ' || pg.metodo
    from pg where p_todo or pg.ubicacion_id = any (p_ubics);
$$;
comment on function retail.fn_asientos_pagos_taller(date, date, boolean, uuid[]) is
  'ADR-0619: cada pago del Taller, a la 231 (o a la 241 si compra insumos) contra la cuenta de dinero que lo pagó.';
revoke all on function retail.fn_asientos_pagos_taller(date, date, boolean, uuid[]) from public, anon, authenticated;

-- ---------- 2. El diario la lee ----------
do $m$
declare
  v_def text := pg_get_functiondef('retail.fn_asientos(date,date,uuid)'::regprocedure);
begin
  if position('fn_asientos_pagos_taller' in v_def) > 0 then
    return;
  end if;
  execute pg_temp.cambiar_pagos_taller(v_def,
$a$    union all select * from retail.fn_asientos_produccion(p_desde, p_hasta, v_todo, v_ubics)$a$,
$n$    union all select * from retail.fn_asientos_produccion(p_desde, p_hasta, v_todo, v_ubics)
    -- 20261107021000: los pagos del Taller, a la 231 o a la 241 contra la cuenta que los pagó.
    union all select * from retail.fn_asientos_pagos_taller(p_desde, p_hasta, v_todo, v_ubics)$n$);
end;
$m$;

-- ---------- 3. La comprobación deja de explicarlos como diferencia ----------
-- Todo en un solo reemplazo: plpgsql valida la función al crearla, y a medio camino una variable ya no existiría.
do $m$
declare
  v_def text := pg_get_functiondef('retail.fn_bal_causas_dinero(date,date)'::regprocedure);
begin
  if position('20261107021000' in v_def) > 0 then
    return;
  end if;
  v_def := pg_temp.cambiar_pagos_taller(v_def,
$a$  v_taller_caja boolean := exists (select 1 from information_schema.columns
                                    where table_schema = 'retail' and table_name = 'comprobantes_produccion_pagos' and column_name = 'caja_movimiento_id');
$a$, $n$  -- 20261107021000: los pagos del Taller ya están en el diario.
$n$);
  v_def := pg_temp.cambiar_pagos_taller(v_def,
$a$  v_taller_ids uuid[] := '{}';
$a$, $n$  -- (el cajón que pagó al Taller tampoco es una causa: fn_asientos_pagos_taller)
$n$);
  v_def := pg_temp.cambiar_pagos_taller(v_def,
$a$  if v_taller_caja then
    execute 'select coalesce(array_agg(caja_movimiento_id), ''{}'') from retail.comprobantes_produccion_pagos where caja_movimiento_id is not null'
      into v_taller_ids;
  end if;
$a$, $n$  -- Los reembolsos que entraron por un cajón.
$n$);
  v_def := pg_temp.cambiar_pagos_taller(v_def,
$a$             when l.clave like 'reembolso:%' then$a$,
$n$             when l.clave like 'pagoprod:%' then (select case pp.metodo when 'efectivo' then '101' when 'tarjeta' then '451' else '104' end
                                                    from retail.comprobantes_produccion_pagos pp where pp.id = substr(l.clave, 10)::uuid)
             when l.clave like 'reembolso:%' then$n$);
  v_def := pg_temp.cambiar_pagos_taller(v_def,
$a$     where l.cuenta_id is null and l.clave not like 'pagoprod:%'
$a$, $n$     where l.cuenta_id is null
$n$);
  v_def := pg_temp.cambiar_pagos_taller(v_def,
$a$  -- b. Lo que Cuentas y dinero descuenta y el diario todavía no tiene: los pagos del Taller (Producción).
  taller as (
    select c.cuenta_contable as cta, l.monto
      from libro l join retail.cuentas_dinero c on c.id = l.cuenta_id
     where l.clave like 'pagoprod:%'
  ),
$a$, $n$  -- b. (Los pagos del Taller eran una causa hasta 20261107021000: ya están en el diario.)
$n$);
  v_def := pg_temp.cambiar_pagos_taller(v_def,
$a$    union all
    select '101', 'taller_cajon', 'Pagos del Taller que salieron de un cajón (el diario todavía no tiene los insumos de Producción)',
           sum(cm.monto) from cm where cm.tipo = 'egreso' and cm.uso = 'pago' and cm.id = any (v_taller_ids)
$a$, $n$    -- (Los pagos del Taller desde un cajón ya están en el diario: 20261107021000.)
$n$);
  v_def := pg_temp.cambiar_pagos_taller(v_def,
$a$  select t.cta, 'pagos_taller', 'Pagos del Taller (el diario todavía no tiene los insumos de Producción)', -sum(t.monto), false
    from taller t group by t.cta having sum(t.monto) <> 0
  union all
$a$, $n$  -- (La causa «pagos_taller» salió con 20261107021000.)
$n$);
  execute v_def;
end;
$m$;

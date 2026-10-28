-- ============================================================================
-- 20261028212000_balance_mercaderia_de_claure_en_consignacion.sql — CAYLA V2 · ADR-0558
--
-- QUÉ ES. La mercadería de CLAURE que está en Tienda LIM deja de contarse como mercadería de CAYLA en el Balance de Finanzas. Es de CLAURE
-- (consignación, decisión de Felipe 2026-10-28: «si no se vende, CLAURE se la lleva de vuelta; CAYLA le paga a costo lo que vende»). Lo que
-- CAYLA le debe a CLAURE nace al VENDER, no al recibir, y vive en una cuenta propia: la 4699 «Por liquidar a CLAURE».
--
-- EL PROBLEMA QUE ARREGLA. `fn_bal_stock` (la mitad «stock × costo» de la cuenta 201 y la «Mercadería» de cada tienda) sumaba `retail.stock`
-- entero, sin mirar `stock_dueno` (ADR-0542). Pero el diario NUNCA asentó la entrada de esa mercadería (la 201 sube solo con una factura de
-- mercadería vigente) y SÍ asentaba su venta (Cr 201 al costo). La comprobación de la 201 (`fn_conciliacion_contable`) quedaba en «no cuadra»
-- (a la 201 no se le acepta ninguna diferencia) y el Balance no se dibuja si un chequeo que bloquea no cuadra (ADR-0198). Corregir solo
-- `fn_bal_stock` NO bastaba: la venta de CLAURE seguiría bajando la 201 del diario. Por eso van en pareja las dos mitades.
--
-- CONTRATO (3 líneas).
--   Promete: la 201 y la «Mercadería» de cada tienda cuentan solo lo de la casa; lo vendido de CLAURE (al costo sellado en la venta) queda
--            como deuda en la 4699 en vez de bajar la 201; anular o devolver esa venta baja la deuda; lo que CAYLA pierde de CLAURE (merma)
--            sigue siendo gasto de CAYLA y se le debe a CLAURE.
--   Asume:   `stock_dueno` y `movimientos.empresa_id` (20261027222000) y `fn_dueno_de_la_linea` (20261028153000) ya están pegadas.
--   Nunca:   toca el stock, un movimiento, una venta ni un peso real. Solo cambia cómo se LEE (el diario se calcula al vuelo, no se guarda).
--
-- QUÉ HACE (todo funciones y un dato; reemplazos ANCLADOS sobre la definición viva, nunca reescribe desde el archivo original)
--   1. Cuenta nueva `4699` (pasivo) en el plan de cuentas. Sin categoría de gasto: ver «LO QUE NO HACE».
--   2. `fn_dueno_del_movimiento(empresa_id, ubicacion_id, variante_id)`: de quién son las unidades de un movimiento. La regla única de
--      lectura: el dueño que quedó escrito; si no hay (movimiento anterior al libro) y la sede tiene dos empresas, el de la ficha; si no, la casa.
--   3. `fn_asientos_claure`: asientos de RECLASIFICACIÓN que se unen al diario (el mismo patrón que `fn_asientos_pedidos_web`): por cada venta,
--      anulación, devolución y merma cuya mercadería es de otro dueño, devuelven el Cr/Dr a la 201 que la regla de siempre hizo y lo llevan a la 4699.
--      La regla de siempre no se toca (ninguna fórmula de costo se duplica en el diario: lo que se duplica es el FILTRO de qué líneas son ajenas).
--   4. `fn_bal_stock`: resta lo que es de otro dueño (lo de `stock_dueno` hoy, menos lo movido después del corte). Una venta web sin entregar
--      cuya línea es ajena no se resta dos veces (ya la resta `vendido_web`). Los dos cambios van FUERA del texto que tocan los parches de
--      pedidos web, para que esas dos migraciones se puedan volver a pegar después de esta.
--   5. `fn_bal_causas_mercaderia`: los movimientos de otro dueño no se explican contra la 201 (no son de CAYLA).
--   6. `fn_asientos`: una línea más que une `fn_asientos_claure`.
--
-- LO QUE NO HACE.
--   · No registra el PAGO a CLAURE (la liquidación): la 4699 sube con lo que se vende y todavía no baja. Un gasto de categoría «Liquidación»
--     sumaría al total de gastos del mes y daría crédito de IGV: es una decisión de Felipe y del contador. Mientras tanto la línea del Balance
--     lo dice («por ahora solo sube», como el IGV). El día que se le pague a CLAURE, esa plata aparecerá en la comprobación de caja/bancos.
--   · No reclasifica el CAMBIO de una prenda de CLAURE (su ajuste de costo mezcla dos prendas). Si ocurre, la 201 saldrá «sin explicar» por
--     el ajuste: se ve, no se calla (ver ADR-0558, «Se rompe si…»).
--   · No decide si CAYLA es principal o agente frente a SUNAT/el IGV de la consignación: sigue como hoy (CAYLA vende con su boleta, ingreso
--     completo). Pregunta para el contador.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. DESPUÉS de 20261027222000 y 20261028153000 (aborta con un mensaje si faltan) y ANTES de cerrar octubre: el
-- diario de un mes cerrado se congela (`diario_cerrado`), y un mes cerrado sin estas reclasificaciones dejaría la 201 desfasada para siempre.
-- UNA sola parte: solo funciones y una fila de `cuentas` (ni `alter`, ni políticas, ni `drop trigger`: CLAUDE.md «Políticas y deadlocks»).
-- Idempotente (un ancla ya aplicada no hace nada; si un ancla no aparece las veces esperadas, ABORTA sin tocar nada) y sin `select … into`
-- dentro de un texto entre comillas. La última línea dice «QUEDÓ BIEN».
--
-- COMO DESHACERLA (down). Quitar de `fn_asientos` la línea `union all select * from retail.fn_asientos_claure(...)` y de `fn_bal_stock` el CTE
-- `de_otros` (y su `union all`) y el filtro `fn_dueno_de_la_linea` de `vendido_web`/`anulado_web`; y de `fn_bal_causas_mercaderia` el filtro
-- `fn_dueno_del_movimiento`. Después `drop function retail.fn_asientos_claure, retail.fn_dueno_del_movimiento`. La cuenta 4699 se queda (sin
-- movimientos no aparece en el Balance).
--
-- SE ROMPE SI. (a) Una migración vuelve a definir ENTERA `fn_asientos` o `fn_bal_stock` después de esta: pierde el enganche (se vigila en
-- `pnpm pruebas:balance-claure`). (b) Un cambio con una prenda de CLAURE: su ajuste de costo queda sin reclasificar. (c) Un pedido web con
-- una prenda de CLAURE: hasta entregarse su dueño se lee de la ficha, no de las unidades. (d) El mes de octubre se cierra antes de pegar esto.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. Lo que tiene que estar pegado antes ---------------------------------------------------------------------------------------------
do $$
begin
  if to_regclass('retail.stock_dueno') is null or to_regprocedure('retail.fn_sede_con_dos_empresas(uuid)') is null then
    raise exception 'Falta 20261027222000_stock_dueno_en_sedes_con_dos_empresas.sql: pégala antes que esta.';
  end if;
  if to_regprocedure('retail.fn_dueno_de_la_linea(uuid)') is null then
    raise exception 'Falta 20261028153000_dueno_real_en_caja_historial_y_movimientos.sql: pégala antes que esta.';
  end if;
  if to_regprocedure('retail.fn_asientos_pedidos_web(date, date, boolean, uuid[])') is null then
    raise exception 'Falta 20261015053000_pedidos_web_en_finanzas.sql: pégala antes que esta.';
  end if;
end;
$$;

-- 1. La cuenta donde vive lo que se le debe a CLAURE ---------------------------------------------------------------------------------
-- 4699 = «Otras cuentas por pagar diversas» del PCGE; provisional hasta que el contador confirme si CLAURE es tercero (46) o relacionada (47).
insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden)
values ('4699', 'Por liquidar a CLAURE (mercadería en consignación)', 'pasivo', null, 44)
on conflict (codigo) do nothing;

-- 2. De quién son las unidades de un movimiento --------------------------------------------------------------------------------------
create or replace function retail.fn_dueno_del_movimiento(p_empresa_id uuid, p_ubicacion_id uuid, p_variante_id uuid)
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    p_empresa_id,
    case when retail.fn_sede_con_dos_empresas(p_ubicacion_id)
         then (select p.empresa_id from retail.variantes va join retail.productos p on p.id = va.producto_id where va.id = p_variante_id)
    end,
    retail.fn_empresa_casa_id())
$$;

comment on function retail.fn_dueno_del_movimiento(uuid, uuid, uuid) is
  'ADR-0558: de quién son las unidades de un movimiento: el dueño escrito en él; si no hay (anterior al libro de ADR-0542) y la sede tiene dos empresas, el de la ficha de la prenda; si no, la casa. Es la regla de lectura de `fn_dueno_de_la_linea`, pero por movimiento.';

revoke all on function retail.fn_dueno_del_movimiento(uuid, uuid, uuid) from public, anon, authenticated;

-- 3. Los asientos de reclasificación --------------------------------------------------------------------------------------------------
-- Cada bloque repite el FILTRO de la regla del diario (mismas fechas, `es_prueba`, alcance) y suma el MISMO costo que ella, pero solo de las
-- líneas cuyo dueño no es la casa. La regla de siempre dejó su Cr/Dr a la 201; aquí se devuelve y se lleva a la 4699, así que cada asiento
-- de abajo cuadra solo (debe = haber) y la utilidad no cambia: el costo de lo vendido (691) sigue siendo el mismo gasto de CAYLA.
create or replace function retail.fn_asientos_claure(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (f date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, ot text, oid uuid, glosa text)
language sql
stable
set search_path = retail, public, extensions
as $$
  with
  lim as (select (p_desde::timestamp at time zone 'America/Lima') as ini, ((p_hasta + 1)::timestamp at time zone 'America/Lima') as fin),
  casa as (select retail.fn_empresa_casa_id() as id),
  -- Solo en una sede donde conviven dos empresas puede haber algo de otro dueño (hoy, Tienda LIM).
  sedes as (select u.id from retail.ubicaciones u where retail.fn_sede_con_dos_empresas(u.id)),
  -- Ventas del rango: el costo sellado de lo ajeno (`vt` de fn_asientos).
  vt as (
    select v.id, v.ubicacion_id, (v.created_at at time zone 'America/Lima')::date as f,
           sum(vi.costo_unitario * vi.cantidad) as costo
      from retail.ventas v
      join retail.venta_items vi on vi.venta_id = v.id
      cross join lim
     where v.created_at >= lim.ini and v.created_at < lim.fin and not coalesce(v.es_prueba, false)
       and (p_todo or v.ubicacion_id = any (p_ubics))
       and v.ubicacion_id in (select s.id from sedes s)
       and retail.fn_dueno_de_la_linea(vi.id) <> (select c.id from casa c)
     group by v.id, v.ubicacion_id, v.created_at
  ),
  -- Anulaciones del rango: lo ajeno que volvió vendible (`an.costo_ok` de fn_asientos; lo que no se puede vender es merma de CAYLA, no toca la 201).
  an as (
    select v.id, v.ubicacion_id, (v.anulado_en at time zone 'America/Lima')::date as f,
           sum(vi.costo_unitario * vi.cantidad) as costo_ok
      from retail.ventas v
      join retail.venta_items vi on vi.venta_id = v.id
      left join retail.venta_anulacion_items ai on ai.venta_item_id = vi.id
      cross join lim
     where v.estado = 'anulada' and v.anulado_en >= lim.ini and v.anulado_en < lim.fin and not coalesce(v.es_prueba, false)
       and (p_todo or v.ubicacion_id = any (p_ubics))
       and v.ubicacion_id in (select s.id from sedes s)
       and coalesce(ai.condicion, 'vendible') = 'vendible'
       and retail.fn_dueno_de_la_linea(vi.id) <> (select c.id from casa c)
     group by v.id, v.ubicacion_id, v.anulado_en
  ),
  -- Devoluciones aprobadas del rango (`dv.costo` de fn_asientos).
  dv as (
    select d.id, v.ubicacion_id, (d.aprobado_en at time zone 'America/Lima')::date as f,
           sum(vi.costo_unitario * di.cantidad) as costo
      from retail.devoluciones d
      join retail.ventas v on v.id = d.venta_id
      join retail.devolucion_items di on di.devolucion_id = d.id
      join retail.venta_items vi on vi.id = di.venta_item_id
      cross join lim
     where d.estado = 'aprobada' and d.aprobado_en >= lim.ini and d.aprobado_en < lim.fin and not coalesce(v.es_prueba, false)
       and (p_todo or v.ubicacion_id = any (p_ubics))
       and v.ubicacion_id in (select s.id from sedes s)
       and retail.fn_dueno_de_la_linea(vi.id) <> (select c.id from casa c)
     group by d.id, v.ubicacion_id, d.aprobado_en
  ),
  -- Mermas del rango, al costo de ESE día (`mm` de fn_asientos): lo que se pierde de CLAURE lo responde CAYLA (el gasto de siempre) y se le debe.
  mm as (
    select m.id, m.ubicacion_id, (m.created_at at time zone 'America/Lima')::date as f,
           abs(m.cantidad) * retail.fn_costo_variante_al(m.variante_id, m.created_at) as valor
      from retail.movimientos m
      cross join lim
     where m.created_at >= lim.ini and m.created_at < lim.fin
       and m.variante_id <> '22222222-2222-4222-8222-222222222222'
       and retail.fn_es_merma(m.tipo, m.motivo, m.cantidad)
       and (p_todo or m.ubicacion_id = any (p_ubics))
       and m.ubicacion_id in (select s.id from sedes s)
       and retail.fn_dueno_del_movimiento(m.empresa_id, m.ubicacion_id, m.variante_id) <> (select c.id from casa c)
  )
  -- Venta: la regla hizo Cr 201; se devuelve a la 201 y se debe a CLAURE.
  select vt.f, vt.ubicacion_id, 'claure_venta:' || vt.id, 'claure_venta'::text, '201'::text, vt.costo, 0::numeric, 'ventas'::text, vt.id,
         'La mercadería de CLAURE no es de CAYLA: no sale de su mercadería'::text
    from vt where vt.costo > 0
  union all
  select vt.f, vt.ubicacion_id, 'claure_venta:' || vt.id, 'claure_venta', '4699', 0, vt.costo, 'ventas', vt.id,
         'Se le debe a CLAURE lo que costó, desde que se vende'
    from vt where vt.costo > 0
  -- Anulación: la regla hizo Dr 201; se quita de la 201 y baja lo que se le debe.
  union all
  select an.f, an.ubicacion_id, 'claure_anulacion:' || an.id, 'claure_anulacion', '201', 0, an.costo_ok, 'ventas', an.id,
         'La prenda anulada vuelve a CLAURE, no a la mercadería de CAYLA'
    from an where an.costo_ok > 0
  union all
  select an.f, an.ubicacion_id, 'claure_anulacion:' || an.id, 'claure_anulacion', '4699', an.costo_ok, 0, 'ventas', an.id,
         'Baja lo que se le debe a CLAURE'
    from an where an.costo_ok > 0
  -- Devolución: la regla hizo Dr 201; igual que la anulación.
  union all
  select dv.f, dv.ubicacion_id, 'claure_devolucion:' || dv.id, 'claure_devolucion', '201', 0, dv.costo, 'devoluciones', dv.id,
         'La prenda devuelta vuelve a CLAURE, no a la mercadería de CAYLA'
    from dv where dv.costo > 0
  union all
  select dv.f, dv.ubicacion_id, 'claure_devolucion:' || dv.id, 'claure_devolucion', '4699', dv.costo, 0, 'devoluciones', dv.id,
         'Baja lo que se le debe a CLAURE'
    from dv where dv.costo > 0
  -- Merma: la regla hizo Cr 201; se devuelve a la 201 y se debe a CLAURE (el gasto de la merma sigue siendo de CAYLA).
  union all
  select mm.f, mm.ubicacion_id, 'claure_merma:' || mm.id, 'claure_merma', '201', mm.valor, 0, 'movimientos', mm.id,
         'La mercadería perdida era de CLAURE: no sale de la mercadería de CAYLA'
    from mm where mm.valor > 0
  union all
  select mm.f, mm.ubicacion_id, 'claure_merma:' || mm.id, 'claure_merma', '4699', 0, mm.valor, 'movimientos', mm.id,
         'CAYLA responde por lo que se pierde: se le debe a CLAURE'
    from mm where mm.valor > 0;
$$;

comment on function retail.fn_asientos_claure(date, date, boolean, uuid[]) is
  'ADR-0558: reclasifica a la 4699 («Por liquidar a CLAURE») el costo que las reglas de venta, anulación, devolución y merma dejaron en la 201 para mercadería de otro dueño. Se une en fn_asientos. De uso interno.';

revoke all on function retail.fn_asientos_claure(date, date, boolean, uuid[]) from public, anon, authenticated;

-- 4. Los reemplazos anclados --------------------------------------------------------------------------------------------------------
-- Cada uno reemplaza UN texto de la definición VIVA (no reescribe desde un archivo viejo: así no se pierde ningún parche que ya tenga).
create or replace function pg_temp.anclar_veces(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba %). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n, p_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 4.1 El diario: une los asientos de reclasificación.
select pg_temp.anclar_veces('retail.fn_asientos(date, date, uuid)',
  $v$    union all select * from retail.fn_asientos_pedidos_web(p_desde, p_hasta, v_todo, v_ubics)$v$,
  $n$    union all select * from retail.fn_asientos_pedidos_web(p_desde, p_hasta, v_todo, v_ubics)
    -- ADR-0558: lo vendido, anulado, devuelto o perdido de mercadería de CLAURE no sale de la 201 de CAYLA: se le debe a CLAURE (4699).
    union all select * from retail.fn_asientos_claure(p_desde, p_hasta, v_todo, v_ubics)$n$, 1);

-- 4.2 La mercadería del Balance: sin lo que es de otro dueño.
-- Los dos cambios van en la CTE `despues` y antes de ella, FUERA del texto que tocan los parches de pedidos web (20261015053000 y
-- 20261015115000): esas dos migraciones se pueden volver a pegar después de esta (su prueba lo exige) porque su texto sigue intacto.
select pg_temp.anclar_veces('retail.fn_bal_stock(date)',
  $v$  despues as ($v$,
  $n$  -- ADR-0558: lo que en una sede con dos empresas NO es de la casa (hoy, lo de CLAURE) está en el estante pero no es mercadería de CAYLA:
  -- es del otro dueño y se le debe al venderlo. Es lo que guarda `stock_dueno` hoy, menos lo que se movió después del corte con un dueño
  -- ajeno (el mismo cálculo de `despues`). El diario, por su lado, nunca lo sumó a la 201 (`fn_asientos_claure` reclasifica su salida).
  de_otros as (
    select z.variante_id, z.ubicacion_id, -sum(z.q)::bigint as q
      from (
        select d.variante_id, d.ubicacion_id, d.cantidad::bigint as q
          from retail.stock_dueno d
        union all
        select m.variante_id, m.ubicacion_id, -(case m.tipo when 'salida' then -m.cantidad else m.cantidad end)::bigint
          from retail.movimientos m cross join fin
         where m.created_at >= fin.t and m.tipo in ('entrada', 'salida', 'ajuste')
           and m.ubicacion_id in (select u.id from retail.ubicaciones u where retail.fn_sede_con_dos_empresas(u.id))
           and retail.fn_dueno_del_movimiento(m.empresa_id, m.ubicacion_id, m.variante_id) <> retail.fn_empresa_casa_id()
        union all
        -- Lo vendido por la web de otro dueño que todavía no se entregó: `vendido_web` ya lo resta de la tienda y arriba ya salió como
        -- ajeno; aquí se devuelve una vez para que no se reste dos veces (lo vendido y no anulado, con las condiciones de `vendido_web`).
        select vi.variante_id, v.ubicacion_id, -sum(vi.cantidad)::bigint
          from retail.pedido_web_lineas l
          join retail.venta_items vi on vi.id = l.venta_item_id
          join retail.ventas v on v.id = vi.venta_id
          cross join fin
         where v.created_at < fin.t and not coalesce(v.es_prueba, false)
           and not exists (select 1 from retail.movimientos m where m.venta_item_id = vi.id and m.tipo = 'salida' and m.created_at < fin.t)
           and not (v.estado = 'anulada' and v.anulado_en < fin.t)
           and coalesce(retail.fn_dueno_de_la_linea(vi.id), retail.fn_empresa_casa_id()) <> retail.fn_empresa_casa_id()
         group by 1, 2
      ) z
     group by 1, 2
  ),
  despues as ($n$, 1);

select pg_temp.anclar_veces('retail.fn_bal_stock(date)',
  $v$     where m.created_at >= fin.t and m.tipo = 'traslado'
     group by 1, 2
  ),$v$,
  $n$     where m.created_at >= fin.t and m.tipo = 'traslado'
     group by 1, 2
    -- ADR-0558: lo de otro dueño se resta de la mercadería de CAYLA (negativo, como lo que se devuelve del stock).
    union all select * from de_otros
  ),$n$, 1);

-- 4.3 Las causas de la 201: lo de otro dueño no se explica contra ella.
select pg_temp.anclar_veces('retail.fn_bal_causas_mercaderia(date, date)',
  $v$m.tipo in ('entrada', 'salida', 'ajuste')$v$,
  $n$m.tipo in ('entrada', 'salida', 'ajuste')
       -- ADR-0558: lo que entra o sale de mercadería de otro dueño (CLAURE) no es de CAYLA: no se explica contra su 201.
       and not (retail.fn_sede_con_dos_empresas(m.ubicacion_id)
                and retail.fn_dueno_del_movimiento(m.empresa_id, m.ubicacion_id, m.variante_id) <> retail.fn_empresa_casa_id())$n$, 1);

-- 5. Comprobación -------------------------------------------------------------------------------------------------------------------
do $$
begin
  if position('fn_asientos_claure' in pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) = 0 then
    raise exception 'fn_asientos no quedó uniendo la reclasificación de la mercadería de CLAURE';
  end if;
  if position('select * from de_otros' in pg_get_functiondef('retail.fn_bal_stock(date)'::regprocedure)) = 0
     or position('select * from vendido_web' in pg_get_functiondef('retail.fn_bal_stock(date)'::regprocedure)) = 0
     or position('select * from anulado_web' in pg_get_functiondef('retail.fn_bal_stock(date)'::regprocedure)) = 0 then
    raise exception 'fn_bal_stock no quedó restando la mercadería de otro dueño sin perder lo de los pedidos web';
  end if;
  if position('fn_dueno_del_movimiento' in pg_get_functiondef('retail.fn_bal_causas_mercaderia(date, date)'::regprocedure)) = 0 then
    raise exception 'fn_bal_causas_mercaderia no quedó dejando fuera la mercadería de otro dueño';
  end if;
  if not exists (select 1 from retail.cuentas where codigo = '4699' and tipo = 'pasivo') then
    raise exception 'Falta la cuenta 4699';
  end if;
end;
$$;

select 'QUEDÓ BIEN' as resultado;

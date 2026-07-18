-- Fecha de última venta real por prenda, para que "Estancado" mida días sin VENDER y no
-- días sin cualquier salida. Aplicada en Supabase el 2026-07-17, aprobada por Felipe.
--
-- QUÉ ARREGLA (Decisión 2 del checklist): el indicador "Estancado" medía "días sin
-- CUALQUIER salida", y bajar mercadería del almacén a la tienda cuenta como salida del
-- almacén — aunque nadie compró. Entonces una prenda podía llevar 44 días sin venderse,
-- le bajabas una unidad más del almacén, y el contador se reiniciaba a 0. Ahora se guarda
-- una fecha aparte, `ultima_venta`, que SOLO se toca con ventas reales (motivo='venta').
-- El lado de la pantalla (apps/web/lib/inteligencia.ts) lee esta columna en vez de
-- ultima_salida, y el indicador se renombró a "Días sin venta".

-- ==================== 1. Columna nueva ====================
alter table stock add column ultima_venta timestamptz;

-- ==================== 2. Backfill: última venta real por variante+sede ====================
update stock s set ultima_venta = sub.max_fecha
from (
  select variante_id, sede_id, max(created_at) as max_fecha
  from movimientos
  where tipo = 'salida' and motivo = 'venta'
  group by variante_id, sede_id
) sub
where s.variante_id = sub.variante_id and s.sede_id = sub.sede_id;

-- ==================== 3. fn_aplicar_movimiento: mantener ultima_venta ====================
-- Mismo cuerpo que 0010 (incluye el `for update` de la Decisión 1). El único cambio: en
-- la rama de salida, si el motivo es 'venta', también se sella la fecha de última venta.
create or replace function fn_aplicar_movimiento(p_movimiento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m movimientos%rowtype;
  v_actual integer;
begin
  select * into m from movimientos where id = p_movimiento_id;
  if not found then
    raise exception 'Movimiento % no existe', p_movimiento_id;
  end if;

  if m.tipo = 'salida' or m.tipo = 'traslado' then
    select coalesce(cantidad, 0) into v_actual from stock
      where variante_id = m.variante_id and sede_id = m.sede_id
      for update;
    if coalesce(v_actual, 0) < m.cantidad then
      raise exception 'Stock insuficiente en sede % (hay %, se pidió %)', m.sede_id, coalesce(v_actual, 0), m.cantidad;
    end if;
  end if;

  if m.tipo = 'entrada' then
    insert into stock (variante_id, sede_id, cantidad, ultima_entrada, contenedor_id)
      values (m.variante_id, m.sede_id, m.cantidad, m.created_at, m.contenedor_id)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad,
            ultima_entrada = excluded.ultima_entrada,
            contenedor_id = coalesce(excluded.contenedor_id, stock.contenedor_id),
            updated_at = now();

  elsif m.tipo = 'salida' then
    update stock set
      cantidad = cantidad - m.cantidad,
      ultima_salida = m.created_at,
      ultima_venta = case when m.motivo = 'venta' then m.created_at else ultima_venta end,
      updated_at = now()
      where variante_id = m.variante_id and sede_id = m.sede_id;

  elsif m.tipo = 'ajuste' then
    insert into stock (variante_id, sede_id, cantidad)
      values (m.variante_id, m.sede_id, m.cantidad)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();

  elsif m.tipo = 'traslado' then
    if m.sede_destino_id is null then
      raise exception 'Traslado requiere sede_destino_id';
    end if;
    update stock set cantidad = cantidad - m.cantidad, ultima_salida = m.created_at, updated_at = now()
      where variante_id = m.variante_id and sede_id = m.sede_id;
    insert into stock (variante_id, sede_id, cantidad, ultima_entrada, contenedor_id)
      values (m.variante_id, m.sede_destino_id, m.cantidad, m.created_at, m.contenedor_id)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad,
            ultima_entrada = excluded.ultima_entrada,
            contenedor_id = coalesce(excluded.contenedor_id, stock.contenedor_id),
            updated_at = now();
  end if;
end;
$$;

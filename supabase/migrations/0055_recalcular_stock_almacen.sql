-- ============================================================================
-- 0055 — `recalcular_stock()` vuelve a saber que el almacén existe
--
-- Ver ADR-0031 y el espejo de producción (`supabase/unificacion/
-- 35_recalcular_stock_almacen.sql`) para el razonamiento completo. Esta
-- versión local reemplaza la de `0044_almacen_interno.sql` (bloque 7) sumando
-- tres cosas que esa migración documentó como pendientes: (1) el candado de
-- Líder, perdido en el camino en producción y nunca repuesto acá tampoco; (2)
-- la excepción de `tipo='traslado'` para que "devolver a almacén" no deje
-- inventario fantasma; (3) el guard de `stock_minimo is null` en el delete de
-- piso, el "borde heredado" que `0044` dejó anotado sin resolver.
-- ============================================================================

create or replace function recalcular_stock()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piso integer;
  v_almacen integer;
begin
  if not fn_es_lider() then
    raise exception 'Solo un Líder puede recalcular el stock';
  end if;

  -- ===== PISO: todo lo que NO está enrutado a un contenedor 'almacen' =====
  insert into stock (variante_id, sede_id, cantidad, ultima_entrada, ultima_salida)
  select variante_id, sede_id, sum(delta), max(entrada_en), max(salida_en)
  from (
    select m.variante_id,
           m.sede_id,
           case when m.tipo in ('entrada', 'ajuste') then m.cantidad else -m.cantidad end as delta,
           case when m.tipo = 'entrada' then m.created_at end as entrada_en,
           case when m.tipo in ('salida', 'traslado') then m.created_at end as salida_en
    from movimientos m
    left join contenedores c on c.id = m.contenedor_id
    where m.tipo = 'traslado' or coalesce(c.tipo, '') <> 'almacen'
    union all
    select variante_id, sede_destino_id, cantidad, created_at, null
    from movimientos
    where tipo = 'traslado' and sede_destino_id is not null
  ) neto
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = excluded.cantidad,
        ultima_entrada = excluded.ultima_entrada,
        ultima_salida = excluded.ultima_salida;
  get diagnostics v_piso = row_count;

  update stock s set ultima_venta = sub.max_fecha
  from (
    select variante_id, sede_id, max(created_at) as max_fecha
    from movimientos where tipo = 'salida' and motivo = 'venta'
    group by variante_id, sede_id
  ) sub
  where s.variante_id = sub.variante_id and s.sede_id = sub.sede_id;

  delete from stock s
  where s.stock_minimo is null
    and not exists (
      select 1 from movimientos m
      left join contenedores c on c.id = m.contenedor_id
      where m.variante_id = s.variante_id
        and (
          (m.sede_id = s.sede_id and (m.tipo = 'traslado' or coalesce(c.tipo, '') <> 'almacen'))
          or (m.tipo = 'traslado' and m.sede_destino_id = s.sede_id)
        )
    );

  -- ===== ALMACÉN: espejo, solo lo enrutado a un contenedor 'almacen' =====
  insert into stock_almacen (variante_id, sede_id, cantidad, ultima_entrada, ultima_salida)
  select variante_id, sede_id, sum(delta), max(entrada_en), max(salida_en)
  from (
    select m.variante_id,
           m.sede_id,
           case when m.tipo in ('entrada', 'ajuste') then m.cantidad else -m.cantidad end as delta,
           case when m.tipo = 'entrada' then m.created_at end as entrada_en,
           case when m.tipo = 'salida' then m.created_at end as salida_en
    from movimientos m
    join contenedores c on c.id = m.contenedor_id and c.tipo = 'almacen'
    where m.tipo in ('entrada', 'salida', 'ajuste')
  ) neto
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = excluded.cantidad,
        ultima_entrada = excluded.ultima_entrada,
        ultima_salida = excluded.ultima_salida;
  get diagnostics v_almacen = row_count;

  delete from stock_almacen sa
  where not exists (
    select 1 from movimientos m
    join contenedores c on c.id = m.contenedor_id and c.tipo = 'almacen'
    where m.variante_id = sa.variante_id and m.sede_id = sa.sede_id
  );

  raise notice 'recalcular_stock: % filas de piso, % filas de almacén recalculadas.', v_piso, v_almacen;
end;
$$;

revoke all on function recalcular_stock() from public;
grant execute on function recalcular_stock() to authenticated, service_role;

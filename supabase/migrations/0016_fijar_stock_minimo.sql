-- RPC para fijar el mínimo de stock por sede (Fase B). La tabla stock no tiene
-- política de UPDATE (su cantidad solo la mueven las funciones de movimientos);
-- esta función es el único camino para tocar stock.stock_minimo, y solo Líder.

create or replace function fijar_stock_minimo(
  p_variante_id uuid,
  p_sede_id uuid,
  p_minimo integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_es_lider() then
    raise exception 'Solo un Líder puede fijar mínimos de stock';
  end if;
  if p_minimo is not null and p_minimo < 0 then
    raise exception 'El mínimo no puede ser negativo';
  end if;

  -- Si la variante nunca tuvo stock en esa sede, se crea la fila en 0 con su mínimo.
  insert into stock (variante_id, sede_id, cantidad, stock_minimo)
    values (p_variante_id, p_sede_id, 0, p_minimo)
    on conflict (variante_id, sede_id) do update
      set stock_minimo = excluded.stock_minimo, updated_at = now();
end;
$$;

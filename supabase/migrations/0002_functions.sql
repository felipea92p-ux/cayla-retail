-- Funciones: trigger de updated_at, y recalcular_stock() (misma regla de oro que
-- CAYLA Inventario: el stock es un snapshot calculado desde movimientos, nunca se
-- edita a mano).

create or replace function fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sedes_set_updated_at before update on sedes
  for each row execute function fn_set_updated_at();
create trigger personas_set_updated_at before update on personas
  for each row execute function fn_set_updated_at();
create trigger productos_set_updated_at before update on productos
  for each row execute function fn_set_updated_at();
create trigger variantes_set_updated_at before update on variantes
  for each row execute function fn_set_updated_at();
create trigger ordenes_produccion_set_updated_at before update on ordenes_produccion
  for each row execute function fn_set_updated_at();
create trigger ordenes_compra_set_updated_at before update on ordenes_compra
  for each row execute function fn_set_updated_at();

-- Aplica un movimiento: valida stock suficiente en salidas, actualiza (o crea) el
-- snapshot de `stock`, y para traslado hace la resta en origen + suma en destino de
-- forma atómica (misma regla que registrarTraslado en CAYLA Inventario/Codigo.gs).
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
      where variante_id = m.variante_id and sede_id = m.sede_id;
    if coalesce(v_actual, 0) < m.cantidad then
      raise exception 'Stock insuficiente en sede % (hay %, se pidió %)', m.sede_id, coalesce(v_actual, 0), m.cantidad;
    end if;
  end if;

  if m.tipo = 'entrada' then
    insert into stock (variante_id, sede_id, cantidad, ultima_entrada)
      values (m.variante_id, m.sede_id, m.cantidad, m.created_at)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad,
            ultima_entrada = excluded.ultima_entrada,
            updated_at = now();

  elsif m.tipo = 'salida' then
    update stock set cantidad = cantidad - m.cantidad, ultima_salida = m.created_at, updated_at = now()
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
    insert into stock (variante_id, sede_id, cantidad, ultima_entrada)
      values (m.variante_id, m.sede_destino_id, m.cantidad, m.created_at)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad,
            ultima_entrada = excluded.ultima_entrada,
            updated_at = now();
  end if;
end;
$$;

-- RPC pública: crea el movimiento y aplica el efecto de stock en una sola transacción.
create or replace function registrar_movimiento(
  p_variante_id uuid,
  p_sede_id uuid,
  p_tipo text,
  p_cantidad integer,
  p_motivo text default null,
  p_canal text default null,
  p_sede_destino_id uuid default null,
  p_monto numeric default null,
  p_venta_id uuid default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_persona_id uuid;
begin
  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, canal, sede_destino_id, monto, venta_id, usuario_id, nota)
    values (p_variante_id, p_sede_id, p_tipo, p_cantidad, p_motivo, p_canal, p_sede_destino_id, p_monto, p_venta_id, v_persona_id, p_nota)
    returning id into v_id;

  perform fn_aplicar_movimiento(v_id);
  return v_id;
end;
$$;

-- Reconstruye stock desde cero a partir de movimientos (red de seguridad, igual que
-- "🔧 Recalcular stock" en CAYLA Inventario).
create or replace function recalcular_stock()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table stock;

  insert into stock (variante_id, sede_id, cantidad, ultima_entrada)
  select variante_id, sede_id, sum(cantidad), max(created_at)
  from movimientos where tipo = 'entrada'
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = stock.cantidad + excluded.cantidad, ultima_entrada = excluded.ultima_entrada;

  insert into stock (variante_id, sede_id, cantidad, ultima_salida)
  select variante_id, sede_id, -sum(cantidad), max(created_at)
  from movimientos where tipo = 'salida'
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = stock.cantidad + excluded.cantidad, ultima_salida = excluded.ultima_salida;

  insert into stock (variante_id, sede_id, cantidad)
  select variante_id, sede_id, sum(cantidad)
  from movimientos where tipo = 'ajuste'
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = stock.cantidad + excluded.cantidad;

  insert into stock (variante_id, sede_id, cantidad, ultima_salida)
  select variante_id, sede_id, -sum(cantidad), max(created_at)
  from movimientos where tipo = 'traslado'
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = stock.cantidad + excluded.cantidad, ultima_salida = excluded.ultima_salida;

  insert into stock (variante_id, sede_id, cantidad, ultima_entrada)
  select variante_id, sede_destino_id, sum(cantidad), max(created_at)
  from movimientos where tipo = 'traslado' and sede_destino_id is not null
  group by variante_id, sede_destino_id
  on conflict (variante_id, sede_id) do update
    set cantidad = stock.cantidad + excluded.cantidad, ultima_entrada = excluded.ultima_entrada;
end;
$$;

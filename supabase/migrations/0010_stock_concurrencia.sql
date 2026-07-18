-- Endurecimiento del stock contra concurrencia. Aplicada en Supabase el 2026-07-17,
-- aprobada por Felipe tras confirmar que no había stock negativo previo.
--
-- QUÉ ARREGLA: una condición de carrera real en el descuento de stock. Antes, cuando dos
-- ventas de la MISMA última unidad, en la MISMA sede, llegaban en el mismo instante, las
-- dos leían "hay 1", las dos pasaban la validación, y las dos descontaban → el stock
-- quedaba en -1 (el escenario "dos clientas se llevan la última prenda en el mismo
-- segundo"). Dos capas de defensa, principio "estados imposibles primero":
--   1. `for update`: al validar, se bloquea la fila de stock hasta terminar; la segunda
--      venta espera y re-lee el valor ya descontado, y se rechaza con el mensaje amable.
--   2. `check (cantidad >= 0)`: red de seguridad — la base nunca deja el stock negativo.

-- ==================== 1. Red de seguridad: stock nunca negativo ====================
alter table stock add constraint stock_cantidad_no_negativa check (cantidad >= 0);

-- ==================== 2. Integridad: venta_id apunta a una venta real ====================
-- La columna movimientos.venta_id existe desde 0001 (antes de que existiera la tabla
-- `ventas`, creada en 0007), así que nunca tuvo llave foránea. Se la damos ahora.
alter table movimientos add constraint movimientos_venta_id_fkey
  foreign key (venta_id) references ventas (id);

-- ==================== 3. fn_aplicar_movimiento con bloqueo de fila ====================
-- Mismo cuerpo que 0008_almacen.sql (la versión vigente, con contenedor_id). El ÚNICO
-- cambio funcional es el `for update` en el SELECT de validación — todo lo demás es
-- idéntico, se reescribe entero solo porque `create or replace` exige el cuerpo completo.
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
    -- for update: bloquea la fila de stock de esta (variante, sede) hasta que la
    -- transacción termine. Dos salidas simultáneas de la misma fila se serializan
    -- aquí — la segunda espera y re-lee el valor ya descontado, en vez de leer el
    -- valor viejo y descontar sobre él.
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

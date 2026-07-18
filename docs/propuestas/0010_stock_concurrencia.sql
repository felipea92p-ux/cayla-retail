-- ⚠️ PROPUESTA — todavía NO aprobada ni aplicada. Vive en docs/propuestas/ (fuera de
-- supabase/migrations/) a propósito: así NO se aplica sola si alguna vez se corre
-- `supabase db push`. Cuando Felipe la apruebe, se mueve a supabase/migrations/ con el
-- nombre 0010_stock_concurrencia.sql y recién ahí se corre. Ver docs/CHECKLIST-MANANA.md.
--
-- QUÉ ARREGLA: una condición de carrera real en el descuento de stock. Hoy, cuando dos
-- ventas de la MISMA última unidad, en la MISMA sede, llegan en el mismo instante, las
-- dos leen "hay 1", las dos pasan la validación, y las dos descuentan → el stock queda
-- en -1. Es exactamente el escenario "dos clientas se llevan la última prenda en el
-- mismo segundo". Con 3 tiendas y una sola cajera por sede es poco frecuente HOY, pero
-- es una bomba silenciosa: cuando pase, el stock miente y nadie se entera hasta el
-- conteo físico.
--
-- CÓMO LO ARREGLA (dos capas, principio "estados imposibles primero"):
--   1. `for update`: al leer el stock para validar, se BLOQUEA esa fila hasta terminar.
--      La segunda venta espera a que la primera termine, y recién ahí re-lee "hay 0" y
--      se rechaza con el mensaje amable de siempre ("Stock insuficiente").
--   2. `check (cantidad >= 0)`: red de seguridad a nivel de base de datos. Aunque algún
--      día un camino nuevo se olvide de validar, la base nunca deja el stock negativo.
--
-- ANTES DE CORRER (ver checklist): revisar que no haya stock negativo hoy con
--   select * from stock where cantidad < 0;
-- Si devuelve filas, corregir ese dato primero (recalcular_stock() o ajuste manual),
-- porque el `check` del paso 1 fallaría al crearse.

-- ==================== 1. Red de seguridad: stock nunca negativo ====================
alter table stock add constraint stock_cantidad_no_negativa check (cantidad >= 0);

-- ==================== 2. Integridad: venta_id apunta a una venta real ====================
-- La columna movimientos.venta_id existe desde 0001 (antes de que existiera la tabla
-- `ventas`, creada en 0007), así que nunca tuvo llave foránea. Se la damos ahora: un
-- movimiento de venta no puede referenciar una venta que no existe.
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

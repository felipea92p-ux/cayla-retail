-- ============================================================================
-- ALMACÉN INTERNO · retail.stock_almacen + contenedor tipo 'almacen'
-- Correr en cayla-DYNAMIC. Todo en el cajón `retail`. Decisión de Felipe
-- (2026-09-03): el almacén de cada sede DEJA de ser una sede hermana en
-- `sedes` / `retail.sede_meta` — pasa a ser algo DENTRO de la misma sede.
-- `public.sedes` NO SE TOCA en este archivo (ni se le inserta ni se le lee
-- para escribir nada — solo se referencia por FK, igual que ya hacen
-- `retail.stock`/`retail.contenedores`).
--
-- QUÉ PROMETE
--   1. Cada sede operativa (TRU, AQP, 003, LIM) tiene UN contenedor propio
--      de tipo 'almacen' (CCO/Central no lo necesita — no se le crea uno).
--   2. `retail.stock_almacen` guarda, aparte de `retail.stock` (el piso),
--      cuánto de cada variante sigue en el almacén de esa sede, sin bajar
--      todavía al piso de venta. Las dos bolsas se cuentan por separado.
--   3. `retail.bajar_a_piso` / `retail.devolver_a_almacen` mueven cantidad
--      entre las dos bolsas de la MISMA sede, de forma atómica (todo o
--      nada) y dejan su propio rastro en `movimientos` — la misma tabla
--      append-only de siempre, no una bitácora paralela.
--   4. Cualquier entrada/salida/ajuste/traslado que NO use el contenedor
--      'almacen' sigue exactamente igual que hoy — cero cambio de
--      comportamiento para el piso de venta y los traslados entre sedes
--      (TRU→AQP, etc.), que son la mayoría del histórico real en
--      `movimientos`.
--
-- QUÉ ASUME
--   - `retail.sede_meta` (creada por el paso "02" que nunca quedó
--     versionado en el repo — confirmado en producción el 2026-09-03:
--     `retail.sedes` devolvió 5 filas) tiene las columnas `sede_id`,
--     `tipo` ('tienda'/'fabrica'/'corporativo') y `tienda_asociada_id` —
--     lo único que este archivo lee de ella, solo para el seed del punto
--     2. No se le agrega ni se le quita ninguna columna.
--   - Ninguna fila de `sedes`/`retail.sede_meta` tiene hoy `tipo='almacen'`
--     (las 5 sedes reales son TRU/AQP/003/LIM/CCO). Por eso "Recibir
--     mercadería" y "Bajar a tienda" no tenían adónde escribir en
--     producción — esto no migra datos reales de un almacén viejo: los
--     construye recién. No hay nada que limpiar ni borrar.
--   - `retail.fn_aplicar_movimiento(uuid)` y `retail.recalcular_stock()`
--     no tienen, en producción, una firma ni un cuerpo distintos de los
--     que están en supabase/unificacion/07_funciones_operacion.sql y
--     08_funciones_finanzas.sql — se verificó que ningún llamador (RPCs
--     de producción/ventas/traslados) les manda parámetros de más.
--     OJO: esto NO vale para `retail.recibir_lote` — el frontend
--     (RecibirLoteForm.tsx) la llama con `p_orden_compra_id` /
--     `p_orden_produccion_id`, que el archivo del repo NO tiene. Por eso
--     este archivo NO toca `retail.recibir_lote` (ver pregunta abierta al
--     final de la respuesta) — no hace falta tocarla igual: ya reenvía
--     `contenedor_id` por ítem a `movimientos`, así que el punto 4 de
--     arriba basta para que "recibir hacia el almacén" funcione sin
--     reescribir esa función a ciegas.
--
-- POR QUÉ SE ELIGIÓ ASÍ
--   DECIDÍ: una tabla nueva y aislada (`retail.stock_almacen`, PK
--     variante+sede) en vez de partir la cantidad dentro de `retail.stock`.
--   DESCARTÉ (a) usar el `contenedor_id` que YA existe en `stock` como
--     única marca de ubicación: hoy es solo una etiqueta de la ÚLTIMA
--     ubicación conocida, no reparte cantidad entre ubicaciones — una
--     venta que no filtra por contenedor no distinguiría "10 en el piso"
--     de "10 en el almacén sin bajar todavía", y podría vender lo que un
--     colaborador ni siquiera sacó del cuarto de atrás.
--   DESCARTÉ (b) ampliar la PK de `stock` a (variante_id, sede_id,
--     contenedor_id): correcto en el papel, pero reescribe TODA la
--     maquinaria ya verificada (fn_aplicar_movimiento, recalcular_stock,
--     fijar_stock_minimo, la venta) que hoy asume una sola fila por
--     variante+sede — tocar el núcleo sin necesidad, cuando una tabla
--     aparte resuelve lo mismo sin arriesgar lo que ya funciona con plata
--     real.
--   SE ROMPE SI: el negocio necesita algún día MÁS de un almacén por sede
--     (ej. un almacén central compartido entre AQP y TRU) — este modelo
--     asume 1 almacén = 1 sede (lo hace cumplir un índice único) y no lo
--     soporta sin rediseño.
--
-- CÓMO SE REVIERTE
--   - Si todavía no hay stock real movido por acá:
--       drop function if exists retail.bajar_a_piso(uuid, uuid, integer, text);
--       drop function if exists retail.devolver_a_almacen(uuid, uuid, integer, text);
--       drop table if exists retail.stock_almacen;
--     y volver a correr, tal cual están en git, 07_funciones_operacion.sql
--     y 08_funciones_finanzas.sql (restauran fn_aplicar_movimiento y
--     recalcular_stock a su versión anterior).
--   - Si ya hay stock real movido: NO se borra la tabla (regla del repo:
--     nunca DELETE/DROP de datos reales) — se deja de exponer desde el
--     frontend y se coordina con Felipe qué hacer con lo que quedó adentro.
--
-- Idempotente: se puede pegar dos veces sin romper nada — todo es
-- `create table if not exists` / `create or replace function` /
-- `on conflict ... do nothing` / `drop ... if exists` antes de recrear.
-- ============================================================================

-- ---------- 1. contenedores: 'almacen' como tercer tipo válido ----------
alter table retail.contenedores drop constraint if exists contenedores_tipo_check;
alter table retail.contenedores add constraint contenedores_tipo_check
  check (tipo in ('estante', 'caja', 'almacen'));

-- Un solo contenedor tipo 'almacen' por sede (lo hace cumplir la base, no el código).
create unique index if not exists contenedores_un_almacen_por_sede
  on retail.contenedores (sede_id) where tipo = 'almacen';

-- ---------- 2. seed: crear el contenedor 'almacen' de cada sede operativa ----------
-- tienda (TRU, AQP, 003) y fabrica (LIM) lo necesitan; corporativo (CCO) no.
insert into retail.contenedores (sede_id, codigo, tipo)
select m.sede_id, 'ALMACEN', 'almacen'
from retail.sede_meta m
where m.tipo in ('tienda', 'fabrica')
on conflict (sede_id, codigo) do nothing;

-- ---------- 3. stock_almacen: la bolsa de "recibido pero aún no bajado" ----------
create table if not exists retail.stock_almacen (
  variante_id uuid not null references retail.variantes (id) on delete cascade,
  sede_id uuid not null references public.sedes (id),
  cantidad integer not null default 0,
  ultima_entrada timestamptz,
  ultima_salida timestamptz,
  updated_at timestamptz not null default now(),
  primary key (variante_id, sede_id)
);
create index if not exists stock_almacen_sede_id_idx on retail.stock_almacen (sede_id);

alter table retail.stock_almacen enable row level security;
drop policy if exists stock_almacen_select on retail.stock_almacen;
create policy stock_almacen_select on retail.stock_almacen
  for select using (retail.puede_operar_sede(sede_id));
-- Sin política de insert/update a propósito: se escribe SOLO vía RPC
-- security definer (fn_aplicar_movimiento), igual que retail.stock hoy.

-- ---------- 4. fn_aplicar_movimiento: enruta a stock_almacen cuando corresponde ----------
-- Comportamiento SIN cambios cuando m.contenedor_id es null o apunta a un
-- contenedor que NO es tipo 'almacen' (estante/caja de siempre) — la rama
-- nueva solo se activa para entrada/salida/ajuste con contenedor 'almacen'.
-- 'traslado' NUNCA entra a la rama nueva: sigue siendo cruce entre sedes
-- distintas, exactamente como hoy.
create or replace function retail.fn_aplicar_movimiento(p_movimiento_id uuid)
returns void language plpgsql security definer set search_path = retail, public
as $$
declare
  m movimientos%rowtype;
  v_actual integer;
  v_es_almacen boolean := false;
  v_contenedor_sede_id uuid;
begin
  select * into m from movimientos where id = p_movimiento_id;
  if not found then raise exception 'Movimiento % no existe', p_movimiento_id; end if;

  -- Si el movimiento trae contenedor, primero se valida que sea de la sede
  -- correcta (destino, si es traslado; la propia, si no) — estado imposible
  -- que antes no se detectaba: un contenedor de otra sede colándose acá.
  if m.contenedor_id is not null then
    select c.sede_id, (c.tipo = 'almacen') into v_contenedor_sede_id, v_es_almacen
      from contenedores c where c.id = m.contenedor_id;
    if v_contenedor_sede_id is null then
      raise exception 'El contenedor % no existe', m.contenedor_id;
    end if;
    if m.tipo = 'traslado' then
      if v_contenedor_sede_id <> coalesce(m.sede_destino_id, m.sede_id) then
        raise exception 'El contenedor % no pertenece a la sede destino del traslado', m.contenedor_id;
      end if;
      v_es_almacen := false; -- traslado nunca enruta a stock_almacen, ver cabecera.
    elsif v_contenedor_sede_id <> m.sede_id then
      raise exception 'El contenedor % no pertenece a la sede %', m.contenedor_id, m.sede_id;
    end if;
  end if;

  if v_es_almacen and m.tipo in ('entrada', 'salida', 'ajuste') then
    -- ===== rama ALMACÉN: misma sede, bolsa aparte (retail.stock_almacen) =====
    if m.tipo = 'salida' then
      select coalesce(cantidad, 0) into v_actual from stock_almacen
        where variante_id = m.variante_id and sede_id = m.sede_id for update;
      if coalesce(v_actual, 0) < m.cantidad then
        raise exception 'Stock insuficiente en el almacén de la sede % (hay %, se pidió %)',
          m.sede_id, coalesce(v_actual, 0), m.cantidad;
      end if;
    end if;

    if m.tipo = 'entrada' then
      insert into stock_almacen (variante_id, sede_id, cantidad, ultima_entrada)
        values (m.variante_id, m.sede_id, m.cantidad, m.created_at)
        on conflict (variante_id, sede_id) do update
          set cantidad = stock_almacen.cantidad + excluded.cantidad,
              ultima_entrada = excluded.ultima_entrada, updated_at = now();
    elsif m.tipo = 'salida' then
      update stock_almacen set cantidad = cantidad - m.cantidad, ultima_salida = m.created_at, updated_at = now()
        where variante_id = m.variante_id and sede_id = m.sede_id;
    elsif m.tipo = 'ajuste' then
      insert into stock_almacen (variante_id, sede_id, cantidad)
        values (m.variante_id, m.sede_id, m.cantidad)
        on conflict (variante_id, sede_id) do update
          set cantidad = stock_almacen.cantidad + excluded.cantidad, updated_at = now();
    end if;
    return;
  end if;

  -- ===== rama PISO / cruce entre sedes: retail.stock (SIN CAMBIOS respecto a hoy) =====
  if m.tipo = 'salida' or m.tipo = 'traslado' then
    select coalesce(cantidad, 0) into v_actual from stock
      where variante_id = m.variante_id and sede_id = m.sede_id for update;
    if coalesce(v_actual, 0) < m.cantidad then
      raise exception 'Stock insuficiente en sede % (hay %, se pidió %)', m.sede_id, coalesce(v_actual, 0), m.cantidad;
    end if;
  end if;

  if m.tipo = 'entrada' then
    insert into stock (variante_id, sede_id, cantidad, ultima_entrada, contenedor_id)
      values (m.variante_id, m.sede_id, m.cantidad, m.created_at, m.contenedor_id)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, ultima_entrada = excluded.ultima_entrada,
            contenedor_id = coalesce(excluded.contenedor_id, stock.contenedor_id), updated_at = now();
  elsif m.tipo = 'salida' then
    update stock set cantidad = cantidad - m.cantidad, ultima_salida = m.created_at, updated_at = now()
      where variante_id = m.variante_id and sede_id = m.sede_id;
  elsif m.tipo = 'ajuste' then
    insert into stock (variante_id, sede_id, cantidad)
      values (m.variante_id, m.sede_id, m.cantidad)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();
  elsif m.tipo = 'traslado' then
    if m.sede_destino_id is null then raise exception 'Traslado requiere sede_destino_id'; end if;
    update stock set cantidad = cantidad - m.cantidad, ultima_salida = m.created_at, updated_at = now()
      where variante_id = m.variante_id and sede_id = m.sede_id;
    insert into stock (variante_id, sede_id, cantidad, ultima_entrada, contenedor_id)
      values (m.variante_id, m.sede_destino_id, m.cantidad, m.created_at, m.contenedor_id)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, ultima_entrada = excluded.ultima_entrada,
            contenedor_id = coalesce(excluded.contenedor_id, stock.contenedor_id), updated_at = now();
  end if;
end;
$$;

-- ---------- 5. bajar_a_piso: almacén → piso, misma sede, atómico ----------
create or replace function retail.bajar_a_piso(
  p_sede_id uuid, p_variante_id uuid, p_cantidad integer, p_nota text default null
)
returns uuid language plpgsql security definer set search_path = retail, public
as $$
declare
  v_persona_id uuid; v_contenedor_id uuid; v_mov_salida_id uuid; v_mov_entrada_id uuid;
begin
  if not retail.puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para bajar mercadería a piso en esa sede';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a bajar debe ser mayor a 0';
  end if;

  select id into v_contenedor_id from retail.contenedores where sede_id = p_sede_id and tipo = 'almacen';
  if v_contenedor_id is null then
    raise exception 'Esta sede no tiene un almacén configurado';
  end if;

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();

  -- Sale del almacén (contenedor 'almacen') — si no alcanza, fn_aplicar_movimiento
  -- lanza excepción acá y la función entera aborta: la entrada de abajo nunca corre.
  insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, contenedor_id, nota)
    values (p_variante_id, p_sede_id, 'salida', p_cantidad, 'bajada a piso', v_persona_id, v_contenedor_id, p_nota)
    returning id into v_mov_salida_id;
  perform retail.fn_aplicar_movimiento(v_mov_salida_id);

  -- Entra al piso (sin contenedor = piso de venta, igual que cualquier stock hoy).
  insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, nota)
    values (p_variante_id, p_sede_id, 'entrada', p_cantidad, 'bajada de almacén', v_persona_id, p_nota)
    returning id into v_mov_entrada_id;
  perform retail.fn_aplicar_movimiento(v_mov_entrada_id);

  return v_mov_entrada_id;
end;
$$;

-- ---------- 6. devolver_a_almacen: piso → almacén, misma sede, atómico ----------
-- Espejo de bajar_a_piso (ej. exceso de piso que se guarda de vuelta).
create or replace function retail.devolver_a_almacen(
  p_sede_id uuid, p_variante_id uuid, p_cantidad integer, p_nota text default null
)
returns uuid language plpgsql security definer set search_path = retail, public
as $$
declare
  v_persona_id uuid; v_contenedor_id uuid; v_mov_salida_id uuid; v_mov_entrada_id uuid;
begin
  if not retail.puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para devolver mercadería al almacén de esa sede';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a devolver debe ser mayor a 0';
  end if;

  select id into v_contenedor_id from retail.contenedores where sede_id = p_sede_id and tipo = 'almacen';
  if v_contenedor_id is null then
    raise exception 'Esta sede no tiene un almacén configurado';
  end if;

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();

  -- Sale del piso — si no alcanza, fn_aplicar_movimiento lanza excepción acá
  -- y la función entera aborta: la entrada al almacén de abajo nunca corre.
  insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, nota)
    values (p_variante_id, p_sede_id, 'salida', p_cantidad, 'devolución a almacén', v_persona_id, p_nota)
    returning id into v_mov_salida_id;
  perform retail.fn_aplicar_movimiento(v_mov_salida_id);

  -- Entra al almacén (contenedor 'almacen' de esta sede).
  insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, contenedor_id, nota)
    values (p_variante_id, p_sede_id, 'entrada', p_cantidad, 'devolución a almacén', v_persona_id, v_contenedor_id, p_nota)
    returning id into v_mov_entrada_id;
  perform retail.fn_aplicar_movimiento(v_mov_entrada_id);

  return v_mov_entrada_id;
end;
$$;

-- ---------- 7. recalcular_stock: ahora reconstruye piso Y almacén por separado ----------
-- Función de mantenimiento manual (no la llama el frontend). Antes de este
-- archivo, agrupaba TODOS los movimientos de una sede en una sola bolsa; si
-- se corriera tal cual con movimientos ya enrutados al almacén, los mezclaría
-- de vuelta en el piso — por eso se reescribe completa acá, no se parcha.
create or replace function retail.recalcular_stock()
returns void language plpgsql security definer set search_path = retail, public
as $$
begin
  truncate table stock;
  truncate table stock_almacen;

  -- PISO: entrada/salida/ajuste sin contenedor, o con contenedor que NO es 'almacen'.
  insert into stock (variante_id, sede_id, cantidad, ultima_entrada)
    select m.variante_id, m.sede_id, sum(m.cantidad), max(m.created_at)
    from movimientos m left join contenedores c on c.id = m.contenedor_id
    where m.tipo = 'entrada' and coalesce(c.tipo, '') <> 'almacen'
    group by m.variante_id, m.sede_id
    on conflict (variante_id, sede_id) do update
      set cantidad = stock.cantidad + excluded.cantidad, ultima_entrada = excluded.ultima_entrada;

  insert into stock (variante_id, sede_id, cantidad, ultima_salida)
    select m.variante_id, m.sede_id, -sum(m.cantidad), max(m.created_at)
    from movimientos m left join contenedores c on c.id = m.contenedor_id
    where m.tipo = 'salida' and coalesce(c.tipo, '') <> 'almacen'
    group by m.variante_id, m.sede_id
    on conflict (variante_id, sede_id) do update
      set cantidad = stock.cantidad + excluded.cantidad, ultima_salida = excluded.ultima_salida;

  insert into stock (variante_id, sede_id, cantidad)
    select m.variante_id, m.sede_id, sum(m.cantidad)
    from movimientos m left join contenedores c on c.id = m.contenedor_id
    where m.tipo = 'ajuste' and coalesce(c.tipo, '') <> 'almacen'
    group by m.variante_id, m.sede_id
    on conflict (variante_id, sede_id) do update set cantidad = stock.cantidad + excluded.cantidad;

  insert into stock (variante_id, sede_id, cantidad, ultima_salida)
    select variante_id, sede_id, -sum(cantidad), max(created_at) from movimientos where tipo = 'traslado'
    group by variante_id, sede_id
    on conflict (variante_id, sede_id) do update
      set cantidad = stock.cantidad + excluded.cantidad, ultima_salida = excluded.ultima_salida;

  insert into stock (variante_id, sede_id, cantidad, ultima_entrada)
    select variante_id, sede_destino_id, sum(cantidad), max(created_at) from movimientos
    where tipo = 'traslado' and sede_destino_id is not null
    group by variante_id, sede_destino_id
    on conflict (variante_id, sede_id) do update
      set cantidad = stock.cantidad + excluded.cantidad, ultima_entrada = excluded.ultima_entrada;

  -- ALMACÉN: espejo de piso, pero solo entrada/salida/ajuste CON contenedor tipo 'almacen'.
  insert into stock_almacen (variante_id, sede_id, cantidad, ultima_entrada)
    select m.variante_id, m.sede_id, sum(m.cantidad), max(m.created_at)
    from movimientos m join contenedores c on c.id = m.contenedor_id and c.tipo = 'almacen'
    where m.tipo = 'entrada'
    group by m.variante_id, m.sede_id
    on conflict (variante_id, sede_id) do update
      set cantidad = stock_almacen.cantidad + excluded.cantidad, ultima_entrada = excluded.ultima_entrada;

  insert into stock_almacen (variante_id, sede_id, cantidad, ultima_salida)
    select m.variante_id, m.sede_id, -sum(m.cantidad), max(m.created_at)
    from movimientos m join contenedores c on c.id = m.contenedor_id and c.tipo = 'almacen'
    where m.tipo = 'salida'
    group by m.variante_id, m.sede_id
    on conflict (variante_id, sede_id) do update
      set cantidad = stock_almacen.cantidad + excluded.cantidad, ultima_salida = excluded.ultima_salida;

  insert into stock_almacen (variante_id, sede_id, cantidad)
    select m.variante_id, m.sede_id, sum(m.cantidad)
    from movimientos m join contenedores c on c.id = m.contenedor_id and c.tipo = 'almacen'
    where m.tipo = 'ajuste'
    group by m.variante_id, m.sede_id
    on conflict (variante_id, sede_id) do update set cantidad = stock_almacen.cantidad + excluded.cantidad;
end;
$$;

-- ============================================================================
-- VERIFICACIÓN (correr a mano después de pegar todo lo de arriba)
-- ============================================================================
-- 1. Debe haber exactamente 4 contenedores 'almacen' (TRU, AQP, 003, LIM) y
--    CCO no debe aparecer:
--   select s.codigo, ct.codigo, ct.tipo
--   from retail.contenedores ct join public.sedes s on s.id = ct.sede_id
--   where ct.tipo = 'almacen' order by s.codigo;
--
-- 2. Antes de tener botones en el frontend, se puede probar a mano (con un
--    usuario real logueado, para que auth.uid()/puede_operar_sede resuelvan):
--   select retail.recibir_lote(  -- ya soporta contenedor_id por ítem, sin tocarla
--     '<sede_id de TRU>', 'proveedor',
--     jsonb_build_array(jsonb_build_object(
--       'variante_id', '<una variante real>', 'cantidad', 5,
--       'contenedor_id', (select id from retail.contenedores where sede_id = '<sede_id de TRU>' and tipo = 'almacen')
--     ))
--   );
--   select cantidad from retail.stock_almacen where sede_id = '<sede_id de TRU>' and variante_id = '<esa variante>'; -- debe dar 5
--   select cantidad from retail.stock where sede_id = '<sede_id de TRU>' and variante_id = '<esa variante>'; -- NO debe moverse
--
--   select retail.bajar_a_piso('<sede_id de TRU>', '<esa variante>', 3);
--   -- stock_almacen debe quedar en 2, stock (piso) debe subir en 3.
-- ============================================================================

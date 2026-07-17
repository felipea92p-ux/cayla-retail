-- Fase 3: ingreso de mercadería (lotes/fardos), almacén por sede, ubicaciones
-- (contenedores), y bajada/devolución reutilizando el traslado ya existente.
-- Ver docs/adr/ para el detalle del descubrimiento (24 preguntas antes de diseñar).

-- ==================== SEDES: tipo 'almacen' + vínculo con su tienda ====================
alter table sedes drop constraint sedes_tipo_check;
alter table sedes add constraint sedes_tipo_check check (tipo in ('tienda', 'fabrica', 'almacen'));
alter table sedes add column tienda_asociada_id uuid references sedes (id);

alter table sedes drop constraint sedes_codigo_check;
alter table sedes add constraint sedes_codigo_check
  check (codigo in ('TRU', 'AQP', 'LIM', 'TALLER', 'TRU-ALM', 'AQP-ALM', 'LIM-ALM'));

insert into sedes (codigo, nombre, tipo, tienda_asociada_id)
select codigo || '-ALM', 'Almacén ' || nombre, 'almacen', id
from sedes where codigo in ('TRU', 'AQP', 'LIM');

-- ==================== LOTES (el fardo semanal, agrupador para trazabilidad) ====================
create table lotes (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id),
  origen text not null check (origen in ('taller', 'proveedor')),
  proveedor text,
  numero_guia text,
  fecha_recepcion date not null default current_date,
  recibido_por uuid references personas (id),
  nota text,
  created_at timestamptz not null default now()
);
create index lotes_sede_id_idx on lotes (sede_id);

-- ==================== CONTENEDORES (ubicaciones fijas dentro de cada almacén) ====================
create table contenedores (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id),
  codigo text not null,
  tipo text not null check (tipo in ('estante', 'caja')),
  created_at timestamptz not null default now(),
  unique (sede_id, codigo)
);

-- ==================== STOCK / MOVIMIENTOS: rastro de ubicación y lote ====================
alter table stock add column contenedor_id uuid references contenedores (id);
alter table movimientos add column contenedor_id uuid references contenedores (id);
alter table movimientos add column lote_id uuid references lotes (id);

-- ==================== RLS ====================
alter table lotes enable row level security;
alter table contenedores enable row level security;

create policy lotes_select_lider on lotes for select using (fn_es_lider());
create policy lotes_select_propia_sede on lotes for select using (sede_id = fn_sede_actual_persona());
create policy lotes_insert_propia_sede on lotes for insert
  with check (sede_id = fn_sede_actual_persona() or fn_es_lider());

create policy contenedores_select_lider on contenedores for select using (fn_es_lider());
create policy contenedores_select_propia_sede on contenedores for select
  using (sede_id = fn_sede_actual_persona());
create policy contenedores_insert_propia_sede on contenedores for insert
  with check (sede_id = fn_sede_actual_persona() or fn_es_lider());

-- ==================== fn_aplicar_movimiento: se extiende, no se reescribe ====================
-- Mismo cuerpo que 0002_functions.sql, con una adición: si el movimiento trae
-- contenedor_id, se propaga al snapshot de stock en el mismo insert/on conflict que
-- ya existía. Sin cambio de comportamiento para movimientos que no lo usan.
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

-- ==================== registrar_movimiento: + contenedor_id, lote_id opcionales ====================
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
  p_nota text default null,
  p_contenedor_id uuid default null,
  p_lote_id uuid default null
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

  insert into movimientos (
    variante_id, sede_id, tipo, cantidad, motivo, canal, sede_destino_id, monto,
    venta_id, usuario_id, nota, contenedor_id, lote_id
  )
    values (
      p_variante_id, p_sede_id, p_tipo, p_cantidad, p_motivo, p_canal, p_sede_destino_id,
      p_monto, p_venta_id, v_persona_id, p_nota, p_contenedor_id, p_lote_id
    )
    returning id into v_id;

  perform fn_aplicar_movimiento(v_id);
  return v_id;
end;
$$;

-- ==================== recibir_lote: crea el lote y N entradas de una vez ====================
-- p_items: [{ variante_id?, producto_id?, sku_padre?, sku?, referencia?, categoria?,
--             genero?, marca?, temporada?, talla?, color?, costo?, precio?,
--             stock_minimo?, cantidad, contenedor_id? }, ...]
-- Si variante_id viene null, crea producto (si tampoco viene producto_id) y variante
-- nuevos — corre con permisos elevados (security definer) solo para este flujo
-- puntual; Integrante sigue sin poder crear catálogo por fuera de recibir un fardo.
create or replace function recibir_lote(
  p_sede_id uuid,
  p_origen text,
  p_items jsonb,
  p_proveedor text default null,
  p_numero_guia text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_lote_id uuid;
  v_item jsonb;
  v_variante_id uuid;
  v_producto_id uuid;
  v_movimiento_id uuid;
  v_contenedor_id uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El lote no tiene ítems';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into lotes (sede_id, origen, proveedor, numero_guia, recibido_por, nota)
    values (p_sede_id, p_origen, p_proveedor, p_numero_guia, v_persona_id, p_nota)
    returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'variante_id') is not null then
      v_variante_id := (v_item ->> 'variante_id')::uuid;
    else
      if (v_item ->> 'producto_id') is not null then
        v_producto_id := (v_item ->> 'producto_id')::uuid;
      else
        insert into productos (sku_padre, referencia, categoria, genero, marca, temporada)
          values (
            v_item ->> 'sku_padre', v_item ->> 'referencia', v_item ->> 'categoria',
            v_item ->> 'genero', v_item ->> 'marca', v_item ->> 'temporada'
          )
          returning id into v_producto_id;
      end if;

      insert into variantes (producto_id, sku, talla, color, costo, precio, stock_minimo)
        values (
          v_producto_id, v_item ->> 'sku', v_item ->> 'talla', v_item ->> 'color',
          coalesce((v_item ->> 'costo')::numeric, 0), coalesce((v_item ->> 'precio')::numeric, 0),
          coalesce((v_item ->> 'stock_minimo')::integer, 0)
        )
        returning id into v_variante_id;
    end if;

    v_contenedor_id := case when (v_item ->> 'contenedor_id') is not null
      then (v_item ->> 'contenedor_id')::uuid else null end;

    insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, lote_id, contenedor_id)
      values (
        v_variante_id, p_sede_id, 'entrada', (v_item ->> 'cantidad')::integer,
        'ingreso de lote', v_persona_id, v_lote_id, v_contenedor_id
      )
      returning id into v_movimiento_id;
    perform fn_aplicar_movimiento(v_movimiento_id);
  end loop;

  return v_lote_id;
end;
$$;

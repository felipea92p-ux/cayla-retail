-- ============================================================================
-- Variantes estilo Shopify por corrida + "marcar terminado" → inventario.
--
-- Una corrida produce un modelo en varias tallas/colores. El COSTO es de la
-- corrida (cabecera `producciones`); acá solo se desglosa CUÁNTAS unidades por
-- talla/color (`produccion_lineas`). Al marcar la corrida terminada se generan
-- las prendas como stock real del taller (movimiento tipo 'entrada' por cada
-- variante) — reutiliza el inventario que ya existe, no inventa nada nuevo.
--
-- Idempotencia: `producciones.inventariado_at` evita que un doble clic sume el
-- stock dos veces (estado imposible: producción contada dos veces en inventario).
-- ============================================================================

-- Marca de cuándo la corrida entró al inventario (null = todavía no).
alter table producciones add column if not exists inventariado_at timestamptz;

-- Desglose de la corrida por variante (SKU): cuántas unidades de cada talla/color.
create table if not exists produccion_lineas (
  id uuid primary key default gen_random_uuid(),
  produccion_id uuid not null references producciones (id) on delete cascade,
  variante_id uuid not null references variantes (id),
  cantidad integer not null check (cantidad > 0),
  created_at timestamptz not null default now(),
  unique (produccion_id, variante_id)
);

alter table produccion_lineas enable row level security;

drop policy if exists produccion_lineas_select on produccion_lineas;
create policy produccion_lineas_select on produccion_lineas for select using (
  fn_es_lider() or exists (
    select 1 from producciones p
    where p.id = produccion_lineas.produccion_id and fn_puede_operar_sede(p.unidad_id)
  )
);

-- ----------------------------------------------------------------------------
-- Marca una corrida como terminada: manda sus prendas al inventario del taller.
-- ----------------------------------------------------------------------------
create or replace function marcar_produccion_terminada(p_produccion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod producciones%rowtype;
  v_persona_id uuid;
  v_linea record;
  v_mov_id uuid;
begin
  select * into v_prod from producciones where id = p_produccion_id;
  if not found then
    raise exception 'La producción no existe';
  end if;
  if not fn_puede_operar_sede(v_prod.unidad_id) then
    raise exception 'No tienes permiso sobre esta producción';
  end if;
  if v_prod.es_muestra then
    raise exception 'Una muestra no entra al inventario';
  end if;
  if v_prod.inventariado_at is not null then
    raise exception 'Esta producción ya está en el inventario';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  for v_linea in select * from produccion_lineas where produccion_id = p_produccion_id
  loop
    insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, nota)
      values (v_linea.variante_id, v_prod.unidad_id, 'entrada', v_linea.cantidad,
              'Producción del taller', v_persona_id, 'Producción ' || left(p_produccion_id::text, 8))
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  update producciones
    set estado = 'terminado', inventariado_at = now()
    where id = p_produccion_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Registrar una corrida (con variantes estilo Shopify). Reemplaza al de 0026.
-- Si `p_variantes` viene vacío, la corrida es una sola pieza sin talla/color.
-- Si `p_marcar_terminado` es true, entra al inventario en el mismo paso.
-- ----------------------------------------------------------------------------
drop function if exists registrar_produccion(uuid, integer, numeric, numeric, numeric, uuid, text, text, text, boolean, text);

create or replace function registrar_produccion(
  p_unidad_id uuid,
  p_cantidad integer,
  p_costo_tela numeric,
  p_costo_avios numeric,
  p_precio_taller numeric,
  p_variantes jsonb default '[]'::jsonb,
  p_producto_id uuid default null,
  p_referencia text default null,
  p_categoria_id uuid default null,
  p_detalle text default null,
  p_es_muestra boolean default false,
  p_marcar_terminado boolean default false,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_producto_id uuid := p_producto_id;
  v_prod_id uuid;
  v_variantes jsonb := coalesce(p_variantes, '[]'::jsonb);
  v_total integer;
  v_costo_unit numeric(12, 2);
  v_item jsonb;
  v_talla text;
  v_color text;
  v_cant integer;
  v_variante_id uuid;
begin
  if not fn_puede_operar_sede(p_unidad_id) then
    raise exception 'No tienes permiso para registrar producción en esa unidad';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  -- Sin variantes → una sola pieza sin talla/color.
  if jsonb_array_length(v_variantes) = 0 then
    if p_cantidad is null or p_cantidad <= 0 then
      raise exception 'La cantidad debe ser mayor a 0';
    end if;
    v_variantes := jsonb_build_array(
      jsonb_build_object('talla', null, 'color', null, 'cantidad', p_cantidad)
    );
  end if;

  select coalesce(sum((elem->>'cantidad')::int), 0) into v_total
    from jsonb_array_elements(v_variantes) elem;
  if v_total <= 0 then
    raise exception 'La cantidad total debe ser mayor a 0';
  end if;

  v_costo_unit := round((coalesce(p_costo_tela, 0) + coalesce(p_costo_avios, 0)) / v_total, 2);

  -- Modelo nuevo → crear el producto.
  if v_producto_id is null then
    if coalesce(trim(p_referencia), '') = '' then
      raise exception 'Falta el nombre del modelo';
    end if;
    insert into productos (sku_padre, referencia, categoria_id)
      values ('T' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9), p_referencia, p_categoria_id)
      returning id into v_producto_id;
  end if;

  -- Cabecera: queda 'en_proceso' hasta marcarla terminada.
  insert into producciones (unidad_id, producto_id, cantidad, costo_tela, costo_avios,
                            precio_taller, detalle, es_muestra, estado, nota, creado_por)
    values (p_unidad_id, v_producto_id, v_total, coalesce(p_costo_tela, 0), coalesce(p_costo_avios, 0),
            coalesce(p_precio_taller, 0), p_detalle, coalesce(p_es_muestra, false), 'en_proceso', p_nota, v_persona_id)
    returning id into v_prod_id;

  -- Variantes (SKUs) + desglose por talla/color.
  for v_item in select * from jsonb_array_elements(v_variantes)
  loop
    v_talla := nullif(trim(v_item->>'talla'), '');
    v_color := nullif(trim(v_item->>'color'), '');
    v_cant := (v_item->>'cantidad')::int;
    if v_cant is null or v_cant <= 0 then
      continue;
    end if;

    select id into v_variante_id from variantes
      where producto_id = v_producto_id
        and talla is not distinct from v_talla
        and color is not distinct from v_color
      limit 1;

    if v_variante_id is null then
      insert into variantes (producto_id, sku, talla, color, costo, precio, precio_taller)
        values (v_producto_id,
                'T' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 11),
                v_talla, v_color, v_costo_unit, 0, coalesce(p_precio_taller, 0))
        returning id into v_variante_id;
    else
      update variantes
        set costo = v_costo_unit,
            precio_taller = coalesce(p_precio_taller, precio_taller),
            updated_at = now()
        where id = v_variante_id;
    end if;

    insert into produccion_lineas (produccion_id, variante_id, cantidad)
      values (v_prod_id, v_variante_id, v_cant)
      on conflict (produccion_id, variante_id) do update set cantidad = excluded.cantidad;
  end loop;

  if coalesce(p_marcar_terminado, false) then
    perform marcar_produccion_terminada(v_prod_id);
  end if;

  return v_prod_id;
end;
$$;

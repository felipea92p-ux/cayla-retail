-- ============================================================================
-- Producción a nivel de MODELO / corrida (no por talla-color).
-- Un lote produce un modelo completo (varias tallas/colores de la misma tela);
-- el costo por prenda sale del total. Se registra UNA sola vez, no por variante.
-- Las tallas/colores quedan como detalle libre (`detalle`) por ahora; los SKUs
-- vendibles se crearán con el flujo de venta a tiendas (fase siguiente).
-- ============================================================================

alter table producciones add column if not exists producto_id uuid references productos (id);
alter table producciones alter column variante_id drop not null;
alter table producciones add column if not exists precio_taller numeric(12, 2) not null default 0;
alter table producciones add column if not exists detalle text;
create index if not exists producciones_producto_idx on producciones (producto_id);

-- Reemplaza el RPC anterior (era por variante) por el de nivel modelo.
drop function if exists registrar_produccion(uuid, integer, numeric, numeric, numeric, uuid, text, text, text, uuid, boolean, text);

create or replace function registrar_produccion(
  p_unidad_id uuid,
  p_cantidad integer,
  p_costo_tela numeric,
  p_costo_avios numeric,
  p_precio_taller numeric,
  p_producto_id uuid default null,
  p_referencia text default null,
  p_categoria_id uuid default null,
  p_detalle text default null,
  p_es_muestra boolean default false,
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
begin
  if not fn_puede_operar_sede(p_unidad_id) then
    raise exception 'No tienes permiso para registrar producción en esa unidad';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a 0';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  -- Modelo nuevo → crear el producto (queda en el catálogo).
  if v_producto_id is null then
    if coalesce(trim(p_referencia), '') = '' then
      raise exception 'Falta el nombre del modelo';
    end if;
    insert into productos (sku_padre, referencia, categoria_id)
      values ('T' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9), p_referencia, p_categoria_id)
      returning id into v_producto_id;
  end if;

  insert into producciones (unidad_id, producto_id, cantidad, costo_tela, costo_avios,
                            precio_taller, detalle, es_muestra, nota, creado_por)
    values (p_unidad_id, v_producto_id, p_cantidad, coalesce(p_costo_tela, 0), coalesce(p_costo_avios, 0),
            coalesce(p_precio_taller, 0), p_detalle, coalesce(p_es_muestra, false), p_nota, v_persona_id)
    returning id into v_prod_id;

  return v_prod_id;
end;
$$;

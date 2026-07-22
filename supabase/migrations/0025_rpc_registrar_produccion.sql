-- ============================================================================
-- RPC: registrar un lote de producción con su costo directo (tela + avíos).
-- Calcula el costo por prenda, actualiza el modelo (costo + precio a tienda), y
-- si el modelo es NUEVO lo crea en el catálogo (listo para vender). No toca stock
-- por ahora (el flujo de producto terminado → tienda se decide aparte).
-- ============================================================================

create or replace function registrar_produccion(
  p_unidad_id uuid,
  p_cantidad integer,
  p_costo_tela numeric,
  p_costo_avios numeric,
  p_precio_taller numeric,
  p_variante_id uuid default null,
  p_referencia text default null,
  p_talla text default null,
  p_color text default null,
  p_categoria_id uuid default null,
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
  v_variante_id uuid := p_variante_id;
  v_producto_id uuid;
  v_prod_id uuid;
  v_costo_unit numeric(12, 2);
begin
  if not fn_puede_operar_sede(p_unidad_id) then
    raise exception 'No tienes permiso para registrar producción en esa unidad';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a 0';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();
  v_costo_unit := round((coalesce(p_costo_tela, 0) + coalesce(p_costo_avios, 0)) / p_cantidad, 2);

  if v_variante_id is null then
    -- Modelo NUEVO: crear producto + variante (queda vendible en el catálogo).
    if coalesce(trim(p_referencia), '') = '' then
      raise exception 'Falta el nombre del modelo nuevo';
    end if;
    insert into productos (sku_padre, referencia, categoria_id)
      values ('T' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9), p_referencia, p_categoria_id)
      returning id into v_producto_id;
    insert into variantes (producto_id, sku, talla, color, costo, precio, precio_taller)
      values (v_producto_id,
              'T' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 11),
              p_talla, p_color, v_costo_unit, 0, coalesce(p_precio_taller, 0))
      returning id into v_variante_id;
  else
    -- Modelo existente: refresca su costo y su precio a tienda.
    update variantes
      set costo = v_costo_unit,
          precio_taller = coalesce(p_precio_taller, precio_taller),
          updated_at = now()
      where id = v_variante_id;
  end if;

  insert into producciones (unidad_id, variante_id, cantidad, costo_tela, costo_avios, es_muestra, nota, creado_por)
    values (p_unidad_id, v_variante_id, p_cantidad, coalesce(p_costo_tela, 0), coalesce(p_costo_avios, 0),
            coalesce(p_es_muestra, false), p_nota, v_persona_id)
    returning id into v_prod_id;

  return v_prod_id;
end;
$$;

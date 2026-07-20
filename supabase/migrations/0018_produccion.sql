-- Módulo Producción (Taller) — diseñado tras descubrimiento con Felipe (2026-07-19):
-- produce en continuo, >100 prendas/semana, etapas corte→confección→acabado, entrega
-- directa a cada tienda, costo calculado por receta (sin inventario de insumos aún).

-- ==================== ORDENES DE PRODUCCIÓN: etapa, destino, nota ====================
alter table ordenes_produccion add column etapa text
  check (etapa in ('corte', 'confeccion', 'acabado')) default 'corte';
alter table ordenes_produccion add column destino_sede_id uuid references sedes (id);
alter table ordenes_produccion add column nota text;

-- El lote recibido en tienda puede nacer de una producción del Taller — mismo cierre
-- de ciclo que las órdenes de compra.
alter table lotes add column orden_produccion_id uuid references ordenes_produccion (id);

-- ==================== RECETA DE COSTO (bom_items de Fase 1, ahora con precio) ====================
-- Receta por modelo: cantidades × precio de referencia + mano de obra = costo sugerido.
-- NO es inventario de insumos (eso quedó para después): es una calculadora honesta.
alter table bom_items add column precio_unitario numeric(12, 4);
alter table productos add column costo_mano_obra numeric(12, 2);

-- ==================== RLS: el Taller opera sus órdenes ====================
-- La política de Fase 1 era solo-Líder. El equipo del Taller (sede TALLER) necesita
-- ver y avanzar sus propias órdenes.
create policy ordenes_produccion_select_propia_sede on ordenes_produccion for select
  using (sede_id = fn_sede_actual_persona());
-- La tienda destino ve las producciones que vienen hacia ella (para ligarlas al recibir).
create policy ordenes_produccion_select_destino on ordenes_produccion for select
  using (destino_sede_id = fn_sede_actual_persona());
create policy ordenes_produccion_insert_propia_sede on ordenes_produccion for insert
  with check (sede_id = fn_sede_actual_persona() or fn_es_lider());
create policy ordenes_produccion_update_propia_sede on ordenes_produccion for update
  using (sede_id = fn_sede_actual_persona() or fn_es_lider());

-- ==================== recibir_lote: + p_orden_produccion_id ====================
-- Mismo cuerpo que 0017. Novedad: la recepción con origen taller puede ligarse a la
-- producción; al recibirla, la orden queda completada con su fecha de fin.
create or replace function recibir_lote(
  p_sede_id uuid,
  p_origen text,
  p_items jsonb,
  p_proveedor text default null,
  p_numero_guia text default null,
  p_nota text default null,
  p_orden_compra_id uuid default null,
  p_orden_produccion_id uuid default null
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
  if not fn_puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para recibir mercadería en ese almacén';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into lotes (sede_id, origen, proveedor, numero_guia, recibido_por, nota, orden_compra_id, orden_produccion_id)
    values (p_sede_id, p_origen, p_proveedor, p_numero_guia, v_persona_id, p_nota, p_orden_compra_id, p_orden_produccion_id)
    returning id into v_lote_id;

  if p_orden_compra_id is not null then
    update ordenes_compra set estado = 'recibida', updated_at = now()
      where id = p_orden_compra_id and estado in ('pendiente', 'confirmada');
  end if;

  if p_orden_produccion_id is not null then
    update ordenes_produccion set
      estado = 'completada',
      fecha_fin = coalesce(fecha_fin, current_date),
      updated_at = now()
      where id = p_orden_produccion_id and estado in ('planeada', 'en_proceso');
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'variante_id') is not null then
      v_variante_id := (v_item ->> 'variante_id')::uuid;
    else
      if (v_item ->> 'producto_id') is not null then
        v_producto_id := (v_item ->> 'producto_id')::uuid;
      else
        insert into productos (sku_padre, referencia, categoria_id, genero, marca, temporada)
          values (
            v_item ->> 'sku_padre', v_item ->> 'referencia',
            case when (v_item ->> 'categoria_id') is not null then (v_item ->> 'categoria_id')::uuid else null end,
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

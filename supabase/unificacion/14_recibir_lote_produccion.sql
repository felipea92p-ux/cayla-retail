-- ============================================================================
-- recibir_lote completo · CUERPO SCHEMA-CALIFICADO PARA PRODUCCIÓN
-- Correr en cayla-DYNAMIC. Solo toca `retail`.
--
-- Por qué existe este archivo aparte de `supabase/migrations/0031_recibir_
-- lote_completo.sql`: 0031 es la versión LOCAL (idéntica a la 0018, para
-- `npx supabase db reset`/pgTAP) — usa nombres sin schema y
-- `set search_path = public`, que en LOCAL es donde vive todo el esquema de
-- retail. En PRODUCCIÓN `public` es el schema de CAYLA DYNAMIC (planilla real)
-- y retail vive en el schema `retail` — pegar 0031 tal cual ahí NO
-- reemplazaría `retail.recibir_lote` (que es a la que llama el frontend): crearía
-- una función suelta `public.recibir_lote` dentro del schema de Dynamic, sin
-- tocar el bug real. Este archivo es la traducción schema-calificada — mismo
-- comportamiento que 0031/ADR-0004, en el cajón correcto.
--
-- QUÉ PROMETE (igual que ADR-0004 — ver ahí el detalle completo)
--   1. Valida sede con `retail.puede_operar_sede`, igual que
--      `retail.registrar_movimiento`.
--   2. Guarda `categoria_id` al crear un producto nuevo.
--   3. Acepta `p_orden_compra_id` y cierra la orden de compra al recibir.
--
-- QUÉ NO HACE (a propósito, igual que 0031/ADR-0004)
--   NO agrega `p_orden_produccion_id` — esa reconciliación
--   (`ordenes_produccion` vs `producciones`) queda como tarea aparte.
--
-- QUÉ ASUME
--   `retail.lotes` tiene columna `orden_compra_id` (confirmado 2026-09-03,
--   no una suposición) y `retail.productos` tiene columna `categoria_id`
--   (de la migración `0009`/`0030`, ya en producción). `retail.puede_operar_sede`
--   y `retail.fn_aplicar_movimiento` verificados contra producción el
--   2026-09-03 (ver `12_almacen_interno.sql` y el hilo de esta sesión).
--
-- CÓMO SE REVIERTE
--   Pegar de nuevo el cuerpo real verificado el 2026-09-03 (sin sede,
--   sin categoria_id, sin orden_compra_id) — queda citado completo en
--   `docs/adr/0004-recibir-lote-drift-unificacion.md` si hace falta.
--
-- Idempotente: create or replace.
-- ============================================================================

create or replace function retail.recibir_lote(
  p_sede_id uuid,
  p_origen text,
  p_items jsonb,
  p_proveedor text default null,
  p_numero_guia text default null,
  p_nota text default null,
  p_orden_compra_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'retail', 'public'
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
  if not retail.puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa sede';
  end if;

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();

  insert into lotes (sede_id, origen, proveedor, numero_guia, recibido_por, nota, orden_compra_id)
    values (p_sede_id, p_origen, p_proveedor, p_numero_guia, v_persona_id, p_nota, p_orden_compra_id)
    returning id into v_lote_id;

  if p_orden_compra_id is not null then
    update ordenes_compra set estado = 'recibida', updated_at = now()
      where id = p_orden_compra_id and estado in ('pendiente', 'confirmada');
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
    perform retail.fn_aplicar_movimiento(v_movimiento_id);
  end loop;

  return v_lote_id;
end;
$$;

-- ============================================================================
-- VERIFICACIÓN (correr a mano después de pegar)
-- ============================================================================
-- select pg_get_functiondef('retail.recibir_lote(uuid,text,jsonb,text,text,text,uuid)'::regprocedure);
-- -- debe mostrar el chequeo de sede, categoria_id en el insert de productos,
-- -- y el parámetro p_orden_compra_id.
-- ============================================================================

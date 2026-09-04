-- ============================================================================
-- SUPERADO — NO PEGAR ESTE ARCHIVO. Usar en su lugar
-- supabase/unificacion/14_recibir_lote_produccion.sql (incluye este mismo
-- chequeo de sede + categoria_id + p_orden_compra_id, ver ADR-0004).
-- Se conserva solo como registro de cómo se encontró el hallazgo el
-- 2026-09-03 — no como archivo pendiente de aplicar.
-- ============================================================================
-- FIX DE SEGURIDAD · retail.recibir_lote valida la sede del que llama
-- Correr en cayla-DYNAMIC. Solo toca `retail`.
--
-- QUÉ PROMETE
--   `retail.recibir_lote` empieza a exigir que quien la llama pueda operar
--   `p_sede_id` (Líder, o integrante de esa misma sede/su almacén asociado),
--   igual que ya exige `retail.registrar_movimiento`. Hoy no lo exige: es
--   SECURITY DEFINER y no valida sede en ningún punto del cuerpo — cualquier
--   autenticado que llame el RPC directo (sin pasar por la pantalla) puede
--   recibir mercadería en la sede de otra tienda.
--
-- QUÉ ASUME
--   El resto del cuerpo es BYTE POR BYTE igual al verificado en producción
--   el 2026-09-03 (`select pg_get_functiondef('retail.recibir_lote'::regproc)`,
--   confirmado por Felipe) — el único cambio es agregar el chequeo al
--   principio. Asume que `retail.puede_operar_sede(uuid)` existe en
--   producción con esa firma (la usa `retail.registrar_movimiento` hoy,
--   `supabase/unificacion/07_funciones_operacion.sql:65`) — no se verificó
--   directamente en esta pasada; si no existe con ese nombre exacto, el
--   `CREATE OR REPLACE` de abajo falla al pegarlo (error ruidoso, no
--   silencioso) y no llega a aplicarse nada.
--
-- POR QUÉ SE ELIGIÓ ASÍ
--   DECIDÍ: agregar el chequeo directo en el cuerpo verificado, sin tocar
--   ninguna otra línea.
--   DESCARTÉ reescribir la función completa "a la mejor forma posible" (ej.
--   reordenar validaciones, agregar más checks): el objetivo es cerrar el
--   hueco de seguridad hoy, con el menor cambio posible sobre una función
--   que mueve inventario real — no una limpieza general.
--   SE ROMPE SI: `retail.puede_operar_sede` no existe con esa firma exacta
--   en producción — entonces el CREATE OR REPLACE falla y no aplica nada
--   (falla segura, no silenciosa).
--
-- CÓMO SE REVIERTE
--   Pegar de nuevo el cuerpo tal cual lo devolvió el SELECT del 2026-09-03
--   (sin el bloque `if not retail.puede_operar_sede...`), o restaurar desde
--   supabase/unificacion/08_funciones_finanzas.sql si esa versión coincide.
--
-- Idempotente: CREATE OR REPLACE, se puede pegar dos veces sin romper nada.
-- ============================================================================

CREATE OR REPLACE FUNCTION retail.recibir_lote(p_sede_id uuid, p_origen text, p_items jsonb, p_proveedor text DEFAULT NULL::text, p_numero_guia text DEFAULT NULL::text, p_nota text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public'
AS $function$
declare v_persona_id uuid; v_lote_id uuid; v_item jsonb; v_variante_id uuid; v_producto_id uuid; v_movimiento_id uuid; v_contenedor_id uuid;
begin
  if not retail.puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa sede';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'El lote no tiene ítems'; end if;
  select id into v_persona_id from public.personas where auth_user_id = auth.uid();
  insert into lotes (sede_id, origen, proveedor, numero_guia, recibido_por, nota) values (p_sede_id, p_origen, p_proveedor, p_numero_guia, v_persona_id, p_nota) returning id into v_lote_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'variante_id') is not null then
      v_variante_id := (v_item ->> 'variante_id')::uuid;
    else
      if (v_item ->> 'producto_id') is not null then
        v_producto_id := (v_item ->> 'producto_id')::uuid;
      else
        insert into productos (sku_padre, referencia, genero, marca, temporada)
          values (v_item ->> 'sku_padre', v_item ->> 'referencia', v_item ->> 'genero', v_item ->> 'marca', v_item ->> 'temporada') returning id into v_producto_id;
      end if;
      insert into variantes (producto_id, sku, talla, color, costo, precio, stock_minimo)
        values (v_producto_id, v_item ->> 'sku', v_item ->> 'talla', v_item ->> 'color',
                coalesce((v_item ->> 'costo')::numeric, 0), coalesce((v_item ->> 'precio')::numeric, 0), coalesce((v_item ->> 'stock_minimo')::integer, 0)) returning id into v_variante_id;
    end if;
    v_contenedor_id := case when (v_item ->> 'contenedor_id') is not null then (v_item ->> 'contenedor_id')::uuid else null end;
    insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, lote_id, contenedor_id)
      values (v_variante_id, p_sede_id, 'entrada', (v_item ->> 'cantidad')::integer, 'ingreso de lote', v_persona_id, v_lote_id, v_contenedor_id) returning id into v_movimiento_id;
    perform retail.fn_aplicar_movimiento(v_movimiento_id);
  end loop;
  return v_lote_id;
end; $function$

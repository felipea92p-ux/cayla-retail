-- Reafirma `recibir_lote` tal como quedó en la 0018 — localmente no cambia
-- nada (0018 ya es la versión vigente aquí). Existe porque PRODUCCIÓN sí
-- diverge: el script de unificación de julio (`supabase/unificacion/
-- 08_funciones_finanzas.sql`) migró una copia más vieja de esta función al
-- schema `retail` — sin validar sede, sin guardar `categoria_id`, sin aceptar
-- `p_orden_compra_id` — y nadie lo notó porque el catálogo real todavía no
-- se había cargado. Verificado 2026-09-03 contra `pg_get_functiondef` de
-- producción.
--
-- QUÉ PROMETE (idéntico a 0018, documentado aquí por la brecha con producción)
--   1. Valida que quien llama pueda operar esa sede (fn_puede_operar_sede),
--      igual que las otras 4 RPCs security-definer desde la 0012.
--   2. Guarda `categoria_id` al crear un producto nuevo — el formulario
--      (RecibirLoteForm.tsx:226) ya la manda; la copia de producción la
--      ignoraba.
--   3. Acepta `p_orden_compra_id`: liga el lote a la orden y la marca
--      'recibida', cerrando el ciclo pedido→recibido (Fase F2).
--
-- QUÉ NO HACE (a propósito, ver ADR-0004)
--   NO agrega `p_orden_produccion_id`. El frontend lo manda
--   (RecibirLoteForm.tsx:218) pero apunta a un modelo de Producción
--   (`ordenes_produccion`) que las migraciones 0025-0029 reemplazaron por
--   `producciones` — y ni `lotes` (ninguna columna para ese vínculo) ni la
--   propia pantalla de recibir (`inventario/recibir/page.tsx:52,57`, que
--   todavía consulta `ordenes_produccion` y una columna
--   `lotes.orden_produccion_id` inexistente) se actualizaron cuando cambió
--   el modelo. Es una reconciliación aparte, con su propia sesión — no una
--   corrección de esta función. Hasta que se resuelva, "recibir ligado a una
--   orden de producción" sigue fallando; el resto del formulario (recepción
--   manual, ligada a compra) funciona bien.
--
-- CÓMO SE APLICA A PRODUCCIÓN
--   Esta función vive en `retail`, no en `public`, en el proyecto de
--   producción (ver CLAUDE.md, "Cómo aplicar SQL a producción"). Pegar en el
--   SQL Editor con el cuerpo schema-calificado (`retail.recibir_lote`,
--   `retail.puede_operar_sede`, `retail.fn_aplicar_movimiento`,
--   `public.personas`) — NO este archivo tal cual, que es para local.
--
-- Idempotente: create or replace.

create or replace function recibir_lote(
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
    perform fn_aplicar_movimiento(v_movimiento_id);
  end loop;

  return v_lote_id;
end;
$$;

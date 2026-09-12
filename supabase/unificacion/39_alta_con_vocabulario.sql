-- ============================================================================
-- 39 · Toda variante nace con color del vocabulario y código corto
--      CUERPO SCHEMA-CALIFICADO PARA PRODUCCIÓN — correr en cayla-DYNAMIC.
--      Solo toca `retail`. Gemela de `supabase/migrations/0059_alta_con_vocabulario.sql`
--      (leer ahí el porqué completo). Se PEGA en el SQL Editor, no se registra
--      con `apply_migration` (el historial de migraciones de Dynamic no es el
--      nuestro — ver BACKLOG, 2026-09-10).
--
-- QUÉ CAMBIA EN PRODUCCIÓN
--   · `retail.fn_normalizar_color` — nueva.
--   · `retail.crear_producto_con_variantes` y `retail.recibir_lote` — MISMA firma
--     (no hay drop, no se crea sobrecarga; verificar abajo que sigue habiendo una
--     sola de cada una). Cuerpos traídos de producción con `pg_get_functiondef`
--     el 2026-09-11 (huellas a4ca5cd2… y c1a1141d…) más: resolver color, guardar
--     `color_id`, llamar `retail.fn_asignar_codigo_variante` por variante nueva.
--   · Backfill: las 2 variantes con color "azul " pasan a Azul marino (AZM) por
--     decisión de Felipe (2026-09-11) y reciben código: JEA-0001-AZM-26 y
--     CMS-0001-AZM-S. Verificado antes de escribir esto que ninguna tiene una
--     hermana Azul marino de la misma talla (no hay choque con
--     `variantes_identidad_unica`).
--
-- ORDEN CON EL DEPLOY
--   Este SQL va PRIMERO y es compatible con el deploy viejo: un cliente que siga
--   mandando `color` como texto entra por la rama de texto libre (sin código, como
--   hasta hoy). El deploy nuevo manda `colorId` / `color_id`.
-- ============================================================================

-- ---------- PRE-FLIGHT (leer antes de correr el resto) ----------
-- Debe devolver exactamente las 2 variantes con "azul " y ninguna otra sin código
-- que tenga hermana del mismo color/talla. Si aparece algo distinto, parar.
select v.sku, v.talla, '[' || v.color || ']' as color, v.color_id, v.codigo, p.codigo as producto
  from retail.variantes v join retail.productos p on p.id = v.producto_id
 where v.codigo is null
 order by p.codigo, v.talla;

-- ---------- 1. una sola regla para el color ----------
create or replace function retail.fn_normalizar_color(
  p_color_id text,
  p_color text,
  out color_id text,
  out color text
)
language plpgsql stable
set search_path = 'retail', 'public'
as $$
begin
  if nullif(trim(p_color_id), '') is not null then
    select c.codigo, c.nombre into color_id, color
      from retail.colores c where c.codigo = upper(trim(p_color_id));
    if color_id is null then
      raise exception 'El color % no está en el vocabulario de CAYLA', trim(p_color_id);
    end if;
    return;
  end if;

  select c.codigo, c.nombre into color_id, color
    from retail.colores c where retail.fn_clave_texto(c.nombre) = retail.fn_clave_texto(p_color);

  if color_id is null then
    color := nullif(trim(p_color), '');
  end if;
end;
$$;

comment on function retail.fn_normalizar_color(text, text) is
  'Resuelve el color de una variante nueva contra `colores`: por código si viene, por nombre exacto si no, y texto libre sin código como último recurso.';

-- ---------- 2. crear_producto_con_variantes (misma firma) ----------
create or replace function retail.crear_producto_con_variantes(
  p_sku_padre text,
  p_referencia text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_genero text default null,
  p_marca text default null,
  p_temporada text default null,
  p_proveedor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = 'retail', 'public'
as $$
declare
  v_producto_id uuid;
  v_variante_id uuid;
  v_item jsonb;
  v_color record;
begin
  if not retail.es_lider() then
    raise exception 'Solo un líder puede dar de alta un producto nuevo';
  end if;
  if coalesce(trim(p_referencia), '') = '' then
    raise exception 'Falta la referencia del producto';
  end if;
  if coalesce(trim(p_sku_padre), '') = '' then
    raise exception 'Falta el SKU del producto';
  end if;
  if p_variantes is null or jsonb_array_length(p_variantes) = 0 then
    raise exception 'El producto necesita al menos una talla/color';
  end if;

  insert into productos (sku_padre, referencia, categoria_id, genero, marca, temporada, proveedor_id)
    values (
      trim(p_sku_padre), trim(p_referencia), p_categoria_id,
      nullif(trim(p_genero), ''), nullif(trim(p_marca), ''), nullif(trim(p_temporada), ''), p_proveedor_id
    )
    returning id into v_producto_id;

  for v_item in select * from jsonb_array_elements(p_variantes) loop
    if coalesce(v_item ->> 'sku', '') = '' then
      raise exception 'Cada variante necesita un SKU';
    end if;
    select * into v_color from retail.fn_normalizar_color(
      coalesce(v_item ->> 'colorId', v_item ->> 'color_id'), v_item ->> 'color');
    insert into variantes (producto_id, sku, talla, color, color_id, costo, precio, precio_oferta, stock_minimo)
      values (
        v_producto_id,
        trim(v_item ->> 'sku'),
        nullif(trim(v_item ->> 'talla'), ''),
        v_color.color,
        v_color.color_id,
        coalesce((v_item ->> 'costo')::numeric, 0),
        coalesce((v_item ->> 'precio')::numeric, 0),
        case when nullif(v_item ->> 'precioOferta', '') is not null then (v_item ->> 'precioOferta')::numeric else null end,
        coalesce((v_item ->> 'stockMinimo')::integer, 0)
      )
      returning id into v_variante_id;
    perform retail.fn_asignar_codigo_variante(v_variante_id);
  end loop;

  return v_producto_id;
end;
$$;

-- ---------- 3. recibir_lote (misma firma) ----------
-- Producción tiene una sola firma desde la 31 (verificado el 2026-09-11). El drop
-- de la firma vieja de 8 parámetros va igual, por si alguna base la arrastra:
-- `if exists` no hace nada cuando no está.
drop function if exists retail.recibir_lote(uuid, text, jsonb, text, text, text, uuid, uuid);

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
set search_path = 'retail', 'public'
as $$
declare
  v_persona_id uuid; v_lote_id uuid; v_item jsonb; v_variante_id uuid;
  v_producto_id uuid; v_movimiento_id uuid; v_contenedor_id uuid;
  v_color record;
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
      select * into v_color from retail.fn_normalizar_color(
        coalesce(v_item ->> 'color_id', v_item ->> 'colorId'), v_item ->> 'color');
      insert into variantes (producto_id, sku, talla, color, color_id, costo, precio, stock_minimo)
        values (
          v_producto_id, v_item ->> 'sku', nullif(trim(v_item ->> 'talla'), ''),
          v_color.color, v_color.color_id,
          coalesce((v_item ->> 'costo')::numeric, 0), coalesce((v_item ->> 'precio')::numeric, 0),
          coalesce((v_item ->> 'stock_minimo')::integer, 0)
        )
        returning id into v_variante_id;
      perform retail.fn_asignar_codigo_variante(v_variante_id);
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

-- ---------- 4. backfill ----------
-- (a) Decisión de Felipe, 2026-09-11: «azul» a secas es Azul marino.
update retail.variantes v
   set color = c.nombre, color_id = c.codigo
  from retail.colores c
 where c.codigo = 'AZM'
   and v.color_id is null
   and retail.fn_clave_texto(v.color) = 'azul'
   and not exists (
     select 1 from retail.variantes h
      where h.producto_id = v.producto_id and h.id <> v.id
        and coalesce(h.talla, '') = coalesce(v.talla, '')
        and coalesce(h.color, '') = c.nombre);

-- (b) Cualquier otro color escrito a mano que calce exacto con el vocabulario.
update retail.variantes v
   set color = c.nombre, color_id = c.codigo
  from retail.colores c
 where v.color_id is null
   and retail.fn_clave_texto(v.color) = retail.fn_clave_texto(c.nombre)
   and not exists (
     select 1 from retail.variantes h
      where h.producto_id = v.producto_id and h.id <> v.id
        and coalesce(h.talla, '') = coalesce(v.talla, '')
        and coalesce(h.color, '') = c.nombre);

-- (c) Código corto para todo lo que ya puede tenerlo.
select count(retail.fn_asignar_codigo_variante(id)) as codigos_asignados
  from retail.variantes where codigo is null;

-- ---------- registro (convención desde 38_migraciones_aplicadas) ----------
-- Este archivo CORRIÓ en producción el 2026-09-11 con el nombre `38_alta_con_vocabulario.sql`
-- (se renumeró a 39 al fusionar con main, que ya usaba el 38 para el registro). Se anota con
-- el nombre definitivo, que es el que el repo conoce.
insert into retail.migraciones_aplicadas (archivo, aplicada_at, nota) values
  ('39_alta_con_vocabulario.sql', '2026-09-11', 'aplicada con execute_sql con autorización de Felipe; pre-flight y post-check en BACKLOG.md')
  on conflict (archivo) do nothing;

-- ---------- POST-CHECK ----------
-- 1) Una sola firma viva por función (no se creó sobrecarga):
select p.proname, count(*) as firmas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail'
   and p.proname in ('recibir_lote', 'crear_producto_con_variantes', 'fn_normalizar_color')
 group by 1;
-- 2) Cero variantes sin código (o solo las que tengan color libre que no calza):
select v.sku, v.talla, v.color, v.color_id, v.codigo
  from retail.variantes v where v.codigo is null;
-- 3) Las dos del backfill, con su código nuevo:
select v.sku, v.talla, v.color, v.color_id, v.codigo
  from retail.variantes v where v.codigo in ('JEA-0001-AZM-26', 'CMS-0001-AZM-S');

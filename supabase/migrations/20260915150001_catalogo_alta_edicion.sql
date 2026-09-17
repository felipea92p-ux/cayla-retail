-- ============================================================================
-- 20260915150001 — Catálogo: alta y edición de producto+variantes (V2)
--
-- QUÉ TRAE
--   Dos RPC para `/productos/nuevo` y `/productos/[id]/editar`:
--     · catalogo_crear_producto(categoria_id, referencia, descripcion, variantes)
--     · catalogo_actualizar_producto(producto_id, categoria_id, referencia,
--       descripcion, estado, variantes)
--   `variantes` es un jsonb array: [{ id?, color_codigo?, talla?, sku,
--   precio, costo?, activo? }, ...]. `id` ausente/null = variante nueva.
--
-- POR QUÉ RPC Y NO INSERTS SUELTOS DESDE EL SERVIDOR (como categorias/colores)
--   Un producto sin ninguna variante no sirve para nada, y crear el producto
--   y sus 2-3 variantes en llamadas separadas deja una ventana donde el
--   producto existe sin variantes si la conexión se corta a mitad de camino
--   (principio 2: cero estados inconsistentes). Una función plpgsql es una
--   sola sentencia para Postgres: si cualquier insert de adentro falla, la
--   función entera aborta y no queda nada a medias — sin necesitar
--   `security definer` ni una transacción manual desde Next.js.
--
-- POR QUÉ NO SECURITY DEFINER (a diferencia de V1)
--   `productos_write_lider` y `variantes_write_lider` (0004_rls.sql) ya
--   permiten INSERT/UPDATE directo a quien es Líder — a diferencia de V1,
--   que necesitaba una función seguridad-definer porque su RLS no lo abría.
--   Acá la función corre con los permisos de quien la llama: si no es
--   Líder, el INSERT de adentro choca con la policy y el mensaje ya es el
--   que `error-escritura.ts` traduce para "row-level security". Un solo
--   lugar decide el permiso (la policy), no dos que se puedan desincronizar.
--
-- POR QUÉ EL NOMBRE NO ES `crear_producto_con_variantes`
--   Ese nombre ya existe EN PRODUCCIÓN (V1: `supabase/unificacion/
--   16_crear_producto_variantes.sql` y `18_productos_proveedor.sql`,
--   llamado desde `NuevoProductoForm.tsx` / `/inventario/producto/nuevo`,
--   ninguno de los cuales vive en este repo — ver
--   docs/datos/modulos/02-catalogo-y-vocabulario.md). Esa RPC depende de
--   columnas que V2 no tiene (`marca`, `sku_padre`, `proveedor_id`) y tiene
--   un defecto conocido que acá no se repite: inserta el color como texto
--   libre y deja la prenda invisible para la pistola (hueco 2 del módulo
--   Loro). Un nombre distinto evita que alguien la llame pensando que es
--   la misma función.
--
-- QUÉ NO HACE (a propósito, fuera de alcance de esta sesión)
--   No toca `stock` — eso es "Ajustar inventario" (Sesión A2). No lee ni
--   escribe nada de `movimientos` — eso es "Ver historial" (Sesión A3). No
--   deja editar `color_codigo`/`talla`/`sku`/`codigo` de una variante que
--   ya existe: son la identidad de la prenda, y dejarlas mutables es
--   exactamente el hueco 3 que V1 nunca cerró ("código promete ser
--   inmutable y nada lo hace cumplir"). Para cambiar talla o color de una
--   variante ya creada, se desactiva y se da de alta una nueva — el activo
--   se puede desactivar siempre, sin importar si tiene ventas o movimientos
--   (decidido con Felipe 2026-09-15): `activo` es un flag, `movimientos` es
--   append-only e inmutable (20260914165703_movimientos_inmutables.sql), así
--   que desactivar nunca borra ni reescribe historia.
-- ============================================================================

-- p_categoria_id/p_descripcion van AL FINAL con `default null`: Postgres exige
-- que, una vez que un parámetro tiene default, todos los que le siguen
-- también lo tengan. supabase-js llama por nombre (PostgREST), así que el
-- orden no afecta cómo se invoca — pero si esto se toca, el orden de
-- declaración sí importa para que la función compile.
create or replace function retail.catalogo_crear_producto(
  p_referencia text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_descripcion text default null
) returns uuid
language plpgsql
set search_path = retail, public
as $$
declare
  v_producto_id uuid;
  v_variante jsonb;
begin
  if p_referencia is null or trim(p_referencia) = '' then
    raise exception 'Falta la referencia del producto.';
  end if;
  if p_variantes is null or jsonb_typeof(p_variantes) <> 'array' or jsonb_array_length(p_variantes) = 0 then
    raise exception 'Un producto necesita al menos una variante (talla y/o color) antes de guardarse.';
  end if;

  insert into productos (categoria_id, referencia, descripcion)
  values (p_categoria_id, trim(p_referencia), nullif(trim(coalesce(p_descripcion, '')), ''))
  returning id into v_producto_id;

  for v_variante in select * from jsonb_array_elements(p_variantes)
  loop
    if coalesce(nullif(trim(v_variante->>'sku'), ''), '') = '' then
      raise exception 'Cada variante necesita un SKU.';
    end if;
    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;

    insert into variantes (producto_id, color_codigo, talla, sku, precio, costo)
    values (
      v_producto_id,
      nullif(v_variante->>'color_codigo', ''),
      nullif(v_variante->>'talla', ''),
      trim(v_variante->>'sku'),
      (v_variante->>'precio')::numeric,
      coalesce((v_variante->>'costo')::numeric, 0)
    );
  end loop;

  return v_producto_id;
end;
$$;

comment on function retail.catalogo_crear_producto(text, jsonb, uuid, text) is
  'Alta de producto+variantes para /productos/nuevo (V2). Sin security definer: corre con los permisos de quien llama, y productos_write_lider/variantes_write_lider (RLS) son el único candado de permiso. El trigger variantes_asignar_codigo (20260912235500) acuña codigo y codigos_barras solo — esta función no lo toca.';

create or replace function retail.catalogo_actualizar_producto(
  p_producto_id uuid,
  p_referencia text,
  p_estado text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_descripcion text default null
) returns void
language plpgsql
set search_path = retail, public
as $$
declare
  v_variante jsonb;
  v_id uuid;
begin
  if p_referencia is null or trim(p_referencia) = '' then
    raise exception 'Falta la referencia del producto.';
  end if;

  update productos
    set categoria_id = p_categoria_id,
        referencia = trim(p_referencia),
        descripcion = nullif(trim(coalesce(p_descripcion, '')), ''),
        estado = p_estado
    where id = p_producto_id;

  if not found then
    raise exception 'El producto % no existe.', p_producto_id;
  end if;

  for v_variante in select * from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb))
  loop
    if coalesce(nullif(trim(v_variante->>'sku'), ''), '') = '' then
      raise exception 'Cada variante necesita un SKU.';
    end if;
    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;

    v_id := nullif(v_variante->>'id', '')::uuid;

    if v_id is not null then
      -- Variante existente: solo precio, costo y activo cambian. Color,
      -- talla, sku y codigo son la identidad de la prenda — ver el
      -- encabezado del archivo.
      update variantes
        set precio = (v_variante->>'precio')::numeric,
            costo = coalesce((v_variante->>'costo')::numeric, 0),
            activo = coalesce((v_variante->>'activo')::boolean, true)
        where id = v_id and producto_id = p_producto_id;
    else
      insert into variantes (producto_id, color_codigo, talla, sku, precio, costo)
      values (
        p_producto_id,
        nullif(v_variante->>'color_codigo', ''),
        nullif(v_variante->>'talla', ''),
        trim(v_variante->>'sku'),
        (v_variante->>'precio')::numeric,
        coalesce((v_variante->>'costo')::numeric, 0)
      );
    end if;
  end loop;
end;
$$;

comment on function retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text) is
  'Edición de producto+variantes para /productos/[id]/editar (V2). Agrega variantes nuevas y actualiza precio/costo/activo de las existentes; nunca color_codigo/talla/sku/codigo de una variante ya creada.';

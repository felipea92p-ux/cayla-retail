-- ============================================================================
-- 20260915223000_historial_producto_estado.sql — CAYLA V2
--
-- Acciones masivas de Productos (Sesión B2, integración final): activar/
-- desactivar en bloque escribe `productos.estado` con un UPDATE directo (RLS
-- `productos_write_lider` ya lo permite para líderes, sin RPC nueva). Pero el
-- trigger de 20260915204541_historial_producto_cambios.sql solo miraba
-- `categoria_id` — su propio comentario avisaba: "SE ROMPE SI se agrega otra
-- columna a auditar (ej. descripcion, activo, estado) sin sumarla también al
-- trigger". Esto es exactamente eso: se reemplaza la función (create or
-- replace, mismo trigger ya creado) sumando la rama de `estado`, mismo
-- criterio que las otras dos — solo loguea si el valor realmente cambió.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_registrar_cambio_producto()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id from public.personas where auth_user_id = auth.uid();

  if TG_TABLE_NAME = 'productos' then
    if new.categoria_id is distinct from old.categoria_id then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', new.id, 'categoria_id', old.categoria_id::text, new.categoria_id::text, v_usuario_id);
    end if;
    if new.estado is distinct from old.estado then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', new.id, 'estado', old.estado::text, new.estado::text, v_usuario_id);
    end if;
  elsif TG_TABLE_NAME = 'variantes' then
    if new.precio is distinct from old.precio then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'precio', old.precio::text, new.precio::text, v_usuario_id);
    end if;
  end if;
  return new;
end;
$$;

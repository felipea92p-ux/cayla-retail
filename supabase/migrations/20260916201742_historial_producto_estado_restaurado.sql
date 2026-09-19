-- ============================================================================
-- 20260916201742_historial_producto_estado_restaurado.sql — CAYLA V2
--
-- RECONSTRUCCIÓN, NO EL ORIGINAL. En producción quedó registrada como
-- `historial_producto_estado_restaurado` (versión 20260916201742), aplicada el
-- 2026-09-16, y nunca se subió al repo. Se detectó el 2026-09-18 al comparar `retail`
-- por huella md5 (BACKLOG, "Comparación completa `retail`"). Reproduce la función tal
-- como está hoy en producción.
--
-- EL PROBLEMA. `20260915223000_historial_producto_estado` le agregó a
-- `fn_registrar_cambio_producto` el registro del cambio de `estado` del producto
-- (activo ↔ descontinuado). `20260916090000_costo_promedio_ponderado` la redefinió partiendo
-- de la versión anterior y sin ese bloque: lo pisó. Descontinuar o reactivar un producto
-- dejó de dejar fila en `historial_producto_cambios`. Producción lo restauró aquí; el
-- repo no, así que un `db reset` (y el Postgres local) seguía con la versión pisada.
--
-- QUÉ HACE. `fn_registrar_cambio_producto` con los cuatro campos: `categoria_id` y
-- `estado` del producto, `precio` y `costo` de la variante.
--
-- ORDEN. Esta migración va DESPUÉS de `20260916090000_costo_promedio_ponderado` (por eso
-- gana). La versión es la misma con que quedó registrada en producción.
--
-- IDEMPOTENTE: pegarla en producción no cambia nada (`create or replace`, cuerpo
-- idéntico, misma firma; conserva los permisos).
--
-- SE ROMPE SI: alguien redefine `fn_registrar_cambio_producto` partiendo de una versión
-- vieja. Parte siempre del cuerpo vivo (`pg_get_functiondef`), no del archivo más antiguo.
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
    if new.costo is distinct from old.costo then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'costo', old.costo::text, new.costo::text, v_usuario_id);
    end if;
  end if;
  return new;
end;
$$;

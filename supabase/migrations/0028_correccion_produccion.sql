-- ============================================================================
-- Corregir producciones cuando te equivocas al registrar.
--
-- Dos casos, tratados distinto A PROPÓSITO:
--  1) Todavía NO la marcaste terminada (no tocó el inventario) → se ELIMINA
--     limpio: no pasó nada en el stock, así que borrar es seguro.
--  2) YA está en el inventario (generó stock) → NO se borra a ciegas: primero
--     se REVIERTE (saca del inventario lo que entró, con su movimiento inverso),
--     y recién ahí queda "en proceso" para eliminarla o volver a registrarla.
--
-- Filosofía (la misma del mayor contable): un hecho que ya movió saldos no se
-- borra, se revierte con su contrario. Así el stock nunca queda flotando sin
-- respaldo. La reversa valida que las prendas sigan ahí: si ya vendiste o
-- trasladaste parte, el sistema te frena en vez de dejar stock negativo.
-- ============================================================================

create or replace function eliminar_produccion(p_produccion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod producciones%rowtype;
begin
  select * into v_prod from producciones where id = p_produccion_id;
  if not found then
    raise exception 'La producción no existe';
  end if;
  if not fn_puede_operar_sede(v_prod.unidad_id) then
    raise exception 'No tienes permiso sobre esta producción';
  end if;
  if v_prod.inventariado_at is not null then
    raise exception 'Esta producción ya está en el inventario. Usa "Revertir" para sacarla, y luego elimínala.';
  end if;

  delete from producciones where id = p_produccion_id; -- cascade borra las líneas
end;
$$;

create or replace function revertir_produccion_inventario(p_produccion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod producciones%rowtype;
  v_persona_id uuid;
  v_linea record;
  v_mov_id uuid;
begin
  select * into v_prod from producciones where id = p_produccion_id;
  if not found then
    raise exception 'La producción no existe';
  end if;
  if not fn_puede_operar_sede(v_prod.unidad_id) then
    raise exception 'No tienes permiso sobre esta producción';
  end if;
  if v_prod.inventariado_at is null then
    raise exception 'Esta producción no está en el inventario';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  -- Movimiento inverso por cada variante: saca del inventario lo que entró.
  -- fn_aplicar_movimiento valida stock: si ya moviste esas prendas, aquí falla
  -- y no revierte nada (todo o nada).
  for v_linea in select * from produccion_lineas where produccion_id = p_produccion_id
  loop
    insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, nota)
      values (v_linea.variante_id, v_prod.unidad_id, 'salida', v_linea.cantidad,
              'Reversa de producción', v_persona_id, 'Reversa ' || left(p_produccion_id::text, 8))
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  update producciones
    set estado = 'en_proceso', inventariado_at = null
    where id = p_produccion_id;
end;
$$;

-- ============================================================================
-- Retirar de PRODUCCIÓN lo que dejó el ADR-0258 (PR #572), antes de pegar 20260928235900 (ADR-0257)
-- ============================================================================
--
-- QUÉ PASÓ. El 2026-09-28 dos sesiones construyeron en paralelo «corregir el color y la talla de una variante». Una
-- (ADR-0258, rama claude/product-sizes-colors-edit-a83b77, PR #572) pegó su migración en producción por el SQL Editor
-- —sin fila en schema_migrations— con la regla «solo sin historia». La otra (ADR-0257, este PR) construyó la regla
-- «siempre; si vendida, solo líder». Felipe eligió ADR-0257 y pidió limpiar lo del 0258 («solo hemos estado en fase
-- prueba»). El SQL del 0258 nunca entró a `main`: esto es una sobra SOLO de producción, por eso no es una migración.
--
-- QUÉ DESHACE (lo que creó 20260928235500_corregir_talla_color_de_variante_sin_historia.sql de esa rama):
--   1. El parche de `catalogo_actualizar_producto` (la llamada a fn_corregir_identidad_variante con 4 argumentos).
--   2. El parche de `fn_registrar_cambio_producto` (anotaba color_codigo/talla_id/codigo).
--   3. El disparador `variantes_identidad_sin_historia` y su función `fn_identidad_variante_sin_historia()`.
--   4. `fn_corregir_identidad_variante(uuid, uuid, uuid, jsonb)` y `fn_variantes_con_historia(uuid[])`.
-- Las dos funciones parchadas vuelven EXACTAMENTE a su cuerpo anterior: se comprueba con su huella md5(prosrc)
-- (a66ff20a… y c4f2676e…, medidas en producción la mañana del 2026-09-28 y las mismas de `main`). Si no coinciden,
-- aborta sin tocar nada. No toca datos: el 0258 no cambió ninguna fila (nadie usó su web: el PR no se fusionó).
--
-- CÓMO SE PEGA. Sola, ANTES de 20260928235900, en su propia parte: trae `drop trigger`, que en Supabase toma en
-- exclusiva las tablas de auth y storage hasta el final de la transacción (CLAUDE.md, «Políticas y deadlocks»; por eso
-- no puede ir junto al `lock table variantes` de la migración). Todo va en UN `do $$`: atómico también en el SQL Editor.
-- Se puede volver a pegar: si ya no encuentra lo del 0258, no hace nada.
-- ============================================================================

set lock_timeout = '3s';

do $$
declare
  v_def text;
  v_veces int;
  -- Los textos EXACTOS que el 0258 insertó (su archivo, líneas 229-233 y 257-270); se reemplazan por lo que había.
  v_cat_nuevo constant text := $n$    if v_id is not null then
      -- 20260928235500: color y talla se corrigen si la variante no tiene historia; si tiene, lo dice.
      perform retail.fn_corregir_identidad_variante(v_id, p_producto_id, p_categoria_id, v_variante);
      if v_ve_costo then$n$;
  v_cat_ancla constant text := $a$    if v_id is not null then
      if v_ve_costo then$a$;
  v_reg_nuevo constant text := $n$elsif TG_TABLE_NAME = 'variantes' then
    -- 20260928235500: corregir color o talla de una variante sin historia queda anotado.
    if new.color_codigo is distinct from old.color_codigo then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'color_codigo', old.color_codigo, new.color_codigo, v_usuario_id);
    end if;
    if new.talla_id is distinct from old.talla_id then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'talla_id', old.talla_id::text, new.talla_id::text, v_usuario_id);
    end if;
    if old.codigo is not null and new.codigo is distinct from old.codigo then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'codigo', old.codigo, new.codigo, v_usuario_id);
    end if;$n$;
  v_reg_ancla constant text := $a$elsif TG_TABLE_NAME = 'variantes' then$a$;
begin
  -- 1. catalogo_actualizar_producto
  v_def := pg_get_functiondef('retail.catalogo_actualizar_producto(uuid,text,text,jsonb,uuid,text,integer,text,boolean,jsonb,uuid,uuid,uuid,uuid,boolean,integer)'::regprocedure);
  v_veces := (length(v_def) - length(replace(v_def, v_cat_nuevo, ''))) / length(v_cat_nuevo);
  if v_veces = 1 then
    execute replace(v_def, v_cat_nuevo, v_cat_ancla);
    raise notice 'ADR-0258: catalogo_actualizar_producto vuelve a su cuerpo anterior';
  elsif v_veces = 0 then
    raise notice 'ADR-0258: catalogo_actualizar_producto ya no tenía su parche';
  else
    raise exception 'ADR-0258: el parche de catalogo_actualizar_producto aparece % veces. Revisar antes de pegar.', v_veces;
  end if;

  -- 2. fn_registrar_cambio_producto
  v_def := pg_get_functiondef('retail.fn_registrar_cambio_producto()'::regprocedure);
  v_veces := (length(v_def) - length(replace(v_def, v_reg_nuevo, ''))) / length(v_reg_nuevo);
  if v_veces = 1 then
    execute replace(v_def, v_reg_nuevo, v_reg_ancla);
    raise notice 'ADR-0258: fn_registrar_cambio_producto vuelve a su cuerpo anterior';
  elsif v_veces = 0 then
    raise notice 'ADR-0258: fn_registrar_cambio_producto ya no tenía su parche';
  else
    raise exception 'ADR-0258: el parche de fn_registrar_cambio_producto aparece % veces. Revisar antes de pegar.', v_veces;
  end if;

  -- 3 y 4. Disparador y funciones propias del 0258 (el disparador primero: la función depende de él).
  drop trigger if exists variantes_identidad_sin_historia on retail.variantes;
  drop function if exists retail.fn_identidad_variante_sin_historia();
  drop function if exists retail.fn_corregir_identidad_variante(uuid, uuid, uuid, jsonb);
  drop function if exists retail.fn_variantes_con_historia(uuid[]);

  -- Comprobación: las dos funciones con su huella de antes del 0258 (si 20260928235900 ya se pegó, su marca está y la
  -- huella es otra: entonces no se exige, porque esta limpieza se está re-pegando después de la migración).
  if not exists (select 1 from pg_proc where pronamespace = 'retail'::regnamespace and prosrc like '%20260928235900%') then
    if (select md5(prosrc) from pg_proc where oid = 'retail.catalogo_actualizar_producto(uuid,text,text,jsonb,uuid,text,integer,text,boolean,jsonb,uuid,uuid,uuid,uuid,boolean,integer)'::regprocedure)
         <> 'a66ff20a82f0e022b454cce0d04a1dad'
       or (select md5(prosrc) from pg_proc where oid = 'retail.fn_registrar_cambio_producto()'::regprocedure)
         <> 'c4f2676e8f9dc11153b1c36e9c95b728' then
      raise exception 'ADR-0258: las funciones no quedaron con su huella anterior. No se aplicó nada.';
    end if;
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'retail'::regnamespace
               and (prosrc like '%20260928235500: color y talla%' or prosrc like '%20260928235500: corregir color o talla%')) then
    raise exception 'ADR-0258: todavía queda una función con su marca. No se aplicó nada.';
  end if;
end;
$$;

-- Verificación de solo lectura (todo 0 / true):
--   select
--     (select count(*) from pg_trigger where tgname = 'variantes_identidad_sin_historia') as disparador_0258,          -- 0
--     to_regprocedure('retail.fn_corregir_identidad_variante(uuid, uuid, uuid, jsonb)') is null as sin_funcion_0258,
--     to_regprocedure('retail.fn_variantes_con_historia(uuid[])') is null as sin_historia_0258,
--     (select md5(prosrc) from pg_proc where proname = 'catalogo_actualizar_producto'
--        and pronamespace = 'retail'::regnamespace) = 'a66ff20a82f0e022b454cce0d04a1dad' as catalogo_como_antes;

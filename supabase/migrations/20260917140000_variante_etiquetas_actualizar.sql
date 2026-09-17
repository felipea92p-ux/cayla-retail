-- ============================================================================
-- 20260917140000 — RPC para aplicar/quitar etiquetas de catálogo a
-- variantes puntuales, desde ProductoForm.tsx
--
-- QUÉ FALTABA
--   `retail.variante_etiquetas` y su candado de sede existen desde
--   20260917100200 (ADR-0095), pero nadie tenía cómo escribir en esa tabla
--   sin SQL directo — el vocabulario de etiquetas (qué etiquetas existen)
--   ya tenía pantalla, "qué variante tiene qué etiqueta" no.
--
-- POR QUÉ UN RPC QUE RECIBE VARIAS VARIANTES A LA VEZ
--   Mismo criterio que `catalogo_actualizar_producto`: guardar un producto
--   ya es una sola acción que toca varias variantes juntas. Aplicar
--   etiquetas se cuelga de esa MISMA acción de guardado (ProductoForm.tsx
--   llama este RPC justo después de que el guardado principal del
--   producto sale bien) — no un botón de guardar aparte, después de que
--   esa misma confusión ya costó un bug real esta sesión con el mapeo de
--   categoría↔ejes (dos botones de guardar en el mismo formulario).
--
-- POR QUÉ DELETE+INSERT POR VARIANTE, NO VALIDACIÓN DE APROBADO/ACTIVO
--   Mismo tradeoff que `actualizar_categoria_ejes`: "acá va el conjunto
--   completo" para cada variante, no un diff; y el candado real de qué
--   etiqueta se OFRECE para elegir ya vive en la lectura (solo etiquetas
--   aprobadas y activas llegan a la pantalla), no hace falta duplicarlo acá.
-- ============================================================================

create function retail.actualizar_variantes_etiquetas(p_asignaciones jsonb)
returns void
language plpgsql security definer set search_path = retail, public as $$
declare
  v_item jsonb;
  v_variante_id uuid;
  v_etiqueta_ids uuid[];
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede aplicar etiquetas a una variante.';
  end if;

  for v_item in select * from jsonb_array_elements(p_asignaciones) loop
    -- Validar la forma ANTES de castear/iterar: un uuid mal formado o un
    -- etiqueta_ids que no sea array haría que Postgres tire su propio error
    -- crudo (`invalid input syntax for type uuid`, `cannot extract elements
    -- from a scalar`) en vez del mensaje de esta función. Hoy ProductoForm.tsx
    -- nunca manda una forma inválida, pero el RPC es el candado real — no
    -- debería depender de que quien lo llame ya venga bien formado.
    if not (v_item ->> 'variante_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'Una de las variantes no es válida. Recarga la pantalla.';
    end if;
    v_variante_id := (v_item ->> 'variante_id')::uuid;

    if not exists (select 1 from retail.variantes where id = v_variante_id) then
      raise exception 'Una de las variantes ya no existe. Recarga la pantalla.';
    end if;

    if jsonb_typeof(coalesce(v_item -> 'etiqueta_ids', '[]'::jsonb)) <> 'array' then
      raise exception 'La lista de etiquetas de una de las variantes no es válida. Recarga la pantalla.';
    end if;

    select array(select jsonb_array_elements_text(coalesce(v_item -> 'etiqueta_ids', '[]'::jsonb)))::uuid[]
      into v_etiqueta_ids;

    delete from retail.variante_etiquetas where variante_id = v_variante_id;
    if v_etiqueta_ids is not null and array_length(v_etiqueta_ids, 1) > 0 then
      insert into retail.variante_etiquetas (variante_id, etiqueta_id)
        select distinct v_variante_id, e from unnest(v_etiqueta_ids) as e;
    end if;
  end loop;
end;
$$;

comment on function retail.actualizar_variantes_etiquetas(jsonb) is
  'Reemplaza (no amplía) el conjunto de etiquetas de catálogo aplicadas a cada variante de p_asignaciones: [{"variante_id": uuid, "etiqueta_ids": uuid[]}, ...]. Todas las variantes se guardan en la misma llamada/transacción.';

grant execute on function retail.actualizar_variantes_etiquetas(jsonb) to authenticated;

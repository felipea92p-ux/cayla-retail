-- ============================================================================
-- 20260919010000 — Etiquetar prendas en lote: agregar o quitar UNA etiqueta a
-- muchas variantes, sin pisar las demás etiquetas de esas variantes
--
-- EL PROBLEMA
--   Hoy la única forma de etiquetar es `actualizar_variantes_etiquetas`
--   (20260917140000), pensada para el formulario de producto: recibe el
--   CONJUNTO COMPLETO de etiquetas de cada variante y lo reemplaza. Para
--   etiquetar 40 prendas con «Black Friday» habría que leer las etiquetas de
--   cada una, sumarles la nueva y reenviar todo — y si dos Líderes lo hacen a
--   la vez, el segundo borra lo que puso el primero. Con una etiqueta que baja
--   el precio en caja (ADR-0107/0108), ese pisón es plata.
--
-- CONTRATO (escrito antes que el código)
--   PROMETE: para cada cambio {etiqueta_id, agregar[], quitar[]}, las variantes
--     de `agregar` quedan con esa etiqueta y las de `quitar` sin ella. NO toca
--     las demás etiquetas de esas variantes. Todo el lote o nada: si un cambio
--     falla, no queda ninguno a medias. Idempotente: agregar dos veces la misma
--     etiqueta no duplica ni falla, quitar una que no estaba no falla.
--     Devuelve {agregadas, quitadas} con lo que REALMENTE cambió (no lo pedido),
--     para que la pantalla diga «12 prendas etiquetadas» y no «12 solicitadas».
--   ASUME: quien llama es Líder (misma regla que `actualizar_variantes_etiquetas`
--     y `variante_etiquetas_write_lider`).
--
-- ESTADOS IMPOSIBLES QUE CIERRA
--   · Etiquetar con una etiqueta que no está aprobada o no está activa. Una
--     etiqueta pendiente/rechazada nunca debe llegar a una prenda. QUITAR sí se
--     permite siempre: si una etiqueta se desactivó, hay que poder soltarla.
--   · Etiquetar una variante inactiva: quedaría una etiqueta con descuento
--     sobre algo que no se vende. Se rechaza el lote entero con la frase de
--     «recarga la pantalla», que es lo que pasó (alguien la desactivó en medio).
--   · La misma variante en `agregar` y en `quitar` de un mismo cambio: la
--     intención es contradictoria; se rechaza en vez de elegir un ganador.
--   · Lotes gigantes por accidente: hasta 50 cambios y 2.000 variantes por lista
--     (hoy el catálogo entero son 164 variantes; el tope es 10× eso).
--
-- CONCURRENCIA
--   Toma `for share` sobre la fila de la etiqueta: mientras se etiqueta, nadie
--   puede desactivarla o cambiarle el estado en ese mismo instante (el UPDATE de
--   `etiquetas` pide un lock que choca), y dos lotes sobre la misma etiqueta no
--   se pisan porque cada uno solo inserta/borra las filas que nombra.
--
-- NO HACE: no valida `sedes_permitidas` ni categorías — eso lo leen `registrar_venta`
--   y `fn_campanas_por_variante` al vender. Etiquetar es un dato; el candado de
--   dónde rige vive donde se usa.
--
-- ESTADO: escrita el 2026-09-19. NO en producción — la pega Felipe (lleva el
-- prefijo `retail.` y es idempotente: create or replace, se puede correr dos veces).
-- SE ROMPE SI: se etiqueta a mano una prenda cuya categoría ya está en
-- `etiqueta_categorias` de esa misma etiqueta: no falla, pero es redundante (la
-- venta ya la alcanza por categoría). La pantalla lo evita mostrándolas marcadas.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.etiquetar_variantes(p_cambios jsonb)
returns jsonb
language plpgsql security definer set search_path = retail, public as $$
declare
  c_max_cambios constant int := 50;
  c_max_variantes constant int := 2000;
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_cambio jsonb;
  v_etiqueta_id uuid;
  v_estado text;
  v_activa boolean;
  v_agregar uuid[];
  v_quitar uuid[];
  v_elem text;
  v_filas int;
  v_agregadas int := 0;
  v_quitadas int := 0;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede etiquetar prendas.';
  end if;

  if p_cambios is null or jsonb_typeof(p_cambios) <> 'array' then
    raise exception 'No hay cambios para aplicar. Recarga la pantalla.';
  end if;
  if jsonb_array_length(p_cambios) > c_max_cambios then
    raise exception 'Son demasiadas etiquetas a la vez (máximo %). Hazlo en tandas.', c_max_cambios;
  end if;

  for v_cambio in select * from jsonb_array_elements(p_cambios) loop
    -- La forma se valida ANTES de castear: un uuid mal formado haría que
    -- Postgres tire su error crudo en vez de una frase que la pantalla pueda leer.
    if jsonb_typeof(v_cambio) <> 'object' or not coalesce(v_cambio ->> 'etiqueta_id', '') ~ c_uuid then
      raise exception 'Una de las etiquetas no es válida. Recarga la pantalla.';
    end if;
    v_etiqueta_id := (v_cambio ->> 'etiqueta_id')::uuid;

    if jsonb_typeof(coalesce(v_cambio -> 'agregar', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(v_cambio -> 'quitar', '[]'::jsonb)) <> 'array' then
      raise exception 'La lista de prendas de una etiqueta no es válida. Recarga la pantalla.';
    end if;
    if jsonb_array_length(coalesce(v_cambio -> 'agregar', '[]'::jsonb)) > c_max_variantes
       or jsonb_array_length(coalesce(v_cambio -> 'quitar', '[]'::jsonb)) > c_max_variantes then
      raise exception 'Son demasiadas prendas a la vez (máximo % por etiqueta). Hazlo en tandas.', c_max_variantes;
    end if;

    for v_elem in
      select jsonb_array_elements_text(coalesce(v_cambio -> 'agregar', '[]'::jsonb))
      union all select jsonb_array_elements_text(coalesce(v_cambio -> 'quitar', '[]'::jsonb))
    loop
      if not v_elem ~ c_uuid then
        raise exception 'Una de las prendas no es válida. Recarga la pantalla.';
      end if;
    end loop;

    select coalesce(array_agg(distinct x::uuid), '{}') into v_agregar
      from jsonb_array_elements_text(coalesce(v_cambio -> 'agregar', '[]'::jsonb)) x;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_quitar
      from jsonb_array_elements_text(coalesce(v_cambio -> 'quitar', '[]'::jsonb)) x;

    if v_agregar && v_quitar then
      raise exception 'Una misma prenda no puede agregarse y quitarse a la vez. Recarga la pantalla.';
    end if;

    -- Lock de lectura sobre la etiqueta: nadie la desactiva a mitad de lote.
    select estado, activo into v_estado, v_activa from retail.etiquetas where id = v_etiqueta_id for share;
    if not found then
      raise exception 'Esa etiqueta ya no existe. Recarga la pantalla.';
    end if;

    if coalesce(array_length(v_agregar, 1), 0) > 0 then
      if v_estado <> 'aprobado' or not v_activa then
        raise exception 'Solo se puede etiquetar con una etiqueta aprobada y activa.';
      end if;
      if (select count(*) from retail.variantes where id = any (v_agregar) and activo) <> array_length(v_agregar, 1) then
        raise exception 'Una de las prendas ya no está disponible. Recarga la pantalla.';
      end if;

      insert into retail.variante_etiquetas (variante_id, etiqueta_id)
        select unnest(v_agregar), v_etiqueta_id
        on conflict (variante_id, etiqueta_id) do nothing;
      get diagnostics v_filas = row_count;
      v_agregadas := v_agregadas + v_filas;
    end if;

    if coalesce(array_length(v_quitar, 1), 0) > 0 then
      delete from retail.variante_etiquetas where etiqueta_id = v_etiqueta_id and variante_id = any (v_quitar);
      get diagnostics v_filas = row_count;
      v_quitadas := v_quitadas + v_filas;
    end if;
  end loop;

  return jsonb_build_object('agregadas', v_agregadas, 'quitadas', v_quitadas);
end;
$$;

comment on function retail.etiquetar_variantes(jsonb) is
  'Agrega o quita UNA etiqueta a muchas variantes, sin tocar sus demás etiquetas. p_cambios: [{"etiqueta_id": uuid, "agregar": uuid[], "quitar": uuid[]}, ...]. Todo el lote o nada; idempotente; solo Líder; solo etiquetas aprobadas y activas al agregar. Devuelve {agregadas, quitadas} con lo que realmente cambió.';

revoke all on function retail.etiquetar_variantes(jsonb) from public;
grant execute on function retail.etiquetar_variantes(jsonb) to authenticated;

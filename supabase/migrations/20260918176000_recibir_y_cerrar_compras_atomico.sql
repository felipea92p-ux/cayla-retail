-- ============================================================================
-- ADR-0106 (corrección 2026-09-18) — recibir, cerrar faltantes y registrar la nota
-- de crédito en UNA sola transacción.
--
-- POR QUÉ. La pantalla de recepción encadenaba tres llamadas sueltas: `recibir_compras`,
-- un `cerrar_linea_compra` por línea y la nota. Si fallaba la segunda o la tercera, la
-- recepción ya estaba registrada y quedaba a medias (un estado válido, pero que obligaba a
-- ir a completarlo a mano). Principio 2: se corrige el diseño, no se parcha con avisos.
--
-- ESTA FUNCIÓN solo ORQUESTA: llama a las tres RPC de siempre dentro de la misma
-- transacción de Postgres, así que cada una conserva sus permisos y sus candados, y si
-- CUALQUIERA falla no queda nada (ni stock, ni cierres, ni nota). El orden importa: la nota
-- por faltante se valida contra el comprobante YA resuelto, y solo lo está después de
-- registrar la recepción y los cierres.
--
--   p_items         igual que `recibir_compras`; puede ir vacío si solo se cierran faltantes
--                   (la línea que llegó en 0 y no va a llegar).
--   p_cierres       [{compra_item_id, cantidad, motivo, nota?}] — `cantidad` es lo que la
--                   pantalla vio que faltó; si la línea cambió mientras tanto y ya no hay
--                   tantas pendientes, falla (no cierra a ciegas).
--   p_notas_credito [{compra_id, serie_numero, fecha, monto, nota?}] — una por comprobante,
--                   siempre con motivo «faltante».
-- ============================================================================

set search_path = retail, public, extensions;

create function retail.recibir_y_cerrar_compras(
  p_ubicacion_id uuid,
  p_items jsonb default '[]'::jsonb,
  p_cierres jsonb default '[]'::jsonb,
  p_notas_credito jsonb default '[]'::jsonb,
  p_numero_guia text default null,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_lote_id uuid := null;
  v_cierre jsonb;
  v_nota jsonb;
  v_cierres integer := 0;
  v_notas integer := 0;
begin
  p_items := coalesce(p_items, '[]'::jsonb);
  p_cierres := coalesce(p_cierres, '[]'::jsonb);
  p_notas_credito := coalesce(p_notas_credito, '[]'::jsonb);

  if jsonb_typeof(p_items) <> 'array' or jsonb_typeof(p_cierres) <> 'array' or jsonb_typeof(p_notas_credito) <> 'array' then
    raise exception 'Los ítems, cierres y notas de crédito se envían como listas';
  end if;
  if jsonb_array_length(p_items) = 0 and jsonb_array_length(p_cierres) = 0 then
    raise exception 'No hay nada que registrar: cuenta lo que llegó o cierra lo que no va a llegar';
  end if;
  if jsonb_array_length(p_notas_credito) > 0 and jsonb_array_length(p_cierres) = 0 then
    raise exception 'Una nota de crédito por faltante necesita que se cierre al menos una línea en esta misma guía';
  end if;

  -- 1) la recepción (si llegó algo)
  if jsonb_array_length(p_items) > 0 then
    v_lote_id := recibir_compras(p_ubicacion_id, p_items, p_numero_guia, p_nota);
  end if;

  -- 2) los cierres: cada uno con sus permisos y candados (`cerrar_linea_compra`)
  for v_cierre in select * from jsonb_array_elements(p_cierres) loop
    perform cerrar_linea_compra(
      (v_cierre ->> 'compra_item_id')::uuid,
      (v_cierre ->> 'cantidad')::integer,
      v_cierre ->> 'motivo',
      v_cierre ->> 'nota'
    );
    v_cierres := v_cierres + 1;
  end loop;

  -- 3) las notas de crédito, ya con el comprobante resuelto
  for v_nota in select * from jsonb_array_elements(p_notas_credito) loop
    perform registrar_nota_credito_compra(
      (v_nota ->> 'compra_id')::uuid,
      v_nota ->> 'serie_numero',
      (v_nota ->> 'fecha')::date,
      (v_nota ->> 'monto')::numeric,
      'faltante',
      v_nota ->> 'nota'
    );
    v_notas := v_notas + 1;
  end loop;

  return jsonb_build_object('lote_id', v_lote_id, 'cierres', v_cierres, 'notas_credito', v_notas);
end;
$$;

comment on function retail.recibir_y_cerrar_compras(uuid, jsonb, jsonb, jsonb, text, text) is
  'Recibe mercadería (recibir_compras), cierra faltantes (cerrar_linea_compra) y registra la nota de crédito por faltante (registrar_nota_credito_compra) en UNA transacción: si algo falla, no queda nada (ADR-0106). Devuelve {lote_id, cierres, notas_credito}.';

revoke all on function retail.recibir_y_cerrar_compras(uuid, jsonb, jsonb, jsonb, text, text) from public, anon;
grant execute on function retail.recibir_y_cerrar_compras(uuid, jsonb, jsonb, jsonb, text, text) to authenticated;

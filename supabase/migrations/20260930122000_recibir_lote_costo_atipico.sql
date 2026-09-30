-- ============================================================================
-- 20260930122000_recibir_lote_costo_atipico.sql
-- Recibir un lote sin factura pide confirmación si el costo de una línea es atípico (Felipe, 2026-09-30) — actividad 3 de 5
--
-- EL PROBLEMA PRIMERO. `recibir_lote` recibe mercadería sin factura y, si una línea trae `costo_unitario`, lo mete al
-- promedio ponderado de esa prenda (`fn_recalcular_costo_variante`). El costo lo teclea quien recibe, sin nadie que lo mire:
-- un cero de más contamina el costo de la prenda en las tres sedes, y no tiene arreglo desde la app (el candado de
-- 20260927190000 impide corregirlo a mano una vez que hay historial). Es el mismo hueco que tenía cerrar una orden del
-- Taller (20260930121000); acá lo tapa la misma regla (`fn_costo_fuera_de_banda`, 20260930120000).
--
-- QUÉ PROMETE. Después de los candados y de comprobar el permiso, y ANTES de crear el lote, se revisa cada línea que trae
-- costo contra el costo vigente y el precio de su prenda. Se juntan TODAS las atípicas (el líder las confirma juntas):
--   - Quien NO es líder no puede recibirlas con ese costo: `costo_atipico_sin_lider`, sin cifras. Su salida es recibir esa
--     línea sin costo (el costo es opcional) o pedirle a un líder que lo confirme.
--   - Un líder recibe `costo_atipico` con el dato en `detail`: JSON `{"items":[{variante_id, sku, motivo, costo_unitario,
--     costo_vigente, precio}, …]}`, en el orden del lote. Nada se escribe (todo o nada). Reintenta con
--     `p_confirma_costo_atipico => true` y el lote deja constancia en su nota, sin montos.
--   - El servidor lo exige (el permiso se pregunta a la cuenta con `fn_es_lider`, ADR-0161): un integrante que mande `true`
--     por la API directa recibe lo mismo que sin él.
-- Una línea SIN costo no se juzga (es opcional): entra al stock y el costo de la prenda no se toca. Un costo de 0 tampoco: en
-- Compras es un OBSEQUIO, una decisión explícita (por eso `fn_costo_fuera_de_banda` lo llama «sin_costo» pero este camino no
-- lo pregunta). En el cierre del Taller, en cambio, el 0 sí se pregunta: ahí significa que nadie tecleó el costo.
-- El rechazo ocurre antes de crear el lote y antes de marcar el token (ADR-0190): el reintento con el MISMO token y la
-- confirmación es el mismo intento, no un lote nuevo; y el reintento de un lote ya guardado sigue devolviendo ese lote.
--
-- QUÉ CAMBIA DE LA FIRMA. Parámetro nuevo con valor por defecto, ANTES de `p_token`: la convención de ADR-0190 (vigilada por
-- `pnpm pruebas:concurrencia-orden`) es que `p_token` sea siempre el último. Se elimina la firma vieja de seis parámetros
-- (PostgREST rechazaría por ambigua una llamada con los seis). Toda llamada SQL con el token va por nombre (`p_token => …`):
-- por posición, el sexto ya no es el token. Las de la web ya son por nombre. `drop function` no toma los bloqueos de `auth`/`storage`
-- que sí toman las políticas (ADR-0195): va en una sola parte.
--
-- ORDEN PARA PRODUCCIÓN: SQL y web en cualquier orden (la web NO manda el parámetro en el primer intento, solo en el
-- reintento tras `costo_atipico`). Requiere antes 20260930120000. PARA PEGAR: trae `set search_path`.
--
-- BASE DEL CUERPO. El cuerpo vivo de producción (2026-09-30, huella md5 b43aa7662e81f4c199ee5e91bcbc9d0b, con los comentarios
-- recortados; la lógica es idéntica a 20260916090000 + el token de ADR-0190 + `fn_actor_persona_id(true)` de ADR-0162). Nada
-- más cambia que lo marcado con «COSTO ATÍPICO». Nadie más llama a `recibir_lote` desde SQL.
--
-- CÓMO SE DESHACE. drop function retail.recibir_lote(uuid, uuid, jsonb, text, text, boolean, uuid); y volver a crear la de seis
-- parámetros con su cuerpo anterior, con `grant execute … to authenticated` y sin `public` ni `anon`.
-- ============================================================================

set search_path = retail, public, extensions;

drop function if exists retail.recibir_lote(uuid, uuid, jsonb, text, text, uuid);

create or replace function retail.recibir_lote(
  p_ubicacion_id uuid,
  p_proveedor_id uuid,
  p_items jsonb,
  p_numero_guia text default null,
  p_nota text default null,
  p_confirma_costo_atipico boolean default false,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_lote_id uuid; v_item jsonb; v_mov_id uuid; v_persona uuid; v_sub uuid;
  -- COSTO ATÍPICO
  v_atipicos jsonb;
begin
  -- ADR-0190: doble clic. El segundo intento con el mismo token espera al primero y devuelve SU resultado.
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('lotes:' || p_token::text, 0));
    if exists (select 1 from lotes where token_cliente = p_token) then
      return (select id from lotes where token_cliente = p_token);
    end if;
  end if;
  -- ADR-0190: los candados en orden fijo antes de mover nada (sin bloqueos mutuos entre dos operaciones).
  perform fn_bloquear_en_orden(p_ubicacion_id, fn_ids_de_items(p_items), true);
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Un lote necesita al menos un ítem';
  end if;

  -- COSTO ATÍPICO. Las variantes ya están bloqueadas arriba (fn_bloquear_en_orden), así que el costo vigente no cambia
  -- mientras se compara. Solo se juzgan las líneas con un costo POSITIVO: sin costo, la línea entra al stock y no toca el costo;
  -- un costo de 0 es un obsequio, «una decisión explícita, no una omisión» (indicadores de Compras, 20260918213000), y un
  -- negativo sigue con su error de siempre (fn_recalcular_costo_variante).
  select jsonb_agg(jsonb_build_object(
           'variante_id', vr.id, 'sku', vr.sku, 'motivo', x.motivo,
           'costo_unitario', (e.item ->> 'costo_unitario')::numeric, 'costo_vigente', vr.costo, 'precio', vr.precio
         ) order by e.pos)
    into v_atipicos
    from jsonb_array_elements(p_items) with ordinality as e(item, pos)
    join variantes vr on vr.id = (e.item ->> 'variante_id')::uuid
   cross join lateral (
     select retail.fn_costo_fuera_de_banda((e.item ->> 'costo_unitario')::numeric, vr.costo, vr.precio) as motivo
   ) x
   where (e.item ->> 'costo_unitario') is not null
     and (e.item ->> 'costo_unitario')::numeric > 0
     and x.motivo is not null;

  if v_atipicos is not null then
    if not retail.fn_es_lider() then
      raise exception 'costo_atipico_sin_lider';
    end if;
    if not coalesce(p_confirma_costo_atipico, false) then
      raise exception 'costo_atipico' using detail = jsonb_build_object('items', v_atipicos)::text;
    end if;
  end if;

  v_persona := retail.fn_actor_persona_id(true);
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada');

  insert into lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por, nota)
    values (p_ubicacion_id, p_proveedor_id, p_numero_guia, v_persona, p_nota)
    returning id into v_lote_id;

  -- COSTO ATÍPICO: la constancia, sin montos.
  if v_atipicos is not null then
    update lotes
      set nota = concat_ws(' · ', nota, 'Costo atípico confirmado por un líder (' || jsonb_array_length(v_atipicos)
            || case when jsonb_array_length(v_atipicos) = 1 then ' línea)' else ' líneas)' end)
      where id = v_lote_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'entrada',
              (v_item ->> 'cantidad')::integer, 'recepcion', v_lote_id, v_persona)
      returning id into v_mov_id;

    if (v_item ->> 'costo_unitario') is not null then
      perform fn_recalcular_costo_variante(
        (v_item ->> 'variante_id')::uuid,
        (v_item ->> 'cantidad')::integer,
        (v_item ->> 'costo_unitario')::numeric,
        'compra',
        v_mov_id
      );
    end if;

    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  -- ADR-0190: el intento queda marcado con su token (el índice único es la última red).
  if p_token is not null then
    update lotes set token_cliente = p_token where id = v_lote_id;
  end if;
  return v_lote_id;
end;
$$;

-- Los permisos de producción (2026-09-30): dueño y la API, sin public ni anon. En el Postgres local esta función traía PUBLIC
-- (un residuo de las migraciones viejas; producción ya no lo tiene): aquí se alinea con producción.
revoke all on function retail.recibir_lote(uuid, uuid, jsonb, text, text, boolean, uuid) from public, anon;
grant execute on function retail.recibir_lote(uuid, uuid, jsonb, text, text, boolean, uuid) to authenticated;

comment on function retail.recibir_lote(uuid, uuid, jsonb, text, text, boolean, uuid) is
  'Recibe un lote sin factura: entrada al stock y, si la línea trae costo, promedio ponderado. Si el costo de alguna línea es atípico (fn_costo_fuera_de_banda) un líder debe confirmarlo con p_confirma_costo_atipico; quien no es líder no puede recibirla con ese costo.';

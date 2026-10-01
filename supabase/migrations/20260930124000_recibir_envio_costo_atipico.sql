-- ============================================================================
-- 20260930124000_recibir_envio_costo_atipico.sql
-- Recibir lo fuera de comprobante de un envío pide confirmación si su costo es atípico (Felipe, 2026-09-30) — actividad 5 de 5
--
-- EL PROBLEMA PRIMERO. En un envío, las prendas que llegaron FUERA de comprobante las cuenta quien recibe y, si quiere, les
-- teclea un costo: entra al promedio ponderado de esa prenda (`fn_recalcular_costo_variante`), igual que en `recibir_lote`. Nadie
-- lo mira, y un cero de más contamina el costo en las tres sedes sin arreglo desde la app (el candado de 20260927190000). Las
-- líneas DE comprobante no tienen este problema: su costo ya se miró al registrar la factura (20260930123000).
--
-- CÓMO VIAJA LA CONFIRMACIÓN (decisión de Felipe, 2026-09-30: «decide tú»). Donde hay una sola cosa que confirmar va un
-- parámetro; donde hay varias líneas, la confirmación viaja en CADA línea: `"confirma_costo": true` dentro del extra. Así la base
-- acepta exactamente los extras que el líder vio y no cambia la firma de 9 parámetros (muchas migraciones la nombran).
--
-- QUÉ PROMETE. Después de los candados y del permiso, y ANTES de escribir nada (el envío y su token no se tocan), se compara cada
-- extra con costo POSITIVO que no es regalo contra el costo vigente y el precio de su prenda (`fn_costo_fuera_de_banda`,
-- 20260930120000):
--   - Quien NO es líder no puede recibir un extra atípico con ese costo: `costo_atipico_sin_lider`, sin cifras, marque lo que
--     marque. Su salida es recibirlo sin costo (es opcional) o pedirle a un líder que lo confirme.
--   - Un líder recibe `costo_atipico` con `detail` JSON `{"items":[{linea, variante_id, sku, motivo, costo_unitario,
--     costo_vigente, precio}, …]}` (los extras atípicos SIN marca; `linea` es la posición en `p_extras`, desde 1). Nada se escribe.
--     Reintenta con la marca en esos extras y la nota del envío (y la de sus lotes) deja constancia, sin montos.
-- Un regalo no se juzga (no toca el costo). Un costo de 0 tampoco: es un obsequio. Las líneas de comprobante no cambian.
--
-- QUÉ NO CAMBIA. La firma de 9 parámetros, los permisos, y ni una validación ni escritura: lo único nuevo es el bloque «COSTO
-- ATÍPICO» (antes de crear el envío) y que la nota lleve la constancia cuando hubo confirmación.
--
-- ORDEN PARA PRODUCCIÓN: SQL y web en cualquier orden (la web NO manda la marca en el primer intento). Requiere antes 20260930120000.
-- PARA PEGAR: trae `set search_path`.
--
-- BASE DEL CUERPO. La definición viva de producción (2026-09-30): su huella normalizada —sin comentarios ni espacios— coincide con
-- la de una base que aplicó todas las migraciones del repo, así que ya trae todos sus parches. Nada cambia más que lo marcado.
--
-- CÓMO SE DESHACE. Quitar el bloque «COSTO ATÍPICO» (y sus dos variables) de `retail.recibir_envio`, misma firma.
-- ============================================================================

set search_path = retail, public, extensions;

CREATE OR REPLACE FUNCTION retail.recibir_envio(p_ubicacion_id uuid, p_items jsonb DEFAULT '[]'::jsonb, p_extras jsonb DEFAULT '[]'::jsonb, p_traslados jsonb DEFAULT '[]'::jsonb, p_cierres jsonb DEFAULT '[]'::jsonb, p_notas_credito jsonb DEFAULT '[]'::jsonb, p_numero_guia text DEFAULT NULL::text, p_nota text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_es_lider boolean;
  v_persona uuid;
  v_guia text := nullif(btrim(p_numero_guia), '');
  v_nota text := nullif(btrim(p_nota), '');
  v_envio_id uuid := null;
  v_existente envios%rowtype;
  v_sub uuid;
  v_prov uuid;
  v_lote_id uuid;
  v_lotes jsonb := '[]'::jsonb;
  v_lote_de jsonb := '{}'::jsonb;          -- proveedor_id (texto) -> lote_id
  v_items_prov jsonb;
  v_item jsonb; v_extra jsonb; v_tr jsonb; v_lin jsonb; v_cierre jsonb; v_nota_cr jsonb;
  v_mov_id uuid; v_cantidad integer; v_costo numeric; v_regalo boolean;
  v_extras integer := 0; v_cierres integer := 0; v_notas integer := 0;
  v_traslados jsonb := '[]'::jsonb; v_resultado text;
  -- COSTO ATÍPICO
  v_atipicos jsonb; v_sin_marca jsonb;
begin
  -- ADR-0190: los candados en orden fijo antes de mover nada (sin bloqueos mutuos entre dos operaciones).
  perform fn_bloquear_en_orden(p_ubicacion_id,
    fn_ids_de_items(
      (case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
      || (case when jsonb_typeof(p_extras) = 'array' then p_extras else '[]'::jsonb end)
      || coalesce((select jsonb_agg(l)
                     from jsonb_array_elements(case when jsonb_typeof(p_traslados) = 'array' then p_traslados else '[]'::jsonb end) t,
                          jsonb_array_elements(case when jsonb_typeof(t -> 'lineas') = 'array' then t -> 'lineas' else '[]'::jsonb end) l),
                  '[]'::jsonb)),
    true,
    fn_ids_de_items(
      (case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
      || (case when jsonb_typeof(p_cierres) = 'array' then p_cierres else '[]'::jsonb end),
      'compra_item_id'));
  p_items := coalesce(p_items, '[]'::jsonb);
  p_extras := coalesce(p_extras, '[]'::jsonb);
  p_traslados := coalesce(p_traslados, '[]'::jsonb);
  p_cierres := coalesce(p_cierres, '[]'::jsonb);
  p_notas_credito := coalesce(p_notas_credito, '[]'::jsonb);

  if jsonb_typeof(p_items) <> 'array' or jsonb_typeof(p_extras) <> 'array' or jsonb_typeof(p_traslados) <> 'array'
     or jsonb_typeof(p_cierres) <> 'array' or jsonb_typeof(p_notas_credito) <> 'array' then
    raise exception 'Los ítems, extras, traslados, cierres y notas de crédito se envían como listas';
  end if;

  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa ubicación';
  end if;
  v_es_lider := fn_es_lider();

  -- ---------- qué se puede pedir ----------
  -- Primero la regla específica: si trae extras o traslados sin ningún comprobante, esa es la explicación útil.
  if jsonb_array_length(p_items) = 0 and (jsonb_array_length(p_extras) > 0 or jsonb_array_length(p_traslados) > 0) then
    raise exception 'Lo que llegó fuera de comprobante o dentro de un traslado necesita al menos una línea de comprobante recibida en este envío — si no viene ningún comprobante, usa Ingreso sin comprobante o Traslados';
  end if;
  if jsonb_array_length(p_items) = 0 and jsonb_array_length(p_cierres) = 0 then
    raise exception 'No hay nada que registrar: cuenta lo que llegó o cierra lo que no va a llegar';
  end if;
  if jsonb_array_length(p_notas_credito) > 0 and jsonb_array_length(p_cierres) = 0 then
    raise exception 'Una nota de crédito por faltante necesita que se cierre al menos una línea en este mismo envío';
  end if;

  -- ---------- los ítems de comprobante ----------
  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'compra_item_id') is null then
      raise exception 'Una prenda sin línea de comprobante va en «fuera de comprobante», no entre los ítems del comprobante';
    end if;
    if not exists (select 1 from compra_items where id = (v_item ->> 'compra_item_id')::uuid) then
      raise exception 'La línea de comprobante % no existe', v_item ->> 'compra_item_id';
    end if;
  end loop;

  -- Un colaborador solo recibe comprobantes destinados a SU sede (la misma regla con que los ve).
  if not v_es_lider and exists (
    select 1
    from jsonb_array_elements(p_items) i
    join compra_items ci on ci.id = (i ->> 'compra_item_id')::uuid
    join compras c on c.id = ci.compra_id
    where not exists (select 1 from compra_item_destinos d where d.compra_item_id = ci.id and d.ubicacion_id = p_ubicacion_id)
  ) then
    raise exception 'Esa línea no tiene mercadería asignada a esta sede: solo un líder puede recibirla aquí (o pide que la reasignen)';
  end if;

  -- COSTO ATÍPICO. Solo lo FUERA de comprobante trae un costo tecleado al recibir (el de una línea de comprobante ya se miró al
  -- registrar la factura). Se comparan los extras con costo POSITIVO que no son regalo (un regalo no promedia costo; un costo de 0
  -- es un obsequio, decisión explícita) contra el costo vigente y el precio de su prenda. Las variantes ya están bloqueadas arriba
  -- (fn_bloquear_en_orden), así que el costo vigente no cambia mientras se compara. Quien NO es líder no puede recibir un extra
  -- atípico con ese costo (su salida: recibirlo sin costo, que es opcional, o pedir a un líder que lo confirme); el líder confirma
  -- con `"confirma_costo": true` en CADA extra que se le mostró. Todo antes de escribir nada: el envío y su token no se tocan.
  select jsonb_agg(jsonb_build_object(
           'linea', e.pos, 'variante_id', vr.id, 'sku', vr.sku, 'motivo', x.motivo,
           'costo_unitario', (e.item ->> 'costo_unitario')::numeric, 'costo_vigente', vr.costo, 'precio', vr.precio,
           'confirmada', coalesce((e.item -> 'confirma_costo') = 'true'::jsonb, false)
         ) order by e.pos)
    into v_atipicos
    from jsonb_array_elements(p_extras) with ordinality as e(item, pos)
    join variantes vr on vr.id = (e.item ->> 'variante_id')::uuid
   cross join lateral (
     select retail.fn_costo_fuera_de_banda((e.item ->> 'costo_unitario')::numeric, vr.costo, vr.precio) as motivo
   ) x
   where not coalesce((e.item ->> 'es_regalo')::boolean, false)
     and (e.item ->> 'costo_unitario') is not null
     and (e.item ->> 'costo_unitario')::numeric > 0
     and x.motivo is not null;

  if v_atipicos is not null then
    if not v_es_lider then
      raise exception 'costo_atipico_sin_lider';
    end if;
    select jsonb_agg(a - 'confirmada') into v_sin_marca
      from jsonb_array_elements(v_atipicos) a
     where not (a ->> 'confirmada')::boolean;
    if v_sin_marca is not null then
      raise exception 'costo_atipico' using detail = jsonb_build_object('items', v_sin_marca)::text;
    end if;
    v_nota := concat_ws(' · ', v_nota, 'Costo atípico confirmado por un líder (' || jsonb_array_length(v_atipicos)
      || case when jsonb_array_length(v_atipicos) = 1 then ' ítem fuera de comprobante)' else ' ítems fuera de comprobante)' end);
  end if;

  v_persona := retail.fn_actor_persona_id(true);

  -- ---------- el envío (y la idempotencia) ----------
  if jsonb_array_length(p_items) > 0 then
    insert into envios (ubicacion_id, numero_guia, nota, recibido_por, token_cliente)
      values (p_ubicacion_id, v_guia, v_nota, v_persona, p_token)
      on conflict (token_cliente) where token_cliente is not null do nothing
      returning id into v_envio_id;

    if v_envio_id is null then
      -- El mismo token ya registró este envío: se devuelve lo registrado, sin repetir nada.
      select * into v_existente from envios where token_cliente = p_token;
      if v_existente.ubicacion_id <> p_ubicacion_id then
        raise exception 'Ese token ya se usó en otra recepción';
      end if;
      return jsonb_build_object(
        'envio_id', v_existente.id,
        'ya_registrado', true,
        'lotes', coalesce((select jsonb_agg(jsonb_build_object('lote_id', l.id, 'proveedor_id', l.proveedor_id) order by l.id)
                           from lotes l where l.envio_id = v_existente.id), '[]'::jsonb),
        'extras', (select count(*) from envio_extras where envio_id = v_existente.id),
        'traslados', coalesce((select jsonb_agg(jsonb_build_object('transferencia_id', et.transferencia_id, 'resultado', t.estado))
                               from envio_traslados et join transferencias t on t.id = et.transferencia_id
                               where et.envio_id = v_existente.id), '[]'::jsonb),
        'cierres', 0,
        'notas_credito', 0
      );
    end if;

    -- ---------- un lote por proveedor: `recibir_compras`, tal cual ----------
    -- El proveedor lo pone el SERVIDOR (el de cada comprobante), nunca el cliente. Se
    -- recorren en orden fijo para que dos envíos simultáneos no se bloqueen entre sí.
    for v_prov in
      select distinct c.proveedor_id
      from jsonb_array_elements(p_items) i
      join compra_items ci on ci.id = (i ->> 'compra_item_id')::uuid
      join compras c on c.id = ci.compra_id
      order by 1
    loop
      select jsonb_agg(i) into v_items_prov
      from jsonb_array_elements(p_items) i
      join compra_items ci on ci.id = (i ->> 'compra_item_id')::uuid
      join compras c on c.id = ci.compra_id
      where c.proveedor_id = v_prov;

      v_lote_id := recibir_compras(p_ubicacion_id, v_items_prov, v_guia, v_nota);
      update lotes set envio_id = v_envio_id where id = v_lote_id;
      v_lotes := v_lotes || jsonb_build_array(jsonb_build_object('lote_id', v_lote_id, 'proveedor_id', v_prov));
      v_lote_de := v_lote_de || jsonb_build_object(v_prov::text, v_lote_id);
    end loop;
  end if;

  -- ---------- lo fuera de comprobante, con su origen ----------
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada');
  for v_extra in select * from jsonb_array_elements(p_extras) loop
    v_prov := (v_extra ->> 'proveedor_id')::uuid;
    if v_prov is null or not exists (select 1 from proveedores where id = v_prov) then
      raise exception 'Lo que llegó fuera de comprobante necesita un proveedor válido — si viene de otra sede de CAYLA, confírmalo como envío interno (traslado)';
    end if;
    v_cantidad := coalesce((v_extra ->> 'cantidad')::integer, 0);
    if v_cantidad <= 0 then
      raise exception 'La cantidad recibida debe ser mayor a cero';
    end if;
    if not exists (select 1 from variantes where id = (v_extra ->> 'variante_id')::uuid) then
      raise exception 'La prenda fuera de comprobante no existe';
    end if;
    v_regalo := coalesce((v_extra ->> 'es_regalo')::boolean, false);
    v_costo := (v_extra ->> 'costo_unitario')::numeric;
    if v_costo is not null and v_costo < 0 then
      raise exception 'El costo no puede ser negativo';
    end if;
    if v_regalo and coalesce(v_costo, 0) <> 0 then
      raise exception 'Un regalo no lleva costo: quita el costo o desmarca «regalo»';
    end if;

    -- El lote es el del proveedor; si ese proveedor no trajo comprobante en el envío, se abre uno.
    v_lote_id := (v_lote_de ->> v_prov::text)::uuid;
    if v_lote_id is null then
      insert into lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por, nota, envio_id)
        values (p_ubicacion_id, v_prov, v_guia, v_persona, v_nota, v_envio_id)
        returning id into v_lote_id;
      v_lotes := v_lotes || jsonb_build_array(jsonb_build_object('lote_id', v_lote_id, 'proveedor_id', v_prov));
      v_lote_de := v_lote_de || jsonb_build_object(v_prov::text, v_lote_id);
    end if;

    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, usuario_id)
      values ((v_extra ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'entrada', v_cantidad, 'recepcion', v_lote_id, v_persona)
      returning id into v_mov_id;

    -- Un regalo no tiene costo que promediar: entra al stock, no al costo promedio.
    if not v_regalo and v_costo is not null then
      perform fn_recalcular_costo_variante((v_extra ->> 'variante_id')::uuid, v_cantidad, v_costo, 'compra', v_mov_id);
    end if;
    perform fn_aplicar_movimiento(v_mov_id);

    insert into envio_extras (movimiento_id, envio_id, proveedor_id, es_regalo, nota)
      values (v_mov_id, v_envio_id, v_prov, v_regalo, nullif(btrim(v_extra ->> 'nota'), ''));
    v_extras := v_extras + 1;
  end loop;

  -- ---------- lo que vino de otra sede: se confirma el traslado en tránsito ----------
  for v_tr in select * from jsonb_array_elements(p_traslados) loop
    if not exists (
      select 1 from transferencias t
      where t.id = (v_tr ->> 'transferencia_id')::uuid
        and t.ubicacion_destino_id = p_ubicacion_id
        and t.estado = 'en_transito'
    ) then
      raise exception 'El traslado % no viene hacia esta ubicación o ya no está en tránsito', v_tr ->> 'transferencia_id';
    end if;
    if coalesce(jsonb_typeof(v_tr -> 'lineas'), '') <> 'array' or jsonb_array_length(v_tr -> 'lineas') = 0 then
      raise exception 'Cuenta las prendas del traslado (aunque alguna sea 0) antes de confirmarlo';
    end if;
    for v_lin in select * from jsonb_array_elements(v_tr -> 'lineas') loop
      perform registrar_recepcion_traslado(
        (v_tr ->> 'transferencia_id')::uuid,
        (v_lin ->> 'variante_id')::uuid,
        (v_lin ->> 'cantidad')::integer
      );
    end loop;
    select c.resultado into v_resultado from confirmar_traslado((v_tr ->> 'transferencia_id')::uuid) c;
    insert into envio_traslados (envio_id, transferencia_id) values (v_envio_id, (v_tr ->> 'transferencia_id')::uuid);
    v_traslados := v_traslados || jsonb_build_array(
      jsonb_build_object('transferencia_id', v_tr ->> 'transferencia_id', 'resultado', v_resultado)
    );
  end loop;

  -- ---------- los cierres: cada uno con sus permisos y candados (`cerrar_linea_compra`) ----------
  for v_cierre in select * from jsonb_array_elements(p_cierres) loop
    perform cerrar_linea_compra(
      (v_cierre ->> 'compra_item_id')::uuid,
      (v_cierre ->> 'cantidad')::integer,
      v_cierre ->> 'motivo',
      v_cierre ->> 'nota',
      p_ubicacion_id
    );
    v_cierres := v_cierres + 1;
  end loop;

  -- ---------- las notas de crédito, ya con el comprobante resuelto ----------
  for v_nota_cr in select * from jsonb_array_elements(p_notas_credito) loop
    perform registrar_nota_credito_compra(
      (v_nota_cr ->> 'compra_id')::uuid,
      v_nota_cr ->> 'serie_numero',
      (v_nota_cr ->> 'fecha')::date,
      (v_nota_cr ->> 'monto')::numeric,
      'faltante',
      v_nota_cr ->> 'nota'
    );
    v_notas := v_notas + 1;
  end loop;

  return jsonb_build_object(
    'envio_id', v_envio_id,
    'ya_registrado', false,
    'lotes', v_lotes,
    'extras', v_extras,
    'traslados', v_traslados,
    'cierres', v_cierres,
    'notas_credito', v_notas
  );
end;
$function$;

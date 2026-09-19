-- ============================================================================
-- ADR-0113 — `recibir_envio`: UNA transacción para todo lo que trae un envío.
--
-- QUÉ HACE. Recibe lo que llegó a la puerta en un solo movimiento, sea de uno o de varios
-- proveedores, y lo registra junto o no lo registra:
--   1. crea el `envios` (guía única, quién, cuándo, token de idempotencia);
--   2. por cada proveedor de los comprobantes: UN lote, llamando a `recibir_compras` tal
--      cual (conserva sus topes, su costo promedio y sus candados — no se reescribe);
--   3. lo FUERA DE COMPROBANTE, con su origen: de qué proveedor viene y si es regalo
--      (`envio_extras`), dentro del lote de ese proveedor;
--   4. lo que vino de OTRA SEDE de CAYLA: cuenta y confirma esos traslados en tránsito
--      (`registrar_recepcion_traslado` + `confirmar_traslado`, ADR-0068);
--   5. los cierres de faltantes y las notas de crédito, igual que `recibir_y_cerrar_compras`.
--
-- QUIÉN. Cuenta CUALQUIER colaborador que opera la sede (`fn_puede_operar_ubicacion`, igual
-- que Traslados — Felipe, 2026-09-18). Los cierres y las notas de crédito conservan EXACTAMENTE
-- las reglas de sus RPC (`cerrar_linea_compra`: quien opera la sede; `registrar_nota_credito_compra`:
-- solo líder, es dinero): esta función solo orquesta, no las endurece ni las relaja. Que la
-- pantalla deje el cierre de faltantes a un líder —como Traslados: cuenta cualquiera, un
-- líder cierra las diferencias— es una decisión de la pantalla, reversible sin migración.
-- Un colaborador solo recibe comprobantes destinados a SU sede (la misma regla con que ya
-- los ve, ADR-0075).
--
-- POR QUÉ UNA SOLA RPC. La versión de tres llamadas sueltas dejaba recepciones a medias
-- (ADR-0111, `recibir_y_cerrar_compras`). Con varios proveedores el riesgo crece: si el
-- segundo falla, el primero ya está en el stock. Aquí, si CUALQUIER parte falla no queda
-- nada — ni lotes, ni movimientos, ni el envío ni el token — y el conteo sigue en la
-- pantalla para corregirlo (principios 2 y 9).
--
-- IDEMPOTENCIA. `p_token` (uuid generado por la pantalla al abrir el envío): repetir la
-- llamada con el mismo token devuelve el envío ya registrado sin tocar el stock. Cierra el
-- hueco que hoy tiene `recibir_compras` (un doble toque en «Recibir» duplica las unidades).
-- Un intento que FALLA no consume el token: el envío se inserta dentro de la misma
-- transacción y desaparece con ella.
--
-- CONTRATO
--   p_items      [{compra_item_id, variante_id, cantidad}]        comprobantes (≥ 1 salvo que solo se cierren)
--   p_extras     [{proveedor_id, variante_id, cantidad, es_regalo?, costo_unitario?, nota?}]
--   p_traslados  [{transferencia_id, lineas:[{variante_id, cantidad}]}]   TODAS las líneas enviadas, aunque sea 0
--   p_cierres    [{compra_item_id, cantidad, motivo, nota?}]      como `cerrar_linea_compra`
--   p_notas_credito [{compra_id, serie_numero, fecha, monto, nota?}]   solo líder (la RPC de la nota), una por comprobante
--   devuelve     {envio_id, ya_registrado, lotes:[{lote_id, proveedor_id}], extras, traslados:[{transferencia_id, resultado}], cierres, notas_credito}
--
-- Solo LOCAL. No aplicar en producción sin autorización explícita de Felipe.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.recibir_envio(
  p_ubicacion_id uuid,
  p_items jsonb default '[]'::jsonb,
  p_extras jsonb default '[]'::jsonb,
  p_traslados jsonb default '[]'::jsonb,
  p_cierres jsonb default '[]'::jsonb,
  p_notas_credito jsonb default '[]'::jsonb,
  p_numero_guia text default null,
  p_nota text default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
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
begin
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
    where c.ubicacion_destino_id is distinct from p_ubicacion_id
  ) then
    raise exception 'Ese comprobante está destinado a otra sede: solo un líder puede recibirlo aquí';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

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
      v_cierre ->> 'nota'
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
$$;

comment on function retail.recibir_envio(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, uuid) is
  'Recibe un ENVÍO en una sola transacción (ADR-0113): comprobantes de uno o varios proveedores (un lote por proveedor vía recibir_compras), prendas fuera de comprobante con origen y regalo, traslados internos confirmados, cierres de faltante y notas de crédito. Cuenta cualquier colaborador de la sede; cerrar y notas, solo líder. Idempotente por p_token. Devuelve {envio_id, ya_registrado, lotes, extras, traslados, cierres, notas_credito}.';

revoke all on function retail.recibir_envio(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, uuid) from public, anon;
grant execute on function retail.recibir_envio(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, uuid) to authenticated;

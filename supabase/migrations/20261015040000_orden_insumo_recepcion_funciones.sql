-- ============================================================================
-- 20261015040000_orden_insumo_recepcion_funciones.sql — CAYLA V2 · ADR-0362, fase 7 parte 2, actividad 3 (recibir en el Taller contra la
-- orden de insumos). Va después de 20261015035000_orden_insumo_recepcion_esquema.sql. Contrato:
-- docs/compras/ordenes-de-compra-2026-10/contrato-ordenes-de-insumos.md (punto 3).
--
-- EL PROBLEMA PRIMERO. La tela y los avíos de una orden de insumos no tenían por dónde entrar al Taller: el papel de la orden ya no se recibe
-- por la recepción de siempre (actividad 1) y el comprobante no bloquea (decisión 9): lo que llegó tiene que poder recibirse aunque el papel
-- todavía no esté.
--
-- QUÉ HACE.
--   1. `fn_ordenes_insumo_por_recibir` (la web, Producción ▸ Recibir): las órdenes generadas que llegan a ese taller y tienen algo por
--      recibir, línea por línea, con lo pedido, lo facturado en papeles vigentes, lo recibido y lo que queda; y lo que su papel trajo FUERA
--      de la orden (decisión 43), que también se recibe aquí. Con el precio de ESA orden (decisión 53: quien recibe ve y corrige el precio
--      de esa orden, sin ver el resto de la plata del Taller). Pide el módulo de Producción y poder operar en ese taller.
--   2. `recibir_orden_insumo` (la web): recibe en el Taller contra la orden, con las reglas de `recibir_comprobante_produccion`: un lote
--      por línea y su movimiento de compra en la MISMA transacción, nunca más de lo que queda, con hasta tres decimales, idempotente por
--      token. Lo que queda de una línea pedida es lo mayor entre lo pedido y lo facturado, menos lo recibido (como «Recibir sin guía» de las
--      tiendas); de una línea fuera de la orden, lo facturado menos lo recibido. El costo del lote se congela al recibir (PEPS): el que
--      escribe quien recibe (decisión 53), o el sugerido (el del papel si la línea tiene UNO vigente; si no, el neto de la orden). Quien hizo
--      la orden no la recibe (decisión 17, sin excepción: ni el líder). Firma el responsable, como la recepción de siempre.
--   3. Candados (REEMPLAZOS ANCLADOS, `orden_insumo_con_recepcion`): con algo recibido, la orden ya no se edita (editar borra sus líneas, y
--      los lotes apuntan a ellas) ni se anula (lo recibido ya es stock del Taller).
--   4. El detalle de la orden (`fn_orden_insumo`, REEMPLAZO ANCLADO) suma `recepcion`: lo recibido de cada línea.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261015035000. Sin tablas, sin políticas, sin `drop trigger`
-- (ADR-0195), sin `select … into` dentro de textos entre comillas (ADR-0288). Los reemplazos abortan SIN TOCAR NADA si la función viva
-- cambió, y no hacen nada si ya están aplicados: se puede pegar dos veces. El bloque final comprueba que quedó todo.
-- ============================================================================

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261015020000): falla si la función viva cambió, y es re-ejecutable.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Lo que queda por recibir de una orden (interna: la usan la lectura y la recepción) ----------
-- Una fila por línea que se puede recibir: las líneas pedidas (`tipo = 'orden'`) y lo que sus papeles vigentes trajeron fuera de la orden
-- (`tipo = 'papel'`). `queda` nunca es negativo. `costo` es el sugerido para el lote.
create or replace function retail.fn_orden_insumo_por_recibir_lineas(p_orden_id uuid)
returns table (
  tipo text, item_id uuid, posicion integer, insumo_id uuid, insumo text, codigo text, unidad text, documento text,
  pedido numeric, facturado numeric, recibido numeric, queda numeric, costo numeric
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select 'orden'::text, i.id, i.posicion, i.insumo_id, n.nombre, n.codigo, i.unidad_medida, null::text,
         i.cantidad, f.cantidad, r.cantidad, greatest(greatest(i.cantidad, f.cantidad) - r.cantidad, 0),
         -- El del papel si la línea tiene UNO vigente (el costo real, sin IGV); si no, el neto de la orden (precio menos su descuento).
         coalesce(f.costo_unico, round(i.subtotal / i.cantidad, 4))
    from retail.orden_insumo_items i
    join retail.insumos n on n.id = i.insumo_id
    cross join lateral (
      select coalesce(sum(x.cantidad), 0) as cantidad,
             case when count(*) = 1 then min(x.costo_unitario) end as costo_unico
        from retail.comprobantes_produccion_items x
        join retail.comprobantes_produccion y on y.id = x.comprobante_id and y.estado = 'vigente'
       where x.orden_insumo_item_id = i.id
    ) f
    cross join lateral (
      select coalesce(sum(l.cantidad_ingresada), 0) as cantidad from retail.insumo_lotes l where l.orden_insumo_item_id = i.id
    ) r
   where i.orden_insumo_id = p_orden_id
  union all
  select 'papel'::text, x.id, null::integer, x.insumo_id, n.nombre, n.codigo, n.unidad_medida, y.serie || '-' || y.numero,
         null::numeric, x.cantidad, r.cantidad, greatest(x.cantidad - r.cantidad, 0), x.costo_unitario
    from retail.comprobantes_produccion_items x
    join retail.comprobantes_produccion y on y.id = x.comprobante_id and y.estado = 'vigente'
    join retail.insumos n on n.id = x.insumo_id
    cross join lateral (
      select coalesce(sum(l.cantidad_ingresada), 0) as cantidad from retail.insumo_lotes l where l.comprobante_item_id = x.id
    ) r
   where y.orden_insumo_id = p_orden_id and x.orden_insumo_item_id is null and x.insumo_id is not null;
$$;

-- ---------- 2. Lo que se puede recibir en un taller (la web) ----------
create or replace function retail.fn_ordenes_insumo_por_recibir(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  -- Recibir en el Taller es de Producción ▸ Recibir: su módulo y poder operar en ese taller.
  if retail.fn_ve_modulo('produccion') is not true then
    raise exception 'Recibir insumos necesita el módulo de Producción en tu rol' using errcode = '42501', hint = 'recibir_insumos_sin_modulo';
  end if;
  if p_ubicacion_id is null or not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No puedes recibir insumos en esa ubicación' using errcode = '42501', hint = 'recibir_otro_taller';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.id,
             'numero', o.numero,
             'documento', retail.fn_orden_insumo_numero_texto(o.numero),
             'proveedor', pr.nombre,
             'creada_en', o.creada_en,
             'creada_por_id', o.creada_por,
             'creada_por', nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
             'fecha_entrega_estimada', o.fecha_entrega_estimada,
             'lineas', (select jsonb_agg(jsonb_build_object(
                                 'tipo', l.tipo, 'item_id', l.item_id, 'posicion', l.posicion, 'insumo_id', l.insumo_id, 'insumo', l.insumo,
                                 'codigo', l.codigo, 'unidad', l.unidad, 'documento', l.documento, 'pedido', l.pedido, 'facturado', l.facturado,
                                 'recibido', l.recibido, 'queda', l.queda, 'costo', l.costo)
                               order by (l.tipo = 'papel'), l.posicion nulls last, l.insumo)
                          from retail.fn_orden_insumo_por_recibir_lineas(o.id) l)
           ) order by coalesce(o.fecha_entrega_estimada, o.fecha_emision), o.numero)
      from retail.ordenes_insumo o
      join retail.proveedores_produccion pr on pr.id = o.proveedor_id
      left join public.personas pe on pe.id = o.creada_por
     where o.estado = 'generada'
       and o.ubicacion_destino_id = p_ubicacion_id
       and exists (select 1 from retail.fn_orden_insumo_por_recibir_lineas(o.id) l where l.queda > 0)
  ), '[]'::jsonb);
end;
$$;

-- ---------- 3. Lo que responde una recepción (interna) ----------
create or replace function retail.fn_orden_insumo_recepcion_resultado(p_recepcion_id uuid, p_repetido boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
           'recepcion_id', r.id,
           'orden_id', r.orden_insumo_id,
           'documento', retail.fn_orden_insumo_numero_texto(o.numero),
           'lotes', (select count(*) from retail.insumo_lotes l where l.orden_insumo_recepcion_id = r.id),
           'queda', exists (select 1 from retail.fn_orden_insumo_por_recibir_lineas(o.id) x where x.queda > 0),
           'repetido', p_repetido)
    from retail.orden_insumo_recepciones r
    join retail.ordenes_insumo o on o.id = r.orden_insumo_id
   where r.id = p_recepcion_id;
$$;

-- ---------- 4. Recibir en el Taller contra la orden (la web) ----------
create or replace function retail.recibir_orden_insumo(
  p_orden_id uuid,
  p_ubicacion_id uuid,
  p_lineas jsonb,
  p_nota text default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_orden retail.ordenes_insumo;
  v_existente record;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_linea jsonb;
  v_pos integer := 0;
  v_tipo text;
  v_item uuid;
  v_cant numeric;
  v_costo numeric;
  v_fila record;
  v_es_de_la_orden boolean;
  v_vistos uuid[] := '{}';
  v_lineas jsonb := '[]'::jsonb;
  v_documento text;
  v_codigo text;
  v_n integer;
  v_recepcion uuid;
  v_lote uuid;
  v_restriccion text;
begin
  if retail.fn_ve_modulo('produccion') is not true then
    raise exception 'Recibir insumos necesita el módulo de Producción en tu rol' using errcode = '42501', hint = 'recibir_insumos_sin_modulo';
  end if;
  if p_ubicacion_id is null or not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'taller' and u.activo) then
    raise exception 'Los insumos se reciben en el Taller' using hint = 'recibir_otro_taller';
  end if;
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No puedes recibir insumos en esa ubicación' using errcode = '42501', hint = 'recibir_otro_taller';
  end if;

  -- La orden se bloquea: dos recepciones a la vez (o una recepción y un papel, o una edición) se ponen en fila y la segunda ve lo que dejó
  -- la primera.
  if p_orden_id is not null then
    select o.* into v_orden from retail.ordenes_insumo o where o.id = p_orden_id for update;
  end if;
  if v_orden.id is null then
    raise exception 'Esa orden de insumos no existe' using hint = 'orden_insumo_no_existe';
  end if;

  -- El token sigue al contenido: el mismo token con otras cantidades se rechaza (`token_reusado`); el mismo envío (doble clic, reintento
  -- sin red) devuelve la recepción que ya se guardó.
  perform retail.fn_intento_con_huella('recibir_orden_insumo', p_token, md5(jsonb_build_object(
    'orden', p_orden_id, 'ubicacion', p_ubicacion_id, 'lineas', p_lineas, 'nota', p_nota)::text));
  if p_token is not null then
    for v_existente in select r.id, r.orden_insumo_id from retail.orden_insumo_recepciones r where r.token_cliente = p_token loop
      if v_existente.orden_insumo_id = v_orden.id then
        return retail.fn_orden_insumo_recepcion_resultado(v_existente.id, true);
      end if;
      raise exception 'Ese envío ya se guardó con otros datos: recarga la pantalla' using hint = 'recibir_orden_insumo_otro_envio';
    end loop;
  end if;

  if v_orden.estado <> 'generada' then
    raise exception 'Esta orden está anulada: ya no se recibe' using hint = 'orden_insumo_anulada';
  end if;
  if v_orden.ubicacion_destino_id <> p_ubicacion_id then
    raise exception 'Esta orden llega a otro taller: la recibe ese taller' using errcode = '42501', hint = 'recibir_otro_taller';
  end if;
  -- Quién recibe: firma el responsable, como la recepción de siempre. Quien hizo la orden no la recibe (decisión 17, ni el líder).
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if v_orden.creada_por = v_actor then
    raise exception 'Hiciste esta orden: la tiene que recibir otra persona del Taller' using errcode = '42501', hint = 'recibir_quien_compro';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'recibir_orden_insumo_nota';
  end if;

  -- Las líneas: se validan TODAS antes de escribir nada.
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Escribe cuánto llegó de al menos un insumo' using hint = 'recibir_orden_insumo_sin_lineas';
  end if;
  if jsonb_array_length(p_lineas) > 200 then
    raise exception 'Una recepción lleva hasta 200 líneas' using hint = 'recibir_orden_insumo_sin_lineas';
  end if;
  for v_linea in select e.value from jsonb_array_elements(p_lineas) e loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_linea) <> 'object' then
      raise exception 'La línea % no se entiende', v_pos using hint = 'recibir_orden_insumo_linea';
    end if;
    begin
      v_item := coalesce(nullif(btrim(v_linea ->> 'orden_insumo_item_id'), ''), nullif(btrim(v_linea ->> 'comprobante_item_id'), ''))::uuid;
      v_tipo := case when nullif(btrim(v_linea ->> 'orden_insumo_item_id'), '') is not null then 'orden' else 'papel' end;
      v_cant := nullif(btrim(v_linea ->> 'cantidad'), '')::numeric;
      v_costo := nullif(btrim(v_linea ->> 'costo_unitario'), '')::numeric;
    exception when others then
      raise exception 'La línea % tiene un número o un dato que no se entiende', v_pos using hint = 'recibir_orden_insumo_linea';
    end;
    if nullif(btrim(v_linea ->> 'orden_insumo_item_id'), '') is not null and nullif(btrim(v_linea ->> 'comprobante_item_id'), '') is not null then
      raise exception 'La línea % nombra una línea de la orden y una del papel: elige una', v_pos using hint = 'recibir_orden_insumo_linea';
    end if;
    -- La línea tiene que ser de ESTA orden (pedida, o traída fuera de la orden por uno de sus papeles vigentes).
    v_es_de_la_orden := false;
    for v_fila in select l.* from retail.fn_orden_insumo_por_recibir_lineas(v_orden.id) l where l.tipo = v_tipo and l.item_id = v_item loop
      v_es_de_la_orden := true;
      exit;
    end loop;
    if v_item is null or not v_es_de_la_orden then
      raise exception 'La línea % no es de esta orden: recarga la pantalla', v_pos using hint = 'recibir_orden_insumo_linea_ajena';
    end if;
    if v_item = any (v_vistos) then
      raise exception 'Una línea aparece dos veces en la misma recepción' using hint = 'recibir_orden_insumo_linea';
    end if;
    v_vistos := v_vistos || v_item;
    -- `NaN` no cumple ninguna de las comparaciones de abajo: también se rechaza.
    if v_cant is null or not (v_cant > 0 and v_cant <= 99999.999) or v_cant <> round(v_cant, 3) then
      raise exception 'Lo que llegó de la línea % va de 0.001 a 99 999.999, con hasta tres decimales', v_pos
        using hint = 'recibir_orden_insumo_cantidad';
    end if;
    if v_cant > v_fila.queda then
      raise exception 'De %, solo quedan % por recibir y escribiste %', v_fila.insumo, trim_scale(v_fila.queda), trim_scale(v_cant)
        using hint = 'recibir_orden_insumo_de_mas';
    end if;
    -- El costo del lote (decisión 53): el que escribe quien recibe, o el sugerido. Sin IGV, con hasta cuatro decimales.
    v_costo := coalesce(v_costo, v_fila.costo);
    if v_costo is null or not (v_costo >= 0 and v_costo <= 99999.9999) or v_costo <> round(v_costo, 4) then
      raise exception 'El costo de la línea % va de S/ 0 a S/ 99 999.9999, con hasta cuatro decimales', v_pos
        using hint = 'recibir_orden_insumo_costo';
    end if;
    v_lineas := v_lineas || jsonb_build_object(
      'tipo', v_tipo, 'item_id', v_item, 'insumo_id', v_fila.insumo_id, 'cantidad', v_cant, 'costo', v_costo,
      'codigo', nullif(btrim(coalesce(v_linea ->> 'codigo_lote', '')), ''));
  end loop;

  -- Todo bien: se escribe. Una carrera con el mismo token termina en la única recepción y se responde igual que arriba.
  begin
    insert into retail.orden_insumo_recepciones (orden_insumo_id, ubicacion_id, nota, usuario_id, token_cliente)
    values (v_orden.id, p_ubicacion_id, v_nota, v_actor, p_token)
    returning id into v_recepcion;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'orden_insumo_recepciones_token_cliente_key' then
      for v_existente in select r.id, r.orden_insumo_id from retail.orden_insumo_recepciones r where r.token_cliente = p_token loop
        if v_existente.orden_insumo_id = v_orden.id then
          return retail.fn_orden_insumo_recepcion_resultado(v_existente.id, true);
        end if;
      end loop;
      raise exception 'Ese envío ya se guardó con otros datos: recarga la pantalla' using hint = 'recibir_orden_insumo_otro_envio';
    end if;
    raise;
  end;

  -- Un lote por línea con su movimiento de compra, en la misma transacción. El código del lote: el que se escribió (único por insumo) o el
  -- número de la orden, con «/2», «/3»… si ese insumo ya abrió lote con él.
  v_documento := retail.fn_orden_insumo_numero_texto(v_orden.numero);
  for v_linea in select e.value from jsonb_array_elements(v_lineas) e loop
    v_codigo := v_linea ->> 'codigo';
    if v_codigo is not null and exists (select 1 from retail.insumo_lotes l where l.insumo_id = (v_linea ->> 'insumo_id')::uuid and l.codigo_lote = v_codigo) then
      raise exception 'Ya hay un lote de ese insumo con el código «%»: usa otro o déjalo en blanco', v_codigo using hint = 'recibir_orden_insumo_codigo';
    end if;
    if v_codigo is null then
      v_n := (select count(*) from retail.insumo_lotes l
               where l.insumo_id = (v_linea ->> 'insumo_id')::uuid and (l.codigo_lote = v_documento or l.codigo_lote like v_documento || '/%'));
      v_codigo := case when v_n = 0 then v_documento else v_documento || '/' || (v_n + 1) end;
    end if;
    insert into retail.insumo_lotes (insumo_id, ubicacion_id, codigo_lote, proveedor_id, cantidad_ingresada, costo_unitario, documento,
                                     fecha_ingreso, origen, nota, comprobante_item_id, orden_insumo_item_id, orden_insumo_recepcion_id)
    values ((v_linea ->> 'insumo_id')::uuid, p_ubicacion_id, v_codigo, v_orden.proveedor_id, (v_linea ->> 'cantidad')::numeric,
            (v_linea ->> 'costo')::numeric, v_documento, v_hoy, 'compra', v_nota,
            case when v_linea ->> 'tipo' = 'papel' then (v_linea ->> 'item_id')::uuid end,
            case when v_linea ->> 'tipo' = 'orden' then (v_linea ->> 'item_id')::uuid end,
            v_recepcion)
    returning id into v_lote;
    insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id, nota)
    values ((v_linea ->> 'insumo_id')::uuid, v_lote, p_ubicacion_id, 'compra', (v_linea ->> 'cantidad')::numeric, (v_linea ->> 'costo')::numeric,
            v_actor, 'Recepción de ' || v_documento);
  end loop;

  -- Actividad (ADR-0207), sin montos como el resto de la orden. Si falla, la recepción igual queda guardada.
  begin
    perform retail.fn_actividad_anotar(
      'ordenes_insumos', 'orden_insumo_recibir',
      'recibió en el Taller ' || jsonb_array_length(v_lineas) || case when jsonb_array_length(v_lineas) = 1 then ' insumo' else ' insumos' end
        || ' de la ' || v_documento || ' (' || (select pr.nombre from retail.proveedores_produccion pr where pr.id = v_orden.proveedor_id) || ')',
      v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_orden_insumo_sede_actividad(v_actor), p_ubicacion_id,
      'ordenes_insumo', v_orden.id::text, now(),
      jsonb_build_object('orden_id', v_orden.id, 'numero', v_orden.numero, 'recepcion_id', v_recepcion, 'lineas', jsonb_array_length(v_lineas)),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la recepción de la orden de insumos % (%)', v_orden.numero, sqlerrm;
  end;

  return retail.fn_orden_insumo_recepcion_resultado(v_recepcion, false);
end;
$$;

-- ---------- 5. Con algo recibido, la orden ya no se edita ni se anula ----------
select pg_temp.reemplazar(
  'retail.editar_orden_insumo(uuid, integer, uuid, uuid, date, text, jsonb)',
  $v$      using hint = 'orden_insumo_con_comprobante';
  end if;
$v$,
  $n$      using hint = 'orden_insumo_con_comprobante';
  end if;
  -- Con algo recibido tampoco (ADR-0362, fase 7 parte 2, actividad 3): los lotes apuntan a sus líneas, que editar borraría.
  if exists (select 1 from retail.orden_insumo_recepciones r where r.orden_insumo_id = p_id) then
    raise exception 'Esta orden ya tiene insumos recibidos en el Taller: ya no se edita. Si hay que pedir otra cosa, crea otra orden'
      using hint = 'orden_insumo_con_recepcion';
  end if;
$n$,
  1);

select pg_temp.reemplazar(
  'retail.anular_orden_insumo(uuid, integer, text)',
  $v$      using hint = 'orden_insumo_con_comprobante';
  end if;
$v$,
  $n$      using hint = 'orden_insumo_con_comprobante';
  end if;
  -- Lo recibido ya es stock del Taller (ADR-0362, fase 7 parte 2, actividad 3): la orden que lo trajo no se anula.
  if exists (select 1 from retail.orden_insumo_recepciones r where r.orden_insumo_id = p_id) then
    raise exception 'Esta orden ya tiene insumos recibidos en el Taller: no se anula'
      using hint = 'orden_insumo_con_recepcion';
  end if;
$n$,
  1);

-- ---------- 6. El detalle de la orden: lo recibido de cada línea ----------
-- Se ancla DESPUÉS de lo que agregó 20261015020000 (la clave «versiones», al final del detalle): así el reemplazo de esa migración sigue
-- entero y las dos se pueden volver a pegar en cualquier orden.
select pg_temp.reemplazar(
  'retail.fn_orden_insumo(uuid)',
  $v$     where v.orden_insumo_id = p_orden_id
  ), '[]'::jsonb));$v$,
  $n$     where v.orden_insumo_id = p_orden_id
  ), '[]'::jsonb))
  -- Lo que ya entró al Taller de cada línea (ADR-0362, fase 7 parte 2, actividad 3).
  || jsonb_build_object('recepcion', coalesce((
    select jsonb_agg(jsonb_build_object(
             'posicion', i.posicion, 'item_id', i.id,
             'recibido', (select coalesce(sum(l.cantidad_ingresada), 0) from retail.insumo_lotes l where l.orden_insumo_item_id = i.id)
           ) order by i.posicion)
      from retail.orden_insumo_items i
     where i.orden_insumo_id = p_orden_id
  ), '[]'::jsonb));$n$,
  1);

-- ---------- 7. Permisos ----------
revoke all on function retail.fn_orden_insumo_por_recibir_lineas(uuid) from public, anon, authenticated;
grant execute on function retail.fn_orden_insumo_por_recibir_lineas(uuid) to service_role;
revoke all on function retail.fn_orden_insumo_recepcion_resultado(uuid, boolean) from public, anon, authenticated;
grant execute on function retail.fn_orden_insumo_recepcion_resultado(uuid, boolean) to service_role;
revoke all on function retail.fn_ordenes_insumo_por_recibir(uuid) from public, anon;
grant execute on function retail.fn_ordenes_insumo_por_recibir(uuid) to authenticated, service_role;
revoke all on function retail.recibir_orden_insumo(uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function retail.recibir_orden_insumo(uuid, uuid, jsonb, text, uuid) to authenticated, service_role;

reset lock_timeout;

-- ---------- Comprobación: si algo no quedó, el pegado falla y no se aplica nada ----------
do $$
begin
  if to_regprocedure('retail.recibir_orden_insumo(uuid, uuid, jsonb, text, uuid)') is null
     or to_regprocedure('retail.fn_ordenes_insumo_por_recibir(uuid)') is null then
    raise exception 'falta recibir contra la orden de insumos';
  end if;
  if position('orden_insumo_con_recepcion' in pg_get_functiondef('retail.editar_orden_insumo(uuid, integer, uuid, uuid, date, text, jsonb)'::regprocedure)) = 0
     or position('orden_insumo_con_recepcion' in pg_get_functiondef('retail.anular_orden_insumo(uuid, integer, text)'::regprocedure)) = 0 then
    raise exception 'falta el candado de la orden con insumos recibidos';
  end if;
  if position('''recepcion''' in pg_get_functiondef('retail.fn_orden_insumo(uuid)'::regprocedure)) = 0 then
    raise exception 'falta lo recibido en el detalle de la orden';
  end if;
end;
$$;

-- ============================================================================
-- 20261014180000_traslado_sobrantes_parte2_funciones.sql — CAYLA V2 (ADR-0404, Felipe 2026-10-14)
--
-- EL PROBLEMA PRIMERO. Ver la parte 1 (`20261014175000`): lo contado de más al recibir un traslado entraba entero al stock
-- del destino al cerrar con diferencia, sin salir de ninguna sede, y se podía vender antes de saber de dónde vino.
--
-- LA DECISIÓN (Felipe, 2026-10-14): lo de más es un SOBRANTE A REVISAR, fuera del stock hasta que un líder decide.
--   1. `cerrar_traslado_con_diferencia`: de cada prenda entra al stock hasta lo ENVIADO; lo contado de más queda en
--      `traslado_sobrantes` (por revisar). Una prenda que no venía en la caja entra entera como sobrante.
--   2. `resolver_sobrante_traslado(sobrante, decisión, nota)`, con el mismo permiso que cerrar con la diferencia (un líder,
--      o quien tiene Existencias, Conteos o Traslados: `fn_puede_ajustar_inventario`) y en la sede que recibió:
--        · salio_del_origen — sale del stock del origen (donde la tenga libre, primero su lugar de envío) y entra al destino,
--          las dos como movimientos del traslado (`traslado_salida` / `traslado_entrada`), así Pérdidas y Movimientos la
--          leen como parte del viaje. Si el origen no la tiene libre en el sistema, se rechaza y lo dice.
--        · encontrada — entra al almacén del destino como «Encontré prendas», por `registrar_movimiento` (sus reglas: solo suma y
--          pide nota; la única puerta de ese motivo), con la nota.
--        · error_de_conteo — no entra nada.
--      Pedir dos veces lo mismo devuelve lo mismo (`ya_registrado`); pedir otra cosa sobre uno ya revisado se rechaza.
--   3. `fn_sobrantes_de_traslado(traslado)` y `fn_sobrantes_por_revisar(sede)`: lo que lee el pase y la lista de Traslados.
--   4. `fn_perdidas_de_traslados`: lo enviado cuenta también la salida de un sobrante que «salió del origen» sin estar en
--      la caja (va enlazada a la línea recibida). Sin esto, Pérdidas diría «apareció» en el destino sin la pérdida del origen.
--
-- CONTRATO (Liskov)
--   PROMETE: después de cerrar, lo que entró al stock por el traslado nunca pasa de lo enviado (INV-08); cada sobrante revisado
--            tiene los movimientos de su decisión (lo exige el candado de la parte 1). `cerrar_traslado_con_diferencia`
--            mantiene su firma y lo que devuelve (líneas y unidades que ENTRARON). Lo que falta (de menos) sigue igual.
--   ASUME:   la parte 1; `cerrar_traslado_con_diferencia` y `fn_perdidas_de_traslados` vivos a la fecha (md5 del cuerpo
--            verificado igual en local y en producción el 2026-10-14; si cambió, se detiene sin tocar nada).
--   NO HACE: no toca `confirmar_traslado` (ya dejaba lo de más esperando al líder, D-129) ni lo ya cerrado: en producción no
--            hay ningún traslado con prendas de más (2026-10-14).
--
-- CÓMO SE PEGA. Una sola parte, DESPUÉS de `20261014175000`. Solo funciones: sin políticas, sin `drop trigger`, sin `alter`
-- de tablas en uso. Idempotente (el candado de md5 acepta el cuerpo viejo y el nuevo). Sin `select … into` dentro de un texto
-- entre comillas.
-- ============================================================================
set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. El cierre con diferencia: entra hasta lo enviado; lo de más, como sobrante a revisar.
-- ----------------------------------------------------------------------------
do $guarda$
declare
  v_md5 text := md5((select prosrc from pg_proc where oid = 'retail.cerrar_traslado_con_diferencia(uuid,text)'::regprocedure));
begin
  if v_md5 not in ('96c5a2134b9a549201c2f92f0822d7e7', '111d4c2892e4eb675145cd3fa65b14cb') then
    raise exception 'retail.cerrar_traslado_con_diferencia cambió desde que se escribió esta migración (md5 %): regenera el reemplazo desde su definición real.', v_md5;
  end if;
end;
$guarda$;

create or replace function retail.cerrar_traslado_con_diferencia(p_transferencia_id uuid, p_nota text default null)
returns table(lineas_recibidas integer, unidades_recibidas integer)
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  t transferencias%rowtype; v_persona uuid; r record; v_mov_id uuid; v_sub_destino uuid;
  v_lineas integer := 0; v_unidades integer := 0; v_entra integer; v_sobra integer;
begin
  select * into t from transferencias where id = p_transferencia_id;
  if not found then raise exception 'El traslado % no existe', p_transferencia_id; end if;
  if not fn_puede_ajustar_inventario() then
    raise exception 'Solo un líder puede cerrar un traslado con diferencias — es la aprobación de lo recibido';
  end if;
  if not fn_puede_operar_ubicacion(t.ubicacion_destino_id) then
    raise exception 'No tienes permiso para cerrar traslados en esa ubicación';
  end if;
  -- ADR-0190: stock primero, traslado después.
  perform fn_bloquear_en_orden(t.ubicacion_destino_id,
    array(select variante_id from transferencia_recepciones where transferencia_id = p_transferencia_id and movimiento_id is null));
  select * into t from transferencias where id = p_transferencia_id for update;
  if t.estado <> 'recibido_con_diferencia' then
    raise exception 'Este traslado no está pendiente de revisión (está %)', t.estado;
  end if;

  v_persona := retail.fn_actor_persona_id(true);
  v_persona := retail.fn_firma_de_recepcion(p_transferencia_id, v_persona); -- ADR-0328 (firma-heredada)
  -- D-131: donde entró el resto de la caja. Un traslado confirmado antes de esta migración no la tiene: la de siempre.
  v_sub_destino := coalesce(t.sububicacion_destino_id, fn_sububicacion_por_defecto(t.ubicacion_destino_id, 'traslado_entrada'));
  -- ADR-0404: de cada prenda entra hasta lo ENVIADO. Lo contado de más (o una prenda que no venía en la caja) no entra:
  -- queda como sobrante a revisar, fuera del stock, hasta que un líder decida qué pasó (`resolver_sobrante_traslado`).
  for r in select tr.*, coalesce(ti.cantidad, 0) as enviado
             from transferencia_recepciones tr
             left join transferencia_items ti on ti.transferencia_id = tr.transferencia_id and ti.variante_id = tr.variante_id
            where tr.transferencia_id = p_transferencia_id and tr.movimiento_id is null
            order by tr.variante_id loop
    v_entra := least(r.cantidad_recibida, r.enviado);
    v_sobra := r.cantidad_recibida - v_entra;
    if v_entra > 0 then
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, transferencia_recepcion_id, usuario_id)
        values (r.variante_id, t.ubicacion_destino_id, v_sub_destino,
                'entrada', v_entra, 'traslado_entrada', r.id, v_persona)
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      update transferencia_recepciones set movimiento_id = v_mov_id where id = r.id;
      perform fn_apartar_pedidos_que_llegaron(p_transferencia_id, r.variante_id, v_sub_destino, v_entra);
      v_lineas := v_lineas + 1; v_unidades := v_unidades + v_entra;
    end if;
    if v_sobra > 0 then
      insert into traslado_sobrantes (transferencia_id, transferencia_recepcion_id, variante_id, ubicacion_id, ubicacion_origen_id,
                                      cantidad, creado_por)
        values (p_transferencia_id, r.id, r.variante_id, t.ubicacion_destino_id, t.ubicacion_origen_id, v_sobra, v_persona)
        on conflict (transferencia_id, variante_id) do nothing;
    end if;
  end loop;

  update transferencias set estado = 'cerrada', cerrado_por = v_persona, cerrado_en = now(), nota_cierre = p_nota,
      sububicacion_destino_id = coalesce(sububicacion_destino_id, v_sub_destino)
    where id = p_transferencia_id;
  return query select v_lineas, v_unidades;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 2a. «Salió del origen»: los dos movimientos del viaje (interna; la llama solo `resolver_sobrante_traslado`, que ya validó y tomó los
--     candados). Van enlazados al traslado: la salida a su línea del envío (o, si la prenda no venía en la caja, a la línea contada) y
--     la entrada a la línea contada; así Movimientos y Pérdidas la leen como parte del mismo viaje. Aparte de la revisión a propósito:
--     ninguna función que escriba «Encontré prendas» puede tener su propio `insert into movimientos` (`pruebas:cierre-carga-inicial`).
-- ----------------------------------------------------------------------------
create or replace function retail.fn_sobrante_viaja(p_sobrante_id uuid, p_item_id uuid, p_sub_origen uuid, p_sub_destino uuid,
                                                    p_persona uuid, p_nota_salida text, p_nota_entrada text)
returns uuid[]
language plpgsql
set search_path = retail, public, extensions
as $function$
declare
  s traslado_sobrantes%rowtype;
  v_salida uuid;
  v_entrada uuid;
begin
  s := (select x from traslado_sobrantes x where x.id = p_sobrante_id);
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo,
                           transferencia_item_id, transferencia_recepcion_id, usuario_id, nota)
    values (s.variante_id, s.ubicacion_origen_id, p_sub_origen, 'salida', s.cantidad, 'traslado_salida',
            p_item_id, case when p_item_id is null then s.transferencia_recepcion_id end, p_persona, p_nota_salida)
    returning id into v_salida;
  perform fn_aplicar_movimiento(v_salida);
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, transferencia_recepcion_id, usuario_id, nota)
    values (s.variante_id, s.ubicacion_id, p_sub_destino, 'entrada', s.cantidad, 'traslado_entrada',
            s.transferencia_recepcion_id, p_persona, p_nota_entrada)
    returning id into v_entrada;
  perform fn_aplicar_movimiento(v_entrada);
  return array[v_salida, v_entrada];
end;
$function$;

revoke all on function retail.fn_sobrante_viaja(uuid, uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. La revisión de un sobrante (quien puede cerrar la diferencia, en la sede que recibió).
-- ----------------------------------------------------------------------------
create or replace function retail.resolver_sobrante_traslado(p_sobrante_id uuid, p_decision text, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  s traslado_sobrantes%rowtype;
  t transferencias%rowtype;
  v_nota text := nullif(btrim(p_nota), '');
  v_persona uuid;
  v_item uuid;
  v_sub_origen uuid;
  v_sub_destino uuid;
  v_salida uuid;
  v_entrada uuid;
  v_origen text;
  v_texto text;
  v_movs uuid[];
begin
  if p_decision is null or p_decision not in ('salio_del_origen', 'encontrada', 'error_de_conteo') then
    raise exception 'Elige qué pasó con la prenda de más.' using errcode = 'P0001', hint = 'sobrante_decision_invalida';
  end if;
  if v_nota is null or length(v_nota) < 5 then
    raise exception 'Escribe qué pasó con la prenda de más (5 letras como mínimo).' using errcode = 'P0001', hint = 'sobrante_sin_nota';
  end if;
  if length(v_nota) > 200 then
    raise exception 'La nota admite hasta 200 caracteres.' using errcode = 'P0001', hint = 'sobrante_nota_larga';
  end if;

  s := (select x from traslado_sobrantes x where x.id = p_sobrante_id);
  if s.id is null then
    raise exception 'Esa prenda de más no existe.' using errcode = 'P0001', hint = 'sobrante_no_existe';
  end if;
  if not fn_puede_ajustar_inventario() then
    -- El mismo permiso que cerrar con la diferencia: quien puede cerrarla revisa lo que sobró.
    raise exception 'Tu rol no puede revisar prendas de más: pídeselo a un líder de tu sede.' using errcode = '42501', hint = 'sobrante_sin_permiso';
  end if;
  if not fn_puede_operar_ubicacion(s.ubicacion_id) then
    raise exception 'Esa prenda de más es de otra sede.' using errcode = '42501', hint = 'sobrante_de_otra_sede';
  end if;

  -- ADR-0190: stock primero (las dos sedes, en orden de id: una sola prenda), la fila del sobrante después.
  if s.ubicacion_origen_id < s.ubicacion_id then
    perform fn_bloquear_en_orden(s.ubicacion_origen_id, array[s.variante_id]);
    perform fn_bloquear_en_orden(s.ubicacion_id, array[s.variante_id]);
  else
    perform fn_bloquear_en_orden(s.ubicacion_id, array[s.variante_id]);
    perform fn_bloquear_en_orden(s.ubicacion_origen_id, array[s.variante_id]);
  end if;
  perform 1 from traslado_sobrantes where id = p_sobrante_id for update;
  s := (select x from traslado_sobrantes x where x.id = p_sobrante_id);

  -- Doble clic o reintento: lo mismo devuelve lo mismo; otra decisión sobre uno ya revisado se rechaza.
  if s.estado <> 'por_revisar' then
    if s.estado = p_decision then
      return jsonb_build_object('sobrante_id', s.id, 'estado', s.estado, 'cantidad', s.cantidad,
        'movimiento_salida_id', s.movimiento_salida_id, 'movimiento_entrada_id', s.movimiento_entrada_id, 'ya_registrado', true);
    end if;
    v_texto := case s.estado when 'salio_del_origen' then 'salió de la sede que envió'
                             when 'encontrada' then 'entró como prenda encontrada'
                             else 'fue un error al contar' end;
    raise exception 'Esa prenda de más ya se revisó: %.', v_texto using errcode = 'P0001', hint = 'sobrante_ya_revisado';
  end if;

  t := (select x from transferencias x where x.id = s.transferencia_id);
  v_persona := retail.fn_actor_persona_id(true);
  v_sub_destino := coalesce(t.sububicacion_destino_id, fn_sububicacion_por_defecto(t.ubicacion_destino_id, 'traslado_entrada'));

  if p_decision = 'salio_del_origen' then
    v_origen := (select u.nombre from ubicaciones u where u.id = s.ubicacion_origen_id);
    v_item := (select ti.id from transferencia_items ti where ti.transferencia_id = s.transferencia_id and ti.variante_id = s.variante_id);
    -- Sale de donde el origen la tenga libre: primero su lugar de envío, después cualquiera menos la cuarentena.
    v_sub_origen := (
      select st.sububicacion_id
        from stock st join sububicaciones sb on sb.id = st.sububicacion_id
       where st.ubicacion_id = s.ubicacion_origen_id and st.variante_id = s.variante_id
         and sb.tipo <> 'cuarentena'
         and st.cantidad - coalesce(st.cantidad_apartada, 0) >= s.cantidad
       order by (st.sububicacion_id = fn_sububicacion_por_defecto(s.ubicacion_origen_id, 'traslado_salida')) desc, st.cantidad desc
       limit 1);
    if v_sub_origen is null then
      raise exception '% no tiene esa prenda libre en el sistema para descontarla. Si no salió de allá, elige «No sé de dónde salió».', v_origen
        using errcode = 'P0001', hint = 'sobrante_origen_sin_stock';
    end if;
    v_movs := fn_sobrante_viaja(s.id, v_item, v_sub_origen, v_sub_destino, v_persona,
      'De más en el traslado ' || t.numero || ': salió sin anotarse. ' || v_nota,
      'De más en el traslado ' || t.numero || ': salió de ' || v_origen || '. ' || v_nota);
    v_salida := v_movs[1];
    v_entrada := v_movs[2];
  elsif p_decision = 'encontrada' then
    -- «Encontré prendas» entra SOLO por `registrar_movimiento` (lo vigila `pruebas:cierre-carga-inicial`): ahí viven sus reglas —va
    -- al almacén, solo suma, pide nota, y la prenda sin historia en la sede—. Por eso al almacén de la sede, no al piso donde quizá
    -- entró la caja. Si la sede no separa piso y almacén, donde entró el traslado.
    v_entrada := registrar_movimiento(s.variante_id, s.ubicacion_id, 'ajuste', s.cantidad, 'reposicion',
      'De más en el traslado ' || t.numero || ', sin saber de dónde salió. ' || v_nota,
      coalesce((select sb.id from sububicaciones sb where sb.ubicacion_id = s.ubicacion_id and sb.tipo = 'almacen_tienda' order by sb.id limit 1),
               v_sub_destino));
  end if;

  update traslado_sobrantes
     set estado = p_decision, revisado_en = now(), revisado_por = v_persona, nota_revision = v_nota,
         movimiento_salida_id = v_salida, movimiento_entrada_id = v_entrada
   where id = s.id;
  return jsonb_build_object('sobrante_id', s.id, 'estado', p_decision, 'cantidad', s.cantidad,
    'movimiento_salida_id', v_salida, 'movimiento_entrada_id', v_entrada, 'ya_registrado', false);
end;
$function$;

comment on function retail.resolver_sobrante_traslado(uuid, text, text) is
  'Un líder decide qué pasó con una prenda de más (ADR-0404): salio_del_origen (sale del origen y entra), encontrada (entra como encontrada) o error_de_conteo (no entra).';
revoke all on function retail.resolver_sobrante_traslado(uuid, text, text) from public, anon;
grant execute on function retail.resolver_sobrante_traslado(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Las lecturas: los sobrantes de un traslado (el pase) y los de una sede que esperan revisión (la lista).
-- ----------------------------------------------------------------------------
create or replace function retail.fn_sobrantes_de_traslado(p_transferencia_id uuid)
returns table(id uuid, variante_id uuid, cantidad integer, estado text, creado_en timestamptz,
              revisado_en timestamptz, revisado_por uuid, nota_revision text)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $function$
declare
  t transferencias%rowtype;
begin
  t := (select x from transferencias x where x.id = p_transferencia_id);
  if t.id is null then
    return;
  end if;
  if not (fn_puede_operar_ubicacion(t.ubicacion_destino_id) or fn_puede_operar_ubicacion(t.ubicacion_origen_id)) then
    raise exception 'No tienes permiso para ver ese traslado.' using errcode = '42501', hint = 'traslado_de_otra_sede';
  end if;
  return query
    select s.id, s.variante_id, s.cantidad, s.estado, s.creado_en, s.revisado_en, s.revisado_por, s.nota_revision
      from traslado_sobrantes s
     where s.transferencia_id = p_transferencia_id
     order by s.creado_en, s.variante_id;
end;
$function$;

revoke all on function retail.fn_sobrantes_de_traslado(uuid) from public, anon;
grant execute on function retail.fn_sobrantes_de_traslado(uuid) to authenticated;

-- `recibe`: la sede que mira es la que recibió (la que revisa). La que envió también los ve, para saber que algo suyo quedó en duda.
create or replace function retail.fn_sobrantes_por_revisar(p_ubicacion_id uuid)
returns table(transferencia_id uuid, unidades integer, recibe boolean)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $function$
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    return;
  end if;
  return query
    select s.transferencia_id, sum(s.cantidad)::integer, bool_or(s.ubicacion_id = p_ubicacion_id)
      from traslado_sobrantes s
     where s.estado = 'por_revisar' and p_ubicacion_id in (s.ubicacion_id, s.ubicacion_origen_id)
     group by s.transferencia_id;
end;
$function$;

revoke all on function retail.fn_sobrantes_por_revisar(uuid) from public, anon;
grant execute on function retail.fn_sobrantes_por_revisar(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Pérdidas: lo enviado cuenta también la salida de un sobrante que «salió del origen» sin estar en la caja.
-- ----------------------------------------------------------------------------
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones del texto viejo y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar(
  'retail.fn_perdidas_de_traslados(uuid, timestamp with time zone, timestamp with time zone)',
  $v$           coalesce((select sum(m.cantidad) from retail.movimientos m join retail.transferencia_items ti on ti.id = m.transferencia_item_id
                      where ti.transferencia_id = t.id and ti.variante_id = x.variante_id and m.tipo = 'salida'), 0)::integer as enviado,$v$,
  $v$           -- ADR-0404: también la salida de una prenda de más que «salió del origen» sin estar en la caja (enlazada a la línea contada).
           coalesce((select sum(m.cantidad) from retail.movimientos m
                       left join retail.transferencia_items ti on ti.id = m.transferencia_item_id
                       left join retail.transferencia_recepciones trs on trs.id = m.transferencia_recepcion_id
                      where coalesce(ti.transferencia_id, trs.transferencia_id) = t.id and m.variante_id = x.variante_id
                        and m.tipo = 'salida'), 0)::integer as enviado,$v$,
  1);

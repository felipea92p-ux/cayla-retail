-- ============================================================================
-- 20261004223100_bajar_en_mano_funcion.sql — CAYLA V2 · ADR-0328 actividad 9 «La tengo en la mano» · PARTE 2 de 2
-- Corregir el almacén y colgar la prenda en UN paso, desde Bajar al piso.
--
-- EL PROBLEMA PRIMERO. Bajar al piso tenía un callejón: la asesora escanea la prenda que tiene en la mano y el sistema
-- dice 0 en el almacén. El aviso le pedía «avisa al líder» y ella la colgaba igual, sin registrar (bajada-reglas.ts,
-- `sin_almacen`). La caja después no la deja vender (el sistema la cree guardada) y Frescura no sabe que está colgada.
-- Felipe (ADR-0328, «Prenda en la mano»): «si el sistema no la deja bajar, se corrige y se cuelga en un paso, visible en
-- Movimientos».
--
-- QUÉ HACE. `retail.bajar_en_mano(p_ubicacion_id, p_variante_id, p_nota, p_token)`, todo o nada:
--   1. la corrección: +1 en el ALMACÉN de esa tienda con `registrar_movimiento` (ajuste, motivo `reposicion`, que en
--      pantalla es «Encontré prendas»), con la nota automática «La tenía en la mano al bajarla» y, si la persona escribió
--      algo, « · » + lo suyo;
--   2. la bajada: `bajar_al_piso` con esa única prenda y 1 unidad, con la MISMA marca: la misma cabecera
--      (`bajadas_piso`), la misma línea (`bajada_piso_items`) y el mismo `mover_interno` almacén → piso que una bajada
--      escaneada. Frescura la cuenta como bajada real porque lo es;
--   3. la marca que las une (`bajadas_en_mano`, PARTE 1).
--   Se llama a las funciones de siempre, no se copian: permisos de ajuste, «Reposición no toca el piso», «un ajuste corrige
--   lo que ya estaba», el libro, Actividad y la firma siguen siendo los suyos.
--
-- CONTRATO.
--   PROMETE: o la prenda queda +1 en el piso de esa tienda con su bajada registrada (y, si hacía falta, su corrección del
--   almacén), o no se escribe nada y el error dice por qué (hint estable `en_mano_*`). La misma marca dos veces devuelve
--   lo ya guardado (`ya_registrada`) sin escribir otra vez, aunque quien la hizo ya marcó su salida. Devuelve
--   `{bajada_id, ya_registrada, corregida, ajuste_movimiento_id, movimiento_id, piso, almacen, registrada_en}` con lo
--   LIBRE del piso y del almacén después, para que la pantalla no tenga que releer toda la tienda.
--   ASUME: una prenda y 1 unidad por llamada (es la que está en la mano); la marca es una por toque; la tienda separa piso
--   y almacén; la prenda ya tiene historia en esa tienda (si nunca entró, no es una corrección: es un traslado o una carga).
--
-- LAS DECISIONES (DECIDÍ / DESCARTÉ / SE ROMPE SI):
--   · DECIDÍ corregir SOLO si, con el candado tomado, el almacén no tiene ninguna libre. Si otra persona recibió la prenda
--     mientras tanto, se baja sin corregir (`corregida = false`): no se inventa una unidad que el almacén ya contaba.
--     DESCARTÉ corregir siempre que la pantalla lo pida (la pantalla mira una foto vieja: dos personas sumarían dos veces).
--   · DECIDÍ rechazar cuando en el almacén solo hay prendas APARTADAS (`en_mano_apartada`): la que tiene en la mano puede ser
--     la de un cliente. DESCARTÉ corregir igual (colgaría la prenda reservada y el cliente no la encontraría).
--   · DECIDÍ un tope de 5 correcciones por prenda, tienda y día de Lima (`en_mano_tope_del_dia`): es para la prenda en la
--     mano, una a la vez; más de 5 de la misma talla y color en un día es una corrección grande y va por Ajustar stock, con
--     su motivo. DESCARTÉ un parámetro de cantidad (convertiría este botón en un Ajustar sin las preguntas de Ajustar).
--   · DECIDÍ que la base NO decida «ya estaba colgada»: si el sistema ya cuenta la prenda en el piso, la pantalla le pregunta
--     a la persona («¿Es una de esas?» → «Ya estaba colgada», que no escribe nada) porque solo ella sabe qué unidad tiene en
--     la mano. DESCARTÉ rechazar aquí todo piso ≥ 1: con 3 iguales en el fardo, la segunda quedaría otra vez sin salida.
--     SE ROMPE SI alguien elige «Es otra unidad» con la prenda que el sistema ya contaba colgada: suma una de más. Lo acotan
--     el tope del día y que la corrección queda en Movimientos con su nombre y la nota; el próximo conteo del piso la ve.
--   · DECIDÍ que la nota de la persona sea opcional y la automática obligatoria: frente al rack no se escribe; la nota
--     automática ya dice por qué existe la corrección.
--
-- ORDEN DE REVISIÓN (como `bajar_al_piso`): marca obligatoria → módulo Existencias → operar la tienda → forma (prenda,
-- nota) → piso y almacén de la tienda → la MARCA (candado + búsqueda: un reintento responde sin pedir responsable) →
-- responsable (`fn_actor_persona_id(true)`) → candado de la prenda → reglas con el candado tomado → escrituras.
-- ORDEN DE CANDADOS (ADR-0190): (1) la marca, con la MISMA clave que `bajar_al_piso` ('bajadas_piso:' || token), así el
-- reintento simultáneo espera y encuentra lo guardado; (2) `fn_bloquear_en_orden(tienda, [prenda], true)`: la fila de la
-- prenda (variantes) y después su stock en la tienda. La de variantes ordena a dos «en la mano» de la misma prenda aunque el
-- almacén todavía no tenga fila de stock. `registrar_movimiento` y `bajar_al_piso` vuelven a pedir lo mismo: ya lo tienen.
--
-- ESTADO QUE DEJA DE SER POSIBLE: una prenda colgada que el sistema cree guardada porque el almacén decía 0 (la pantalla
-- ya no tiene un callejón que obligue a colgarla sin registrar), y una corrección «en la mano» sin su bajada o al revés.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, tal cual (trae `retail.` y su `set search_path`), DESPUÉS de la PARTE 1
-- (20261004223000) y ANTES de publicar la web (una web nueva contra una base sin la función responde «Could not find the
-- function» en el botón y nada se escribe). Solo `create or replace function` + `comment` + `revoke`/`grant`: sin políticas,
-- sin `drop trigger`, sin `alter` de tablas, sin `select … into` dentro de comillas (ADR-0195, ADR-0288). Re-ejecutable.
-- Verificación después de pegar (solo lectura):
--   select pg_get_function_identity_arguments(p.oid) from pg_proc p
--    where p.pronamespace = 'retail'::regnamespace and p.proname = 'bajar_en_mano';
--   → una fila: «p_ubicacion_id uuid, p_variante_id uuid, p_nota text, p_token uuid»
--   select count(*) from retail.fn_verificar_bajadas_en_mano();  → 0
--
-- SE ROMPE SI `bajar_al_piso` cambia la clave de su candado de marca o deja de aceptar el módulo Existencias (las guardas de
-- abajo abortan el pegado si hoy no es así), o si `registrar_movimiento` empieza a pedir algo que Existencias no da (la
-- prueba `pnpm pruebas:bajar-en-mano` lo ve como «integrante con Existencias no puede»).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- Guardas: si falta algo de lo que esto asume, se aborta sin tocar nada.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('retail.bajadas_en_mano') is null then
    raise exception 'Falta la tabla bajadas_en_mano: pega antes 20261004223000_bajadas_en_mano_tabla.sql';
  end if;
  if to_regprocedure('retail.bajar_al_piso(uuid, jsonb, uuid)') is null then
    raise exception 'Falta bajar_al_piso: pega antes 20260926000200_bajada_piso_funciones.sql';
  end if;
  -- La clave del candado de marca: bajar_en_mano toma la misma para que un reintento simultáneo espere y encuentre lo guardado.
  if not exists (select 1 from pg_proc where oid = 'retail.bajar_al_piso(uuid, jsonb, uuid)'::regprocedure
                   and prosrc like '%''bajadas_piso:'' || p_token::text%') then
    raise exception 'bajar_al_piso cambió la clave de su candado de marca: revisa esta función antes de pegarla.';
  end if;
  if not exists (select 1 from pg_proc where oid = 'retail.bajar_al_piso(uuid, jsonb, uuid)'::regprocedure
                   and prosrc like '%fn_ve_modulo(''existencias'')%') then
    raise exception 'bajar_al_piso todavía pide el módulo «Bajada al piso»: pega antes 20261002120000_bajada_y_ajuste_dentro_de_existencias.sql';
  end if;
  if to_regprocedure('retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)') is null then
    raise exception 'Falta registrar_movimiento con sububicación: pega antes 20260916214600_registrar_movimiento_una_sola_firma.sql';
  end if;
  if to_regprocedure('retail.fn_bloquear_en_orden(uuid, uuid[], boolean, uuid[])') is null then
    raise exception 'Falta fn_bloquear_en_orden (ADR-0190): pega antes 20260924130000_concurrencia_orden_y_doble_clic.sql';
  end if;
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null or to_regprocedure('retail.fn_ve_modulo(text)') is null
     or to_regprocedure('retail.fn_puede_operar_ubicacion(uuid)') is null or to_regprocedure('retail.fn_prenda_corta(uuid)') is null
     or to_regprocedure('retail.fn_hoy_lima()') is null then
    raise exception 'Faltan fn_actor_persona_id, fn_ve_modulo, fn_puede_operar_ubicacion, fn_prenda_corta o fn_hoy_lima.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- La tengo en la mano: corregir (si hace falta) y colgar, todo o nada.
-- ---------------------------------------------------------------------------
create or replace function retail.bajar_en_mano(p_ubicacion_id uuid, p_variante_id uuid, p_nota text, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  c_nota constant text := 'La tenía en la mano al bajarla';
  c_tope_del_dia constant integer := 5;
  c_max_nota constant integer := 200;
  v_nota_persona text := nullif(btrim(regexp_replace(coalesce(p_nota, ''), '\s+', ' ', 'g')), '');
  v_activa boolean;
  v_piso uuid;
  v_almacen uuid;
  v_prev uuid;
  v_prev_ubicacion uuid;
  v_prev_creada timestamptz;
  v_prev_ajuste uuid;
  v_prev_es_en_mano boolean;
  v_prev_mov uuid;
  v_actor uuid;
  v_almacen_cantidad integer;
  v_almacen_apartada integer;
  v_corregidas_hoy integer;
  v_ajuste uuid;
  v_bajada jsonb;
  v_bajada_id uuid;
  v_mov uuid;
  v_prenda text;
  v_sede text;
begin
  if p_token is null then
    raise exception 'Falta la marca de este intento. Cierra la ventana y vuelve a escanear la prenda.' using hint = 'en_mano_sin_token';
  end if;
  if not fn_ve_modulo('existencias') then
    raise exception 'No puedes corregir y colgar prendas: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.'
      using hint = 'en_mano_sin_modulo';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para mover mercadería en esa tienda.' using hint = 'en_mano_sin_tienda';
  end if;

  v_activa := (select v.activo from variantes v where v.id = p_variante_id);
  if p_variante_id is null or p_variante_id = c_centinela or v_activa is null then
    raise exception 'Esa prenda no está en el catálogo: no hay nada que colgar.' using hint = 'en_mano_no_es_prenda';
  end if;
  if not v_activa then
    raise exception '% está archivada: no se cuelga en el piso.', coalesce(fn_prenda_corta(p_variante_id), 'Esa prenda')
      using hint = 'en_mano_archivada';
  end if;
  if char_length(coalesce(v_nota_persona, '')) > c_max_nota then
    raise exception 'La nota admite hasta % caracteres: acórtala.', c_max_nota using hint = 'en_mano_nota_larga';
  end if;

  v_piso := (select s.id from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta');
  v_almacen := (select s.id from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda');
  if v_piso is null or v_almacen is null then
    raise exception 'Esta tienda todavía no separa piso y almacén: no hay nada que colgar.' using hint = 'en_mano_tienda_sin_piso';
  end if;

  -- Candado 1: la marca, con la MISMA clave que bajar_al_piso. Un segundo toque (o un reintento tras un corte) espera
  -- aquí y, al soltarse, encuentra la bajada ya guardada. Se mira ANTES de pedir responsable: comprobar no escribe nada.
  perform pg_advisory_xact_lock(hashtextextended('bajadas_piso:' || p_token::text, 0));
  for v_prev, v_prev_ubicacion, v_prev_creada in
    select b.id, b.ubicacion_id, b.created_at from bajadas_piso b where b.token_cliente = p_token
  loop
    exit;
  end loop;
  if v_prev is not null then
    v_prev_es_en_mano := exists (select 1 from bajadas_en_mano e where e.bajada_id = v_prev);
    v_prev_ajuste := (select e.ajuste_movimiento_id from bajadas_en_mano e where e.bajada_id = v_prev);
    v_prev_mov := (select i.movimiento_id from bajada_piso_items i where i.bajada_id = v_prev and i.variante_id = p_variante_id);
    if not v_prev_es_en_mano or v_prev_ubicacion is distinct from p_ubicacion_id or v_prev_mov is null then
      raise exception 'Ese intento ya se guardó con otra prenda u otra tienda: no se repitió. Cierra la ventana y vuelve a escanear.'
        using hint = 'en_mano_token_reusado';
    end if;
    return jsonb_build_object(
      'bajada_id', v_prev,
      'ya_registrada', true,
      'corregida', v_prev_ajuste is not null,
      'ajuste_movimiento_id', v_prev_ajuste,
      'movimiento_id', v_prev_mov,
      'piso', coalesce((select greatest(s.cantidad - s.cantidad_apartada, 0) from stock s
                         where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_piso), 0),
      'almacen', coalesce((select greatest(s.cantidad - s.cantidad_apartada, 0) from stock s
                            where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_almacen), 0),
      'registrada_en', v_prev_creada);
  end if;

  -- Firma el responsable elegido en la pantalla; en una terminal sin responsable presente, esto ya levanta su 42501.
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- Candado 2 (ADR-0190): la prenda (variantes) y después su stock en esta tienda. Desde aquí lo que se lee es lo que hay:
  -- otra persona no puede bajar, vender ni corregir esta prenda en esta tienda hasta terminar.
  perform fn_bloquear_en_orden(p_ubicacion_id, array[p_variante_id], true);

  v_almacen_cantidad := coalesce((select s.cantidad from stock s
                                   where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_almacen), 0);
  v_almacen_apartada := coalesce((select s.cantidad_apartada from stock s
                                   where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_almacen), 0);

  if v_almacen_cantidad - v_almacen_apartada <= 0 then
    v_prenda := coalesce(fn_prenda_corta(p_variante_id), 'Esta prenda');
    v_sede := coalesce((select u.nombre from ubicaciones u where u.id = p_ubicacion_id), 'esta tienda');

    -- Lo apartado sigue en el almacén y es de un cliente: la que tiene en la mano puede ser esa.
    if v_almacen_apartada > 0 then
      raise exception '%: en el almacén de % hay %. Si la que tienes es esa, déjala guardada; si es otra, corrígela en Ajustar stock.',
        v_prenda, v_sede,
        case when v_almacen_apartada = 1 then '1 apartada para un cliente' else v_almacen_apartada || ' apartadas para clientes' end
        using hint = 'en_mano_apartada';
    end if;

    -- ADR-0235: un ajuste corrige lo que ya estaba. Si la prenda nunca entró a esta tienda, no es una corrección.
    if not exists (select 1 from movimientos m where m.variante_id = p_variante_id and m.ubicacion_id = p_ubicacion_id) then
      raise exception '% nunca entró a %: no es una corrección. Si llegó de otra sede, recíbela en Traslados; si es de la carga inicial, cárgala en Ajustar stock.',
        v_prenda, v_sede
        using hint = 'en_mano_sin_historia';
    end if;

    -- Una a la vez, y no más de 5 por prenda, tienda y día de Lima.
    v_corregidas_hoy := (
      select count(*)::integer
        from bajadas_en_mano e
        join bajadas_piso b on b.id = e.bajada_id
        join bajada_piso_items i on i.bajada_id = e.bajada_id
       where e.ajuste_movimiento_id is not null
         and b.ubicacion_id = p_ubicacion_id
         and i.variante_id = p_variante_id
         and b.created_at >= (fn_hoy_lima()::timestamp at time zone 'America/Lima'));
    if v_corregidas_hoy >= c_tope_del_dia then
      raise exception 'Hoy ya se corrigieron % de % en % con la prenda en la mano. Si encontraste más, regístralas en Ajustar stock con su motivo.',
        v_corregidas_hoy, v_prenda, v_sede
        using hint = 'en_mano_tope_del_dia';
    end if;

    -- La corrección: +1 en el ALMACÉN, «Encontré prendas» (motivo reposicion), firmada como todo ajuste.
    v_ajuste := registrar_movimiento(p_variante_id, p_ubicacion_id, 'ajuste', 1, 'reposicion',
                                     c_nota || coalesce(' · ' || v_nota_persona, ''), v_almacen);
  end if;

  -- La bajada: la misma de siempre, con la misma marca. Ya hay al menos 1 libre en el almacén.
  v_bajada := bajar_al_piso(p_ubicacion_id, jsonb_build_array(jsonb_build_object('variante_id', p_variante_id, 'cantidad', 1)), p_token);
  v_bajada_id := (v_bajada ->> 'bajada_id')::uuid;
  v_mov := (select i.movimiento_id from bajada_piso_items i where i.bajada_id = v_bajada_id and i.variante_id = p_variante_id);

  insert into bajadas_en_mano (bajada_id, ajuste_movimiento_id) values (v_bajada_id, v_ajuste);

  return jsonb_build_object(
    'bajada_id', v_bajada_id,
    'ya_registrada', false,
    'corregida', v_ajuste is not null,
    'ajuste_movimiento_id', v_ajuste,
    'movimiento_id', v_mov,
    'piso', coalesce((select greatest(s.cantidad - s.cantidad_apartada, 0) from stock s
                       where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_piso), 0),
    'almacen', coalesce((select greatest(s.cantidad - s.cantidad_apartada, 0) from stock s
                          where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_almacen), 0),
    'registrada_en', v_bajada ->> 'registrada_en');
end;
$fn$;

comment on function retail.bajar_en_mano(uuid, uuid, text, uuid) is
  'ADR-0328 (actividad 9): «La tengo en la mano». En una transacción: si el almacén de la tienda no tiene la prenda libre, la corrige (+1, ajuste reposicion = «Encontré prendas», nota «La tenía en la mano al bajarla» + la de la persona) y la baja al piso con bajar_al_piso (misma bajada que una escaneada: Frescura la cuenta). 1 unidad por llamada, tope de 5 correcciones por prenda, tienda y día; rechaza si lo del almacén está apartado o si la prenda nunca entró a la tienda. Pide Existencias y operar la tienda; firma el responsable. p_token obligatorio: reenviarlo devuelve ya_registrada sin escribir. Devuelve {bajada_id, ya_registrada, corregida, ajuste_movimiento_id, movimiento_id, piso, almacen, registrada_en}.';

revoke all on function retail.bajar_en_mano(uuid, uuid, text, uuid) from public, anon;
grant execute on function retail.bajar_en_mano(uuid, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Diagnóstico: siempre debe devolver cero filas.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_verificar_bajadas_en_mano()
returns table (bajada_id uuid, problema text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  -- La bajada en la mano es UNA prenda y UNA unidad. (Sin ninguna línea la ve ya `fn_verificar_bajadas`; pasa, por ejemplo,
  -- cuando «Eliminar con historia» borró el producto: borra las líneas y deja la cabecera.)
  select e.bajada_id, 'La bajada en la mano tiene más de una línea o una línea que no es de 1 unidad'
    from retail.bajadas_en_mano e
   where (select count(*) from retail.bajada_piso_items i where i.bajada_id = e.bajada_id) > 1
      or exists (select 1 from retail.bajada_piso_items i where i.bajada_id = e.bajada_id and i.cantidad <> 1)
  union all
  -- Su corrección es un ajuste +1 en el almacén de la misma tienda, de la misma prenda, con la nota automática y escrito
  -- en la MISMA transacción que la bajada (now() es la hora de inicio de la transacción: misma hora exacta).
  select e.bajada_id,
         'La corrección ' || e.ajuste_movimiento_id || ' no es un +1 «Encontré prendas» en el almacén de la tienda, de la misma prenda y en la misma transacción que la bajada'
    from retail.bajadas_en_mano e
    join retail.bajadas_piso b on b.id = e.bajada_id
    join retail.bajada_piso_items i on i.bajada_id = e.bajada_id
    join retail.movimientos m on m.id = e.ajuste_movimiento_id
    left join retail.sububicaciones s on s.id = m.sububicacion_id
   where not coalesce(
           m.tipo = 'ajuste'
           and m.cantidad = 1
           and m.motivo = 'reposicion'
           and m.variante_id = i.variante_id
           and m.ubicacion_id = b.ubicacion_id
           and s.ubicacion_id = b.ubicacion_id and s.tipo = 'almacen_tienda'
           and m.created_at = b.created_at
           and m.nota like 'La tenía en la mano al bajarla%',
         false);
$fn$;

comment on function retail.fn_verificar_bajadas_en_mano() is
  'ADR-0328 (actividad 9): bajadas «en la mano» con más de una línea o una línea que no es de 1 unidad, o cuya corrección no es un ajuste +1 reposicion en el almacén de la tienda, de la misma prenda, con la nota automática y en la misma transacción. Debe devolver cero filas siempre.';

revoke all on function retail.fn_verificar_bajadas_en_mano() from public, anon, authenticated;

notify pgrst, 'reload schema';

reset lock_timeout;

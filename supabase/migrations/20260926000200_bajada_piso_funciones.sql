-- ============================================================================
-- 20260926000200_bajada_piso_funciones.sql — CAYLA V2 · ADR-0208 «Frescura del piso», paso 1 · PARTE 3 de 5
--
-- EL PROBLEMA PRIMERO. Los datos de Frescura solo valen si la bajada al piso se registra al colgar la prenda y no al
-- cobrarla; hoy la única bajada es un modal de una prenda por vez que exige todo Existencias. La colaboradora que abre
-- un fardo necesita escanear cada prenda que cuelga y confirmar UNA vez; si la red se corta, reintentar sin bajar dos
-- veces; y si algo no alcanza, que no se baje NADA y que el mensaje diga qué prenda falló.
--
-- QUÉ HACE
--   · `bajar_al_piso(tienda, lista, marca)`: todo o nada. Valida permiso, forma, la marca del intento y el almacén
--     disponible de TODAS las líneas bajo candado, y recién entonces baja línea por línea con `mover_interno` —el mismo
--     productor de la fila almacén→piso que el botón «Reponer»: una sola forma de esa fila en el libro—. Guarda el
--     documento (`bajadas_piso`) y sus líneas (`bajada_piso_items`). No recibe sububicaciones: origen = almacén y destino
--     = piso de ESA tienda, resueltos por tipo (no se puede bajar desde cuarentena ni a otra tienda).
--   · Permiso: el módulo «Bajada al piso» (`fn_ve_modulo('bajada_piso')`) DENTRO de la función, y operar esa tienda.
--     Existencias no lo implica (ADR-0161: un módulo no se asigna desde el código). Firma el responsable del combo.
--   · Idempotencia con marca obligatoria + huella de la lista: el reintento con la misma lista devuelve la misma bajada
--     (`ya_registrada: true`); con la lista editada NO repite nada y lo dice (cierra el hueco de ADR-0190, donde el
--     reintento con otra lista devolvía el documento viejo y la prenda añadida se perdía en silencio). En ese rechazo
--     (`bajada_token_reusado`) el DETAIL trae las líneas YA guardadas con esa marca, [{variante_id, cantidad}] en orden
--     de prenda: la red se cortó después de guardar, ella siguió escaneando, y la pantalla resta lo guardado y le deja
--     con marca nueva solo lo que faltaba, en vez de hacerle adivinar desde Movimientos.
--   · Orden de revisión: módulo y tienda → forma de la lista → la MARCA (candado de transacción + búsqueda) → recién
--     entonces el responsable. Un reintento de algo ya guardado responde «ya estaba registrada» aunque el responsable
--     haya marcado su salida en el medio: la pantalla solo suelta la marca de «enviado» cuando la base miró el token.
--   · Orden de candados: (1) la marca del intento, (2) el stock de la tienda en orden de prenda con `fn_bloquear_en_orden`
--     (ADR-0190). Sin ciclo con quien use ese mismo orden (ventas, iniciar_traslado, recepciones, cerrar_conteo).
--     `confirmar_traslado`, `cerrar_traslado_con_diferencia` y `anular_venta` todavía NO pre-bloquean: un choque con
--     ellas da 40P01; la transacción se deshace entera, la marca queda libre y el reintento guarda (pendiente en BACKLOG).
--   · `fn_prenda_corta`: el nombre legible de una prenda para los mensajes («referencia · talla · color»).
--   · `fn_verificar_bajadas()`: diagnóstico que siempre debe dar cero filas (documento sin líneas, o línea cuyo
--     movimiento no sea almacén→piso de su tienda con la misma prenda y cantidad).
--
-- TODOS los errores de negocio son P0001 con un hint estable (la web los traduce por el hint; traducirError deja pasar
-- P0001 tal cual). El único que no es P0001 es el del responsable, que levanta `fn_actor_persona_id` con su propio hint.
--
-- ORDEN AL PEGAR (cinco partes, cada una sola en el SQL Editor; archivos 20260926000000 a 20260926000400):
--   0000 módulo → 0100 tablas → 0200 funciones de escritura → 0300 lectura de Frescura → publicar la web → 0400
--   («Reposición» ya no toca el piso). La 0400 va DESPUÉS de la web porque su mensaje manda al botón «Bajar al piso» de
--   Existencias, que recién existe con la web publicada.
-- ESTA es la 0200. Depende de 20260923100000 (que `mover_interno` firme con el responsable) y de 20260924130000
-- (`fn_bloquear_en_orden`): las guardas de abajo abortan sin cambiar nada si faltan. Solo `create or replace function`:
-- no toma candados de tablas; se retira con un `drop function`. Producción: pegar tal cual (ya trae `retail.`).
-- Re-ejecutable.
--
-- SE ROMPE SI `mover_interno` pasa a exigir el módulo Existencias (quien solo tiene «Bajada al piso» dejaría de poder
-- bajar: lo detecta `pnpm pruebas:bajada-al-piso`), o si una bajada de 300 prendas retiene el stock más de ~1 s y
-- las ventas de esas prendas esperan (el tope de 300 líneas acota el peor caso).
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- Guardas: si falta algo de lo que esto asume, se aborta sin tocar nada.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('retail.bajadas_piso') is null or to_regclass('retail.bajada_piso_items') is null then
    raise exception 'Faltan las tablas de la bajada al piso: pega antes 20260926000100_bajada_piso_tablas.sql';
  end if;
  if to_regprocedure('retail.fn_bloquear_en_orden(uuid, uuid[], boolean, uuid[])') is null
     or to_regprocedure('retail.fn_ids_de_items(jsonb, text)') is null then
    raise exception 'Falta fn_bloquear_en_orden (ADR-0190): pega antes 20260924130000_concurrencia_orden_y_doble_clic.sql';
  end if;
  if to_regprocedure('retail.mover_interno(uuid, uuid, integer, uuid, uuid, text)') is null
     or to_regprocedure('retail.fn_actor_persona_id(boolean)') is null then
    raise exception 'Falta mover_interno o fn_actor_persona_id: pega antes 20260923100000_actor_firma_las_operaciones.sql';
  end if;
  if to_regprocedure('retail.fn_ve_modulo(text)') is null then
    raise exception 'Falta fn_ve_modulo (roles por módulo): pega antes 20260923030000_roles_por_modulo.sql';
  end if;
  if to_regprocedure('retail.fn_puede_operar_ubicacion(uuid)') is null then
    raise exception 'Falta fn_puede_operar_ubicacion';
  end if;
  if pg_get_functiondef('retail.mover_interno(uuid, uuid, integer, uuid, uuid, text)'::regprocedure) not like '%fn_actor_persona_id%' then
    raise exception 'mover_interno todavía no firma con el responsable: pega antes 20260923100000_actor_firma_las_operaciones.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- El nombre corto de una prenda para los mensajes: «Blusa Lino · M · Blanco».
-- ---------------------------------------------------------------------------
create or replace function retail.fn_prenda_corta(p_variante_id uuid)
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select nullif(btrim(concat_ws(' · ', nullif(btrim(p.referencia), ''), nullif(btrim(ta.valor), ''), nullif(btrim(co.nombre), ''))), '')
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id
    left join retail.tallas ta on ta.id = v.talla_id
    left join retail.colores co on co.codigo = v.color_codigo
   where v.id = p_variante_id;
$fn$;

comment on function retail.fn_prenda_corta(uuid) is
  'ADR-0208: «referencia · talla · color» de una prenda, omitiendo lo vacío. Solo la usan otras funciones para sus mensajes.';

revoke all on function retail.fn_prenda_corta(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bajar al piso: todo o nada.
-- ---------------------------------------------------------------------------
create or replace function retail.bajar_al_piso(p_ubicacion_id uuid, p_items jsonb, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_actor uuid;
  v_piso uuid;
  v_almacen uuid;
  v_lineas jsonb;
  v_n integer;
  v_unidades bigint;
  v_huella text;
  v_prev retail.bajadas_piso%rowtype;
  v_guardadas bigint;
  v_guardado jsonb;
  v_id uuid;
  v_creada timestamptz;
  v_mov uuid;
  v_problemas jsonb;
  v_texto text;
  r record;
begin
  if p_token is null then
    raise exception 'Falta la marca de este intento. Recarga la página y vuelve a escanear.' using hint = 'bajada_sin_token';
  end if;
  if not fn_ve_modulo('bajada_piso') then
    raise exception 'No puedes bajar prendas al piso: tu rol no tiene el módulo «Bajada al piso». Pídele al líder que lo active.'
      using hint = 'bajada_sin_modulo';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para mover mercadería en esa tienda.' using hint = 'bajada_sin_tienda';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay prendas para bajar: escanea al menos una.' using hint = 'bajada_vacia';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'variante_id', '') !~* c_uuid
        or coalesce(e ->> 'cantidad', '') !~ '^[1-9][0-9]{0,5}$'
  ) then
    raise exception 'Cada prenda necesita un código válido y al menos 1 unidad.' using hint = 'bajada_linea_invalida';
  end if;

  -- La lista normalizada: la misma prenda repetida se suma en una sola línea; la huella no depende del orden del escaneo.
  select jsonb_agg(jsonb_build_object('variante_id', t.v, 'cantidad', t.c) order by t.v),
         count(*), sum(t.c),
         md5(string_agg(t.v::text || ':' || t.c::text, ',' order by t.v))
    into v_lineas, v_n, v_unidades, v_huella
    from (select (e ->> 'variante_id')::uuid as v, sum((e ->> 'cantidad')::bigint) as c
            from jsonb_array_elements(p_items) e group by 1) t;
  if v_n > 300 then
    raise exception 'Una bajada admite hasta 300 prendas distintas: confirma esta y arma otra.' using hint = 'bajada_muy_larga';
  end if;

  -- Candado 1: la marca. Un segundo clic espera aquí y, al soltarse, encuentra la bajada ya guardada.
  perform pg_advisory_xact_lock(hashtextextended('bajadas_piso:' || p_token::text, 0));
  select * into v_prev from bajadas_piso where token_cliente = p_token;
  if found then
    if v_prev.ubicacion_id is distinct from p_ubicacion_id then
      raise exception 'Ese intento ya se usó en otra tienda. Recarga la página y vuelve a escanear.' using hint = 'bajada_token_ajeno';
    end if;
    if v_prev.huella <> v_huella then
      -- Lo ya guardado viaja en el DETAIL para que la pantalla lo reste de su lista y conserve solo lo que falta.
      select coalesce(sum(i.cantidad), 0),
             jsonb_agg(jsonb_build_object('variante_id', i.variante_id, 'cantidad', i.cantidad) order by i.variante_id)
        into v_guardadas, v_guardado
        from bajada_piso_items i
       where i.bajada_id = v_prev.id;
      raise exception 'Esa bajada ya se guardó a las % con % %. No se repitió: la pantalla te deja solo lo que faltaba.',
        to_char(v_prev.created_at at time zone 'America/Lima', 'HH24:MI'), v_guardadas,
        case when v_guardadas = 1 then 'prenda' else 'prendas' end
        using hint = 'bajada_token_reusado',
              detail = coalesce(v_guardado, '[]'::jsonb)::text;
    end if;
    return jsonb_build_object(
      'bajada_id', v_prev.id,
      'ya_registrada', true,
      'lineas', (select count(*) from bajada_piso_items i where i.bajada_id = v_prev.id),
      'unidades', (select coalesce(sum(i.cantidad), 0) from bajada_piso_items i where i.bajada_id = v_prev.id),
      'registrada_en', v_prev.created_at);
  end if;

  -- La marca se mira ANTES de pedir responsable: comprobar una bajada ya guardada no escribe nada, así que responde
  -- aunque quien la hizo ya marcó su salida (si no, la pantalla creería que no se guardó y se podría bajar dos veces).
  -- Firma el responsable elegido en la pantalla; en una terminal sin responsable presente, esto ya levanta su 42501.
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  select s.id into v_piso from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta';
  select s.id into v_almacen from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda';
  if v_piso is null or v_almacen is null then
    raise exception 'Esta tienda todavía no separa piso y almacén: no hay nada que bajar.' using hint = 'bajada_tienda_sin_piso';
  end if;

  -- Candado 2: el stock de esas prendas en la tienda, en orden de prenda (ADR-0190). Nada se tomó antes salvo la marca.
  perform fn_bloquear_en_orden(p_ubicacion_id, array(select (x ->> 'variante_id')::uuid from jsonb_array_elements(v_lineas) x));

  -- Con el candado tomado, TODAS las líneas que no se pueden bajar, en un solo mensaje.
  select jsonb_agg(q.p order by q.p ->> 'prenda', q.p ->> 'variante_id') into v_problemas
    from (
      select jsonb_build_object(
               'variante_id', l.v,
               'prenda', coalesce(fn_prenda_corta(l.v), 'una prenda'),
               'pide', l.c,
               'hay', greatest(coalesce(sa.cantidad, 0) - coalesce(sa.cantidad_apartada, 0), 0),
               'apartadas', coalesce(sa.cantidad_apartada, 0),
               'motivo', case when l.v = c_centinela then 'no_es_prenda'
                              when va.id is null then 'no_existe'
                              when not va.activo then 'archivada'
                              else 'sin_alcance' end) as p
        from (select (x ->> 'variante_id')::uuid as v, (x ->> 'cantidad')::bigint as c
                from jsonb_array_elements(v_lineas) x) l
        left join variantes va on va.id = l.v
        left join stock sa on sa.variante_id = l.v and sa.ubicacion_id = p_ubicacion_id and sa.sububicacion_id = v_almacen
       where l.v = c_centinela
          or va.id is null
          or not va.activo
          or coalesce(sa.cantidad, 0) - coalesce(sa.cantidad_apartada, 0) < l.c
    ) q;

  if v_problemas is not null then
    select 'No se bajó nada. '
           || string_agg(
                case t.p ->> 'motivo'
                  when 'no_es_prenda' then 'La «Prenda sin registrar» no es una prenda real: no se baja al piso'
                  when 'no_existe' then 'Hay una prenda que ya no existe en el catálogo'
                  when 'archivada' then (t.p ->> 'prenda') || ' está archivada: no se baja al piso'
                  else (t.p ->> 'prenda') || ': pides ' || (t.p ->> 'pide') || ' y en el almacén hay ' || (t.p ->> 'hay')
                       || case when (t.p ->> 'apartadas')::integer = 1 then ' (1 apartada para una clienta)'
                               when (t.p ->> 'apartadas')::integer > 1
                               then ' (' || (t.p ->> 'apartadas') || ' apartadas para clientas)' else '' end
                end, '. ' order by t.n)
           || case when jsonb_array_length(v_problemas) = 6 then '. Y 1 prenda más'
                   when jsonb_array_length(v_problemas) > 6
                   then '. Y ' || (jsonb_array_length(v_problemas) - 5) || ' prendas más' else '' end
           || case when exists (select 1 from jsonb_array_elements(v_problemas) z where z ->> 'motivo' = 'sin_alcance')
                   then '. Puede que otra persona ya las haya bajado: revisa el piso y corrige esas líneas.' else '.' end
      into v_texto
      from (select e.p, e.n from jsonb_array_elements(v_problemas) with ordinality as e(p, n) order by e.n limit 5) t;
    raise exception '%', v_texto
      using hint = 'bajada_sin_alcance',
            detail = (select jsonb_agg(z.p order by z.n)
                        from (select e.p, e.n from jsonb_array_elements(v_problemas) with ordinality as e(p, n)
                               order by e.n limit 50) z)::text;
  end if;

  insert into bajadas_piso (token_cliente, ubicacion_id, persona_id, huella)
    values (p_token, p_ubicacion_id, v_actor, v_huella)
    returning id, created_at into v_id, v_creada;

  for r in
    select (x ->> 'variante_id')::uuid as v, (x ->> 'cantidad')::integer as c
      from jsonb_array_elements(v_lineas) x
     order by 1
  loop
    v_mov := mover_interno(p_ubicacion_id, r.v, r.c, v_almacen, v_piso, null);
    insert into bajada_piso_items (movimiento_id, bajada_id, variante_id, cantidad) values (v_mov, v_id, r.v, r.c);
  end loop;

  return jsonb_build_object('bajada_id', v_id, 'ya_registrada', false, 'lineas', v_n, 'unidades', v_unidades,
                            'registrada_en', v_creada);
end;
$fn$;

comment on function retail.bajar_al_piso(uuid, jsonb, uuid) is
  'ADR-0208: baja al piso, de una vez y todo o nada, las prendas escaneadas del almacén de una tienda. p_items = [{variante_id, cantidad}] (1 a 300 prendas distintas; repetidas se suman). p_token obligatorio: el mismo token con la misma lista devuelve la misma bajada (ya_registrada), con otra lista no repite nada y el detail del error trae lo ya guardado ([{variante_id, cantidad}]). Pide el módulo «Bajada al piso» y operar la tienda; firma el responsable. Cada línea es un mover_interno almacén→piso.';

revoke all on function retail.bajar_al_piso(uuid, jsonb, uuid) from public, anon;
grant execute on function retail.bajar_al_piso(uuid, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Diagnóstico: siempre debe devolver cero filas.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_verificar_bajadas()
returns table (bajada_id uuid, problema text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select b.id, 'La bajada no tiene ninguna prenda'
    from retail.bajadas_piso b
   where not exists (select 1 from retail.bajada_piso_items i where i.bajada_id = b.id)
  union all
  select i.bajada_id,
         'La línea de ' || coalesce(retail.fn_prenda_corta(i.variante_id), i.variante_id::text)
         || ' no es un traslado almacén→piso de su tienda con la misma prenda y cantidad (movimiento ' || i.movimiento_id || ')'
    from retail.bajada_piso_items i
    join retail.bajadas_piso b on b.id = i.bajada_id
    join retail.movimientos m on m.id = i.movimiento_id
    left join retail.sububicaciones so on so.id = m.sububicacion_id
    left join retail.sububicaciones sd on sd.id = m.sububicacion_destino_id
   where not coalesce(
           m.tipo = 'traslado'
           and m.ubicacion_id = b.ubicacion_id
           and m.ubicacion_destino_id = b.ubicacion_id
           and so.ubicacion_id = b.ubicacion_id and so.tipo = 'almacen_tienda'
           and sd.ubicacion_id = b.ubicacion_id and sd.tipo = 'piso_venta'
           and m.variante_id = i.variante_id
           and m.cantidad = i.cantidad,
         false);
$fn$;

comment on function retail.fn_verificar_bajadas() is
  'ADR-0208: bajadas sin líneas y líneas cuyo movimiento no es almacén→piso de su tienda con la misma prenda y cantidad. Debe devolver cero filas siempre.';

revoke all on function retail.fn_verificar_bajadas() from public, anon, authenticated;

notify pgrst, 'reload schema';

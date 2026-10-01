-- ============================================================================
-- 20261001150000_retirar_del_piso.sql — CAYLA V2 · ADR-0296 «Subir a almacén» · la puerta que sube VARIAS tallas del piso al
-- almacén en una sola transacción. Solo agrega una función: no toca tablas, políticas ni disparadores.
--
-- EL PROBLEMA PRIMERO. «Reponer» (almacén → piso) ya sube varias tallas de una prenda de una vez porque existe `bajar_al_piso`
-- (todo o nada, con marca de reintento). El movimiento contrario —«Subir a almacén», lo que ADR-0208 llamó «Retirar del
-- piso»— solo tiene `mover_entre_piso_y_almacen`, que mueve UNA talla por llamada. Si la pantalla la llamara una vez por
-- talla, una prenda con S, M y L podría quedar con la S ya guardada y la M no, con la clienta mirando el piso: el diseño
-- permitiría un estado «a medias». Se arregla en la base, no en la pantalla.
--
-- QUÉ HACE. `retirar_del_piso(p_ubicacion_id, p_items, p_nota, p_token)`:
--   · p_items = [{variante_id, cantidad}] (1 a 300 tallas distintas; repetidas se suman).
--   · Pide el MISMO módulo y el mismo permiso de tienda que `mover_entre_piso_y_almacen` («Bajada al piso», ADR-0240) y
--     firma el responsable elegido en la pantalla (`fn_actor_persona_id(true)`).
--   · Bloquea el stock de todas esas tallas EN ORDEN (`fn_bloquear_en_orden`, ADR-0190), mira con el candado tomado si
--     TODAS alcanzan en el piso (lo libre = cantidad − apartadas) y, si alguna no, no mueve NINGUNA y dice cuáles, con
--     su detalle en JSON para que la pantalla marque cada fila.
--   · Si todo alcanza, mueve cada talla con `mover_interno` piso → almacén: la MISMA fila `traslado` / `movimiento_interno`
--     que escribe hoy «Retirar del piso», así que Movimientos y Frescura la leen sin cambios (Frescura reconoce el retiro por
--     su par exacto de origen y destino, ADR-0208).
--   · Reintento SIN tabla nueva: la marca de cada talla se deriva de la marca de la lista (md5 de «marca:variante») y la
--     guarda el propio `mover_interno` en `movimientos_internos_intentos`. Reenviar la misma lista devuelve
--     `ya_registrada = true` sin mover nada (aunque el piso ya haya bajado); otra cantidad con la misma marca la rechaza
--     `mover_interno` (hint `mover_interno_token_reusado`). Todo en una transacción: si algo falla, no queda ni una marca.
--
-- CONTRATO. PROMETE: o se mueven todas las tallas pedidas, o ninguna. ASUME: la tienda separa piso y almacén; la marca
-- es obligatoria (una por ventana abierta) y la nota, si va, es de hasta 200 caracteres.
--
-- POR QUÉ NO ES UNA «BAJADA». `bajar_al_piso` guarda una cabecera (`bajadas_piso`) que alimenta Frescura; un retiro no es una
-- bajada (Frescura lo resta de las bajadas, ADR-0208 c) y no lleva cabecera: solo las filas del libro.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Tal cual, en una vez, en el SQL Editor (trae `retail.` y `set search_path`). Solo
-- `create or replace function` + `comment` + `revoke` + `grant`: no toma las tablas de `auth`/`storage` (ADR-0195), no lleva
-- políticas ni `drop trigger`. Re-ejecutable. VA ANTES de fusionar la web que la llama («Subir a almacén»): una web nueva
-- contra una base sin esta función falla con «Could not find the function».
-- Cómo se verifica después:
--   select pg_get_function_identity_arguments(p.oid), md5(p.prosrc) from pg_proc p
--    where p.pronamespace = 'retail'::regnamespace and p.proname = 'retirar_del_piso';
--   (una fila: «p_ubicacion_id uuid, p_items jsonb, p_nota text, p_token uuid»).
--
-- SE ROMPE SI `mover_interno` deja de recibir `p_token` (la marca de cada talla se pierde y reintentar mueve dos veces), o
-- si alguien le da a otra pantalla un `p_items` con una talla que `mover_interno` rechaza por otra regla que esta
-- pre-validación no mira (la transacción se deshace entera y el mensaje es el de `mover_interno`, no el de aquí).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.retirar_del_piso(p_ubicacion_id uuid, p_items jsonb, p_nota text default null, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_piso uuid;
  v_almacen uuid;
  v_lineas jsonb;
  v_n integer;
  v_unidades bigint;
  v_ya integer;
  v_actor uuid;
  v_problemas jsonb;
  v_texto text;
  r record;
begin
  if p_token is null then
    raise exception 'Falta la marca de este intento. Cierra la ventana y vuelve a abrirla.' using hint = 'retiro_sin_token';
  end if;
  if not fn_ve_modulo('bajada_piso') then
    raise exception 'No puedes mover prendas entre el piso y el almacén: tu rol no tiene el módulo «Bajada al piso». Pídele al líder que lo active.'
      using hint = 'bajada_sin_modulo';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para mover mercadería en esa tienda.' using hint = 'retiro_sin_tienda';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay prendas para subir: elige al menos una.' using hint = 'retiro_vacio';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'variante_id', '') !~* c_uuid
        or coalesce(e ->> 'cantidad', '') !~ '^[1-9][0-9]{0,5}$'
  ) then
    raise exception 'Cada prenda necesita un código válido y al menos 1 unidad.' using hint = 'retiro_linea_invalida';
  end if;
  if char_length(coalesce(v_nota, '')) > 200 then
    raise exception 'La nota admite hasta 200 caracteres.' using hint = 'retiro_nota_larga';
  end if;

  -- La lista normalizada: la misma talla repetida se suma en una sola línea.
  select jsonb_agg(jsonb_build_object('variante_id', t.v, 'cantidad', t.c) order by t.v), count(*), sum(t.c)
    into v_lineas, v_n, v_unidades
    from (select (e ->> 'variante_id')::uuid as v, sum((e ->> 'cantidad')::bigint) as c
            from jsonb_array_elements(p_items) e group by 1) t;
  if v_n > 300 then
    raise exception 'Un retiro admite hasta 300 prendas distintas: confirma este y arma otro.' using hint = 'retiro_muy_largo';
  end if;

  select s.id into v_piso from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta';
  select s.id into v_almacen from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda';
  if v_piso is null or v_almacen is null then
    raise exception 'Esta tienda todavía no separa piso y almacén: no hay nada que subir.' using hint = 'retiro_tienda_sin_piso';
  end if;

  -- ¿Ya se guardó esta lista con esta marca? La marca de cada talla se deriva de la de la lista y la guarda `mover_interno`.
  -- Antes de pedir responsable y de mirar el stock: comprobar algo ya guardado no escribe nada, así que responde aunque quien lo
  -- hizo ya marcó su salida y aunque el piso ya haya bajado.
  select count(*) into v_ya
    from jsonb_array_elements(v_lineas) x
    join movimientos_internos_intentos i on i.token_cliente = md5(p_token::text || ':' || (x ->> 'variante_id'))::uuid;
  if v_ya = v_n then
    -- `mover_interno` vuelve a comparar los datos de cada línea con los guardados: con otra cantidad lo rechaza.
    for r in
      select (x ->> 'variante_id')::uuid as v, (x ->> 'cantidad')::integer as c
        from jsonb_array_elements(v_lineas) x order by 1
    loop
      perform mover_interno(p_ubicacion_id, r.v, r.c, v_piso, v_almacen, v_nota, md5(p_token::text || ':' || r.v::text)::uuid);
    end loop;
    return jsonb_build_object('ya_registrada', true, 'lineas', v_n, 'unidades', v_unidades);
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- Candado: el stock de esas tallas en la tienda, en orden de prenda (ADR-0190). Nada se tomó antes.
  perform fn_bloquear_en_orden(p_ubicacion_id, array(select (x ->> 'variante_id')::uuid from jsonb_array_elements(v_lineas) x));

  -- Con el candado tomado, TODAS las líneas que no se pueden subir, en un solo mensaje. Una línea cuya marca ya existe se
  -- salta (su movimiento ya bajó el piso: mirarla otra vez la daría por insuficiente).
  select jsonb_agg(q.p order by q.p ->> 'prenda', q.p ->> 'variante_id') into v_problemas
    from (
      select jsonb_build_object(
               'variante_id', l.v,
               'prenda', coalesce(fn_prenda_corta(l.v), 'una prenda'),
               'pide', l.c,
               'hay', greatest(coalesce(sp.cantidad, 0) - coalesce(sp.cantidad_apartada, 0), 0),
               'apartadas', coalesce(sp.cantidad_apartada, 0),
               'motivo', case when l.v = c_centinela then 'no_es_prenda'
                              when va.id is null then 'no_existe'
                              else 'sin_alcance' end) as p
        from (select (x ->> 'variante_id')::uuid as v, (x ->> 'cantidad')::bigint as c
                from jsonb_array_elements(v_lineas) x) l
        left join variantes va on va.id = l.v
        left join stock sp on sp.variante_id = l.v and sp.ubicacion_id = p_ubicacion_id and sp.sububicacion_id = v_piso
       where not exists (select 1 from movimientos_internos_intentos i where i.token_cliente = md5(p_token::text || ':' || l.v::text)::uuid)
         and (l.v = c_centinela
              or va.id is null
              or coalesce(sp.cantidad, 0) - coalesce(sp.cantidad_apartada, 0) < l.c)
    ) q;

  if v_problemas is not null then
    select 'No se subió nada. '
           || string_agg(
                case t.p ->> 'motivo'
                  when 'no_es_prenda' then 'La «Prenda sin registrar» no es una prenda real: no se sube al almacén'
                  when 'no_existe' then 'Hay una prenda que ya no existe en el catálogo'
                  else (t.p ->> 'prenda') || ': pides ' || (t.p ->> 'pide') || ' y en el piso hay ' || (t.p ->> 'hay')
                       || case when (t.p ->> 'apartadas')::integer = 1 then ' (1 apartada para una clienta)'
                               when (t.p ->> 'apartadas')::integer > 1
                               then ' (' || (t.p ->> 'apartadas') || ' apartadas para clientas)' else '' end
                end, '. ' order by t.n)
           || case when jsonb_array_length(v_problemas) = 6 then '. Y 1 prenda más'
                   when jsonb_array_length(v_problemas) > 6
                   then '. Y ' || (jsonb_array_length(v_problemas) - 5) || ' prendas más' else '' end
           || case when exists (select 1 from jsonb_array_elements(v_problemas) z where z ->> 'motivo' = 'sin_alcance')
                   then '. Puede que otra persona ya las haya movido: revisa el piso y corrige esas líneas.' else '.' end
      into v_texto
      from (select e.p, e.n from jsonb_array_elements(v_problemas) with ordinality as e(p, n) order by e.n limit 5) t;
    raise exception '%', v_texto
      using hint = 'retiro_sin_alcance',
            detail = (select jsonb_agg(z.p order by z.n)
                        from (select e.p, e.n from jsonb_array_elements(v_problemas) with ordinality as e(p, n)
                               order by e.n limit 50) z)::text;
  end if;

  for r in
    select (x ->> 'variante_id')::uuid as v, (x ->> 'cantidad')::integer as c
      from jsonb_array_elements(v_lineas) x
     order by 1
  loop
    perform mover_interno(p_ubicacion_id, r.v, r.c, v_piso, v_almacen, v_nota, md5(p_token::text || ':' || r.v::text)::uuid);
  end loop;

  return jsonb_build_object('ya_registrada', false, 'lineas', v_n, 'unidades', v_unidades);
end;
$fn$;

comment on function retail.retirar_del_piso(uuid, jsonb, text, uuid) is
  'ADR-0296: sube al almacén, de una vez y todo o nada, varias tallas del piso de una tienda. p_items = [{variante_id, cantidad}] (1 a 300; repetidas se suman). p_token obligatorio: cada talla lleva una marca derivada (md5 de marca:variante) que guarda mover_interno; reenviar la misma lista devuelve ya_registrada sin mover nada. Pide el módulo «Bajada al piso» y operar la tienda; firma el responsable. Cada línea es un mover_interno piso→almacén (la misma fila que «Retirar del piso»).';

revoke all on function retail.retirar_del_piso(uuid, jsonb, text, uuid) from public, anon;
grant execute on function retail.retirar_del_piso(uuid, jsonb, text, uuid) to authenticated;

notify pgrst, 'reload schema';

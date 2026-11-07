-- ============================================================================
-- 20261028234000_recepcion_costo_y_precio_por_combinacion.sql — CAYLA V2 · ADR-0393 / ADR-0519 / ADR-0370 (act. 2026-10-28)
-- Inventario ▸ Recibir mercadería ▸ Cerrar: el costo y el precio de venta se ponen por COMBINACIÓN (color y talla), no solo por prenda.
-- ACTIVIDAD 3 de 7. Se pega DESPUÉS de 20261026164000 (costo por prenda) y de 20261028230000 / 20261028232000 (la capa de precio por combinación).
--
-- EL PROBLEMA PRIMERO. Al cerrar un envío, quien recibe ve una caja de costo y una de precio por PRENDA, y lo que escribe vale para todos sus
-- colores y tallas. Pero cuestan y se venden distinto según el color y la talla (la talla extra, el color con otro proveedor). La base ya sabe
-- guardar el precio general por combinación (`variantes.precio`) y, desde 20261028230000, el precio de una tienda por combinación; lo que no
-- podía la recepción era decirlo: su costo entra por prenda (`costos_prendas = {producto: costo}`) y su precio, por una función que cambia la
-- prenda entera (`cambiar_precio_en_recepcion`).
--
-- QUÉ CAMBIA (todo con reemplazos ANCLADOS sobre la definición viva: si el texto no es el esperado, se detiene sin cambiar nada)
--   1. COSTO. `costos_prendas` acepta también `{variante_id: costo}`: el costo de UNA combinación contada en esa línea. Al entrar al stock manda,
--      de más específico a menos: la combinación, la prenda, la línea. Las claves que ya existían (producto, `nueva:…`) no cambian, y una
--      combinación que no se contó en esa línea se ignora (como una prenda que no se separó). `fn_envio_costos_prendas` la valida con las
--      mismas reglas del costo de la prenda; `fn_recepcion_costos_a_variantes` la pone en cada variante, tanto al cerrar como al «Hacer ahora».
--   2. PRECIO. `cambiar_precios_en_recepcion(envío, prenda, {combinación: precio}, alcance)` cambia el precio de varias combinaciones de una
--      prenda de ESTE envío, todo o nada, con el envío abierto. Los mismos candados de `cambiar_precio_en_recepcion` (módulo Recibir, el
--      responsable del combo, tu sede, que no lo hayas comprado tú, que la prenda sea de este envío) y, además, que cada combinación esté
--      CONTADA en este envío con al menos una unidad. Dos alcances, como hoy:
--        · `todas`: el precio general de esas combinaciones, en todas las sedes (`variantes.precio`; lo anota el disparador del historial, y
--          una terminal sigue frenada por el suyo).
--        · `sede`: el precio de ESTA tienda. Si las combinaciones elegidas son TODAS las tallas activas de la prenda (menos la de obsequio) y
--          valen lo mismo, queda como el precio de la PRENDA en esta tienda (`poner_precio_sede`: las tallas que nazcan mañana lo heredan y
--          sus excepciones se limpian solas, 20261028232000). Si no, una excepción por combinación (`poner_precio_sede_variantes`).
--      `validar_precios_en_recepcion` corre la función real dentro de una subtransacción que siempre se deshace, y dice si se podría guardar y,
--      si no, por qué (la pantalla lo pregunta antes de pedir confirmación; lo escrito vuelve atrás).
--
-- LO QUE NO CAMBIA
--   · Sin claves de combinación en `costos_prendas`, todo es idéntico a hoy (la prenda y la línea mandan como antes).
--   · `cambiar_precio_en_recepcion` y `validar_precio_en_recepcion` (el precio de la prenda entera) siguen con su firma: «Para después» las usa.
--   · Un precio nunca queda bajo el costo de ESA talla (sin decir cuánto cuesta), ni se toca la talla de obsequio, ni pasa de S/ 5 000.
--
-- DESCARTÉ
--   · Partir el costo de la línea en una fila por combinación: la línea sigue siendo UNA (los números de la guía, las diferencias y el papel
--     del proveedor no cambian); el costo por combinación va en el mismo `costos_prendas` que ya viaja y se lee con el conteo.
--   · Un cuarto alcance «solo estas combinaciones, en todas las sedes y en esta tienda a la vez»: no hay un caso de negocio, y una cosa a la vez
--     se deshace con una sola acción.
--   · Cambiar el precio con el envío cerrado desde esta función: «Para después» ya tiene su puerta (20261026180000) y es de la prenda entera.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe; hoy solo local). UNA parte, sin tablas, políticas ni disparadores (ADR-0195): dos reemplazos
-- anclados y dos funciones nuevas, con `lock_timeout`. Idempotente. Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- Prueba: `pnpm pruebas:recepcion-combinaciones`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Reemplazo anclado (el mismo de 20261013173000): falla si la función viva cambió, y es re-ejecutable.
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

-- ---------- 1. El costo por combinación ----------

-- Qué claves de `costos_prendas` valen: ahora también la de una combinación contada (con al menos una unidad) en ESA línea.
select pg_temp.reemplazar('retail.fn_envio_costos_prendas(jsonb,jsonb,text)',
$v$      if not exists (select 1 from jsonb_array_elements(coalesce(p_separado -> 'prendas', '[]'::jsonb)) x
                      where lower(x ->> 'producto_id') = lower(v_e.key)) then
        continue;
      end if;$v$,
$n$      if not exists (select 1 from jsonb_array_elements(coalesce(p_separado -> 'prendas', '[]'::jsonb)) x
                      where lower(x ->> 'producto_id') = lower(v_e.key))
         -- ADR-0519 (act. 2026-10-28): también el costo de una COMBINACIÓN (color y talla) contada en esa línea, por su variante_id.
         and not exists (select 1 from jsonb_array_elements(coalesce(p_separado -> 'prendas', '[]'::jsonb)) x,
                                       jsonb_array_elements(case when jsonb_typeof(x -> 'variantes') = 'array' then x -> 'variantes' else '[]'::jsonb end) vv
                          where lower(vv ->> 'variante_id') = lower(v_e.key) and coalesce((vv ->> 'cantidad')::integer, 0) > 0) then
        continue;
      end if;$n$,
1);

-- Cada variante entra con el costo de su combinación; si no tiene, el de su prenda; si no, el de la línea.
select pg_temp.reemplazar('retail.fn_recepcion_costos_a_variantes(jsonb,jsonb,numeric)',
$v$      select jsonb_agg(case when p_costos ? lower(vr.producto_id::text) then w.v || jsonb_build_object('costo', p_costos -> lower(vr.producto_id::text))$v$,
$n$      select jsonb_agg(case when p_costos ? lower(w.v ->> 'variante_id') then w.v || jsonb_build_object('costo', p_costos -> lower(w.v ->> 'variante_id'))
                            when p_costos ? lower(vr.producto_id::text) then w.v || jsonb_build_object('costo', p_costos -> lower(vr.producto_id::text))$n$,
1);

-- ---------- 2. El precio por combinación ----------

create or replace function retail.cambiar_precios_en_recepcion(
  p_despacho_id uuid, p_producto_id uuid, p_precios jsonb, p_alcance text
) returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_envio text;
  v_e record;
  v_id uuid;
  v_precio numeric(12,2);
  v_ok boolean;
  v_var_precio numeric;
  v_var_costo numeric;
  v_var_cat uuid;
  v_mapa jsonb := '{}'::jsonb;   -- {combinación: precio}, ya validado y con dos decimales
  v_activas integer;
  v_elegidas integer;
  v_distintos integer;
  v_unico numeric;
  v_n integer := 0;
  v_res integer;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Cambiar el precio desde la recepción necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  if p_alcance is null or p_alcance not in ('todas', 'sede') then
    raise exception 'Elige si el precio vale para todas las sedes o solo para esta' using hint = 'precio_alcance';
  end if;
  if p_precios is null or jsonb_typeof(p_precios) <> 'object' or p_precios = '{}'::jsonb then
    raise exception 'Elige al menos una combinación y su precio.' using hint = 'precio_sede_sin_combinaciones';
  end if;

  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for share;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if v_despacho.estado <> 'abierto' then
    raise exception 'El precio se cambia mientras el envío está abierto, antes de cerrarlo' using hint = 'precio_envio_no_abierto';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  v_envio := retail.fn_envio_numero_texto(v_despacho.numero);

  -- Solo una prenda de ESTE envío (la que se separó al contarlo): esta puerta no es para cambiar el precio de cualquier prenda.
  if not exists (
    select 1
      from retail.despacho_conteos k, jsonb_array_elements(k.separado -> 'prendas') p
     where k.despacho_id = v_despacho.id and p ->> 'producto_id' = p_producto_id::text
  ) then
    raise exception 'Esa prenda no es de este envío' using hint = 'precio_prenda_ajena';
  end if;
  perform 1 from retail.productos pr where pr.id = p_producto_id for update;
  if not found then
    raise exception 'Esa prenda no existe.' using hint = 'precio_prenda_ajena';
  end if;

  -- Cada combinación: se entiende, está CONTADA en este envío, es de esa prenda y activa, no es de obsequio, y su precio es de más de 0
  -- a 5 000 y no baja del costo de ESA talla. Cualquier falla deja todo como estaba.
  for v_e in select e.key, e.value from jsonb_each(p_precios) e order by e.key loop
    begin
      v_id := v_e.key::uuid;
    exception when others then
      raise exception 'Una combinación no se entiende: vuelve a elegirla.' using hint = 'precio_combinacion_ajena';
    end;
    begin
      v_precio := round((v_e.value #>> '{}')::numeric, 2);
    exception when others then
      raise exception 'Un precio no se entiende: escribe solo números.' using hint = 'precio_invalido';
    end;
    -- NaN (que numeric acepta y que Postgres ordena por ENCIMA de todo número) no pasa por «<= 0» ni por el tope: se rechaza aquí.
    if v_precio is null or v_precio = 'NaN'::numeric or v_precio <= 0 or v_precio > 5000 then
      raise exception 'Escribe un precio mayor que cero (hasta S/ 5,000).' using hint = 'precio_invalido';
    end if;
    if not exists (
      select 1
        from retail.despacho_conteos k,
             jsonb_array_elements(k.separado -> 'prendas') p,
             jsonb_array_elements(case when jsonb_typeof(p -> 'variantes') = 'array' then p -> 'variantes' else '[]'::jsonb end) vv
       where k.despacho_id = v_despacho.id and p ->> 'producto_id' = p_producto_id::text
         and lower(vv ->> 'variante_id') = v_id::text and coalesce((vv ->> 'cantidad')::integer, 0) > 0
    ) then
      raise exception 'Esa combinación no está contada en este envío' using hint = 'precio_combinacion_ajena';
    end if;
    v_ok := false;
    for v_var_precio, v_var_costo, v_var_cat in
      select v.precio, v.costo, pr.categoria_id
        from retail.variantes v join retail.productos pr on pr.id = v.producto_id
       where v.id = v_id and v.producto_id = p_producto_id and v.activo
    loop
      v_ok := true;
      exit;
    end loop;
    if not v_ok then
      raise exception 'Esa combinación no es de esta prenda o está desactivada.' using hint = 'precio_combinacion_ajena';
    end if;
    -- La talla de obsequio vale S/ 0 en toda tienda (ADR-0384): no tiene precio que cambiar.
    if v_var_precio = 0 and retail.fn_categoria_admite_precio_cero(v_var_cat) then
      raise exception 'Esa talla se regala (vale 0): su precio no se cambia aquí.' using hint = 'precio_sede_obsequio';
    end if;
    -- Nunca bajo el costo de esa talla (el mensaje no dice cuánto cuesta: el costo es dato con permiso, ADR-0183).
    if v_precio < v_var_costo then
      raise exception 'Ese precio queda por debajo de lo que cuesta la prenda. Para liquidar usa una campaña (Catálogo ▸ Atributos ▸ Etiquetas).'
        using hint = case when p_alcance = 'sede' then 'precio_sede_bajo_costo' else 'precio_bajo_costo' end;
    end if;
    v_mapa := v_mapa || jsonb_build_object(v_id::text, v_precio);
  end loop;

  if p_alcance = 'todas' then
    -- El precio general de cada combinación, en todas las sedes. Una terminal queda frenada por el disparador de `variantes`.
    for v_e in select e.key, e.value from jsonb_each(v_mapa) e order by e.key loop
      update retail.variantes v set precio = (v_e.value #>> '{}')::numeric
       where v.id = v_e.key::uuid and v.precio is distinct from (v_e.value #>> '{}')::numeric;
      get diagnostics v_res = row_count;
      v_n := v_n + v_res;
    end loop;
    return jsonb_build_object('alcance', 'todas', 'variantes', v_n, 'prenda_entera', false);
  end if;

  -- El precio de ESTA tienda. ¿Las elegidas son todas las tallas activas (menos la de obsequio) y valen lo mismo? Entonces es el precio de la PRENDA.
  for v_activas in
    select count(*)::integer
      from retail.variantes v join retail.productos pr on pr.id = v.producto_id
     where v.producto_id = p_producto_id and v.activo
       and not (v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id))
  loop
    exit;
  end loop;
  for v_elegidas, v_distintos, v_unico in
    select count(*)::integer, count(distinct e.value)::integer, min((e.value #>> '{}')::numeric) from jsonb_each(v_mapa) e
  loop
    exit;
  end loop;

  perform set_config('retail.precio_desde_recepcion', 'on', true);
  if v_elegidas = v_activas and v_distintos = 1 then
    v_res := retail.poner_precio_sede(p_producto_id, v_despacho.ubicacion_destino_id, v_unico, 'Recepción ' || v_envio);
    perform set_config('retail.precio_desde_recepcion', 'off', true);
    return jsonb_build_object('alcance', 'sede', 'variantes', v_res, 'prenda_entera', true);
  end if;
  v_res := retail.poner_precio_sede_variantes(p_producto_id, v_despacho.ubicacion_destino_id, v_mapa, 'Recepción ' || v_envio);
  perform set_config('retail.precio_desde_recepcion', 'off', true);
  return jsonb_build_object('alcance', 'sede', 'variantes', v_res, 'prenda_entera', false);
end;
$fn$;
revoke all on function retail.cambiar_precios_en_recepcion(uuid, uuid, jsonb, text) from public, anon;
grant execute on function retail.cambiar_precios_en_recepcion(uuid, uuid, jsonb, text) to authenticated;
comment on function retail.cambiar_precios_en_recepcion(uuid, uuid, jsonb, text) is
  'ADR-0393 / ADR-0370 (act. 2026-10-28): el precio de varias combinaciones (color y talla) de una prenda de este envío abierto, todo o nada. '
  '«todas» = el precio general de cada una; «sede» = el de esta tienda (toda la prenda si eligió todas las tallas con un mismo precio; si no, una excepción por combinación).';

-- Dice si esos precios se podrían guardar y, si no, POR QUÉ, sin guardar nada: corre la función real dentro de una subtransacción que siempre
-- se deshace (lo escrito vuelve atrás y lo que la real rechazaría llega tal cual).
create or replace function retail.validar_precios_en_recepcion(
  p_despacho_id uuid, p_producto_id uuid, p_precios jsonb, p_alcance text
) returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_estado text;
  v_msg text;
  v_hint text;
begin
  begin
    perform retail.cambiar_precios_en_recepcion(p_despacho_id, p_producto_id, p_precios, p_alcance);
    raise exception 'Precio válido' using errcode = 'P0001', hint = 'precio_validado';
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
    if v_hint = 'precio_validado' then
      return jsonb_build_object('ok', true);
    end if;
    return jsonb_build_object('ok', false, 'codigo', v_estado, 'hint', nullif(v_hint, ''), 'motivo', v_msg);
  end;
end;
$fn$;
revoke all on function retail.validar_precios_en_recepcion(uuid, uuid, jsonb, text) from public, anon;
grant execute on function retail.validar_precios_en_recepcion(uuid, uuid, jsonb, text) to authenticated;
comment on function retail.validar_precios_en_recepcion(uuid, uuid, jsonb, text) is
  'ADR-0393 (act. 2026-10-28): ¿se podrían guardar esos precios por combinación? {ok} o {ok: false, codigo, hint, motivo}. No guarda nada.';

-- ---------- 3. Comprobación ----------
do $$
begin
  if position('lower(vv ->> ''variante_id'')' in pg_get_functiondef('retail.fn_envio_costos_prendas(jsonb,jsonb,text)'::regprocedure)) = 0 then
    raise exception 'fn_envio_costos_prendas no acepta el costo de una combinación';
  end if;
  if position('w.v ->> ''variante_id''' in pg_get_functiondef('retail.fn_recepcion_costos_a_variantes(jsonb,jsonb,numeric)'::regprocedure)) = 0 then
    raise exception 'fn_recepcion_costos_a_variantes no pone el costo de la combinación';
  end if;
  if to_regprocedure('retail.cambiar_precios_en_recepcion(uuid,uuid,jsonb,text)') is null
     or to_regprocedure('retail.validar_precios_en_recepcion(uuid,uuid,jsonb,text)') is null then
    raise exception 'faltan las funciones del precio por combinación en la recepción';
  end if;
end;
$$;

reset lock_timeout;

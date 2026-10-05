-- ============================================================================
-- 20261005120000_cola_arranque_sugerencias.sql — CAYLA V2 (ADR-0334, Felipe 2026-10-04)
-- «Identificar con sugerencias» antes de cerrar la cola de arranque: las ventas que tienen UNA sola prenda posible se identifican
-- de una vez, con la confirmación de un líder, y solo el resto se cierra sin prenda.
--
-- EL PROBLEMA. De las 97 ventas sin registrar de TRU (2026-10-04), 23 tienen exactamente una prenda del sistema con su misma categoría,
-- talla y color en stock. Cerrarlas «sin prenda» deja 23 prendas del sistema con 1 unidad de más hasta el próximo conteo; identificarlas
-- (`regularizar_prenda`, «ya estaba registrada») deja el stock cuadrado y la venta con su costo real. De las 170 de AQP solo 3 tienen
-- candidata: AQP casi no cargó su stock (13 prendas), así que allí casi todo se cierra.
--
-- UNA SOLA CANDIDATA NO ES CERTEZA. Si la prenda vendida nunca se cargó, la candidata es OTRA prenda que sigue colgada, y descontarla la
-- deja con 1 de menos. Por eso la base solo PROPONE y un líder CONFIRMA fila por fila (ADR-0328 decisión 9: «por eso confirma una
-- persona»). Dos o más candidatas, o ninguna: no se propone nada (sería adivinar).
--
-- UNA SOLA DEFINICIÓN DE «CANDIDATA» (integridad conceptual; acordado con la sesión del rediseño de Inventario, ADR-0328):
--   `fn_candidatas_de_venta` es la base: TODAS las parejas (venta pendiente, prenda posible) de una tienda. Quien muestre varias para que
--   la persona elija (el modal de una venta suelta) lee esa. `fn_cola_arranque_candidatas` queda ENCIMA: solo las ventas con
--   exactamente UNA, solo las que se pueden aplicar sin riesgo y sin pasarse de unidades: lo que un líder confirma en bloque.
--
-- LO QUE SE PROPONE TIENE QUE PODER APLICARSE (hallazgo de la revisión independiente, 2026-10-04). `regularizar_prenda` descuenta de la
-- PRIMERA fila de stock con cantidad >= 1 (el piso primero) y no mira cuarentena ni lo apartado. Si una prenda tiene una unidad apartada
-- o en cuarentena y otra libre, la fila que elija puede ser la que no se puede tocar y el lote entero falla (es todo o nada). Sin tocar
-- `regularizar_prenda` (es de otra sesión), la propuesta en bloque se limita a prendas «limpias»: toda unidad que tienen en la tienda es
-- stock libre, así que cualquier fila que elija es válida. Una prenda con algo apartado o en cuarentena se identifica a mano.
--
-- CONTRATOS
--   `fn_candidatas_de_venta(p_ubicacion_id)` — solo lectura. PROMETE: por cada venta pendiente de la tienda, una fila por cada prenda
--     activa con su misma categoría, talla y color y al menos 1 unidad disponible (stock de la tienda fuera de cuarentena, menos lo
--     apartado). `limpia` dice si TODA unidad de esa prenda en la tienda es libre. No hay tope por unidades ni «única». ASUME: quien
--     opera esa tienda (`fn_puede_operar_ubicacion`): no muestra nada que Existencias no muestre ya.
--   `fn_cola_arranque_candidatas(p_ubicacion_id)` — solo lectura, SOLO LÍDER. PROMETE: las ventas con EXACTAMENTE una prenda posible, esa
--     prenda «limpia», sin proponer más ventas por prenda que unidades (las más antiguas primero).
--   `regularizar_prendas_sugeridas(p_ubicacion_id, p_pares)` — PROMETE: regulariza TODAS las parejas como «ya estaba registrada» o
--     NINGUNA (una transacción), y devuelve cuántas. EXIGE: cuenta de líder, parejas de ESA tienda cuyas categoría/talla/color coinciden
--     (no se acepta una pareja inventada), entre 1 y 500. Toma los candados en el orden de ADR-0190 (cola → prendas → stock) antes de
--     su bucle, igual que `registrar_venta`: una venta de caja y un lote no se esperan en círculo. Si una pareja falla, el error conserva
--     su mensaje y su código y NOMBRA la venta («Venta «Blusa negra M»…») para que el líder sepa cuál desmarcar.
--
-- SE ROMPE SI: el stock cambió mientras el líder revisaba (alguien vendió la última unidad de esa prenda): la pareja falla y NO se aplica
--   ninguna; la pantalla vuelve a buscar las sugerencias.
--
-- PRODUCCIÓN: pegar con OK de Felipe, tras 20261005100000/100/200. Un solo archivo: solo `create or replace` y una alta.
-- Ya lleva `retail.`. Se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La base: todas las parejas posibles ----------
create or replace function retail.fn_candidatas_de_venta(p_ubicacion_id uuid)
returns table (prenda_id uuid, variante_id uuid, disponible integer, limpia boolean)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
begin
  if p_ubicacion_id is null or not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'cola_sin_permiso_sede' using errcode = '42501', hint = 'No tienes permiso para ver las prendas posibles de esa tienda';
  end if;

  return query
  with por_prenda as (
    -- Lo que de verdad se puede haber vendido (`hay`): stock de la tienda fuera de cuarentena y sin lo apartado. Y si TODA unidad de
    -- la prenda en la tienda es libre (`limpia`): ninguna fila positiva está apartada ni en cuarentena.
    select s.variante_id,
           sum(s.cantidad - coalesce(s.cantidad_apartada, 0)) filter (where coalesce(sb.tipo, '') <> 'cuarentena')::integer as hay,
           coalesce(bool_and(coalesce(s.cantidad_apartada, 0) = 0 and coalesce(sb.tipo, '') <> 'cuarentena') filter (where s.cantidad >= 1), false) as limpia
      from stock s
      left join sububicaciones sb on sb.id = s.sububicacion_id
     where s.ubicacion_id = p_ubicacion_id
     group by s.variante_id
  )
  select p.id, v.id, pp.hay, pp.limpia
    from prendas_por_regularizar p
    join productos pr on pr.categoria_id = p.categoria_id
    join variantes v on v.producto_id = pr.id and v.talla_id = p.talla_id and v.color_codigo = p.color_codigo
                    and v.activo and v.id <> c_cargo_especial
    join por_prenda pp on pp.variante_id = v.id and pp.hay >= 1
   where p.ubicacion_id = p_ubicacion_id and p.estado = 'pendiente'
   order by p.vendido_en, p.id, v.id;
end;
$$;

comment on function retail.fn_candidatas_de_venta(uuid) is
  'ADR-0334: todas las parejas (venta sin registrar pendiente, prenda posible) de una tienda: misma categoría, talla y color, con al menos 1 unidad disponible fuera de cuarentena y sin lo apartado. limpia = toda unidad de la prenda en la tienda es libre. Solo lectura, para quien opera la tienda.';
revoke all on function retail.fn_candidatas_de_venta(uuid) from public, anon;
grant execute on function retail.fn_candidatas_de_venta(uuid) to authenticated;

-- ---------- 2. Las que un líder puede confirmar en bloque: exactamente UNA, limpia, sin pasarse de unidades ----------
create or replace function retail.fn_cola_arranque_candidatas(p_ubicacion_id uuid)
returns table (prenda_id uuid, variante_id uuid, en_stock integer)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
begin
  if not fn_es_lider() then
    raise exception 'cola_solo_lider' using errcode = '42501', hint = 'Solo un líder puede revisar las sugerencias de la cola de arranque';
  end if;
  if p_ubicacion_id is null or not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'cola_sin_permiso_sede' using errcode = '42501', hint = 'No tienes permiso para revisar la cola de esa tienda';
  end if;

  return query
  with todas as (
    select t.prenda_id, t.variante_id, t.disponible, t.limpia from fn_candidatas_de_venta(p_ubicacion_id) t
  ),
  unicas as (
    -- Exactamente UNA prenda posible (con dos o más, elegir sería adivinar) y «limpia» (toda unidad es libre: cualquier fila de stock
    -- que elija `regularizar_prenda` se puede descontar).
    select t.prenda_id, t.variante_id, t.disponible
      from todas t
     where t.limpia and (select count(*) from todas t2 where t2.prenda_id = t.prenda_id) = 1
  ),
  topadas as (
    select u.prenda_id, u.variante_id, u.disponible, p.vendido_en,
           row_number() over (partition by u.variante_id order by p.vendido_en, u.prenda_id) as turno
      from unicas u
      join prendas_por_regularizar p on p.id = u.prenda_id
  )
  select t.prenda_id, t.variante_id, t.disponible from topadas t where t.turno <= t.disponible order by t.vendido_en, t.prenda_id;
end;
$$;

comment on function retail.fn_cola_arranque_candidatas(uuid) is
  'ADR-0334: las ventas sin registrar pendientes de una tienda con EXACTAMENTE una prenda posible (fn_candidatas_de_venta), esa prenda «limpia», sin proponer más ventas que unidades. Solo líder. Solo lectura.';
revoke all on function retail.fn_cola_arranque_candidatas(uuid) from public, anon;
grant execute on function retail.fn_cola_arranque_candidatas(uuid) to authenticated;

-- ---------- 3. Confirmar las parejas que el líder revisó ----------
create or replace function retail.regularizar_prendas_sugeridas(p_ubicacion_id uuid, p_pares jsonb)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  v_par record;
  v_n integer := 0;
  v_variantes uuid[];
  v_descripcion text;
  v_hint text;
begin
  if not fn_es_lider() then
    raise exception 'cola_solo_lider' using errcode = '42501', hint = 'Solo un líder puede identificar ventas con sugerencias';
  end if;
  if p_ubicacion_id is null or not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'cola_sin_permiso_sede' using errcode = '42501', hint = 'No tienes permiso para identificar ventas de esa tienda';
  end if;
  if p_pares is null or jsonb_typeof(p_pares) <> 'array' or jsonb_array_length(p_pares) not between 1 and 500 then
    raise exception 'cola_pares_invalidos' using hint = 'Elige al menos una venta (hasta 500 a la vez)';
  end if;

  -- ADR-0190: los candados se toman en un orden fijo ANTES del bucle (filas de la cola por id → prendas → stock). Así un lote y una venta de
  -- caja (`registrar_venta` pre-bloquea el stock en el mismo orden), o dos líderes a la vez, nunca se esperan en círculo.
  perform 1 from prendas_por_regularizar
    where id in (select (e ->> 'prenda_id')::uuid from jsonb_array_elements(p_pares) e)
    order by id for update;
  select coalesce(array_agg(distinct (e ->> 'variante_id')::uuid), '{}') into v_variantes from jsonb_array_elements(p_pares) e;
  perform fn_bloquear_en_orden(p_ubicacion_id, v_variantes, true);

  for v_par in
    select (e ->> 'prenda_id')::uuid as prenda_id, (e ->> 'variante_id')::uuid as variante_id
      from jsonb_array_elements(p_pares) e
     order by 1, 2
  loop
    -- La pareja tiene que ser de ESTA sede y calzar en categoría, talla y color: una pareja inventada por la web no pasa.
    if not exists (
      select 1
        from prendas_por_regularizar p
        join variantes v on v.id = v_par.variante_id and v.talla_id = p.talla_id and v.color_codigo = p.color_codigo and v.id <> c_cargo_especial
        join productos pr on pr.id = v.producto_id and pr.categoria_id = p.categoria_id
       where p.id = v_par.prenda_id and p.ubicacion_id = p_ubicacion_id
    ) then
      raise exception 'cola_pares_invalidos' using hint = 'Una de las ventas ya no calza con la prenda sugerida: recarga y vuelve a revisar';
    end if;

    begin
      perform regularizar_prenda(v_par.prenda_id, v_par.variante_id, 'ya_registrada');
    exception when others then
      -- Se conserva el mensaje y el código de la base (la web los traduce) y se agrega CUÁL venta falló; el lote entero se deshace igual.
      get stacked diagnostics v_hint = pg_exception_hint;
      select p.descripcion into v_descripcion from prendas_por_regularizar p where p.id = v_par.prenda_id;
      raise exception '%', sqlerrm using errcode = sqlstate,
        hint = format('Venta «%s»: no se aplicó ninguna de las que marcaste.%s', coalesce(v_descripcion, '?'), coalesce(' ' || v_hint, ''));
    end;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

comment on function retail.regularizar_prendas_sugeridas(uuid, jsonb) is
  'ADR-0334: un líder confirma parejas (venta sin registrar, prenda) que revisó y todas se regularizan como «ya estaba registrada», o ninguna. Cada una pasa por regularizar_prenda; los candados se toman en el orden de ADR-0190 y un fallo nombra la venta.';
revoke all on function retail.regularizar_prendas_sugeridas(uuid, jsonb) from public, anon;
grant execute on function retail.regularizar_prendas_sugeridas(uuid, jsonb) to authenticated;

-- Sin combo «Responsable»: la cuenta del líder firma (cada pareja pasa por `regularizar_prenda`, que firma con la misma cuenta).
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('cola_arranque_identificar', 'Identificar con sugerencias las ventas sin registrar de una tienda (varias a la vez)')
on conflict (clave) do nothing;

do $v$
begin
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace
        and proname in ('fn_candidatas_de_venta', 'fn_cola_arranque_candidatas', 'regularizar_prendas_sugeridas')) <> 3 then
    raise exception 'cola de arranque: deben quedar una fn_candidatas_de_venta, una fn_cola_arranque_candidatas y una regularizar_prendas_sugeridas';
  end if;
  if pg_get_functiondef('retail.regularizar_prendas_sugeridas(uuid, jsonb)'::regprocedure) not like '%fn_bloquear_en_orden%' then
    raise exception 'cola de arranque: regularizar_prendas_sugeridas perdió el bloqueo en orden de ADR-0190';
  end if;
  if not exists (select 1 from retail.acciones_sin_responsable where clave = 'cola_arranque_identificar') then
    raise exception 'cola de arranque: falta la acción sin responsable de identificar';
  end if;
end
$v$;

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
-- deja con 1 de menos. Por eso la base solo PROPONE y un líder CONFIRMA fila por fila (casillas en la pantalla; ADR-0328 decisión 9:
-- «por eso confirma una persona»). Dos o más candidatas, o ninguna: no se propone nada (sería adivinar).
--
-- CONTRATOS
--   `fn_cola_arranque_candidatas(p_ubicacion_id)` — solo lectura. PROMETE: por cada venta pendiente de la sede con EXACTAMENTE una
--     prenda posible (activa, misma categoría/talla/color, con al menos 1 unidad disponible en la sede fuera de cuarentena), la
--     pareja (venta, prenda) y cuánto hay. Nunca propone más ventas por prenda que unidades disponibles (las más antiguas primero):
--     confirmar todo no puede quedarse sin stock a la mitad. ASUME: cuenta de líder que opera la sede.
--   `regularizar_prendas_sugeridas(p_ubicacion_id, p_pares)` — PROMETE: regulariza TODAS las parejas como «ya estaba registrada»
--     (descuenta 1 de cada prenda, la venta pasa a su prenda real) o NINGUNA (una transacción), y devuelve cuántas. EXIGE: cuenta de
--     líder, parejas de ESA sede cuyas categoría/talla/color coinciden (no se acepta una pareja inventada), entre 1 y 500.
--     Cada pareja pasa por `regularizar_prenda`: sus candados (permiso, estado, stock) valen igual.
--
-- SE ROMPE SI: el stock cambió mientras el líder revisaba (alguien vendió la última unidad de esa prenda): la pareja falla con
--   `prenda_sin_stock_para_descontar` y NO se aplica ninguna; la pantalla dice que se recargue y se revise otra vez.
--
-- PRODUCCIÓN: pegar con OK de Felipe, tras 20261005100000/100/200. Un solo archivo: solo `create or replace` y una alta.
-- Ya lleva `retail.`. Se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Las parejas que se pueden proponer ----------
create or replace function retail.fn_cola_arranque_candidatas(p_ubicacion_id uuid)
returns table (prenda_id uuid, variante_id uuid, en_stock integer)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
begin
  if not fn_es_lider() then
    raise exception 'cola_solo_lider' using errcode = '42501', hint = 'Solo un líder puede revisar las sugerencias de la cola de arranque';
  end if;
  if p_ubicacion_id is null or not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'cola_sin_permiso_sede' using errcode = '42501', hint = 'No tienes permiso para revisar la cola de esa tienda';
  end if;

  return query
  with disponibles as (
    -- Lo que de verdad se puede haber vendido: stock de la sede fuera de cuarentena y sin lo apartado para una cliente.
    select s.variante_id, sum(s.cantidad - coalesce(s.cantidad_apartada, 0))::integer as hay
      from stock s
      join sububicaciones sb on sb.id = s.sububicacion_id and sb.tipo <> 'cuarentena'
     where s.ubicacion_id = p_ubicacion_id
     group by s.variante_id
    having sum(s.cantidad - coalesce(s.cantidad_apartada, 0)) >= 1
  ),
  posibles as (
    select p.id as pid, p.vendido_en, v.id as vid, d.hay
      from prendas_por_regularizar p
      join productos pr on pr.categoria_id = p.categoria_id
      join variantes v on v.producto_id = pr.id and v.talla_id = p.talla_id and v.color_codigo = p.color_codigo
                      and v.activo and v.id <> c_cargo_especial
      join disponibles d on d.variante_id = v.id
     where p.ubicacion_id = p_ubicacion_id and p.estado = 'pendiente'
  ),
  unicas as (
    -- Exactamente UNA prenda posible: con dos o más, elegir sería adivinar.
    select pid, vendido_en, (array_agg(vid))[1] as vid, max(hay) as hay
      from posibles
     group by pid, vendido_en
    having count(*) = 1
  ),
  topadas as (
    select u.pid, u.vid, u.hay, u.vendido_en,
           row_number() over (partition by u.vid order by u.vendido_en, u.pid) as turno
      from unicas u
  )
  select t.pid, t.vid, t.hay from topadas t where t.turno <= t.hay order by t.vendido_en, t.pid;
end;
$$;

comment on function retail.fn_cola_arranque_candidatas(uuid) is
  'ADR-0334: las ventas sin registrar pendientes de una sede que tienen EXACTAMENTE una prenda posible (misma categoría, talla y color, con stock fuera de cuarentena), sin proponer más ventas que unidades. Solo líder. Solo lectura.';
revoke all on function retail.fn_cola_arranque_candidatas(uuid) from public, anon;
grant execute on function retail.fn_cola_arranque_candidatas(uuid) to authenticated;

-- ---------- 2. Confirmar las parejas que el líder revisó ----------
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

  -- En un orden fijo (por id): dos líderes a la vez toman los candados de las filas en el mismo orden (sin deadlock) y el resultado no depende del azar.
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
    perform regularizar_prenda(v_par.prenda_id, v_par.variante_id, 'ya_registrada');
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

comment on function retail.regularizar_prendas_sugeridas(uuid, jsonb) is
  'ADR-0334: un líder confirma parejas (venta sin registrar, prenda) que revisó y todas se regularizan como «ya estaba registrada», o ninguna. Cada una pasa por regularizar_prenda.';
revoke all on function retail.regularizar_prendas_sugeridas(uuid, jsonb) from public, anon;
grant execute on function retail.regularizar_prendas_sugeridas(uuid, jsonb) to authenticated;

-- Sin combo «Responsable»: la cuenta del líder firma (cada pareja pasa por `regularizar_prenda`, que firma con la misma cuenta).
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('cola_arranque_identificar', 'Identificar con sugerencias las ventas sin registrar de una tienda (varias a la vez)')
on conflict (clave) do nothing;

do $v$
begin
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_cola_arranque_candidatas', 'regularizar_prendas_sugeridas')) <> 2 then
    raise exception 'cola de arranque: deben quedar una fn_cola_arranque_candidatas y una regularizar_prendas_sugeridas';
  end if;
  if not exists (select 1 from retail.acciones_sin_responsable where clave = 'cola_arranque_identificar') then
    raise exception 'cola de arranque: falta la acción sin responsable de identificar';
  end if;
end
$v$;

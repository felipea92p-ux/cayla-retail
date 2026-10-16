-- ============================================================================
-- 20261016003000_apartados_adelanto_minimo_topes_y_vencimiento_diario.sql — CAYLA V2 · Apartados (ADR-0166)
-- Un apartado deja al menos el 30 %, una persona no aparta media tienda, y lo vencido se libera solo cada día.
--
-- EL PROBLEMA PRIMERO. Un apartado saca la prenda del piso por días. Hoy:
--   1. Se aparta con S/ 1 de adelanto: la prenda queda guardada 7 días (y sus extensiones) por casi nada, y si la persona no vuelve,
--      la tienda la perdió para vender en su mejor semana.
--   2. No hay tope por persona: la misma persona (o alguien que da nombres distintos con el mismo celular) puede tener abiertos
--      decenas de apartados y llevarse toda una talla de todas las tiendas.
--   3. Lo vencido se libera recién cuando alguien abre la pantalla de Apartados DE ESA TIENDA (`fn_vencer_separaciones`). Si nadie la
--      abre (tienda cerrada, un feriado, la encargada que trabaja en Vender), la prenda sigue apartada; y un apartado simple de
--      Existencias (sin adelanto) no se libera nunca solo.
--
-- QUÉ CAMBIA (Felipe 2026-10-15: D1, D2 y D4).
--   a) `separar_prendas`: el adelanto es al menos el 30 % del total (redondeado hacia arriba al céntimo). `editar_separacion`: si suma
--      prendas y el adelanto (con los abonos) queda debajo del 30 % del total nuevo, pide un abono primero.
--   b) Topes por persona en TODAS las tiendas, sin excepción para el líder: a lo sumo 3 apartados abiertos y 2 de una misma prenda y
--      talla entre todos ellos. La persona se reconoce por su ficha, su DNI o su celular (cualquiera de los tres:
--      `fn_separaciones_abiertas_de`). Sin ninguno de los tres no se puede cruzar con nada: cuenta solo el apartado de ahora.
--   c) `fn_vencer_apartados_de_todas` (nueva, solo del servidor), que corre cada día (`/api/apartados/vencer`, Vercel): libera en todas
--      las tiendas lo que `fn_vencer_separaciones` libera al abrir la pantalla (vencido hace más de 2 días, la misma gracia), y además
--      los apartados simples de Existencias con su fecha pasada hace más de 2 días. NO toca los pedidos entre tiendas
--      (`separacion_pedidos`) ni los pedidos web (tienen su propio cierre). El adelanto de un apartado liberado se devuelve como hoy
--      (queda «Devolver S/…» en la lista).
--   d) `fn_vencer_separaciones` (al abrir la pantalla) usa la misma pieza (`fn_vencer_separaciones_de`): una sola regla de vencimiento.
--
-- QUÉ NO CAMBIA. El plazo de 7 días y sus extensiones (D3), quién libera a mano, el tope de S/ 700 de la boleta sin DNI, la devolución.
-- Los apartados ya abiertos no se tocan: los topes y el mínimo miran lo NUEVO (un apartado viejo con poco adelanto sigue igual).
--
-- CÓMO. Reemplazos anclados en líneas de código (los comentarios de `editar_separacion` difieren entre local y producción; la lógica
-- no) con el md5 NORMALIZADO del cuerpo (sin comentarios ni espacios, como 20261003235000) de antes y de después.
--
-- PRODUCCIÓN. Una sola parte, idempotente. Solo funciones: no toca tablas ni políticas. Publicar antes la web de este PR (el formulario
-- ya pide el 30 %); si se pega antes, la base lo rechaza con su propio mensaje y no se escribe nada.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Varios anclajes de UNA función en un solo `create or replace` (plpgsql valida el cuerpo entero). Cada ancla aparece una vez; si su
-- texto nuevo ya está, ese par ya se aplicó.
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejos text[], p_nuevos text[])
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
  v_cambio boolean := false;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  for i in 1 .. cardinality(p_viejos) loop
    continue when position(p_nuevos[i] in v_def) > 0;
    v_n := (length(v_def) - length(replace(v_def, p_viejos[i], ''))) / length(p_viejos[i]);
    if v_n <> 1 then
      raise exception '% cambió desde que se escribió esta migración: el ancla % aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
        p_firma, i, v_n;
    end if;
    v_def := replace(v_def, p_viejos[i], p_nuevos[i]);
    v_cambio := true;
  end loop;
  if v_cambio then
    execute v_def;
  end if;
end;
$f$;

-- Las funciones que se parchan, contra el md5 normalizado de producción del 2026-10-15 (antes) y el de este archivo (después).
do $$
declare
  r record;
  v_md5 text;
begin
  for r in
    select * from (values
      ('retail.separar_prendas(uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid)',
       '9acf4ba54a358b7708a8e163fed1aec2', '84578f2e4e18d0982125b40c2430b4d3'),
      ('retail.editar_separacion(uuid, uuid[], jsonb, uuid)', '0e10c1949d74ad312d3707385157ee38', '317603ec3b0e4e568e3c6b9d19b12093'),
      ('retail.fn_vencer_separaciones(uuid)', '439ec39862ad722195403479648344b1', 'a08fdcdc384f004562120e97615cd755')
    ) as t (firma, antes, despues)
  loop
    v_md5 := (select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
                from pg_proc p where p.oid = to_regprocedure(r.firma));
    if v_md5 is null or v_md5 not in (r.antes, r.despues) then
      raise exception '% tiene otro cuerpo (md5 normalizado %): no es el de producción del 2026-10-15 ni el de este archivo. Reescribe el reemplazo desde su definición real antes de pegar.',
        r.firma, coalesce(v_md5, 'ninguno');
    end if;
  end loop;
end $$;

-- ---- b) Quién es la misma persona ----------------------------------------------------------------------------------------------
-- Los apartados ABIERTOS de una persona en todas las tiendas: los de su ficha, su DNI o su celular (cualquiera de los tres coincide).
-- Un dato vacío no junta a nadie (dos apartados sin celular no son de la misma persona). Pieza interna: la llaman las funciones que
-- apartan, nunca la pantalla.
create or replace function retail.fn_separaciones_abiertas_de(p_clienta_id uuid, p_dni text, p_celular text)
returns uuid[]
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(array_agg(s.id order by s.id), '{}')
    from retail.separaciones s
   where s.estado = 'abierta'
     and ((p_clienta_id is not null and s.clienta_id = p_clienta_id)
          or (nullif(p_dni, '') is not null and s.clienta_dni = p_dni)
          or (nullif(p_celular, '') is not null and s.clienta_celular = p_celular));
$$;
revoke all on function retail.fn_separaciones_abiertas_de(uuid, text, text) from public, anon, authenticated;

-- ---- a) y b) «Apartar»: el 30 % y los topes ---------------------------------------------------------------------------------------
select pg_temp.reemplazar_anclado(
  'retail.separar_prendas(uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid)',
  array[
    $v$  v_igv numeric; v_subtotal numeric; v_comp uuid; v_detalle text;
$v$,
    $v$  if v_adelanto > v_total then
    raise exception 'El adelanto (S/%) no puede pasar el total de las prendas (S/%)', v_adelanto, v_total;
  end if;
$v$
  ],
  array[
    $n$  v_igv numeric; v_subtotal numeric; v_comp uuid; v_detalle text;
  c_adelanto_minimo_pct constant integer := 30;   -- 20261016003000 (Felipe 2026-10-15, D1)
  c_tope_abiertos constant integer := 3;          -- 20261016003000 (D2): apartados abiertos por persona, en todas las tiendas
  c_tope_por_prenda constant integer := 2;        -- 20261016003000 (D2): de una misma prenda y talla, entre todos ellos
  v_minimo numeric;
  v_abiertos uuid[];
  v_ya integer;
$n$,
    $n$  if v_adelanto > v_total then
    raise exception 'El adelanto (S/%) no puede pasar el total de las prendas (S/%)', v_adelanto, v_total;
  end if;
  -- 20261016003000 (D1): al menos el 30 % del total, redondeado hacia arriba al céntimo (lo mismo que dice el formulario).
  v_minimo := ceil(v_total * c_adelanto_minimo_pct) / 100;
  if v_adelanto < v_minimo then
    raise exception 'El adelanto mínimo es S/% (el % %% de S/%).', to_char(v_minimo, 'FM999999990.00'), c_adelanto_minimo_pct,
      to_char(v_total, 'FM999999990.00')
      using errcode = 'P0001', hint = 'separacion_adelanto_minimo', detail = to_char(v_minimo, 'FM999999990.00');
  end if;
  -- 20261016003000 (D2): la misma persona (ficha, DNI o celular) en todas las tiendas, sin excepción para el líder.
  v_abiertos := retail.fn_separaciones_abiertas_de(p_clienta_id, v_dni, v_celular);
  if cardinality(v_abiertos) >= c_tope_abiertos then
    raise exception 'Este cliente ya tiene % apartados abiertos. Para apartar otro, entrega o libera uno.', cardinality(v_abiertos)
      using errcode = 'P0001', hint = 'separacion_tope_abiertos', detail = c_tope_abiertos::text;
  end if;
  for v_item in
    select (e ->> 'variante_id')::uuid as variante_id, sum((e ->> 'cantidad')::integer)::integer as cantidad
      from jsonb_array_elements(p_items) e group by 1
  loop
    v_ya := (select coalesce(sum(si.cantidad), 0) from retail.separacion_items si
              where si.separacion_id = any (v_abiertos) and si.variante_id = v_item.variante_id);
    if v_ya + v_item.cantidad > c_tope_por_prenda then
      select p.referencia, coalesce(v.codigo, v.sku, 'sin código') into v_ref, v_sku
        from retail.variantes v join retail.productos p on p.id = v.producto_id where v.id = v_item.variante_id;
      raise exception '%', format('Se aparta hasta %s de una misma prenda y talla por cliente (%s %s)%s.', c_tope_por_prenda, v_ref, v_sku,
        case when v_ya > 0 then format(': ya tiene %s en otro apartado abierto', v_ya) else '' end)
        using errcode = 'P0001', hint = 'separacion_tope_prenda', detail = v_ref || ' (' || v_sku || ')';
    end if;
  end loop;
$n$
  ]
);

-- ---- a) y b) «Editar» un apartado: lo que suma respeta los topes y el 30 % ------------------------------------------------------
select pg_temp.reemplazar_anclado(
  'retail.editar_separacion(uuid, uuid[], jsonb, uuid)',
  array[
    $v$  v_q uuid;
$v$,
    $v$    v_apartado := apartar_stock(v_item.variante_id, s.ubicacion_id, v_item.cantidad,
$v$,
    $v$  if v_total < s.adelanto then
$v$
  ],
  array[
    $n$  v_q uuid;
  c_adelanto_minimo_pct constant integer := 30;   -- 20261016003000 (D1)
  c_tope_por_prenda constant integer := 2;        -- 20261016003000 (D2)
  v_abiertos uuid[];
  v_ya integer;
  v_minimo numeric;
$n$,
    $n$    -- 20261016003000 (D2): hasta 2 de una misma prenda y talla entre todos los apartados abiertos de la persona (este incluido, ya
    -- sin lo que se quitó arriba).
    v_abiertos := coalesce(v_abiertos, retail.fn_separaciones_abiertas_de(s.clienta_id, s.clienta_dni, s.clienta_celular) || s.id);
    v_ya := (select coalesce(sum(si.cantidad), 0) from retail.separacion_items si
              where si.separacion_id = any (v_abiertos) and si.variante_id = v_item.variante_id);
    if v_ya + v_item.cantidad > c_tope_por_prenda then
      raise exception '%', format('Se aparta hasta %s de una misma prenda y talla por cliente (%s %s): ya tiene %s entre sus apartados abiertos.',
        c_tope_por_prenda, v_ref, coalesce(v_sku, ''), v_ya)
        using errcode = 'P0001', hint = 'separacion_tope_prenda', detail = v_ref || ' (' || coalesce(v_sku, '') || ')';
    end if;
    v_apartado := apartar_stock(v_item.variante_id, s.ubicacion_id, v_item.cantidad,
$n$,
    $n$  -- 20261016003000 (D1): si sumó prendas, lo pagado (adelanto y abonos) sigue siendo al menos el 30 % del total nuevo.
  v_minimo := ceil(v_total * c_adelanto_minimo_pct) / 100;
  if jsonb_array_length(coalesce(p_agregar, '[]'::jsonb)) > 0 and s.adelanto < v_minimo then
    raise exception 'Con lo que suma, el adelanto mínimo es S/% (el % %% de S/%) y lleva S/%: registra antes un abono.',
      to_char(v_minimo, 'FM999999990.00'), c_adelanto_minimo_pct, to_char(v_total, 'FM999999990.00'), to_char(s.adelanto, 'FM999999990.00')
      using errcode = 'P0001', hint = 'separacion_adelanto_minimo', detail = to_char(v_minimo, 'FM999999990.00');
  end if;
  if v_total < s.adelanto then
$n$
  ]
);

-- ---- c) y d) El vencimiento: una sola regla, al abrir la pantalla y cada día -----------------------------------------------------
-- Lo vencido de UNA tienda, sin preguntar permisos (lo llaman la pantalla, después de preguntarlos, y el barrido diario). Es el cuerpo
-- de siempre de `fn_vencer_separaciones` (ADR-0166, D3): vencido hace más de 2 días; lo que una caja está entregando se salta.
create or replace function retail.fn_vencer_separaciones_de(p_ubicacion_id uuid)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_gracia_dias constant integer := 2;
  v_hoy date := fn_hoy_lima();
  s separaciones%rowtype;
  v_ap uuid;
  v_n integer := 0;
begin
  for s in
    select * from separaciones
     where ubicacion_id = p_ubicacion_id and estado = 'abierta' and vence_el + c_gracia_dias < v_hoy
     order by vence_el
     for update skip locked            -- si una caja la está entregando ahora mismo, no se pisa
  loop
    for v_ap in select apartado_id from separacion_items where separacion_id = s.id loop
      perform fn_cerrar_apartado_de_separacion(v_ap, 'clienta_no_vino', null);
    end loop;
    update separaciones
       set estado = 'liberada', liberada_en = now(), liberada_por = null, liberada_motivo = 'vencio'
     where id = s.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function retail.fn_vencer_separaciones_de(uuid) from public, anon, authenticated;

create or replace function retail.fn_vencer_separaciones(p_ubicacion_id uuid)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso sobre los apartados de esa tienda';
  end if;
  return retail.fn_vencer_separaciones_de(p_ubicacion_id);
end;
$$;

-- El barrido diario (Vercel, `/api/apartados/vencer`), con la llave de servicio: los apartados vencidos de TODAS las tiendas y los
-- apartados simples de Existencias con su fecha pasada hace más de 2 días. No toca un apartado de otro camino: de un apartado con
-- adelanto (lo libera arriba), de un pedido entre tiendas (`separacion_pedidos`), de un pedido web (`pedido_web_lineas`) ni de una venta.
create or replace function retail.fn_vencer_apartados_de_todas()
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_gracia_dias constant integer := 2;
  v_hoy date := fn_hoy_lima();
  v_ub uuid;
  v_sep integer := 0;
  v_simples integer := 0;
  v_ap uuid;
begin
  for v_ub in
    select distinct s.ubicacion_id from separaciones s
     where s.estado = 'abierta' and s.vence_el + c_gracia_dias < v_hoy
     order by 1
  loop
    v_sep := v_sep + retail.fn_vencer_separaciones_de(v_ub);
  end loop;

  for v_ap in
    select a.id from apartados a
     where a.estado = 'abierto' and a.vence_el is not null and a.vence_el + c_gracia_dias < v_hoy
       and a.separacion_id is null and a.venta_id is null
       and not exists (select 1 from separacion_pedidos sp where sp.apartado_id = a.id or sp.apartado_origen_id = a.id)
       and not exists (select 1 from pedido_web_lineas l where l.apartado_id = a.id)
     order by a.vence_el, a.id
     for update skip locked
  loop
    perform fn_cerrar_apartado_de_separacion(v_ap, 'clienta_no_vino', null);
    v_simples := v_simples + 1;
  end loop;

  return jsonb_build_object('apartados_con_adelanto', v_sep, 'apartados_simples', v_simples);
end;
$$;
revoke all on function retail.fn_vencer_apartados_de_todas() from public, anon, authenticated;
grant execute on function retail.fn_vencer_apartados_de_todas() to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'tienda_web') then
    revoke all on function retail.fn_vencer_apartados_de_todas() from tienda_web;
    revoke all on function retail.fn_vencer_separaciones_de(uuid) from tienda_web;
    revoke all on function retail.fn_separaciones_abiertas_de(uuid, text, text) from tienda_web;
  end if;
end $$;

reset lock_timeout;

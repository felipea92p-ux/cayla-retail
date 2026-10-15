-- ============================================================================
-- 20261016001000_pedidos_web_topes_y_anulacion_sin_pagar.sql — CAYLA V2 · Tienda online (ADR-0408)
-- Los pedidos web que nadie paga se anulan solos, una persona no separa media tienda, y un pago digital lo anota el líder.
--
-- EL PROBLEMA PRIMERO. Con la tienda online abierta a cualquiera que cree una cuenta, tres cosas que el piloto resolvía «a mano»
-- quedan sin dueño:
--   1. Un pedido confirmado reserva las prendas (salen del «hay» de todas las tiendas). Si el cliente nunca paga, la prenda queda
--      apartada hasta que alguien en la tienda lo anule; a las 48 h el ERP solo AVISA. Con decenas de cuentas, eso es stock que
--      no se vende por semanas.
--   2. «Separar» solo limitaba a 3 los pedidos POR CONFIRMAR. Uno confirmado ya no contaba: una sola cuenta podía tener abiertos
--      decenas de pedidos de 20 prendas cada uno, y la misma talla repetida, hasta vaciar la Vitrina de otros clientes.
--   3. La bolsa decía «alcanza / no alcanza» para cualquier cantidad de 1 a 20: preguntando con 1, 2, 3… se sabía cuántas quedan
--      exactamente en cada tienda.
--   4. Un pago por Yape, Plin o transferencia lo podía anotar cualquier persona con el módulo, con un n.º de operación que nadie
--      contrasta contra el banco: el pedido quedaba pagado y su boleta salía.
--
-- QUÉ CAMBIA (Felipe 2026-10-15: D2, D8 y D9).
--   a) `fn_anular_pedidos_web_sin_pagar` (nueva, solo del servidor): un pedido CONFIRMADO al que no se le pagó NADA, pasadas las horas
--      de «Si no paga» de Configuración ▸ Tienda web (de fábrica, 48), se anula solo con el motivo «El cliente no pagó» y sus prendas
--      vuelven a estar disponibles (el mismo camino que «Anular» del ERP: `anular_pedido_web`). No se toca un pedido con algún pago
--      (la tienda decide, como hoy) ni uno con un pago de pasarela en revisión. La corre el mismo cierre programado de cada 15 min
--      (`fn_cerrar_pedidos_web_sin_confirmar`, `/api/pedidos-web/cerrar-vencidos`). Un pedido pagado y sin recoger sigue solo avisando.
--   b) El candado `pedidos_web_cierre_coherente` acepta esa anulación sin persona: SOLO confirmado, sin pagar nada y por «no pagó».
--   c) `tienda_separar`: a lo sumo 3 separaciones ABIERTAS por cliente (por confirmar vigentes, confirmadas y pagadas sin recoger; antes,
--      solo las por confirmar) y a lo sumo 2 unidades de una misma prenda y talla entre todas ellas.
--   d) `tienda_bolsa`: pregunta por 2 como máximo de cada prenda. Así la respuesta es «hay 0, 1 o 2 o más», nunca la cifra.
--   e) `registrar_pago_pedido_web`: Yape, Plin o transferencia solo los anota quien es líder (ve la cuenta del banco) hasta que haya
--      una pasarela que confirme el pago sola. El efectivo sigue igual para todos.
--   f) `tienda_ayuda`: dice también las horas para pagar, para que «Cómo separar» se lo cuente al cliente antes de que pase.
--
-- QUÉ NO CAMBIA. El cierre de lo no confirmado (24 h), el aviso de lo pagado sin recoger, la anulación a mano, los textos de la tienda
-- para un pedido anulado por no pagar («No se registró tu pago a tiempo», ya existía), el tope de 20 prendas por pedido.
--
-- CÓMO. Reemplazos anclados (como 20261015232000) con su md5 de antes y de después: si una función cambió en vivo, se detiene sin tocar
-- nada. La función nueva y el cierre se escriben enteros.
--
-- PRODUCCIÓN. Una sola parte, idempotente. Toca un candado de `pedidos_web` (un `alter table` corto) y funciones; NO toca políticas.
-- Se pega después de publicar la tienda y el ERP de este PR (entienden `tienda_separar_tope_prenda` y `pedido_web_pago_digital_solo_lider`);
-- si se pega antes, la tienda dice «no pudimos separar ahora» en el tope por prenda y el ERP muestra el texto de la base, sin escribir nada.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Varios anclajes de UNA función en un solo `create or replace` (plpgsql valida el cuerpo entero: una variable nueva y su primer uso
-- tienen que llegar juntos). Cada ancla debe aparecer una vez; si su texto nuevo ya está, ese par ya se aplicó.
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
    -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo abortaría.
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
-- Las funciones que se parchan, contra su md5 de producción del 2026-10-15 (antes) y el de este archivo (después).
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('retail.tienda_separar(uuid, uuid, jsonb, uuid)', 'ea68757f733673a7ddab90c7348fdbb3', '6398d88faf180468b8beb1644e95e625'),
      ('retail.tienda_bolsa(jsonb, uuid)', '10a228e1b75c149a718f562dbe5d223c', 'b74575f20358c31bd8ab86be3ff6860f'),
      ('retail.registrar_pago_pedido_web(uuid, numeric, text, text, uuid)', '3987d37993cd131496dcbe14c28ec46f', '16b7181c120b1a8caae7c4b954d057a8'),
      ('retail.fn_cerrar_pedidos_web_sin_confirmar()', 'f6e76e3902b7743a0078d374d06f37aa', '8195dc6083af04099066f82ca93009de'),
      ('retail.tienda_ayuda()', '628bd7a5b8657e927363aaa3904614b2', 'deb0b5930765caf8b84341a78a5310b0')
    ) as t (firma, antes, despues)
  loop
    if coalesce((select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(r.firma)), 'ninguno') not in (r.antes, r.despues) then
      raise exception '% tiene otro cuerpo: no es el de producción del 2026-10-15 ni el de este archivo. Reescribe el reemplazo desde su definición real antes de pegar.',
        r.firma;
    end if;
  end loop;
end $$;

-- ---- b) El candado: la anulación sin persona, solo la del barrido ----------------------------------------------------------------
-- Igual al de antes salvo una cosa: un pedido anulado lleva quién lo cerró, O es un confirmado al que no se le pagó nada y se anuló
-- por «no pagó» (el barrido de `fn_anular_pedidos_web_sin_pagar`, que no tiene persona).
alter table retail.pedidos_web drop constraint if exists pedidos_web_cierre_coherente;
alter table retail.pedidos_web add constraint pedidos_web_cierre_coherente check (
  ((estado = any (array['vencido', 'anulado'])) = (cerrado_en is not null))
  and ((cerrado_en is null) = (cierre_motivo is null))
  and ((cerrado_en is not null) or (cerrado_por is null))
  and ((estado <> 'vencido') or ((cierre_motivo = 'sin_confirmar') and (cerrado_por is null)))
  and ((estado <> 'anulado') or (
        (cerrado_por is not null
         or (confirmado_en is not null and pagado_en is null and pagado = 0 and cierre_motivo = 'cliente_no_pago'))
        and (((confirmado_en is null) and (cierre_motivo = any (array['sin_stock', 'cliente_no_respondio', 'cliente_desistio'])))
             or ((confirmado_en is not null) and (pagado_en is null)
                 and (cierre_motivo = any (array['cliente_no_pago', 'cliente_desistio', 'error_en_pedido'])))
             or ((pagado_en is not null)
                 and (cierre_motivo = any (array['cliente_desistio', 'error_en_pedido', 'no_se_puede_entregar']))))))
);

-- ---- a) La anulación de lo confirmado que nadie pagó ----------------------------------------------------------------------------
create or replace function retail.fn_anular_pedidos_web_sin_pagar(p_horas_sin_pagar integer)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
  v_codigo text;
  v_n integer := 0;
  l record;
  r record;
begin
  perform retail.fn_pedido_web_plazos_validos(24, p_horas_sin_pagar, 7);
  -- Confirmado, sin NINGÚN pago aprobado y sin un pago de pasarela esperando (pendiente o en revisión): la tienda nunca recibió nada.
  -- Las horas corren desde que se confirmó (la misma cuenta que el aviso «sin pagar» de `fn_pedidos_web_estado_hoy` cuando no hay
  -- pago). Lo que otra corrida está anulando se salta (`skip locked`): correr dos a la vez es inofensivo.
  for v_id, v_codigo in
    select w.id, w.codigo
      from retail.pedidos_web w
     where w.estado = 'confirmado' and w.pagado = 0
       and w.confirmado_en + make_interval(hours => p_horas_sin_pagar) <= now()
       and not exists (select 1 from retail.pedido_web_pagos g
                        where g.pedido_id = w.id and g.estado in ('pendiente', 'por_revisar'))
     order by w.confirmado_en
     for update skip locked
  loop
    -- El mismo orden de candados que «Anular» del ERP (`anular_pedido_web`): primero el pedido, después el stock de cada tienda.
    for r in
      select x.ubicacion_id as ubic, array_agg(distinct x.variante_id) as variantes
        from retail.pedido_web_lineas x
       where x.pedido_id = v_id and x.estado = 'reservada'
       group by x.ubicacion_id
       order by x.ubicacion_id
    loop
      perform retail.fn_bloquear_en_orden(r.ubic, r.variantes);
    end loop;

    update retail.pedidos_web w
       set estado = 'anulado', cerrado_en = now(), cierre_motivo = 'cliente_no_pago'
     where w.id = v_id and w.estado = 'confirmado' and w.pagado = 0;
    if not found then
      continue;
    end if;
    for l in select x.id from retail.pedido_web_lineas x where x.pedido_id = v_id and x.estado = 'reservada' order by x.posicion loop
      update retail.pedido_web_lineas x set estado = 'liberada' where x.id = l.id;
      perform retail.fn_pedido_web_soltar(l.id, null,
        'Pedido web ' || v_codigo || ' anulado solo: no se pagó a tiempo. La prenda vuelve a estar disponible');
    end loop;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function retail.fn_anular_pedidos_web_sin_pagar(integer) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'tienda_web') then
    revoke all on function retail.fn_anular_pedidos_web_sin_pagar(integer) from tienda_web;
  end if;
end $$;

-- El cierre programado (cada 15 min): lo no confirmado en su plazo se cierra (como siempre) y, además, lo confirmado que nadie pagó en
-- las horas de «Si no paga» se anula. Los dos plazos se leen de Configuración ▸ Tienda web; ninguno se escribe aquí.
create or replace function retail.fn_cerrar_pedidos_web_sin_confirmar()
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_horas integer;
  v_horas_sin_pagar integer;
begin
  select c.horas_para_confirmar, c.horas_aviso_sin_pagar into v_horas, v_horas_sin_pagar
    from retail.configuracion_tienda_web c where c.id;
  if v_horas is null or v_horas_sin_pagar is null then
    raise exception 'Faltan los plazos de la tienda web (Configuración ▸ Tienda web).' using errcode = 'P0001', hint = 'tienda_web_sin_plazos';
  end if;
  return jsonb_build_object(
    'cerrados', retail.fn_cerrar_pedidos_web_vencidos(v_horas), 'horas_para_confirmar', v_horas,
    'anulados_sin_pagar', retail.fn_anular_pedidos_web_sin_pagar(v_horas_sin_pagar), 'horas_sin_pagar', v_horas_sin_pagar);
end;
$$;

-- ---- c) «Separar»: 3 separaciones abiertas y 2 de una misma prenda (los tres anclajes juntos) -----------------------------------
select pg_temp.reemplazar_anclado(
  'retail.tienda_separar(uuid, uuid, jsonb, uuid)',
  array[
    $v$  c_tope_por_confirmar constant integer := 3;  -- separaciones esperando que la tienda confirme, a la vez (Felipe, 2026-10-14)
  v_cuenta uuid;
  v_clienta uuid;
  v_por_confirmar integer;
$v$,
    $v$  -- El tope de separaciones esperando confirmación, DESPUÉS de la marca (el reintento de una que ya se guardó pasó arriba). Cuenta
  -- lo «por confirmar» vigente con la regla del motor (`fn_pedidos_web_estado_hoy`: pasado el plazo de Configuración ▸ Tienda web
  -- se lee vencido); los otros dos plazos no cambian el estado. La fila de la cuenta, tomada arriba, turna dos «Separar» a la vez.
  v_por_confirmar := (select count(*)
                        from retail.fn_pedidos_web_estado_hoy(
                               coalesce((select c.horas_para_confirmar from retail.configuracion_tienda_web c where c.id), 24),
                               48, 7, null, null, v_clienta) x
                       where x.estado = 'por_confirmar');
  if v_por_confirmar >= c_tope_por_confirmar then
    raise exception 'Ya tienes % separaciones esperando que la tienda confirme. Cuando confirme alguna, puedes separar otra.',
      c_tope_por_confirmar
      using errcode = '22023', hint = 'tienda_separar_tope', detail = c_tope_por_confirmar::text;
  end if;
$v$,
    $v$    -- Sigue en la Vitrina y se puede mostrar (activa, publicada y con precio en alguna tienda de la web: fn_vitrina_publicable).
$v$
  ],
  array[
    $n$  c_tope_abiertas constant integer := 3;  -- separaciones abiertas a la vez: por confirmar, confirmadas o pagadas sin recoger (D2)
  c_tope_por_prenda constant integer := 2;  -- unidades de una misma prenda y talla entre todas sus separaciones abiertas (D2)
  v_cuenta uuid;
  v_clienta uuid;
  v_abiertas uuid[];
  v_ya integer;
$n$,
    $n$  -- El tope de separaciones ABIERTAS (20261016001000, Felipe 2026-10-15, D2), DESPUÉS de la marca (el reintento de una que ya se
  -- guardó pasó arriba): por confirmar vigentes, confirmadas y pagadas sin recoger. Lo por confirmar pasado su plazo se lee vencido con
  -- la regla del motor (`fn_pedidos_web_estado_hoy`, el plazo de Configuración ▸ Tienda web) y no cuenta; los otros dos plazos no
  -- cambian el estado. La fila de la cuenta, tomada arriba, turna dos «Separar» a la vez.
  v_abiertas := array(select x.pedido_id
                        from retail.fn_pedidos_web_estado_hoy(
                               coalesce((select c.horas_para_confirmar from retail.configuracion_tienda_web c where c.id), 24),
                               48, 7, null, null, v_clienta) x
                       where x.estado in ('por_confirmar', 'confirmado', 'pagado'));
  if cardinality(v_abiertas) >= c_tope_abiertas then
    raise exception 'Ya tienes % separaciones abiertas. Cuando recojas alguna o se cierre, puedes separar otra.', c_tope_abiertas
      using errcode = '22023', hint = 'tienda_separar_tope', detail = c_tope_abiertas::text;
  end if;
$n$,
    $n$    -- Hasta 2 de una misma prenda y talla, contando las que ya separó y siguen abiertas (20261016001000, D2): cada línea de un
    -- pedido es una unidad; lo quitado, liberado o entregado ya no cuenta.
    v_ya := (select count(*) from retail.pedido_web_lineas l
              where l.pedido_id = any (v_abiertas) and l.variante_id = r.variante_id
                and l.estado in ('pendiente', 'reservada', 'por_conseguir'));
    if v_ya + r.cantidad > c_tope_por_prenda then
      raise exception 'Puedes separar hasta % de la misma prenda y talla, contando tus otras separaciones.', c_tope_por_prenda
        using errcode = '22023', hint = 'tienda_separar_tope_prenda', detail = r.variante_id::text;
    end if;

    -- Sigue en la Vitrina y se puede mostrar (activa, publicada y con precio en alguna tienda de la web: fn_vitrina_publicable).
$n$
  ]
);

-- ---- d) La bolsa pregunta por 2 como máximo de cada prenda ---------------------------------------------------------------------
-- 20261016001000 (D2): nunca más de 2 de una prenda (lo que «Separar» acepta). Así «alcanza» solo dice 0, 1 o «2 o más», y preguntar
-- con 3, 4, 5… no revela cuántas quedan.
select pg_temp.reemplazar_anclado(
  'retail.tienda_bolsa(jsonb, uuid)',
  array[$v$least(sum(c.cantidad), 20)::integer as cantidad$v$],
  array[$n$least(sum(c.cantidad), 2)::integer as cantidad$n$]
);

-- ---- e) Un pago digital lo anota el líder ---------------------------------------------------------------------------------------
-- El ancla es el final de la revisión del medio, ANTES de `v_persona := …`: el reemplazo de 20261015051000 (la venta al pagar) ancla
-- justo después de esa línea, y sus pruebas lo vuelven a pegar.
select pg_temp.reemplazar_anclado(
  'retail.registrar_pago_pedido_web(uuid, numeric, text, text, uuid)',
  array[$v$    raise exception 'Elige cómo pagó: efectivo, Yape, Plin o transferencia.' using errcode = '22023', hint = 'pedido_web_medio';
  end if;
$v$],
  array[$n$    raise exception 'Elige cómo pagó: efectivo, Yape, Plin o transferencia.' using errcode = '22023', hint = 'pedido_web_medio';
  end if;
  -- 20261016001000 (Felipe 2026-10-15, D8): un pago por Yape, Plin o transferencia deja el pedido pagado y hace salir su boleta, y su
  -- n.º de operación no se contrasta solo contra el banco. Hasta que una pasarela lo confirme, lo anota quien es líder (ve la cuenta).
  -- Se pregunta a la CUENTA, no al responsable del combo (ADR-0161).
  if p_medio <> 'efectivo' and not retail.fn_es_lider() then
    raise exception 'Un pago por Yape, Plin o transferencia de un pedido web lo registra el líder, que ve la cuenta del banco. Si te pagó en efectivo, elige «Efectivo».'
      using errcode = '42501', hint = 'pedido_web_pago_digital_solo_lider';
  end if;
$n$]
);

-- ---- f) La ayuda de la tienda dice el plazo para pagar ------------------------------------------------------------------------
-- «Cómo separar» le dice al cliente cuántas horas tiene para pagar un pedido confirmado: pasadas sin ningún pago, se anula solo (a). El
-- número es el mismo de Configuración ▸ Tienda web, nunca uno escrito en la tienda.
select pg_temp.reemplazar_anclado(
  'retail.tienda_ayuda()',
  array[$v$    'dias_para_recoger', (select c.dias_aviso_sin_recoger from retail.configuracion_tienda_web c where c.id),$v$],
  array[$n$    'dias_para_recoger', (select c.dias_aviso_sin_recoger from retail.configuracion_tienda_web c where c.id),
    'horas_para_pagar', (select c.horas_aviso_sin_pagar from retail.configuracion_tienda_web c where c.id),$n$]
);

reset lock_timeout;

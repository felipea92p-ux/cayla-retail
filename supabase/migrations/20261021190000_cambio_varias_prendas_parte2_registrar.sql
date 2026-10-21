-- ============================================================================================================
-- 20261021190000_cambio_varias_prendas_parte2_registrar.sql — CAYLA V2 · Cambios · una prenda por VARIAS (PARTE 2 de 3, ADR-0470)
--
-- EL PROBLEMA PRIMERO y la tabla, en 20261021185000_cambio_varias_prendas_parte1_tabla.sql. Esta parte es la función que guarda el cambio.
--
-- QUÉ HACE (parte 2): `registrar_cambio_varias(línea, sede, salidas, cantidad devuelta, medio, token, motivo, condición)`. La clienta
-- devuelve `p_cantidad` unidades de UNA línea de venta y se lleva `p_salidas` ([{variante_id, cantidad}, …], hasta 10 prendas distintas).
-- Todo en un solo guardado: o queda todo o no queda nada.
--   · La diferencia es el valor de TODO lo que se lleva (cada prenda a su precio de `fn_precio_para_cambio`, ADR-0370) menos lo que la
--     clienta PAGÓ por lo que devuelve (precio − descuento, ADR-0380): body de S/ 45.90 por dos Top Rib de S/ 35.90 = S/ 25.90 a cobrar.
--     Positiva, la clienta paga; negativa, se le devuelve; cero, ninguna plata se mueve (el medio sobra).
--   · Una entrada de la prenda devuelta (al piso, o a cuarentena si viene con defecto o uso) y una salida por cada prenda que se lleva, en
--     `movimientos` con el mismo `cambio_id`: la misma fuente de verdad de siempre. La salida la rechaza `fn_aplicar_movimiento` si no
--     queda stock en el piso: ninguna prenda a medias.
--   · Un renglón en `cambio_salidas` por cada prenda que se llevó, con el precio de ese momento.
--   · La fila de `cambios` es la de siempre: la prenda devuelta, la diferencia TOTAL, su medio (efectivo cuenta en el cierre de caja; QR,
--     Yape, tarjeta… caen en su cuenta, 20261021183000) y, como `variante_nueva_id`, la primera prenda.
-- Todo lo demás es `registrar_cambio` tal cual está HOY en producción (leída de la base viva, no de una migración vieja): permiso de sede,
-- token que sigue al contenido, plazo de cambio, línea bloqueada antes de contar, candados en orden fijo (ADR-0194), caja abierta si hay
-- efectivo, prenda sin precio rechazada (ADR-0385). Los disparadores de `cambios` (venta no anulada, liquidación, prenda por regularizar,
-- pedido web, terminal, cuenta sellada, efectivo no negativo) corren igual: miran la línea de venta, que es la misma.
--
-- DECIDÍ: NO tocar `registrar_cambio` (el camino de una por una, probado y en uso): este camino es una función aparte que comparte reglas,
-- no código. Duplicar ~60 líneas es más barato que reescribir lo que hoy funciona.
-- DECIDÍ: sin comprobante nuevo, como todo cambio hoy. Emitir nota de crédito y boleta por un cambio es una decisión de dinero y de SUNAT
-- aparte (ADR-0470); esta función no hace creer que se emitió nada.
-- DECIDÍ: no hay candado de líder cuando la diferencia es negativa, igual que `registrar_cambio` desde 20260923110500: es la regla viva.
-- DESCARTÉ: aceptar el mismo `variante_id` repetido en las prendas: se suma la cantidad en una sola; evita dos renglones de lo mismo.
--
-- SE ROMPE SI: se agrega una regla a `registrar_cambio` (p. ej. otro candado) y no se copia aquí: los dos caminos divergirían. La prueba
-- `scripts/pruebas/registrar_cambio_varias.mjs` repite las reglas compartidas contra esta función para que un cambio en una no pase en silencio.
--
-- PRODUCCIÓN. Una parte, idempotente (`create or replace`): no toma tablas en exclusiva ni toca políticas (sin riesgo de 40P01). Requiere
-- la parte 1. Sin `select … into` dentro de un texto entre comillas (el cuerpo va entre $$ … $$).
-- ============================================================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regclass('retail.cambio_salidas') is null then
    raise exception 'Falta retail.cambio_salidas: pega antes 20261021185000_cambio_varias_prendas_parte1_tabla.sql.';
  end if;
end $$;

create or replace function retail.registrar_cambio_varias(
  p_venta_item_id uuid, p_ubicacion_id uuid, p_salidas jsonb,
  p_cantidad integer default 1, p_metodo_pago_diferencia text default null,
  p_token uuid default null, p_motivo text default null, p_condicion text default 'vendible'
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_item venta_items%rowtype;
  v_venta_estado text;
  v_cambio_id uuid; v_existente cambios%rowtype;
  v_ya_cambiado integer;
  v_diferencia numeric; v_total_nuevo numeric := 0;
  v_persona uuid; v_sub uuid; v_sub_entrada uuid; v_caja_id uuid;
  v_mov_entrada uuid; v_mov_salida uuid;
  v_vars uuid[] := '{}'; v_cants integer[] := '{}'; v_precios numeric[] := '{}';
  v_e jsonb; v_var uuid; v_cant integer; v_precio numeric;
  i integer;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para hacer cambios en esa ubicación';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad del cambio debe ser mayor que cero';
  end if;

  if p_motivo is not null and p_motivo not in ('talla_chica', 'talla_grande', 'otro_color', 'defecto', 'otro') then
    raise exception 'Motivo de cambio desconocido: %', p_motivo;
  end if;
  if p_condicion is null or p_condicion not in ('vendible', 'no_vendible') then
    raise exception 'Estado de la prenda desconocido: %', p_condicion;
  end if;
  if p_motivo = 'defecto' and p_condicion = 'vendible' then
    raise exception 'Una prenda que se cambia por defecto no puede volver al piso de venta — márcala como "con defecto o uso"';
  end if;

  -- Las prendas que se lleva: hasta 10 distintas, cada una con su cantidad. La misma prenda dos veces se suma en una.
  if p_salidas is null or jsonb_typeof(p_salidas) <> 'array' or jsonb_array_length(p_salidas) = 0 then
    raise exception 'Indica qué prendas se lleva la clienta';
  end if;
  if jsonb_array_length(p_salidas) > 10 then
    raise exception 'Un cambio lleva hasta 10 prendas distintas';
  end if;
  for v_e in select e from jsonb_array_elements(p_salidas) e loop
    if jsonb_typeof(v_e) <> 'object'
       or coalesce(v_e ->> 'variante_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       or coalesce(v_e ->> 'cantidad', '') !~ '^[0-9]{1,4}$'
       or (v_e ->> 'cantidad')::integer <= 0 then
      raise exception 'Las prendas del cambio vienen mal armadas: cada una lleva su variante y una cantidad mayor que cero';
    end if;
    v_var := (v_e ->> 'variante_id')::uuid;
    v_cant := (v_e ->> 'cantidad')::integer;
    i := array_position(v_vars, v_var);
    if i is null then
      v_vars := v_vars || v_var;
      v_cants := v_cants || v_cant;
    else
      v_cants[i] := v_cants[i] + v_cant;
    end if;
  end loop;

  -- El token sigue al contenido: el mismo token con otro cambio se rechaza (token_reusado). Las prendas se normalizan por variante para
  -- que el orden en que llegan no cambie la huella.
  perform retail.fn_intento_con_huella('registrar_cambio_varias', p_token, md5(jsonb_build_array(
    p_venta_item_id, p_ubicacion_id,
    (select jsonb_agg(jsonb_build_array(u.v, u.c) order by u.v) from unnest(v_vars, v_cants) as u(v, c)),
    p_cantidad, p_metodo_pago_diferencia, p_motivo, p_condicion)::text));
  if p_token is not null then
    select * into v_existente from cambios where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select * into v_item from venta_items where id = p_venta_item_id;
  if not found then
    raise exception 'La línea de venta % no existe', p_venta_item_id;
  end if;

  select estado into v_venta_estado from ventas where id = v_item.venta_id;
  if v_venta_estado = 'anulada' then
    raise exception 'Esa venta está anulada — sus prendas ya volvieron al stock, no se pueden cambiar';
  end if;

  -- El plazo de cambio, con la misma cuenta que la pantalla (estadoPlazoCambio): días calendario de Lima desde la venta.
  if retail.fn_hoy_lima() - ((select v.created_at from ventas v where v.id = v_item.venta_id) at time zone 'America/Lima')::date
       > retail.fn_dias_plazo_cambio() then
    raise exception 'Esa compra es del %: el plazo de cambio de % días ya venció.',
      to_char(((select v.created_at from ventas v where v.id = v_item.venta_id) at time zone 'America/Lima')::date, 'DD/MM/YYYY'),
      retail.fn_dias_plazo_cambio()
      using errcode = 'P0001', hint = 'cambio_fuera_de_plazo';
  end if;

  -- ADR-0189 (cambio): bloquea la línea antes de contar. Un doble clic con el mismo token que esperó este candado recibe el cambio que
  -- guardó el primero (ya confirmado) en vez de «no quedan unidades».
  perform 1 from venta_items where id = p_venta_item_id for no key update;
  if p_token is not null then
    select * into v_existente from cambios where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;
  perform fn_exigir_linea_venta_disponible(p_venta_item_id, p_cantidad, 'cambiar');

  select coalesce(sum(cantidad), 0) into v_ya_cambiado from cambios where venta_item_id = p_venta_item_id;
  if v_ya_cambiado + p_cantidad > v_item.cantidad then
    raise exception 'Ya se cambiaron % de % unidades compradas en esa línea — no puedes cambiar %',
      v_ya_cambiado, v_item.cantidad, p_cantidad;
  end if;

  -- El precio de cada prenda que se lleva (la misma regla que `registrar_cambio`, ADR-0370) y el valor total de lo que se lleva.
  for i in 1 .. cardinality(v_vars) loop
    select retail.fn_precio_para_cambio(p_venta_item_id, v_vars[i], p_ubicacion_id) into v_precio from variantes where id = v_vars[i];
    if v_precio is null then
      raise exception 'La variante % no existe', v_vars[i];
    end if;
    -- ADR-0385: no se cambia por una prenda sin precio (ni la bolsa de obsequio): la diferencia devolvería al cliente lo que pagó
    -- y se llevaría la prenda gratis. Va antes de escribir nada.
    if v_precio <= 0 then
      raise exception 'cambio_sin_precio'
        using detail = (select pn.referencia || ' (' || coalesce(vn.codigo, vn.sku, 'sin código') || ')'
                          from retail.variantes vn join retail.productos pn on pn.id = vn.producto_id
                         where vn.id = v_vars[i]),
              hint = 'La prenda que se lleva no tiene precio en el catálogo: elige otra o ponle precio en su ficha.';
    end if;
    v_precios := v_precios || v_precio;
    v_total_nuevo := v_total_nuevo + v_precio * v_cants[i];
  end loop;

  -- ADR-0380: contra lo que la clienta PAGÓ por lo que devuelve (precio menos su descuento), no contra el precio de lista.
  v_diferencia := v_total_nuevo - (v_item.precio_unitario - v_item.descuento_unitario) * p_cantidad;
  if v_diferencia <> 0 and p_metodo_pago_diferencia is null then
    raise exception 'Hay una diferencia de S/% — indica cómo se cobra o se devuelve', v_diferencia;
  end if;

  v_persona := retail.fn_actor_persona_id(true);
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'venta');
  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta' for share;
  -- ADR-0194: los candados en orden fijo (la prenda devuelta y todas las nuevas) antes de mover nada, como registrar_venta.
  perform fn_bloquear_en_orden(p_ubicacion_id, (select array_agg(distinct x) from unnest(array[v_item.variante_id] || v_vars) as x));

  if v_diferencia <> 0 and p_metodo_pago_diferencia = 'efectivo' and v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de cobrar o devolver una diferencia en efectivo';
  end if;

  if p_condicion = 'vendible' then
    v_sub_entrada := v_sub;
  else
    select id into v_sub_entrada from sububicaciones where ubicacion_id = p_ubicacion_id and tipo = 'cuarentena';
    if v_sub_entrada is null then
      raise exception 'Esta ubicación no tiene sububicación de cuarentena configurada';
    end if;
  end if;

  begin
    insert into cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia,
                         usuario_id, token_cliente, caja_id, motivo, condicion)
      values (p_venta_item_id, p_ubicacion_id, v_vars[1], p_cantidad, v_diferencia, p_metodo_pago_diferencia,
              v_persona, p_token, v_caja_id, p_motivo, p_condicion)
      returning id into v_cambio_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from cambios where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, cambio_id, usuario_id)
    values (v_item.variante_id, p_ubicacion_id, v_sub_entrada, 'entrada', p_cantidad, 'cambio', v_cambio_id, v_persona)
    returning id into v_mov_entrada;
  perform fn_aplicar_movimiento(v_mov_entrada);

  if p_condicion = 'no_vendible' then
    insert into prendas_danadas (variante_id, ubicacion_id, cantidad, cambio_id, movimiento_entrada_id)
      values (v_item.variante_id, p_ubicacion_id, p_cantidad, v_cambio_id, v_mov_entrada);
  end if;

  for i in 1 .. cardinality(v_vars) loop
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, cambio_id, usuario_id)
      values (v_vars[i], p_ubicacion_id, v_sub, 'salida', v_cants[i], 'cambio', v_cambio_id, v_persona)
      returning id into v_mov_salida;
    perform fn_aplicar_movimiento(v_mov_salida);

    insert into cambio_salidas (cambio_id, variante_id, cantidad, precio_unitario)
      values (v_cambio_id, v_vars[i], v_cants[i], v_precios[i]);
  end loop;

  return v_cambio_id;
end;
$$;

comment on function retail.registrar_cambio_varias(uuid, uuid, jsonb, integer, text, uuid, text, text) is
  'ADR-0470: cambia UNA línea de venta por VARIAS prendas en un solo guardado (stock, caja y cuentas con la diferencia total). Mismas reglas que registrar_cambio.';

revoke all on function retail.registrar_cambio_varias(uuid, uuid, jsonb, integer, text, uuid, text, text) from public, anon;
grant execute on function retail.registrar_cambio_varias(uuid, uuid, jsonb, integer, text, uuid, text, text) to authenticated, service_role;

select 'Cambio por varias · parte 2 (registrar)' as parte,
       case when to_regprocedure('retail.registrar_cambio_varias(uuid, uuid, jsonb, integer, text, uuid, text, text)') is not null
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;

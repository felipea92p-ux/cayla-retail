-- ============================================================================
-- 20260924120000_concurrencia_cambios_devoluciones_conteo.sql — CAYLA V2 · ADR-0189 (varios usuarios a la vez, etapa 2a)
--
-- EL PROBLEMA PRIMERO. Dos huecos de la auditoría de concurrencia del 2026-09-23 (ADR-0188 fue la etapa 1):
--
--   A2. UNA PRENDA VENDIDA PODÍA CAMBIARSE (O DEVOLVERSE) DOS VECES. `registrar_cambio` sumaba lo ya cambiado de la línea
--       SIN bloquearla; `crear_devolucion`, igual con lo ya devuelto. El disparador `fn_linea_de_venta_no_anulada` toma
--       `for share` sobre la venta, que es compartido: dos cambios lo obtienen a la vez. Prenda vendida 1, dos terminales
--       cambian a la vez → las dos ven «0 cambiadas», las dos pasan y salen DOS prendas del piso por una sola vendida.
--       Además, cada función solo se miraba a sí misma: se podía cambiar una prenda ya devuelta (o devolver una ya
--       cambiada) y la prenda volvía al stock dos veces. La pantalla ya cruzaba las dos (`unidadesDisponibles` en
--       `apps/web/lib/cambios-reglas.ts`, BACKLOG «hueco cruzado cambio↔devolución cubierto en PANTALLA»), pero la base no.
--   A3. RECONTAR UNA PRENDA DEJABA LA FOTO VIEJA. `conteo_contar`, al recontar, actualizaba solo `cantidad_contada` y
--       conservaba `cantidad_sistema` de la primera vez. Sistema 5, contado 5; se venden 2 (stock 3); recuento 3 →
--       `cerrar_conteo` ajusta 3 − 5 = −2 sobre el stock actual (3) y deja 1 cuando en el piso hay 3.
--
-- QUÉ HACE
--   1. Función nueva `fn_exigir_linea_venta_disponible(línea, cantidad, acción)`: BLOQUEA la línea de venta
--      (`for no key update`) y exige que lo pedido quepa en: vendido − cambiado − devuelto (pendiente o aprobado; la
--      rechazada no cuenta) − anulado (la anulación es de la venta entera: anulada, no queda nada, y lo dice con el
--      mensaje del disparador). Mensaje en español con las cuentas. Una sola regla para cambios y devoluciones.
--   2. `registrar_cambio`: bloquea la línea, vuelve a mirar el token (un doble clic que esperó el candado recibe el
--      cambio ya hecho, como antes, y no un error) y llama a la regla. El chequeo viejo queda detrás, ya redundante.
--   3. `crear_devolucion`: bloquea TODAS las líneas pedidas de una vez y en orden de id (dos devoluciones de la misma
--      venta con las líneas en distinto orden no se traban entre sí) y llama a la regla por cada línea.
--   4. `conteo_contar`: comparte-bloquea (`for share`) las filas de stock de la prenda antes de sacar la foto —espera
--      a una venta en curso de esa prenda y la cuenta— y al recontar actualiza también `cantidad_sistema`.
--   5. `cerrar_conteo`: antes de ajustar, bloquea de una vez y en orden de prenda el stock que va a tocar (dos procesos
--      que ajustan varias prendas no se cruzan en orden inverso). El ajuste SIGUE siendo contado − foto aplicado sobre
--      el stock ACTUAL: lo que se vendió entre la foto y el cierre ya salió por su propio movimiento (ver ADR-0189).
--
-- POR QUÉ `for no key update` Y NO `for update` EN LA LÍNEA. Guardar un cambio, una devolución o un movimiento que
-- apunta a la línea toma `for key share` sobre ella (la llave foránea). `for update` choca con eso; `for no key update`
-- no, pero sí consigo mismo: serializa dos cambios/devoluciones de la misma línea sin trabar nada más (mismo criterio que
-- `fn_recalcular_costo_variante` en ADR-0188).
--
-- CÓMO. PARCHE CON ANCLAS sobre la definición viva (`pg_get_functiondef`), igual que 20260924110000: el Postgres local y
-- producción tienen cuerpos distintos de estas funciones. Cada parche lleva una MARCA: si la marca ya está en la
-- función, se da por hecho (re-pegable); si no, el ancla tiene que aparecer EXACTAMENTE una vez; si no, aborta sin
-- cambiar nada. Los bloques se insertan ANTES del ancla y el ancla queda intacta, así otra migración que la use
-- (20260923120000, conteo vacío, ancla en la misma línea de `cerrar_conteo`) se sigue pudiendo pegar en cualquier orden.
-- `create or replace` con la misma firma conserva permisos y comentarios.
--
-- QUÉ NO HACE. No toca datos ni tablas. No cambia firmas: la web no cambia. Líneas que ya hoy tuvieran cambiado +
-- devuelto > vendido (datos viejos) no se corrigen: solo ya no se puede sumar más sobre ellas.
--
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path`, no hace falta el prefijo `retail.`. Re-pegable.
-- ============================================================================

set search_path = retail, public, extensions;

-- ----------------------------------------------------------------------------
-- 1. La regla: lo que queda de una línea de venta
-- ----------------------------------------------------------------------------

create or replace function fn_exigir_linea_venta_disponible(p_venta_item_id uuid, p_cantidad integer, p_accion text)
returns integer
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_vendido integer;
  v_cambiado integer;
  v_devuelto integer;
  v_quedan integer;
begin
  -- El candado va ANTES de sumar: la segunda terminal espera acá a que la primera termine, y recién entonces cuenta lo
  -- que la primera guardó. `for no key update`: no choca con las llaves foráneas que apuntan a la línea.
  select cantidad into v_vendido from venta_items where id = p_venta_item_id for no key update;
  if not found then
    raise exception 'La línea de venta % no existe', p_venta_item_id;
  end if;

  select coalesce(sum(cantidad), 0) into v_cambiado from cambios where venta_item_id = p_venta_item_id;

  -- Una devolución pendiente ya aparta sus prendas (espera la aprobación del líder); una rechazada las libera.
  select coalesce(sum(di.cantidad), 0) into v_devuelto
    from devolucion_items di join devoluciones d on d.id = di.devolucion_id
    where di.venta_item_id = p_venta_item_id and d.estado <> 'rechazada';

  -- La anulación es de la venta entera (`anular_venta` deja una fila por línea en `venta_anulacion_items` y marca la
  -- venta): anulada, lo anulado es toda la línea y no queda nada. Se dice con el mismo mensaje que el disparador
  -- `fn_linea_de_venta_no_anulada`, que es el que la cajera ya conoce.
  if exists (select 1 from venta_anulacion_items where venta_item_id = p_venta_item_id)
     or exists (select 1 from venta_items vi join ventas v on v.id = vi.venta_id
                where vi.id = p_venta_item_id and v.estado = 'anulada') then
    raise exception 'Esta venta está anulada — ya no admite cambios ni devoluciones'
      using errcode = 'P0001', hint = 'venta_anulada';
  end if;

  v_quedan := v_vendido - v_cambiado - v_devuelto;

  if p_cantidad > v_quedan then
    raise exception 'De esa línea se vendieron %: ya se cambiaron % y se devolvieron % (contando las devoluciones por aprobar) — quedan %, no puedes % %',
      v_vendido, v_cambiado, v_devuelto, greatest(v_quedan, 0), p_accion, p_cantidad
      using errcode = 'P0001', hint = 'linea_sin_unidades';
  end if;

  return v_quedan;
end;
$$;

revoke all on function fn_exigir_linea_venta_disponible(uuid, integer, text) from public, anon, authenticated;

comment on function fn_exigir_linea_venta_disponible(uuid, integer, text) is
  'ADR-0189: bloquea la línea de venta (for no key update) y exige que la cantidad pedida quepa en vendido − cambiado − '
  'devuelto (no rechazado); una venta anulada no deja nada. La llaman registrar_cambio y crear_devolucion; no se expone a la web. Devuelve lo '
  'que quedaba antes de esta operación.';

-- ----------------------------------------------------------------------------
-- 2-5. Parches con anclas
-- ----------------------------------------------------------------------------

do $$
declare
  r record;
  f record;
  v_def text;
  v_veces int;
  v_hechas int := 0;
  v_ya int := 0;
begin
  for r in
    select * from (values
      -- 2. registrar_cambio: candado + token de nuevo + la regla, antes del chequeo viejo.
      (1, 'registrar_cambio', 'ADR-0189 (cambio)',
       'select coalesce(sum(cantidad), 0) into v_ya_cambiado from cambios where venta_item_id = p_venta_item_id;',
       $n$-- ADR-0189 (cambio): bloquea la línea antes de contar. Un doble clic con el mismo token que esperó este candado
  -- recibe el cambio que guardó el primero (ya confirmado), igual que antes, en vez de «no quedan unidades».
  perform 1 from venta_items where id = p_venta_item_id for no key update;
  if p_token is not null then
    select * into v_existente from cambios where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;
  perform fn_exigir_linea_venta_disponible(p_venta_item_id, p_cantidad, 'cambiar');

  $n$),

      -- 3a. crear_devolucion: todas las líneas pedidas, de una vez y en orden de id.
      (2, 'crear_devolucion', 'ADR-0189 (devolucion-orden)',
       'for v_item in select * from jsonb_array_elements(p_items) loop',
       $n$-- ADR-0189 (devolucion-orden): bloquea de una vez, en orden de id, las líneas que se piden devolver. Dos
  -- devoluciones de la misma venta con las líneas en distinto orden no se traban entre sí.
  perform 1 from venta_items
    where venta_id = p_venta_id
      and id in (select (e ->> 'venta_item_id')::uuid from jsonb_array_elements(p_items) e)
    order by id
    for no key update;

  $n$),

      -- 3b. crear_devolucion: la regla por línea, antes del chequeo viejo.
      (3, 'crear_devolucion', 'ADR-0189 (devolucion-regla)',
       'select coalesce(sum(di.cantidad), 0) into v_ya_devuelto',
       $n$perform fn_exigir_linea_venta_disponible(v_venta_item.id, (v_item ->> 'cantidad')::integer, 'devolver');  -- ADR-0189 (devolucion-regla)

    $n$),

      -- 4a. conteo_contar: la foto espera a las ventas en curso de esa prenda.
      (4, 'conteo_contar', 'ADR-0189 (conteo-foto)',
       'select coalesce(sum(cantidad), 0) into v_sistema from stock',
       $n$-- ADR-0189 (conteo-foto): `for share` sobre las filas de stock de la prenda en esta sede: si una venta la está
  -- moviendo, la foto espera a que termine y la cuenta. Siempre en el mismo orden (por sububicación).
  perform 1 from stock
    where variante_id = p_variante_id and ubicacion_id = c.ubicacion_id
    order by sububicacion_id nulls first
    for share;

  $n$),

      -- 4b. conteo_contar: recontar renueva también la foto. (Este sí reemplaza: el bloque va DESPUÉS del ancla.)
      (5, 'conteo_contar', 'cantidad_sistema = excluded.cantidad_sistema',
       'do update set cantidad_contada = excluded.cantidad_contada',
       null),

      -- 5. cerrar_conteo: bloquea de una vez, en orden de prenda, el stock que va a ajustar. No toca la línea del `for`
      -- (la usa de ancla 20260923120000, conteo vacío): así las dos migraciones se pegan en cualquier orden.
      (6, 'cerrar_conteo', 'ADR-0189 (conteo-orden)',
       'for r in select * from conteo_items where conteo_id = p_conteo_id and diferencia is null loop',
       $n$-- ADR-0189 (conteo-orden): el stock de las prendas con diferencia, bloqueado de una vez y en orden de prenda
  -- (lo mismo que tomaría el ajuste, `for no key update`): dos procesos que ajustan varias prendas no se cruzan.
  perform 1 from stock s
    where s.ubicacion_id = c.ubicacion_id
      and s.variante_id in (select ci.variante_id from conteo_items ci
                             where ci.conteo_id = p_conteo_id and ci.diferencia is null
                               and ci.cantidad_contada <> ci.cantidad_sistema)
    order by s.variante_id, s.sububicacion_id nulls first
    for no key update;

  $n$)
    ) as t(orden, fn, marca, ancla, bloque)
    order by orden
  loop
    if not exists (select 1 from pg_proc where proname = r.fn and pronamespace = 'retail'::regnamespace) then
      raise exception 'ADR-0189: no existe retail.%', r.fn;
    end if;

    for f in select oid from pg_proc where proname = r.fn and pronamespace = 'retail'::regnamespace loop
      v_def := pg_get_functiondef(f.oid);

      if position(r.marca in v_def) > 0 then
        v_ya := v_ya + 1;  -- ya parchada (se volvió a pegar)
        continue;
      end if;

      v_veces := (length(v_def) - length(replace(v_def, r.ancla, ''))) / length(r.ancla);
      if v_veces = 1 then
        -- Con bloque: se inserta ANTES del ancla. Sin bloque (4b): el ancla se completa con la columna nueva.
        execute replace(v_def, r.ancla,
          case when r.bloque is not null then r.bloque || r.ancla
               else r.ancla || ', ' || r.marca end);
        v_hechas := v_hechas + 1;
      else
        raise exception 'ADR-0189: retail.% no tiene el ancla esperada (aparece % veces): «%». Revisar su definición antes de pegar.',
          r.fn, v_veces, r.ancla;
      end if;
    end loop;
  end loop;

  raise notice 'ADR-0189: % parches aplicados, % ya estaban', v_hechas, v_ya;
end;
$$;

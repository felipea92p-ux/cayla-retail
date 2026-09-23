-- ============================================================================
-- 20260922235000_candado_dinero_caja_cambios_devoluciones.sql — CAYLA V2
--
-- EL PROBLEMA. El análisis `/pantalla` del módulo Ventas (2026-09-22,
-- docs/pantallas/caja.md, cambios.md, devoluciones.md) encontró la misma
-- familia de hueco en tres pantallas: dinero se mueve sin que la BASE exija
-- un líder — el candado vivía solo en el navegador, que es justo lo que
-- cualquier sesión puede saltarse llamando la RPC desde la consola.
--
-- Tres candados independientes, una sola migración porque comparten causa
-- (principio: el mismo defecto en 3+ pantallas es una tarea raíz, no tres):
--
--   1. `registrar_movimiento_caja` — `es_ajuste` lo decidía el navegador
--      (`p_es_ajuste`); un colaborador podía mandar `false` con un motivo de
--      ajuste, o cualquier motivo fuera del vocabulario del modal. Ahora la
--      base deduce `es_ajuste` del MOTIVO (vocabulario cerrado, el mismo que
--      ya usa `caja-panel-reglas.ts`: MOTIVOS_EGRESO/MOTIVOS_INGRESO) y exige
--      una referencia para "Depósito bancario"/"Otro" — lo que el modal ya
--      pedía, ahora también en la base. El parámetro `p_es_ajuste` queda en
--      la firma por compatibilidad pero se ignora: nunca fue seguro confiar
--      en un booleano que manda el cliente.
--
--   2. `registrar_cambio` — un cambio que le devuelve plata a la clienta
--      (diferencia negativa) no pedía ningún líder, al revés que la misma
--      situación en Devoluciones (`aprobar_devolucion` sí lo exige). Ahora
--      lo exige también acá. NO toca lo demás del objeción de cambios.md
--      (falta comprobante/nota de crédito): eso ya lo decidió Felipe aparte
--      el 2026-09-21 (BACKLOG:451, "falta ejecutarlo") y es un proyecto de
--      SUNAT/Lucode más grande, no un candado de permiso — se deja para esa
--      tarea, no se mezcla acá.
--
--   3. `devoluciones`/`devolucion_items`/`prendas_danadas`/`cambios` — las
--      cuatro tablas seguían con el privilegio de tabla por defecto que
--      0005_grants.sql concede a TODA tabla nueva del schema
--      (`alter default privileges ... grant select, insert, update, delete
--      on tables to authenticated`), sin el `revoke` puntual que ya se les
--      dio esta semana a `colaboradores` (20260922100000) o a `stock`/
--      `apartados` (20260920160000). Una política RLS `for all` que solo
--      mira la SEDE (no el verbo ni quién ejecuta) no cierra esto: limita la
--      FILA, no el privilegio. Con el privilegio de tabla abierto, cualquier
--      sesión autenticada podía `update devoluciones set estado='aprobada',
--      reembolso_monto=...` desde la consola del navegador, saltándose
--      `aprobar_devolucion` (y su candado de líder) por completo. Se revoca
--      igual que a `colaboradores`: ninguna de las cuatro tiene un writer
--      legítimo fuera de sus RPC (todas `security definer`, verificado con
--      `grep -rn '\.from("devoluciones")\|\.from("devolucion_items")\|
--      \.from("prendas_danadas")\|\.from("cambios")' apps/web` filtrando
--      insert/update/delete/upsert: cero resultados).
--
--   Además, en `aprobar_devolucion`: (a) quien registró la devolución no
--   puede ser quien la aprueba (con 9 líderes de alcance global, hoy nada lo
--   impedía — la única devolución real de producción se auto-aprobó en 5,6
--   segundos, docs/pantallas/devoluciones.md §2.2); (b) el reembolso ya no
--   puede superar lo que la clienta pagó de verdad por esas prendas (con
--   descuento, no precio de lista) — antes era solo un aviso ámbar en
--   pantalla (`devoluciones-reglas.ts:288-302`), nunca un candado real.
--
-- LO QUE ESTA MIGRACIÓN NO TOCA (a propósito, queda pendiente y necesita tu
-- ok aparte porque mueve lo que se declara a SUNAT — CLAUDE.md, confirmar
-- antes de tocar integraciones que muevan dinero real): la nota de crédito
-- de `aprobar_devolucion` se sigue calculando sobre `precio_unitario` (precio
-- de lista) en vez del valor pagado con descuento — con línea sin descuento
-- da igual (el único caso real hoy), con descuento se acredita de más ante
-- SUNAT (devoluciones.md §2.3). Es un cambio de qué se reporta a SUNAT, no
-- un candado de permiso: se deja para una migración aparte, con tu ok
-- explícito.
--
-- SE ROMPE SI: sin esta migración, cualquier colaboradora con sesión puede
-- (a) sacar cualquier monto de la caja como "Retiro de efectivo" sin dejar
-- rastro verificable, (b) devolverle plata a una clienta en un cambio sin
-- que ningún líder se entere, o (c) aprobar su propia devolución llamando
-- las funciones directo, sin pasar por ninguna pantalla.
--
-- Todo `create or replace` (misma firma en los tres casos): no hace falta
-- `drop function` ni tocar los `grant execute` ya existentes.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. registrar_movimiento_caja: el motivo decide, no el navegador ----------
create or replace function retail.registrar_movimiento_caja(
  p_caja_id uuid, p_tipo text, p_monto numeric, p_motivo text,
  p_nota text default null, p_es_ajuste boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_caja cajas%rowtype; v_persona uuid; v_id uuid; v_es_ajuste boolean;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_ubicacion(v_caja.ubicacion_id) then
    raise exception 'No tienes permiso para operar esa caja';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada — no se pueden registrar más movimientos ahí';
  end if;
  if p_tipo not in ('ingreso', 'egreso') then
    raise exception 'Tipo de movimiento de caja inválido: %', p_tipo;
  end if;
  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Todo movimiento de caja necesita un motivo';
  end if;

  -- Vocabulario cerrado (el mismo que MOTIVOS_EGRESO/MOTIVOS_INGRESO de
  -- caja-panel-reglas.ts): quien llame esta función fuera del modal ya no
  -- puede inventar un motivo ni un tipo que el modal nunca ofrecería.
  if p_tipo = 'egreso' and p_motivo not in
      ('Retiro de efectivo', 'Depósito bancario', 'Ajuste de caja (faltante)', 'Compra de insumos', 'Otro') then
    raise exception 'Motivo de egreso desconocido: %', p_motivo;
  end if;
  if p_tipo = 'ingreso' and p_motivo not in ('Ajuste de caja (sobrante)', 'Otro') then
    raise exception 'Motivo de ingreso desconocido: %', p_motivo;
  end if;

  -- `p_es_ajuste` queda en la firma por compatibilidad pero se ignora: la base
  -- decide sola, del motivo — nunca fue seguro confiar en lo que manda el cliente.
  v_es_ajuste := p_motivo in ('Ajuste de caja (faltante)', 'Ajuste de caja (sobrante)');
  if v_es_ajuste and not fn_es_lider() then
    raise exception 'Solo un líder de equipo puede registrar un ajuste de efectivo';
  end if;

  -- Lo que el modal ya pedía (referenciaObligatoria, caja-panel-reglas.ts),
  -- ahora también exigido en la base.
  if p_motivo in ('Depósito bancario', 'Otro') and (p_nota is null or trim(p_nota) = '') then
    raise exception 'El motivo "%" necesita una referencia (N.° de operación o un detalle breve)', p_motivo;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into caja_movimientos (caja_id, tipo, monto, motivo, nota, es_ajuste, usuario_id)
    values (p_caja_id, p_tipo, p_monto, p_motivo, p_nota, v_es_ajuste, v_persona)
    returning id into v_id;
  return v_id;
end;
$$;

-- ---------- 2. registrar_cambio: devolver plata en un cambio exige líder ----------
create or replace function retail.registrar_cambio(
  p_venta_item_id uuid, p_ubicacion_id uuid, p_variante_nueva_id uuid,
  p_cantidad integer default 1, p_metodo_pago_diferencia text default null,
  p_token uuid default null,
  p_motivo text default null, p_condicion text default 'vendible'
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_item venta_items%rowtype;
  v_venta_estado text;
  v_precio_nuevo numeric;
  v_cambio_id uuid; v_existente cambios%rowtype;
  v_ya_cambiado integer;
  v_diferencia numeric;
  v_persona uuid; v_sub uuid; v_sub_entrada uuid; v_caja_id uuid;
  v_mov_entrada uuid; v_mov_salida uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para hacer cambios en esa ubicación';
  end if;
  if p_cantidad <= 0 then
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

  select coalesce(sum(cantidad), 0) into v_ya_cambiado from cambios where venta_item_id = p_venta_item_id;
  if v_ya_cambiado + p_cantidad > v_item.cantidad then
    raise exception 'Ya se cambiaron % de % unidades compradas en esa línea — no puedes cambiar %',
      v_ya_cambiado, v_item.cantidad, p_cantidad;
  end if;

  select precio into v_precio_nuevo from variantes where id = p_variante_nueva_id;
  if v_precio_nuevo is null then
    raise exception 'La variante % no existe', p_variante_nueva_id;
  end if;

  v_diferencia := (v_precio_nuevo - v_item.precio_unitario) * p_cantidad;
  if v_diferencia <> 0 and p_metodo_pago_diferencia is null then
    raise exception 'Hay una diferencia de S/% — indica cómo se cobra o se devuelve', v_diferencia;
  end if;

  -- Nuevo (docs/pantallas/cambios.md objeción): devolverle plata a la clienta en un cambio
  -- es exactamente lo que `aprobar_devolucion` ya exige de un líder del otro lado — acá no
  -- había ningún candado. Solo aplica cuando CAYLA entrega plata (diferencia negativa); que
  -- la clienta pague más de más no es el riesgo que este candado cierra.
  if v_diferencia < 0 and not fn_es_lider() then
    raise exception 'Un cambio que devuelve plata a la clienta necesita la aprobación de un líder de equipo';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'venta');
  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta';

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
      values (p_venta_item_id, p_ubicacion_id, p_variante_nueva_id, p_cantidad, v_diferencia, p_metodo_pago_diferencia,
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

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, cambio_id, usuario_id)
    values (p_variante_nueva_id, p_ubicacion_id, v_sub, 'salida', p_cantidad, 'cambio', v_cambio_id, v_persona)
    returning id into v_mov_salida;
  perform fn_aplicar_movimiento(v_mov_salida);

  return v_cambio_id;
end;
$$;

-- ---------- 3. aprobar_devolucion: sin auto-aprobación y con tope real de reembolso ----------
create or replace function retail.aprobar_devolucion(
  p_devolucion_id uuid, p_reembolso_monto numeric default null, p_reembolso_metodo text default null
)
returns table (nota_credito_id uuid, nota_credito_serie text, nota_credito_numero integer)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  d devoluciones%rowtype;
  r record;
  v_mov_id uuid;
  v_persona uuid;
  v_sub uuid;
  v_sub_cuarentena uuid;
  v_caja_id uuid;
  v_comprobante comprobantes%rowtype;
  v_total_devuelto numeric;
  v_valor_pagado numeric;
  v_subtotal numeric;
  v_igv numeric;
  v_nota_id uuid;
  v_es_total boolean;
begin
  select * into d from devoluciones where id = p_devolucion_id for update;
  if not found then raise exception 'La devolución % no existe', p_devolucion_id; end if;
  if d.estado <> 'pendiente' then raise exception 'Esa devolución ya está %', d.estado; end if;
  if not fn_es_lider() then
    raise exception 'Solo un líder puede aprobar una devolución';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  -- Nuevo (docs/pantallas/devoluciones.md objeción #2): con 9 líderes de alcance global,
  -- nada impedía que quien registró la devolución fuera también quien la aprobara — pasó de
  -- verdad en producción (5,6 segundos entre las dos). Otra líder tiene que revisarla.
  if d.solicitado_por = v_persona then
    raise exception 'Quien registró esta devolución no puede aprobarla — pide que otra líder la revise';
  end if;

  -- Nuevo (objeción #4): el tope de reembolso era solo un aviso ámbar en pantalla
  -- (revisarAprobacion, devoluciones-reglas.ts), nunca un candado real. Mismo cálculo que
  -- `valorPagado` del frontend: precio con descuento, no precio de lista.
  select coalesce(sum((vi.precio_unitario - vi.descuento_unitario) * di.cantidad), 0) into v_valor_pagado
    from devolucion_items di join venta_items vi on vi.id = di.venta_item_id
    where di.devolucion_id = p_devolucion_id;
  if coalesce(p_reembolso_monto, 0) > v_valor_pagado then
    raise exception 'El reembolso (S/%) no puede superar lo que la clienta pagó por esas prendas (S/%)',
      p_reembolso_monto, v_valor_pagado;
  end if;

  v_sub := fn_sububicacion_por_defecto(d.ubicacion_id, 'venta');
  select id into v_caja_id from cajas where ubicacion_id = d.ubicacion_id and estado = 'abierta';

  if p_reembolso_metodo = 'efectivo' and coalesce(p_reembolso_monto, 0) > 0 and v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de aprobar un reembolso en efectivo';
  end if;

  for r in select * from devolucion_items where devolucion_id = p_devolucion_id loop
    if r.condicion = 'vendible' then
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, devolucion_item_id, usuario_id)
        select vi.variante_id, d.ubicacion_id, v_sub, 'entrada', r.cantidad, 'devolucion', r.id, v_persona
        from venta_items vi where vi.id = r.venta_item_id
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      update devolucion_items set movimiento_id = v_mov_id where id = r.id;
    elsif r.condicion in ('danada_reparacion', 'danada_donar', 'devolver_proveedor') then
      if v_sub_cuarentena is null then
        select id into v_sub_cuarentena from sububicaciones where ubicacion_id = d.ubicacion_id and tipo = 'cuarentena';
      end if;
      if v_sub_cuarentena is null then
        raise exception 'Esta ubicación no tiene sububicación de cuarentena configurada';
      end if;
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, devolucion_item_id, usuario_id)
        select vi.variante_id, d.ubicacion_id, v_sub_cuarentena, 'entrada', r.cantidad, 'devolucion', r.id, v_persona
        from venta_items vi where vi.id = r.venta_item_id
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      update devolucion_items set movimiento_id = v_mov_id where id = r.id;
      insert into prendas_danadas (variante_id, ubicacion_id, cantidad, devolucion_item_id, movimiento_entrada_id)
        select vi.variante_id, d.ubicacion_id, r.cantidad, r.id, v_mov_id
        from venta_items vi where vi.id = r.venta_item_id;
    end if;
  end loop;

  update devoluciones set estado = 'aprobada', aprobado_por = v_persona, aprobado_en = now(),
                          reembolso_monto = p_reembolso_monto, reembolso_metodo = p_reembolso_metodo,
                          caja_id = v_caja_id
    where id = p_devolucion_id;

  select * into v_comprobante from comprobantes
    where venta_id = d.venta_id and tipo in ('boleta', 'factura') and estado = 'aceptado'
    order by created_at desc limit 1;

  if found then
    -- Sin cambios: sigue sobre precio de lista, no el pagado con descuento — ver el
    -- encabezado de esta migración (LO QUE NO TOCA). Pendiente aparte, con ok de Felipe.
    select coalesce(sum(vi.precio_unitario * di.cantidad), 0) into v_total_devuelto
      from devolucion_items di join venta_items vi on vi.id = di.venta_item_id
      where di.devolucion_id = p_devolucion_id;

    if v_total_devuelto > 0 then
      if not exists (select 1 from series_comprobantes where ubicacion_id = v_comprobante.ubicacion_id and tipo = 'nota_credito') then
        raise exception 'Esta venta tiene un comprobante aceptado por SUNAT — hace falta registrar la serie de Nota de Crédito de esta ubicación en Facturación antes de poder aprobar la devolución.';
      end if;

      select not exists (
        select 1 from venta_items vi
        where vi.venta_id = d.venta_id
          and vi.cantidad <> coalesce((
            select di.cantidad from devolucion_items di
            where di.venta_item_id = vi.id and di.devolucion_id = p_devolucion_id
          ), 0)
      ) into v_es_total;

      v_igv := round(v_total_devuelto - v_total_devuelto / 1.18, 2);
      v_subtotal := round(v_total_devuelto - v_igv, 2);

      v_nota_id := emitir_nota(
        v_comprobante.id, 'nota_credito',
        case when v_es_total then '06' else '07' end,
        v_subtotal, v_igv, v_total_devuelto
      );
      update devoluciones set nota_credito_id = v_nota_id where id = p_devolucion_id;
    end if;
  end if;

  return query select
    v_nota_id,
    (select serie from comprobantes where id = v_nota_id),
    (select numero from comprobantes where id = v_nota_id);
end;
$$;

-- ---------- 4. Cerrar el privilegio de tabla que 0005_grants.sql deja abierto por defecto ----------
-- Mismo patrón que 20260922100000_colaboradores_endurecimiento.sql y 20260920160000_apartar_stock.sql:
-- ninguna de estas cuatro tablas tiene un escritor legítimo fuera de sus RPC (todas `security definer`,
-- que no dependen de este privilegio — corren como el dueño de la función, no como `authenticated`).
revoke insert, update, delete, truncate on retail.devoluciones from authenticated, anon;
revoke insert, update, delete, truncate on retail.devolucion_items from authenticated, anon;
revoke insert, update, delete, truncate on retail.prendas_danadas from authenticated, anon;
revoke insert, update, delete, truncate on retail.cambios from authenticated, anon;

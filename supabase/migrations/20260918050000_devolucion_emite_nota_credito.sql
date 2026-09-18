-- ============================================================================
-- Nota de Crédito automática al aprobar una devolución (Felipe, 2026-09-18)
--
-- EL HUECO (auditoría de Facturación, 2026-09-17, hueco 5 del doc de módulo):
-- `devoluciones.ts` solo usa `parsearComprobante` para BUSCAR la venta
-- original — `emitir_nota` (0010_facturacion.sql) existe desde la Fase 0 y
-- nunca tuvo un llamador real. Una devolución sobre una venta con
-- boleta/factura YA ACEPTADA por SUNAT deja el IGV declarado de más para
-- siempre: SUNAT sigue pensando que esa venta ocurrió completa.
--
-- LA DECISIÓN: automático, no un botón aparte que alguien pueda olvidar
-- apretar (principio 12 — el error es del diseño, no de la persona). Se
-- dispara dentro de `aprobar_devolucion`, en el mismo momento en que la
-- devolución se vuelve real (no en `crear_devolucion`, que todavía puede
-- rechazarse). Se RESERVA en Postgres puro (principio 9, igual que
-- `emitir_comprobante`/`emitir_nota`) — transmitirla a SUNAT sigue pasando
-- por el mismo botón "Transmitir" que cualquier comprobante en
-- `ComprobantesPanel.tsx`. Sin pantalla nueva: la nota aparece sola en la
-- lista de comprobantes de /vender/facturacion, con sus PDF/XML/CDR
-- (2026-09-18, la pieza de esta misma sesión) en cuanto SUNAT la acepta.
--
-- QUÉ NO HACE A PROPÓSITO: si la venta no tiene comprobante, o el que tiene
-- nunca llegó a "aceptado" (pendiente/rechazado/no_emitido/anulado), no
-- emite nada — SUNAT nunca vio el original, no hay nada que corregir.
-- ============================================================================

alter table retail.devoluciones add column if not exists nota_credito_id uuid references retail.comprobantes (id);

-- IMPORTANTE (encontrado por CI, `scripts/pruebas/aprobar_devolucion_caja.mjs`):
-- la primera versión de esta migración reconstruyó `aprobar_devolucion` a
-- partir del cuerpo viejo de `0003_funciones.sql` y sin querer se llevó por
-- delante 3 migraciones posteriores reales — el candado de caja abierta para
-- reembolsos en efectivo (`20260916180000_cambio_y_devolucion_exigen_caja_
-- si_hay_efectivo.sql`) y la cuarentena de prendas dañadas
-- (`20260917095000_cuarentena_prendas_danadas.sql`, `sububicacion_id`,
-- `prendas_danadas`). Esta versión parte del cuerpo real más reciente (el de
-- cuarentena, que ya incluye el de caja) y le agrega SOLO la Nota de Crédito.
drop function if exists retail.aprobar_devolucion(uuid, numeric, text);

create function retail.aprobar_devolucion(
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
    elsif r.condicion in ('danada_reparacion', 'danada_donar') then
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

  -- El comprobante más reciente y ACEPTADO de esta venta — si nunca llegó a
  -- SUNAT (pendiente/rechazado/no_emitido) o ya está anulado, no hay nada
  -- real que corregir.
  select * into v_comprobante from comprobantes
    where venta_id = d.venta_id and tipo in ('boleta', 'factura') and estado = 'aceptado'
    order by created_at desc limit 1;

  if found then
    select coalesce(sum(vi.precio_unitario * di.cantidad), 0) into v_total_devuelto
      from devolucion_items di join venta_items vi on vi.id = di.venta_item_id
      where di.devolucion_id = p_devolucion_id;

    if v_total_devuelto > 0 then
      -- Si nadie registró todavía la serie de Nota de Crédito de esta
      -- ubicación (Facturación → Registrar serie), `emitir_nota` fallaría
      -- con un mensaje genérico de `fn_reservar_numero_serie` y se llevaría
      -- entre las patas la aprobación entera de la devolución (todo-o-nada,
      -- principio 9 de Jim Gray: mejor bloquear con un mensaje claro ahora
      -- que aprobar la devolución y dejar la Nota de Crédito pendiente para
      -- siempre sin que nadie se entere).
      if not exists (select 1 from series_comprobantes where ubicacion_id = v_comprobante.ubicacion_id and tipo = 'nota_credito') then
        raise exception 'Esta venta tiene un comprobante aceptado por SUNAT — hace falta registrar la serie de Nota de Crédito de esta ubicación en Facturación antes de poder aprobar la devolución.';
      end if;

      -- Catálogo 09 SUNAT: "06" devolución total si esta devolución cubre
      -- exactamente todo lo vendido en la venta original, "07" si es parcial
      -- (simplificación documentada: no mira devoluciones previas sobre la
      -- misma venta, solo si ESTA cubre el 100% de cada línea).
      select not exists (
        select 1 from venta_items vi
        where vi.venta_id = d.venta_id
          and vi.cantidad <> coalesce((
            select di.cantidad from devolucion_items di
            where di.venta_item_id = vi.id and di.devolucion_id = p_devolucion_id
          ), 0)
      ) into v_es_total;

      -- Mismo orden de cálculo que ComprobantesPanel.tsx (onEmitir): IGV
      -- primero (total − total/1.18), subtotal = total − igv. Un orden
      -- distinto redondea distinto en el último centavo.
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

  -- Subconsultas escalares, no `... from comprobantes where id = v_nota_id`:
  -- con `v_nota_id` null (no aplicaba Nota de Crédito) un `where` habría
  -- devuelto CERO filas en vez de una fila con nulls — encontrado por CI,
  -- `aprobar_devolucion_caja.mjs` usa `\gset` y necesita exactamente una fila
  -- siempre, aplique o no la nota.
  return query select
    v_nota_id,
    (select serie from comprobantes where id = v_nota_id),
    (select numero from comprobantes where id = v_nota_id);
end;
$$;

grant execute on function retail.aprobar_devolucion(uuid, numeric, text) to authenticated;

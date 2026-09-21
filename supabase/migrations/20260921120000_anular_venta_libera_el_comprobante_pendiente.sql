-- ============================================================================
-- 20260921120000_anular_venta_libera_el_comprobante_pendiente.sql — CAYLA V2
--
-- QUÉ CAMBIA: `anular_venta` libera (`no_emitido`) el comprobante PENDIENTE de la venta que
-- anula, en la misma transacción.
--
-- POR QUÉ (hallado el 2026-09-21 al probar `20260921103000`, en local Y en producción):
-- anular una venta con boleta pendiente no tocaba esa boleta. Seguía `pendiente`, contaba en «Por
-- enviar a SUNAT», en Comprobantes tenía su botón «Transmitir», y ni `/api/lucode/emitir` ni
-- `actualizar_transmision_comprobante` miraban que la venta estuviera anulada: se podía declarar a
-- SUNAT una venta que ya se le había devuelto a la clienta. `anular_venta` solo se negaba si el
-- comprobante ya estaba `enviado` o `aceptado`. Es un estado imposible que el esquema dejaba
-- existir (principio 2): se corrige donde nace, no con una validación después.
--
-- LA REGLA (misma que «Liberar sin espera», ADR-0093):
--   · `pendiente` → `no_emitido`, con `motivo_no_emitido = 'Venta anulada: <motivo>'`, quién
--     anuló y cuándo. El número queda sin usar (un hueco en la numeración es normal y legal
--     cuando nunca se transmitió).
--   · `rechazado` NO se toca: ya llegó a SUNAT (ADR-0093). Queda pendiente de decidir qué hacer con
--     uno; mientras tanto la ruta de transmisión se niega a mandar el de una venta anulada.
--   · `enviado` y `aceptado` siguen frenando la anulación (usa Cambio o Devolución).
--
-- ADEMÁS repara lo que ya quedó así: los comprobantes `pendiente` de ventas que se anularon antes
-- de esta migración pasan a `no_emitido` con los datos de quien anuló. Al 2026-09-21 son CERO en
-- producción y en local (0 ventas anuladas); es un `update` idempotente que solo actúa si aparece
-- alguno entre la prueba y el pegado.
--
-- QUÉ NO CAMBIA. La firma (`create or replace` en el lugar: no nace una sobrecarga —el hueco de
-- ADR-0009/0004— y los permisos de EXECUTE quedan como estén, ADR-0078), ni una sola de las demás
-- guardas de `anular_venta` (líder, motivo, caja abierta, sin cambios ni devoluciones, una línea
-- cada vez, stock de vuelta). El resto del cuerpo es idéntico al de `20260916214500` (huella
-- del cuerpo en producción y local: 338b85903b5005c140a049e9c9747c34).
--
-- SE ROMPE SI: alguien recrea `anular_venta` desde `20260916214500` sin este bloque (el comprobante
-- pendiente vuelve a sobrevivir a la anulación). Lo cubre `scripts/pruebas/anular_venta_comprobante.mjs`
-- (`pnpm pruebas:anular-venta-comprobante`).
--
-- REVERSIBLE: el cuerpo anterior es el de `20260916214500_anular_venta_sin_huecos.sql`.
--
-- PRODUCCIÓN. Se pega tal cual en el SQL Editor: ya trae el `set search_path` de abajo (sin él, el
-- cuerpo no se puede validar al crear). Un solo objeto, una sola firma.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.anular_venta(
  p_venta_id uuid, p_motivo text, p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta ventas%rowtype;
  v_caja_estado text;
  v_persona uuid;
  v_item jsonb;
  v_venta_item venta_items%rowtype;
  v_salida movimientos%rowtype;
  v_salidas integer;
  v_mov_id uuid;
  v_condicion text;
  v_items_venta integer;
  v_items_input integer;
  v_items_distintos integer;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede anular una venta';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Anular una venta necesita un motivo';
  end if;

  -- `for update` primero: una devolución o un cambio de esta misma venta que llegue al
  -- mismo tiempo espera acá (su disparador pide `for share` sobre esta fila).
  select * into v_venta from ventas where id = p_venta_id for update;
  if not found then
    raise exception 'La venta % no existe', p_venta_id;
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'Esta venta ya está anulada';
  end if;

  if v_venta.caja_id is null then
    raise exception 'Esta venta no tiene caja registrada — no se puede confirmar que sigue abierta';
  end if;
  select estado into v_caja_estado from cajas where id = v_venta.caja_id;
  if v_caja_estado is distinct from 'abierta' then
    raise exception 'La caja de esta venta ya cerró — a partir de ahí, usa Cambio o Devolución';
  end if;

  if exists (
    select 1 from comprobantes where venta_id = p_venta_id and estado in ('enviado', 'aceptado')
  ) then
    raise exception 'Esta venta ya tiene un comprobante enviado o aceptado por SUNAT — usa Cambio o Devolución en su lugar';
  end if;

  -- Un ítem ya tocado por Cambios o Devoluciones no puede volver a contarse acá:
  -- anular movería stock de nuevo sobre una cantidad que ese otro camino ya movió.
  if exists (
    select 1 from venta_items vi
    where vi.venta_id = p_venta_id
      and (
        exists (select 1 from cambios ca where ca.venta_item_id = vi.id)
        or exists (
          select 1 from devolucion_items di join devoluciones d on d.id = di.devolucion_id
          where di.venta_item_id = vi.id and d.estado <> 'rechazada'
        )
      )
  ) then
    raise exception 'Esta venta ya tiene un cambio o una devolución registrada — resuelve sus ítems por separado en vez de anular la venta completa';
  end if;

  -- Cada línea de la venta, una vez cada una. Contar solo cuántas llegan dejaba pasar
  -- una línea repetida en lugar de otra.
  select count(*) into v_items_venta from venta_items where venta_id = p_venta_id;
  select count(*), count(distinct e ->> 'venta_item_id')
    into v_items_input, v_items_distintos
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e;
  if v_items_input <> v_items_venta or v_items_distintos <> v_items_venta then
    raise exception 'Anular una venta necesita la condición de cada una de sus % líneas, una vez cada una (llegaron %)',
      v_items_venta, v_items_input;
  end if;

  select id into v_persona from public.personas where auth_user_id = auth.uid();

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_venta_item from venta_items
      where id = (v_item ->> 'venta_item_id')::uuid and venta_id = p_venta_id;
    if not found then
      raise exception 'El ítem % no pertenece a la venta %', v_item ->> 'venta_item_id', p_venta_id;
    end if;
    v_condicion := v_item ->> 'condicion';
    v_mov_id := null;

    if v_condicion = 'vendible' then
      select count(*) into v_salidas from movimientos
        where venta_item_id = v_venta_item.id and tipo = 'salida' and motivo = 'venta';
      if v_salidas <> 1 then
        raise exception 'La línea % tiene % salidas de stock por venta registradas (se esperaba 1) — esta venta necesita revisarse a mano, no anularse',
          v_venta_item.id, v_salidas;
      end if;
      select * into v_salida from movimientos
        where venta_item_id = v_venta_item.id and tipo = 'salida' and motivo = 'venta';

      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
        values (v_salida.variante_id, v_salida.ubicacion_id, v_salida.sububicacion_id, 'entrada', v_salida.cantidad,
                'anulacion_venta', v_venta_item.id, v_persona)
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
    end if;

    insert into venta_anulacion_items (venta_id, venta_item_id, condicion, movimiento_id)
      values (p_venta_id, v_venta_item.id, v_condicion, v_mov_id);
  end loop;

  update ventas set estado = 'anulada', motivo_anulacion = p_motivo, anulado_por = v_persona, anulado_en = now()
    where id = p_venta_id;

  -- Un comprobante PENDIENTE de esta venta reservó su número pero nunca se transmitió. Con la venta
  -- anulada no hay nada que declarar, y dejarlo `pendiente` lo mantenía en la cola de SUNAT con su
  -- botón «Transmitir»: se podía declarar una venta que ya se devolvió. Se libera igual que «Liberar sin
  -- espera» (`marcar_comprobante_no_emitido`, ADR-0093): `no_emitido`, con su motivo, y el número queda
  -- sin usar. Va en la MISMA transacción que la anulación: o pasan las dos cosas o ninguna.
  --   · Uno `rechazado` NO se toca: ya llegó a SUNAT y su único camino sigue siendo reintentar (ADR-0093);
  --     lo que sí hace la ruta de transmisión es negarse a mandar el de una venta anulada.
  --   · Uno `enviado` o `aceptado` no llega hasta acá: frenó la anulación más arriba.
  --   · Los que ya estaban `no_emitido` o `anulado` quedan como estaban.
  update comprobantes set
      estado = 'no_emitido',
      motivo_no_emitido = 'Venta anulada: ' || btrim(p_motivo),
      marcado_no_emitido_por = v_persona,
      marcado_no_emitido_at = now()
    where venta_id = p_venta_id and estado = 'pendiente';
end;
$$;

-- Reparación de lo que ya quedó así (ver arriba: hoy son cero). Usa los datos de la anulación de la venta.
update comprobantes c set
    estado = 'no_emitido',
    motivo_no_emitido = 'Venta anulada: ' || btrim(v.motivo_anulacion),
    marcado_no_emitido_por = v.anulado_por,
    marcado_no_emitido_at = v.anulado_en
  from ventas v
  where v.id = c.venta_id and v.estado = 'anulada' and c.estado = 'pendiente';

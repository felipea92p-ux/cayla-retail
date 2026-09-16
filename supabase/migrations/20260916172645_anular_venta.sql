-- ADR-0063: anular una venta.
-- estado en ventas + RPC anular_venta. Reversa de stock por condición
-- (mismo vocabulario que Devoluciones, misma regla de aprobar_devolucion:
-- solo "vendible" repone piso). Bloqueada si el comprobante de la venta ya
-- fue enviado/aceptado por SUNAT (ese carril es anular_comprobante,
-- ADR-0016 — no se duplica acá). Solo mientras la caja de la venta siga
-- abierta. Solo un líder. Ver docs/adr/0063-anular-una-venta.md.

alter table retail.ventas
  add column estado text not null default 'completada' check (estado in ('completada', 'anulada')),
  add column motivo_anulacion text,
  add column anulado_por uuid references public.personas (id),
  add column anulado_en timestamptz,
  add constraint ventas_anulacion_coherente check (
    (estado = 'completada' and anulado_en is null and motivo_anulacion is null and anulado_por is null)
    or (estado = 'anulada' and anulado_en is not null and motivo_anulacion is not null)
  );

create table retail.venta_anulacion_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references retail.ventas (id),
  venta_item_id uuid not null references retail.venta_items (id),
  condicion text not null check (condicion in ('vendible', 'danada_reparacion', 'danada_donar', 'devolver_proveedor')),
  movimiento_id uuid,
  created_at timestamptz not null default now()
);
create index venta_anulacion_items_venta_idx on retail.venta_anulacion_items (venta_id);

alter table retail.venta_anulacion_items enable row level security;
create policy venta_anulacion_items_select on retail.venta_anulacion_items for select
  using (exists (select 1 from retail.ventas v where v.id = venta_id and retail.fn_puede_operar_ubicacion(v.ubicacion_id)));
create policy venta_anulacion_items_write on retail.venta_anulacion_items for all
  using (exists (select 1 from retail.ventas v where v.id = venta_id and retail.fn_puede_operar_ubicacion(v.ubicacion_id)))
  with check (exists (select 1 from retail.ventas v where v.id = venta_id and retail.fn_puede_operar_ubicacion(v.ubicacion_id)));

create function retail.anular_venta(
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
  v_mov_id uuid;
  v_condicion text;
  v_items_venta integer;
  v_items_input integer;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede anular una venta';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Anular una venta necesita un motivo';
  end if;

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

  -- Un ítem ya tocado por Cambios o Devoluciones no puede volver a contarse
  -- acá: anular_venta movería stock de nuevo sobre una cantidad que ese otro
  -- camino ya movió, duplicándola. Si la venta ya se empezó a deshacer pieza
  -- por pieza, se termina pieza por pieza — no se anula completa encima.
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

  select count(*) into v_items_venta from venta_items where venta_id = p_venta_id;
  select count(*) into v_items_input from jsonb_array_elements(p_items);
  if v_items_input <> v_items_venta then
    raise exception 'Anular una venta necesita la condición de cada una de sus % líneas (llegaron %)',
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
      insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
        values (v_venta_item.variante_id, v_venta.ubicacion_id, 'entrada', v_venta_item.cantidad, 'anulacion_venta', v_venta_item.id, v_persona)
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
    end if;

    insert into venta_anulacion_items (venta_id, venta_item_id, condicion, movimiento_id)
      values (p_venta_id, v_venta_item.id, v_condicion, v_mov_id);
  end loop;

  update ventas set estado = 'anulada', motivo_anulacion = p_motivo, anulado_por = v_persona, anulado_en = now()
    where id = p_venta_id;
end;
$$;

grant execute on function retail.anular_venta(uuid, text, jsonb) to authenticated;

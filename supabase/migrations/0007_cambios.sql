-- ============================================================================
-- 0007_cambios.sql — CAYLA V2
--
-- Cambio de talla/color (Prioridad 1 del roadmap, 2026-09-12): "en ropa es
-- extremadamente frecuente que una clienta cambie una prenda por otra talla
-- o color". Se modela como UN hecho (venta_item -> cambios <- variante
-- nueva), no como una devolución + una venta sin relación entre sí — eso es
-- lo que permite responder "¿por qué salió esta prenda y entró esta otra?"
-- con una sola fila en vez de tener que adivinar el cruce entre dos.
--
-- Deliberadamente NO comparte tabla con `devoluciones`: una devolución
-- existe porque algo salió mal (prenda dañada, talla incorrecta y la
-- clienta ya no quiere nada) y su condición puede ser no vendible; un
-- cambio siempre asume que la prenda que regresa está vendible — es la
-- clienta llevándose otra cosa, no una reclamación.
-- ============================================================================

set search_path = retail, public, extensions;

create table retail.cambios (
  id uuid primary key default gen_random_uuid(),
  venta_item_id uuid not null references retail.venta_items(id),
  ubicacion_id uuid not null references retail.ubicaciones(id),
  variante_nueva_id uuid not null references retail.variantes(id),
  cantidad integer not null check (cantidad > 0),
  diferencia numeric(12,2) not null default 0,
  metodo_pago_diferencia text check (metodo_pago_diferencia in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia')),
  usuario_id uuid references retail.personas(id),
  token_cliente uuid,
  created_at timestamptz not null default now(),
  -- Estado imposible: una diferencia de precio sin forma de pago/reembolso
  -- registrada es plata que nadie sabe cómo se liquidó.
  constraint cambios_diferencia_liquidada check (diferencia = 0 or metodo_pago_diferencia is not null)
);
create unique index cambios_token_cliente_key on retail.cambios (token_cliente) where token_cliente is not null;

-- Mismo patrón que venta_item_id/lote_id/devolucion_item_id/conteo_item_id/
-- transferencia_item_id: FK tipada y nullable en el ledger único, nunca un
-- texto libre en `motivo` que no se pueda seguir por join.
alter table retail.movimientos add column cambio_id uuid references retail.cambios(id);

-- ---------- registrar un cambio ----------
create function retail.registrar_cambio(
  p_venta_item_id uuid, p_ubicacion_id uuid, p_variante_nueva_id uuid,
  p_cantidad integer default 1, p_metodo_pago_diferencia text default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_item venta_items%rowtype;
  v_precio_nuevo numeric;
  v_cambio_id uuid; v_existente cambios%rowtype;
  v_ya_cambiado integer;
  v_diferencia numeric;
  v_persona uuid;
  v_mov_entrada uuid; v_mov_salida uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para hacer cambios en esa ubicación';
  end if;
  if p_cantidad <= 0 then
    raise exception 'La cantidad del cambio debe ser mayor que cero';
  end if;

  if p_token is not null then
    select * into v_existente from cambios where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select * into v_item from venta_items where id = p_venta_item_id;
  if not found then
    raise exception 'La línea de venta % no existe', p_venta_item_id;
  end if;

  -- No cuenta contra devoluciones ya hechas sobre la misma línea (limitación
  -- conocida y asumida: cruzar cambios + devoluciones parciales de una
  -- misma línea es un caso raro, se revisita si aparece en la operación
  -- real). Sí cuenta contra cambios previos de esta línea, que es el caso
  -- común (evita cambiar la misma prenda dos veces por error de doble clic).
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

  select id into v_persona from personas where auth_user_id = auth.uid();

  begin
    insert into cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, usuario_id, token_cliente)
      values (p_venta_item_id, p_ubicacion_id, p_variante_nueva_id, p_cantidad, v_diferencia, p_metodo_pago_diferencia, v_persona, p_token)
      returning id into v_cambio_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from cambios where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  -- la prenda vieja regresa al stock (siempre vendible — ver comentario de cabecera)
  insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, cambio_id, usuario_id)
    values (v_item.variante_id, p_ubicacion_id, 'entrada', p_cantidad, 'cambio', v_cambio_id, v_persona)
    returning id into v_mov_entrada;
  perform fn_aplicar_movimiento(v_mov_entrada);

  -- la prenda nueva sale del stock (revienta acá si no hay suficiente)
  insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, cambio_id, usuario_id)
    values (p_variante_nueva_id, p_ubicacion_id, 'salida', p_cantidad, 'cambio', v_cambio_id, v_persona)
    returning id into v_mov_salida;
  perform fn_aplicar_movimiento(v_mov_salida);

  return v_cambio_id;
end;
$$;

-- ---------- RLS ----------
alter table retail.cambios enable row level security;
create policy cambios_select on retail.cambios for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));
-- Sin policy de escritura directa: mismo patrón que conteo_items — solo
-- registrar_cambio() (security definer) puede crear uno, así nunca existe
-- un cambio sin sus dos movimientos.

-- ---------- grants ----------
grant select on retail.cambios to authenticated;
grant execute on function retail.registrar_cambio to authenticated;

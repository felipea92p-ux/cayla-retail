-- ============================================================================
-- "DAÑADO": UNA PRENDA DEVUELTA DAÑADA YA NO DESAPARECE (Opción A del ADR-0071)
--
-- Hasta hoy, `aprobar_devolucion` solo escribía un movimiento cuando
-- `devolucion_items.condicion = 'vendible'`. Para 'danada_reparacion' y
-- 'danada_donar' no pasaba NADA — ni movimiento, ni fila de stock, ni
-- rastro — la prenda se esfumaba del sistema en el momento exacto en que
-- alguien más la necesitaba ver: "¿cuánto tenemos dañado, esperando
-- resolución?". Confirmado leyendo el código, no asumido (ver ADR-0071,
-- sección "Decisión sin construir 2026-09-17").
--
-- La solución reusa la máquina que ya existe para piso/almacén
-- (20260914230000_inventario_piso_almacen.sql): una tercera sububicación,
-- 'cuarentena', con el mismo mecanismo de `stock` que las otras dos — así
-- Existencias la muestra gratis, sin lectura especial. Solo TIENDAS la
-- usan (igual que piso/almacén): el Taller no vende a clientas, así que
-- nunca puede recibir una devolución (`devoluciones.ubicacion_id` viene de
-- `ventas`, y Taller no vende).
--
-- `devolver_proveedor` (la cuarta condición de `devolucion_items`) sigue
-- sin escribir movimiento — mismo bug, pero es un concepto distinto (vuelve
-- al proveedor, no se liquida/bota/dona acá) y Felipe no lo mencionó al
-- pedir esto. Queda flageado aparte, no se toca en esta migración.
--
-- NO se tocó `AjustarInventarioModal.tsx` (motivo 'merma'): ese camino ya
-- escribe un movimiento real y auditable hoy — el bug que se corrige acá es
-- específico de devoluciones. Mezclar los dos hubiera sido tocar dos RPCs
-- por una sola razón real.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. 'cuarentena' se suma a los tipos de sububicación con significado ----------
-- No se puede ALTER un índice parcial: se recrea con el tercer tipo.
drop index retail.sububicaciones_tipo_unico_por_ubicacion;
create unique index sububicaciones_tipo_unico_por_ubicacion
  on retail.sububicaciones (ubicacion_id, tipo)
  where tipo in ('piso_venta', 'almacen_tienda', 'cuarentena');

-- ---------- 2. historial de resolución — por qué una tabla nueva, no una columna en stock ----------
-- `stock` (via la sububicación 'cuarentena') ya responde "cuánto hay
-- dañado ahora" — es un snapshot, como el resto de `stock`, y no debe
-- cargar historial (principio 4: una sola fuente de verdad, `stock` nunca
-- se edita a mano ni carga memoria propia). Esta tabla responde la
-- pregunta distinta que Felipe pidió: "esta prenda en particular, dañada
-- desde cuándo, resuelta cómo" — un registro por línea de devolución
-- dañada, desde que entra a cuarentena hasta que se resuelve.
--
-- Sin columna `origen`/`motivo_origen` a propósito: `devolucion_item_id`
-- (not null) YA dice el origen — sumar una columna de texto que repite lo
-- que la FK ya dice es el mismo antipatrón que este proyecto evita en
-- otras tablas (ver comentario de `costo_historial` en el plan de Costeo).
create table retail.prendas_danadas (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid not null references retail.variantes (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  cantidad integer not null check (cantidad > 0),
  devolucion_item_id uuid not null unique references retail.devolucion_items (id),
  movimiento_entrada_id uuid not null references retail.movimientos (id),
  -- Los 3 estados de salida son los que pidió Felipe, tal cual, el
  -- 2026-09-17 — fijos en el código por ahora (no en una tabla editable):
  -- "luego vamos por medio de un panel de administrador, poder editar estas
  -- decisiones" queda en 🔖 Pendientes Benja (ver ADR-0071), no en esta
  -- pasada. Cambiarlos hoy es una migración chica si hace falta.
  estado text not null default 'en_cuarentena'
    check (estado in ('en_cuarentena', 'liquidada', 'se_boto', 'donada')),
  movimiento_salida_id uuid references retail.movimientos (id),
  resuelto_por uuid references public.personas (id), -- public, no retail: ver integracion-dynamic-identidad
  resuelto_en timestamptz,
  nota text,
  created_at timestamptz not null default now(),
  -- Mismo candado que ya usa `devoluciones_aprobacion_coherente`: el estado
  -- y sus campos de resolución cambian juntos o no cambian.
  constraint prendas_danadas_resolucion_coherente check (
    (estado = 'en_cuarentena' and movimiento_salida_id is null and resuelto_en is null)
    or (estado <> 'en_cuarentena' and movimiento_salida_id is not null and resuelto_en is not null)
  )
);
create index prendas_danadas_ubicacion_pendiente_idx on retail.prendas_danadas (ubicacion_id) where estado = 'en_cuarentena';

alter table retail.prendas_danadas enable row level security;
create policy prendas_danadas_select on retail.prendas_danadas for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));
-- A propósito, sin policy de insert/update para `authenticated`: la única
-- puerta de entrada es `aprobar_devolucion` (abajo) y la única de
-- resolución es `resolver_prenda_danada` (abajo) — ambas `security
-- definer`, dueño de la tabla. Mismo reparto que `transferencia_recepciones`
-- (Traslados en dos fases). El GRANT de tabla a `authenticated` que ya
-- existe por default privileges (0005_grants.sql) queda inerte sin policy.

-- ---------- 3. aprobar_devolucion: 'danada_*' ahora entra a cuarentena, no desaparece ----------
create or replace function retail.aprobar_devolucion(
  p_devolucion_id uuid, p_reembolso_monto numeric default null, p_reembolso_metodo text default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare d devoluciones%rowtype; r record; v_mov_id uuid; v_persona uuid; v_sub uuid; v_sub_cuarentena uuid; v_caja_id uuid;
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
      -- Nuevo 2026-09-17: entra como stock real a 'cuarentena' — visible en
      -- Existencias como cualquier otra sububicación — en vez de no dejar
      -- rastro. `resolver_prenda_danada` la saca de ahí cuando alguien
      -- decide qué pasó con ella.
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
end;
$$;

-- ---------- 4. resolver_prenda_danada: sacar de cuarentena, con destino ----------
-- Solo líder (mismo criterio que `cerrar_conteo`/`cerrar_traslado_con_diferencia`:
-- cambia stock real de forma consecuente, sin vuelta atrás). Los 3 estados
-- son exactamente los que Felipe pidió: Liquidada = se marca así, con nota
-- libre — NO registra una venta ni un comprobante todavía (eso sería mover
-- dinero real vía SUNAT/Nubefact, una decisión aparte que hay que confirmar
-- explícitamente si es lo que realmente quiere; ver aviso en BITACORA).
create or replace function retail.resolver_prenda_danada(
  p_id uuid, p_estado text, p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare pd prendas_danadas%rowtype; v_persona uuid; v_mov_id uuid; v_sub_cuarentena uuid;
begin
  if p_estado not in ('liquidada', 'se_boto', 'donada') then
    raise exception 'Estado de resolución desconocido: %', p_estado;
  end if;
  if not fn_es_lider() then
    raise exception 'Solo un líder puede resolver una prenda dañada';
  end if;
  select * into pd from prendas_danadas where id = p_id for update;
  if not found then raise exception 'El registro % no existe', p_id; end if;
  if pd.estado <> 'en_cuarentena' then
    raise exception 'Esta prenda ya se resolvió como %', pd.estado;
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  select id into v_sub_cuarentena from sububicaciones where ubicacion_id = pd.ubicacion_id and tipo = 'cuarentena';

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (pd.variante_id, pd.ubicacion_id, v_sub_cuarentena, 'salida', pd.cantidad, 'cuarentena_' || p_estado, v_persona, p_nota)
    returning id into v_mov_id;
  perform fn_aplicar_movimiento(v_mov_id);

  update prendas_danadas set estado = p_estado, movimiento_salida_id = v_mov_id,
                             resuelto_por = v_persona, resuelto_en = now(), nota = p_nota
    where id = p_id;
end;
$$;

-- ============================================================================
-- 20260916150000_traslados_dos_fases.sql — CAYLA V2
--
-- "Traslado entre ubicaciones", pieza inspirada en NetSuite elegida por
-- Felipe. Hoy un traslado es un paso atómico e instantáneo: sale del origen y
-- llega al destino en la misma transacción. Trujillo↔Arequipa son ~20 horas
-- de bus en las que el destino "ve" en pantalla stock que todavía no puede
-- vender. Felipe decidió pasar a un modelo de dos fases: envío → en tránsito
-- → confirmación en destino.
--
-- Decisiones de negocio de Felipe (no técnicas, no se repiten acá el porqué
-- de cada una — ver docs/BITACORA.md):
--   - Confirma cualquier colaborador que opera la sede destino, no hace
--     falta ser líder.
--   - Si lo recibido no coincide con lo enviado (cantidad distinta, o una
--     variante que ni siquiera se envió), queda pendiente de que un LÍDER de
--     destino lo revise y cierre — igual que ya funciona un conteo físico
--     con diferencia.
--   - El tiempo estimado de llegada lo fija quien envía, por traslado (no
--     un umbral fijo del sistema).
--   - Guía de Remisión Electrónica (SUNAT): FUERA de esta pieza — es una
--     integración aparte, con su propia autorización, ver BACKLOG.
--
-- DECIDÍ: el envío deja de ser tipo='traslado' y pasa a ser un tipo='salida'
-- común (motivo='traslado_salida'); la confirmación es un tipo='entrada'
-- común (motivo='traslado_entrada'). tipo='traslado' queda exclusivo de
-- mover_interno() (piso↔almacén, misma sede, sigue instantáneo a propósito)
-- y de las filas históricas estado='completada'. Esto significa CERO cambios
-- en fn_aplicar_movimiento y en recalcular_stock(): las ramas entrada/salida
-- ya hacen exactamente lo que cada fase necesita.
-- DESCARTÉ: tablas nuevas paralelas (traslados/traslado_lineas) — dejaría
-- dos modelos de traslado compitiendo para siempre. También descarté modelar
-- "en tránsito" como una ubicación fantasma — contamina cada selector de
-- ubicación de la app para un beneficio que ya da el modelo elegido sin ese
-- costo.
-- SE ROMPE SI: no se actualiza fn_movimientos/fn_movimientos_resumen
-- (ADR-0050) — asumían que un traslado siempre es una fila tipo='traslado'
-- con origen y destino juntos; una pierna tipo='salida' con
-- motivo='traslado_salida' caería en la categoría genérica "salida",
-- mezclada con ventas. Se corrige en la misma migración, no es opcional.
--
-- Solo LOCAL. No aplicar en producción sin autorización explícita de Felipe.
-- ============================================================================

set search_path = retail, public, extensions;

-- ============================================================================
-- 1. Esquema
-- ============================================================================

alter table retail.transferencias
  drop constraint transferencias_estado_check,
  add constraint transferencias_estado_check
    check (estado in ('completada', 'en_transito', 'recibido_con_diferencia', 'cerrada')),
  alter column estado set default 'en_transito',
  add column fecha_estimada_llegada timestamptz,
  add column confirmado_por uuid references public.personas (id),
  add column confirmado_en timestamptz,
  add column cerrado_por uuid references public.personas (id),
  add column cerrado_en timestamptz,
  add column nota_cierre text;

comment on column retail.transferencias.estado is
  'completada = fila histórica del modelo atómico (anterior a esta migración). en_transito/recibido_con_diferencia/cerrada = modelo de dos fases.';

-- Hechos registrados por quien confirma en destino — línea por línea,
-- sobre-escribibles mientras el traslado no esté cerrado. Deliberadamente
-- SIN FK a transferencia_items: una sustitución (variante recibida que nunca
-- se envió) no tiene fila de envío a la cual apuntar, y es justo el caso que
-- Felipe pidió poder auditar.
create table retail.transferencia_recepciones (
  id uuid primary key default gen_random_uuid(),
  transferencia_id uuid not null references retail.transferencias (id),
  variante_id uuid not null references retail.variantes (id),
  cantidad_recibida integer not null check (cantidad_recibida >= 0),
  movimiento_id uuid,
  registrado_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  unique (transferencia_id, variante_id)
);

alter table retail.movimientos add column transferencia_recepcion_id uuid;
alter table retail.transferencia_recepciones
  add constraint transferencia_recepciones_movimiento_fkey foreign key (movimiento_id) references retail.movimientos (id);
alter table retail.movimientos
  add constraint movimientos_transferencia_recepcion_fkey foreign key (transferencia_recepcion_id) references retail.transferencia_recepciones (id);

-- ============================================================================
-- 2. RLS
-- ============================================================================

-- No existía ninguna policy de UPDATE sobre transferencias — la fila nunca
-- se tocaba después de crearse. El control fino (solo líder puede cerrar con
-- diferencia) vive en el RPC, no acá — mismo reparto que conteos/cerrar_conteo.
create policy transferencias_update on retail.transferencias for update
  using (fn_puede_operar_ubicacion(ubicacion_origen_id) or fn_puede_operar_ubicacion(ubicacion_destino_id))
  with check (fn_puede_operar_ubicacion(ubicacion_origen_id) or fn_puede_operar_ubicacion(ubicacion_destino_id));

alter table retail.transferencia_recepciones enable row level security;

create policy transferencia_recepciones_select on retail.transferencia_recepciones for select
  using (
    exists (
      select 1 from transferencias t where t.id = transferencia_recepciones.transferencia_id
        and (fn_puede_operar_ubicacion(t.ubicacion_origen_id) or fn_puede_operar_ubicacion(t.ubicacion_destino_id))
    )
  );

revoke all on retail.transferencia_recepciones from authenticated, anon;
grant select on retail.transferencia_recepciones to authenticated;

-- ============================================================================
-- 3. RPCs
-- ============================================================================

-- Único llamador confirmado en todo el repo: MoverMercaderiaFormV2.tsx (se
-- actualiza en esta misma tarea). Se retira, no queda vivo en paralelo.
drop function if exists retail.transferir(uuid, uuid, jsonb, text);

create function retail.iniciar_traslado(
  p_ubicacion_origen_id uuid,
  p_ubicacion_destino_id uuid,
  p_items jsonb,                        -- [{variante_id, cantidad}]
  p_fecha_estimada_llegada timestamptz,
  p_nota text default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_transferencia_id uuid; v_item jsonb; v_item_id uuid; v_mov_id uuid; v_persona uuid; v_sub_origen uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_origen_id) then
    raise exception 'No tienes permiso para trasladar mercadería desde esa ubicación';
  end if;
  if p_ubicacion_origen_id = p_ubicacion_destino_id then
    raise exception 'Origen y destino no pueden ser la misma ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Un traslado necesita al menos un ítem';
  end if;
  if p_fecha_estimada_llegada is null then
    raise exception 'Indica cuándo esperas que llegue el traslado';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub_origen := fn_sububicacion_por_defecto(p_ubicacion_origen_id, 'traslado_salida');

  insert into transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, creado_por, nota, fecha_estimada_llegada)
    values (p_ubicacion_origen_id, p_ubicacion_destino_id, 'en_transito', v_persona, p_nota, p_fecha_estimada_llegada)
    returning id into v_transferencia_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into transferencia_items (transferencia_id, variante_id, cantidad)
      values (v_transferencia_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer)
      returning id into v_item_id;

    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, transferencia_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_origen_id, v_sub_origen,
              'salida', (v_item ->> 'cantidad')::integer, 'traslado_salida', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);

    update transferencia_items set movimiento_id = v_mov_id where id = v_item_id;
  end loop;

  return v_transferencia_id;
end;
$$;

revoke all on function retail.iniciar_traslado(uuid, uuid, jsonb, timestamptz, text) from public;
grant execute on function retail.iniciar_traslado(uuid, uuid, jsonb, timestamptz, text) to authenticated;

comment on function retail.iniciar_traslado(uuid, uuid, jsonb, timestamptz, text) is
  'Fase 1: sale del almacén de origen. El stock queda en tránsito (ni en origen ni en destino) hasta confirmar_traslado o cerrar_traslado_con_diferencia.';

-- Fase 2a: registrar línea por línea lo que realmente llegó. Sobre-escribible
-- mientras el traslado no esté cerrado — mismo espíritu que conteo_contar.
create function retail.registrar_recepcion_traslado(
  p_transferencia_id uuid, p_variante_id uuid, p_cantidad_recibida integer
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare t transferencias%rowtype; v_persona uuid; v_id uuid;
begin
  select * into t from transferencias where id = p_transferencia_id for update;
  if not found then raise exception 'El traslado % no existe', p_transferencia_id; end if;
  if not fn_puede_operar_ubicacion(t.ubicacion_destino_id) then
    raise exception 'No tienes permiso para confirmar recepción en esa ubicación';
  end if;
  if t.estado not in ('en_transito', 'recibido_con_diferencia') then
    raise exception 'Este traslado ya está % — no se puede seguir confirmando', t.estado;
  end if;
  if p_cantidad_recibida < 0 then
    raise exception 'La cantidad recibida no puede ser negativa';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into transferencia_recepciones (transferencia_id, variante_id, cantidad_recibida, registrado_por)
    values (p_transferencia_id, p_variante_id, p_cantidad_recibida, v_persona)
    on conflict (transferencia_id, variante_id) do update
      set cantidad_recibida = excluded.cantidad_recibida, registrado_por = excluded.registrado_por
    returning id into v_id;

  if t.confirmado_por is null then
    update transferencias set confirmado_por = v_persona, confirmado_en = now() where id = p_transferencia_id;
  end if;
  return v_id;
end;
$$;

revoke all on function retail.registrar_recepcion_traslado(uuid, uuid, integer) from public;
grant execute on function retail.registrar_recepcion_traslado(uuid, uuid, integer) to authenticated;

-- Fase 2b: "ya terminé de confirmar" — decide sola si cierra o queda
-- pendiente. Exige que TODA línea enviada tenga su contraparte registrada
-- (aunque sea 0) para que una línea olvidada nunca se trate en silencio como
-- "llegaron 0 y está bien".
create function retail.confirmar_traslado(p_transferencia_id uuid)
returns table (resultado text, lineas_ok integer, lineas_con_diferencia integer)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  t transferencias%rowtype; v_persona uuid; v_distintas integer; r record; v_mov_id uuid; v_sub_destino uuid;
begin
  select * into t from transferencias where id = p_transferencia_id for update;
  if not found then raise exception 'El traslado % no existe', p_transferencia_id; end if;
  if not fn_puede_operar_ubicacion(t.ubicacion_destino_id) then
    raise exception 'No tienes permiso para confirmar recepción en esa ubicación';
  end if;
  if t.estado <> 'en_transito' then raise exception 'Este traslado ya está %', t.estado; end if;

  if exists (
    select 1 from transferencia_items ti
    where ti.transferencia_id = p_transferencia_id
      and not exists (select 1 from transferencia_recepciones tr
                       where tr.transferencia_id = ti.transferencia_id and tr.variante_id = ti.variante_id)
  ) then
    raise exception 'Todavía faltan prendas enviadas por confirmar — registra qué pasó con cada una (aunque sea 0)';
  end if;

  select count(*) into v_distintas
  from transferencia_items ti
  full join transferencia_recepciones tr
    on tr.transferencia_id = ti.transferencia_id and tr.variante_id = ti.variante_id
  where coalesce(ti.transferencia_id, tr.transferencia_id) = p_transferencia_id
    and coalesce(ti.cantidad, 0) <> coalesce(tr.cantidad_recibida, 0);

  select id into v_persona from personas where auth_user_id = auth.uid();

  if v_distintas = 0 then
    v_sub_destino := fn_sububicacion_por_defecto(t.ubicacion_destino_id, 'traslado_entrada');
    for r in select * from transferencia_recepciones where transferencia_id = p_transferencia_id loop
      if r.cantidad_recibida > 0 then
        insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, transferencia_recepcion_id, usuario_id)
          values (r.variante_id, t.ubicacion_destino_id, v_sub_destino,
                  'entrada', r.cantidad_recibida, 'traslado_entrada', r.id, v_persona)
          returning id into v_mov_id;
        perform fn_aplicar_movimiento(v_mov_id);
        update transferencia_recepciones set movimiento_id = v_mov_id where id = r.id;
      end if;
    end loop;
    update transferencias set estado = 'cerrada', confirmado_por = coalesce(confirmado_por, v_persona),
        confirmado_en = coalesce(confirmado_en, now()), cerrado_por = v_persona, cerrado_en = now()
      where id = p_transferencia_id;
    return query select 'cerrada'::text, (select count(*)::integer from transferencia_recepciones where transferencia_id = p_transferencia_id), 0;
  else
    update transferencias set estado = 'recibido_con_diferencia',
        confirmado_por = coalesce(confirmado_por, v_persona), confirmado_en = coalesce(confirmado_en, now())
      where id = p_transferencia_id;
    return query select 'recibido_con_diferencia'::text, 0, v_distintas;
  end if;
end;
$$;

revoke all on function retail.confirmar_traslado(uuid) from public;
grant execute on function retail.confirmar_traslado(uuid) to authenticated;

-- Exclusivo líder de destino, espejo de cerrar_conteo: aplica los
-- movimientos de entrada por lo que realmente se registró.
create function retail.cerrar_traslado_con_diferencia(p_transferencia_id uuid, p_nota text default null)
returns table (lineas_recibidas integer, unidades_recibidas integer)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  t transferencias%rowtype; v_persona uuid; r record; v_mov_id uuid; v_sub_destino uuid;
  v_lineas integer := 0; v_unidades integer := 0;
begin
  select * into t from transferencias where id = p_transferencia_id for update;
  if not found then raise exception 'El traslado % no existe', p_transferencia_id; end if;
  if t.estado <> 'recibido_con_diferencia' then
    raise exception 'Este traslado no está pendiente de revisión (está %)', t.estado;
  end if;
  if not fn_es_lider() then
    raise exception 'Solo un líder puede cerrar un traslado con diferencias — es la aprobación de lo recibido';
  end if;
  if not fn_puede_operar_ubicacion(t.ubicacion_destino_id) then
    raise exception 'No tienes permiso para cerrar traslados en esa ubicación';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub_destino := fn_sububicacion_por_defecto(t.ubicacion_destino_id, 'traslado_entrada');
  for r in select * from transferencia_recepciones where transferencia_id = p_transferencia_id and movimiento_id is null loop
    if r.cantidad_recibida > 0 then
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, transferencia_recepcion_id, usuario_id)
        values (r.variante_id, t.ubicacion_destino_id, v_sub_destino,
                'entrada', r.cantidad_recibida, 'traslado_entrada', r.id, v_persona)
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      update transferencia_recepciones set movimiento_id = v_mov_id where id = r.id;
      v_lineas := v_lineas + 1; v_unidades := v_unidades + r.cantidad_recibida;
    end if;
  end loop;

  update transferencias set estado = 'cerrada', cerrado_por = v_persona, cerrado_en = now(), nota_cierre = p_nota
    where id = p_transferencia_id;
  return query select v_lineas, v_unidades;
end;
$$;

revoke all on function retail.cerrar_traslado_con_diferencia(uuid, text) from public;
grant execute on function retail.cerrar_traslado_con_diferencia(uuid, text) to authenticated;

-- Lectura de detalle: enviado vs. recibido vs. diferencia por línea.
create function retail.fn_traslado_lineas(p_transferencia_id uuid)
returns table (
  variante_id uuid, sku text, referencia text, talla text, color text,
  cantidad_enviada integer, cantidad_recibida integer, diferencia integer
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(ti.variante_id, tr.variante_id), va.sku, p.referencia, va.talla, co.nombre,
         ti.cantidad, tr.cantidad_recibida, coalesce(tr.cantidad_recibida, 0) - coalesce(ti.cantidad, 0)
  from transferencia_items ti
  full join transferencia_recepciones tr
    on tr.transferencia_id = ti.transferencia_id and tr.variante_id = ti.variante_id
  join variantes va on va.id = coalesce(ti.variante_id, tr.variante_id)
  join productos p on p.id = va.producto_id
  left join colores co on co.codigo = va.color_codigo
  where coalesce(ti.transferencia_id, tr.transferencia_id) = p_transferencia_id
    and exists (select 1 from transferencias t where t.id = p_transferencia_id
      and (fn_puede_operar_ubicacion(t.ubicacion_origen_id) or fn_puede_operar_ubicacion(t.ubicacion_destino_id)));
$$;

revoke all on function retail.fn_traslado_lineas(uuid) from public;
grant execute on function retail.fn_traslado_lineas(uuid) to authenticated;

-- ============================================================================
-- 4. Lectura: fn_movimientos / fn_movimientos_resumen conocen las 2 piernas
-- ============================================================================
-- OJO — encontrado al aplicar: mi copia original partía de
-- 20260915090000_movimientos_lectura.sql (11 parámetros), pero
-- 20260915204457_movimientos_por_producto.sql (llegada a main DESPUÉS de mi
-- primera auditoría, sesión de Historial de Producto) ya le había agregado
-- un 12º parámetro (`p_producto_id`) sin que yo lo supiera — mi CREATE OR
-- REPLACE con 11 args no reemplazaba nada: creaba un SEGUNDO fn_movimientos
-- ambiguo al lado del real (encontrado al probar: "function ... is not
-- unique"). Esta versión parte del cuerpo de 20260915204457 (12 parámetros,
-- con p_producto_id) y le suma los mismos 3 cambios de siempre: (a) la
-- categoría también reconoce motivo IN (traslado_salida, traslado_entrada);
-- (b) el filtro p_categoria hace lo mismo, y excluye esos motivos de
-- "entrada"/"salida"; (c) transferencia_id/estado/nota se resuelven también
-- por transferencia_recepciones (la pierna de entrada no tiene
-- transferencia_item_id, tiene transferencia_recepcion_id). El signo (delta)
-- NO cambia: 'entrada'/'salida' ya dan el signo correcto.
drop function if exists retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer);
drop function if exists retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid);

create function retail.fn_movimientos(
  p_ubicacion_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_categoria text default null,
  p_motivo text default null,
  p_busqueda text default null,
  p_usuario_id uuid default null,
  p_sububicacion_id uuid default null,
  p_cursor_creado_en timestamptz default null,
  p_cursor_id uuid default null,
  p_limite integer default 50,
  p_producto_id uuid default null
)
returns table (
  id uuid,
  created_at timestamptz,
  fecha_lima date,
  hora text,
  tipo text,
  categoria text,
  motivo text,
  cantidad integer,
  delta integer,
  es_sistema boolean,
  nota text,
  variante_id uuid,
  sku text,
  referencia text,
  talla text,
  color text,
  ubicacion_id uuid,
  ubicacion_nombre text,
  ubicacion_destino_id uuid,
  ubicacion_destino_nombre text,
  sububicacion_id uuid,
  sububicacion_nombre text,
  sububicacion_tipo text,
  sububicacion_destino_id uuid,
  sububicacion_destino_nombre text,
  sububicacion_destino_tipo text,
  usuario_id uuid,
  usuario_nombre text,
  venta_id uuid,
  venta_nota text,
  comprobante_tipo text,
  comprobante_numero text,
  comprobante_estado text,
  lote_id uuid,
  lote_guia text,
  lote_nota text,
  proveedor_nombre text,
  compra_id uuid,
  compra_documento text,
  transferencia_id uuid,
  transferencia_estado text,
  transferencia_nota text,
  conteo_id uuid,
  conteo_cantidad_sistema integer,
  conteo_cantidad_contada integer,
  devolucion_id uuid,
  devolucion_motivo text,
  devolucion_estado text,
  cambio_id uuid,
  cambio_diferencia numeric
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  v_busqueda text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_variantes uuid[];
  v_variantes_producto uuid[];
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 200)) + 1;
  v_desde timestamptz := (p_desde::timestamp) at time zone 'America/Lima';
  v_hasta timestamptz := ((p_hasta + 1)::timestamp) at time zone 'America/Lima';
begin
  if p_ubicacion_id is null then
    raise exception 'Falta indicar la ubicación cuyos movimientos quieres ver';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ver los movimientos de esa ubicación';
  end if;
  if p_categoria is not null and p_categoria not in ('entrada', 'salida', 'interno', 'ajuste', 'transferencia') then
    raise exception 'Categoría de movimiento desconocida: %', p_categoria;
  end if;
  if (p_cursor_creado_en is null) <> (p_cursor_id is null) then
    raise exception 'El cursor de paginado viene incompleto';
  end if;

  if v_busqueda is not null then
    v_variantes := fn_movimientos_variantes(v_busqueda);
    if coalesce(array_length(v_variantes, 1), 0) = 0 then return; end if;
  end if;

  if p_producto_id is not null then
    select coalesce(array_agg(v.id), '{}'::uuid[]) into v_variantes_producto
    from variantes v where v.producto_id = p_producto_id;
    if coalesce(array_length(v_variantes_producto, 1), 0) = 0 then return; end if;
  end if;

  return query
  select
    m.id,
    m.created_at,
    (m.created_at at time zone 'America/Lima')::date,
    to_char(m.created_at at time zone 'America/Lima', 'HH24:MI'),
    m.tipo,
    case
      when m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id then 'interno'
      when m.tipo = 'traslado' then 'transferencia'
      when m.motivo in ('traslado_salida', 'traslado_entrada') then 'transferencia'
      else m.tipo
    end,
    m.motivo,
    m.cantidad,
    case m.tipo
      when 'entrada' then m.cantidad
      when 'salida' then -m.cantidad
      when 'ajuste' then m.cantidad
      when 'traslado' then
        case
          when m.ubicacion_id = m.ubicacion_destino_id then 0
          when m.ubicacion_destino_id = p_ubicacion_id then m.cantidad
          else -m.cantidad
        end
    end,
    m.usuario_id is null,
    m.nota,
    m.variante_id,
    va.sku,
    pr.referencia,
    va.talla,
    co.nombre,
    -- Ojo, encontrado al probar en navegador: una pierna de traslado en dos
    -- fases solo trae SU lado (m.ubicacion_destino_id queda NULL a
    -- propósito, ver movimientos_traslado_tiene_destino) — a diferencia del
    -- modelo atómico viejo, donde una sola fila ya traía origen Y destino.
    -- Mostrar la fila con "Taller → —" (ambos lados iguales al de siempre)
    -- se ve roto. Para estas dos piernas, el origen/destino que se muestra
    -- es el de la TRANSFERENCIA (tr), no el de la fila — así la flecha lee
    -- igual en las dos piernas de un mismo traslado.
    case when m.motivo in ('traslado_salida', 'traslado_entrada') then tr.ubicacion_origen_id else m.ubicacion_id end,
    case when m.motivo in ('traslado_salida', 'traslado_entrada') then tr_origen.nombre else uo.nombre end,
    case when m.motivo in ('traslado_salida', 'traslado_entrada') then tr.ubicacion_destino_id else m.ubicacion_destino_id end,
    case when m.motivo in ('traslado_salida', 'traslado_entrada') then tr_destino.nombre else ud.nombre end,
    m.sububicacion_id,
    so.nombre,
    so.tipo,
    m.sububicacion_destino_id,
    sd.nombre,
    sd.tipo,
    m.usuario_id,
    per.nombres || ' ' || per.apellidos,
    ve.id,
    ve.nota,
    cmp.tipo,
    case when cmp.serie is not null then cmp.serie || '-' || lpad(cmp.numero::text, 6, '0') end,
    cmp.estado,
    m.lote_id,
    lo.numero_guia,
    lo.nota,
    prov.nombre,
    ci.compra_id,
    cp.documento,
    tr.id,
    tr.estado,
    tr.nota,
    cti.conteo_id,
    cti.cantidad_sistema,
    cti.cantidad_contada,
    di.devolucion_id,
    de.motivo,
    de.estado,
    m.cambio_id,
    ca.diferencia
  from movimientos m
  join variantes va on va.id = m.variante_id
  join productos pr on pr.id = va.producto_id
  left join colores co on co.codigo = va.color_codigo
  join ubicaciones uo on uo.id = m.ubicacion_id
  left join ubicaciones ud on ud.id = m.ubicacion_destino_id
  left join sububicaciones so on so.id = m.sububicacion_id
  left join sububicaciones sd on sd.id = m.sububicacion_destino_id
  left join public.personas per on per.id = m.usuario_id
  left join venta_items vi on vi.id = m.venta_item_id
  left join devolucion_items di on di.id = m.devolucion_item_id
  left join devoluciones de on de.id = di.devolucion_id
  left join cambios ca on ca.id = m.cambio_id
  left join venta_items cvi on cvi.id = ca.venta_item_id
  left join ventas ve on ve.id = coalesce(vi.venta_id, de.venta_id, cvi.venta_id)
  left join lateral (
    select c.tipo, c.serie, c.numero, c.estado
    from comprobantes c
    where c.venta_id = ve.id and c.tipo in ('boleta', 'factura')
    order by c.created_at desc
    limit 1
  ) cmp on ve.id is not null
  left join lotes lo on lo.id = m.lote_id
  left join proveedores prov on prov.id = lo.proveedor_id
  left join compra_items ci on ci.id = m.compra_item_id
  left join compras cp on cp.id = ci.compra_id
  -- La pierna de SALIDA se referencia por transferencia_item_id; la de
  -- ENTRADA (confirmación) no tiene esa columna — su referencia es
  -- transferencia_recepcion_id, un camino nuevo y paralelo. Cualquiera de
  -- los dos que exista apunta a la MISMA fila de `transferencias`.
  left join transferencia_items ti on ti.id = m.transferencia_item_id
  left join transferencia_recepciones trc on trc.id = m.transferencia_recepcion_id
  left join transferencias tr on tr.id = coalesce(ti.transferencia_id, trc.transferencia_id)
  left join ubicaciones tr_origen on tr_origen.id = tr.ubicacion_origen_id
  left join ubicaciones tr_destino on tr_destino.id = tr.ubicacion_destino_id
  left join conteo_items cti on cti.id = m.conteo_item_id
  where (m.ubicacion_id = p_ubicacion_id or m.ubicacion_destino_id = p_ubicacion_id)
    and m.variante_id <> c_cargo_especial
    and (p_desde is null or m.created_at >= v_desde)
    and (p_hasta is null or m.created_at < v_hasta)
    and (p_motivo is null or m.motivo = p_motivo)
    and (p_usuario_id is null or m.usuario_id = p_usuario_id)
    and (p_sububicacion_id is null or m.sububicacion_id = p_sububicacion_id or m.sububicacion_destino_id = p_sububicacion_id)
    and (v_variantes is null or m.variante_id = any(v_variantes))
    and (v_variantes_producto is null or m.variante_id = any(v_variantes_producto))
    and (
      p_categoria is null
      or (p_categoria = 'salida' and m.tipo = 'salida' and coalesce(m.motivo, '') <> 'traslado_salida')
      or (p_categoria = 'entrada' and m.tipo = 'entrada' and coalesce(m.motivo, '') <> 'traslado_entrada')
      or (p_categoria = 'ajuste' and m.tipo = 'ajuste')
      or (p_categoria = 'interno' and m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id)
      or (p_categoria = 'transferencia' and (
            (m.tipo = 'traslado' and m.ubicacion_id <> m.ubicacion_destino_id)
            or m.motivo in ('traslado_salida', 'traslado_entrada')
          ))
    )
    and (p_cursor_creado_en is null or (m.created_at, m.id) < (p_cursor_creado_en, p_cursor_id))
  order by m.created_at desc, m.id desc
  limit v_limite;
end;
$$;

revoke all on function retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid) from public;
grant execute on function retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid) to authenticated;

comment on function retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid) is
  'Historial de movimientos de una ubicación (origen o destino), una fila plana con la referencia de su proceso ya resuelta. Filtros server-side, cursor (created_at, id), devuelve limite+1 filas. p_producto_id acota a las variantes de ese producto. Excluye la variante centinela Cargo especial. Reconoce las dos piernas de un traslado en dos fases (traslado_salida/traslado_entrada) como categoría "transferencia".';

create or replace function retail.fn_movimientos_resumen(
  p_ubicacion_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_motivo text default null,
  p_busqueda text default null,
  p_usuario_id uuid default null,
  p_sububicacion_id uuid default null
)
returns table (
  categoria text,
  movimientos bigint,
  unidades bigint,
  delta bigint
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  v_busqueda text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_variantes uuid[];
  v_desde timestamptz := (p_desde::timestamp) at time zone 'America/Lima';
  v_hasta timestamptz := ((p_hasta + 1)::timestamp) at time zone 'America/Lima';
begin
  if p_ubicacion_id is null then
    raise exception 'Falta indicar la ubicación cuyos movimientos quieres ver';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ver los movimientos de esa ubicación';
  end if;

  if v_busqueda is not null then
    v_variantes := fn_movimientos_variantes(v_busqueda);
    if coalesce(array_length(v_variantes, 1), 0) = 0 then return; end if;
  end if;

  return query
  select
    x.categoria,
    count(*)::bigint,
    sum(abs(x.cantidad))::bigint,
    sum(x.delta)::bigint
  from (
    select
      case
        when m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id then 'interno'
        when m.tipo = 'traslado' then 'transferencia'
        when m.motivo in ('traslado_salida', 'traslado_entrada') then 'transferencia'
        else m.tipo
      end as categoria,
      m.cantidad,
      case m.tipo
        when 'entrada' then m.cantidad
        when 'salida' then -m.cantidad
        when 'ajuste' then m.cantidad
        when 'traslado' then
          case
            when m.ubicacion_id = m.ubicacion_destino_id then 0
            when m.ubicacion_destino_id = p_ubicacion_id then m.cantidad
            else -m.cantidad
          end
      end as delta
    from movimientos m
    where (m.ubicacion_id = p_ubicacion_id or m.ubicacion_destino_id = p_ubicacion_id)
      and m.variante_id <> c_cargo_especial
      and (p_desde is null or m.created_at >= v_desde)
      and (p_hasta is null or m.created_at < v_hasta)
      and (p_motivo is null or m.motivo = p_motivo)
      and (p_usuario_id is null or m.usuario_id = p_usuario_id)
      and (p_sububicacion_id is null or m.sububicacion_id = p_sububicacion_id or m.sububicacion_destino_id = p_sububicacion_id)
      and (v_variantes is null or m.variante_id = any(v_variantes))
  ) x
  group by x.categoria;
end;
$$;

revoke all on function retail.fn_movimientos_resumen(uuid, date, date, text, text, uuid, uuid) from public;
grant execute on function retail.fn_movimientos_resumen(uuid, date, date, text, text, uuid, uuid) to authenticated;

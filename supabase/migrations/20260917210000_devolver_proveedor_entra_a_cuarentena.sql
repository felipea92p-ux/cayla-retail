-- ============================================================================
-- "DEVOLVER AL PROVEEDOR" TAMPOCO DESAPARECE (cierra lo que 195448 dejó flageado)
--
-- La migración de hoy más temprano (20260917195448_cuarentena_prendas_danadas.sql)
-- arregló que 'danada_reparacion'/'danada_donar' dejaran de esfumarse sin rastro,
-- y dejó 'devolver_proveedor' explícitamente afuera: "es un concepto distinto
-- (vuelve al proveedor, no se liquida/bota/dona acá) y Felipe no lo mencionó al
-- pedir esto. Queda flageado aparte, no se toca en esta migración."
--
-- Esta migración cierra ese flag. Contexto de por qué ahora, no antes: en una
-- sesión de hoy Felipe había dicho de este mismo hueco "no es prioridad [...] si
-- no afecta nuestra actividad actual ahora mismo, entonces no" (ver BACKLOG,
-- sección "Pendientes Benja"). En otra sesión, al analizar qué métricas de
-- proveedor construir, Felipe vio la conexión — "cuánto le debemos a cada
-- proveedor" no puede ser confiable si una devolución hacia él sigue sin dejar
-- rastro — y pidió revisarlo ahora. Misma pieza, contexto nuevo.
--
-- ALCANCE — qué se arregla y qué no:
-- SÍ: la prenda entra a 'cuarentena' igual que Dañado, en vez de desaparecer.
--     Reusa `prendas_danadas`/`resolver_prenda_danada` en vez de crear una tabla
--     y un flujo gemelos — es la misma pregunta ("qué hay guardado esperando una
--     decisión, y por qué") con un cuarto desenlace posible, no un concepto
--     nuevo. (Nota de vocabulario: el nombre `prendas_danadas` ya no describe al
--     100% lo que guarda —una vuelta al proveedor por talla equivocada no es
--     "dañada"—; no se renombra en esta pasada por ser tabla de ayer sin
--     beneficio funcional inmediato; si en la práctica confunde, es una
--     migración de rename chica.)
-- NO: ajuste automático de deuda contra una factura del proveedor. Hoy no existe
--     NINGÚN camino de datos de una devolución a una compra específica —
--     `devoluciones` cuelga de `venta_id`, nunca de `compra_id`, y ni siquiera
--     hay un "proveedor preferido del producto" (se buscó `productos.proveedor_id`
--     para intentar inferirlo automáticamente: no existe en este repo, pese a
--     que BITACORA 2026-09-05 lo da por construido — esa entrada describe otra
--     línea de migraciones, no esta). Inventar un descuento automático sin nada
--     real que enganchar sería el mismo error que ADR-0035 evitó con
--     `ordenes_compra` (un número que nunca se concilia). Lo que sí queda: quien
--     resuelve la prenda como "devuelta al proveedor" elige a mano a cuál —
--     misma lógica que ya usan Liquidada/Se botó/Donada (una persona real
--     decide y deja nota), no una inferencia.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. prendas_danadas gana un cuarto desenlace y a quién se le devolvió ----------
alter table retail.prendas_danadas drop constraint prendas_danadas_estado_check;
alter table retail.prendas_danadas
  add constraint prendas_danadas_estado_check
  check (estado in ('en_cuarentena', 'liquidada', 'se_boto', 'donada', 'devuelta_proveedor'));

alter table retail.prendas_danadas add column proveedor_id uuid references retail.proveedores (id);
comment on column retail.prendas_danadas.proveedor_id is
  'Solo cuando estado = devuelta_proveedor. Lo elige a mano quien resuelve — no hay hoy ningún camino de datos que lo infiera solo (ver cabecera de esta migración).';

-- Mismo criterio que `prendas_danadas_resolucion_coherente`: el dato y el
-- estado que lo exige cambian juntos, la base lo hace cumplir, no la pantalla.
alter table retail.prendas_danadas
  add constraint prendas_danadas_proveedor_coherente
  check ((estado = 'devuelta_proveedor') = (proveedor_id is not null));

-- ---------- 2. aprobar_devolucion: 'devolver_proveedor' entra a cuarentena igual que 'danada_*' ----------
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
    elsif r.condicion in ('danada_reparacion', 'danada_donar', 'devolver_proveedor') then
      -- 'devolver_proveedor' se suma hoy 2026-09-17 (segunda pasada): mismo
      -- mecanismo que 'danada_*' — entra a cuarentena real, visible en
      -- Existencias, en vez de no dejar rastro. `resolver_prenda_danada` la
      -- saca de ahí cuando alguien decide/ejecuta qué pasó con ella.
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

-- ---------- 3. resolver_prenda_danada: el cuarto desenlace pide a mano a quién se le devuelve ----------
create or replace function retail.resolver_prenda_danada(
  p_id uuid, p_estado text, p_nota text default null, p_proveedor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare pd prendas_danadas%rowtype; v_persona uuid; v_mov_id uuid; v_sub_cuarentena uuid; v_proveedor_nombre text;
begin
  if p_estado not in ('liquidada', 'se_boto', 'donada', 'devuelta_proveedor') then
    raise exception 'Estado de resolución desconocido: %', p_estado;
  end if;
  if p_estado = 'devuelta_proveedor' and p_proveedor_id is null then
    raise exception 'Decí a qué proveedor se le devuelve para poder resolverlo como "Devuelta al proveedor".';
  end if;
  if p_estado <> 'devuelta_proveedor' and p_proveedor_id is not null then
    raise exception 'Un proveedor solo aplica cuando el estado es "Devuelta al proveedor".';
  end if;
  if p_proveedor_id is not null then
    select nombre into v_proveedor_nombre from proveedores where id = p_proveedor_id;
    if not found then raise exception 'Ese proveedor ya no existe. Recarga la pantalla.'; end if;
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
                             resuelto_por = v_persona, resuelto_en = now(), nota = p_nota,
                             proveedor_id = p_proveedor_id
    where id = p_id;
end;
$$;

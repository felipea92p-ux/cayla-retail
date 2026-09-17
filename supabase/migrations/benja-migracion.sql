-- ============================================================================
-- benja-migracion.sql
--
-- ⚠️  PENDIENTE DE REVISIÓN — NO EJECUTADO EN PRODUCCIÓN. NO CORRER TAL CUAL. ⚠️
--
-- QUÉ ES: una foto completa del esquema `retail` V2 tal como existe HOY en
-- Supabase Local (23 tablas del núcleo + las 4 de Prioridad 1: cajas,
-- caja_movimientos, cambios, venta_pagos — 27 en total, 21 funciones, 47
-- policies de RLS). Generado con `pg_dump --schema=retail --schema-only`
-- directo desde la base local, no copiado a mano de las migraciones 0001–
-- 0008, para no arrastrar una versión ya corregida de alguna función (ej.
-- fn_puede_operar_ubicacion tenía un bug de seguridad real, corregido en
-- 0006_colaboradores.sql — este dump ya trae solo la versión corregida).
--
-- POR QUÉ NO SE PUEDE CORRER TAL CUAL EN PRODUCCIÓN:
-- Producción NO tiene un schema `retail` vacío. Vive dentro del proyecto
-- unificado con Dynamic y hoy corre el esquema V1 (28 tablas, ver
-- CLAUDE.md — "Cómo aplicar SQL a producción"), con datos reales de venta,
-- stock y clientas. Este script asume un schema `retail` vacío o inexistente:
--   - `CREATE SCHEMA IF NOT EXISTS retail` no falla si ya existe.
--   - Pero cada `CREATE TABLE retail.productos (...)`, `retail.variantes`,
--     `retail.ventas`, `retail.clientes`, `retail.proveedores`,
--     `retail.movimientos` — SÍ va a FALLAR si esas tablas YA EXISTEN con
--     otra estructura, que es exactamente el caso hoy en producción.
--   Esto es intencional: es preferible que la migración reviente de una vez
--   al primer choque, a que complete a medias y deje producción con una
--   mezcla rota de V1 y V2. No lleva `IF NOT EXISTS` en las tablas.
--
-- QUÉ FALTA ANTES DE QUE ESTO SEA SEGURO DE CORRER EN PRODUCCIÓN:
--   1. Backup verificado de producción (igual de riguroso que el que se hizo
--      para V1 local — con prueba real de restauración, no solo el archivo).
--   2. Un plan de migración de DATOS V1→V2 (cómo se traduce cada venta,
--      cliente, stock y sede real existente al nuevo modelo — sedes→
--      ubicaciones, contenedores desaparece, personas cambia de forma,
--      etc.). Este script solo trae ESTRUCTURA (tablas/funciones/RLS/
--      grants) vacía, cero datos.
--   3. Ventana de mantenimiento acordada con Felipe — esto no es aplicable
--      en caliente.
--   4. Decisión explícita de Felipe de seguir adelante, turno por turno,
--      no en piloto automático.
--
-- Recordatorio del propio CLAUDE.md del repo: al pegar en el SQL Editor de
-- producción hace falta el prefijo `retail.` en cada sentencia o un
-- `set search_path to retail, public;` al inicio — este archivo YA usa
-- `retail.` explícito en cada objeto (así sale de pg_dump), así que no hace
-- falta agregarlo aparte.
--
-- Generado: 2026-09-12, desde Supabase Local (branch
-- claude/project-analysis-overview-b2916b). Contenido: schema + tablas +
-- constraints + índices + funciones + RLS + grants. NO incluye datos (no es
-- un pg_dump de datos, es --schema-only).
-- ============================================================================

-- Name: retail; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS retail;


--
-- Name: abrir_caja(uuid, numeric); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.abrir_caja(p_ubicacion_id uuid, p_monto_apertura numeric) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare v_caja_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para abrir caja en esa ubicación';
  end if;
  if p_monto_apertura < 0 then
    raise exception 'El monto de apertura no puede ser negativo';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into cajas (ubicacion_id, monto_apertura, abierta_por)
    values (p_ubicacion_id, p_monto_apertura, v_persona)
    returning id into v_caja_id;
  return v_caja_id;
end;
$$;


--
-- Name: abrir_conteo(uuid, uuid); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.abrir_conteo(p_ubicacion_id uuid, p_sububicacion_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare v_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para contar en esa ubicación';
  end if;
  if exists (select 1 from conteos where ubicacion_id = p_ubicacion_id and estado = 'abierto') then
    raise exception 'Ya hay un conteo abierto en esta ubicación — ciérralo antes de abrir otro';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into conteos (ubicacion_id, sububicacion_id, abierto_por)
    values (p_ubicacion_id, p_sububicacion_id, v_persona)
    returning id into v_id;
  return v_id;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: personas; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.personas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid NOT NULL,
    nombre text NOT NULL,
    rol text DEFAULT 'integrante'::text NOT NULL,
    ubicacion_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT personas_rol_check CHECK ((rol = ANY (ARRAY['lider'::text, 'integrante'::text])))
);


--
-- Name: actualizar_persona(uuid, text, uuid, boolean); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.actualizar_persona(p_persona_id uuid, p_rol text DEFAULT NULL::text, p_ubicacion_id uuid DEFAULT NULL::uuid, p_activo boolean DEFAULT NULL::boolean) RETURNS retail.personas
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare v_persona personas%rowtype;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede editar colaboradores';
  end if;
  if p_rol is not null and p_rol not in ('lider', 'integrante') then
    raise exception 'Rol inválido: % (debe ser lider o integrante)', p_rol;
  end if;
  if p_ubicacion_id is not null and not exists (select 1 from ubicaciones where id = p_ubicacion_id) then
    raise exception 'La ubicación % no existe', p_ubicacion_id;
  end if;

  update personas set
    rol = coalesce(p_rol, rol),
    ubicacion_id = coalesce(p_ubicacion_id, ubicacion_id),
    activo = coalesce(p_activo, activo)
  where id = p_persona_id
  returning * into v_persona;

  if not found then
    raise exception 'El colaborador % no existe', p_persona_id;
  end if;
  return v_persona;
end;
$$;


--
-- Name: aprobar_devolucion(uuid, numeric, text); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.aprobar_devolucion(p_devolucion_id uuid, p_reembolso_monto numeric DEFAULT NULL::numeric, p_reembolso_metodo text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare d devoluciones%rowtype; r record; v_mov_id uuid; v_persona uuid;
begin
  select * into d from devoluciones where id = p_devolucion_id for update;
  if not found then raise exception 'La devolución % no existe', p_devolucion_id; end if;
  if d.estado <> 'pendiente' then raise exception 'Esa devolución ya está %', d.estado; end if;
  if not fn_es_lider() then
    raise exception 'Solo un líder puede aprobar una devolución';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  for r in select * from devolucion_items where devolucion_id = p_devolucion_id loop
    if r.condicion = 'vendible' then
      insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, devolucion_item_id, usuario_id)
        select vi.variante_id, d.ubicacion_id, 'entrada', r.cantidad, 'devolucion', r.id, v_persona
        from venta_items vi where vi.id = r.venta_item_id
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      update devolucion_items set movimiento_id = v_mov_id where id = r.id;
    end if;
  end loop;

  update devoluciones set estado = 'aprobada', aprobado_por = v_persona, aprobado_en = now(),
                          reembolso_monto = p_reembolso_monto, reembolso_metodo = p_reembolso_metodo
    where id = p_devolucion_id;
end;
$$;


--
-- Name: cerrar_caja(uuid, numeric); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.cerrar_caja(p_caja_id uuid, p_monto_real numeric) RETURNS TABLE(monto_sistema numeric, monto_real numeric, diferencia numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare
  v_caja cajas%rowtype;
  v_ventas_efectivo numeric;
  v_ingresos numeric;
  v_egresos numeric;
  v_sistema numeric;
  v_persona uuid;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_ubicacion(v_caja.ubicacion_id) then
    raise exception 'No tienes permiso para cerrar esa caja';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada';
  end if;
  if p_monto_real < 0 then
    raise exception 'El monto contado no puede ser negativo';
  end if;

  select coalesce(sum(vp.monto), 0) into v_ventas_efectivo
    from venta_pagos vp join ventas v on v.id = vp.venta_id
    where v.caja_id = p_caja_id and vp.metodo = 'efectivo';

  select coalesce(sum(monto) filter (where tipo = 'ingreso'), 0),
         coalesce(sum(monto) filter (where tipo = 'egreso'), 0)
    into v_ingresos, v_egresos
    from caja_movimientos where caja_id = p_caja_id;

  v_sistema := v_caja.monto_apertura + v_ventas_efectivo + v_ingresos - v_egresos;
  select id into v_persona from personas where auth_user_id = auth.uid();

  update cajas set
    estado = 'cerrada',
    monto_cierre_sistema = v_sistema,
    monto_cierre_real = p_monto_real,
    diferencia = p_monto_real - v_sistema,
    cerrada_por = v_persona,
    cerrada_en = now()
  where id = p_caja_id;

  return query select v_sistema, p_monto_real, p_monto_real - v_sistema;
end;
$$;


--
-- Name: cerrar_conteo(uuid); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.cerrar_conteo(p_conteo_id uuid) RETURNS TABLE(lineas_ajustadas integer, unidades_sobrantes integer, unidades_faltantes integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare
  c conteos%rowtype; r record; v_dif integer; v_mov_id uuid; v_persona uuid;
  v_ajustadas integer := 0; v_sobran integer := 0; v_faltan integer := 0;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not fn_es_lider() then
    raise exception 'Solo un líder puede cerrar un conteo — es la aprobación de lo contado';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  for r in select * from conteo_items where conteo_id = p_conteo_id and diferencia is null loop
    v_dif := r.cantidad_contada - r.cantidad_sistema;
    v_mov_id := null;
    if v_dif <> 0 then
      insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, conteo_item_id, usuario_id)
        values (r.variante_id, c.ubicacion_id, 'ajuste', v_dif, 'conteo', r.id, v_persona)
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      v_ajustadas := v_ajustadas + 1;
      if v_dif > 0 then v_sobran := v_sobran + v_dif; else v_faltan := v_faltan - v_dif; end if;
    end if;
    update conteo_items set diferencia = v_dif, movimiento_id = v_mov_id where id = r.id;
  end loop;

  update conteos set estado = 'cerrado', cerrado_en = now(), cerrado_por = v_persona where id = p_conteo_id;

  return query select v_ajustadas, v_sobran, v_faltan;
end;
$$;


--
-- Name: conteo_contar(uuid, uuid, integer); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.conteo_contar(p_conteo_id uuid, p_variante_id uuid, p_cantidad_contada integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare c conteos%rowtype; v_sistema integer; v_item_id uuid;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not fn_puede_operar_ubicacion(c.ubicacion_id) then
    raise exception 'No tienes permiso para contar en esa ubicación';
  end if;

  select coalesce(cantidad, 0) into v_sistema from stock
    where variante_id = p_variante_id and ubicacion_id = c.ubicacion_id;
  v_sistema := coalesce(v_sistema, 0);

  insert into conteo_items (conteo_id, variante_id, cantidad_sistema, cantidad_contada)
    values (p_conteo_id, p_variante_id, v_sistema, p_cantidad_contada)
    on conflict (conteo_id, variante_id) do update set cantidad_contada = excluded.cantidad_contada
    returning id into v_item_id;

  return v_item_id;
end;
$$;


--
-- Name: crear_devolucion(uuid, uuid, jsonb, text); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.crear_devolucion(p_venta_id uuid, p_ubicacion_id uuid, p_items jsonb, p_motivo text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare
  v_devolucion_id uuid; v_item jsonb; v_venta_item venta_items%rowtype;
  v_ya_devuelto integer; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para registrar devoluciones en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una devolución necesita al menos un ítem';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into devoluciones (venta_id, ubicacion_id, motivo, solicitado_por)
    values (p_venta_id, p_ubicacion_id, p_motivo, v_persona)
    returning id into v_devolucion_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_venta_item from venta_items
      where id = (v_item ->> 'venta_item_id')::uuid and venta_id = p_venta_id;
    if not found then
      raise exception 'El ítem % no pertenece a la venta %', v_item ->> 'venta_item_id', p_venta_id;
    end if;

    select coalesce(sum(di.cantidad), 0) into v_ya_devuelto
      from devolucion_items di join devoluciones d on d.id = di.devolucion_id
      where di.venta_item_id = v_venta_item.id and d.estado <> 'rechazada';

    if v_ya_devuelto + (v_item ->> 'cantidad')::integer > v_venta_item.cantidad then
      raise exception 'Se pide devolver % pero la línea vendió % y ya se devolvieron %',
        (v_item ->> 'cantidad')::integer, v_venta_item.cantidad, v_ya_devuelto;
    end if;

    insert into devolucion_items (devolucion_id, venta_item_id, cantidad, condicion)
      values (v_devolucion_id, v_venta_item.id, (v_item ->> 'cantidad')::integer, v_item ->> 'condicion');
  end loop;

  return v_devolucion_id;
end;
$$;


--
-- Name: fn_aplicar_movimiento(uuid); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.fn_aplicar_movimiento(p_movimiento_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare
  m movimientos%rowtype;
  v_actual integer;
begin
  select * into m from movimientos where id = p_movimiento_id;
  if not found then
    raise exception 'El movimiento % no existe', p_movimiento_id;
  end if;

  if m.tipo = 'entrada' then
    insert into stock (variante_id, ubicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_id, m.cantidad)
      on conflict (variante_id, ubicacion_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();

  elsif m.tipo = 'salida' then
    select cantidad into v_actual from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
      for update;
    if v_actual is null or v_actual < m.cantidad then
      raise exception 'Stock insuficiente: hay % y se pide sacar %', coalesce(v_actual, 0), m.cantidad;
    end if;
    update stock set cantidad = cantidad - m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id;

  elsif m.tipo = 'ajuste' then
    insert into stock (variante_id, ubicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_id, 0)
      on conflict (variante_id, ubicacion_id) do nothing;
    select cantidad into v_actual from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
      for update;
    if v_actual + m.cantidad < 0 then
      raise exception 'El ajuste dejaría stock negativo: hay % y el ajuste es %', v_actual, m.cantidad;
    end if;
    update stock set cantidad = cantidad + m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id;

  elsif m.tipo = 'traslado' then
    if m.ubicacion_destino_id is null then
      raise exception 'Traslado requiere ubicacion_destino_id';
    end if;
    select cantidad into v_actual from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
      for update;
    if v_actual is null or v_actual < m.cantidad then
      raise exception 'Stock insuficiente en origen: hay % y se pide trasladar %', coalesce(v_actual, 0), m.cantidad;
    end if;
    update stock set cantidad = cantidad - m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id;
    insert into stock (variante_id, ubicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_destino_id, m.cantidad)
      on conflict (variante_id, ubicacion_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();
  end if;
end;
$$;


--
-- Name: fn_es_lider(); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.fn_es_lider() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
  select coalesce((select rol = 'lider' from personas where auth_user_id = auth.uid() and activo), false);
$$;


--
-- Name: fn_persona_actual(); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.fn_persona_actual() RETURNS retail.personas
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
  select * from personas where auth_user_id = auth.uid() and activo;
$$;


--
-- Name: fn_puede_operar_ubicacion(uuid); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.fn_puede_operar_ubicacion(p_ubicacion_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
  select coalesce(fn_es_lider() or p_ubicacion_id = fn_ubicacion_actual_persona(), false);
$$;


--
-- Name: fn_ubicacion_actual_persona(); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.fn_ubicacion_actual_persona() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
  select ubicacion_id from personas where auth_user_id = auth.uid() and activo;
$$;


--
-- Name: recalcular_stock(); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.recalcular_stock() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
begin
  delete from stock;
  insert into stock (variante_id, ubicacion_id, cantidad)
  select variante_id, ubicacion_id, sum(delta) from (
    select variante_id, ubicacion_id, cantidad as delta from movimientos where tipo = 'entrada'
    union all
    select variante_id, ubicacion_id, -cantidad from movimientos where tipo = 'salida'
    union all
    select variante_id, ubicacion_id, cantidad from movimientos where tipo = 'ajuste'
    union all
    select variante_id, ubicacion_id, -cantidad from movimientos where tipo = 'traslado'
    union all
    select variante_id, ubicacion_destino_id, cantidad from movimientos where tipo = 'traslado'
  ) t
  group by variante_id, ubicacion_id
  having sum(delta) <> 0;
end;
$$;


--
-- Name: rechazar_devolucion(uuid, text); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.rechazar_devolucion(p_devolucion_id uuid, p_motivo text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare v_persona uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede rechazar una devolución';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  update devoluciones set estado = 'rechazada', aprobado_por = v_persona, aprobado_en = now(),
                          motivo = concat_ws(' · ', motivo, 'rechazada: ' || coalesce(p_motivo, 'sin detalle'))
    where id = p_devolucion_id and estado = 'pendiente';
  if not found then
    raise exception 'La devolución % no existe o ya no está pendiente', p_devolucion_id;
  end if;
end;
$$;


--
-- Name: recibir_lote(uuid, uuid, jsonb, uuid, text, text); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.recibir_lote(p_ubicacion_id uuid, p_proveedor_id uuid, p_items jsonb, p_orden_compra_id uuid DEFAULT NULL::uuid, p_numero_guia text DEFAULT NULL::text, p_nota text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare
  v_lote_id uuid; v_item jsonb; v_mov_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Un lote necesita al menos un ítem';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into lotes (ubicacion_id, proveedor_id, orden_compra_id, numero_guia, recibido_por, nota)
    values (p_ubicacion_id, p_proveedor_id, p_orden_compra_id, p_numero_guia, v_persona, p_nota)
    returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, lote_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, 'entrada',
              (v_item ->> 'cantidad')::integer, 'recepcion', v_lote_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);

    if (v_item ->> 'costo_unitario') is not null then
      update variantes set costo = (v_item ->> 'costo_unitario')::numeric
        where id = (v_item ->> 'variante_id')::uuid;
    end if;
  end loop;

  if p_orden_compra_id is not null then
    update ordenes_compra set estado = 'recibida' where id = p_orden_compra_id;
  end if;

  return v_lote_id;
end;
$$;


--
-- Name: registrar_cambio(uuid, uuid, uuid, integer, text, uuid); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.registrar_cambio(p_venta_item_id uuid, p_ubicacion_id uuid, p_variante_nueva_id uuid, p_cantidad integer DEFAULT 1, p_metodo_pago_diferencia text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
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


--
-- Name: registrar_movimiento(uuid, uuid, text, integer, text, text); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.registrar_movimiento(p_variante_id uuid, p_ubicacion_id uuid, p_tipo text, p_cantidad integer, p_motivo text DEFAULT NULL::text, p_nota text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare v_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para registrar movimientos en esa ubicación';
  end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste') then
    raise exception 'registrar_movimiento es para entrada/salida/ajuste sueltos. Traslados van por transferir(), ventas por registrar_venta(), etc.';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (p_variante_id, p_ubicacion_id, p_tipo, p_cantidad, p_motivo, v_persona, p_nota)
    returning id into v_id;
  perform fn_aplicar_movimiento(v_id);
  return v_id;
end;
$$;


--
-- Name: registrar_movimiento_caja(uuid, text, numeric, text); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.registrar_movimiento_caja(p_caja_id uuid, p_tipo text, p_monto numeric, p_motivo text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare v_caja cajas%rowtype; v_persona uuid; v_id uuid;
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

  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into caja_movimientos (caja_id, tipo, monto, motivo, usuario_id)
    values (p_caja_id, p_tipo, p_monto, p_motivo, v_persona)
    returning id into v_id;
  return v_id;
end;
$$;


--
-- Name: registrar_venta(uuid, jsonb, jsonb, uuid, uuid); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.registrar_venta(p_ubicacion_id uuid, p_items jsonb, p_pagos jsonb, p_cliente_id uuid DEFAULT NULL::uuid, p_token uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare
  v_venta_id uuid; v_existente ventas%rowtype; v_item jsonb; v_pago jsonb;
  v_item_id uuid; v_mov_id uuid; v_costo numeric; v_persona uuid;
  v_caja_id uuid;
  v_total_items numeric := 0;
  v_total_pagos numeric := 0;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para vender en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Falta indicar cómo se pagó la venta';
  end if;

  if p_token is not null then
    select * into v_existente from ventas where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta';
  if v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de registrar una venta';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_total_items := v_total_items +
      (((v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0))
        * (v_item ->> 'cantidad')::integer);
  end loop;
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_total_pagos := v_total_pagos + (v_pago ->> 'monto')::numeric;
  end loop;
  if round(v_total_items, 2) <> round(v_total_pagos, 2) then
    raise exception 'Los pagos (S/%) no cuadran con el total de la venta (S/%)', v_total_pagos, v_total_items;
  end if;

  begin
    insert into ventas (ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente)
      values (p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_token)
      returning id into v_venta_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from ventas where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
    if v_costo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
      values (v_venta_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer,
              (v_item ->> 'precio_unitario')::numeric, coalesce((v_item ->> 'descuento_unitario')::numeric, 0), v_costo)
      returning id into v_item_id;

    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into venta_pagos (venta_id, metodo, monto)
      values (v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric);
  end loop;

  return v_venta_id;
end;
$$;


--
-- Name: transferir(uuid, uuid, jsonb, text); Type: FUNCTION; Schema: retail; Owner: -
--

CREATE FUNCTION retail.transferir(p_ubicacion_origen_id uuid, p_ubicacion_destino_id uuid, p_items jsonb, p_nota text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'retail', 'public', 'extensions'
    AS $$
declare
  v_transferencia_id uuid; v_item jsonb; v_item_id uuid; v_mov_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_origen_id) then
    raise exception 'No tienes permiso para transferir desde esa ubicación';
  end if;
  if p_ubicacion_origen_id = p_ubicacion_destino_id then
    raise exception 'Origen y destino no pueden ser la misma ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una transferencia necesita al menos un ítem';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into transferencias (ubicacion_origen_id, ubicacion_destino_id, creado_por, nota)
    values (p_ubicacion_origen_id, p_ubicacion_destino_id, v_persona, p_nota)
    returning id into v_transferencia_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into transferencia_items (transferencia_id, variante_id, cantidad)
      values (v_transferencia_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer)
      returning id into v_item_id;

    insert into movimientos (variante_id, ubicacion_id, ubicacion_destino_id, tipo, cantidad, motivo, transferencia_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_origen_id, p_ubicacion_destino_id,
              'traslado', (v_item ->> 'cantidad')::integer, 'transferencia', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);

    update transferencia_items set movimiento_id = v_mov_id where id = v_item_id;
  end loop;

  return v_transferencia_id;
end;
$$;


--
-- Name: caja_movimientos; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.caja_movimientos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caja_id uuid NOT NULL,
    tipo text NOT NULL,
    monto numeric(12,2) NOT NULL,
    motivo text NOT NULL,
    usuario_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT caja_movimientos_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT caja_movimientos_tipo_check CHECK ((tipo = ANY (ARRAY['ingreso'::text, 'egreso'::text])))
);


--
-- Name: cajas; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.cajas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ubicacion_id uuid NOT NULL,
    estado text DEFAULT 'abierta'::text NOT NULL,
    monto_apertura numeric(12,2) NOT NULL,
    abierta_por uuid,
    abierta_en timestamp with time zone DEFAULT now() NOT NULL,
    monto_cierre_sistema numeric(12,2),
    monto_cierre_real numeric(12,2),
    diferencia numeric(12,2),
    cerrada_por uuid,
    cerrada_en timestamp with time zone,
    nota text,
    CONSTRAINT cajas_estado_check CHECK ((estado = ANY (ARRAY['abierta'::text, 'cerrada'::text]))),
    CONSTRAINT cajas_monto_apertura_check CHECK ((monto_apertura >= (0)::numeric))
);


--
-- Name: cambios; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.cambios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venta_item_id uuid NOT NULL,
    ubicacion_id uuid NOT NULL,
    variante_nueva_id uuid NOT NULL,
    cantidad integer NOT NULL,
    diferencia numeric(12,2) DEFAULT 0 NOT NULL,
    metodo_pago_diferencia text,
    usuario_id uuid,
    token_cliente uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cambios_cantidad_check CHECK ((cantidad > 0)),
    CONSTRAINT cambios_diferencia_liquidada CHECK (((diferencia = (0)::numeric) OR (metodo_pago_diferencia IS NOT NULL))),
    CONSTRAINT cambios_metodo_pago_diferencia_check CHECK ((metodo_pago_diferencia = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'yape'::text, 'plin'::text, 'transferencia'::text])))
);


--
-- Name: categorias; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.categorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: clientes; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.clientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo_doc text,
    num_doc text,
    nombre text NOT NULL,
    telefono text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT clientes_tipo_doc_check CHECK ((tipo_doc = ANY (ARRAY['dni'::text, 'ruc'::text, 'sin_documento'::text])))
);


--
-- Name: codigos_barras; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.codigos_barras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variante_id uuid NOT NULL,
    codigo text NOT NULL,
    origen text DEFAULT 'propio'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT codigos_barras_origen_check CHECK ((origen = ANY (ARRAY['propio'::text, 'fabrica'::text])))
);


--
-- Name: colores; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.colores (
    codigo text NOT NULL,
    nombre text NOT NULL,
    hex text,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: conteo_items; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.conteo_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conteo_id uuid NOT NULL,
    variante_id uuid NOT NULL,
    cantidad_sistema integer NOT NULL,
    cantidad_contada integer NOT NULL,
    diferencia integer,
    movimiento_id uuid,
    CONSTRAINT conteo_items_cantidad_contada_check CHECK ((cantidad_contada >= 0))
);


--
-- Name: conteos; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.conteos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ubicacion_id uuid NOT NULL,
    sububicacion_id uuid,
    estado text DEFAULT 'abierto'::text NOT NULL,
    abierto_por uuid,
    cerrado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cerrado_en timestamp with time zone,
    CONSTRAINT conteos_estado_check CHECK ((estado = ANY (ARRAY['abierto'::text, 'cerrado'::text, 'anulado'::text])))
);


--
-- Name: devolucion_items; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.devolucion_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    devolucion_id uuid NOT NULL,
    venta_item_id uuid NOT NULL,
    cantidad integer NOT NULL,
    condicion text NOT NULL,
    movimiento_id uuid,
    CONSTRAINT devolucion_items_cantidad_check CHECK ((cantidad > 0)),
    CONSTRAINT devolucion_items_condicion_check CHECK ((condicion = ANY (ARRAY['vendible'::text, 'danada_reparacion'::text, 'danada_donar'::text, 'devolver_proveedor'::text])))
);


--
-- Name: devoluciones; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.devoluciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venta_id uuid NOT NULL,
    ubicacion_id uuid NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    motivo text NOT NULL,
    reembolso_monto numeric(12,2),
    reembolso_metodo text,
    solicitado_por uuid,
    aprobado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    aprobado_en timestamp with time zone,
    CONSTRAINT devoluciones_aprobacion_coherente CHECK ((((estado = 'pendiente'::text) AND (aprobado_en IS NULL)) OR ((estado <> 'pendiente'::text) AND (aprobado_en IS NOT NULL)))),
    CONSTRAINT devoluciones_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text])))
);


--
-- Name: lotes; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.lotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ubicacion_id uuid NOT NULL,
    proveedor_id uuid NOT NULL,
    orden_compra_id uuid,
    numero_guia text,
    fecha_recepcion timestamp with time zone DEFAULT now() NOT NULL,
    recibido_por uuid,
    nota text
);


--
-- Name: movimientos; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.movimientos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variante_id uuid NOT NULL,
    ubicacion_id uuid NOT NULL,
    ubicacion_destino_id uuid,
    sububicacion_id uuid,
    sububicacion_destino_id uuid,
    tipo text NOT NULL,
    cantidad integer NOT NULL,
    motivo text,
    venta_item_id uuid,
    lote_id uuid,
    devolucion_item_id uuid,
    conteo_item_id uuid,
    transferencia_item_id uuid,
    usuario_id uuid,
    nota text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cambio_id uuid,
    CONSTRAINT movimientos_cantidad_valida CHECK ((((tipo <> 'ajuste'::text) AND (cantidad > 0)) OR ((tipo = 'ajuste'::text) AND (cantidad <> 0)))),
    CONSTRAINT movimientos_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'salida'::text, 'ajuste'::text, 'traslado'::text]))),
    CONSTRAINT movimientos_traslado_tiene_destino CHECK ((((tipo = 'traslado'::text) AND (ubicacion_destino_id IS NOT NULL) AND (ubicacion_destino_id <> ubicacion_id)) OR ((tipo <> 'traslado'::text) AND (ubicacion_destino_id IS NULL))))
);


--
-- Name: ordenes_compra; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.ordenes_compra (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proveedor_id uuid NOT NULL,
    ubicacion_destino_id uuid NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    fecha_estimada date,
    monto_estimado numeric(12,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ordenes_compra_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'recibida_parcial'::text, 'recibida'::text, 'cancelada'::text])))
);


--
-- Name: ordenes_compra_items; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.ordenes_compra_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    orden_id uuid NOT NULL,
    variante_id uuid NOT NULL,
    cantidad integer NOT NULL,
    costo_unitario numeric(12,2) NOT NULL,
    CONSTRAINT ordenes_compra_items_cantidad_check CHECK ((cantidad > 0)),
    CONSTRAINT ordenes_compra_items_costo_unitario_check CHECK ((costo_unitario >= (0)::numeric))
);


--
-- Name: productos; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.productos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    categoria_id uuid,
    referencia text NOT NULL,
    descripcion text,
    estado text DEFAULT 'activo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT productos_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'descontinuado'::text])))
);


--
-- Name: proveedores; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.proveedores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    ruc text,
    contacto text,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.stock (
    variante_id uuid NOT NULL,
    ubicacion_id uuid NOT NULL,
    cantidad integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_cantidad_check CHECK ((cantidad >= 0))
);


--
-- Name: sububicaciones; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.sububicaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ubicacion_id uuid NOT NULL,
    nombre text NOT NULL,
    tipo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transferencia_items; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.transferencia_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transferencia_id uuid NOT NULL,
    variante_id uuid NOT NULL,
    cantidad integer NOT NULL,
    movimiento_id uuid,
    CONSTRAINT transferencia_items_cantidad_check CHECK ((cantidad > 0))
);


--
-- Name: transferencias; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.transferencias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ubicacion_origen_id uuid NOT NULL,
    ubicacion_destino_id uuid NOT NULL,
    estado text DEFAULT 'completada'::text NOT NULL,
    creado_por uuid,
    nota text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transferencias_estado_check CHECK ((estado = 'completada'::text)),
    CONSTRAINT transferencias_origen_destino_distintos CHECK ((ubicacion_origen_id <> ubicacion_destino_id))
);


--
-- Name: ubicaciones; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.ubicaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    tipo text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ubicaciones_tipo_check CHECK ((tipo = ANY (ARRAY['tienda'::text, 'almacen'::text])))
);


--
-- Name: variantes; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.variantes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    producto_id uuid NOT NULL,
    color_codigo text,
    talla text,
    sku text NOT NULL,
    precio numeric(12,2) NOT NULL,
    costo numeric(12,2) DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT variantes_costo_check CHECK ((costo >= (0)::numeric)),
    CONSTRAINT variantes_precio_check CHECK ((precio >= (0)::numeric))
);


--
-- Name: venta_items; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.venta_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venta_id uuid NOT NULL,
    variante_id uuid NOT NULL,
    cantidad integer NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    descuento_unitario numeric(12,2) DEFAULT 0 NOT NULL,
    costo_unitario numeric(12,2) NOT NULL,
    subtotal numeric(12,2) GENERATED ALWAYS AS (((precio_unitario - descuento_unitario) * (cantidad)::numeric)) STORED,
    CONSTRAINT venta_items_cantidad_check CHECK ((cantidad > 0)),
    CONSTRAINT venta_items_costo_unitario_check CHECK ((costo_unitario >= (0)::numeric)),
    CONSTRAINT venta_items_descuento_no_supera_precio CHECK ((descuento_unitario <= precio_unitario)),
    CONSTRAINT venta_items_descuento_unitario_check CHECK ((descuento_unitario >= (0)::numeric)),
    CONSTRAINT venta_items_precio_unitario_check CHECK ((precio_unitario >= (0)::numeric))
);


--
-- Name: venta_pagos; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.venta_pagos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venta_id uuid NOT NULL,
    metodo text NOT NULL,
    monto numeric(12,2) NOT NULL,
    CONSTRAINT venta_pagos_metodo_check CHECK ((metodo = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'yape'::text, 'plin'::text, 'transferencia'::text]))),
    CONSTRAINT venta_pagos_monto_check CHECK ((monto > (0)::numeric))
);


--
-- Name: ventas; Type: TABLE; Schema: retail; Owner: -
--

CREATE TABLE retail.ventas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ubicacion_id uuid NOT NULL,
    cliente_id uuid,
    usuario_id uuid,
    token_cliente uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    caja_id uuid
);


--
-- Name: caja_movimientos caja_movimientos_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.caja_movimientos
    ADD CONSTRAINT caja_movimientos_pkey PRIMARY KEY (id);


--
-- Name: cajas cajas_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.cajas
    ADD CONSTRAINT cajas_pkey PRIMARY KEY (id);


--
-- Name: cambios cambios_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.cambios
    ADD CONSTRAINT cambios_pkey PRIMARY KEY (id);


--
-- Name: categorias categorias_nombre_key; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.categorias
    ADD CONSTRAINT categorias_nombre_key UNIQUE (nombre);


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: codigos_barras codigos_barras_codigo_key; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.codigos_barras
    ADD CONSTRAINT codigos_barras_codigo_key UNIQUE (codigo);


--
-- Name: codigos_barras codigos_barras_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.codigos_barras
    ADD CONSTRAINT codigos_barras_pkey PRIMARY KEY (id);


--
-- Name: colores colores_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.colores
    ADD CONSTRAINT colores_pkey PRIMARY KEY (codigo);


--
-- Name: conteo_items conteo_items_conteo_id_variante_id_key; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.conteo_items
    ADD CONSTRAINT conteo_items_conteo_id_variante_id_key UNIQUE (conteo_id, variante_id);


--
-- Name: conteo_items conteo_items_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.conteo_items
    ADD CONSTRAINT conteo_items_pkey PRIMARY KEY (id);


--
-- Name: conteos conteos_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.conteos
    ADD CONSTRAINT conteos_pkey PRIMARY KEY (id);


--
-- Name: devolucion_items devolucion_items_devolucion_id_venta_item_id_key; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.devolucion_items
    ADD CONSTRAINT devolucion_items_devolucion_id_venta_item_id_key UNIQUE (devolucion_id, venta_item_id);


--
-- Name: devolucion_items devolucion_items_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.devolucion_items
    ADD CONSTRAINT devolucion_items_pkey PRIMARY KEY (id);


--
-- Name: devoluciones devoluciones_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.devoluciones
    ADD CONSTRAINT devoluciones_pkey PRIMARY KEY (id);


--
-- Name: lotes lotes_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.lotes
    ADD CONSTRAINT lotes_pkey PRIMARY KEY (id);


--
-- Name: movimientos movimientos_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.movimientos
    ADD CONSTRAINT movimientos_pkey PRIMARY KEY (id);


--
-- Name: ordenes_compra_items ordenes_compra_items_orden_id_variante_id_key; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ordenes_compra_items
    ADD CONSTRAINT ordenes_compra_items_orden_id_variante_id_key UNIQUE (orden_id, variante_id);


--
-- Name: ordenes_compra_items ordenes_compra_items_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ordenes_compra_items
    ADD CONSTRAINT ordenes_compra_items_pkey PRIMARY KEY (id);


--
-- Name: ordenes_compra ordenes_compra_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ordenes_compra
    ADD CONSTRAINT ordenes_compra_pkey PRIMARY KEY (id);


--
-- Name: personas personas_auth_user_id_key; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.personas
    ADD CONSTRAINT personas_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: personas personas_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.personas
    ADD CONSTRAINT personas_pkey PRIMARY KEY (id);


--
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id);


--
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id);


--
-- Name: stock stock_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.stock
    ADD CONSTRAINT stock_pkey PRIMARY KEY (variante_id, ubicacion_id);


--
-- Name: sububicaciones sububicaciones_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.sububicaciones
    ADD CONSTRAINT sububicaciones_pkey PRIMARY KEY (id);


--
-- Name: sububicaciones sububicaciones_ubicacion_id_nombre_key; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.sububicaciones
    ADD CONSTRAINT sububicaciones_ubicacion_id_nombre_key UNIQUE (ubicacion_id, nombre);


--
-- Name: transferencia_items transferencia_items_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.transferencia_items
    ADD CONSTRAINT transferencia_items_pkey PRIMARY KEY (id);


--
-- Name: transferencia_items transferencia_items_transferencia_id_variante_id_key; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.transferencia_items
    ADD CONSTRAINT transferencia_items_transferencia_id_variante_id_key UNIQUE (transferencia_id, variante_id);


--
-- Name: transferencias transferencias_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.transferencias
    ADD CONSTRAINT transferencias_pkey PRIMARY KEY (id);


--
-- Name: ubicaciones ubicaciones_nombre_key; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ubicaciones
    ADD CONSTRAINT ubicaciones_nombre_key UNIQUE (nombre);


--
-- Name: ubicaciones ubicaciones_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ubicaciones
    ADD CONSTRAINT ubicaciones_pkey PRIMARY KEY (id);


--
-- Name: variantes variantes_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.variantes
    ADD CONSTRAINT variantes_pkey PRIMARY KEY (id);


--
-- Name: variantes variantes_producto_id_talla_color_codigo_key; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.variantes
    ADD CONSTRAINT variantes_producto_id_talla_color_codigo_key UNIQUE (producto_id, talla, color_codigo);


--
-- Name: variantes variantes_sku_key; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.variantes
    ADD CONSTRAINT variantes_sku_key UNIQUE (sku);


--
-- Name: venta_items venta_items_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.venta_items
    ADD CONSTRAINT venta_items_pkey PRIMARY KEY (id);


--
-- Name: venta_pagos venta_pagos_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.venta_pagos
    ADD CONSTRAINT venta_pagos_pkey PRIMARY KEY (id);


--
-- Name: ventas ventas_pkey; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ventas
    ADD CONSTRAINT ventas_pkey PRIMARY KEY (id);


--
-- Name: ventas ventas_token_cliente_key; Type: CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ventas
    ADD CONSTRAINT ventas_token_cliente_key UNIQUE (token_cliente);


--
-- Name: caja_movimientos_caja_idx; Type: INDEX; Schema: retail; Owner: -
--

CREATE INDEX caja_movimientos_caja_idx ON retail.caja_movimientos USING btree (caja_id);


--
-- Name: cajas_ubicacion_abierta_unica; Type: INDEX; Schema: retail; Owner: -
--

CREATE UNIQUE INDEX cajas_ubicacion_abierta_unica ON retail.cajas USING btree (ubicacion_id) WHERE (estado = 'abierta'::text);


--
-- Name: cambios_token_cliente_key; Type: INDEX; Schema: retail; Owner: -
--

CREATE UNIQUE INDEX cambios_token_cliente_key ON retail.cambios USING btree (token_cliente) WHERE (token_cliente IS NOT NULL);


--
-- Name: clientes_doc_unico; Type: INDEX; Schema: retail; Owner: -
--

CREATE UNIQUE INDEX clientes_doc_unico ON retail.clientes USING btree (tipo_doc, num_doc) WHERE (num_doc IS NOT NULL);


--
-- Name: codigos_barras_variante_idx; Type: INDEX; Schema: retail; Owner: -
--

CREATE INDEX codigos_barras_variante_idx ON retail.codigos_barras USING btree (variante_id);


--
-- Name: conteos_un_abierto_por_ubicacion; Type: INDEX; Schema: retail; Owner: -
--

CREATE UNIQUE INDEX conteos_un_abierto_por_ubicacion ON retail.conteos USING btree (ubicacion_id) WHERE (estado = 'abierto'::text);


--
-- Name: devolucion_items_devolucion_idx; Type: INDEX; Schema: retail; Owner: -
--

CREATE INDEX devolucion_items_devolucion_idx ON retail.devolucion_items USING btree (devolucion_id);


--
-- Name: lotes_ubicacion_idx; Type: INDEX; Schema: retail; Owner: -
--

CREATE INDEX lotes_ubicacion_idx ON retail.lotes USING btree (ubicacion_id);


--
-- Name: movimientos_lote_idx; Type: INDEX; Schema: retail; Owner: -
--

CREATE INDEX movimientos_lote_idx ON retail.movimientos USING btree (lote_id) WHERE (lote_id IS NOT NULL);


--
-- Name: movimientos_variante_ubicacion_idx; Type: INDEX; Schema: retail; Owner: -
--

CREATE INDEX movimientos_variante_ubicacion_idx ON retail.movimientos USING btree (variante_id, ubicacion_id);


--
-- Name: movimientos_venta_item_idx; Type: INDEX; Schema: retail; Owner: -
--

CREATE INDEX movimientos_venta_item_idx ON retail.movimientos USING btree (venta_item_id) WHERE (venta_item_id IS NOT NULL);


--
-- Name: personas_auth_user_idx; Type: INDEX; Schema: retail; Owner: -
--

CREATE INDEX personas_auth_user_idx ON retail.personas USING btree (auth_user_id);


--
-- Name: productos_categoria_idx; Type: INDEX; Schema: retail; Owner: -
--

CREATE INDEX productos_categoria_idx ON retail.productos USING btree (categoria_id);


--
-- Name: sububicaciones_ubicacion_idx; Type: INDEX; Schema: retail; Owner: -
--

CREATE INDEX sububicaciones_ubicacion_idx ON retail.sububicaciones USING btree (ubicacion_id);


--
-- Name: variantes_producto_idx; Type: INDEX; Schema: retail; Owner: -
--

CREATE INDEX variantes_producto_idx ON retail.variantes USING btree (producto_id);


--
-- Name: venta_items_venta_idx; Type: INDEX; Schema: retail; Owner: -
--

CREATE INDEX venta_items_venta_idx ON retail.venta_items USING btree (venta_id);


--
-- Name: venta_pagos_venta_idx; Type: INDEX; Schema: retail; Owner: -
--

CREATE INDEX venta_pagos_venta_idx ON retail.venta_pagos USING btree (venta_id);


--
-- Name: caja_movimientos caja_movimientos_caja_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.caja_movimientos
    ADD CONSTRAINT caja_movimientos_caja_id_fkey FOREIGN KEY (caja_id) REFERENCES retail.cajas(id);


--
-- Name: caja_movimientos caja_movimientos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.caja_movimientos
    ADD CONSTRAINT caja_movimientos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES retail.personas(id);


--
-- Name: cajas cajas_abierta_por_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.cajas
    ADD CONSTRAINT cajas_abierta_por_fkey FOREIGN KEY (abierta_por) REFERENCES retail.personas(id);


--
-- Name: cajas cajas_cerrada_por_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.cajas
    ADD CONSTRAINT cajas_cerrada_por_fkey FOREIGN KEY (cerrada_por) REFERENCES retail.personas(id);


--
-- Name: cajas cajas_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.cajas
    ADD CONSTRAINT cajas_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES retail.ubicaciones(id);


--
-- Name: cambios cambios_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.cambios
    ADD CONSTRAINT cambios_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES retail.ubicaciones(id);


--
-- Name: cambios cambios_usuario_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.cambios
    ADD CONSTRAINT cambios_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES retail.personas(id);


--
-- Name: cambios cambios_variante_nueva_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.cambios
    ADD CONSTRAINT cambios_variante_nueva_id_fkey FOREIGN KEY (variante_nueva_id) REFERENCES retail.variantes(id);


--
-- Name: cambios cambios_venta_item_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.cambios
    ADD CONSTRAINT cambios_venta_item_id_fkey FOREIGN KEY (venta_item_id) REFERENCES retail.venta_items(id);


--
-- Name: codigos_barras codigos_barras_variante_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.codigos_barras
    ADD CONSTRAINT codigos_barras_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES retail.variantes(id);


--
-- Name: conteo_items conteo_items_conteo_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.conteo_items
    ADD CONSTRAINT conteo_items_conteo_id_fkey FOREIGN KEY (conteo_id) REFERENCES retail.conteos(id);


--
-- Name: conteo_items conteo_items_movimiento_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.conteo_items
    ADD CONSTRAINT conteo_items_movimiento_fkey FOREIGN KEY (movimiento_id) REFERENCES retail.movimientos(id);


--
-- Name: conteo_items conteo_items_variante_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.conteo_items
    ADD CONSTRAINT conteo_items_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES retail.variantes(id);


--
-- Name: conteos conteos_abierto_por_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.conteos
    ADD CONSTRAINT conteos_abierto_por_fkey FOREIGN KEY (abierto_por) REFERENCES retail.personas(id);


--
-- Name: conteos conteos_cerrado_por_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.conteos
    ADD CONSTRAINT conteos_cerrado_por_fkey FOREIGN KEY (cerrado_por) REFERENCES retail.personas(id);


--
-- Name: conteos conteos_sububicacion_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.conteos
    ADD CONSTRAINT conteos_sububicacion_id_fkey FOREIGN KEY (sububicacion_id) REFERENCES retail.sububicaciones(id);


--
-- Name: conteos conteos_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.conteos
    ADD CONSTRAINT conteos_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES retail.ubicaciones(id);


--
-- Name: devolucion_items devolucion_items_devolucion_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.devolucion_items
    ADD CONSTRAINT devolucion_items_devolucion_id_fkey FOREIGN KEY (devolucion_id) REFERENCES retail.devoluciones(id);


--
-- Name: devolucion_items devolucion_items_movimiento_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.devolucion_items
    ADD CONSTRAINT devolucion_items_movimiento_fkey FOREIGN KEY (movimiento_id) REFERENCES retail.movimientos(id);


--
-- Name: devolucion_items devolucion_items_venta_item_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.devolucion_items
    ADD CONSTRAINT devolucion_items_venta_item_id_fkey FOREIGN KEY (venta_item_id) REFERENCES retail.venta_items(id);


--
-- Name: devoluciones devoluciones_aprobado_por_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.devoluciones
    ADD CONSTRAINT devoluciones_aprobado_por_fkey FOREIGN KEY (aprobado_por) REFERENCES retail.personas(id);


--
-- Name: devoluciones devoluciones_solicitado_por_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.devoluciones
    ADD CONSTRAINT devoluciones_solicitado_por_fkey FOREIGN KEY (solicitado_por) REFERENCES retail.personas(id);


--
-- Name: devoluciones devoluciones_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.devoluciones
    ADD CONSTRAINT devoluciones_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES retail.ubicaciones(id);


--
-- Name: devoluciones devoluciones_venta_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.devoluciones
    ADD CONSTRAINT devoluciones_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES retail.ventas(id);


--
-- Name: lotes lotes_orden_compra_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.lotes
    ADD CONSTRAINT lotes_orden_compra_id_fkey FOREIGN KEY (orden_compra_id) REFERENCES retail.ordenes_compra(id);


--
-- Name: lotes lotes_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.lotes
    ADD CONSTRAINT lotes_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES retail.proveedores(id);


--
-- Name: lotes lotes_recibido_por_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.lotes
    ADD CONSTRAINT lotes_recibido_por_fkey FOREIGN KEY (recibido_por) REFERENCES retail.personas(id);


--
-- Name: lotes lotes_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.lotes
    ADD CONSTRAINT lotes_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES retail.ubicaciones(id);


--
-- Name: movimientos movimientos_cambio_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.movimientos
    ADD CONSTRAINT movimientos_cambio_id_fkey FOREIGN KEY (cambio_id) REFERENCES retail.cambios(id);


--
-- Name: movimientos movimientos_conteo_item_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.movimientos
    ADD CONSTRAINT movimientos_conteo_item_fkey FOREIGN KEY (conteo_item_id) REFERENCES retail.conteo_items(id);


--
-- Name: movimientos movimientos_devolucion_item_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.movimientos
    ADD CONSTRAINT movimientos_devolucion_item_fkey FOREIGN KEY (devolucion_item_id) REFERENCES retail.devolucion_items(id);


--
-- Name: movimientos movimientos_lote_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.movimientos
    ADD CONSTRAINT movimientos_lote_fkey FOREIGN KEY (lote_id) REFERENCES retail.lotes(id);


--
-- Name: movimientos movimientos_sububicacion_destino_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.movimientos
    ADD CONSTRAINT movimientos_sububicacion_destino_id_fkey FOREIGN KEY (sububicacion_destino_id) REFERENCES retail.sububicaciones(id);


--
-- Name: movimientos movimientos_sububicacion_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.movimientos
    ADD CONSTRAINT movimientos_sububicacion_id_fkey FOREIGN KEY (sububicacion_id) REFERENCES retail.sububicaciones(id);


--
-- Name: movimientos movimientos_transferencia_item_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.movimientos
    ADD CONSTRAINT movimientos_transferencia_item_fkey FOREIGN KEY (transferencia_item_id) REFERENCES retail.transferencia_items(id);


--
-- Name: movimientos movimientos_ubicacion_destino_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.movimientos
    ADD CONSTRAINT movimientos_ubicacion_destino_id_fkey FOREIGN KEY (ubicacion_destino_id) REFERENCES retail.ubicaciones(id);


--
-- Name: movimientos movimientos_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.movimientos
    ADD CONSTRAINT movimientos_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES retail.ubicaciones(id);


--
-- Name: movimientos movimientos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.movimientos
    ADD CONSTRAINT movimientos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES retail.personas(id);


--
-- Name: movimientos movimientos_variante_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.movimientos
    ADD CONSTRAINT movimientos_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES retail.variantes(id);


--
-- Name: movimientos movimientos_venta_item_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.movimientos
    ADD CONSTRAINT movimientos_venta_item_fkey FOREIGN KEY (venta_item_id) REFERENCES retail.venta_items(id);


--
-- Name: ordenes_compra_items ordenes_compra_items_orden_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ordenes_compra_items
    ADD CONSTRAINT ordenes_compra_items_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES retail.ordenes_compra(id);


--
-- Name: ordenes_compra_items ordenes_compra_items_variante_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ordenes_compra_items
    ADD CONSTRAINT ordenes_compra_items_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES retail.variantes(id);


--
-- Name: ordenes_compra ordenes_compra_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ordenes_compra
    ADD CONSTRAINT ordenes_compra_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES retail.proveedores(id);


--
-- Name: ordenes_compra ordenes_compra_ubicacion_destino_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ordenes_compra
    ADD CONSTRAINT ordenes_compra_ubicacion_destino_id_fkey FOREIGN KEY (ubicacion_destino_id) REFERENCES retail.ubicaciones(id);


--
-- Name: personas personas_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.personas
    ADD CONSTRAINT personas_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id);


--
-- Name: personas personas_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.personas
    ADD CONSTRAINT personas_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES retail.ubicaciones(id);


--
-- Name: productos productos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.productos
    ADD CONSTRAINT productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES retail.categorias(id);


--
-- Name: stock stock_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.stock
    ADD CONSTRAINT stock_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES retail.ubicaciones(id);


--
-- Name: stock stock_variante_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.stock
    ADD CONSTRAINT stock_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES retail.variantes(id);


--
-- Name: sububicaciones sububicaciones_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.sububicaciones
    ADD CONSTRAINT sububicaciones_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES retail.ubicaciones(id);


--
-- Name: transferencia_items transferencia_items_movimiento_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.transferencia_items
    ADD CONSTRAINT transferencia_items_movimiento_fkey FOREIGN KEY (movimiento_id) REFERENCES retail.movimientos(id);


--
-- Name: transferencia_items transferencia_items_transferencia_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.transferencia_items
    ADD CONSTRAINT transferencia_items_transferencia_id_fkey FOREIGN KEY (transferencia_id) REFERENCES retail.transferencias(id);


--
-- Name: transferencia_items transferencia_items_variante_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.transferencia_items
    ADD CONSTRAINT transferencia_items_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES retail.variantes(id);


--
-- Name: transferencias transferencias_creado_por_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.transferencias
    ADD CONSTRAINT transferencias_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES retail.personas(id);


--
-- Name: transferencias transferencias_ubicacion_destino_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.transferencias
    ADD CONSTRAINT transferencias_ubicacion_destino_id_fkey FOREIGN KEY (ubicacion_destino_id) REFERENCES retail.ubicaciones(id);


--
-- Name: transferencias transferencias_ubicacion_origen_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.transferencias
    ADD CONSTRAINT transferencias_ubicacion_origen_id_fkey FOREIGN KEY (ubicacion_origen_id) REFERENCES retail.ubicaciones(id);


--
-- Name: variantes variantes_color_codigo_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.variantes
    ADD CONSTRAINT variantes_color_codigo_fkey FOREIGN KEY (color_codigo) REFERENCES retail.colores(codigo);


--
-- Name: variantes variantes_producto_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.variantes
    ADD CONSTRAINT variantes_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES retail.productos(id);


--
-- Name: venta_items venta_items_variante_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.venta_items
    ADD CONSTRAINT venta_items_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES retail.variantes(id);


--
-- Name: venta_items venta_items_venta_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.venta_items
    ADD CONSTRAINT venta_items_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES retail.ventas(id);


--
-- Name: venta_pagos venta_pagos_venta_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.venta_pagos
    ADD CONSTRAINT venta_pagos_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES retail.ventas(id);


--
-- Name: ventas ventas_caja_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ventas
    ADD CONSTRAINT ventas_caja_id_fkey FOREIGN KEY (caja_id) REFERENCES retail.cajas(id);


--
-- Name: ventas ventas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ventas
    ADD CONSTRAINT ventas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES retail.clientes(id);


--
-- Name: ventas ventas_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ventas
    ADD CONSTRAINT ventas_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES retail.ubicaciones(id);


--
-- Name: ventas ventas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: retail; Owner: -
--

ALTER TABLE ONLY retail.ventas
    ADD CONSTRAINT ventas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES retail.personas(id);


--
-- Name: caja_movimientos; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.caja_movimientos ENABLE ROW LEVEL SECURITY;

--
-- Name: caja_movimientos caja_movimientos_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY caja_movimientos_select ON retail.caja_movimientos FOR SELECT USING ((EXISTS ( SELECT 1
   FROM retail.cajas c
  WHERE ((c.id = caja_movimientos.caja_id) AND retail.fn_puede_operar_ubicacion(c.ubicacion_id)))));


--
-- Name: cajas; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.cajas ENABLE ROW LEVEL SECURITY;

--
-- Name: cajas cajas_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY cajas_select ON retail.cajas FOR SELECT USING (retail.fn_puede_operar_ubicacion(ubicacion_id));


--
-- Name: cambios; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.cambios ENABLE ROW LEVEL SECURITY;

--
-- Name: cambios cambios_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY cambios_select ON retail.cambios FOR SELECT USING (retail.fn_puede_operar_ubicacion(ubicacion_id));


--
-- Name: categorias; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.categorias ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias categorias_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY categorias_select ON retail.categorias FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: categorias categorias_write_lider; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY categorias_write_lider ON retail.categorias USING (retail.fn_es_lider()) WITH CHECK (retail.fn_es_lider());


--
-- Name: clientes; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: clientes clientes_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY clientes_select ON retail.clientes FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: clientes clientes_write_autenticado; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY clientes_write_autenticado ON retail.clientes FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: codigos_barras; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.codigos_barras ENABLE ROW LEVEL SECURITY;

--
-- Name: codigos_barras codigos_barras_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY codigos_barras_select ON retail.codigos_barras FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: codigos_barras codigos_barras_write_lider; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY codigos_barras_write_lider ON retail.codigos_barras USING (retail.fn_es_lider()) WITH CHECK (retail.fn_es_lider());


--
-- Name: colores; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.colores ENABLE ROW LEVEL SECURITY;

--
-- Name: colores colores_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY colores_select ON retail.colores FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: colores colores_write_lider; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY colores_write_lider ON retail.colores USING (retail.fn_es_lider()) WITH CHECK (retail.fn_es_lider());


--
-- Name: conteo_items; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.conteo_items ENABLE ROW LEVEL SECURITY;

--
-- Name: conteo_items conteo_items_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY conteo_items_select ON retail.conteo_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM retail.conteos c
  WHERE ((c.id = conteo_items.conteo_id) AND retail.fn_puede_operar_ubicacion(c.ubicacion_id)))));


--
-- Name: conteos; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.conteos ENABLE ROW LEVEL SECURITY;

--
-- Name: conteos conteos_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY conteos_select ON retail.conteos FOR SELECT USING (retail.fn_puede_operar_ubicacion(ubicacion_id));


--
-- Name: conteos conteos_write; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY conteos_write ON retail.conteos USING (retail.fn_puede_operar_ubicacion(ubicacion_id)) WITH CHECK (retail.fn_puede_operar_ubicacion(ubicacion_id));


--
-- Name: devolucion_items; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.devolucion_items ENABLE ROW LEVEL SECURITY;

--
-- Name: devolucion_items devolucion_items_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY devolucion_items_select ON retail.devolucion_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM retail.devoluciones d
  WHERE ((d.id = devolucion_items.devolucion_id) AND retail.fn_puede_operar_ubicacion(d.ubicacion_id)))));


--
-- Name: devolucion_items devolucion_items_write; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY devolucion_items_write ON retail.devolucion_items USING ((EXISTS ( SELECT 1
   FROM retail.devoluciones d
  WHERE ((d.id = devolucion_items.devolucion_id) AND retail.fn_puede_operar_ubicacion(d.ubicacion_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM retail.devoluciones d
  WHERE ((d.id = devolucion_items.devolucion_id) AND retail.fn_puede_operar_ubicacion(d.ubicacion_id)))));


--
-- Name: devoluciones; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.devoluciones ENABLE ROW LEVEL SECURITY;

--
-- Name: devoluciones devoluciones_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY devoluciones_select ON retail.devoluciones FOR SELECT USING (retail.fn_puede_operar_ubicacion(ubicacion_id));


--
-- Name: devoluciones devoluciones_write; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY devoluciones_write ON retail.devoluciones USING (retail.fn_puede_operar_ubicacion(ubicacion_id)) WITH CHECK (retail.fn_puede_operar_ubicacion(ubicacion_id));


--
-- Name: lotes; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.lotes ENABLE ROW LEVEL SECURITY;

--
-- Name: lotes lotes_insert; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY lotes_insert ON retail.lotes FOR INSERT WITH CHECK (retail.fn_puede_operar_ubicacion(ubicacion_id));


--
-- Name: lotes lotes_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY lotes_select ON retail.lotes FOR SELECT USING (retail.fn_puede_operar_ubicacion(ubicacion_id));


--
-- Name: movimientos; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.movimientos ENABLE ROW LEVEL SECURITY;

--
-- Name: movimientos movimientos_insert; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY movimientos_insert ON retail.movimientos FOR INSERT WITH CHECK (retail.fn_puede_operar_ubicacion(ubicacion_id));


--
-- Name: movimientos movimientos_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY movimientos_select ON retail.movimientos FOR SELECT USING ((retail.fn_puede_operar_ubicacion(ubicacion_id) OR retail.fn_puede_operar_ubicacion(ubicacion_destino_id)));


--
-- Name: ordenes_compra; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.ordenes_compra ENABLE ROW LEVEL SECURITY;

--
-- Name: ordenes_compra_items; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.ordenes_compra_items ENABLE ROW LEVEL SECURITY;

--
-- Name: ordenes_compra_items ordenes_compra_items_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY ordenes_compra_items_select ON retail.ordenes_compra_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM retail.ordenes_compra o
  WHERE ((o.id = ordenes_compra_items.orden_id) AND retail.fn_puede_operar_ubicacion(o.ubicacion_destino_id)))));


--
-- Name: ordenes_compra_items ordenes_compra_items_write; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY ordenes_compra_items_write ON retail.ordenes_compra_items USING ((EXISTS ( SELECT 1
   FROM retail.ordenes_compra o
  WHERE ((o.id = ordenes_compra_items.orden_id) AND retail.fn_puede_operar_ubicacion(o.ubicacion_destino_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM retail.ordenes_compra o
  WHERE ((o.id = ordenes_compra_items.orden_id) AND retail.fn_puede_operar_ubicacion(o.ubicacion_destino_id)))));


--
-- Name: ordenes_compra ordenes_compra_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY ordenes_compra_select ON retail.ordenes_compra FOR SELECT USING (retail.fn_puede_operar_ubicacion(ubicacion_destino_id));


--
-- Name: ordenes_compra ordenes_compra_write; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY ordenes_compra_write ON retail.ordenes_compra USING (retail.fn_puede_operar_ubicacion(ubicacion_destino_id)) WITH CHECK (retail.fn_puede_operar_ubicacion(ubicacion_destino_id));


--
-- Name: personas; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.personas ENABLE ROW LEVEL SECURITY;

--
-- Name: personas personas_select_propia; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY personas_select_propia ON retail.personas FOR SELECT USING (((auth_user_id = auth.uid()) OR retail.fn_es_lider()));


--
-- Name: productos; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.productos ENABLE ROW LEVEL SECURITY;

--
-- Name: productos productos_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY productos_select ON retail.productos FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: productos productos_write_lider; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY productos_write_lider ON retail.productos USING (retail.fn_es_lider()) WITH CHECK (retail.fn_es_lider());


--
-- Name: proveedores; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.proveedores ENABLE ROW LEVEL SECURITY;

--
-- Name: proveedores proveedores_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY proveedores_select ON retail.proveedores FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: proveedores proveedores_write_lider; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY proveedores_write_lider ON retail.proveedores USING (retail.fn_es_lider()) WITH CHECK (retail.fn_es_lider());


--
-- Name: stock; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.stock ENABLE ROW LEVEL SECURITY;

--
-- Name: stock stock_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY stock_select ON retail.stock FOR SELECT USING (retail.fn_puede_operar_ubicacion(ubicacion_id));


--
-- Name: sububicaciones; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.sububicaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: sububicaciones sububicaciones_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY sububicaciones_select ON retail.sububicaciones FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: sububicaciones sububicaciones_write_lider; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY sububicaciones_write_lider ON retail.sububicaciones USING (retail.fn_es_lider()) WITH CHECK (retail.fn_es_lider());


--
-- Name: transferencia_items; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.transferencia_items ENABLE ROW LEVEL SECURITY;

--
-- Name: transferencia_items transferencia_items_insert; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY transferencia_items_insert ON retail.transferencia_items FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM retail.transferencias t
  WHERE ((t.id = transferencia_items.transferencia_id) AND retail.fn_puede_operar_ubicacion(t.ubicacion_origen_id)))));


--
-- Name: transferencia_items transferencia_items_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY transferencia_items_select ON retail.transferencia_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM retail.transferencias t
  WHERE ((t.id = transferencia_items.transferencia_id) AND (retail.fn_puede_operar_ubicacion(t.ubicacion_origen_id) OR retail.fn_puede_operar_ubicacion(t.ubicacion_destino_id))))));


--
-- Name: transferencias; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.transferencias ENABLE ROW LEVEL SECURITY;

--
-- Name: transferencias transferencias_insert; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY transferencias_insert ON retail.transferencias FOR INSERT WITH CHECK (retail.fn_puede_operar_ubicacion(ubicacion_origen_id));


--
-- Name: transferencias transferencias_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY transferencias_select ON retail.transferencias FOR SELECT USING ((retail.fn_puede_operar_ubicacion(ubicacion_origen_id) OR retail.fn_puede_operar_ubicacion(ubicacion_destino_id)));


--
-- Name: ubicaciones; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.ubicaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: ubicaciones ubicaciones_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY ubicaciones_select ON retail.ubicaciones FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: ubicaciones ubicaciones_write_lider; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY ubicaciones_write_lider ON retail.ubicaciones USING (retail.fn_es_lider()) WITH CHECK (retail.fn_es_lider());


--
-- Name: variantes; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.variantes ENABLE ROW LEVEL SECURITY;

--
-- Name: variantes variantes_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY variantes_select ON retail.variantes FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: variantes variantes_write_lider; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY variantes_write_lider ON retail.variantes USING (retail.fn_es_lider()) WITH CHECK (retail.fn_es_lider());


--
-- Name: venta_items; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.venta_items ENABLE ROW LEVEL SECURITY;

--
-- Name: venta_items venta_items_insert; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY venta_items_insert ON retail.venta_items FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM retail.ventas v
  WHERE ((v.id = venta_items.venta_id) AND retail.fn_puede_operar_ubicacion(v.ubicacion_id)))));


--
-- Name: venta_items venta_items_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY venta_items_select ON retail.venta_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM retail.ventas v
  WHERE ((v.id = venta_items.venta_id) AND retail.fn_puede_operar_ubicacion(v.ubicacion_id)))));


--
-- Name: venta_pagos; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.venta_pagos ENABLE ROW LEVEL SECURITY;

--
-- Name: venta_pagos venta_pagos_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY venta_pagos_select ON retail.venta_pagos FOR SELECT USING ((EXISTS ( SELECT 1
   FROM retail.ventas v
  WHERE ((v.id = venta_pagos.venta_id) AND retail.fn_puede_operar_ubicacion(v.ubicacion_id)))));


--
-- Name: ventas; Type: ROW SECURITY; Schema: retail; Owner: -
--

ALTER TABLE retail.ventas ENABLE ROW LEVEL SECURITY;

--
-- Name: ventas ventas_insert; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY ventas_insert ON retail.ventas FOR INSERT WITH CHECK (retail.fn_puede_operar_ubicacion(ubicacion_id));


--
-- Name: ventas ventas_select; Type: POLICY; Schema: retail; Owner: -
--

CREATE POLICY ventas_select ON retail.ventas FOR SELECT USING (retail.fn_puede_operar_ubicacion(ubicacion_id));


--
-- PostgreSQL database dump complete
--


--
-- Grants — mismo patrón que supabase/migrations/0005_grants.sql: usage de
-- schema + privilegios por tabla (independientes de RLS) + execute por
-- función, más default privileges para que cualquier tabla/función futura
-- herede esto automáticamente sin otro script.
--

GRANT USAGE ON SCHEMA retail TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA retail TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA retail TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA retail TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA retail TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA retail TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA retail TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA retail GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA retail GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA retail GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- ============================================================================
-- 20260924171300_admin_firma_sin_asistencia.sql — CAYLA V2 (ADR-0161 A9, ADR-0178)
--
-- EL PROBLEMA. Con `configuracion_empresa.exige_responsable` encendido (producción, desde el 2026-09-23), TODA
-- operación de tienda exige elegir a una persona que marcó su entrada hoy en esa tienda — también el Admin. Si el
-- Admin abre Vender desde su casa, o en una tienda donde nadie marcó todavía, no puede guardar nada («Nadie de turno
-- en Tienda TRU»).
--
-- LA REGLA NUEVA (pedido del 2026-09-24). El candado de asistencia es para las cuentas COMPARTIDAS de cada tienda (las
-- terminales de caja y de almacén: 3 tiendas × 2) y para quien firma en nombre de otra persona. El ADMIN (ADR-0178:
-- admin en Dynamic y Líder activo aquí) firma A SU NOMBRE sin marcar asistencia: su cuenta es suya, no hay a quién
-- identificar. La pantalla, en vez del combo, le dice que es el admin y que no necesita autorización.
--
-- QUÉ NO CAMBIA.
--   · Terminales: siempre un responsable presente en su tienda (el Admin nunca es una terminal: no tiene persona).
--   · Líderes que no son Admin: el mismo candado que el resto («un mismo flujo para todos», decisión del 2026-09-23).
--   · Si el Admin manda como responsable a OTRA persona, esa persona sí pasa por el candado.
--   · Los permisos siguen siendo de la cuenta (fn_es_lider, fn_ve_modulo); esto solo decide QUIÉN FIRMA.
--
-- Igual a la definición de 20260923010000 (la que está en producción, comparada el 2026-09-24) más el bloque ADMIN.
-- Re-ejecutable. Prueba: `pnpm pruebas:terminales-sin-persona` (casos «ADMIN»).
-- Para deshacer: volver a pegar la sección 5 de 20260923010000_terminales_sin_persona.sql.
-- ============================================================================

do $$
begin
  if to_regprocedure('retail.fn_es_admin()') is null then
    raise exception 'Falta 20260923163000_escalon_admin_desde_dynamic.sql (retail.fn_es_admin): pégala antes que esta';
  end if;
end $$;

create or replace function retail.fn_actor_persona_id(p_de_tienda boolean default true)
returns uuid
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_headers json;
  v_texto text;
  v_responsable uuid;
  v_momento timestamptz := now();
  v_ubicacion uuid;
  v_terminal record;
  v_yo uuid;
begin
  -- Sin sesión (SQL Editor, scripts con la llave de servicio): igual que antes, nadie.
  if auth.uid() is null then
    return null;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_texto := nullif(trim(v_headers ->> 'x-responsable'), '');
  if v_texto is not null then
    begin
      v_responsable := v_texto::uuid;
    exception when invalid_text_representation then
      raise exception 'El responsable enviado no es válido' using errcode = '22P02';
    end;
  end if;
  -- Venta sin conexión: vale la hora de la venta (Felipe, 2026-09-22), acotada a 7 días atrás.
  v_texto := nullif(trim(v_headers ->> 'x-momento'), '');
  if v_texto is not null then
    begin
      v_momento := v_texto::timestamptz;
    exception when others then
      raise exception 'La hora de la operación no es válida' using errcode = '22007';
    end;
    if v_momento > now() + interval '5 minutes' or v_momento < now() - interval '7 days' then
      raise exception 'La hora de la operación está fuera de rango' using errcode = '22007';
    end if;
  end if;

  select * into v_terminal from retail.fn_terminal_actual() limit 1;

  -- Sesión de TERMINAL: siempre firma una persona presente en SU tienda.
  if v_terminal.id is not null then
    if v_responsable is null then
      raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
    end if;
    if not exists (select 1 from public.personas p join retail.colaboradores c on c.persona_id = p.id
                   where p.id = v_responsable and p.estado = 'activo') then
      raise exception 'Esa persona no tiene acceso a retail' using errcode = '42501', hint = 'responsable_sin_acceso';
    end if;
    if not retail.fn_persona_presente(v_responsable, v_terminal.ubicacion_id, v_momento) then
      raise exception 'Esa persona no está de turno en esta tienda: tiene que marcar su entrada' using errcode = '42501', hint = 'responsable_no_presente';
    end if;
    return v_responsable;
  end if;

  -- Sesión de PERSONA.
  select p.id into v_yo from public.personas p where p.auth_user_id = auth.uid();
  if not p_de_tienda or (v_responsable is null and not retail.fn_exige_responsable()) then
    return v_yo; -- idéntico a la búsqueda que reemplaza
  end if;
  -- ADMIN (20260924171300): firma a su nombre sin marcar asistencia. Sin responsable o eligiéndose a sí mismo; si
  -- elige a otra persona, esa pasa por el candado de abajo como con cualquier cuenta.
  if coalesce(v_responsable, v_yo) = v_yo and retail.fn_es_admin() then
    return v_yo;
  end if;
  if v_responsable is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  begin
    v_ubicacion := nullif(trim(v_headers ->> 'x-ubicacion'), '')::uuid;
  exception when invalid_text_representation then
    v_ubicacion := null;
  end;
  if v_ubicacion is null or not retail.fn_puede_operar_ubicacion(v_ubicacion) then
    raise exception 'Falta la tienda de la operación' using errcode = '42501', hint = 'ubicacion_requerida';
  end if;
  if not exists (select 1 from public.personas p join retail.colaboradores c on c.persona_id = p.id
                 where p.id = v_responsable and p.estado = 'activo') then
    raise exception 'Esa persona no tiene acceso a retail' using errcode = '42501', hint = 'responsable_sin_acceso';
  end if;
  if not retail.fn_persona_presente(v_responsable, v_ubicacion, v_momento) then
    raise exception 'Esa persona no está de turno en esta tienda: tiene que marcar su entrada' using errcode = '42501', hint = 'responsable_no_presente';
  end if;
  return v_responsable;
end;
$fn$;

comment on function retail.fn_actor_persona_id(boolean) is
  'ADR-0162: quién FIRMA la operación. Desde 20260923230000 toda función que guarda llama con true: firma el responsable del combo (x-responsable presente en la sede x-ubicacion). Desde 20260924171300 el Admin (fn_es_admin) firma a su nombre sin marcar asistencia. false queda solo para PERMISOS que se comparan con la cuenta (fn_alcanzo_a, «no te quites/suspendas/cambies el rol a ti mismo»). NO decide permisos: eso es de la cuenta (fn_es_lider, fn_puede_*).';

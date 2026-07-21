-- ============================================================================
-- Fase 2 del motor contable — RPC de registro simple
-- registrar_asiento(): recibe las líneas ya armadas por el motor de plantillas
-- del cliente (lib/registro-contable.ts) y las guarda como un asiento cuadrado.
-- Corre como dueño (security definer): así puede escribir el libro diario, que
-- para los clientes es de solo lectura. Valida el cuadre ANTES de tocar la base,
-- para dar un mensaje claro; el trigger diferido de 0020 es la segunda red.
-- ============================================================================

create or replace function registrar_asiento(
  p_unidad_id uuid,
  p_glosa text,
  p_origen text,
  p_lineas jsonb,            -- [{ "cuenta": "104", "debe": 5000, "haber": 0 }, ...]
  p_fecha date default current_date,
  p_referencia_tipo text default null,
  p_referencia_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_asiento_id uuid;
  v_item jsonb;
  v_cuenta_id uuid;
  v_debe numeric(14, 2);
  v_haber numeric(14, 2);
  v_sum_debe numeric(14, 2) := 0;
  v_sum_haber numeric(14, 2) := 0;
begin
  if not fn_puede_operar_sede(p_unidad_id) then
    raise exception 'No tienes permiso para registrar en esa unidad';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) < 2 then
    raise exception 'Un asiento necesita al menos dos líneas (debe y haber)';
  end if;

  -- Validar el cuadre primero, con mensaje claro.
  for v_item in select * from jsonb_array_elements(p_lineas) loop
    v_sum_debe := v_sum_debe + coalesce((v_item ->> 'debe')::numeric, 0);
    v_sum_haber := v_sum_haber + coalesce((v_item ->> 'haber')::numeric, 0);
  end loop;
  if round(v_sum_debe, 2) <> round(v_sum_haber, 2) then
    raise exception 'El asiento no cuadra: debe % ≠ haber %', v_sum_debe, v_sum_haber;
  end if;
  if v_sum_debe = 0 then
    raise exception 'El asiento está en cero';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into asientos (fecha, unidad_id, glosa, origen, referencia_tipo, referencia_id, creado_por)
    values (p_fecha, p_unidad_id, p_glosa, coalesce(p_origen, 'manual'), p_referencia_tipo, p_referencia_id, v_persona_id)
    returning id into v_asiento_id;

  for v_item in select * from jsonb_array_elements(p_lineas) loop
    v_debe := coalesce((v_item ->> 'debe')::numeric, 0);
    v_haber := coalesce((v_item ->> 'haber')::numeric, 0);
    if v_debe = 0 and v_haber = 0 then
      continue; -- ignora líneas en cero (ej. IGV = 0) — no crean fila
    end if;

    select id into v_cuenta_id from cuentas_contables where codigo = (v_item ->> 'cuenta');
    if v_cuenta_id is null then
      raise exception 'La cuenta % no existe en el plan de cuentas', (v_item ->> 'cuenta');
    end if;

    insert into asiento_lineas (asiento_id, cuenta_id, debe, haber, glosa)
      values (v_asiento_id, v_cuenta_id, v_debe, v_haber, v_item ->> 'glosa');
  end loop;

  return v_asiento_id;
end;
$$;

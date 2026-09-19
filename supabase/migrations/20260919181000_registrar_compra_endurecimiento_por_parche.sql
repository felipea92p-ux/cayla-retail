-- ============================================================================
-- ADR-0135 (parte 2 de 2) — `registrar_compra`: A1, M2 y M3, aplicados como PARCHE sobre la definición VIVA.
--
-- POR QUÉ PARCHE Y NO `create or replace`. Otra rama (reparto de una compra entre tiendas, ADR-0132:
-- 20260919172000 / 173000) también reescribe `registrar_compra`: guarda `destinos` por línea en
-- `compra_item_destinos` y deja de escribir `compras.ubicacion_destino_id`. Si esta migración recreara la función
-- entera desde una foto vieja, según el orden de aplicación pisaría la de reparto (y `registrar_compra` fallaría con
-- «column ubicacion_destino_id does not exist») o la de reparto pisaría ésta. Un parche que LEE lo que la base
-- tiene hoy y le cambia solo lo suyo convive con cualquiera de las dos formas de la función.
--
-- QUÉ ARREGLA (mismo criterio que en `registrar_pagos_compra` / `registrar_pago_compras`, parte 1: 20260919180000):
--   A1  Tolerancia del «total del papel» con IGV incluido:  0.01 × (líneas + 1)  +  0.006 × Σ cantidad.
--       (0.006 = 0.005 de redondeo del costo unitario × 1.18 del IGV, multiplicado por las unidades). Sin IGV
--       (`p_igv_porcentaje = 0`) sigue siendo igualdad exacta. `v_tolerancia` pasa de numeric(12,2) a numeric: en
--       2 decimales la tolerancia se redondearía y volvería a quedarse corta.
--   M2  Cada línea del pago inicial que traiga fecha se valida con `fn_validar_fecha_pago_compra` (ni futura ni
--       anterior a la emisión). El helper lo crea la parte 1: esta migración va DESPUÉS de 20260919180000.
--   M3  Un monto de pago con más de 2 decimales se rechaza con el mismo mensaje del lote («Los montos del pago
--       admiten como máximo 2 decimales»). `v_monto` pasa de numeric(12,2) a numeric: con 2 decimales el cast
--       redondeaba en silencio (10.005 → 10.01) ANTES de cualquier chequeo.
--
-- CÓMO PARCHA. Una sola firma viva de `registrar_compra` (se descubre en `pg_proc`; si hay 0 o más de una, aborta) →
-- `pg_get_functiondef` → `replace()` de SEIS fragmentos ancla cortos y estables (están en la definición actual y
-- también en la que deja la migración de reparto: el cuerpo de la zona de pagos y de la tolerancia es el mismo) →
-- `execute` del `create or replace` resultante. `pg_get_functiondef` incluye `security definer` y el `set
-- search_path` de la función, así que se conservan; los grants se reafirman al final.
--
-- GUARDAS (fallar fuerte, nunca a medias):
--   · cada ancla debe aparecer EXACTAMENTE una vez; si no, `raise exception` con el nombre del ancla («reescribe el
--     parche sobre la definición viva»). Como toda la migración es una transacción, nada queda a medias.
--   · si la función YA está parchada (los tres marcadores presentes) → `raise notice` y sale sin tocar nada: se
--     puede correr dos veces. Si tiene algunos marcadores pero no todos → aborta (estado parcial que un humano
--     debe mirar).
--   · si falta el helper de la parte 1 → aborta pidiendo aplicar primero 20260919180000.
--   · al final se relee la función y se comprueba que los marcadores quedaron.
--
-- ORDEN. Debe correr DESPUÉS de 20260919180000 y DESPUÉS de la de reparto (si esa se aplica). Si por accidente la de
-- reparto se aplicara DESPUÉS de esta, recrearía `registrar_compra` desde su propio texto y se perdería el parche:
-- basta volver a pegar ESTA migración (es re-ejecutable).
--
-- No borra ni modifica datos. En producción: pegar con `set search_path = retail, public, extensions` (ya va en la
-- primera línea) — el cuerpo no necesita el prefijo `retail.` porque busca la función por schema en `pg_proc`.
-- ESTADO. Aceptada en el Postgres LOCAL y pegada en producción por Felipe el 2026-09-19 (pendiente de verificar y de refrescar el diccionario).
-- ============================================================================
set search_path = retail, public, extensions;

do $parche$
declare
  v_n integer;
  v_oid oid;
  v_def text;
  v_i integer;
  v_veces integer;
  v_a1 boolean;
  v_m2 boolean;
  v_m3 boolean;
  v_nombres text[] := array[
    'A1 · declaración de v_tolerancia',
    'A1 · acumulación de la línea en el primer bucle',
    'A1 · cálculo de v_tolerancia',
    'M3 · declaración de v_monto',
    'M3 · chequeo del medio de pago (punto donde va el rechazo de decimales)',
    'M2 · suma del pago (punto donde va la validación de fecha)'
  ];
  v_anclas text[] := array[
    $a$v_tolerancia numeric(12, 2);$a$,
    $a$v_subtotal := v_subtotal + (v_item ->> 'cantidad')::integer * (v_item ->> 'costo_unitario')::numeric;$a$,
    $a$v_tolerancia := 0.01 * (jsonb_array_length(p_items) + 1);$a$,
    $a$v_monto numeric(12, 2);$a$,
    $a$if coalesce(v_pago ->> 'metodo', '') not in ($a$,
    $a$v_pago_suma := v_pago_suma + v_monto;$a$
  ];
  v_nuevos text[] := array[
    $n$v_tolerancia numeric;
  v_unidades numeric := 0;$n$,
    $n$v_subtotal := v_subtotal + (v_item ->> 'cantidad')::integer * (v_item ->> 'costo_unitario')::numeric;
    v_unidades := v_unidades + (v_item ->> 'cantidad')::integer;$n$,
    $n$-- A1 (ADR-0135): el costo unitario llega redondeado a 2 decimales (numeric(12,2)) y ese medio centavo, agrandado
    -- por el IGV (x 1.18 = 0.006), se multiplica por la cantidad. La tolerancia sigue al redondeo: 0.01 por línea (+1
    -- por el IGV y el papel) más 0.006 por unidad. Un descuadre real (S/ 5, o S/ 0.50 en una unidad) sigue fuera.
    v_tolerancia := 0.01 * (jsonb_array_length(p_items) + 1) + 0.006 * v_unidades;$n$,
    $n$v_monto numeric;$n$,
    $n$-- M3 (ADR-0135): se mira el valor CRUDO; con la variable en numeric(12,2) el cast redondeaba en silencio (10.005 -> 10.01)
      if v_monto <> round(v_monto, 2) then
        raise exception 'Los montos del pago admiten como máximo 2 decimales (llegó %)', v_monto;
      end if;
      if coalesce(v_pago ->> 'metodo', '') not in ($n$,
    $n$-- M2 (ADR-0135): cada fecha que llegue no puede ser futura ni anterior a la emisión del comprobante
      perform fn_validar_fecha_pago_compra(
        nullif(v_pago ->> 'fecha', '')::date,
        coalesce(p_fecha_emision, fn_hoy_lima()),
        upper(trim(p_serie)) || '-' || trim(p_numero)
      );
      v_pago_suma := v_pago_suma + v_monto;$n$
  ];
begin
  -- ---- la función viva: una sola firma ----
  select count(*), min(oid) into v_n, v_oid
    from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_compra';
  if v_n <> 1 then
    raise exception 'registrar_compra tiene % firmas vivas (se esperaba 1): resuelve la sobrecarga antes de parchar (ADR-0009)', v_n;
  end if;
  if to_regprocedure('retail.fn_validar_fecha_pago_compra(date,date,text)') is null then
    raise exception 'Falta fn_validar_fecha_pago_compra: aplica primero 20260919180000_pagos_compras_endurecimiento.sql';
  end if;

  v_def := pg_get_functiondef(v_oid);

  -- ---- ¿ya parchada? ----
  v_a1 := strpos(v_def, 'v_unidades') > 0;
  v_m2 := strpos(v_def, 'fn_validar_fecha_pago_compra') > 0;
  v_m3 := strpos(v_def, 'Los montos del pago admiten como máximo 2 decimales') > 0;
  if v_a1 and v_m2 and v_m3 then
    raise notice 'registrar_compra ya tiene el endurecimiento de ADR-0135 (A1, M2, M3): no se cambia nada';
    return;
  end if;
  if v_a1 or v_m2 or v_m3 then
    raise exception 'registrar_compra está parcialmente parchada (A1=%, M2=%, M3=%): revísala a mano antes de seguir', v_a1, v_m2, v_m3;
  end if;

  -- ---- cada ancla debe estar exactamente una vez ----
  for v_i in 1 .. array_length(v_anclas, 1) loop
    v_veces := (length(v_def) - length(replace(v_def, v_anclas[v_i], ''))) / length(v_anclas[v_i]);
    if v_veces <> 1 then
      raise exception 'Ancla no encontrada de forma única en registrar_compra (aparece % veces): «%» [%]. La función viva cambió: reescribe este parche sobre su definición actual (ADR-0135)',
        v_veces, v_anclas[v_i], v_nombres[v_i];
    end if;
  end loop;

  for v_i in 1 .. array_length(v_anclas, 1) loop
    v_def := replace(v_def, v_anclas[v_i], v_nuevos[v_i]);
  end loop;

  execute v_def;

  -- ---- comprobar que quedó, y reafirmar permisos (create or replace ya los conserva; esto es un cinturón) ----
  v_def := pg_get_functiondef(v_oid);
  if strpos(v_def, 'v_unidades') = 0
     or strpos(v_def, 'fn_validar_fecha_pago_compra') = 0
     or strpos(v_def, 'Los montos del pago admiten como máximo 2 decimales') = 0
     or strpos(upper(v_def), 'SECURITY DEFINER') = 0 then
    raise exception 'Autoverificación: registrar_compra no quedó con el endurecimiento esperado (ADR-0135)';
  end if;
  execute format('revoke all on function %s from public, anon', v_oid::regprocedure);
  execute format('grant execute on function %s to authenticated', v_oid::regprocedure);
  raise notice 'registrar_compra parchada (A1, M2, M3 de ADR-0135)';
end
$parche$;

-- ============================================================================
-- 20260922170000_compras_pagar_por_tienda.sql — CAYLA V2 · ADR-0151 (F4: pagar por tienda)
--
-- PROBLEMA. F1–F3 dejaron a un comprador LEER el dinero de su tienda y REGISTRAR una factura como su gestora, pero
-- pagar sigue siendo solo del líder: `registrar_pagos_compra`, `registrar_pago_compras` y `registrar_pago_compras_medios`
-- preguntan «¿es líder?» y nada más. El comprador tiene que poder pagar la parte de SU tienda — también en una factura
-- que gestiona otra tienda (ADR-0151, D3) — y esa parte no puede excederse, sea quien sea quien pague.
--
-- QUÉ HACE
--   1. `compra_pagos.ubicacion_id`: qué tienda hizo el pago. NULA en pagos viejos (de antes de esta migración) y en un
--      pago del líder que no se atribuye a ninguna tienda (paga la factura entera desde «las cuentas de la empresa»,
--      como siempre). Cuando SÍ lleva tienda, ese pago cuenta contra el saldo de esa tienda, sea quien sea que pague.
--   2. `fn_saldo_de_tienda(compra, ubicacion)`: cuánto le queda por pagar a una tienda en una factura — su parte
--      (`compra_parte_por_tienda`, F2) menos lo que ya pagó ESA tienda en esa factura. **Limitación conocida, a
--      propósito:** todavía no resta notas de crédito por tienda (eso es D5/F6, «detalle por cerrar»); mientras tanto
--      `compras.saldo` (el total, que SÍ las resta) sigue siendo el número que manda para la factura entera.
--   3. Candado de esquema, no solo de la RPC (principio 2, mismo patrón que ADR-0139): un disparador diferido revisa,
--      tras cada cambio en `compra_pagos`, que la suma de lo pagado por una tienda en una factura nunca supere su
--      parte. Protege incluso escribir directo en la tabla (que ya está cerrado por RLS, ver abajo).
--   4. Las tres RPC de pago que usa la pantalla (`registrar_pagos_compra`, una factura con varios medios;
--      `registrar_pago_compras` y `registrar_pago_compras_medios`, «pagar juntos» con uno o varios medios) ganan un
--      parámetro nuevo AL FINAL, `p_ubicacion_id uuid default null` — no se cambia el orden de los que ya tenían,
--      para no crear una sobrecarga (la lección del 2026-09-19 con `p_token`). La puerta se abre a «líder, o comprador
--      con esa tienda»; si el pago lleva tienda, además tiene que tener parte en la factura y no superar su saldo.
--      `registrar_pago_compra` (el wrapper de un solo medio) no se toca: sigue llamando a `registrar_pagos_compra`
--      con 3 argumentos, así que `p_ubicacion_id` le queda en su valor por defecto (null) — sigue siendo solo del líder.
--   5. **«Pagar juntos» por tienda:** con `p_ubicacion_id`, cada comprobante del lote tiene que tener parte de esa
--      tienda y el monto que se le aplica no puede superar su saldo — la misma regla de ADR-0135 (el tope de pagos),
--      ahora por tienda además de por comprobante.
--
-- QUÉ NO HACE. No cambia `fn_puede_registrar_compras()` (sigue siendo «solo líder»; abrir REGISTRAR y ANULAR ya lo
-- hizo F3, con su propio candado). No reparte notas de crédito por tienda (F6). No abre la LECTURA de `compra_pagos`
-- a un comprador que no es gestora y no tiene toda la factura para sí (F1 ya lo decide con `fn_compra_es_de_mis_tiendas`;
-- sigue el mismo límite que F3 documentó: se puede pagar una factura que no se puede ver entera, hasta que F3-b/F5
-- le den al comprador una vista de «solo mi parte» — la RPC igual devuelve los ids del pago como confirmación).
--
-- CÓMO. Las tres funciones se parchan sobre su definición VIVA (`pg_get_functiondef`), no sobre una copia: cada parche
-- exige cuántas veces aparece lo que reemplaza y, si la base cambió por debajo, aborta sin tocar nada (mismo patrón
-- que F1 paso 2 y F3).
--
-- VOLVER ATRÁS: soltar el disparador y la columna `ubicacion_id`; las tres RPC vuelven a su forma de antes con
-- `create or replace` desde 20260919160000/20260914200000/20260921 (donde se hayan escrito por última vez).
--
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path`; no hace falta el prefijo `retail.`. Re-pegable. Va DESPUÉS de
-- 20260922120000, 20260922130000 y 20260922150000 (necesita `fn_puede_comprar_en` y `compra_parte_por_tienda`).
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 0. guardas ====================
do $$
begin
  if to_regprocedure('retail.fn_puede_comprar_en(uuid)') is null then
    raise exception 'Falta 20260922120000_compras_compradores_de_tienda.sql: aplícala antes que esta migración';
  end if;
  if to_regclass('retail.compra_parte_por_tienda') is null then
    raise exception 'Falta 20260922150000_compra_parte_por_tienda.sql: aplícala antes que esta migración';
  end if;
end;
$$;

-- ==================== 1. la columna ====================
alter table retail.compra_pagos add column if not exists ubicacion_id uuid references retail.ubicaciones(id);

comment on column retail.compra_pagos.ubicacion_id is
  'ADR-0151 (F4). Qué tienda hizo este pago (cuenta contra SU saldo en la factura). NULA en pagos de antes de esta migración y en un pago del líder no atribuido a ninguna tienda.';

create index if not exists compra_pagos_ubicacion_idx on retail.compra_pagos (compra_id, ubicacion_id);

-- ==================== 2. cuánto le queda por pagar a una tienda ====================
create or replace function retail.fn_saldo_de_tienda(p_compra_id uuid, p_ubicacion_id uuid)
returns numeric
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    (select total from compra_parte_por_tienda where compra_id = p_compra_id and ubicacion_id = p_ubicacion_id),
    0
  ) - coalesce(
    (select sum(monto) from compra_pagos where compra_id = p_compra_id and ubicacion_id = p_ubicacion_id),
    0
  );
$$;

comment on function retail.fn_saldo_de_tienda(uuid, uuid) is
  'ADR-0151 (F4). Cuánto le falta pagar a esta tienda en esta factura: su parte (compra_parte_por_tienda) menos lo que ya pagó ELLA. Todavía no resta notas de crédito por tienda (D5/F6). 0 si la tienda no tiene parte.';

revoke all on function retail.fn_saldo_de_tienda(uuid, uuid) from public, anon;
grant execute on function retail.fn_saldo_de_tienda(uuid, uuid) to authenticated;

-- ==================== 3. el candado: una tienda nunca paga más que su parte ====================
create or replace function retail.fn_pago_no_supera_tienda()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_compra uuid;
  v_ubicacion uuid;
  v_parte numeric;
  v_pagado numeric;
begin
  v_compra := coalesce(new.compra_id, old.compra_id);
  v_ubicacion := coalesce(new.ubicacion_id, old.ubicacion_id);
  if v_ubicacion is null then
    return null; -- pago sin atribuir a una tienda: no hay saldo de tienda que cuidar
  end if;
  select total into v_parte from compra_parte_por_tienda where compra_id = v_compra and ubicacion_id = v_ubicacion;
  select coalesce(sum(monto), 0) into v_pagado from compra_pagos where compra_id = v_compra and ubicacion_id = v_ubicacion;
  if v_pagado > coalesce(v_parte, 0) then
    raise exception 'Los pagos de esa tienda (S/ %) superan su parte de la factura (S/ %)', v_pagado, coalesce(v_parte, 0)
      using errcode = '23514';
  end if;
  return null;
end;
$$;

comment on function retail.fn_pago_no_supera_tienda() is
  'ADR-0151 (F4). Disparador diferido: tras cualquier cambio en compra_pagos, la suma de lo pagado por una tienda en una factura no puede superar su parte (compra_parte_por_tienda). Se salta si el pago no lleva tienda.';

revoke all on function retail.fn_pago_no_supera_tienda() from public, anon, authenticated;

drop trigger if exists compra_pagos_no_supera_tienda on retail.compra_pagos;
create constraint trigger compra_pagos_no_supera_tienda
  after insert or update or delete on retail.compra_pagos
  deferrable initially deferred
  for each row execute function retail.fn_pago_no_supera_tienda();

-- ==================== 4. parchar las tres RPC de pago sobre su definición viva ====================
-- Distinto del patrón «pg_temp.parchar» de otras migraciones (F1 paso 2, F3): ESTAS tres funciones cambian de FIRMA
-- (agregan un parámetro al final), y `create or replace` con otra lista de parámetros NO reemplaza — crea una
-- SOBRECARGA (la lección del 2026-09-19 con `p_token`; ver `[[reescribir-funcion-de-produccion-desde-su-definicion-real]]`).
-- Por eso cada función se lee UNA sola vez, se transforma todo sobre ese mismo texto en memoria (nunca se vuelve a leer
-- de `pg_proc` a mitad de camino) y solo al final se hace `drop` de la firma vieja + `execute` de la nueva, atómico.
--
-- `exigir_y_reemplazar` aplica un reemplazo sobre un texto ya en memoria, exigiendo cuántas veces aparece lo buscado;
-- si la base cambió por debajo, aborta con un mensaje claro. Re-pegable: si la firma VIEJA ya no existe (esta
-- migración ya corrió) y la NUEVA ya tiene el candado, no hace nada.
create or replace function pg_temp.exigir_y_reemplazar(p_texto text, p_buscar text, p_poner text, p_veces integer, p_etiqueta text)
returns text
language plpgsql
as $$
declare
  v_n integer;
begin
  select count(*) into v_n from regexp_matches(p_texto, p_buscar, 'g');
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaba % vez/veces y hay % — revísala a mano antes de seguir.', p_etiqueta, p_veces, v_n;
  end if;
  return regexp_replace(p_texto, p_buscar, p_poner, 'g');
end;
$$;

-- ---- 4.1 registrar_pagos_compra(uuid,jsonb,date,uuid) → (…,uuid,uuid): una factura, varios medios ----
do $$
declare v_def text;
begin
  if to_regprocedure('retail.registrar_pagos_compra(uuid,jsonb,date,uuid)') is null then
    if to_regprocedure('retail.registrar_pagos_compra(uuid,jsonb,date,uuid,uuid)') is null
       or position('fn_saldo_de_tienda' in pg_get_functiondef('retail.registrar_pagos_compra(uuid,jsonb,date,uuid,uuid)'::regprocedure)) = 0 then
      raise exception 'registrar_pagos_compra: no existe ni la firma vieja (4 parámetros) ni la nueva ya parchada (5) — revisa a mano';
    end if;
    return; -- ya aplicada
  end if;

  v_def := pg_get_functiondef('retail.registrar_pagos_compra(uuid,jsonb,date,uuid)'::regprocedure);
  v_def := pg_temp.exigir_y_reemplazar(v_def, 'p_token uuid DEFAULT NULL::uuid\)',
    'p_token uuid DEFAULT NULL::uuid, p_ubicacion_id uuid DEFAULT NULL::uuid)', 1, 'registrar_pagos_compra (firma)');
  v_def := pg_temp.exigir_y_reemplazar(v_def, 'if not fn_puede_registrar_compras\(\) then',
    'if not (fn_puede_registrar_compras() or (p_ubicacion_id is not null and fn_puede_comprar_en(p_ubicacion_id))) then',
    1, 'registrar_pagos_compra (permiso)');
  v_def := pg_temp.exigir_y_reemplazar(v_def, E'\\n  -- M2: ni futura ni anterior a la emisión\\n',
    E'\n  -- ADR-0151 (F4): si el pago se atribuye a una tienda, no puede superar SU saldo (además del saldo total de\n' ||
    E'  -- arriba). Sin tienda (solo líder): el pago no queda atado a ninguna, como hasta hoy.\n' ||
    E'  if p_ubicacion_id is not null then\n' ||
    E'    if not exists (select 1 from compra_parte_por_tienda where compra_id = p_compra_id and ubicacion_id = p_ubicacion_id) then\n' ||
    E'      raise exception ''Esa tienda no tiene parte en esta factura'';\n' ||
    E'    end if;\n' ||
    E'    if v_suma > fn_saldo_de_tienda(p_compra_id, p_ubicacion_id) then\n' ||
    E'      raise exception ''El pago (S/ %) supera el saldo pendiente de esa tienda (S/ %)'', v_suma, fn_saldo_de_tienda(p_compra_id, p_ubicacion_id);\n' ||
    E'    end if;\n' ||
    E'  end if;\n' ||
    E'\n  -- M2: ni futura ni anterior a la emisión\n',
    1, 'registrar_pagos_compra (ancla de fecha)');
  v_def := pg_temp.exigir_y_reemplazar(v_def, '\(compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id\)',
    '(compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id, ubicacion_id)', 1, 'registrar_pagos_compra (columnas)');
  v_def := pg_temp.exigir_y_reemplazar(v_def, ', v_persona, p_token\)', ', v_persona, p_token, p_ubicacion_id)', 1, 'registrar_pagos_compra (valores)');

  drop function retail.registrar_pagos_compra(uuid, jsonb, date, uuid);
  execute v_def;
  -- Firma nueva = objeto nuevo: Postgres le da EXECUTE a PUBLIC por defecto, no hereda el grant de la firma vieja
  -- (la lección del 2026-09-19, otra vez). Cerrarlo es tan importante como el candado de arriba.
  revoke all on function retail.registrar_pagos_compra(uuid, jsonb, date, uuid, uuid) from public, anon;
  grant execute on function retail.registrar_pagos_compra(uuid, jsonb, date, uuid, uuid) to authenticated;
end;
$$;

-- ---- 4.2 registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric) → (…,numeric,uuid): pagar juntos, un medio ----
do $$
declare v_def text;
begin
  if to_regprocedure('retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric)') is null then
    if to_regprocedure('retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric,uuid)') is null
       or position('fn_saldo_de_tienda' in pg_get_functiondef('retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric,uuid)'::regprocedure)) = 0 then
      raise exception 'registrar_pago_compras: no existe ni la firma vieja (7 parámetros) ni la nueva ya parchada (8) — revisa a mano';
    end if;
    return;
  end if;

  v_def := pg_get_functiondef('retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric)'::regprocedure);
  v_def := pg_temp.exigir_y_reemplazar(v_def, 'p_credito numeric DEFAULT 0\)',
    'p_credito numeric DEFAULT 0, p_ubicacion_id uuid DEFAULT NULL::uuid)', 1, 'registrar_pago_compras (firma)');
  v_def := pg_temp.exigir_y_reemplazar(v_def, 'if not fn_puede_registrar_compras\(\) then',
    'if not (fn_puede_registrar_compras() or (p_ubicacion_id is not null and fn_puede_comprar_en(p_ubicacion_id))) then',
    1, 'registrar_pago_compras (permiso)');
  v_def := pg_temp.exigir_y_reemplazar(v_def, E'\\n    -- M2: ni futura ni anterior a la emisión de ESTE comprobante\\n',
    E'\n    if p_ubicacion_id is not null then\n' ||
    E'      if not exists (select 1 from compra_parte_por_tienda where compra_id = v_compra_ids[v_i] and ubicacion_id = p_ubicacion_id) then\n' ||
    E'        raise exception ''Esa tienda no tiene parte en el comprobante %-%'', v_c.serie, v_c.numero;\n' ||
    E'      end if;\n' ||
    E'      if v_montos[v_i] > fn_saldo_de_tienda(v_compra_ids[v_i], p_ubicacion_id) then\n' ||
    E'        raise exception ''El pago (S/ %) al comprobante %-% supera el saldo pendiente de esa tienda (S/ %)'', v_montos[v_i], v_c.serie, v_c.numero, fn_saldo_de_tienda(v_compra_ids[v_i], p_ubicacion_id);\n' ||
    E'      end if;\n' ||
    E'    end if;\n' ||
    E'\n    -- M2: ni futura ni anterior a la emisión de ESTE comprobante\n',
    1, 'registrar_pago_compras (ancla por comprobante)');
  v_def := pg_temp.exigir_y_reemplazar(v_def, '\(compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id\)',
    '(compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id, ubicacion_id)', 2, 'registrar_pago_compras (columnas)');
  v_def := pg_temp.exigir_y_reemplazar(v_def, ', v_persona, v_grupo\)', ', v_persona, v_grupo, p_ubicacion_id)', 2, 'registrar_pago_compras (valores)');

  drop function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric);
  execute v_def;
  revoke all on function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric, uuid) from public, anon;
  grant execute on function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric, uuid) to authenticated;
end;
$$;

-- ---- 4.3 registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric) → (…,numeric,uuid): pagar juntos, varios medios ----
do $$
declare v_def text;
begin
  if to_regprocedure('retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric)') is null then
    if to_regprocedure('retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric,uuid)') is null
       or position('fn_saldo_de_tienda' in pg_get_functiondef('retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric,uuid)'::regprocedure)) = 0 then
      raise exception 'registrar_pago_compras_medios: no existe ni la firma vieja (6 parámetros) ni la nueva ya parchada (7) — revisa a mano';
    end if;
    return;
  end if;

  v_def := pg_get_functiondef('retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric)'::regprocedure);
  v_def := pg_temp.exigir_y_reemplazar(v_def, 'p_credito numeric DEFAULT 0\)',
    'p_credito numeric DEFAULT 0, p_ubicacion_id uuid DEFAULT NULL::uuid)', 1, 'registrar_pago_compras_medios (firma)');
  v_def := pg_temp.exigir_y_reemplazar(v_def, 'if not fn_puede_registrar_compras\(\) then',
    'if not (fn_puede_registrar_compras() or (p_ubicacion_id is not null and fn_puede_comprar_en(p_ubicacion_id))) then',
    1, 'registrar_pago_compras_medios (permiso)');
  v_def := pg_temp.exigir_y_reemplazar(v_def, E'\\n    -- M2 \\(ADR-0135\\): ni futura ni anterior a la emisión de ESTE comprobante\\n',
    E'\n    if p_ubicacion_id is not null then\n' ||
    E'      if not exists (select 1 from compra_parte_por_tienda where compra_id = v_compra_ids[v_i] and ubicacion_id = p_ubicacion_id) then\n' ||
    E'        raise exception ''Esa tienda no tiene parte en el comprobante %-%'', v_c.serie, v_c.numero;\n' ||
    E'      end if;\n' ||
    E'      if v_montos[v_i] > fn_saldo_de_tienda(v_compra_ids[v_i], p_ubicacion_id) then\n' ||
    E'        raise exception ''El pago (S/ %) al comprobante %-% supera el saldo pendiente de esa tienda (S/ %)'', v_montos[v_i], v_c.serie, v_c.numero, fn_saldo_de_tienda(v_compra_ids[v_i], p_ubicacion_id);\n' ||
    E'      end if;\n' ||
    E'    end if;\n' ||
    E'\n    -- M2 (ADR-0135): ni futura ni anterior a la emisión de ESTE comprobante\n',
    1, 'registrar_pago_compras_medios (ancla por comprobante)');
  v_def := pg_temp.exigir_y_reemplazar(v_def, '\(compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id\)',
    '(compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id, ubicacion_id)', 2, 'registrar_pago_compras_medios (columnas)');
  v_def := pg_temp.exigir_y_reemplazar(v_def, ', v_persona, v_grupo\)', ', v_persona, v_grupo, p_ubicacion_id)', 2, 'registrar_pago_compras_medios (valores)');

  drop function retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric);
  execute v_def;
  revoke all on function retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric, uuid) from public, anon;
  grant execute on function retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric, uuid) to authenticated;
end;
$$;

-- ==================== 5. comprobación final (aborta si algo quedó a medias) ====================
do $$
declare
  v1 text; v2 text; v3 text;
begin
  v1 := pg_get_functiondef('retail.registrar_pagos_compra(uuid,jsonb,date,uuid,uuid)'::regprocedure);
  v2 := pg_get_functiondef('retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric,uuid)'::regprocedure);
  v3 := pg_get_functiondef('retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric,uuid)'::regprocedure);
  if position('fn_saldo_de_tienda' in v1) = 0 or position('fn_puede_comprar_en' in v1) = 0 then
    raise exception 'registrar_pagos_compra no quedó completa con el candado por tienda';
  end if;
  if position('fn_saldo_de_tienda' in v2) = 0 or position('fn_puede_comprar_en' in v2) = 0 then
    raise exception 'registrar_pago_compras no quedó completa con el candado por tienda';
  end if;
  if position('fn_saldo_de_tienda' in v3) = 0 or position('fn_puede_comprar_en' in v3) = 0 then
    raise exception 'registrar_pago_compras_medios no quedó completa con el candado por tienda';
  end if;
  -- UNA sola firma de cada función parchada.
  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('registrar_pagos_compra', 'registrar_pago_compras', 'registrar_pago_compras_medios')
    group by p.proname having count(*) > 1
  ) then
    raise exception 'Alguna función de pago de Compras quedó con dos firmas';
  end if;
  -- Ninguna quedó abierta a PUBLIC/anon (la firma nueva es un objeto nuevo: Postgres le da EXECUTE a PUBLIC por defecto).
  if exists (
    select 1 from information_schema.role_routine_grants g
    where g.routine_schema = 'retail'
      and g.specific_name in (
        'registrar_pagos_compra_' || 'retail.registrar_pagos_compra(uuid,jsonb,date,uuid,uuid)'::regprocedure::oid,
        'registrar_pago_compras_' || 'retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric,uuid)'::regprocedure::oid,
        'registrar_pago_compras_medios_' || 'retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric,uuid)'::regprocedure::oid
      )
      and g.grantee in ('PUBLIC', 'anon')
  ) then
    raise exception 'Alguna función de pago quedó con EXECUTE abierto a PUBLIC o anon';
  end if;
end;
$$;

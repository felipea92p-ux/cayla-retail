-- ============================================================================
-- 20260923180300_compras_pagar_por_tienda.sql — CAYLA V2 · ADR-0179 (F4 reescrita sobre ADR-0161)
--
-- EL PROBLEMA PRIMERO. Con el módulo Por pagar (ADR-0161) una cuenta paga cualquier comprobante por su saldo TOTAL: una tienda
-- podría pagar —o dejar sin pagar— la parte de otra. Felipe (2026-09-23): «si otra tienda registró una factura que llega para
-- dos, cada una registra su pago y recibe lo que le corresponde». Cada tienda paga SU parte, y esa parte no se puede pasar.
--
-- QUÉ HACE
--   1. `compra_pagos.ubicacion_id`: qué tienda hizo el pago. NULA en los pagos de antes y en un pago del líder que no se
--      atribuye a ninguna tienda (paga «desde la empresa», como siempre).
--   2. `fn_saldo_de_tienda(compra, tienda)`: lo que le queda por pagar a una tienda = su parte (`compra_parte_por_tienda`)
--      menos lo que pagó ELLA, y nunca más que el saldo real de la factura (`compras.saldo`, que ya resta notas de crédito y
--      pagos sin tienda). Así, si el líder saldó la factura entera, ninguna tienda ve una deuda que ya no existe.
--   3. Candado de esquema (principio 2): un disparador diferido impide que lo pagado por una tienda en una factura supere su
--      parte, venga de donde venga la escritura.
--   4. Las tres RPC de pago de la pantalla (`registrar_pagos_compra`; «pagar juntos» `registrar_pago_compras` y
--      `registrar_pago_compras_medios`) ganan `p_ubicacion_id uuid default null` AL FINAL. Quien no es líder tiene que pagar
--      desde una de SUS tiendas; esa tienda tiene que tener parte en cada comprobante y el monto no puede superar su saldo. El
--      líder puede atribuir el pago a una tienda (mismas reglas) o no atribuirlo. El permiso sigue siendo el del módulo Por
--      pagar (ADR-0161 P1): esto agrega DÓNDE.
--   5. `registrar_compra` con pago al contado: el pago queda a nombre de la tienda gestora cuando registra alguien que no es
--      líder (y el candado del punto 3 impide pagar así más que su parte: una factura repartida se registra al crédito).
--
-- FIRMAS. Agregar un parámetro cambia la firma y `create or replace` con otra lista NO reemplaza: crea una SOBRECARGA (la
-- lección del 2026-09-19). Por eso cada función se lee una vez, se transforma en memoria y se hace `drop` de la firma vieja +
-- `execute` de la nueva, y se vuelve a cerrar EXECUTE a public/anon (un objeto nuevo nace abierto).
-- `registrar_pago_compra` (el envoltorio de un medio) no se toca: sigue llamando con 3 argumentos → sin tienda → solo el líder.
-- `registrar_reembolso_proveedor` tampoco: el saldo a favor con un proveedor es de la empresa, no de una tienda.
--
-- REEMPLAZA a 20260922170000_compras_pagar_por_tienda.sql (rama adr-0145-compras-permisos, nunca en producción; chocaba en número
-- con 20260922170000_alta_colaborador_…, y sus anclas eran las de antes de ADR-0161).
--
-- PARA PEGAR EN PRODUCCIÓN: después de 20260923180000 … 180200. Trae `set search_path`. Re-pegable.
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_puede_comprar_en(uuid)') is null or to_regclass('retail.compra_parte_por_tienda') is null then
    raise exception 'Faltan 20260923180000 y 20260923180100 (tiendas de Compras y parte por tienda)';
  end if;
  if to_regprocedure('retail.fn_puede_pagar_compras()') is null then
    raise exception 'Falta 20260923140000_modulos_seis_decisiones.sql (fn_puede_pagar_compras)';
  end if;
end $$;

-- ==================== 1. la columna ====================
alter table retail.compra_pagos add column if not exists ubicacion_id uuid references retail.ubicaciones(id);

comment on column retail.compra_pagos.ubicacion_id is
  'ADR-0179. Qué tienda hizo este pago: cuenta contra SU parte de la factura. NULA en pagos de antes y en un pago del líder no atribuido a ninguna tienda.';

create index if not exists compra_pagos_ubicacion_idx on retail.compra_pagos (compra_id, ubicacion_id);

-- ==================== 2. lo que le queda por pagar a una tienda ====================
create or replace function retail.fn_saldo_de_tienda(p_compra_id uuid, p_ubicacion_id uuid)
returns numeric
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select greatest(0, least(
    coalesce((select p.total from retail.compra_parte_por_tienda p where p.compra_id = p_compra_id and p.ubicacion_id = p_ubicacion_id), 0)
      - coalesce((select sum(g.monto) from retail.compra_pagos g where g.compra_id = p_compra_id and g.ubicacion_id = p_ubicacion_id), 0),
    coalesce((select c.saldo from retail.compras c where c.id = p_compra_id and c.estado = 'vigente'), 0)
  ))::numeric(12, 2);
$$;

comment on function retail.fn_saldo_de_tienda(uuid, uuid) is
  'ADR-0179. Cuánto le falta pagar a esta tienda en esta factura: su parte (compra_parte_por_tienda) menos lo que pagó ELLA, sin pasar del saldo real de la factura (que ya resta notas de crédito y pagos sin tienda). 0 si no tiene parte o la factura está anulada.';

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
  v_compra uuid := coalesce(new.compra_id, old.compra_id);
  v_ubicacion uuid := coalesce(new.ubicacion_id, old.ubicacion_id);
  v_parte numeric;
  v_pagado numeric;
begin
  if v_ubicacion is null then
    return null; -- pago sin tienda: lo cuida el saldo total de la factura, como siempre
  end if;
  select p.total into v_parte from retail.compra_parte_por_tienda p where p.compra_id = v_compra and p.ubicacion_id = v_ubicacion;
  select coalesce(sum(g.monto), 0) into v_pagado from retail.compra_pagos g where g.compra_id = v_compra and g.ubicacion_id = v_ubicacion;
  if v_pagado > coalesce(v_parte, 0) then
    raise exception 'Lo pagado por esa tienda (S/ %) supera su parte del comprobante (S/ %)', v_pagado, coalesce(v_parte, 0)
      using errcode = '23514';
  end if;
  return null;
end;
$$;

comment on function retail.fn_pago_no_supera_tienda() is
  'ADR-0179. Disparador diferido: lo pagado por una tienda en una factura no puede superar su parte (compra_parte_por_tienda). Se salta si el pago no lleva tienda.';

revoke all on function retail.fn_pago_no_supera_tienda() from public, anon, authenticated;

drop trigger if exists compra_pagos_no_supera_tienda on retail.compra_pagos;
create constraint trigger compra_pagos_no_supera_tienda
  after insert or update or delete on retail.compra_pagos
  deferrable initially deferred
  for each row execute function retail.fn_pago_no_supera_tienda();

-- ==================== 4. las tres RPC de pago ====================
-- Reemplazo sobre un texto YA en memoria exigiendo cuántas veces aparece lo buscado (si la base cambió, aborta).
create or replace function pg_temp.exigir(p_texto text, p_viejo text, p_nuevo text, p_veces integer, p_etiqueta text)
returns text
language plpgsql
as $$
declare v_n integer;
begin
  v_n := (length(p_texto) - length(replace(p_texto, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaba % vez/veces y hay % — revísala a mano.', p_etiqueta, p_veces, v_n;
  end if;
  return replace(p_texto, p_viejo, p_nuevo);
end;
$$;

-- El bloque que va ANTES de la puerta del módulo (el mismo en las tres).
create or replace function pg_temp.puerta_tienda()
returns text
language sql
as $$ select
  E'  -- ADR-0179: quien no es líder paga SIEMPRE desde una de sus tiendas, y solo la parte de esa tienda.\n'
  || E'  if p_ubicacion_id is not null and not retail.fn_puede_comprar_en(p_ubicacion_id) then\n'
  || E'    raise exception ''Solo puedes pagar desde una de tus tiendas'' using errcode = ''42501'';\n'
  || E'  end if;\n'
  || E'  if p_ubicacion_id is null and not retail.fn_es_lider() and retail.fn_puede_pagar_compras() then\n'
  || E'    raise exception ''Elige desde qué tienda pagas: cada tienda paga su parte'' using errcode = ''42501'';\n'
  || E'  end if;\n'
  || E'  if not retail.fn_puede_pagar_compras() then\n';
$$;

-- La revisión por comprobante (sangría y variables de cada función).
create or replace function pg_temp.revisa_tienda(p_sangria text, p_compra text, p_monto text, p_doc text)
returns text
language sql
as $$ select
  p_sangria || E'-- ADR-0179: con tienda, esa tienda tiene parte y el monto no pasa de lo que le queda a ella.\n'
  || p_sangria || E'if p_ubicacion_id is not null then\n'
  || p_sangria || format(E'  if not exists (select 1 from retail.compra_parte_por_tienda where compra_id = %s and ubicacion_id = p_ubicacion_id) then\n', p_compra)
  || p_sangria || format(E'    raise exception ''Esa tienda no tiene parte en el comprobante %%'', %s;\n', p_doc)
  || p_sangria || E'  end if;\n'
  || p_sangria || format(E'  if %s > retail.fn_saldo_de_tienda(%s, p_ubicacion_id) then\n', p_monto, p_compra)
  || p_sangria || format(E'    raise exception ''El pago (S/ %%) al comprobante %% supera lo que le queda por pagar a esa tienda (S/ %%)'', %s, %s, retail.fn_saldo_de_tienda(%s, p_ubicacion_id);\n', p_monto, p_doc, p_compra)
  || p_sangria || E'  end if;\n'
  || p_sangria || E'end if;\n';
$$;

-- ---- 4.1 registrar_pagos_compra: una factura, varios medios ----
do $$
declare v text;
begin
  if to_regprocedure('retail.registrar_pagos_compra(uuid,jsonb,date,uuid)') is null then
    if to_regprocedure('retail.registrar_pagos_compra(uuid,jsonb,date,uuid,uuid)') is null
       or position('fn_saldo_de_tienda' in pg_get_functiondef('retail.registrar_pagos_compra(uuid,jsonb,date,uuid,uuid)'::regprocedure)) = 0 then
      raise exception 'registrar_pagos_compra: no está ni la firma vieja (4 parámetros) ni la nueva ya cambiada (5) — revisa a mano';
    end if;
    return; -- ya aplicada
  end if;
  v := pg_get_functiondef('retail.registrar_pagos_compra(uuid,jsonb,date,uuid)'::regprocedure);
  v := pg_temp.exigir(v, 'p_token uuid DEFAULT NULL::uuid)', 'p_token uuid DEFAULT NULL::uuid, p_ubicacion_id uuid DEFAULT NULL::uuid)', 1, 'registrar_pagos_compra (firma)');
  v := pg_temp.exigir(v, E'  if not retail.fn_puede_pagar_compras() then\n', pg_temp.puerta_tienda(), 1, 'registrar_pagos_compra (puerta)');
  v := pg_temp.exigir(v, E'  perform fn_validar_fecha_pago_compra(p_fecha, v_compra.fecha_emision',
    pg_temp.revisa_tienda('  ', 'p_compra_id', 'v_suma', 'v_compra.serie || ''-'' || v_compra.numero')
      || E'\n  perform fn_validar_fecha_pago_compra(p_fecha, v_compra.fecha_emision', 1, 'registrar_pagos_compra (por comprobante)');
  v := pg_temp.exigir(v, '(compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id)',
    '(compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id, ubicacion_id)', 1, 'registrar_pagos_compra (columnas)');
  v := pg_temp.exigir(v, ', v_persona, p_token)', ', v_persona, p_token, p_ubicacion_id)', 1, 'registrar_pagos_compra (valores)');
  drop function retail.registrar_pagos_compra(uuid, jsonb, date, uuid);
  execute v;
  revoke all on function retail.registrar_pagos_compra(uuid, jsonb, date, uuid, uuid) from public, anon;
  grant execute on function retail.registrar_pagos_compra(uuid, jsonb, date, uuid, uuid) to authenticated;
end $$;

-- ---- 4.2 registrar_pago_compras: pagar juntos, un medio ----
do $$
declare v text;
begin
  if to_regprocedure('retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric)') is null then
    if to_regprocedure('retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric,uuid)') is null
       or position('fn_saldo_de_tienda' in pg_get_functiondef('retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric,uuid)'::regprocedure)) = 0 then
      raise exception 'registrar_pago_compras: no está ni la firma vieja (7 parámetros) ni la nueva ya cambiada (8) — revisa a mano';
    end if;
    return;
  end if;
  v := pg_get_functiondef('retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric)'::regprocedure);
  v := pg_temp.exigir(v, 'p_credito numeric DEFAULT 0)', 'p_credito numeric DEFAULT 0, p_ubicacion_id uuid DEFAULT NULL::uuid)', 1, 'registrar_pago_compras (firma)');
  v := pg_temp.exigir(v, E'  if not retail.fn_puede_pagar_compras() then\n', pg_temp.puerta_tienda(), 1, 'registrar_pago_compras (puerta)');
  v := pg_temp.exigir(v, E'    perform fn_validar_fecha_pago_compra(v_fecha, v_c.fecha_emision',
    pg_temp.revisa_tienda('    ', 'v_compra_ids[v_i]', 'v_montos[v_i]', 'v_c.serie || ''-'' || v_c.numero')
      || E'    perform fn_validar_fecha_pago_compra(v_fecha, v_c.fecha_emision', 1, 'registrar_pago_compras (por comprobante)');
  v := pg_temp.exigir(v, '(compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id)',
    '(compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id, ubicacion_id)', 2, 'registrar_pago_compras (columnas)');
  v := pg_temp.exigir(v, ', v_persona, v_grupo)', ', v_persona, v_grupo, p_ubicacion_id)', 2, 'registrar_pago_compras (valores)');
  drop function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric);
  execute v;
  revoke all on function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric, uuid) from public, anon;
  grant execute on function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric, uuid) to authenticated;
end $$;

-- ---- 4.3 registrar_pago_compras_medios: pagar juntos, varios medios ----
do $$
declare v text;
begin
  if to_regprocedure('retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric)') is null then
    if to_regprocedure('retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric,uuid)') is null
       or position('fn_saldo_de_tienda' in pg_get_functiondef('retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric,uuid)'::regprocedure)) = 0 then
      raise exception 'registrar_pago_compras_medios: no está ni la firma vieja (6 parámetros) ni la nueva ya cambiada (7) — revisa a mano';
    end if;
    return;
  end if;
  v := pg_get_functiondef('retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric)'::regprocedure);
  v := pg_temp.exigir(v, 'p_credito numeric DEFAULT 0)', 'p_credito numeric DEFAULT 0, p_ubicacion_id uuid DEFAULT NULL::uuid)', 1, 'registrar_pago_compras_medios (firma)');
  v := pg_temp.exigir(v, E'  if not retail.fn_puede_pagar_compras() then\n', pg_temp.puerta_tienda(), 1, 'registrar_pago_compras_medios (puerta)');
  v := pg_temp.exigir(v, E'    perform fn_validar_fecha_pago_compra(v_fecha, v_c.fecha_emision',
    pg_temp.revisa_tienda('    ', 'v_compra_ids[v_i]', 'v_montos[v_i]', 'v_c.serie || ''-'' || v_c.numero')
      || E'    perform fn_validar_fecha_pago_compra(v_fecha, v_c.fecha_emision', 1, 'registrar_pago_compras_medios (por comprobante)');
  v := pg_temp.exigir(v, '(compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id)',
    '(compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id, ubicacion_id)', 2, 'registrar_pago_compras_medios (columnas)');
  v := pg_temp.exigir(v, ', v_persona, v_grupo)', ', v_persona, v_grupo, p_ubicacion_id)', 2, 'registrar_pago_compras_medios (valores)');
  drop function retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric);
  execute v;
  revoke all on function retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric, uuid) from public, anon;
  grant execute on function retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric, uuid) to authenticated;
end $$;

-- ---- 4.4 registrar_compra: el pago al contado de quien no es líder queda a nombre de la tienda gestora ----
do $$
declare
  f constant text := 'retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)';
  v text;
begin
  v := pg_get_functiondef(f::regprocedure);
  if position('usuario_id, ubicacion_id)' in v) > 0 then
    return; -- ya aplicada
  end if;
  v := pg_temp.exigir(v, E'insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id)\n',
    E'insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, ubicacion_id)\n', 1, 'registrar_compra (columnas del pago)');
  v := pg_temp.exigir(v, E'          v_persona\n        )\n        returning id into v_pago_id;',
    E'          v_persona,\n          case when retail.fn_es_lider() then null else p_ubicacion_destino_id end -- ADR-0179: la gestora\n        )\n        returning id into v_pago_id;',
    1, 'registrar_compra (valores del pago)');
  execute v;
end $$;

-- ==================== 5. comprobación final ====================
do $$
declare v1 text; v2 text; v3 text;
begin
  v1 := pg_get_functiondef('retail.registrar_pagos_compra(uuid,jsonb,date,uuid,uuid)'::regprocedure);
  v2 := pg_get_functiondef('retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric,uuid)'::regprocedure);
  v3 := pg_get_functiondef('retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric,uuid)'::regprocedure);
  if position('fn_saldo_de_tienda' in v1) = 0 or position('fn_puede_comprar_en' in v1) = 0
     or position('fn_saldo_de_tienda' in v2) = 0 or position('fn_puede_comprar_en' in v2) = 0
     or position('fn_saldo_de_tienda' in v3) = 0 or position('fn_puede_comprar_en' in v3) = 0 then
    raise exception 'Alguna RPC de pago no quedó con la revisión por tienda';
  end if;
  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('registrar_pagos_compra', 'registrar_pago_compras', 'registrar_pago_compras_medios', 'registrar_compra')
    group by p.proname having count(*) > 1
  ) then
    raise exception 'Alguna función de pago quedó con dos firmas';
  end if;
  if exists (
    select 1 from pg_proc p
    where p.oid in ('retail.registrar_pagos_compra(uuid,jsonb,date,uuid,uuid)'::regprocedure,
                    'retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric,uuid)'::regprocedure,
                    'retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric,uuid)'::regprocedure)
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))
  ) then
    raise exception 'Alguna RPC de pago quedó abierta a anon o public';
  end if;
end $$;

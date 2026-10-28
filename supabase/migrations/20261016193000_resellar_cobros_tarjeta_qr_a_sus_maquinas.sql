-- ============================================================================
-- 20261016193000 — Los cobros con tarjeta y QR desde el 30 de septiembre pasan del banco a la puente de su máquina
-- (ADR-0429; decisión 3 del ADR-0417; actividad 5 de 6). MIGRACIÓN DE DATOS: toca filas de producción.
--
-- EL PROBLEMA PRIMERO. Hasta 20261016173000, todo cobro con tarjeta y QR se selló en el BCP, como si la plata llegara completa y al
-- instante. En realidad la cobró una máquina (Izipay o Vendemás) que la depositó en Interbank, menos su comisión. Felipe decidió
-- (2026-10-05 y 2026-10-16) REHACER esos cobros desde el primero con tarjeta (30 de septiembre) hacia sus cuentas «por depositar»,
-- con la máquina por defecto de cada tienda (Vendemás para la tarjeta en TRU y AQP, Izipay para el QR y para Lima): el cruce con
-- los depósitos reales dirá si alguno fue de la otra máquina.
--
-- CONTRATO (Liskov)
--   PROMETE: `fn_resellar_cobros_a_maquinas(desde, motivo)` mueve cada pago con tarjeta o QR de una venta completada desde esa fecha,
--            cuya cuenta sellada es un BANCO (o ninguna), a la cuenta «por depositar» que «A qué cuenta entra cada cobro» dice para
--            esa tienda, ese medio y ESE día; deja el antes y el después de cada uno en `cobros_resellados` (solo agrega filas) y
--            devuelve cuántos movió por tienda y medio. Nunca saca un cobro de una puente, nunca toca el efectivo, Yape, Plin ni las
--            transferencias, ni una venta anulada. Idempotente: la segunda vez mueve 0.
--   ASUME:   20261016173000 ya pegada (las puentes y las filas de «A qué cuenta entra cada cobro» desde el 2026-09-30); ningún mes
--            cerrado (en producción, 0 el 2026-10-16). El sello de un cobro sigue sin cambiar desde ninguna pantalla: la única puerta es
--            esta función, que la abre solo mientras corre (`retail.resellar_cobros`, local a la transacción).
--   NO HACE: no registra los depósitos que Izipay y Vendemás ya hicieron a Interbank (esos los registra Felipe con «Depósito de la
--            máquina», con el extracto en la mano: hasta entonces las puentes muestran todo lo cobrado como pendiente y el aviso de
--            atraso se prende); no toca apartados, cambios ni devoluciones con tarjeta (en producción, 0 filas: la función los cuenta
--            y lo dice).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — con el OK de Felipe, en DOS pasos en el SQL Editor:
--   1. ENSAYO: pegar este archivo entero y agregar al final  `do $$ begin raise exception 'ENSAYO_OK'; end $$;`
--      Todo se deshace; la salida del `select` final dice cuántos cobros se moverían por tienda y medio. Se compara con la sonda de
--      solo lectura (los cobros con tarjeta y QR sellados en el BCP desde el 30-sep) y se le muestra a Felipe.
--   2. DE VERDAD: pegar el archivo tal cual. `lock_timeout = 3s`: toma filas de `venta_pagos` (las de tarjeta y QR, ~280), no la tabla.
--      Si dice «lock timeout» (una venta cobrándose en ese instante), se repite.
-- SE ROMPE SI: (1) alguien pega esto ANTES de 20261016173000: no hay puentes y mueve 0 (lo dice); (2) un cobro con tarjeta de TRU o
-- AQP fue en realidad de Izipay: queda en Vendemás y el cruce del depósito de Izipay lo mostrará como día que falta (Felipe decide
-- entonces); (3) un mes ya cerrado (ADR-0198): el diario de ese mes no cambia (el QR ya asienta en 105 desde 20261016173000 y la
-- cuenta contable de la tarjeta es 105 en el banco también), pero la función se niega si hay un cierre que cubra la fecha.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El rastro: qué cobro se movió, de dónde a dónde y por qué ----------
create table if not exists retail.cobros_resellados (
  id uuid primary key default gen_random_uuid(),
  origen text not null check (origen in ('venta_pago')),
  origen_id uuid not null,
  cuenta_antes uuid references retail.cuentas_dinero (id),
  cuenta_despues uuid not null references retail.cuentas_dinero (id),
  motivo text not null check (trim(motivo) <> ''),
  hecho_en timestamptz not null default now()
);
comment on table retail.cobros_resellados is
  'Cada cobro cuya cuenta sellada se corrigió por una decisión (ADR-0429: del BCP a la puente de su máquina), con el antes, el después y el porqué. Solo agrega filas: el sello de un cobro no cambia desde ninguna pantalla.';
create index if not exists cobros_resellados_origen_idx on retail.cobros_resellados (origen, origen_id);
alter table retail.cobros_resellados enable row level security;

create or replace function retail.fn_cobros_resellados_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'El rastro de un cobro corregido no se edita ni se borra.' using errcode = 'P0001';
end $$;
create or replace trigger cobros_resellados_inmutable before update or delete on retail.cobros_resellados
  for each row execute function retail.fn_cobros_resellados_inmutable();
revoke all on function retail.fn_cobros_resellados_inmutable() from public, anon, authenticated;

-- ---------- 2. La única puerta: el sello de un cobro cambia solo mientras corre esta corrección ----------
select pg_temp.reemplazar('retail.fn_venta_pagos_sellar()',
$v$    if new.cuenta_dinero_id is distinct from old.cuenta_dinero_id then
      raise exception 'La cuenta de un cobro se sella al cobrar: no cambia.' using errcode = 'P0001';$v$,
$n$    -- ADR-0429: la única puerta es `fn_resellar_cobros_a_maquinas` (marca local a la transacción); desde una pantalla, nunca.
    if new.cuenta_dinero_id is distinct from old.cuenta_dinero_id and coalesce(current_setting('retail.resellar_cobros', true), '') <> 'si' then
      raise exception 'La cuenta de un cobro se sella al cobrar: no cambia.' using errcode = 'P0001';$n$, 1);

-- ---------- 3. La corrección ----------
create or replace function retail.fn_resellar_cobros_a_maquinas(p_desde date, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_movidos integer := 0;
  v_sin_destino integer := 0;
  v_detalle jsonb;
  v_otros jsonb;
begin
  if p_desde is null then
    raise exception 'Di desde qué día se rehacen los cobros.' using errcode = 'P0001';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Di por qué se rehacen.' using errcode = 'P0001';
  end if;
  -- Un mes cerrado congeló su diario (ADR-0198): no se mueve nada que caiga dentro de él.
  if exists (select 1 from retail.periodo_cierres pc where pc.reabierto_en is null and (pc.mes + interval '1 month')::date > p_desde) then
    raise exception 'Hay un mes cerrado desde el %: reábrelo antes de rehacer sus cobros.', to_char(p_desde, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;

  perform set_config('retail.resellar_cobros', 'si', true);

  create temp table if not exists tmp_resello (venta_pago_id uuid primary key, antes uuid, despues uuid, ubicacion_nombre text, medio text) on commit drop;
  delete from tmp_resello;
  insert into tmp_resello (venta_pago_id, antes, despues, ubicacion_nombre, medio)
  select vp.id, vp.cuenta_dinero_id, d.id, u.nombre, vp.metodo
    from retail.venta_pagos vp
    join retail.ventas v on v.id = vp.venta_id
    join retail.ubicaciones u on u.id = v.ubicacion_id
    left join retail.cuentas_dinero antes on antes.id = vp.cuenta_dinero_id
    left join retail.cuentas_dinero d on d.id = retail.fn_cuenta_de_cobro(v.ubicacion_id, vp.metodo, (v.created_at at time zone 'America/Lima')::date)
   where v.estado = 'completada' and not coalesce(v.es_prueba, false)
     and vp.metodo in ('tarjeta', 'qr')
     and (v.created_at at time zone 'America/Lima')::date >= p_desde
     -- Solo lo que está en un banco (o sin cuenta): lo que ya espera en una puente no se toca.
     and (antes.id is null or antes.tipo = 'banco')
     and d.tipo = 'por_abonar' and d.archivada_en is null
     and d.id is distinct from vp.cuenta_dinero_id;

  select count(*) into v_sin_destino
    from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id
    left join retail.cuentas_dinero antes on antes.id = vp.cuenta_dinero_id
   where v.estado = 'completada' and not coalesce(v.es_prueba, false) and vp.metodo in ('tarjeta', 'qr')
     and (v.created_at at time zone 'America/Lima')::date >= p_desde and (antes.id is null or antes.tipo = 'banco')
     and not exists (select 1 from tmp_resello t where t.venta_pago_id = vp.id);

  update retail.venta_pagos vp set cuenta_dinero_id = t.despues from tmp_resello t where t.venta_pago_id = vp.id;
  get diagnostics v_movidos = row_count;

  insert into retail.cobros_resellados (origen, origen_id, cuenta_antes, cuenta_despues, motivo)
  select 'venta_pago', t.venta_pago_id, t.antes, t.despues, trim(p_motivo) from tmp_resello t;

  select coalesce(jsonb_agg(x order by x ->> 'tienda', x ->> 'medio'), '[]'::jsonb) into v_detalle
    from (select jsonb_build_object('tienda', t.ubicacion_nombre, 'medio', t.medio, 'cobros', count(*), 'a', (select c.nombre from retail.cuentas_dinero c where c.id = t.despues)) as x
            from tmp_resello t group by t.ubicacion_nombre, t.medio, t.despues) s;

  -- Lo que esta función NO toca, dicho en voz alta: tarjeta o QR en apartados, cambios y devoluciones desde esa fecha.
  select jsonb_build_object(
           'separacion_pagos', (select count(*) from retail.separacion_pagos sp where sp.metodo in ('tarjeta', 'qr') and (sp.created_at at time zone 'America/Lima')::date >= p_desde),
           'cambios', (select count(*) from retail.cambios cb where cb.metodo_pago_diferencia in ('tarjeta', 'qr') and (cb.created_at at time zone 'America/Lima')::date >= p_desde),
           'devoluciones', (select count(*) from retail.devoluciones dv where dv.estado = 'aprobada' and dv.reembolso_metodo in ('tarjeta', 'qr') and (dv.aprobado_en at time zone 'America/Lima')::date >= p_desde))
    into v_otros;

  perform set_config('retail.resellar_cobros', '', true);
  return jsonb_build_object('desde', p_desde, 'movidos', v_movidos, 'sin_destino', v_sin_destino, 'detalle', v_detalle, 'no_tocados', v_otros);
end $$;
comment on function retail.fn_resellar_cobros_a_maquinas(date, text) is
  'ADR-0429 (una vez, con el OK de Felipe): los cobros con tarjeta y QR sellados en un banco desde una fecha pasan a la cuenta «por depositar» de la máquina por defecto de su tienda, con rastro en cobros_resellados. Nadie la llama desde la web.';
revoke all on function retail.fn_resellar_cobros_a_maquinas(date, text) from public, anon, authenticated;

-- ---------- 4. La corrección, desde el primer cobro con tarjeta (Felipe, 2026-10-16) ----------
select retail.fn_resellar_cobros_a_maquinas(date '2026-09-30',
  'ADR-0429: los cobros con tarjeta y QR pasan del banco a la cuenta «por depositar» de su máquina (Felipe, 2026-10-16)');

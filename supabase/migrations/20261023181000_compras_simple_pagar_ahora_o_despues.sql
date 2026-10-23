-- ============================================================================
-- 20261023181000_compras_simple_pagar_ahora_o_despues.sql — CAYLA V2 · ADR-0480 (Compras simple), rediseño
-- Al anotar una compra, «Pagar ahora» (con cuánto y cómo: Yape, efectivo o transferencia) o «Pagar después» (Felipe, 2026-10-23).
--
-- EL PROBLEMA PRIMERO. Hasta hoy toda compra anotada desde el celular se daba por pagada entera con la plata de compras de quien compró, y en
-- efectivo (provisional: ADR-0480, actividad 7). En Gamarra no siempre es así: a veces se deja un adelanto, a veces el proveedor fía, y se
-- paga por Yape o transferencia. Con todo «pagado en efectivo», la plata de la compradora bajaba de más y Por pagar no veía la deuda.
--
-- DECISIONES DE FELIPE (2026-10-23, en el cuadro): «Pagar después» lo paga Compras desde Por pagar; «Pagar ahora» admite pagar solo una
-- parte (el resto queda por pagar); los tres métodos salen de su plata para compras (el método solo dice cómo le pagó al proveedor).
--
-- QUÉ HACE
--   1. `compra_papeles` guarda `pagado` (de 0 al monto del papel) y `medio_pago` (yape, efectivo o transferencia; sin pago, ninguno). Lo ya
--      anotado queda como antes: pagado entero, en efectivo. Los dos datos tampoco cambian después (el candado de lo anotado los suma).
--   2. `registrar_compra_rapida(…, p_pagado, p_medio)`: una versión con los dos datos que los valida, los deja en la transacción
--      (`retail.compra_pago`) y llama a la de siempre, sin tocarla: un disparador antes del insert del papel los toma de ahí. La de siempre,
--      llamada sola, deja todo pagado en efectivo, como antes (una pantalla vieja abierta no se rompe).
--   3. `fn_mi_plata_tiene` y `fn_mi_plata_compras` restan lo PAGADO, no el monto del papel: lo que no pagó no salió de su plata.
--   4. `completar_papel_compra` paga solo lo pagado, con su método, desde el fondo de quien compró; si queda algo, el comprobante va a
--      crédito (vence a los 7 días de la compra: provisional) y aparece en Por pagar. Si Compras corrige el monto del papel hacia abajo, lo
--      pagado no pasa del nuevo monto.
--   5. `fn_revisar_compras` muestra cuánto se pagó y cómo.
--
-- Se pega tal cual en producción, DESPUÉS de 20261023180000: idempotente (columnas `if not exists`, reemplazos anclados que no hacen nada si
-- ya se hicieron, `create or replace trigger`), sin políticas. Toca `compra_papeles` con `alter`: va solo, sin `create policy` (CLAUDE.md,
-- «Políticas y deadlocks»).
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

-- ---------- 1. Cuánto pagó ahora y cómo ----------
alter table retail.compra_papeles add column if not exists pagado numeric(12, 2);
alter table retail.compra_papeles add column if not exists medio_pago text;
comment on column retail.compra_papeles.pagado is
  'ADR-0480: lo que la compradora pagó al proveedor al comprar, con su plata para compras (de 0 al monto). Lo que falta lo paga Compras desde Por pagar.';
comment on column retail.compra_papeles.medio_pago is 'ADR-0480: cómo pagó lo pagado: yape, efectivo o transferencia. Sin pago, ninguno.';
-- Lo ya anotado era todo pagado, en efectivo (como lo completaba la base): se dice así. El candado de lo anotado todavía no mira estas columnas.
update retail.compra_papeles set pagado = monto, medio_pago = 'efectivo' where pagado is null;

-- El papel nace con lo que deja la versión con `p_pagado`; sin ella, todo pagado en efectivo. Corre antes de que se mire `not null`.
create or replace function retail.fn_compra_papel_pago_por_defecto()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_pago jsonb := nullif(current_setting('retail.compra_pago', true), '')::jsonb;
begin
  if new.pagado is null then
    new.pagado := coalesce((v_pago ->> 'pagado')::numeric, new.monto);
    new.medio_pago := case when v_pago is null then 'efectivo' else v_pago ->> 'medio' end;
  end if;
  return new;
end $$;
revoke all on function retail.fn_compra_papel_pago_por_defecto() from public, anon, authenticated;
create or replace trigger compra_papeles_pago_por_defecto
  before insert on retail.compra_papeles
  for each row execute function retail.fn_compra_papel_pago_por_defecto();

alter table retail.compra_papeles alter column pagado set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compra_papeles_pagado_rango') then
    alter table retail.compra_papeles add constraint compra_papeles_pagado_rango check (pagado >= 0 and pagado <= monto);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'compra_papeles_medio_pago') then
    alter table retail.compra_papeles add constraint compra_papeles_medio_pago
      check ((pagado = 0 and medio_pago is null) or (pagado > 0 and medio_pago in ('yape', 'efectivo', 'transferencia')));
  end if;
end $$;

-- Lo pagado y su método tampoco cambian después de anotarlos.
select pg_temp.reemplazar('retail.fn_compra_papeles_inmutable()',
$v$new.huella, new.registrado_por, new.created_at)$v$,
$v$new.huella, new.registrado_por, new.created_at, new.pagado, new.medio_pago)$v$, 1);
select pg_temp.reemplazar('retail.fn_compra_papeles_inmutable()',
$v$old.huella, old.registrado_por, old.created_at)$v$,
$v$old.huella, old.registrado_por, old.created_at, old.pagado, old.medio_pago)$v$, 1);

-- ---------- 2. Registrar la compra con cuánto pagó y cómo ----------
create or replace function retail.registrar_compra_rapida(
  p_id uuid,
  p_proveedor_id uuid,
  p_tipo text,
  p_monto numeric,
  p_foto_ruta text,
  p_lineas jsonb,
  p_pagado numeric,
  p_medio text
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_pagado numeric := round(p_pagado, 2);
  v_medio text := nullif(lower(btrim(coalesce(p_medio, ''))), '');
  v_monto numeric := round(p_monto, 2);
  v_r jsonb;
begin
  if v_pagado is null or v_pagado = 'NaN'::numeric or v_pagado < 0 or (v_monto is not null and v_pagado > v_monto) then
    raise exception 'Lo que pagas ahora va de S/ 0 a lo que dice el papel' using errcode = 'P0001', hint = 'compra_rapida_pagado';
  end if;
  if v_pagado <> p_pagado then
    raise exception 'Lo que pagas ahora admite como máximo 2 decimales' using errcode = 'P0001', hint = 'compra_rapida_pagado';
  end if;
  if v_pagado = 0 then
    v_medio := null;
  elsif v_medio is null or v_medio not in ('yape', 'efectivo', 'transferencia') then
    raise exception 'Elige cómo pagaste: Yape, efectivo o transferencia' using errcode = 'P0001', hint = 'compra_rapida_medio';
  end if;

  perform set_config('retail.compra_pago', jsonb_build_object('pagado', v_pagado, 'medio', v_medio)::text, true);
  v_r := retail.registrar_compra_rapida(p_id, p_proveedor_id, p_tipo, p_monto, p_foto_ruta, p_lineas);
  perform set_config('retail.compra_pago', '', true);

  -- Un reintento con el mismo identificador devuelve lo que ya quedó: si quedó con otro pago, lo dice (como con otros datos).
  if exists (select 1 from retail.compra_papeles c where c.id = p_id and (c.pagado, c.medio_pago) is distinct from (v_pagado, v_medio)) then
    raise exception 'Esa compra ya se guardó con otros datos: recarga la pantalla' using errcode = 'P0001', hint = 'compra_rapida_otros_datos';
  end if;
  return v_r;
end $$;
comment on function retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb, numeric, text) is
  'ADR-0480: anota la compra con cuánto se pagó ahora (de 0 al monto) y cómo; lo demás, como la de seis datos.';
revoke all on function retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb, numeric, text) from public, anon;
grant execute on function retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb, numeric, text) to authenticated;

-- ---------- 3. Lo que tiene para comprar resta lo pagado ----------
select pg_temp.reemplazar('retail.fn_mi_plata_tiene(uuid)',
$v$sum(c.monto) from retail.compra_papeles c$v$,
$v$sum(c.pagado) from retail.compra_papeles c$v$, 1);
select pg_temp.reemplazar('retail.fn_mi_plata_compras()',
$v$'compras_por_completar', coalesce((select sum(c.monto) from$v$,
$v$'compras_por_completar', coalesce((select sum(c.pagado) from$v$, 1);
select pg_temp.reemplazar('retail.fn_mi_plata_compras()',
$v$'compraste', coalesce((select sum(c.monto) from$v$,
$v$'compraste', coalesce((select sum(c.pagado) from$v$, 1);
select pg_temp.reemplazar('retail.fn_mi_plata_compras()',
$v$'tipo', c.tipo, 'monto', c.monto, 'estado', c.estado,$v$,
$v$'tipo', c.tipo, 'monto', c.monto, 'pagado', c.pagado, 'medio_pago', c.medio_pago, 'estado', c.estado,$v$, 1);

-- ---------- 4. Completar paga lo pagado; el resto va a crédito ----------
select pg_temp.reemplazar('retail.completar_papel_compra(uuid,uuid,text,text,numeric)',
$v$  v_fondo uuid;
$v$,
$v$  v_fondo uuid;
  -- Lo que pagó al comprar (20261023181000), sin pasar del monto del papel si Compras lo corrigió hacia abajo.
  v_pagado numeric;
$v$, 1);
select pg_temp.reemplazar('retail.completar_papel_compra(uuid,uuid,text,text,numeric)',
$v$  v_monto := round(coalesce(p_monto, v_p.monto), 2);
$v$,
$v$  v_monto := round(coalesce(p_monto, v_p.monto), 2);
  v_pagado := least(v_p.pagado, v_monto);
$v$, 1);
select pg_temp.reemplazar('retail.completar_papel_compra(uuid,uuid,text,text,numeric)',
$v$values (v_prov, v_p.tipo, v_serie, v_numero, v_p.fecha, 'contado', null, v_base, v_igv, v_monto,$v$,
$v$values (v_prov, v_p.tipo, v_serie, v_numero, v_p.fecha,
            case when v_pagado < v_monto then 'credito' else 'contado' end,
            case when v_pagado < v_monto then v_p.fecha + 7 end, v_base, v_igv, v_monto,$v$, 1);
select pg_temp.reemplazar('retail.completar_papel_compra(uuid,uuid,text,text,numeric)',
$v$  perform retail.fn_validar_fecha_pago_compra(v_p.fecha, v_p.fecha, v_documento);
  perform set_config('retail.papel_paga_de', v_fondo::text, true);
  insert into retail.compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, ubicacion_id, cuenta_dinero_id)
  values (v_compra, v_p.fecha, v_monto, 'efectivo', 'Plata para compras', v_actor, null, v_fondo);
  perform set_config('retail.papel_paga_de', '', true);
$v$,
$v$  -- Solo lo que pagó al comprar, con su método; lo que falta queda en Por pagar (20261023181000).
  if v_pagado > 0 then
    perform retail.fn_validar_fecha_pago_compra(v_p.fecha, v_p.fecha, v_documento);
    perform set_config('retail.papel_paga_de', v_fondo::text, true);
    insert into retail.compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, ubicacion_id, cuenta_dinero_id)
    values (v_compra, v_p.fecha, v_pagado, v_p.medio_pago, 'Plata para compras', v_actor, null, v_fondo);
    perform set_config('retail.papel_paga_de', '', true);
  end if;
$v$, 1);

-- ---------- 5. Revisar compras ve cuánto se pagó y cómo ----------
select pg_temp.reemplazar('retail.fn_revisar_compras()',
$v$'tipo', cp.tipo, 'monto', cp.monto, 'foto_ruta', cp.foto_ruta,$v$,
$v$'tipo', cp.tipo, 'monto', cp.monto, 'pagado', cp.pagado, 'medio_pago', cp.medio_pago, 'foto_ruta', cp.foto_ruta,$v$, 1);

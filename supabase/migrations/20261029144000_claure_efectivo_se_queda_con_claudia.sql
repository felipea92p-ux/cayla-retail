-- ============================================================================
-- 20261029144000 — «Se queda con Claudia»: el efectivo de CAYLA que ella guarda al cerrar la caja baja lo que se le debe (ADR-0560; actividad 11)
--
-- EL PROBLEMA PRIMERO. Claudia administra la caja de Tienda Lima y se queda con el efectivo del cajón, el de CLAURE (que es suyo) y el de CAYLA. Lo que se le debe a ella
-- (lo cobrado por sus prendas en las cuentas de CAYLA) no bajaba por ese efectivo de CAYLA que ya tiene en la mano: el sistema decía que se le debía más de lo real, y el
-- cajón de CAYLA seguía contando una plata que ya no está. Felipe (2026-10-29): «destino "Se queda con Claudia" al cerrar caja».
--
-- CONTRATO (Liskov)
--   PROMETE: (1) un destino nuevo del traslado del cierre, `claudia`, solo en una tienda donde opera CLAURE; no pide referencia. (2) Lo que se traslada así SALE del cajón, no llega a ninguna
--            cuenta de CAYLA y baja lo que se le debe: `fn_claure_cierre` lo resta del saldo y del saldo anterior y trae `hoy.efectivo_claudia`; `fn_claure_pagos` lo lista como un pago más
--            («Efectivo del cajón · tienda»). (3) El Diario lo asienta al debe de la 479 y al haber de la caja (101): `traslado_claudia:<id>`. (4) El libro de dinero lo deja sin cuenta
--            (no es un depósito en un banco) y el flujo de caja lo cuenta como `pago_claure`, no como «depósito sin cuenta». (5) La actividad lo dice con sus palabras.
--            Todo lo demás de cada función es EXACTAMENTE lo de antes: los destinos `caja_fuerte`, `banco` y `lider` no cambian.
--   ASUME:   quien traslada escribe cuánto del efectivo es DE CAYLA (el del cierre dice cuánto es de cada empresa); lo de CLAURE que se queda en el cajón es de ella y no baja nada.
--   NO HACE: no cambia el cuadre de la caja (contado = fondo + trasladado: el trigger `trg_caja_traslados_cuadra_su_fondo` lo sigue exigiendo) ni ninguna otra tabla.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029142000. Lleva un `alter table` de `caja_traslados` (un `check` con un destino más; sin políticas) y siete reemplazos
-- anclados sobre funciones vivas (`cerrar_caja`, `fn_dinero_libro`, `fn_flujo_lineas`, `fn_asientos_dinero_y_caja`, `fn_actividad_caja_traslado` y la propia `fn_claure_cierre`): si una
-- no tiene el texto esperado ABORTA SIN CAMBIAR NADA y dice cuál. Idempotente. SE ROMPE SI: otra migración reescribe `cerrar_caja` o el libro y cambia esos textos.
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

-- ---------- 1. El destino nuevo del traslado ----------
alter table retail.caja_traslados drop constraint if exists caja_traslados_destino_check;
alter table retail.caja_traslados add constraint caja_traslados_destino_check check (destino in ('caja_fuerte', 'banco', 'lider', 'claudia'));

-- ---------- 2. `cerrar_caja` lo acepta, y solo donde opera CLAURE ----------
select pg_temp.reemplazar('retail.cerrar_caja(uuid, numeric, numeric, text, text, uuid)',
$v$    if p_traslado_destino is null or p_traslado_destino not in ('caja_fuerte', 'banco', 'lider') then
      raise exception 'Elige a dónde va el efectivo que trasladas';
    end if;$v$,
$n$    if p_traslado_destino is null or p_traslado_destino not in ('caja_fuerte', 'banco', 'lider', 'claudia') then
      raise exception 'Elige a dónde va el efectivo que trasladas';
    end if;
    if p_traslado_destino = 'claudia' and not exists (select 1 from retail.empresa_sedes es join retail.empresas e on e.id = es.empresa_id
                                                       where e.clave = 'claure' and e.activo and es.ubicacion_id = v_caja.ubicacion_id) then
      raise exception 'El efectivo solo se queda con Claudia en una tienda donde opera CLAURE';
    end if;$n$,
1);

-- ---------- 3. El libro de dinero: no es un depósito, no llega a ninguna cuenta de CAYLA ----------
select pg_temp.reemplazar('retail.fn_dinero_libro(date)',
$v$when 'lider' then (select r.id from retail.cuentas_dinero r where r.tipo = 'por_rendir')$v$,
$n$when 'lider' then (select r.id from retail.cuentas_dinero r where r.tipo = 'por_rendir')
               when 'claudia' then null::uuid$n$,
1);
select pg_temp.reemplazar('retail.fn_dinero_libro(date)',
$v$when 'lider' then ' → entregado al líder' else ' → depósito' end$v$,
$n$when 'lider' then ' → entregado al líder' when 'claudia' then ' → se queda con Claudia' else ' → depósito' end$n$,
1);

-- ---------- 4. El flujo de caja: es un pago a CLAURE, no un depósito sin cuenta ----------
select pg_temp.reemplazar('retail.fn_flujo_lineas(date, date)',
$v$case when coalesce(lt.suma, false) then 'entre_cuentas' else 'deposito_sin_cuenta' end as categoria,$v$,
$n$case when t.destino = 'claudia' then 'pago_claure' when coalesce(lt.suma, false) then 'entre_cuentas' else 'deposito_sin_cuenta' end as categoria,$n$,
1);

-- ---------- 5. El Diario: al debe de la 479 (lo que se le debe baja) y al haber de la caja ----------
select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[])',
$v$      from dc
  )
  select * from l_md
  union all select * from l_tb
  union all select * from l_dc;$v$,
$n$      from dc
  ),
  -- ===== El efectivo que se queda con Claudia al cerrar la caja (ADR-0560, actividad 11): sale del cajón y baja lo que se le debe (479).
  tc as (
    select t.id, k.ubicacion_id as u, (t.creado_en at time zone 'America/Lima')::date as fecha, t.monto, un.nombre
      from retail.caja_traslados t
      join retail.cajas k on k.id = t.caja_id
      join retail.ubicaciones un on un.id = k.ubicacion_id
      cross join lim
     where t.destino = 'claudia' and not k.es_prueba and t.creado_en >= lim.ini and t.creado_en < lim.fin
       and (p_todo or k.ubicacion_id = any (p_ubics))
  ),
  l_tc as (
    select tc.fecha as f, tc.u, ('traslado_claudia:' || tc.id)::text as asiento, 'traslado_claudia'::text as regla, '479'::text as cuenta,
           tc.monto::numeric as debe, 0::numeric as haber, 'caja_traslados'::text as ot, tc.id as oid,
           ('Efectivo que se queda con Claudia · ' || tc.nombre)::text as glosa
      from tc
    union all
    select tc.fecha, tc.u, 'traslado_claudia:' || tc.id, 'traslado_claudia', '101', 0, tc.monto, 'caja_traslados', tc.id, 'Sale del cajón: se queda con Claudia'
      from tc
  )
  select * from l_md
  union all select * from l_tb
  union all select * from l_dc
  union all select * from l_tc;$n$,
1);

-- ---------- 6. La actividad lo dice con sus palabras ----------
select pg_temp.reemplazar('retail.fn_actividad_caja_traslado(uuid, text)',
$v$when 'banco' then 'para depositar en el banco' else 'para entregarlo al líder' end$v$,
$n$when 'banco' then 'para depositar en el banco' when 'claudia' then 'para que se quede con Claudia' else 'para entregarlo al líder' end$n$,
1);

-- ---------- 7. La pantalla CLAURE lo lista como un pago más (función propia) ----------
create or replace function retail.fn_claure_pagos()
returns table (id uuid, fecha date, cuenta_id uuid, cuenta_nombre text, monto numeric, referencia text, registrado_por text, creado_en timestamptz)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
begin
  if not retail.fn_es_lider() and coalesce(cardinality(retail.fn_cuentas_dinero_ubicaciones()), 0) = 0 then
    raise exception 'Ver la cuenta con CLAURE necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return query
  select x.id, x.fecha, x.cuenta_id, x.cuenta_nombre, x.monto, x.referencia, x.registrado_por, x.creado_en
    from (
      select d.id, d.fecha, d.cuenta_origen_id as cuenta_id, o.nombre as cuenta_nombre, d.monto, d.referencia,
             nullif(trim(concat_ws(' ', pr.nombres, pr.apellidos)), '') as registrado_por, d.created_at as creado_en
        from retail.movimientos_dinero d
        left join retail.cuentas_dinero o on o.id = d.cuenta_origen_id
        left join public.personas pr on pr.id = d.registrado_por
       where d.tipo = 'pago_claure' and d.estado = 'vigente'
      union all
      -- El efectivo del cajón que se quedó con Claudia al cerrar la caja: no sale de un banco, sale del cajón de esa tienda.
      select t.id, (t.creado_en at time zone 'America/Lima')::date, null::uuid, 'Efectivo del cajón · ' || u.nombre, t.monto::numeric, nullif(btrim(t.referencia), ''),
             nullif(trim(concat_ws(' ', pr.nombres, pr.apellidos)), ''), t.creado_en
        from retail.caja_traslados t
        join retail.cajas k on k.id = t.caja_id
        join retail.ubicaciones u on u.id = k.ubicacion_id
        left join public.personas pr on pr.id = t.registrado_por
       where t.destino = 'claudia' and not k.es_prueba
    ) x
   order by x.fecha desc, x.creado_en desc;
end $$;

comment on function retail.fn_claure_pagos() is
  'ADR-0560: los pagos vigentes a CLAURE de más nuevo a más viejo: los de un banco (movimientos_dinero.tipo = pago_claure) y el efectivo del cajón que se quedó con Claudia al cerrar la caja (caja_traslados.destino = claudia). El saldo con CLAURE es lo cobrado (fn_claure_cuenta) menos estos pagos.';
revoke all on function retail.fn_claure_pagos() from public, anon;
grant execute on function retail.fn_claure_pagos() to authenticated;

-- ---------- 8. El aviso del cierre de caja: lo que se queda con Claudia baja el saldo (función propia, reemplazos anclados) ----------
select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$  v_igv numeric := 0; v_igv_hoy numeric := 0;$v$,
$n$  v_igv numeric := 0; v_igv_hoy numeric := 0;
  v_ef_claudia numeric := 0; v_ef_claudia_hoy numeric := 0;$n$,
1);

select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$  v_cobrado_ant := v_cobrado - v_cobrado_hoy;$v$,
$n$  -- El efectivo de CAYLA que Claudia se quedó al cerrar las cajas de esta sede (hasta ese día y de ese día): también baja lo que se le debe.
  v_ef_claudia := (select coalesce(sum(t.monto), 0) from retail.caja_traslados t join retail.cajas k on k.id = t.caja_id
                    where t.destino = 'claudia' and not k.es_prueba and k.ubicacion_id = v_caja.ubicacion_id and (t.creado_en at time zone 'America/Lima')::date <= v_fecha);
  v_ef_claudia_hoy := (select coalesce(sum(t.monto), 0) from retail.caja_traslados t join retail.cajas k on k.id = t.caja_id
                        where t.destino = 'claudia' and not k.es_prueba and k.ubicacion_id = v_caja.ubicacion_id and (t.creado_en at time zone 'America/Lima')::date = v_fecha);

  v_cobrado_ant := v_cobrado - v_cobrado_hoy;$n$,
1);

select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$- v_comision - v_pagado - v_gastos, 2),$v$,
$n$- v_comision - v_pagado - v_ef_claudia - v_gastos, 2),$n$,
1);

select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$- v_pagado_ant - (v_gastos - v_gastos_hoy), 2),$v$,
$n$- v_pagado_ant - (v_ef_claudia - v_ef_claudia_hoy) - (v_gastos - v_gastos_hoy), 2),$n$,
1);

select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$'pagado', round(v_pagado_hoy, 2), 'gastos'$v$,
$n$'pagado', round(v_pagado_hoy, 2), 'efectivo_claudia', round(v_ef_claudia_hoy, 2), 'gastos'$n$,
1);

comment on function retail.fn_claure_cierre(uuid) is
  'ADR-0560: lo que el cierre de caja muestra sobre CLAURE: el saldo con Claudia al terminar el día de esa caja (cobrado − devuelto − IGV − comisión − pagado − efectivo que se quedó con ella − gastos suyos), lo del día por medio, y el efectivo de las ventas de la caja partido entre CAYLA y CLAURE (suma exacta de ventas_efectivo). Candado de fn_esperado_caja. Solo lee.';

do $$
begin
  if position('claudia' in pg_get_constraintdef((select oid from pg_constraint where conname = 'caja_traslados_destino_check'))) = 0
     or position('claudia' in pg_get_functiondef('retail.cerrar_caja(uuid, numeric, numeric, text, text, uuid)'::regprocedure)) = 0
     or position('claudia' in pg_get_functiondef('retail.fn_dinero_libro(date)'::regprocedure)) = 0
     or position('claudia' in pg_get_functiondef('retail.fn_flujo_lineas(date, date)'::regprocedure)) = 0
     or position('traslado_claudia' in pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[])'::regprocedure)) = 0
     or position('claudia' in pg_get_functiondef('retail.fn_actividad_caja_traslado(uuid, text)'::regprocedure)) = 0
     or position('v_ef_claudia' in pg_get_functiondef('retail.fn_claure_cierre(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: el destino «claudia» no quedó en todas las funciones del cierre de caja';
  end if;
end $$;

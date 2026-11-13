-- ============================================================================
-- 20261029162000 — Un cambio con prendas de CLAURE: la plata sigue a la prenda que se lleva la clienta (ADR-0560; actividad 13)
--
-- EL PROBLEMA PRIMERO. Una clienta compra una blusa de CLAURE a S/ 100 con Yape (a Claudia se le deben S/ 84.75 sin IGV) y la cambia por una de CAYLA de S/ 100. Un cambio mueve plata sin pasar por una
-- venta ni por una cuenta, así que hasta la actividad 12 la pestaña CLAURE lo listaba «por revisar» y NO movía lo que se le debe: Claudia seguía figurando con sus S/ 84.75 por una blusa que ya volvió
-- a su estante, y CAYLA no tenía como suya la plata de la blusa que entregó. Felipe (2026-10-29): «la plata sigue a la prenda que se lleva la clienta», en la deuda y en el Diario.
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `fn_claure_cambios(desde, hasta, sedes)` (interna): por cada cambio de una sede donde opera CLAURE, cuánto se le suma (+) o se le resta (−) a lo que se le debe a Claudia, con su IGV y su base.
--            La plata de lo que devolvió (lo que pagó por esa prenda, en la parte que se cobró en una cuenta de CAYLA) pasa de quien era dueño de ESA prenda a los dueños de lo que se lleva (a lo que valga
--            cada una), y la diferencia que se paga o se devuelve en una cuenta de CAYLA va a los dueños de lo que se lleva. El efectivo no cuenta (lo tiene Claudia). Entre dos prendas de CLAURE solo se
--            mueve la diferencia; de CLAURE a CAYLA baja lo que se le debe; de CAYLA a CLAURE sube. (2) `fn_claure_filas` (la pestaña CLAURE, `fn_claure_saldo_a`) lista esos cambios como filas CONTADAS
--            (antes «por revisar»). (3) `fn_claure_cierre` los suma como cobrado (si suben) o devuelto (si bajan). (4) `fn_asientos_claure` mueve esa plata entre las ventas de CAYLA (7011) y lo que se le debe
--            (479): cuadrado por cambio. Lo demás de cada función es EXACTAMENTE lo de antes.
--   ASUME:   `movimientos.empresa_id` dice de quién era cada prenda que salió con el cambio (ADR-0542); `venta_items.precio_unitario − descuento_unitario` es lo que se pagó por la prenda devuelta;
--            lo que se pagó con efectivo y lo que se cobró con cuentas de CAYLA se reparte por la proporción de los pagos de la venta original (como en `fn_claure_filas`).
--   NO HACE: no toca el costo de la prenda (el Diario sigue ajustando solo la diferencia de costo, como siempre), la comisión del POS ni un apartado cambiado (su adelanto no entra en la proporción).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029161000. Una función nueva y seis reemplazos anclados sobre funciones propias (`fn_claure_filas`, `fn_claure_cierre`, `fn_asientos_claure`):
-- ABORTAN SIN CAMBIAR NADA si el texto no es el esperado y dicen cuál. Sin políticas ni `alter table`; idempotente.
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

-- ---------- 1. Lo que cada cambio le suma o le resta a lo que se le debe a Claudia (interna) ----------
create or replace function retail.fn_claure_cambios(p_desde date, p_hasta date, p_ubics uuid[])
returns table (cambio_id uuid, fecha date, ubicacion_id uuid, medio text, cuenta_id uuid, delta numeric, igv numeric, base numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_claure uuid;
  v_desde date;
  v_casa uuid := retail.fn_empresa_casa_id();
begin
  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.clave = 'claure' and e.activo;
  if v_claure is null or v_desde is null then
    return;
  end if;

  return query
  with sedes as (
    select es.ubicacion_id from retail.empresa_sedes es where es.empresa_id = v_claure and es.ubicacion_id = any (p_ubics)
  ),
  base as (
    -- Cada cambio de esas sedes: lo que se pagó por lo que devolvió (`a`), si esa prenda era de CLAURE, y qué parte de la venta original se pagó en cuentas (no en efectivo).
    select cb.id as cambio_id, cb.ubicacion_id, (cb.created_at at time zone 'America/Lima')::date as fecha,
           coalesce(cb.diferencia, 0) as d, cb.metodo_pago_diferencia as medio, cb.cuenta_dinero_id as cuenta_id, cb.cantidad,
           (vi.precio_unitario - coalesce(vi.descuento_unitario, 0)) * cb.cantidad as a,
           (retail.fn_dueno_de_la_linea(vi.id) = v_claure) as vieja_es_claure,
           coalesce((select sum(case when vp.metodo in ('yape', 'plin', 'tarjeta', 'transferencia', 'qr') then vp.monto else 0 end) / nullif(sum(vp.monto), 0)
                       from retail.venta_pagos vp where vp.venta_id = vi.venta_id), 0) as nc
      from retail.cambios cb
      join sedes s on s.ubicacion_id = cb.ubicacion_id
      join retail.venta_items vi on vi.id = cb.venta_item_id
     where (cb.created_at at time zone 'America/Lima')::date between greatest(p_desde, v_desde) and p_hasta
  ),
  nueva as (
    -- Lo que la clienta se llevó, prenda por prenda: de quién era (el dueño de su movimiento) y a qué precio; la plata se reparte entre los dueños a lo que valga cada una.
    select b.cambio_id,
           coalesce(sum(m.cantidad * coalesce(sl.precio_unitario, (b.a + b.d) / nullif(b.cantidad, 0))) filter (where m.empresa_id = v_claure), 0) as v_claure,
           coalesce(sum(m.cantidad * coalesce(sl.precio_unitario, (b.a + b.d) / nullif(b.cantidad, 0))), 0) as v_total
      from base b
      join retail.movimientos m on m.cambio_id = b.cambio_id and m.tipo = 'salida'
      left join lateral (select s2.precio_unitario from retail.cambio_salidas s2 where s2.cambio_id = b.cambio_id and s2.variante_id = m.variante_id limit 1) sl on true
     group by b.cambio_id
  ),
  calc as (
    select b.*,
           case when coalesce(n.v_total, 0) > 0 then n.v_claure / n.v_total else 0 end as parte_nueva,
           b.a * b.nc as a_cuentas,
           -- La diferencia solo cuenta si se cobró o se devolvió en una cuenta de CAYLA (el efectivo lo tiene Claudia).
           case when b.medio in ('yape', 'plin', 'tarjeta', 'transferencia', 'qr')
                     and (b.cuenta_id is null or exists (select 1 from retail.cuentas_dinero cd where cd.id = b.cuenta_id and cd.empresa_id = v_casa))
                then b.d else 0 end as d_cuentas
      from base b left join nueva n on n.cambio_id = b.cambio_id
  ),
  calculo as (
    select c.*, round(c.parte_nueva * (c.a_cuentas + c.d_cuentas) - case when c.vieja_es_claure then c.a_cuentas else 0 end, 2) as delta
      from calc c
  )
  select k.cambio_id, k.fecha, k.ubicacion_id, k.medio, k.cuenta_id, k.delta,
         round(k.delta - k.delta / (1 + retail.fn_tasa_igv(k.fecha)), 2),
         k.delta - round(k.delta - k.delta / (1 + retail.fn_tasa_igv(k.fecha)), 2)
    from calculo k
   where k.delta <> 0;
end $$;

comment on function retail.fn_claure_cambios(date, date, uuid[]) is
  'ADR-0560 (interna): lo que cada cambio de una sede donde opera CLAURE le suma (+) o le resta (−) a lo que se le debe a Claudia, con su IGV y su base: la plata sigue a la prenda que se lleva la clienta. El efectivo no cuenta.';
revoke all on function retail.fn_claure_cambios(date, date, uuid[]) from public, anon, authenticated;

-- ---------- 2. La pestaña CLAURE y el saldo: los cambios cuentan (antes «por revisar») ----------
select pg_temp.reemplazar('retail.fn_claure_filas(uuid[])',
$v$  select k.fecha, 'cambio'::text, k.medio, k.cuenta_id, cd.nombre, k.ubicacion_id, 1, k.monto, null::numeric, null::numeric, false
    from cambiados k left join retail.cuentas_dinero cd on cd.id = k.cuenta_id$v$,
$n$  select k.fecha, 'cambio'::text, coalesce(k.medio, 'cambio'), k.cuenta_id, cd.nombre, k.ubicacion_id, count(*)::integer, sum(k.delta), sum(k.igv), 0::numeric, true
    from retail.fn_claure_cambios(v_desde, date '2100-01-01', v_ubics) k left join retail.cuentas_dinero cd on cd.id = k.cuenta_id
   group by k.fecha, coalesce(k.medio, 'cambio'), k.cuenta_id, cd.nombre, k.ubicacion_id$n$,
1);

-- ---------- 3. El aviso del cierre: un cambio que sube lo que se le debe es cobrado; uno que lo baja, devuelto ----------
select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$coalesce(sum(f.monto) filter (where f.origen = 'venta' and f.contado), 0),$v$,
$n$coalesce(sum(f.monto) filter (where (f.origen = 'venta' or (f.origen = 'cambio' and f.monto > 0)) and f.contado), 0),$n$,
1);
select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$coalesce(-sum(f.monto) filter (where f.origen = 'devolucion' and f.contado), 0),$v$,
$n$coalesce(-sum(f.monto) filter (where (f.origen = 'devolucion' or (f.origen = 'cambio' and f.monto < 0)) and f.contado), 0),$n$,
1);
select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$coalesce(sum(f.monto) filter (where f.origen = 'venta' and f.contado and f.fecha = v_fecha), 0),$v$,
$n$coalesce(sum(f.monto) filter (where (f.origen = 'venta' or (f.origen = 'cambio' and f.monto > 0)) and f.contado and f.fecha = v_fecha), 0),$n$,
1);
select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$coalesce(-sum(f.monto) filter (where f.origen = 'devolucion' and f.contado and f.fecha = v_fecha), 0),$v$,
$n$coalesce(-sum(f.monto) filter (where (f.origen = 'devolucion' or (f.origen = 'cambio' and f.monto < 0)) and f.contado and f.fecha = v_fecha), 0),$n$,
1);

-- ---------- 4. El Diario: la plata cambia de dueño entre las ventas de CAYLA (7011) y lo que se le debe (479) ----------
select pg_temp.reemplazar('retail.fn_asientos_claure(date, date, boolean, uuid[])',
$v$    from retail.fn_claure_gastos_base(p_desde, p_hasta, p_todo, p_ubics) g where g.parte_base > 0;$v$,
$n$    from retail.fn_claure_gastos_base(p_desde, p_hasta, p_todo, p_ubics) g where g.parte_base > 0
  -- Un CAMBIO con prendas de CLAURE: la plata sigue a la prenda que se lleva la clienta. Si lo que se le debe a Claudia sube, esa plata sale de las ventas de CAYLA (7011 al debe, 479 al haber);
  -- si baja, vuelve a las ventas de CAYLA. Solo la parte sin IGV (el IGV de la boleta sigue siendo de CAYLA).
  union all
  select k.fecha, k.ubicacion_id, 'claure_cambio:' || k.cambio_id, 'claure_cambio', '7011', k.base, 0::numeric, 'cambios', k.cambio_id, 'La plata de un cambio pasa a ser de CLAURE'
    from retail.fn_claure_cambios(p_desde, p_hasta, case when p_todo then array(select es.ubicacion_id from retail.empresa_sedes es) else p_ubics end) k where k.base > 0
  union all
  select k.fecha, k.ubicacion_id, 'claure_cambio:' || k.cambio_id, 'claure_cambio', '479', 0::numeric, k.base, 'cambios', k.cambio_id, 'Se le debe a CLAURE por un cambio (sin IGV)'
    from retail.fn_claure_cambios(p_desde, p_hasta, case when p_todo then array(select es.ubicacion_id from retail.empresa_sedes es) else p_ubics end) k where k.base > 0
  union all
  select k.fecha, k.ubicacion_id, 'claure_cambio:' || k.cambio_id, 'claure_cambio', '479', -k.base, 0::numeric, 'cambios', k.cambio_id, 'Un cambio le devuelve a CAYLA lo que se le debía a CLAURE'
    from retail.fn_claure_cambios(p_desde, p_hasta, case when p_todo then array(select es.ubicacion_id from retail.empresa_sedes es) else p_ubics end) k where k.base < 0
  union all
  select k.fecha, k.ubicacion_id, 'claure_cambio:' || k.cambio_id, 'claure_cambio', '7011', 0::numeric, -k.base, 'cambios', k.cambio_id, 'La plata de un cambio vuelve a ser de CAYLA'
    from retail.fn_claure_cambios(p_desde, p_hasta, case when p_todo then array(select es.ubicacion_id from retail.empresa_sedes es) else p_ubics end) k where k.base < 0;$n$,
1);

do $$
begin
  if position('fn_claure_cambios' in pg_get_functiondef('retail.fn_claure_filas(uuid[])'::regprocedure)) = 0
     or position('fn_claure_cambios' in pg_get_functiondef('retail.fn_asientos_claure(date, date, boolean, uuid[])'::regprocedure)) = 0
     or position('f.origen = ''cambio'' and f.monto > 0' in pg_get_functiondef('retail.fn_claure_cierre(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: los cambios con prendas de CLAURE no quedaron en la cuenta, el cierre y el Diario';
  end if;
end $$;

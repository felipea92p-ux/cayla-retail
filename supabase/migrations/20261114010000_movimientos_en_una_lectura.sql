-- ============================================================================
-- 20261114010000 — «Movimientos» del Resumen en una sola lectura (ADR-0661, actualización 2026-11-14)
--
-- EL PROBLEMA PRIMERO. «Movimientos» (Finanzas ▸ Resumen, camino A) pide `fn_flujo_caja_real(d, d)` una vez por cada uno de los últimos seis
-- días: 6 llamadas por carga, ~0,63 s cada una en producción (medido el 2026-11-14). Cada llamada pide los saldos de todas las cuentas TRES veces
-- (`fn_cuentas_dinero_saldos`: el disponible del día anterior, el del día y lo que vuelve a los fondos): 18 lecturas de saldos para 7 fechas
-- distintas. En una base de 2 núcleos compartidos, es trabajo que otra pantalla no tiene.
--
-- LO QUE CAMBIA. La regla no se toca: `fn_flujo_caja_real` pasa a ser el envoltorio de `fn_flujo_caja_real_de`, que es su MISMO cuerpo (copiado
-- de la definición viva) con un solo cambio: acepta los saldos ya leídos (el disponible de antes, el de después y lo que vuelve a los fondos) y si
-- no vienen, los lee como siempre. Nace `fn_flujo_caja_real_dias(p_dias)`: lee los saldos UNA vez por fecha y devuelve, día por día, exactamente
-- lo que daría `fn_flujo_caja_real(d, d)`. Las líneas de cada día se siguen leyendo día por día (`fn_flujo_lineas` depende de su corte: juntarlas
-- no sería lo mismo). `fn_flujo_caja_real_de` no la puede llamar nadie de afuera.
--
-- LA REGLA EN DOS LUGARES. El disponible y lo que vuelve a los fondos son las sumas de `fn_flujo_disponible` y `fn_flujo_por_volver` sobre los
-- saldos de una fecha; aquí se suman sobre los saldos ya leídos. Si una de esas dos cambia, cambia esto: `pnpm pruebas:flujo-real-dias` exige
-- que cada día sea igual a `fn_flujo_caja_real(d, d)`, y falla si dejan de coincidir.
--
-- IDÉNTICO. md5 de `fn_flujo_caja_real` antes y después en varios tramos, y cada día de la lectura nueva igual al de la llamada sola.
--
-- ANTES DE PEGAR. Una sola parte, sin políticas, sin `alter table`, sin `drop`: tres `create or replace function` con sus permisos. Frena sin cambiar
-- nada si `fn_flujo_caja_real` no es la de main (ni ya el envoltorio). Se puede pegar dos veces. La web funciona antes y después (sin la lectura
-- nueva, pide día por día como hoy). Termina con «QUEDÓ BIEN».
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. El candado.
do $candado$
declare
  v_md5 text;
begin
  v_md5 := (select md5(p.prosrc) from pg_proc p where p.oid = 'retail.fn_flujo_caja_real(date,date)'::regprocedure);
  if v_md5 not in ('32d499d056c3c1dffa682db43e79ad72', 'a712aedbe4765509eefc64a087534e32') then
    raise exception '20261114010000: fn_flujo_caja_real cambió (md5 %; se esperaba 32d499d0… de main). No se cambió nada.', v_md5;
  end if;
  v_md5 := (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_flujo_caja_real_de');
  if v_md5 is not null and v_md5 <> 'db63bbd2029a37946d33fe36cff50b28' then
    raise exception '20261114010000: fn_flujo_caja_real_de ya existe con otro cuerpo (md5 %). No se cambió nada.', v_md5;
  end if;
  v_md5 := (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_flujo_caja_real_dias');
  if v_md5 is not null and v_md5 <> 'bb2bde4d9566dac1e09a4ce6fc1e3c78' then
    raise exception '20261114010000: fn_flujo_caja_real_dias ya existe con otro cuerpo (md5 %). No se cambió nada.', v_md5;
  end if;
end
$candado$;

-- 2. Lo que entró y salió de un tramo: el cuerpo de siempre, con los saldos que le pasen.
create or replace function retail.fn_flujo_caja_real_de(p_desde date, p_hasta date, p_inicial numeric, p_final numeric, p_por_volver numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_hasta date := least(coalesce(p_hasta, retail.fn_hoy_lima()), retail.fn_hoy_lima());
  v_inicial numeric;
  v_final numeric;
  v_out jsonb;
begin
  perform retail.fn_exigir_estados_financieros_de_todo();
  if p_desde is null or p_desde > v_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = 'P0001';
  end if;
  if v_hasta - p_desde > 366 then
    raise exception 'El flujo se mira de a un año como máximo.' using errcode = 'P0001';
  end if;
  -- 20261114010000: si quien llama ya tiene los saldos de esos días (Movimientos pide varios días de una vez), los usa; si no, los pide.
  v_inicial := coalesce(p_inicial, retail.fn_flujo_disponible(p_desde - 1));
  v_final := coalesce(p_final, retail.fn_flujo_disponible(v_hasta));

  with
  lineas as materialized (
    select l.fecha, l.categoria, l.monto, l.con_cuenta, retail.fn_flujo_lado(l.categoria) as lado
      from retail.fn_flujo_lineas(p_desde, v_hasta) l
  ),
  tot as (
    select coalesce(sum(l.monto) filter (where l.con_cuenta and l.lado = 'entra'), 0) as entro,
           coalesce(-sum(l.monto) filter (where l.con_cuenta and l.lado = 'sale'), 0) as salio,
           coalesce(sum(l.monto) filter (where l.con_cuenta and l.lado = 'ajuste'), 0) as ajustes
      from lineas l
  ),
  cat as (
    select l.categoria, l.lado, sum(l.monto) as neto from lineas l where l.con_cuenta group by l.categoria, l.lado
  ),
  bloques as (
    select b.i, greatest(v_hasta - 7 * b.i - 6, p_desde) as desde, v_hasta - 7 * b.i as hasta
      from generate_series(0, (v_hasta - p_desde) / 7) b(i)
  ),
  semanas as (
    select b.desde, b.hasta,
           coalesce(sum(l.monto) filter (where l.lado = 'entra'), 0) as entro,
           coalesce(-sum(l.monto) filter (where l.lado = 'sale'), 0) as salio,
           coalesce(sum(l.monto) filter (where l.lado = 'ajuste'), 0) as ajustes
      from bloques b
      left join lineas l on l.con_cuenta and l.fecha between b.desde and b.hasta
     group by b.desde, b.hasta
  ),
  semanas_saldo as (
    select s.*, v_inicial + sum(s.entro - s.salio + s.ajustes) over (order by s.desde) as saldo from semanas s
  ),
  sin as (
    select l.categoria, count(*)::integer as n, sum(l.monto) as monto from lineas l where not l.con_cuenta group by l.categoria
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', v_hasta, 'hoy', v_hoy,
    'saldo_inicial', v_inicial, 'saldo_final', v_final, 'por_volver_compras', coalesce(p_por_volver, retail.fn_flujo_por_volver(v_hasta)),
    'entro', t.entro, 'salio', t.salio, 'ajustes', t.ajustes,
    'descuadre', round(v_final - (v_inicial + t.entro - t.salio + t.ajustes), 2),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('clave', c.categoria, 'lado', c.lado,
                                                               'monto', case c.lado when 'sale' then -c.neto else c.neto end)
                                             order by c.lado, abs(c.neto) desc, c.categoria)
                              from cat c where c.neto <> 0), '[]'::jsonb),
    'semanas', coalesce((select jsonb_agg(jsonb_build_object('desde', s.desde, 'hasta', s.hasta, 'entro', s.entro, 'salio', s.salio,
                                                            'ajustes', s.ajustes, 'saldo', s.saldo)
                                          order by s.desde)
                           from semanas_saldo s), '[]'::jsonb),
    'sin_cuenta', coalesce((select jsonb_agg(jsonb_build_object('origen', x.categoria, 'n', x.n, 'monto', x.monto) order by x.categoria)
                              from sin x), '[]'::jsonb),
    'arranques', retail.fn_flujo_antes_del_arranque(p_desde, v_hasta),
    'planilla_visible', retail.fn_flujo_planilla_visible(),
    'planilla', coalesce((select jsonb_agg(jsonb_build_object('nombre', p.nombre, 'fecha_fin', p.fecha_fin, 'pagado', p.pagado)
                                           order by p.fecha_fin, p.nombre)
                            from retail.fn_flujo_planilla_pagada() p where p.fecha_fin between greatest(p_desde, coalesce(retail.fn_finanzas_desde(), p_desde)) and v_hasta), '[]'::jsonb)
  ) into v_out
  from tot t;
  return v_out;
end $$;

revoke all on function retail.fn_flujo_caja_real_de(date, date, numeric, numeric, numeric) from public, anon, authenticated;

create or replace function retail.fn_flujo_caja_real(p_desde date, p_hasta date default null)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_flujo_caja_real_de(p_desde, p_hasta, null, null, null)
$$;

-- 3. Varios días de una vez (los de «Movimientos»): `{ "AAAA-MM-DD": fn_flujo_caja_real(d, d), … }`, con los saldos leídos una vez por fecha.
create or replace function retail.fn_flujo_caja_real_dias(p_dias date[])
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_out jsonb;
begin
  perform retail.fn_exigir_estados_financieros_de_todo();
  if p_dias is null or cardinality(p_dias) = 0 or cardinality(p_dias) > 31 or array_position(p_dias, null) is not null then
    raise exception 'Los días del flujo no son válidos: de 1 a 31, sin vacíos.' using errcode = 'P0001';
  end if;
  -- Los saldos de todas las cuentas, UNA vez por fecha: el día anterior a cada día y el día mismo. De ellos salen, con las mismas sumas de
  -- `fn_flujo_disponible` (todo menos la tarjeta de crédito) y `fn_flujo_por_volver` (los fondos sin archivar, lo que tienen a favor), los tres
  -- saldos de cada día. Cada día se arma con `fn_flujo_caja_real_de`: el mismo cuerpo de `fn_flujo_caja_real`, con sus validaciones.
  with
  dias as (select distinct d from unnest(p_dias) d),
  fechas as (select distinct x.f from dias, lateral (values (dias.d - 1), (dias.d)) x(f)),
  saldos as materialized (
    select f.f, s.tipo, s.saldo, s.archivada
      from fechas f
     cross join lateral retail.fn_cuentas_dinero_saldos(f.f, null) s
  ),
  por_fecha as (
    select f.f,
           coalesce((select sum(s.saldo) from saldos s where s.f = f.f and s.tipo <> 'tarjeta_credito'), 0) as disponible,
           coalesce((select sum(greatest(s.saldo, 0)) from saldos s
                      where s.f = f.f and s.tipo = 'fondo' and not s.archivada and s.saldo is not null), 0) as por_volver
      from fechas f
  )
  select jsonb_object_agg(d.d::text, retail.fn_flujo_caja_real_de(d.d, d.d, antes.disponible, ese.disponible, ese.por_volver))
    into v_out
    from dias d
    join por_fecha antes on antes.f = d.d - 1
    join por_fecha ese on ese.f = d.d;
  return v_out;
end
$$;

revoke all on function retail.fn_flujo_caja_real_dias(date[]) from public, anon;
grant execute on function retail.fn_flujo_caja_real_dias(date[]) to authenticated;

-- 4. Comprobar.
do $comprobar$
begin
  if (select md5(prosrc) from pg_proc where oid = 'retail.fn_flujo_caja_real(date,date)'::regprocedure) <> 'a712aedbe4765509eefc64a087534e32'
     or (select md5(prosrc) from pg_proc where oid = 'retail.fn_flujo_caja_real_de(date,date,numeric,numeric,numeric)'::regprocedure) <> 'db63bbd2029a37946d33fe36cff50b28'
     or (select md5(prosrc) from pg_proc where oid = 'retail.fn_flujo_caja_real_dias(date[])'::regprocedure) <> 'bb2bde4d9566dac1e09a4ce6fc1e3c78' then
    raise exception '20261114010000: las funciones no quedaron como dice esta migración.';
  end if;
  if has_function_privilege('authenticated', 'retail.fn_flujo_caja_real_de(date,date,numeric,numeric,numeric)', 'execute')
     or has_function_privilege('anon', 'retail.fn_flujo_caja_real_dias(date[])', 'execute')
     or not has_function_privilege('authenticated', 'retail.fn_flujo_caja_real_dias(date[])', 'execute')
     or not has_function_privilege('authenticated', 'retail.fn_flujo_caja_real(date,date)', 'execute') then
    raise exception '20261114010000: los permisos no quedaron como dice esta migración.';
  end if;
end
$comprobar$;

select '20261114010000 · QUEDÓ BIEN: Movimientos se lee de una vez' as resultado;

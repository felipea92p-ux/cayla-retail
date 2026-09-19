-- ============================================================================
-- Por pagar: la deuda por antigüedad, las salidas de caja y los subtotales
-- reales de la lista (ADR-0111, sección «Lectura»)
--
-- EL PROBLEMA. La pantalla de Por pagar agrupa la lista por «Vencidas / Vencen
-- esta semana / Más adelante» y suma cada grupo desde las filas de la PÁGINA en
-- pantalla: con 50 filas por página, el subtotal miente en cuanto hay más de 50
-- comprobantes (mismo defecto que ya se corrigió con `por_vencer` en
-- 20260914210000). Y no responde las dos preguntas de caja que Felipe hace antes
-- de pagar: ¿cuánto de la deuda es antigua? y ¿cuánto sale de caja cada semana?
--
-- LA DECISIÓN. Tres funciones de lectura, sumas y conteos en Postgres sobre TODA
-- la deuda (no sobre la página), todas con el mismo universo: comprobantes
-- VIGENTES con `saldo > 0`, acotados por sede como `resumen_compras` (ADR-0075).
-- Como `security definer` se salta la RLS de `compras`, el candado se repite a
-- mano en cada función.
--
--   · deuda_por_vencimiento(): 4 tramos por antigüedad del vencimiento.
--   · salidas_caja_30d(): 6 cubetas — Vencido, 4 semanas desde hoy, Después.
--   · por_pagar_tramos(...): los 3 grupos de la lista con su subtotal real y los
--     MISMOS filtros que `listar_compras`, para que el subtotal cuadre con las
--     filas que la pantalla muestra al filtrar.
--
-- «HOY» ES `fn_hoy_lima()`, nunca `current_date` (UTC): entre 7 pm y medianoche de
-- Lima, un comprobante que vence hoy no puede salir como vencido.
--
-- INVARIANTE (lo prueba scripts/pruebas/compras_indicadores.mjs): la suma de los
-- 4 tramos = la suma de las 6 cubetas = `resumen_compras().deuda`. Cada
-- comprobante cae en exactamente un tramo, sin huecos: por eso un comprobante con
-- saldo y SIN fecha de vencimiento (un contado impago — la base hoy no lo permite:
-- `registrar_compra` exige el pago completo al contado) se cuenta como «vence
-- hoy», el caso más prudente para la caja. Nunca se descarta en silencio.
--
-- D2 (notas de crédito, cierres de línea) baja `saldo` por debajo; estas
-- funciones solo leen `saldo` y siguen correctas sin tocarlas.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. deuda por antigüedad ====================
-- Siempre 4 filas (aunque un tramo esté en cero), en este orden:
--   vencida  → vencimiento anterior a hoy
--   0_7      → vence entre hoy y hoy + 7 (igual que `por_vencer` de resumen_compras)
--   8_30     → vence entre hoy + 8 y hoy + 30
--   mas_30   → vence después de hoy + 30
create or replace function retail.deuda_por_vencimiento()
returns table (tramo text, comprobantes integer, monto numeric)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  with h as (select fn_hoy_lima() as hoy),
  deuda as (
    select c.id, c.saldo,
      case
        when c.fecha_vencimiento < h.hoy then 'vencida'
        when coalesce(c.fecha_vencimiento, h.hoy) <= h.hoy + 7 then '0_7'
        when c.fecha_vencimiento <= h.hoy + 30 then '8_30'
        else 'mas_30'
      end as tramo_calculado
    from compras c
    cross join h
    where c.estado = 'vigente' and c.saldo > 0
      and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  )
  select t.nombre, count(d.id)::integer, coalesce(sum(d.saldo), 0)::numeric
  from (values (1, 'vencida'), (2, '0_7'), (3, '8_30'), (4, 'mas_30')) as t(orden, nombre)
  left join deuda d on d.tramo_calculado = t.nombre
  where auth.uid() is not null
  group by t.orden, t.nombre
  order by t.orden;
$$;

comment on function retail.deuda_por_vencimiento() is
  'Deuda (comprobantes vigentes con saldo > 0) en 4 tramos por vencimiento: vencida, 0_7, 8_30, mas_30. Siempre 4 filas. "Hoy" = fn_hoy_lima(). Acotada por sede. ADR-0111.';

revoke all on function retail.deuda_por_vencimiento() from public, anon;
grant execute on function retail.deuda_por_vencimiento() to authenticated;

-- ==================== 2. salidas de caja, semana a semana ====================
-- 6 filas: 0 Vencido (todo lo anterior a hoy) · 1..4 semanas de 7 días que
-- arrancan HOY (no el lunes: la caja se planea desde el día en que se mira) ·
-- 5 Después (desde hoy + 28). `etiqueta` viene armada en español ("18–24 sep",
-- "25 sep–1 oct") para que no dependa del locale de Postgres; `desde`/`hasta`
-- son los bordes inclusivos (NULL = sin borde) para filtrar la lista al tocar.
create or replace function retail.salidas_caja_30d()
returns table (
  orden integer, etiqueta text, desde date, hasta date,
  comprobantes integer, monto numeric, es_vencido boolean
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  with h as (select fn_hoy_lima() as hoy),
  meses as (select array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'] as abrev),
  cubetas as (
    select 0 as orden, 'Vencido'::text as etiqueta, null::date as desde, (h.hoy - 1) as hasta, true as es_vencido
    from h
    union all
    select g,
      case
        when extract(month from h.hoy + 7 * (g - 1)) = extract(month from h.hoy + 7 * g - 1)
          then extract(day from h.hoy + 7 * (g - 1))::integer || '–' || extract(day from h.hoy + 7 * g - 1)::integer
               || ' ' || m.abrev[extract(month from h.hoy + 7 * g - 1)::integer]
        else extract(day from h.hoy + 7 * (g - 1))::integer || ' ' || m.abrev[extract(month from h.hoy + 7 * (g - 1))::integer]
               || '–' || extract(day from h.hoy + 7 * g - 1)::integer || ' ' || m.abrev[extract(month from h.hoy + 7 * g - 1)::integer]
      end,
      h.hoy + 7 * (g - 1), h.hoy + 7 * g - 1, false
    from h cross join meses m cross join generate_series(1, 4) as g
    union all
    select 5, 'Después', h.hoy + 28, null::date, false from h
  ),
  deuda as (
    select c.id, c.saldo, coalesce(c.fecha_vencimiento, h.hoy) as vence
    from compras c
    cross join h
    where c.estado = 'vigente' and c.saldo > 0
      and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  )
  select cu.orden, cu.etiqueta, cu.desde, cu.hasta,
         count(d.id)::integer, coalesce(sum(d.saldo), 0)::numeric, cu.es_vencido
  from cubetas cu
  left join deuda d
    on (cu.desde is null or d.vence >= cu.desde)
   and (cu.hasta is null or d.vence <= cu.hasta)
  where auth.uid() is not null
  group by cu.orden, cu.etiqueta, cu.desde, cu.hasta, cu.es_vencido
  order by cu.orden;
$$;

comment on function retail.salidas_caja_30d() is
  'Salidas de caja: 6 cubetas (Vencido, 4 semanas de 7 días desde hoy, Después) con comprobantes y monto de saldo. La suma de las 6 = deuda total. "Hoy" = fn_hoy_lima(). Acotada por sede. ADR-0111.';

revoke all on function retail.salidas_caja_30d() from public, anon;
grant execute on function retail.salidas_caja_30d() to authenticated;

-- ==================== 3. subtotales reales de la lista de Por pagar ====================
-- 3 filas fijas: vencidas · semana (vence entre hoy y hoy + 7) · despues. Mismos
-- filtros y misma semántica que `listar_compras` (búsqueda por documento o por
-- nombre de proveedor, condición, solo vencidas), siempre sobre «vigentes con
-- saldo» (lo que la lista de Por pagar pide con `p_con_saldo`).
-- plpgsql, no sql: el proveedor que coincide con la búsqueda se resuelve ANTES a
-- un arreglo, igual que `listar_compras`, para que el OR sea entre dos
-- condiciones simples sobre `compras`.
create or replace function retail.por_pagar_tramos(
  p_proveedor_id uuid default null,
  p_condicion text default null,
  p_solo_vencidas boolean default false,
  p_busqueda text default null
)
returns table (tramo text, comprobantes integer, saldo numeric)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := fn_hoy_lima();
  v_busqueda text := nullif(trim(p_busqueda), '');
  v_proveedores uuid[];
begin
  if auth.uid() is null then
    return;
  end if;
  if v_busqueda is not null then
    select coalesce(array_agg(pr.id), '{}') into v_proveedores
    from proveedores pr where pr.nombre ilike '%' || v_busqueda || '%';
  end if;

  return query
    select t.nombre, count(d.id)::integer, coalesce(sum(d.saldo_comprobante), 0)::numeric
    from (values (1, 'vencidas'), (2, 'semana'), (3, 'despues')) as t(orden, nombre)
    left join (
      select c.id, c.saldo as saldo_comprobante,
        case
          when c.fecha_vencimiento < v_hoy then 'vencidas'
          when coalesce(c.fecha_vencimiento, v_hoy) <= v_hoy + 7 then 'semana'
          else 'despues'
        end as tramo_calculado
      from compras c
      where c.estado = 'vigente' and c.saldo > 0
        and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
        and (p_proveedor_id is null or c.proveedor_id = p_proveedor_id)
        and (p_condicion is null or c.condicion = p_condicion)
        and (not p_solo_vencidas or c.fecha_vencimiento < v_hoy)
        and (v_busqueda is null or c.documento ilike '%' || v_busqueda || '%' or c.proveedor_id = any(v_proveedores))
    ) d on d.tramo_calculado = t.nombre
    group by t.orden, t.nombre
    order by t.orden;
end;
$$;

comment on function retail.por_pagar_tramos(uuid, text, boolean, text) is
  'Subtotal real (toda la deuda filtrada, no la página) de los 3 grupos de Por pagar: vencidas, semana, despues. Mismos filtros que listar_compras. Siempre 3 filas. "Hoy" = fn_hoy_lima(). Acotada por sede. ADR-0111.';

revoke all on function retail.por_pagar_tramos(uuid, text, boolean, text) from public, anon;
grant execute on function retail.por_pagar_tramos(uuid, text, boolean, text) to authenticated;

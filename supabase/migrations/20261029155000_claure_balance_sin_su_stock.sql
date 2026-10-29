-- ============================================================================
-- 20261029155000 — El Balance no cuenta la mercadería de CLAURE como inventario de CAYLA (ADR-0560; actividad 15)
--
-- EL PROBLEMA PRIMERO. En Tienda Lima hay prendas de CLAURE (la empresa de Claudia) en los mismos estantes que las de CAYLA. El Balance valora la mercadería (`fn_bal_stock`) con el stock de la
-- tienda, sin mirar de quién es: la ropa de Claudia entraba al inventario de CAYLA como si fuera un activo suyo. Felipe (2026-10-29): «sacar el stock de CLAURE del inventario».
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `fn_bal_stock(corte)` resta de la mercadería de cada sede donde opera CLAURE las unidades que son de CLAURE AL CORTE (lo que hay hoy en `stock_dueno`, deshaciendo lo que se movió
--            después con su dueño: la misma forma en que ya devuelve el stock a una fecha pasada) y las valora igual que al resto (el costo cargado de la prenda; sin costo, no resta plata).
--            (2) `fn_bal_causas_mercaderia` no cuenta como causa los movimientos de CLAURE: el Balance ya no tiene su stock, así que no tiene que explicar sus entradas y salidas. Sin prendas
--            de CLAURE, las dos funciones devuelven EXACTAMENTE lo de antes.
--   ASUME:   `stock_dueno` trae el stock de la empresa que no es la casa por variante y sede (ADR-0542, INV-23), y `movimientos.empresa_id` el dueño de cada movimiento.
--   NO HACE: no cambia el Diario (la cuenta 201 nunca tuvo la mercadería de CLAURE: no la compra CAYLA), ninguna tabla ni ninguna otra función del Balance.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029154000 (crea `fn_movimiento_es_de_claure`). Tres reemplazos anclados sobre funciones vivas: ABORTAN SIN CAMBIAR NADA si el
-- texto no es el esperado y dicen cuál. Sin políticas ni `alter table`; idempotente. SE ROMPE SI: otra migración reescribe `fn_bal_stock` o `fn_bal_causas_mercaderia`.
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

-- ---------- 1. fn_bal_stock: el stock de CLAURE al corte se resta (tres CTE nuevos y una unión) ----------
select pg_temp.reemplazar('retail.fn_bal_stock(date)',
$v$  al_corte as ($v$,
$n$  -- CLAURE (ADR-0560, actividad 15): su mercadería no es un activo de CAYLA. Lo que había de ella al corte es lo que hay hoy en `stock_dueno` deshaciendo lo que se movió después con su dueño.
  claure_hoy as (
    select d.variante_id, d.ubicacion_id, d.cantidad::bigint as q
      from retail.stock_dueno d
      join retail.empresas e on e.id = d.empresa_id and e.clave = 'claure' and e.activo
      join retail.empresa_sedes es on es.empresa_id = e.id and es.ubicacion_id = d.ubicacion_id
  ),
  claure_despues as (
    select m.variante_id, m.ubicacion_id,
           -sum(case m.tipo when 'entrada' then m.cantidad when 'salida' then -m.cantidad when 'ajuste' then m.cantidad
                            when 'traslado' then -m.cantidad else 0 end)::bigint as q
      from retail.movimientos m cross join fin
     where m.created_at >= fin.t and m.tipo in ('entrada', 'salida', 'ajuste', 'traslado')
       and retail.fn_movimiento_es_de_claure(m.empresa_id, m.ubicacion_id, m.created_at)
     group by 1, 2
    union all
    select m.variante_id, m.ubicacion_destino_id, -sum(m.cantidad)::bigint
      from retail.movimientos m cross join fin
     where m.created_at >= fin.t and m.tipo = 'traslado'
       and retail.fn_movimiento_es_de_claure(m.empresa_id, m.ubicacion_destino_id, m.created_at)
     group by 1, 2
  ),
  claure_al_corte as (
    select x.variante_id, x.ubicacion_id, -sum(x.q) as q
      from (select * from claure_hoy union all select * from claure_despues) x
     where x.variante_id <> '22222222-2222-4222-8222-222222222222'
     group by 1, 2
    having sum(x.q) <> 0
  ),
  al_corte as ($n$,
1);

select pg_temp.reemplazar('retail.fn_bal_stock(date)',
$v$    from (select * from al_corte union all select * from anulado_web) a join retail.variantes v$v$,
$n$    from (select * from al_corte union all select * from anulado_web union all select * from claure_al_corte) a join retail.variantes v$n$,
1);

-- ---------- 2. fn_bal_causas_mercaderia: los movimientos de CLAURE no son causa ----------
select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date, date)',
$v$     where m.created_at >= lim.ini and m.created_at < lim.fin and m.tipo in ('entrada', 'salida', 'ajuste')$v$,
$n$     where m.created_at >= lim.ini and m.created_at < lim.fin and m.tipo in ('entrada', 'salida', 'ajuste')
       and not retail.fn_movimiento_es_de_claure(m.empresa_id, m.ubicacion_id, m.created_at)$n$,
1);

do $$
begin
  if position('claure_al_corte' in pg_get_functiondef('retail.fn_bal_stock(date)'::regprocedure)) = 0
     or position('fn_movimiento_es_de_claure' in pg_get_functiondef('retail.fn_bal_causas_mercaderia(date, date)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: el Balance no quedó sin el stock de CLAURE';
  end if;
end $$;

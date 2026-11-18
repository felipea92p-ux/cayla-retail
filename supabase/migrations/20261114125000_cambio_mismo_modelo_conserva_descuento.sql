-- ============================================================================
-- 20261114125000 — Cambiar la talla o el color de una prenda comprada con descuento no cobra el descuento otra vez (ADR-0655, Felipe 2026-11-14)
--
-- EL PROBLEMA. `registrar_cambio` mide la prenda nueva a precio de lista contra lo que se pagó por la devuelta (ADR-0380). Con el MISMO
--   modelo eso cobra el descuento de nuevo: un polo de S/ 49.90 que entró a un 3x2 a S/ 38.17 cobra S/ 11.73 por cambiarle la talla. El
--   ADR-0380 lo aceptó como consecuencia («si en tienda resulta molesto, el cambio es de una línea»); la maqueta de Campañas y ofertas
--   (decisión 7) dijo «diferencia S/ 0», y Felipe lo eligió el 2026-11-14: con el 3x2 cada prenda del grupo lleva su parte, así que el
--   caso deja de ser raro.
--
-- LO QUE HACE.
--   1. `fn_precio_mismo_modelo(línea, variante nueva, tienda)`: lo que vale la prenda nueva si es del MISMO modelo que la devuelta, o null.
--      Vale lo que se pagó por la devuelta (precio − descuento: 3x2, campaña, Club, a mano) más lo que la talla nueva cuesta de MÁS hoy en la
--      tienda de la compra (`fn_precio_para_cambio`, las dos). Nunca devuelve: si la talla nueva cuesta menos, no hay diferencia. Hoy solo 2
--      de 631 modelos tienen tallas de distinto precio.
--   2. `registrar_cambio`: la diferencia usa ese precio con el mismo modelo; con otro modelo, la regla de siempre (lista contra lo pagado).
--   3. `registrar_cambio_varias`: igual, en las unidades del mismo modelo hasta las que se devuelven, en el orden en que llegan.
--   La pantalla hace la misma cuenta (`precioMismoModelo`, `lib/cambio-reemplazo-reglas.ts`).
--
-- QUÉ NO HACE. No toca los cambios ya hechos (son movimientos de caja reales), ni la devolución, ni la nota de crédito.
-- SE ROMPE SI: alguien cambia esas líneas de `registrar_cambio` o `registrar_cambio_varias` antes de pegar esto: el ancla no aparece y se
--   detiene sin aplicar nada.
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s; solo funciones (ni políticas ni disparadores, ADR-0195).
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:cambio-mismo-modelo`.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.fn_precio_mismo_modelo(p_venta_item_id uuid, p_variante_nueva_id uuid, p_ubicacion_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  select (vi.precio_unitario - vi.descuento_unitario)
         + greatest(0, retail.fn_precio_para_cambio(vi.id, p_variante_nueva_id, p_ubicacion_id)
                       - coalesce(retail.fn_precio_para_cambio(vi.id, vi.variante_id, p_ubicacion_id), vi.precio_unitario))
    from retail.venta_items vi
    join retail.variantes vo on vo.id = vi.variante_id
    join retail.variantes vn on vn.id = p_variante_nueva_id
   where vi.id = p_venta_item_id
     and vn.producto_id = vo.producto_id;
$function$;

comment on function retail.fn_precio_mismo_modelo(uuid, uuid, uuid) is
  'ADR-0655 (Felipe 2026-11-14). Lo que vale en un cambio la prenda nueva si es del MISMO modelo que la devuelta: lo pagado por la devuelta más lo que la talla nueva cuesta de más hoy en la tienda de la compra (nunca menos). Null con otro modelo. La usan registrar_cambio y registrar_cambio_varias; la pantalla hace la misma cuenta (precioMismoModelo).';

revoke all on function retail.fn_precio_mismo_modelo(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function pg_temp.reemplazar_cambio_mismo_modelo(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_n integer;
begin
  if position(p_nuevo in v_def) > 0 then
    return; -- ya aplicado
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). No se aplicó nada.', p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 2. Un cambio de una por una.
select pg_temp.reemplazar_cambio_mismo_modelo(
  'retail.registrar_cambio(uuid, uuid, uuid, integer, text, uuid, text, text)',
  $v$  v_diferencia := (v_precio_nuevo - (v_item.precio_unitario - v_item.descuento_unitario)) * p_cantidad;$v$,
  $n$  -- ADR-0655 (Felipe 2026-11-14): el MISMO modelo conserva su descuento (fn_precio_mismo_modelo); otro modelo, lista contra lo pagado (ADR-0380).
  v_diferencia := (coalesce(retail.fn_precio_mismo_modelo(p_venta_item_id, p_variante_nueva_id, p_ubicacion_id), v_precio_nuevo)
                   - (v_item.precio_unitario - v_item.descuento_unitario)) * p_cantidad;$n$
);

-- 3. Una prenda por varias: las unidades del mismo modelo, hasta las que se devuelven.
select pg_temp.reemplazar_cambio_mismo_modelo(
  'retail.registrar_cambio_varias(uuid, uuid, jsonb, integer, text, uuid, text, text)',
  $v$  i integer;
begin$v$,
  $n$  i integer;
  v_mismo integer := p_cantidad; v_k integer; v_pm numeric;  -- ADR-0655: unidades del mismo modelo que aún conservan su descuento
begin$n$
);

select pg_temp.reemplazar_cambio_mismo_modelo(
  'retail.registrar_cambio_varias(uuid, uuid, jsonb, integer, text, uuid, text, text)',
  $v$    v_total_nuevo := v_total_nuevo + v_precio * v_cants[i];$v$,
  $n$    -- ADR-0655 (Felipe 2026-11-14): hasta las unidades que se devuelven, las del MISMO modelo conservan su descuento.
    v_pm := case when v_mismo > 0 then retail.fn_precio_mismo_modelo(p_venta_item_id, v_vars[i], p_ubicacion_id) end;
    v_k := case when v_pm is null then 0 else least(v_cants[i], v_mismo) end;
    v_mismo := v_mismo - v_k;
    v_total_nuevo := v_total_nuevo + coalesce(v_pm, 0) * v_k + v_precio * (v_cants[i] - v_k);$n$
);

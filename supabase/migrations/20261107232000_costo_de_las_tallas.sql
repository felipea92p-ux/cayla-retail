-- ============================================================================
-- 20261107232000_costo_de_las_tallas.sql — CAYLA V2 (Felipe, 2026-11-07; ADR-0631)
-- El porqué del costo de cada talla en Catálogo ▸ Editar producto ▸ Costos
--
-- EL PROBLEMA PRIMERO. El 7-nov llegó 1 Short Sohanna de cada color a S/ 48. En Catálogo, dos tallas quedaron en 48 y una en
-- 46.50, y las demás seguían en 45: parecía que el costo «salió distinto» en un color. La cuenta estaba bien —en Azul marino 30
-- quedaba 1 sin vender de la carga inicial a S/ 45, y (45 + 48) ÷ 2 = 46.50; en las otras dos ya no quedaba ninguna—, pero la
-- pantalla no lo decía: la celda gris solo explicaba «promedio ponderado» al pasar el mouse. La pestaña «Costo» del Historial
-- (`fn_costo_de_la_prenda`) cuenta las compras de la PRENDA entera; nadie le contaba a la ficha la de cada TALLA, y la web no
-- tenía cómo pedirla: `fn_costo_historial_efectivo` es interna (sin grant) y el costo solo se lee por funciones que preguntan
-- el permiso de dinero.
--
-- QUÉ PROMETE. `fn_costo_de_las_tallas(p_producto_id)` devuelve un jsonb, o null si la cuenta no ve el dinero de compras
-- (`fn_puede_ver_dinero_de_compras`, la misma regla de `fn_costo_de_la_prenda` y `fn_costos_variantes_json`):
--   { "<variante_id>": { fecha, origen, habia, costo_habia, llegaron, costo_llegaron, quedo }, … }
--   · Una clave por variante que tiene al menos una entrada con costo que cuenta HOY: la ÚLTIMA compra o cierre del Taller,
--     leída de `fn_costo_historial_efectivo` (con la corrección de ADR-0515 aplicada y sin los cierres revertidos, ADR-0614).
--     Una variante sin compras no aparece: su costo es el declarado.
--   · Si la variante llegó dos veces en esa misma compra (dos facturas), es UNA entrada: `habia` y `costo_habia` son los de
--     antes de la primera línea, `llegaron` la suma, `costo_llegaron` el promedio de lo que llegó y `quedo` lo que dejó la última.
--   · La cuenta cierra: habia × costo_habia + llegaron × costo_llegaron ≈ (habia + llegaron) × quedo (salvo el redondeo a
--     céntimos que ya hace `fn_recalcular_costo_variante`). Con `habia = 0`, `quedo` es el costo de lo que llegó.
--   ASUME: que `fn_costo_historial_efectivo` existe (20261026160000). No lee stock ni movimientos.
--   La web solo muestra la cuenta si `quedo` es el costo que la celda muestra; si no (algo lo movió después), dice el porqué
--   en palabras. Nunca afirma una cuenta que no da.
--
-- QUÉ NO HACE. No escribe nada ni cambia ninguna función existente. No da el costo de la prenda entera (eso es
-- `fn_costo_de_la_prenda`, que la ficha también lee) ni las compras anteriores a la última.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable (`create or replace`). Sin políticas ni `drop trigger`: ADR-0195 no aplica, no toma
-- candados de tablas en uso. Sin `select … into` dentro de comillas (ADR-0288). Pegar ANTES o DESPUÉS de publicar la web: la
-- web sin esta función sigue igual, solo que el «?» de cada talla gris explica en palabras en vez de dar la cuenta.
-- VERIFICACIÓN (solo lectura): select to_regprocedure('retail.fn_costo_de_las_tallas(uuid)') is not null;  → t
-- CÓMO SE DESHACE: drop function if exists retail.fn_costo_de_las_tallas(uuid);
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_costo_de_las_tallas(p_producto_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  with filas as (
    select e.created_at, e.variante_id, e.stock_previo, e.costo_anterior, e.cantidad_nueva, e.costo_unitario_nuevo,
           e.costo_resultante, e.origen
      from retail.fn_costo_historial_efectivo(p_producto_id) e
  ),
  -- La última compra o cierre de cada variante: lo escrito en la misma transacción comparte `created_at`.
  ultima as (
    select f.variante_id, max(f.created_at) as en from filas f group by f.variante_id
  ),
  -- Cada línea suma al stock antes de calcular la siguiente: la primera es la de menor `stock_previo` y la última, la de mayor
  -- (el mismo orden de `fn_costo_de_la_prenda`).
  por_variante as (
    select f.variante_id, u.en,
           (array_agg(f.origen order by f.stock_previo desc))[1] as origen,
           (array_agg(f.stock_previo order by f.stock_previo))[1] as habia,
           (array_agg(f.costo_anterior order by f.stock_previo))[1] as costo_habia,
           sum(f.cantidad_nueva) as llegaron,
           round(sum(f.cantidad_nueva * f.costo_unitario_nuevo) / nullif(sum(f.cantidad_nueva), 0), 2) as costo_llegaron,
           (array_agg(f.costo_resultante order by f.stock_previo desc))[1] as quedo
      from filas f
      join ultima u on u.variante_id = f.variante_id and u.en = f.created_at
     group by f.variante_id, u.en
  )
  select case when retail.fn_puede_ver_dinero_de_compras() then
    coalesce((select jsonb_object_agg(p.variante_id::text, jsonb_build_object(
        'fecha', p.en, 'origen', p.origen, 'habia', p.habia, 'costo_habia', p.costo_habia,
        'llegaron', p.llegaron, 'costo_llegaron', p.costo_llegaron, 'quedo', p.quedo))
      from por_variante p), '{}'::jsonb)
  end;
$$;

revoke all on function retail.fn_costo_de_las_tallas(uuid) from public, anon;
grant execute on function retail.fn_costo_de_las_tallas(uuid) to authenticated;

comment on function retail.fn_costo_de_las_tallas(uuid) is
  'ADR-0631: por variante de la prenda, la última compra o cierre del Taller que cuenta hoy (lo que había y a cuánto, lo que llegó y a cuánto, en cuánto quedó). Lo lee el «?» de cada talla gris en Catálogo ▸ Costos. Null si la cuenta no ve el dinero de compras.';

reset lock_timeout;

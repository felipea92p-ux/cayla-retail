-- Línea base de «Combina bien con» (Felipe, 2026-10-10): cuánto se vende junto HOY, antes de que la caja sugiera prendas.
-- Solo lectura. Se pega en el SQL Editor de producción (el schema es `retail`) o se corre contra el Postgres local.
-- Se repite a las 4 semanas de tener la sugerencia en Vender: es el único «antes/después» que no exige escribir nada.
--
-- Medido el 2026-10-10 (446 ventas completadas, todas desde el 2026-09-30):
--   tickets con 2+ líneas: 187 (42 %) · con 2+ categorías distintas: 165 (37 %) · TRU 76 de 296 (26 %) · AQP 89 de 150 (59 %) · LIM 0.
--   Pares de categorías más vendidos juntos: Bolsos y Carteras + Camisas y Blusas 17 · Polos + Camisas y Blusas 13 (sustitutos) ·
--   Pantalones + Camisas y Blusas 11 · Anillos + Camisas y Blusas 8 · Tops + Bolsos 8.
-- La categoría y el color de una línea «sin registrar» salen de `prendas_por_regularizar` (NOT NULL, ADR-0179): las 791 líneas cuentan.

-- 1. Por sede: cuántos tickets llevan dos o más categorías distintas (la canasta que la sugerencia quiere mover).
with lineas as (
  select v.id as venta_id, u.nombre as sede,
         coalesce(p.categoria_id, r.categoria_id) as categoria_id
  from retail.ventas v
  join retail.ubicaciones u on u.id = v.ubicacion_id
  join retail.venta_items i on i.venta_id = v.id
  left join retail.variantes va on va.id = i.variante_id
  left join retail.productos p on p.id = va.producto_id and p.referencia not ilike '%sin registrar%'
  left join retail.prendas_por_regularizar r on r.venta_item_id = i.id
  where v.estado = 'completada' and not v.es_prueba and v.created_at >= now() - interval '90 days'
),
por_ticket as (
  select sede, venta_id, count(distinct categoria_id) as categorias, count(*) as lineas
  from lineas group by 1, 2
)
select sede,
       count(*) as tickets,
       count(*) filter (where lineas >= 2) as con_2_lineas,
       count(*) filter (where categorias >= 2) as con_2_categorias,
       round(100.0 * count(*) filter (where categorias >= 2) / count(*), 1) as pct_2_categorias
from por_ticket group by 1 order by 1;

-- 2. Qué pares de categorías se llevan juntos (por ticket, sin repetir): la verdad de la caja, para comparar con las parejas del look.
with lineas as (
  select distinct v.id as venta_id, c.nombre as categoria
  from retail.ventas v
  join retail.venta_items i on i.venta_id = v.id
  left join retail.variantes va on va.id = i.variante_id
  left join retail.productos p on p.id = va.producto_id and p.referencia not ilike '%sin registrar%'
  left join retail.prendas_por_regularizar r on r.venta_item_id = i.id
  join retail.categorias c on c.id = coalesce(p.categoria_id, r.categoria_id)
  where v.estado = 'completada' and not v.es_prueba and v.created_at >= now() - interval '90 days'
)
select a.categoria as una, b.categoria as otra, count(*) as tickets
from lineas a join lineas b on a.venta_id = b.venta_id and a.categoria < b.categoria
group by 1, 2 order by tickets desc limit 25;

-- 3. Cuando exista la marca (`venta_items.origen_sugerencia`, migración 20261010220000): cuántas líneas entraron desde la sugerencia.
-- select u.nombre as sede, count(*) filter (where i.origen_sugerencia = 'combina_bien_con') as desde_sugerencia, count(*) as lineas
-- from retail.venta_items i join retail.ventas v on v.id = i.venta_id join retail.ubicaciones u on u.id = v.ubicacion_id
-- where v.estado = 'completada' and not v.es_prueba and v.created_at >= now() - interval '28 days'
-- group by 1 order by 1;

-- ============================================================================
-- 20261107232000_costo_de_las_tallas.sql — CAYLA V2 (Felipe, 2026-11-07 y 2026-11-09; ADR-0631)
-- El porqué del costo de cada talla en Catálogo ▸ Editar producto ▸ Costos, y qué tallas se igualan a la última compra
--
-- EL PROBLEMA PRIMERO. El 7-nov llegó 1 Short Sohanna de cada color a S/ 48. En Catálogo, dos tallas quedaron en 48, una en 46.50 y las
--   demás seguían en 45: parecía que el costo «salió distinto» en un color. La cuenta estaba bien. En Azul marino 30 quedaba 1 sin vender de
--   la carga inicial a S/ 45, y (45 + 48) ÷ 2 = 46.50; en las otras dos ya no quedaba ninguna. Lo que fallaba era que la pantalla no lo
--   decía. La pestaña «Costo» del Historial (`fn_costo_de_la_prenda`) cuenta las compras de la PRENDA entera; nadie le contaba a la ficha
--   las de cada TALLA. Y la web no tenía cómo pedirlas: `fn_costo_historial_efectivo` es interna (sin grant), y el costo solo se lee por
--   funciones que preguntan el permiso de dinero.
--   Además, las tallas que no llegaron siguen con el costo escrito a mano. Felipe decidió (2026-11-09, «Solo sin stock») que el costo de la
--   última compra se ofrece solo a las tallas sin stock: a esas, cambiarles el costo no cambia el valor del inventario. Esa regla la usan la
--   ficha (el botón «Usar S/ …») y el script de una sola vez de ese día. Vive aquí, una sola vez, para que las dos digan lo mismo.
--
-- QUÉ PROMETE.
--   1. `fn_tallas_para_igualar_costo(p_producto_id)`, interna (sin grant a la tienda). Devuelve las variantes de la prenda que toman el
--      costo de su última compra, con ese costo. Una variante entra solo si cumple todo esto:
--        · está activa;
--        · nunca llegó por compra: no tiene ninguna fila en `costo_historial` (la regla del candado `20260927190000`);
--        · no tiene stock en ninguna sede;
--        · no está en un traslado en camino;
--        · su costo es distinto del de la última compra.
--      Y solo si la última compra o cierre del Taller de la prenda tuvo costo mayor que 0 (un obsequio de S/ 0 no es el costo de la prenda).
--      La «última compra» es el promedio de lo que llegó en la última entrada efectiva de la prenda (`fn_costo_historial_efectivo`: con la
--      corrección de ADR-0515 aplicada y sin los cierres revertidos, ADR-0614). Es la misma cifra que muestra el Historial.
--   2. `fn_costo_de_las_tallas(p_producto_id)` devuelve un jsonb, o null si la cuenta no ve el dinero de compras
--      (`fn_puede_ver_dinero_de_compras`, la misma regla de `fn_costo_de_la_prenda`):
--        { "tallas":  { "<variante_id>": { fecha, origen, habia, costo_habia, llegaron, costo_llegaron, quedo }, … },
--          "igualar": { "costo": 48.00, "variantes": ["<variante_id>", …] } | null }
--      · `tallas`: una clave por variante que tiene al menos una entrada efectiva: su ÚLTIMA compra o cierre del Taller. Si llegó dos veces
--        en esa misma compra (dos facturas), es UNA entrada. `habia` y `costo_habia` son los de antes de la primera línea, `llegaron` la
--        suma, `costo_llegaron` el promedio de lo que llegó, y `quedo` lo que dejó la última línea. Las líneas de una misma compra se ordenan
--        por `stock_previo`, que sube en cada una porque cada línea suma lo que llegó. La cuenta cierra:
--        habia × costo_habia + llegaron × costo_llegaron ≈ (habia + llegaron) × quedo, salvo el redondeo a céntimos.
--      · `igualar`: lo que devuelve (1), o null si no hay ninguna variante.
--   ASUME: que `fn_costo_historial_efectivo` existe (20261026160000). La web muestra la cuenta de una talla solo si `quedo` es el costo que
--   la celda muestra. Si no (algo lo movió después), dice el porqué en palabras: nunca afirma una cuenta que no da.
--
-- QUÉ NO HACE. No escribe nada ni cambia ninguna función existente. No da el costo de la prenda entera (eso es `fn_costo_de_la_prenda`,
-- que la ficha también lee) ni las compras anteriores a la última.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable (`create or replace`). Sin políticas ni `drop trigger`: ADR-0195 no aplica, no toma candados de
--   tablas en uso. Sin `select … into` dentro de comillas (ADR-0288).
--   Se puede pegar antes o después de publicar la web. Sin esta función, la ficha sigue igual, con dos diferencias: el «?» de cada talla gris
--   explica en palabras y no se ofrece «Usar S/ …».
--   Va ANTES del script `pegar-en-produccion-costo-declarado-ultima-compra-2026-11-09.sql`, que usa (1).
-- VERIFICACIÓN (solo lectura):
--   select to_regprocedure('retail.fn_costo_de_las_tallas(uuid)') is not null, to_regprocedure('retail.fn_tallas_para_igualar_costo(uuid)') is not null;
--   → t | t
-- CÓMO SE DESHACE: drop function if exists retail.fn_costo_de_las_tallas(uuid); drop function if exists retail.fn_tallas_para_igualar_costo(uuid);
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- (1) Qué tallas toman el costo de la última compra. La llaman `fn_costo_de_las_tallas` (que pregunta el permiso de dinero) y el script de
-- una sola vez del 2026-11-09, los dos como su dueño.
create or replace function retail.fn_tallas_para_igualar_costo(p_producto_id uuid)
returns table (variante_id uuid, costo numeric)
language sql
stable
set search_path to 'retail', 'public', 'extensions'
as $$
  with efectivo as (
    select e.created_at, e.cantidad_nueva, e.costo_unitario_nuevo
      from retail.fn_costo_historial_efectivo(p_producto_id) e
  ),
  ultima as (
    select round(sum(e.cantidad_nueva * e.costo_unitario_nuevo) / nullif(sum(e.cantidad_nueva), 0), 2) as costo
      from efectivo e
     where e.created_at = (select max(x.created_at) from efectivo x)
  )
  select v.id, u.costo
    from retail.variantes v
   cross join ultima u
   where v.producto_id = p_producto_id
     and v.activo
     and u.costo > 0
     and round(v.costo, 2) <> u.costo
     and not exists (select 1 from retail.costo_historial ch where ch.variante_id = v.id)
     and coalesce((select sum(s.cantidad) from retail.stock s where s.variante_id = v.id), 0) = 0
     and not exists (select 1 from retail.transferencia_items ti join retail.transferencias tr on tr.id = ti.transferencia_id
                      where ti.variante_id = v.id and tr.estado = 'en_transito');
$$;

revoke all on function retail.fn_tallas_para_igualar_costo(uuid) from public, anon, authenticated;

comment on function retail.fn_tallas_para_igualar_costo(uuid) is
  'ADR-0631 (Felipe 2026-11-09, «Solo sin stock»): variantes activas, sin compra, sin stock y fuera de traslados en camino que toman el costo de la última compra de su prenda, con ese costo. Interna: la usan fn_costo_de_las_tallas y el script de una sola vez del 2026-11-09.';

-- (2) Lo que la ficha lee.
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
  select case when retail.fn_puede_ver_dinero_de_compras() then jsonb_build_object(
    'tallas', coalesce((select jsonb_object_agg(p.variante_id::text, jsonb_build_object(
        'fecha', p.en, 'origen', p.origen, 'habia', p.habia, 'costo_habia', p.costo_habia,
        'llegaron', p.llegaron, 'costo_llegaron', p.costo_llegaron, 'quedo', p.quedo))
      from por_variante p), '{}'::jsonb),
    'igualar', (select jsonb_build_object('costo', max(i.costo), 'variantes', jsonb_agg(i.variante_id order by i.variante_id))
                  from retail.fn_tallas_para_igualar_costo(p_producto_id) i
                having count(*) > 0))
  end;
$$;

revoke all on function retail.fn_costo_de_las_tallas(uuid) from public, anon;
grant execute on function retail.fn_costo_de_las_tallas(uuid) to authenticated;

comment on function retail.fn_costo_de_las_tallas(uuid) is
  'ADR-0631: por variante de la prenda, la última compra o cierre del Taller que cuenta hoy (lo que había y a cuánto, lo que llegó y a cuánto, en cuánto quedó), y qué tallas sin compra ni stock toman el costo de la última compra (fn_tallas_para_igualar_costo). Lo leen el «?» de cada talla gris y el botón «Usar S/ …» de Catálogo ▸ Costos. Null si la cuenta no ve el dinero de compras.';

reset lock_timeout;

-- ============================================================================
-- pegar-en-produccion-costo-declarado-ultima-compra-2026-11-09.sql — las tallas sin compra y sin stock toman el costo de la última compra de
-- su prenda (Felipe, 2026-11-09; ADR-0631, «Solo sin stock»)
-- SCRIPT DE UNA SOLA VEZ (no es una migración: no tiene versión, no entra al CI de migraciones). No depende de `20261107232000`: se puede
-- pegar antes, después o sin ella.
--
-- EL PROBLEMA PRIMERO. El costo se lleva por talla. Una talla que todavía no llegó por Compras ni por el Taller sigue con el costo que se
--   escribió a mano al darla de alta. El Short Sohanna llegó el 7-nov a S/ 48 en 3 tallas, y las otras 6 quedaron en S/ 45. Medido en
--   producción el 2026-11-07: 60 tallas de 13 prendas están así, y 15 de ellas tienen stock (30 prendas).
--   La ficha ya ofrece «Usar S/ …, el de la última compra» prenda por prenda. Felipe pidió hacerlo para todas, pero SOLO en las que no tienen
--   stock: a esas, cambiarles el costo no cambia el valor del inventario. Las que tienen stock se quedan como están. Su costo escrito puede
--   ser el real de las prendas que hay en tienda, que no llegaron en esa compra.
--
-- QUÉ HACE. Todo o nada, sin ningún `drop`, sin tocar stock, ventas, compras ni `costo_historial`. Cambia una talla solo si cumple todo esto:
--     · está activa;
--     · no tiene ninguna fila en `costo_historial` (nunca llegó por compra; es la misma regla del candado `20260927190000` y de la ficha);
--     · no tiene stock en ninguna sede;
--     · no está en un traslado en camino;
--     · la última compra o cierre del Taller de su prenda tuvo costo mayor que 0 (un obsequio de S/ 0 no es el costo de la prenda);
--     · su costo es distinto del de esa compra.
--   La «última compra» es lo mismo que dicen la ficha y el Historial: el promedio de lo que llegó en la última entrada efectiva de la prenda
--   (`fn_costo_historial_efectivo`: con la corrección de ADR-0515 aplicada y sin los cierres revertidos).
--   Pasos:
--   1. Deja la foto de cada talla en `respaldo_purgas.filas` (purga «costo-declarado-ultima-compra-2026-11-09», tabla `variantes`). De ahí
--      sale el camino de vuelta.
--   2. Le pone a cada talla el costo de la última compra. El disparador de siempre lo anota en el historial de la prenda como «costo
--      declarado» (no como «alterado»: nunca tuvo compra) y en Actividad («cambió el costo de N variantes»), sin firma: lo hace un script.
--   3. Sube la versión de cada prenda tocada (ADR-0193). Una ficha abierta desde antes ya no puede guardar el costo viejo encima: la base la
--      rechaza con «otra persona guardó» y la persona recarga.
--   Si el script ya se aplicó (hay filas de esta purga), se DETIENE: no se aplica dos veces.
--
-- ENSAYO PRIMERO. Por defecto NO aplica: hace todo, cuenta y termina con un error «ENSAYO_OK …». Ese error deshace todo y dice cuántas tallas
--   y de qué prendas cambiaría. Si es lo esperado, cambia `false` por `true` en la línea marcada APLICAR y vuelve a pegar.
--   Se ensayó el 2026-11-09 en una base privada con las migraciones de `main` y estos casos:
--     · una prenda que replica el Short Sohanna;
--     · una talla sin compra CON stock, una en traslado, una desactivada y una de una prenda sin compras (las cuatro no se tocan);
--     · el ensayo, la aplicación, el segundo pegado (se detiene) y el camino de vuelta.
--
-- VISTA PREVIA, talla por talla (solo lectura; se puede pegar sola antes):
--     with e as (select v.producto_id, x.created_at, x.cantidad_nueva, x.costo_unitario_nuevo
--                  from retail.productos p cross join lateral retail.fn_costo_historial_efectivo(p.id) x
--                  join retail.variantes v on v.id = x.variante_id),
--          u as (select e.producto_id, round(sum(e.cantidad_nueva * e.costo_unitario_nuevo) / nullif(sum(e.cantidad_nueva), 0), 2) as costo
--                  from e where (e.producto_id, e.created_at) in (select producto_id, max(created_at) from e group by producto_id)
--                 group by e.producto_id)
--     select p.referencia, p.codigo, c.nombre as color, t.valor as talla, v.costo as hoy, u.costo as queda
--       from retail.variantes v join u on u.producto_id = v.producto_id join retail.productos p on p.id = v.producto_id
--       left join retail.colores c on c.codigo = v.color_codigo left join retail.tallas t on t.id = v.talla_id
--      where v.activo and u.costo > 0 and round(v.costo, 2) <> u.costo
--        and not exists (select 1 from retail.costo_historial ch where ch.variante_id = v.id)
--        and coalesce((select sum(s.cantidad) from retail.stock s where s.variante_id = v.id), 0) = 0
--        and not exists (select 1 from retail.transferencia_items ti join retail.transferencias tr on tr.id = ti.transferencia_id
--                         where ti.variante_id = v.id and tr.estado = 'en_transito')
--      order by p.referencia, c.nombre, t.valor;
--
-- LO QUE CAMBIA PARA QUIEN USA EL ERP, al aplicar:
--   · En Catálogo ▸ Costos esas tallas muestran el costo de la última compra, y su margen se recalcula con él.
--   · Una venta futura de esas tallas guardará ese costo.
--   · El valor del inventario no cambia: ninguna de ellas tiene stock.
--   · Lo ya vendido no cambia: cada venta guardó su costo.
--
-- CAMINO DE VUELTA (si hiciera falta). Devuelve el costo de antes solo a las tallas que siguen sin compra; una que ya llegó por Compras tiene
--   su promedio oficial y no se pisa. Pega esto, tal cual:
--     update retail.variantes v
--        set costo = (b.fila ->> 'costo')::numeric
--       from respaldo_purgas.filas b
--      where b.purga = 'costo-declarado-ultima-compra-2026-11-09' and b.tabla = 'variantes' and (b.fila ->> 'id')::uuid = v.id
--        and not exists (select 1 from retail.costo_historial ch where ch.variante_id = v.id);
--     update retail.productos p set version = p.version
--      where p.id in (select (b.fila ->> 'producto_id')::uuid from respaldo_purgas.filas b
--                      where b.purga = 'costo-declarado-ultima-compra-2026-11-09');
--   (La segunda sentencia sube la versión de esas prendas otra vez: una ficha abierta antes de la vuelta no pisa el costo devuelto.)
--
-- PRODUCCIÓN. Sin políticas, sin `drop trigger`, sin tablas temporales. Con `lock_timeout = 3s`: si una talla está ocupada, falla en vez de
--   esperar (ADR-0195, ADR-0288).
-- VERIFICACIÓN (solo lectura, después):
--     select count(*) as tallas, count(distinct (fila ->> 'producto_id')) as prendas
--       from respaldo_purgas.filas where purga = 'costo-declarado-ultima-compra-2026-11-09';
--   → las mismas cifras del ENSAYO_OK.
-- ============================================================================

set lock_timeout = '3s';

do $f$
declare
  v_aplicar boolean := false; -- APLICAR: cambia false por true para aplicar de verdad
  v_purga constant text := 'costo-declarado-ultima-compra-2026-11-09';
  v_tallas integer := 0;
  v_prendas integer := 0;
  v_lista text;
begin
  if to_regclass('respaldo_purgas.filas') is null then
    raise exception 'Falta el respaldo (respaldo_purgas.filas): no se toca nada sin la foto de antes';
  end if;
  if to_regprocedure('retail.fn_costo_historial_efectivo(uuid)') is null then
    raise exception 'Falta fn_costo_historial_efectivo (20261026160000): sin ella no se sabe cuál es la última compra. No se tocó nada.';
  end if;
  if exists (select 1 from respaldo_purgas.filas where purga = v_purga) then
    raise exception 'Este script ya se aplicó (hay filas de la purga «%» en respaldo_purgas.filas): no se aplica dos veces. No se tocó nada.', v_purga;
  end if;

  -- 1 y 2: la foto de antes y el costo nuevo, en una sola sentencia (las dos partes ven la misma foto de la base).
  with efectivo as (
    select v.producto_id, x.created_at, x.cantidad_nueva, x.costo_unitario_nuevo
      from retail.productos p
     cross join lateral retail.fn_costo_historial_efectivo(p.id) x
      join retail.variantes v on v.id = x.variante_id
  ),
  ultima as (
    select e.producto_id, round(sum(e.cantidad_nueva * e.costo_unitario_nuevo) / nullif(sum(e.cantidad_nueva), 0), 2) as costo
      from efectivo e
     where (e.producto_id, e.created_at) in (select producto_id, max(created_at) from efectivo group by producto_id)
     group by e.producto_id
  ),
  objetivo as (
    select v.id, u.costo as costo_nuevo
      from retail.variantes v
      join ultima u on u.producto_id = v.producto_id
     where v.activo
       and u.costo > 0
       and round(v.costo, 2) <> u.costo
       and not exists (select 1 from retail.costo_historial ch where ch.variante_id = v.id)
       and coalesce((select sum(s.cantidad) from retail.stock s where s.variante_id = v.id), 0) = 0
       and not exists (select 1 from retail.transferencia_items ti join retail.transferencias tr on tr.id = ti.transferencia_id
                        where ti.variante_id = v.id and tr.estado = 'en_transito')
       for update of v
  ),
  respaldo as (
    insert into respaldo_purgas.filas (purga, tabla, fila)
    select v_purga, 'variantes', to_jsonb(v) from retail.variantes v join objetivo o on o.id = v.id
    returning 1
  ),
  cambio as (
    update retail.variantes v set costo = o.costo_nuevo from objetivo o where v.id = o.id
    returning v.id, v.producto_id
  )
  select count(*), count(distinct producto_id) into v_tallas, v_prendas from cambio;

  -- 3: sube la versión de cada prenda tocada (el disparador `productos_version_bu` la sube en cualquier update).
  update retail.productos p set version = p.version
   where p.id in (select (b.fila ->> 'producto_id')::uuid from respaldo_purgas.filas b where b.purga = v_purga);

  v_lista := (select string_agg(x.texto, ', ' order by x.texto)
                from (select p.referencia || coalesce(' ' || p.codigo, '') || ' (' || count(*) || ')' as texto
                        from respaldo_purgas.filas b join retail.productos p on p.id = (b.fila ->> 'producto_id')::uuid
                       where b.purga = v_purga
                       group by p.referencia, p.codigo) x);

  if not v_aplicar then
    raise exception 'ENSAYO_OK: % de % tomarían el costo de su última compra: %. Ninguna tiene stock. Nada cambió. Para aplicar: cambia false por true en la línea APLICAR.',
      v_tallas || case when v_tallas = 1 then ' talla' else ' tallas' end, v_prendas || case when v_prendas = 1 then ' prenda' else ' prendas' end,
      coalesce(v_lista, '(ninguna)');
  end if;
  raise notice 'Hecho: % de % tomaron el costo de su última compra: %.',
    v_tallas || case when v_tallas = 1 then ' talla' else ' tallas' end, v_prendas || case when v_prendas = 1 then ' prenda' else ' prendas' end,
    coalesce(v_lista, '(ninguna)');
end
$f$;

select count(*) as tallas, count(distinct (fila ->> 'producto_id')) as prendas
  from respaldo_purgas.filas where purga = 'costo-declarado-ultima-compra-2026-11-09';

reset lock_timeout;

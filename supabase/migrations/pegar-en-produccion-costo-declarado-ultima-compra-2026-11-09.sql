-- ============================================================================
-- pegar-en-produccion-costo-declarado-ultima-compra-2026-11-09.sql — las tallas sin compra y sin stock toman el costo de la última compra de
-- su prenda (Felipe, 2026-11-09; ADR-0631, «Solo sin stock»)
-- SCRIPT DE UNA SOLA VEZ (no es una migración: no tiene versión, no entra al CI de migraciones). Va DESPUÉS de `20261107232000`: usa su
-- `fn_tallas_para_igualar_costo`, la misma regla que el botón «Usar S/ …» de la ficha. Sin ella, se detiene sin tocar nada.
--
-- EL PROBLEMA PRIMERO. El costo se lleva por talla. Una talla que todavía no llegó por Compras ni por el Taller sigue con el costo que se
--   escribió a mano al darla de alta. El Short Sohanna llegó el 7-nov a S/ 48 en 3 tallas, y las otras 6 quedaron en S/ 45. Medido en
--   producción el 2026-11-07: 60 tallas de 13 prendas están así, y 15 de ellas tienen stock (30 prendas).
--   La ficha ya ofrece «Usar S/ …, el de la última compra» prenda por prenda. Felipe pidió hacerlo para todas, pero SOLO en las que no tienen
--   stock: a esas, cambiarles el costo no cambia el valor del inventario. Las que tienen stock se quedan como están. Su costo escrito puede
--   ser el real de las prendas que hay en tienda, que no llegaron en esa compra.
--
-- QUÉ HACE. Todo o nada, sin ningún `drop`, sin tocar stock, ventas, compras ni `costo_historial`. Cambia las tallas que devuelve
--   `fn_tallas_para_igualar_costo` para cada prenda. Su encabezado (en `20261107232000`) dice la regla completa: activa, sin compra, sin
--   stock, fuera de traslados en camino, con una última compra de costo mayor que 0 y un costo distinto del de esa compra.
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
--   Medido en producción el 2026-11-09 con la misma regla: 45 tallas de 13 prendas, ninguna con una última compra de costos distintos
--   entre tallas. Los saltos más grandes: Falda Jean de 35 a 60, Vestido Campanita de 48 a 70, y 4 prendas que hoy están en S/ 0.
--
-- VISTA PREVIA, talla por talla (solo lectura; se puede pegar sola antes):
--     select p.referencia, p.codigo, c.nombre as color, t.valor as talla, v.costo as hoy, i.costo as queda
--       from retail.productos p cross join lateral retail.fn_tallas_para_igualar_costo(p.id) i
--       join retail.variantes v on v.id = i.variante_id
--       left join retail.colores c on c.codigo = v.color_codigo left join retail.tallas t on t.id = v.talla_id
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
  if to_regprocedure('retail.fn_tallas_para_igualar_costo(uuid)') is null then
    raise exception 'Falta fn_tallas_para_igualar_costo: pega antes 20261107232000_costo_de_las_tallas.sql. No se tocó nada.';
  end if;
  if exists (select 1 from respaldo_purgas.filas where purga = v_purga) then
    raise exception 'Este script ya se aplicó (hay filas de la purga «%» en respaldo_purgas.filas): no se aplica dos veces. No se tocó nada.', v_purga;
  end if;

  -- 1 y 2: la foto de antes y el costo nuevo, en una sola sentencia (las dos partes ven la misma foto de la base).
  -- La regla es la de la ficha (`fn_tallas_para_igualar_costo`); cada talla se toma `for update` (si alguien la está guardando, espera o
  -- falla por el `lock_timeout`).
  with objetivo as (
    select v.id, i.costo as costo_nuevo
      from retail.productos p
     cross join lateral retail.fn_tallas_para_igualar_costo(p.id) i
      join retail.variantes v on v.id = i.variante_id
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

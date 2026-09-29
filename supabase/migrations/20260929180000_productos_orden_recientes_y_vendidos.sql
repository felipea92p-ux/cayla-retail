-- ============================================================================
-- 20260929180000 — Productos se ordena por «más recientes», «más antiguos», «más vendidos» y «menos vendidos»
--                  (Felipe, 2026-09-29: «en los filtros… productos recientes, viejos, más comprados»)
--
-- EL PROBLEMA
--   El listado solo sabía ordenar por nombre y por precio (`precio_asc`, `precio_desc`). Con el catálogo real creciendo, la
--   persona quiere ver primero lo último que se cargó, lo más antiguo (para revisarlo o liquidarlo) y lo que más y menos
--   rota. Eso no se puede resolver en la pantalla: la lista pagina en la base (20 por página) y el orden se decide ANTES de
--   cortar la página; ordenar en el navegador ordenaría solo las 20 que ya llegaron.
--
-- QUÉ CAMBIA (solo `fn_productos`; misma firma, mismas columnas, mismos candados de quién entra)
--   · `p_orden` acepta cuatro valores más: `recientes`, `antiguos`, `vendidos_desc`, `vendidos_asc`. Cualquier otro sigue
--     dando «Orden de catálogo desconocido».
--   · recientes / antiguos: `productos.created_at`. Los productos de una misma carga (el censo entra en lotes, con la misma
--     hora) desempatan por nombre, como todo el listado: el resultado es estable, no baraja entre una página y otra.
--   · vendidos: unidades que salieron por venta en los ÚLTIMOS 30 DÍAS, en toda la red (`movimientos`: tipo `salida`,
--     motivo `venta`). Es la MISMA definición y la misma ventana que la demanda de «Pedir a proveedor» (CTE `demanda`): las
--     dos pantallas hablan igual. Un producto sin ventas cuenta 0 (queda al final en «más vendidos»).
--   · Sin `p_orden` de ventas, la suma de movimientos NO se calcula (`where p_orden in (...)` es falso y con
--     `plan_cache_mode = force_custom_plan` Postgres lo descarta al planificar): el camino de siempre no paga nada.
--
-- CÓMO (parche por ancla, como 20260924160000 y 20260929045000)
--   No se reescribe la función entera: se parte de la definición VIVA (`pg_get_functiondef`), se exige cada ancla
--   EXACTAMENTE una vez y se vuelve a crear. Si la función cambió de forma (alguien la parchó a mano), la migración se
--   detiene con un mensaje y no toca nada. Si ya lleva la marca «20260929180000», no hace nada.
--   Elegido a propósito para que sirva igual sobre la versión de producción (cifra única, 20260929020000) y sobre la
--   anterior (20260924180000, la que hoy tiene la base local): los ocho puntos que toca son idénticos en las dos.
--
-- ORDEN DE PEGADO
--   ANTES de fusionar la web que llama con `orden=recientes|antiguos|vendidos_*`. Sin esta migración la base responde
--   «Orden de catálogo desconocido» a esas cuatro opciones (y solo a ellas: precio y nombre siguen igual).
--
-- PRODUCCIÓN
--   Solo `create or replace function` (dentro del parche): sin políticas ni `alter table` (ADR-0195), en una sola parte y
--   con `lock_timeout` corto. Los `grant` se conservan: `create or replace` no los reinicia.
--
-- CÓMO SE VERIFICA
--   `scripts/pruebas/productos_orden.mjs` (contra un Postgres desechable): las cuatro opciones ordenan como dicen, «más
--   vendidos» cuadra con la suma de movimientos, el resto de los órdenes no cambia y un valor desconocido se rechaza.
--   Después de pegar: `select position('20260929180000' in prosrc) > 0 from pg_proc where proname = 'fn_productos'`.
-- ============================================================================

set lock_timeout = '3s';

-- Ayudante de esta migración (nombre propio: los pg_temp de otras migraciones viven en la misma sesión al migrar en local).
create or replace function pg_temp.parchar_170000(p_firma text, p_anclas text[], p_nuevos text[], p_marca text)
returns void
language plpgsql
as $$
declare
  v_def text;
  v_veces integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    raise notice '20260929180000: % ya tenía el parche (se volvió a pegar)', p_firma;
    return;
  end if;
  for i in 1 .. array_length(p_anclas, 1) loop
    v_veces := (length(v_def) - length(replace(v_def, p_anclas[i], ''))) / length(p_anclas[i]);
    if v_veces <> 1 then
      raise exception '20260929180000: % no tiene el ancla % esperada (aparece % veces). Revisar su definición viva antes de pegar.',
        p_firma, i, v_veces;
    end if;
    v_def := replace(v_def, p_anclas[i], p_nuevos[i]);
  end loop;
  execute v_def;
  raise notice '20260929180000: % parchada', p_firma;
end;
$$;

select pg_temp.parchar_170000(
  'retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text, uuid, uuid)',
  array[
    -- 1. los valores que se aceptan
    $a$  if p_orden is not null and p_orden not in ('precio_asc', 'precio_desc') then$a$,
    -- 2. de dónde sale «más reciente»: la fecha de alta del producto
    $a$
    from productos p
    left join categorias c on c.id = p.categoria_id$a$,
    -- 3. las unidades vendidas (solo si se pide ese orden) y las dos columnas nuevas en `candidatos`
    $a$  candidatos as (
    select b.id, b.referencia, pvar.precio_min
    from base b join por_variantes pvar on pvar.producto_id = b.id
    where pvar.color_ok and pvar.precio_ok
  ),$a$,
    -- 4. el orden que elige la página (antes de calcular las cifras)
    $a$      case when p_orden = 'precio_desc' then c.precio_min end desc,
      c.referencia, c.id$a$,
    -- 5. las dos columnas nuevas siguen hasta el orden de la página ya elegida
    $a$      pvar.precio_min, pvar.color_ok, pvar.precio_ok,
$a$,
    $a$    left join por_stock ps on ps.producto_id = b.id
$a$,
    $a$      case when p_orden = 'precio_desc' then f.precio_min end desc,
      f.referencia, f.id$a$,
    -- 6. el orden final de las filas devueltas
    $a$    case when p_orden = 'precio_desc' then pg.precio_min end desc,
    pg.referencia, pg.id, ta.valor, v.color_codigo;$a$
  ],
  array[
    $n$  -- 20260929180000: recientes, antiguos y vendidos (Felipe, 2026-09-29). Precio y nombre siguen igual.
  if p_orden is not null and p_orden not in ('precio_asc', 'precio_desc', 'recientes', 'antiguos', 'vendidos_desc', 'vendidos_asc') then$n$,
    $n$,
           p.created_at
    from productos p
    left join categorias c on c.id = p.categoria_id$n$,
    $n$  -- 20260929180000: unidades vendidas en los últimos 30 días, en toda la red (misma definición que `demanda`). Solo se
  -- calcula si se pide un orden de ventas: con otro `p_orden` la condición es falsa y no se lee `movimientos`.
  vendidas as (
    select v2.producto_id, sum(m.cantidad)::numeric as unidades
    from movimientos m
    join variantes v2 on v2.id = m.variante_id
    where p_orden in ('vendidos_desc', 'vendidos_asc')
      and m.tipo = 'salida' and m.motivo = 'venta'
      and m.created_at >= now() - interval '30 days'
      and v2.producto_id in (select b.id from base b)
    group by v2.producto_id
  ),
  candidatos as (
    select b.id, b.referencia, pvar.precio_min, b.created_at, coalesce(vd.unidades, 0) as vendidas
    from base b join por_variantes pvar on pvar.producto_id = b.id
    left join vendidas vd on vd.producto_id = b.id
    where pvar.color_ok and pvar.precio_ok
  ),$n$,
    $n$      case when p_orden = 'precio_desc' then c.precio_min end desc,
      case when p_orden = 'recientes' then c.created_at end desc,
      case when p_orden = 'antiguos' then c.created_at end asc,
      case when p_orden = 'vendidos_desc' then c.vendidas end desc,
      case when p_orden = 'vendidos_asc' then c.vendidas end asc,
      c.referencia, c.id$n$,
    $n$      pvar.precio_min, pvar.color_ok, pvar.precio_ok,
      b.created_at, coalesce(vd.unidades, 0) as vendidas,
$n$,
    $n$    left join por_stock ps on ps.producto_id = b.id
    left join vendidas vd on vd.producto_id = b.id
$n$,
    $n$      case when p_orden = 'precio_desc' then f.precio_min end desc,
      case when p_orden = 'recientes' then f.created_at end desc,
      case when p_orden = 'antiguos' then f.created_at end asc,
      case when p_orden = 'vendidos_desc' then f.vendidas end desc,
      case when p_orden = 'vendidos_asc' then f.vendidas end asc,
      f.referencia, f.id$n$,
    $n$    case when p_orden = 'precio_desc' then pg.precio_min end desc,
    case when p_orden = 'recientes' then pg.created_at end desc,
    case when p_orden = 'antiguos' then pg.created_at end asc,
    case when p_orden = 'vendidos_desc' then pg.vendidas end desc,
    case when p_orden = 'vendidos_asc' then pg.vendidas end asc,
    pg.referencia, pg.id, ta.valor, v.color_codigo;$n$
  ],
  '20260929180000'
);

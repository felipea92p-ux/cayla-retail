-- ============================================================================
-- 20261113225000 — Catálogo ▸ Productos: los conteos de los filtros leen las ventas de 30 días UNA vez
--
-- EL PROBLEMA
--   `fn_productos_facetas` (los conteos de los filtros de Catálogo ▸ Productos, lo primero que se pide al entrar) calcula la
--   demanda de cada prenda con las ventas de los últimos 30 días. Postgres tenía dos formas de hacerlo y las veía casi del
--   mismo costo, porque calcula mal cuántas ventas recientes hay (esperaba 40 a 54 movimientos y son 3.119 en el volumen del
--   presupuesto: cree que «salida» y «venta» son independientes, y que lo reciente pesa como lo viejo):
--     · A: tomar las ventas recientes por fecha (`movimientos_created_at_idx`) y buscar su prenda → ~10 mil bloques;
--     · B: recorrer TODAS las variantes de las prendas y buscar las ventas de cada una → ~66 mil bloques.
--   Cuál gana lo decide un detalle: un índice de 292 o de 299 páginas, una correlación de 0,083 o de 0,088, que cambian con los
--   identificadores al azar de la semilla y con lo que la base vivió antes. Medido el 2026-11-13 en seis bases locales recién
--   creadas, con la misma forma de medir: cinco daban 112 mil bloques (B) y una 55 mil (A), siempre la misma por base. En el CI,
--   el presupuesto de rendimiento (ADR-0656) daba 55 mil o 112 mil según la corrida, y frenaba PR que no tocaban nada de esto.
--   La tienda real puede caer en B el día que sus estadísticas se muevan: cada entrada a Productos leería seis veces más.
--
-- QUÉ CAMBIA (reemplazo anclado por TEXTO sobre la definición viva; misma firma, sin drop ni permisos nuevos)
--   · `demanda` ya no junta movimientos con variantes de una vez: primero toma las ventas de 30 días (un CTE `materialized`,
--     que Postgres resuelve aparte y por fecha, como A) y después busca su prenda. El resultado es EL MISMO, fila por fila:
--     las mismas ventas, la misma suma, el mismo «/ 30».
--   · Con el volumen del presupuesto: 54 mil bloques en las seis bases, las que daban 112 mil y la que daba 55 mil.
--   · Cuando el filtro deja pocas prendas, B podía ser algo más barata; A cuesta lo mismo siempre (las ventas de 30 días de las
--     3 tiendas, unos cientos de bloques). Se prefiere el costo fijo a la apuesta.
--   · `fn_productos_listado` no cambia: su demanda es solo de las 20 prendas de la página, y ahí recorrer sus variantes ES lo
--     barato (en el presupuesto se mueve entre 3.645 y 3.816 bloques, no salta).
--
-- CÓMO. El ancla (el texto de `demanda` de hoy) tiene que aparecer EXACTAMENTE una vez en la definición viva; si no, aborta sin
--   tocar nada (la función cambió: hay que regenerar el reemplazo). Se puede pegar dos veces: si la función ya tiene la marca
--   «ADR-0656: ventas de una vez», no la toca. Sin tablas ni políticas (ADR-0195), sin `drop trigger`, y sin `select … into`
--   dentro de un texto entre comillas (ADR-0288). Una sola ejecución.
--   Huellas en local (2026-11-13, base nueva al día con main, «Sin costo» incluido): fn_productos_facetas ANTES =
--   986a1b8c1fa1014e7b3a7c620503a32c · DESPUÉS = 745b6016a3efc3648dbae85f723038be (la misma al pegarla dos veces).
--   Producción (2026-11-13, lectura): la MISMA huella de ANTES y el ancla presente; 4.064 variantes y 2.107 ventas en 30 días, así
--   que allí también es más barato partir de las ventas que recorrer las variantes.
--
-- CÓMO SE DESHACE: reemplazar en la definición viva `n_demanda` por `a_demanda` (los dos textos están abajo, tal cual), o correr
--   el `DESHACER` de `scripts/pruebas/productos_facetas_demanda.mjs`. La web no cambia: lee el mismo JSON.
--
-- ORDEN DE PEGADO: cuando quieras; no depende de otra migración pendiente, ni de la web.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $migracion$
declare
  c_facetas constant text := 'retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, uuid)';
  -- El texto vivo de hoy (ancla) y lo que lo reemplaza. Los espacios del comienzo de cada línea son parte del ancla.
  a_demanda constant text := $a$  demanda as (
    select v2.producto_id, sum(m.cantidad)::numeric / 30 as diaria
    from retail.movimientos m
    join retail.variantes v2 on v2.id = m.variante_id
    where m.tipo = 'salida' and m.motivo = 'venta' and m.created_at >= now() - interval '30 days'
      and v2.producto_id in (select c.producto_id from candidatos c)
    group by v2.producto_id
  ),$a$;
  n_demanda constant text := $n$  -- ADR-0656: ventas de una vez (20261113225000). Las ventas de 30 días se toman primero, por fecha, y recién
  -- después se busca su prenda: con las dos cosas juntas, Postgres podía recorrer todas las variantes (seis veces más bloques).
  ventas_30d as materialized (
    select m.variante_id, m.cantidad
    from retail.movimientos m
    where m.tipo = 'salida' and m.motivo = 'venta' and m.created_at >= now() - interval '30 days'
  ),
  demanda as (
    select v2.producto_id, sum(m.cantidad)::numeric / 30 as diaria
    from ventas_30d m
    join retail.variantes v2 on v2.id = m.variante_id
    where v2.producto_id in (select c.producto_id from candidatos c)
    group by v2.producto_id
  ),$n$;
  v_def text;
  v_n integer;
begin
  if to_regprocedure(c_facetas) is null then
    raise exception 'Falta la firma con empresa de fn_productos_facetas: pega antes 20261021004000_productos_filtro_por_empresa.sql';
  end if;

  v_def := pg_get_functiondef(c_facetas::regprocedure);
  if position('ADR-0656: ventas de una vez' in v_def) = 0 then
    v_n := (length(v_def) - length(replace(v_def, a_demanda, ''))) / length(a_demanda);
    if v_n <> 1 then
      raise exception 'ventas de una vez: se esperaba UNA aparición de la «demanda» de hoy en fn_productos_facetas y hay %. La función cambió desde que se escribió esta migración: regenera el reemplazo desde su definición real.', v_n;
    end if;
    execute replace(v_def, a_demanda, n_demanda);
  end if;
end
$migracion$;

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», el texto se pegó cortado o falta algo:
-- es seguro volver a pegarlo completo.
select '20261113225000 · Productos: ventas de 30 días de una vez' as parte,
       case when position('ADR-0656: ventas de una vez' in pg_get_functiondef('retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, uuid)'::regprocedure)) > 0
             and position('ventas_30d as materialized' in pg_get_functiondef('retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, uuid)'::regprocedure)) > 0
             and not has_function_privilege('anon', 'retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, uuid)', 'execute')
             and has_function_privilege('authenticated', 'retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, uuid)', 'execute')
            then 'QUEDÓ BIEN' else 'REVISAR: fn_productos_facetas no quedó con las ventas de una vez o cambiaron sus permisos' end as resultado;

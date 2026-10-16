-- ============================================================================
-- 20261015215000_tienda_catalogo_rapido.sql — CAYLA V2 · Tienda online (ADR-0408)
--
-- EL PROBLEMA PRIMERO. El primer día en producción (2026-10-15), con 294 prendas publicadas en la Vitrina y una tienda en la
-- web, el catálogo de la tienda online tardaba 24 s y la base lo cortaba a los 5 s (el `statement_timeout` del usuario de la
-- tienda): la página decía «No pudimos cargar las prendas». Medido con `pg_stat_xact_user_functions` en una sola carga:
-- `fn_tienda_sedes_web` se llamó 29 881 veces y se llevó 21,6 de los 24 s. En `fn_tienda_precio_talla`, las CTE `web` y
-- `precio_de` se usan una sola vez cada una, así que Postgres (desde la 12) las mete dentro de la consulta principal y vuelve a
-- calcular qué tiendas se ven en la web en CADA fila de variantes (dos veces por fila: en `fn_tienda_sede_elegida` y en el
-- `else`). Con pocas prendas no se notaba; crece con cada talla publicada.
--
-- ANALOGÍA CAYLA. Es como si la vendedora, para poner el precio de cada talla, llamara a la oficina a preguntar qué tiendas
-- abren hoy: 1 658 llamadas para una sola lista. Se pregunta una vez y se anota.
--
-- QUÉ HACE. Marca esas dos CTE como `materialized`: se calculan una vez por llamada a la función. Nada más cambia. Comparado con
-- los datos de producción antes de pegarlo: las 1 658 tallas publicadas dan las mismas filas y la misma suma de precios, y la
-- función pasa de 18 s a 1 s.
--
-- DECIDÍ: un reemplazo anclado sobre la función viva (el patrón de ADR-0377) y no reescribirla entera: cambia solo las dos
--   palabras, conserva dueño y permisos (`create or replace`), y se detiene sin tocar nada si cada ancla no aparece exactamente
--   una vez. Idempotente: si ya están materializadas, avisa y no hace nada.
-- DESCARTÉ: subir el `statement_timeout` de la tienda: la página tardaría 24 s en vez de fallar, y crecería con cada prenda.
--
-- SE ROMPE SI: alguien reescribe `fn_tienda_precio_talla` sin el `materialized` (vuelve la lentitud, no un error). Lo vigila
--   el escenario 0 de `pnpm pruebas:tienda-inicio`, que cuenta las llamadas a `fn_tienda_sedes_web` en una carga.
--
-- PRODUCCIÓN. Pegada el 2026-10-15 con el OK de Felipe, antes que su PR: la tienda estaba sin catálogo. Una sola parte, sin
-- políticas ni `alter` de tablas.
-- ============================================================================
set lock_timeout = '3s';

do $catalogo$
declare
  v_def text := pg_get_functiondef('retail.fn_tienda_precio_talla(uuid[], uuid)'::regprocedure);
  v_ancla text;
begin
  if position('with web as materialized (' in v_def) > 0 and position('precio_de as materialized (' in v_def) > 0 then
    raise notice 'fn_tienda_precio_talla ya calcula una sola vez las tiendas de la web: nada que hacer.';
    return;
  end if;
  foreach v_ancla in array array['with web as (', 'precio_de as ('] loop
    if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
      raise exception 'fn_tienda_precio_talla cambió: «%» no aparece exactamente una vez. No se tocó nada.', v_ancla;
    end if;
  end loop;
  v_def := replace(v_def, 'with web as (', 'with web as materialized (');
  v_def := replace(v_def, 'precio_de as (', 'precio_de as materialized (');
  execute v_def;
end
$catalogo$;

reset lock_timeout;

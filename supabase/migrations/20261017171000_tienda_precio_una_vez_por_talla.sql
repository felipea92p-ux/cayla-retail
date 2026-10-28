-- ============================================================================
-- 20261017171000_tienda_precio_una_vez_por_talla.sql — CAYLA V2 · Tienda online (ADR-0408), optimización de carga (2026-10-17)
--
-- EL PROBLEMA PRIMERO. El 17-oct, con 298 prendas publicadas en la Vitrina, `tienda_catalogo` tardaba 2,36 s de media en producción
-- y llegó a 4,94 s (`pg_stat_statements`, desde el 16-oct 16:55), a un paso del `statement_timeout` de 5 s del usuario de la tienda
-- (`tienda_web_prod`): con unas pocas prendas más vuelve el «No pudimos cargar las prendas» del 15-oct. Los looks (`tienda_looks`,
-- 2,76 s; `tienda_look`, 3,69 s) arman el catálogo por dentro y caían igual. Medido en una carga (`pg_stat_xact_user_functions`):
-- `fn_precio_en_sede` se llamó 31 914 veces = 1 773 tallas × 2 tiendas de la web × 9. En `fn_tienda_precio_talla`, las CTE `base` y
-- `con_campana` se usan una sola vez cada una, así que Postgres (desde la 12) las mete dentro de la consulta principal y vuelve a
-- calcular `precio_lista` (y con él el máximo entre las tiendas) en CADA lugar donde se nombra: la columna, el «¿se ofrece?», el
-- precio final y las cuatro preguntas «¿tiene descuento?». Es la misma trampa que `20261015215000` arregló en las CTE `web` y
-- `precio_de` de esta misma función.
--
-- ANALOGÍA CAYLA. Para ponerle precio a una blusa, la vendedora llama a las dos tiendas que venden en la web; después vuelve a llamar
-- a las dos para ver el descuento, otra vez para escribir la etiqueta, y así nueve veces, aunque la respuesta nunca cambia. Se
-- pregunta una vez y se anota.
--
-- QUÉ HACE. Marca `base` y `con_campana` como `materialized`: cada precio de cada talla en cada tienda se calcula una sola vez por
-- llamada (de 31 914 a 3 546 llamadas a `fn_precio_en_sede` en una carga del catálogo). Nada más cambia: ni la regla del precio (`fn_precio_en_sede`, el máximo entre las tiendas con «Todas»), ni la campaña, ni
-- lo que devuelve. Medido contra los datos de producción con una copia temporal de la función (sin tocar la viva), dos corridas: el
-- cálculo de precios del catálogo pasa de 1,3–1,8 s a 0,16–0,18 s, con las mismas 1 773 filas, la misma suma de precios de lista
-- (S/ 103 851,58) y final (S/ 103 769,78) y las mismas 15 campañas.
--
-- DECIDÍ: un reemplazo anclado sobre la función viva (el patrón de 20261015215000 y ADR-0377), no reescribirla: cambia solo dos
--   palabras, conserva dueño, permisos y comentario (`create or replace`), y se detiene sin tocar nada si un ancla no aparece
--   exactamente una vez. Idempotente: si ya están materializadas, avisa y no hace nada.
-- DESCARTÉ: subir el `statement_timeout` de la tienda (la página tardaría 5 s en vez de fallar, y crecería con cada prenda) y
--   calcular el precio con un join a `precios_sede_prenda` aquí (sería una segunda regla del precio de la tienda; `fn_precio_en_sede`
--   es la única, CLAUDE.md «Familias fuera de los motores»).
--
-- SE ROMPE SI: alguien reescribe `fn_tienda_precio_talla` sin el `materialized` (vuelve la lentitud, no un error). Lo vigila
--   `pnpm pruebas:tienda-rapida` (sección 1: cuenta las llamadas a `fn_precio_en_sede` en una carga y compara la salida contra la
--   versión sin materializar, con su mutante).
--
-- PRODUCCIÓN. Se aplica con el OK de Felipe (2026-10-17) junto con 20261017172000 y 20261017173000, una por una, comprobando antes el
-- md5 de la función viva. Una sola parte, sin políticas, disparadores ni `alter` de tablas (ADR-0195); ningún ancla lleva la palabra
-- con que se guarda una consulta en una variable (ADR-0288).
-- ============================================================================
set lock_timeout = '3s';

do $precio_una_vez$
declare
  v_def text := pg_get_functiondef('retail.fn_tienda_precio_talla(uuid[], uuid)'::regprocedure);
  v_ancla text;
begin
  if position('  base as materialized (' in v_def) > 0 and position('  con_campana as materialized (' in v_def) > 0 then
    raise notice 'fn_tienda_precio_talla ya calcula una sola vez el precio de cada talla: nada que hacer.';
    return;
  end if;
  foreach v_ancla in array array['  base as (', '  con_campana as ('] loop
    if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
      raise exception 'fn_tienda_precio_talla cambió: «%» no aparece exactamente una vez. No se tocó nada.', v_ancla;
    end if;
  end loop;
  v_def := replace(v_def, '  base as (', '  base as materialized (');
  v_def := replace(v_def, '  con_campana as (', '  con_campana as materialized (');
  execute v_def;
end
$precio_una_vez$;

reset lock_timeout;

-- 6 · Huellas por LÍNEA de `fn_orden_produccion` — SOLO LECTURA (ADR-0597). Devuelve una celda: las 5 primeras letras del md5 de cada línea (sin espacios en los bordes), en orden.
-- Se alinea con la misma celda de una base local al día para ver qué líneas son distintas en producción. No lleva texto de la función, solo huellas.
select string_agg(left(md5(btrim(l)), 5), ' ' order by n) as lineas, count(*) as total
from regexp_split_to_table(pg_get_functiondef('retail.fn_orden_produccion(uuid)'::regprocedure), E'\n') with ordinality as t(l, n);

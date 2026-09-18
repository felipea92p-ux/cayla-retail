-- ============================================================================
-- 20260918100000 — Semilla de Patrones + retira "Estampado"/"Animal print"/
-- "Multicolor" de Colores (quedaron ahí por accidente, sin usar todavía)
--
-- EL HALLAZGO
--   `retail.colores` trae desde el 15-sep (20260915230000_colores_tipo_y_muestra.sql)
--   un campo `tipo` (solido/textura/estampado) pensado para diferenciar si un
--   color como "Azul marino" es liso, jaspeado, o tiene un estampado ENCIMA
--   de esa familia de color. Dos días después (17-sep, ADR-0095) se creó
--   `retail.patrones` como vocabulario propio para lo mismo, sin reconciliar
--   los dos mecanismos — la misma pregunta resuelta dos veces (principio 2).
--   Felipe cargó "Estampado"/"Multicolor"/"Animal print" en Colores (con
--   `tipo='solido'` y una foto de textura como muestra, sin hex real —
--   `#c9b79c` repetido en los 3, un valor de relleno) antes de que existiera
--   la pantalla de Patrones. Verificado antes de tocar nada: 0 variantes
--   usan esos 3 códigos — nada que migrar.
--
-- POR QUÉ VAN A PATRONES Y NO SE QUEDAN EN COLORES
--   Investigado contra el estándar real (Google Merchant Center) y cómo lo
--   hacen Zara/H&M/ASOS en producción: Color y Patrón son SIEMPRE ejes
--   separados — "lunares"/"cuadros" van en el atributo pattern, nunca en
--   color. Y "multicolor" está EXPLÍCITAMENTE prohibido como valor de color
--   en la especificación de Google.
--
-- POR QUÉ "MULTICOLOR" NO ENTRA A NINGÚN VOCABULARIO CERRADO TODAVÍA
--   No es un color (prohibido por el estándar) ni tampoco un patrón (una
--   prenda a rayas puede ser blanco/negro O multicolor — son preguntas
--   independientes, no la misma). Forzarlo en cualquiera de los dos ejes
--   sería el caso especial que el principio 6 pide resolver rediseñando,
--   no acomodando. Se deja fuera a propósito.
--
-- SIN BORRAR DATOS: las 3 filas de Colores se DESACTIVAN (nunca DELETE),
-- consistente con catálogos con historial.
-- ============================================================================

set search_path = retail, public, extensions;

update retail.colores set activo = false
where codigo in ('EST', 'MUL', 'ANI');

alter table retail.patrones disable trigger patrones_estado_biut;

insert into retail.patrones (nombre, estado, activo, notas)
values
  ('Liso', 'aprobado', true, 'Sin estampado — la mayoría del catálogo hoy. Vive acá y no como ausencia de patrón, para poder filtrar "todo lo liso" igual que cualquier otro valor.'),
  ('Rayas', 'aprobado', true, 'Confirmado como valor real de patrón en Zara/H&M/ASOS (filtro "Striped"). Camisas y Blusas, Vestidos, Polos.'),
  ('Cuadros', 'aprobado', true, 'Confirmado en Google Merchant Center (pattern: plaid/checkered). Camisas y Blusas, Faldas.'),
  ('Lunares', 'aprobado', true, 'Confirmado en Google Merchant Center (pattern: polka dot). Vestidos, Blusas.'),
  ('Floral', 'aprobado', true, 'Vestidos, Blusas, Faldas.'),
  ('Animal print', 'aprobado', true, 'Confirmado como filtro real de patrón (no de color) en Zara/H&M/ASOS. Vestidos, Blusas, Tops — tendencia vigente 2026.'),
  ('Estampado', 'aprobado', true, 'Genérico — cuando el diseño no encaja en ninguno de los anteriores (logos, gráficos, ilustraciones).')
on conflict (retail.fn_clave_texto(nombre)) do nothing;

alter table retail.patrones enable trigger patrones_estado_biut;

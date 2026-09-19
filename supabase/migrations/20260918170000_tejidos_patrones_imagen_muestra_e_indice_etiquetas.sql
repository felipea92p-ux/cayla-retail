-- ============================================================================
-- 20260918170000_tejidos_patrones_imagen_muestra_e_indice_etiquetas.sql — CAYLA V2
--
-- RECONSTRUCCIÓN DESDE EL ESTADO VIVO DE PRODUCCIÓN. Estos objetos existen en producción
-- (`cayla-dynamic`) y no en el repo. Se detectó el 2026-09-18 al comparar `retail` por huella
-- md5 (BACKLOG, "Comparación completa `retail`"). No hay SQL original que recuperar: el
-- registro de migraciones de producción no guarda ninguna sentencia que los cree, así que
-- se reprodujeron desde `information_schema`, `pg_indexes` y `col_description`.
--
-- VERSIÓN. No es la de producción (no hay una registrada para esto): lleva la fecha de hoy,
-- que ordena después de todo lo demás. Es independiente e idempotente, así que su posición
-- no importa mientras `tejidos`, `patrones` y `variante_etiquetas` ya existan.
--
-- QUÉ HACE.
--   1. `tejidos.imagen_muestra_url` y `patrones.imagen_muestra_url`: foto de muestra, mismo
--      patrón que `colores.imagen_muestra_url` (`20260915230000_colores_tipo_y_muestra`),
--      mismo bucket público `retail-colores-muestras` en su propia carpeta. Nullable, sin
--      default: null = dibujo de respaldo por nombre. Hoy el front solo usa la de
--      `colores`; no hay pantalla que lea estas dos.
--   2. Índice `variante_etiquetas_etiqueta_idx` sobre `etiqueta_id`: la llave primaria es
--      `(variante_id, etiqueta_id)`, que no sirve para buscar por etiqueta sola (por ejemplo,
--      "qué variantes tienen la etiqueta X").
--
-- IDEMPOTENTE: `add column if not exists`, `create index if not exists` y `comment on`
-- no cambian nada en producción, donde ya existe todo.
--
-- SE ROMPE SI: nada — es solo esquema y nada lo lee todavía.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.tejidos add column if not exists imagen_muestra_url text;
alter table retail.patrones add column if not exists imagen_muestra_url text;

comment on column retail.tejidos.imagen_muestra_url is
  'Foto real de la tela, bucket público retail-colores-muestras (carpeta tejidos/). Null = dibujo de respaldo por nombre.';
comment on column retail.patrones.imagen_muestra_url is
  'Foto real del estampado, bucket público retail-colores-muestras (carpeta patrones/). Null = dibujo de respaldo por nombre.';

create index if not exists variante_etiquetas_etiqueta_idx on retail.variante_etiquetas (etiqueta_id);

-- ============================================================================
-- 20260917201500_producto_estado_publicacion.sql — CAYLA V2
--
-- CONTEXTO: `productos.estado` (0002_esquema.sql:39) responde una sola
-- pregunta — "¿esto se sigue vendiendo?" (activo/descontinuado). No existe
-- ninguna noción de si un producto está LISTO para mostrarse: hoy un
-- producto recién creado (sin fotos, sin variantes completas) aparece en
-- /productos y en Vender exactamente igual que uno terminado, visible para
-- cualquier colaborador de sede. Confirmado por grep de
-- "publicacion|borrador|draft" sobre supabase/migrations/ para productos:
-- cero resultados. El único precedente del patrón "estado borrador" en
-- este repo es en OTRO dominio — ADR-0007, que lo descartó para
-- `comprobantes` por mezclar un documento sin peso legal con uno que sí lo
-- tiene. Ese es el "por qué" de la decisión de abajo: sirve de referencia
-- de diseño (dos ejes de estado no se mezclan en una sola columna), no
-- como algo ya construido para productos.
--
-- DECIDÍ: `estado_publicacion` en una columna PROPIA, eje DISTINTO de
-- `estado`. Un producto puede estar `estado = 'activo'` (sigue
-- vendiéndose) y `estado_publicacion = 'borrador'` (nadie lo ve todavía)
-- AL MISMO TIEMPO — es el caso normal de un producto recién cargado, con
-- stock en camino, pero sin fotos/variantes terminadas.
-- DESCARTÉ: reusar `estado` agregando un tercer valor tipo 'borrador' ahí
-- mismo, porque mezclaría "¿vende?" con "¿se muestra?" en una sola
-- columna — el día que alguien filtre por `estado = 'activo'` para un
-- reporte de ventas tendría que acordarse de que eso NO significa
-- "publicado", exactamente el mismo costo que ADR-0007 ya identificó para
-- comprobantes/proformas.
-- SE ROMPE SI: alguien agrega un tercer eje de estado a `productos` sin
-- pasar por esta misma disciplina (columna propia, nunca un valor extra en
-- una columna que ya significa otra cosa) — volveríamos al problema que
-- esto resuelve.
--
-- Default 'borrador' para todo lo NUEVO desde ahora. Backfill explícito
-- para lo que YA existe: se asume publicado — nadie lo escondía hasta hoy,
-- así que esconderlo retroactivamente sacaría productos reales de Vender
-- sin que nadie lo pidiera.
-- ============================================================================

set search_path = retail, public, extensions;

alter table productos
  add column if not exists estado_publicacion text not null default 'borrador'
  check (estado_publicacion in ('borrador', 'activo', 'archivado'));

comment on column productos.estado_publicacion is
  'Eje DISTINTO de `estado`: `estado` responde "¿este producto sigue vendiéndose?" (activo/descontinuado); `estado_publicacion` responde "¿está listo para mostrarse en el catálogo/Vender?" (borrador/activo/archivado). Un producto puede estar estado=''activo'' y estado_publicacion=''borrador'' a la vez (recién cargado, con stock, pero todavía nadie lo ve en Vender porque falta completarlo). Default ''borrador'' para todo lo nuevo desde 2026-09-17; ver ADR-0094.';

-- Todo lo que ya estaba en el catálogo antes de esta migración se asume
-- publicado (ver "DECIDÍ" arriba) — sin este UPDATE, el DEFAULT de la
-- columna nueva dejaría el catálogo entero invisible en /productos y
-- Vender para cualquier colaborador de sede desde el primer `db reset`.
update productos set estado_publicacion = 'activo' where estado_publicacion = 'borrador';

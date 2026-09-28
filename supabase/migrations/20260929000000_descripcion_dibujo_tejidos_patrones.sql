-- ============================================================================
-- 20260929000000_descripcion_dibujo_tejidos_patrones.sql — CAYLA V2
--
-- QUÉ HACE. Agrega `descripcion_dibujo text` a `retail.tejidos` y `retail.patrones`: la frase que un Líder escribió
-- en «Generar dibujo» (ADR-0256), p.ej. «rayas azul marino finas sobre crudo». Antes de esto, `GeneradorDibujo` ya
-- prefería la descripción sobre el nombre para elegir la familia/textura y el color (`lib/dibujo-generado.ts:212,226`
-- — el nombre solo era respaldo de un vocabulario cerrado), pero la frase nunca se guardaba: al reabrir «Generar
-- dibujo» sobre un tejido o patrón YA existente, el campo volvía a estar vacío y la lectura caía de nuevo al nombre.
-- Con esta columna la frase sobrevive a la sesión: un patrón viejo (creado solo con nombre) gana su propia
-- descripción la primera vez que alguien la escribe y guarda, sin tener que renombrarlo.
--
-- Nullable, sin default: null = nunca se describió (el generador sigue cayendo al nombre, como siempre).
--
-- SE ROMPE SI: nada — es solo esquema; el wiring de API/UI que la llena y la lee va en el mismo cambio.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.tejidos add column if not exists descripcion_dibujo text;
alter table retail.patrones add column if not exists descripcion_dibujo text;

comment on column retail.tejidos.descripcion_dibujo is
  'Frase de «Generar dibujo» (ej. "denim azul claro, grueso"): fuente primaria del dibujo generado, por encima del nombre. Null = nunca se describió.';
comment on column retail.patrones.descripcion_dibujo is
  'Frase de «Generar dibujo» (ej. "rayas azul marino finas sobre crudo"): fuente primaria del dibujo generado, por encima del nombre. Null = nunca se describió.';

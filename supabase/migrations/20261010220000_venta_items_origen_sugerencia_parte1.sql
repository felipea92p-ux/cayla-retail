-- «Combina bien con» deja huella en la venta (Felipe, 2026-10-10): qué líneas del ticket entraron desde la sugerencia de prendas de
-- Vender ▸ «Todo de la prenda». Es la única forma de saber si la sugerencia vende: el POS solo no captura impresiones, y sin marca
-- cualquier orden futuro de la tira queda como opinión. La línea base de solo lectura está en `scripts/combina/linea-base.sql`.
--
-- PARTE 1 de 2: la columna y su candado. Se pega SOLA en el SQL Editor de producción (ADR-0195: un `alter` de una tabla en uso no se
-- mezcla con políticas ni con `drop trigger`; aquí no hay ninguno). Idempotente. La parte 2 (20261010220100) enseña a
-- `registrar_venta` a escribirla. Mientras la parte 2 no esté, la caja ya manda `origen_sugerencia` en el jsonb y la función lo ignora.
set lock_timeout = '3s';

alter table retail.venta_items add column if not exists origen_sugerencia text;

-- Un solo origen por ahora; si algún día hay otra sugerencia (la del ticket, la de Existencias), entra aquí con su nombre.
alter table retail.venta_items drop constraint if exists venta_items_origen_sugerencia_valido;
alter table retail.venta_items
  add constraint venta_items_origen_sugerencia_valido
  check (origen_sugerencia is null or origen_sugerencia in ('combina_bien_con'))
  not valid;
alter table retail.venta_items validate constraint venta_items_origen_sugerencia_valido;

comment on column retail.venta_items.origen_sugerencia is
  'De dónde salió esta línea si no la buscó la colaboradora: «combina_bien_con» = la tocó en la sugerencia de prendas de «Todo de la prenda» (Vender). NULL = la escaneó o la eligió en la grilla.';

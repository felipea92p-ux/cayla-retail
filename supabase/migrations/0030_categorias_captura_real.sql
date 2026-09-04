-- Alinea la taxonomía de indumentaria con lo que CAYLA vende de verdad, según el
-- historial real de compras (SINATRA, jul-2026 — ver docs/PLAN-DE-TRABAJO.md §4).
-- Aprobado por Felipe el 2026-09-03, antes de arrancar el plan de captura del
-- catálogo real (§5): sin esto, cientos de prendas reales entrarían forzadas en
-- categorías que no les quedan (Enterizos pegado a Vestidos, Conjuntos sin dónde ir).
--
-- QUÉ PROMETE: 5 categorías nuevas en la familia 'indumentaria', con tallas
-- sugeridas razonables (editables sin migración — tallas_sugeridas no es un
-- candado, solo alimenta el <select> de "Recibir mercadería").
-- QUÉ ASUME: la familia 'indumentaria' ya existe (0009) y su check constraint ya
-- la permite — no hace falta tocar el esquema, solo insertar filas.
-- POR QUÉ ESTAS 5: respaldadas por compras reales, no adivinadas —
-- Conjuntos (119 compras), Chalecos (66), Bodys (51), Enterizos (hoy mezclado
-- dentro de "Vestidos & Enterizos", 108 compras combinadas) y Blazers/Sacos.
-- CÓMO SE REVIERTE: delete de las 5 filas por nombre — no tienen productos
-- todavía (el catálogo real no está cargado), así que no hay FK que se rompa.

insert into categorias (familia, nombre, tallas_sugeridas) values
  ('indumentaria', 'Conjuntos', array['XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Enterizos', array['XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Chalecos', array['XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Bodys', array['XS','S','M','L','XL']),
  ('indumentaria', 'Blazers/Sacos', array['XS','S','M','L','XL','XXL'])
on conflict (familia, nombre) do nothing;

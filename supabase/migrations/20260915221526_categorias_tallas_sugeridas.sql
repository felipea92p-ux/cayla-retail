-- ============================================================================
-- 20260915221526_categorias_tallas_sugeridas.sql — CAYLA V2
--
-- Repone `categorias.tallas_sugeridas`, columna que V1 tenía y que el corte
-- V1→V2 (0af2f1b, 2026-09-12) no trajo. No es un candado — `variantes.talla`
-- sigue siendo texto libre (decisión ya tomada, docs/BITACORA.md 2026-09-09:
-- "agregar tallas tarde es barato, agregar colores tarde es caro"). Es solo
-- la lista que el formulario de alta propone como chips para no escribir
-- "Extra Grande" donde el resto del catálogo dice "XL". El orden de
-- visualización de cualquier talla (sugerida o no) ya lo resuelve
-- apps/web/lib/tallas.ts → compararTallas(), no depende de esta columna.
--
-- Valores reconstruidos desde lo que V1 ya tenía sembrado, no adivinados de
-- nuevo: supabase/unificacion/19_categorias_completas.sql (32 categorías) +
-- backups/cayla-v1/project-files/migrations/0030_categorias_captura_real.sql
-- (las 5 que le faltaban al primero: Conjuntos, Enterizos, Chalecos, Bodys,
-- Blazers/Sacos). Las 37 nombres calzan exacto con las que
-- 20260912235500_vocabulario_cerrado.sql ya sembró en V2.
-- ============================================================================

alter table retail.categorias add column if not exists tallas_sugeridas text[];

comment on column retail.categorias.tallas_sugeridas is
  'Lista sugerida para el formulario de alta de producto — no es candado, '
  'variantes.talla sigue siendo texto libre. Existía en V1 y se perdió en el '
  'corte V1→V2 del 2026-09-12. Repuesta con los valores que V1 tenía, no '
  'adivinados de nuevo (ver cabecera del archivo).';

update retail.categorias as c set tallas_sugeridas = v.tallas
from (values
  ('Blusas',                 array['Estándar','XS','S','M','L','XL','XXL']),
  ('Camisas',                array['Estándar','XS','S','M','L','XL','XXL']),
  ('Polos/Camisetas',        array['Estándar','XS','S','M','L','XL','XXL']),
  ('Poleras/Sudaderas',      array['Estándar','XS','S','M','L','XL','XXL']),
  ('Chompas',                array['Estándar','XS','S','M','L','XL','XXL']),
  ('Tops',                   array['Estándar','XS','S','M','L','XL','XXL']),
  ('Vestidos',               array['XS','S','M','L','XL','XXL']),
  ('Faldas',                 array['XS','S','M','L','XL','XXL']),
  ('Pantalones',             array['26','28','30','32','34']),
  ('Jeans',                  array['26','28','30','32','34']),
  ('Shorts/Bermudas',        array['XS','S','M','L','XL','XXL']),
  ('Casacas/Chaquetas',      array['XS','S','M','L','XL','XXL']),
  ('Abrigos',                array['XS','S','M','L','XL','XXL']),
  ('Ropa interior/Lencería', array['XS','S','M','L','XL']),
  ('Trajes de baño',         array['XS','S','M','L','XL']),
  ('Conjuntos',              array['XS','S','M','L','XL','XXL']),
  ('Enterizos',              array['XS','S','M','L','XL','XXL']),
  ('Chalecos',               array['XS','S','M','L','XL','XXL']),
  ('Bodys',                  array['XS','S','M','L','XL']),
  ('Blazers/Sacos',          array['XS','S','M','L','XL','XXL']),
  ('Zapatillas',             array['34','35','36','37','38','39','40','41','42']),
  ('Sandalias',              array['34','35','36','37','38','39','40','41','42']),
  ('Botas',                  array['34','35','36','37','38','39','40','41','42']),
  ('Zapatos formales',       array['34','35','36','37','38','39','40','41','42']),
  ('Carteras/Bolsos',        null::text[]),
  ('Mochilas',               null::text[]),
  ('Cinturones',             array['S','M','L','XL']),
  ('Bufandas/Chalinas',      null::text[]),
  ('Gorros/Sombreros',       array['Único']),
  ('Lentes de sol',          array['Único']),
  ('Pulseras',               array['Único']),
  ('Aretes',                 array['Único']),
  ('Anillos',                array['6','7','8','9']),
  ('Collares',               array['Único']),
  ('Maquillaje',             array['Único']),
  ('Lapiceros',              array['Único']),
  ('Colores',                array['Único'])
) as v(nombre, tallas)
where c.nombre = v.nombre and c.tallas_sugeridas is null;

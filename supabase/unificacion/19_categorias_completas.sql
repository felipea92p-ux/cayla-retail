-- ============================================================================
-- Repone las 30 categorías originales faltantes en retail.categorias
-- CUERPO SCHEMA-CALIFICADO PARA PRODUCCIÓN — correr en cayla-DYNAMIC.
--
-- Ver `supabase/migrations/0036_categorias_completas.sql` para la causa raíz
-- completa: `04_catalogo.sql` (paso 4 de la unificación) recreó la tabla
-- `retail.categorias` desde cero pero nunca insertó las 30 filas semilla de
-- `0009_categorias.sql` — solo la estructura. Las únicas 5 categorías que
-- SÍ llegaron a producción son las de `0030_categorias_captura_real.sql`
-- (Blazers/Sacos, Bodys, Chalecos, Conjuntos, Enterizos), pegadas después
-- con el prefijo agregado a mano. Faltan las otras 25 — entre ellas Blusas,
-- la que Felipe notó al probar "Recibir mercadería".
--
-- Seguro de correr aunque alguna fila ya exista (`on conflict do nothing`).
--
-- CÓMO SE VERIFICA (correr a mano después de pegar)
--   select familia, count(*) from retail.categorias group by familia order by familia;
--   -- indumentaria debe dar 20 (15 originales + 5 de captura real),
--   -- calzado 4, accesorios 6, bisuteria 4, belleza 1, papeleria 2 → 37 en total.
-- ============================================================================

insert into retail.categorias (familia, nombre, tallas_sugeridas) values
  ('indumentaria', 'Blusas', array['Estándar','XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Camisas', array['Estándar','XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Polos/Camisetas', array['Estándar','XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Poleras/Sudaderas', array['Estándar','XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Chompas', array['Estándar','XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Tops', array['Estándar','XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Vestidos', array['XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Faldas', array['XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Pantalones', array['26','28','30','32','34']),
  ('indumentaria', 'Jeans', array['26','28','30','32','34']),
  ('indumentaria', 'Shorts/Bermudas', array['XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Casacas/Chaquetas', array['XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Abrigos', array['XS','S','M','L','XL','XXL']),
  ('indumentaria', 'Ropa interior/Lencería', array['XS','S','M','L','XL']),
  ('indumentaria', 'Trajes de baño', array['XS','S','M','L','XL']),
  ('calzado', 'Zapatillas', array['34','35','36','37','38','39','40','41','42']),
  ('calzado', 'Sandalias', array['34','35','36','37','38','39','40','41','42']),
  ('calzado', 'Botas', array['34','35','36','37','38','39','40','41','42']),
  ('calzado', 'Zapatos formales', array['34','35','36','37','38','39','40','41','42']),
  ('accesorios', 'Carteras/Bolsos', null),
  ('accesorios', 'Mochilas', null),
  ('accesorios', 'Cinturones', array['S','M','L','XL']),
  ('accesorios', 'Bufandas/Chalinas', null),
  ('accesorios', 'Gorros/Sombreros', array['Único']),
  ('accesorios', 'Lentes de sol', array['Único']),
  ('bisuteria', 'Pulseras', array['Único']),
  ('bisuteria', 'Aretes', array['Único']),
  ('bisuteria', 'Anillos', array['6','7','8','9']),
  ('bisuteria', 'Collares', array['Único']),
  ('belleza', 'Maquillaje', array['Único']),
  ('papeleria', 'Lapiceros', array['Único']),
  ('papeleria', 'Colores', array['Único'])
on conflict (familia, nombre) do nothing;

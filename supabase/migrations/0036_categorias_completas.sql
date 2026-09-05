-- ============================================================================
-- HALLAZGO REAL (encontrado por Felipe probando "Recibir mercadería"):
-- el desplegable de Categoría en producción solo mostraba las 5 categorías
-- de `0030_categorias_captura_real.sql` (Blazers/Sacos, Bodys, Chalecos,
-- Conjuntos, Enterizos) — faltaba "Blusas" y las otras 24 categorías
-- originales de esta migración (`0009_categorias.sql`).
--
-- CAUSA RAÍZ: durante la unificación con Dynamic, `supabase/unificacion/
-- 04_catalogo.sql` recreó la TABLA `retail.categorias` desde cero pero nunca
-- volvió a insertar las 30 filas semilla de `0009` — solo definió la
-- estructura. Cuando después se pegó `0030` (con el prefijo `retail.`
-- agregado a mano, como corresponde), esas 5 filas nuevas fueron las
-- PRIMERAS que existieron en producción, no una adición a las 30 originales.
-- El gap llevaba desde julio sin notarse porque el catálogo real todavía no
-- se había empezado a cargar.
--
-- Repone las 30 originales — `on conflict do nothing` la hace segura de
-- correr aunque alguna ya exista (ninguna debería, pero por si acaso).
-- Versión LOCAL (nombres sin schema) — producción en
-- `supabase/unificacion/19_categorias_completas.sql`.
-- ============================================================================

insert into categorias (familia, nombre, tallas_sugeridas) values
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

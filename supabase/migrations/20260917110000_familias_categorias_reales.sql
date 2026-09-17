-- ============================================================================
-- 20260917110000 — Familias y categorías: el contenido real, no el mecanismo
--
-- Sesión completa con Felipe (2026-09-17), familia por familia, contrastando
-- contra Ralph Lauren, Zara, H&M, Bershka, Hermès, LVMH y un retailer
-- peruano real (Platanitos) para la terminología local. El mecanismo
-- (propone/aprueba, categoría/subcategoría) ya estaba construido — esta
-- migración es el contenido: qué familias y categorías tiene CAYLA de
-- verdad, con qué nombre.
--
-- DECIDÍ: familia sigue siendo 6 valores (`familia` no cambia de enum acá,
-- solo el nombre visible de una) — "accesorios" pasa a mostrarse como
-- "Accesorios y Complementos" (CategoriasLista.tsx), sin migración de datos
-- porque el valor guardado no cambia, solo la etiqueta.
-- DESCARTÉ: "Joyería" y "Ropa de dormir"/"Ropa deportiva" como categorías
-- nuevas — sin precedente en ninguna marca investigada Y sin un solo
-- producto real detrás; mismo criterio que ya sacó a Papelería de la
-- primera versión de esta lista (Felipe la confirmó real después, se queda).
-- ============================================================================

-- ---------- 0. Limpieza: la categoría huérfana "Polos" (familia null, basura de V1) ----------
-- Tenía un producto de prueba (POL-001, ya descontinuado) colgando. Se
-- reasigna a la categoría real antes de borrar la fila huérfana — nunca se
-- pierde el producto, solo cambia a dónde apunta.
update retail.productos
  set categoria_id = (select id from retail.categorias where nombre = 'Polos/Camisetas')
  where categoria_id = (select id from retail.categorias where nombre = 'Polos' and familia is null);

delete from retail.categorias where nombre = 'Polos' and familia is null;

-- ---------- 1. Indumentaria: fusiones, renombres y archivado ----------
-- Blusas se fusiona con Camisas (Ralph Lauren: "Camisas y blusas"; Zara:
-- "Shirts | Blouses" — ambas las tratan como una sola categoría). Los
-- productos de prueba de Blusas pasan a Camisas antes de archivarla.
update retail.productos
  set categoria_id = (select id from retail.categorias where nombre = 'Camisas')
  where categoria_id = (select id from retail.categorias where nombre = 'Blusas');

update retail.categorias set activo = false where nombre = 'Blusas';
update retail.categorias set activo = false where nombre = 'Trajes de baño';

update retail.categorias set nombre = 'Camisas y Blusas' where nombre = 'Camisas';
update retail.categorias set nombre = 'Blazers' where nombre = 'Blazers/Sacos';
update retail.categorias set nombre = 'Casacas' where nombre = 'Casacas/Chaquetas';
update retail.categorias set nombre = 'Poleras' where nombre = 'Poleras/Sudaderas';
update retail.categorias set nombre = 'Polos' where nombre = 'Polos/Camisetas';
update retail.categorias set nombre = 'Shorts' where nombre = 'Shorts/Bermudas';
-- Abrigos, Bodys, Chalecos, Chompas, Conjuntos, Enterizos, Faldas, Jeans,
-- Pantalones, Ropa interior/Lencería, Tops, Vestidos: sin cambios.

-- ---------- 2. Calzado: 3 categorías nuevas, respaldadas por Ralph Lauren/Zara/Fendi ----------
insert into retail.categorias (nombre, familia, prefijo) values
  ('Botines', 'calzado', 'BOI'),
  ('Mocasines', 'calzado', 'MSN'),
  ('Bailarinas', 'calzado', 'BAI');
-- Botas, Sandalias, Zapatillas, Zapatos formales: sin cambios.

-- ---------- 3. Accesorios y Complementos: renombres + 2 categorías nuevas ----------
-- La familia sigue guardándose como 'accesorios' — el nombre visible
-- "Accesorios y Complementos" se resuelve en CategoriasLista.tsx.
update retail.categorias set nombre = 'Gorros y Sombreros' where nombre = 'Gorros/Sombreros';
update retail.categorias set nombre = 'Pañuelos y Pañoletas' where nombre = 'Bufandas/Chalinas';
update retail.categorias set nombre = 'Bolsos y Carteras' where nombre = 'Carteras/Bolsos';

insert into retail.categorias (nombre, familia, prefijo) values
  ('Relojes', 'accesorios', 'REL'),
  ('Riñoneras', 'accesorios', 'RIN');
-- Cinturones, Lentes de sol, Mochilas: sin cambios.

-- ---------- 4. Papelería: 2 categorías nuevas ----------
insert into retail.categorias (nombre, familia, prefijo) values
  ('Libretas/Cuadernos', 'papeleria', 'LIB'),
  ('Útiles de oficina', 'papeleria', 'UOF');
-- Lapiceros, Colores: sin cambios.

-- Belleza (Maquillaje) y Bisutería (Anillos/Aretes/Collares/Pulseras): sin cambios.

-- ============================================================================
-- 20260918140000 — Semilla de Tejidos: 17 valores reales, investigados y
-- negociados con Felipe (no una lista genérica de manual de costura)
--
-- DE DÓNDE SALIÓ ESTA LISTA
--   Dos fuentes reales, no una lista de blog: (1) el estándar internacional
--   (Google Merchant Center, cómo lo hacen Zara/H&M/ASOS) y (2) el
--   vocabulario real de los proveedores de Gamarra — La Victoria, Lima
--   (proveedores.gamarra.com.pe/category/telas/), que distingue Tejido de
--   Punto (Jersey, Rib, Piqué...) de Tejido Plano (Denim, Drill, Popelina,
--   Gabardina, Corduroy...). Dos fibras peruanas reales incluidas por ser
--   el diferenciador de CAYLA frente a fast fashion importado: algodón pima
--   (fibra ~35% más larga que el algodón convencional, Piura) y alpaca
--   (Perú tiene el 87% de la población mundial).
--
-- DECISIONES DE FELIPE EN EL CAMINO (para no repetir la pregunta)
--   - Un solo nombre por concepto, nunca combinado con "/": "Licra" cubre
--     Full Lycra; "Jersey" cubre Interlock; "Rib" no se separa de "Rib
--     licrado".
--   - Piqué sí entra — es el tejido real de un polo clásico.
--   - Tocuyo, French Terry, Punto Inglés, Gamuza y Jacquard quedan fuera de
--     esta tanda — sin evidencia de que el catálogo real los use todavía
--     (mismo criterio que ya se aplicó en Etiquetas: no cargar la cola
--     larga sin evidencia, se agregan cuando el censo real los pida).
--
-- TEJIDO DE PUNTO (elástico) vs TEJIDO PLANO (no se estira)
--   No se modela como columna nueva — la distinción vive en `notas` de cada
--   fila. Construir un eje aparte para esto hoy sería sobre-construir para
--   un volumen que no ha llegado (principio 5): con 17 valores y un Líder
--   decidiendo qué tejido tiene cada producto, la nota basta.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.tejidos disable trigger tejidos_estado_biut;

insert into retail.tejidos (nombre, estado, activo, notas)
values
  -- Fibras peruanas premium — el diferenciador real de CAYLA
  ('Algodón pima', 'aprobado', true, 'Fibra peruana premium (~35% más larga que el algodón convencional, costa norte/Piura) — reconocida entre las mejores del mundo junto al pima egipcio. Polos, Camisas y Blusas de línea alta.'),
  ('Alpaca', 'aprobado', true, 'Fibra peruana de lujo real, no marketing — Perú tiene el 87% de la población mundial de alpacas, más fina que la cachemira, térmica y antialérgica. Chompas, Abrigos, Casacas de invierno.'),

  -- Básicos de tejido plano
  ('Algodón', 'aprobado', true, 'El básico de uso diario. Polos, Camisas y Blusas, Vestidos, Shorts.'),
  ('Denim', 'aprobado', true, 'Jeans — sin esto no hay Jeans que describir.'),
  ('Drill', 'aprobado', true, 'Tejido plano de Gamarra, firme, tipo uniforme/workwear. Pantalones, Casacas.'),
  ('Lino', 'aprobado', true, 'Blusas, Vestidos de verano — transpirable, fresco.'),
  ('Seda', 'aprobado', true, 'Blusas, Vestidos de vestir/formales.'),
  ('Viscosa', 'aprobado', true, 'Tejido de punto de Gamarra — liviana, veraniega. Blusas, Faldas, Vestidos.'),
  ('Poliéster', 'aprobado', true, 'Chalecos, Casacas — resistente, se mezcla con otros tejidos.'),
  ('Popelina', 'aprobado', true, 'Tejido plano de Gamarra, clásico y firme. Camisas y Blusas de vestir.'),
  ('Gabardina', 'aprobado', true, 'Tejido plano de Gamarra, más grueso que la popelina. Pantalones, Casacas de vestir.'),
  ('Pana', 'aprobado', true, 'Corduroy en el vocabulario de Gamarra — nombre real en español de Perú. Pantalones, Faldas, Casacas.'),
  ('Polar', 'aprobado', true, 'Fleece económico, la alternativa real a Alpaca para la mayoría del catálogo de invierno. Abrigos, Casacas.'),

  -- Tejido de punto (elástico) — Gamarra
  ('Licra', 'aprobado', true, 'El tejido que da estiramiento — cubre también lo que Gamarra vende como "Full Lycra". Bodys, Ropa interior/Lencería, Shorts.'),
  ('Jersey', 'aprobado', true, 'Tejido de punto básico — cubre también lo que Gamarra vende como "Interlock". Poleras, Tops.'),
  ('Piqué', 'aprobado', true, 'El tejido clásico de polo (textura de panal), confirmado como el real en Zara/H&M/ASOS. Polos.'),
  ('Rib', 'aprobado', true, 'Tejido de punto acanalado de Gamarra — cubre también la variante "Rib licrado". Chompas, cuellos y puños.')
on conflict (retail.fn_clave_texto(nombre)) do nothing;

alter table retail.tejidos enable trigger tejidos_estado_biut;

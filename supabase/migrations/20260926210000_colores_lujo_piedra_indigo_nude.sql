-- ============================================================================
-- 20260926210000 — Colores del lujo: Gris piedra, Índigo y Nude, y sinónimos (ADR-0215, act. b)
--
-- EL PROBLEMA
--   Felipe pidió revisar la paleta contra las marcas que marcan el vocabulario del
--   lujo: Ralph Lauren, las casas de LVMH (Louis Vuitton, Dior, Celine, Loewe,
--   Fendi, Givenchy, Loro Piana, Berluti) y Hermès. La investigación se hizo en vivo
--   el 2026-09-26 (fichas y listados oficiales donde abrieron; Loewe, en su web
--   oficial; Hermès, en tres revendedores). De 62 colores que usan 2 o más de esas
--   marcas, CAYLA cubría 53.
--
-- LO QUE SE MIDIÓ (ΔE2000 contra los 64 colores no metálicos de producción)
--   Entran (no se confunden con ninguno, ΔE ≥ 8):
--     · Gris piedra — el faltante más usado, en 8 marcas (Hermès Beton, LV Galet,
--       Celine Pebble, Dior Stone Gray, Loro Piana Mastic, Loewe Tundra, Fendi
--       Dove Gray, RL Limestone). Es Pantone 14-0105 TCX Overcast, que cae entre las
--       dos referencias del lujo: Moonbeam, el tono sin temporada de NYFW PV25, y
--       Agate Gray, que se cita como equivalente de Hermès Gris Tourterelle.
--       Queda a 8,4 de Gris perla y a 8,9 de Beige.
--     · Índigo — 4 marcas (Hermès Bleu Indigo, LV, RL, Givenchy), y Pantone lo
--       repite como tono sin temporada (NYFW PV27): 19-3928 TCX Blue Indigo. Queda a
--       10,9 de Azul marino. El índigo que se descartó el 25-09 era un azul
--       violáceo saturado; el de Pantone es gris-azulado, y ese sí cabe.
--     · Nude — 2 marcas (Dior, Fendi) y muy de calzado. Es Pantone 12-0911 TCX, que
--       hoy se llama «Peach Taffy» (en listas viejas figuraba como «Nude»).
--       Queda a 8,2 de Beige.
--   Ya estaban, con otro nombre, y entran como SINÓNIMOS: Latte/Capuchino = Arena
--   (ΔE 2,0), Tabaco = Tostado (3,9), Crema = Crudo, Azul hielo = Celeste,
--   Amaranto = Mora, Greige = Topo.
--   Caoba (18-1425 Mahogany) también entraba; Felipe decidió no sumarlo, así que
--   «castaño» apunta a Marrón.
--
-- NOMBRE: «Gris piedra», no «Piedra» a secas (Felipe preguntó cuál era mejor)
--   «Piedra» a secas se usa en moda (Amazon.es tiene una categoría «pantalón color
--   piedra»), pero en tienda también quiere decir pedrería («vestido de piedras») y
--   lavado a la piedra, que es un denim azul. «Gris piedra» dice su familia y también
--   se usa (Stradivarius España). «piedra» queda como sinónimo, así que el buscador
--   lo encuentra igual.
--
-- ORDEN: DE UNA DECENA A UNA CENTENA POR FAMILIA
--   Con Gris piedra y Nude, Neutro llega a 11 colores y no cabe en 10-19. El orden
--   pasa a una centena por familia (neutro 100-190, azul 200-290, …), de 10 en 10,
--   para poder intercalar sin renumerar cada vez. Solo decide en qué lugar se
--   muestra; no toca códigos ni SKU. Los colores creados desde Atributos entran en
--   2000: al final de su familia y de cualquier lista.
--
-- IDEMPOTENTE: el orden se multiplica solo si sigue en decenas (< 100); los inserts
-- llevan `on conflict do nothing`; los sinónimos se AGREGAN sin repetir y no pisan lo
-- que ya había. Solo datos: se pega entero en el SQL Editor.
-- ============================================================================

set lock_timeout = '3s';

-- ---------- Orden: de decenas a centenas ----------
update retail.colores set orden = orden * 10 where orden < 100;

-- ---------- 3 colores nuevos ----------
insert into retail.colores (codigo, nombre, familia_color, hex, orden, tipo, pantone_tcx, sinonimos) values
  ('NUD', 'Nude',        'neutro', '#F2D3BC', 115, 'solido', '12-0911 TCX', array['color piel', 'piel', 'beige rosado']),
  ('GPI', 'Gris piedra', 'neutro', '#C3BDAB', 125, 'solido', '14-0105 TCX', array['piedra', 'greige claro', 'stone']),
  ('IND', 'Índigo',      'azul',   '#49516D', 265, 'solido', '19-3928 TCX', array['azul índigo'])
on conflict do nothing;

update retail.colores set estado = 'aprobado'
  where estado = 'pendiente' and codigo in ('NUD', 'GPI', 'IND');

-- ---------- Sinónimos del lujo para colores que ya existían (se agregan, no se pisan) ----------
update retail.colores c
  set sinonimos = c.sinonimos || array(select x from unnest(v.s) as x where x <> all (c.sinonimos))
from (values
  ('ARN', array['café con leche', 'latte', 'capuchino']),
  ('TOS', array['tabaco']),
  ('CRU', array['crema']),
  ('CEL', array['azul hielo']),
  ('MOA', array['amaranto']),
  ('TOP', array['greige']),
  ('MAR', array['castaño'])
) as v(codigo, s)
where c.codigo = v.codigo and not (v.s <@ c.sinonimos);

-- ============================================================================
-- 20261002191000 — Colores: el #hex de Perla y de Amarillo mantequilla, más distinguibles (ADR-0314)
--
-- EL PROBLEMA
--   Perla (#EAE6DD) y Crudo (#F3ECE0) estaban a ΔE2000 2,1: en pantalla, el mismo color
--   (ΔE2000 es la medida que usa la app para su aviso «se confunde con», umbral 8). Y Amarillo
--   mantequilla (#FFE68A) estaba a 7,2 de Amarillo limón y a 7,8 de Vainilla. Son dos de los
--   cuatro colores creados a mano en producción: no tienen un hex «oficial» que respetar. Medido
--   sobre los 75 colores de producción, 2026-10-02.
--
-- DECIDÍ (Felipe aprobó afinar el #hex, 2026-10-02)
--   · Perla #EAE6DD → #DBDDD9 (se mueve ΔE2000 4,0; sigue siendo un blanco grisáceo y queda a
--     6,1 de su vecino más cercano).
--   · Amarillo mantequilla #FFE68A → #FEDF87 (se mueve 2,3; queda a 8,06 de todos).
--   · Con los dos cambios, el par más cercano entre colores que no son metálicos pasa de 2,12
--     (Crudo–Perla) a 6,03 (Beige–Arena, una pareja canónica que ya se aceptaba).
-- DESCARTÉ
--   · Separar Perla a 8 o más: exige moverla a #D6E1DB, un gris verdoso que ya no es «perla».
--     Con 4 de movimiento se llega a 6,1, y más allá deja de ser el color del nombre.
--   · Mover Crudo en vez de Perla: Crudo es un color canónico con código Pantone; Perla se
--     creó a mano.
--   · Tocar Moka–Tostado (7,9) o Beige–Arena (6,0): los dos son colores canónicos, se
--     distinguen y moverlos es alejarlos de su referencia de tela.
--   · Fusionar Perla con Crudo: tiene 7 variantes con stock; fusionar toca SKUs.
-- SE ROMPE SI
--   · Se quiere que el círculo sea una medición exacta de la tela: el hex de estos dos pasa a
--     ser una aproximación pensada para la pantalla. El Pantone TCX sigue siendo la referencia
--     real; esta migración no lo toca.
--
-- IDEMPOTENTE: cada `update` exige el hex VIEJO (`and hex = …`): si alguien ya lo cambió a
-- mano, no se pisa. Un código que no existe en la base no se toca. Sin políticas ni `alter`.
--
-- DESHACER:
--   update retail.colores set hex = '#EAE6DD' where codigo = 'PER';
--   update retail.colores set hex = '#FFE68A' where codigo = 'AMM';
-- ============================================================================

set lock_timeout = '3s';

update retail.colores set hex = '#DBDDD9' where codigo = 'PER' and upper(hex) = '#EAE6DD';
update retail.colores set hex = '#FEDF87' where codigo = 'AMM' and upper(hex) = '#FFE68A';

-- Verificación (esperado: 2 filas con el hex nuevo):
--   select codigo, nombre, hex from retail.colores where codigo in ('PER', 'AMM') order by codigo;

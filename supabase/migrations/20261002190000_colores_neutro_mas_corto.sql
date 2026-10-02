-- ============================================================================
-- 20261002190000 — Colores: Neutro más corto, Nude, Beige y Arena pasan a Tierra (ADR-0313)
--
-- EL PROBLEMA
--   Con la migración 20261002180000, Neutro quedó en 13 colores en una sola fila (la más larga
--   de la carta; Azul, la siguiente, 11). Tres de esos 13 no son neutros en el sentido estricto
--   de «sin tinte»: Nude, Beige y Arena tienen croma OKLab de 0,047 a 0,069; los otros diez,
--   menos de 0,03 (el más cargado, Gris piedra, 0,026). Medido sobre los 75 colores de
--   producción, 2026-10-02.
--
-- DECIDÍ (Felipe aprobó la opción, 2026-10-02)
--   · Nude, Beige y Arena pasan de neutro a tierra. Neutro queda en 10 y Tierra en 11. La regla
--     es medible: neutro = croma < 0,03; tierra = lo cálido con tinte (croma ≥ 0,035). Escrita
--     en lib/colores-familias.ts.
--   · Arena ya vivía en tierra antes del ADR-0312; solo vuelve. Beige y Arena (ΔE2000 6,0, los
--     dos confundibles) siguen juntos.
-- DESCARTÉ
--   · Nude a Naranja (junto a Durazno, mismo matiz de 59°): deja las filas más parejas pero
--     quien busca «nude» entre los neutros no lo encuentra donde espera; solo por el buscador.
--   · Una familia nueva «Crema»: obliga a cambiar el candado de la base y suma una fila.
-- SE ROMPE SI
--   · Alguien crea un color con croma entre 0,026 y 0,035 (un gris-beige muy suave): el hueco
--     es estrecho y dos personas lo pueden clasificar distinto. Gana el que tenga menos croma.
--   · Esta migración se pega ANTES de que se despliegue la web con la regla nueva: nada se
--     rompe (los códigos de familia son los mismos de siempre), solo la fila se ve distinta.
--
-- IDEMPOTENTE: cada `update` solo toca lo que difiere; un código que no existe en la base
-- simplemente no se toca. Sin políticas ni `alter`: se pega entero en el SQL Editor.
--
-- DESHACER: update retail.colores set familia_color = 'neutro' where codigo in ('NUD','BEI','ARN');
-- ============================================================================

set lock_timeout = '3s';

update retail.colores set familia_color = 'tierra'
  where codigo in ('NUD', 'BEI', 'ARN') and familia_color is distinct from 'tierra';

-- Verificación (esperado: neutro 10, tierra 11):
--   select familia_color, count(*) from retail.colores where activo group by 1 order by 1;

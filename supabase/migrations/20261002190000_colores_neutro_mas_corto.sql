-- ============================================================================
-- 20261002190000 — Colores: Beige, Arena y Topo pasan de Neutro a Tierra (ADR-0314, ajustada por ADR-0317)
--
-- EL PROBLEMA
--   Con la migración 20261002180000, Neutro quedó en 13 colores en una sola fila (la más larga
--   de la carta). Tres de esos 13 son beiges o marrones, no neutros: Beige (croma OKLab 0,055), Arena
--   (0,069) y Topo (0,023, un marrón grisáceo). Medido sobre los 75 colores de producción, 2026-10-02.
--
-- DECIDÍ (Felipe, 2026-10-02: «Beige, Arena y Topo van en Tierra»)
--   · Beige, Arena y Topo pasan de neutro a tierra. Neutro queda en 10 y Tierra en 11.
--   · NUDE SE QUEDA EN NEUTRO (Felipe, 2026-10-02): la primera versión de esta migración también lo movía.
--   · La familia es un DATO, no una regla de croma: Topo tiene menos croma (0,023) que Gris piedra (0,026), que es
--     neutro, así que ninguna frontera por croma pone a uno en cada lado. La excepción queda escrita en
--     lib/colores-familias.ts y en el ADR-0317.
--   · `orden` se renumera con la carta (Tierra pasa de 8 a 11 colores, de 200 a 250 en pasos de 5): Conteo, Editar producto y Vender
--     aún leen `orden` para listar colores, y sin esto Beige, Arena y Topo seguirían apareciendo entre los neutros (BEI 125, ARN 135,
--     TOP 150). Los 16 colores del ADR-0316 siguen en 2000 (al final de esas listas) hasta que se deje de leer `orden`.
--   · Arena ya vivía en tierra antes del ADR-0312; solo vuelve. Beige y Arena (ΔE2000 6,0, los dos confundibles)
--     siguen juntos.
-- DESCARTÉ
--   · Nude a Tierra (lo que decía la primera versión): Nude es el único neutro con tinte visible (0,047), pero quien lo
--     busca lo busca entre los neutros. Felipe prefirió dejarlo donde está.
--   · Una familia nueva «Crema»: obliga a cambiar el candado de la base y suma una fila.
-- SE ROMPE SI
--   · Alguien crea un color con croma entre 0,023 y 0,035 (un gris-beige suave): no hay regla que lo clasifique y dos
--     personas lo pueden poner en lados distintos. Se decide a mano, color por color.
--   · Esta migración se pega ANTES de que se despliegue la web con la carta nueva: nada se rompe (los códigos de familia
--     son los mismos de siempre), solo la fila se ve distinta.
--
-- IDEMPOTENTE: cada `update` solo toca lo que difiere (el de `orden` exige el valor VIEJO); un código que no existe en la base
-- simplemente no se toca. Sin políticas ni `alter`: se pega entero en el SQL Editor. PÉGALA UNA SOLA VEZ: volver a pegarla devuelve a
-- Tierra a un color que un Líder haya movido a mano después.
--
-- DESHACER: update retail.colores set familia_color = 'neutro' where codigo in ('BEI','ARN','TOP');
--   y el orden viejo: BEI 125, ARN 135, TOP 150, CAQ 200, CAM 205, MOK 210, TOS 215, TER 220, MAC 225, MAR 230, CHO 235.
-- ============================================================================

set lock_timeout = '3s';

update retail.colores set familia_color = 'tierra'
  where codigo in ('BEI', 'ARN', 'TOP') and familia_color is distinct from 'tierra';

update retail.colores c
   set orden = v.nuevo
  from (values
    ('BEI', 125, 200), ('ARN', 135, 205), ('CAQ', 200, 210), ('CAM', 205, 215), ('MOK', 210, 220), ('TOS', 215, 225),
    ('TOP', 150, 230), ('TER', 220, 235), ('MAC', 225, 240), ('MAR', 230, 245), ('CHO', 235, 250)
  ) as v(codigo, viejo, nuevo)
 where c.codigo = v.codigo and c.orden = v.viejo;

-- Verificación (esperado: neutro 10, tierra 11; y la banda de Tierra de 200 a 250 en el orden de la carta):
--   select familia_color, count(*) from retail.colores where activo group by 1 order by 1;
--   select codigo, orden from retail.colores where familia_color = 'tierra' and activo order by orden;

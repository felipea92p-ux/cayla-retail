-- ============================================================================
-- 20261002180000 — Colores: familias Rosado y Naranja, y el orden de la carta (ADR-0310)
--
-- EL PROBLEMA
--   Las 9 familias de color mezclaban tres criterios sin prioridad (matiz, rol y acabado):
--   el naranja vivía dentro de Amarillo (Naranja 43°, Durazno 51°, Mandarina 66° de matiz),
--   el rosado dentro de Rojo, y Beige y Arena —a ΔE2000 6,0, los dos colores que la propia
--   revisión del 2026-09-25 marcó como confundibles— caían en familias distintas. Quien
--   busca «Naranja» o «Rosado» no encuentra la fila y termina inventando un color: de los 4
--   que se crearon a mano en producción, «Azul medio» y «Azul Intermedio» son nombres de un
--   ESCALÓN de la escala, no de un color. Medido sobre los 75 colores de producción
--   (2026-10-02, OKLCH): entre 25° y 103° de matiz no hay ni un hueco de 10°, y ahí convivían
--   cinco familias; Azul, Verde y Morado abarcaban 46–69° y sus filas saltaban ~25° de matiz
--   entre vecinos.
--
-- DECIDÍ (Felipe aprobó la opción B, 2026-10-02)
--   · Dos familias nuevas, Rosado y Naranja, y las filas en el orden del espectro (en la web:
--     lib/colores-familias.ts; este archivo solo cambia el candado de la base y los datos).
--   · Se mueven 8 colores: Arena → neutro (para que Beige y Arena queden juntos y la frontera
--     caiga en el salto Arena→Camel, ΔE2000 9,3); Rosado, Palo rosa y Fucsia → rosado;
--     Durazno, Salmón, Mandarina y Naranja → naranja. Coral se queda en Rojo y Mora en Morado
--     (por su nombre, aunque su matiz sea de rosado): Felipe puede revertir cualquiera.
--   · «Amarrillo mantequilla» → «Amarillo mantequilla» (solo el nombre; el código AMM no
--     cambia, es clave primaria). Tiene 1 variante.
--   · `orden` se renumera con el orden de la carta (una centena por familia, de 5 en 5). La
--     web ya NO lo usa para ordenar: lo calcula del color (lib/color-escala.ts). Se renumera
--     solo para que las listas planas que todavía leen `orden` (Vender, Conteo) no contradigan
--     a la carta. Los colores nuevos entran en 2000, al final de esas listas.
-- DESCARTÉ
--   · Dejar las 9 familias y solo reordenar: el naranja seguiría dentro de Amarillo y las filas
--     de Rojo y Amarillo seguirían abarcando 45–60° de matiz.
--   · Fusionar o retirar los 4 colores creados a mano (Azul medio, Perla, Azul Intermedio,
--     Amarrillo mantequilla): ya tienen 23 variantes con stock (12, 7, 3 y 1). Fusionarlos
--     toca SKUs; no se hace aquí.
--   · Una columna `gama` o `tono` guardada: la gama sale del matiz del hex y la claridad de
--     su OKLab; guardarlas es un dato que se desactualiza al editar el hex.
-- SE ROMPE SI
--   · Alguien crea un color con matiz de frontera (36°–45°, un naranja quemado) y dos personas
--     lo clasifican distinto, uno en Tierra y otro en Naranja. La regla de rol (apagado →
--     Tierra, vivo → Naranja) está escrita en lib/colores-familias.ts.
--   · Esta migración se pega DESPUÉS de fusionar la web: la API acepta «rosado»/«naranja» y el
--     candado viejo de la base rechaza crear un color en esas familias. Pegar ANTES.
--
-- IDEMPOTENTE: el candado se suelta y se vuelve a crear (acepta lo mismo o más, nunca menos),
-- y cada `update` solo toca lo que difiere. Sin políticas: se pega entero en el SQL Editor
-- (un `alter` sobre `colores` sin `create policy` en la misma transacción, ver CLAUDE.md).
-- Un código que no existe en la base (local no trae los 4 creados a mano) simplemente no se toca.
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 1. El candado: 11 familias ----------
alter table retail.colores drop constraint if exists colores_familia_color_check;
alter table retail.colores
  add constraint colores_familia_color_check check (familia_color in
    ('neutro', 'tierra', 'rosado', 'rojo', 'naranja', 'amarillo', 'verde', 'azul', 'morado', 'metalico', 'estampado'));

-- ---------- 2. Los 8 colores que cambian de familia ----------
update retail.colores c set familia_color = v.familia
from (values
  ('ARN', 'neutro'),
  ('ROS', 'rosado'), ('PAL', 'rosado'), ('FUC', 'rosado'),
  ('DUR', 'naranja'), ('SAL', 'naranja'), ('MAN', 'naranja'), ('NAR', 'naranja')
) as v(codigo, familia)
where c.codigo = v.codigo and c.familia_color is distinct from v.familia;

-- ---------- 3. Ortografía (solo el nombre; el código no cambia) ----------
update retail.colores set nombre = 'Amarillo mantequilla'
  where codigo = 'AMM' and nombre = 'Amarrillo mantequilla';

-- ---------- 4. El orden de la carta: una centena por familia, de 5 en 5 ----------
-- Generado con la misma tabla que fija lib/color-escala.test.ts (la disposición aprobada).
update retail.colores c set orden = v.orden
from (values
  -- neutro
  ('BLA', 100),
  ('CRU', 105),
  ('PER', 110),
  ('NUD', 115),
  ('GRP', 120),
  ('BEI', 125),
  ('GPI', 130),
  ('ARN', 135),
  ('GRM', 140),
  ('GRI', 145),
  ('TOP', 150),
  ('GRA', 155),
  ('NEG', 160),
  -- tierra
  ('CAQ', 200),
  ('CAM', 205),
  ('MOK', 210),
  ('TOS', 215),
  ('TER', 220),
  ('MAC', 225),
  ('MAR', 230),
  ('CHO', 235),
  -- rosado
  ('ROS', 300),
  ('PAL', 305),
  ('FUC', 310),
  -- rojo
  ('COR', 400),
  ('ROJ', 405),
  ('FRA', 410),
  ('CER', 415),
  ('VIN', 420),
  -- naranja
  ('DUR', 500),
  ('SAL', 505),
  ('MAN', 510),
  ('NAR', 515),
  -- amarillo
  ('AMM', 600),
  ('VAI', 605),
  ('AML', 610),
  ('AMA', 615),
  ('MOS', 620),
  -- verde
  ('PIS', 700),
  ('VEL', 705),
  ('SAV', 710),
  ('VOL', 715),
  ('VEM', 720),
  ('VEA', 725),
  ('ESM', 730),
  ('VER', 735),
  ('VEB', 740),
  -- azul
  ('CEL', 800),
  ('TUR', 805),
  ('AZP', 810),
  ('AZC', 815),
  ('AZD', 820),
  ('AZE', 825),
  ('AZI', 830),
  ('AME', 835),
  ('COB', 840),
  ('IND', 845),
  ('AZM', 850),
  -- morado
  ('LAV', 900),
  ('LIL', 905),
  ('VIO', 910),
  ('MOR', 915),
  ('MAL', 920),
  ('ORQ', 925),
  ('MOA', 930),
  ('CIR', 935),
  ('BER', 940),
  -- metalico
  ('CHA', 1000),
  ('PLA', 1005),
  ('ORR', 1010),
  ('DOR', 1015),
  ('ORV', 1020),
  ('PLV', 1025),
  ('COE', 1030),
  ('BRO', 1035),
  -- tierra
  ('ARE', 290),
  -- estampado
  ('EST', 1100),
  ('MUL', 1105),
  ('ANI', 1110)
) as v(codigo, orden)
where c.codigo = v.codigo and c.orden is distinct from v.orden;

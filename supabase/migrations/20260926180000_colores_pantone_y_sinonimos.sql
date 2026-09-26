-- ============================================================================
-- 20260926180000 — Colores anclados a Pantone TCX, sinónimos y 4 colores nuevos (ADR-0215)
--
-- EL PROBLEMA
--   Un color del ERP era un nombre y un hex de pantalla. Al pedir tela al taller o al
--   proveedor nadie habla en hex: se habla en Pantone TCX (el sistema textil de Pantone).
--   Y el hex lo había puesto cada quien a ojo: Azul eléctrico, Violeta y Cobalto mostraban
--   tonos tan saturados que ningún tinte textil los alcanza. Además, quien escribe como
--   se dice en la tienda («plomo», «guinda», «café») no encontraba el color, y lo natural
--   era proponer uno nuevo: un duplicado que el candado de nombre no frena.
--
-- DECIDÍ (Felipe aprobó «código + muestra oficial», 2026-09-26)
--   · `pantone_tcx`: el código TCX de cada color («19-1557 TCX»). Se eligió el TCX que SE VE
--     igual, no el que se llama igual. Por nombre, Pantone rompía la paleta: su «Mandarin
--     Orange» es nuestro Naranja (ΔE2000 1,8) y su «Bottle Green» es un verde medio, no el
--     oscuro que en Perú se llama verde botella. Excepción pedida por Felipe: Beige y Arena
--     van a sus Pantone de nombre (14-1118 Beige y 15-1225 Sand), que los separa de ΔE 4,3 a 6,0.
--   · El hex pasa al que Pantone publica para ese TCX: 44 de los 56 colores cambian menos de
--     ΔE 3 (a la vista, nada). Los que cambian más son justo los que no existían en tela.
--   · `sinonimos`: cómo le dicen en tienda; el buscador de colores los entiende.
--   · 4 colores nuevos con respaldo en los reportes de Pantone 2024-2027: Cereza (19-1557
--     Chili Pepper, NYFW PV27), Moka (17-1230 Mocha Mousse, Color del Año 2025), Durazno
--     (13-1023 Peach Fuzz, Color del Año 2024) y Mora (18-1716 Damson, NYFW OI25/26).
-- DESCARTÉ
--   · Anclar por nombre de Pantone: creaba 4 casi-duplicados nuevos (ver arriba).
--   · «Azul noche» como color: todo azul noche de Pantone queda a ΔE ≤ 4,9 de Azul marino.
--     Es el mismo color con otro nombre, así que entra como sinónimo de Azul marino.
--   · Una tabla aparte de sinónimos (con clave única por sinónimo): más piezas (RLS, API) para
--     60-70 colores. Un sinónimo repetido entre dos colores solo haría que ambos aparezcan
--     al buscar; la migración siembra la lista sin repetidos.
-- SE ROMPE SI
--   · Alguien crea un color con un TCX que ya tiene otro: la base lo rechaza (índice único),
--     que es lo que se quiere, porque dos colores con el mismo Pantone son el mismo color.
--   · El hex de pantalla de un TCX difiere de la tela real: es una aproximación sRGB que
--     publica Pantone. La fuente de verdad para producción es el código, no el círculo.
--
-- FUENTES (consultadas en vivo el 2026-09-26)
--   · El hex de los 4 nuevos viene de las páginas oficiales de Pantone (reportes de tendencia
--     y Color del Año). El de los demás, de chromafinder.com, que coincidió 110 de 110 con los
--     hex oficiales de Pantone. El nombre de cada TCX también se confirmó en pantone.com.
--   · Asignación: el TCX más cercano (ΔE2000) entre los 2.310 del sistema Fashion, Home +
--     Interiors. Después se revisaron TODOS los pares: los no metálicos quedan en ΔE ≥ 8, salvo
--     dos parejas reales que se aceptan (Blanco–Crudo 4,6 y Beige–Arena 6,0) y Tostado–Moka
--     (8,0, en el borde).
--   · Metálicos: sin TCX (el sistema textil de Pantone no tiene metales); conservan su hex.
--
-- IDEMPOTENTE: columnas e índice con `if not exists`, constraint verificado antes de crearlo,
-- inserts con `on conflict do nothing`, sinónimos solo donde todavía no hay y la nota de
-- Coñac solo si sigue la original. Sin políticas: se pega entero en el SQL Editor
-- (`alter` sobre `colores` sin `create policy` en la misma transacción, ver CLAUDE.md).
-- ============================================================================

set lock_timeout = '3s';

alter table retail.colores add column if not exists pantone_tcx text;
alter table retail.colores add column if not exists sinonimos text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'colores_pantone_tcx_formato') then
    alter table retail.colores
      add constraint colores_pantone_tcx_formato check (pantone_tcx is null or pantone_tcx ~ '^[0-9]{2}-[0-9]{4} TCX$');
  end if;
end;
$$;

-- Dos colores con el mismo Pantone son el mismo color: la base no deja que convivan.
create unique index if not exists colores_pantone_tcx_unico on retail.colores (pantone_tcx) where pantone_tcx is not null;

comment on column retail.colores.pantone_tcx is
  'Código Pantone TCX («19-1557 TCX»): la referencia para pedir la tela. Null en metálicos. Único.';
comment on column retail.colores.sinonimos is
  'Cómo le dicen en tienda («plomo» → Gris). El buscador de colores los entiende.';

-- ---------- 4 colores nuevos (aprobados, igual que los de 20260926100000) ----------
insert into retail.colores (codigo, nombre, familia_color, hex, orden, tipo, pantone_tcx) values
  ('CER', 'Cereza', 'rojo', '#9B1B30', 37, 'solido', '19-1557 TCX'),
  ('MOK', 'Moka', 'tierra', '#A47864', 73, 'solido', '17-1230 TCX'),
  ('DUR', 'Durazno', 'amarillo', '#FFBE98', 44, 'solido', '13-1023 TCX'),
  ('MOA', 'Mora', 'morado', '#854C65', 65, 'solido', '18-1716 TCX')
on conflict do nothing;

update retail.colores set estado = 'aprobado'
  where estado = 'pendiente' and codigo in ('CER', 'MOK', 'DUR', 'MOA');

-- ---------- Orden: los nuevos entran en su lugar de claro a oscuro ----------
update retail.colores c set orden = v.orden
from (values
  ('VIN', 38), ('MAN', 45), ('NAR', 46), ('MOR', 66), ('CIR', 67), ('BER', 68),
  ('TOS', 74), ('TER', 75), ('MAC', 76), ('MAR', 77), ('CHO', 78)
) as v(codigo, orden)
where c.codigo = v.codigo and c.orden is distinct from v.orden;

-- ---------- Código Pantone y hex oficial de cada color existente ----------
update retail.colores c set pantone_tcx = v.tcx, hex = v.hex
from (values
  ('BLA', '11-0601 TCX', '#F4F9FF'),  -- Blanco: Bright White
  ('CRU', '11-0103 TCX', '#F3ECE0'),  -- Crudo: Egret
  ('BEI', '14-1118 TCX', '#D5BA98'),  -- Beige: Beige
  ('GRP', '14-4201 TCX', '#C5C5C5'),  -- Gris perla: Lunar Rock
  ('GRM', '14-5002 TCX', '#A2A2A1'),  -- Gris melange: Silver
  ('GRI', '17-3914 TCX', '#848587'),  -- Gris: Sharkskin
  ('TOP', '18-1110 TCX', '#82776B'),  -- Topo: Brindle
  ('GRA', '19-3907 TCX', '#48464A'),  -- Gris antracita: Forged Iron
  ('NEG', '19-0303 TCX', '#2D2C2F'),  -- Negro: Jet Black
  ('CEL', '14-4311 TCX', '#A9CADA'),  -- Celeste: Corydalis Blue
  ('AZC', '15-3930 TCX', '#80A0D4'),  -- Azul claro: Vista Blue
  ('TUR', '15-4825 TCX', '#33BECC'),  -- Turquesa: Blue Curacao
  ('AZD', '17-4027 TCX', '#5979A2'),  -- Azul denim: Riviera
  ('AZE', '18-3945 TCX', '#4A5FA5'),  -- Azul eléctrico: Amparo Blue
  ('COB', '19-4150 TCX', '#00539C'),  -- Cobalto: Princess Blue
  ('AZP', '19-4826 TCX', '#2A5C6A'),  -- Azul petróleo: Dragonfly
  ('AZM', '19-3933 TCX', '#2A304E'),  -- Azul marino: Medieval Blue
  ('ROS', '14-2311 TCX', '#F0A1BF'),  -- Rosado: Prism Pink
  ('PAL', '15-1515 TCX', '#D9A6A1'),  -- Palo rosa: Mellow Rose
  ('SAL', '15-1331 TCX', '#FAA181'),  -- Salmón: Coral Reef
  ('COR', '17-1547 TCX', '#EA6759'),  -- Coral: Emberglow
  ('FUC', '18-2143 TCX', '#CF2D71'),  -- Fucsia: Beetroot Purple
  ('ROJ', '18-1549 TCX', '#BD332D'),  -- Rojo: Valiant Poppy
  ('FRA', '19-2039 TCX', '#A52350'),  -- Frambuesa: Granita
  ('VIN', '19-1930 TCX', '#6C2831'),  -- Vino: Pomegranate
  ('VAI', '11-0616 TCX', '#F2E6B1'),  -- Vainilla: Pastel Yellow
  ('AML', '13-0646 TCX', '#EADA4F'),  -- Amarillo limón: Meadowlark
  ('AMA', '14-0848 TCX', '#F0C05A'),  -- Amarillo: Mimosa
  ('MOS', '16-0952 TCX', '#C89721'),  -- Mostaza: Nugget Gold
  ('MAN', '15-1054 TCX', '#EE9626'),  -- Mandarina: Cadmium Yellow
  ('NAR', '17-1360 TCX', '#E8703A'),  -- Naranja: Celosia Orange
  ('VEA', '13-5409 TCX', '#A1D7C9'),  -- Verde agua: Yucca
  ('PIS', '13-0324 TCX', '#BED38E'),  -- Pistacho: Lettuce Green
  ('SAV', '15-6414 TCX', '#A1AD92'),  -- Salvia: Reseda
  ('VEL', '14-0452 TCX', '#9FC131'),  -- Verde limón: Lime Green
  ('ESM', '17-5936 TCX', '#009B74'),  -- Esmeralda: Simply Green
  ('VER', '17-6333 TCX', '#487D49'),  -- Verde: Mint Green
  ('VOL', '18-0435 TCX', '#6A6F34'),  -- Verde oliva: Calla Green
  ('VEM', '19-0323 TCX', '#4B5335'),  -- Verde militar: Chive
  ('VEB', '19-6050 TCX', '#264E36'),  -- Verde botella: Eden
  ('LAV', '13-3820 TCX', '#D2C4D6'),  -- Lavanda: Lavender Fog
  ('LIL', '15-3620 TCX', '#BCA4CB'),  -- Lila: Lavendula
  ('MAL', '16-3110 TCX', '#B88AAC'),  -- Malva: Smoky Grape
  ('ORQ', '18-3224 TCX', '#AD5E99'),  -- Orquídea: Radiant Orchid
  ('VIO', '18-3633 TCX', '#775496'),  -- Violeta: Deep Lavender
  ('MOR', '19-3638 TCX', '#563474'),  -- Morado: Tillandsia Purple
  ('CIR', '19-2820 TCX', '#692D5D'),  -- Ciruela: Phlox
  ('BER', '19-2620 TCX', '#47253C'),  -- Berenjena: Winter Bloom
  ('ARN', '15-1225 TCX', '#CCA67F'),  -- Arena: Sand
  ('CAQ', '16-0726 TCX', '#A39264'),  -- Caqui: Khaki
  ('CAM', '17-1045 TCX', '#B0885B'),  -- Camel: Apple Cinnamon
  ('TOS', '16-1438 TCX', '#A47045'),  -- Tostado: Meerkat
  ('TER', '18-1451 TCX', '#B3573F'),  -- Terracota: Autumn Glaze
  ('MAC', '18-1148 TCX', '#864C24'),  -- Coñac: Caramel Café
  ('MAR', '18-1028 TCX', '#694833'),  -- Marrón: Emperador
  ('CHO', '19-1419 TCX', '#4B342F')   -- Chocolate: Chicory Coffee
) as v(codigo, tcx, hex)
where c.codigo = v.codigo and (c.pantone_tcx is distinct from v.tcx or c.hex is distinct from v.hex);

-- ---------- Sinónimos (solo donde todavía no hay: no pisa lo que un líder ya escribió) ----------
update retail.colores c set sinonimos = v.s
from (values
  ('GRI', array['plomo']),
  ('MAR', array['café']),
  ('VIN', array['guinda', 'burdeos', 'borgoña', 'granate']),
  ('AZM', array['azul noche', 'navy', 'azul oscuro']),
  ('CRU', array['blanco roto', 'hueso', 'marfil', 'ecru']),
  ('GRM', array['jaspeado']),
  ('GRA', array['carbón', 'grafito', 'marengo']),
  ('TOP', array['taupe', 'visón']),
  ('ROS', array['rosa', 'rosa bebé']),
  ('PAL', array['rosa viejo', 'rosa empolvado']),
  ('FUC', array['magenta']),
  ('CAQ', array['khaki', 'kaki']),
  ('VOL', array['oliva']),
  ('CEL', array['azul bebé', 'azul cielo']),
  ('COB', array['azul rey', 'azul francia']),
  ('AZP', array['teal']),
  ('MOS', array['ocre']),
  ('MOK', array['mocha', 'moca']),
  ('DUR', array['melocotón', 'peach']),
  ('MOR', array['púrpura', 'uva']),
  ('MAC', array['cognac']),
  ('DOR', array['oro']),
  ('PLA', array['plata'])
) as v(codigo, s)
where c.codigo = v.codigo and c.sinonimos = '{}';

-- ---------- Coñac (MAC): se queda con su nombre; la nota dice qué es (Felipe, 2026-09-26) ----------
update retail.colores
  set notas = 'Tono chocolate rojizo de la familia Tierra. Antes «Marrón chocolate» (renombrado el 2026-09-25).'
  where codigo = 'MAC' and notas = 'Marrón más oscuro';

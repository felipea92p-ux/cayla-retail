-- ============================================================================
-- 20261003190100 — Colores: 16 nuevos con Pantone, y descripción y «combina con» de los 91 (ADR-0316), parte 2 de 2
--
-- REQUIERE la parte 1 (20261003190000): las columnas `descripcion` y `combina_con` y su disparador.
--
-- EL PROBLEMA
--   Las familias más pobres de la carta (Rosado 3, Naranja 4, Rojo 5, Amarillo 5) tenían huecos de
--   claridad que ningún color llenaba, y de la paleta puede salir información de tendencias: un color
--   sin familia clara, sin Pantone o casi igual a otro parte las cuentas.
--
-- EL MÉTODO (Felipe eligió la opción B: las 4 familias pobres y los huecos menores del resto)
--   Se midió, familia por familia, dónde faltaba claridad (OKLCH sobre los 75 colores de producción,
--   2026-10-03) y se buscó entre los 2.310 TCX de Pantone Fashion, Home + Interiors los que caen en
--   esos huecos con ΔE2000 ≥ 8 contra TODOS los colores no metálicos que ya existen y entre sí (el
--   mismo umbral de 20260926100000). El hex de cada uno lo confirman al menos dos fuentes; el
--   listado de GitHub coincidió con 62 de los 63 TCX ya verificados de la base. Pantone dejó de
--   mostrar el hex en su página oficial sin Pantone Connect (de pago), por eso se cruzó con
--   terceros. El nombre es el del retail peruano, no el de Pantone.
--
--   ENTRAN 16 (el resumen por familia, y su Pantone en cada fila):
--     rosado    (+3): Rosa pálido, Rosa chicle, Rosa sandía
--     naranja   (+3): Naranja quemado, Albaricoque, Ámbar
--     rojo      (+2): Rojo tomate, Marsala
--     amarillo  (+2): Girasol, Amarillo chartreuse
--     azul      (+2): Azur, Azul zafiro
--     verde     (+3): Verde hoja, Verde jade, Menta
--     morado    (+1): Glicina
--
-- LO QUE SE QUEDÓ FUERA A PROPÓSITO (por eso 16 y no ~19)
--   · Neutro: no hace falta; su único hueco oscuro ya lo ocupa «Azul Intermedio» (un gris pizarra
--     creado a mano, clasificado Azul).
--   · Azul pálido, Naranja pálido e intenso, Amarillo girasol «puro»: no hay lugar a ΔE ≥ 8 de los
--     vecinos. Un hueco de 13 puntos de claridad (Amarillo → Mostaza) no admite un color a ΔE ≥ 8
--     de los dos lados; se entró por el matiz (Girasol hacia el naranja, Chartreuse hacia el verde).
--   · «Rosa fresa» (16-1731): a ΔE 8,7 de dos rosas vecinas; apretaba la escala sin sumarle un escalón.
--   · Los 4 creados a mano (Perla, Amarillo mantequilla, Azul medio, Azul Intermedio) tienen su ficha
--     pero NO se recomiendan como compañeros hasta que Felipe decida qué hacer con ellos (23 variantes
--     con stock: no se fusionan sin tocar SKUs).
--
-- ORDEN
--   Los nuevos entran con `orden = 2000` (la convención de un color agregado después). La web ya no
--   ordena por `orden`: la carta y Atributos calculan gama y claridad del hex (ADR-0312), así que
--   caen en su lugar solos. Esta migración NO renumera `orden` ni mueve a ningún color de familia: no
--   depende de qué se decida con Nude, Beige y Arena.
--
-- DESCRIPCIÓN Y «COMBINA CON» (los 91 activos, escritas a mano con criterio de estilismo)
--   Sin afirmaciones sobre el cuerpo ni el tono de piel de nadie. Cada lista trae de 4 a 6 códigos: un
--   neutro de base, un acento y, donde cabe, un metal. Un Líder las edita en Atributos ▸ Colores.
--
-- NACEN 'aprobado', igual que los de 20260926100000: sin sesión, el disparador los dejaría
-- 'pendiente'; es contenido de marca que Felipe ya pidió.
--
-- IDEMPOTENTE: `on conflict do nothing` (código y nombre únicos); los `update` solo tocan lo que
-- difiere. Solo datos: se pega entero en el SQL Editor.
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 1. Los 16 colores nuevos (el Pantone TCX es la referencia de la tela; el hex, su aproximación) ----------
insert into retail.colores (codigo, nombre, familia_color, hex, orden, tipo, pantone_tcx, sinonimos) values
  ('RPA', 'Rosa pálido', 'rosado', '#F7D1D1', 2000, 'solido', '12-1706 TCX', array['rosa pastel', 'rosa suave', 'rosa claro']),
  ('RCH', 'Rosa chicle', 'rosado', '#E96A97', 2000, 'solido', '16-2126 TCX', array['chicle', 'bubblegum', 'rosa fuerte']),
  ('RSA', 'Rosa sandía', 'rosado', '#CF6977', 2000, 'solido', '17-1927 TCX', array['sandía', 'rosa fresa']),
  ('NQU', 'Naranja quemado', 'naranja', '#C46316', 2000, 'solido', '17-1145 TCX', array['calabaza', 'naranja otoño', 'burnt orange']),
  ('ALB', 'Albaricoque', 'naranja', '#F7B26A', 2000, 'solido', '15-1145 TCX', array['damasco', 'apricot', 'chabacano']),
  ('AMB', 'Ámbar', 'naranja', '#BB7A2C', 2000, 'solido', '17-1048 TCX', array['amber', 'miel']),
  ('RTO', 'Rojo tomate', 'rojo', '#EB3C27', 2000, 'solido', '17-1563 TCX', array['tomate', 'escarlata']),
  ('MSA', 'Marsala', 'rojo', '#964F4C', 2000, 'solido', '18-1438 TCX', array['rojo marsala']),
  ('GIR', 'Girasol', 'amarillo', '#FFB000', 2000, 'solido', '15-1062 TCX', array['amarillo girasol', 'amarillo intenso', 'sunflower']),
  ('ACH', 'Amarillo chartreuse', 'amarillo', '#B8AF23', 2000, 'solido', '15-0548 TCX', array['chartreuse', 'amarillo verdoso', 'citronela']),
  ('AZU', 'Azur', 'azul', '#4D91C6', 2000, 'solido', '17-4139 TCX', array['azul azur', 'azul brillante', 'azure']),
  ('AZF', 'Azul zafiro', 'azul', '#203C7F', 2000, 'solido', '19-3952 TCX', array['zafiro', 'azul profundo', 'sapphire']),
  ('VHO', 'Verde hoja', 'verde', '#75A14F', 2000, 'solido', '16-0237 TCX', array['hoja', 'verde follaje', 'verde hierba']),
  ('VJA', 'Verde jade', 'verde', '#70A38D', 2000, 'solido', '16-5919 TCX', array['jade']),
  ('MEN', 'Menta', 'verde', '#D2E8DF', 2000, 'solido', '12-5407 TCX', array['verde menta', 'menta suave']),
  ('GLI', 'Glicina', 'morado', '#8B79B1', 2000, 'solido', '17-3730 TCX', array['wisteria', 'lila intenso', 'violeta claro'])
on conflict do nothing;

update retail.colores set estado = 'aprobado'
  where estado = 'pendiente' and codigo in ('RPA', 'RCH', 'RSA', 'NQU', 'ALB', 'AMB', 'RTO', 'MSA', 'GIR', 'ACH', 'AZU', 'AZF', 'VHO', 'VJA', 'MEN', 'GLI');

-- ---------- 2. Descripción y «combina con» de los 91 (los nuevos ya existen: las referencias son válidas) ----------
update retail.colores c
  set descripcion = v.descripcion, combina_con = v.combina_con
from (values
  ('BLA', 'Luminoso y limpio: da frescura y sensación de amplitud. El básico del verano y de las telas ligeras; fácil de llevar de día a noche. Pide cuidado porque marca el uso.', array['NEG', 'AZM', 'CAM', 'ROJ', 'VEB', 'DOR']),
  ('CRU', 'Blanco cálido, más suave que el blanco puro. Aporta una elegancia tranquila a lino, punto y algodón, y se luce en looks tono sobre tono con arena y beige.', array['CAM', 'AZM', 'VOL', 'TER', 'MSA', 'NEG']),
  ('PER', 'Neutro claro y delicado, casi igual a Crudo. Discreto y fácil de combinar; bonito en blusas y vestidos de aire romántico.', array['NEG', 'AZM', 'PAL', 'LIL', 'ORR']),
  ('NUD', 'Tono piel suave que alarga la silueta y casi no se nota bajo otras prendas. Sofisticado en básicos, calzado y conjuntos tono sobre tono.', array['BLA', 'NEG', 'CHO', 'MSA', 'VOL', 'ORR']),
  ('BEI', 'Neutro cálido y versátil que transmite calma y elegancia sin esfuerzo. Base de los looks de oficina y de media estación; combina con casi todo.', array['BLA', 'NEG', 'AZM', 'CHO', 'VOL', 'TER']),
  ('ARN', 'Beige dorado y cálido, entre el beige y el camel. Aire natural y veraniego; muy bueno en lino, pantalones y calzado.', array['BLA', 'CRU', 'AZM', 'TER', 'VEB', 'NEG']),
  ('GPI', 'Gris cálido y suave, entre el gris y el beige. Sobrio y moderno; funciona en sastrería ligera, punto y tejidos naturales.', array['NEG', 'BLA', 'AZM', 'VEM', 'MSA']),
  ('GRP', 'Gris claro, frío y ligero. Se ve limpio y moderno y da luz sin llegar al blanco; muy usado en camisas, chaquetas ligeras y ropa deportiva.', array['GRA', 'AZM', 'VIN', 'PAL', 'BLA']),
  ('GRM', 'Gris jaspeado de aspecto informal y cómodo. Clásico del punto y la ropa de diario; disimula mejor las arrugas y el uso que un gris liso.', array['NEG', 'BLA', 'AZM', 'ROJ', 'VEB']),
  ('GRI', 'Gris medio, neutro y discreto. Sobrio para la oficina y el uso diario; deja que destaque el color con el que se combina.', array['BLA', 'NEG', 'FUC', 'COB', 'MOS']),
  ('TOP', 'Gris pardo cálido, entre el gris y el marrón. Elegante y de aire natural; muy bueno en sastrería, abrigos y accesorios.', array['CRU', 'BLA', 'CHO', 'MSA', 'VOL', 'AZM']),
  ('GRA', 'Gris muy oscuro, casi negro pero más suave. Serio y moderno; una alternativa elegante al negro en sastrería, jeans oscuros y abrigos.', array['BLA', 'CRU', 'PAL', 'MOS', 'VEB', 'VIN']),
  ('NEG', 'Intenso y atemporal: estiliza, disimula y se ve elegante en cualquier ocasión. El fondo ideal para un color vivo o un metal; se desgasta con los lavados.', array['BLA', 'CRU', 'ROJ', 'FUC', 'DOR', 'PLA']),
  ('CAQ', 'Verde pardo de tierra, de aire casual y utilitario. Resistente para pantalones, chaquetas y prendas de diario; se mezcla fácil con neutros.', array['BLA', 'CRU', 'AZM', 'TER', 'MSA', 'NEG']),
  ('CAM', 'Marrón claro dorado, cálido y elegante. Clásico de abrigos y accesorios; da aspecto de calidad y combina con casi todo.', array['BLA', 'NEG', 'AZM', 'CRU', 'VIN', 'VEB']),
  ('MOK', 'Marrón rosado suave, cálido y acogedor, de aire contemporáneo. Ideal en punto, básicos y looks tono sobre tono.', array['CRU', 'CHO', 'NEG', 'VOL', 'AZM', 'ORR']),
  ('TOS', 'Marrón anaranjado cálido, como cuero o canela. Da calidez y aire artesanal; muy bueno en cuero, gamuza y tejidos de otoño.', array['CRU', 'BLA', 'AZM', 'VEB', 'MOS', 'NEG']),
  ('TER', 'Naranja de barro, terroso y vivo a la vez, de aire mediterráneo y artesanal. Da carácter sin gritar; ideal en vestidos, lino y accesorios.', array['CRU', 'BLA', 'VOL', 'AZP', 'CHO', 'CAM']),
  ('MAC', 'Marrón rojizo profundo, como el cuero curtido. Elegante y cálido; se ve de calidad en calzado, bolsos, cinturones y abrigos.', array['CRU', 'BLA', 'AZM', 'NEG', 'VEB', 'DOR']),
  ('MAR', 'Marrón clásico y sobrio, sencillo de llevar. Base sólida para otoño e invierno en abrigos y calzado; da seriedad sin la dureza del negro.', array['CRU', 'BEI', 'AZD', 'VOL', 'DOR']),
  ('CHO', 'Marrón muy oscuro, casi negro cálido. Elegante y envolvente; una alternativa suave al negro, excelente en sastrería, cuero y punto.', array['CRU', 'BEI', 'NUD', 'BLA', 'PAL']),
  ('RPA', 'Rosa muy suave y delicado, casi un neutro cálido. Transmite ternura y frescura; bonito en blusas, vestidos y ropa de verano.', array['BLA', 'GRA', 'AZD', 'VJA', 'ORR']),
  ('ROS', 'Rosa clásico y alegre. Transmite dulzura y energía joven; funciona de día en prendas casuales y también en ocasiones festivas.', array['BLA', 'GRI', 'AZD', 'VEA', 'CAM', 'ORR']),
  ('PAL', 'Rosa apagado y empolvado, con aire vintage. Más sofisticado que el rosa vivo; queda elegante en blusas, vestidos y accesorios.', array['CRU', 'GRA', 'AZM', 'VEB', 'ORR', 'CAM']),
  ('RCH', 'Rosa vivo y juvenil, con mucha energía. Llama la atención y levanta el ánimo; mejor como pieza protagonista con neutros.', array['BLA', 'NEG', 'GRI', 'VEM', 'DOR']),
  ('RSA', 'Rosa cálido con un toque de coral. Fresco y veraniego, de aire festivo y de vacaciones.', array['BLA', 'CRU', 'VJA', 'AZD', 'CAM']),
  ('FUC', 'Rosa intenso y atrevido, con máxima presencia. Ideal como prenda protagonista, en fiesta o para dar un toque de color al día a día.', array['BLA', 'NEG', 'AZM', 'VEB', 'NAR']),
  ('COR', 'Naranja rosado, cálido y alegre. Aire de verano y de vacaciones; favorece la prenda protagonista y se lleva muy bien con neutros.', array['BLA', 'CRU', 'AZM', 'TUR', 'CAM', 'ORR']),
  ('RTO', 'Rojo vivo y anaranjado, lleno de energía. Se nota desde lejos; funciona como acento en prendas ligeras y de verano.', array['BLA', 'CRU', 'AZD', 'NEG', 'VEM']),
  ('ROJ', 'Rojo clásico, intenso y atemporal. Transmite fuerza y seguridad; una sola prenda roja basta para armar el look.', array['BLA', 'NEG', 'AZM', 'AZD', 'VEB', 'CAM']),
  ('MSA', 'Rojo pardo, apagado y profundo, como vino tinto con tierra. Sofisticado y acogedor; muy bueno en otoño e invierno.', array['CRU', 'BEI', 'GRA', 'VEB', 'CAM', 'DOR']),
  ('FRA', 'Rojo rosado y jugoso, intenso y fresco. Da color con elegancia; funciona en fiesta y en prendas de abrigo.', array['BLA', 'GRI', 'AZM', 'VEB', 'CRU', 'DOR']),
  ('CER', 'Rojo oscuro y brillante, elegante y seductor. Más profundo que el rojo clásico; ideal en vestidos, abrigos y accesorios de noche.', array['BLA', 'CRU', 'NEG', 'AZM', 'VEB', 'DOR']),
  ('VIN', 'Rojo muy oscuro con fondo morado. Sofisticado y serio, el color de otoño e invierno por excelencia y una alternativa elegante al negro.', array['CRU', 'GRA', 'VEB', 'CAM', 'ORR', 'BLA']),
  ('DUR', 'Naranja pálido y rosado, suave y amable. Aporta calidez y frescura sin ser estridente; romántico en blusas, vestidos y lencería.', array['BLA', 'CRU', 'AZD', 'VJA', 'CAM']),
  ('ALB', 'Naranja claro y dulce, luminoso y cálido. Da un aspecto alegre y soleado; muy bueno en verano, en lino y algodón.', array['BLA', 'CRU', 'AZM', 'AZU', 'CAM']),
  ('SAL', 'Rosa anaranjado, cálido y favorecedor. Suave pero con presencia; perfecto para el verano y para prendas de día.', array['BLA', 'CRU', 'AZM', 'VEB', 'CAM']),
  ('MAN', 'Naranja vivo y dorado, soleado y energético. Pide protagonismo; muy bueno en accesorios, tops y prendas de verano.', array['BLA', 'NEG', 'AZM', 'TUR', 'CRU']),
  ('NAR', 'Naranja intenso, fuerte y alegre. Transmite energía y cercanía; destaca con neutros y con azules.', array['BLA', 'NEG', 'AZM', 'COB', 'GRI']),
  ('AMB', 'Naranja miel, dorado y cálido, como el ámbar. Elegante y envolvente; muy bueno en otoño, en punto, terciopelo y accesorios.', array['CRU', 'CHO', 'AZM', 'VEB', 'NEG', 'DOR']),
  ('NQU', 'Naranja oscuro y terroso, de aire otoñal. Cálido y con carácter; combina muy bien con neutros y azules profundos.', array['CRU', 'BLA', 'AZM', 'AZP', 'CHO', 'VOL']),
  ('AMM', 'Amarillo suave y cremoso, delicado y alegre. Da luz sin cansar; muy bueno en verano y en prendas ligeras.', array['BLA', 'CRU', 'CEL', 'AZD', 'CAM']),
  ('VAI', 'Amarillo pálido y cremoso, casi un neutro cálido. Suave, luminoso y fácil de llevar; combina con neutros y pasteles.', array['BLA', 'CRU', 'CEL', 'LIL', 'CAM']),
  ('AML', 'Amarillo fresco y cítrico, muy luminoso. Aporta energía y sensación de verano; mejor en piezas protagonistas o accesorios.', array['BLA', 'GRI', 'AZM', 'NEG', 'GLI']),
  ('AMA', 'Amarillo luminoso y alegre, cálido y optimista. Da buen ánimo y se ve muy bien de día y en verano.', array['BLA', 'GRI', 'NEG', 'AZD', 'AZM', 'LIL']),
  ('GIR', 'Amarillo dorado e intenso, como el girasol. Máxima alegría y presencia; funciona con azules y neutros.', array['AZM', 'BLA', 'NEG', 'AZD', 'CRU']),
  ('ACH', 'Amarillo verdoso, fresco y moderno. Muy llamativo: mejor en pocas prendas protagonistas y acompañado de neutros oscuros.', array['NEG', 'GRA', 'AZM', 'VEB', 'BLA', 'CHO']),
  ('MOS', 'Amarillo oscuro y terroso, cálido y con carácter. Muy bueno en otoño y en punto; combina con azules, marrones y neutros.', array['AZM', 'CRU', 'CHO', 'VEB', 'GRI', 'BLA']),
  ('PIS', 'Verde amarillento muy suave, fresco y dulce. Aporta calma y aire primaveral; bonito en blusas, vestidos y básicos ligeros.', array['BLA', 'CRU', 'AZD', 'PAL', 'CAM']),
  ('VEL', 'Verde cítrico y vibrante, lleno de energía. Pide protagonismo; ideal en ropa deportiva, en verano y como acento.', array['BLA', 'NEG', 'AZM', 'GRI', 'GLI']),
  ('SAV', 'Verde grisáceo y suave, tranquilo y natural. Elegante y relajado; buen compañero de neutros y tierras.', array['CRU', 'BEI', 'BLA', 'TER', 'CHO']),
  ('VHO', 'Verde de hoja fresca, natural y vivo. Transmite frescura y aire libre; funciona de día, en prendas casuales y en estampados.', array['BLA', 'CRU', 'AZD', 'CAM', 'NEG']),
  ('VOL', 'Verde pardo apagado, sobrio y natural. De aire utilitario y elegante a la vez; se lleva con neutros, tierras y metales cálidos.', array['CRU', 'BLA', 'CAM', 'TER', 'NEG', 'DOR']),
  ('VEM', 'Verde oscuro mate, de aire utilitario y duradero. Casual y resistente; la base del estilo urbano en chaquetas, pantalones y parkas.', array['BLA', 'CRU', 'NEG', 'CAM', 'MOS']),
  ('MEN', 'Verde azulado muy pálido, fresco y limpio. Da sensación de calma y frescura; ideal para verano y prendas ligeras.', array['BLA', 'GRI', 'ROS', 'AZM', 'ORR']),
  ('VEA', 'Verde azulado suave, sereno y fresco. Transmite calma; muy bonito en verano y en conjuntos tono sobre tono con celestes.', array['BLA', 'CRU', 'CEL', 'ROS', 'CAM']),
  ('VJA', 'Verde profundo y suave a la vez, elegante y sereno. Aporta una sofisticación tranquila; muy bueno en blusas, vestidos y sastrería ligera.', array['CRU', 'BLA', 'NEG', 'MSA', 'CAM']),
  ('ESM', 'Verde azulado intenso y brillante, lujoso y vibrante. Elegante en fiesta y de noche; destaca con negro, dorado y neutros.', array['BLA', 'NEG', 'CRU', 'RPA', 'DOR']),
  ('VER', 'Verde clásico, natural y equilibrado. Transmite frescura y estabilidad; combina bien con neutros, tierras y blanco.', array['BLA', 'CRU', 'CAM', 'AZD', 'NEG']),
  ('VEB', 'Verde muy oscuro y elegante, de aire clásico. Sobrio y rico: una alternativa distinguida al negro y al azul marino en otoño e invierno.', array['CRU', 'BLA', 'CAM', 'VIN', 'DOR', 'PAL']),
  ('CEL', 'Azul muy claro y sereno, fresco como el cielo. Transmite calma y limpieza; muy bueno en camisas y en verano.', array['BLA', 'CRU', 'AZM', 'CAM', 'PAL']),
  ('TUR', 'Azul verdoso vivo y tropical, fresco y alegre. Aire de playa y de verano; como acento con blancos y neutros destaca mucho.', array['BLA', 'CRU', 'CAM', 'COR', 'GRI']),
  ('AZP', 'Azul verdoso oscuro, profundo y distinguido. Elegante y poco común; funciona en sastrería, vestidos y accesorios.', array['CRU', 'BLA', 'CAM', 'TER', 'DOR']),
  ('AZC', 'Azul suave y limpio, amable y fresco. Fácil de llevar de día y en la oficina; muy clásico en camisas.', array['BLA', 'AZM', 'CAM', 'GRI', 'ROS']),
  ('AZU', 'Azul medio brillante y luminoso, como un cielo despejado. Alegre y limpio; funciona de día, en verano y en prendas casuales.', array['BLA', 'CRU', 'CAM', 'ALB', 'NEG']),
  ('AZD', 'Azul mezclilla, casual y confiable: el color del jean. Se lleva con casi todo, de día y de uso diario, y envejece bien con los lavados.', array['BLA', 'CRU', 'CAM', 'MOS', 'ROJ', 'GRI']),
  ('AZE', 'Azul vivo y profundo, enérgico y moderno. Tiene presencia sin ser estridente; bueno en prendas protagonistas y accesorios.', array['BLA', 'CRU', 'NEG', 'GRI', 'MOS', 'CAM']),
  ('AME', 'Azul intenso y saturado, vibrante y llamativo. Alegre; se luce mejor combinado con neutros.', array['BLA', 'NEG', 'GRI', 'CRU', 'GIR']),
  ('AZI', 'Gris azulado oscuro, sobrio y discreto. Casi un neutro: funciona como base en la oficina y el uso diario.', array['BLA', 'CRU', 'CAM', 'PAL', 'MOS']),
  ('COB', 'Azul profundo y puro, vivo y elegante. Transmite confianza y claridad; muy bueno como color de acento y de noche.', array['BLA', 'CRU', 'NEG', 'GRI', 'CAM', 'NAR']),
  ('IND', 'Azul oscuro con fondo gris, de aire denim y sobrio. Muy versátil, de día y de noche: una alternativa más suave al negro.', array['BLA', 'CRU', 'CAM', 'MOS', 'ROJ', 'GRI']),
  ('AZF', 'Azul oscuro intenso y brillante, como la piedra. Elegante y de noche; destaca con blanco, dorado y plata.', array['BLA', 'CRU', 'DOR', 'PLA', 'PAL']),
  ('AZM', 'Azul muy oscuro, serio y elegante: el neutro clásico junto al negro. Sienta bien en oficina y sastrería, y combina con casi todo.', array['BLA', 'CRU', 'CAM', 'ROJ', 'DOR', 'GRI']),
  ('LAV', 'Lila grisáceo muy suave, delicado y sereno. Transmite calma; muy bonito en verano y en conjuntos con neutros claros.', array['BLA', 'CRU', 'GRI', 'MEN', 'ORR']),
  ('LIL', 'Morado claro y fresco, suave y primaveral. Romántico y moderno a la vez; bonito de día y en verano.', array['BLA', 'CRU', 'GRI', 'VAI', 'ORR']),
  ('GLI', 'Violeta azulado suave, sereno y elegante. Distinguido en blusas y vestidos; combina con azules, grises y neutros.', array['BLA', 'GRI', 'AZM', 'AML', 'PLA']),
  ('VIO', 'Morado luminoso y profundo a la vez, creativo y con presencia. Distinguido en prendas protagonistas y accesorios.', array['BLA', 'GRI', 'AML', 'AZM', 'DOR']),
  ('MOR', 'Morado oscuro y rico, elegante y misterioso. Aire de noche y de invierno; destaca con dorado y neutros.', array['CRU', 'BLA', 'GRI', 'DOR', 'MOS']),
  ('MAL', 'Rosa morado apagado, suave y elegante. Aire vintage y delicado; combina bien con grises, verdes suaves y neutros cálidos.', array['CRU', 'GRI', 'SAV', 'CAM', 'ORR']),
  ('ORQ', 'Rosa violáceo vivo, alegre y sofisticado. Más intenso que el malva; muy bueno en prendas protagonistas.', array['BLA', 'GRI', 'VEB', 'AZM', 'ORR']),
  ('MOA', 'Morado rosado oscuro, profundo y sensual. Elegante en otoño e invierno; sofisticado con neutros.', array['CRU', 'GRI', 'VEB', 'CAM', 'ORR']),
  ('CIR', 'Morado rojizo oscuro, rico y elegante. Muy bueno en otoño, de noche y en accesorios; una alternativa sofisticada al negro.', array['CRU', 'GRI', 'DOR', 'VEB', 'ORR']),
  ('BER', 'Morado casi negro, serio y profundo. Muy elegante: funciona como sustituto del negro, con dorado y neutros claros.', array['CRU', 'BLA', 'GRI', 'DOR', 'PAL']),
  ('CHA', 'Dorado pálido y suave, elegante y festivo sin ser llamativo. Ideal en fiesta y accesorios; combina con neutros claros y pasteles.', array['BLA', 'CRU', 'NEG', 'RPA', 'AZM']),
  ('PLA', 'Metal frío y brillante, moderno y limpio. Aporta luz y aire festivo; combina con azules, grises, negro y blanco.', array['NEG', 'BLA', 'GRA', 'AZM', 'GLI']),
  ('PLV', 'Plata envejecida y apagada, discreta y de aire artesanal. Menos brillo que el plateado; elegante en joyería y herrajes.', array['NEG', 'GRA', 'BLA', 'AZM', 'VIN']),
  ('DOR', 'Metal cálido y brillante, lujoso y festivo. Realza el negro, el verde botella y el azul marino; ideal en fiesta y accesorios.', array['NEG', 'VEB', 'AZM', 'VIN', 'BLA', 'CRU']),
  ('ORV', 'Dorado envejecido, apagado y elegante. Menos llamativo que el dorado; sofisticado en joyería, herrajes y prendas de otoño.', array['NEG', 'VEB', 'CHO', 'VIN', 'CRU', 'AZM']),
  ('ORR', 'Metal cálido con matiz rosado, suave y moderno. Delicado y elegante; combina con rosas, neutros y azul marino.', array['BLA', 'CRU', 'NEG', 'PAL', 'AZM', 'GRA']),
  ('COE', 'Metal rojizo, cálido y con carácter. Aire artesanal y otoñal; combina con verdes, marrones y neutros oscuros.', array['CRU', 'NEG', 'VEB', 'CHO', 'AZM', 'BLA']),
  ('BRO', 'Metal pardo y apagado, sobrio y robusto. De aire clásico; combina con tierras, verdes y neutros.', array['CRU', 'NEG', 'VEB', 'CHO', 'AZM', 'BLA'])
) as v(codigo, descripcion, combina_con)
where c.codigo = v.codigo
  and (c.descripcion is distinct from v.descripcion or c.combina_con is distinct from v.combina_con);

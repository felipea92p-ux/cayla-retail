-- ============================================================================
-- 20260926100000 — Paleta esencial de moda: de 32 a 63 colores (64 en producción)
--
-- EL PROBLEMA
--   Con 32 colores activos, en cuanto entra una prenda petróleo, coral o
--   verde militar no hay dónde registrarla: el propio buscador de Nuevo
--   producto sugiere «petróleo, coral…» y ninguno de los dos existía. La
--   persona elige el más parecido (el stock queda bajo un color que no es)
--   o propone uno nuevo con el nombre que se le ocurre (en producción ya
--   convivían «Marrón chocolate», MAC, y «Chocolate»).
--
-- EL MÉTODO
--   Felipe pidió (2026-09-25) completar las gamas esenciales de la moda,
--   unas 9 por familia («unos 63 o 72»). No existe una lista oficial de
--   Adobe con esos colores: Adobe Color arma temas, no un vocabulario de
--   prenda. La lista sale del nombre de color que usa el retail de moda
--   (Zara Perú, Platanitos, el textil de Gamarra: «melange», «verde
--   militar», «verde limón», «salmón») y respeta lo ya decidido en
--   20260918154730 (español; «Rosado», no «Rosa»).
--
--   Cada tono candidato se midió contra TODOS los demás con ΔE2000 (la
--   distancia de color que usa la industria textil para aprobar un lote):
--   por debajo de ~8 dos colores se confunden a simple vista y el stock de
--   una misma prenda terminaría partido en dos filas. Todo par no metálico
--   de esta paleta queda en ΔE ≥ 8,8.
--
-- LO QUE SE QUEDÓ FUERA A PROPÓSITO (por eso 63 y no 72)
--   · Índigo — ΔE 7,9 con Cobalto: en jeans, «Azul denim» y «Azul marino»
--     ya cubren el claro y el oscuro.
--   · Cereza — ΔE 7,2 con Vino: no hay lugar entre Rojo y Vino.
--   · Durazno — casi idéntico a Salmón; en Perú se dice «salmón».
--   · Menta — casi idéntico a Verde agua.
--   · Coñac como fila nueva — es el tono que ya tenía «Marrón chocolate»
--     (MAC, #7B3F00, solo en producción). En vez de sumarlo, MAC se
--     renombra (abajo).
--   · Guinda, Plomo, Café — son la forma peruana de decir Vino, Gris y
--     Marrón: filas nuevas partirían el stock en dos. Son sinónimos, no
--     colores; se resuelven en el buscador, no en esta tabla.
--   Familias con menos de 9 (Amarillo 6, Azul/Rojo/Morado/Tierra/Metálico
--   8) no se rellenan: 9 es un tope de la grilla, no una cuota.
--
-- METÁLICOS
--   Se miden como un círculo plano y ahí sí chocan con colores lisos
--   (Plata vieja ≈ Gris, Champán ≈ Beige). Se aceptan: viven en su propia
--   fila de la paleta y valen para bisutería, calzado y herrajes, donde el
--   acabado ES el color.
--
-- ORDEN: DE CLARO A OSCURO, CON LA DECENA DE CADA FAMILIA
--   Vuelve el esquema original de 20260912235500 (neutro 10-19, azul 20-29,
--   rojo 30-39, amarillo 40-49, verde 50-59, morado 60-69, tierra 70-79,
--   metálico 80-89, estampado 90-99) que el 93-96 de 20260918154730 había
--   roto. Dentro de cada familia van de claro a oscuro (los metálicos, por
--   metal: plata, oro, cobre): la paleta de Nuevo producto se lee como una
--   carta de color, columna a columna. Se renumeran también los colores
--   existentes y MAC (en local no existe; el update no toca nada). `orden`
--   solo decide en qué lugar se muestra: no cambia ningún código ni SKU.
--   «Los más usados» sigue saliendo primero en Nuevo producto (por uso,
--   no por `orden`).
--
-- «MARRÓN CHOCOLATE» (MAC) PASA A LLAMARSE «COÑAC» (Felipe, 2026-09-25)
--   Lo creó alguien en producción, sin migración, al lado de «Chocolate»:
--   dos nombres que se confunden para dos tonos distintos (#7B3F00 es
--   coñac, rojizo; Chocolate es #4A2F22). Tenía 0 variantes. Se cambia
--   solo el NOMBRE: el código MAC sigue, porque la clave primaria no se
--   renombra (ver `color-codigo.ts`). En local la fila no existe y el
--   update no toca nada.
--
-- NACEN 'aprobado', IGUAL QUE LOS 4 DE 20260918154730
--   Sin sesión, `fn_colores_estado_trigger` los deja 'pendiente'; es
--   contenido de marca que Felipe ya pidió, no una propuesta para revisar.
--
-- IDEMPOTENTE
--   `on conflict do nothing` sin columna: cubre el código (clave primaria)
--   y el nombre (`colores_clave_unica`); si alguien ya creó un color con
--   uno de estos nombres, se respeta el suyo. Los `update` dan el mismo
--   resultado si se corren dos veces. Solo datos: sin alter ni políticas,
--   se pega entero en el SQL Editor.
-- ============================================================================

set lock_timeout = '3s';

insert into retail.colores (codigo, nombre, familia_color, hex, orden, tipo) values
  -- Neutro
  ('GRP', 'Gris perla',     'neutro',   '#C4C6C5', 13, 'solido'),
  ('GRM', 'Gris melange',   'neutro',   '#A5A6A8', 14, 'textura'),
  ('TOP', 'Topo',           'neutro',   '#857567', 16, 'solido'),
  -- Azul
  ('TUR', 'Turquesa',       'azul',     '#2FB3BD', 22, 'solido'),
  ('AZD', 'Azul denim',     'azul',     '#5A7BA3', 23, 'solido'),
  ('AZE', 'Azul eléctrico', 'azul',     '#2E5BF2', 24, 'solido'),
  ('AZP', 'Azul petróleo',  'azul',     '#1D5561', 26, 'solido'),
  -- Rojo (y rosados)
  ('SAL', 'Salmón',         'rojo',     '#F4A084', 32, 'solido'),
  ('COR', 'Coral',          'rojo',     '#F06B63', 33, 'solido'),
  ('FRA', 'Frambuesa',      'rojo',     '#A3244F', 36, 'solido'),
  -- Amarillo (y naranjas)
  ('VAI', 'Vainilla',       'amarillo', '#F3E6B3', 40, 'solido'),
  ('AML', 'Amarillo limón', 'amarillo', '#E6DC3C', 41, 'solido'),
  ('MAN', 'Mandarina',      'amarillo', '#F39A2E', 44, 'solido'),
  -- Verde
  ('PIS', 'Pistacho',       'verde',    '#C2D18C', 51, 'solido'),
  ('SAV', 'Salvia',         'verde',    '#A1B196', 52, 'solido'),
  ('VEL', 'Verde limón',    'verde',    '#9CC43B', 53, 'solido'),
  ('ESM', 'Esmeralda',      'verde',    '#00966C', 54, 'solido'),
  ('VEM', 'Verde militar',  'verde',    '#4A5230', 57, 'solido'),
  ('VEB', 'Verde botella',  'verde',    '#1C4632', 58, 'solido'),
  -- Morado
  ('LAV', 'Lavanda',        'morado',   '#DCD2EE', 60, 'solido'),
  ('MAL', 'Malva',          'morado',   '#B48AA8', 62, 'solido'),
  ('ORQ', 'Orquídea',       'morado',   '#B55FA6', 63, 'solido'),
  ('VIO', 'Violeta',        'morado',   '#7A3FB6', 64, 'solido'),
  ('CIR', 'Ciruela',        'morado',   '#6B2A57', 66, 'solido'),
  ('BER', 'Berenjena',      'morado',   '#3D1F3B', 67, 'solido'),
  -- Tierra
  ('TER', 'Terracota',      'tierra',   '#A9563A', 74, 'solido'),
  -- Metálico
  ('PLV', 'Plata vieja',    'metalico', '#8C8D88', 81, 'solido'),
  ('CHA', 'Champán',        'metalico', '#E2D1A6', 82, 'solido'),
  ('ORV', 'Oro viejo',      'metalico', '#A68A45', 84, 'solido'),
  ('ORR', 'Oro rosa',       'metalico', '#D6A08C', 85, 'solido'),
  ('COE', 'Cobre',          'metalico', '#B46A3C', 86, 'solido'),
  ('BRO', 'Bronce',         'metalico', '#8C6B3B', 87, 'solido')
on conflict do nothing;

update retail.colores set estado = 'aprobado'
  where estado = 'pendiente'
    and codigo in ('GRP', 'GRM', 'TOP', 'TUR', 'AZD', 'AZE', 'AZP', 'SAL', 'COR', 'FRA',
                   'VAI', 'AML', 'MAN', 'PIS', 'SAV', 'VEL', 'ESM', 'VEM', 'VEB',
                   'LAV', 'MAL', 'ORQ', 'VIO', 'CIR', 'BER', 'TER',
                   'PLV', 'CHA', 'ORV', 'ORR', 'COE', 'BRO');

-- Los que ya existían, a su lugar de claro a oscuro dentro de su familia.
update retail.colores c set orden = v.orden
from (values
  ('BLA', 10), ('CRU', 11), ('BEI', 12), ('GRI', 15), ('GRA', 17), ('NEG', 18),
  ('CEL', 20), ('AZC', 21), ('COB', 25), ('AZM', 27),
  ('ROS', 30), ('PAL', 31), ('FUC', 34), ('ROJ', 35), ('VIN', 37),
  ('AMA', 42), ('MOS', 43), ('NAR', 45),
  ('VEA', 50), ('VER', 55), ('VOL', 56),
  ('LIL', 61), ('MOR', 65),
  ('ARN', 70), ('CAQ', 71), ('CAM', 72), ('TOS', 73), ('MAC', 75), ('MAR', 76), ('CHO', 77),
  ('PLA', 80), ('DOR', 83)
) as v(codigo, orden)
where c.codigo = v.codigo and c.orden is distinct from v.orden;

-- MAC: «Marrón chocolate» → «Coñac» (solo el nombre; el código no cambia).
update retail.colores set nombre = 'Coñac'
  where codigo = 'MAC' and nombre = 'Marrón chocolate';

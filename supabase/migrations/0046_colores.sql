-- ============================================================================
-- 0046 — Vocabulario cerrado de colores
--
-- QUÉ ARREGLA
--   `variantes.color` es texto libre y nullable. Cuando cuatro Encargadas
--   capturen 900 prendas en paralelo durante dos semanas, van a nacer "Azul
--   marino", "azul marino", "AZUL MARINO", "Azul Marino" y "marino" — cinco
--   colores distintos para la base, uno solo para la clienta.
--
-- POR QUÉ ANTES DEL CENSO Y NO DESPUÉS
--   Ésta es la pieza con mayor costo de postergación de todo el proyecto.
--   Hacerlo ahora cuesta una tarde. Hacerlo después es un proyecto de limpieza
--   donde **cada fusión de color es una fusión de variantes**: dos filas de
--   `variantes` con stock real y con `movimientos` colgando de ellas. Fusionarlas
--   significa mover stock, y mover stock significa escribir `movimientos` — o
--   sea, reescribir historia para arreglar una falta de ortografía.
--   Y mientras tanto no se puede responder la pregunta que un fundador de moda
--   hace todas las semanas: cuántas unidades azul marino tengo entre las tres
--   boutiques.
--
-- LA DECISIÓN: FK DURA EN COLUMNA NUEVA, TEXTO DESNORMALIZADO EN LA VIEJA
--   · `variantes.color_id` → FK contra `colores`. O es NULL (legado) o es un
--     color real. Sin excepciones.
--   · `variantes.color` (texto) → se conserva y se llena con `colores.nombre` en
--     cada escritura nueva. Sirve para mostrar y para no romper `catalogo.ts`,
--     el export CSV ni `EtiquetasGenerator.tsx:90`, que hoy leen `color`.
--   Se descartó poner la FK sobre `variantes.color` directamente: obligaría a
--   limpiar TODOS los datos existentes antes de poder crear la restricción, que
--   es justo el trabajo que el censo va a generar. Con una columna nueva, lo que
--   no calza queda visible y contable en vez de bloquear la migración.
--
-- LA PIEZA QUE DE VERDAD CIERRA LA PUERTA
--   `create unique index colores_clave_unica on colores (fn_clave_texto(nombre))`
--   hace IMPOSIBLE que coexistan "Azul marino" y "azul marino". Lo rechaza la
--   base, no un `if` en el cliente que alguien puede olvidar en la próxima
--   pantalla.
--
-- POR QUÉ `fn_clave_texto` Y NO `unaccent()`
--   `unaccent` vive en el schema `extensions`, y las funciones de producción
--   declaran `set search_path = retail, public`. Usarla obligaría a tocar el
--   search_path de cada RPC. `translate()` es builtin, IMMUTABLE (requisito para
--   indexar sobre ella) y cubre exactamente los acentos del castellano.
--
-- LA LISTA: 29 colores, revisada y aprobada por Felipe el 2026-09-09.
--   Los tres últimos (`EST` estampado, `MUL` multicolor, `ANI` animal print) son
--   los que más importan: si no existen, el primer día alguien escribe el
--   estampado como texto libre y el vocabulario se rompe antes de empezar.
--
-- SE ROMPE SI: llega una marca con una carta de color propia de 200 tonos. Para
--   3 boutiques de moda peruana, 29 nombres que la gente ya usa es lo correcto;
--   la Líder puede agregar más sin migración (hay policy de insert).
--
-- NO se agrega tabla de TALLAS, a propósito: ya están acotadas por
--   `categorias.tallas_sugeridas` (0009), son de baja entropía (XS…XXL, 26…34,
--   Único) y cortas, así que las variantes de escritura son pocas y obvias.
--   Agregar tallas tarde es barato (talla no es FK de nada); agregar colores
--   tarde es caro. Esa asimetría es la que justifica tratarlas distinto.
-- ============================================================================

-- ---------- 1. normalizador (IMMUTABLE: se indexa sobre él) ----------
create or replace function fn_clave_texto(p text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      translate(lower(trim(coalesce(p, ''))), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '\s+', ' ', 'g'),
    '');
$$;

comment on function fn_clave_texto(text) is
  'Clave de comparación: minúsculas, sin acentos, sin espacios repetidos, vacío = null. IMMUTABLE para poder indexar sobre ella.';

-- ---------- 2. la tabla ----------
create table colores (
  codigo text primary key check (codigo ~ '^[A-Z]{3}$'),
  nombre text not null unique,
  familia_color text not null check (familia_color in
    ('neutro', 'azul', 'rojo', 'amarillo', 'verde', 'morado', 'tierra', 'metalico', 'estampado')),
  hex text check (hex is null or hex ~ '^#[0-9A-Fa-f]{6}$'),
  activo boolean not null default true,
  orden integer not null default 100,
  created_at timestamptz not null default now()
);

-- El candado real contra "Azul marino" / "azul marino" / "AZUL MARINO".
create unique index colores_clave_unica on colores (fn_clave_texto(nombre));

alter table colores enable row level security;
create policy colores_select on colores for select using (auth.role() = 'authenticated');
create policy colores_insert_lider on colores for insert with check (fn_es_lider());
create policy colores_update_lider on colores for update using (fn_es_lider());

-- ---------- 3. los 29 ----------
-- `hex` es el único campo decorativo del diseño: alimenta el chip de color en la
-- UI, que para una marca de moda evita el "¿cuál azul es éste?". Para EST/MUL/ANI
-- no significa nada y queda null.
insert into colores (codigo, nombre, familia_color, hex, orden) values
  ('NEG', 'Negro',        'neutro',    '#111111', 10),
  ('BLA', 'Blanco',       'neutro',    '#FFFFFF', 11),
  ('CRU', 'Crudo',        'neutro',    '#F0E9DD', 12),
  ('GRI', 'Gris',         'neutro',    '#8A8A8A', 13),
  ('BEI', 'Beige',        'neutro',    '#D8C7AE', 14),
  ('AZM', 'Azul marino',  'azul',      '#1B2A4A', 20),
  ('AZC', 'Azul claro',   'azul',      '#7EA6D9', 21),
  ('CEL', 'Celeste',      'azul',      '#AFD6EA', 22),
  ('ROJ', 'Rojo',         'rojo',      '#C0272D', 30),
  ('VIN', 'Vino',         'rojo',      '#6E1B2A', 31),
  ('ROS', 'Rosado',       'rojo',      '#F0A9BE', 32),
  ('PAL', 'Palo rosa',    'rojo',      '#D9A6A0', 33),
  ('FUC', 'Fucsia',       'rojo',      '#D2196E', 34),
  ('NAR', 'Naranja',      'amarillo',  '#E8703A', 40),
  ('AMA', 'Amarillo',     'amarillo',  '#F2C14E', 41),
  ('MOS', 'Mostaza',      'amarillo',  '#C89A2B', 42),
  ('VER', 'Verde',        'verde',     '#3E7A4E', 50),
  ('VOL', 'Verde oliva',  'verde',     '#6B6B3A', 51),
  ('VEA', 'Verde agua',   'verde',     '#9FD3C7', 52),
  ('MOR', 'Morado',       'morado',    '#5B3A78', 60),
  ('LIL', 'Lila',         'morado',    '#C3AEDA', 61),
  ('CAM', 'Camel',        'tierra',    '#B08453', 70),
  ('MAR', 'Marrón',       'tierra',    '#6B4A2F', 71),
  ('CHO', 'Chocolate',    'tierra',    '#4A2F22', 72),
  ('DOR', 'Dorado',       'metalico',  '#C8A951', 80),
  ('PLA', 'Plateado',     'metalico',  '#B8BCC0', 81),
  ('EST', 'Estampado',    'estampado', null,      90),
  ('MUL', 'Multicolor',   'estampado', null,      91),
  ('ANI', 'Animal print', 'estampado', null,      92);

-- ---------- 4. variantes.color_id ----------
alter table variantes add column color_id text references colores (codigo);
create index variantes_color_id_idx on variantes (color_id);

comment on column variantes.color_id is
  'Color normalizado (FK dura). `variantes.color` conserva el nombre desnormalizado para mostrar y para no romper las lecturas existentes.';

-- ---------- 5. backfill de lo que ya existe, sin adivinar ----------
-- Solo se resuelve lo que calza exactamente por clave normalizada. Lo que no,
-- queda `color_id is null`: visible, contable y resoluble por la Líder desde la
-- UI. Nada se pierde y nada se inventa.
update variantes v set color_id = c.codigo
from colores c
where v.color_id is null and fn_clave_texto(v.color) = fn_clave_texto(c.nombre);

-- Lo que quedó sin resolver se mira así (no es un error, es una lista de trabajo):
--   select color, count(*) from variantes
--   where color_id is null and color is not null
--   group by color order by 2 desc;

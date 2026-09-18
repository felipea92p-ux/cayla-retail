-- ============================================================================
-- 28 — Vocabulario cerrado de colores
-- Correr en cayla-DYNAMIC (SQL Editor). Todo en el cajón `retail`.
-- Gemelo de `supabase/migrations/0046_colores.sql`.
--
-- QUÉ ARREGLA
--   `retail.variantes.color` es texto libre y nullable. Cuando cuatro Encargadas
--   capturen 900 prendas en paralelo durante dos semanas, van a nacer "Azul
--   marino", "azul marino", "AZUL MARINO" y "marino" — cuatro colores distintos
--   para la base, uno solo para la clienta.
--
-- POR QUÉ AHORA Y NO DESPUÉS DEL CENSO
--   Es la pieza con mayor costo de postergación del proyecto. Ahora cuesta una
--   tarde. Después, cada fusión de color es una fusión de VARIANTES: dos filas
--   con stock real y con `movimientos` colgando. Fusionarlas significa mover
--   stock, o sea escribir movimientos — reescribir historia para arreglar una
--   falta de ortografía.
--
-- LA LISTA: 29 colores, revisada y aprobada por Felipe el 2026-09-09.
--
-- ES ADITIVO Y REVERSIBLE: crea una tabla y una columna nuevas. No toca
--   `variantes.color`, así que ninguna lectura de hoy (`lib/catalogo.ts`, el
--   export CSV, `EtiquetasGenerator`) cambia de comportamiento.
--
-- CÓMO SE REVIERTE
--   alter table retail.variantes drop column color_id;
--   drop table retail.colores;
--   drop function retail.fn_clave_texto(text);
-- ============================================================================

-- ---------- 1. normalizador (IMMUTABLE: se indexa sobre él) ----------
-- `translate()` y no `unaccent()`: unaccent vive en el schema `extensions` y las
-- funciones de retail declaran `set search_path = retail, public`; usarla
-- obligaría a tocar el search_path de cada RPC. translate es builtin, IMMUTABLE
-- (requisito para indexar) y cubre exactamente los acentos del castellano.
create or replace function retail.fn_clave_texto(p text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      translate(lower(trim(coalesce(p, ''))), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '\s+', ' ', 'g'),
    '');
$$;

-- ---------- 2. la tabla ----------
create table if not exists retail.colores (
  codigo text primary key check (codigo ~ '^[A-Z]{3}$'),
  nombre text not null unique,
  familia_color text not null check (familia_color in
    ('neutro', 'azul', 'rojo', 'amarillo', 'verde', 'morado', 'tierra', 'metalico', 'estampado')),
  hex text check (hex is null or hex ~ '^#[0-9A-Fa-f]{6}$'),
  activo boolean not null default true,
  orden integer not null default 100,
  created_at timestamptz not null default now()
);

-- El candado real contra "Azul marino" / "azul marino" / "AZUL MARINO": lo
-- rechaza la base, no un `if` en el cliente que alguien olvida en la próxima
-- pantalla.
create unique index if not exists colores_clave_unica
  on retail.colores (retail.fn_clave_texto(nombre));

alter table retail.colores enable row level security;
drop policy if exists colores_select on retail.colores;
create policy colores_select on retail.colores for select using (auth.role() = 'authenticated');
drop policy if exists colores_insert_lider on retail.colores;
create policy colores_insert_lider on retail.colores for insert with check (retail.es_lider());
drop policy if exists colores_update_lider on retail.colores;
create policy colores_update_lider on retail.colores for update using (retail.es_lider());

-- ---------- 3. los 29 ----------
-- `EST`, `MUL` y `ANI` son los que más importan: si no existen, el primer día
-- alguien escribe el estampado como texto libre y el vocabulario se rompe antes
-- de empezar. `hex` alimenta el chip de color de la UI; para esos tres no
-- significa nada y queda null.
insert into retail.colores (codigo, nombre, familia_color, hex, orden) values
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
  ('ANI', 'Animal print', 'estampado', null,      92)
on conflict (codigo) do nothing;

-- ---------- 4. variantes.color_id ----------
alter table retail.variantes add column if not exists color_id text references retail.colores (codigo);
create index if not exists variantes_color_id_idx on retail.variantes (color_id);

-- ---------- 5. backfill, sin adivinar ----------
-- Solo se resuelve lo que calza exactamente por clave normalizada. Lo que no,
-- queda `color_id is null`: visible, contable y resoluble por la Líder. Nada se
-- pierde y nada se inventa.
update retail.variantes v set color_id = c.codigo
from retail.colores c
where v.color_id is null and retail.fn_clave_texto(v.color) = retail.fn_clave_texto(c.nombre);

-- ============================================================================
-- VERIFICACIÓN (correr a mano después de pegar)
-- ============================================================================
-- 1. Los 29 entraron:
--   select count(*) from retail.colores;                        -- 29
--
-- 2. Cuánto del catálogo actual quedó normalizado y cuánto no:
--   select count(*) filter (where color_id is not null) as resueltas,
--          count(*) filter (where color_id is null and color is not null) as pendientes,
--          count(*) filter (where color is null) as sin_color
--   from retail.variantes;
--
-- 3. LA LISTA DE TRABAJO — los colores escritos a mano que no calzaron con
--    ninguno de los 29. No es un error: es lo que hay que decidir (¿se agrega el
--    color, o se corrige la variante?). Con el catálogo casi vacío deberían ser
--    poquísimas:
--   select color, count(*) from retail.variantes
--   where color_id is null and color is not null
--   group by color order by 2 desc;
--
-- 4. Que el candado muerda (debe fallar con unique_violation):
--   insert into retail.colores (codigo, nombre, familia_color) values ('AZZ','azul marino','azul');
-- ============================================================================

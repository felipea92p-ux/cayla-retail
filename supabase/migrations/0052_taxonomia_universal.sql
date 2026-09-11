-- ============================================================================
-- 0052 — Taxonomía universal como capa de traducción
--
-- QUÉ ARREGLA
--   `categorias` (32) y `colores` (29) son el vocabulario de CAYLA. Sirven para
--   CAYLA y no sirven para nadie más: una marca deportiva no tiene "Bisutería",
--   una zapatería infantil no tiene "Blusas". Cualquier importador que apunte a
--   ese vocabulario no se puede generalizar a un segundo cliente — y el sistema
--   se está construyendo para venderse a otras marcas.
--
-- LA DECISIÓN: DOS NIVELES, NO UNO
--   Se adopta la Shopify Standard Product Taxonomy (MIT, en español, release
--   v2026-08) como nivel universal, y el vocabulario propio de cada marca
--   CUELGA de él en vez de ser reemplazado por él:
--
--     NIVEL UNIVERSAL  Beige · Rosa           Ropa y accesorios > … > Blusas
--                        ▲                              ▲
--     NIVEL DEL TENANT  Arena · Palo rosa            Blusas (prefijo BLU)
--
--   El dato que fuerza esta forma: Shopify tiene 19 colores, CAYLA tiene 29.
--   El estándar universal es MÁS POBRE que el vocabulario del tenant, y eso no
--   es un defecto — es lo que significa interoperar. Forzar a todos a los 19
--   le quita a CAYLA "Arena", "Palo rosa" y "Animal print", que son distinciones
--   reales de su negocio y de lo que una clienta pide en mostrador.
--
-- POR QUÉ CAPA DE TRADUCCIÓN Y NO COLUMNA VERTEBRAL
--   Se descartó apuntar `productos` directo a la categoría universal. El prefijo
--   de 3 letras que genera los códigos de barras vive en `categorias` (0047), y
--   moverlo arrastraría `fn_asignar_codigo_producto`, `codigos_correlativos` y
--   toda etiqueta ya impresa. Esta migración es ADITIVA: dos columnas nuevas y
--   cinco tablas nuevas. Nada existente cambia de forma (principio 1).
--
-- POR QUÉ LA VERSIÓN VA FIJADA
--   El estándar saca release cada trimestre y v2026-08 sumó 2.000 categorías.
--   Un catálogo que se reclasifica solo de un día para otro es peor que uno
--   desactualizado: la prenda que ayer era "Blusas" hoy aparece en otro lado sin
--   que nadie lo haya pedido. `taxonomia_versiones.es_activa` fija la versión;
--   subir es un acto deliberado.
--
-- SE ROMPE SI: llega una marca cuyo rubro no está en los verticales cargados
--   (ej. ferretería). Se carga el vertical que falte con el mismo script — no
--   requiere migración.
-- ============================================================================

-- ---------- 1. la versión fijada ----------
create table taxonomia_versiones (
  version text primary key,           -- '2026-08', tal como lo declara el release
  cargada_en timestamptz not null default now(),
  es_activa boolean not null default false
);

-- Una sola versión activa a la vez. Sin esto, dos versiones activas harían que
-- el mismo id de categoría resolviera a dos nombres distintos según el join.
create unique index taxonomia_una_sola_activa on taxonomia_versiones (es_activa)
  where es_activa;

-- ---------- 2. el árbol universal ----------
-- La PK es el id parlante de Shopify sin el prefijo `gid://shopify/...`:
-- 'aa-1-1-2-4'. Es estable entre releases y legible en un log, que es
-- exactamente lo que se quiere de un identificador que va a aparecer en
-- mensajes de error y en prompts.
create table taxonomia_categorias (
  id text primary key,
  nombre text not null,               -- 'Camisetas de capa base'
  ruta text not null,                 -- full_name completo, para mostrar y para el prompt
  padre_id text references taxonomia_categorias (id),
  nivel integer not null,
  vertical text not null              -- 'aa' — permite cargar/consultar por rubro
);
create index taxonomia_categorias_padre_idx on taxonomia_categorias (padre_id);
create index taxonomia_categorias_vertical_idx on taxonomia_categorias (vertical);

create table taxonomia_atributos (
  id text primary key,                -- '1' (Color), '2778' (Talla)
  handle text not null unique,        -- 'color', 'size' — estable, en inglés
  nombre text not null,               -- 'Color', 'Talla' — en español
  descripcion text
);

create table taxonomia_valores (
  id text primary key,                -- '15'
  atributo_id text not null references taxonomia_atributos (id) on delete cascade,
  handle text not null,               -- 'color__navy'
  nombre text not null                -- 'Azul marino'
);
create index taxonomia_valores_atributo_idx on taxonomia_valores (atributo_id);

-- Qué atributos aplican a qué categoría: una camiseta tiene Cuello y Longitud
-- de manga; un arete no. Es lo que permite pedirle a la IA solo los atributos
-- que tienen sentido para la prenda que está clasificando.
create table taxonomia_categoria_atributos (
  categoria_id text not null references taxonomia_categorias (id) on delete cascade,
  atributo_id text not null references taxonomia_atributos (id) on delete cascade,
  primary key (categoria_id, atributo_id)
);

-- ---------- 3. el anclaje: vocabulario propio → universal ----------
-- Nullable a propósito: un término propio sin anclar sigue funcionando igual
-- que hoy. El anclaje agrega capacidad, no la condiciona.
alter table categorias add column taxonomia_categoria_id text
  references taxonomia_categorias (id);
alter table colores add column taxonomia_valor_id text
  references taxonomia_valores (id);

comment on column categorias.taxonomia_categoria_id is
  'De qué categoría universal cuelga esta categoría propia. Null = sin anclar todavía.';
comment on column colores.taxonomia_valor_id is
  'De qué color universal cuelga este color propio: Arena → Beige. Null = sin anclar.';

-- ---------- 4. RLS ----------
-- El árbol universal es dato de referencia público para cualquiera que entró:
-- lo lee el importador, lo lee el catálogo, lo lee el prompt. La escritura es
-- solo del script de carga, que corre con la service key y salta RLS — por eso
-- no hay policy de insert para nadie. Que una Líder no pueda editar el estándar
-- es el punto: si pudiera, dejaría de ser un estándar.
alter table taxonomia_versiones enable row level security;
alter table taxonomia_categorias enable row level security;
alter table taxonomia_atributos enable row level security;
alter table taxonomia_valores enable row level security;
alter table taxonomia_categoria_atributos enable row level security;

create policy taxonomia_versiones_select on taxonomia_versiones for select
  using (auth.role() = 'authenticated');
create policy taxonomia_categorias_select on taxonomia_categorias for select
  using (auth.role() = 'authenticated');
create policy taxonomia_atributos_select on taxonomia_atributos for select
  using (auth.role() = 'authenticated');
create policy taxonomia_valores_select on taxonomia_valores for select
  using (auth.role() = 'authenticated');
create policy taxonomia_categoria_atributos_select on taxonomia_categoria_atributos for select
  using (auth.role() = 'authenticated');

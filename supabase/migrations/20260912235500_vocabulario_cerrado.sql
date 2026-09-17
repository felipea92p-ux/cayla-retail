-- ============================================================================
-- 0014 — Vocabulario cerrado: colores, familia+prefijo de categorías, código
-- corto de prenda
--
-- QUÉ TRAE, Y POR QUÉ ESTO NO ES OPCIONAL EN V2
--   V2 (0002_esquema.sql) ya diseñó `variantes.color_codigo` como FK dura
--   contra `colores` desde el día uno — mejor que como V1 empezó (texto libre,
--   parchado después por ADR-0024). Pero la propia tabla `colores` de V2
--   (`codigo, nombre, hex, activo`) no tiene el candado que evita que
--   convivan "Azul marino" y "azul marino" como dos filas distintas: esa
--   pieza es la que de verdad cerraba la puerta en V1 (ver
--   `docs/datos/modulos/02-catalogo-y-vocabulario.md`, ADR-0024 de la línea
--   V1) y aquí no existía. Sin ella, la primera vez que dos personas den de
--   alta un color parecido, dos filas de `colores` van a significar lo
--   mismo — el mismo bug que V1 tuvo que corregir carísimo (fusionar
--   variantes con stock real colgando).
--
--   `categorias` de V2 (`nombre, activo`) tampoco tiene familia ni prefijo:
--   sin familia no hay cómo agrupar el catálogo por rubro (indumentaria vs.
--   calzado vs. accesorios), y sin prefijo no hay de dónde sacar la letra
--   del código corto de la prenda.
--
--   El código corto (`BLU-0042-AZM-M`) tampoco existe en V2 todavía. Se
--   acuña con un TRIGGER en vez de dentro de una RPC, a propósito: V2 no
--   tiene una sola función que cree variantes (a diferencia de V1, donde
--   `recibir_lote`/`crear_producto_con_variantes`/`registrar_produccion`
--   insertaban cada una por su cuenta y por eso 3 de 5 caminos quedaban
--   rotos — ver hueco 2 del módulo Loro). Un trigger en `variantes` cierra
--   la puerta UNA vez, para cualquier camino que inserte una fila, presente
--   o futuro — no hay un segundo camino que se pueda olvidar de llamarlo.
--
-- QUÉ NO TRAE
--   Los 5-900 productos/variantes reales de CAYLA — eso es el catálogo real,
--   tarea aparte (ver BACKLOG). Esto es solo el vocabulario y el mecanismo,
--   vacío de catálogo, listo para recibirlo.
-- ============================================================================

-- ---------- 1. normalizador de texto (igual que V1: sin acentos, sin mayúsculas, sin espacios repetidos) ----------
create or replace function retail.fn_clave_texto(p text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      translate(lower(trim(coalesce(p, ''))), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '\s+', ' ', 'g'),
    '');
$$;

comment on function retail.fn_clave_texto(text) is
  'Clave de comparación: minúsculas, sin acentos, sin espacios repetidos, vacío = null. IMMUTABLE para poder indexar sobre ella.';

-- ---------- 2. colores: el candado real + los 30 de CAYLA ----------
alter table retail.colores add column if not exists familia_color text;
alter table retail.colores add column if not exists orden integer not null default 100;

alter table retail.colores
  add constraint colores_familia_color_check check (familia_color in
    ('neutro', 'azul', 'rojo', 'amarillo', 'verde', 'morado', 'tierra', 'metalico', 'estampado'));
alter table retail.colores
  add constraint colores_hex_check check (hex is null or hex ~ '^#[0-9A-Fa-f]{6}$');

-- El candado de verdad: imposible que "Azul marino" y "azul marino" convivan.
create unique index colores_clave_unica on retail.colores (retail.fn_clave_texto(nombre));

insert into retail.colores (codigo, nombre, familia_color, hex, orden) values
  ('NEG', 'Negro',        'neutro',    '#111111', 10),
  ('BLA', 'Blanco',       'neutro',    '#FFFFFF', 11),
  ('CRU', 'Crudo',        'neutro',    '#F0E9DD', 12),
  ('GRI', 'Gris',         'neutro',    '#8A8A8A', 13),
  ('BEI', 'Beige',        'neutro',    '#D8C7AE', 14),
  ('ARN', 'Arena',        'tierra',    '#C9B79C', 15),
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

-- ---------- 3. categorías: familia fija + prefijo de 3 letras ----------
alter table retail.categorias add column if not exists familia text;
alter table retail.categorias add column if not exists prefijo text;

alter table retail.categorias
  add constraint categorias_familia_check check (familia in
    ('indumentaria', 'calzado', 'accesorios', 'bisuteria', 'belleza', 'papeleria'));
alter table retail.categorias
  add constraint categorias_prefijo_formato check (prefijo ~ '^[A-Z]{3}$');
create unique index categorias_prefijo_unico on retail.categorias (prefijo) where prefijo is not null;

-- Las 37 de CAYLA (validadas contra el historial real de compras — ver
-- docs/adr/, línea V1). `on conflict (nombre)` porque V2 ya trae `nombre`
-- único global; si alguna ya existiera (de un seed de prueba) solo se le
-- completa familia+prefijo con el update de abajo.
insert into retail.categorias (nombre, familia, prefijo) values
  ('Blusas', 'indumentaria', 'BLU'), ('Camisas', 'indumentaria', 'CMS'),
  ('Polos/Camisetas', 'indumentaria', 'POL'), ('Poleras/Sudaderas', 'indumentaria', 'SUD'),
  ('Chompas', 'indumentaria', 'CMP'), ('Tops', 'indumentaria', 'TOP'),
  ('Vestidos', 'indumentaria', 'VES'), ('Faldas', 'indumentaria', 'FAL'),
  ('Pantalones', 'indumentaria', 'PAN'), ('Jeans', 'indumentaria', 'JEA'),
  ('Shorts/Bermudas', 'indumentaria', 'SHO'), ('Casacas/Chaquetas', 'indumentaria', 'CAS'),
  ('Abrigos', 'indumentaria', 'ABR'), ('Ropa interior/Lencería', 'indumentaria', 'LEN'),
  ('Trajes de baño', 'indumentaria', 'TBA'), ('Conjuntos', 'indumentaria', 'CON'),
  ('Enterizos', 'indumentaria', 'ENT'), ('Chalecos', 'indumentaria', 'CHA'),
  ('Bodys', 'indumentaria', 'BOD'), ('Blazers/Sacos', 'indumentaria', 'BLZ'),
  ('Zapatillas', 'calzado', 'ZAP'), ('Sandalias', 'calzado', 'SAN'),
  ('Botas', 'calzado', 'BOT'), ('Zapatos formales', 'calzado', 'ZFO'),
  ('Carteras/Bolsos', 'accesorios', 'CAR'), ('Mochilas', 'accesorios', 'MOC'),
  ('Cinturones', 'accesorios', 'CIN'), ('Bufandas/Chalinas', 'accesorios', 'BUF'),
  ('Gorros/Sombreros', 'accesorios', 'GOR'), ('Lentes de sol', 'accesorios', 'LSO'),
  ('Pulseras', 'bisuteria', 'PUL'), ('Aretes', 'bisuteria', 'ARE'),
  ('Anillos', 'bisuteria', 'ANL'), ('Collares', 'bisuteria', 'COL'),
  ('Maquillaje', 'belleza', 'MAQ'),
  ('Lapiceros', 'papeleria', 'LAP'), ('Colores', 'papeleria', 'UTC')
on conflict (nombre) do update set familia = excluded.familia, prefijo = excluded.prefijo
  where retail.categorias.familia is null;

-- ---------- 4. el contador que da el número de cada modelo ----------
create table retail.codigos_correlativos (
  prefijo text primary key,
  ultimo integer not null default 0 check (ultimo >= 0),
  updated_at timestamptz not null default now()
);
alter table retail.codigos_correlativos enable row level security;
create policy codigos_correlativos_select on retail.codigos_correlativos
  for select using (auth.role() = 'authenticated');
-- Sin policy de escritura: solo la toca fn_siguiente_correlativo (security definer).

comment on table retail.codigos_correlativos is
  'Un contador por prefijo de categoría. Tabla y no `sequence`: una secuencia no es transaccional (un insert que hace rollback quema el número). El insert…on conflict…returning de fn_siguiente_correlativo toma el lock de fila: atómico, sin huecos.';

create or replace function retail.fn_siguiente_correlativo(p_prefijo text)
returns integer language plpgsql security definer set search_path = retail, public
as $$
declare v_n integer;
begin
  insert into codigos_correlativos (prefijo, ultimo) values (p_prefijo, 1)
    on conflict (prefijo) do update set ultimo = codigos_correlativos.ultimo + 1, updated_at = now()
    returning ultimo into v_n;
  return v_n;
end $$;

-- ---------- 5. cómo se arma el código ----------
create or replace function retail.fn_token_talla(p_talla text)
returns text language sql immutable as $$
  select case
    when retail.fn_clave_texto(p_talla) is null then 'U'
    when retail.fn_clave_texto(p_talla) in ('unico', 'unica', 'talla unica', 'u') then 'U'
    when retail.fn_clave_texto(p_talla) = 'estandar' then 'STD'
    else upper(regexp_replace(
      translate(p_talla, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]', '', 'g'))
  end;
$$;

alter table retail.productos add column if not exists codigo text;
create unique index if not exists productos_codigo_unico on retail.productos (codigo);

create or replace function retail.fn_asignar_codigo_producto(p_producto_id uuid)
returns text language plpgsql security definer set search_path = retail, public
as $$
declare v_codigo text; v_prefijo text; v_n integer;
begin
  select p.codigo, coalesce(c.prefijo, 'GEN') into v_codigo, v_prefijo
    from productos p left join categorias c on c.id = p.categoria_id
    where p.id = p_producto_id;
  if not found then raise exception 'El producto % no existe', p_producto_id; end if;
  if v_codigo is not null then return v_codigo; end if;
  v_n := fn_siguiente_correlativo(v_prefijo);
  v_codigo := v_prefijo || '-' || lpad(v_n::text, 4, '0');
  update productos set codigo = v_codigo where id = p_producto_id;
  return v_codigo;
end $$;

alter table retail.variantes add column if not exists codigo text;
create unique index if not exists variantes_codigo_unico on retail.variantes (codigo);

create or replace function retail.fn_asignar_codigo_variante(p_variante_id uuid)
returns text language plpgsql security definer set search_path = retail, public
as $$
declare v_codigo text; v_base text; v_producto_id uuid; v_color_codigo text; v_talla text; v_sku text;
begin
  select v.codigo, p.codigo, v.producto_id, v.color_codigo, fn_token_talla(v.talla), v.sku
    into v_codigo, v_base, v_producto_id, v_color_codigo, v_talla, v_sku
    from variantes v join productos p on p.id = v.producto_id
    where v.id = p_variante_id;
  if not found then raise exception 'La variante % no existe', p_variante_id; end if;
  if v_codigo is not null then return v_codigo; end if;

  -- A diferencia de V1: acá no hay texto libre que resolver — V2 ya exige
  -- `color_codigo` como FK dura desde el insert. Sin color (una correa, un
  -- gorro) el segmento simplemente no existe.
  if v_base is null then v_base := fn_asignar_codigo_producto(v_producto_id); end if;

  v_codigo := v_base || case when v_color_codigo is null then '' else '-' || v_color_codigo end
                     || '-' || v_talla;
  update variantes set codigo = v_codigo where id = p_variante_id;

  insert into codigos_barras (codigo, variante_id, origen)
    values (v_codigo, p_variante_id, 'propio')
    on conflict (codigo) do nothing;
  if v_sku is not null then
    insert into codigos_barras (codigo, variante_id, origen)
      values (v_sku, p_variante_id, 'propio')
      on conflict (codigo) do nothing;
  end if;

  return v_codigo;
end $$;

-- ---------- 6. el trigger que cierra la puerta para SIEMPRE, no solo hoy ----------
-- V2 no tiene una única RPC que cree variantes (a diferencia de V1, donde
-- justamente ESO fue la causa de que 3 de 5 caminos quedaran rotos). Un
-- trigger en la tabla no depende de que cada RPC futura se acuerde de llamar
-- a fn_asignar_codigo_variante — lo hace la base, siempre, para cualquier
-- insert.
create or replace function retail.fn_variantes_asignar_codigo()
returns trigger language plpgsql set search_path = retail, public as $$
begin
  perform fn_asignar_codigo_variante(new.id);
  return null;
end $$;

create trigger variantes_asignar_codigo
  after insert on retail.variantes
  for each row execute function retail.fn_variantes_asignar_codigo();

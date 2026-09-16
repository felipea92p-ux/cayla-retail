-- BORRADOR — NO APLICAR — NO PEGAR EN PRODUCCIÓN
-- ============================================================================
-- migracion-borrador-taxonomia-ideal.sql — CAYLA Retail
--
-- Acompaña a "ADR-XXXX (BORRADOR) — Taxonomía ideal de CAYLA Retail".
-- Estado: propuesto, borrador de investigación, NO aprobado por Felipe.
--
-- QUÉ ES: la FORMA DE DESTINO del modelo de catálogo, precio, stock y línea de
-- venta, escrita como DDL que compila sobre un Postgres 17 vacío (con
-- btree_gist). Sirve para discutir constraints concretos, no para correr.
--
-- QUÉ NO ES: una migración incremental. Varias tablas se llaman igual que las
-- que ya existen en `retail` (productos, variantes, colores, categorias,
-- codigos_barras, stock, movimientos, venta_items). Correr esto contra la base
-- local o contra producción choca o, peor, duplica. El plan de migración de
-- datos está al final, SOLO en comentarios.
--
-- CONVENCIONES:
--   * Sin prefijo `retail.` (igual que supabase/migrations/*.sql).
--   * Tablas que en la realidad viven fuera de este borrador (ventas,
--     devoluciones, personas de Dynamic, compras, conteos, producciones) se
--     declaran como columnas uuid con comentario, o como tabla mínima marcada
--     "STUB", solo para que el archivo compile.
--   * Cada constraint lleva encima el ESTADO IMPOSIBLE que previene, en idioma
--     de tienda. Si no se puede escribir esa frase, el constraint sobra.
--   * RLS y RPC quedan fuera: este borrador discute el modelo de datos. Los
--     retiros de permiso que SOSTIENEN un candado sí están (sección 10, patrón
--     de ADR-0070), en un bloque que solo corre si los roles de Supabase
--     existen, para que el archivo siga compilando en un Postgres vacío.
--   * Todo disparador de este archivo es un candado, no una comodidad: por eso
--     la sección 10 los pone en `enable always` (se activan también en modo
--     réplica) y cada tabla que solo acepta filas nuevas tiene además un
--     `before truncate` por sentencia (ADR-0070: el disparador por fila no ve
--     un TRUNCATE, ni directo ni en cascada).
-- ============================================================================

create extension if not exists btree_gist;

-- ============================================================================
-- 0 · FUNCIONES PURAS (IMMUTABLE) QUE SOSTIENEN ÍNDICES Y CHECKS
-- ============================================================================

-- Clave de comparación de texto: minúsculas, sin tildes, espacios colapsados.
-- Misma idea que la fn_clave_texto que ya existe en el repo (translate y no
-- unaccent, para no depender del schema `extensions`).
create or replace function fn_clave_texto(p text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      translate(lower(btrim(p)), 'áéíóúàèìòùäëïöüâêîôûñç', 'aeiouaeiouaeiouaeiounc'),
      '\s+', ' ', 'g'),
    '')
$$;

-- ¿Es un GTIN con dígito verificador GS1 correcto (8, 12, 13 o 14 dígitos)?
-- Estado imposible que sostiene: un EAN de proveedor mal tipeado en la
-- recepción que se guarda "bien" y que ninguna pistola va a leer jamás.
create or replace function fn_gtin_valido(p text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_suma int := 0;
  v_i int;
  v_digito int;
  v_largo int;
begin
  if p is null or p !~ '^[0-9]+$' then
    return false;
  end if;
  v_largo := length(p);
  if v_largo not in (8, 12, 13, 14) then
    return false;
  end if;
  -- Se recorre de derecha a izquierda sin contar el verificador: pesos 3,1,3,1...
  for v_i in 1 .. v_largo - 1 loop
    v_digito := substr(p, v_largo - v_i, 1)::int;
    v_suma := v_suma + v_digito * (case when v_i % 2 = 1 then 3 else 1 end);
  end loop;
  return (10 - (v_suma % 10)) % 10 = substr(p, v_largo, 1)::int;
end;
$$;

-- Forma canónica de 14 dígitos de un GTIN publicable. Devuelve NULL si el
-- código no es GTIN válido o si cae en un rango de circulación restringida
-- (RCN: prefijos 02, 04 y 20-29 en su forma de 13 dígitos; GTIN-8 que empiezan
-- con 0 o 2). Estado imposible que sostiene: el mismo producto leído como
-- 7751234567890 (EAN-13) y 07751234567890 (GTIN-14 dentro de un Digital Link)
-- registrado dos veces, o un código interno "2..." tratado como GTIN real.
create or replace function fn_gtin14(p text)
returns text
language sql
immutable
as $$
  select case
    when not fn_gtin_valido(p) then null
    when length(p) = 8 and left(p, 1) in ('0', '2') then null
    when length(p) <> 8 and (right(lpad(p, 14, '0'), 13) ~ '^(02|04|2[0-9])') then null
    else lpad(p, 14, '0')
  end
$$;

-- Disparador genérico: tabla que solo acepta filas nuevas.
create or replace function fn_rechazar_update_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La tabla % no se edita ni se borra: un error se corrige escribiendo una fila nueva que lo compensa.', tg_table_name
    using errcode = 'P0001';
end;
$$;

-- Disparador genérico por SENTENCIA: tabla que no se vacía (ADR-0070).
-- Estado imposible: un `truncate variantes cascade` "para limpiar datos de
-- prueba" que se lleva el libro, las líneas de venta y los precios de un golpe.
-- El disparador por fila de arriba no se activa con TRUNCATE; este sí, también
-- cuando el TRUNCATE llega en cascada desde otra tabla.
create or replace function fn_rechazar_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La tabla % no se vacía: guarda historia. Los datos de prueba se apagan o se compensan con filas nuevas.', tg_table_name
    using errcode = 'P0001';
end;
$$;

-- ============================================================================
-- 1 · VOCABULARIOS CERRADOS
-- ============================================================================

-- ---------- Escalas de talla y tallas ----------
-- Por qué existe: "la talla que se está quedando" compara S contra M contra L
-- del mismo modelo-color en la misma sede, y suma la M de TODAS las blusas.
-- Eso exige que la talla sea un id compartido y ORDENADO, no texto.
create table escalas_talla (
  id        uuid primary key default gen_random_uuid(),
  codigo    text not null,
  nombre    text not null,
  sistema   text not null,
  activo    boolean not null default true,
  -- Imposible: dos escalas "Letras" que parten la misma curva en dos.
  constraint escalas_talla_codigo_unico unique (codigo),
  constraint escalas_talla_codigo_formato check (codigo ~ '^[A-Z0-9_]{2,20}$'),
  -- Imposible: una escala cuyo sistema nadie sabe traducir (a Google, a la
  -- etiqueta, a la guía de tallas). 'unica' es un sistema real, no un vacío.
  -- Qué familia usa qué sistema (decisión D2 del ADR):
  --   indumentaria -> letras, numerica (6-8-10-12, 36/38), cintura, cintura_largo
  --   calzado      -> calzado_eu
  --   bisuteria    -> anillo (anillos) o unica
  --   accesorios   -> unica, o cintura/letras (cinturones)
  --   belleza      -> contenido (30 ml / 50 ml) o unica. El TONO no es talla:
  --                   es la opción (producto_colores), igual que el color de una blusa.
  --   papeleria    -> unica
  --   infantil     -> edad_infantil
  constraint escalas_talla_sistema_valido
    check (sistema in ('letras', 'numerica', 'cintura', 'cintura_largo', 'calzado_eu',
                       'edad_infantil', 'anillo', 'contenido', 'unica'))
);

create table tallas (
  id         uuid primary key default gen_random_uuid(),
  escala_id  uuid not null references escalas_talla (id),
  codigo     text not null,           -- lo que va en el código impreso: M, 28, 37, U, 1012, 50ML
  etiqueta   text not null,           -- lo que lee la clienta: "M", "Talla única", "10-12", "36/38"
  orden      integer not null,
  -- Talla clave POR ESCALA (no por categoría ni por sede): ver D2, SE ROMPE SI.
  es_clave   boolean not null default false,
  activo     boolean not null default true,
  -- Imposible: "M" y "m " como dos tallas de la misma escala.
  constraint tallas_codigo_unico_en_escala unique (escala_id, codigo),
  -- El código no lleva separadores porque el código de variante ya usa '-':
  -- "10-12" se imprime 1012 y se lee "10-12" en la etiqueta.
  constraint tallas_codigo_formato check (codigo ~ '^[A-Z0-9]{1,5}$'),
  -- Imposible: dos tallas en el mismo puesto de la curva (no se sabría si la M
  -- va antes o después de la L).
  constraint tallas_orden_unico_en_escala unique (escala_id, orden),
  -- Permite que variantes exija, con FK compuesta, que la talla pertenezca a la
  -- escala del modelo.
  constraint tallas_id_escala_unico unique (id, escala_id)
);

-- Sinónimos de captura: lo que alguien teclea o trae el proveedor ("2XL") y la
-- talla canónica a la que apunta (XXL). Estado imposible que sostiene: XXL y
-- 2XL cargadas como DOS tallas de la escala, que parten la curva en dos
-- (apps/web/lib/tallas.ts:8 hoy conoce las dos). Se siembra desde esa lista.
create table tallas_sinonimos (
  escala_id  uuid not null references escalas_talla (id),
  texto      text not null,
  talla_id   uuid not null,
  constraint tallas_sinonimos_talla_de_la_escala
    foreign key (talla_id, escala_id) references tallas (id, escala_id)
);
create unique index tallas_sinonimos_texto_unico on tallas_sinonimos (escala_id, fn_clave_texto(texto));

-- Una talla usada no se renombra de código ni se muda de escala: el código ya
-- está impreso en etiquetas. Y su `orden` tampoco cambia una vez que una
-- variante la usa: la curva de la temporada pasada se compara con la de esta
-- en ese orden. Al crear una talla, su código no puede ser un sinónimo ya
-- declarado de otra (el 2XL no nace como talla si ya es sinónimo de XXL).
create or replace function fn_talla_reglas()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from tallas_sinonimos s
             where s.escala_id = new.escala_id
               and fn_clave_texto(s.texto) = fn_clave_texto(new.codigo)
               and s.talla_id <> new.id) then
    raise exception '% ya es sinónimo de otra talla de esta escala: usa esa talla.', new.codigo;
  end if;
  if tg_op = 'UPDATE' then
    if new.codigo is distinct from old.codigo or new.escala_id is distinct from old.escala_id then
      raise exception 'La talla % ya existe con ese código y esa escala; para otra talla, crea una nueva y apaga esta.', old.codigo;
    end if;
    if new.orden is distinct from old.orden
       and exists (select 1 from variantes v where v.talla_id = old.id) then
      raise exception 'La talla % ya tiene prendas: su puesto en la curva no cambia.', old.codigo;
    end if;
  end if;
  return new;
end;
$$;

create trigger tallas_reglas
  before insert or update on tallas
  for each row execute function fn_talla_reglas();

-- Imposible: declarar "2XL" sinónimo de XXL cuando 2XL ya existe como talla
-- aparte (habría que apagar una de las dos primero, y eso es una decisión).
create or replace function fn_talla_sinonimo_reglas()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from tallas t
             where t.escala_id = new.escala_id
               and fn_clave_texto(t.codigo) = fn_clave_texto(new.texto)
               and t.id <> new.talla_id) then
    raise exception '"%" ya es una talla propia de esta escala; no puede ser sinónimo de otra.', new.texto;
  end if;
  return new;
end;
$$;

create trigger tallas_sinonimos_reglas
  before insert or update on tallas_sinonimos
  for each row execute function fn_talla_sinonimo_reglas();

-- ---------- Colores base (solo matiz) ----------
-- Por qué cambia: hoy EST (Estampado), MUL (Multicolor) y ANI (Animal print)
-- son "colores", y además colores.tipo y colores.familia_color repiten
-- 'estampado' (ADR-0061). Un "Floral azul/blanco" desaparece del análisis del
-- azul. Aquí colores es solo matiz; el estampado va aparte.
create table colores (
  codigo         text primary key,
  nombre         text not null,
  familia_color  text not null,
  hex            text not null,
  orden          integer not null default 100,
  activo         boolean not null default true,
  -- Imposible: un color sin segmento de 3 letras para el código impreso.
  constraint colores_codigo_formato check (codigo ~ '^[A-Z]{3}$'),
  -- Imposible: "estampado" como matiz. La familia agrupa matices, nada más.
  constraint colores_familia_valida
    check (familia_color in ('neutro', 'azul', 'rojo', 'rosado', 'amarillo', 'verde', 'morado', 'tierra', 'metalico')),
  -- Imposible: un color base sin chip de color (ahora que los estampados ya no
  -- viven aquí, todo color base tiene hex).
  constraint colores_hex_formato check (hex ~ '^#[0-9A-Fa-f]{6}$')
);
-- Imposible: "Azul marino", "azul  marino" y "AZUL MARINO" conviviendo.
create unique index colores_clave_unica on colores (fn_clave_texto(nombre));

-- ---------- Estampados ----------
create table estampados (
  codigo  text primary key,
  nombre  text not null,
  orden   integer not null default 100,
  activo  boolean not null default true,
  constraint estampados_codigo_formato check (codigo ~ '^[A-Z]{3}$')
);
create unique index estampados_clave_unica on estampados (fn_clave_texto(nombre));

-- ---------- Temporadas ----------
-- Por qué existe: productos.temporada es texto libre (ADR-0060). "Verano 26",
-- "verano 2026" y "PV26" serían tres temporadas y "cuánto se venderá la
-- temporada contra la anterior" no tendría ventana de fechas.
create table temporadas (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null,
  nombre              text not null,
  anio                integer not null,
  tipo                text not null,
  inicio_venta        date not null,
  fin_venta           date not null,
  inicio_liquidacion  date,
  constraint temporadas_codigo_unico unique (codigo),
  constraint temporadas_codigo_formato check (codigo ~ '^[A-Z]{2}[0-9]{2}$'),
  constraint temporadas_tipo_valido
    check (tipo in ('verano', 'invierno', 'escolar', 'fiestas', 'continuidad')),
  -- Imposible: una temporada que termina antes de empezar.
  constraint temporadas_fechas_coherentes check (fin_venta >= inicio_venta),
  -- Imposible: una liquidación fuera de la ventana de venta de su temporada.
  constraint temporadas_liquidacion_dentro
    check (inicio_liquidacion is null or inicio_liquidacion between inicio_venta and fin_venta)
);

-- Una temporada con productos ya no cambia de código, año, tipo ni inicio de
-- venta: "PV27 contra PV26" se mide desde ese inicio. `fin_venta` e
-- `inicio_liquidacion` SÍ se editan (son el plan y el plan se mueve), y por eso
-- la inteligencia no los usa como denominador: mide desde surtido.lanzamiento_en
-- y el libro.
create or replace function fn_temporada_reglas()
returns trigger
language plpgsql
as $$
begin
  if (new.codigo, new.anio, new.tipo, new.inicio_venta)
     is distinct from (old.codigo, old.anio, old.tipo, old.inicio_venta)
     and exists (select 1 from productos p where p.temporada_lanzamiento_id = old.id) then
    raise exception 'La temporada % ya tiene productos: código, año, tipo e inicio de venta no cambian.', old.codigo;
  end if;
  return new;
end;
$$;

create trigger temporadas_reglas
  before update on temporadas
  for each row execute function fn_temporada_reglas();

-- ---------- Marcas ----------
create table marcas (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  es_propia boolean not null default false
);
create unique index marcas_clave_unica on marcas (fn_clave_texto(nombre));
-- Imposible: dos "marcas propias". CAYLA es una; lo del taller sale con ella.
create unique index marcas_una_sola_propia on marcas (es_propia) where es_propia;

-- ---------- Materiales textiles (Res. CAN 2109, Anexo 3) ----------
create table materiales_textiles (
  codigo       text primary key,
  nombre       text not null,            -- nombre genérico: algodón, viscosa, elastano
  es_funcional boolean not null default false, -- se declara aunque pese menos de 5% (art. 7.2.2)
  constraint materiales_codigo_formato check (codigo ~ '^[A-Z]{3}$')
);
create unique index materiales_clave_unica on materiales_textiles (fn_clave_texto(nombre));
-- 'OTR' = "otras fibras" (lo que pesa menos de 5%) debe existir como fila para
-- que la suma de 100% sea posible sin inventar.

-- ---------- Motivos de movimiento ----------
-- Por qué existe: movimientos.motivo es texto libre y solo el literal exacto
-- 'venta' sella la última venta (hueco 4 de Halcón). Producción tiene hoy 7
-- motivos distintos escritos a mano.
create table motivos_movimiento (
  codigo          text primary key,
  nombre          text not null,
  tipos_permitidos text[] not null,
  sunat_tabla12   text,                  -- código de operación del registro de inventario permanente
  lleva_costo     boolean not null default false, -- entrada que crea una capa de costo (compra, producción)
  es_sistema      boolean not null default true,  -- solo lo escribe su RPC; los no-sistema los crea la Líder
  -- Qué documento tiene que venir pegado al movimiento. Es la columna que
  -- reemplaza al literal `if motivo = 'venta'`: el disparador de movimientos
  -- no conoce ningún nombre de motivo, solo lee esta columna.
  origen_requerido text not null,
  activo          boolean not null default true,
  constraint motivos_codigo_formato check (codigo ~ '^[a-z_]{3,40}$'),
  -- Imposible: un motivo que permite un tipo de movimiento que no existe.
  constraint motivos_tipos_validos
    check (tipos_permitidos <@ array['entrada', 'salida', 'ajuste', 'traslado']::text[]
           and cardinality(tipos_permitidos) >= 1),
  constraint motivos_origen_valido
    check (origen_requerido in ('venta_item', 'devolucion_item', 'compra_item', 'conteo_item',
                                'transferencia_item', 'produccion', 'cambio', 'correccion', 'ninguno')),
  -- Imposible: un motivo "venta_pos" creado a mano como salida, que descuenta
  -- stock sin línea de venta. Un motivo que no es de sistema (lo crea una
  -- persona) solo sirve para ajustes y traslados internos, y no trae documento.
  -- Entradas y salidas nacen siempre de una función con su documento.
  constraint motivos_no_sistema_solo_ajuste_o_traslado
    check (es_sistema or (tipos_permitidos <@ array['ajuste', 'traslado']::text[]
                          and origen_requerido = 'ninguno')),
  -- Imposible: una capa de costo que no viene de una compra ni de una producción.
  constraint motivos_costo_solo_compra_o_produccion
    check (not lleva_costo or origen_requerido in ('compra_item', 'produccion')),
  -- Imposible: un código SUNAT de tabla 12 con otra forma que dos dígitos.
  -- (Los códigos concretos se validan contra el Anexo 3 de la RS 169-2015
  -- antes de sembrar: NO están verificados en esta investigación.)
  constraint motivos_sunat_formato check (sunat_tabla12 is null or sunat_tabla12 ~ '^[0-9]{2}$')
);

-- ---------- Motivos de devolución por prenda ----------
-- Por qué existe: devoluciones.motivo es texto libre y en la cabecera. "Talla
-- grande / talla pequeña" por prenda es la mitad del compromiso 5 que ningún
-- conteo de stock da (Shopify return_reasons, release 2026-02).
create table motivos_devolucion (
  codigo            text primary key,
  nombre            text not null,
  handle_estandar   text,  -- too_big, too_small, color... (versión fijada en la capa periférica)
  senala_horma      boolean not null default false,
  orden             integer not null default 100,
  activo            boolean not null default true,
  constraint motivos_devolucion_codigo_formato check (codigo ~ '^[a-z_]{3,30}$')
);

-- ============================================================================
-- 2 · SUNAT: CATÁLOGO 25 (UNSPSC v14_0801) VERSIONADO
-- ============================================================================
-- Hoy no es requisito mínimo de boleta ni factura (página "Código de producto"
-- de SUNAT, modificada 13-07-2026). Reglas de validación actualizadas al
-- 26-08-2026, hojas Factura2_0 y Boleta2_0:
--   * ERR-3496: si el tag existe y el código no está en el listado, se rechaza.
--     El control de cambios (24-04-2026) le pone DOS fechas en la misma celda,
--     "01/08/2026 01/01/2027", sin decir cuál rige para qué: hay que
--     confirmarlo con Lucode antes de mandar el tag.
--   * OBS-4331: si el RUC emisor está en el padrón ind_padron = '12'
--     ("Obligado a enviar código de producto") y la línea no trae ni código
--     SUNAT ni GTIN, SUNAT acepta con OBSERVACIÓN (no rechaza).
--   * GTIN: va en otro tag (StandardItemIdentification/cbc:ID) con
--     @schemeID GTIN-8/12/13/14; si el largo no coincide, OBS-4334.
-- Por eso: nunca texto libre; siempre FK contra el catálogo cargado.
--
-- Contradicción dentro del mismo xlsx (26-08-2026): el control de cambios del
-- 24-07-2026 dice "retorna a v14 ... se retiran los catálogos 25.1, 25.2 y
-- 25.3", pero las filas de validación de Factura, Boleta y Liquidación de
-- compra siguen diciendo "Catálogo (025, 25.1, 25.2 y 25.3)" y la hoja
-- Catálogos todavía trae esas tres tablas. `anexos` deja cargar la unión sin
-- cambiar la llave si SUNAT confirma que el listado validado la incluye.

create table sunat_catalogo_versiones (
  version     text primary key,           -- 'v14_0801'
  cargada_en  timestamptz not null default now(),
  es_vigente  boolean not null default false
);
-- Imposible: dos catálogos SUNAT vigentes a la vez.
create unique index sunat_catalogo_una_vigente on sunat_catalogo_versiones (es_vigente) where es_vigente;

create table sunat_catalogo_productos (
  version     text not null references sunat_catalogo_versiones (version),
  codigo      text not null,
  descripcion text not null,
  -- En qué anexo(s) del catálogo aparece el código ('25', y '25.1'-'25.3' si
  -- SUNAT confirma que siguen formando parte del listado validado).
  anexos      text[] not null default array['25'],
  primary key (version, codigo),
  constraint sunat_catalogo_anexos_validos
    check (anexos <@ array['25', '25.1', '25.2', '25.3']::text[] and cardinality(anexos) >= 1),
  -- Imposible: un código de producto que no tiene 8 dígitos (ERR-3496).
  constraint sunat_codigo_formato check (codigo ~ '^[0-9]{8}$')
);

-- ============================================================================
-- 3 · JERARQUÍA: FAMILIA (fija) > CATEGORÍA > SUBCATEGORÍA (un nivel)
-- ============================================================================

create table categorias (
  id                  uuid primary key default gen_random_uuid(),
  familia             text not null,
  nombre              text not null,
  prefijo             text not null,
  categoria_padre_id  uuid references categorias (id),
  escala_talla_id     uuid not null references escalas_talla (id),
  -- Sin valor por defecto a propósito: cada categoría se decide una vez. No se
  -- deduce de la familia: cinturones y chalinas (accesorios) llevan etiqueta
  -- de la Res. CAN 2109, y la cosmética va por su propio reglamento.
  requiere_etiqueta_textil boolean not null,
  activo              boolean not null default true,
  notas               text,
  -- Imposible: una séptima familia sin migración.
  constraint categorias_familia_valida
    check (familia in ('indumentaria', 'calzado', 'accesorios', 'bisuteria', 'belleza', 'papeleria')),
  -- Imposible: una categoría sin las 3 letras que abren el código impreso.
  constraint categorias_prefijo_formato check (prefijo ~ '^[A-Z]{3}$'),
  -- Imposible: BLU-0042 ambiguo entre dos categorías.
  constraint categorias_prefijo_unico unique (prefijo),
  -- Imposible: una categoría que es su propio padre.
  constraint categorias_no_autopadre check (categoria_padre_id is distinct from id)
);
-- Imposible: dos "Largos" bajo Vestidos; sí se permite "Largos" bajo Vestidos
-- y "Largos" bajo Faldas (la unicidad global de hoy lo impediría).
create unique index categorias_nombre_unico_por_padre
  on categorias (familia, categoria_padre_id, fn_clave_texto(nombre)) nulls not distinct;

-- Reglas de árbol que un CHECK no puede ver (miran otras filas):
--   (a) un solo nivel: el padre no puede tener padre, y una categoría con
--       hijas no puede volverse hija (ADR-0062, se conserva);
--   (b) la hija hereda la familia del padre (ADR-0062, se conserva);
--   (c) NUEVO: una categoría que ya tiene productos no puede recibir hijas
--       (la hoja deja de ser hoja y sus productos quedarían en un cajón
--       fantasma "Vestidos sin subcategoría");
--   (d) NUEVO: prefijo y familia no cambian si la categoría ya tiene productos;
--   (e) NUEVO: la familia de un PADRE no cambia si alguna hija tiene productos
--       (el padre nunca tiene productos por la regla de hoja, así que (d) sola
--       no lo protegía: "Vestidos" pasaba a calzado y "Largos" seguía en
--       indumentaria). Si ninguna hija tiene productos, el cambio se propaga
--       a las hijas en `categorias_propaga_familia`.
-- CONCURRENCIA: se bloquea la fila del padre (`for update`) ANTES de mirar si
-- tiene productos. `fn_producto_reglas` bloquea la categoría elegida antes de
-- mirar si tiene hijas. Así "crear una hija" y "colgar un producto" de la
-- misma categoría en dos sesiones a la vez se ordenan: la segunda espera, y al
-- seguir ve lo que hizo la primera y se rechaza.
create or replace function fn_categoria_reglas()
returns trigger
language plpgsql
as $$
declare
  v_padre categorias%rowtype;
begin
  if new.categoria_padre_id is not null then
    select * into v_padre from categorias where id = new.categoria_padre_id for update;
    if v_padre.categoria_padre_id is not null then
      raise exception 'Solo hay un nivel de subcategoría: "%" ya es subcategoría.', v_padre.nombre;
    end if;
    if exists (select 1 from categorias h where h.categoria_padre_id = new.id) then
      raise exception 'La categoría "%" tiene subcategorías y no puede volverse subcategoría.', new.nombre;
    end if;
    if exists (select 1 from productos p where p.categoria_id = new.categoria_padre_id) then
      raise exception 'La categoría "%" ya tiene productos: primero muévelos a una subcategoría y luego créala.', v_padre.nombre;
    end if;
    new.familia := v_padre.familia;
  end if;

  if tg_op = 'UPDATE' and exists (select 1 from productos p where p.categoria_id = old.id) then
    if new.prefijo is distinct from old.prefijo then
      raise exception 'El prefijo % ya está en códigos impresos; no se cambia.', old.prefijo;
    end if;
    if new.familia is distinct from old.familia then
      raise exception 'La familia de "%" ya clasifica ventas pasadas; no se cambia.', old.nombre;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.familia is distinct from old.familia
     and exists (select 1 from categorias h join productos p on p.categoria_id = h.id
                 where h.categoria_padre_id = old.id) then
    raise exception 'Las subcategorías de "%" ya tienen productos: su familia no cambia.', old.nombre;
  end if;
  return new;
end;
$$;

-- (e) Propagación: corre DESPUÉS de escribir el padre, para que el disparador
-- de cada hija lea la familia nueva al heredarla.
create or replace function fn_categoria_propaga_familia()
returns trigger
language plpgsql
as $$
begin
  update categorias set familia = new.familia
  where categoria_padre_id = new.id and familia is distinct from new.familia;
  return null;
end;
$$;

-- ============================================================================
-- 4 · CATÁLOGO: PRODUCTO (modelo) > PRODUCTO_COLOR (opción) > VARIANTE (talla)
-- ============================================================================

create table productos (
  id                        uuid primary key default gen_random_uuid(),
  codigo                    text not null,
  referencia                text not null,
  descripcion               text,
  categoria_id              uuid not null references categorias (id),
  escala_talla_id           uuid not null references escalas_talla (id),
  publico                   text not null,
  marca_id                  uuid not null references marcas (id),
  origen                    text not null,
  tipo_surtido              text not null,
  temporada_lanzamiento_id  uuid references temporadas (id),
  pais_origen               text not null default 'PE',
  sunat_version             text,
  sunat_codigo_excepcion    text,
  -- Se CONSERVA (decisión de Felipe del 2026-09-15, 20260916100000_punto_reorden.sql):
  -- es el piso del punto de reorden de COMPRA, que es global por producto
  -- porque el proveedor despacha para la empresa, no para una sede. Las
  -- alertas por sede (bajar, trasladar, producir) no lo leen.
  stock_minimo              integer not null default 0,
  estado                    text not null default 'borrador',
  version                   integer not null default 1,
  created_at                timestamptz not null default now(),
  -- Imposible: dos modelos llamados BLU-0042.
  constraint productos_codigo_unico unique (codigo),
  constraint productos_codigo_formato check (codigo ~ '^[A-Z]{3}-[0-9]{4}$'),
  -- Permite que variantes exija con FK que su escala sea la del modelo.
  constraint productos_id_escala_unico unique (id, escala_talla_id),
  -- Imposible: un público que no sirve ni para el código SUNAT ni para Google.
  constraint productos_publico_valido
    check (publico in ('mujer', 'hombre', 'nina', 'nino', 'bebe', 'unisex')),
  -- Imposible: no saber quién figura legalmente como fabricante en la etiqueta
  -- (Res. CAN 2109, nota 2 del art. 4.15: responde quien manda a fabricar).
  constraint productos_origen_valido
    check (origen in ('taller_propio', 'encargo', 'compra_nacional', 'importacion')),
  constraint productos_tipo_surtido_valido check (tipo_surtido in ('basico', 'temporada')),
  -- Imposible: una prenda "de temporada" que no dice de qué temporada.
  constraint productos_temporada_si_es_de_temporada
    check (tipo_surtido = 'basico' or temporada_lanzamiento_id is not null),
  -- Imposible: un país de origen que no es ISO 3166-1 alfa-2.
  constraint productos_pais_formato check (pais_origen ~ '^[A-Z]{2}$'),
  -- Imposible: una excepción SUNAT sin versión de catálogo (o al revés).
  constraint productos_sunat_par_completo
    check ((sunat_version is null) = (sunat_codigo_excepcion is null)),
  -- Imposible: un código SUNAT que no existe en el Catálogo 25 cargado.
  constraint productos_sunat_existe
    foreign key (sunat_version, sunat_codigo_excepcion)
    references sunat_catalogo_productos (version, codigo),
  constraint productos_estado_valido check (estado in ('borrador', 'vigente', 'archivado')),
  constraint productos_version_positiva check (version >= 1),
  constraint productos_stock_minimo_no_negativo check (stock_minimo >= 0)
);

create trigger categorias_reglas
  before insert or update on categorias
  for each row execute function fn_categoria_reglas();

create trigger categorias_propaga_familia
  after update of familia on categorias
  for each row execute function fn_categoria_propaga_familia();

-- Reglas del producto que miran otras tablas:
--   * el producto cuelga SOLO de una hoja (categoría sin hijas), con la fila
--     de la categoría bloqueada antes de mirar (ver CONCURRENCIA arriba);
--   * al nacer, el prefijo del código es el de su categoría (la marca de
--     nacimiento; después la categoría puede cambiar y el código no);
--   * `codigo`, `origen` y `escala_talla_id` no cambian una vez acuñados
--     (la escala además queda fija por la FK desde variantes);
--   * `version` sube en cada edición: concurrencia optimista (la RPC compara).
create or replace function fn_producto_reglas()
returns trigger
language plpgsql
as $$
declare
  v_categoria categorias%rowtype;
begin
  -- `for share`: dos productos pueden colgarse a la vez de la misma hoja, pero
  -- no mientras otra sesión le crea una hija (esa toma `for update`).
  select * into v_categoria from categorias where id = new.categoria_id for share;
  if exists (select 1 from categorias h where h.categoria_padre_id = new.categoria_id) then
    raise exception 'Elige una subcategoría: la categoría elegida tiene subcategorías y un producto solo cuelga de la última.';
  end if;
  if tg_op = 'INSERT' and left(new.codigo, 3) <> v_categoria.prefijo then
    raise exception 'El código % no empieza con el prefijo % de su categoría.', new.codigo, v_categoria.prefijo;
  end if;
  if tg_op = 'UPDATE' then
    if new.codigo is distinct from old.codigo then
      raise exception 'El código % ya está impreso en etiquetas; no se cambia.', old.codigo;
    end if;
    if new.origen is distinct from old.origen then
      raise exception 'El origen del modelo define quién es el fabricante legal; para otro origen, crea otro modelo.';
    end if;
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger productos_reglas
  before insert or update on productos
  for each row execute function fn_producto_reglas();

-- ---------- Producto-color (la "opción", el modelo en un color) ----------
-- Por qué existe: en moda la unidad de decisión es modelo-color. El taller corta
-- por color de tela, la foto que pide la clienta es la del vino, y se liquida
-- el vino sin tocar el negro. Hoy "retirar un color" es tocar N tallas y las
-- fotos cuelgan solo del modelo.
create table producto_colores (
  id                  uuid primary key default gen_random_uuid(),
  producto_id         uuid not null references productos (id),
  codigo              text not null,     -- segmento del código de variante: BLU-0042-FLV-M
  nombre_comercial    text not null,     -- "Flores vino": lo decide la encargada, no la IA
  color_principal     text references colores (codigo),
  color_secundario_1  text references colores (codigo),
  color_secundario_2  text references colores (codigo),
  estampado_codigo    text references estampados (codigo),
  estado              text not null default 'vigente',
  created_at          timestamptz not null default now(),
  constraint producto_colores_codigo_formato check (codigo ~ '^[A-Z]{3}$'),
  -- Imposible: dos opciones del mismo modelo con el mismo segmento de código.
  constraint producto_colores_codigo_unico unique (producto_id, codigo),
  constraint producto_colores_id_producto_unico unique (id, producto_id),
  -- Ciclo de vida de la opción, NO precio: "está en liquidación" no vive aquí
  -- ni en surtido; se deriva de `precios` (vista v_liquidacion_vigente). Una
  -- sola fuente para la inteligencia.
  constraint producto_colores_estado_valido check (estado in ('vigente', 'salida')),
  -- Imposible: un segundo color secundario sin el primero.
  constraint producto_colores_secundarios_en_orden
    check (color_secundario_2 is null or color_secundario_1 is not null),
  -- Imposible: repetir el principal como secundario ("Vino/Vino").
  constraint producto_colores_secundarios_distintos
    check (color_secundario_1 is distinct from color_principal
           and color_secundario_2 is distinct from color_principal
           and (color_secundario_2 is null or color_secundario_2 <> color_secundario_1)),
  -- Imposible: un "sin color" con secundarios o estampado. El único caso sin
  -- color principal (belleza, papelería) se llama UNC y no lleva nada más.
  constraint producto_colores_sin_color_coherente
    check ((color_principal is null) = (codigo = 'UNC')
           and (color_principal is not null or (color_secundario_1 is null and estampado_codigo is null)))
);
-- Imposible: la misma combinación de colores y estampado cargada dos veces en
-- el mismo modelo con dos códigos distintos (dos stocks para la misma prenda).
create unique index producto_colores_combinacion_unica
  on producto_colores (producto_id, color_principal, color_secundario_1, color_secundario_2, estampado_codigo)
  nulls not distinct;

-- El segmento de código de la opción no cambia una vez creada.
create or replace function fn_producto_color_inmutable()
returns trigger
language plpgsql
as $$
begin
  if new.codigo is distinct from old.codigo or new.producto_id is distinct from old.producto_id then
    raise exception 'La opción % ya tiene códigos impresos; no cambia de código ni de modelo.', old.codigo;
  end if;
  if (new.color_principal, new.color_secundario_1, new.color_secundario_2, new.estampado_codigo)
     is distinct from (old.color_principal, old.color_secundario_1, old.color_secundario_2, old.estampado_codigo)
     and exists (select 1 from variantes v where v.producto_color_id = old.id) then
    raise exception 'La opción % ya tiene tallas; si el color real es otro, crea otra opción y traslada el stock.', old.codigo;
  end if;
  return new;
end;
$$;

-- ---------- Variante (lo que se escanea, se cuenta y se vende) ----------
create table variantes (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid not null,
  producto_color_id  uuid not null,
  escala_talla_id    uuid not null,
  talla_id           uuid not null,
  -- Lo compone la base (fn_variante_codigo_compuesto), igual que V2 hoy con
  -- fn_asignar_codigo_variante: nadie lo teclea.
  codigo             text not null,
  -- Promedio ponderado DERIVADO (ADR-0067, aplicado en producción). Solo lo
  -- escribe fn_recalcular_costo_variante; el libro de costo es costo_historial.
  costo              numeric(12,2) not null default 0,
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  -- Imposible: una variante cuyo color es de OTRO modelo.
  constraint variantes_color_del_mismo_modelo
    foreign key (producto_color_id, producto_id) references producto_colores (id, producto_id),
  -- Imposible: una talla de calzado en una blusa (la escala de la variante es
  -- la del modelo, y la talla pertenece a esa escala).
  constraint variantes_escala_del_modelo
    foreign key (producto_id, escala_talla_id) references productos (id, escala_talla_id),
  constraint variantes_talla_de_la_escala
    foreign key (talla_id, escala_talla_id) references tallas (id, escala_id),
  -- Imposible: "Blusa Aurora, Flores vino, M" dos veces, cada una con su stock.
  -- Sin columnas que aceptan vacío: no hay rendija de NULL que cerrar.
  constraint variantes_identidad_unica unique (producto_color_id, talla_id),
  -- Permite que la línea de venta ate su copia congelada (opción y talla) a
  -- la variante que vendió, con FK compuesta.
  constraint variantes_id_color_talla_unico unique (id, producto_color_id, talla_id),
  -- Imposible: dos prendas llamadas BLU-0042-FLV-M.
  constraint variantes_codigo_unico unique (codigo),
  constraint variantes_codigo_formato check (codigo ~ '^[A-Z]{3}-[0-9]{4}-[A-Z]{3}-[A-Z0-9]{1,5}$'),
  constraint variantes_costo_no_negativo check (costo >= 0)
);

-- Imposible: la etiqueta dice VEL-0001-VIN-L y el sistema descuenta la S; o
-- el código de otro modelo (ZZZ-9999-BLA-M) pegado a esta prenda. Como D10
-- congela el código desde que nace, un código mal armado quedaría mal para
-- siempre: por eso lo compone la base. Si el llamador no lo manda, se escribe;
-- si manda otro valor, se rechaza.
create or replace function fn_variante_codigo_compuesto()
returns trigger
language plpgsql
as $$
declare
  v_esperado text;
begin
  select p.codigo || '-' || pc.codigo || '-' || t.codigo into v_esperado
  from productos p
  join producto_colores pc on pc.id = new.producto_color_id and pc.producto_id = p.id
  join tallas t on t.id = new.talla_id
  where p.id = new.producto_id;
  if v_esperado is null then
    raise exception 'No se puede componer el código: el modelo, la opción o la talla no existen o no se corresponden.';
  end if;
  if new.codigo is null then
    new.codigo := v_esperado;
  elsif new.codigo <> v_esperado then
    raise exception 'El código de esta prenda es %, no %: lo compone la base desde modelo, opción y talla.', v_esperado, new.codigo;
  end if;
  return new;
end;
$$;

create trigger variantes_codigo_compuesto
  before insert on variantes
  for each row execute function fn_variante_codigo_compuesto();

create or replace function fn_variante_identidad_inmutable()
returns trigger
language plpgsql
as $$
begin
  if (new.producto_id, new.producto_color_id, new.talla_id, new.codigo)
     is distinct from (old.producto_id, old.producto_color_id, old.talla_id, old.codigo) then
    raise exception 'La prenda % no cambia de modelo, color, talla ni código. Si se cargó mal: apágala, crea la correcta y traslada el stock con un movimiento.', old.codigo;
  end if;
  return new;
end;
$$;

create trigger variantes_identidad_inmutable
  before update on variantes
  for each row execute function fn_variante_identidad_inmutable();

create trigger producto_colores_inmutable
  before update on producto_colores
  for each row execute function fn_producto_color_inmutable();

-- Las filas del catálogo no se borran: se apagan o se archivan.
create trigger productos_sin_borrado before delete on productos
  for each row execute function fn_rechazar_update_delete();
create trigger producto_colores_sin_borrado before delete on producto_colores
  for each row execute function fn_rechazar_update_delete();
create trigger variantes_sin_borrado before delete on variantes
  for each row execute function fn_rechazar_update_delete();

-- ---------- Fotos por modelo o por modelo-color ----------
create table producto_fotos (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid not null references productos (id),
  producto_color_id  uuid,   -- vacío = foto del modelo (sirve a todos los colores)
  url                text not null,
  orden              integer not null default 0,
  es_principal       boolean not null default false,
  created_at         timestamptz not null default now(),
  -- Imposible: la foto del vino colgada del modelo de otra blusa.
  constraint producto_fotos_color_del_mismo_modelo
    foreign key (producto_color_id, producto_id) references producto_colores (id, producto_id)
);
-- Imposible: dos fotos principales para el mismo modelo-color.
create unique index producto_fotos_una_principal
  on producto_fotos (producto_id, producto_color_id) nulls not distinct where es_principal;

-- ---------- Códigos de barras: todo lo que la pistola puede leer ----------
create table codigos_barras (
  id           uuid primary key default gen_random_uuid(),
  variante_id  uuid not null references variantes (id),
  codigo       text not null,
  tipo         text not null,
  gtin14       text generated always as (
                 case when tipo in ('ean13', 'ean8', 'upca', 'gtin14', 'gtin_cayla') then fn_gtin14(codigo) end
               ) stored,
  es_principal boolean not null default false,
  retirado_en  timestamptz,
  creado_por   uuid,   -- personas (Dynamic)
  created_at   timestamptz not null default now(),
  -- Imposible: un escaneo que lleva a dos prendas (la caja cobra una por otra).
  constraint codigos_barras_codigo_unico unique (codigo),
  constraint codigos_barras_tipo_valido
    check (tipo in ('cayla_corto', 'sku_legado', 'ean13', 'ean8', 'upca', 'gtin14', 'gtin_cayla')),
  -- Imposible: guardar como EAN/UPC/GTIN un número con dígito verificador malo
  -- o de circulación restringida (Google lo rechaza; ninguna pistola ajena lo
  -- reconoce).
  constraint codigos_barras_gtin_valido
    check (tipo not in ('ean13', 'ean8', 'upca', 'gtin14', 'gtin_cayla') or gtin14 is not null),
  -- Imposible: un código retirado que sigue siendo el que se imprime.
  constraint codigos_barras_principal_vigente check (not (es_principal and retirado_en is not null))
);
-- Imposible: el mismo producto leído como 13 y como 14 dígitos registrado dos veces.
create unique index codigos_barras_gtin14_unico on codigos_barras (gtin14) where gtin14 is not null;
-- Imposible: dos códigos "principales" por prenda (qué sale en la etiqueta no
-- puede depender del orden de inserción).
create unique index codigos_barras_un_principal on codigos_barras (variante_id) where es_principal;
-- Imposible: dos GTIN propios de CAYLA para la misma prenda (GS1: 1 GTIN ↔ 1 estilo×color×talla).
create unique index codigos_barras_un_gtin_cayla on codigos_barras (variante_id) where tipo = 'gtin_cayla';
-- Imposible: dos códigos cortos CAYLA para la misma prenda.
create unique index codigos_barras_un_cayla_corto on codigos_barras (variante_id) where tipo = 'cayla_corto';
create index codigos_barras_variante_idx on codigos_barras (variante_id);

-- Imposible: un QR 'cayla_corto' que dice VEL-0001-VIN-L apuntando a la
-- variante VEL-0001-VIN-S. El código corto es el de la variante, letra por letra.
create or replace function fn_codigo_barras_corto_coherente()
returns trigger
language plpgsql
as $$
begin
  if new.tipo = 'cayla_corto'
     and not exists (select 1 from variantes v where v.id = new.variante_id and v.codigo = new.codigo) then
    raise exception 'El código corto % no es el de esa prenda.', new.codigo;
  end if;
  return new;
end;
$$;

create trigger codigos_barras_corto_coherente
  before insert on codigos_barras
  for each row execute function fn_codigo_barras_corto_coherente();

-- El código leído no se edita nunca; solo se marca retirado o principal.
create or replace function fn_codigo_barras_inmutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un código de barras no se borra: se marca retirado para saber qué prenda lo tuvo.';
  end if;
  if (new.codigo, new.tipo, new.variante_id) is distinct from (old.codigo, old.tipo, old.variante_id) then
    raise exception 'El código % ya puede estar pegado en una percha; no se edita, se retira y se registra otro.', old.codigo;
  end if;
  if old.retirado_en is not null and new.retirado_en is distinct from old.retirado_en then
    raise exception 'Un código retirado no vuelve a la vida: registra uno nuevo.';
  end if;
  return new;
end;
$$;

create trigger codigos_barras_inmutable
  before update or delete on codigos_barras
  for each row execute function fn_codigo_barras_inmutable();

-- ---------- Atributos descriptivos propios (NO crean variantes ni stock) ----------
create table atributos (
  id      uuid primary key default gen_random_uuid(),
  codigo  text not null unique,         -- tejido, silueta, largo, manga, cuello, ocasion
  nombre  text not null,
  nivel   text not null default 'producto',
  constraint atributos_codigo_formato check (codigo ~ '^[a-z_]{3,30}$'),
  -- Imposible: un atributo que se guarda a veces por modelo y a veces por color.
  constraint atributos_nivel_valido check (nivel in ('producto', 'producto_color'))
);

create table atributo_valores (
  id           uuid primary key default gen_random_uuid(),
  atributo_id  uuid not null references atributos (id),
  codigo       text not null,
  nombre       text not null,
  orden        integer not null default 100,
  activo       boolean not null default true,
  constraint atributo_valores_codigo_unico unique (atributo_id, codigo),
  constraint atributo_valores_id_atributo_unico unique (id, atributo_id)
);
create unique index atributo_valores_clave_unica on atributo_valores (atributo_id, fn_clave_texto(nombre));

create table categoria_atributos (
  categoria_id  uuid not null references categorias (id),
  atributo_id   uuid not null references atributos (id),
  requerido     boolean not null default false,
  primary key (categoria_id, atributo_id)
);

create table producto_atributos (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid not null references productos (id),
  producto_color_id  uuid,
  atributo_id        uuid not null references atributos (id),
  valor_id           uuid not null,
  origen             text not null,
  confirmado_por     uuid,   -- personas (Dynamic)
  created_at         timestamptz not null default now(),
  -- Imposible: "Algodón" guardado como valor de Manga (el valor pertenece a su atributo).
  constraint producto_atributos_valor_del_atributo
    foreign key (valor_id, atributo_id) references atributo_valores (id, atributo_id),
  constraint producto_atributos_color_del_mismo_modelo
    foreign key (producto_color_id, producto_id) references producto_colores (id, producto_id),
  -- Imposible: un dato de catálogo sin saber si lo puso una persona, el taller o la IA.
  constraint producto_atributos_origen_valido check (origen in ('persona', 'taller', 'ia_confirmada')),
  constraint producto_atributos_ia_confirmada_por_alguien
    check (origen <> 'ia_confirmada' or confirmado_por is not null)
);
-- Imposible: dos valores de "Manga" para la misma blusa-color.
create unique index producto_atributos_uno_por_atributo
  on producto_atributos (producto_id, producto_color_id, atributo_id) nulls not distinct;

-- Imposible: preguntarle "tipo de tacón" a una blusa: el atributo tiene que
-- estar declarado para la categoría del producto, y guardarse en su nivel.
create or replace function fn_producto_atributo_aplica()
returns trigger
language plpgsql
as $$
declare
  v_nivel text;
begin
  if not exists (
    select 1 from categoria_atributos ca join productos p on p.categoria_id = ca.categoria_id
    where p.id = new.producto_id and ca.atributo_id = new.atributo_id) then
    raise exception 'Ese atributo no aplica a la categoría de este producto.';
  end if;
  select nivel into v_nivel from atributos where id = new.atributo_id;
  if (v_nivel = 'producto') <> (new.producto_color_id is null) then
    raise exception 'Ese atributo se guarda a nivel %.', v_nivel;
  end if;
  return new;
end;
$$;

create trigger producto_atributos_aplica
  before insert or update on producto_atributos
  for each row execute function fn_producto_atributo_aplica();

-- ---------- Composición textil (etiqueta legal) ----------
create table composiciones (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid not null references productos (id),
  producto_color_id  uuid,          -- vacío = igual para todos los colores
  pieza              smallint not null default 1,   -- conjuntos: cada prenda su etiqueta (art. 11)
  parte              text not null default 'principal',
  material_codigo    text not null references materiales_textiles (codigo),
  porcentaje         numeric(5,2) not null,
  constraint composiciones_color_del_mismo_modelo
    foreign key (producto_color_id, producto_id) references producto_colores (id, producto_id),
  constraint composiciones_parte_valida check (parte in ('principal', 'forro', 'relleno', 'contraste')),
  -- Imposible: un material con 0% o más de 100%.
  constraint composiciones_porcentaje_rango check (porcentaje > 0 and porcentaje <= 100),
  constraint composiciones_pieza_positiva check (pieza >= 1)
);
-- Imposible: "algodón" dos veces en la misma parte de la misma pieza.
create unique index composiciones_material_unico
  on composiciones (producto_id, producto_color_id, pieza, parte, material_codigo) nulls not distinct;

-- Imposible: una etiqueta que declara 95% o 110%. Diferido al final de la
-- transacción para poder cargar todas las fibras juntas. Revisa el grupo
-- NUEVO y también el VIEJO: mover el elastano del "principal" al "forro" deja
-- el principal en 95%, y ese es el grupo que antes nadie miraba.
create or replace function fn_composicion_suma_100()
returns trigger
language plpgsql
as $$
declare
  v_suma numeric;
  r composiciones;
  v_grupos composiciones[];
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_grupos := array_append(v_grupos, old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_grupos := array_append(v_grupos, new);
  end if;
  foreach r in array v_grupos loop
    select coalesce(sum(porcentaje), 0) into v_suma
    from composiciones c
    where c.producto_id = r.producto_id
      and c.producto_color_id is not distinct from r.producto_color_id
      and c.pieza = r.pieza and c.parte = r.parte;
    if v_suma not in (0, 100) then
      raise exception 'La composición de la pieza %, parte %, suma % %% y debe sumar 100 %% (usa "otras fibras" para lo menor a 5 %%).', r.pieza, r.parte, v_suma;
    end if;
  end loop;
  return null;
end;
$$;

create constraint trigger composiciones_suma_100
  after insert or update or delete on composiciones
  deferrable initially deferred
  for each row execute function fn_composicion_suma_100();

-- Reglas que miran otras tablas:
--   (a) Imposible: reescribir la composición de una prenda que ya se movió
--       (D3: otra tela es otra opción u otro modelo). Si alguna variante que
--       cubre esa composición tiene movimientos, no se edita ni se borra:
--       se crea otra opción. Agregar un grupo que no existía (el forro que
--       faltaba) sí se permite: completa, no cambia.
--   (b) Imposible: composición de modelo Y de color para la misma pieza y
--       parte (no se sabría cuál va en la etiqueta). Manda la que existe; para
--       pasar a la otra, se borra antes (si (a) lo permite).
create or replace function fn_composicion_reglas()
returns trigger
language plpgsql
as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  -- Serializa las escrituras de composición de un mismo modelo.
  perform 1 from productos where id = r.producto_id for no key update;

  if tg_op in ('UPDATE', 'DELETE') and exists (
       select 1 from movimientos m join variantes v on v.id = m.variante_id
       where v.producto_id = old.producto_id
         and (old.producto_color_id is null or v.producto_color_id = old.producto_color_id)) then
    raise exception 'Esta composición ya está en prendas que se movieron: no se edita. Crea otra opción con la tela nueva.';
  end if;

  if tg_op in ('INSERT', 'UPDATE') and exists (
       select 1 from composiciones c
       where c.producto_id = new.producto_id and c.pieza = new.pieza and c.parte = new.parte
         and c.id <> new.id
         and ((new.producto_color_id is null) <> (c.producto_color_id is null))) then
    raise exception 'La pieza %, parte %, ya tiene composición a otro nivel (modelo o color): solo puede haber una.', new.pieza, new.parte;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger composiciones_reglas
  before insert or update or delete on composiciones
  for each row execute function fn_composicion_reglas();

-- Imposible: un modelo VIGENTE de una categoría que lleva etiqueta textil sin
-- composición de la parte principal, ni a nivel modelo ni en cada una de sus
-- opciones. Se revisa al cerrar la transacción (el alta carga todo junto) y
-- desde tres lados: el producto pasa a vigente, se le agrega una opción, o se
-- le borra composición.
create or replace function fn_producto_tiene_etiqueta_textil(p_producto_id uuid)
returns boolean
language sql
stable
as $$
  select not c.requiere_etiqueta_textil
      or p.estado <> 'vigente'
      or exists (select 1 from composiciones x
                 where x.producto_id = p.id and x.producto_color_id is null and x.parte = 'principal')
      or (exists (select 1 from producto_colores pc where pc.producto_id = p.id)
          and not exists (select 1 from producto_colores pc
                          where pc.producto_id = p.id
                            and not exists (select 1 from composiciones x
                                            where x.producto_color_id = pc.id and x.parte = 'principal')))
  from productos p join categorias c on c.id = p.categoria_id
  where p.id = p_producto_id
$$;

create or replace function fn_etiqueta_textil_exigida()
returns trigger
language plpgsql
as $$
declare
  v_producto_id uuid;
begin
  if tg_table_name = 'productos' then
    v_producto_id := new.id;
  elsif tg_table_name = 'producto_colores' then
    v_producto_id := new.producto_id;
  else
    v_producto_id := old.producto_id;
  end if;
  if not coalesce(fn_producto_tiene_etiqueta_textil(v_producto_id), true) then
    raise exception 'Este modelo está vigente y su categoría lleva etiqueta textil: falta la composición de la parte principal.';
  end if;
  return null;
end;
$$;

create constraint trigger productos_etiqueta_textil
  after insert or update of estado, categoria_id on productos
  deferrable initially deferred
  for each row execute function fn_etiqueta_textil_exigida();

create constraint trigger producto_colores_etiqueta_textil
  after insert on producto_colores
  deferrable initially deferred
  for each row execute function fn_etiqueta_textil_exigida();

create constraint trigger composiciones_etiqueta_textil
  after delete or update on composiciones
  deferrable initially deferred
  for each row execute function fn_etiqueta_textil_exigida();

-- ---------- Colecciones (vitrina y campaña; NUNCA reportes de margen ni reposición) ----------
create table colecciones (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null,
  inicio  date,
  fin     date,
  constraint colecciones_fechas_coherentes check (fin is null or inicio is null or fin >= inicio)
);
create unique index colecciones_clave_unica on colecciones (fn_clave_texto(nombre));

create table coleccion_productos (
  coleccion_id  uuid not null references colecciones (id),
  producto_id   uuid not null references productos (id),
  primary key (coleccion_id, producto_id)
);

-- ---------- Código SUNAT por categoría y público, append-only ----------
create table sunat_mapeo_categoria (
  id             uuid primary key default gen_random_uuid(),
  categoria_id   uuid not null references categorias (id),
  publico        text not null,
  version        text not null,
  codigo         text,      -- vacío = decidido a propósito "sin código" (hueco del catálogo: polo de mujer, unisex)
  vigente_desde  date not null,
  decidido_por   uuid,      -- personas (Dynamic)
  nota           text,
  created_at     timestamptz not null default now(),
  constraint sunat_mapeo_publico_valido
    check (publico in ('mujer', 'hombre', 'nina', 'nino', 'bebe', 'unisex')),
  -- Imposible: mapear a un código inexistente en el catálogo de esa versión.
  constraint sunat_mapeo_codigo_existe
    foreign key (version, codigo) references sunat_catalogo_productos (version, codigo),
  constraint sunat_mapeo_version_existe
    foreign key (version) references sunat_catalogo_versiones (version),
  -- Imposible: dos decisiones para la misma categoría-público el mismo día.
  constraint sunat_mapeo_un_cambio_por_dia unique (categoria_id, publico, vigente_desde),
  -- Imposible: "sin código" sin explicar por qué.
  constraint sunat_mapeo_vacio_explicado check (codigo is not null or nota is not null)
);

create trigger sunat_mapeo_append_only
  before update or delete on sunat_mapeo_categoria
  for each row execute function fn_rechazar_update_delete();

-- ============================================================================
-- 5 · PRECIO CON VIGENCIA (no se sobrescribe)
-- ============================================================================
-- Por qué: hoy variantes.precio se pisa y ADR-0059 guarda el antes/después
-- como texto. Así no se sabe si 59.90 fue una rebaja o un precio nuevo, que es
-- la señal "esta talla solo se vende rebajada".

-- Alcance (decisión D13-bis del ADR): el precio REGULAR es nacional (la misma
-- etiqueta en TRU, AQP y el online); la REBAJA y la LIQUIDACIÓN pueden ser
-- nacionales (ubicacion_id vacío) o de una sede ("sobran XL en TRU: se
-- liquidan en TRU").
create table precios (
  id           uuid primary key default gen_random_uuid(),
  variante_id  uuid not null references variantes (id),
  ubicacion_id uuid,     -- FK a ubicaciones más abajo; vacío = todas las sedes
  tipo         text not null,
  monto        numeric(12,2) not null,
  vigencia     tstzrange not null,
  motivo       text,
  creado_por   uuid,     -- personas (Dynamic)
  created_at   timestamptz not null default now(),
  -- Imposible: un precio en cero o negativo en la etiqueta.
  constraint precios_monto_positivo check (monto > 0),
  constraint precios_tipo_valido check (tipo in ('regular', 'rebaja', 'liquidacion')),
  -- Imposible: una vigencia vacía o sin fecha de inicio.
  constraint precios_vigencia_valida
    check (not isempty(vigencia) and lower(vigencia) is not null and lower_inc(vigencia)),
  -- Imposible: rebaja sin motivo (la inteligencia necesita separar demanda de rebaja).
  constraint precios_rebaja_con_motivo check (tipo = 'regular' or motivo is not null),
  -- Imposible: un precio regular distinto por sede (la etiqueta impresa es una).
  constraint precios_regular_es_nacional check (tipo <> 'regular' or ubicacion_id is null),
  -- Permite que la línea de venta ate precio_id a su variante con FK compuesta.
  constraint precios_id_variante_unico unique (id, variante_id),
  -- Imposible: dos precios regulares vigentes a la vez para la misma prenda.
  constraint precios_regular_sin_superposicion
    exclude using gist (variante_id with =, vigencia with &&) where (tipo = 'regular'),
  -- Imposible: dos rebajas (o rebaja y liquidación) encimadas con el MISMO
  -- alcance. El cruce "nacional contra una sede" lo cierra el disparador
  -- precios_reglas_al_abrir, porque una exclusión no sabe que vacío = todas.
  constraint precios_descuento_sin_superposicion
    exclude using gist (variante_id with =,
                        (coalesce(ubicacion_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
                        vigencia with &&) where (tipo <> 'regular')
);

-- Al abrir una rebaja o liquidación:
--   * Imposible: una rebaja nacional encimada con una rebaja de una sede (la
--     vendedora de TRU no sabría cuál cobrar).
--   * Imposible: una "rebaja" igual o mayor que el regular vigente al empezar,
--     o sin ningún regular vigente ese día.
-- Se bloquea la variante (`for no key update`, que no frena ventas ni
-- movimientos de esa prenda) para que dos altas simultáneas no se crucen.
create or replace function fn_precio_reglas_al_abrir()
returns trigger
language plpgsql
as $$
begin
  if new.tipo = 'regular' then
    return new;
  end if;
  perform 1 from variantes where id = new.variante_id for no key update;
  if exists (select 1 from precios p
             where p.variante_id = new.variante_id and p.tipo <> 'regular' and p.id <> new.id
               and p.vigencia && new.vigencia
               and (p.ubicacion_id is null) <> (new.ubicacion_id is null)) then
    raise exception 'Ya hay una rebaja o liquidación con otro alcance (nacional o de sede) en esas fechas.';
  end if;
  if not exists (select 1 from precios r
                 where r.variante_id = new.variante_id and r.tipo = 'regular'
                   and r.vigencia @> lower(new.vigencia) and r.monto > new.monto) then
    raise exception 'Una % tiene que ser menor que el precio regular vigente el día que empieza.', new.tipo;
  end if;
  return new;
end;
$$;

create trigger precios_reglas_al_abrir
  before insert on precios
  for each row execute function fn_precio_reglas_al_abrir();

-- Un precio no se edita ni se borra: solo se CIERRA (se fija el fin de una
-- vigencia abierta). Cambiar un precio = cerrar el vigente + abrir uno nuevo,
-- en la misma transacción. Y no se cierra hacia atrás: cerrar al 05-sep un
-- regular que cobró una venta el 10-sep dejaría esa línea apuntando a un
-- precio que "no estaba vigente" el día en que se cobró.
create or replace function fn_precio_solo_se_cierra()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un precio usado no se borra: se cierra su vigencia.';
  end if;
  if (new.variante_id, new.ubicacion_id, new.tipo, new.monto, lower(new.vigencia), new.motivo)
     is distinct from (old.variante_id, old.ubicacion_id, old.tipo, old.monto, lower(old.vigencia), old.motivo)
     or not upper_inf(old.vigencia)
     or upper_inf(new.vigencia) then
    raise exception 'De un precio solo se puede cerrar la vigencia abierta; para otro monto, abre un precio nuevo.';
  end if;
  if upper(new.vigencia) < now() then
    raise exception 'Un precio no se cierra con fecha pasada (%): ciérralo desde hoy.', upper(new.vigencia);
  end if;
  if exists (select 1 from venta_items vi join ventas v on v.id = vi.venta_id
             where vi.precio_id = old.id and v.ocurrido_en >= upper(new.vigencia)) then
    raise exception 'Ese precio cobró ventas después de %: no se puede cerrar antes de la última.', upper(new.vigencia);
  end if;
  return new;
end;
$$;

create trigger precios_solo_se_cierra
  before update or delete on precios
  for each row execute function fn_precio_solo_se_cierra();

-- ============================================================================
-- 6 · UBICACIONES, STOCK Y MOVIMIENTOS
-- ============================================================================

-- STUB: `public.sedes` de Dynamic. Dynamic manda sobre la sede (decisión
-- vigente, 14-DYNAMIC.md): su código NO se copia ni se acuña en retail. En
-- producción los códigos son TRU, AQP, `003` (tienda de Lima), `LIM` (el
-- TALLER, tipo 'fabrica') y `CCO` (corporativo, D-20/D-32) — ver
-- docs/datos/00-MAPA.md §1. Por eso ningún código de sede se escribe a mano y
-- el Taller se busca por tipo, nunca por código.
create table sedes_dynamic (
  id      uuid primary key default gen_random_uuid(),
  codigo  text not null unique,
  nombre  text not null,
  tipo    text not null     -- en Dynamic: 'tienda', 'fabrica', ... (no lo decide retail)
);

-- Ubicación de retail = lugar que guarda stock. Hoy en producción son 3 filas:
-- Tienda TRU, Tienda AQP y el Taller (datos-reales-produccion.sql:45-54 y
-- 20260915130000; que el Taller sea la fila nacida "Almacén Principal" es
-- inferencia: lo confirma la consulta M4). La tienda de Lima (003) no tiene
-- ubicación. CCO NO es ubicación: no tiene stock, solo absorbe gasto (D-32).
create table ubicaciones (
  id               uuid primary key default gen_random_uuid(),
  sede_dynamic_id  uuid references sedes_dynamic (id),   -- en la base real: public.sedes(id)
  nombre           text not null,
  tipo             text not null,
  activo           boolean not null default true,
  constraint ubicaciones_tipo_valido check (tipo in ('tienda', 'taller', 'almacen_central')),
  -- Imposible: una tienda o el Taller sin su sede de Dynamic (el código, la
  -- dirección y la planilla de esa sede se leen de allá). Solo un almacén
  -- central que Dynamic no conoce puede no tenerla.
  constraint ubicaciones_sede_obligatoria
    check (tipo = 'almacen_central' or sede_dynamic_id is not null),
  -- Permite exigir con FK que un destino de producción sea una tienda.
  constraint ubicaciones_id_tipo_unico unique (id, tipo)
);
-- Imposible: dos ubicaciones de retail para la misma sede de Dynamic (el
-- stock de AQP partido en dos "sedes" que ningún reporte suma).
create unique index ubicaciones_una_por_sede on ubicaciones (sede_dynamic_id) where sede_dynamic_id is not null;

-- El código se LEE, no se guarda: si Dynamic lo corrige, retail lo ve igual.
create view v_ubicaciones as
select u.id, u.nombre, u.tipo, u.activo, s.codigo as sede_codigo, s.tipo as sede_tipo
from ubicaciones u
left join sedes_dynamic s on s.id = u.sede_dynamic_id;

alter table precios
  add constraint precios_ubicacion_existe foreign key (ubicacion_id) references ubicaciones (id);

create table sububicaciones (
  id            uuid primary key default gen_random_uuid(),
  ubicacion_id  uuid not null references ubicaciones (id),
  tipo          text not null,
  nombre        text not null,
  es_vendible   boolean generated always as (tipo in ('piso_venta', 'almacen_tienda', 'general')) stored,
  constraint sububicaciones_tipo_valido
    check (tipo in ('piso_venta', 'almacen_tienda', 'general', 'no_vendible')),
  -- Imposible: dos pisos o dos almacenes en la misma sede (D-38).
  constraint sububicaciones_tipo_unico_por_sede unique (ubicacion_id, tipo),
  constraint sububicaciones_id_ubicacion_unico unique (id, ubicacion_id)
);

-- Stock: SOLO en hojas. No existe "stock de la sede" guardado: es la suma.
create table stock (
  variante_id      uuid not null references variantes (id),
  ubicacion_id     uuid not null,
  sububicacion_id  uuid not null,
  cantidad         integer not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (variante_id, sububicacion_id),
  -- Imposible: stock en el piso de Trujillo contado como si fuera de Arequipa.
  constraint stock_sububicacion_de_la_sede
    foreign key (sububicacion_id, ubicacion_id) references sububicaciones (id, ubicacion_id),
  -- Imposible: vender dos veces la última blusa (ADR-0023, se conserva).
  constraint stock_cantidad_no_negativa check (cantidad >= 0)
);
create index stock_ubicacion_idx on stock (ubicacion_id);

-- STUB: ventas existe en retail con más columnas; aquí solo lo mínimo para las FK.
-- `ocurrido_en` es cuándo se cobró (en la tablet, aunque no hubiera red);
-- `created_at`, cuándo llegó a la base. El precio aplicable se mira en
-- `ocurrido_en` (ver D13 y la cola sin red de ADR-0063).
create table ventas (
  id            uuid primary key default gen_random_uuid(),
  ubicacion_id  uuid not null references ubicaciones (id),
  ocurrido_en   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint ventas_ocurrido_no_futuro check (ocurrido_en <= created_at + interval '1 minute')
);

-- ---------- Línea de venta: lo que se cobró y lo que se declaró, congelado ----------
create table venta_items (
  id                       uuid primary key default gen_random_uuid(),
  venta_id                 uuid not null references ventas (id),
  tipo_linea               text not null,
  -- Referencia viva (llave durable): lectura "como es".
  variante_id              uuid references variantes (id),
  cantidad                 integer not null,
  -- Copia congelada: lectura "como era". En una prenda la ESCRIBE LA BASE
  -- (disparador venta_items_copia_desde_catalogo) desde el catálogo y el
  -- precio vivos; si el llamador manda un valor distinto, se rechaza. Además
  -- nadie inserta aquí directo: la sección 10 retira INSERT a los roles de la
  -- API (en V2 existe la policy venta_items_insert, que se elimina).
  descripcion_impresa      text not null,
  codigo_variante          text,
  codigo_leido             text,     -- qué se escaneó; vacío = se digitó a mano
  producto_color_id        uuid references producto_colores (id),
  escala_talla_id          uuid,
  talla_id                 uuid,
  categoria_id             uuid references categorias (id),     -- la hoja, el día de la venta
  categoria_padre_id       uuid references categorias (id),     -- su padre ese día (vacío si la hoja no tenía)
  familia                  text,                                -- la familia ese día
  temporada_id             uuid references temporadas (id),
  publico                  text,
  precio_id                uuid,
  tipo_precio              text,
  precio_regular_unitario  numeric(12,2) not null,
  precio_unitario          numeric(12,2) not null,   -- el de la etiqueta vigente (con IGV)
  descuento_unitario       numeric(12,2) not null default 0,
  motivo_descuento         text,
  costo_unitario           numeric(12,4) not null,   -- en prenda: variantes.costo al vender (ADR-0067)
  unidad_sunat             text not null,
  tipo_afectacion_igv      text not null,
  igv_tasa                 numeric(5,4) not null,
  base_imponible           numeric(12,2) not null,
  igv_monto                numeric(12,2) not null,
  sunat_version            text,
  sunat_codigo             text,     -- tag cac:CommodityClassification/cbc:ItemClassificationCode
  -- GTIN declarado: otro tag (cac:StandardItemIdentification/cbc:ID) con su
  -- @schemeID. Puede ir JUNTO al código SUNAT en la misma línea, por eso no
  -- comparte columna con él.
  gtin_esquema             text,
  gtin_codigo              text,
  created_at               timestamptz not null default now(),
  constraint venta_items_tipo_linea_valido check (tipo_linea in ('prenda', 'servicio', 'cargo')),
  constraint venta_items_cantidad_positiva check (cantidad > 0),
  -- Imposible: una línea que dice talla M de una variante S, o la opción de
  -- otra prenda. La copia está atada a la variante con FK compuesta.
  constraint venta_items_copia_es_de_la_variante
    foreign key (variante_id, producto_color_id, talla_id) references variantes (id, producto_color_id, talla_id),
  constraint venta_items_talla_de_su_escala
    foreign key (talla_id, escala_talla_id) references tallas (id, escala_id),
  -- Imposible: cobrar con el precio de OTRA prenda (9,90 en vez de 89,90).
  constraint venta_items_precio_de_la_variante
    foreign key (precio_id, variante_id) references precios (id, variante_id),
  -- Permiten que la devolución se ate a la línea, a su venta y a su escala.
  constraint venta_items_id_venta_unico unique (id, venta_id),
  constraint venta_items_id_escala_unico unique (id, escala_talla_id),
  constraint venta_items_familia_valida
    check (familia is null or familia in ('indumentaria', 'calzado', 'accesorios', 'bisuteria', 'belleza', 'papeleria')),
  -- Imposible: un GTIN declarado a SUNAT cuyo largo no es el de su esquema
  -- (OBS-4334) o con dígito verificador malo.
  constraint venta_items_gtin_coherente
    check ((gtin_esquema is null) = (gtin_codigo is null)
           and (gtin_esquema is null
                or case when gtin_esquema in ('GTIN-8', 'GTIN-12', 'GTIN-13', 'GTIN-14')
                        then length(gtin_codigo) = substr(gtin_esquema, 6)::int and fn_gtin_valido(gtin_codigo)
                        else false end)),
  -- Imposible: una prenda vendida sin saber qué prenda, qué talla, qué color,
  -- qué categoría ni a qué precio de lista (el reporte de temporada la perdería).
  constraint venta_items_prenda_completa
    check (tipo_linea <> 'prenda' or (variante_id is not null and codigo_variante is not null
           and producto_color_id is not null and escala_talla_id is not null and talla_id is not null
           and categoria_id is not null and familia is not null
           and precio_id is not null and tipo_precio is not null and publico is not null)),
  -- Imposible: una "prenda falsa" en variantes para cobrar un arreglo o un
  -- monto manual (elimina la variante centinela 'Cargo especial').
  constraint venta_items_no_prenda_sin_variante
    check (tipo_linea = 'prenda' or (variante_id is null and precio_id is null
           and producto_color_id is null and talla_id is null and escala_talla_id is null)),
  -- Imposible: un cargo manual sin motivo escrito.
  constraint venta_items_cargo_con_motivo check (tipo_linea <> 'cargo' or motivo_descuento is not null),
  constraint venta_items_tipo_precio_valido
    check (tipo_precio is null or tipo_precio in ('regular', 'rebaja', 'liquidacion')),
  -- Imposible: una venta "a precio regular" cobrada a otro monto de etiqueta.
  constraint venta_items_regular_coherente
    check (tipo_precio is distinct from 'regular' or precio_unitario = precio_regular_unitario),
  constraint venta_items_montos_no_negativos
    check (precio_unitario >= 0 and precio_regular_unitario >= 0 and descuento_unitario >= 0 and costo_unitario >= 0),
  -- Imposible: un descuento de caja mayor que el precio.
  constraint venta_items_descuento_no_supera_precio check (descuento_unitario <= precio_unitario),
  -- Imposible: un descuento de caja sin motivo (ADR-0054, se conserva en la base).
  constraint venta_items_descuento_con_motivo check (descuento_unitario = 0 or motivo_descuento is not null),
  -- Imposible: NIU para un servicio o ZZ para una prenda (catálogo 03).
  constraint venta_items_unidad_coherente
    check ((tipo_linea = 'servicio') = (unidad_sunat = 'ZZ') and unidad_sunat in ('NIU', 'ZZ')),
  -- Imposible: una afectación de IGV fuera del catálogo 07 que CAYLA usa
  -- (10 gravado onerosa; 11-16 retiros/bonificaciones gratuitas).
  constraint venta_items_afectacion_valida
    check (tipo_afectacion_igv in ('10', '11', '12', '13', '14', '15', '16')),
  constraint venta_items_igv_tasa_rango check (igv_tasa >= 0 and igv_tasa < 1),
  -- Imposible: base + IGV que no cuadran con lo cobrado en una operación
  -- onerosa (tolerancia de redondeo de 1 céntimo por unidad).
  constraint venta_items_base_mas_igv_cuadra
    check (tipo_afectacion_igv <> '10'
           or abs((base_imponible + igv_monto) - (precio_unitario - descuento_unitario) * cantidad) <= 0.01 * cantidad),
  -- Imposible: declarar a SUNAT un código que no existe (ERR-3496 desde 2027).
  constraint venta_items_sunat_existe
    foreign key (sunat_version, sunat_codigo) references sunat_catalogo_productos (version, codigo),
  constraint venta_items_sunat_par_completo check ((sunat_version is null) = (sunat_codigo is null)),
  constraint venta_items_publico_valido
    check (publico is null or publico in ('mujer', 'hombre', 'nina', 'nino', 'bebe', 'unisex'))
);
create index venta_items_venta_idx on venta_items (venta_id);
create index venta_items_variante_idx on venta_items (variante_id);

-- La copia congelada de una prenda sale del catálogo y del precio VIVOS en el
-- momento del cobro (`ventas.ocurrido_en`), no del llamador:
--   * código, opción, escala y talla: de la variante;
--   * categoría (hoja), su padre y su familia, temporada y público: del modelo;
--   * precio: el aplicable ese momento en esa sede, en este orden: rebaja o
--     liquidación de la sede > rebaja o liquidación nacional > regular. Tipo y
--     monto salen de esa fila; el regular de referencia, del regular vigente;
--   * costo: variantes.costo (promedio ponderado, ADR-0067);
--   * descripción impresa: modelo + opción + talla.
-- Si el llamador manda un valor, tiene que coincidir: un valor distinto es un
-- error del llamador y se rechaza, no se corrige en silencio.
create or replace function fn_venta_item_copia_desde_catalogo()
returns trigger
language plpgsql
as $$
declare
  v_venta ventas%rowtype;
  v record;
  v_precio precios%rowtype;
  v_regular precios%rowtype;
begin
  if new.tipo_linea <> 'prenda' then
    return new;
  end if;
  select * into v_venta from ventas where id = new.venta_id;
  select va.codigo, va.producto_color_id, va.escala_talla_id, va.talla_id, va.costo,
         p.categoria_id, c.categoria_padre_id, c.familia, p.temporada_lanzamiento_id, p.publico,
         p.referencia || ' ' || pc.nombre_comercial || ' ' || t.etiqueta as descripcion
    into v
  from variantes va
  join productos p on p.id = va.producto_id
  join categorias c on c.id = p.categoria_id
  join producto_colores pc on pc.id = va.producto_color_id
  join tallas t on t.id = va.talla_id
  where va.id = new.variante_id;
  if not found then
    raise exception 'La prenda % no existe.', new.variante_id;
  end if;

  select * into v_precio from precios p
  where p.variante_id = new.variante_id and p.vigencia @> v_venta.ocurrido_en
    and (p.ubicacion_id is null or p.ubicacion_id = v_venta.ubicacion_id)
  order by (p.ubicacion_id is not null) desc, (p.tipo <> 'regular') desc
  limit 1;
  select * into v_regular from precios p
  where p.variante_id = new.variante_id and p.tipo = 'regular' and p.vigencia @> v_venta.ocurrido_en;
  if v_precio.id is null or v_regular.id is null then
    raise exception 'La prenda % no tenía precio regular vigente al momento del cobro.', v.codigo;
  end if;

  if (new.codigo_variante is not null and new.codigo_variante <> v.codigo)
     or (new.producto_color_id is not null and new.producto_color_id <> v.producto_color_id)
     or (new.escala_talla_id is not null and new.escala_talla_id <> v.escala_talla_id)
     or (new.talla_id is not null and new.talla_id <> v.talla_id)
     or (new.categoria_id is not null and new.categoria_id <> v.categoria_id)
     or (new.categoria_padre_id is not null and new.categoria_padre_id is distinct from v.categoria_padre_id)
     or (new.familia is not null and new.familia <> v.familia)
     or (new.temporada_id is not null and new.temporada_id is distinct from v.temporada_lanzamiento_id)
     or (new.publico is not null and new.publico <> v.publico)
     or (new.precio_id is not null and new.precio_id <> v_precio.id)
     or (new.tipo_precio is not null and new.tipo_precio <> v_precio.tipo)
     or (new.precio_unitario is not null and new.precio_unitario <> v_precio.monto)
     or (new.precio_regular_unitario is not null and new.precio_regular_unitario <> v_regular.monto)
     or (new.costo_unitario is not null and new.costo_unitario <> v.costo) then
    raise exception 'La línea de % no coincide con el catálogo o el precio vigentes: la copia congelada la escribe la base.', v.codigo;
  end if;

  new.codigo_variante := v.codigo;
  new.producto_color_id := v.producto_color_id;
  new.escala_talla_id := v.escala_talla_id;
  new.talla_id := v.talla_id;
  new.categoria_id := v.categoria_id;
  new.categoria_padre_id := v.categoria_padre_id;
  new.familia := v.familia;
  new.temporada_id := v.temporada_lanzamiento_id;
  new.publico := v.publico;
  new.precio_id := v_precio.id;
  new.tipo_precio := v_precio.tipo;
  new.precio_unitario := v_precio.monto;
  new.precio_regular_unitario := v_regular.monto;
  new.costo_unitario := v.costo;
  new.descripcion_impresa := coalesce(new.descripcion_impresa, v.descripcion);
  return new;
end;
$$;

create trigger venta_items_copia_desde_catalogo
  before insert on venta_items
  for each row execute function fn_venta_item_copia_desde_catalogo();

-- Imposible: reescribir lo que se cobró o lo que se le declaró a SUNAT.
create trigger venta_items_inmutable
  before update or delete on venta_items
  for each row execute function fn_rechazar_update_delete();

-- STUB: devoluciones existe en retail; se muestra la línea con motivo cerrado.
create table devoluciones (
  id            uuid primary key default gen_random_uuid(),
  venta_id      uuid not null references ventas (id),
  ubicacion_id  uuid not null references ubicaciones (id),
  estado        text not null default 'solicitada',
  created_at    timestamptz not null default now(),
  constraint devoluciones_estado_valido check (estado in ('solicitada', 'aprobada', 'rechazada')),
  constraint devoluciones_id_venta_unico unique (id, venta_id)
);

-- Imposible: "reabrir" una devolución rechazada. Su cantidad dejó de contar
-- contra lo vendido; si volviera a contar, podría pasar el tope sin que nadie
-- lo revise. Se crea otra devolución.
create or replace function fn_devolucion_rechazada_es_final()
returns trigger
language plpgsql
as $$
begin
  if old.estado = 'rechazada' and new.estado <> 'rechazada' then
    raise exception 'Una devolución rechazada no se reabre: crea otra.';
  end if;
  return new;
end;
$$;

create trigger devoluciones_rechazada_es_final
  before update of estado on devoluciones
  for each row execute function fn_devolucion_rechazada_es_final();

create table devolucion_items (
  id              uuid primary key default gen_random_uuid(),
  devolucion_id   uuid not null,
  venta_id        uuid not null,
  venta_item_id   uuid not null,
  cantidad        integer not null,
  condicion       text not null,
  motivo_codigo   text not null references motivos_devolucion (codigo),
  escala_talla_id   uuid,          -- la escala de la prenda devuelta (copiada de su línea)
  talla_sugerida_id uuid,          -- "le quedaba grande: se llevó la S"
  constraint devolucion_items_cantidad_positiva check (cantidad > 0),
  -- Imposible: devolver dos veces la misma línea dentro de una devolución.
  constraint devolucion_items_linea_unica unique (devolucion_id, venta_item_id),
  constraint devolucion_items_condicion_valida
    check (condicion in ('vendible', 'danada_reparacion', 'danada_donar', 'devolver_proveedor')),
  -- Imposible: devolver en la boleta de una venta la línea de OTRA venta. La
  -- línea y la cabecera tienen que ser de la misma venta.
  constraint devolucion_items_cabecera_de_la_venta
    foreign key (devolucion_id, venta_id) references devoluciones (id, venta_id),
  constraint devolucion_items_linea_de_la_venta
    foreign key (venta_item_id, venta_id) references venta_items (id, venta_id),
  -- Imposible: sugerir una talla de calzado para un vestido. La escala es la
  -- de la línea devuelta, y la talla sugerida es de esa escala.
  constraint devolucion_items_escala_de_la_linea
    foreign key (venta_item_id, escala_talla_id) references venta_items (id, escala_talla_id),
  constraint devolucion_items_talla_sugerida_de_la_escala
    foreign key (talla_sugerida_id, escala_talla_id) references tallas (id, escala_id),
  constraint devolucion_items_sugerida_con_escala
    check (talla_sugerida_id is null or escala_talla_id is not null)
);

-- Imposible: devolver más de lo vendido. De una línea de 1 unidad no salen 6
-- devueltas en varias devoluciones (nota de crédito y efectivo del cajón por
-- prendas que nunca salieron). V2 lo revisaba solo dentro de crear_devolucion
-- (0003_funciones.sql:451-457); aquí lo sostiene la base para cualquier camino.
-- Es REGLA DE CAYLA: no se hereda de Stripe ni de SUNAT.
-- CONCURRENCIA: se bloquea la línea vendida (`for update`) antes de sumar; dos
-- devoluciones simultáneas de la misma línea se ordenan y la segunda suma lo
-- que ya escribió la primera. (El bloqueo exige permiso UPDATE sobre
-- venta_items: lo tiene la función security definer, no la tienda.)
create or replace function fn_devolucion_no_supera_lo_vendido()
returns trigger
language plpgsql
as $$
declare
  v_vendido integer;
  v_devuelto integer;
begin
  select cantidad into v_vendido from venta_items where id = new.venta_item_id for update;
  select coalesce(sum(di.cantidad), 0) into v_devuelto
  from devolucion_items di join devoluciones d on d.id = di.devolucion_id
  where di.venta_item_id = new.venta_item_id and d.estado <> 'rechazada';
  if v_devuelto > v_vendido then
    raise exception 'Se vendieron % y con esta devolución serían % devueltas.', v_vendido, v_devuelto;
  end if;
  return null;
end;
$$;

create constraint trigger devolucion_items_no_supera_lo_vendido
  after insert on devolucion_items
  for each row execute function fn_devolucion_no_supera_lo_vendido();

create trigger devolucion_items_inmutable
  before update or delete on devolucion_items
  for each row execute function fn_rechazar_update_delete();

-- ---------- Movimientos: el libro (append-only) ----------
create table movimientos (
  id                        uuid primary key default gen_random_uuid(),
  variante_id               uuid not null references variantes (id),
  ubicacion_id              uuid not null references ubicaciones (id),
  sububicacion_id           uuid not null,
  sububicacion_destino_id   uuid,
  tipo                      text not null,
  cantidad                  integer not null,
  motivo_codigo             text not null references motivos_movimiento (codigo),
  -- SIN costo_unitario: el costo de la capa vive en UN solo libro,
  -- costo_historial (ADR-0067), con una fila por movimiento que la crea.
  -- Fecha del hecho. OJO D-23 (el mes se cierra con llave): el cierre mira
  -- esta fecha, y el candado de período NO existe todavía (ver ADR, D15).
  ocurrido_en               timestamptz not null,
  created_at                timestamptz not null default now(),
  corrige_movimiento_id     uuid references movimientos (id),
  -- Orígenes: a lo más uno. FK reales hacia tablas fuera de este borrador.
  venta_item_id             uuid references venta_items (id),
  devolucion_item_id        uuid references devolucion_items (id),
  compra_item_id            uuid,  -- compra_items
  conteo_item_id            uuid,  -- conteo_items
  transferencia_item_id     uuid,  -- transferencia_items (ADR-0068: piernas de salida y entrada)
  produccion_id             uuid,  -- producciones del taller
  cambio_id                 uuid,  -- cambios
  lote_id                   uuid,  -- lotes (convive con compra_item_id)
  usuario_id                uuid,  -- personas (Dynamic)
  nota                      text,
  -- Imposible: un movimiento en el piso de otra sede.
  constraint movimientos_sububicacion_de_la_sede
    foreign key (sububicacion_id, ubicacion_id) references sububicaciones (id, ubicacion_id),
  -- Imposible: un traslado INSTANTÁNEO entre sedes. El traslado directo solo
  -- existe dentro de la misma sede (piso <-> almacén <-> no vendible); entre
  -- sedes van dos piernas enlazadas a transferencias (ADR-0068).
  constraint movimientos_traslado_interno_misma_sede
    foreign key (sububicacion_destino_id, ubicacion_id) references sububicaciones (id, ubicacion_id),
  constraint movimientos_tipo_valido check (tipo in ('entrada', 'salida', 'ajuste', 'traslado')),
  constraint movimientos_destino_solo_en_traslado
    check ((tipo = 'traslado') = (sububicacion_destino_id is not null)
           and (sububicacion_destino_id is null or sububicacion_destino_id <> sububicacion_id)),
  -- Imposible: una entrada de -5, una salida de 0 (ADR-0023, se conserva).
  constraint movimientos_cantidad_coherente
    check ((tipo <> 'ajuste' and cantidad > 0) or (tipo = 'ajuste' and cantidad <> 0)),
  -- Imposible: un movimiento que dice venir de una venta Y de un conteo.
  constraint movimientos_un_solo_origen
    check (num_nonnulls(venta_item_id, devolucion_item_id, compra_item_id, conteo_item_id,
                        transferencia_item_id, produccion_id, cambio_id, corrige_movimiento_id) <= 1),
  -- Imposible: compensar dos veces el mismo error.
  constraint movimientos_una_correccion_por_movimiento unique (corrige_movimiento_id),
  -- Imposible: un hecho registrado "antes de que ocurriera" más de un minuto en
  -- el futuro (reloj de la tablet desfasado). Hacia ATRÁS no hay tope: ese es
  -- el candado de D-23, que no existe todavía.
  constraint movimientos_ocurrido_no_futuro check (ocurrido_en <= created_at + interval '1 minute')
);
create index movimientos_variante_ubicacion_ocurrido_idx on movimientos (variante_id, ubicacion_id, ocurrido_en);

-- Reglas que miran el vocabulario de motivos. El disparador NO conoce ningún
-- nombre de motivo: todo sale de las columnas de motivos_movimiento.
create or replace function fn_movimiento_motivo_coherente()
returns trigger
language plpgsql
as $$
declare
  v_motivo motivos_movimiento%rowtype;
  v_origen_real text;
begin
  select * into v_motivo from motivos_movimiento where codigo = new.motivo_codigo;
  -- Imposible: 'venta' usado en una entrada, o 'merma' en un traslado.
  if not (new.tipo = any (v_motivo.tipos_permitidos)) then
    raise exception 'El motivo % no admite movimientos de tipo %.', new.motivo_codigo, new.tipo;
  end if;
  -- Qué documento trae el movimiento (a lo más uno, por movimientos_un_solo_origen).
  v_origen_real := case
    when new.venta_item_id is not null then 'venta_item'
    when new.devolucion_item_id is not null then 'devolucion_item'
    when new.compra_item_id is not null then 'compra_item'
    when new.conteo_item_id is not null then 'conteo_item'
    when new.transferencia_item_id is not null then 'transferencia_item'
    when new.produccion_id is not null then 'produccion'
    when new.cambio_id is not null then 'cambio'
    when new.corrige_movimiento_id is not null then 'correccion'
    else 'ninguno' end;
  -- Imposible: una salida "por venta" sin su línea de venta (plata que la caja
  -- nunca vio); una compra sin su ítem de compra; un conteo sin su línea de
  -- conteo; y al revés, una línea de venta pegada a un motivo 'merma'.
  if v_origen_real <> v_motivo.origen_requerido then
    raise exception 'El motivo % exige documento de tipo % y el movimiento trae %.',
      new.motivo_codigo, v_motivo.origen_requerido, v_origen_real;
  end if;
  return new;
end;
$$;

create trigger movimientos_motivo_coherente
  before insert on movimientos
  for each row execute function fn_movimiento_motivo_coherente();

create trigger movimientos_inmutables
  before update or delete on movimientos
  for each row execute function fn_rechazar_update_delete();

-- ---------- Libro de costo: UNO solo (ADR-0067, aplicado en producción) ----------
-- STUB con las columnas de 20260916090000_costo_promedio_ponderado.sql. Lo
-- escribe solo fn_recalcular_costo_variante, llamada por recibir_lote,
-- recibir_compras y cerrar_produccion antes de fn_aplicar_movimiento.
create table costo_historial (
  id                    uuid primary key default gen_random_uuid(),
  variante_id           uuid not null references variantes (id),
  stock_previo          integer not null check (stock_previo >= 0),
  costo_anterior        numeric(12,2) not null check (costo_anterior >= 0),
  cantidad_nueva        integer not null check (cantidad_nueva > 0),
  costo_unitario_nuevo  numeric(12,2) not null check (costo_unitario_nuevo >= 0),
  costo_resultante      numeric(12,2) not null check (costo_resultante >= 0),
  origen                text not null check (origen in ('compra', 'produccion')),
  movimiento_id         uuid not null unique references movimientos (id),
  usuario_id            uuid,
  created_at            timestamptz not null default now()
);

create trigger costo_historial_inmutable
  before update or delete on costo_historial
  for each row execute function fn_rechazar_update_delete();

-- Imposible: una entrada de compra o de producción sin su capa de costo (el
-- margen de esas prendas quedaría inventado). Se revisa al cerrar la
-- transacción, porque la RPC inserta el movimiento y DESPUÉS su fila de costo.
create or replace function fn_movimiento_con_capa_de_costo()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from motivos_movimiento mm where mm.codigo = new.motivo_codigo and mm.lleva_costo)
     and not exists (select 1 from costo_historial ch where ch.movimiento_id = new.id) then
    raise exception 'La entrada por % no dejó su capa de costo en costo_historial.', new.motivo_codigo;
  end if;
  return null;
end;
$$;

create constraint trigger movimientos_con_capa_de_costo
  after insert on movimientos
  deferrable initially deferred
  for each row execute function fn_movimiento_con_capa_de_costo();

-- ---------- Reservas: prenda apartada para una clienta ----------
-- No mueve stock físico (sigue en la percha o en el almacén); resta de lo que
-- la vendedora puede prometer.
create table reservas (
  id            uuid primary key default gen_random_uuid(),
  variante_id   uuid not null references variantes (id),
  ubicacion_id  uuid not null references ubicaciones (id),
  cantidad      integer not null,
  cliente_id    uuid,          -- clientes
  vence_en      timestamptz not null,
  estado        text not null default 'activa',
  creado_por    uuid,
  created_at    timestamptz not null default now(),
  constraint reservas_cantidad_positiva check (cantidad > 0),
  constraint reservas_estado_valido check (estado in ('activa', 'cumplida', 'vencida', 'cancelada')),
  -- Imposible: una reserva que vence antes de crearse.
  constraint reservas_vencimiento_futuro check (vence_en > created_at)
);

-- Imposible: prometer más de lo que hay. Al crear (o reactivar, o agrandar)
-- una reserva, lo reservado activo y sin vencer de esa prenda en esa sede no
-- supera lo vendible de la sede. Se bloquean antes las filas de stock
-- vendible de esa prenda en esa sede, así dos reservas simultáneas se ordenan.
-- LO QUE NO GARANTIZA: una VENTA posterior puede llevarse una prenda reservada
-- (la caja no se frena, D-40) y dejar la reserva sin respaldo. Está declarado
-- en el ADR, §4, "lo que el borrador NO hace imposible".
create or replace function fn_reserva_no_supera_lo_vendible()
returns trigger
language plpgsql
as $$
declare
  v_vendible integer;
  v_reservado integer;
begin
  if new.estado <> 'activa' then
    return null;
  end if;
  perform 1 from stock st join sububicaciones s on s.id = st.sububicacion_id and s.es_vendible
  where st.variante_id = new.variante_id and st.ubicacion_id = new.ubicacion_id
  for update of st;
  select coalesce(sum(st.cantidad), 0) into v_vendible
  from stock st join sububicaciones s on s.id = st.sububicacion_id and s.es_vendible
  where st.variante_id = new.variante_id and st.ubicacion_id = new.ubicacion_id;
  select coalesce(sum(r.cantidad), 0) into v_reservado
  from reservas r
  where r.variante_id = new.variante_id and r.ubicacion_id = new.ubicacion_id
    and r.estado = 'activa' and r.vence_en > now();
  if v_reservado > v_vendible then
    raise exception 'En esta sede hay % vendibles y quedarían % reservadas.', v_vendible, v_reservado;
  end if;
  return null;
end;
$$;

create constraint trigger reservas_no_supera_lo_vendible
  after insert or update of estado, cantidad on reservas
  for each row execute function fn_reserva_no_supera_lo_vendible();

-- ---------- Surtido: qué modelo-color se ESPERA en qué sede ----------
-- Sin esto, "XL en cero en Arequipa" no distingue agotada de nunca traída, y la
-- alerta de talla rota grita en falso hasta que la encargada deja de leerla.
create table surtido (
  producto_color_id     uuid not null references producto_colores (id),
  ubicacion_id          uuid not null references ubicaciones (id),
  intencional           boolean not null default true,
  lanzamiento_en        date,
  estado                text not null default 'vigente',
  minimo_presentacion   integer not null default 3,   -- "con menos de 3 en percha ya no luce"
  actualizado_en        timestamptz not null default now(),
  primary key (producto_color_id, ubicacion_id),
  -- 'liquidacion' ya no es un estado del surtido: se deriva del precio.
  constraint surtido_estado_valido check (estado in ('vigente', 'retirado')),
  constraint surtido_minimo_no_negativo check (minimo_presentacion >= 0),
  -- Imposible: un surtido intencional sin fecha de lanzamiento (no hay edad
  -- desde la que medir cuánto se vendió).
  constraint surtido_intencional_con_lanzamiento check (not intencional or lanzamiento_en is not null)
);

-- Historia del surtido: la alerta de hoy y la de hace tres meses se leen con
-- los parámetros que regían ese día. La escribe la base en cada cambio.
create table surtido_eventos (
  id                    uuid primary key default gen_random_uuid(),
  producto_color_id     uuid not null,
  ubicacion_id          uuid not null,
  intencional           boolean not null,
  lanzamiento_en        date,
  estado                text not null,
  minimo_presentacion   integer not null,
  ocurrido_en           timestamptz not null default now(),
  foreign key (producto_color_id, ubicacion_id) references surtido (producto_color_id, ubicacion_id)
);

-- Imposible: mover hacia adelante la fecha de lanzamiento de una sede para
-- que una talla lenta "parezca nueva". Una vez fijada, no cambia.
create or replace function fn_surtido_reglas()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.lanzamiento_en is not null
     and new.lanzamiento_en is distinct from old.lanzamiento_en then
    raise exception 'La fecha de lanzamiento en esta sede ya está fijada (%): no cambia.', old.lanzamiento_en;
  end if;
  if tg_op = 'INSERT'
     or (new.intencional, new.lanzamiento_en, new.estado, new.minimo_presentacion)
        is distinct from (old.intencional, old.lanzamiento_en, old.estado, old.minimo_presentacion) then
    insert into surtido_eventos (producto_color_id, ubicacion_id, intencional, lanzamiento_en, estado, minimo_presentacion)
    values (new.producto_color_id, new.ubicacion_id, new.intencional, new.lanzamiento_en, new.estado, new.minimo_presentacion);
  end if;
  return null;
end;
$$;

-- AFTER para que la fila de surtido ya exista cuando el evento la referencia;
-- la regla de fecha se evalúa igual y aborta la sentencia si falla.
create trigger surtido_reglas
  after insert or update on surtido
  for each row execute function fn_surtido_reglas();

create trigger surtido_eventos_inmutable
  before update or delete on surtido_eventos
  for each row execute function fn_rechazar_update_delete();

-- ---------- Demanda no atendida: la clienta que pidió una talla que no había ----------
create table demanda_no_atendida (
  id                 uuid primary key default gen_random_uuid(),
  ubicacion_id       uuid not null references ubicaciones (id),
  producto_id        uuid not null,
  producto_color_id  uuid not null,
  escala_talla_id    uuid not null,
  talla_id           uuid not null,
  registrado_por     uuid,
  created_at         timestamptz not null default now(),
  -- Imposible: pedir "talla 37" de un vestido, o el color de otro modelo.
  -- Mismo patrón de FK compuestas que variantes.
  constraint demanda_color_del_mismo_modelo
    foreign key (producto_color_id, producto_id) references producto_colores (id, producto_id),
  constraint demanda_escala_del_modelo
    foreign key (producto_id, escala_talla_id) references productos (id, escala_talla_id),
  constraint demanda_talla_de_la_escala
    foreign key (talla_id, escala_talla_id) references tallas (id, escala_id)
);

-- ---------- Producción del Taller (STUB de 20260915130000) con destino ----------
-- Solo lo que la posición proyectada (D19) necesita. En V2 `producciones`
-- guarda solo el Taller (ubicacion_id); sin destino, "producción en curso con
-- destino a AQP" no se puede sumar.
create table producciones (
  id            uuid primary key default gen_random_uuid(),
  ubicacion_id  uuid not null references ubicaciones (id),   -- el Taller
  producto_id   uuid not null references productos (id),
  estado        text not null default 'en_proceso' check (estado in ('en_proceso', 'terminada', 'anulada')),
  created_at    timestamptz not null default now(),
  inventariado_at timestamptz
);

create table produccion_lineas (
  id                    uuid primary key default gen_random_uuid(),
  produccion_id         uuid not null references producciones (id),
  variante_id           uuid not null references variantes (id),
  cantidad_plan         integer not null check (cantidad_plan > 0),
  -- NUEVO: para qué tienda se corta. Vacío = sin destino decidido: no suma a
  -- la posición proyectada de ninguna sede.
  ubicacion_destino_id  uuid,
  destino_tipo          text generated always as ('tienda') stored,
  -- Imposible: "producir para el Taller" o para un almacén central: el
  -- destino de una línea es una tienda.
  constraint produccion_lineas_destino_es_tienda
    foreign key (ubicacion_destino_id, destino_tipo) references ubicaciones (id, tipo),
  -- Una misma talla puede ir a dos tiendas en la misma orden (2 M a TRU y 3 M a AQP).
  constraint produccion_lineas_variante_destino_unica
    unique nulls not distinct (produccion_id, variante_id, ubicacion_destino_id)
);

create trigger demanda_no_atendida_append_only
  before update or delete on demanda_no_atendida
  for each row execute function fn_rechazar_update_delete();

-- ============================================================================
-- 7 · INTELIGENCIA: TODO DERIVADO DEL LIBRO (nada se tipea a mano)
-- ============================================================================

-- Saldo por prenda y sede después de cada hecho, en orden de ocurrencia, en
-- DOS series:
--   'piso'     -> lo que está A LA VISTA (sububicación piso_venta). Es el
--                 denominador de la velocidad: los tramos con saldo 0 son los
--                 días que la talla no estuvo a la vista y se excluyen
--                 (demanda censurada, Caro y Gallien). El almacén NO cuenta
--                 como "a la vista".
--   'vendible' -> lo que se puede vender en la sede (piso + almacén + general).
-- Cada movimiento se parte en PIERNAS firmadas por sububicación: el origen
-- resta y, en un traslado, el destino suma. Así un traslado a 'no_vendible'
-- baja las dos series, uno desde 'no_vendible' al piso las sube, y uno piso ->
-- almacén baja 'piso' y deja igual 'vendible' (sus dos piernas se netean).
create view v_saldo_en_el_tiempo as
with piernas as (
  select m.id, m.variante_id, m.ubicacion_id, m.ocurrido_en, m.created_at,
         m.sububicacion_id as sububicacion_id,
         case m.tipo when 'entrada' then m.cantidad
                     when 'salida' then -m.cantidad
                     when 'ajuste' then m.cantidad
                     when 'traslado' then -m.cantidad end as delta
  from movimientos m
  union all
  select m.id, m.variante_id, m.ubicacion_id, m.ocurrido_en, m.created_at,
         m.sububicacion_destino_id, m.cantidad
  from movimientos m
  where m.tipo = 'traslado'
),
por_serie as (
  select p.id, p.variante_id, p.ubicacion_id, p.ocurrido_en, p.created_at, 'piso'::text as serie, p.delta
  from piernas p join sububicaciones s on s.id = p.sububicacion_id and s.tipo = 'piso_venta'
  union all
  select p.id, p.variante_id, p.ubicacion_id, p.ocurrido_en, p.created_at, 'vendible', p.delta
  from piernas p join sububicaciones s on s.id = p.sububicacion_id and s.es_vendible
),
netos as (
  select id, variante_id, ubicacion_id, ocurrido_en, created_at, serie, sum(delta) as delta
  from por_serie
  group by id, variante_id, ubicacion_id, ocurrido_en, created_at, serie
)
select
  variante_id,
  ubicacion_id,
  serie,
  ocurrido_en as desde,
  lead(ocurrido_en) over w as hasta,
  sum(delta) over (w rows between unbounded preceding and current row) as saldo
from netos
window w as (partition by variante_id, ubicacion_id, serie order by ocurrido_en, created_at, id);

-- Liquidación y rebaja: UNA sola fuente, el precio. "¿Está en liquidación el
-- vino en AQP hoy?" = hay un precio 'liquidacion' vigente, nacional o de AQP.
-- La inteligencia que pide "solo ventas a precio regular" lee
-- venta_items.tipo_precio = 'regular', congelado al cobrar.
create view v_precio_descuento_vigente as
select p.variante_id, v.producto_color_id, p.ubicacion_id, p.tipo, p.monto, p.vigencia
from precios p
join variantes v on v.id = p.variante_id
where p.tipo <> 'regular' and p.vigencia @> now();

-- Talla rota: en un modelo-color surtido en una sede, una talla CLAVE está en 0
-- en el piso mientras otra talla de la misma opción está en su mínimo o más.
create view v_tallas_rotas as
with piso as (
  select st.variante_id, st.ubicacion_id, st.cantidad
  from stock st join sububicaciones s on s.id = st.sububicacion_id and s.tipo = 'piso_venta'
),
almacen as (
  select st.variante_id, st.ubicacion_id, st.cantidad
  from stock st join sububicaciones s on s.id = st.sububicacion_id and s.tipo = 'almacen_tienda'
)
select
  su.ubicacion_id,
  su.producto_color_id,
  v.id as variante_id,
  t.codigo as talla,
  coalesce(a.cantidad, 0) as en_almacen_misma_sede,
  case when coalesce(a.cantidad, 0) > 0 then 'bajar_de_almacen' else 'trasladar_o_producir' end as primera_accion
from surtido su
join variantes v on v.producto_color_id = su.producto_color_id and v.activo
join tallas t on t.id = v.talla_id and t.es_clave
left join piso p on p.variante_id = v.id and p.ubicacion_id = su.ubicacion_id
left join almacen a on a.variante_id = v.id and a.ubicacion_id = su.ubicacion_id
where su.estado = 'vigente'
  and coalesce(p.cantidad, 0) = 0
  and exists (
    select 1 from variantes v2
    join piso p2 on p2.variante_id = v2.id and p2.ubicacion_id = su.ubicacion_id
    where v2.producto_color_id = su.producto_color_id and v2.id <> v.id
      and p2.cantidad >= greatest(su.minimo_presentacion, 1));

-- Recomendaciones POR SEDE: foto calculada con sus insumos para auditar "por
-- qué dijo reponer". La encargada acepta o descarta; nadie tipea mínimos.
-- 'comprar' NO es una acción por sede: la compra al proveedor es de empresa y
-- la responde el punto de reorden global por producto
-- (20260916100000_punto_reorden.sql, decisión de Felipe). 'producir' sí
-- aparece: es la señal de UNA sede que la orden del Taller agrega, con destino
-- por línea (produccion_lineas.ubicacion_destino_id).
create table recomendaciones_reposicion (
  id                     uuid primary key default gen_random_uuid(),
  calculado_en           timestamptz not null default now(),
  variante_id            uuid not null references variantes (id),
  ubicacion_id           uuid not null references ubicaciones (id),
  accion                 text not null,
  origen_ubicacion_id    uuid references ubicaciones (id),
  cantidad_sugerida      integer not null,
  posicion_proyectada    integer not null,  -- vendible + en tránsito entrante + producción en curso con destino a la sede - reservado
  velocidad_dia_con_stock numeric(10,4) not null,
  dias_con_stock         integer not null,  -- días con saldo > 0 en la serie 'piso'
  lead_time_dias         integer not null,
  -- De dónde salió el lead time. Hoy no hay medición del Taller: un número
  -- 'supuesto' no puede presentarse como medido.
  lead_time_origen       text not null,
  -- Solo para 'producir': ¿se verificó que hay tela en el Taller? Vacío = no
  -- hay consumo estándar del modelo para verificarlo (ver D30 del ADR).
  tela_verificada    boolean,
  insumos                jsonb not null,    -- blob de auditoría: no se agrupa por él
  estado                 text not null default 'propuesta',
  decidido_por           uuid,
  decidido_en            timestamptz,
  constraint recomendaciones_accion_valida
    check (accion in ('bajar_de_almacen', 'trasladar', 'producir', 'liquidar')),
  constraint recomendaciones_lead_time_origen_valido
    check (lead_time_origen in ('medido_producciones', 'medido_traslados', 'supuesto')),
  constraint recomendaciones_tela_solo_en_producir
    check (accion = 'producir' or tela_verificada is null),
  -- Imposible: una recomendación que no guardó con qué parámetros se calculó
  -- (tallas clave, lanzamiento y estado del surtido ese día).
  constraint recomendaciones_insumos_minimos
    check (insumos ? 'tallas_clave' and insumos ? 'lanzamiento_en' and insumos ? 'estado_surtido'),
  -- Imposible: "trasladar" sin decir desde dónde, o desde la misma sede.
  constraint recomendaciones_traslado_con_origen
    check ((accion = 'trasladar') = (origen_ubicacion_id is not null)
           and origen_ubicacion_id is distinct from ubicacion_id),
  constraint recomendaciones_cantidad_positiva check (cantidad_sugerida > 0),
  constraint recomendaciones_estado_valido check (estado in ('propuesta', 'aceptada', 'descartada')),
  constraint recomendaciones_decision_coherente
    check ((estado = 'propuesta') = (decidido_en is null))
);

-- ============================================================================
-- 8 · PERIFÉRICO: TAXONOMÍA ESTÁNDAR VERSIONADA + PROPUESTAS DE IA
-- ============================================================================
-- Nada del núcleo depende de esto. Si mañana se borra, se sigue vendiendo.
-- Se construye cuando haya un canal que lo consuma (Google, marketplace).

create table taxonomia_versiones (
  version       text primary key,     -- '2026-08'
  publicada_en  date,
  cargada_en    timestamptz not null default now(),
  es_activa     boolean not null default false
);
create unique index taxonomia_una_sola_activa on taxonomia_versiones (es_activa) where es_activa;

create table taxonomia_categorias (
  version   text not null references taxonomia_versiones (version),
  id        text not null,
  nombre    text not null,
  ruta      text not null,
  padre_id  text,
  es_hoja   boolean not null,
  primary key (version, id),
  -- Imposible: un nodo cuyo padre no existe en SU versión.
  foreign key (version, padre_id) references taxonomia_categorias (version, id),
  constraint taxonomia_categorias_version_id_hoja_unico unique (version, id, es_hoja)
);

create table taxonomia_atributos (
  version  text not null references taxonomia_versiones (version),
  id       text not null,
  handle   text not null,
  nombre   text not null,
  primary key (version, id),
  constraint taxonomia_atributos_handle_unico unique (version, handle)
);

create table taxonomia_valores (
  version          text not null references taxonomia_versiones (version),
  id               text not null,
  atributo_handle  text not null,
  handle           text not null,
  nombre           text not null,
  primary key (version, id),
  foreign key (version, atributo_handle) references taxonomia_atributos (version, handle),
  constraint taxonomia_valores_version_id_atributo_unico unique (version, id, atributo_handle)
);

-- Reglas publicadas (to_shopify.yml): un id retirado y su reemplazo.
create table taxonomia_reemplazos (
  version_origen   text not null,
  id_origen        text not null,
  version_destino  text not null,
  id_destino       text not null,
  primary key (version_origen, id_origen, id_destino),
  foreign key (version_origen, id_origen) references taxonomia_categorias (version, id),
  foreign key (version_destino, id_destino) references taxonomia_categorias (version, id)
);

create table anclajes_categoria (
  categoria_id            uuid not null references categorias (id),
  version                 text not null,
  taxonomia_categoria_id  text not null,
  es_hoja                 boolean not null default true,
  confirmado_por          uuid not null,
  confirmado_en           timestamptz not null default now(),
  primary key (categoria_id, version),
  constraint anclajes_categoria_hoja check (es_hoja),
  -- Imposible: anclar a un nodo intermedio (de la hoja salen los atributos) o
  -- a un id de otra versión.
  constraint anclajes_categoria_existe_y_es_hoja
    foreign key (version, taxonomia_categoria_id, es_hoja)
    references taxonomia_categorias (version, id, es_hoja)
);

create table anclajes_color (
  color_codigo     text not null references colores (codigo),
  version          text not null,
  valor_id         text not null,
  atributo_handle  text not null default 'color',
  confirmado_por   uuid not null,
  confirmado_en    timestamptz not null default now(),
  primary key (color_codigo, version, valor_id),
  constraint anclajes_color_solo_color check (atributo_handle = 'color'),
  -- Imposible: "Arena" anclada a "Algodón" (un valor de Tejido).
  constraint anclajes_color_valor_es_color
    foreign key (version, valor_id, atributo_handle)
    references taxonomia_valores (version, id, atributo_handle)
);

create table anclajes_estampado (
  estampado_codigo text not null references estampados (codigo),
  version          text not null,
  valor_id         text not null,
  atributo_handle  text not null default 'pattern',
  confirmado_por   uuid not null,
  confirmado_en    timestamptz not null default now(),
  primary key (estampado_codigo, version),
  constraint anclajes_estampado_solo_patron check (atributo_handle = 'pattern'),
  constraint anclajes_estampado_valor_es_patron
    foreign key (version, valor_id, atributo_handle)
    references taxonomia_valores (version, id, atributo_handle)
);

-- Propuestas de IA: append-only salvo UNA decisión. Mide la tasa de aceptación
-- por campo, que es lo que dice si la IA ahorra trabajo o lo agrega.
create table propuestas_clasificacion (
  id               uuid primary key default gen_random_uuid(),
  entidad          text not null,
  entidad_id       uuid not null,
  campo            text not null,
  valor_propuesto  text not null,     -- id de vocabulario cerrado, o 'no_visible' / 'no_aplica'
  evidencia        text,
  modelo           text not null,     -- id exacto del modelo, nunca un alias
  version_prompt   text not null,
  acuerdo_k        smallint not null,
  acuerdo_n        smallint not null,
  puerta           text not null,
  estado           text not null default 'propuesta',
  valor_final      text,
  decidido_por     uuid,
  decidido_en      timestamptz,
  created_at       timestamptz not null default now(),
  constraint propuestas_entidad_valida check (entidad in ('producto', 'producto_color', 'categoria', 'color')),
  constraint propuestas_acuerdo_coherente check (acuerdo_n >= 1 and acuerdo_k between 0 and acuerdo_n),
  -- 'auditoria' = una propuesta que habría entrado sola y el sorteo mandó a
  -- revisión humana.
  constraint propuestas_puerta_valida check (puerta in ('humana', 'auto_unanime', 'auditoria')),
  -- Imposible: saltarse la puerta humana cambiándole el nombre al campo
  -- ('color' en vez de 'color_principal'). La lista de campos es CERRADA.
  constraint propuestas_campo_valido
    check (campo in ('categoria_id', 'color_principal', 'color_secundario_1', 'color_secundario_2',
                     'estampado_codigo', 'producto_color_codigo', 'nombre_comercial', 'escala_talla_id',
                     'talla_id', 'publico', 'temporada_lanzamiento_id', 'composicion',
                     'tejido', 'silueta', 'largo', 'manga')),
  -- Imposible: aceptar sola una propuesta de algo que acuña un código impreso,
  -- sale en la etiqueta o decide un dato legal. LISTA BLANCA: solo lo
  -- descriptivo que no se imprime puede entrar sin persona.
  constraint propuestas_auto_solo_descriptivo
    check (puerta <> 'auto_unanime' or campo in ('tejido', 'silueta', 'largo', 'manga')),
  -- Imposible: auto-aceptar sin unanimidad.
  constraint propuestas_auto_solo_unanime check (puerta <> 'auto_unanime' or acuerdo_k = acuerdo_n),
  constraint propuestas_estado_valido check (estado in ('propuesta', 'aceptada', 'corregida', 'rechazada')),
  constraint propuestas_decision_coherente
    check ((estado = 'propuesta') = (decidido_en is null)
           and (estado <> 'corregida' or valor_final is not null)),
  constraint propuestas_humana_con_persona
    check (estado = 'propuesta' or puerta = 'auto_unanime' or decidido_por is not null)
);

create or replace function fn_propuesta_se_decide_una_vez()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' or old.estado <> 'propuesta'
     or (new.entidad, new.entidad_id, new.campo, new.valor_propuesto, new.modelo, new.version_prompt, new.acuerdo_k, new.acuerdo_n, new.created_at)
        is distinct from (old.entidad, old.entidad_id, old.campo, old.valor_propuesto, old.modelo, old.version_prompt, old.acuerdo_k, old.acuerdo_n, old.created_at) then
    raise exception 'Una propuesta se decide una sola vez y no se reescribe.';
  end if;
  return new;
end;
$$;

create trigger propuestas_se_decide_una_vez
  before update or delete on propuestas_clasificacion
  for each row execute function fn_propuesta_se_decide_una_vez();

-- El SORTEO de auditoría (un porcentaje de lo que entraría solo va igual a una
-- persona) NO es un candado de la base: lo aplica el cliente de IA. Lo que la
-- base sí da es poder MEDIRLO: tasa real de auditoría y de corrección por
-- modelo, versión de prompt y campo. Si la tasa auditada cae a 0, se ve aquí.
create view v_tasa_auditoria_ia as
select modelo, version_prompt, campo,
       count(*) filter (where puerta in ('auto_unanime', 'auditoria')) as elegibles_para_auto,
       count(*) filter (where puerta = 'auditoria') as auditadas,
       round(count(*) filter (where puerta = 'auditoria')::numeric
             / nullif(count(*) filter (where puerta in ('auto_unanime', 'auditoria')), 0), 3) as tasa_auditada,
       count(*) filter (where puerta = 'auditoria' and estado in ('corregida', 'rechazada')) as auditadas_con_error
from propuestas_clasificacion
group by modelo, version_prompt, campo;

-- ============================================================================
-- 9 · PERIFÉRICO: INSUMOS DEL TALLER (forma mínima; diseño completo en el ADR
--     del Taller, D-46 prioridad 2 y D-47)
-- ============================================================================
-- Por qué NO van en productos/variantes/stock: una tela no tiene talla ni
-- opción de color vendible, se mide en metros (stock.cantidad es integer),
-- no se vende en el POS y no debe aparecer en conteos de tienda ni en
-- rankings. Meterla ahí repite el error de la variante centinela "Cargo
-- especial". Aquí solo lo que el núcleo necesita para responder "¿hay tela
-- para producir esa talla rota?".

-- Unidades de medida con el código del catálogo 03 de SUNAT, que remite a
-- UN/ECE Recommendation 20 rev. 13 (hoja Catálogos del xlsx del 26-08-2026).
-- Candidatas: NIU, MTR (metro), KGM (kilogramo); se validan contra esa lista
-- antes de sembrar.
create table unidades_medida (
  codigo  text primary key,
  nombre  text not null,
  constraint unidades_medida_codigo_formato check (codigo ~ '^[A-Z0-9]{2,3}$')
);

create table insumos (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique,
  nombre           text not null,
  tipo             text not null,
  unidad_codigo    text not null references unidades_medida (codigo),
  material_codigo  text references materiales_textiles (codigo),   -- si es tela de una sola fibra
  activo           boolean not null default true,
  constraint insumos_tipo_valido check (tipo in ('tela', 'avio', 'empaque'))
);

create table insumo_stock (
  insumo_id     uuid not null references insumos (id),
  ubicacion_id  uuid not null references ubicaciones (id),   -- el Taller
  cantidad      numeric(12,3) not null default 0,
  primary key (insumo_id, ubicacion_id),
  -- Imposible: cortar tela que no hay.
  constraint insumo_stock_no_negativo check (cantidad >= 0)
);

-- El libro de insumos: misma regla que movimientos, solo filas nuevas.
create table insumo_movimientos (
  id              uuid primary key default gen_random_uuid(),
  insumo_id       uuid not null references insumos (id),
  ubicacion_id    uuid not null references ubicaciones (id),
  tipo            text not null,
  cantidad        numeric(12,3) not null,
  costo_unitario  numeric(12,4),
  produccion_id   uuid references producciones (id),
  ocurrido_en     timestamptz not null,
  created_at      timestamptz not null default now(),
  constraint insumo_movimientos_tipo_valido check (tipo in ('entrada', 'consumo', 'ajuste')),
  constraint insumo_movimientos_cantidad_coherente
    check ((tipo <> 'ajuste' and cantidad > 0) or (tipo = 'ajuste' and cantidad <> 0)),
  -- Imposible: tela cortada que no dice para qué orden (el costo absorbido
  -- de D-31 se queda sin prenda a la que pegarse).
  constraint insumo_movimientos_consumo_con_orden check (tipo <> 'consumo' or produccion_id is not null),
  -- Imposible: una entrada de tela sin costo.
  constraint insumo_movimientos_entrada_con_costo check (tipo <> 'entrada' or costo_unitario is not null)
);

create trigger insumo_movimientos_inmutables
  before update or delete on insumo_movimientos
  for each row execute function fn_rechazar_update_delete();

-- ============================================================================
-- 10 · CANDADOS QUE NO SE SALTAN (patrón de ADR-0070)
-- ============================================================================
-- ADR-0070 midió en producción que el libro seguía abierto por tres lados:
-- TRUNCATE (la seguridad por fila y el disparador por fila no lo ven), modo
-- réplica (un disparador normal no se activa) y permisos de escritura directa.
-- Lo cerró para `movimientos` y `stock`. Este borrador lleva el mismo patrón a
-- TODAS sus tablas que guardan historia o identidad.

-- 10.1 · Ninguna tabla con historia se vacía, ni directo ni en cascada.
create trigger productos_sin_truncate before truncate on productos
  for each statement execute function fn_rechazar_truncate();
create trigger producto_colores_sin_truncate before truncate on producto_colores
  for each statement execute function fn_rechazar_truncate();
create trigger variantes_sin_truncate before truncate on variantes
  for each statement execute function fn_rechazar_truncate();
create trigger codigos_barras_sin_truncate before truncate on codigos_barras
  for each statement execute function fn_rechazar_truncate();
create trigger sunat_mapeo_sin_truncate before truncate on sunat_mapeo_categoria
  for each statement execute function fn_rechazar_truncate();
create trigger precios_sin_truncate before truncate on precios
  for each statement execute function fn_rechazar_truncate();
create trigger venta_items_sin_truncate before truncate on venta_items
  for each statement execute function fn_rechazar_truncate();
create trigger devolucion_items_sin_truncate before truncate on devolucion_items
  for each statement execute function fn_rechazar_truncate();
create trigger movimientos_sin_truncate before truncate on movimientos
  for each statement execute function fn_rechazar_truncate();
create trigger costo_historial_sin_truncate before truncate on costo_historial
  for each statement execute function fn_rechazar_truncate();
create trigger surtido_eventos_sin_truncate before truncate on surtido_eventos
  for each statement execute function fn_rechazar_truncate();
create trigger demanda_no_atendida_sin_truncate before truncate on demanda_no_atendida
  for each statement execute function fn_rechazar_truncate();
create trigger propuestas_sin_truncate before truncate on propuestas_clasificacion
  for each statement execute function fn_rechazar_truncate();
create trigger insumo_movimientos_sin_truncate before truncate on insumo_movimientos
  for each statement execute function fn_rechazar_truncate();

-- 10.2 · Todo candado se activa también en modo réplica
-- (`set session_replication_role = replica`). Un disparador normal ('O') no.
do $$
declare
  r record;
begin
  for r in
    select c.relname, t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal
      -- Aquí vale "todos" porque cada disparador de este archivo es un
      -- candado. En `retail` NO: allí hay disparadores de comodidad
      -- (fn_activos_fijos_set_updated_at) y la lista se escribe a mano.
      and c.relnamespace = 'public'::regnamespace
  loop
    execute format('alter table %I enable always trigger %I', r.relname, r.tgname);
  end loop;
end;
$$;

-- 10.3 · Nadie fuera de las funciones escribe lo que guarda historia. Solo
-- corre si existen los roles de Supabase (en un Postgres vacío no existen).
-- Toda función nueva nace ejecutable por authenticated (default ACL del
-- schema, BACKLOG): las RPC internas llevan además su `revoke execute`.
do $$
declare
  v_roles text;
begin
  select string_agg(quote_ident(rolname), ', ') into v_roles
  from pg_roles where rolname in ('authenticated', 'anon', 'service_role');
  if v_roles is null then
    raise notice 'Sin roles de Supabase: se omiten los revoke (Postgres de prueba).';
    return;
  end if;
  -- Libro, línea de cobro y costo: ni insertar directo (V2 tiene la policy
  -- venta_items_insert: se elimina), ni editar, ni borrar, ni vaciar.
  execute format('revoke insert, update, delete, truncate on movimientos, stock, venta_items, devolucion_items, costo_historial, precios, insumo_movimientos, insumo_stock from %s', v_roles);
  -- Historia que la tienda sí agrega con policy, pero nunca edita, borra ni vacía.
  execute format('revoke update, delete, truncate on sunat_mapeo_categoria, demanda_no_atendida, surtido_eventos, propuestas_clasificacion from %s', v_roles);
  -- Catálogo: se apaga, no se borra ni se vacía.
  execute format('revoke delete, truncate on productos, producto_colores, variantes, codigos_barras from %s', v_roles);
end;
$$;

-- ============================================================================
-- 11 · PLAN DE MIGRACIÓN DE DATOS (SOLO COMENTARIOS — NO EJECUTABLE)
-- ============================================================================
--
-- Conteos reales de producción (schema retail, SELECT count(*) 2026-09-16,
-- sesión anterior de esta investigación):
--   productos 7 (7 activos) · variantes 37 (36 activas; 1 sin talla, 1 sin
--   color; tallas usadas: S, M, L, vacío) · categorias 38 · colores 30 ·
--   codigos_barras 2 · movimientos 200 (7 motivos de texto distintos) ·
--   stock 112 · ventas 5 · venta_items 13 · comprobantes 7 · transferencias 1
--   (2 ítems) · devoluciones 1 · producto_fotos 0 · costo_historial 0 ·
--   historial_producto_cambios 0 · lotes 0. taxonomia_* y producto_atributos:
--   NO EXISTEN en producción V2. Índice de identidad de variantes vigente en
--   producción: el viejo unique (producto_id, talla, color_codigo);
--   20260916190000 (ADR-0069) aún no pegada.
--   Según ADR-0069, las variantes sin código eran de productos de prueba.
--
-- PENDIENTE DE MEDIR EN PRODUCCIÓN (solo lectura; en esta sesión la lectura de
-- producción no estuvo autorizada). Cada número decide un paso de abajo:
--   M1 (0.3) opciones que necesitan decisión humana:
--     select c.codigo, count(*) from retail.variantes v
--     join retail.colores c on c.codigo = v.color_codigo
--     where c.codigo in ('EST','MUL','ANI') group by 1;
--   M2 (0.4) productos que mezclan talla vacía con tallas reales (con escala
--     UNICA no pueden compartir modelo):
--     select producto_id from retail.variantes group by producto_id
--     having bool_or(coalesce(btrim(talla),'') = '') and bool_or(coalesce(btrim(talla),'') <> '');
--   M3 (1.3) stock y movimientos sin sububicación:
--     select (select count(*) from retail.stock where sububicacion_id is null),
--            (select count(*) from retail.movimientos where sububicacion_id is null);
--   M4 (1.4) cada ubicación con su sede de Dynamic:
--     select u.nombre, u.tipo, s.codigo, s.tipo from retail.ubicaciones u
--     left join public.sedes s on s.id = u.sede_dynamic_id;
--   M5 (D19/D27) cuánto tarda el Taller, si ya hay órdenes cerradas:
--     select count(*), percentile_cont(0.5) within group
--       (order by extract(epoch from inventariado_at - created_at)/86400)
--     from retail.producciones where estado = 'terminada';
--   M6 (0.5) etiquetas ya impresas: no está en la base; se pregunta a las
--     sedes cuántas prendas llevan hoy el QR del código corto.
--
-- ORDEN (cada fase es una migración con su ADR; ninguna borra datos):
--
-- FASE 0 — ANTES DEL CENSO Y DE IMPRIMIR LA PRIMERA ETIQUETA REAL
--   0.1 Sembrar escalas_talla (LETRAS XS..XXL con M como clave inicial,
--       NUMERICA, CINTURA 26..34, CALZADO_EU 34..42, UNICA 'U') y
--       tallas_sinonimos desde apps/web/lib/tallas.ts:8 (2XL = XXL, 3XL =
--       XXXL). Asignar categorias.escala_talla_id desde
--       categorias.tallas_sugeridas y decidir requiere_etiqueta_textil (38
--       filas, revisión a mano de Felipe: sin valor por defecto).
--   0.2 Sembrar estampados con EST/MUL/ANI del vocabulario actual; marcar esos
--       tres colores activo=false (no se borran: hay variantes que los usan).
--       Completar hex de los colores base que no tengan.
--   0.3 Crear producto_colores: una fila por (producto_id, color_codigo)
--       distinto en variantes. codigo = color_codigo; si el color era EST/MUL/ANI,
--       la opción queda con color_principal NULL -> REQUIERE decisión humana
--       (cuántas: M1). Variantes sin color -> opción 'UNC'.
--   0.4 variantes: agregar producto_color_id, escala_talla_id, talla_id
--       (mapear 'S','M','L' a tallas de LETRAS; vacío -> 'U' de UNICA, lo que
--       obliga a que ese producto tenga escala UNICA: si M2 devuelve filas,
--       esas variantes vacías van a un modelo aparte o se apagan). Validar NOT
--       NULL. Mantener las columnas viejas (talla, color_codigo, sku) en modo
--       lectura hasta el fin de la fase 2.
--   0.5 codigos_barras: agregar tipo (propio->'cayla_corto' SOLO si coincide
--       letra por letra con variantes.codigo; si no, 'sku_legado'),
--       fabrica->validar con fn_gtin14: 'ean13' si pasa, si no 'sku_legado' con
--       nota) y es_principal; volcar variantes.sku como fila 'sku_legado'. Hoy
--       hay 2 filas: costo trivial.
--   0.6 Disparadores de inmutabilidad (productos.codigo, producto_colores,
--       variantes, codigos_barras) y de código compuesto
--       (fn_variante_codigo_compuesto reemplaza a fn_asignar_codigo_variante y
--       al disparador fn_variantes_asignar_codigo de producción). Antes de
--       crearlos, confirmar que ninguna RPC viva hace UPDATE de esas columnas
--       (grep en supabase/migrations y apps/web).
--   0.7 categorias: índice de nombre por padre (reemplaza categorias_nombre_key
--       global) + regla de hoja. Hoy productos.categoria_id acepta vacío: los 7
--       productos se revisan y se vuelve NOT NULL.
--   0.8 temporadas: sembrar y mapear productos.temporada (texto) -> id;
--       tipo_surtido; publico (vacío -> decisión de Felipe, default 'mujer' NO
--       se asume); marca propia CAYLA; origen. productos.stock_minimo se
--       conserva tal cual.
--   0.9 precios: una fila 'regular' nacional por variante con monto =
--       variantes.precio y vigencia [created_at, infinito). Queda escrito que
--       es APROXIMACIÓN: no hay historia de precios previa confiable
--       (historial_producto_cambios tiene 0 filas en producción).
--
-- FASE 1 — LIBRO, UBICACIONES E INSUMOS
--   1.1 motivos_movimiento: sembrar desde los 7 motivos existentes
--       (activacion_piso_almacen, carga_inicial, devolucion, movimiento_interno,
--       siembra_cargo_especial, transferencia, venta) + los de ADR-0068
--       (traslado_salida, traslado_entrada) + merma, conteo, compra, produccion,
--       cada uno con su origen_requerido. Agregar movimientos.motivo_codigo con
--       backfill 1:1; los 200 movimientos se mapean por igualdad exacta
--       (verificado: 7 valores). Los históricos que no traen su documento
--       (p. ej. 'siembra_cargo_especial') se mapean a un motivo de sistema con
--       origen 'ninguno', marcado como histórico, y se apagan (activo=false).
--   1.2 movimientos.ocurrido_en = created_at para lo histórico.
--   1.3 sububicacion_id NOT NULL: crear sububicación 'general' en el taller y
--       reasignar filas de stock/movimientos con sububicación vacía (cuántas:
--       M3). Hoy 112 filas de stock y 200 movimientos: se verifica con
--       recalcular_stock antes y después (mismo total por sede).
--   1.4 ubicaciones: NO se siembra ningún código de sede. Se verifica M4: cada
--       tienda y el Taller con su sede_dynamic_id. La fila del Taller nació
--       como 'Almacén Principal' con sede_dynamic_id vacío
--       (datos-reales-produccion.sql:53): se enlaza a la sede de Dynamic de
--       tipo 'fabrica' (código LIM en producción), buscándola por tipo (que esa
--       fila sea hoy el Taller es inferencia: M4 lo confirma). Son 3 filas y 3
--       sedes: la tienda de Lima (003) no tiene ubicación en retail hoy
--       (decisión de Felipe si la tiene) y CCO no es ubicación.
--   1.5 sububicación 'no_vendible' por sede; devolucion_items.condicion distinta
--       de 'vendible' entra ahí.
--   1.6 motivos_devolucion + devolucion_items.motivo_codigo y venta_id: 1 fila
--       existente, se clasifica a mano.
--   1.7 surtido: derivar de stock actual por (opción, sede) con intencional =
--       true y lanzamiento = primer movimiento de entrada a esa sede; la
--       encargada corrige ANTES de fijar la fecha (después ya no cambia).
--   1.8 reservas y demanda_no_atendida: tablas vacías + botón en el POS.
--   1.9 insumos, insumo_stock, insumo_movimientos: vacías; el diseño completo
--       y la carga los define el ADR del Taller (D-47).
--   1.10 produccion_lineas.ubicacion_destino_id: vacío en lo existente (sin
--       destino decidido).
--
-- FASE 2 — LÍNEA DE COBRO Y SUNAT
--   2.1 Cargar sunat_catalogo_productos v14_0801 desde CCNU_MOD_2.xlsm
--       (49.022 códigos) y sunat_mapeo_categoria (38 categorías x público; los
--       huecos se registran como codigo NULL con nota). Antes: confirmar con
--       Lucode (a) qué fecha rige para ERR-3496 (la celda dice "01/08/2026
--       01/01/2027"), (b) si el listado validado incluye 25.1-25.3, y (c) si
--       el RUC 20605964550 está en el padrón ind_padron='12' (OBS-4331). Pista
--       sin consultar el padrón: si los CDR de las boletas ya aceptadas traen la
--       observación 4331, el RUC está en el padrón.
--   2.2 venta_items: agregar columnas congeladas. Backfill de las 13 líneas
--       existentes desde el catálogo actual, marcado como reconstruido (no hay
--       otra fuente; el disparador de copia se crea DESPUÉS del backfill).
--       Luego NOT NULL, FK compuestas, disparador de copia e inmutabilidad, y
--       `drop policy venta_items_insert`.
--   2.3 tipo_linea: la variante centinela 'Cargo especial (sin código)'
--       (20260912234726) se reemplaza por líneas tipo 'cargo'; la centinela se
--       apaga (activo=false) sin borrarse.
--   2.4 registrar_venta calcula base, IGV y afectación con la tasa leída de una
--       tabla; lucode.ts deja de fijar NIU/'10' y solo traduce nombres.
--   2.5 comprobante_lineas derivada de venta_items (fuera de este borrador,
--       módulo 08).
--
-- FASE 3 — INTELIGENCIA
--   3.1 Vistas v_saldo_en_el_tiempo, v_tallas_rotas y
--       v_precio_descuento_vigente; job nocturno que escribe
--       recomendaciones_reposicion (por sede: bajar, trasladar, producir,
--       liquidar). El punto de reorden global por producto de 20260916100000
--       SIGUE: responde la compra al proveedor, que es de empresa.
--
-- FASE 4 — PERIFÉRICO (solo si hay canal que lo consuma)
--   4.1 Taxonomía estándar versionada + anclajes + taxonomia_reemplazos.
--   4.2 propuestas_clasificacion y el cliente de IA (con el sorteo de
--       auditoría medido en v_tasa_auditoria_ia).
--   4.3 GTIN propio (afiliación GS1 Perú) y exportación a Google como vista.
-- ============================================================================

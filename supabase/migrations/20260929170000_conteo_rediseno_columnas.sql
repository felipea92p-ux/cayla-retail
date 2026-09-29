-- ============================================================================
-- 20260929170000_conteo_rediseno_columnas.sql — CAYLA V2 · Inventario > Conteo (rediseño, 2026-09-29)
-- PARTE 1 de 2: las columnas. Las funciones van en 20260929170100_conteo_rediseno_funciones.sql.
--
-- EL PROBLEMA PRIMERO. Hoy un conteo NO sabe qué debería haber en la tienda hasta que alguien escanea cada prenda:
-- `conteo_items` solo tiene filas de prendas YA contadas, así que «qué falta por contar» no se puede responder desde
-- la base (la pantalla lo adivina mirando el catálogo entero) y un conteo recién abierto parece vacío. El rediseño
-- pide dos cosas que la tabla de hoy no puede decir: (1) una lista de lo que CAYLA esperaba al abrir el conteo, con
-- cada variante en «pendiente» hasta que alguien la verifique; (2) distinguir «no la he contado» de «la conté y hay 0».
--
-- DECIDÍ (contrato del rediseño, D1–D3)
--   · Una sola tabla: `conteo_items` sigue siendo la única tabla por variante. Al abrir se crea una fila por cada
--     variante con stock en el lugar del conteo (la «foto»). `cantidad_contada` pasa a aceptar NULL: NULL = pendiente
--     (nadie la ha verificado), 0 = verificada en cero. Vacío ≠ 0.
--   · Los estados de una línea (pendiente, correcta, con diferencia, en reconteo, diferencia confirmada) NO se guardan:
--     se derivan de estas columnas. Lo mínimo almacenado es: la foto al abrir, cuándo se verificó, lo que se contó
--     antes de mandar a recontar, y cuándo alguien confirmó una diferencia.
--   · Todas las columnas nuevas son NULLABLE y sin valor por defecto: `scripts/purga/restaurar-purga.sql` reinserta
--     respaldos viejos con `jsonb_populate_recordset`, donde las columnas que no existían llegan como NULL. Las filas
--     históricas no se rellenan: los lectores usan `coalesce(cantidad_foto, cantidad_sistema)`.
-- DESCARTÉ
--   · Una tabla aparte para la foto (`conteo_esperado`): toca ≥ 8 archivos de purga y clasificación (eliminar_producto*,
--     restaurar-purga, aviario) sin aportar nada que una columna no dé.
--   · Un `estado` nuevo en `conteos` (revisando/parcial): Análisis (`estado = 'cerrado'`), Inicio (`estado = 'abierto'`)
--     y el índice único de «un conteo abierto por ubicación» lo ignorarían en silencio.
--   · Columnas `estado_linea` y `en_reconteo`: dos verdades que pueden discrepar (estados imposibles).
-- SE ROMPE SI: un lector nuevo de `conteo_items` cuenta filas sin mirar `cantidad_contada is not null` (la exactitud se
--   infla con las pendientes). Por eso los lectores conocidos se corrigen en la misma tanda (parte 2) y
--   `pnpm pruebas:conteo-rediseno` fija los resultados.
--
-- PRODUCCIÓN: se pega tal cual en el SQL Editor (ya trae `retail.`). Solo hace `alter table` de dos tablas pequeñas
-- (conteos, conteo_items), crea un índice sobre `conteo_items` y NO lleva políticas: no choca con el Asesor de seguridad
-- (ADR-0195). `lock_timeout` de 3 s:
-- si la tienda está usando esas tablas, falla rápido en vez de esperar. Se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. Una línea sin contar es una línea con cantidad_contada NULL. El CHECK (>= 0) se conserva: NULL lo cumple.
alter table retail.conteo_items alter column cantidad_contada drop not null;

-- 2. Lo mínimo que hay que guardar (todo nullable, ver arriba por qué).
alter table retail.conteo_items
  add column if not exists cantidad_foto integer check (cantidad_foto >= 0),
  add column if not exists verificado_en timestamptz,
  add column if not exists contada_anterior integer check (contada_anterior >= 0),
  add column if not exists confirmada_en timestamptz;

-- 3. Estado imposible que la base rechaza sola: confirmar una diferencia de una línea que nadie ha contado.
--    (Guarda idempotente: `add constraint` no tiene `if not exists`.)
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'retail.conteo_items'::regclass and conname = 'conteo_items_confirmada_coherente'
  ) then
    alter table retail.conteo_items
      add constraint conteo_items_confirmada_coherente
      check (confirmada_en is null or cantidad_contada is not null);
  end if;
end;
$$;

-- 4. El momento en que se congeló la foto del conteo (sirve para explicar «al abrir había N»).
alter table retail.conteos add column if not exists foto_en timestamptz;

-- 5. Índice por variante. Hasta hoy `conteo_items` solo tenía filas de lo YA contado y bastaba su índice por conteo;
--    con la foto, cada conteo de «todo» aporta una fila por cada variante con stock (~1.100 en una tienda completa).
--    A ~3 sedes × ~8 conteos al mes son ~26 mil filas al mes y ~1 millón en 3 años. Las consultas que entran POR
--    VARIANTE (`fn_producto_historia` —«¿esta variante estuvo en algún conteo?»—, `eliminar_producto_con_historia` y la
--    comprobación de la llave foránea `conteo_items.variante_id` cuando se borra una variante) sin este índice recorren la
--    tabla entera en cada llamada. Ninguno de los dos índices que ya tiene la tabla sirve: el de la llave primaria es por
--    `id` y el único (conteo_id, variante_id) empieza por `conteo_id`. MEDIDO (base local, 990 mil filas sintéticas =
--    900 conteos × 1.100 variantes, EXPLAIN ANALYZE con y sin índice): revisión de la llave foránea de una variante nunca
--    contada 92 ms → 0,19 ms; `fn_producto_historia` (líneas de conteo de un producto de 8 variantes) 161 ms → 3,7 ms;
--    respaldo de `eliminar_producto_con_historia` 112 ms → 16 ms (esos 16 ms son casi todos armar los 7.200 jsonb, el índice
--    tarda 0,3 ms). Ocupa ~17 MB con esas 990 mil filas. Un índice sobre un solo uuid es barato de mantener (una escritura extra por fila que
--    se inserta al abrir) y `create index if not exists` no falla si ya está. Sin `concurrently`: el SQL Editor corre
--    todo en una transacción y la tabla es pequeña hoy (crearlo tarda milisegundos, y solo bloquea las ESCRITURAS de
--    `conteo_items` durante ese instante; las lecturas siguen).
create index if not exists conteo_items_variante_idx on retail.conteo_items (variante_id);
comment on index retail.conteo_items_variante_idx is
  'Búsqueda de las líneas de conteo de una variante (historia del producto, eliminar con historia, llave foránea de variantes). '
  'Con la foto al abrir, conteo_items crece ~1.100 filas por conteo de «todo»: sin este índice esas consultas recorren toda la tabla.';

comment on column retail.conteo_items.cantidad_contada is
  'Lo que la persona encontró al verificar la variante. NULL = pendiente (nadie la ha verificado o se mandó a recontar); '
  '0 = verificada y no había ninguna. Vacío no es cero: por eso admite NULL. El CHECK (>= 0) se conserva.';
comment on column retail.conteo_items.cantidad_sistema is
  'Lo que CAYLA esperaba en la tienda en el instante de verificar (stock de la sububicación leído con `for share`). Mientras la '
  'variante está pendiente vale lo mismo que cantidad_foto. Se reescribe en cada verificación: una venta hecha antes de '
  'contar ya no cuenta como falta. La diferencia es cantidad_contada − cantidad_sistema.';
comment on column retail.conteo_items.cantidad_foto is
  'Lo que había al ABRIR el conteo (foto congelada, nunca se reescribe). Es referencia y auditoría: la pantalla la muestra '
  'como «al abrir: N» solo cuando difiere de lo que debe haber hoy. NULL en conteos anteriores al rediseño (se lee como '
  'coalesce(cantidad_foto, cantidad_sistema)). Una variante que aparece sin estar en la foto se guarda con foto 0.';
comment on column retail.conteo_items.verificado_en is
  'Cuándo se verificó la variante (`clock_timestamp()`, tomado DESPUÉS de leer el stock). NULL si está pendiente. Ordena el '
  'libro `movimientos` alrededor de la verificación: lo anterior explica el «debe haber»; lo posterior se conserva al cerrar.';
comment on column retail.conteo_items.contada_anterior is
  'Lo que se contó antes de mandar la variante a recontar. Con cantidad_contada NULL y esta columna con valor, la línea está '
  '«en reconteo». Si al volver a contar sale la misma cifra, la diferencia queda confirmada sola.';
comment on column retail.conteo_items.confirmada_en is
  'Cuándo alguien confirmó que la diferencia es real (o se reconfirmó al recontar y salir lo mismo). Sin confirmar no se '
  'cierra el conteo. Solo tiene sentido con una línea contada (CHECK conteo_items_confirmada_coherente).';
comment on column retail.conteos.foto_en is
  'Cuándo se congeló la foto del conteo (`clock_timestamp()` al terminar de copiar el stock). NULL en conteos anteriores '
  'al rediseño, que no tienen foto.';

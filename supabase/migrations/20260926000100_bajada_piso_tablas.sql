-- ============================================================================
-- 20260926000100_bajada_piso_tablas.sql — CAYLA V2 · ADR-0208 «Frescura del piso», paso 1 · PARTE 2 de 5
--
-- EL PROBLEMA PRIMERO. Los datos de Frescura solo valen si la bajada al piso se registra al colgar la prenda y no al
-- cobrarla; hoy la única bajada es un modal de una prenda por vez que exige todo Existencias. La pantalla nueva junta
-- un fardo entero en una sola confirmación (`bajar_al_piso`, PARTE 3), y eso necesita dos cosas que el libro de
-- movimientos no tiene: saber qué filas del libro nacieron de la MISMA confirmación, y reconocer un reintento (la red
-- se cortó después de guardar) para no bajar el fardo dos veces.
--
-- QUÉ HACE. Dos tablas nuevas. `movimientos` y `stock` NO cambian (núcleo, ADR-0208 C3):
--   · `bajadas_piso`: el documento de una confirmación — quién, en qué tienda, cuándo, con qué marca de intento
--     (`token_cliente`) y la huella de su lista (md5 de «prenda:cantidad» ordenado). Mismo token + misma huella = es un
--     reintento y se devuelve lo ya guardado; mismo token + otra huella = la lista cambió y NO se repite nada.
--   · `bajada_piso_items`: una línea por prenda, con la fila del libro que la movió como llave (1 a 1 con `movimientos`).
--   · Ninguna de las dos se edita, se borra ni se vacía (disparadores); un error se corrige con el movimiento contrario.
--   · RLS encendido y SIN políticas; `revoke all` a public, anon y authenticated: solo las leen y escriben funciones
--     `security definer` (patrón del repo para tablas que nadie toca directo).
--   · No guarda líneas ni unidades en el encabezado: se derivan de los ítems (una sola fuente).
--
-- ESTADOS IMPOSIBLES QUE EL ESQUEMA HACE IMPOSIBLES
--   · la misma confirmación guardada dos veces            → unique (token_cliente)
--   · una fila del libro en dos bajadas / ítem sin fila     → PK y FK de bajada_piso_items.movimiento_id
--   · la misma prenda dos veces en una bajada               → unique (bajada_id, variante_id)
--   · bajar la «Prenda sin registrar» (centinela ADR-0179)  → check bajada_piso_items_no_centinela
--   · una bajada sin autor                                  → persona_id not null
--   · un documento editado o borrado                        → disparador fn_bajada_piso_es_inmutable
--   · las tablas vaciadas de golpe (TRUNCATE)               → disparador fn_historial_sin_truncate, el de movimientos
-- Lo que el esquema NO puede impedir (un documento sin ítems, un ítem cuyo movimiento no sea almacén→piso de su tienda)
-- lo vigila `fn_verificar_bajadas()` (PARTE 3), que siempre debe devolver cero filas.
--
-- CANDADOS AL PEGAR. Las llaves foráneas hacia movimientos, variantes, ubicaciones y public.personas toman un candado
-- breve sobre tablas que la tienda usa: por eso va sola, sin políticas, con `lock_timeout = 3s` (si no consigue el
-- candado, falla sin daño y se vuelve a pegar). Pegar fuera de hora pico. Los disparadores van con `create or replace
-- trigger`: quitar uno antes de crearlo tomaría en exclusiva las 21 tablas de auth y storage aunque no exista, y con
-- las llaves foráneas ya tomadas es el bloqueo mutuo de ADR-0195 (CLAUDE.md, «Políticas y deadlocks»).
--
-- ORDEN AL PEGAR (cinco partes, cada una sola en el SQL Editor; archivos 20260926000000 a 20260926000400):
--   0000 módulo → 0100 tablas → 0200 funciones de escritura → 0300 lectura de Frescura → publicar la web → 0400
--   («Reposición» ya no toca el piso). La 0400 va DESPUÉS de la web porque su mensaje manda al botón «Bajar al piso» de
--   Existencias, que recién existe con la web publicada.
-- ESTA es la 0100. Producción: pegar tal cual (ya trae `retail.`). Re-ejecutable.
--
-- SE ROMPE SI alguien agrega aquí una política, un disparador quitado y vuelto a crear o un `alter` de movimientos, stock
-- o ubicaciones (hay que partir el archivo, ADR-0195), o si el paso 2 («Retirar del piso») necesita otra tabla de
-- documento: debería reutilizar esta.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.bajadas_piso (
  id uuid primary key default gen_random_uuid(),
  token_cliente uuid not null,
  ubicacion_id uuid not null references retail.ubicaciones (id),
  persona_id uuid not null references public.personas (id),
  huella text not null check (length(huella) = 32),
  created_at timestamptz not null default now(),
  constraint bajadas_piso_token_key unique (token_cliente)
);

comment on table retail.bajadas_piso is
  'ADR-0208: una confirmación de la bajada al piso (un fardo o una tanda). Sus líneas están en bajada_piso_items; cada línea es una fila de movimientos almacén→piso. No se edita ni se borra.';
comment on column retail.bajadas_piso.token_cliente is
  'La marca del intento que genera la pantalla. Un reintento con la misma marca y la misma lista devuelve esta bajada sin mover nada.';
comment on column retail.bajadas_piso.ubicacion_id is 'La tienda donde se bajó: del almacén de esa tienda a su piso.';
comment on column retail.bajadas_piso.persona_id is 'Quién bajó: el responsable elegido en la pantalla (el mismo que firma cada movimiento).';
comment on column retail.bajadas_piso.huella is
  'md5 de la lista normalizada («prenda:cantidad», ordenada por prenda). Con la misma marca y otra huella, la base no repite nada y avisa.';
comment on column retail.bajadas_piso.created_at is 'Cuándo se confirmó (hora de inicio de la transacción).';

create table if not exists retail.bajada_piso_items (
  movimiento_id uuid primary key references retail.movimientos (id),
  bajada_id uuid not null references retail.bajadas_piso (id),
  variante_id uuid not null references retail.variantes (id),
  cantidad integer not null check (cantidad > 0),
  constraint bajada_piso_items_no_centinela check (variante_id <> '22222222-2222-4222-8222-222222222222'),
  constraint bajada_piso_items_una_por_prenda unique (bajada_id, variante_id)
);

comment on table retail.bajada_piso_items is
  'ADR-0208: una línea por prenda de una bajada al piso. La llave es la fila del libro que la movió (1 a 1 con movimientos). No se edita ni se borra.';
comment on column retail.bajada_piso_items.movimiento_id is 'La fila de movimientos (traslado almacén→piso de la misma tienda) que registró esta línea.';
comment on column retail.bajada_piso_items.bajada_id is 'La confirmación a la que pertenece.';
comment on column retail.bajada_piso_items.variante_id is 'La prenda (modelo + talla + color). Nunca la «Prenda sin registrar».';
comment on column retail.bajada_piso_items.cantidad is 'Unidades bajadas de esa prenda: las mismas que su movimiento.';

-- Una bajada registrada es historia: igual que el libro de movimientos, se corrige con el movimiento contrario.
create or replace function retail.fn_bajada_piso_es_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  raise exception 'Una bajada registrada no se edita ni se borra. Si te equivocaste, registra el movimiento contrario.';
end;
$fn$;

comment on function retail.fn_bajada_piso_es_inmutable() is
  'ADR-0208: impide editar o borrar bajadas_piso y bajada_piso_items.';

create or replace trigger bajadas_piso_inmutables
  before update or delete on retail.bajadas_piso
  for each row execute function retail.fn_bajada_piso_es_inmutable();

create or replace trigger bajada_piso_items_inmutables
  before update or delete on retail.bajada_piso_items
  for each row execute function retail.fn_bajada_piso_es_inmutable();

-- Un TRUNCATE salta los disparadores por fila: sin esto, vaciar las tablas borraría los documentos y sus marcas, y un
-- reintento con una marca vieja volvería a bajar el fardo. Mismo candado y mismo mensaje que el libro de movimientos.
create or replace trigger bajadas_piso_sin_truncate
  before truncate on retail.bajadas_piso
  for each statement execute function retail.fn_historial_sin_truncate();

create or replace trigger bajada_piso_items_sin_truncate
  before truncate on retail.bajada_piso_items
  for each statement execute function retail.fn_historial_sin_truncate();

-- Nadie las lee ni escribe directo: solo las funciones `security definer` de la PARTE 3.
alter table retail.bajadas_piso enable row level security;
alter table retail.bajada_piso_items enable row level security;
revoke all on retail.bajadas_piso, retail.bajada_piso_items from public, anon, authenticated;
revoke all on function retail.fn_bajada_piso_es_inmutable() from public, anon, authenticated;

reset lock_timeout;

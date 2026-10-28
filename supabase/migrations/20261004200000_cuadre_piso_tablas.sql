-- ============================================================================
-- 20261004200000_cuadre_piso_tablas.sql — CAYLA V2 · ADR-0328 decisión técnica 4 «Cuadre del piso, una vez por sede»
-- PARTE 1 de 4 (las tablas). Le siguen 20261004200050 (Frescura), 20261004200070 (Eliminar con historia) y
-- 20261004200100 (las funciones), en ese orden.
--
-- EL PROBLEMA PRIMERO. El sistema dice que TRU tiene 138 prendas colgadas y 635 guardadas; en la tienda cuelgan 600 a 750 y
-- hay más de 200 guardadas (Felipe, 2026-09-30). El 14-sep todo el stock de las tiendas se pasó al almacén de un golpe
-- (`activacion-piso-almacen-produccion.sql`, «falta reponer piso») y el alta trajo «almacén» marcado: casi nada se registró
-- al colgarse. Por eso la caja no deja cobrar lo colgado, «Reponer» marca todas las tallas y Frescura no conoce la edad
-- de 4 de cada 5 prendas colgadas. Decisión de Felipe (ADR-0328): se arregla UNA vez por sede escaneando lo que de verdad
-- está GUARDADO; lo que el sistema tiene en el almacén y nadie escaneó pasa al piso en un solo movimiento, y queda la
-- fecha del cuadre de la sede.
--
-- QUÉ HACE. Dos tablas nuevas. `movimientos` y `stock` NO cambian (núcleo estable):
--   · `cuadres_piso`: el documento de un cuadre — sede, quién firma (el responsable), la marca del intento, la huella de
--     lo escaneado, DESDE CUÁNDO se escaneó (`escaneo_desde`: lo que se movió en el almacén después invalida el escaneo),
--     el resumen que se le mostró a la persona, lo «no cargado» (escaneado de más: se guarda, NO se aplica) y la nota.
--     Su `created_at` es LA fecha del cuadre de la sede (la lee `fn_cuadre_piso_estado`).
--   · `cuadre_piso_items`: una línea por prenda movida, con la fila del libro que la movió como llave (1 a 1 con
--     `movimientos`) y su sentido (`al_piso` | `al_almacen`). Frescura reconoce el cuadre por ESTE vínculo con llave
--     foránea, nunca por motivo ni nota (PARTE 2).
--
-- ESTADO QUE DEJA DE SER POSIBLE (lo niega el esquema, no una validación en la pantalla)
--   · el mismo cuadre guardado dos veces                       → unique (token_cliente)
--   · una fila del libro en dos cuadres / ítem sin fila          → PK y FK de cuadre_piso_items.movimiento_id
--   · una prenda que en el MISMO cuadre baja y sube a la vez     → unique (cuadre_id, variante_id): una sola dirección
--     (si se mezclaran, el orden del mismo instante cambiaría el «piso de antes» de Frescura)
--   · un ítem cuyo movimiento no es el traslado interno de su sede, de su prenda, de su cantidad y en su sentido
--     (almacén→piso para `al_piso`, piso→almacén para `al_almacen`) → disparador fn_cuadre_piso_item_coherente
--   · cuadrar la «Prenda sin registrar» (centinela ADR-0179)    → check cuadre_piso_items_no_centinela
--   · un cuadre sin autor, sin hora de escaneo o con el escaneo DESPUÉS del cuadre → not null + check
--   · volver a cuadrar una sede sin decir por qué               → disparador fn_cuadre_piso_nota_al_repetir
--     (Felipe permite rehacerlo —no hay unique por sede—, pero desde el segundo la nota es obligatoria)
--   · un cuadre editado, borrado o las tablas vaciadas          → disparadores de inmutabilidad y sin truncate
-- Un cuadre SIN ítems sí es posible y es válido: la sede ya estaba cuadrada y solo queda la fecha.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, tal cual (trae `retail.` y su `search_path`), ANTES de las otras tres. Las llaves
-- foráneas hacia movimientos, variantes, ubicaciones y public.personas toman un candado breve sobre tablas que la tienda
-- usa: por eso va sola, SIN políticas, con `lock_timeout = 3s` (si no consigue el candado, falla sin daño y se vuelve a
-- pegar), fuera de hora punta. Los disparadores van con `create or replace trigger` (nunca `drop trigger`: tomaría en
-- exclusiva las 21 tablas de auth y storage, ADR-0195). Idempotente: pegada dos veces deja lo mismo.
-- Verificación (solo lectura):
--   select count(*) from pg_class where relnamespace = 'retail'::regnamespace and relname in ('cuadres_piso', 'cuadre_piso_items'); → 2
--   select relrowsecurity from pg_class where oid = 'retail.cuadres_piso'::regclass;                                              → t
--
-- SE ROMPE SI alguien agrega aquí una política o un `alter` de movimientos/stock (hay que partir el archivo, ADR-0195), o
-- si otra pantalla «cuadra» con Reponer o Subir a almacén en vez de usar `cuadrar_piso`: sin fila en cuadre_piso_items,
-- esas bajadas vuelven a ser bajadas para Frescura (Nueva y confianza inflada).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.cuadres_piso (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  persona_id uuid not null references public.personas (id),
  token_cliente uuid not null,
  huella text not null check (huella ~ '^[0-9a-f]{32}$'),
  escaneo_desde timestamptz not null,
  resumen jsonb not null check (jsonb_typeof(resumen) = 'object'),
  no_cargado jsonb not null default '[]'::jsonb check (jsonb_typeof(no_cargado) = 'array'),
  nota text check (nota is null or (nota = btrim(nota) and char_length(nota) between 1 and 300)),
  created_at timestamptz not null default now(),
  constraint cuadres_piso_token_key unique (token_cliente),
  constraint cuadres_piso_escaneo_antes check (escaneo_desde <= created_at)
);

-- La pregunta de siempre es «¿cuál es el último cuadre de esta sede?» (fn_cuadre_piso_estado, el candado de cuadrar_piso).
create index if not exists cuadres_piso_sede_fecha_idx on retail.cuadres_piso (ubicacion_id, created_at desc);

comment on table retail.cuadres_piso is
  'ADR-0328 (decisión técnica 4): el cuadre del piso de una sede. Se escanea lo guardado; lo que el sistema tenía en el almacén y nadie escaneó pasó al piso (y lo escaneado que el sistema creía colgado subió al almacén). Su created_at es la fecha del cuadre de la sede. Sus líneas en cuadre_piso_items. No se edita ni se borra.';
comment on column retail.cuadres_piso.ubicacion_id is 'La sede cuadrada: siempre una que separa piso y almacén.';
comment on column retail.cuadres_piso.persona_id is 'Quién cuadró: el responsable elegido en la pantalla (el mismo que firma cada movimiento). Confirmar es solo de un líder.';
comment on column retail.cuadres_piso.token_cliente is 'La marca del intento. El mismo intento reenviado (la red se cortó) devuelve este cuadre sin mover nada.';
comment on column retail.cuadres_piso.huella is 'md5 de sede, escaneo_desde, nota y la lista escaneada normalizada. Con la misma marca y otra huella, la base no repite nada y avisa.';
comment on column retail.cuadres_piso.escaneo_desde is 'Desde cuándo se escaneó lo guardado. Si algo se movió en el almacén de la sede después, el cuadre se rechaza: ese escaneo ya no dice la verdad.';
comment on column retail.cuadres_piso.resumen is 'Las cifras del cuadre (cuántas pasaron al piso, cuántas subieron, cuántas no cargadas, antes y después) tal como se aplicaron.';
comment on column retail.cuadres_piso.no_cargado is 'Lo escaneado como guardado que el sistema no tiene en la sede: [{variante_id, prenda, escaneadas, almacen, piso, no_cargadas}]. Se guarda para cargarlo después; el cuadre NO lo crea.';
comment on column retail.cuadres_piso.nota is 'Por qué se cuadra. Obligatoria desde el segundo cuadre de la sede (por qué se vuelve a cuadrar).';
comment on column retail.cuadres_piso.created_at is 'La fecha del cuadre (hora de inicio de la transacción).';

create table if not exists retail.cuadre_piso_items (
  movimiento_id uuid primary key references retail.movimientos (id),
  cuadre_id uuid not null references retail.cuadres_piso (id),
  variante_id uuid not null references retail.variantes (id),
  sentido text not null check (sentido in ('al_piso', 'al_almacen')),
  cantidad integer not null check (cantidad > 0),
  constraint cuadre_piso_items_no_centinela check (variante_id <> '22222222-2222-4222-8222-222222222222'),
  constraint cuadre_piso_items_una_por_prenda unique (cuadre_id, variante_id)
);

comment on table retail.cuadre_piso_items is
  'ADR-0328: una línea por prenda movida en un cuadre del piso. La llave es la fila del libro que la movió (1 a 1 con movimientos). Frescura la usa para no leer el cuadre como bajada ni como retiro. No se edita ni se borra.';
comment on column retail.cuadre_piso_items.movimiento_id is 'La fila de movimientos (traslado interno de la misma sede) que registró esta línea.';
comment on column retail.cuadre_piso_items.sentido is 'al_piso: del almacén al piso (lo que nadie escaneó como guardado). al_almacen: del piso al almacén (lo escaneado que el sistema creía colgado).';
comment on column retail.cuadre_piso_items.cantidad is 'Unidades movidas de esa prenda: las mismas que su movimiento.';

-- ---------------------------------------------------------------------------
-- La línea tiene que ser EXACTAMENTE su movimiento: el traslado interno de la sede del cuadre, de la misma prenda y
-- cantidad, en el sentido que dice. Así Frescura puede confiar en que lo que excluye es el cuadre y nada más.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_cuadre_piso_item_coherente()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  if not exists (
    select 1
      from retail.movimientos m
      join retail.cuadres_piso c on c.id = new.cuadre_id
      join retail.sububicaciones so on so.id = m.sububicacion_id
      join retail.sububicaciones sd on sd.id = m.sububicacion_destino_id
     where m.id = new.movimiento_id
       and m.tipo = 'traslado'
       and m.ubicacion_id = c.ubicacion_id
       and m.ubicacion_destino_id = c.ubicacion_id
       and so.ubicacion_id = c.ubicacion_id
       and sd.ubicacion_id = c.ubicacion_id
       and m.variante_id = new.variante_id
       and m.cantidad = new.cantidad
       and ((new.sentido = 'al_piso' and so.tipo = 'almacen_tienda' and sd.tipo = 'piso_venta')
         or (new.sentido = 'al_almacen' and so.tipo = 'piso_venta' and sd.tipo = 'almacen_tienda'))
  ) then
    raise exception 'La línea del cuadre no coincide con su movimiento (prenda, cantidad, sede o sentido).'
      using hint = 'cuadre_item_incoherente';
  end if;
  return new;
end;
$fn$;

comment on function retail.fn_cuadre_piso_item_coherente() is
  'ADR-0328: impide guardar una línea de cuadre cuyo movimiento no sea el traslado interno de su sede, con su prenda, su cantidad y su sentido.';

create or replace trigger cuadre_piso_items_coherentes
  before insert on retail.cuadre_piso_items
  for each row execute function retail.fn_cuadre_piso_item_coherente();

-- ---------------------------------------------------------------------------
-- Volver a cuadrar una sede se permite (Felipe), pero no a ciegas: desde el segundo cuadre hay que decir por qué.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_cuadre_piso_nota_al_repetir()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
declare
  v_anterior timestamptz;
begin
  if new.nota is not null then
    return new;
  end if;
  v_anterior := (select max(c.created_at) from retail.cuadres_piso c where c.ubicacion_id = new.ubicacion_id);
  if v_anterior is not null then
    raise exception 'Esta sede ya cuadró su piso el %. Para volver a cuadrarlo, escribe por qué.',
      to_char(v_anterior at time zone 'America/Lima', 'DD/MM/YYYY "a las" HH24:MI')
      using hint = 'cuadre_nota_requerida';
  end if;
  return new;
end;
$fn$;

comment on function retail.fn_cuadre_piso_nota_al_repetir() is
  'ADR-0328: el segundo cuadre (y los siguientes) de una sede exige nota: por qué se vuelve a cuadrar.';

create or replace trigger cuadres_piso_nota_al_repetir
  before insert on retail.cuadres_piso
  for each row execute function retail.fn_cuadre_piso_nota_al_repetir();

-- Un cuadre registrado es historia: igual que el libro de movimientos, se corrige con el movimiento contrario (o con otro
-- cuadre, con su nota).
create or replace function retail.fn_cuadre_piso_es_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  raise exception 'Un cuadre del piso registrado no se edita ni se borra. Si salió mal, vuelve a cuadrar (con su nota) o corrígelo con un conteo.';
end;
$fn$;

comment on function retail.fn_cuadre_piso_es_inmutable() is
  'ADR-0328: impide editar o borrar cuadres_piso y cuadre_piso_items.';

create or replace trigger cuadres_piso_inmutables
  before update or delete on retail.cuadres_piso
  for each row execute function retail.fn_cuadre_piso_es_inmutable();

create or replace trigger cuadre_piso_items_inmutables
  before update or delete on retail.cuadre_piso_items
  for each row execute function retail.fn_cuadre_piso_es_inmutable();

-- Un TRUNCATE salta los disparadores por fila: sin esto, vaciar las tablas borraría la fecha del cuadre y su vínculo con
-- Frescura (lo bajado volvería a leerse como bajadas «Nuevas»). Mismo candado y mismo mensaje que el libro.
create or replace trigger cuadres_piso_sin_truncate
  before truncate on retail.cuadres_piso
  for each statement execute function retail.fn_historial_sin_truncate();

create or replace trigger cuadre_piso_items_sin_truncate
  before truncate on retail.cuadre_piso_items
  for each statement execute function retail.fn_historial_sin_truncate();

-- Nadie las lee ni escribe directo: solo las funciones `security definer` de la PARTE 4 (RLS encendido y SIN políticas).
alter table retail.cuadres_piso enable row level security;
alter table retail.cuadre_piso_items enable row level security;
revoke all on retail.cuadres_piso, retail.cuadre_piso_items from public, anon, authenticated;
revoke all on function retail.fn_cuadre_piso_item_coherente() from public, anon, authenticated;
revoke all on function retail.fn_cuadre_piso_nota_al_repetir() from public, anon, authenticated;
revoke all on function retail.fn_cuadre_piso_es_inmutable() from public, anon, authenticated;

reset lock_timeout;

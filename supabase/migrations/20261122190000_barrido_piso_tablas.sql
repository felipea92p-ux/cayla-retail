-- ============================================================================
-- 20261122190000_barrido_piso_tablas.sql — CAYLA V2 · ADR-0690 «El barrido del piso» · actividad 1 · PARTE 1 de 2 (las tablas)
-- Le sigue 20261122191000_barrido_piso_funciones.sql.
--
-- EL PROBLEMA PRIMERO. En Trujillo bajan prendas del almacén al piso en hora punta sin registrar la bajada: el sistema dice
-- 735 colgadas y 1.072 guardadas (producción, 2026-11-22) y nadie cree ninguna de las dos. «Cuadrar el piso» (ADR-0328)
-- arregla esto escaneando lo GUARDADO, en UN aparato y de una sola vez: lo escaneado vive en el localStorage de ese teléfono
-- y la base se entera al confirmar. Felipe pide otra cosa (2026-11-22): escanear lo COLGADO, entre una y cinco personas a la
-- vez, que entran y salen a mitad del barrido sin repartirse áreas, con quién y a qué hora quedó cada lectura para que el
-- equipo reconozca de dónde a dónde se contó si algo salió mal. Conteo tampoco sirve: cada aparato manda «su total» de la
-- prenda y la base lo PISA (gana el último guardado, `conteo_contar`), y no guarda quién contó.
--
-- QUÉ HACE. Dos tablas nuevas. `movimientos`, `stock`, `cuadres_piso` y `conteos` NO cambian:
--   · `barridos_piso`: el barrido de una sede — quién lo abrió, cuándo y su estado. A lo sumo UNO abierto por sede: quien
--     llega se suma al que está (`abrir_barrido_piso` devuelve el abierto en vez de crear otro).
--   · `barrido_piso_lecturas`: UNA fila por lectura (un escaneo, o una pila declarada con «Cambiar cantidad»), con la persona
--     que la hizo (el responsable del combo, `fn_actor_persona_id(true)`), la hora del SERVIDOR al guardarla y la hora del
--     aparato al leerla (llegan distintas si la lectura esperó en la cola de un teléfono sin red). El total de una prenda es
--     la SUMA de sus lecturas: dos personas que escanean la misma blusa se suman, nunca se pisan.
--     Su `id` lo genera el aparato: reenviar la misma lectura tras un corte no la cuenta dos veces.
--
-- ESTADO QUE DEJA DE SER POSIBLE (lo niega el esquema, no una validación en la pantalla)
--   · dos barridos abiertos en la misma sede                 → índice único parcial barridos_piso_uno_abierto
--   · un barrido cerrado sin fecha o abierto con fecha        → check barridos_piso_cierre_coherente
--   · una lectura sin barrido, sin persona, sin prenda o con cantidad fuera de 1..500 → not null, FK y check
--   · la misma lectura guardada dos veces                      → PK (id del aparato)
--   · una lectura que llega a un barrido que ya no está abierto, o de una prenda que no es inventario (la «Prenda sin
--     registrar», ADR-0179) → disparador fn_barrido_piso_lectura_valida
--   · una lectura editada, borrada o las tablas vaciadas      → disparadores de inmutabilidad y sin truncate
--     (quitar una lectura repetida llega en la actividad 3 como ANULACIÓN con quién y cuándo, nunca como DELETE)
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, tal cual (trae `retail.` y su `search_path`), ANTES de la parte 2. Las llaves foráneas
-- hacia ubicaciones, variantes y public.personas toman un candado breve: va SIN políticas (las tablas solo se leen y escriben
-- por funciones `security definer`, así que RLS queda encendido y vacío), con `lock_timeout = 3s` (si no consigue el candado
-- falla sin daño y se vuelve a pegar). Los disparadores van con `create or replace trigger`, nunca `drop trigger` (tomaría en
-- exclusiva las 21 tablas de auth y storage, ADR-0195). Idempotente: pegada dos veces deja lo mismo.
-- Verificación (solo lectura):
--   select count(*) from pg_class where relnamespace = 'retail'::regnamespace and relname in ('barridos_piso', 'barrido_piso_lecturas'); → 2
--
-- SE ROMPE SI alguien agrega aquí una política (hay que partir el archivo, ADR-0195), o si otra pantalla escribe lecturas sin
-- pasar por `registrar_lecturas_barrido` (perdería la firma y la marca del aparato).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.barridos_piso (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  abierto_por uuid not null references public.personas (id),
  abierto_en timestamptz not null default now(),
  estado text not null default 'abierto' check (estado in ('abierto', 'confirmado', 'cancelado')),
  cerrado_por uuid references public.personas (id),
  cerrado_en timestamptz,
  constraint barridos_piso_cierre_coherente check (
    (estado = 'abierto' and cerrado_en is null and cerrado_por is null)
    or (estado <> 'abierto' and cerrado_en is not null and cerrado_en >= abierto_en)
  )
);

-- Quien llega a la tienda se suma al barrido que está: nunca hay dos a la vez.
create unique index if not exists barridos_piso_uno_abierto on retail.barridos_piso (ubicacion_id) where estado = 'abierto';
create index if not exists barridos_piso_sede_fecha_idx on retail.barridos_piso (ubicacion_id, abierto_en desc);

comment on table retail.barridos_piso is
  'ADR-0690: el barrido del piso de una sede (escanear lo COLGADO entre una o varias personas). A lo sumo uno abierto por sede; las lecturas viven en barrido_piso_lecturas. Se lee y escribe solo por funciones security definer.';
comment on column retail.barridos_piso.abierto_por is 'Quién abrió el barrido: el responsable elegido en la pantalla.';
comment on column retail.barridos_piso.estado is 'abierto: se está escaneando · confirmado: se aplicó (actividad 5) · cancelado: se descartó sin mover nada.';

create table if not exists retail.barrido_piso_lecturas (
  id uuid primary key,
  barrido_id uuid not null references retail.barridos_piso (id),
  variante_id uuid not null references retail.variantes (id),
  cantidad integer not null default 1 check (cantidad between 1 and 500),
  codigo text check (codigo is null or char_length(codigo) between 1 and 120),
  persona_id uuid not null references public.personas (id),
  leida_en timestamptz not null default clock_timestamp(),
  leida_en_aparato timestamptz
);

-- Las dos preguntas de siempre: «¿cuánto lleva cada prenda?» y «¿qué leyó quién, en orden?».
create index if not exists barrido_piso_lecturas_prenda_idx on retail.barrido_piso_lecturas (barrido_id, variante_id);
create index if not exists barrido_piso_lecturas_orden_idx on retail.barrido_piso_lecturas (barrido_id, leida_en);

comment on table retail.barrido_piso_lecturas is
  'ADR-0690: una fila por lectura de un barrido del piso (un escaneo, o una pila declarada). El total de una prenda es la suma de sus lecturas: dos personas en la misma prenda se suman, no se pisan. El id lo genera el aparato (reenviar no duplica).';
comment on column retail.barrido_piso_lecturas.persona_id is 'Quién escaneó: el responsable del combo (fn_actor_persona_id(true)), no la cuenta.';
comment on column retail.barrido_piso_lecturas.leida_en is 'Hora del servidor al guardar la lectura.';
comment on column retail.barrido_piso_lecturas.leida_en_aparato is 'Hora del aparato al leerla: si la lectura esperó sin red, llega antes que leida_en. Solo para ordenar el historial; ningún candado la usa.';
comment on column retail.barrido_piso_lecturas.codigo is 'Lo que leyó la pistola o la cámara (o se eligió tocando, sin código).';

-- ---------------------------------------------------------------------------
-- Una lectura solo entra a un barrido ABIERTO y solo de una prenda que es inventario.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_barrido_piso_lectura_valida()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
declare
  v_estado text;
begin
  v_estado := (select b.estado from retail.barridos_piso b where b.id = new.barrido_id);
  if v_estado is distinct from 'abierto' then
    raise exception 'Este barrido ya se cerró: lo que escaneaste no se sumó. Abre el barrido de nuevo para seguir.'
      using hint = 'barrido_cerrado';
  end if;
  if new.variante_id = '22222222-2222-4222-8222-222222222222' then
    raise exception 'La «Prenda sin registrar» no se escanea en un barrido.' using hint = 'barrido_no_es_inventario';
  end if;
  return new;
end;
$fn$;

comment on function retail.fn_barrido_piso_lectura_valida() is
  'ADR-0690: una lectura solo entra a un barrido abierto y nunca de la «Prenda sin registrar».';

create or replace trigger barrido_piso_lecturas_validas
  before insert on retail.barrido_piso_lecturas
  for each row execute function retail.fn_barrido_piso_lectura_valida();

-- ---------------------------------------------------------------------------
-- Lo escaneado es historia: no se edita ni se borra. (La actividad 3 abre UNA salida: anular con quién y cuándo.)
-- Un barrido tampoco se borra; su estado lo cambian las funciones de cierre (actividad 5).
-- ---------------------------------------------------------------------------
create or replace function retail.fn_barrido_piso_es_historia()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  raise exception 'Lo escaneado en un barrido no se edita ni se borra.' using hint = 'barrido_inmutable';
end;
$fn$;

comment on function retail.fn_barrido_piso_es_historia() is
  'ADR-0690: impide editar, borrar o vaciar las lecturas de un barrido y borrar o vaciar un barrido.';

create or replace trigger barrido_piso_lecturas_inmutables
  before update or delete on retail.barrido_piso_lecturas
  for each row execute function retail.fn_barrido_piso_es_historia();

create or replace trigger barrido_piso_lecturas_sin_truncate
  before truncate on retail.barrido_piso_lecturas
  for each statement execute function retail.fn_barrido_piso_es_historia();

create or replace trigger barridos_piso_sin_borrar
  before delete on retail.barridos_piso
  for each row execute function retail.fn_barrido_piso_es_historia();

create or replace trigger barridos_piso_sin_truncate
  before truncate on retail.barridos_piso
  for each statement execute function retail.fn_barrido_piso_es_historia();

alter table retail.barridos_piso enable row level security;
alter table retail.barrido_piso_lecturas enable row level security;
revoke all on retail.barridos_piso, retail.barrido_piso_lecturas from public, anon, authenticated;

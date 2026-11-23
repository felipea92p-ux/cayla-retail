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
-- QUÉ HACE. Tres tablas nuevas. `movimientos`, `stock`, `cuadres_piso` y `conteos` NO cambian:
--   · `barridos_piso`: el barrido de una sede — quién lo abrió, cuándo y su estado. A lo sumo UNO abierto por sede: quien
--     llega se suma al que está (`abrir_barrido_piso` devuelve el abierto en vez de crear otro).
--   · `barrido_piso_lecturas`: UNA fila por lectura (un escaneo, o una pila declarada con «Cambiar cantidad»), con la persona
--     que la hizo (el responsable del combo, `fn_actor_persona_id(true)`), la hora del SERVIDOR al guardarla y la hora del
--     aparato al leerla (llegan distintas si la lectura esperó en la cola de un teléfono sin red). El total de una prenda es
--     la SUMA de sus lecturas: dos personas que escanean la misma blusa se suman, nunca se pisan.
--     Su `id` lo genera el aparato: reenviar la misma lectura tras un corte no la cuenta dos veces.
--   · `barrido_piso_hallazgos` (actividad 4): lo que se encontró colgado y NO se pudo escanear, aparte, con su foto.
--
-- ESTADO QUE DEJA DE SER POSIBLE (lo niega el esquema, no una validación en la pantalla)
--   · dos barridos abiertos en la misma sede                 → índice único parcial barridos_piso_uno_abierto
--   · un barrido cerrado sin fecha o abierto con fecha        → check barridos_piso_cierre_coherente
--   · una lectura sin barrido, sin persona, sin prenda o con cantidad fuera de 1..500 → not null, FK y check
--   · la misma lectura guardada dos veces                      → PK (id del aparato)
--   · una lectura que llega a un barrido que ya no está abierto, o de una prenda que no es inventario (la «Prenda sin
--     registrar», ADR-0179) → disparador fn_barrido_piso_lectura_valida
--   · una lectura borrada o las tablas vaciadas               → disparadores de inmutabilidad y sin truncate
--   · una lectura EDITADA en algo que no sea anularla una vez   → disparador fn_barrido_piso_lectura_solo_anular
--     (actividad 3: quitar una lectura repetida o un tramo contado de más es una ANULACIÓN con quién, cuándo y por qué; la
--     lectura sigue ahí, tachada, y deja de sumar. Nunca un DELETE: «de dónde a dónde se contó» tiene que poder verse después)
--   · una anulación a medias (con fecha y sin quién, o al revés) → check barrido_piso_lecturas_anulacion_completa
--   · algo apartado (actividad 4: sin etiqueta o código desconocido) que después no se pueda reconocer → check
--     barrido_piso_hallazgos_se_reconoce (foto, nota o código); un «código desconocido» sin su código → check; editarlo o
--     registrarlo con el barrido cerrado → disparador fn_barrido_piso_hallazgo_valido
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

-- Actividad 3: quitar sin borrar. Una lectura anulada no suma; queda con quién la quitó, cuándo y por qué.
alter table retail.barrido_piso_lecturas add column if not exists anulada_en timestamptz;
alter table retail.barrido_piso_lecturas add column if not exists anulada_por uuid references public.personas (id);
alter table retail.barrido_piso_lecturas add column if not exists motivo_anulacion text
  check (motivo_anulacion is null or motivo_anulacion in ('repetida', 'tramo'));
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'barrido_piso_lecturas_anulacion_completa'
                   and conrelid = 'retail.barrido_piso_lecturas'::regclass) then
    alter table retail.barrido_piso_lecturas add constraint barrido_piso_lecturas_anulacion_completa check (
      (anulada_en is null and anulada_por is null and motivo_anulacion is null)
      or (anulada_en is not null and anulada_por is not null and motivo_anulacion is not null and anulada_en >= leida_en));
  end if;
end;
$c$;

comment on column retail.barrido_piso_lecturas.anulada_en is 'Cuándo se quitó (no suma desde entonces). Nula: cuenta.';
comment on column retail.barrido_piso_lecturas.anulada_por is 'Quién la quitó: el responsable del combo.';
comment on column retail.barrido_piso_lecturas.motivo_anulacion is 'repetida: una lectura suelta que se contó de más · tramo: todo un tramo de una persona que no debía contarse.';

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
  before delete on retail.barrido_piso_lecturas
  for each row execute function retail.fn_barrido_piso_es_historia();

-- La única edición posible de una lectura: anularla, una sola vez y sin tocar nada más.
create or replace function retail.fn_barrido_piso_lectura_solo_anular()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  if (select b.estado from retail.barridos_piso b where b.id = old.barrido_id) is distinct from 'abierto' then
    raise exception 'Este barrido ya se cerró: lo escaneado ya no se puede quitar.' using hint = 'barrido_cerrado';
  end if;
  if old.anulada_en is null and new.anulada_en is not null
     and (new.id, new.barrido_id, new.variante_id, new.cantidad, new.codigo, new.persona_id, new.leida_en, new.leida_en_aparato)
         is not distinct from
         (old.id, old.barrido_id, old.variante_id, old.cantidad, old.codigo, old.persona_id, old.leida_en, old.leida_en_aparato) then
    return new;
  end if;
  raise exception 'Lo escaneado en un barrido no se edita: solo se puede quitar, una vez.' using hint = 'barrido_inmutable';
end;
$fn$;

comment on function retail.fn_barrido_piso_lectura_solo_anular() is
  'ADR-0690: una lectura de un barrido solo se edita para anularla (una vez, sin cambiar nada más, y solo con el barrido abierto).';

create or replace trigger barrido_piso_lecturas_solo_anular
  before update on retail.barrido_piso_lecturas
  for each row execute function retail.fn_barrido_piso_lectura_solo_anular();

create or replace trigger barrido_piso_lecturas_sin_truncate
  before truncate on retail.barrido_piso_lecturas
  for each statement execute function retail.fn_barrido_piso_es_historia();

create or replace trigger barridos_piso_sin_borrar
  before delete on retail.barridos_piso
  for each row execute function retail.fn_barrido_piso_es_historia();

create or replace trigger barridos_piso_sin_truncate
  before truncate on retail.barridos_piso
  for each statement execute function retail.fn_barrido_piso_es_historia();

-- ---------------------------------------------------------------------------
-- Actividad 4: lo que no se puede escanear. Una prenda colgada SIN etiqueta, o con un código que el catálogo no conoce, no se
-- frena el barrido por ella: se registra APARTE con cuántas son, una foto rápida (o una nota) para reconocerla después, quién y
-- cuándo, y se resuelve en «Por resolver» (actividad 6). No es una lectura: todavía no se sabe qué prenda es, así que no suma a
-- ninguna prenda ni se mueve al confirmar.
-- ---------------------------------------------------------------------------
create table if not exists retail.barrido_piso_hallazgos (
  id uuid primary key,
  barrido_id uuid not null references retail.barridos_piso (id),
  tipo text not null check (tipo in ('sin_etiqueta', 'codigo_desconocido')),
  codigo text check (codigo is null or char_length(codigo) between 1 and 120),
  cantidad integer not null default 1 check (cantidad between 1 and 500),
  nota text check (nota is null or (nota = btrim(nota) and char_length(nota) between 1 and 200)),
  foto_ruta text unique check (foto_ruta is null or foto_ruta like barrido_id::text || '/%'),
  persona_id uuid not null references public.personas (id),
  registrado_en timestamptz not null default clock_timestamp(),
  anulada_en timestamptz,
  anulada_por uuid references public.personas (id),
  constraint barrido_piso_hallazgos_codigo_si_desconocido check (tipo <> 'codigo_desconocido' or codigo is not null),
  constraint barrido_piso_hallazgos_se_reconoce check (foto_ruta is not null or nota is not null or codigo is not null),
  constraint barrido_piso_hallazgos_anulacion_completa check ((anulada_en is null) = (anulada_por is null) and (anulada_en is null or anulada_en >= registrado_en))
);

create index if not exists barrido_piso_hallazgos_barrido_idx on retail.barrido_piso_hallazgos (barrido_id, registrado_en);

comment on table retail.barrido_piso_hallazgos is
  'ADR-0690 (actividad 4): lo que se encontró colgado y no se pudo escanear (sin etiqueta, o con un código que el catálogo no conoce), con cuántas, una foto o nota para reconocerlo, quién y cuándo. Se resuelve en «Por resolver»; no suma a ninguna prenda.';
comment on column retail.barrido_piso_hallazgos.foto_ruta is 'La foto en el bucket privado retail-barridos: <barrido>/<hallazgo>.jpg.';
comment on column retail.barrido_piso_hallazgos.codigo is 'El código que leyó el escáner y el catálogo no conoce (codigo_desconocido).';

create or replace function retail.fn_barrido_piso_hallazgo_valido()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  if (select b.estado from retail.barridos_piso b where b.id = coalesce(new.barrido_id, old.barrido_id)) is distinct from 'abierto' then
    raise exception 'Este barrido ya se cerró.' using hint = 'barrido_cerrado';
  end if;
  if tg_op = 'UPDATE' then
    -- La única edición posible: quitarlo, una vez y sin tocar nada más.
    if not (old.anulada_en is null and new.anulada_en is not null
            and (new.id, new.barrido_id, new.tipo, new.codigo, new.cantidad, new.nota, new.foto_ruta, new.persona_id, new.registrado_en)
                is not distinct from
                (old.id, old.barrido_id, old.tipo, old.codigo, old.cantidad, old.nota, old.foto_ruta, old.persona_id, old.registrado_en)) then
      raise exception 'Lo registrado en un barrido no se edita: solo se puede quitar, una vez.' using hint = 'barrido_inmutable';
    end if;
  end if;
  return new;
end;
$fn$;

comment on function retail.fn_barrido_piso_hallazgo_valido() is
  'ADR-0690: lo que se aparta en un barrido entra solo con el barrido abierto, y después solo se puede quitar (una vez, sin cambiar nada más).';

create or replace trigger barrido_piso_hallazgos_validos
  before insert or update on retail.barrido_piso_hallazgos
  for each row execute function retail.fn_barrido_piso_hallazgo_valido();

create or replace trigger barrido_piso_hallazgos_sin_borrar
  before delete on retail.barrido_piso_hallazgos
  for each row execute function retail.fn_barrido_piso_es_historia();

create or replace trigger barrido_piso_hallazgos_sin_truncate
  before truncate on retail.barrido_piso_hallazgos
  for each statement execute function retail.fn_barrido_piso_es_historia();

alter table retail.barrido_piso_hallazgos enable row level security;
revoke all on retail.barrido_piso_hallazgos from public, anon, authenticated;

alter table retail.barridos_piso enable row level security;
alter table retail.barrido_piso_lecturas enable row level security;
revoke all on retail.barridos_piso, retail.barrido_piso_lecturas from public, anon, authenticated;

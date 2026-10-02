-- ============================================================================
-- 20261001210000_club_paso1g_parte1_clientas.sql — CAYLA V2 · Club de clientas · tanda 1g · PARTE 1 de 8
-- ADR-0288 («Actualización 2026-10-01 (g)» y «Contrato de la tanda 1g»). SOLO `clientas`: el correo opcional, de dónde
-- vino la ficha (`registro_origen`) y la tienda del cartel donde se unió (`club_ubicacion_id`), con sus candados y dos
-- disparadores. Va sola porque toda venta con clienta lee `clientas` (la cabecera completa —el porqué, el orden de pegado
-- y la verificación— está en la PARTE 8, 20261001210700_club_paso1g_parte8_funciones.sql). Se pega PRIMERO, sola en el SQL
-- Editor; se puede pegar dos veces. Sin políticas ni `drop trigger`. Mientras la PARTE 8 no esté, nada escribe estas
-- columnas: una ficha nueva nace `registro_origen = 'caja'` (lo que es: la registró una persona de la tienda).
--
-- DECIDÍ: `registro_origen` es `not null default 'caja'`: toda ficha de antes la registró alguien de CAYLA (caja, la ficha o
--   una importación); `cartel` lo escribe solo `registrarse_en_el_club` cuando crea la ficha (G-10: la ficha dice «se
--   registró ella desde el cartel»). Un `add column … default` constante no reescribe la tabla (Postgres 11+).
-- DECIDÍ: el correo y la tienda del club se limpian solos (disparador `clientas_club_datos_al_salir`) en la misma escritura
--   en que la ficha se anonimiza o deja de ser socia, como las preferencias de la 1f: así `archivar_clienta` y
--   `unir_clientas` no necesitan saber que existen, y el candado `clientas_anonimizada_sin_correo` nunca las frena.
-- DECIDÍ: al anonimizar, el teléfono y el texto de los avisos que se le mandaron (`club_avisos_enviados`, PARTE 7) también
--   se borran (`clientas_avisos_al_anonimizar`, después de la escritura). La tabla nace en la PARTE 7: hasta entonces el
--   disparador no hace nada (mira `to_regclass` antes).
-- ============================================================================

-- ============================== PARTE 1 · clientas (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.clientas add column if not exists correo text;
alter table retail.clientas add column if not exists registro_origen text not null default 'caja';
alter table retail.clientas add column if not exists club_ubicacion_id uuid;

comment on column retail.clientas.correo is
  'Correo de contacto, opcional (ADR-0288 G-3): solo para contactarla si hace falta, nunca para publicidad. Se guarda en minúsculas y sin espacios. Se borra al anonimizar (disparador clientas_club_datos_al_salir).';
comment on column retail.clientas.registro_origen is
  'De dónde salió la ficha (ADR-0288 G-10): caja = la registró una persona de CAYLA (caja, la ficha o una importación; toda ficha anterior a la tanda 1g); cartel = se registró ella sola escaneando el QR del cartel (registrarse_en_el_club). No cambia después.';
comment on column retail.clientas.club_ubicacion_id is
  'La tienda del cartel donde se unió al club por última vez (ADR-0288, contrato 1g): es el WhatsApp que ella saludó y el que le escribe (fn_club_avisos_pendientes; sin ella, su sede). Solo de una socia: se vacía cuando deja de serlo.';

alter table retail.clientas drop constraint if exists clientas_club_ubicacion_id_fkey;
alter table retail.clientas add constraint clientas_club_ubicacion_id_fkey
  foreign key (club_ubicacion_id) references retail.ubicaciones (id);

alter table retail.clientas drop constraint if exists clientas_registro_origen_valido;
alter table retail.clientas add constraint clientas_registro_origen_valido
  check (registro_origen in ('caja', 'cartel'));

-- Formato básico: algo@algo.algo, en minúsculas, sin espacios, 254 caracteres como mucho (RFC 5321).
alter table retail.clientas drop constraint if exists clientas_correo_formato;
alter table retail.clientas add constraint clientas_correo_formato
  check (correo is null or (correo = lower(btrim(correo)) and char_length(correo) <= 254
                            and correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));

alter table retail.clientas drop constraint if exists clientas_club_ubicacion_solo_socia;
alter table retail.clientas add constraint clientas_club_ubicacion_solo_socia
  check (club_ubicacion_id is null or club_desde is not null);

-- Ley 29733: anonimizada ⇒ sin correo (como sin documento, nombre ni celular: clientas_anonimizada_sin_datos_personales).
alter table retail.clientas drop constraint if exists clientas_anonimizada_sin_correo;
alter table retail.clientas add constraint clientas_anonimizada_sin_correo
  check (not anonimizada or (correo is null and club_ubicacion_id is null));

-- Deja de ser socia o se anonimiza (archivar_clienta, unir_clientas, fn_club_anonimizar_inactivas, o cualquier camino
-- futuro) → su correo y su tienda del club se van en la misma escritura.
create or replace function retail.fn_clientas_club_datos_al_salir()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if new.anonimizada then
    new.correo := null;
  end if;
  if new.club_desde is null then
    new.club_ubicacion_id := null;
  end if;
  return new;
end;
$$;
revoke all on function retail.fn_clientas_club_datos_al_salir() from public, anon, authenticated;

create or replace trigger clientas_club_datos_al_salir before update on retail.clientas
  for each row
  when ((new.anonimizada and new.correo is not null) or (new.club_desde is null and new.club_ubicacion_id is not null))
  execute function retail.fn_clientas_club_datos_al_salir();

-- Anonimizada → los avisos que se le mandaron pierden el teléfono y el texto (el texto la saluda por su nombre). Queda que
-- se le mandó un aviso de tal tipo, cuándo y desde qué tienda: la cuenta del tope y del grupo testigo, sin datos suyos.
create or replace function retail.fn_clientas_avisos_al_anonimizar()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  -- La tabla nace en la PARTE 7 de esta tanda: antes, no hay nada que borrar.
  if to_regclass('retail.club_avisos_enviados') is not null then
    update retail.club_avisos_enviados a
       set telefono = null, texto = null
     where a.clienta_id = new.id
       and (a.telefono is not null or a.texto is not null);
  end if;
  return null;
end;
$$;
revoke all on function retail.fn_clientas_avisos_al_anonimizar() from public, anon, authenticated;

create or replace trigger clientas_avisos_al_anonimizar after update of anonimizada on retail.clientas
  for each row
  when (new.anonimizada and not old.anonimizada)
  execute function retail.fn_clientas_avisos_al_anonimizar();

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 1 ==============================

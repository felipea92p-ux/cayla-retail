-- ============================================================================
-- 20261001210600_club_paso1g_parte7_tablas.sql — CAYLA V2 · Club de clientas · tanda 1g · PARTE 7 de 8
-- ADR-0288 (G-8, G-10, G-13 y «Contrato de la tanda 1g»). Las TRES tablas nuevas: la escala del vale de aniversario, los
-- intentos de la página del cartel (el freno contra el abuso) y los avisos del club que se mandaron. Ninguna está en uso
-- todavía; las llaves foráneas de `club_avisos_enviados` toman `clientas`, `ubicaciones` y `personas` en modo compartido (no
-- en exclusiva): una venta no espera. Cabecera completa en la PARTE 8, 20261001210700_club_paso1g_parte8_funciones.sql. Se
-- pega SÉPTIMA, sola en el SQL Editor; se puede pegar dos veces. Sin políticas (RLS encendido y sin políticas: solo las leen
-- y escriben funciones `security definer`) ni `drop trigger`.
--
-- DECIDÍ: la escala es una tabla (anio 1..5 → monto), no cinco columnas de `configuracion_empresa`: el contrato la nombra
--   así, el quinto año se repite sin otra fila y `guardar_beneficios_club` la reemplaza entera en una transacción.
-- DECIDÍ: `club_intentos_registro` guarda la ip y el documento como huellas (los hashea el servidor con una sal suya) y el
--   celular normalizado (el contrato lo pide para limitar por celular). El celular es un dato personal en una tabla de
--   control: `fn_club_anonimizar_inactivas` (el cron diario) lo vacía pasado un día; la fila queda para la cuenta.
-- DECIDÍ: `club_avisos_enviados` es de solo agregar, con dos excepciones escritas en su disparador: deshacer (una vez, dentro
--   de la función que pone el plazo de 10 minutos) y anonimizar (borra el teléfono y el texto: el texto la saluda por su
--   nombre). Nada se borra: el tope del mes y el grupo testigo se cuentan de aquí.
-- ============================================================================

-- ============================== PARTE 7 · tablas nuevas ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. la escala del vale de aniversario (G-13) ----------
create table if not exists retail.club_aniversario_escala (
  anio  smallint primary key,
  monto numeric(10,2) not null,
  constraint club_aniversario_escala_anio_valido check (anio between 1 and 5),
  constraint club_aniversario_escala_monto_valido check (monto > 0 and monto <= 100000)
);
comment on table retail.club_aniversario_escala is
  'El vale de aniversario del club (ADR-0288 G-13): cuánto vale según cuántos años que CUENTAN lleva la socia (anio 1..5); desde el quinto, se repite el del 5. Montos propuestos por Felipe: 20, 30, 40, 50 y 60. Se cambia con guardar_beneficios_club (solo el líder; publica una versión nueva de los términos). RLS sin políticas: la leen fn_club_pagina y las funciones del aniversario.';
alter table retail.club_aniversario_escala enable row level security;
revoke all on retail.club_aniversario_escala from public, anon, authenticated;

-- `on conflict do nothing`: pegar otra vez no pisa lo que Felipe ya haya cambiado.
insert into retail.club_aniversario_escala (anio, monto) values (1, 20), (2, 30), (3, 40), (4, 50), (5, 60)
on conflict (anio) do nothing;

-- ---------- 2. los intentos de la página del cartel (G-10) ----------
create table if not exists retail.club_intentos_registro (
  id             bigint generated always as identity primary key,
  creado_en      timestamptz not null default now(),
  tipo           text not null,
  ip_hash        text not null,
  documento_hash text,
  celular        text,
  constraint club_intentos_registro_tipo_valido check (tipo in ('consulta', 'registro')),
  constraint club_intentos_registro_ip_no_vacia check (btrim(ip_hash) <> '' and char_length(ip_hash) <= 128),
  constraint club_intentos_registro_documento_corto check (documento_hash is null or char_length(documento_hash) <= 128),
  constraint club_intentos_registro_celular_formato check (celular is null or celular ~ '^[0-9]{9}$')
);
comment on table retail.club_intentos_registro is
  'Los intentos de la página pública del cartel (ADR-0288 G-10), para frenar el abuso: consulta (buscar el nombre de un DNI en el padrón) y registro (unirse). ip_hash y documento_hash los calcula el servidor con una sal suya (nunca la ip ni el documento en claro); celular normalizado (lo vacía fn_club_anonimizar_inactivas pasado un día). Lo escribe y lo cuenta club_intento (solo el servidor). RLS sin políticas.';
create index if not exists club_intentos_registro_ip_idx on retail.club_intentos_registro (tipo, ip_hash, creado_en);
create index if not exists club_intentos_registro_documento_idx on retail.club_intentos_registro (documento_hash, creado_en)
  where documento_hash is not null;
create index if not exists club_intentos_registro_celular_idx on retail.club_intentos_registro (celular, creado_en)
  where celular is not null;
alter table retail.club_intentos_registro enable row level security;
revoke all on retail.club_intentos_registro from public, anon, authenticated;

-- ---------- 3. los avisos del club que se mandaron (G-8) ----------
create table if not exists retail.club_avisos_enviados (
  id           uuid primary key default gen_random_uuid(),
  clienta_id   uuid not null references retail.clientas (id),
  tipo         text not null,
  referencia   text not null,
  telefono     text,
  texto        text,
  ubicacion_id uuid not null references retail.ubicaciones (id),
  enviado_por  uuid not null references public.personas (id),
  creado_en    timestamptz not null default now(),
  deshecho_en  timestamptz,
  deshecho_por uuid references public.personas (id),
  constraint club_avisos_enviados_tipo_valido check (tipo in ('cumpleanos', 'aniversario', 'novedades', 'rebaja')),
  constraint club_avisos_enviados_referencia_no_vacia check (btrim(referencia) <> '' and char_length(referencia) <= 200),
  constraint club_avisos_enviados_deshecho_completo check ((deshecho_en is null) = (deshecho_por is null))
);
comment on table retail.club_avisos_enviados is
  'Los avisos del club que se mandaron por WhatsApp desde Clientas ▸ Avisos (ADR-0288 G-8): a quién, de qué tipo (cumpleanos, aniversario, novedades, rebaja), sobre qué (referencia: el año del cumpleaños, el año de club del vale, la semana de las novedades o la campaña de la rebaja), a qué número, con qué texto, desde qué tienda, quién y cuándo. De solo agregar: «Deshacer» (dentro de 10 minutos) marca deshecho_en; anonimizar a la clienta borra el teléfono y el texto. Un aviso vivo por clienta, tipo y referencia (club_avisos_enviados_uno_vivo). De aquí salen el tope de 2 promocionales al mes (CL-21) y lo que ya no se repite. RLS sin políticas.';
create unique index if not exists club_avisos_enviados_uno_vivo
  on retail.club_avisos_enviados (clienta_id, tipo, referencia) where deshecho_en is null;
create index if not exists club_avisos_enviados_clienta_idx on retail.club_avisos_enviados (clienta_id, creado_en);
alter table retail.club_avisos_enviados enable row level security;
revoke all on retail.club_avisos_enviados from public, anon, authenticated;
revoke delete, truncate on retail.club_avisos_enviados from service_role;

-- Solo agregar, con dos excepciones: deshacer (deshecho_en y deshecho_por, una sola vez) y anonimizar (teléfono y texto a
-- nulo). Ni delete ni truncate (tampoco postgres).
create or replace function retail.fn_club_avisos_solo_agregar()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'UPDATE'
     and new.id = old.id and new.clienta_id = old.clienta_id and new.tipo = old.tipo and new.referencia = old.referencia
     and new.ubicacion_id = old.ubicacion_id and new.enviado_por = old.enviado_por and new.creado_en = old.creado_en
     -- deshacer: una sola vez; después no cambia
     and (new.deshecho_en is not distinct from old.deshecho_en
          or (old.deshecho_en is null and new.deshecho_en is not null))
     and (new.deshecho_por is not distinct from old.deshecho_por or old.deshecho_por is null)
     -- anonimizar: el teléfono y el texto solo pueden quedar como estaban o vaciarse
     and (new.telefono is not distinct from old.telefono or new.telefono is null)
     and (new.texto is not distinct from old.texto or new.texto is null) then
    return new;
  end if;
  raise exception 'Un aviso enviado no se edita ni se borra: se deshace (dentro de 10 minutos) o se envía otro.'
    using errcode = 'P0001', hint = 'club_solo_agregar';
end;
$$;
revoke all on function retail.fn_club_avisos_solo_agregar() from public, anon, authenticated;

create or replace trigger club_avisos_enviados_solo_agregar before update or delete on retail.club_avisos_enviados
  for each row execute function retail.fn_club_avisos_solo_agregar();
create or replace trigger club_avisos_enviados_sin_truncate before truncate on retail.club_avisos_enviados
  for each statement execute function retail.fn_club_avisos_solo_agregar();

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 7 ==============================

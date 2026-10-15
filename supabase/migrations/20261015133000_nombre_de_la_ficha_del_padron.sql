-- ============================================================================
-- 20261015133000_nombre_de_la_ficha_del_padron.sql — CAYLA V2 · Clientes, Club y tienda online (ADR-0008, ADR-0288, ADR-0408)
--
-- EL PROBLEMA PRIMERO. Felipe (2026-10-15): «El nombre no se debe poder escribir ni editar: siempre debe ser el que trae la API.
-- Sin la API no se registra; con el carné y el pasaporte sí se pide escribir los nombres tal cual en su documento». Hoy la pantalla
-- trae el nombre del padrón (RENIEC por el DNI), pero si el padrón no responde deja escribirlo a mano, y «Editar» de la ficha deja
-- cambiarlo. Y la regla no puede vivir solo en la pantalla: `registrar_clienta` y `editar_clienta` las llama el navegador con la
-- sesión de quien atiende, así que cualquiera con la consola abierta puede guardar el nombre que quiera junto a un DNI. Un nombre
-- inventado junto a un DNI real sale después en la boleta y en el Club, que dicen ser «el nombre de su documento».
--
-- ANALOGÍA CAYLA. El cuaderno de clientes de la tienda: el nombre de quien trae DNI no lo escribe la vendedora de memoria; lo copia
-- del DNI que tiene en la mano. Aquí el «DNI en la mano» es la respuesta del padrón, y la base guarda el comprobante de que esa
-- respuesta existió: si el nombre que llega no está en ese comprobante, no se escribe en el cuaderno.
--
-- QUÉ HACE
--   1. `padron_lecturas`: las lecturas del padrón que un SERVIDOR anotó en la última hora. Solo la huella (sha-256 de tipo, número y
--      nombre): ni el DNI ni el nombre en claro de alguien que preguntó y no se registró (Ley 29733: no se guarda lo que no hace
--      falta). RLS sin políticas y sin permisos: la leen y la escriben solo las funciones de abajo.
--   2. `fn_anotar_lectura_padron(tipo, número, nombre)`: la anota el servidor del ERP con su llave de servicio, justo después de que
--      el padrón contestó (`/api/padron?para=ficha` y la página del cartel del Club). La ejecuta SOLO `service_role`: el navegador no
--      puede inventarse una lectura. De paso borra las vencidas (más de una hora): una lectura sirve para registrar en ese rato.
--   3. `tienda_anotar_lectura_padron(dni, nombre)`: lo mismo para la tienda online, que entra a la base solo por funciones
--      `tienda_*` con su rol `tienda_web` (la puerta angosta, ADR-0408).
--   4. El disparador `fn_nombre_de_ficha_del_padron` en `clientas` (al crear una ficha y al cambiarle el nombre o el documento): si la
--      ficha tiene documento y nombre, con DNI (o RUC) el nombre tiene que ser una lectura del padrón anotada en la última hora; con
--      carné o pasaporte, escrito sin números. Rechaza con P0001 `nombre_sin_padron` o 22023 `nombre_con_numeros` (detail `nombre`).
--      Cubre a la vez `registrar_clienta`, `editar_clienta`, `registrarse_en_el_club` y `tienda_registrar_cuenta`, y a cualquier
--      camino futuro que escriba una ficha: la regla vive donde vive el nombre, no repetida en cada función.
--
-- DECIDÍ: un disparador en la tabla y no un cambio en las cuatro funciones. Las cuatro escriben `clientas.nombre`; con el disparador
--   ninguna se reescribe (sus candados de versión y las pruebas que comparan su cuerpo vivo con un archivo no se tocan), y una quinta
--   que nazca mañana queda cubierta sola. Es el mismo patrón que «un correo es de una sola persona» (`fn_correo_de_una_persona`).
-- DECIDÍ: la regla rige para toda escritura que NO hace el dueño de la base (`session_user` distinto de `postgres` y
--   `supabase_admin`): la web del ERP y el servidor del Club entran por la API (`authenticator`) y la tienda con su propio usuario,
--   así que todas cumplen. Quedan fuera las pruebas, el SQL Editor, las migraciones y los trabajos programados: igual pueden escribir
--   la columna con un `update` directo (frenarlos aquí no protegería nada), y unas 180 llamadas de 14 pruebas arman fichas con nombres
--   inventados para probar otras cosas (el Club, el correo, los permisos). Lo prueba `pruebas:nombre-del-padron` con una sesión de
--   la API de verdad (`set session authorization authenticator`) y otra de la tienda.
-- DECIDÍ: un nombre que no cambia no se revisa (el disparador mira solo si cambian el nombre o el documento). Las fichas de antes,
--   con nombres escritos a mano, siguen como están hasta que alguien toque «Actualizar desde el padrón»; lo demás de la ficha
--   (celular, cumpleaños, correo) se sigue editando.
-- DECIDÍ: una ficha SIN nombre o SIN documento no se revisa. La regla es sobre DE DÓNDE sale un nombre, no sobre que exista: «sin la
--   API no se registra» lo hacen cumplir la pantalla y los servidores (que no mandan nombre si el padrón no lo dio), y una ficha que
--   se anonimiza queda sin documento.
-- DECIDÍ: la huella normaliza espacios y mayúsculas (`upper`, espacios simples), así «PEREZ  SALAS lucia» y «PEREZ SALAS LUCIA» son la
--   misma lectura. El nombre que se guarda es el que llega, tal cual (la tienda lo guarda con mayúscula inicial, el ERP como lo trae
--   el padrón): el disparador solo comprueba que salió del padrón.
-- DECIDÍ: una hora de vigencia. Entre que el padrón contesta y quien atiende toca «Registrar» pasan segundos o minutos; si la hoja
--   quedó abierta más de una hora, la base dice `nombre_sin_padron` y la pantalla vuelve a consultar.
-- DESCARTÉ: que la base consulte el padrón (extensión `http`): una dependencia de red dentro de una transacción de la tienda.
-- DESCARTÉ: una firma HMAC del servidor que la base verifica: haría falta compartir un secreto entre Vercel y la base (dos lugares que
--   pueden desincronizarse, y sin él no se registraría nadie). La lectura anotada usa la llave de servicio que el servidor ya tiene.
-- DESCARTÉ: guardar el nombre y el DNI de cada consulta en claro: sería un registro de personas que solo preguntaron.
--
-- SE ROMPE SI: alguien escribe `clientas` saltándose los disparadores (`session_replication_role = replica`); o un servidor nuevo
--   escribe fichas con DNI por la API sin anotar antes su lectura (el registro falla con `nombre_sin_padron`, no se guarda mal); o
--   Supabase cambia el usuario con que entra el SQL Editor (entonces el editor también tendría que anotar la lectura).
--
-- PRODUCCIÓN. NO está aplicada. Va DESPUÉS de las migraciones de la tienda online (crean el rol `tienda_web`, 20261014220000) y de
-- 20261015123000. Una sola parte, idempotente (se puede pegar dos veces). Crea una tabla nueva (vacía) y dos disparadores en
-- `clientas`, que toda venta lee: el disparador toma la tabla en SHARE ROW EXCLUSIVE, compatible con las lecturas de una venta; un alta
-- o una edición de ficha espera lo que dura el pegado (`lock_timeout` de 3 s: si alguien la tiene tomada, falla limpio y se vuelve a
-- pegar). Sin políticas ni `drop trigger` (CLAUDE.md, «Políticas y deadlocks»), y ningún `select … into` dentro de un texto entre
-- comillas. ORDEN: publicar PRIMERO la web del ERP y la tienda de este PR (anotan la lectura; si la función todavía no existe, siguen
-- como hoy) y DESPUÉS pegar este SQL. Si se pega antes, la web de antes no anota lecturas y todo registro con DNI (Vender, Clientes, el
-- cartel) falla con «nombre_sin_padron» hasta publicar; no se guarda nada mal.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select tgname from pg_trigger where tgrelid = 'retail.clientas'::regclass and tgname like 'clientas_nombre%' order by 1;
--     → clientas_nombre_del_padron_alta · clientas_nombre_del_padron_cambio
--   select has_function_privilege('authenticated', 'retail.fn_anotar_lectura_padron(text,text,text)', 'execute'),
--          has_function_privilege('service_role', 'retail.fn_anotar_lectura_padron(text,text,text)', 'execute'),
--          has_function_privilege('tienda_web', 'retail.tienda_anotar_lectura_padron(text,text)', 'execute');   → f | t | t
--   select count(*) from retail.padron_lecturas;   → pocas filas (solo la última hora), nunca un DNI ni un nombre
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Lo que da por hecho (si falta, no se toca nada) ----------
do $guarda$
begin
  if to_regclass('retail.clientas') is null then
    raise exception 'Falta retail.clientas: esta base no tiene las fichas de clientes.';
  end if;
  if to_regrole('tienda_web') is null then
    raise exception 'Falta el rol tienda_web: pega antes las migraciones de la tienda online (20261014220000 y las siguientes).';
  end if;
end
$guarda$;

-- ---------- 1. Las lecturas del padrón (solo su huella, solo la última hora) ----------
create table if not exists retail.padron_lecturas (
  huella text primary key check (huella ~ '^[0-9a-f]{64}$'),
  leida_en timestamptz not null default now()
);

comment on table retail.padron_lecturas is
  'Las lecturas del padrón (RENIEC por DNI, SUNAT por RUC) que un servidor anotó en la última hora (Felipe 2026-10-15, 20261015133000): la prueba de que un nombre salió del padrón y no se escribió a mano. Solo la huella sha-256 de tipo, número y nombre (fn_huella_padron), nunca el documento ni el nombre en claro. La escriben fn_anotar_lectura_padron (servidor del ERP) y tienda_anotar_lectura_padron (tienda online); la lee el disparador fn_nombre_de_ficha_del_padron de clientas. RLS sin políticas y sin permisos.';
alter table retail.padron_lecturas enable row level security;
revoke all on table retail.padron_lecturas from public, anon, authenticated, service_role;

-- La vigencia de una lectura: una sola cifra para quien anota (borra lo vencido) y quien revisa (el disparador).
create or replace function retail.fn_padron_lectura_vigencia()
returns interval
language sql
immutable
set search_path = pg_catalog
as $$ select interval '1 hour' $$;

comment on function retail.fn_padron_lectura_vigencia() is
  'Cuánto sirve una lectura del padrón para registrar o corregir una ficha (20261015133000): una hora.';
revoke all on function retail.fn_padron_lectura_vigencia() from public, anon, authenticated;

-- La huella: el tipo en minúsculas, el número sin espacios y el nombre en mayúsculas con espacios simples.
create or replace function retail.fn_huella_padron(p_tipo text, p_numero text, p_nombre text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(sha256(convert_to(
    lower(btrim(coalesce(p_tipo, ''))) || ':' || btrim(coalesce(p_numero, '')) || ':' ||
    upper(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g')), 'UTF8')), 'hex')
$$;

comment on function retail.fn_huella_padron(text, text, text) is
  'La huella de una lectura del padrón (20261015133000): sha-256 de «tipo:número:NOMBRE» (el nombre en mayúsculas y con espacios simples). Así padron_lecturas prueba que un nombre salió del padrón sin guardar el documento ni el nombre en claro.';
revoke all on function retail.fn_huella_padron(text, text, text) from public, anon, authenticated;

-- ---------- 2. Anotar una lectura (el servidor del ERP, con su llave de servicio) ----------
create or replace function retail.fn_anotar_lectura_padron(p_tipo text, p_numero text, p_nombre text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_tipo text := lower(btrim(coalesce(p_tipo, '')));
  v_numero text := btrim(coalesce(p_numero, ''));
  v_nombre text := nullif(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
begin
  if not ((v_tipo = 'dni' and v_numero ~ '^[0-9]{8}$') or (v_tipo = 'ruc' and v_numero ~ '^[0-9]{11}$')) then
    raise exception 'Una lectura del padrón es de un DNI de 8 dígitos o de un RUC de 11.'
      using errcode = '22023', hint = 'padron_documento_invalido', detail = 'documento';
  end if;
  if v_nombre is null or char_length(v_nombre) > 200 then
    raise exception 'Una lectura del padrón trae un nombre (hasta 200 caracteres).'
      using errcode = '22023', hint = 'padron_nombre_invalido', detail = 'nombre';
  end if;
  -- Lo vencido se va: una lectura solo sirve para registrar en la hora siguiente, y una huella vieja no le sirve a nadie.
  delete from retail.padron_lecturas where leida_en < now() - retail.fn_padron_lectura_vigencia();
  insert into retail.padron_lecturas (huella, leida_en)
  values (retail.fn_huella_padron(v_tipo, v_numero, v_nombre), now())
  on conflict (huella) do update set leida_en = excluded.leida_en;
end;
$$;

comment on function retail.fn_anotar_lectura_padron(text, text, text) is
  'Anota que el padrón (RENIEC o SUNAT) contestó este nombre para este DNI o RUC (20261015133000). La llama SOLO el servidor del ERP con la llave de servicio, justo después de consultar: /api/padron?para=ficha (Vender, Clientes, Editar ficha) y la página del cartel del Club. Con esa lectura, en la hora siguiente, la ficha acepta ese nombre (disparador fn_nombre_de_ficha_del_padron). Borra las lecturas vencidas.';
revoke all on function retail.fn_anotar_lectura_padron(text, text, text) from public, anon, authenticated;
grant execute on function retail.fn_anotar_lectura_padron(text, text, text) to service_role;

-- ---------- 3. Lo mismo, para la tienda online (su puerta angosta: solo funciones tienda_*) ----------
create or replace function retail.tienda_anotar_lectura_padron(p_dni text, p_nombre text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  perform retail.fn_anotar_lectura_padron('dni', p_dni, p_nombre);
end;
$$;

comment on function retail.tienda_anotar_lectura_padron(text, text) is
  'La tienda online anota que el padrón le dio este nombre para este DNI (20261015133000), justo antes de crear la cuenta con él (tienda_registrar_cuenta). El nombre es el que va a guardar (con mayúscula inicial). Solo tienda_web.';
revoke all on function retail.tienda_anotar_lectura_padron(text, text) from public, anon, authenticated;
grant execute on function retail.tienda_anotar_lectura_padron(text, text) to tienda_web;

-- ---------- 4. La regla, en la ficha ----------
create or replace function retail.fn_nombre_de_ficha_del_padron()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nombre text := nullif(regexp_replace(btrim(coalesce(new.nombre, '')), '\s+', ' ', 'g'), '');
begin
  -- Los dueños de la base (las pruebas, el SQL Editor, las migraciones, los trabajos programados) quedan fuera: igual pueden escribir
  -- la columna con un update directo. Todo lo que llega por la API (la web del ERP, el servidor del Club) o con el usuario de la
  -- tienda online cumple la regla.
  if session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  -- Sin nombre o sin documento no hay nada que comprobar (la regla es de dónde sale un nombre; una ficha anonimizada queda sin documento).
  if v_nombre is null or new.documento_numero is null then
    return new;
  end if;
  if new.documento_tipo in ('dni', 'ruc') then
    -- El nombre de un DNI (o un RUC) sale del padrón: tiene que ser una lectura anotada por un servidor en la última hora.
    if not exists (
      select 1 from retail.padron_lecturas l
       where l.huella = retail.fn_huella_padron(new.documento_tipo, new.documento_numero, v_nombre)
         and l.leida_en >= now() - retail.fn_padron_lectura_vigencia()
    ) then
      raise exception 'El nombre de un % sale del padrón y no se escribe a mano. Vuelve a consultarlo y guarda el nombre que trae.', upper(new.documento_tipo)
        using errcode = 'P0001', hint = 'nombre_sin_padron', detail = 'nombre';
    end if;
  elsif v_nombre ~ '[0-9]' then
    -- Carné de extranjería o pasaporte: el nombre se escribe tal cual está en el documento, y ninguno lleva números.
    raise exception 'El nombre no lleva números: escríbelo tal cual está en su documento.'
      using errcode = '22023', hint = 'nombre_con_numeros', detail = 'nombre';
  end if;
  return new;
end;
$$;

comment on function retail.fn_nombre_de_ficha_del_padron() is
  'El nombre de una ficha (Felipe 2026-10-15, 20261015133000): con DNI o RUC sale del padrón (una lectura de padron_lecturas de la última hora, anotada por un servidor), nunca escrito a mano → P0001 nombre_sin_padron; con carné o pasaporte se escribe tal cual, sin números → 22023 nombre_con_numeros. Solo cuando la ficha tiene documento y nombre, y solo al crearla o al cambiarle el nombre o el documento. No rige para el dueño de la base (postgres, supabase_admin: pruebas, SQL Editor, migraciones).';
revoke all on function retail.fn_nombre_de_ficha_del_padron() from public, anon, authenticated;

create or replace trigger clientas_nombre_del_padron_alta before insert on retail.clientas
  for each row
  when (new.nombre is not null and new.documento_numero is not null)
  execute function retail.fn_nombre_de_ficha_del_padron();

create or replace trigger clientas_nombre_del_padron_cambio before update of nombre, documento_tipo, documento_numero on retail.clientas
  for each row
  when (new.nombre is not null and new.documento_numero is not null
        and (new.nombre is distinct from old.nombre
             or new.documento_tipo is distinct from old.documento_tipo
             or new.documento_numero is distinct from old.documento_numero))
  execute function retail.fn_nombre_de_ficha_del_padron();

reset lock_timeout;

notify pgrst, 'reload schema';

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», el texto se pegó cortado o falta algo:
-- es seguro volver a pegarlo completo.
select '20261015133000 · el nombre de la ficha sale del padrón' as parte,
       case when to_regprocedure('retail.fn_anotar_lectura_padron(text,text,text)') is not null
             and to_regprocedure('retail.tienda_anotar_lectura_padron(text,text)') is not null
             and (select count(*) from pg_trigger
                   where tgrelid = 'retail.clientas'::regclass
                     and tgname in ('clientas_nombre_del_padron_alta', 'clientas_nombre_del_padron_cambio')) = 2
            then 'QUEDÓ BIEN' else 'FALTA ALGO: vuelve a pegar el archivo completo' end as estado;

-- ============================================================================
-- 20261014224000_tienda_cuentas_parte2_cuentas_web.sql — CAYLA V2 · Tienda online (ADR-0408), actividades 2 y 2b · PARTE 2 de 2
--
-- EL PROBLEMA. La tienda online pide cuenta para ver el catálogo y separar (maqueta v4, aprobada el 2026-10-14). La cuenta es
-- correo y contraseña, DNI, celular y cumpleaños; correo y DNI no se repiten, y al crearla la persona ya es miembro del Club
-- CAYLA (si ya lo era en tienda, su cuenta se une a su ficha). Las identidades viven en un proyecto de inicio de sesión
-- APARTE, solo de clientes (ADR-0408, decisión 2): el ERP no los conoce como usuarios. Lo que falta es el puente: qué usuario
-- de ese proyecto es qué ficha de `clientas`, y quién decide si se puede crear una cuenta. Y (actividad 2b, Felipe 2026-10-14)
-- que nadie cree una cuenta con un correo que no es suyo: el correo se confirma con un código de 6 cifras ANTES de que exista
-- la cuenta, y la cuenta pide «Soy mayor de 18 años» y ofrece «Avisos del Club por WhatsApp» (opcional).
--
-- QUÉ HACE
--   1. `retail.cuentas_web`: una por cliente. El id de su usuario en el proyecto de clientes (`usuario_web_id`), su ficha
--      (`clienta_id`), su correo normalizado, qué textos aceptó y cuándo. Correo, usuario y ficha únicos: como la ficha es
--      única por documento, no hay dos cuentas con el mismo DNI. RLS encendido y sin políticas: solo la leen y la escriben las
--      funciones de abajo (`security definer`).
--   2. `retail.cuentas_web_pendientes`: el correo que está confirmando su código (uno por correo). Guarda solo lo que hace falta
--      para los topes: el usuario invitado, cuántos códigos se mandaron y cuándo, cuándo vence el vigente, cuántos intentos lleva
--      y hasta cuándo está bloqueado. Ni DNI, ni nombre, ni celular: lo de la persona viaja recién con la cuenta.
--   3. Las funciones de la puerta de la tienda (rol `tienda_web`, ADR-0408 decisión 3), cada una cerrada a public, anon y
--      authenticated y validando ella misma todo lo que recibe:
--      (Felipe 2026-10-15: la tienda acepta también carné de extranjería y pasaporte, «como en las tiendas». Las tres que reciben un
--      documento llevan al final su tipo, `p_documento_tipo`: `dni` (por defecto), `carne_extranjeria` o `pasaporte`, y lo validan
--      y lo buscan con ESE tipo (`fn_documento_clienta`, las mismas reglas de la caja). Con carné o pasaporte el nombre se escribe
--      tal cual está en el documento: no viene del padrón. Los nombres del contrato (`dni_repetido`, `cuenta_dni_repetido`, detail
--      `dni`) dicen desde entonces «el documento de la cuenta», sea cual sea su tipo.)
--      · `tienda_consultar_correo(correo, ip_hash)` y `tienda_consultar_documento(numero, ip_hash, documento_hash, tipo)`: lo que la
--        página de registro dice mientras se escribe («ya hay una cuenta con este correo / DNI», «ya eras del club»). Cada
--        una cuenta un intento de CONSULTA en `club_intentos_registro` (`club_intento`, ADR-0288 G-10): 20 por ip y hora.
--      · `tienda_revisar_registro(correo, dni, celular, ip_hash, documento_hash)`: lo que el servidor de la tienda pregunta
--        ANTES de mandar el código. Cuenta un intento de REGISTRO (5 por ip, 3 por documento y 3 por celular, por hora) y dice
--        si el correo o el DNI ya tienen cuenta.
--      · `tienda_reservar_envio(correo, reenvio)`: ¿se puede mandar un código ahora? Una espera de 60 s entre uno y otro, 5 por
--        hora, nada mientras dure un bloqueo. Si se puede, lo anota (el código vence a los 30 minutos) y devuelve el usuario
--        invitado de antes. «Reenviar» solo sirve para un correo que ya pidió su código: al pedirlo se contó el intento de
--        registro, con sus topes por ip, documento y celular, así que nadie manda códigos a correos ajenos sin pasar por ellos.
--        De paso limpia lo que nadie terminó (pendientes sin moverse en más de un día).
--      · `tienda_anotar_invitado(correo, usuario_web_id)`: el usuario que el proyecto de clientes creó al invitar.
--      · `tienda_intento_de_codigo(correo)`: ¿se puede probar un código ahora? Cada intento cuenta; con el quinto queda
--        bloqueado 15 minutos (si era el bueno, la cuenta se crea igual). Dice si venció; un código con sus cinco intentos
--        gastados tampoco sirve: hay que pedir otro.
--      · `tienda_registrar_cuenta(usuario_web_id, …)`: crea la cuenta y deja a la persona en el Club, todo o nada. Exige el
--        correo pendiente de ESE usuario (sin código no hay cuenta), la casilla de los 18 años y, si marcó los avisos, anota el
--        permiso de publicidad del Club con su origen web. Al crearla, el pendiente se va.
--      · `tienda_mi_cuenta(usuario_web_id)`: lo que la página «Mi cuenta» muestra (o null si ese usuario no tiene cuenta).
--      · `tienda_club_beneficios()`: el % del cumpleaños y la escala del vale de aniversario vigentes, para los términos.
--      · `tienda_casilla_whatsapp()`: el texto aprobado de la casilla de los avisos (`casilla_publicidad`, el del cartel) y su
--        versión, para mostrarlo tal cual y anotar cuál aceptó.
--
-- EL ORDEN SEGURO (principio 9; lo hace el servidor de la tienda, `apps/tienda/app/acciones/cuenta.ts`):
--   (1) «Mandarme el código»: la base revisa (`tienda_revisar_registro`) → `tienda_reservar_envio` → el proyecto de clientes
--   INVITA el correo (crea un usuario sin contraseña, que no puede entrar, y le manda el código) → `tienda_anotar_invitado`.
--   «Pedir otro código» repite desde `tienda_reservar_envio` (con reenvio = true).
--   (2) «Crear mi cuenta» con el código: `tienda_intento_de_codigo` → el proyecto de clientes lo verifica (un código de otro
--   correo no sirve; uno nuevo anula el anterior) → se pone la contraseña → `tienda_registrar_cuenta`. Si la base dice que no, el
--   servidor borra el usuario (salvo que la base diga que ya tiene cuenta o no conteste). Una invitación sin terminar no deja el
--   correo tomado: pedir otro código para ese correo invita de nuevo al mismo usuario, y el código nuevo le llega solo al dueño
--   del correo; si ese usuario ya estaba confirmado sin cuenta (un intento roto), el servidor lo borra y lo invita de nuevo.
--
-- DECIDÍ: los intentos usan el MISMO `club_intento` del cartel (sus topes y su tabla), con las huellas que calcula el servidor
--   de la tienda con una sal propia (`TIENDA_INTENTOS_SAL`): la ip y el documento nunca llegan en claro a la tabla. Como la sal
--   no es la del ERP, la misma ip cuenta aparte en la web y en el cartel.
-- DECIDÍ: una función que solo CONSULTA, REVISA o RESERVA nunca lanza un error de negocio después de contar: devuelve
--   {estado}. Un error desharía también lo anotado, y probar correos, DNI o códigos ajenos saldría gratis.
-- DECIDÍ: el código lo genera y lo verifica el proyecto de clientes (su invitación por correo); los topes, aquí. Ese proyecto
--   no frena los intentos equivocados ni los reenvíos de una invitación (medido el 2026-10-14 en local: 8 códigos malos
--   seguidos, ni un freno), y la tienda no puede contar sola (hay varios servidores). Si la base no contesta, no se manda
--   código ni se prueba ninguno: se degrada sin abrir la puerta.
-- DECIDÍ: si el DNI ya es de una ficha, la cuenta se une a ella sin pisar lo que la ficha tiene: solo se completa lo vacío
--   (el celular, también si el que tenía no es un celular válido; el cumpleaños; el correo de contacto). La excepción es el
--   nombre del padrón, que reemplaza al que había (la regla G-4 del cartel: es el nombre oficial). El código prueba el correo,
--   no el DNI: quien escribe un DNI ajeno no puede cambiarle el celular ni el cumpleaños a esa persona.
-- DECIDÍ: con el nombre escrito a mano (el padrón no respondió o no encontró el DNI), sobre una ficha que ya existe no se
--   reemplaza su nombre: solo se completa uno vacío (como el carné en el cartel).
-- DECIDÍ: el cumpleaños se guarda como lo guarda el Club: día y mes obligatorios, año opcional (`cumple_dia`, `cumple_mes`,
--   `cumple_anio`). El 29 de febrero vale sin año. El Club es para mayores de 18 años (sus términos, punto 1, y la política de
--   privacidad, 2.10): la casilla «Soy mayor de 18 años» es obligatoria (`p_mayor_de_edad`), y con el año, se comprueba
--   (`cuenta_menor`).
-- DECIDÍ: los avisos por WhatsApp se anotan como en el cartel: un permiso `publicidad_whatsapp` que ella otorga (medio
--   `tienda_web`, sin quién lo registró) citando la versión vigente de `casilla_publicidad` que leyó (si cambió mientras se
--   registraba, `cuenta_texto_cambio`), y `clientas.publicidad_desde`, que es lo que miran los avisos del Club. Solo para el
--   celular que ella escribió: si su ficha ya tenía OTRO celular (que no se pisa), los avisos quedan sin activar y la tienda se
--   lo dice (`avisos_whatsapp = celular_distinto`). Con la misma casilla ya aceptada, no se anota otra fila.
-- DECIDÍ: una ficha nueva nace `registro_origen = 'web'`, socia desde ahora y con su código (`fn_club_codigo_nuevo`), sin
--   tienda del cartel. Sus compras anteriores con ese DNI pasan a su ficha (CL-27, como en caja y en el cartel). Una ficha
--   ARCHIVADA no se reactiva desde la web (`cuenta_archivada`), igual que en el cartel: archivar es una decisión de la tienda.
-- DECIDÍ: lo que aceptó de la web queda en `cuentas_web.textos_aceptados` (la versión de la privacidad y los términos de la
--   web, hoy un borrador) con su hora. El «sí» al club todavía no se anota en `club_permisos`: los textos de la web son un
--   borrador que CAYLA revisa (Felipe, 2026-10-14: sin cambios por ahora).
-- DESCARTÉ: guardar en el pendiente el DNI, el nombre o el celular de quien todavía no confirmó su correo (datos personales de
--   alguien que puede no volver nunca); viajan recién al crear la cuenta, y la base los vuelve a revisar todos.
-- DESCARTÉ: que la tienda lea `club_intento` o `clientas` directo: `tienda_web` no tiene permiso sobre ninguna tabla ni
--   función fuera de `tienda_*` (lo vigila pruebas:tienda-puerta).
--
-- SE ROMPE SI: alguien crea usuarios en el proyecto de clientes por la puerta pública (está cerrada: `enable_signup = false`)
--   o fuera de este orden; o una función nueva de la tienda escribe en `clientas` sin estas reglas.
--
-- PRODUCCIÓN. NO está aplicada. Se pega DESPUÉS de la PARTE 1, sola en el SQL Editor; se puede pegar dos veces. Crea tablas
-- nuevas y funciones: no toma en exclusiva ninguna tabla en uso (las llaves foráneas a `clientas` la toman en modo compartido)
-- y no tiene políticas. Necesita el rol `tienda_web` (20261014220000).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. las tablas ----------
create table if not exists retail.cuentas_web (
  id               uuid primary key default gen_random_uuid(),
  usuario_web_id   uuid not null,
  clienta_id       uuid not null references retail.clientas (id),
  correo           text not null,
  textos_aceptados text not null,
  aceptados_en     timestamptz not null default now(),
  creada_en        timestamptz not null default now(),
  constraint cuentas_web_usuario_unico unique (usuario_web_id),
  constraint cuentas_web_clienta_unica unique (clienta_id),
  constraint cuentas_web_correo_unico unique (correo),
  constraint cuentas_web_correo_formato check (correo = lower(btrim(correo)) and char_length(correo) <= 254
                                               and correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint cuentas_web_textos_validos check (textos_aceptados ~ '^[a-z0-9-]{1,60}$')
);

comment on table retail.cuentas_web is
  'Las cuentas de la tienda online (ADR-0408): una por cliente. usuario_web_id es el id de su usuario en el proyecto de inicio de sesión de CLIENTES (otro proyecto, no el del ERP: sin llave foránea). Una por ficha de clientas (y la ficha es única por documento: un DNI, una cuenta) y una por correo. La escribe solo tienda_registrar_cuenta, después de que la persona confirmó su correo con un código. RLS sin políticas: la leen las funciones tienda_*.';
comment on column retail.cuentas_web.usuario_web_id is
  'El id del usuario en el proyecto de inicio de sesión de los clientes (ADR-0408, decisión 2). El ERP no lo conoce como usuario suyo.';
comment on column retail.cuentas_web.correo is
  'El correo con el que entra, en minúsculas y sin espacios: el mismo de su usuario en el proyecto de clientes. Puede no ser el correo de contacto de la ficha (clientas.correo).';
comment on column retail.cuentas_web.textos_aceptados is
  'Qué versión de la política de privacidad y los términos de la tienda online aceptó al crear la cuenta (hoy «borrador-2026-10-14», un borrador que revisa CAYLA).';

alter table retail.cuentas_web enable row level security;
revoke all on retail.cuentas_web from public, anon, authenticated;

create table if not exists retail.cuentas_web_pendientes (
  correo          text primary key,
  usuario_web_id  uuid,
  envios          integer not null default 0,
  primer_envio_en timestamptz,
  ultimo_envio_en timestamptz,
  vence_en        timestamptz,
  intentos        integer not null default 0,
  bloqueado_hasta timestamptz,
  creado_en       timestamptz not null default now(),
  constraint cuentas_web_pendientes_correo_formato check (correo = lower(btrim(correo)) and char_length(correo) <= 254
                                                          and correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint cuentas_web_pendientes_cuentas_validas check (envios >= 0 and intentos >= 0)
);

comment on table retail.cuentas_web_pendientes is
  'Tienda online (ADR-0408, actividad 2b): el correo que está confirmando su código para crear la cuenta, uno por correo. Solo los topes: el usuario que el proyecto de clientes invitó (sin contraseña, no puede entrar), los códigos mandados (60 s entre uno y otro, 5 por hora), cuándo vence el vigente (30 min), los intentos (con el quinto, 15 min de bloqueo) y el bloqueo. Sin DNI, nombre ni celular. Se va al crear la cuenta; los que llevan más de un día sin moverse se limpian solos al pedir otro código. RLS sin políticas: la leen y la escriben las funciones tienda_*.';

alter table retail.cuentas_web_pendientes enable row level security;
revoke all on retail.cuentas_web_pendientes from public, anon, authenticated;

-- ---------- 2. el correo de una cuenta, normalizado (null si no es un correo) ----------
create or replace function retail.fn_cuenta_web_correo(p_correo text)
returns text
language sql
immutable
set search_path = retail, public
as $$
  select case
    when v.c <> '' and char_length(v.c) <= 254 and v.c ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then v.c
  end
  from (select lower(btrim(coalesce(p_correo, ''))) as c) v;
$$;
comment on function retail.fn_cuenta_web_correo(text) is
  'Tienda online (ADR-0408): el correo de una cuenta en minúsculas y sin espacios, o null si no tiene forma de correo. Ayudante de las funciones tienda_*.';
revoke all on function retail.fn_cuenta_web_correo(text) from public, anon, authenticated;

-- ---------- 3. lo que la página de registro dice mientras se escribe ----------
create or replace function retail.tienda_consultar_correo(p_correo text, p_ip_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
begin
  if v_correo is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  if not retail.club_intento('consulta', p_ip_hash, null, null) then
    return jsonb_build_object('estado', 'limite');
  end if;
  return jsonb_build_object('estado',
    case when exists (select 1 from retail.cuentas_web w where w.correo = v_correo) then 'repetido' else 'libre' end);
end;
$$;
comment on function retail.tienda_consultar_correo(text, text) is
  'Tienda online (ADR-0408): ¿ya hay una cuenta con este correo? {estado: invalido | limite | repetido | libre}. Cuenta un intento de consulta (club_intento, 20 por ip y hora). Solo la llama tienda_web.';

create or replace function retail.tienda_consultar_documento(p_documento_numero text, p_ip_hash text, p_documento_hash text,
                                                             p_documento_tipo text default 'dni')
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_tipo text := lower(btrim(coalesce(p_documento_tipo, 'dni')));
  v_numero text;
  v_ficha uuid;
  v_archivada boolean;
  v_del_club boolean;
begin
  begin
    v_numero := retail.fn_documento_clienta(v_tipo, p_documento_numero);
  exception when sqlstate '22023' then
    v_numero := null;
  end;
  if v_numero is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  if not retail.club_intento('consulta', p_ip_hash, p_documento_hash, null) then
    return jsonb_build_object('estado', 'limite');
  end if;
  for v_ficha, v_archivada, v_del_club in
    select c.id, c.archivada_en is not null, c.club_desde is not null
      from retail.clientas c
     where c.documento_tipo = v_tipo and c.documento_numero = v_numero
  loop
    exit;
  end loop;
  if v_ficha is not null and exists (select 1 from retail.cuentas_web w where w.clienta_id = v_ficha) then
    return jsonb_build_object('estado', 'repetido');
  end if;
  if coalesce(v_archivada, false) then
    return jsonb_build_object('estado', 'archivada');
  end if;
  return jsonb_build_object('estado', 'libre', 'del_club', coalesce(v_del_club, false));
end;
$$;
comment on function retail.tienda_consultar_documento(text, text, text, text) is
  'Tienda online (ADR-0408): ¿este DNI ya tiene cuenta, o es de una ficha archivada? {estado: invalido | limite | repetido | archivada | libre, del_club}. del_club: la ficha de ese DNI ya es del Club (la cuenta se unirá a ella). Cuenta un intento de consulta. Solo la llama tienda_web.';

-- ---------- 4. lo que el servidor revisa antes de crear el usuario de inicio de sesión ----------
create or replace function retail.tienda_revisar_registro(p_correo text, p_documento_numero text, p_celular text, p_ip_hash text,
                                                          p_documento_hash text, p_documento_tipo text default 'dni')
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
  v_tipo text := lower(btrim(coalesce(p_documento_tipo, 'dni')));
  v_numero text;
  v_celular text := retail.fn_celular_normalizado(p_celular);
  v_ficha uuid;
  v_archivada boolean;
begin
  if v_correo is null then
    return jsonb_build_object('estado', 'invalido', 'campo', 'correo');
  end if;
  begin
    v_numero := retail.fn_documento_clienta(v_tipo, p_documento_numero);
  exception when sqlstate '22023' then
    v_numero := null;
  end;
  if v_numero is null then
    return jsonb_build_object('estado', 'invalido', 'campo', 'dni');
  end if;
  if v_celular is null or v_celular !~ '^9[0-9]{8}$' then
    return jsonb_build_object('estado', 'invalido', 'campo', 'celular');
  end if;
  if not retail.club_intento('registro', p_ip_hash, p_documento_hash, v_celular) then
    return jsonb_build_object('estado', 'limite');
  end if;
  if exists (select 1 from retail.cuentas_web w where w.correo = v_correo) then
    return jsonb_build_object('estado', 'correo_repetido');
  end if;
  for v_ficha, v_archivada in
    select c.id, c.archivada_en is not null
      from retail.clientas c
     where c.documento_tipo = v_tipo and c.documento_numero = v_numero
  loop
    exit;
  end loop;
  if v_ficha is not null and exists (select 1 from retail.cuentas_web w where w.clienta_id = v_ficha) then
    return jsonb_build_object('estado', 'dni_repetido');
  end if;
  if coalesce(v_archivada, false) then
    return jsonb_build_object('estado', 'archivada');
  end if;
  return jsonb_build_object('estado', 'ok');
end;
$$;
comment on function retail.tienda_revisar_registro(text, text, text, text, text, text) is
  'Tienda online (ADR-0408): lo que el servidor de la tienda pregunta ANTES de crear el usuario en el proyecto de clientes. {estado: invalido (campo) | limite | correo_repetido | dni_repetido | archivada | ok}. Cuenta un intento de registro (club_intento: 5 por ip, 3 por documento y 3 por celular, por hora). No escribe nada más. Solo la llama tienda_web.';

-- ---------- 4b. el código que confirma el correo (actividad 2b) ----------
-- Los topes, en un solo lugar: 60 s entre un código y otro, 5 por hora, cada código vence a los 30 minutos y admite 5
-- intentos; con el quinto, 15 minutos de bloqueo. Lo que lleva un día sin moverse se limpia solo.
create or replace function retail.tienda_reservar_envio(p_correo text, p_reenvio boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
  v_ahora timestamptz := now();
  v_limpiar jsonb := '[]'::jsonb;
  v_hay boolean := false;
  v_usuario uuid;
  v_envios integer;
  v_primer timestamptz;
  v_ultimo timestamptz;
  v_bloqueado timestamptz;
  v_creado timestamptz;
begin
  if v_correo is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  -- Lo que nadie terminó se va solo: los pendientes de OTROS correos sin moverse en más de un día (su último código venció
  -- hace mucho; a lo más 20 por vez). Sus usuarios invitados los borra el servidor, después de comprobar en el proyecto de
  -- clientes que no tienen cuenta.
  with viejos as (
    delete from retail.cuentas_web_pendientes p
     where p.correo in (select q.correo from retail.cuentas_web_pendientes q
                         where coalesce(q.ultimo_envio_en, q.creado_en) < v_ahora - interval '1 day' and q.correo <> v_correo
                         order by coalesce(q.ultimo_envio_en, q.creado_en) limit 20)
    returning p.usuario_web_id
  )
  select coalesce(jsonb_agg(to_jsonb(v.usuario_web_id)) filter (where v.usuario_web_id is not null), '[]'::jsonb)
    into v_limpiar
    from viejos v;

  if exists (select 1 from retail.cuentas_web w where w.correo = v_correo) then
    return jsonb_build_object('estado', 'correo_repetido', 'limpiar', v_limpiar);
  end if;
  -- Reenviar solo sirve para un correo que ya pidió su código (y al pedirlo pasó por los topes de tienda_revisar_registro).
  if coalesce(p_reenvio, false) and not exists (
       select 1 from retail.cuentas_web_pendientes p
        where p.correo = v_correo and p.ultimo_envio_en is not null and p.ultimo_envio_en >= v_ahora - interval '1 day') then
    return jsonb_build_object('estado', 'sin_codigo', 'limpiar', v_limpiar);
  end if;

  insert into retail.cuentas_web_pendientes (correo) values (v_correo) on conflict (correo) do nothing;
  for v_usuario, v_envios, v_primer, v_ultimo, v_bloqueado, v_creado in
    select p.usuario_web_id, p.envios, p.primer_envio_en, p.ultimo_envio_en, p.bloqueado_hasta, p.creado_en
      from retail.cuentas_web_pendientes p
     where p.correo = v_correo
       for update
  loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    return jsonb_build_object('estado', 'invalido', 'limpiar', v_limpiar);
  end if;
  -- El pendiente de este mismo correo sin moverse en más de un día empieza de cero (conserva su usuario: se lo invita otra vez).
  if coalesce(v_ultimo, v_creado) < v_ahora - interval '1 day' then
    update retail.cuentas_web_pendientes p
       set envios = 0, primer_envio_en = null, ultimo_envio_en = null, vence_en = null, intentos = 0, bloqueado_hasta = null,
           creado_en = v_ahora
     where p.correo = v_correo;
    v_envios := 0;
    v_primer := null;
    v_ultimo := null;
    v_bloqueado := null;
  end if;

  if v_bloqueado > v_ahora then
    return jsonb_build_object('estado', 'bloqueado', 'minutos', ceil(extract(epoch from v_bloqueado - v_ahora) / 60)::integer,
                              'limpiar', v_limpiar);
  end if;
  if v_ultimo > v_ahora - interval '60 seconds' then
    return jsonb_build_object('estado', 'esperar',
                              'segundos', ceil(extract(epoch from v_ultimo + interval '60 seconds' - v_ahora))::integer,
                              'limpiar', v_limpiar);
  end if;
  if v_primer > v_ahora - interval '1 hour' and v_envios >= 5 then
    return jsonb_build_object('estado', 'limite',
                              'minutos', ceil(extract(epoch from v_primer + interval '1 hour' - v_ahora) / 60)::integer,
                              'limpiar', v_limpiar);
  end if;

  update retail.cuentas_web_pendientes p set
    primer_envio_en = case when v_primer is null or v_primer <= v_ahora - interval '1 hour' then v_ahora else v_primer end,
    envios = case when v_primer is null or v_primer <= v_ahora - interval '1 hour' then 1 else v_envios + 1 end,
    ultimo_envio_en = v_ahora,
    vence_en = v_ahora + interval '30 minutes',
    intentos = 0,
    bloqueado_hasta = null
  where p.correo = v_correo;
  return jsonb_build_object('estado', 'enviar', 'usuario_web_id', v_usuario, 'limpiar', v_limpiar);
end;
$$;
comment on function retail.tienda_reservar_envio(text, boolean) is
  'Tienda online (ADR-0408, actividad 2b): ¿se puede mandar ahora un código a este correo? {estado: invalido | correo_repetido | sin_codigo (un reenvío de un correo que no pidió su código en el último día) | bloqueado (minutos) | esperar (segundos) | limite (minutos) | enviar (usuario_web_id del invitado de antes), limpiar: [usuarios invitados de pendientes sin moverse en más de un día, que el servidor borra si no tienen cuenta]}. Con enviar, lo anota: el código vence a los 30 minutos y los intentos vuelven a cero. Solo la llama tienda_web.';

create or replace function retail.tienda_anotar_invitado(p_correo text, p_usuario_web_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
begin
  if p_usuario_web_id is null then
    return false;
  end if;
  update retail.cuentas_web_pendientes p
     set usuario_web_id = p_usuario_web_id
   where p.correo = retail.fn_cuenta_web_correo(p_correo);
  return found;
end;
$$;
comment on function retail.tienda_anotar_invitado(text, uuid) is
  'Tienda online (ADR-0408, actividad 2b): el usuario que el proyecto de clientes creó (o reusó) al invitar a ese correo. Devuelve si había un pendiente. Solo la llama tienda_web.';

create or replace function retail.tienda_intento_de_codigo(p_correo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
  v_ahora timestamptz := now();
  v_hay boolean := false;
  v_intentos integer;
  v_vence timestamptz;
  v_bloqueado timestamptz;
begin
  if v_correo is null then
    return jsonb_build_object('estado', 'sin_codigo');
  end if;
  for v_intentos, v_vence, v_bloqueado in
    select p.intentos, p.vence_en, p.bloqueado_hasta
      from retail.cuentas_web_pendientes p
     where p.correo = v_correo
       for update
  loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    return jsonb_build_object('estado', 'sin_codigo');
  end if;
  if v_bloqueado > v_ahora then
    return jsonb_build_object('estado', 'bloqueado', 'minutos', ceil(extract(epoch from v_bloqueado - v_ahora) / 60)::integer);
  end if;
  -- Vencido, o con sus cinco intentos gastados (pasado el bloqueo): ese código ya no sirve, hay que pedir otro.
  if v_vence is null or v_vence <= v_ahora or v_intentos >= 5 then
    return jsonb_build_object('estado', 'vencido');
  end if;
  -- Cada intento cuenta ANTES de probarse (dos pestañas a la vez no se llevan uno de más). El quinto deja puesto el bloqueo:
  -- si era el bueno, la cuenta se crea igual y el pendiente se va; si no, ya no se prueba otro ni se pide otro código en 15 min.
  update retail.cuentas_web_pendientes p
     set intentos = v_intentos + 1,
         bloqueado_hasta = case when v_intentos + 1 >= 5 then v_ahora + interval '15 minutes' else p.bloqueado_hasta end
   where p.correo = v_correo;
  return jsonb_build_object('estado', 'puede', 'quedan', 5 - (v_intentos + 1));
end;
$$;
comment on function retail.tienda_intento_de_codigo(text) is
  'Tienda online (ADR-0408, actividad 2b): ¿se puede probar ahora un código de este correo? {estado: sin_codigo | bloqueado (minutos) | vencido (pasaron sus 30 minutos o gastó sus 5 intentos) | puede (quedan)}. Cada intento cuenta antes de probarse; con el quinto queda un bloqueo de 15 minutos. Solo la llama tienda_web.';

-- ---------- 5. crear la cuenta y dejar a la persona en el Club ----------
-- La firma de la actividad 2 (11 parámetros) nunca llegó a producción: se reemplaza por la que pide la casilla de los 18
-- años, los avisos y la versión de la casilla. `create or replace` con otros parámetros crearía una segunda función.
drop function if exists retail.tienda_registrar_cuenta(uuid, text, text, text, boolean, text, integer, integer, integer, boolean, text);

create or replace function retail.tienda_registrar_cuenta(
  p_usuario_web_id uuid,
  p_correo text,
  p_documento_numero text,
  p_nombre text,
  p_nombre_del_padron boolean,
  p_celular text,
  p_cumple_dia integer,
  p_cumple_mes integer,
  p_cumple_anio integer,
  p_acepta boolean,
  p_mayor_de_edad boolean,
  p_avisos_whatsapp boolean,
  p_casilla_version integer,
  p_textos text,
  p_documento_tipo text default 'dni'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_ahora timestamptz := now();
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
  v_tipo text := lower(btrim(coalesce(p_documento_tipo, 'dni')));
  v_numero text;
  v_nombre text := nullif(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_del_padron boolean := coalesce(p_nombre_del_padron, false);
  v_avisos boolean := coalesce(p_avisos_whatsapp, false);
  v_celular text;
  v_textos text := btrim(coalesce(p_textos, ''));
  v_casilla integer;
  v_nacimiento date;
  v_id uuid;
  v_nueva boolean := false;
  v_archivada boolean;
  v_club_desde timestamptz;
  v_codigo text;
  v_nombre_actual text;
  v_nombre_final text;
  v_ligadas integer := 0;
  v_restriccion text;
  v_telefono_ficha text;
  v_publicidad_desde timestamptz;
  v_estado_avisos text := 'no';
begin
  -- 1. Lo que llega, revisado aquí (la página y el servidor revisan lo mismo, pero quien decide es la base).
  if p_usuario_web_id is null then
    raise exception 'Falta el usuario de la cuenta.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'usuario';
  end if;
  if v_correo is null then
    raise exception 'Revisa tu correo.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'correo';
  end if;
  begin
    v_numero := retail.fn_documento_clienta(v_tipo, p_documento_numero);
  exception when sqlstate '22023' then
    v_numero := null;
  end;
  if v_numero is null then
    raise exception '%', case v_tipo when 'dni' then 'El DNI tiene 8 dígitos.'
                             else 'El documento tiene de 6 a 12 letras o números, sin guiones.' end
      using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'dni';
  end if;
  if v_nombre is not null and char_length(v_nombre) > 200 then
    raise exception 'El nombre es demasiado largo.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'nombre';
  end if;
  -- Carné de extranjería o pasaporte (Felipe 2026-10-15): el nombre se escribe tal cual está en el documento; no viene del padrón.
  if v_del_padron and v_tipo <> 'dni' then
    raise exception 'Con carné de extranjería o pasaporte el nombre se escribe tal cual está en el documento.'
      using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'nombre';
  end if;
  if v_del_padron and v_nombre is null then
    raise exception 'Falta el nombre del padrón.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'nombre';
  end if;
  begin
    v_celular := retail.fn_exigir_celular(p_celular);
  exception when sqlstate '22023' then
    raise exception 'El celular tiene 9 dígitos y empieza en 9.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'celular';
  end;
  -- El cumpleaños: día y mes obligatorios; el año, opcional. Sin año, el 29 de febrero vale (se mide contra un año bisiesto).
  if p_cumple_dia is null or p_cumple_mes is null or p_cumple_mes not between 1 and 12 or p_cumple_dia not between 1 and 31
     or (p_cumple_anio is not null and (p_cumple_anio < 1900 or p_cumple_anio > extract(year from v_hoy)::integer)) then
    raise exception 'Revisa tu cumpleaños.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'cumple';
  end if;
  begin
    v_nacimiento := make_date(coalesce(p_cumple_anio, 2000), p_cumple_mes, p_cumple_dia);
  exception when others then
    raise exception 'Revisa tu cumpleaños.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'cumple';
  end;
  -- Los 18 años: la casilla es obligatoria (lo que ella declara), y con el año, además, se comprueba.
  if not coalesce(p_mayor_de_edad, false) then
    raise exception 'Confirma que eres mayor de 18 años.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'mayor';
  end if;
  if p_cumple_anio is not null and (v_nacimiento + interval '18 years')::date > v_hoy then
    raise exception 'El Club CAYLA es para mayores de 18 años.' using errcode = 'P0001', hint = 'cuenta_menor', detail = 'cumple';
  end if;
  if not coalesce(p_acepta, false) then
    raise exception 'Para crear tu cuenta, acepta la política de privacidad y los términos del club.'
      using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'acepta';
  end if;
  if v_textos !~ '^[a-z0-9-]{1,60}$' then
    raise exception 'Falta la versión de los textos que aceptó.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'textos';
  end if;
  -- Los avisos por WhatsApp citan el texto que ella leyó: tiene que ser el vigente.
  if v_avisos then
    v_casilla := (select max(t.version) from retail.club_textos t where t.tipo = 'casilla_publicidad');
    if v_casilla is null then
      raise exception 'Todavía no está publicado el texto de los avisos.' using errcode = 'P0001', hint = 'cuenta_sin_texto', detail = 'avisos';
    end if;
    if p_casilla_version is distinct from v_casilla then
      raise exception 'El texto de los avisos cambió mientras creabas tu cuenta: vuelve a leerlo.'
        using errcode = 'P0001', hint = 'cuenta_texto_cambio', detail = 'avisos';
    end if;
  end if;

  -- 2. Sin código no hay cuenta: tiene que estar el correo pendiente de ESTE usuario, con al menos un código probado (el
  --    servidor llama aquí solo después de que el proyecto de clientes dijo que el código era el bueno).
  if not exists (select 1 from retail.cuentas_web_pendientes p
                  where p.correo = v_correo and p.usuario_web_id = p_usuario_web_id and p.intentos >= 1) then
    raise exception 'Primero confirma tu correo con el código que te mandamos.' using errcode = 'P0001', hint = 'cuenta_sin_codigo', detail = 'codigo';
  end if;

  -- 3. El correo y el usuario, libres (las restricciones únicas de abajo cierran la carrera; esto da el mensaje claro).
  if exists (select 1 from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id) then
    raise exception 'Ese usuario ya tiene cuenta.' using errcode = 'P0001', hint = 'cuenta_ya_existe';
  end if;
  if exists (select 1 from retail.cuentas_web w where w.correo = v_correo) then
    raise exception 'Ya hay una cuenta con este correo.' using errcode = 'P0001', hint = 'cuenta_correo_repetido', detail = 'correo';
  end if;

  -- 4. La ficha, por DNI, tomada (`for update`): dos registros del mismo DNI a la vez hacen fila aquí. Si no existe, se crea;
  --    si otra pestaña la creó en este instante, `do nothing` no devuelve nada y se toma la que quedó.
  for i in 1..2 loop
    v_id := null;
    for v_id, v_archivada, v_club_desde, v_codigo, v_nombre_actual in
      select c.id, c.archivada_en is not null, c.club_desde, c.codigo_club, c.nombre
        from retail.clientas c
       where c.documento_tipo = v_tipo and c.documento_numero = v_numero
         for update
    loop
      exit;
    end loop;
    exit when v_id is not null;

    if v_nombre is null then
      raise exception 'Escribe tus nombres y apellidos.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'nombre';
    end if;
    v_codigo := retail.fn_club_codigo_nuevo();
    insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes,
                                 cumple_anio, correo, registro_origen, created_por, club_desde, codigo_club)
    values (v_tipo, v_numero, v_nombre, v_celular, p_cumple_dia::smallint, p_cumple_mes::smallint, p_cumple_anio::smallint,
            v_correo, 'web', null, v_ahora, v_codigo)
    on conflict (documento_tipo, documento_numero) where documento_numero is not null do nothing
    returning id into v_id;
    if v_id is not null then
      v_nueva := true;
      v_nombre_final := v_nombre;
      v_club_desde := null;
      -- CL-27: sus compras anteriores con ese documento pasan a su ficha (como en caja y en el cartel).
      v_ligadas := retail.fn_ligar_ventas_por_documento(v_id, v_tipo, v_numero);
      exit;
    end if;
  end loop;
  if v_id is null then
    raise exception 'No se pudo tomar la ficha de ese DNI.' using errcode = 'P0001', hint = 'cuenta_reintentar';
  end if;

  if not v_nueva then
    -- Archivada (sin anonimizar): la web no la reactiva; en caja, sí.
    if v_archivada then
      raise exception 'Para crear tu cuenta necesitamos revisar tus datos en tienda.' using errcode = 'P0001', hint = 'cuenta_archivada', detail = 'dni';
    end if;
    if exists (select 1 from retail.cuentas_web w where w.clienta_id = v_id) then
      raise exception 'Ya hay una cuenta con este DNI.' using errcode = 'P0001', hint = 'cuenta_dni_repetido', detail = 'dni';
    end if;
    -- El nombre del padrón reemplaza al que había (G-4); el escrito a mano solo completa uno vacío.
    v_nombre_final := case when v_del_padron then v_nombre else coalesce(nullif(btrim(v_nombre_actual), ''), v_nombre) end;
    if v_nombre_final is null then
      raise exception 'Escribe tus nombres y apellidos.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'nombre';
    end if;
    if v_club_desde is null then
      v_codigo := retail.fn_club_codigo_nuevo();
    end if;
    -- Lo que la ficha ya tiene no se pisa: solo se completa lo vacío.
    update retail.clientas c set
      nombre = v_nombre_final,
      telefono_whatsapp = case when c.telefono_whatsapp is null or c.telefono_whatsapp !~ '^9[0-9]{8}$' then v_celular
                               else c.telefono_whatsapp end,
      cumple_anio = case when c.cumple_dia is null or c.cumple_mes is null then p_cumple_anio::smallint
                         when c.cumple_anio is null and c.cumple_dia = p_cumple_dia and c.cumple_mes = p_cumple_mes
                           then p_cumple_anio::smallint
                         else c.cumple_anio end,
      cumple_dia = case when c.cumple_dia is null or c.cumple_mes is null then p_cumple_dia::smallint else c.cumple_dia end,
      cumple_mes = case when c.cumple_dia is null or c.cumple_mes is null then p_cumple_mes::smallint else c.cumple_mes end,
      correo = coalesce(c.correo, v_correo),
      club_desde = coalesce(c.club_desde, v_ahora),
      codigo_club = coalesce(c.codigo_club, v_codigo)
    where c.id = v_id;
  end if;

  -- 5. La cuenta. Las tres restricciones únicas cierran cualquier carrera que se haya escapado de lo de arriba.
  begin
    insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados, aceptados_en, creada_en)
    values (p_usuario_web_id, v_id, v_correo, v_textos, v_ahora, v_ahora);
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'cuentas_web_correo_unico' then
      raise exception 'Ya hay una cuenta con este correo.' using errcode = 'P0001', hint = 'cuenta_correo_repetido', detail = 'correo';
    elsif v_restriccion = 'cuentas_web_clienta_unica' then
      raise exception 'Ya hay una cuenta con este DNI.' using errcode = 'P0001', hint = 'cuenta_dni_repetido', detail = 'dni';
    end if;
    raise exception 'Ese usuario ya tiene cuenta.' using errcode = 'P0001', hint = 'cuenta_ya_existe';
  end;

  -- 6. Los avisos del Club por WhatsApp: el permiso de publicidad que ELLA otorga marcando la casilla (medio tienda_web, sin
  --    quién lo registró), citando el texto que leyó, y `publicidad_desde`, que es lo que miran los avisos del Club. Solo para
  --    el celular que escribió: si la ficha ya tenía otro (que no se pisa), quedan sin activar y la tienda se lo dice.
  if v_avisos then
    v_telefono_ficha := (select c.telefono_whatsapp from retail.clientas c where c.id = v_id);
    v_publicidad_desde := (select c.publicidad_desde from retail.clientas c where c.id = v_id);
    if v_telefono_ficha is distinct from v_celular then
      v_estado_avisos := 'celular_distinto';
    else
      if v_publicidad_desde is null
         or not exists (select 1 from retail.club_permisos pp
                         where pp.clienta_id = v_id and pp.finalidad = 'publicidad_whatsapp' and pp.accion = 'otorga'
                           and pp.texto_tipo = 'casilla_publicidad' and pp.texto_version = v_casilla) then
        insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, ubicacion_id, nota)
        values (v_id, 'publicidad_whatsapp', 'otorga', 'tienda_web', 'casilla_publicidad', v_casilla, null,
                case when v_publicidad_desde is not null then 'volvió a aceptar el texto nuevo, desde su cuenta en la tienda online'
                     else 'desde su cuenta en la tienda online' end);
      end if;
      update retail.clientas c set publicidad_desde = coalesce(c.publicidad_desde, v_ahora) where c.id = v_id;
      v_estado_avisos := case when v_publicidad_desde is null then 'activados' else 'ya_estaban' end;
    end if;
  end if;

  -- 7. El correo ya no está pendiente: la cuenta existe.
  delete from retail.cuentas_web_pendientes p where p.correo = v_correo;

  -- La actividad, sin datos suyos (quién es queda en registro_id) y sin persona: lo hizo ella.
  perform retail.fn_actividad_anotar(
    'clientas', 'registro_web',
    case when v_nueva then 'una persona creó su cuenta en la tienda online y se unió al club'
         when v_club_desde is not null then 'un miembro del club creó su cuenta en la tienda online'
         else 'una ficha de la tienda creó su cuenta en la tienda online y se unió al club' end,
    null, null, null, null, 'clientas', v_id::text, v_ahora,
    jsonb_build_object('nueva', v_nueva, 'era_del_club', v_club_desde is not null, 'ventas_ligadas', v_ligadas,
                       'textos', v_textos, 'avisos_whatsapp', v_estado_avisos),
    'vivo'
  );

  return jsonb_build_object(
    'codigo_club', v_codigo,
    'era_del_club', v_club_desde is not null,
    'se_unio_a_su_ficha', not v_nueva,
    'nombre_corto', retail.fn_club_nombre_de_pila(v_nombre_final),
    'avisos_whatsapp', v_estado_avisos
  );
end;
$$;
comment on function retail.tienda_registrar_cuenta(uuid, text, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text) is
  'Tienda online (ADR-0408, actividades 2 y 2b): crea la cuenta (cuentas_web) y deja a la persona en el Club, todo o nada, recién después de que confirmó su correo con el código (exige el pendiente de ese correo y ese usuario: cuenta_sin_codigo). Exige «Soy mayor de 18 años». Si el DNI ya es de una ficha, se une a ella completando solo lo vacío (el nombre del padrón sí reemplaza, G-4); si no, crea la ficha con registro_origen = web. Con los avisos por WhatsApp, anota el permiso de publicidad del Club (medio tienda_web, la casilla vigente) y publicidad_desde, solo para el celular que escribió. Rechaza con hint: cuenta_datos_invalidos (detail = campo, también mayor), cuenta_menor, cuenta_sin_codigo, cuenta_texto_cambio, cuenta_correo_repetido, cuenta_dni_repetido, cuenta_archivada, cuenta_ya_existe. Devuelve {codigo_club, era_del_club, se_unio_a_su_ficha, nombre_corto, avisos_whatsapp: no | activados | ya_estaban | celular_distinto}. Solo la llama tienda_web.';

-- ---------- 6. «Mi cuenta» ----------
create or replace function retail.tienda_mi_cuenta(p_usuario_web_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'nombre', c.nombre,
    'nombre_corto', retail.fn_club_nombre_de_pila(c.nombre),
    'correo', w.correo,
    'codigo_club', c.codigo_club,
    'club_desde', to_char(c.club_desde at time zone 'America/Lima', 'YYYY-MM-DD'),
    'cumple_dia', c.cumple_dia,
    'cumple_mes', c.cumple_mes,
    'activa', c.archivada_en is null
  )
  from retail.cuentas_web w
  join retail.clientas c on c.id = w.clienta_id
  where w.usuario_web_id = p_usuario_web_id;
$$;
comment on function retail.tienda_mi_cuenta(uuid) is
  'Tienda online (ADR-0408): lo que «Mi cuenta» muestra de ese usuario del proyecto de clientes {nombre, nombre_corto, correo, codigo_club, club_desde (fecha de Lima), cumple_dia, cumple_mes, activa}, o null si no tiene cuenta. Solo la llama tienda_web.';

-- ---------- 7. los beneficios del Club, para los términos de la tienda ----------
create or replace function retail.tienda_club_beneficios()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select retail.fn_club_textos_legales() - 'textos';
$$;
comment on function retail.tienda_club_beneficios() is
  'Tienda online (ADR-0408): los beneficios vigentes del Club {pct, escala:[{anio, monto}], compras, monto_minimo, dias} (los de fn_club_textos_legales, sin los textos). Solo la llama tienda_web.';

-- ---------- 7b. el texto de la casilla de los avisos por WhatsApp (actividad 2b) ----------
create or replace function retail.tienda_casilla_whatsapp()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object('version', t.version, 'texto', t.texto)
    from retail.club_textos t
   where t.tipo = 'casilla_publicidad'
   order by t.version desc
   limit 1;
$$;
comment on function retail.tienda_casilla_whatsapp() is
  'Tienda online (ADR-0408, actividad 2b): el texto aprobado de la casilla de los avisos del Club por WhatsApp (club_textos casilla_publicidad, el mismo del cartel) y su versión {version, texto}, o null si no hay. La tienda lo muestra tal cual y manda la versión que leyó. Solo la llama tienda_web.';

-- ---------- 8. la puerta: solo tienda_web ----------
revoke all on function retail.tienda_consultar_correo(text, text) from public, anon, authenticated;
revoke all on function retail.tienda_consultar_documento(text, text, text, text) from public, anon, authenticated;
revoke all on function retail.tienda_revisar_registro(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function retail.tienda_reservar_envio(text, boolean) from public, anon, authenticated;
revoke all on function retail.tienda_anotar_invitado(text, uuid) from public, anon, authenticated;
revoke all on function retail.tienda_intento_de_codigo(text) from public, anon, authenticated;
revoke all on function retail.tienda_registrar_cuenta(uuid, text, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text)
  from public, anon, authenticated;
revoke all on function retail.tienda_mi_cuenta(uuid) from public, anon, authenticated;
revoke all on function retail.tienda_club_beneficios() from public, anon, authenticated;
revoke all on function retail.tienda_casilla_whatsapp() from public, anon, authenticated;

grant execute on function retail.tienda_consultar_correo(text, text) to tienda_web;
grant execute on function retail.tienda_consultar_documento(text, text, text, text) to tienda_web;
grant execute on function retail.tienda_revisar_registro(text, text, text, text, text, text) to tienda_web;
grant execute on function retail.tienda_reservar_envio(text, boolean) to tienda_web;
grant execute on function retail.tienda_anotar_invitado(text, uuid) to tienda_web;
grant execute on function retail.tienda_intento_de_codigo(text) to tienda_web;
grant execute on function retail.tienda_registrar_cuenta(uuid, text, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text)
  to tienda_web;
grant execute on function retail.tienda_mi_cuenta(uuid) to tienda_web;
grant execute on function retail.tienda_club_beneficios() to tienda_web;
grant execute on function retail.tienda_casilla_whatsapp() to tienda_web;

reset lock_timeout;

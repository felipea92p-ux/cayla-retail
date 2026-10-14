-- ============================================================================
-- 20261014224000_tienda_cuentas_parte2_cuentas_web.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 2 · PARTE 2 de 2
--
-- EL PROBLEMA. La tienda online pide cuenta para ver el catálogo y separar (maqueta v4, aprobada el 2026-10-14). La cuenta es
-- correo y contraseña, DNI, celular y cumpleaños; correo y DNI no se repiten, y al crearla la persona ya es miembro del Club
-- CAYLA (si ya lo era en tienda, su cuenta se une a su ficha). Las identidades viven en un proyecto de inicio de sesión
-- APARTE, solo de clientes (ADR-0408, decisión 2): el ERP no los conoce como usuarios. Lo que falta es el puente: qué usuario
-- de ese proyecto es qué ficha de `clientas`, y quién decide si se puede crear una cuenta.
--
-- QUÉ HACE
--   1. `retail.cuentas_web`: una por cliente. El id de su usuario en el proyecto de clientes (`usuario_web_id`), su ficha
--      (`clienta_id`), su correo normalizado, qué textos aceptó y cuándo. Correo, usuario y ficha únicos: como la ficha es
--      única por documento, no hay dos cuentas con el mismo DNI. RLS encendido y sin políticas: solo la leen y la escriben las
--      funciones de abajo (`security definer`).
--   2. Las funciones de la puerta de la tienda (rol `tienda_web`, ADR-0408 decisión 3), cada una cerrada a public, anon y
--      authenticated y validando ella misma todo lo que recibe:
--      · `tienda_consultar_correo(correo, ip_hash)` y `tienda_consultar_documento(dni, ip_hash, documento_hash)`: lo que la
--        página de registro dice mientras se escribe («ya hay una cuenta con este correo / DNI», «ya eras del club»). Cada
--        una cuenta un intento de CONSULTA en `club_intentos_registro` (`club_intento`, ADR-0288 G-10): 20 por ip y hora.
--      · `tienda_revisar_registro(correo, dni, celular, ip_hash, documento_hash)`: lo que el servidor de la tienda pregunta
--        ANTES de crear el usuario en el proyecto de clientes. Cuenta un intento de REGISTRO (5 por ip, 3 por documento y 3
--        por celular, por hora) y dice si el correo o el DNI ya tienen cuenta.
--      · `tienda_registrar_cuenta(usuario_web_id, …)`: crea la cuenta y deja a la persona en el Club, todo o nada.
--      · `tienda_mi_cuenta(usuario_web_id)`: lo que la página «Mi cuenta» muestra (o null si ese usuario no tiene cuenta).
--      · `tienda_club_beneficios()`: el % del cumpleaños y la escala del vale de aniversario vigentes, para los términos.
--
-- EL ORDEN SEGURO (principio 9; lo hace el servidor de la tienda, `apps/tienda/app/acciones/cuenta.ts`):
--   revisar en la base (`tienda_revisar_registro`) → crear el usuario en el proyecto de clientes → `tienda_registrar_cuenta`.
--   Si la base rechaza en el último paso (otro se llevó el correo o el DNI un instante antes, o la base no responde), el
--   servidor borra el usuario recién creado; antes de borrarlo le pregunta a la base (`tienda_mi_cuenta`) si ese usuario ya
--   tiene cuenta (un doble envío pudo crearla), y si la base no contesta no borra nada. Un usuario que quedó sin cuenta (la
--   base y el proyecto de clientes cayeron a la vez) se recupera solo: al entrar con su contraseña, la tienda ve que no tiene
--   cuenta y lo deja crearla de nuevo.
--
-- DECIDÍ: los intentos usan el MISMO `club_intento` del cartel (sus topes y su tabla), con las huellas que calcula el servidor
--   de la tienda con una sal propia (`TIENDA_INTENTOS_SAL`): la ip y el documento nunca llegan en claro a la tabla. Como la sal
--   no es la del ERP, la misma ip cuenta aparte en la web y en el cartel.
-- DECIDÍ: una función que solo CONSULTA o REVISA nunca lanza un error de negocio después de contar el intento: devuelve
--   {estado}. Un error desharía también el intento anotado, y probar correos o DNI ajenos saldría gratis.
-- DECIDÍ: si el DNI ya es de una ficha, la cuenta se une a ella sin pisar lo que la ficha tiene: solo se completa lo vacío
--   (el celular, también si el que tenía no es un celular válido; el cumpleaños; el correo de contacto). La excepción es el
--   nombre del padrón, que reemplaza al que había (la regla G-4 del cartel: es el nombre oficial). La cuenta no se confirma
--   con un enlace al correo (maqueta), así que quien escribe un DNI ajeno no puede cambiarle el celular ni el cumpleaños a esa
--   persona.
-- DECIDÍ: con el nombre escrito a mano (el padrón no respondió o no encontró el DNI), sobre una ficha que ya existe no se
--   reemplaza su nombre: solo se completa uno vacío (como el carné en el cartel).
-- DECIDÍ: el cumpleaños se guarda como lo guarda el Club: día y mes obligatorios, año opcional (`cumple_dia`, `cumple_mes`,
--   `cumple_anio`). El 29 de febrero vale sin año. Con año, el Club es para mayores de 18 años (sus términos, punto 1, y la
--   política de privacidad, 2.10): con menos, `cuenta_menor`.
-- DECIDÍ: una ficha nueva nace `registro_origen = 'web'`, socia desde ahora y con su código (`fn_club_codigo_nuevo`), sin
--   tienda del cartel ni publicidad por WhatsApp (en la web no se acepta publicidad: la maqueta no la pide). Sus compras
--   anteriores con ese DNI pasan a su ficha (CL-27, como en caja y en el cartel). Una ficha ARCHIVADA no se reactiva desde la
--   web (`cuenta_archivada`), igual que en el cartel: archivar es una decisión de la tienda.
-- DECIDÍ: lo que aceptó queda en `cuentas_web.textos_aceptados` (la versión de la privacidad y los términos de la web, hoy un
--   borrador) con su hora. Todavía no se anota en `club_permisos`: sus candados solo conocen los medios de la tienda física y
--   los textos de `club_textos`, y los de la web son un borrador que CAYLA revisa. Queda para cuando se aprueben.
-- DESCARTÉ: guardar el correo o el celular de la cuenta otra vez en `cuentas_web` además de la ficha (dos fuentes de verdad);
--   el correo de la cuenta sí va aquí porque es con el que se entra, y puede no ser el de contacto de la ficha.
-- DESCARTÉ: que la tienda lea `club_intento` o `clientas` directo: `tienda_web` no tiene permiso sobre ninguna tabla ni
--   función fuera de `tienda_*` (lo vigila pruebas:tienda-puerta).
--
-- SE ROMPE SI: alguien crea usuarios en el proyecto de clientes por la puerta pública (está cerrada: `enable_signup = false`)
--   o fuera de este orden; o una función nueva de la tienda escribe en `clientas` sin estas reglas.
--
-- PRODUCCIÓN. NO está aplicada. Se pega DESPUÉS de la PARTE 1, sola en el SQL Editor; se puede pegar dos veces. Crea una tabla
-- nueva y funciones: no toma en exclusiva ninguna tabla en uso (la llave foránea a `clientas` la toma en modo compartido) y no
-- tiene políticas. Necesita el rol `tienda_web` (20261014220000).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. la tabla ----------
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
  'Las cuentas de la tienda online (ADR-0408): una por cliente. usuario_web_id es el id de su usuario en el proyecto de inicio de sesión de CLIENTES (otro proyecto, no el del ERP: sin llave foránea). Una por ficha de clientas (y la ficha es única por documento: un DNI, una cuenta) y una por correo. La escribe solo tienda_registrar_cuenta. RLS sin políticas: la leen las funciones tienda_*.';
comment on column retail.cuentas_web.usuario_web_id is
  'El id del usuario en el proyecto de inicio de sesión de los clientes (ADR-0408, decisión 2). El ERP no lo conoce como usuario suyo.';
comment on column retail.cuentas_web.correo is
  'El correo con el que entra, en minúsculas y sin espacios: el mismo de su usuario en el proyecto de clientes. Puede no ser el correo de contacto de la ficha (clientas.correo).';
comment on column retail.cuentas_web.textos_aceptados is
  'Qué versión de la política de privacidad y los términos de la tienda online aceptó al crear la cuenta (hoy «borrador-2026-10-14», un borrador que revisa CAYLA).';

alter table retail.cuentas_web enable row level security;
revoke all on retail.cuentas_web from public, anon, authenticated;

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

create or replace function retail.tienda_consultar_documento(p_dni text, p_ip_hash text, p_documento_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_dni text;
  v_ficha uuid;
  v_archivada boolean;
  v_del_club boolean;
begin
  begin
    v_dni := retail.fn_documento_clienta('dni', p_dni);
  exception when sqlstate '22023' then
    v_dni := null;
  end;
  if v_dni is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  if not retail.club_intento('consulta', p_ip_hash, p_documento_hash, null) then
    return jsonb_build_object('estado', 'limite');
  end if;
  for v_ficha, v_archivada, v_del_club in
    select c.id, c.archivada_en is not null, c.club_desde is not null
      from retail.clientas c
     where c.documento_tipo = 'dni' and c.documento_numero = v_dni
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
comment on function retail.tienda_consultar_documento(text, text, text) is
  'Tienda online (ADR-0408): ¿este DNI ya tiene cuenta, o es de una ficha archivada? {estado: invalido | limite | repetido | archivada | libre, del_club}. del_club: la ficha de ese DNI ya es del Club (la cuenta se unirá a ella). Cuenta un intento de consulta. Solo la llama tienda_web.';

-- ---------- 4. lo que el servidor revisa antes de crear el usuario de inicio de sesión ----------
create or replace function retail.tienda_revisar_registro(p_correo text, p_dni text, p_celular text, p_ip_hash text,
                                                          p_documento_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
  v_dni text;
  v_celular text := retail.fn_celular_normalizado(p_celular);
  v_ficha uuid;
  v_archivada boolean;
begin
  if v_correo is null then
    return jsonb_build_object('estado', 'invalido', 'campo', 'correo');
  end if;
  begin
    v_dni := retail.fn_documento_clienta('dni', p_dni);
  exception when sqlstate '22023' then
    v_dni := null;
  end;
  if v_dni is null then
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
     where c.documento_tipo = 'dni' and c.documento_numero = v_dni
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
comment on function retail.tienda_revisar_registro(text, text, text, text, text) is
  'Tienda online (ADR-0408): lo que el servidor de la tienda pregunta ANTES de crear el usuario en el proyecto de clientes. {estado: invalido (campo) | limite | correo_repetido | dni_repetido | archivada | ok}. Cuenta un intento de registro (club_intento: 5 por ip, 3 por documento y 3 por celular, por hora). No escribe nada más. Solo la llama tienda_web.';

-- ---------- 5. crear la cuenta y dejar a la persona en el Club ----------
create or replace function retail.tienda_registrar_cuenta(
  p_usuario_web_id uuid,
  p_correo text,
  p_dni text,
  p_nombre text,
  p_nombre_del_padron boolean,
  p_celular text,
  p_cumple_dia integer,
  p_cumple_mes integer,
  p_cumple_anio integer,
  p_acepta boolean,
  p_textos text
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
  v_dni text;
  v_nombre text := nullif(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_del_padron boolean := coalesce(p_nombre_del_padron, false);
  v_celular text;
  v_textos text := btrim(coalesce(p_textos, ''));
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
begin
  -- 1. Lo que llega, revisado aquí (la página y el servidor revisan lo mismo, pero quien decide es la base).
  if p_usuario_web_id is null then
    raise exception 'Falta el usuario de la cuenta.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'usuario';
  end if;
  if v_correo is null then
    raise exception 'Revisa tu correo.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'correo';
  end if;
  begin
    v_dni := retail.fn_documento_clienta('dni', p_dni);
  exception when sqlstate '22023' then
    v_dni := null;
  end;
  if v_dni is null then
    raise exception 'El DNI tiene 8 dígitos.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'dni';
  end if;
  if v_nombre is not null and char_length(v_nombre) > 200 then
    raise exception 'El nombre es demasiado largo.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'nombre';
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

  -- 2. El correo y el usuario, libres (las restricciones únicas de abajo cierran la carrera; esto da el mensaje claro).
  if exists (select 1 from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id) then
    raise exception 'Ese usuario ya tiene cuenta.' using errcode = 'P0001', hint = 'cuenta_ya_existe';
  end if;
  if exists (select 1 from retail.cuentas_web w where w.correo = v_correo) then
    raise exception 'Ya hay una cuenta con este correo.' using errcode = 'P0001', hint = 'cuenta_correo_repetido', detail = 'correo';
  end if;

  -- 3. La ficha, por DNI, tomada (`for update`): dos registros del mismo DNI a la vez hacen fila aquí. Si no existe, se crea;
  --    si otra pestaña la creó en este instante, `do nothing` no devuelve nada y se toma la que quedó.
  for i in 1..2 loop
    v_id := null;
    for v_id, v_archivada, v_club_desde, v_codigo, v_nombre_actual in
      select c.id, c.archivada_en is not null, c.club_desde, c.codigo_club, c.nombre
        from retail.clientas c
       where c.documento_tipo = 'dni' and c.documento_numero = v_dni
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
    values ('dni', v_dni, v_nombre, v_celular, p_cumple_dia::smallint, p_cumple_mes::smallint, p_cumple_anio::smallint,
            v_correo, 'web', null, v_ahora, v_codigo)
    on conflict (documento_tipo, documento_numero) where documento_numero is not null do nothing
    returning id into v_id;
    if v_id is not null then
      v_nueva := true;
      v_nombre_final := v_nombre;
      v_club_desde := null;
      -- CL-27: sus compras anteriores con ese DNI pasan a su ficha (como en caja y en el cartel).
      v_ligadas := retail.fn_ligar_ventas_por_documento(v_id, 'dni', v_dni);
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

  -- 4. La cuenta. Las tres restricciones únicas cierran cualquier carrera que se haya escapado de lo de arriba.
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

  -- La actividad, sin datos suyos (quién es queda en registro_id) y sin persona: lo hizo ella.
  perform retail.fn_actividad_anotar(
    'clientas', 'registro_web',
    case when v_nueva then 'una persona creó su cuenta en la tienda online y se unió al club'
         when v_club_desde is not null then 'un miembro del club creó su cuenta en la tienda online'
         else 'una ficha de la tienda creó su cuenta en la tienda online y se unió al club' end,
    null, null, null, null, 'clientas', v_id::text, v_ahora,
    jsonb_build_object('nueva', v_nueva, 'era_del_club', v_club_desde is not null, 'ventas_ligadas', v_ligadas,
                       'textos', v_textos),
    'vivo'
  );

  return jsonb_build_object(
    'codigo_club', v_codigo,
    'era_del_club', v_club_desde is not null,
    'se_unio_a_su_ficha', not v_nueva,
    'nombre_corto', retail.fn_club_nombre_de_pila(v_nombre_final)
  );
end;
$$;
comment on function retail.tienda_registrar_cuenta(uuid, text, text, text, boolean, text, integer, integer, integer, boolean, text) is
  'Tienda online (ADR-0408): crea la cuenta (cuentas_web) y deja a la persona en el Club, todo o nada. Si el DNI ya es de una ficha, se une a ella completando solo lo vacío (el nombre del padrón sí reemplaza, G-4); si no, crea la ficha con registro_origen = web. Rechaza con hint: cuenta_datos_invalidos (detail = campo), cuenta_menor, cuenta_correo_repetido, cuenta_dni_repetido, cuenta_archivada, cuenta_ya_existe. Devuelve {codigo_club, era_del_club, se_unio_a_su_ficha, nombre_corto}. Solo la llama tienda_web.';

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

-- ---------- 8. la puerta: solo tienda_web ----------
revoke all on function retail.tienda_consultar_correo(text, text) from public, anon, authenticated;
revoke all on function retail.tienda_consultar_documento(text, text, text) from public, anon, authenticated;
revoke all on function retail.tienda_revisar_registro(text, text, text, text, text) from public, anon, authenticated;
revoke all on function retail.tienda_registrar_cuenta(uuid, text, text, text, boolean, text, integer, integer, integer, boolean, text)
  from public, anon, authenticated;
revoke all on function retail.tienda_mi_cuenta(uuid) from public, anon, authenticated;
revoke all on function retail.tienda_club_beneficios() from public, anon, authenticated;

grant execute on function retail.tienda_consultar_correo(text, text) to tienda_web;
grant execute on function retail.tienda_consultar_documento(text, text, text) to tienda_web;
grant execute on function retail.tienda_revisar_registro(text, text, text, text, text) to tienda_web;
grant execute on function retail.tienda_registrar_cuenta(uuid, text, text, text, boolean, text, integer, integer, integer, boolean, text)
  to tienda_web;
grant execute on function retail.tienda_mi_cuenta(uuid) to tienda_web;
grant execute on function retail.tienda_club_beneficios() to tienda_web;

reset lock_timeout;

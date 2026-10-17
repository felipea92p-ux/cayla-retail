-- ============================================================================
-- 20261017175000_tienda_cuenta_simple_y_club_al_separar.sql — CAYLA V2 · Tienda online (ADR-0408, ADR-0438)
-- La cuenta de la tienda se crea con lo mínimo (correo y nombre, o Google) y la persona entra al Club CAYLA recién cuando da su
-- documento y su celular, que se piden al SEPARAR por primera vez.
--
-- EL PROBLEMA PRIMERO. Hasta hoy crear la cuenta pedía correo, contraseña, documento, celular, cumpleaños y dos casillas, y la tienda
-- no se podía ver sin ella. Felipe (2026-10-17): el catálogo, los precios y el stock se ven sin cuenta; la cuenta se pide al hacer el
-- pedido o cuando la persona quiere; crearla es lo más simple posible; «DNI y celular después, y cuando lo haga recién forma parte
-- del Club». Una cuenta que no es del Club no puede separar (la tienda necesita su celular para confirmar por WhatsApp y su
-- documento para entregar), así que «Separar» es el momento natural de completar sus datos.
--
-- ANALOGÍA CAYLA. La cuenta sigue siendo la llave de la tienda online; la ficha, la tarjeta del cuaderno de clientes. Antes la llave
-- se entregaba con la tarjeta ya llena. Ahora se entrega con una tarjeta en blanco (solo el nombre) y se llena cuando la persona
-- quiere separar: si en el cuaderno ya había una tarjeta con su documento (la de la caja), la llave pasa a ESA y la en blanco se
-- archiva.
--
-- QUÉ HACE
--   1. `fn_ficha_minima_de_cuenta(ficha)`: ¿esta ficha es una «tarjeta en blanco» de la web? (origen web, sin documento, sin
--      celular, sin Club, sin compras ni pedidos ni apartados). Es lo único que una cuenta puede dejar para pasar a otra ficha.
--   2. `fn_cuenta_web_reglas` (trigger de `cuentas_web`): la ficha de una cuenta sigue siendo inmutable, salvo que la actual sea
--      una ficha mínima (punto 1). Reemplazo completo de la función, con el md5 de producción del 2026-10-17 como guarda.
--   3. `tienda_revisar_registro_simple(correo, ip_hash)` y `tienda_registrar_cuenta_simple(usuario, correo, nombre, acepta,
--      textos, via)`: la cuenta con lo mínimo. `via = 'correo'` exige el correo pendiente de ESE usuario con un código probado
--      (como `tienda_registrar_cuenta`); `via = 'google'` no tiene código porque Google ya confirmó el correo, y lo llama el
--      servidor de la tienda DESPUÉS de comprobar con el proyecto de clientes que esa sesión es de Google y de ese correo.
--      Crea una ficha mínima (solo el nombre, origen web, sin Club) y la cuenta, todo o nada.
--   4. `tienda_revisar_club(usuario, documento, celular, ip_hash, documento_hash, tipo)`: lo que el servidor pregunta ANTES de
--      consultar el padrón y unir a la persona al Club: cuenta un intento de registro (los mismos topes por ip, documento y
--      celular) y dice si ya es del Club, si ese documento ya tiene OTRA cuenta o si su ficha está archivada.
--   5. `tienda_unirse_al_club(...)`: da de alta en el Club a la persona de esa cuenta. Sin ficha con ese documento, completa
--      su ficha mínima (documento, nombre, celular, cumpleaños opcional) y la hace del Club. Con una ficha que ya existía con ese
--      documento (la de la caja), la cuenta pasa a ESA (completando solo lo vacío, como `tienda_registrar_cuenta`), entra al Club
--      ahí y la ficha mínima se archiva. Los avisos por WhatsApp, como en el registro de antes.
--   6. `tienda_separar`: sin ser del Club no se separa (`tienda_sin_club`). Reemplazo anclado, con el md5 de producción como guarda.
--
-- DECIDÍ: la cuenta simple lleva una ficha mínima en `clientas` y no una cuenta sin ficha (`clienta_id` nulo). Las 14 funciones
--   de la tienda que leen la ficha (perfil, Club, favoritos, avisos, baja, pedidos…) siguen funcionando sin tocarlas: una ficha sin
--   Club ya existe hoy (las que abre la caja con el DNI de una boleta) y `tienda_mi_club` ya contesta `sin_club` para ellas.
-- DECIDÍ: la ficha mínima NO guarda el correo (solo `cuentas_web.correo`): el índice único de correos de `clientas` y la regla de
--   «un correo es de una sola persona» harían chocar a quien después se una a una ficha que ya lo tenía. El correo de contacto de
--   la ficha se completa al unirse al Club, con la regla de siempre (solo si está vacío).
-- DECIDÍ: un correo que ya es el de contacto de OTRA ficha no sirve para crear la cuenta simple (`cuenta_correo_de_otra_persona`),
--   igual que en el registro de antes; sin documento aún no se puede saber si es la misma persona. Quien está en ese caso va a una
--   tienda a que actualicen su ficha, o usa otro correo.
-- DECIDÍ: el cumpleaños es opcional al unirse al Club (Felipe: pedir lo mínimo). Sin él, el Club funciona y solo falta el regalo de
--   cumpleaños hasta que se lo den. Con él, las mismas reglas de siempre (fecha real, y con año, mayor de 18).
-- DECIDÍ: la ficha mínima archivada al unirse a otra queda archivada con su motivo y NO se borra (regla del repo: nada se borra).
-- DESCARTÉ: cambiar `cuentas_web.clienta_id` a nulo. Tocaba ~14 funciones y 35 migraciones de contrato; la ficha mínima da el mismo
--   resultado sin tocar ninguna.
-- DESCARTÉ: dejar que cualquier cuenta cambie de ficha. La inmutabilidad protege contra cuentas que se «mudan» a la ficha de otra
--   persona; solo la ficha mínima (sin nada que perder) puede dejarse.
--
-- SE ROMPE SI: alguien pone documento o celular a una ficha mínima por fuera de `tienda_unirse_al_club` (deja de ser mínima y su
--   cuenta ya no puede pasar a otra ficha), o crea compras a nombre de una ficha mínima.
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces). Solo `create or replace function` y un reemplazo anclado: no
-- toma tablas en exclusiva ni toca políticas (sin riesgo de 40P01). Antes compara el md5 de `fn_cuenta_web_reglas` y de
-- `tienda_separar` con el de producción del 2026-10-17 y con el de este archivo; si es otro, alguien las cambió y se detiene sin
-- tocar nada. Sin `select … into` dentro de un texto entre comillas. El orden con la publicación de la web no importa: la web de
-- antes sigue creando cuentas con `tienda_registrar_cuenta`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Las guardas: si alguien cambió estas dos funciones, no se toca nada ----------
do $$
declare
  v_reglas text := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.fn_cuenta_web_reglas()'));
  v_separar text := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.tienda_separar(uuid, uuid, jsonb, uuid)'));
begin
  if v_reglas is null or v_reglas not in ('37c5d58210a045092a3903e7498a817c', 'fe39739dafed274f06cc8586cf3a6a49') then
    raise exception 'fn_cuenta_web_reglas tiene otro cuerpo (md5 %): no es el de producción del 2026-10-17 ni el de este archivo. Reescribe el reemplazo desde su definición real antes de pegar.',
      coalesce(v_reglas, 'ninguno');
  end if;
  if v_separar is null or v_separar not in ('6398d88faf180468b8beb1644e95e625', 'f20e2fd55c98e519c90be7f7aa333c37') then
    raise exception 'tienda_separar tiene otro cuerpo (md5 %): no es el de producción del 2026-10-17 ni el de este archivo. Reescribe el reemplazo desde su definición real antes de pegar.',
      coalesce(v_separar, 'ninguno');
  end if;
end $$;

-- ---------- 1. ¿Es una ficha mínima de la web? ----------
create or replace function retail.fn_ficha_minima_de_cuenta(p_clienta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $f$
  select exists (
    select 1
      from retail.clientas c
     where c.id = p_clienta_id
       and c.registro_origen = 'web'
       and c.documento_numero is null
       and c.telefono_whatsapp is null
       and c.club_desde is null
       and c.publicidad_desde is null
       and not c.anonimizada
       and not exists (select 1 from retail.ventas v where v.cliente_id = c.id)
       and not exists (select 1 from retail.pedidos_web w where w.clienta_id = c.id)
       and not exists (select 1 from retail.separaciones s where s.clienta_id = c.id)
  );
$f$;

comment on function retail.fn_ficha_minima_de_cuenta(uuid) is
  'Tienda online (ADR-0438): ¿la ficha es una «tarjeta en blanco» de una cuenta simple? Origen web, sin documento, sin celular, sin Club, sin compras, pedidos ni apartados. Solo una ficha así puede dejarse para que su cuenta pase a la ficha que ya existía con el documento de la persona (fn_cuenta_web_reglas).';

revoke all on function retail.fn_ficha_minima_de_cuenta(uuid) from public, anon, authenticated;

-- ---------- 2. La ficha de una cuenta sigue siendo inmutable, salvo la mínima ----------
create or replace function retail.fn_cuenta_web_reglas()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
begin
  if tg_op = 'UPDATE' then
    -- 20261017175000 (ADR-0438): la única «mudanza» permitida es la de una ficha mínima (sin documento, celular, Club ni compras) a
    -- la ficha que ya existía con el documento de la persona, al unirse al Club desde `tienda_unirse_al_club`.
    if (new.clienta_id is distinct from old.clienta_id and not retail.fn_ficha_minima_de_cuenta(old.clienta_id))
       or new.creada_en is distinct from old.creada_en then
      raise exception 'La ficha y la fecha de una cuenta web no se cambian.' using errcode = '23514', hint = 'cuenta_web_inmutable';
    end if;
    if old.cerrada_en is not null
       and (new.cerrada_en, new.usuario_cerrado_id) is distinct from (old.cerrada_en, old.usuario_cerrado_id) then
      raise exception 'Una cuenta web cerrada no se vuelve a abrir.' using errcode = '23514', hint = 'cuenta_web_cerrada';
    end if;
    if old.usuario_borrado_en is not null and new.usuario_borrado_en is distinct from old.usuario_borrado_en then
      raise exception 'Cuándo se borró el usuario de una cuenta cerrada no se reescribe.' using errcode = '23514', hint = 'cuenta_web_inmutable';
    end if;
  end if;
  if new.cerrada_en is null and exists (select 1 from retail.clientas c where c.id = new.clienta_id and c.anonimizada) then
    raise exception 'La ficha de esta cuenta está anonimizada: la cuenta no puede quedar abierta.'
      using errcode = '23514', hint = 'cuenta_web_de_ficha_anonimizada';
  end if;
  return new;
end;
$f$;

-- ---------- 3. La cuenta con lo mínimo ----------
create or replace function retail.tienda_revisar_registro_simple(p_correo text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $f$
declare
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
begin
  if v_correo is null then
    return jsonb_build_object('estado', 'invalido', 'campo', 'correo');
  end if;
  -- Un intento de registro por ip (5 por hora): quien manda códigos a correos ajenos se frena aquí, antes de invitar a nadie.
  if not retail.club_intento('registro', p_ip_hash, null, null) then
    return jsonb_build_object('estado', 'limite');
  end if;
  if exists (select 1 from retail.cuentas_web w where w.correo = v_correo) then
    return jsonb_build_object('estado', 'correo_repetido');
  end if;
  -- Un correo es de una sola persona: el de contacto de OTRA ficha no sirve (todavía no hay documento para saber si es la misma).
  if exists (select 1 from retail.clientas c where lower(btrim(c.correo)) = v_correo) then
    return jsonb_build_object('estado', 'correo_de_otra_persona');
  end if;
  return jsonb_build_object('estado', 'ok');
end;
$f$;

create or replace function retail.tienda_registrar_cuenta_simple(
  p_usuario_web_id uuid,
  p_correo text,
  p_nombre text,
  p_acepta boolean,
  p_textos text,
  p_via text default 'correo'
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $f$
declare
  v_ahora timestamptz := now();
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
  v_nombre text := nullif(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_textos text := btrim(coalesce(p_textos, ''));
  v_via text := lower(btrim(coalesce(p_via, 'correo')));
  v_id uuid;
  v_restriccion text;
begin
  if p_usuario_web_id is null then
    raise exception 'Falta el usuario de la cuenta.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'usuario';
  end if;
  if v_correo is null then
    raise exception 'Revisa tu correo.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'correo';
  end if;
  if v_via not in ('correo', 'google') then
    raise exception 'Esa forma de crear la cuenta no existe.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'via';
  end if;
  if v_nombre is null then
    raise exception 'Escribe tu nombre.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'nombre';
  end if;
  if char_length(v_nombre) > 120 then
    raise exception 'El nombre es demasiado largo.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'nombre';
  end if;
  if not coalesce(p_acepta, false) then
    raise exception 'Para crear tu cuenta, acepta la política de privacidad y los términos.'
      using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'acepta';
  end if;
  if v_textos !~ '^[a-z0-9-]{1,60}$' then
    raise exception 'Falta la versión de los textos que aceptó.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'textos';
  end if;

  -- Con correo, sin código no hay cuenta (el servidor llama aquí solo después de que el proyecto de clientes dijo que el código era
  -- el bueno). Con Google, el correo ya lo confirmó Google: lo comprobó el servidor con el proyecto de clientes.
  if v_via = 'correo' and not exists (select 1 from retail.cuentas_web_pendientes p
                                       where p.correo = v_correo and p.usuario_web_id = p_usuario_web_id and p.intentos >= 1) then
    raise exception 'Primero confirma tu correo con el código que te mandamos.' using errcode = 'P0001', hint = 'cuenta_sin_codigo', detail = 'codigo';
  end if;

  if exists (select 1 from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id) then
    raise exception 'Ese usuario ya tiene cuenta.' using errcode = 'P0001', hint = 'cuenta_ya_existe';
  end if;
  if exists (select 1 from retail.cuentas_web w where w.correo = v_correo) then
    raise exception 'Ya hay una cuenta con este correo.' using errcode = 'P0001', hint = 'cuenta_correo_repetido', detail = 'correo';
  end if;
  if exists (select 1 from retail.clientas c where lower(btrim(c.correo)) = v_correo) then
    raise exception 'Ese correo ya está registrado con los datos de otra persona.'
      using errcode = 'P0001', hint = 'cuenta_correo_de_otra_persona', detail = 'correo';
  end if;

  -- La ficha mínima: solo el nombre. Sin correo (ver DECIDÍ), sin documento, sin celular, sin Club.
  insert into retail.clientas (nombre, registro_origen, created_por)
  values (v_nombre, 'web', null)
  returning id into v_id;

  begin
    insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados, aceptados_en, creada_en)
    values (p_usuario_web_id, v_id, v_correo, v_textos, v_ahora, v_ahora);
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'cuentas_web_correo_unico' then
      raise exception 'Ya hay una cuenta con este correo.' using errcode = 'P0001', hint = 'cuenta_correo_repetido', detail = 'correo';
    end if;
    raise exception 'Ese usuario ya tiene cuenta.' using errcode = 'P0001', hint = 'cuenta_ya_existe';
  end;

  delete from retail.cuentas_web_pendientes p where p.correo = v_correo;

  perform retail.fn_actividad_anotar(
    'clientas', 'registro_web',
    'una persona creó su cuenta en la tienda online (todavía no es del Club)',
    null, null, null, null, 'clientas', v_id::text, v_ahora,
    jsonb_build_object('via', v_via, 'textos', v_textos),
    'vivo'
  );

  return jsonb_build_object('nombre_corto', retail.fn_club_nombre_de_pila(v_nombre), 'via', v_via);
end;
$f$;

-- ---------- 4. Antes de unirse al Club ----------
create or replace function retail.tienda_revisar_club(
  p_usuario_web_id uuid,
  p_documento_numero text,
  p_celular text,
  p_ip_hash text,
  p_documento_hash text,
  p_documento_tipo text default 'dni'
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $f$
declare
  v_tipo text := lower(btrim(coalesce(p_documento_tipo, 'dni')));
  v_numero text;
  v_celular text := retail.fn_celular_normalizado(p_celular);
  v_mi_ficha uuid;
  v_otra uuid;
  v_archivada boolean;
begin
  v_mi_ficha := (select w.clienta_id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id and w.cerrada_en is null);
  if v_mi_ficha is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if exists (select 1 from retail.clientas c where c.id = v_mi_ficha and c.club_desde is not null) then
    return jsonb_build_object('estado', 'ya_es_del_club');
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
  for v_otra, v_archivada in
    select c.id, c.archivada_en is not null
      from retail.clientas c
     where c.documento_tipo = v_tipo and c.documento_numero = v_numero
  loop
    exit;
  end loop;
  if v_otra is not null and v_otra is distinct from v_mi_ficha
     and exists (select 1 from retail.cuentas_web w where w.clienta_id = v_otra) then
    return jsonb_build_object('estado', 'dni_repetido');
  end if;
  if coalesce(v_archivada, false) then
    return jsonb_build_object('estado', 'archivada');
  end if;
  return jsonb_build_object('estado', 'ok');
end;
$f$;

-- ---------- 5. Unirse al Club ----------
create or replace function retail.tienda_unirse_al_club(
  p_usuario_web_id uuid,
  p_documento_numero text,
  p_nombre text,
  p_nombre_del_padron boolean,
  p_celular text,
  p_cumple_dia integer,
  p_cumple_mes integer,
  p_cumple_anio integer,
  p_mayor_de_edad boolean,
  p_acepta boolean,
  p_avisos_whatsapp boolean,
  p_casilla_version integer,
  p_textos text,
  p_documento_tipo text default 'dni'
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $f$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_ahora timestamptz := now();
  v_tipo text := lower(btrim(coalesce(p_documento_tipo, 'dni')));
  v_numero text;
  v_nombre text := nullif(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_del_padron boolean := coalesce(p_nombre_del_padron, false);
  v_avisos boolean := coalesce(p_avisos_whatsapp, false);
  v_celular text;
  v_textos text := btrim(coalesce(p_textos, ''));
  v_casilla integer;
  v_con_cumple boolean := p_cumple_dia is not null or p_cumple_mes is not null;
  v_nacimiento date;
  v_cuenta uuid;
  v_mi_ficha uuid;
  v_correo text;
  v_mi_club timestamptz;
  v_mi_codigo text;
  v_x uuid;
  v_x_archivada boolean;
  v_x_club timestamptz;
  v_x_nombre text;
  v_id uuid;
  v_codigo text;
  v_club_antes timestamptz;
  v_nombre_final text;
  v_une_a_otra boolean := false;
  v_ligadas integer := 0;
  v_telefono_ficha text;
  v_publicidad_desde timestamptz;
  v_estado_avisos text := 'no';
begin
  -- 1. Lo que llega, revisado aquí (la página y el servidor revisan lo mismo, pero quien decide es la base).
  if p_usuario_web_id is null then
    raise exception 'Falta el usuario de la cuenta.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'usuario';
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
  if v_nombre is not null and char_length(v_nombre) > 120 then
    raise exception 'El nombre es demasiado largo.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'nombre';
  end if;
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
  -- El cumpleaños es opcional (Felipe 2026-10-17). Si se da: día y mes juntos, el año opcional, y sin año el 29 de febrero vale.
  if v_con_cumple then
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
  elsif p_cumple_anio is not null then
    raise exception 'Revisa tu cumpleaños.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'cumple';
  end if;
  if not coalesce(p_mayor_de_edad, false) then
    raise exception 'Confirma que eres mayor de 18 años.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'mayor';
  end if;
  if not coalesce(p_acepta, false) then
    raise exception 'Para unirte al Club, acepta la política de privacidad y los términos del club.'
      using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'acepta';
  end if;
  if v_textos !~ '^[a-z0-9-]{1,60}$' then
    raise exception 'Falta la versión de los textos que aceptó.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'textos';
  end if;
  if v_avisos then
    v_casilla := (select max(t.version) from retail.club_textos t where t.tipo = 'casilla_publicidad');
    if v_casilla is null then
      raise exception 'Todavía no está publicado el texto de los avisos.' using errcode = 'P0001', hint = 'cuenta_sin_texto', detail = 'avisos';
    end if;
    if p_casilla_version is distinct from v_casilla then
      raise exception 'El texto de los avisos cambió mientras te unías: vuelve a leerlo.'
        using errcode = 'P0001', hint = 'cuenta_texto_cambio', detail = 'avisos';
    end if;
  end if;

  -- 2. Su cuenta y su ficha, tomadas en el orden de siempre (la ficha primero, como la baja y la conservación): una sola
  --    persona a la vez. Si el documento ya es de otra ficha, las dos se toman en orden de id para no trabarse con otra persona.
  v_mi_ficha := (select w.clienta_id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id and w.cerrada_en is null);
  if v_mi_ficha is null then
    raise exception 'Tu cuenta no está lista.' using errcode = 'P0001', hint = 'cuenta_sin_cuenta';
  end if;
  v_x := (select c.id from retail.clientas c where c.documento_tipo = v_tipo and c.documento_numero = v_numero);
  perform 1 from retail.clientas c where c.id in (v_mi_ficha, coalesce(v_x, v_mi_ficha)) order by c.id for update;
  for v_cuenta, v_correo in
    select w.id, w.correo from retail.cuentas_web w
     where w.usuario_web_id = p_usuario_web_id and w.clienta_id = v_mi_ficha and w.cerrada_en is null for update
  loop
    exit;
  end loop;
  if v_cuenta is null then
    raise exception 'Tu cuenta cambió mientras la revisábamos: vuelve a intentar.' using errcode = 'P0001', hint = 'cuenta_reintentar';
  end if;

  for v_mi_club, v_mi_codigo in select c.club_desde, c.codigo_club from retail.clientas c where c.id = v_mi_ficha loop
    exit;
  end loop;
  if v_mi_club is not null then
    return jsonb_build_object('estado', 'ya_era', 'codigo_club', v_mi_codigo);
  end if;

  v_codigo := retail.fn_club_codigo_nuevo();

  if v_x is null or v_x = v_mi_ficha then
    -- 3a. Nadie más tiene ese documento: se completa SU ficha mínima. El nombre del padrón (o el escrito, con carné o pasaporte)
    --     reemplaza al que puso al crear la cuenta; con DNI, el nombre sale del padrón (el disparador de la ficha lo exige).
    if v_nombre is null then
      raise exception 'Escribe tus nombres y apellidos.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'nombre';
    end if;
    v_id := v_mi_ficha;
    v_nombre_final := v_nombre;
    update retail.clientas c set
      documento_tipo = v_tipo,
      documento_numero = v_numero,
      nombre = v_nombre,
      telefono_whatsapp = v_celular,
      cumple_dia = case when v_con_cumple then p_cumple_dia::smallint end,
      cumple_mes = case when v_con_cumple then p_cumple_mes::smallint end,
      cumple_anio = case when v_con_cumple then p_cumple_anio::smallint end,
      club_desde = v_ahora,
      codigo_club = v_codigo
    where c.id = v_id;
    -- CL-27: sus compras anteriores con ese documento pasan a su ficha (como en caja y en el cartel).
    v_ligadas := retail.fn_ligar_ventas_por_documento(v_id, v_tipo, v_numero);
  else
    -- 3b. Ya había una ficha con ese documento (la de la caja o el cartel): la cuenta pasa a ESA.
    v_id := v_x;
    v_une_a_otra := true;
    for v_x_archivada, v_x_club, v_x_nombre in
      select c.archivada_en is not null, c.club_desde, c.nombre from retail.clientas c where c.id = v_x
    loop
      exit;
    end loop;
    if v_x_archivada then
      raise exception 'Para unirte necesitamos revisar tus datos en tienda.' using errcode = 'P0001', hint = 'cuenta_archivada', detail = 'dni';
    end if;
    if exists (select 1 from retail.cuentas_web w where w.clienta_id = v_x and w.id <> v_cuenta) then
      raise exception 'Ya hay una cuenta con este documento.' using errcode = 'P0001', hint = 'cuenta_dni_repetido', detail = 'dni';
    end if;
    v_club_antes := v_x_club;
    v_nombre_final := case when v_del_padron then v_nombre else coalesce(nullif(btrim(v_x_nombre), ''), v_nombre) end;
    if v_nombre_final is null then
      raise exception 'Escribe tus nombres y apellidos.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'nombre';
    end if;
    if v_club_antes is not null then
      v_codigo := (select c.codigo_club from retail.clientas c where c.id = v_x);
    end if;
    -- Primero la cuenta pasa a la ficha (la regla de «un correo, una persona» mira la ficha de la cuenta), después se completa.
    update retail.cuentas_web w set clienta_id = v_x where w.id = v_cuenta;
    -- Lo que la ficha ya tiene no se pisa: solo se completa lo vacío. El nombre del padrón reemplaza al que había (G-4).
    update retail.clientas c set
      nombre = v_nombre_final,
      telefono_whatsapp = case when c.telefono_whatsapp is null or c.telefono_whatsapp !~ '^9[0-9]{8}$' then v_celular
                               else c.telefono_whatsapp end,
      cumple_anio = case when not v_con_cumple then c.cumple_anio
                         when c.cumple_dia is null or c.cumple_mes is null then p_cumple_anio::smallint
                         when c.cumple_anio is null and c.cumple_dia = p_cumple_dia and c.cumple_mes = p_cumple_mes
                           then p_cumple_anio::smallint
                         else c.cumple_anio end,
      cumple_dia = case when v_con_cumple and (c.cumple_dia is null or c.cumple_mes is null) then p_cumple_dia::smallint else c.cumple_dia end,
      cumple_mes = case when v_con_cumple and (c.cumple_dia is null or c.cumple_mes is null) then p_cumple_mes::smallint else c.cumple_mes end,
      correo = coalesce(c.correo, v_correo),
      club_desde = coalesce(c.club_desde, v_ahora),
      codigo_club = coalesce(c.codigo_club, v_codigo)
    where c.id = v_x;
    -- Su tarjeta en blanco se archiva (nada se borra) y el código que se sacó de más no se usa.
    update retail.clientas c set
      archivada_en = v_ahora,
      motivo_archivo = 'Ficha mínima de la tienda online, unida a su ficha anterior (mismo documento) al entrar al Club'
    where c.id = v_mi_ficha;
  end if;

  update retail.cuentas_web w set textos_aceptados = v_textos, aceptados_en = v_ahora where w.id = v_cuenta;

  -- 4. Los avisos del Club por WhatsApp: el permiso de publicidad que ELLA otorga marcando la casilla, citando el texto que leyó,
  --    y solo para el celular que escribió (si la ficha ya tenía otro, queda sin activar y la tienda se lo dice).
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

  perform retail.fn_actividad_anotar(
    'clientas', 'registro_web',
    case when v_une_a_otra then 'una cuenta de la tienda online se unió al club con su ficha de tienda'
         else 'una cuenta de la tienda online se unió al club' end,
    null, null, null, null, 'clientas', v_id::text, v_ahora,
    jsonb_build_object('une_a_su_ficha', v_une_a_otra, 'era_del_club', v_club_antes is not null, 'ventas_ligadas', v_ligadas,
                       'textos', v_textos, 'avisos_whatsapp', v_estado_avisos, 'con_cumple', v_con_cumple),
    'vivo'
  );

  return jsonb_build_object(
    'estado', 'ok',
    'codigo_club', (select c.codigo_club from retail.clientas c where c.id = v_id),
    'era_del_club', v_club_antes is not null,
    'se_unio_a_su_ficha', v_une_a_otra,
    'nombre_corto', retail.fn_club_nombre_de_pila(v_nombre_final),
    'avisos_whatsapp', v_estado_avisos
  );
end;
$f$;

-- ---------- 6. «Separar» es del Club ----------
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo abortaría.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.tienda_separar(uuid, uuid, jsonb, uuid)',
  $v$  if v_clienta is null then
    raise exception 'Tu cuenta no está lista para separar.' using errcode = '22023', hint = 'tienda_sin_cuenta';
  end if;
$v$,
  $v$  if v_clienta is null then
    raise exception 'Tu cuenta no está lista para separar.' using errcode = '22023', hint = 'tienda_sin_cuenta';
  end if;
  -- 20261017175000 (ADR-0438): se separa siendo del Club. La cuenta simple todavía no tiene documento ni celular: la tienda se los
  -- pide la primera vez que separa, y al dárselos la persona entra al Club (tienda_unirse_al_club).
  if not exists (select 1 from retail.clientas c where c.id = v_clienta and c.club_desde is not null) then
    raise exception 'Antes de separar, completa tus datos.' using errcode = '22023', hint = 'tienda_sin_club';
  end if;
$v$
);

-- ---------- 7. Permisos: solo la puerta de la tienda ----------
revoke all on function retail.tienda_revisar_registro_simple(text, text) from public, anon, authenticated;
revoke all on function retail.tienda_registrar_cuenta_simple(uuid, text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function retail.tienda_revisar_club(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function retail.tienda_unirse_al_club(uuid, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text)
  from public, anon, authenticated;

grant execute on function retail.tienda_revisar_registro_simple(text, text) to tienda_web;
grant execute on function retail.tienda_registrar_cuenta_simple(uuid, text, text, boolean, text, text) to tienda_web;
grant execute on function retail.tienda_revisar_club(uuid, text, text, text, text, text) to tienda_web;
grant execute on function retail.tienda_unirse_al_club(uuid, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text)
  to tienda_web;

comment on function retail.tienda_registrar_cuenta_simple(uuid, text, text, boolean, text, text) is
  'Tienda online (ADR-0438): crea la cuenta con lo mínimo (correo y nombre, o Google) y una ficha mínima sin Club. Con correo exige el código ya probado; con Google, el servidor ya comprobó la sesión. La persona entra al Club al unirse con tienda_unirse_al_club.';
comment on function retail.tienda_unirse_al_club(uuid, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text) is
  'Tienda online (ADR-0438): da de alta en el Club a la persona de una cuenta simple cuando da su documento y su celular (al separar). Completa su ficha mínima o, si ya había una ficha con ese documento, la cuenta pasa a ESA y la mínima se archiva.';

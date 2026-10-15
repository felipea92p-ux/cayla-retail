-- ============================================================================
-- 20261015055000_tienda_cuentas_entrada_y_cierre.sql — CAYLA V2 · Tienda online (ADR-0408) y Club (ADR-0288) · PARTE 2 de 2
--
-- EL PROBLEMA PRIMERO. El Club guarda los datos de una persona 3 años desde su última compra; pasado eso, su ficha se anonimiza
-- sola (ADR-0288 G-15, `fn_club_anonimizar_inactivas`, la ruta programada `/api/club/conservacion`). Con la tienda online aparece
-- otra forma de seguir con CAYLA: entrar a su cuenta, mirar, guardar favoritos, esperar una talla. Felipe (2026-10-14): «entrar a la
-- web cuenta como actividad». Y si aun así la ficha se anonimiza (3 años sin comprar y sin entrar), la cuenta web no puede quedar
-- viva con su correo, sus favoritos y sus esperas, ni dejarla entrar: hoy se quedaba todo, colgando de una ficha sin datos.
--
-- ANALOGÍA CAYLA. La libreta del Club tacha a quien no vuelve en 3 años. Hasta ahora solo contaba quien pasaba por caja; desde hoy
-- también quien entra a la vitrina de la web. Y cuando se tacha a alguien, se tacha también su llave de la puerta de la web.
--
-- QUÉ HACE
--   1. `cuentas_web` gana: `ultima_entrada_en` (la última vez que entró), `cerrada_en`, `usuario_cerrado_id` (el usuario del proyecto
--      de CLIENTES que hay que borrar allá) y `usuario_borrado_en` (cuándo el servidor de la tienda lo borró). Una cuenta está ABIERTA
--      (con su usuario y su correo) o CERRADA (sin usuario ni correo, con el usuario por borrar): un candado lo exige. Por eso
--      `usuario_web_id` y `correo` pasan a aceptar vacío, y solo en una cuenta cerrada.
--   2. El correo de una persona (PARTE 1, `fn_correo_de_una_persona`) también vigila `cuentas_web`: el correo de la cuenta web no
--      puede ser el de OTRA ficha. Y `tienda_revisar_registro` lo dice ANTES de mandar el código (`correo_de_otra_persona`), sin decir
--      de quién es.
--   3. `tienda_anotar_entrada(usuario)`: anota la entrada (el servidor de la tienda la llama al iniciar sesión y, como mucho, una
--      vez al día por sesión; nunca en cada petición). Si ese usuario es de una cuenta cerrada, lo dice (`cerrada`): el servidor
--      borra el usuario del proyecto de clientes y cierra su sesión.
--   4. La conservación del Club cuenta la mayor fecha entre la última compra y la última entrada a la web (o cuando creó su cuenta),
--      y no toca a quien tiene un pedido web en curso (como un apartado abierto: se le debe algo).
--   5. Al anonimizarse una ficha, por la conservación o porque lo pidió en tienda, su cuenta web se CIERRA en la misma escritura
--      (disparador `clientas_cuenta_web_al_anonimizar`): sin correo, sin usuario que entre, y sus favoritos y sus esperas vivas
--      quitados (`quitado_en`, `quitada_en`). Nadie la puede abrir otra vez.
--   6. `tienda_usuarios_por_borrar` y `tienda_usuario_borrado`: la ruta programada de la tienda (`/api/cuentas-cerradas`) barre los
--      usuarios de cuentas cerradas que nadie borró todavía, los borra del proyecto de clientes y lo anota.
--
-- DECIDÍ: la cuenta cerrada no se borra ni se vacía de historia: es la prueba de qué aceptó y cuándo (textos, fechas). Lo que la
--   identifica sale: el correo y el usuario (que pasa a `usuario_cerrado_id` hasta que el servidor lo borra allá). Sus favoritos y
--   sus esperas no se borran: se quitan (`quitado_en`), como cuando ella los quita. Quedan como demanda sin dueño (no se puede
--   saber de quién: la ficha está anonimizada y la cuenta ya no tiene correo ni usuario), igual que sus ventas. Principio: nunca se
--   borran datos; se quita lo que dice quién es.
-- DECIDÍ: la base no puede borrar el usuario del proyecto de clientes (es OTRO proyecto, ADR-0408 decisión 2). Lo más simple que no
--   deja nada a medias: la base cierra la cuenta en la misma transacción que anonimiza (nunca hay una ficha anonimizada con una
--   cuenta abierta), y el usuario de allá se borra en dos lugares que se cubren: cuando la persona intenta entrar
--   (`tienda_anotar_entrada` responde `cerrada`) y en la ruta programada de cada madrugada. Hasta que se borre, ese usuario puede
--   escribir su clave en el proyecto de clientes, pero la base ya no lo reconoce: ninguna función `tienda_*` encuentra su cuenta
--   (buscan por `usuario_web_id`, que quedó vacío).
-- DECIDÍ: mover el usuario a `usuario_cerrado_id` en vez de dejarlo en `usuario_web_id` con `cerrada_en`: así las ~15 funciones de
--   la tienda que buscan la cuenta por su usuario la dejan de ver sin tocar ninguna (y sin chocar con las actividades en curso).
-- DECIDÍ: la entrada se cuenta en la cuenta (`cuentas_web.ultima_entrada_en`), no en `cuentas_web_visitas` (esa es la visita a «Mi
--   cuenta» para «Novedades para ti», con su regla de 30 minutos). Crear la cuenta también cuenta (`creada_en`).
-- DESCARTÉ: borrar las filas de favoritos y esperas de la cuenta cerrada (se pierde la demanda que la tienda no tuvo, y quitar ya es
--   «no queda»); borrar la fila de la cuenta (se pierde la prueba de lo que aceptó); un `pg_cron` o una llamada de la base al
--   proyecto de clientes (ADR-0166 y ADR-0352 descartan `pg_cron`; la base no tiene llaves de otro proyecto).
--
-- SE ROMPE SI: una función nueva de la tienda busca la cuenta por algo que no sea `usuario_web_id` (vería una cerrada); o alguien
--   anonimiza una ficha saltándose el disparador; o la ruta programada de la tienda deja de correr (los usuarios de cuentas
--   cerradas quedan en el proyecto de clientes hasta que intenten entrar: la base ya no los reconoce).
--
-- PRODUCCIÓN. NO está aplicada (actividad 13 de la tienda, con el OK de Felipe). Va DESPUÉS de la PARTE 1 (20261015054000) y de las
-- migraciones de la tienda (cuentas, pedidos web, favoritos y esperas). Una sola parte, idempotente. Toca `cuentas_web` (todavía sin
-- uso en producción) y engancha un disparador a `clientas` (SHARE ROW EXCLUSIVE: no frena las lecturas de una venta; `lock_timeout`
-- de 3 s). Sin políticas ni `drop trigger`, y ningún `select … into` dentro de un texto entre comillas.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select column_name, is_nullable from information_schema.columns where table_schema = 'retail' and table_name = 'cuentas_web'
--      and column_name in ('usuario_web_id', 'correo', 'ultima_entrada_en', 'cerrada_en', 'usuario_cerrado_id', 'usuario_borrado_en')
--    order by 1;   → las seis, todas YES
--   select tgname from pg_trigger where tgrelid in ('retail.cuentas_web'::regclass, 'retail.clientas'::regclass)
--      and tgname in ('cuentas_web_correo_de_una_persona', 'cuentas_web_reglas', 'clientas_cuenta_web_al_anonimizar') order by 1;
--     → las tres
--   select has_function_privilege('tienda_web', 'retail.tienda_anotar_entrada(uuid)', 'execute');   → t
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Lo que esta migración da por hecho, candado de versión y correos que ya chocan ----------
do $guarda$
declare
  r record;
  v_md5 text;
  v_chocan integer;
begin
  if to_regprocedure('retail.fn_correo_de_una_persona()') is null
     or not exists (select 1 from pg_indexes where schemaname = 'retail' and indexname = 'clientas_correo_unico') then
    raise exception 'Falta la PARTE 1 (el correo de una sola persona): pega antes 20261015054000_clientas_correo_unico_y_sin_unir_fichas.sql.';
  end if;
  if to_regclass('retail.cuentas_web') is null then
    raise exception 'Faltan las cuentas de la tienda: pega antes 20261014224000_tienda_cuentas_parte2_cuentas_web.sql.';
  end if;
  if to_regclass('retail.pedidos_web') is null then
    raise exception 'Falta el pedido web: pega antes 20261014235000_pedidos_web_modelo.sql.';
  end if;
  if to_regclass('retail.favoritos_web') is null or to_regclass('retail.esperas_web') is null then
    raise exception 'Faltan los favoritos y las esperas: pega antes 20261015024000_tienda_favoritos_y_esperas.sql.';
  end if;
  for r in
    select * from (values
      -- firma                                                       antes (20261014224000 / 1g del club)   despues (este archivo)
      ('retail.tienda_revisar_registro(text,text,text,text,text,text)', '634ef488d7addc9f60ce383f5fd9436f', '838c2155de84707f833f3268a65d72a3'),
      ('retail.fn_club_anonimizar_inactivas()',                     'bb5b5e43cf86a237ed2f88fcb0c46df8',    '916925ce82c84429c7130d06d670b8f2'),
      ('retail.fn_cuenta_web_reglas()',                             null,                                  '3e64c51978b3b305d48d721ad911337f'),
      ('retail.fn_cuentas_web_cerrar_al_anonimizar()',              null,                                  '0cb9b5e6f24d879373420ec19cbf824d'),
      ('retail.tienda_anotar_entrada(uuid)',                        null,                                  '835f5eecb700310219aa412cb38d378d'),
      ('retail.tienda_usuarios_por_borrar(integer)',                null,                                  '526c0d58903dc54cb68d8ca03932262c'),
      ('retail.tienda_usuario_borrado(uuid)',                       null,                                  'b2df8a5a6bcc8375e801dd7bc7da4b17')
    ) as t(firma, antes, despues)
  loop
    v_md5 := (select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
                from pg_proc p where p.oid = to_regprocedure(r.firma));
    if v_md5 is null then
      if r.antes is not null then
        raise exception '% no existe en esta base: pega antes la migración que la crea.', r.firma;
      end if;
    elsif v_md5 is distinct from r.antes and v_md5 is distinct from r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, coalesce(r.antes, 'que no exista'), r.despues;
    end if;
  end loop;

  -- El correo de una cuenta web que ya es el de OTRA ficha: decidir de quién es le toca a Felipe, no a esta migración.
  v_chocan := (select count(*) from retail.cuentas_web w
                where w.correo is not null
                  and exists (select 1 from retail.clientas c where lower(btrim(c.correo)) = w.correo and c.id <> w.clienta_id));
  if v_chocan > 0 then
    raise exception 'cuentas_web: % cuenta(s) tienen el correo de OTRA ficha, y desde ahora un correo es de una sola persona. No se toca nada. Míralas (solo lectura) con: select w.id, c.id from retail.cuentas_web w join retail.clientas c on lower(btrim(c.correo)) = w.correo and c.id <> w.clienta_id; y decide con Felipe antes de volver a pegar.',
      v_chocan;
  end if;
end
$guarda$;

-- ---------- 1. La cuenta: su última entrada, y abierta o cerrada ----------
alter table retail.cuentas_web add column if not exists ultima_entrada_en timestamptz;
alter table retail.cuentas_web add column if not exists cerrada_en timestamptz;
alter table retail.cuentas_web add column if not exists usuario_cerrado_id uuid;
alter table retail.cuentas_web add column if not exists usuario_borrado_en timestamptz;
alter table retail.cuentas_web alter column usuario_web_id drop not null;
alter table retail.cuentas_web alter column correo drop not null;

alter table retail.cuentas_web drop constraint if exists cuentas_web_abierta_o_cerrada;
alter table retail.cuentas_web add constraint cuentas_web_abierta_o_cerrada check (
  (cerrada_en is null and usuario_web_id is not null and correo is not null and usuario_cerrado_id is null and usuario_borrado_en is null)
  or (cerrada_en is not null and usuario_web_id is null and correo is null and usuario_cerrado_id is not null
      and (usuario_borrado_en is null or usuario_borrado_en >= cerrada_en)));

alter table retail.cuentas_web drop constraint if exists cuentas_web_entrada_despues;
alter table retail.cuentas_web add constraint cuentas_web_entrada_despues check (ultima_entrada_en is null or ultima_entrada_en >= creada_en);

-- La búsqueda de `tienda_anotar_entrada` y de la ruta programada; y un usuario cerrado es de una sola cuenta.
create unique index if not exists cuentas_web_usuario_cerrado_unico on retail.cuentas_web (usuario_cerrado_id) where usuario_cerrado_id is not null;

comment on column retail.cuentas_web.usuario_web_id is
  'El id del usuario en el proyecto de inicio de sesión de los clientes (ADR-0408, decisión 2). El ERP no lo conoce como usuario suyo. Vacío en una cuenta cerrada: pasa a usuario_cerrado_id, y ninguna función tienda_* la vuelve a encontrar.';
comment on column retail.cuentas_web.correo is
  'El correo con el que entra, en minúsculas y sin espacios: el mismo de su usuario en el proyecto de clientes. Puede no ser el correo de contacto de la ficha (clientas.correo), pero nunca es el de OTRA ficha (fn_correo_de_una_persona). Vacío en una cuenta cerrada.';
comment on column retail.cuentas_web.ultima_entrada_en is
  'La última vez que entró a su cuenta (Felipe 2026-10-14: entrar a la web cuenta como actividad del Club). La anota tienda_anotar_entrada al iniciar sesión y, como mucho, una vez al día por sesión. Vacía: no entró desde que creó la cuenta (creada_en). La lee la conservación del Club (fn_club_anonimizar_inactivas).';
comment on column retail.cuentas_web.cerrada_en is
  'Cuándo se cerró la cuenta: su ficha se anonimizó (3 años sin comprar ni entrar, o porque lo pidió). Cerrada = sin correo ni usuario que entre, y sus favoritos y esperas quitados. No se vuelve a abrir.';
comment on column retail.cuentas_web.usuario_cerrado_id is
  'En una cuenta cerrada, el usuario del proyecto de clientes que la tienda tiene que borrar (la base no puede: es otro proyecto). Lo borra el servidor de la tienda cuando la persona intenta entrar o en su ruta programada (/api/cuentas-cerradas).';
comment on column retail.cuentas_web.usuario_borrado_en is
  'Cuándo el servidor de la tienda borró ese usuario del proyecto de clientes (tienda_usuario_borrado). Vacía en una cuenta cerrada: todavía hay que borrarlo.';
comment on table retail.cuentas_web is
  'Las cuentas de la tienda online (ADR-0408): una por cliente. Abierta: usuario_web_id (su usuario en el proyecto de CLIENTES, otro proyecto: sin llave foránea) y su correo, únicos; cerrada (su ficha se anonimizó): sin usuario ni correo, con el usuario por borrar allá (usuario_cerrado_id). Una por ficha de clientas (la ficha es única por documento: un DNI, una cuenta) y una por correo, que además no es el de OTRA ficha. La escribe tienda_registrar_cuenta, después de que la persona confirmó su correo con un código; la cierra el disparador clientas_cuenta_web_al_anonimizar. RLS sin políticas: la leen las funciones tienda_*.';

-- ---------- 2. Los candados de la cuenta ----------
-- El correo de la cuenta web no puede ser el de OTRA ficha (la función de la PARTE 1 sirve a las dos tablas).
create or replace trigger cuentas_web_correo_de_una_persona before insert or update of correo on retail.cuentas_web
  for each row
  when (new.correo is not null)
  execute function retail.fn_correo_de_una_persona();

-- Una cuenta no cambia de ficha ni de fecha; cerrada, no se abre; y abierta, nunca con su ficha anonimizada.
create or replace function retail.fn_cuenta_web_reglas()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'UPDATE' then
    if new.clienta_id is distinct from old.clienta_id or new.creada_en is distinct from old.creada_en then
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
$$;
comment on function retail.fn_cuenta_web_reglas() is
  'Disparador de cuentas_web (ADR-0408, Felipe 2026-10-14): la ficha y la fecha de una cuenta no cambian; una cuenta cerrada no se abre ni cambia su usuario por borrar; cuándo se borró ese usuario no se reescribe; y una cuenta abierta nunca cuelga de una ficha anonimizada (23514, hints cuenta_web_inmutable, cuenta_web_cerrada, cuenta_web_de_ficha_anonimizada).';
revoke all on function retail.fn_cuenta_web_reglas() from public, anon, authenticated;

create or replace trigger cuentas_web_reglas before insert or update on retail.cuentas_web
  for each row
  execute function retail.fn_cuenta_web_reglas();

-- ---------- 3. Al anonimizarse la ficha, su cuenta web se cierra (en la misma escritura) ----------
-- Por la conservación del Club (fn_club_anonimizar_inactivas) o porque lo pidió en tienda (archivar_clienta con anonimizar): las dos
-- pasan por fn_clienta_anonimizar, que pone `anonimizada`; este disparador no necesita saber cuál fue.
create or replace function retail.fn_cuentas_web_cerrar_al_anonimizar()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ahora timestamptz := now();
  v_cuenta uuid;
begin
  for v_cuenta in
    select w.id from retail.cuentas_web w where w.clienta_id = new.id and w.cerrada_en is null order by w.id for update
  loop
    -- Lo vivo se quita como cuando ella lo quita (nunca antes de haberlo guardado).
    update retail.favoritos_web f set quitado_en = greatest(v_ahora, f.guardado_en)
     where f.cuenta_web_id = v_cuenta and f.quitado_en is null;
    update retail.esperas_web e set quitada_en = greatest(v_ahora, e.creada_en)
     where e.cuenta_web_id = v_cuenta and e.quitada_en is null;
    -- Sin correo ni usuario que entre: el usuario pasa a «por borrar» en el proyecto de clientes.
    update retail.cuentas_web w set
      cerrada_en = greatest(v_ahora, w.creada_en, coalesce(w.ultima_entrada_en, w.creada_en)),
      usuario_cerrado_id = w.usuario_web_id,
      usuario_web_id = null,
      correo = null
     where w.id = v_cuenta;
  end loop;
  return null;
end;
$$;
comment on function retail.fn_cuentas_web_cerrar_al_anonimizar() is
  'Disparador de clientas (ADR-0408, Felipe 2026-10-14): cuando una ficha se anonimiza, cierra su cuenta web en la misma escritura: sin correo ni usuario (pasa a usuario_cerrado_id para borrarlo en el proyecto de clientes) y con sus favoritos y esperas vivas quitados. Nada se borra.';
revoke all on function retail.fn_cuentas_web_cerrar_al_anonimizar() from public, anon, authenticated;

create or replace trigger clientas_cuenta_web_al_anonimizar after update of anonimizada on retail.clientas
  for each row
  when (new.anonimizada and not old.anonimizada)
  execute function retail.fn_cuentas_web_cerrar_al_anonimizar();

-- ---------- 4. La entrada a la web ----------
create or replace function retail.tienda_anotar_entrada(p_usuario_web_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
begin
  if p_usuario_web_id is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  update retail.cuentas_web w set ultima_entrada_en = greatest(now(), w.creada_en)
   where w.usuario_web_id = p_usuario_web_id;
  if found then
    return jsonb_build_object('estado', 'anotada');
  end if;
  -- Su ficha se anonimizó y la cuenta se cerró: el servidor borra ese usuario del proyecto de clientes y cierra su sesión.
  if exists (select 1 from retail.cuentas_web w where w.usuario_cerrado_id = p_usuario_web_id) then
    return jsonb_build_object('estado', 'cerrada');
  end if;
  return jsonb_build_object('estado', 'sin_cuenta');
end;
$$;
comment on function retail.tienda_anotar_entrada(uuid) is
  'Tienda online (ADR-0408, Felipe 2026-10-14: entrar a la web cuenta como actividad del Club): anota la entrada de ese usuario del proyecto de clientes (cuentas_web.ultima_entrada_en). {estado: anotada | cerrada (es de una cuenta cerrada: hay que borrar el usuario y cerrar la sesión) | sin_cuenta}. El servidor la llama al iniciar sesión y, como mucho, una vez al día por sesión. Solo la llama tienda_web.';

-- ---------- 5. Los usuarios de cuentas cerradas, por borrar en el proyecto de clientes ----------
create or replace function retail.tienda_usuarios_por_borrar(p_limite integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object('usuarios', coalesce(jsonb_agg(x.usuario order by x.cerrada_en, x.usuario), '[]'::jsonb))
    from (select w.usuario_cerrado_id as usuario, w.cerrada_en
            from retail.cuentas_web w
           where w.cerrada_en is not null and w.usuario_borrado_en is null
             -- Defensa: un usuario que es el de una cuenta ABIERTA nunca se borra.
             and not exists (select 1 from retail.cuentas_web o where o.usuario_web_id = w.usuario_cerrado_id)
           order by w.cerrada_en, w.usuario_cerrado_id
           limit least(greatest(coalesce(p_limite, 50), 1), 200)) x;
$$;
comment on function retail.tienda_usuarios_por_borrar(integer) is
  'Tienda online (ADR-0408): los usuarios del proyecto de clientes de cuentas cerradas que todavía no se borraron allá {usuarios: [uuid]}, los más viejos primero (de 1 a 200, 50 por defecto). Los barre la ruta programada de la tienda (/api/cuentas-cerradas). Solo la llama tienda_web.';

create or replace function retail.tienda_usuario_borrado(p_usuario_web_id uuid)
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
  update retail.cuentas_web w set usuario_borrado_en = greatest(now(), w.cerrada_en)
   where w.usuario_cerrado_id = p_usuario_web_id and w.usuario_borrado_en is null
     and not exists (select 1 from retail.cuentas_web o where o.usuario_web_id = p_usuario_web_id);
  return found;
end;
$$;
comment on function retail.tienda_usuario_borrado(uuid) is
  'Tienda online (ADR-0408): anota que el servidor borró del proyecto de clientes el usuario de una cuenta cerrada (o que ya no estaba). Devuelve si había uno por borrar. Solo la llama tienda_web.';

-- ---------- 6. Antes de mandar el código: el correo de otra persona ----------
-- Sobre su definición viva (20261014224000, md5 634ef488…; con el tipo de documento desde el 2026-10-15). Suma SOLO el correo de contacto de OTRA ficha (`correo_de_otra_persona`):
-- el de la cuenta web de otra ficha ya lo decía `correo_repetido`. Sin decir de quién es.
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
  -- Un correo es de una sola persona (Felipe 2026-10-14): el de contacto de OTRA ficha no sirve para esta cuenta.
  if exists (select 1 from retail.clientas c where lower(btrim(c.correo)) = v_correo and c.id is distinct from v_ficha) then
    return jsonb_build_object('estado', 'correo_de_otra_persona');
  end if;
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
  'Tienda online (ADR-0408): lo que el servidor de la tienda pregunta ANTES de crear el usuario en el proyecto de clientes. {estado: invalido (campo) | limite | correo_repetido (ya hay una cuenta con ese correo) | correo_de_otra_persona (es el correo de contacto de otra ficha; no dice de quién) | dni_repetido | archivada | ok}. Cuenta un intento de registro (club_intento: 5 por ip, 3 por documento y 3 por celular, por hora). No escribe nada más. Solo la llama tienda_web.';

-- ---------- 7. La conservación del Club: también cuenta entrar a la web ----------
-- Sobre su definición viva (la de la 1g del club, md5 bb5b5e43…). Cambian dos cosas: la última actividad es la mayor entre la
-- última compra (o el registro o la unión al club) y la última entrada a la cuenta web (o cuando la creó); y un pedido web en curso
-- la frena, como un apartado abierto.
create or replace function retail.fn_club_anonimizar_inactivas()
returns integer
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select c.id
      from retail.clientas c
     where not c.anonimizada
       and c.fusionada_en_id is null
       and greatest(c.created_at, coalesce(c.club_desde, c.created_at),
                    coalesce((select max(v.created_at) from retail.ventas v where v.cliente_id = c.id and v.estado = 'completada'),
                             c.created_at),
                    -- ADR-0408 (Felipe 2026-10-14): entrar a su cuenta de la tienda online también es actividad.
                    coalesce((select max(greatest(w.creada_en, coalesce(w.ultima_entrada_en, w.creada_en)))
                                from retail.cuentas_web w where w.clienta_id = c.id),
                             c.created_at)) < now() - interval '3 years'
       and not exists (select 1 from retail.separaciones s where s.clienta_id = c.id and s.estado = 'abierta')
       -- Un pedido web que todavía no termina (por confirmar, confirmado o pagado sin recoger) es como un apartado abierto.
       and not exists (select 1 from retail.pedidos_web p
                        where p.clienta_id = c.id and p.estado not in ('entregado', 'vencido', 'anulado'))
     order by c.id
       for update of c skip locked
  loop
    perform retail.fn_clienta_anonimizar(r.id, null, true);
    v_n := v_n + 1;
  end loop;

  update retail.club_intentos_registro i set celular = null
   where i.celular is not null and i.creado_en < now() - interval '1 day';

  return v_n;
end;
$$;

comment on function retail.fn_club_anonimizar_inactivas() is
  'La conservación del club (ADR-0288 G-15, ADR-0408): anonimiza las fichas sin compra ni entrada a su cuenta web en 3 años (sin compras: desde que se registró o se unió; con cuenta web: desde su última entrada o desde que la creó), con la rutina de archivar_clienta, sin persona y con su nota; no toca una con apartado abierto ni con un pedido web en curso. Al anonimizarse, su cuenta web se cierra (clientas_cuenta_web_al_anonimizar). Vacía el celular de los intentos del cartel de más de un día. Devuelve cuántas anonimizó. Solo el servidor (cron diario con CRON_SECRET).';

-- ---------- 8. La puerta: solo tienda_web ----------
revoke all on function retail.tienda_anotar_entrada(uuid) from public, anon, authenticated;
revoke all on function retail.tienda_usuarios_por_borrar(integer) from public, anon, authenticated;
revoke all on function retail.tienda_usuario_borrado(uuid) from public, anon, authenticated;
revoke all on function retail.tienda_revisar_registro(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function retail.tienda_anotar_entrada(uuid) to tienda_web;
grant execute on function retail.tienda_usuarios_por_borrar(integer) to tienda_web;
grant execute on function retail.tienda_usuario_borrado(uuid) to tienda_web;
grant execute on function retail.tienda_revisar_registro(text, text, text, text, text, text) to tienda_web;

reset lock_timeout;

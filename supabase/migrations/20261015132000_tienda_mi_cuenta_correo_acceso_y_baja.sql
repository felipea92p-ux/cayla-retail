-- ============================================================================
-- 20261015132000_tienda_mi_cuenta_correo_acceso_y_baja.sql — CAYLA V2 · Tienda online (ADR-0408) y Clientes (ADR-0288)
-- PARTE 2 de 2 de «Mi cuenta» (la PARTE 1, 20261015131000, deja la rutina de anonimizar lista para «a pedido suyo»).
--
-- EL PROBLEMA PRIMERO. Tres decisiones de Felipe (2026-10-15) sobre la cuenta de la tienda online:
--   1. «Cambiar mi correo» en Mi cuenta: el cliente escribe su correo nuevo y le llega un código de 6 cifras a ESE correo, como al crear
--      la cuenta; al escribirlo, cambian el correo con que entra (en el proyecto de inicio de sesión de los clientes) y el de
--      `cuentas_web`. Pide la contraseña actual, avisa al correo anterior y respeta los topes de los códigos.
--   2. «Si no puede entrar, hace una solicitud a CAYLA, que restablece»: en el ERP, quien tiene el módulo «Clientes» escribe el correo
--      nuevo que le da el cliente, y al cliente le llega a ese correo un código para confirmarlo y poner su contraseña nueva. Firma el
--      Responsable, queda en Actividad, avisa al correo anterior y el cambio solo ocurre cuando el código se confirma.
--   3. «Eliminar cuenta» en Mi cuenta: borra la cuenta web Y los datos de la ficha (deja de ser miembro del Club), con la anonimización
--      de siempre. Pide su contraseña. Con un pedido web en curso, todavía no.
--   Hasta hoy el correo de entrada no cambiaba nunca (20261015123000 lo dejó así a propósito: cambiarlo desde el ERP sin que ella
--   confirme el nuevo dejaba su cuenta en manos de quien escribió el correo), y una cuenta solo se cerraba por la conservación de 3 años
--   o si la tienda anonimizaba la ficha.
--
-- ANALOGÍA CAYLA. La llave de la vitrina web es su correo. Cambiar la cerradura se hace con la llave nueva en la mano: el código llega al
-- correo nuevo, y recién con él se cambia. Si perdió la llave, la tienda la reconoce en el mostrador (DNI en mano) y le hace llegar una
-- nueva a su correo nuevo; la de antes deja de servir y al dueño de la llave vieja se le avisa.
--
-- DÓNDE VIVE CADA COSA (ADR-0408, decisión 2: el ERP no conoce a los usuarios de los clientes).
--   El CÓDIGO lo genera, lo manda y lo verifica el proyecto de inicio de sesión de los clientes: su «cambio de correo» manda el código
--   SOLO al correo nuevo (plantilla `apps/tienda/supabase/plantillas/correo-nuevo.html`) y, al confirmarse, le avisa al correo anterior
--   (`correo-cambiado.html`). Lo medido en local el 2026-10-15 (GoTrue v2.196): con «Confirm email» encendido y «Secure email change»
--   apagado, el correo de entrada NO cambia hasta que se escribe el código; el código lo puede pedir el servidor de la tienda con la
--   sesión de ella (cambiar mi correo) o con una sesión de un solo uso que abre con su llave secreta (restablecer); verificarlo le
--   devuelve una sesión; y poner la contraseña nueva cierra todas las sesiones de antes.
--   Los TOPES (cuántos códigos y cuántos intentos) y QUÉ correo se puede pedir los lleva esta base, como en la actividad 2b: ese
--   proyecto no frena los intentos equivocados.
--
-- QUÉ HACE
--   1. `cuentas_web_cambios_correo`: el cambio de correo que está esperando su código, uno por cuenta (y un correo nuevo, en una sola
--      cuenta a la vez). Su origen (`cuenta`: lo pidió ella con su sesión; `tienda`: lo pidió una persona del ERP), los topes de la 2b
--      (60 s entre un código y otro, 5 por hora, cada código vence a los 30 minutos con 5 intentos, y el quinto equivocado bloquea 15
--      minutos) y, si lo pidió el ERP, la ficha de un solo uso con que el ERP le pide a la tienda el primer envío (`token_hash`: su
--      sha256; la ficha viaja una vez y vence a los 10 minutos). Vive un día; se va al confirmarse o al cerrarse la cuenta.
--   2. `cuentas_web_intentos_clave`: los intentos de contraseña de «Cambiar mi correo» y «Eliminar cuenta» (5 cada 15 minutos; con el
--      quinto, 15 minutos de bloqueo). El proyecto de clientes los ve todos desde la ip del servidor: sin esto, quien tuviera una sesión
--      robada probaría contraseñas sin freno, y gastaría el tope de inicio de sesión de esa ip, que es de todos.
--   3. La tienda (rol `tienda_web`, la puerta angosta): `tienda_pedir_cambio_correo`, `tienda_intento_cambio_correo`,
--      `tienda_correo_confirmado` (también la reconciliación de «Mi cuenta»), `tienda_restablecer_enviar` (el primer envío, con la
--      ficha del ERP), `tienda_restablecer_reenviar` y `tienda_restablecer_intento` (la página pública «Restablecer mi acceso»),
--      `tienda_intento_de_clave` y `tienda_clave_correcta`, `tienda_antes_de_eliminar` y `tienda_eliminar_mi_cuenta`.
--   4. El ERP (módulo «Clientes»): `restablecer_acceso_tienda_web` (firma el Responsable y anota la Actividad) y `fn_clienta_acceso_web`
--      (lo que la ficha muestra del restablecimiento pendiente).
--   5. Al cerrarse una cuenta (se anonimizó su ficha, por cualquier camino), su cambio pendiente y sus intentos de contraseña se van en
--      la misma escritura (disparador `cuentas_web_limpiar_al_cerrar`): el correo nuevo que esperaba también es un dato suyo.
--
-- EL ORDEN SEGURO (principio 9; lo hace el servidor de la tienda, `apps/tienda/app/acciones/mi-cuenta.ts` y
-- `app/api/restablecer-acceso/route.ts`):
--   Cambiar mi correo: contraseña (`tienda_intento_de_clave` → el proyecto la prueba → `tienda_clave_correcta`) → la base revisa el correo
--     y reserva el envío (`tienda_pedir_cambio_correo`) → el proyecto manda el código al correo nuevo → con el código: la base cuenta el
--     intento (`tienda_intento_cambio_correo`) → el proyecto lo verifica (el correo de entrada cambia ahí y avisa al anterior) → la base
--     aplica el correo que el PROYECTO dice que quedó (`tienda_correo_confirmado`). Si la base dice que no (otra persona lo tomó en el
--     medio), el servidor devuelve el correo de antes en el proyecto.
--   Restablecer: el ERP pide (`restablecer_acceso_tienda_web`, que devuelve la ficha de un uso) → el servidor del ERP se la pasa a la
--     tienda → la tienda la canjea (`tienda_restablecer_enviar`: reserva el envío) y el proyecto manda el código al correo nuevo → en la
--     página «Restablecer mi acceso» ella escribe su correo nuevo, el código y su contraseña nueva: la base cuenta el intento
--     (`tienda_restablecer_intento`) → el proyecto verifica el código → se pone la contraseña nueva (cierra toda sesión de antes) → la
--     base aplica el correo (`tienda_correo_confirmado`). Si el ERP no llega a la tienda, la solicitud queda y ella pide su código desde
--     esa página (`tienda_restablecer_reenviar`).
--   Eliminar: contraseña → `tienda_eliminar_mi_cuenta` (frena con un pedido web en curso o un apartado abierto; si no, anonimiza a pedido
--     suyo: la cuenta se cierra en la misma escritura) → el servidor borra su usuario del proyecto de clientes (si no contesta, la ruta de
--     la madrugada lo hace, `/api/cuentas-cerradas`).
--
-- DECIDÍ: el proyecto de clientes es la autoridad de «el código se confirmó» (su verificación es la única que cambia el correo de
--   entrada), y la base, de «este cambio se pidió y estaba permitido». `tienda_correo_confirmado` recibe el correo que el PROYECTO dice que
--   quedó —nunca lo que escribió la persona— y lo aplica solo si hay un cambio pedido a ese correo. Así también se ponen al día los dos si
--   ella confirma el código directo contra el proyecto (su puerta es pública): «Mi cuenta» ve el correo distinto y lo concilia.
-- DECIDÍ: el correo nuevo no puede ser el de entrada de otra cuenta, ni el de contacto de otra ficha, ni el que otra cuenta está
--   confirmando ahora (un correo es de una sola persona, 20261015054000). El de contacto de SU ficha sí. A ella no se le dice de quién es;
--   al ERP sí (lo ve quien edita fichas, como en `editar_clienta`).
-- DECIDÍ: el correo de CONTACTO de la ficha (`clientas.correo`) no cambia con el de entrada (como 20261015123000 al revés). Queda como
--   pregunta para Felipe en el informe: si eran el mismo, ¿el de contacto debería seguir al nuevo?
-- DECIDÍ: «Eliminar cuenta» frena con un pedido web en curso (por confirmar dentro de su plazo, confirmado o pagado sin entregar: decidido
--   por la sesión principal, para no dejar un pedido sin dueño) y TAMBIÉN con un apartado abierto en tienda: es la misma regla con que la
--   conservación de 3 años no anonimiza (se le debe una prenda), y ella no lo puede cerrar sola. Le dice cuáles y qué hacer.
-- DECIDÍ: una función que solo REVISA, RESERVA o CUENTA nunca lanza un error de negocio después de contar (como la 2b): devuelve {estado}.
--   Un error desharía lo contado, y probar códigos o contraseñas saldría gratis. Las del ERP sí lanzan (con su hint): no cuentan nada.
-- DECIDÍ: la ficha del ERP es una cadena al azar de 64 cifras hexadecimales (dos `gen_random_uuid`, que salen del generador fuerte de
--   Postgres: sin pgcrypto) y la base guarda solo su sha256. Sirve una vez, durante 10 minutos, y solo para MANDAR el código al correo que
--   escribió la tienda: con ella nadie entra a ninguna cuenta.
-- DESCARTÉ: cambiar el correo de entrada desde el ERP sin código (la cuenta quedaría en manos de quien escribió el correo); que el ERP
--   tenga la llave del proyecto de clientes (ADR-0408, decisión 2); una tabla de historia de cambios de correo (el correo nuevo es un dato
--   personal: lo que queda es la Actividad, sin datos suyos, y `cuentas_web.correo`).
--
-- SE ROMPE SI: una función nueva cambia `cuentas_web.correo` sin pasar por `tienda_correo_confirmado`; alguien enciende «Secure email
--   change» o apaga «Confirm email» en el proyecto de clientes (con «Confirm email» apagado, el correo de entrada cambia SIN código: lo
--   prueba la actividad de «Mi cuenta» en el navegador, no esta base); o la plantilla del correo nuevo vuelve a llevar el enlace de
--   confirmación del proyecto (`{{ .ConfirmationURL }}`), que cambia el correo sin pasar por la tienda.
--
-- PRODUCCIÓN. NO está aplicada. Va DESPUÉS de la PARTE 1 (20261015131000) y de las migraciones de la tienda (cuentas, pedidos web,
-- 20261015055000). Una sola parte, idempotente (se puede pegar dos veces). Crea tablas nuevas y funciones, y engancha dos disparadores a
-- `cuentas_web` (todavía sin uso en producción; `create or replace trigger`, sin `drop trigger`). Sin políticas: las tablas nuevas tienen
-- RLS sin políticas (solo las leen funciones security definer). Ningún `select … into` dentro de un texto entre comillas. Además, en el
-- proyecto de CLIENTES (panel de Supabase, a mano): «Confirm email» ENCENDIDO, «Secure email change» APAGADO, la plantilla «Change email
-- address» con `apps/tienda/supabase/plantillas/correo-nuevo.html` y el aviso de seguridad «Email address changed» encendido con
-- `correo-cambiado.html` (los mismos ajustes de `apps/tienda/supabase/config.toml`). Y en el ERP, la variable `TIENDA_URL`.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('tienda_pedir_cambio_correo',
--     'tienda_intento_cambio_correo', 'tienda_correo_confirmado', 'tienda_restablecer_enviar', 'tienda_restablecer_reenviar',
--     'tienda_restablecer_intento', 'tienda_intento_de_clave', 'tienda_clave_correcta', 'tienda_antes_de_eliminar',
--     'tienda_eliminar_mi_cuenta', 'restablecer_acceso_tienda_web', 'fn_clienta_acceso_web');   → 12
--   select has_function_privilege('tienda_web', 'retail.tienda_eliminar_mi_cuenta(uuid)', 'execute'),
--          has_function_privilege('authenticated', 'retail.restablecer_acceso_tienda_web(uuid,text)', 'execute');   → t | t
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Lo que da por hecho y el candado de versión (si algo no calza, no se toca nada) ----------
do $guarda$
declare
  r record;
  v_md5 text;
begin
  if to_regprocedure('retail.fn_clienta_anonimizar(uuid,uuid,boolean,text)') is null then
    raise exception 'Falta la PARTE 1 (la anonimización a pedido suyo): pega antes 20261015131000_clientas_anonimizar_espera_pedido_pagado.sql.';
  end if;
  if to_regprocedure('retail.tienda_anotar_entrada(uuid)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'cuentas_web' and column_name = 'cerrada_en') then
    raise exception 'Falta la cuenta que se cierra al anonimizar: pega antes 20261015055000_tienda_cuentas_entrada_y_cierre.sql.';
  end if;
  if to_regprocedure('retail.fn_pedido_web_plazos()') is null or to_regclass('retail.ubicacion_datos_web') is null then
    raise exception 'Faltan los pedidos web y los datos web de las tiendas: pega antes sus migraciones (20261014231000, 20261014235000 y 20261015010000).';
  end if;
  if to_regprocedure('retail.club_intento(text,text,text,text)') is null or to_regprocedure('retail.fn_cuenta_web_correo(text)') is null then
    raise exception 'Faltan los topes del Club y las cuentas de la tienda: pega antes la tanda 1g del Club y 20261014224000.';
  end if;
  for r in
    select * from (values
      -- firma                                                       antes  despues (este archivo)
      ('retail.fn_cambio_correo_libre(uuid,text)',                    null,  'c9b88515cf53221bb4c94f005ec929d3'),
      ('retail.fn_cambio_correo_limpiar(text)',                       null,  'b95013aa1bdb782605d4d005267ded1e'),
      ('retail.fn_cambio_correo_reservar_envio(uuid,text,text)',      null,  '4729e88d25e8abbec008883b1280affb'),
      ('retail.fn_cambio_correo_contar_intento(uuid)',                null,  'e284f07cad4d9283b5fb8a522c7ff837'),
      ('retail.fn_cambio_correo_reglas()',                            null,  '692b8651b8a351ea669c2c8c5ee1b712'),
      ('retail.fn_cuentas_web_limpiar_al_cerrar()',                   null,  '468b9e19e745f11659766b15951061ae'),
      ('retail.fn_cuenta_web_lo_que_frena(uuid)',                     null,  '71b60b9524080ab3457fe316acf079bd'),
      ('retail.tienda_pedir_cambio_correo(uuid,text,boolean)',        null,  'eb0b4c3b5b384157ed38b43af1ca2046'),
      ('retail.tienda_intento_cambio_correo(uuid,text)',              null,  '25c10e181bab6f06649268c38cd74746'),
      ('retail.tienda_correo_confirmado(uuid,text)',                  null,  '1273a486403c9ba09af028494b9067b0'),
      ('retail.tienda_restablecer_enviar(text)',                      null,  'fdadee70cb6f42ce640965cce77a8306'),
      ('retail.tienda_restablecer_reenviar(text,text)',               null,  '2a39b1b73884176ccaecc47ea49f1e2d'),
      ('retail.tienda_restablecer_intento(text,text)',                null,  '96fb815675c20270ddd67389f86539dd'),
      ('retail.tienda_intento_de_clave(uuid)',                        null,  '18fefea8ddb5224e1f2b8f3a445e162d'),
      ('retail.tienda_clave_correcta(uuid)',                          null,  '6f900706c3af7887d9d132b2992bcbfd'),
      ('retail.tienda_antes_de_eliminar(uuid)',                       null,  'ac55510a7b3a97bcfba3c02b5da39dbf'),
      ('retail.tienda_eliminar_mi_cuenta(uuid)',                      null,  '87c6e3e76fc500e979a47b378dad6040'),
      ('retail.restablecer_acceso_tienda_web(uuid,text)',             null,  '96d246b4aec2107c3e770dac24ad5fec'),
      ('retail.fn_clienta_acceso_web(uuid)',                          null,  'c7a61900234ffeccdab9b64b94c5d6c1')
    ) as t(firma, antes, despues)
  loop
    v_md5 := (select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
                from pg_proc p where p.oid = to_regprocedure(r.firma));
    if v_md5 is not null and v_md5 is distinct from r.antes and v_md5 is distinct from r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, coalesce(r.antes, 'que no exista'), r.despues;
    end if;
  end loop;
end
$guarda$;

-- ---------- 1. Las tablas ----------
create table if not exists retail.cuentas_web_cambios_correo (
  cuenta_web_id   uuid primary key references retail.cuentas_web (id),
  correo_nuevo    text not null,
  origen          text not null,
  pedido_en       timestamptz not null default now(),
  vence_en        timestamptz not null,
  envios          integer not null default 0,
  primer_envio_en timestamptz,
  ultimo_envio_en timestamptz,
  codigo_vence_en timestamptz,
  intentos        integer not null default 0,
  bloqueado_hasta timestamptz,
  token_hash      text,
  token_vence_en  timestamptz,
  constraint cuentas_web_cambios_correo_formato check (correo_nuevo = lower(btrim(correo_nuevo)) and char_length(correo_nuevo) <= 254
                                                     and correo_nuevo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint cuentas_web_cambios_correo_origen check (origen in ('cuenta', 'tienda')),
  constraint cuentas_web_cambios_correo_cuentas check (envios >= 0 and intentos >= 0),
  constraint cuentas_web_cambios_correo_vence check (vence_en > pedido_en),
  constraint cuentas_web_cambios_correo_ficha check ((token_hash is null) = (token_vence_en is null)
                                                   and (token_hash is null or (origen = 'tienda' and token_hash ~ '^[0-9a-f]{64}$')))
);
create unique index if not exists cuentas_web_cambios_correo_correo_unico on retail.cuentas_web_cambios_correo (correo_nuevo);
create unique index if not exists cuentas_web_cambios_correo_ficha_unica on retail.cuentas_web_cambios_correo (token_hash) where token_hash is not null;

comment on table retail.cuentas_web_cambios_correo is
  'Tienda online (ADR-0408, Felipe 2026-10-15): el cambio del correo de ENTRADA de una cuenta que espera su código, uno por cuenta y un correo nuevo en una sola cuenta a la vez. origen: cuenta (lo pidió ella en Mi cuenta) o tienda (lo pidió una persona del ERP, «Restablecer acceso»). Los topes de la actividad 2b (60 s entre códigos, 5 por hora, 30 min y 5 intentos por código, 15 min de bloqueo). token_hash: el sha256 de la ficha de un solo uso con que el ERP le pide a la tienda el primer envío (10 min). Vive un día; se va al confirmarse el código (tienda_correo_confirmado) o al cerrarse la cuenta. RLS sin políticas: la leen y la escriben las funciones de 20261015132000.';
comment on column retail.cuentas_web_cambios_correo.correo_nuevo is
  'El correo al que se mandó el código (en minúsculas y sin espacios). Un dato personal: se va con la fila.';

alter table retail.cuentas_web_cambios_correo enable row level security;
revoke all on retail.cuentas_web_cambios_correo from public, anon, authenticated;

create table if not exists retail.cuentas_web_intentos_clave (
  cuenta_web_id     uuid primary key references retail.cuentas_web (id),
  intentos          integer not null default 0,
  primer_intento_en timestamptz not null default now(),
  bloqueada_hasta   timestamptz,
  constraint cuentas_web_intentos_clave_cuenta check (intentos >= 0)
);
comment on table retail.cuentas_web_intentos_clave is
  'Tienda online (ADR-0408, Felipe 2026-10-15): los intentos de contraseña de «Cambiar mi correo» y «Eliminar cuenta», por cuenta: 5 cada 15 minutos; con el quinto, 15 minutos de bloqueo (los mismos topes de los códigos). Cada intento se cuenta ANTES de probarse; uno bueno los borra. RLS sin políticas.';
alter table retail.cuentas_web_intentos_clave enable row level security;
revoke all on retail.cuentas_web_intentos_clave from public, anon, authenticated;

-- ---------- 2. Los candados de las tablas nuevas ----------
-- Un cambio de correo solo existe para una cuenta ABIERTA (una cerrada no tiene correo de entrada que cambiar).
create or replace function retail.fn_cambio_correo_reglas()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if not exists (select 1 from retail.cuentas_web w where w.id = new.cuenta_web_id and w.cerrada_en is null) then
    raise exception 'Esa cuenta de la tienda online está cerrada.' using errcode = '23514', hint = 'cuenta_web_cerrada';
  end if;
  return new;
end;
$$;
comment on function retail.fn_cambio_correo_reglas() is
  'Disparador de cuentas_web_cambios_correo y cuentas_web_intentos_clave (ADR-0408): solo para una cuenta abierta (23514 cuenta_web_cerrada).';
revoke all on function retail.fn_cambio_correo_reglas() from public, anon, authenticated;

create or replace trigger cuentas_web_cambios_correo_reglas before insert or update on retail.cuentas_web_cambios_correo
  for each row
  execute function retail.fn_cambio_correo_reglas();
create or replace trigger cuentas_web_intentos_clave_reglas before insert or update on retail.cuentas_web_intentos_clave
  for each row
  execute function retail.fn_cambio_correo_reglas();

-- Al cerrarse una cuenta (su ficha se anonimizó, por cualquier camino), su cambio pendiente y sus intentos se van en la misma escritura.
create or replace function retail.fn_cuentas_web_limpiar_al_cerrar()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  delete from retail.cuentas_web_cambios_correo m where m.cuenta_web_id = new.id;
  delete from retail.cuentas_web_intentos_clave i where i.cuenta_web_id = new.id;
  return null;
end;
$$;
comment on function retail.fn_cuentas_web_limpiar_al_cerrar() is
  'Disparador de cuentas_web (ADR-0408): al cerrarse la cuenta, se van su cambio de correo pendiente (con el correo nuevo, un dato suyo) y sus intentos de contraseña.';
revoke all on function retail.fn_cuentas_web_limpiar_al_cerrar() from public, anon, authenticated;

create or replace trigger cuentas_web_limpiar_al_cerrar after update of cerrada_en on retail.cuentas_web
  for each row
  when (new.cerrada_en is not null and old.cerrada_en is null)
  execute function retail.fn_cuentas_web_limpiar_al_cerrar();

-- ---------- 3. Los ayudantes (nadie de la API los ejecuta) ----------
-- ¿Ese correo puede ser el nuevo de esta cuenta? null = sí. Si no: mismo_correo | de_otra_cuenta | de_otra_ficha | pedido_por_otra_cuenta.
create or replace function retail.fn_cambio_correo_libre(p_cuenta uuid, p_correo text)
returns text
language sql
stable
set search_path = retail, public
as $$
  select case
    when exists (select 1 from retail.cuentas_web w where w.id = p_cuenta and w.correo = p_correo) then 'mismo_correo'
    when exists (select 1 from retail.cuentas_web w where w.correo = p_correo and w.id <> p_cuenta) then 'de_otra_cuenta'
    -- El de contacto de SU ficha sí (la misma persona puede tener los dos).
    when exists (select 1 from retail.clientas c
                  where lower(btrim(c.correo)) = p_correo
                    and c.id is distinct from (select w.clienta_id from retail.cuentas_web w where w.id = p_cuenta)) then 'de_otra_ficha'
    -- Vivo: el pedido no venció (un día) o su último código todavía sirve (30 minutos).
    when exists (select 1 from retail.cuentas_web_cambios_correo m
                  where m.correo_nuevo = p_correo and m.cuenta_web_id <> p_cuenta
                    and (m.vence_en > now() or m.codigo_vence_en > now())) then 'pedido_por_otra_cuenta'
  end;
$$;
comment on function retail.fn_cambio_correo_libre(uuid, text) is
  'Ayudante (ADR-0408): ¿el correo (ya normalizado) puede ser el nuevo correo de entrada de esta cuenta? null = sí; si no, mismo_correo | de_otra_cuenta | de_otra_ficha | pedido_por_otra_cuenta (un correo es de una sola persona). El de contacto de su propia ficha sí puede.';

-- Lo que está muerto (el pedido venció —un día— y su último código también —30 minutos—) ya no sirve: se va. Hasta 20 por vez, y todos
-- los de `p_correo` (así un pedido viejo de otra cuenta no le traba ese correo a nadie).
create or replace function retail.fn_cambio_correo_limpiar(p_correo text default null)
returns integer
language plpgsql
volatile
set search_path = retail, public
as $$
declare
  v_n integer;
begin
  delete from retail.cuentas_web_cambios_correo m
   where m.vence_en <= now() and (m.codigo_vence_en is null or m.codigo_vence_en <= now())
     and (m.correo_nuevo = p_correo
          or m.cuenta_web_id in (select q.cuenta_web_id from retail.cuentas_web_cambios_correo q
                                  where q.vence_en <= now() and (q.codigo_vence_en is null or q.codigo_vence_en <= now())
                                  order by q.vence_en limit 20));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function retail.fn_cambio_correo_limpiar(text) is
  'Ayudante (ADR-0408): borra los cambios de correo muertos (el pedido venció y su último código también): hasta 20 por vez y todos los del correo p_correo. Lo llaman las funciones que piden un cambio.';

-- ¿Se puede mandar un código ahora? Los topes de la 2b, sobre la fila de esa cuenta (tomada). Con `p_correo`, si se puede, el cambio pasa
-- a ese correo y a ese origen (y su código de antes deja de valer). Nunca lanza: devuelve {estado}.
create or replace function retail.fn_cambio_correo_reservar_envio(p_cuenta uuid, p_correo text default null, p_origen text default null)
returns jsonb
language plpgsql
volatile
set search_path = retail, public
as $$
declare
  v_ahora timestamptz := now();
  v_hay boolean := false;
  v_envios integer;
  v_primer timestamptz;
  v_ultimo timestamptz;
  v_bloqueado timestamptz;
  v_nuevo boolean;
begin
  for v_envios, v_primer, v_ultimo, v_bloqueado in
    select m.envios, m.primer_envio_en, m.ultimo_envio_en, m.bloqueado_hasta
      from retail.cuentas_web_cambios_correo m
     where m.cuenta_web_id = p_cuenta
       for update
  loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    return jsonb_build_object('estado', 'sin_pedido');
  end if;
  if v_bloqueado > v_ahora then
    return jsonb_build_object('estado', 'bloqueado', 'minutos', ceil(extract(epoch from v_bloqueado - v_ahora) / 60)::integer);
  end if;
  if v_ultimo > v_ahora - interval '60 seconds' then
    return jsonb_build_object('estado', 'esperar', 'segundos', ceil(extract(epoch from v_ultimo + interval '60 seconds' - v_ahora))::integer);
  end if;
  if v_primer > v_ahora - interval '1 hour' and v_envios >= 5 then
    return jsonb_build_object('estado', 'limite', 'minutos', ceil(extract(epoch from v_primer + interval '1 hour' - v_ahora) / 60)::integer);
  end if;
  v_nuevo := v_primer is null or v_primer <= v_ahora - interval '1 hour';
  update retail.cuentas_web_cambios_correo m set
    correo_nuevo = coalesce(p_correo, m.correo_nuevo),
    origen = coalesce(p_origen, m.origen),
    token_hash = case when p_origen = 'cuenta' then null else m.token_hash end,
    token_vence_en = case when p_origen = 'cuenta' then null else m.token_vence_en end,
    -- Un pedido nuevo (otro correo, o el mismo pedido otra vez) vive un día; «Pedir otro código» no lo alarga: un código mandado al
    -- final del día igual sirve sus 30 minutos (codigo_vence_en).
    pedido_en = case when p_correo is not null then v_ahora else m.pedido_en end,
    vence_en = case when p_correo is not null then v_ahora + interval '1 day' else m.vence_en end,
    primer_envio_en = case when v_nuevo then v_ahora else m.primer_envio_en end,
    envios = case when v_nuevo then 1 else m.envios + 1 end,
    ultimo_envio_en = v_ahora,
    codigo_vence_en = v_ahora + interval '30 minutes',
    intentos = 0,
    bloqueado_hasta = null
  where m.cuenta_web_id = p_cuenta;
  return jsonb_build_object('estado', 'enviar');
end;
$$;
comment on function retail.fn_cambio_correo_reservar_envio(uuid, text, text) is
  'Ayudante (ADR-0408): ¿se puede mandar ahora un código del cambio de correo de esta cuenta? {estado: sin_pedido | bloqueado (minutos) | esperar (segundos) | limite (minutos) | enviar}: 60 s entre uno y otro, 5 por hora, nada mientras dure un bloqueo. Con enviar lo anota (el código vence a los 30 minutos y los intentos vuelven a cero) y, si se pasa p_correo, el cambio pasa a ese correo (y a p_origen). Nunca lanza.';

-- ¿Se puede probar un código ahora? Cada intento cuenta ANTES de probarse; el quinto deja 15 minutos de bloqueo. Nunca lanza.
create or replace function retail.fn_cambio_correo_contar_intento(p_cuenta uuid)
returns jsonb
language plpgsql
volatile
set search_path = retail, public
as $$
declare
  v_ahora timestamptz := now();
  v_hay boolean := false;
  v_intentos integer;
  v_vence timestamptz;
  v_bloqueado timestamptz;
begin
  for v_intentos, v_vence, v_bloqueado in
    select m.intentos, m.codigo_vence_en, m.bloqueado_hasta
      from retail.cuentas_web_cambios_correo m
     where m.cuenta_web_id = p_cuenta
       for update
  loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    return jsonb_build_object('estado', 'sin_pedido');
  end if;
  if v_bloqueado > v_ahora then
    return jsonb_build_object('estado', 'bloqueado', 'minutos', ceil(extract(epoch from v_bloqueado - v_ahora) / 60)::integer);
  end if;
  if v_vence is null or v_vence <= v_ahora or v_intentos >= 5 then
    return jsonb_build_object('estado', 'vencido');
  end if;
  update retail.cuentas_web_cambios_correo m
     set intentos = v_intentos + 1,
         bloqueado_hasta = case when v_intentos + 1 >= 5 then v_ahora + interval '15 minutes' else m.bloqueado_hasta end
   where m.cuenta_web_id = p_cuenta;
  return jsonb_build_object('estado', 'puede', 'quedan', 5 - (v_intentos + 1));
end;
$$;
comment on function retail.fn_cambio_correo_contar_intento(uuid) is
  'Ayudante (ADR-0408): ¿se puede probar ahora un código del cambio de correo de esta cuenta? {estado: sin_pedido | bloqueado (minutos) | vencido | puede (quedan)}. Cada intento cuenta antes de probarse; con el quinto queda un bloqueo de 15 minutos. Nunca lanza.';

-- Lo que frena «Eliminar cuenta»: sus pedidos web en curso y sus apartados abiertos, con la tienda (su nombre en la web) y su WhatsApp.
create or replace function retail.fn_cuenta_web_lo_que_frena(p_clienta uuid)
returns jsonb
language sql
stable
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    -- Por confirmar dentro de su plazo (pasado, ya se LEE vencido), confirmados y pagados sin entregar: la regla de fn_clienta_tienda_online.
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', w.codigo, 'numero', w.numero, 'estado', w.estado,
                                          'tienda', coalesce(dw.nombre_web, u.nombre), 'whatsapp', u.whatsapp_numero)
                       order by w.creado_en, w.numero)
        from retail.pedidos_web w
        join retail.ubicaciones u on u.id = w.ubicacion_id
        left join retail.ubicacion_datos_web dw on dw.ubicacion_id = u.id
       where w.clienta_id = p_clienta
         and w.estado in ('por_confirmar', 'confirmado', 'pagado')
         and not (w.estado = 'por_confirmar'
                  and now() >= w.creado_en + make_interval(hours => (select z.horas_para_confirmar from retail.fn_pedido_web_plazos() z)))
    ), '[]'::jsonb),
    -- Un apartado abierto en tienda: la conservación de 3 años tampoco anonimiza con uno (se le debe una prenda).
    'apartados', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', s.codigo, 'tienda', coalesce(dw.nombre_web, u.nombre), 'whatsapp', u.whatsapp_numero)
                       order by s.created_at, s.codigo)
        from retail.separaciones s
        join retail.ubicaciones u on u.id = s.ubicacion_id
        left join retail.ubicacion_datos_web dw on dw.ubicacion_id = u.id
       where s.clienta_id = p_clienta and s.estado = 'abierta'
    ), '[]'::jsonb)
  );
$$;
comment on function retail.fn_cuenta_web_lo_que_frena(uuid) is
  'Ayudante (ADR-0408): lo que frena «Eliminar cuenta» de una ficha {pedidos: [{codigo, numero, estado, tienda, whatsapp}], apartados: [{codigo, tienda, whatsapp}]}: los pedidos web en curso (por confirmar dentro de su plazo, confirmados y pagados sin entregar) y los apartados abiertos.';

revoke all on function retail.fn_cambio_correo_libre(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_cambio_correo_limpiar(text) from public, anon, authenticated;
revoke all on function retail.fn_cambio_correo_reservar_envio(uuid, text, text) from public, anon, authenticated;
revoke all on function retail.fn_cambio_correo_contar_intento(uuid) from public, anon, authenticated;
revoke all on function retail.fn_cuenta_web_lo_que_frena(uuid) from public, anon, authenticated;

-- ---------- 4. Cambiar mi correo (ella, con su sesión) ----------
create or replace function retail.tienda_pedir_cambio_correo(p_usuario_web_id uuid, p_correo text, p_reenvio boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
  v_hay boolean := false;
  v_cuenta uuid;
  v_actual text;
  v_libre text;
  v_reserva jsonb;
begin
  if p_usuario_web_id is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  -- La cuenta, tomada: si se cierra en este instante, esto espera y ya no la encuentra.
  for v_cuenta, v_actual in
    select w.id, w.correo from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id for update
  loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if v_correo is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  -- «Pedir otro código» solo para el correo que ya pidió (al pedirlo, el servidor probó su contraseña): así nadie con una sesión
  -- robada manda códigos a un correo cualquiera sin pasar por la contraseña.
  if coalesce(p_reenvio, false) and not exists (
       select 1 from retail.cuentas_web_cambios_correo m
        where m.cuenta_web_id = v_cuenta and m.correo_nuevo = v_correo and m.origen = 'cuenta' and m.vence_en > now()) then
    return jsonb_build_object('estado', 'sin_pedido');
  end if;
  perform retail.fn_cambio_correo_limpiar(v_correo);
  v_libre := retail.fn_cambio_correo_libre(v_cuenta, v_correo);
  if v_libre = 'mismo_correo' then
    return jsonb_build_object('estado', 'mismo_correo');
  elsif v_libre is not null then
    -- A ella no se le dice de quién es (como al crear la cuenta).
    return jsonb_build_object('estado', 'correo_de_otra_persona');
  end if;
  begin
    insert into retail.cuentas_web_cambios_correo (cuenta_web_id, correo_nuevo, origen, pedido_en, vence_en)
    values (v_cuenta, v_correo, 'cuenta', now(), now() + interval '1 day')
    on conflict (cuenta_web_id) do nothing;
    -- Los topes se miran sobre la fila que ya había (si había): el correo de destino cambia solo si se puede mandar ahora.
    v_reserva := retail.fn_cambio_correo_reservar_envio(v_cuenta, v_correo, 'cuenta');
  exception when unique_violation then
    -- Otra cuenta pidió ese mismo correo en este instante.
    return jsonb_build_object('estado', 'correo_de_otra_persona');
  end;
  if v_reserva ->> 'estado' = 'enviar' then
    return v_reserva || jsonb_build_object('correo_actual', v_actual, 'correo_nuevo', v_correo);
  end if;
  return v_reserva;
end;
$$;
comment on function retail.tienda_pedir_cambio_correo(uuid, text, boolean) is
  'Tienda online (ADR-0408, Felipe 2026-10-15): «Cambiar mi correo». ¿Se puede mandar ahora un código al correo nuevo de la cuenta de ese usuario? {estado: sin_cuenta | invalido | sin_pedido (un reenvío a un correo que no pidió en Mi cuenta) | mismo_correo | correo_de_otra_persona (de otra cuenta, de otra ficha o lo está confirmando otra cuenta; no dice de quién) | bloqueado (minutos) | esperar (segundos) | limite (minutos) | enviar (correo_actual, correo_nuevo)}. Con enviar lo anota (vence a los 30 minutos). La contraseña la prueba antes el servidor (tienda_intento_de_clave); p_reenvio («Pedir otro código») solo vale para el correo que ya pidió. Solo la llama tienda_web.';

create or replace function retail.tienda_intento_cambio_correo(p_usuario_web_id uuid, p_correo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
  v_cuenta uuid;
begin
  v_cuenta := (select w.id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id);
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if v_correo is null or not exists (select 1 from retail.cuentas_web_cambios_correo m
                                      where m.cuenta_web_id = v_cuenta and m.correo_nuevo = v_correo) then
    return jsonb_build_object('estado', 'sin_pedido');
  end if;
  return retail.fn_cambio_correo_contar_intento(v_cuenta);
end;
$$;
comment on function retail.tienda_intento_cambio_correo(uuid, text) is
  'Tienda online (ADR-0408): ¿se puede probar ahora el código del correo nuevo de la cuenta de ese usuario? {estado: sin_cuenta | sin_pedido (no pidió un cambio a ese correo) | bloqueado (minutos) | vencido | puede (quedan)}. Cada intento cuenta antes de probarse; con el quinto, 15 minutos de bloqueo. Solo la llama tienda_web.';

-- ---------- 5. El correo que el proyecto de clientes dice que quedó: se aplica si se pidió ----------
create or replace function retail.tienda_correo_confirmado(p_usuario_web_id uuid, p_correo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
  v_hay boolean := false;
  v_cuenta uuid;
  v_ficha uuid;
  v_actual text;
  v_origen text;
begin
  if p_usuario_web_id is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  for v_cuenta, v_ficha, v_actual in
    select w.id, w.clienta_id, w.correo from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id for update
  loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if v_correo is null then
    return jsonb_build_object('estado', 'invalido', 'correo_actual', v_actual);
  end if;
  if v_correo = v_actual then
    -- Ya estaba (dos pestañas, o la página que concilia después de que la acción lo aplicó): nada que hacer.
    delete from retail.cuentas_web_cambios_correo m where m.cuenta_web_id = v_cuenta and m.correo_nuevo = v_correo;
    return jsonb_build_object('estado', 'igual');
  end if;
  v_origen := (select m.origen from retail.cuentas_web_cambios_correo m where m.cuenta_web_id = v_cuenta and m.correo_nuevo = v_correo);
  if v_origen is null then
    -- Nadie pidió este cambio (o se venció hace más de un día): el servidor devuelve el correo de antes en el proyecto de clientes.
    return jsonb_build_object('estado', 'sin_pedido', 'correo_actual', v_actual);
  end if;
  begin
    update retail.cuentas_web w set correo = v_correo where w.id = v_cuenta;
  exception when unique_violation then
    -- Otra persona lo tomó entre el pedido y el código (fn_correo_de_una_persona): el servidor devuelve el de antes.
    return jsonb_build_object('estado', 'de_otra_persona', 'correo_actual', v_actual);
  end;
  delete from retail.cuentas_web_cambios_correo m where m.cuenta_web_id = v_cuenta;
  -- Sin datos suyos: quién es queda en registro_id (su ficha), y lo hizo ella con su código (sin persona del ERP).
  perform retail.fn_actividad_anotar(
    'clientas', 'correo_web',
    case when v_origen = 'tienda' then 'un cliente confirmó su correo nuevo y recuperó su cuenta de la tienda online (el acceso se pidió en tienda)'
         else 'un cliente cambió el correo con que entra a la tienda online' end,
    null, null, null, null, 'clientas', v_ficha::text, now(),
    jsonb_build_object('origen', v_origen), 'vivo'
  );
  return jsonb_build_object('estado', 'aplicado', 'origen', v_origen);
end;
$$;
comment on function retail.tienda_correo_confirmado(uuid, text) is
  'Tienda online (ADR-0408): el proyecto de clientes dice que el correo de entrada de ese usuario quedó en p_correo (su código se confirmó). Se aplica a cuentas_web solo si hay un cambio pedido a ese correo. {estado: sin_cuenta | invalido | igual | sin_pedido (correo_actual: el servidor devuelve ese en el proyecto) | de_otra_persona (otra persona lo tomó en el medio; correo_actual) | aplicado (origen)}. La llaman la acción del código y «Mi cuenta» cuando ve el correo distinto. Solo la llama tienda_web.';

-- ---------- 6. Restablecer el acceso (lo pidió la tienda en el ERP) ----------
create or replace function retail.tienda_restablecer_enviar(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_hay boolean := false;
  v_cuenta uuid;
  v_usuario uuid;
  v_actual text;
  v_nuevo text;
  v_reserva jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('estado', 'invalido');
  end if;
  for v_cuenta, v_usuario, v_actual, v_nuevo in
    select m.cuenta_web_id, w.usuario_web_id, w.correo, m.correo_nuevo
      from retail.cuentas_web_cambios_correo m
      join retail.cuentas_web w on w.id = m.cuenta_web_id
     where m.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
       and m.token_vence_en > now() and m.origen = 'tienda' and w.cerrada_en is null
       for update of m
  loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    return jsonb_build_object('estado', 'invalido');
  end if;
  -- La ficha sirve una sola vez, se mande o no el código.
  update retail.cuentas_web_cambios_correo m set token_hash = null, token_vence_en = null where m.cuenta_web_id = v_cuenta;
  v_reserva := retail.fn_cambio_correo_reservar_envio(v_cuenta);
  if v_reserva ->> 'estado' = 'enviar' then
    return v_reserva || jsonb_build_object('usuario_web_id', v_usuario, 'correo_actual', v_actual, 'correo_nuevo', v_nuevo);
  end if;
  return v_reserva;
end;
$$;
comment on function retail.tienda_restablecer_enviar(text) is
  'Tienda online (ADR-0408, Felipe 2026-10-15): el primer código de «Restablecer acceso», con la ficha de un solo uso que el ERP sacó de restablecer_acceso_tienda_web (10 minutos). {estado: invalido (la ficha no existe, venció o ya se usó) | bloqueado | esperar | limite | enviar (usuario_web_id, correo_actual, correo_nuevo)}. La ficha se gasta aunque no se mande. Solo la llama tienda_web.';

create or replace function retail.tienda_restablecer_reenviar(p_correo text, p_ip_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
  v_cuenta uuid;
  v_usuario uuid;
  v_actual text;
  v_reserva jsonb;
begin
  if v_correo is null or nullif(btrim(coalesce(p_ip_hash, '')), '') is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  -- La página es pública: cuenta un intento de consulta por ip (20 por hora, los mismos de la tienda y del cartel).
  if not retail.club_intento('consulta', p_ip_hash, null, null) then
    return jsonb_build_object('estado', 'muchos_intentos');
  end if;
  for v_cuenta, v_usuario, v_actual in
    select m.cuenta_web_id, w.usuario_web_id, w.correo
      from retail.cuentas_web_cambios_correo m
      join retail.cuentas_web w on w.id = m.cuenta_web_id
     where m.correo_nuevo = v_correo and m.origen = 'tienda' and m.vence_en > now() and w.cerrada_en is null
  loop
    exit;
  end loop;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_pedido');
  end if;
  v_reserva := retail.fn_cambio_correo_reservar_envio(v_cuenta);
  if v_reserva ->> 'estado' = 'enviar' then
    -- Con el usuario y su correo de entrada de hoy: el servidor de la tienda vuelve a PEDIR el cambio en el proyecto de clientes, no solo
    -- a reenviarlo. Si el primer envío nunca salió (la tienda no le contestó al ERP), allá no hay ningún cambio pendiente y un simple
    -- reenvío no mandaría nada (medido en /chaos el 2026-10-15).
    return v_reserva || jsonb_build_object('usuario_web_id', v_usuario, 'correo_actual', v_actual, 'correo_nuevo', v_correo);
  end if;
  return v_reserva;
end;
$$;
comment on function retail.tienda_restablecer_reenviar(text, text) is
  'Tienda online (ADR-0408): «Obtener código» de la página pública «Restablecer mi acceso». ¿Hay un restablecimiento pedido en tienda a ese correo y se puede mandar otro código ahora? {estado: invalido | muchos_intentos (20 consultas por ip y hora) | sin_pedido | bloqueado | esperar | limite | enviar (usuario_web_id, correo_actual, correo_nuevo: el servidor vuelve a pedir el cambio en el proyecto de clientes, aunque el primer envío no haya salido)}. La tienda responde lo mismo con sin_pedido y con enviar (nadie averigua aquí quién pidió un restablecimiento). Solo la llama tienda_web.';

create or replace function retail.tienda_restablecer_intento(p_correo text, p_ip_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
  v_hay boolean := false;
  v_cuenta uuid;
  v_usuario uuid;
  v_intento jsonb;
begin
  if v_correo is null or nullif(btrim(coalesce(p_ip_hash, '')), '') is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  if not retail.club_intento('consulta', p_ip_hash, null, null) then
    return jsonb_build_object('estado', 'muchos_intentos');
  end if;
  -- Un código mandado antes de que venza el pedido sirve sus 30 minutos (el ayudante mira su vencimiento).
  for v_cuenta, v_usuario in
    select m.cuenta_web_id, w.usuario_web_id
      from retail.cuentas_web_cambios_correo m
      join retail.cuentas_web w on w.id = m.cuenta_web_id
     where m.correo_nuevo = v_correo and m.origen = 'tienda' and (m.vence_en > now() or m.codigo_vence_en > now())
       and w.cerrada_en is null
  loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    return jsonb_build_object('estado', 'sin_pedido');
  end if;
  v_intento := retail.fn_cambio_correo_contar_intento(v_cuenta);
  if v_intento ->> 'estado' = 'puede' then
    return v_intento || jsonb_build_object('usuario_web_id', v_usuario);
  end if;
  return v_intento;
end;
$$;
comment on function retail.tienda_restablecer_intento(text, text) is
  'Tienda online (ADR-0408): ¿se puede probar ahora el código del restablecimiento pedido en tienda a ese correo? {estado: invalido | muchos_intentos | sin_pedido | bloqueado (minutos) | vencido | puede (quedan, usuario_web_id: el servidor comprueba que el proyecto de clientes verificó el código de ESE usuario)}. Cada intento cuenta antes de probarse. Solo la llama tienda_web.';

-- ---------- 7. La contraseña antes de cambiar el correo o eliminar la cuenta ----------
create or replace function retail.tienda_intento_de_clave(p_usuario_web_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_ahora timestamptz := now();
  v_cuenta uuid;
  v_hay boolean := false;
  v_intentos integer;
  v_primer timestamptz;
  v_bloqueada timestamptz;
begin
  v_cuenta := (select w.id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id);
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  insert into retail.cuentas_web_intentos_clave (cuenta_web_id) values (v_cuenta) on conflict (cuenta_web_id) do nothing;
  for v_intentos, v_primer, v_bloqueada in
    select i.intentos, i.primer_intento_en, i.bloqueada_hasta from retail.cuentas_web_intentos_clave i where i.cuenta_web_id = v_cuenta for update
  loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if v_bloqueada > v_ahora then
    return jsonb_build_object('estado', 'bloqueado', 'minutos', ceil(extract(epoch from v_bloqueada - v_ahora) / 60)::integer);
  end if;
  -- Pasados 15 minutos sin bloqueo, la cuenta de intentos empieza de cero.
  if v_primer <= v_ahora - interval '15 minutes' or v_bloqueada is not null then
    v_intentos := 0;
    v_primer := v_ahora;
  end if;
  update retail.cuentas_web_intentos_clave i
     set intentos = v_intentos + 1,
         primer_intento_en = v_primer,
         bloqueada_hasta = case when v_intentos + 1 >= 5 then v_ahora + interval '15 minutes' end
   where i.cuenta_web_id = v_cuenta;
  return jsonb_build_object('estado', 'puede', 'quedan', 5 - (v_intentos + 1));
end;
$$;
comment on function retail.tienda_intento_de_clave(uuid) is
  'Tienda online (ADR-0408): ¿se puede probar ahora la contraseña de la cuenta de ese usuario (para cambiar el correo o eliminar la cuenta)? {estado: sin_cuenta | bloqueado (minutos) | puede (quedan)}. Cada intento cuenta antes de probarse: 5 cada 15 minutos; con el quinto, 15 minutos de bloqueo. Una buena los borra (tienda_clave_correcta). Solo la llama tienda_web.';

create or replace function retail.tienda_clave_correcta(p_usuario_web_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
begin
  delete from retail.cuentas_web_intentos_clave i
   where i.cuenta_web_id = (select w.id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id);
  return found;
end;
$$;
comment on function retail.tienda_clave_correcta(uuid) is
  'Tienda online (ADR-0408): la contraseña de la cuenta de ese usuario era la buena: sus intentos (y su bloqueo) se borran. Devuelve si había. Solo la llama tienda_web.';

-- ---------- 8. Eliminar mi cuenta (ella) ----------
create or replace function retail.tienda_antes_de_eliminar(p_usuario_web_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $$
declare
  v_ficha uuid;
begin
  v_ficha := (select w.clienta_id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id);
  if v_ficha is null then
    return null;
  end if;
  return retail.fn_cuenta_web_lo_que_frena(v_ficha);
end;
$$;
comment on function retail.tienda_antes_de_eliminar(uuid) is
  'Tienda online (ADR-0408): lo que frena «Eliminar cuenta» del usuario {pedidos: [{codigo, numero, estado, tienda, whatsapp}], apartados: [{codigo, tienda, whatsapp}]} (los dos vacíos: se puede), o null si no tiene cuenta. No escribe nada. Solo la llama tienda_web.';

create or replace function retail.tienda_eliminar_mi_cuenta(p_usuario_web_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_hay boolean := false;
  v_cuenta uuid;
  v_ficha uuid;
  v_frena jsonb;
begin
  if p_usuario_web_id is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  -- La ficha y su cuenta, tomadas en ese orden (el de archivar_clienta y la conservación, que toman la ficha y el disparador cierra la
  -- cuenta: el mismo orden no se traba con ellas): nadie la edita, la anonimiza ni le cambia el correo en el medio.
  v_ficha := (select w.clienta_id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id);
  if v_ficha is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  perform 1 from retail.clientas c where c.id = v_ficha for update;
  for v_cuenta in
    select w.id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id and w.clienta_id = v_ficha for update
  loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    -- Se cerró mientras esperaba (otra pestaña, o la tienda la anonimizó en ese instante).
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  v_frena := retail.fn_cuenta_web_lo_que_frena(v_ficha);
  if jsonb_array_length(v_frena -> 'pedidos') > 0 or jsonb_array_length(v_frena -> 'apartados') > 0 then
    return jsonb_build_object('estado', 'en_curso') || v_frena;
  end if;
  -- La anonimización de siempre, a pedido suyo: borra sus datos de la ficha, la saca del Club, y su cuenta se cierra en la misma
  -- escritura (clientas_cuenta_web_al_anonimizar), con sus favoritos y esperas quitados y su usuario «por borrar».
  perform retail.fn_clienta_anonimizar(v_ficha, null, false, 'tienda_web');
  return jsonb_build_object('estado', 'eliminada');
end;
$$;
comment on function retail.tienda_eliminar_mi_cuenta(uuid) is
  'Tienda online (ADR-0408, Felipe 2026-10-15): «Eliminar cuenta». Si no tiene un pedido web en curso ni un apartado abierto, anonimiza su ficha a pedido suyo (fn_clienta_anonimizar con tienda_web: deja de ser miembro del Club; sus compras y comprobantes quedan sin sus datos) y su cuenta web se cierra en la misma escritura; el servidor borra después su usuario del proyecto de clientes. {estado: sin_cuenta | en_curso (pedidos, apartados) | eliminada}. La contraseña la prueba antes el servidor. Solo la llama tienda_web.';

-- ---------- 9. El ERP: «Restablecer acceso a la tienda web» (módulo Clientes) ----------
create or replace function retail.restablecer_acceso_tienda_web(p_clienta_id uuid, p_correo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_hay boolean := false;
  v_archivada boolean;
  v_cuenta uuid;
  v_libre text;
  v_token text;
  v_otra text;
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- El mismo formato que el correo de la ficha (clientas_correo_formato) y que el de la cuenta (fn_cuenta_web_correo).
  if v_correo = '' or char_length(v_correo) > 254 or v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Revisa el correo: parece incompleto.' using errcode = '22023', hint = 'correo_invalido', detail = 'correo';
  end if;

  -- La ficha y su cuenta, tomadas: nadie la archiva ni la cierra en el medio.
  for v_archivada in select c.archivada_en is not null from retail.clientas c where c.id = p_clienta_id for update
  loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    raise exception 'Ese cliente ya no existe — actualiza la pantalla.' using errcode = 'P0001', hint = 'ficha_no_existe';
  end if;
  if v_archivada then
    raise exception 'Esta ficha está archivada — reactívala antes de restablecer su acceso.' using errcode = 'P0001', hint = 'ficha_archivada';
  end if;
  for v_cuenta in select w.id from retail.cuentas_web w where w.clienta_id = p_clienta_id and w.cerrada_en is null for update
  loop
    exit;
  end loop;
  if v_cuenta is null then
    raise exception 'No tiene cuenta en la tienda online.' using errcode = 'P0001', hint = 'sin_cuenta_web';
  end if;

  perform retail.fn_cambio_correo_limpiar(v_correo);
  v_libre := retail.fn_cambio_correo_libre(v_cuenta, v_correo);
  if v_libre = 'mismo_correo' then
    raise exception 'Con ese correo ya entra a la tienda online. Si olvidó su contraseña, que toque «Olvidé mi contraseña» al entrar: le llega un enlace a ese correo.'
      using errcode = 'P0001', hint = 'acceso_web_mismo_correo', detail = 'correo';
  elsif v_libre in ('de_otra_ficha', 'de_otra_cuenta') then
    -- Quien restablece ve el módulo «Clientes»: se le dice de qué ficha es, como en editar_clienta.
    v_otra := coalesce(
      (select coalesce(nullif(btrim(c.nombre), ''), 'un cliente sin nombre') || coalesce(' (' || nullif(concat_ws(', ', c.codigo_club,
                case when c.archivada_en is not null then 'archivada' end), '') || ')', '')
         from retail.clientas c
        where (v_libre = 'de_otra_ficha' and lower(btrim(c.correo)) = v_correo and c.id <> p_clienta_id)
           or (v_libre = 'de_otra_cuenta' and c.id = (select w.clienta_id from retail.cuentas_web w where w.correo = v_correo))
        limit 1), 'otra ficha');
    if v_libre = 'de_otra_cuenta' then
      raise exception 'Con ese correo entra a la tienda online la ficha de %. Un correo es de una sola persona: usa otro.', v_otra
        using errcode = '23505', hint = 'correo_de_otra_ficha', detail = 'correo';
    end if;
    raise exception 'Ese correo ya es de la ficha de %. Un correo es de una sola persona: usa otro.', v_otra
      using errcode = '23505', hint = 'correo_de_otra_ficha', detail = 'correo';
  elsif v_libre = 'pedido_por_otra_cuenta' then
    raise exception 'Ese correo lo está confirmando otra cuenta de la tienda online. Usa otro.'
      using errcode = '23505', hint = 'correo_de_otra_ficha', detail = 'correo';
  end if;

  -- La ficha de un solo uso con que el ERP le pide a la tienda el primer envío. La base guarda solo su sha256.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  begin
    insert into retail.cuentas_web_cambios_correo (cuenta_web_id, correo_nuevo, origen, pedido_en, vence_en, token_hash, token_vence_en)
    values (v_cuenta, v_correo, 'tienda', now(), now() + interval '1 day', encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
            now() + interval '10 minutes')
    on conflict (cuenta_web_id) do update set
      correo_nuevo = excluded.correo_nuevo,
      origen = 'tienda',
      pedido_en = excluded.pedido_en,
      vence_en = excluded.vence_en,
      token_hash = excluded.token_hash,
      token_vence_en = excluded.token_vence_en,
      -- Otro correo: su código de antes ya no vale. Los topes de envío y el bloqueo se quedan: son de la cuenta.
      intentos = case when retail.cuentas_web_cambios_correo.correo_nuevo = excluded.correo_nuevo
                      then retail.cuentas_web_cambios_correo.intentos else 0 end,
      codigo_vence_en = case when retail.cuentas_web_cambios_correo.correo_nuevo = excluded.correo_nuevo
                             then retail.cuentas_web_cambios_correo.codigo_vence_en end;
  exception when unique_violation then
    raise exception 'Ese correo lo está confirmando otra cuenta de la tienda online. Usa otro.'
      using errcode = '23505', hint = 'correo_de_otra_ficha', detail = 'correo';
  end;

  -- Sin el correo ni el nombre: quién es queda en registro_id; quién lo hizo, en la persona (el Responsable).
  perform retail.fn_actividad_anotar(
    'clientas', 'restablecer_acceso_web',
    'pidió restablecer el acceso de un cliente a la tienda online: le llega un código a su correo nuevo',
    v_persona, null, null, null, 'clientas', p_clienta_id::text, now(),
    jsonb_build_object('cuenta_web', true), 'vivo'
  );
  return jsonb_build_object('token', v_token, 'correo_nuevo', v_correo, 'vence_en', now() + interval '1 day');
end;
$$;
comment on function retail.restablecer_acceso_tienda_web(uuid, text) is
  'ERP, módulo Clientes (ADR-0408, Felipe 2026-10-15): «Restablecer acceso a la tienda web». Deja pedido el cambio del correo de entrada de la cuenta web de esa ficha al correo nuevo que dio el cliente (vive un día) y devuelve la ficha de un solo uso (token, 10 minutos) con que el servidor del ERP le pide a la tienda que le mande el código. El correo NO cambia aquí: cambia cuando el cliente escribe ese código (tienda_correo_confirmado). Firma el Responsable (fn_actor_persona_id(true), obligatorio) y queda en la Actividad sin datos suyos. Rechaza con hint: clientas_sin_modulo, responsable_requerido, correo_invalido, ficha_no_existe, ficha_archivada, sin_cuenta_web, acceso_web_mismo_correo, correo_de_otra_ficha (dice de cuál). Devuelve {token, correo_nuevo, vence_en}.';

create or replace function retail.fn_clienta_acceso_web(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- La ficha es del módulo «Clientas» (42501 clientas_sin_modulo). Va primero: si falla, no se lee nada.
  select retail.fn_exigir_modulo('clientas');

  select jsonb_build_object(
    'cuenta_web', exists (select 1 from retail.cuentas_web w where w.clienta_id = p_id and w.cerrada_en is null),
    -- El restablecimiento pedido en tienda que todavía espera su código (no el cambio que pidió ella desde su cuenta).
    'restablecer', (
      select jsonb_build_object('correo', m.correo_nuevo, 'pedido_en', m.pedido_en, 'vence_en', m.vence_en,
                                'ultimo_envio_en', m.ultimo_envio_en, 'envios', m.envios)
        from retail.cuentas_web_cambios_correo m
        join retail.cuentas_web w on w.id = m.cuenta_web_id
       where w.clienta_id = p_id and w.cerrada_en is null and m.origen = 'tienda'
         and (m.vence_en > now() or m.codigo_vence_en > now()))
  );
$$;
comment on function retail.fn_clienta_acceso_web(uuid) is
  'ERP, módulo Clientes (ADR-0408): lo que la ficha muestra de su acceso a la tienda online {cuenta_web: si tiene una cuenta abierta, restablecer: null o {correo (el nuevo, al que se mandó el código), pedido_en, vence_en, ultimo_envio_en, envios}}. Sin su correo de entrada.';

-- ---------- 10. La puerta: la tienda, solo tienda_web; el ERP, solo authenticated ----------
revoke all on function retail.tienda_pedir_cambio_correo(uuid, text, boolean) from public, anon, authenticated;
revoke all on function retail.tienda_intento_cambio_correo(uuid, text) from public, anon, authenticated;
revoke all on function retail.tienda_correo_confirmado(uuid, text) from public, anon, authenticated;
revoke all on function retail.tienda_restablecer_enviar(text) from public, anon, authenticated;
revoke all on function retail.tienda_restablecer_reenviar(text, text) from public, anon, authenticated;
revoke all on function retail.tienda_restablecer_intento(text, text) from public, anon, authenticated;
revoke all on function retail.tienda_intento_de_clave(uuid) from public, anon, authenticated;
revoke all on function retail.tienda_clave_correcta(uuid) from public, anon, authenticated;
revoke all on function retail.tienda_antes_de_eliminar(uuid) from public, anon, authenticated;
revoke all on function retail.tienda_eliminar_mi_cuenta(uuid) from public, anon, authenticated;
grant execute on function retail.tienda_pedir_cambio_correo(uuid, text, boolean) to tienda_web;
grant execute on function retail.tienda_intento_cambio_correo(uuid, text) to tienda_web;
grant execute on function retail.tienda_correo_confirmado(uuid, text) to tienda_web;
grant execute on function retail.tienda_restablecer_enviar(text) to tienda_web;
grant execute on function retail.tienda_restablecer_reenviar(text, text) to tienda_web;
grant execute on function retail.tienda_restablecer_intento(text, text) to tienda_web;
grant execute on function retail.tienda_intento_de_clave(uuid) to tienda_web;
grant execute on function retail.tienda_clave_correcta(uuid) to tienda_web;
grant execute on function retail.tienda_antes_de_eliminar(uuid) to tienda_web;
grant execute on function retail.tienda_eliminar_mi_cuenta(uuid) to tienda_web;

revoke all on function retail.restablecer_acceso_tienda_web(uuid, text) from public, anon;
revoke all on function retail.fn_clienta_acceso_web(uuid) from public, anon;
grant execute on function retail.restablecer_acceso_tienda_web(uuid, text) to authenticated;
grant execute on function retail.fn_clienta_acceso_web(uuid) to authenticated;

reset lock_timeout;

notify pgrst, 'reload schema';

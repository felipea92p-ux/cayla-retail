-- ============================================================================
-- 20261016154000_tienda_club_empieza_con_la_cuenta.sql — CAYLA V2 · Tienda online (ADR-0408) y Club (ADR-0288)
-- El Club empieza al crear la cuenta en la tienda online: una ficha que ya existía y no tiene cuenta se une por el mismo
-- registro que una persona nueva, y el cartel de la tienda deja de inscribir (lleva a tienda.cayla.pe).
--
-- EL PROBLEMA PRIMERO. Felipe intentó crear su cuenta el 2026-10-16 y la tienda le dijo «Ya eres parte del Club con este
-- documento. Para crear tu cuenta, pide en cualquier tienda CAYLA que anoten este correo en tu ficha». Es la regla D7
-- (20261015230000): una ficha que ya existía solo se unía a una cuenta con el correo que esa ficha ya tenía. Pero casi ninguna lo
-- tiene: de 42 fichas activas en producción ese día, 36 no tenían correo (35 de caja, abiertas con el DNI de una boleta, y 1 del
-- cartel), porque se abrieron antes de que existiera la página y la ficha del ERP no dejaba anotar el correo hasta el 2026-10-15.
-- Quien llega por primera vez a la página no sabe que tiene una ficha: mandarlo a una tienda a que se la arreglen lo dejaba fuera.
--
-- ANALOGÍA CAYLA. La ficha es la tarjeta del cuaderno de clientes de la tienda; la cuenta es la llave de la tienda online. Desde hoy
-- el Club no es estar en el cuaderno sino tener la llave: quien abre su cuenta con su documento se lleva la tarjeta que ya estaba,
-- sin que nadie le pida nada más, y desde ese día es del Club.
--
-- QUÉ CAMBIA (Felipe 2026-10-16: «todo aquel que no tenga registrada su contraseña aún no es parte del club […] en ese momento que
-- se crea la cuenta recién forma parte del club, no antes»; «al escanear el cartel lleva al link tienda.cayla.pe»)
--   1. `tienda_registrar_cuenta`: se quita la regla D7. Una ficha sin cuenta se une a la cuenta de quien se registra con su
--      documento, completando solo lo vacío como antes, y entra al Club en ese momento si todavía no lo era (`club_desde` = ahora,
--      como ya hacía). Lo demás no cambia: una ficha que ya tiene cuenta sigue respondiendo `cuenta_dni_repetido`, una archivada
--      `cuenta_archivada`, y un correo que es el de OTRA ficha sigue sin servir (`fn_correo_de_una_persona`).
--   2. `registrarse_en_el_club` (el registro del cartel) se queda sin llamador en la web: la página `/club/<tienda>` del ERP lleva a
--      tienda.cayla.pe (los carteles ya impresos no se reimprimen). Solo cambia su comentario: la función sigue porque las pruebas
--      del Club inscriben con ella (`club_registro_cartel`, `club_aniversario`, `club_avisos` y otras tres).
--
-- QUÉ NO CAMBIA. Las 5 personas que el cartel inscribió entre el 2 y el 11 de octubre siguen en el Club con su fecha y su código
-- (Felipe eligió no quitarles nada), y los permisos que dieron (`club_permisos`) no se tocan. Sigue en pie la parte 2 de
-- 20261015230000: desde la web no se borra una ficha que abrió una tienda.
--
-- EL RIESGO QUE QUEDA, A PROPÓSITO. Quien sepa el documento de alguien que no tiene cuenta puede crearla con su ficha. Felipe lo
-- eligió así, con el riesgo a la vista; si pasa, la tienda le devuelve la cuenta a su dueño con «Restablecer acceso»
-- (`restablecer_acceso_tienda_web`, la ficha del cliente en el ERP).
--
-- CÓMO. Reemplazo anclado (como 20261015230000): se quita el bloque exacto de la regla D7 y nada más. Antes se compara el md5 del
-- cuerpo vivo con el de producción del 2026-10-16 y con el de este archivo; si es otro, alguien la cambió en vivo y se detiene sin
-- tocar nada. El ancla tiene que aparecer una sola vez.
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces). Reemplaza una función y cambia dos comentarios: no toca tablas
-- ni políticas, así que no hay riesgo de 40P01. Sin `select … into` dentro de un texto entre comillas. El orden con la publicación
-- no importa: con la tienda de antes, pegar esto solo hace que deje de rechazar, que es lo que se busca.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

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

do $$
declare
  v_registrar text := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(
    'retail.tienda_registrar_cuenta(uuid, text, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text)'));
begin
  if v_registrar is null or v_registrar not in ('f5403906046098cb50f6c8a1db3fdf75', '77fbcba6cfd8b666bf5c84e9bea47bd6') then
    raise exception 'tienda_registrar_cuenta tiene otro cuerpo (md5 %): no es el de producción del 2026-10-16 ni el de este archivo. Reescribe el reemplazo desde su definición real antes de pegar.',
      coalesce(v_registrar, 'ninguno');
  end if;
end $$;

-- 1. La ficha que ya existía se une por el mismo registro: se quita la regla D7.
select pg_temp.reemplazar_anclado(
  'retail.tienda_registrar_cuenta(uuid, text, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text)',
  $v$    -- 20261015230000 (D7): el código prueba el correo, no el documento. Una ficha que ya existía se une a la cuenta solo si el
    -- correo confirmado es el que la ficha ya tenía (lo anotó la tienda con la persona delante); si no, no se escribe nada.
    if lower(btrim(coalesce((select c.correo from retail.clientas c where c.id = v_id), ''))) is distinct from lower(btrim(v_correo)) then
      raise exception 'Ya eres parte del Club con este documento. Para crear tu cuenta, pide en una tienda CAYLA que anoten este correo en tu ficha.'
        using errcode = 'P0001', hint = 'cuenta_ficha_sin_tu_correo', detail = 'correo';
    end if;
$v$,
  $n$    -- 20261016154000 (Felipe 2026-10-16, «el Club empieza al crear la cuenta, no antes»): una ficha que ya existía y no tiene
    -- cuenta (abierta en caja con el DNI de una boleta, o en el cartel, casi siempre antes de que existiera la página y sin
    -- correo) se une a la cuenta de quien se registra con ese documento, por el mismo camino que una persona nueva. Reemplaza la
    -- regla D7 (20261015230000), que exigía el correo de la ficha. Si alguien se adelanta con un documento ajeno, la tienda le
    -- devuelve la cuenta a su dueño con «Restablecer acceso» (restablecer_acceso_tienda_web).
$n$
);

comment on function retail.tienda_registrar_cuenta(uuid, text, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text) is
  'Tienda online (ADR-0408, actividades 2 y 2b): crea la cuenta (cuentas_web) y deja a la persona en el Club, todo o nada, recién después de que confirmó su correo con el código (exige el pendiente de ese correo y ese usuario: cuenta_sin_codigo). El Club empieza al crear la cuenta (Felipe 2026-10-16, 20261016154000). Exige «Soy mayor de 18 años». Si el DNI ya es de una ficha sin cuenta (de caja, del cartel o de la web), se une a ella por el mismo registro, completando solo lo vacío (el nombre del padrón sí reemplaza, G-4), y entra al Club si todavía no lo era; si no hay ficha, la crea con registro_origen = web. Con los avisos por WhatsApp, anota el permiso de publicidad del Club (medio tienda_web, la casilla vigente) y publicidad_desde, solo para el celular que escribió. Rechaza con hint: cuenta_datos_invalidos (detail = campo, también mayor), cuenta_menor, cuenta_sin_codigo, cuenta_texto_cambio, cuenta_correo_repetido, cuenta_dni_repetido, cuenta_archivada, cuenta_ya_existe. Devuelve {codigo_club, era_del_club, se_unio_a_su_ficha, nombre_corto, avisos_whatsapp: no | activados | ya_estaban | celular_distinto}. Solo la llama tienda_web.';

-- 2. El registro del cartel, sin llamador en la web (el cartel lleva a tienda.cayla.pe).
comment on function retail.registrarse_en_el_club(uuid, text, text, text, text, date, text, boolean, boolean, boolean, jsonb, boolean) is
  'SIN LLAMADOR EN LA WEB desde 20261016154000 (Felipe 2026-10-16: el Club empieza al crear la cuenta en la tienda online, tienda_registrar_cuenta; el cartel y la página /club/<tienda> llevan a tienda.cayla.pe). Se conserva porque las pruebas del Club inscriben con ella; se retira cuando se rehagan. Lo que hacía: ella se une sola al club desde el cartel de una tienda (ADR-0288 act. g: G-3, G-4, G-5, G-10, G-12). Crea o actualiza la ficha por documento (DNI con nombre del padrón; carné o pasaporte con el nombre que escribe), la deja socia (conserva club_desde y codigo_club), con permiso del club por pagina_cartel citando los términos y, si marcó la casilla, la publicidad citando la casilla. Hints: club_menor, club_datos_invalidos (detail = el campo), club_texto_cambio, club_documento_archivado. Solo el servidor (llave de servicio): sin sesión ni responsable.';

reset lock_timeout;

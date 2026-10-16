-- ============================================================================
-- 20261015230000_tienda_ficha_existente_solo_con_su_correo.sql — CAYLA V2 · Tienda online (ADR-0408)
-- Una cuenta web se une a una ficha que ya existía solo con el correo que esa ficha ya tenía, y desde la web no se borra una
-- ficha que abrió una tienda.
--
-- EL PROBLEMA PRIMERO. `tienda_registrar_cuenta` une la cuenta nueva a la ficha que ya tiene ese documento (20261014224000). El
-- código de 6 cifras prueba que el correo es de quien escribe, no que el documento lo sea, y un DNI se ve en boletas, formularios y
-- chats. Quien escribiera el DNI de otra persona se quedaba con su ficha: veía en «Mi cuenta» y «Mi club» su nombre, su código, su
-- cumpleaños, sus compras del año y su vale; la dueña real ya no podía crear su cuenta («Ya hay una cuenta con este DNI»); y con
-- «Eliminar mi cuenta» (20261015132000) se anonimizaba esa ficha: la dueña perdía el Club y su historia sin haber tocado la web.
--
-- ANALOGÍA CAYLA. La ficha es la tarjeta de una miembro en el cuaderno de la tienda. La web le da una llave a quien demuestra que un
-- correo es suyo; la tarjeta de otra persona solo se le entrega si en esa tarjeta ya está anotado ese mismo correo (lo anotó la
-- tienda, con la persona delante).
--
-- QUÉ CAMBIA (Felipe 2026-10-15, D7)
--   1. `tienda_registrar_cuenta`: si el documento ya es de una ficha, la cuenta se une a ella solo si el correo confirmado es el que
--      la ficha ya tiene. Si la ficha no tiene correo, o tiene otro, se rechaza sin escribir nada: P0001 `cuenta_ficha_sin_tu_correo`
--      (detail `correo`) y la tienda dice que pida en una tienda CAYLA que anoten ese correo en su ficha (Clientes ▸ ficha ▸ Editar,
--      20261015123000). Una ficha NUEVA (el documento no tenía ficha) no cambia: nace con ese correo.
--   2. `tienda_eliminar_mi_cuenta`: si la ficha no nació en la web (`registro_origen` distinto de `web`), no se anonimiza desde la
--      web: responde `en_tienda` y no toca nada. Borrar los datos de una ficha que abrió una tienda se pide en tienda, donde se ve a
--      la persona (el derecho de cancelación de la Ley 29733 sigue en pie: lo atiende la tienda con «Anonimizar»). Una ficha que nació
--      en la web se sigue eliminando como hoy.
--
-- QUÉ NO CAMBIA. Los topes, el código, los avisos, el nombre del padrón y todo lo demás de las dos funciones. Las cuentas que ya
-- existen no se tocan (2 el 2026-10-15; la que está unida a una ficha de caja tiene en la ficha el mismo correo de la cuenta).
--
-- CÓMO. Reemplazo anclado (como 20261008120000): se inserta la regla en un punto exacto de cada función y nada más. Antes se compara
-- el md5 del cuerpo vivo con el de producción del 2026-10-15 y con el de este archivo; si es otro, alguien la cambió en vivo y se
-- detiene sin tocar nada. El ancla tiene que aparecer una sola vez.
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces). Solo reemplaza dos funciones de la tienda: no toca tablas ni
-- políticas. Va junto con 20261015232000 (el cartel del Club no escribe en una ficha que ya existía): sin esa, el correo de una ficha se
-- podía cambiar desde el cartel con solo el documento. Publicar antes la tienda de este PR (entiende `cuenta_ficha_sin_tu_correo` y
-- `en_tienda`); si se pega antes, la tienda de hoy muestra «no disponible» en esos dos casos, sin guardar nada mal.
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
  v_eliminar text := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.tienda_eliminar_mi_cuenta(uuid)'));
begin
  if v_registrar is null or v_registrar not in ('01520c409a18ad4bfa3fc3a7e7dae426', 'f5403906046098cb50f6c8a1db3fdf75') then
    raise exception 'tienda_registrar_cuenta tiene otro cuerpo (md5 %): no es el de producción del 2026-10-15 ni el de este archivo. Reescribe el reemplazo desde su definición real antes de pegar.',
      coalesce(v_registrar, 'ninguno');
  end if;
  if v_eliminar is null or v_eliminar not in ('124b0cad376abd75fa17db9a78c51f91', '70865e01ffbcef23e7cacc7eba5a44f3') then
    raise exception 'tienda_eliminar_mi_cuenta tiene otro cuerpo (md5 %): no es el de producción del 2026-10-15 ni el de este archivo. Reescribe el reemplazo desde su definición real antes de pegar.',
      coalesce(v_eliminar, 'ninguno');
  end if;
end $$;

-- 1. La ficha que ya existía: solo con el correo que ya tenía.
select pg_temp.reemplazar_anclado(
  'retail.tienda_registrar_cuenta(uuid, text, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text)',
  $v$    if exists (select 1 from retail.cuentas_web w where w.clienta_id = v_id) then
      raise exception 'Ya hay una cuenta con este DNI.' using errcode = 'P0001', hint = 'cuenta_dni_repetido', detail = 'dni';
    end if;
$v$,
  $n$    if exists (select 1 from retail.cuentas_web w where w.clienta_id = v_id) then
      raise exception 'Ya hay una cuenta con este DNI.' using errcode = 'P0001', hint = 'cuenta_dni_repetido', detail = 'dni';
    end if;
    -- 20261015230000 (D7): el código prueba el correo, no el documento. Una ficha que ya existía se une a la cuenta solo si el
    -- correo confirmado es el que la ficha ya tenía (lo anotó la tienda con la persona delante); si no, no se escribe nada.
    if lower(btrim(coalesce((select c.correo from retail.clientas c where c.id = v_id), ''))) is distinct from lower(btrim(v_correo)) then
      raise exception 'Ya eres parte del Club con este documento. Para crear tu cuenta, pide en una tienda CAYLA que anoten este correo en tu ficha.'
        using errcode = 'P0001', hint = 'cuenta_ficha_sin_tu_correo', detail = 'correo';
    end if;
$n$
);

-- 2. Desde la web solo se borra una ficha que nació en la web.
select pg_temp.reemplazar_anclado(
  'retail.tienda_eliminar_mi_cuenta(uuid)',
  $v$  perform retail.fn_clienta_anonimizar(v_ficha, null, false, 'tienda_web');$v$,
  $n$  -- 20261015230000: una ficha que abrió una tienda (registro_origen distinto de «web») no se anonimiza desde la web: se pide en
  -- tienda, donde se ve a la persona. No se toca nada y la tienda online lo dice.
  if (select c.registro_origen from retail.clientas c where c.id = v_ficha) is distinct from 'web' then
    return jsonb_build_object('estado', 'en_tienda');
  end if;
  perform retail.fn_clienta_anonimizar(v_ficha, null, false, 'tienda_web');$n$
);

reset lock_timeout;

-- ============================================================================
-- 20260926230000_asignar_rol_reinicia_tope_al_bajar_de_lider.sql — ADR-0153 (D-67) y ADR-0178
-- Análisis de «Roles y accesos» del 2026-09-26, tarea #2: «quien baja de Líder no puede quedar sin tope de descuento».
--
-- ⚠️ NO PEGAR TODAVÍA. AVISO (2026-09-26, después de escribirla): el texto de abajo presenta el tope vacío como «descuento
--    de 40 % sin que nadie lo apruebe». ESTÁ EXAGERADO. `registrar_venta` solo evalúa el tope por persona si el mostrador
--    manda el descuento a nivel de venta (`p_descuento_pct > 0`), y hoy no lo manda (0 de 6 ventas; la web no lo envía).
--    El descuento real lo manda ser Líder (hasta 35 %, argumento escrito pasado el 15 %) o un código válido: quien deja de
--    ser Líder ya pierde el descuento libre. La migración está probada (81/81 en `pruebas:roles`) y es correcta, pero cambia
--    una función de permisos vivos por una columna que hoy nadie evalúa. Espera la decisión de Felipe: retirar la columna,
--    activarla o dejarla (docs/pantallas/colaboradores-roles.md, tarea #2). Si se pega, reescribir antes este comentario.
--
-- EL PROBLEMA PRIMERO. Cada persona tiene un tope de descuento de venta (`retail.colaboradores.tope_descuento_pct`, D-67).
-- El tope es un número; el valor vacío (NULL) significa «sin tope», y `registrar_venta` lo trata igual que a una líder:
-- no le pide la autorización de otra líder. Las líderes nacieron con NULL (el backfill de 20260922150000, línea 170);
-- cualquier otra persona entra con el 10 que trae la columna por defecto.
--
-- El escenario: una líder de equipo deja de serlo (un Admin le pone el rol Integrante en Roles y accesos). `asignar_rol`
-- le cambiaba el rol y la sede, pero NO el tope. Esa persona seguía con «sin tope»: ya no es líder, pero en el mostrador
-- puede dar a una clienta el 40 % de descuento sin que nadie lo apruebe. No es un descuido del Admin: en pantalla no
-- hay dónde ver ni cambiar el tope (ADR-0153: «se ajusta con un update directo»), así que nadie se entera. Ya pasó:
-- 1 de 17 integrantes está así hoy, y es exactamente la única bajada de líder registrada; le pasa al próximo que se baje.
--
-- POR QUÉ NULL ES PELIGROSO COMO VALOR QUE VIAJA CON LA PERSONA. Un tope vacío no es un límite: es la ausencia de límite.
-- Quien lo trae de cuando era líder lo trae sin que nadie lo haya decidido de nuevo. En un candado de dinero lo que se
-- olvida tiene que quedar en lo más estricto y el permiso amplio tiene que darse a propósito, no por herencia.
--
-- QUÉ CAMBIA (una sola línea de la función). Cuando quien recibe el cambio ERA líder y pasa a un rol que no es líder, su
-- tope queda en `coalesce(tope_descuento_pct, 10)`:
--   · si no tenía tope (NULL, lo normal en una líder), queda con el de un integrante hoy: 10 (D-67, el default de la
--     columna). Si Felipe quiere darle otro, sigue siendo un update directo, pero ya no parte de «sin tope»;
--   · si ya tenía uno definido (a una líder Felipe le puso 5), se respeta: bajar de rol no se lo sube.
--
-- QUÉ NO CAMBIA
--   · Nada más de `asignar_rol`: ni las protecciones (solo un Admin sube o baja a un líder; nunca queda cero líderes;
--     nadie se cambia su propio rol, salvo la excepción de Admin que ya trae producción; «solo das lo que tienes»; «solo
--     alcanzas a quien está por debajo»), ni el historial, ni las terminales (no tienen tope: una terminal descuenta
--     sin tope por regla, Felipe 2026-09-22).
--   · A quien NO era líder no se le toca el tope, ni siquiera un NULL heredado. Esa cuenta (la única de hoy) se corrige
--     con `pegar-en-produccion-tope-integrante-sin-tope-2026-09.sql`, que decide y pega Felipe: es un dato, no la función.
--   · Subir a alguien a Líder no le borra el tope (queda con el que tenía). Es otra pregunta, aparte de esta migración.
--   · Una persona suspendida no tiene fila en `colaboradores` (su tabla `colaboradores_suspendidos` no guarda tope): si es
--     una líder suspendida a la que se le cambia el rol, al reactivarla la fila nueva nace con el 10 de la columna. Ya
--     estaba bien; una prueba lo deja escrito.
--
-- DESCARTADO por ahora: hacer la columna NOT NULL y que «sin tope» lo diga el rol de líder dentro de `registrar_venta`
-- (`fn_es_lider()`), en vez de un NULL. Sería el arreglo de fondo (el estado «integrante sin tope» dejaría de existir),
-- pero toca la columna, el backfill de las 8 líderes y la función que más plata mueve; esta migración cierra la fuga
-- hoy y no cierra la puerta a ese arreglo.
--
-- CÓMO SE ESCRIBE. `asignar_rol` se reescribe desde su definición VIVA (`pg_get_functiondef` de producción, 2026-09-26),
-- no desde el archivo que la creó (20260923110000, parchada después por 20260923131000, 20260923163000, 20260923174500
-- y 20260924000000), con el mismo patrón de conteo exacto: si el trozo cambió, ABORTA sin dejar nada a medias.
-- La viva y la que dejan las migraciones de `main` difieren en UNA línea: la viva trae
-- `if p_persona_id = v_yo and not retail.fn_es_admin()` (el parche 20260925210000_admin_se_reasigna_su_propio_rol.sql,
-- ya pegado en producción pero todavía sin fusionar a `main`: PR #399); `main` trae `if p_persona_id = v_yo`.
-- Esta migración cambia un trozo IDÉNTICO en las dos (el `update` de `colaboradores` de la rama «rol no líder»), así que
-- vale con o sin ese parche y no lo pisa.
--
-- UNA SOLA PARTE: solo `create or replace function`; no toca tablas ni políticas (regla de deadlocks de CLAUDE.md,
-- «Políticas y deadlocks»). `create or replace` conserva permisos y comentario. No hace ningún cambio de datos.
--
-- RE-EJECUTABLE, con una regla que no depende del texto exacto que dejó la primera corrida. La guardia «ya aplicada» es
-- «`asignar_rol` ya asigna `tope_descuento_pct`» (la función original no lo menciona ni una vez): si es así no la toca,
-- aunque alguien haya cambiado el 10 o reescrito el comentario. Al final exige que esa asignación aparezca EXACTAMENTE una
-- vez: dos asignaciones a la misma columna en un mismo `update` no las rechaza Postgres al crear la función, la rechaza al
-- ejecutarla («multiple assignments to same column»), y entonces cada cambio de rol a un rol no líder fallaría. Si la
-- encuentra repetida, ABORTA con un mensaje en vez de dar por buena la migración.
-- Corolario: si una migración FUTURA suma otra asignación al tope dentro de `asignar_rol`, esta ya no se re-pega.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.asignar_rol(uuid, uuid, uuid, uuid)') is null then
    raise exception 'Falta asignar_rol con sede: pega antes 20260923110000_cambiar_rol_entre_lideres.sql';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'colaboradores' and column_name = 'tope_descuento_pct') then
    raise exception 'Falta retail.colaboradores.tope_descuento_pct: pega antes 20260922150000_venta_asesora_emisor_descuento_lider.sql';
  end if;
end $$;

create or replace function pg_temp.reemplazar_tope(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  if to_regprocedure(p_firma) is null then
    raise exception '% no existe en esta base: esta migración se escribió contra producción. Revisa qué cambió.', p_firma;
  end if;
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicada = la función ya asigna el tope. Se busca la asignación (un patrón corto y estable), no el bloque que
  -- escribió la primera corrida: si alguien le cambió el 10 o el comentario, volver a pegar esto no debe duplicarla.
  if v_def ~ 'tope_descuento_pct\s*=' then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % ocurrencias de "%" y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- El `update` de la cuenta activa en la rama «pasa a un rol que no es líder». `v_rol_cuenta` es el rol que la persona
-- tenía ANTES del cambio (se lee al principio de la función), así que 'lider' aquí quiere decir «era líder».
select pg_temp.reemplazar_tope('retail.asignar_rol(uuid, uuid, uuid, uuid)',
  $v$      update retail.colaboradores
         set rol = 'integrante', rol_id = p_rol_id, ubicacion_asignada_id = coalesce(v_ubicacion, ubicacion_asignada_id)$v$,
  $n$      update retail.colaboradores
         set rol = 'integrante', rol_id = p_rol_id, ubicacion_asignada_id = coalesce(v_ubicacion, ubicacion_asignada_id),
             -- 20260926230000: quien deja de ser líder no se lleva el «sin tope» (NULL) de las líderes: conserva el tope que
             -- tuviera y, si no tenía, queda con el de un integrante (10 = el default de la columna, D-67). A quien ya era
             -- integrante no se le toca. Si cambia el default de la columna, cambia también este 10.
             tope_descuento_pct = case when v_rol_cuenta = 'lider' then coalesce(tope_descuento_pct, 10) else tope_descuento_pct end$n$, 1);

-- ==================== Verificación ====================
do $$
declare
  v_def text := pg_get_functiondef('retail.asignar_rol(uuid, uuid, uuid, uuid)'::regprocedure);
  v_asignaciones integer;
begin
  -- Exactamente UNA asignación al tope. Cero: la migración no hizo su trabajo. Más de una: la función se crea sin error
  -- pero falla al ejecutarse en cada cambio de rol a un rol no líder («multiple assignments to same column»).
  v_asignaciones := (select count(*) from regexp_matches(v_def, 'tope_descuento_pct\s*=', 'g'));
  if v_asignaciones = 0 then
    raise exception 'asignar_rol quedó sin el tope al bajar de líder: revísala antes de abrir Roles y accesos';
  end if;
  if v_asignaciones > 1 then
    raise exception 'asignar_rol asigna tope_descuento_pct % veces: Postgres la rechazará al ejecutarla (asignación múltiple a la misma columna) y nadie podrá cambiar un rol. Deja UNA sola asignación en el update de la rama «rol no líder» y vuelve a correr esto.', v_asignaciones;
  end if;
  -- Lo que ya tenía y esta migración no debe perder.
  if v_def not like '%subir a alguien a Líder de equipo%'
     or v_def not like '%cambiarle el rol a un líder de equipo%'
     or v_def not like '%No puedes cambiar tu propio rol%'
     or v_def not like '%fn_exigir_alcanzo_a(p_persona_id, ''cambiarle el rol'')%'
     or v_def not like '%fn_exigir_otro_admin(p_persona_id, ''bajar'')%'
     or v_def not like '%fn_exigir_rol_dentro_de_lo_mio(p_rol_id)%' then
    raise exception 'asignar_rol perdió alguna protección de líder: revísala antes de abrir Roles y accesos';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'asignar_rol') <> 1 then
    raise exception 'asignar_rol quedó con más de una firma: la pantalla llamaría a la equivocada';
  end if;
end $$;

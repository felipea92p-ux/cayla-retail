-- ============================================================================
-- 20261014221000_fondos_persona_de_la_cuenta.sql — ADR-0362 fase 6 (CI del PR #1055, 2026-10-14)
--
-- EL PROBLEMA PRIMERO. Dos arreglos de /chaos preguntaban «¿quién es la cuenta que entró?» con su propia consulta
-- (`select p.id from public.personas p where p.auth_user_id = auth.uid()`): `fn_resolver_intento` (20261014194000, para saber si el
-- envío en duda es del fondo de quien pregunta) y `fn_gasto_viaje_sede` (20261014200000, la sede de quien registra un gasto del viaje).
-- El repo ya tiene UNA pieza para eso, `fn_persona_de_la_cuenta()` (20261013233000: «lo que pregunta “¿es lo tuyo?” lo hace con una
-- pieza»), y dos pruebas cuentan quién mira la cuenta a mano: `pruebas:actor-firma` (las que miran `auth.uid()` son una lista cerrada)
-- y `pruebas:terminales-red` (las que arman su propia puerta «persona + colaborador» sin conocer la terminal). Las dos se pusieron en
-- rojo en el CI del PR #1055 con estas dos funciones de más.
--
-- LA DECISIÓN (de técnica, sin cambio de negocio). Las dos usan `fn_persona_de_la_cuenta()`. Devuelve lo mismo (la persona de la cuenta,
-- null en una terminal): nada de lo que responden cambia.
--
-- CONTRATO (Liskov)
--   PROMETE: `fn_resolver_intento` y `fn_gasto_viaje_sede` responden exactamente lo mismo que antes, sin leer `auth.uid()` por su cuenta.
--   ASUME:   `fn_persona_de_la_cuenta()` (20261013233000).
--   NO HACE: no toca permisos, tablas ni políticas.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, solo funciones. Reemplazos ANCLADOS: las dos funciones tienen la misma
-- huella en el banco `cayla-oc` y en producción (2026-10-14: `fn_resolver_intento` 6171b2c1…, `fn_gasto_viaje_sede` d5ef9ba4…), y la línea
-- que se cambia está una sola vez en cada una. Si algo cambió, aborta sin cambiar nada. Idempotente. Sin `select … into` en textos.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza un texto en la definición VIVA de una función, solo si aparece las veces esperadas; si ya está reemplazado, no hace nada.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$v_yo := (select p.id from public.personas p where p.auth_user_id = auth.uid());$v$,
$n$v_yo := retail.fn_persona_de_la_cuenta();$n$,
1);

select pg_temp.reemplazar('retail.fn_gasto_viaje_sede(uuid[])',
$v$v_yo := (select p.id from public.personas p where p.auth_user_id = auth.uid());$v$,
$n$v_yo := retail.fn_persona_de_la_cuenta();$n$,
1);

reset lock_timeout;
notify pgrst, 'reload schema';

-- Un gasto del viaje va SIEMPRE al menos a una orden (ADR-0362, decisión 75; Felipe 2026-10-14: «Sí o sí necesito como mínimo una orden»).
--
-- EL PROBLEMA PRIMERO. Desde la actividad 3, las órdenes de un gasto del viaje eran opcionales («el cargador se paga a veces antes de saber
-- a qué orden va»): un flete, un hotel o un taxi podían quedar sin orden, y entonces «Traerla costó» no los cuenta en ninguna compra. La
-- hoja dejaba quitar todas. Felipe decidió que no: todo gasto del viaje es de al menos una orden.
--
-- QUÉ CAMBIA. `registrar_gasto_viaje` rechaza un gasto sin orden (`gasto_viaje_sin_orden`), junto a las otras reglas de las órdenes (que
-- existan, que no estén anuladas, 30 como máximo). La hoja ya no deja quitar la última; esto es el candado de la base (principio 2: si
-- la pantalla se equivoca, la base no guarda un estado que no queremos).
--
-- DESCARTÉ
--   · Un disparador diferido sobre `gastos_viaje_ordenes` que exija una fila por gasto: la única que escribe un gasto del viaje es
--     `registrar_gasto_viaje` (las tablas no tienen políticas de escritura), así que la regla ya queda cerrada aquí, sin sumar un
--     disparador. Si mañana otra función registra gastos del viaje, pregunta lo mismo. (En producción no hay ningún gasto del viaje
--     todavía —2026-10-14—: no hay historia que se salga de la regla.)
--   · Cambiar las columnas o la firma de la función: volver a pegar la migración que la creó fallaría. Es un reemplazo anclado que SUMA.
--
-- SE ROMPE SI alguien vuelve a pegar `20261013222000` (que crea la función entera) sin pegar esta después: la regla desaparece. Las pruebas
-- que la recargan (`gastos_viaje.mjs`) pegan esta a continuación.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Una sola parte, después de 20261014153000: solo reemplaza texto en una función viva (sin tablas, políticas
-- ni `drop trigger`: ADR-0195; sin `select … into` dentro de textos entre comillas: ADR-0288). Si la función cambió, aborta sin tocar
-- nada. Idempotente.

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

select pg_temp.reemplazar('retail.registrar_gasto_viaje(text, text, numeric, date, text, text, uuid, uuid[], text, text, text, uuid)',
$v$  if cardinality(v_ordenes) > 30 then
    raise exception 'Un gasto va a 30 órdenes como máximo.' using errcode = 'P0001';
  end if;$v$,
$n$  if cardinality(v_ordenes) > 30 then
    raise exception 'Un gasto va a 30 órdenes como máximo.' using errcode = 'P0001';
  end if;
  -- ADR-0362, decisión 75 (Felipe 2026-10-14): un gasto del viaje va SIEMPRE al menos a una orden.
  if cardinality(v_ordenes) = 0 then
    raise exception 'Elige la orden de este gasto: un gasto del viaje siempre va al menos a una orden.'
      using errcode = 'P0001', hint = 'gasto_viaje_sin_orden';
  end if;$n$,
1);

reset lock_timeout;
notify pgrst, 'reload schema';

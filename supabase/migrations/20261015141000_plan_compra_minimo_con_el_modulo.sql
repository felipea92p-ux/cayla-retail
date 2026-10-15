-- ============================================================================
-- 20261015141000_plan_compra_minimo_con_el_modulo.sql — CAYLA V2 · ADR-0362, decisión 64 (Felipe 2026-10-13; construida el 2026-10-15).
--
-- EL PROBLEMA PRIMERO. «Fijar un mínimo» del Plan de campaña (el % del objetivo que le toca a una tienda que vende poco, como Lima al
-- empezar) era el último «solo un líder» del Plan: `guardar_plan_compra_minimo` (20261012164000) pedía el módulo Y ser líder, mientras el
-- tope y el % de lo que sobra ya eran de quien tiene el módulo (ADR-0387, 20261012202000). Quien armaba el plan esperaba al líder para
-- poner un número.
--
-- QUÉ HACE (REEMPLAZO ANCLADO sobre la definición viva, la de 20261012164000; en producción tiene la misma huella que en el banco):
--   1. Quita el «y ser líder»: el módulo «Plan de campaña» es la llave (decisión 40). Sigue firmando el responsable del combo.
--   2. Bloquea el plan antes de sumar los mínimos. Con más personas que pueden fijarlos, dos a la vez en tiendas distintas leían la suma
--      vieja y las dos pasaban (60 % + 60 % = 120 %). Ahora la segunda espera a la primera y ve su mínimo. «La suma de una campaña no pasa
--      de 100 %» la cuida solo esta función: es la única que escribe la tabla (RLS sin políticas).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una parte. Sin tablas, sin políticas, sin `drop trigger` (ADR-0195) y sin
-- `select … into` dentro de textos entre comillas (ADR-0288). El reemplazo aborta SIN TOCAR NADA si la función viva cambió, y no hace nada si
-- ya está aplicado: se puede pegar dos veces. El bloque final comprueba que quedó.
-- ============================================================================

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261015020000): falla si la función viva cambió, y es re-ejecutable.
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

select pg_temp.reemplazar(
  'retail.guardar_plan_compra_minimo(uuid, uuid, integer)',
  $v$  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder fija el mínimo de una tienda' using errcode = '42501', hint = 'plan_compra_solo_lider';
  end if;
  if not exists (select 1 from retail.planes_compra where id = p_plan_id) then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
$v$,
  $n$  -- El módulo es la llave (ADR-0362, decisión 64): quien tiene «Plan de campaña» fija el mínimo, sea o no líder. El plan se bloquea antes
  -- de sumar los mínimos: dos personas a la vez en tiendas distintas se ponen en fila y la segunda ve el mínimo de la primera.
  perform 1 from retail.planes_compra where id = p_plan_id for update;
  if not found then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
$n$,
  1);

comment on function retail.guardar_plan_compra_minimo(uuid, uuid, integer) is
  'ADR-0372: fija (o quita, con NULL) el mínimo de una tienda activa en una campaña (1–90 %; la suma de la campaña no pasa de 100). Pide el módulo plan_compra (ADR-0362, decisión 64: ya no solo un líder) y bloquea el plan para sumar; firma el responsable del combo.';

reset lock_timeout;

-- Comprobación: si algo no quedó, el pegado falla y no se aplica nada.
do $$
declare
  v_def text := pg_get_functiondef('retail.guardar_plan_compra_minimo(uuid, uuid, integer)'::regprocedure);
begin
  if position('fn_es_lider' in v_def) > 0 then
    raise exception 'fijar el mínimo todavía pide ser líder';
  end if;
  if position('fn_ve_modulo(''plan_compra'')' in v_def) = 0 then
    raise exception 'fijar el mínimo dejó de pedir el módulo Plan de campaña';
  end if;
  if position('for update' in v_def) = 0 then
    raise exception 'fijar el mínimo no bloquea el plan antes de sumar';
  end if;
end;
$$;

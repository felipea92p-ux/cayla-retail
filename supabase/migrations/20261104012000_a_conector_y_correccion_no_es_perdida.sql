-- ============================================================================
-- 20261104012000_a_conector_y_correccion_no_es_perdida.sql — CAYLA V2 · ADR-0608
-- Dos correcciones a lo que entró con la salida anticipada, que encontró el CI.
--
-- EL PROBLEMA PRIMERO.
--   1. `20261104003000` volvió conector a la «a» en todo lugar, y un nombre que termina en una letra («Blusa A») pasaba a «Blusa a».
--   2. `corregir_salida` escribe una salida con motivo `correccion_recepcion`. Un motivo sin clase cae como pérdida: deshacer una tanda habría contado como merma.
--
-- QUÉ CAMBIA
--   1. `fn_titulo_referencia`: «a» es conector solo si le sigue otra palabra. «Polo a Rayas», y «Blusa A» sigue igual.
--   2. `fn_perdida_razon`: `correccion_recepcion` no es pérdida: la prenda nunca debió entrar. Como la producción revertida.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, sin políticas ni `drop trigger` (ADR-0195), idempotente.
-- ============================================================================

set lock_timeout = '3s';

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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición viva.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar('retail.fn_titulo_referencia(text)',
$v$if v_i > 1 and v_w = any (v_conectores) then$v$,
$n$if v_i > 1 and v_w = any (v_conectores) and (v_w <> 'a' or v_i < array_length(v_palabras, 1)) then$n$,
1);

select pg_temp.reemplazar('retail.fn_perdida_razon(text,text,integer)',
$v$'reversion_produccion', 'cuarentena_devuelta_proveedor') then null$v$,
$n$'reversion_produccion', 'cuarentena_devuelta_proveedor', 'correccion_recepcion') then null$n$,
1);

do $$
begin
  if retail.fn_titulo_referencia('polo a rayas') <> 'Polo a Rayas' or retail.fn_titulo_referencia('blusa a') <> 'Blusa A' then
    raise exception 'fn_titulo_referencia no quedó como se esperaba';
  end if;
  if retail.fn_es_perdida('salida', 'correccion_recepcion', 1) then
    raise exception 'corregir una tanda sigue contando como pérdida';
  end if;
end;
$$;

reset lock_timeout;

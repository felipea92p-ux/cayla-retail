-- ============================================================================================================
-- 20261021184000_cambios_acepta_qr_parte2_funciones.sql — CAYLA V2 · Cambios · QR como medio de la diferencia (PARTE 2 de 2)
--
-- EL PROBLEMA PRIMERO, y la parte 1, en 20261021183000_cambios_acepta_qr_parte1_candado.sql. Con el candado abierto, falta que el
-- cobro por QR de un cambio llegue a donde llega el de una venta: el libro de las cuentas.
--
-- QUÉ HACE (parte 2):
--   · `fn_dinero_libro`: la diferencia de un cambio cobrada con QR entra a la línea «Cobros con QR · sede» del día, junto a las ventas
--     (hoy el libro de los cambios solo conocía yape, plin, tarjeta y transferencia: un QR de cambio no aparecía en ninguna cuenta).
--     Reemplazo anclado: el ancla es la línea de los cambios y debe aparecer UNA vez.
--   · `fn_acepta_qr_en_cambios()`: la pregunta que hace la web antes de ofrecer el QR en el paso «Reemplazo»; si la migración no está
--     en producción la función no existe y la web sigue con los cinco medios de siempre (nunca ofrece algo que la base rechaza), como
--     `fn_acepta_pago_qr` de las ventas (20261002130000).
--
-- LO QUE YA ESTABA LISTO y no se toca: `fn_cuenta_sellada` (cobro con QR → la máquina de la tienda, ADR-0429), `fn_cambios_sellar`
-- (sella la cuenta al registrar), `fn_asiento_cuenta_de_medio` (el Diario lleva el QR a la 105) y `fn_resellar_cobros_a_maquinas`.
--
-- DECIDÍ: el QR de un cambio con diferencia NEGATIVA (devolverle plata) se acepta igual que la tarjeta: el candado de líder de
-- `registrar_cambio` sigue mandando (una devolución necesita aprobación) y el libro la resta de la misma cuenta.
-- DESCARTÉ: rehacer `registrar_cambio` en esta actividad: no valida la lista de medios (la validaba el candado de la parte 1).
--
-- SE ROMPE SI: alguien reescribe `fn_dinero_libro` copiándola de una versión anterior a esta (perdería el 'qr' de los cambios): el
-- reemplazo anclado de la siguiente migración que la toque lo verá porque su texto ya trae el 'qr'.
--
-- PRODUCCIÓN. Una parte, idempotente (se puede pegar dos veces): un reemplazo anclado y una función nueva; no toma tablas en
-- exclusiva ni toca políticas (sin riesgo de 40P01). Requiere la parte 1. Sin `select … into` dentro de un texto entre comillas.
-- ============================================================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo abortaría.
  if position(p_nuevo in v_def) > 0 and position(p_viejo in v_def) = 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaban %). Regenera el reemplazo desde su definición real.',
      p_firma, v_n, p_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.fn_dinero_libro(date)',
  $v$cb.metodo_pago_diferencia in ('yape', 'plin', 'tarjeta', 'transferencia') and cb.diferencia <> 0$v$,
  $v$cb.metodo_pago_diferencia in ('yape', 'plin', 'tarjeta', 'transferencia', 'qr') and cb.diferencia <> 0$v$,
  1
);

create or replace function retail.fn_acepta_qr_en_cambios() returns boolean
language sql stable set search_path = retail, public, extensions as $$
  select true;
$$;
comment on function retail.fn_acepta_qr_en_cambios() is
  'Existe desde que cambios.metodo_pago_diferencia acepta el QR (20261021183000). El paso «Reemplazo» de Cambios la pregunta antes de ofrecer el QR.';
grant execute on function retail.fn_acepta_qr_en_cambios() to authenticated;

select 'Cambios · QR · parte 2 (funciones)' as parte,
       case when pg_get_functiondef('retail.fn_dinero_libro(date)'::regprocedure) like '%cb.metodo_pago_diferencia in (''yape'', ''plin'', ''tarjeta'', ''transferencia'', ''qr'')%'
             and to_regprocedure('retail.fn_acepta_qr_en_cambios()') is not null
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;

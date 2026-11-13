-- ============================================================================
-- El cierre de mes dice CUÁNTA plata hay en compras que esperan su papel (ADR-0636, actividad 3)
--
-- EL PROBLEMA PRIMERO. El chequeo `papeles_por_completar` (20261105231000) decía solo cuántas compras esperaban y «puedes cerrar igual». Pero
-- una compra cuyo papel es de un mes cerrado ya no puede entrar al libro: `compras_mes_abierto` rechaza el insert de `completar_papel_compra`
-- y el papel queda con `pasa_sola_error` hasta reabrir el mes. Quien cierra tiene que saber cuánta mercadería deja fuera.
-- Felipe (2026-11-09) eligió entre bloquear, avisar con el monto o mandarlas al mes siguiente: **solo avisar, con el monto**.
--
-- QUÉ PROMETE. `fn_cierre_mes_estado`: el chequeo `papeles_por_completar` trae además `monto` (la suma del papel), solo para quien ve la plata
--   de proveedores (`fn_ve_plata_de_proveedores`, como `facturas_sin_recibir`); para los demás, null. Sigue SIN bloquear.
--   `fn_cierre_avisos_sin_plata`: ese monto también se calla en los avisos guardados de un cierre para quien no ve plata.
-- QUÉ NO HACE. No cambia cuándo se puede cerrar ni qué pasa con el papel de un mes cerrado.
--
-- PRODUCCIÓN. Una sola ejecución: dos reemplazos anclados (abortan sin cambiar nada si el texto no es el esperado). Idempotente. Sin políticas ni
-- `alter table` (ADR-0195). La web vieja ignora el dato nuevo: se puede pegar antes de publicar.
-- VERIFICACIÓN (solo lectura, como líder): select c from retail.fn_cierre_mes_estado(current_date) e, jsonb_array_elements(e.chequeos) c where c->>'clave' = 'papeles_por_completar';
-- CÓMO SE DESHACE: los dos reemplazos al revés.
-- ============================================================================
set search_path = retail, public, extensions;
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar('retail.fn_cierre_mes_estado(date)',
$v$    select 'empresa'::text, null::uuid, 12, 'papeles_por_completar', x.n = 0, false, jsonb_build_object('n', x.n)
      from (select count(*) as n from retail.compra_papeles p where p.estado = 'por_completar' and p.fecha <= v_fin) x$v$,
$n$    select 'empresa'::text, null::uuid, 12, 'papeles_por_completar', x.n = 0, false,
           jsonb_build_object('n', x.n, 'monto', case when v_ve_plata then x.monto end)   -- ADR-0636: cuánta mercadería queda fuera del libro
      from (select count(*) as n, coalesce(sum(p.monto), 0) as monto
              from retail.compra_papeles p where p.estado = 'por_completar' and p.fecha <= v_fin) x$n$,
1);

select pg_temp.reemplazar('retail.fn_cierre_avisos_sin_plata(jsonb)',
$v$in ('envios_con_diferencia', 'facturas_sin_recibir')$v$,
$n$in ('envios_con_diferencia', 'facturas_sin_recibir', 'papeles_por_completar')$n$,
1);

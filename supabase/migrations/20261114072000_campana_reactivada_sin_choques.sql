-- ============================================================================
-- 20261114072000 — Volver a activar una campaña también pasa por «una prenda, una oferta por tienda y por día» (ADR-0655, auditoría)
--
-- EL PROBLEMA. El candado de los choques (`campana_reglas_sin_choques`, 20261113223000) mira una oferta cuando se guarda o se activa. Una
--   campaña desactivada no cuenta para los choques (`e.activo`), así que esto pasaba:
--     1. la campaña X tiene «−20 % polos» activa y se desactiva;
--     2. en la campaña Y se activa «3x2 polos»: no choca, porque X está apagada;
--     3. se vuelve a activar X: nada mira sus ofertas, y cada polo lleva el −20 % y además su parte del 3x2.
--   La regla de Felipe es que una prenda tiene una sola oferta por tienda y por día, y que el choque se resuelve al configurar. Volver a activar
--   una campaña vuelve a encender sus ofertas: es configurar.
--
-- LO QUE HACE. Un disparador diferido en `etiquetas` (como el de las ofertas): cuando una campaña vuelve a quedar viva (activa y aprobada), cada
--   oferta activa suya pasa por `fn_exigir_sin_choques`. Si choca, no se reactiva y el mensaje dice con qué oferta y en qué tienda.
--
-- QUÉ NO HACE. Sigue sin mirar lo que el ADR ya dejó fuera (cambiar el alcance desde fuera de una oferta: marcar prendas, sumar categorías). Y
--   el descuento de siempre de la campaña que se reactiva no se compara con las ofertas de las otras: lo anota el backlog.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: una función y un disparador nuevo (`create constraint trigger` solo si no
--   existe; ni `drop trigger` ni políticas, ADR-0195). Va DESPUÉS de 20261114060000 (el candado con las insignias).
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:ofertas-por-insignia` («Volver a activar una campaña»).
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.fn_campana_reactivada_sin_choques()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_regla uuid;
begin
  -- Al cerrar la transacción, con la campaña ya viva: cada oferta activa suya, contra las demás (la misma regla que al guardarla).
  for v_regla in select r.id from retail.campana_reglas r where r.etiqueta_id = new.id and r.estado = 'activa' order by r.creada_en, r.id loop
    perform retail.fn_exigir_sin_choques(v_regla);
  end loop;
  return null;
end;
$function$;

comment on function retail.fn_campana_reactivada_sin_choques() is
  'ADR-0655. Al volver a quedar viva una campaña (activa y aprobada), sus ofertas activas pasan por fn_exigir_sin_choques: una prenda, una oferta por tienda y por día. La llama el disparador etiquetas_campana_reactivada_sin_choques.';

revoke all on function retail.fn_campana_reactivada_sin_choques() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.etiquetas'::regclass and tgname = 'etiquetas_campana_reactivada_sin_choques') then
    create constraint trigger etiquetas_campana_reactivada_sin_choques
      after update of activo, estado on retail.etiquetas
      deferrable initially deferred
      for each row
      when (new.estilo = 'campana' and new.activo and new.estado = 'aprobado'
            and (old.activo is distinct from true or old.estado is distinct from 'aprobado'))
      execute function retail.fn_campana_reactivada_sin_choques();
  end if;
end;
$$;

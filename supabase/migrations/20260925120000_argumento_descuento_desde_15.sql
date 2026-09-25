-- ============================================================================
-- 20260925120000_argumento_descuento_desde_15.sql — CAYLA V2 (Felipe 2026-09-25)
--
-- EL CAMBIO. Todo descuento MANUAL de venta que pase el 15 % del precio pide un argumento
-- escrito, lo aplique quien lo aplique. Antes (R-45, 20260915140000) lo pedía solo a un Líder y
-- solo pasado el 20 %; una Colaboradora quedaba cubierta por el tope de su código.
--
-- QUÉ SE CONSERVA. El resto del escalonado: más de 35 % nadie lo aplica, ni un Líder
-- (`venta_descuento_supera_autorizacion`), y el código de una Colaboradora sigue exigido y con
-- su tope. Las líneas de campaña no piden argumento (la rama de abajo es solo la de los
-- descuentos manuales). Misma cuenta que la caja (`necesitaArgumentoEscrito`,
-- apps/web/lib/vender-reglas.ts): el 15 % redondeado al céntimo, con 1 céntimo de holgura.
--
-- POR QUÉ SE PARCHA Y NO SE REESCRIBE. Igual que 20260923174100: la versión viva de
-- `registrar_venta` no es la de ningún archivo (lleva parches encima). Se reemplaza SOLO el bloque
-- del escalonado con `pg_temp.reemplazar`: si no aparece exactamente una vez, se aborta todo.
-- Re-ejecutable: si ya está aplicado, no se toca.
--
-- PRODUCCIÓN: pegar SOLO con OK de Felipe (cambia lo que la caja acepta). Ya lleva `retail.` en
-- todo. Va de la mano de la web: con la base nueva y la caja vieja, un descuento de 16-20 % sin
-- argumento se rechaza al cobrar con el mensaje «pasa el 15 %: escribe el argumento» — no pierde
-- nada, pero conviene publicar la web primero.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void language plpgsql as $f$
declare v_def text; v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception 'argumento desde 15 %%: en % se esperaban % apariciones de «%» y hay %', p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text)',
  $v$      if fn_es_lider() then
        if v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.35, 2) + 0.01 then
          raise exception 'venta_descuento_supera_autorizacion' using detail = v_referencia || ' (' || v_sku || ')';
        elsif v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.20, 2) + 0.01 and v_argumento = '' then
          raise exception 'venta_descuento_requiere_argumento' using detail = v_referencia || ' (' || v_sku || ')';
        end if;
      end if;$v$,
  $n$      if fn_es_lider() and v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.35, 2) + 0.01 then
        raise exception 'venta_descuento_supera_autorizacion' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      -- Felipe 2026-09-25: pasado el 15 %, argumento escrito para cualquiera (antes: Líder, 20 %).
      if v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.15, 2) + 0.01 and v_argumento = '' then
        raise exception 'venta_descuento_requiere_argumento' using detail = v_referencia || ' (' || v_sku || ')';
      end if;$n$,
  1);

-- Validación final: si algo no quedó como se espera, se aborta TODO.
do $$
declare
  v_rv text := pg_get_functiondef('retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text)'::regprocedure);
begin
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_venta') <> 1 then
    raise exception 'argumento desde 15 %%: quedaron sobrecargas de registrar_venta';
  end if;
  if position('* 0.15, 2) + 0.01 and v_argumento = ''''' in v_rv) = 0 then
    raise exception 'argumento desde 15 %%: registrar_venta no quedó con el umbral nuevo';
  end if;
  if position('* 0.20, 2) + 0.01 and v_argumento' in v_rv) > 0 then
    raise exception 'argumento desde 15 %%: quedó el umbral viejo del 20 %%';
  end if;
end $$;

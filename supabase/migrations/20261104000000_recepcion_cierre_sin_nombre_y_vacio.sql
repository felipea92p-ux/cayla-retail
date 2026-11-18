-- ============================================================================
-- 20261104000000_recepcion_cierre_sin_nombre_y_vacio.sql — CAYLA V2 · ADR-0604 (act. 2026-11-03)
-- Recibir: un modelo sin nombre ya no frena el cierre, un envío sin aviso en 0 no se cierra, y uno reabierto que nunca metió stock se puede cancelar.
--
-- EL PROBLEMA PRIMERO. La prueba de punta a punta del 2026-11-03 encontró tres cosas (`docs/flujos/recibir/sin-aviso-de-punta-a-punta.md`):
--   · «Blusa 1» contada no dejaba cerrar: nadie sabía el nombre, así que apareció «Aretes sin nombre», y por esos aretes tampoco entraba lo demás.
--   · Un envío sin aviso se podía cerrar con 0 contadas: quedaba «recibido» para siempre, sin nada.
--   · Ese envío, reabierto, ya no se podía cancelar, aunque nunca hubiera metido una prenda al stock.
--
-- QUÉ CAMBIA (Felipe, 2026-11-03; reemplazos ANCLADOS: si el texto vivo no es el esperado, se detiene sin cambiar nada)
--   1. `cerrar_conteo_envio`: un modelo contado con su nombre provisional cierra y queda como pendiente de crear. No se puede vender hasta tener
--      nombre, porque solo entra al stock creándolo. Cambia la regla de `20261103182000`.
--   2. `cerrar_conteo_envio`: un envío sin aviso con todo en 0 no cierra (`envio_vacio`). Con guía sí: «no llegó nada» de una línea es un dato.
--   3. `cancelar_recepcion_envio`: lo que frena es haber metido stock, no haberse cerrado alguna vez.
--
-- DESCARTÉ
--   · Una columna «por defecto» en `despacho_pendientes`: el conteo ya guarda esa marca en `separado`, y la pantalla la lee de ahí.
--   · Detectar «Blusa 1» por su texto: una blusa puede llamarse así de verdad.
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
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  -- Ya está si está lo nuevo y no volvió lo viejo: las pruebas recargan migraciones anteriores, que pueden volver a poner lo que esta quita.
  if position(p_nuevo in v_def) > 0 and (v_n = 0 or position(p_viejo in p_nuevo) > 0) then
    return;
  end if;
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición viva.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El nombre pendiente no frena ----------
select pg_temp.reemplazar('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
$v$    -- ADR-0604 (act. 2026-11-03): un modelo contado no se cierra con su nombre provisional, y uno en 0 no deja rastro.
    if exists (select 1 from jsonb_array_elements(v_sep -> 'nuevas') x where x ->> 'por_defecto' = 'true' and (x ->> 'cantidad')::integer > 0) then
      raise exception 'Cambia el nombre de «%» antes de cerrar', (select x ->> 'descripcion' from jsonb_array_elements(v_sep -> 'nuevas') x
                                                                  where x ->> 'por_defecto' = 'true' and (x ->> 'cantidad')::integer > 0 limit 1)
        using hint = 'recepcion_modelo_sin_nombre';
    end if;
$v$,
$n$    -- Un modelo contado con su nombre provisional cierra y queda pendiente de crear (20261104000000); uno en 0 no deja rastro.
$n$,
1);

-- ---------- 2. Sin aviso y sin nada contado no se cierra ----------
select pg_temp.reemplazar('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
$v$  -- Lo que decidió quien cierra, por conteo: cada uno una vez y con la versión que vio.$v$,
$n$  -- Un envío sin aviso sin nada contado no es una recepción (20261104000000): se cuenta o se cancela.
  if exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id)
     and not exists (select 1 from retail.despacho_conteos k where k.despacho_id = p_despacho_id and k.contadas > 0) then
    raise exception 'No contaste nada: cuenta lo que llegó o cancela la recepción' using hint = 'envio_vacio';
  end if;

  -- Lo que decidió quien cierra, por conteo: cada uno una vez y con la versión que vio.$n$,
1);

-- ---------- 3. Reabierto y sin stock, se puede cancelar ----------
select pg_temp.reemplazar('retail.cancelar_recepcion_envio(uuid,integer,text)',
$v$  if exists (select 1 from retail.despacho_cierres c where c.despacho_id = p_despacho_id)
     or exists (select 1 from retail.despacho_recibidos r where r.despacho_id = p_despacho_id) then$v$,
$n$  -- Lo que frena es haber metido stock (20261104000000): cerrado alguna vez y sin prendas, se puede cancelar.
  if exists (select 1 from retail.despacho_recibidos r where r.despacho_id = p_despacho_id) then$n$,
1);

-- ---------- 4. Comprobación ----------
do $$
begin
  if position('recepcion_modelo_sin_nombre' in pg_get_functiondef('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure)) > 0
     or position('envio_vacio' in pg_get_functiondef('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure)) = 0 then
    raise exception 'cerrar_conteo_envio no quedó como se esperaba';
  end if;
  if position('(20261104000000)' in pg_get_functiondef('retail.cancelar_recepcion_envio(uuid,integer,text)'::regprocedure)) = 0 then
    raise exception 'cancelar_recepcion_envio no quedó como se esperaba';
  end if;
end;
$$;

reset lock_timeout;

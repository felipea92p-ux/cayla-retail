-- ============================================================================
-- 20261031160000_produccion_quitar_marca_solo_lider.sql — CAYLA V2 (ADR-0586, actividad 2 · 2026-10-31)
--
-- EL PROBLEMA PRIMERO. Ploteo no se cuenta: se marca (un toque). Hoy hay DOS caminos para quitar esa marca y los dos los usa cualquiera que opere el Taller:
--   · «Deshacer» en el paso (`deshacer_marca_fase`, 20261019192000): sin motivo y sin dejar nada en la historia de cambios;
--   · el lápiz de la historia (`eliminar_anotacion_orden`, 20261029173000, ADR-0570): con motivo y con «Restaurar».
-- Quitar la marca cambia la orden de verdad: Ploteo vuelve a «por hacer» y, si lo hacía un servicio, su costo sale de la orden (`fn_fases_de_orden` devenga `fijo_orden` solo con la
-- marca viva). Felipe, el 2026-10-30 y el 2026-10-31: lo quita SOLO un líder y con motivo; restaurarla también es del líder; marcar sigue siendo de quien opera; y se puede quitar
-- aunque Corte ya haya empezado (el Taller ya puede cortar sin Ploteo marcado: no deja nada imposible).
-- Felipe eligió además que, desde una tablet del Taller, valga elegir a un líder de turno en «Responsable». Esa tablet NO existe ni puede existir hoy: una terminal solo se crea en una
-- tienda (20260923040000, `23514`) y en producción ninguna de las 6 ve Producción (consultado el 2026-10-31). Esa regla queda escrita en ADR-0586 para el día que se habilite; aquí no
-- se escribe un camino que no puede correr ni probarse.
--
-- QUÉ HACE (sin tablas, sin políticas)
--   · `eliminar_anotacion_orden` y `restaurar_anotacion_orden`: en la rama de la MARCA, y solo ahí, exigen que la CUENTA sea líder (`fn_es_lider`, el mismo candado de
--     `agregar_paso_tarde`; los permisos son de la cuenta, no del responsable del combo, ADR-0161) → `42501 marca_solo_lider`. Quitar o restaurar un «Terminé» no cambia:
--     sigue siendo de quien opera (la actividad 3 lo decide). Reemplazos ANCLADOS sobre la función viva (la lección de 20261031031000: no se reescribe entera una función que otros parchan).
--   · `deshacer_marca_fase` se BORRA: era el segundo camino, sin motivo ni líder. Esconder su botón no alcanzaba: estaba abierta a `authenticated` y se podía llamar directo.
--     Sus filas viejas siguen en `produccion_fase_marcas` (append-only) y la historia las sigue dibujando («Deshizo la marca»).
--
-- CONTRATO (Liskov)
--   PROMETE: la marca de un hito solo se QUITA con la firma de un líder y con motivo, por UN solo camino que deja historia; «Restaurar» (devolverla tal como era, con su nota,
--            como si quitarla hubiera sido un error) también es del líder. Volver a MARCAR sigue abierto a quien opera (Felipe: el día que el plano sí se hace, lo marca quien
--            lo hizo): una integrante puede dejar Ploteo «hecho» otra vez después de que un líder lo quitó, como una marca nueva, con su nombre y su hora, sin el motivo del líder.
--            Lo que el líder decidió queda en la historia igual. Nada más cambia de quién puede qué.
--   ASUME:   `fn_produccion_operar_fase` (permiso de operar, responsable, orden en proceso) como lo deja 20261014155000, y `fn_es_lider` (20260922170000).
--   NO HACE: no toca `marcar_fase_hecha` (marcar sigue abierto a quien opera); no frena quitar la marca con Corte avanzado (decisión de Felipe); no corrige una orden ya cerrada.
--
-- DECIDÍ: el candado va en la rama de la marca de las dos funciones que ya dejan historia, y el camino viejo se borra.
-- DESCARTÉ: (a) quitarle el permiso a `deshacer_marca_fase` y dejarla: una función que nadie puede llamar es un segundo camino esperando que alguien le devuelva el `grant`; (b) poner el
--   candado al inicio de `eliminar_anotacion_orden`: también frenaría corregir un «Terminé», que la actividad 3 deja para quien opera; (c) escribir ya el camino «tablet + líder en el
--   combo»: no hay tablet en el Taller y no puede crearse, así que sería código que nadie corre y una prueba que tendría que saltarse el candado de las terminales para existir;
--   (d) frenar si Corte ya empezó: un ploteo marcado por error quedaría para siempre, con su costo.
-- SE ROMPE SI: se habilita una tablet en el Taller (cambiando la regla de 20260923040000) y nadie suma aquí la regla de ADR-0586 para ella: un líder no podría quitar la marca desde ahí,
--   tendría que entrar con su cuenta. Falla cerrado (nadie quita de más), no abierto.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: dos reemplazos anclados (el texto entre comillas que insertan no lleva
--   `select … into`, ADR-0288) y un `drop function` (no toma las tablas de `auth` ni de `storage`, ADR-0195). Va DESPUÉS de 20261029173000. ANTES de publicar la web: la web vieja
--   llama a `deshacer_marca_fase`; entre el pegado y la publicación su «Deshacer» responde con un error (unos minutos).
--   Prueba: `pnpm pruebas:produccion-ploteo` y `pnpm pruebas:produccion-correcciones`.
-- ============================================================================

set lock_timeout = '3s';

-- 1. Quitar y restaurar la marca de un hito: solo un líder.
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado('retail.eliminar_anotacion_orden(uuid[],text)',
  $v$    -- La marca de Ploteo: la viva, una sola.
$v$,
  $v$    -- La marca de Ploteo: la viva, una sola.
    -- 20261031160000 (ADR-0586 act. 2): quitarla es de un líder.
    if not coalesce(retail.fn_es_lider(), false) then
      raise exception 'Quitar la marca de «%» es de un líder: pídele a un líder que lo haga con su cuenta', retail.fn_fase_nombre(v_op.clave)
        using errcode = '42501', hint = 'marca_solo_lider';
    end if;
$v$);

select pg_temp.reemplazar_anclado('retail.restaurar_anotacion_orden(uuid,text)',
  $v$  if v_c.objeto = 'marca' then
$v$,
  $v$  if v_c.objeto = 'marca' then
    -- 20261031160000 (ADR-0586 act. 2): restaurar una marca quitada deshace la decisión de un líder: también es de un líder.
    if not coalesce(retail.fn_es_lider(), false) then
      raise exception 'Restaurar la marca de «%» es de un líder: pídele a un líder que lo haga con su cuenta', retail.fn_fase_nombre(v_op.clave)
        using errcode = '42501', hint = 'marca_solo_lider';
    end if;
$v$);

-- 2. El camino viejo, sin motivo ni líder, se va.
drop function if exists retail.deshacer_marca_fase(uuid);

reset lock_timeout;

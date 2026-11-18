-- ============================================================================
-- 20261031031000_produccion_agregar_paso_cuenta_fallas.sql — CAYLA V2 (ADR-0566 · arreglo, 2026-10-31)
--
-- EL PROBLEMA PRIMERO. `agregar_paso_orden` (20261029051000) no deja sumar un paso si uno POSTERIOR ya tiene algo anotado: un avance, una salida, una vuelta o una marca. Pero no miraba
-- `produccion_fallas`. Una fase puede tener SOLO prendas con falla: en Planchado se anotan 3 perdidas («Se quemó») y ninguna buena. Para esta función, Planchado «no había empezado»: el
-- paso nuevo (Ojales y botones) entraba antes, vacío, y Planchado quedaba con 3 perdidas de 0 que le llegaron. La orden no cuadra y no hay forma honesta de arreglarla después.
-- La pantalla ya lo evitaba (lee la fase como empezada y manda al líder a «agregar tarde», ADR-0586); el hueco era una llamada directa a la función. La base es la que manda (principio 2).
-- `agregar_paso_tarde` (20261031002000) ya cuenta las fallas: con esto las dos funciones hermanas dicen lo mismo de cuándo un paso «ya empezó».
--
-- QUÉ HACE: un reemplazo ANCLADO sobre la función viva, con UNA condición más en «un paso posterior ya tiene algo anotado». Firma, permisos, comentario de la base aparte, candado,
--   Actividad, respuesta y el candado de «proceso apagado» (20261029210000), iguales.
--   Por qué anclado y no la función entera: la primera versión de este archivo reescribía la función copiando 20261029051000 y BORRABA sin querer el candado que le puso el catálogo de
--   procesos (20261029210000, también un reemplazo anclado): pegada en producción, «Agregar un paso» habría vuelto a aceptar un proceso apagado. Lo vio la comparación contra la función
--   viva de producción el 2026-10-31, antes de pegarla. El ancla falla con un error claro si la función cambió, en vez de pisar lo que otro le agregó.
--
-- DECIDÍ: contar cualquier fila de `produccion_fallas` de la fase, sin mirar su destino (perdida, segunda, faltó, arreglo): como avances y salidas, es historia que apunta a la fase.
-- DESCARTÉ: contar solo las fallas que no van a arreglo (como hace «usadas» en `fn_produccion_exigir_cadena`): una falla que vuelve a arreglo igual dice que esas prendas ya pasaron por
--   Planchado; agregar un paso antes y dejarlas sin pasar por él es la misma contradicción. Y descarté arreglarlo solo en la web: la pantalla no es la única que puede llamar a la base.
-- SE ROMPE SI: aparece otra tabla que anote prendas contra una fase (una nueva clase de evento) y nadie la suma aquí ni en `agregar_paso_tarde`; la prueba R5b solo cubre las fallas.
--
-- PRODUCCIÓN. Aplicada el 2026-10-31 (verificada por md5 de la función contra la base local). Una sola parte, re-ejecutable, `lock_timeout = 3s`: un reemplazo anclado de una función que ya existe (el `create or replace` que
--   arma conserva sus permisos) y su comentario; no toca las tablas de `auth` ni de `storage` (ADR-0195) y el texto entre comillas que inserta no lleva `select … into` (ADR-0288).
--   Va DESPUÉS de 20261029051000, de 20261029164000 (crea `produccion_fallas`) y de 20261029210000. Si se pega dos veces, la segunda no hace nada.
--   Prueba: `pnpm pruebas:produccion-agregar-paso` (caso R5b).
-- ============================================================================

set lock_timeout = '3s';

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

-- Un paso posterior con prendas con falla también «ya empezó».
select pg_temp.reemplazar_anclado('retail.agregar_paso_orden(uuid,text,text,uuid,numeric,numeric,integer,date,boolean,text)',
  $v$          or exists (select 1 from retail.produccion_fase_marcas m where m.fase_id = f.id))
$v$,
  $v$          or exists (select 1 from retail.produccion_fase_marcas m where m.fase_id = f.id)
          -- 20261031031000: una prenda con falla (perdida, segunda, faltó) también es algo anotado en esa fase, aunque no tenga ningún avance.
          or exists (select 1 from retail.produccion_fallas fa where fa.fase_id = f.id))
$v$);

comment on function retail.agregar_paso_orden(uuid, text, text, uuid, numeric, numeric, integer, date, boolean, text) is
  'ADR-0566: suma UN paso a una orden en proceso (hermana de quitar_paso_orden). La ruta resultante pasa la misma validación que al abrir; no se agrega si un paso posterior ya tiene algo anotado '
  '(paso_despues_empezado; cuentan avances, salidas, vueltas, marcas y prendas con falla). Toma el candado por orden y deja el rastro en Actividad. No mueve dinero. Devuelve fn_fases_de_orden.';

reset lock_timeout;

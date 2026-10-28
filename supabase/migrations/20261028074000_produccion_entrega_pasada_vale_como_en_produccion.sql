-- ============================================================================
-- 20261028074000_produccion_entrega_pasada_vale_como_en_produccion.sql — CAYLA V2 (Producción, ADR-0551 · 2026-10-28)
--
-- EL PROBLEMA PRIMERO. Producción tiene un cambio que `main` no tenía: `retail.abrir_orden_produccion` ya NO rechaza una fecha de ENTREGA pasada (ADR-0537, que Felipe
-- pegó el 2026-10-27: «se registra una orden que el Taller ya hizo»). `20261028064000` trajo a `main` la mitad de ese cambio (la fecha PROMETIDA de un paso, en
-- `fn_produccion_fases_normalizar`) y dio por hecho que la de entrega seguía rechazándose; en producción no es así. Resultado: la misma función tiene dos cuerpos distintos, y el
-- check «SQL pegado» del PR de «pendiente de registrar» (20261028072000, que también toca `abrir_orden_produccion`) lo vio: seis de sus siete objetos coinciden con producción y
-- `abrir_orden_produccion` no, por exactamente tres líneas.
--
-- LA DECISIÓN (Felipe, 2026-10-28, a «¿ajustar main a producción o producción a main?»): «Ajustar main a producción». Producción no se toca.
--
-- QUÉ HACE (una sola función; un reemplazo ANCLADO de tres líneas por un comentario; sin tablas, sin políticas, sin `alter`)
--   · Quita de `abrir_orden_produccion` la comprobación «la fecha de entrega ya pasó» (`entrega_pasada`) y deja en su lugar el mismo comentario que tiene producción, letra por letra.
--   · NO toca `abrir_produccion` ni `abrir_produccion_con_modelo_nuevo` (las dos entradas viejas de la lista de lotes): esas siguen rechazando una entrega pasada (ADR-0415) y no
--     son las que usa la hoja de Nueva orden.
--   · La hoja de Nueva orden sigue pidiendo una fecha de hoy en adelante: aquí solo se alinea la base con lo que ya hace producción.
--
-- EN PRODUCCIÓN NO HACE NADA: el comentario ya está en la función viva, y el reemplazo anclado se detiene en silencio si lo que quiere poner ya está (re-ejecutable). Pegarla no
-- cambia ni una fila ni un comportamiento; sirve para que el check «SQL pegado» pueda comparar.
--
-- DECIDÍ: reemplazo ANCLADO (`pg_temp.reemplazar_anclado`, ADR-0288), como 20261028052000 y 20261028064000, y no reescribir la función entera: tiene varias capas y producción tiene la suya.
-- DESCARTÉ: (1) devolver a producción la comprobación (`entrega_pasada`): habría que pegar SQL y, desde ese momento, no se podría abrir una orden ya hecha con entrega pasada
--   (Felipe eligió no hacerlo); (2) sacar de 20261028072000 el cambio a `abrir_orden_produccion`: esa migración YA está pegada en producción y su cambio (nombrar «un servicio sin
--   registrar») tiene que seguir representado en `main`.
-- SE ROMPE SI: la función de producción cambia otra vez antes de pegar esto (el ancla cuenta cuántas veces aparece y se detiene sin tocar nada si no es exactamente una); o alguien
--   vuelve a pegar `20261014154000`/`20261015153000`, que traen la comprobación de vuelta (guardan su propio candado de md5: se detienen, nunca se repegan).
--
-- PRODUCCIÓN. Una sola parte, `lock_timeout = 3s`, sin políticas; dentro de los textos no hay ningún `select … into` (ADR-0288). Prueba: `pnpm pruebas:produccion-cinco-pasos` (caso E1).
-- ============================================================================
set lock_timeout = '3s';

-- Reemplaza `p_viejo` por `p_nuevo` en la función viva; `p_viejo` tiene que aparecer exactamente una vez. Si `p_nuevo` ya está, no hace nada.
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

select pg_temp.reemplazar_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$  if v_fecha is not null and v_fecha < retail.fn_hoy_lima() then
    raise exception 'La fecha de entrega ya pasó: elige una de hoy en adelante' using hint = 'entrega_pasada';
  end if;
$v$,
  $v$  -- ADR-0537: una entrega pasada vale (se registra una orden que ya se hizo); en la lista se ve como «Entrega pasada».
$v$
);

reset lock_timeout;

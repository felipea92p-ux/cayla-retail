-- ============================================================================
-- 20261028074000_produccion_entrega_pasada_vale_como_en_produccion.sql — CAYLA V2 (Producción, ADR-0551 · 2026-10-28)
--
-- EL PROBLEMA PRIMERO. Producción tiene un cambio que `main` no tenía: ni `abrir_orden_produccion` ni las dos funciones a las que ella envuelve (`abrir_produccion` y
-- `abrir_produccion_con_modelo_nuevo`) rechazan ya una fecha de ENTREGA pasada (ADR-0537, que Felipe pegó el 2026-10-27: «se registra una orden que el Taller ya hizo»).
-- `20261028064000` trajo a `main` la mitad de ese cambio (la fecha PROMETIDA de un paso, en `fn_produccion_fases_normalizar`) y dio por hecho que la de entrega seguía
-- rechazándose; en producción no es así. Resultado: las mismas tres funciones tienen dos cuerpos distintos, y el check «SQL pegado» del PR de «pendiente de registrar»
-- (20261028072000, que también toca `abrir_orden_produccion`) lo vio en la primera; la prueba E1 de CI lo vio en las otras dos (la entrega pasada seguía rechazándose por ellas).
--
-- LA DECISIÓN (Felipe, 2026-10-28, a «¿ajustar main a producción o producción a main?»): «Ajustar main a producción». Producción no se toca.
--
-- QUÉ HACE (una sola función; un reemplazo ANCLADO de tres líneas por un comentario; sin tablas, sin políticas, sin `alter`)
--   · Quita de `abrir_orden_produccion` la comprobación «la fecha de entrega ya pasó» (`entrega_pasada`) y deja en su lugar el mismo comentario que tiene producción, letra por letra.
--   · Quita de `abrir_produccion` y de `abrir_produccion_con_modelo_nuevo` la comprobación de ADR-0415 («la entrega no puede ser antes de hoy», `entrega_pasada`, de
--     20261015153000) y deja también el comentario de producción. `abrir_orden_produccion` las llama, así que sin ellas la entrega pasada seguía rechazándose.
--   · La hoja de Nueva orden sigue pidiendo una fecha de hoy en adelante: aquí solo se alinea la base con lo que ya hace producción.
--
-- EN PRODUCCIÓN NO HACE NADA: el comentario ya está en la función viva, y el reemplazo anclado se detiene en silencio si lo que quiere poner ya está (re-ejecutable). Pegarla no
-- cambia ni una fila ni un comportamiento; sirve para que el check «SQL pegado» pueda comparar.
--
-- DECIDÍ: reemplazo ANCLADO (`pg_temp.reemplazar_anclado`, ADR-0288), como 20261028052000 y 20261028064000, y no reescribir la función entera: tiene varias capas y producción tiene la suya.
-- DESCARTÉ: (1) devolver a producción la comprobación (`entrega_pasada`): habría que pegar SQL y, desde ese momento, no se podría abrir una orden ya hecha con entrega pasada
--   (Felipe eligió no hacerlo); (1b) alinear solo `abrir_orden_produccion`: es lo que hice primero y falló en CI, porque la entrega pasada seguía rechazándose por las dos funciones
--   que ella llama; (2) sacar de 20261028072000 el cambio a `abrir_orden_produccion`: esa migración YA está pegada en producción y su cambio (nombrar «un servicio sin
--   registrar») tiene que seguir representado en `main`.
-- SE ROMPE SI: una función de producción cambia otra vez antes de pegar esto (el ancla cuenta cuántas veces aparece y se detiene sin tocar nada si no es exactamente una); o alguien
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

-- Las dos funciones a las que `abrir_orden_produccion` envuelve: producción también les quitó la comprobación de ADR-0415 (20261015153000) y dejó este comentario.
select pg_temp.reemplazar_anclado(
  'retail.abrir_produccion(uuid, uuid, jsonb, numeric, numeric, numeric, boolean, date, text, uuid)',
  $v$  -- ADR-0415: la entrega es una promesa del Taller; una anterior a hoy no promete nada (entrega_pasada).
  if p_fecha_entrega is not null and p_fecha_entrega < retail.fn_hoy_lima() then
    raise exception 'La entrega no puede ser antes de hoy (%): elige el día en que el Taller la va a entregar, o déjala en blanco.',
      to_char(retail.fn_hoy_lima(), 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'entrega_pasada';
  end if;
$v$,
  $v$  -- ADR-0537: una entrega pasada vale (se registra una orden que ya se hizo).
$v$
);

select pg_temp.reemplazar_anclado(
  'retail.abrir_produccion_con_modelo_nuevo(uuid, text, uuid, jsonb, numeric, numeric, numeric, numeric, boolean, date, text, boolean, uuid)',
  $v$  -- ADR-0415: la entrega es una promesa del Taller; una anterior a hoy no promete nada (entrega_pasada).
  if p_fecha_entrega is not null and p_fecha_entrega < retail.fn_hoy_lima() then
    raise exception 'La entrega no puede ser antes de hoy (%): elige el día en que el Taller la va a entregar, o déjala en blanco.',
      to_char(retail.fn_hoy_lima(), 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'entrega_pasada';
  end if;
$v$,
  $v$  -- ADR-0537: una entrega pasada vale (se registra una orden que ya se hizo).
$v$
);

reset lock_timeout;

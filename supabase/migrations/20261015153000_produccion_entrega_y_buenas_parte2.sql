-- ============================================================================
-- 20261015153000_produccion_entrega_y_buenas_parte2.sql — CAYLA V2 (recomendaciones de /chaos, ADR-0415, 2026-10-15) · PARTE 2 de 2
--
-- EL PROBLEMA PRIMERO. /chaos de Producción (2026-10-13 y 14, ADR-0409) dejó dos preguntas para Felipe, que pidió aplicar la
-- recomendación (2026-10-15):
--   1. Una orden se abría prometiendo la entrega en 1990 (PRO-06). La fecha de entrega es una promesa del Taller: una en el pasado no
--      promete nada, y la cuenta de «entregas a tiempo» (`eficiencia-reglas.ts`) la da por atrasada desde el primer día.
--   2. Una orden de 6 se cerraba con 9 buenas (PRO-08) sin límite: un 60 tipeado por un 6 entraba al stock como 54 prendas que no existen.
--      Que salgan algunas más de lo pedido es real (el corte rindió), así que no se prohíbe: se pone un techo que solo un error pasa.
--
-- LA DECISIÓN.
--   1. `abrir_produccion` y `abrir_produccion_con_modelo_nuevo` rechazan una entrega anterior a hoy (`entrega_pasada`). Va DESPUÉS de mirar
--      el token: un reintento de una orden ya abierta ayer devuelve la orden, no un rechazo. Sin fecha, todo sigue igual (es opcional).
--   2. `cerrar_produccion` rechaza una talla con más del doble de lo pedido, o más de 5 de más si la talla es chica
--      (`greatest(plan × 2, plan + 5)`, `buenas_de_mas`). La pantalla dice lo mismo antes de mandar (`topeDeBuenas`).
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna orden nueva promete una entrega anterior a hoy; ninguna orden se cierra con una talla por encima de ese techo. Lo
--            demás sigue igual.
--   ASUME:   las tres funciones vivas a la fecha (anclas verificadas en local y en producción el 2026-10-15, después de ADR-0409).
--   NO HACE: no toca tablas, datos ni políticas; no cambia órdenes ya abiertas ni cerradas (en producción no hay ninguna, 2026-10-15).
--
-- CÓMO SE PEGA. Una sola parte, solo funciones. Reemplazos ANCLADOS sobre la definición viva (ADR-0288): el bloque va antes de la
-- primera aparición del ancla, que tiene que aparecer exactamente una vez (si no, se detiene sin tocar nada). Anclas de una línea de
-- código, nunca comentarios. Idempotente (cada bloque lleva su marca). Sin `select … into` dentro de un texto entre comillas.
-- ============================================================================
set lock_timeout = '3s';

-- Inserta `p_bloque` antes de la primera aparición de `p_ancla`, que tiene que aparecer exactamente `p_veces` veces.
-- Si `p_marca` ya está en la función, no hace nada.
create or replace function pg_temp.insertar_antes(p_firma text, p_ancla text, p_veces integer, p_bloque text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_ancla, v_n;
  end if;
  execute overlay(v_def placing p_bloque || p_ancla from position(p_ancla in v_def) for length(p_ancla));
end;
$f$;

-- 1. La entrega no es anterior a hoy.
select pg_temp.insertar_antes(
  'retail.abrir_produccion(uuid, uuid, jsonb, numeric, numeric, numeric, boolean, date, text, uuid)',
  $v$  v_persona := retail.fn_actor_persona_id(true);$v$, 1,
  $v$  -- ADR-0415: la entrega es una promesa del Taller; una anterior a hoy no promete nada (entrega_pasada).
  if p_fecha_entrega is not null and p_fecha_entrega < retail.fn_hoy_lima() then
    raise exception 'La entrega no puede ser antes de hoy (%): elige el día en que el Taller la va a entregar, o déjala en blanco.',
      to_char(retail.fn_hoy_lima(), 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'entrega_pasada';
  end if;
$v$,
  $v$entrega_pasada$v$);

select pg_temp.insertar_antes(
  'retail.abrir_produccion_con_modelo_nuevo(uuid, text, uuid, jsonb, numeric, numeric, numeric, numeric, boolean, date, text, boolean, uuid)',
  $v$  if coalesce(trim(p_referencia), '') = '' then$v$, 1,
  $v$  -- ADR-0415: la entrega es una promesa del Taller; una anterior a hoy no promete nada (entrega_pasada).
  if p_fecha_entrega is not null and p_fecha_entrega < retail.fn_hoy_lima() then
    raise exception 'La entrega no puede ser antes de hoy (%): elige el día en que el Taller la va a entregar, o déjala en blanco.',
      to_char(retail.fn_hoy_lima(), 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'entrega_pasada';
  end if;
$v$,
  $v$entrega_pasada$v$);

-- 2. Al cerrar, ninguna talla pasa del doble de lo pedido (o de 5 más, si la talla es chica).
select pg_temp.insertar_antes(
  'retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean)',
  $v$  select coalesce(sum(cantidad_buenas), 0) into v_total from produccion_lineas where produccion_id = p_produccion_id;$v$, 1,
  $v$  -- ADR-0415: salir algunas más de lo pedido es real (el corte rindió); más del doble es casi siempre un cero de más (buenas_de_mas).
  declare
    v_plan_tope integer;
    v_buenas_tope integer;
  begin
    for v_plan_tope, v_buenas_tope in
      select l.cantidad_plan, l.cantidad_buenas from produccion_lineas l
       where l.produccion_id = p_produccion_id and l.cantidad_buenas > greatest(l.cantidad_plan * 2, l.cantidad_plan + 5)
       order by l.cantidad_buenas - l.cantidad_plan desc
    loop
      raise exception 'De una talla se pidieron % y anotaste % buenas: más del doble de lo pedido. Revisa la cantidad; si de verdad salieron tantas, anota hasta % y abre otra orden con el resto.',
        v_plan_tope, v_buenas_tope, greatest(v_plan_tope * 2, v_plan_tope + 5)
        using errcode = 'P0001', hint = 'buenas_de_mas';
    end loop;
  end;
$v$,
  $v$buenas_de_mas$v$);

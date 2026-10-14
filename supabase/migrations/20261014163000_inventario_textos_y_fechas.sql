-- ============================================================================
-- 20261014163000_inventario_textos_y_fechas.sql — CAYLA V2 (/chaos de Inventario 2026-10-14, Felipe 2026-10-14)
--
-- EL PROBLEMA PRIMERO. /chaos encontró en Inventario datos que se guardaban sin que nadie avisara:
--   1. La nota de un traslado aceptaba 5000 letras (la pantalla de Nuevo traslado no tenía tope) y la de un pedido a otra sede
--      también, y esa nota viaja después al traslado que se crea al enviarlo.
--   2. Un traslado podía nacer con la llegada estimada en 1990.
--   3. `ajustar_inventario` guardaba cualquier motivo («porque_si») y una nota de 5000 letras, aunque la pantalla solo ofrece
--      cuatro motivos y corta la nota en 200.
-- Solo el punto 1 se alcanzaba desde la pantalla; los demás, por la API. La base es la última que los cuida.
--
-- LA DECISIÓN.
--   · Notas de traslado y de pedido a otra sede: hasta 200 caracteres (como la de una dañada o un retiro). La de un ajuste, hasta
--     300: la pantalla corta en 200, pero Existencias le antepone «Error al cobrar: » o «Uso interno: ».
--   · La llegada estimada de un traslado no puede ser anterior a AYER (día de Lima): un día de margen para el pase que se abrió
--     antes de medianoche y se envía después. En producción ningún traslado tiene la llegada antes de su creación (2026-10-14).
--   · El motivo de un ajuste es uno de los cuatro de la pantalla (`MOTIVOS_AJUSTE`: reposicion, merma, conteo_fisico, otro).
--   En producción no hay ninguna nota de traslado ni de pedido escrita (2026-10-14): nada de lo guardado queda fuera.
--
-- CONTRATO (Liskov)
--   PROMETE: esas funciones rechazan con P0001 y un `hint` estable (`traslado_nota_larga`, `traslado_llegada_pasada`,
--            `pedido_nota_larga`, `ajuste_nota_larga`, `ajuste_motivo_invalido`) lo que antes guardaban. Lo válido pasa igual.
--            En `iniciar_traslado` la revisión va DESPUÉS del atajo del token: el reintento de un traslado ya guardado devuelve
--            lo guardado aunque su fecha ya haya pasado.
--   ASUME:   las tres funciones vivas a la fecha (anclas verificadas en local y en producción el 2026-10-14) y la migración
--            20261014162000 (el token), que se pega antes.
--   NO HACE: no toca tablas, políticas ni datos.
--
-- CÓMO SE PEGA. Una sola parte, solo funciones, DESPUÉS de 20261014162000. Reemplazos ANCLADOS (ADR-0288), anclas de una línea de
-- código. Idempotente. Sin `select … into` dentro de un texto entre comillas.
-- ============================================================================
set lock_timeout = '3s';

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

-- 1 y 2. El traslado: nota hasta 200 y llegada desde ayer en adelante (después del atajo del token).
select pg_temp.insertar_antes(
  'retail.iniciar_traslado(uuid, uuid, jsonb, timestamp with time zone, text, uuid)',
  $v$  perform fn_bloquear_en_orden(p_ubicacion_origen_id, fn_ids_de_items(p_items));$v$, 1,
  $v$  -- Una nota de traslado cabe en el pase (hasta 200) y la llegada no queda en el pasado (un día de margen).
  if length(btrim(coalesce(p_nota, ''))) > 200 then
    raise exception 'La nota del traslado admite hasta 200 caracteres.' using errcode = 'P0001', hint = 'traslado_nota_larga';
  end if;
  if p_fecha_estimada_llegada is not null
     and (p_fecha_estimada_llegada at time zone 'America/Lima')::date < (now() at time zone 'America/Lima')::date - 1 then
    raise exception 'La llegada estimada ya pasó: elige hoy o un día que venga.' using errcode = 'P0001', hint = 'traslado_llegada_pasada';
  end if;
$v$,
  $v$hint = 'traslado_nota_larga'$v$);

-- 1. El pedido a otra sede: su nota viaja al traslado que se crea al enviarlo.
select pg_temp.insertar_antes(
  'retail.pedir_a_otra_sede(uuid, uuid, jsonb, text, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- La nota del pedido viaja al traslado al enviarlo: el mismo tope que allá.
  if length(btrim(coalesce(p_nota, ''))) > 200 then
    raise exception 'La nota del pedido admite hasta 200 caracteres.' using errcode = 'P0001', hint = 'pedido_nota_larga';
  end if;
$v$,
  $v$hint = 'pedido_nota_larga'$v$);

-- 3. El ajuste: uno de los cuatro motivos de la pantalla y la nota hasta 200.
select pg_temp.insertar_antes(
  'retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid)',
  $v$  if jsonb_array_length(v_ajustes) > 0 and nullif(btrim(p_motivo), '') is null then$v$, 1,
  $v$  -- El motivo es uno de los de la pantalla (`MOTIVOS_AJUSTE`) y la nota cabe en Movimientos (300: Existencias antepone su prefijo).
  if jsonb_array_length(v_ajustes) > 0 and nullif(btrim(p_motivo), '') is not null
     and btrim(p_motivo) not in ('reposicion', 'merma', 'conteo_fisico', 'otro') then
    raise exception 'Elige el motivo del ajuste de la lista.' using errcode = 'P0001', hint = 'ajuste_motivo_invalido';
  end if;
  if length(coalesce(v_nota, '')) > 300 then
    raise exception 'La nota del ajuste admite hasta 300 caracteres.' using errcode = 'P0001', hint = 'ajuste_nota_larga';
  end if;
$v$,
  $v$hint = 'ajuste_motivo_invalido'$v$);

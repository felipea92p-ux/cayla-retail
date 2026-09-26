-- ============================================================================
-- 20260927100200_ajuste_no_es_primera_carga.sql — CAYLA V2 · ADR-0233 · PARTE 2 de 2
-- Un ajuste corrige lo que ya estaba: la base rechaza un ajuste que sería el PRIMER movimiento de una prenda en una sede.
--
-- EL PROBLEMA PRIMERO. Ver la parte 1 (20260927100100): en TRU, 34 de 41 ajustes positivos fueron la primera carga de la
-- prenda. Con la puerta del ajuste abierta, una lectura de «Ajustes» nunca puede separar una corrección de una carga, y
-- Movimientos los muestra para siempre como sobrantes. Felipe decidió el 2026-09-26 cerrarla en la base.
--
-- QUÉ HACE. Inserta en la definición VIVA de `retail.registrar_movimiento` un candado: `p_tipo = 'ajuste'` sobre una
-- prenda sin ningún movimiento en esa ubicación se rechaza (hint `ajuste_sin_historia`), con un mensaje que dice qué hacer.
-- Mismo método que 20260926000400 (`pg_temp.insertar_antes`, la misma línea ancla, re-pegable por su marca): la función
-- no se reescribe desde un archivo, así que ningún parche en vivo se pierde. El candado va DESPUÉS de los de permiso y
-- de ubicación (a quien no puede ajustar, el mensaje sigue siendo el de permiso).
--
-- ESTADO QUE DEJA DE SER POSIBLE: la primera fila de una prenda en una sede con `tipo = 'ajuste'` escrita por
-- `registrar_movimiento`. Lo histórico no se toca (movimientos es de solo agregar). Un conteo formal (`cerrar_conteo`)
-- sigue pudiendo corregir una prenda que el sistema tenía en 0 SIN historia: es un conteo de verdad, con número.
--
-- ORDEN AL PEGAR: 100100 (la puerta nueva) → publicar la web (Ajustar stock ofrece «stock inicial») → ESTA. Si se pega
-- antes que la web, Ajustar stock rechaza la primera carga y todavía no ofrece la otra puerta.
--
-- CÓMO SE PEGA: tal cual en el SQL Editor de producción (ya trae `retail.`). Solo reemplaza una función: no toma candados
-- de tablas en uso ni lleva políticas. Se puede pegar dos veces.
--
-- SE ROMPE SI: alguien vuelve a pegar 20260921120000 (recrea `registrar_movimiento` desde el archivo y borra este candado
-- junto con los otros parches en vivo), o una puerta nueva de ajuste no pasa por `registrar_movimiento`.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function pg_temp.insertar_antes(p_firma text, p_ancla text, p_bloque text, p_marca text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el bloque desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_ancla, p_bloque || p_ancla);
end;
$f$;

select pg_temp.insertar_antes(
  'retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)',
  'v_sub := coalesce(p_sububicacion_id,',
  $bloque$-- ADR-0233: un ajuste corrige lo que ya estaba; la primera carga de una prenda es stock inicial (ajuste_sin_historia).
  if p_tipo = 'ajuste' and not exists (
    select 1 from movimientos where variante_id = p_variante_id and ubicacion_id = p_ubicacion_id
  ) then
    raise exception 'Esta prenda todavía no tiene ningún movimiento en esta tienda: lo que hay se carga como stock inicial, no como ajuste. Ajustar stock lo hace solo al guardar; también puede llegar por un traslado o una compra.'
      using hint = 'ajuste_sin_historia';
  end if;
  $bloque$,
  'ajuste_sin_historia'
);

notify pgrst, 'reload schema';

-- ============================================================================
-- 20261031013000_registrar_compra_emision_en_dia_de_lima.sql — CAYLA V2 (2026-10-31)
--
-- EL PROBLEMA PRIMERO. `registrar_compra` declara `p_fecha_emision date DEFAULT CURRENT_DATE`, y desde
-- 20261015171000 (ADR-0421) rechaza una emisión posterior a `retail.fn_hoy_lima()` (`emision_futura`). Supabase
-- corre en UTC: de 19:00 a 24:00 en Lima, `CURRENT_DATE` ya es el día siguiente, y TODA compra registrada sin fecha
-- de emisión se rechaza con «La fecha de emisión (31/10/2026) no puede ser futura: hoy es 30/10/2026». Visto el
-- 2026-10-31 a las 00:20 UTC: `factura_costo_atipico` cayó 16 de 21 y `deriva_produccion` 2 de 13.
--
-- LA DECISIÓN. El valor por defecto pasa a ser el mismo «hoy» con que la función compara: `retail.fn_hoy_lima()`.
-- Un default puede ser cualquier expresión y `create or replace` deja cambiarlo (lo que no deja es quitarlo), así que
-- la firma, los permisos y la única sobrecarga (20260918219000) siguen iguales. No se toca el cuerpo: quien manda
-- su fecha sigue igual, y una fecha futura se sigue rechazando.
--
-- CONTRATO (Liskov)
--   PROMETE: una compra sin fecha de emisión queda fechada en el día de Lima, a cualquier hora; nada más cambia.
--   ASUME:   la definición viva tiene `p_fecha_emision date DEFAULT CURRENT_DATE` exactamente una vez.
--   NO HACE: no toca tablas, políticas ni el cuerpo de la función.
--
-- CÓMO SE PEGA. Una sola parte, solo la función. Reemplazo ANCLADO sobre la definición viva (ADR-0288): si el ancla no
-- aparece exactamente una vez, se detiene sin tocar nada. Idempotente: si ya tiene el default nuevo, no hace nada.
-- Sin políticas ni `drop` (ADR-0195). Prueba: `pnpm pruebas:registrar-compra-emision-lima`.
-- ============================================================================
set lock_timeout = '3s';

-- Cambia `p_ancla` por `p_nuevo` en la definición viva de `p_firma`; `p_ancla` tiene que aparecer exactamente una vez.
-- Si la definición ya calza con `p_hecho` (una expresión regular: Postgres escribe el default con o sin `retail.` según
-- el search_path de quien pega), no hace nada.
create or replace function pg_temp.cambiar_default(p_firma text, p_ancla text, p_nuevo text, p_hecho text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if v_def ~ p_hecho then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba 1 aparición de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_ancla, v_n;
  end if;
  execute replace(v_def, p_ancla, p_nuevo);
end;
$f$;

select pg_temp.cambiar_default(
  'retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)',
  $v$p_fecha_emision date DEFAULT CURRENT_DATE$v$,
  $v$p_fecha_emision date DEFAULT retail.fn_hoy_lima()$v$,
  $v$p_fecha_emision date DEFAULT (retail\.)?fn_hoy_lima\(\)$v$
);

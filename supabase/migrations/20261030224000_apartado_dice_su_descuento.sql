-- ============================================================================
-- 20261030224000_apartado_dice_su_descuento.sql — CAYLA V2 (ADR-0584, actividad 4; Felipe 2026-10-30)
--
-- EL PROBLEMA. Desde 20261030220000 una prenda se aparta con descuento a mano y su motivo queda en `separacion_items`. Pero la
-- lista de apartados (`buscar_separaciones`, la que leen el detalle, Entregar y el Historial) solo devolvía `descuento_unitario`:
-- la colaboradora que entrega la prenda ve «−S/ 8» y no sabe si fue la campaña o un trato con la clienta, ni por qué.
--
-- ANALOGÍA CAYLA. La bolsa detrás del mostrador lleva el precio acordado y, desde la actividad 1, el motivo anotado. Esto hace que
-- quien saca la bolsa LEA esa nota: el motivo viaja con cada prenda hasta la pantalla.
--
-- QUÉ TOCA. Un solo reemplazo ANCLADO sobre la definición viva de `buscar_separaciones` (ADR-0288): cada prenda del `items` suma
-- `motivo_descuento`, `motivo_descuento_detalle` y `argumento_descuento`. Un descuento sin motivo es de campaña (el candado
-- `separacion_items_descuento_con_origen` lo garantiza), así que no hace falta exponer la etiqueta.
-- DESCARTÉ: sumar el motivo a `fn_detalle_separacion` o `fn_actividad_separacion`: no devuelven prendas. Ninguna otra lectura de
-- un apartado que se muestre en pantalla devuelve sus prendas (las demás que leen `separacion_items` guardan o cuentan).
--
-- CÓMO SE PEGA. Una sola parte, sin políticas (ADR-0195), idempotente, `lock_timeout` 3 s; dentro de los textos de reemplazo no hay
-- ningún `select … into` (ADR-0288). Requiere 20261030220000 (las columnas). PRODUCCIÓN: con OK de Felipe, después de 20261030220000.
-- La web vieja ignora los campos nuevos; la web nueva con la base vieja muestra «Campaña» en todo descuento (como antes de ADR-0584).
-- ============================================================================

set search_path = retail, public, extensions;
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
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

create or replace function pg_temp.firma(p_nombre text) returns text language sql as $f$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and p.proname = p_nombre
$f$;

-- Cada prenda del apartado dice por qué se descontó (NULL: sin descuento, o de campaña).
select pg_temp.reemplazar(pg_temp.firma('buscar_separaciones'),
$v$                                              'descuento_unitario', si.descuento_unitario) order by v.sku)$v$,
$v$                                              'descuento_unitario', si.descuento_unitario,
                                              -- ADR-0584: el motivo de un descuento a mano (NULL = campaña o sin descuento).
                                              'motivo_descuento', si.motivo_descuento,
                                              'motivo_descuento_detalle', si.motivo_descuento_detalle,
                                              'argumento_descuento', si.argumento_descuento) order by v.sku)$v$, 1);

-- Comprobación: quedó, o no se aplica nada.
do $$
begin
  if position('''motivo_descuento_detalle'', si.motivo_descuento_detalle' in pg_get_functiondef(pg_temp.firma('buscar_separaciones')::regprocedure)) = 0 then
    raise exception 'ADR-0584: buscar_separaciones no devuelve el motivo del descuento';
  end if;
end;
$$;

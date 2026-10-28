-- ============================================================================
-- 20261004000000_carga_inicial_al_piso_sin_existencias.sql — CAYLA V2 · ADR-0306 (act. 2026-10-03)
-- Crear un producto con «En piso de venta» lo hace quien ve Productos, sin pedirle Existencias.
--
-- EL PROBLEMA PRIMERO. En «Nuevo producto», paso 4, la opción «En piso de venta» salía apagada para una cuenta que sí puede
-- crear productos pero no tiene Existencias. La causa: `crear_producto_con_stock_inicial` (y `cargar_stock_inicial`)
-- cuelgan las prendas con `bajar_al_piso`, y esa función exige `fn_ve_modulo('existencias')`. Pero crear el producto es
-- Catálogo/Productos: la persona hace todo lo que hay dentro de ese módulo, no necesita otro (regla de Felipe, 2026-10-02/03).
--
-- LA REGLA. Quien ve un módulo hace todo lo que hay dentro de ese módulo. La carga inicial de un producto nuevo es del módulo
-- donde nace el producto; reponer, subir y retirar son de Existencias y SIGUEN pidiendo Existencias cuando se llaman de verdad
-- desde su pantalla.
--
-- QUÉ HACE.
--   · `crear_producto_con_stock_inicial` y `cargar_stock_inicial` marcan, solo dentro de SU transacción, que la bajada es
--     la de la carga inicial (`set_config('retail.carga_inicial', 'si', true)`: local a la transacción, se apaga justo
--     después de la bajada) y `bajar_al_piso` acepta esa marca además del módulo Existencias.
--   · Nada más cambia en `bajar_al_piso`: sigue pidiendo operar la tienda (`fn_puede_operar_ubicacion`), la marca de
--     reintento, todo o nada y el libro de movimientos. La marca la ponen solo las dos funciones de arriba, DESPUÉS de sus
--     propios candados (`crear_producto_con_variantes` exige poder editar el catálogo; `cargar_stock_inicial`, poder
--     crear productos o ajustar stock). Un cliente de PostgREST no puede fijar variables de la base: solo llama RPC.
--
-- ESTADO QUE DEJA DE SER POSIBLE: una cuenta que crea el producto pero no puede decir que las prendas ya están colgadas.
--
-- POR QUÉ SE REEMPLAZA POR ANCLA. Las tres funciones viven en producción con parches en vivo; reescribirlas desde un
-- archivo los borraría. `pg_temp.reemplazar_unico` cambia un texto que debe aparecer UNA sola vez y aborta si no (re-pegable:
-- si el texto nuevo ya está, no hace nada). Sin `select … into` dentro de textos entre comillas (ADR-0288).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual en el SQL Editor (ya trae `retail.`), DESPUÉS de 20261002120000 (el candado de
-- `bajar_al_piso` tiene que ser ya «existencias»; si no, aborta con un mensaje claro). Sin políticas ni `alter` de tablas:
-- ADR-0195 no aplica. Idempotente.
--
-- SE ROMPE SI alguien vuelve a pegar 20260926000200, 20260927153100, 20260928100000 o 20261002120000 (recrean las funciones
-- desde el archivo y devuelven el candado a Existencias sin la marca).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.reemplazar_unico(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_viejo in v_def) = 0 and position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real (¿falta pegar 20261002120000 antes?).',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. bajar_al_piso acepta la marca de la carga inicial además del módulo Existencias.
select pg_temp.reemplazar_unico(
  'retail.bajar_al_piso(uuid, jsonb, uuid)',
  $v$if not fn_ve_modulo('existencias') then$v$,
  $n$if not (fn_ve_modulo('existencias') or coalesce(current_setting('retail.carga_inicial', true), '') = 'si') then$n$
);

-- 2. Las dos puertas de la carga inicial ponen la marca justo antes de la bajada y la quitan justo después.
select pg_temp.reemplazar_unico(
  'retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean, text)',
  $v$perform bajar_al_piso(p_ubicacion_id, v_items, coalesce(p_token, gen_random_uuid()));$v$,
  $n$perform set_config('retail.carga_inicial', 'si', true);
    perform bajar_al_piso(p_ubicacion_id, v_items, coalesce(p_token, gen_random_uuid()));
    perform set_config('retail.carga_inicial', '', true);$n$
);

select pg_temp.reemplazar_unico(
  'retail.cargar_stock_inicial(uuid, jsonb, text, boolean, uuid)',
  $v$perform bajar_al_piso(p_ubicacion_id, p_items, coalesce(p_token, gen_random_uuid()));$v$,
  $n$perform set_config('retail.carga_inicial', 'si', true);
    perform bajar_al_piso(p_ubicacion_id, p_items, coalesce(p_token, gen_random_uuid()));
    perform set_config('retail.carga_inicial', '', true);$n$
);

notify pgrst, 'reload schema';

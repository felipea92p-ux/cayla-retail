-- ============================================================================
-- 20260930120000_costo_fuera_de_banda.sql
-- La regla del «costo atípico» (Felipe, 2026-09-30) — actividad 1 de 5
--
-- EL PROBLEMA PRIMERO. `variantes.costo` es el costo promedio ponderado (ADR-0067) y lo mueven tres caminos: cerrar una
-- orden del Taller, recibir una compra y recibir un lote. Ninguno preguntaba «¿este número tiene sentido?»: lo único que
-- se validaba era que no fuera negativo. Un cero de más tecleado en la tela contamina el costo de esa prenda en las tres
-- sedes a la vez, y no tiene arreglo desde la app: `revertir_produccion` devuelve el stock pero no toca el costo, y el
-- candado de 20260927190000 impide corregirlo a mano una vez que la prenda tiene historial.
--
-- QUÉ PROMETE. UNA función pura, `retail.fn_costo_fuera_de_banda(costo_nuevo, costo_vigente, precio)`, que dice si un
-- costo por prenda merece una segunda mirada y por qué. No lee ninguna tabla: quien la llama busca la referencia (por
-- talla en Producción, por producto en una factura) y ella solo compara números. Devuelve NULL si el costo pasa, o el
-- motivo, el primero que aplique en este orden:
--     'sin_costo'          costo nuevo <= 0      (un cero fija el costo en 0 y deja un margen de 100 %)
--     'mayor_que_precio'   costo nuevo >= precio (cuesta más de lo que vale: error de tecleo o pérdida segura)
--     'sube'               costo nuevo >  2 × el vigente
--     'baja'               costo nuevo <  2/3 del vigente
-- Los dos últimos solo se miran si hay costo vigente (> 0); 'mayor_que_precio' solo si hay precio (> 0). Un costo nuevo
-- NULL no es un costo: devuelve NULL (el lote sin factura deja el costo vacío y no hay nada que juzgar).
--
-- POR QUÉ ESTOS NÚMEROS (medidos, no supuestos; el detalle y la simulación, en el ADR de esta decisión).
--   - No hay σ que calcular: `costo_historial`, `producciones` y `compras` tienen 0 filas en producción (2026-09-29).
--     Con menos de ~10 datos la desviación estándar es ruido, y un tecleo malo ya confirmado la infla y esconde el
--     siguiente. Por eso el umbral es un múltiplo del costo vigente, no una campana.
--   - 2× hacia arriba atrapa ~90 % de los tecleos ×10 (el 10 % restante es un error en «avíos», que pesa ~10 % del
--     total y no alcanza a duplicarlo) con ~0,3 falsas alarmas por 100 cierres.
--   - 2/3 hacia abajo (y no 1/2) porque un error hacia abajo casi no mueve el total: si se divide la tela entre 10,
--     el total solo cae a ~0,5×. Con 1/2 la regla no veía ninguno de esos errores; con 2/3 ve ~55 %, a ~5 falsas
--     alarmas por 100 cierres (si la variación real entre corridas fuera σ = 0,25 en ln; es un SUPUESTO a medir cuando
--     haya ~10 cierres reales).
--   - Se compara con la comparación estricta (`>` y `<`): justo el doble, o justo 2/3, pasa. `* 3 < * 2` evita el
--     redondeo de escribir 0,6667.
--
-- QUÉ NO HACE. No bloquea nada por sí sola ni decide quién confirma: eso es de cada camino (actividades 2 a 5). No toca
-- ninguna tabla ni ninguna otra función. Sin `execute` para la API: es interna, la llaman las funciones SECURITY DEFINER
-- (que corren como su dueño). Aunque no filtre montos (recibe números), dejarla fuera evita que alguien la use como
-- sonda del costo vigente de una prenda pasando candidatos.
--
-- ORDEN PARA PRODUCCIÓN: esta migración primero, sola; no cambia ningún comportamiento. Re-pegable (create or replace).
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path`, no hace falta el prefijo `retail.`.
--
-- CÓMO SE DESHACE. drop function retail.fn_costo_fuera_de_banda(numeric, numeric, numeric);
--   (solo si ninguna función de las actividades 2 a 5 está aplicada: la llaman).
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_costo_fuera_de_banda(
  p_costo_nuevo numeric,
  p_costo_vigente numeric,
  p_precio numeric
)
returns text
language sql
immutable
set search_path to 'retail', 'public', 'extensions'
as $$
  select case
    when p_costo_nuevo is null then null
    when p_costo_nuevo <= 0 then 'sin_costo'
    when coalesce(p_precio, 0) > 0 and p_costo_nuevo >= p_precio then 'mayor_que_precio'
    when coalesce(p_costo_vigente, 0) > 0 and p_costo_nuevo > p_costo_vigente * 2 then 'sube'
    when coalesce(p_costo_vigente, 0) > 0 and p_costo_nuevo * 3 < p_costo_vigente * 2 then 'baja'
  end;
$$;

-- Interna: ni public ni las dos llaves de la API (Supabase concede `execute` a anon/authenticated por defecto).
revoke all on function retail.fn_costo_fuera_de_banda(numeric, numeric, numeric) from public;
revoke execute on function retail.fn_costo_fuera_de_banda(numeric, numeric, numeric) from anon, authenticated;

comment on function retail.fn_costo_fuera_de_banda(numeric, numeric, numeric) is
  'NULL si el costo por prenda pasa; si no, el motivo: sin_costo, mayor_que_precio, sube (>2× el vigente) o baja (<2/3 del vigente). Pura: no lee tablas. Interna (sin execute para la API).';

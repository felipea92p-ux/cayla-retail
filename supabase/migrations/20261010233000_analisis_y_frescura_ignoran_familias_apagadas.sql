-- ============================================================================
-- 20261010233000_analisis_y_frescura_ignoran_familias_apagadas.sql — actividad 3 de «Bolsas de despacho» (sigue a 20261010232000)
--
-- EL PROBLEMA PRIMERO. La actividad 2 sacó la bolsa del motor del piso, de la demanda y del plan de campaña. Faltan las dos pantallas que la gente
-- MIRA para decidir: Análisis (qué se mueve, qué está quieto, qué liquidar) y Frescura del piso (qué lleva colgado demasiado). Con la bolsa
-- dentro, Análisis la pondría entre las «prendas que más rotan» y diría que «no hay prenda quieta» por culpa de un producto que se vende a todas
-- horas; y su cifra de «ventas con rebaja» (de cada 100 líneas, cuántas llevaron rebaja) se diluiría: casi cada venta lleva una línea de bolsa
-- a precio de lista, y cada una cuenta como una línea SIN rebaja.
--
-- LO QUE HACE. Dos funciones empiezan a preguntar `retail.fn_categoria_entra_a_motores(categoría)`:
--   · `fn_analisis_sede` — la lista de prendas de Análisis, y la cifra «rebaja_de_100» (solo mira lo que es mercadería).
--   · `fn_frescura_sede` — el UNIVERSO de prendas (`v_ids`): de ahí salen el libro, la vara, las bajadas, los apartados y las tardías, así que
--     una prenda de una familia apagada no existe para Frescura en ninguna de sus lecturas.
-- Una venta de la bolsa SIGUE siendo venta (caja, comprobante, Ventas, Finanzas): solo se dejan de mirar las pantallas que deciden qué colgar,
-- pedir y liquidar. (La web de Frescura lee además dos cosas directo de la cola de «ventas sin registrar»: ese filtro va en el mismo cambio, en
-- `lib/frescura.ts`, no aquí.)
--
-- CÓMO. Reemplazos ANCLADOS (`reemplazar_anclado`, el mismo formato de 20261008120000 y 20261004200050: las suites de Frescura leen este archivo
-- para DESHACERLOS y probar las migraciones anteriores «desde producción»). Falla sin tocar nada si la función viva cambió; si ya está aplicado,
-- no hace nada.
--
-- SE ROMPE SI: una migración POSTERIOR reescribe `fn_analisis_sede` o `fn_frescura_sede` copiando un archivo anterior: la bolsa vuelve a contar.
-- La prueba `pnpm pruebas:motores-familias-apagadas` (casos A y F) lo vigila.
--
-- PARA PRODUCCIÓN: una sola parte, sin tablas ni políticas ni `drop trigger` (ADR-0195). Se pega DESPUÉS de 20261010232000. Anclajes verificados
-- contra las huellas de producción del 2026-10-10: fn_analisis_sede 15598f29…, fn_frescura_sede 6ac58e3c…. Todas las piezas llevan `retail.`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Guarda: la pregunta tiene que existir. Si falta, se detiene sin tocar nada.
do $g$
begin
  if not exists (select 1 from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_categoria_entra_a_motores') then
    raise exception 'Falta retail.fn_categoria_entra_a_motores: pega primero 20261010231000_familias_entran_a_motores.sql.';
  end if;
end
$g$;

-- Reemplazo anclado (el mismo de 20261008120000): falla si la función viva cambió, y es re-ejecutable.
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo de abajo abortaría.
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

-- ---------- 1. fn_analisis_sede ----------
-- La cifra «rebaja_de_100»: las líneas vendidas en 30 días, solo de mercadería.
select pg_temp.reemplazar_anclado(
  'retail.fn_analisis_sede(uuid)',
  $v$      where l.dia >= v_desde_30
        and not pr.es_prueba
    ),$v$,
  $n$      where l.dia >= v_desde_30
        and not pr.es_prueba
        and retail.fn_categoria_entra_a_motores(pr.categoria_id)
    ),$n$
);
-- La lista de prendas de Análisis.
select pg_temp.reemplazar_anclado(
  'retail.fn_analisis_sede(uuid)',
  $v$      where not pr.es_prueba
        and pr.id <> c_producto_centinela
    )$v$,
  $n$      where not pr.es_prueba
        and pr.id <> c_producto_centinela
        and retail.fn_categoria_entra_a_motores(pr.categoria_id)
    )$n$
);

-- ---------- 2. fn_frescura_sede: el universo de prendas ----------
select pg_temp.reemplazar_anclado(
  'retail.fn_frescura_sede(uuid, integer)',
  $v$where i.variante_id <> c_centinela and p.id <> c_producto_centinela and not p.es_prueba;$v$,
  $n$where i.variante_id <> c_centinela and p.id <> c_producto_centinela and not p.es_prueba
     and retail.fn_categoria_entra_a_motores(p.categoria_id);$n$
);

-- ---------- 3. Validación final: si algo no quedó, se deshace todo ----------
do $v$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('retail.fn_analisis_sede(uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'fn_categoria_entra_a_motores', ''))) / length('fn_categoria_entra_a_motores') <> 2 then
    raise exception 'fn_analisis_sede debe preguntar por la familia en 2 lugares';
  end if;
  v_def := pg_get_functiondef('retail.fn_frescura_sede(uuid, integer)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'fn_categoria_entra_a_motores', ''))) / length('fn_categoria_entra_a_motores') <> 1 then
    raise exception 'fn_frescura_sede debe preguntar por la familia en 1 lugar';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace
       and proname in ('fn_analisis_sede', 'fn_frescura_sede')) <> 2 then
    raise exception 'debe haber una sola firma de cada función';
  end if;
end
$v$;

reset lock_timeout;
notify pgrst, 'reload schema';

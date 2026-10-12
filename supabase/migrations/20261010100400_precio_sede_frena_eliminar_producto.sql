-- ============================================================================
-- 20261010100400_precio_sede_frena_eliminar_producto.sql — CAYLA V2 (ADR-0370; sigue a 20261010100000)
--
-- EL PROBLEMA. `precios_sede` cita a `variantes`, y la prueba de deriva de `eliminar_producto.mjs` exige que toda tabla
-- que cita a una prenda esté clasificada: o se borra con la ficha, o es historia y frena el borrado. Sin clasificar,
-- eliminar una prenda que tuvo precio propio chocaría con la llave y diría solo «otra parte del sistema todavía lo usa».
--
-- LA DECISIÓN. Es HISTORIA y NO se borra (`borrable = false`): sus filas no se borran nunca (disparador
-- `precios_sede_inmutable`), y una prenda que se vendió a otro precio en una tienda guarda esa decisión. Esa prenda no se
-- elimina: se desactiva. Renglón 22 de `fn_producto_historia`, con un reemplazo ANCLADO junto al renglón 21 (mismo patrón
-- que 20261005130200). Re-ejecutable; falla sin tocar nada si la función viva cambió.
--
-- PRODUCCIÓN. Una sola parte, sin tablas ni políticas. Prueba: `pnpm pruebas:eliminar-producto`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
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
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.anclar(
  'retail.fn_producto_historia(uuid)',
  $v$      union all select 21, 'prendas para enviar a otra sede', count(*), false
        from retail.prendas_para_enviar x where x.variante_id in (select id from vs)$v$,
  $n$      union all select 21, 'prendas para enviar a otra sede', count(*), false
        from retail.prendas_para_enviar x where x.variante_id in (select id from vs)
      union all select 22, 'precios propios de una tienda', count(*), false
        from retail.precios_sede x where x.variante_id in (select id from vs)$n$
);

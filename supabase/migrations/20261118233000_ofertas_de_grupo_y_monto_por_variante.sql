-- ============================================================================
-- 20261118233000 — Lo que la caja lee para un 3x2 y para un monto, con las variantes sueltas (ADR-0682; Felipe 2026-11-18)
--
-- EL PROBLEMA. 20261118232000 dejó que una oferta elija tallas y colores sueltos, y la regla de una oferta GUARDADA ya los lee: el cobro
--   (`fn_ofertas_de_grupo`, que usa `fn_regla_alcanza_variante`) arma el 3x2 con ellos. Pero lo que Vender lee para dibujar el ticket
--   —`ofertas_de_grupo_vigentes` y `ofertas_de_monto_vigentes`— armaba las prendas de cada oferta con sus listas de categorías, modelos e
--   insignias (`fn_variantes_de_oferta_con_insignias`), sin las variantes: el ticket mostraría un precio y la base exigiría otro.
--
-- LO QUE HACE. Las dos funciones preguntan las prendas de cada oferta a `fn_variantes_de_regla(oferta)`: la misma regla, de una vez, que ya
--   suma las variantes sueltas y apaga la caída a «las prendas de la campaña» cuando la oferta solo tiene variantes. Un reemplazo anclado
--   en cada una: la línea que llamaba a la de listas pasa a llamar a la de la oferta. Nada más cambia.
--   DECIDÍ una sola fuente (`fn_variantes_de_regla`) para lo que la caja muestra y lo que la base cobra. DESCARTÉ sumarles un `union` con
--     las variantes: habría que repetir ahí la condición de «solo variantes», y son dos lugares más donde la regla puede divergir.
--   SE ROMPE SI alguien cambia esa línea antes de pegar esto: el ancla no aparece y se detiene sin aplicar nada.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: dos reemplazos anclados, sin tablas. Va DESPUÉS de 20261118232000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:ofertas-por-variante` («Un 3x2 y un monto con variantes sueltas»).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regclass('retail.campana_regla_variantes') is null then
    raise exception 'Falta la tabla de variantes de una oferta (20261118232000): pega antes esa migración. No se aplicó nada.';
  end if;
end;
$$;

create or replace function pg_temp.reemplazar_lectura_por_variante(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_veces integer;
begin
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_veces <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real. No se aplicó nada.',
      p_firma, v_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- Las ofertas de grupo (3x2, N por S/, la N.ª al X %): las prendas de cada una, con sus variantes sueltas.
select pg_temp.reemplazar_lectura_por_variante(
  'retail.ofertas_de_grupo_vigentes(uuid)',
  $v$cross join lateral retail.fn_variantes_de_oferta_con_insignias(g.etiqueta_id, g.solo, g.fuera, g.productos, g.insignias, g.incluye_claure) x$v$,
  $n$cross join lateral retail.fn_variantes_de_regla(g.id) x -- ADR-0682: la regla de la oferta guardada, con sus variantes sueltas$n$
);

-- Un monto que cuenta solo las prendas de la campaña: las que cuentan, con sus variantes sueltas.
select pg_temp.reemplazar_lectura_por_variante(
  'retail.ofertas_de_monto_vigentes(uuid)',
  $v$from retail.fn_variantes_de_oferta_con_insignias(m.etiqueta_id, m.solo, m.fuera, m.productos, m.insignias, m.incluye_claure) x$v$,
  $n$from retail.fn_variantes_de_regla(m.id) x -- ADR-0682: la regla de la oferta guardada, con sus variantes sueltas$n$
);

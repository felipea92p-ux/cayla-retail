-- ============================================================================
-- 20261119011000 — La portada de la tienda web anuncia también la campaña cuya oferta elige tallas y colores sueltos (ADR-0682)
--
-- EL PROBLEMA. `fn_campana_portada` anuncia una campaña solo si llega a alguna prenda: las suyas (marcadas o por categoría) o una oferta de
--   «% menos» activa que elige categorías, modelos o insignias (20261114071000). Desde 20261118232000 una oferta puede elegir tallas y
--   colores sueltos: una campaña sin prendas propias con «−20 % en la Blusa Emma negra» rebaja en la caja y en la tienda, pero no saldría en
--   la portada aunque «Anunciar en la portada» esté encendido, y nada lo diría. Es el mismo hueco que cerró 20261114071000, una tabla después.
--
-- LO QUE HACE. Un reemplazo anclado: una alternativa más al final de «llega a alguna prenda» — una oferta de «% menos» activa, que rige hoy,
--   con tallas sueltas. Lo demás queda igual (el %, su «hasta», «Anunciar en la portada», el orden).
--   DECIDÍ sumarla como una alternativa aparte y no dentro del paréntesis de 20261114071000: ese paréntesis es el texto con que esa migración
--     se reconoce como ya aplicada, y `pruebas:ofertas-por-insignia` la vuelve a pegar.
--
-- SE ROMPE SI alguien cambia el final de esa condición de `fn_campana_portada` antes de pegar esto: el ancla no aparece y se detiene sin
--   aplicar nada.
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s; solo una función. Va DESPUÉS de 20261118232000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:ofertas-por-variante` («La portada»).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regclass('retail.campana_regla_variantes') is null or to_regprocedure('retail.fn_campana_portada()') is null then
    raise exception 'Faltan piezas (las ofertas por variante, 20261118232000, o fn_campana_portada): pega antes esas migraciones. No se aplicó nada.';
  end if;
end;
$$;

create or replace function pg_temp.reemplazar_portada_por_variante(p_firma text, p_viejo text, p_nuevo text)
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

select pg_temp.reemplazar_portada_por_variante(
  'retail.fn_campana_portada()',
  $v$            and retail.fn_regla_rige_en(r.desde, r.hasta, r.dias_semana, h.hoy, 0))
     )$v$,
  $n$            and retail.fn_regla_rige_en(r.desde, r.hasta, r.dias_semana, h.hoy, 0))
       -- ADR-0682: o una oferta de «% menos» activa, que rige hoy, con tallas y colores sueltos.
       or exists (
         select 1
           from retail.campana_reglas r
           join retail.campana_regla_variantes rv on rv.regla_id = r.id
          where r.etiqueta_id = e.id
            and r.estado = 'activa'
            and r.tipo = 'pct'
            and retail.fn_regla_rige_en(r.desde, r.hasta, r.dias_semana, h.hoy, 0))
     )$n$
);

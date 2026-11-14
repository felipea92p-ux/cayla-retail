-- ============================================================================
-- 20261114071000 — La portada de la tienda web anuncia también la campaña cuyas ofertas eligen modelos o insignias (ADR-0655, auditoría)
--
-- EL PROBLEMA. `fn_campana_portada` anuncia una campaña solo si llega a alguna prenda: las suyas (marcadas o por categoría) o una oferta de
--   «% menos» activa que elige categorías. Desde que una oferta elige modelos uno por uno (20261113210000) o insignias (20261114060000), una
--   campaña sin prendas propias con «−20 % en la insignia Rotación» rebaja en la caja y en la tienda, pero nunca sale en la portada aunque
--   «Anunciar en la portada» esté encendido, y nada lo dice.
--
-- LO QUE HACE. Un reemplazo anclado: la oferta que cuenta es la que elige categorías, modelos o insignias. Lo demás queda igual (el %, su
--   «hasta», «Anunciar en la portada» de 20261113234000, el orden).
--
-- SE ROMPE SI: alguien cambia ese trozo de `fn_campana_portada` antes de pegar esto: el ancla no aparece y se detiene sin aplicar nada.
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s; solo una función. Va DESPUÉS de 20261114060000 (la tabla de insignias).
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:ofertas-por-insignia` («La portada»).
-- ============================================================================

set lock_timeout = '3s';

do $$
begin
  if to_regclass('retail.campana_regla_insignias') is null then
    raise exception 'Falta 20261114060000 (las insignias de una oferta): esta migración va después. No se aplicó nada.';
  end if;
end;
$$;

create or replace function pg_temp.reemplazar_portada_ofertas(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_n integer;
begin
  if position(p_nuevo in v_def) > 0 then
    return; -- ya aplicado
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). No se aplicó nada.', p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_portada_ofertas(
  'retail.fn_campana_portada()',
  $v$           join retail.campana_regla_categorias rc on rc.regla_id = r.id and rc.modo = 'solo'
          where r.etiqueta_id = e.id$v$,
  $n$          where r.etiqueta_id = e.id
            -- ADR-0655: la oferta llega a prendas si elige categorías, modelos o insignias.
            and (exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo')
                 or exists (select 1 from retail.campana_regla_productos rp where rp.regla_id = r.id)
                 or exists (select 1 from retail.campana_regla_insignias ri where ri.regla_id = r.id))$n$
);

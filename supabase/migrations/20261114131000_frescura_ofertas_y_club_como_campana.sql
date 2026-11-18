-- ============================================================================
-- 20261114131000 — Frescura cuenta el 3x2, el monto y el cupón del Club como campaña, no como liquidación (ADR-0655, auditoría)
--
-- EL PROBLEMA. «La rebajé» de Frescura separa lo vendido desde la rebaja en «con descuento de liquidación», «de campaña» y «sin descuento»
--   (contar una campaña como rebaja engañaría: «¿sirvió bajarla?»). `fn_frescura_decisiones` toma el motivo de la línea y, si la línea tiene
--   descuento sin motivo, pone 'otro', que la web cuenta como liquidación. Pero el motivo es solo de la parte a mano o de la campaña
--   (`venta_items_motivo_coherente_con_descuento`): la parte de una oferta de grupo (3x2, monto: `descuento_grupo_unitario`) y la del Club
--   (`descuento_club_unitario`) no llevan motivo. Un polo vendido en un 3x2 salía como «liquidación».
--
-- LO QUE HACE. Un reemplazo anclado en `fn_frescura_decisiones`: con descuento propio (a mano o campaña: lo que queda sin el Club ni el
--   grupo), su motivo como siempre; con solo la parte de una oferta o del Club, 'campana' (es una promoción, no una rebaja de la prenda,
--   como ya lo es el cumpleaños del Club en la web). Sin descuento, null.
--   Es lo que hacen los líderes: la rebaja promocional se mide aparte de la liquidación (Oracle Retail separa P de R y C).
--
-- SE ROMPE SI: alguien cambia esa línea de `fn_frescura_decisiones` antes de pegar esto: el ancla no aparece y se detiene sin aplicar nada.
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s; solo una función. Va DESPUÉS de 20261114003000 (`descuento_grupo_unitario`).
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:caja-ofertas-de-grupo` («Frescura»).
-- ============================================================================

set lock_timeout = '3s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'retail' and table_name = 'venta_items' and column_name = 'descuento_grupo_unitario') then
    raise exception 'Falta 20261114003000 (la parte de una oferta de grupo en cada línea): esta migración va después. No se aplicó nada.';
  end if;
end;
$$;

create or replace function pg_temp.reemplazar_frescura_motivo(p_firma text, p_viejo text, p_nuevo text)
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

select pg_temp.reemplazar_frescura_motivo(
  'retail.fn_frescura_decisiones(uuid, integer)',
  $v$case when vi.descuento_unitario > 0 then coalesce(vi.motivo_descuento, 'otro') end)$v$,
  $n$case when vi.descuento_unitario - vi.descuento_club_unitario - vi.descuento_grupo_unitario > 0 then coalesce(vi.motivo_descuento, 'otro')
                                                              -- ADR-0655: solo la parte de una oferta (3x2, monto) o del Club: promoción, no liquidación.
                                                              when vi.descuento_unitario > 0 then 'campana' end)$n$
);

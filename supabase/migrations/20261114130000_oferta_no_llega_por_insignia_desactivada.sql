-- ============================================================================
-- 20261114130000 — Una oferta no llega a las prendas de una insignia desactivada (ADR-0655, Felipe 2026-11-14)
--
-- EL PROBLEMA. Una oferta que elige sus prendas por insignia (20261114060000) mira quién lleva la insignia (marcada a mano o por una
--   categoría de la insignia) sin mirar si la insignia sigue viva. Desactivada, la oferta seguía rebajando sus prendas: una rebaja colgada de
--   una marca que ya no se ve, sin que nadie sepa por qué esa prenda está más barata.
--
-- LO QUE HACE. `fn_insignia_viva(id)`: la insignia está activa y aprobada. Las tres funciones que deciden qué prendas lleva una insignia de una
--   oferta la preguntan:
--     - `fn_campanas_en_sede` (el % en la caja, los apartados, la tienda web y `registrar_venta`);
--     - `fn_oferta_alcanza_variante_con_insignias` (por `fn_regla_alcanza_variante`: el 3x2 y el monto en la caja, sus cesiones);
--     - `fn_variantes_de_oferta_con_insignias` (los choques al configurar y las ofertas de grupo y de monto que lee la caja).
--   Solo cambia QUIÉN lleva la insignia: una oferta que eligió solo insignias sigue sin llegar a las prendas de su campaña aunque todas sus
--   insignias estén desactivadas (no se vuelve «toda la campaña»). Reactivar la insignia la vuelve a encender.
--   La hoja de la oferta cuenta lo mismo (`etiquetas-pantalla-datos.ts`), y al desactivar una insignia Catálogo ▸ Insignias nombra las
--   ofertas que la usan (`bajadaDesactivarInsignia`).
--
-- SE ROMPE SI: alguien cambia esas líneas antes de pegar esto: el ancla no aparece y se detiene sin aplicar nada.
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s; solo funciones (ni políticas ni disparadores, ADR-0195). Va DESPUÉS de
--   20261114060000 (las insignias de una oferta).
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:ofertas-por-insignia` («Una insignia desactivada»).
-- ============================================================================

set lock_timeout = '3s';

do $$
begin
  if to_regclass('retail.campana_regla_insignias') is null then
    raise exception 'Falta 20261114060000 (las insignias de una oferta): esta migración va después. No se aplicó nada.';
  end if;
end;
$$;

create or replace function retail.fn_insignia_viva(p_etiqueta_id uuid)
returns boolean
language sql
stable
set search_path to 'retail', 'public'
as $function$
  select exists (select 1 from retail.etiquetas e where e.id = p_etiqueta_id and e.activo and e.estado = 'aprobado');
$function$;

comment on function retail.fn_insignia_viva(uuid) is
  'ADR-0655 (Felipe 2026-11-14). La insignia está activa y aprobada: solo entonces una oferta que la elige llega a sus prendas. La preguntan fn_campanas_en_sede, fn_oferta_alcanza_variante_con_insignias y fn_variantes_de_oferta_con_insignias.';

revoke all on function retail.fn_insignia_viva(uuid) from public, anon, authenticated;

create or replace function pg_temp.reemplazar_insignia_viva(p_firma text, p_viejo text, p_nuevo text)
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

-- El % (la caja, los apartados, la tienda web y registrar_venta).
select pg_temp.reemplazar_insignia_viva(
  'retail.fn_campanas_en_sede(date, integer, uuid[], uuid)',
  $v$ve.etiqueta_id = ri.etiqueta_id)$v$,
  $n$ve.etiqueta_id = ri.etiqueta_id and retail.fn_insignia_viva(ri.etiqueta_id))$n$
);
select pg_temp.reemplazar_insignia_viva(
  'retail.fn_campanas_en_sede(date, integer, uuid[], uuid)',
  $v$ec.etiqueta_id = ri.etiqueta_id and ec.categoria_id = p.categoria_id))$v$,
  $n$ec.etiqueta_id = ri.etiqueta_id and ec.categoria_id = p.categoria_id and retail.fn_insignia_viva(ri.etiqueta_id)))$n$
);

-- Una prenda (el 3x2 y el monto en la caja y sus cesiones, por fn_regla_alcanza_variante).
select pg_temp.reemplazar_insignia_viva(
  'retail.fn_oferta_alcanza_variante_con_insignias(uuid, uuid[], uuid[], uuid[], uuid[], boolean, uuid)',
  $v$ve.etiqueta_id = any (p_insignias))$v$,
  $n$ve.etiqueta_id = any (p_insignias) and retail.fn_insignia_viva(ve.etiqueta_id))$n$
);
select pg_temp.reemplazar_insignia_viva(
  'retail.fn_oferta_alcanza_variante_con_insignias(uuid, uuid[], uuid[], uuid[], uuid[], boolean, uuid)',
  $v$ec.etiqueta_id = any (p_insignias) and ec.categoria_id = p.categoria_id)$v$,
  $n$ec.etiqueta_id = any (p_insignias) and ec.categoria_id = p.categoria_id and retail.fn_insignia_viva(ec.etiqueta_id))$n$
);

-- Todas las prendas de una oferta (los choques y las ofertas de grupo y de monto que lee la caja).
select pg_temp.reemplazar_insignia_viva(
  'retail.fn_variantes_de_oferta_con_insignias(uuid, uuid[], uuid[], uuid[], uuid[], boolean)',
  $v$where ve.etiqueta_id = any (p_insignias))$v$,
  $n$where ve.etiqueta_id = any (p_insignias) and retail.fn_insignia_viva(ve.etiqueta_id))$n$
);
select pg_temp.reemplazar_insignia_viva(
  'retail.fn_variantes_de_oferta_con_insignias(uuid, uuid[], uuid[], uuid[], uuid[], boolean)',
  $v$where ec.etiqueta_id = any (p_insignias))$v$,
  $n$where ec.etiqueta_id = any (p_insignias) and retail.fn_insignia_viva(ec.etiqueta_id))$n$
);

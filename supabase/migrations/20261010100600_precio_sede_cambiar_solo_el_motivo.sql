-- ============================================================================
-- 20261010100600_precio_sede_cambiar_solo_el_motivo.sql — CAYLA V2 (ADR-0370; corrige 20261010100000)
--
-- EL PROBLEMA (prueba ciega de /formidable, 2026-10-10). «Cambiar» el precio de una tienda con el MISMO precio y otro motivo
-- (corregir un motivo mal escrito) devolvía 0 cambios y no guardaba el motivo nuevo, pero la hoja decía «guardado».
-- `poner_precio_sede` saltaba la variante si ya tenía ese precio, sin mirar el motivo.
--
-- LO QUE HACE. Reescribe `poner_precio_sede` (misma firma): un motivo distinto también es un cambio. Como la fila no se edita
-- (`precios_sede_inmutable`), se archiva la vigente y nace otra con el motivo nuevo; el historial anota «S/ X → S/ X» con el motivo.
-- Igual que antes en todo lo demás. Re-ejecutable, una sola parte, sin tablas ni políticas.
-- Prueba: `pnpm pruebas:precio-sede` (escenario «cambiar solo el motivo lo guarda»).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.poner_precio_sede(
  p_producto_id uuid, p_ubicacion_id uuid, p_precio numeric, p_motivo text
) returns integer
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_actor uuid;
  v_precio numeric(12,2) := round(p_precio, 2);
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_var record;
  v_vig_id uuid;
  v_vig_precio numeric;
  v_vig_motivo text;
  v_cambiadas integer := 0;
  v_alguna_distinta boolean := false;
begin
  if p_precio is null or v_precio <= 0 then
    raise exception 'Escribe un precio mayor que cero.';
  end if;
  if length(v_motivo) < 3 then
    raise exception 'Escribe por qué esta tienda tiene otro precio.';
  end if;
  perform retail.fn_precio_sede_exigir(p_producto_id, p_ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);

  for v_var in
    select v.id, v.precio from retail.variantes v where v.producto_id = p_producto_id and v.activo order by v.id
  loop
    v_vig_id := null;
    v_vig_precio := null;
    v_vig_motivo := null;
    for v_vig_id, v_vig_precio, v_vig_motivo in
      select ps.id, ps.precio, ps.motivo from retail.precios_sede ps
       where ps.variante_id = v_var.id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null
    loop
      exit;
    end loop;

    if v_var.precio <> v_precio then
      v_alguna_distinta := true;
    end if;

    -- Ya está a ese precio en esta sede y con el mismo motivo: nada que hacer. Un motivo distinto SÍ es un cambio (la fila no se
    -- edita: se archiva y nace otra con el motivo nuevo).
    if coalesce(v_vig_precio, v_var.precio) = v_precio and (v_vig_id is null or v_vig_motivo = v_motivo) then
      continue;
    end if;

    if v_vig_id is not null then
      update retail.precios_sede set archivado_en = now(), archivado_por = v_actor where id = v_vig_id;
    end if;
    if v_var.precio <> v_precio then
      insert into retail.precios_sede (variante_id, ubicacion_id, precio, motivo, creado_por)
      values (v_var.id, p_ubicacion_id, v_precio, v_motivo, v_actor);
    end if;
    perform retail.fn_precio_sede_anotar(v_var.id, p_ubicacion_id,
      coalesce(v_vig_precio, v_var.precio), v_vig_id is not null,
      v_precio, v_var.precio <> v_precio, v_motivo, v_actor);
    v_cambiadas := v_cambiadas + 1;
  end loop;

  if v_cambiadas = 0 and not v_alguna_distinta then
    raise exception 'Ese ya es el precio general de la prenda: no hace falta un precio propio para esta tienda.';
  end if;
  return v_cambiadas;
end;
$fn$;
revoke all on function retail.poner_precio_sede(uuid, uuid, numeric, text) from public, anon;
grant execute on function retail.poner_precio_sede(uuid, uuid, numeric, text) to authenticated;

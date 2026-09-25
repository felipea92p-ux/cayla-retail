-- ============================================================================
-- 20260925102000 — «No es fijo»: descartar un gasto que el sistema propone como fijo (ADR-0195, ajuste al spike)
--
-- EL PROBLEMA PRIMERO: Gastos ▸ Fijos del mes propone como fijo lo que se repite (misma tienda, categoría y proveedor en
-- dos de los últimos tres meses). Si NO es fijo —tres mototaxis seguidos, una compra de bolsas que se repitió—, hoy la
-- sugerencia no se va nunca. El spike tiene «No es fijo» al lado de «Marcar fijo».
--
-- LAS REGLAS
--   · Descartar se recuerda por (tienda, categoría, proveedor), la misma llave con la que se propone. Se puede revertir
--     (`revertido_en`), no se borra.
--   · Lo descarta quien puede ver esos gastos: el líder, cualquiera (también «de la empresa»); con el módulo Gastos, los
--     de su tienda. Firma con el responsable.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA EJECUCIÓN: tabla nueva y funciones; no toma candados de tablas en uso. Sin políticas.
-- SE ROMPE SI: la web se publica antes («No es fijo» llamaría a una función que no existe).
-- ============================================================================
set lock_timeout = '3s';

create table if not exists retail.gastos_fijos_descartados (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid references retail.ubicaciones(id),
  categoria text not null references retail.categorias_gasto(codigo),
  proveedor_id uuid references retail.proveedores(id),
  descartado_por uuid not null,
  descartado_en timestamptz not null default now(),
  revertido_por uuid,
  revertido_en timestamptz,
  constraint gastos_fijos_descartados_reversion_coherente check ((revertido_en is null) = (revertido_por is null))
);
comment on table retail.gastos_fijos_descartados is
  'Sugerencias de gasto fijo que alguien dijo que NO son fijas (tienda, categoría, proveedor). Se revierten, no se borran.';
-- Un solo descarte vigente por llave (los nulos cuentan como «de la empresa» / «sin proveedor»).
create unique index if not exists gastos_fijos_descartados_vigente
  on retail.gastos_fijos_descartados (coalesce(ubicacion_id, '00000000-0000-0000-0000-000000000000'::uuid), categoria,
                                      coalesce(proveedor_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revertido_en is null;
alter table retail.gastos_fijos_descartados enable row level security;
revoke all on retail.gastos_fijos_descartados from public, anon, authenticated;

create or replace function retail.descartar_fijo_sugerido(p_ubicacion_id uuid, p_categoria text, p_proveedor_id uuid)
returns void language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_actor uuid := retail.fn_actor_persona_id(true);
begin
  if p_ubicacion_id is null then
    if not retail.fn_es_lider() then
      raise exception 'Solo el líder decide sobre los gastos de la empresa.' using errcode = '42501';
    end if;
  elsif not (p_ubicacion_id = any (retail.fn_gastos_ubicaciones())) then
    raise exception 'No ves los gastos de esa tienda.' using errcode = '42501';
  end if;
  insert into retail.gastos_fijos_descartados (ubicacion_id, categoria, proveedor_id, descartado_por)
  values (p_ubicacion_id, p_categoria, p_proveedor_id, v_actor)
  on conflict do nothing;
end $$;
revoke all on function retail.descartar_fijo_sugerido(uuid, text, uuid) from public, anon;
grant execute on function retail.descartar_fijo_sugerido(uuid, text, uuid) to authenticated;

-- Las sugerencias saltan lo descartado. Parche por ancla sobre la definición VIVA (F2b, en producción).
do $$
declare v_def text; v_hay integer;
  v_ancla constant text := 'and f.proveedor_id is not distinct from x.proveedor_id
   )';
begin
  v_def := pg_get_functiondef('retail.fn_gastos_fijos_sugeridos()'::regprocedure);
  if position('gastos_fijos_descartados' in v_def) > 0 then
    return;
  end if;
  v_hay := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_hay <> 1 then
    raise exception 'fn_gastos_fijos_sugeridos cambió en la base: revisar antes de pegar (anclas: %).', v_hay;
  end if;
  execute replace(v_def, v_ancla, v_ancla || '
     and not exists (
     select 1 from retail.gastos_fijos_descartados d
      where d.revertido_en is null and d.ubicacion_id is not distinct from x.ubicacion_id and d.categoria = x.categoria
        and d.proveedor_id is not distinct from x.proveedor_id
   )');
end $$;

reset lock_timeout;

-- ============================================================================
-- "Reponer ya" pasa de ser una etiqueta pasiva a una alerta accionable.
--
-- No se automatiza al estilo Shein (decisión con Felipe, 2026-09-08): el
-- líder decide, el sistema solo ofrece dos caminos desde la alerta:
--
--   · Mandar orden  → abre una producción BORRADOR en el Taller
--     (registrar_produccion ya existente, con p_marcar_terminado=false: la
--     orden queda en 'en_proceso' sin tocar inventario hasta que el Taller
--     la cierre con cerrar_produccion). "Anular" un borrador ya existe:
--     eliminar_produccion (0028) borra limpio mientras inventariado_at sea
--     null — no hace falta ningún RPC nuevo para esa mitad.
--   · Ignorar → pospone la alerta un plazo corto (7 días por defecto). Si el
--     stock sigue bajo pasado ese plazo, vuelve a alertar sola — nunca un
--     silencio permanente que alguien pueda olvidar para siempre.
--
-- reposicion_silenciada vive aparte de `movimientos`/`producciones` a
-- propósito: no es un hecho de negocio que mueva stock ni plata, es una
-- preferencia de UI con fecha de vencimiento. No necesita el rigor
-- append-only del resto del núcleo.
-- ============================================================================

create table reposicion_silenciada (
  variante_id uuid primary key references variantes(id) on delete cascade,
  silenciada_hasta timestamptz not null,
  silenciada_por uuid references personas(id),
  created_at timestamptz not null default now()
);

alter table reposicion_silenciada enable row level security;

-- Mismo criterio que las decisiones de producción/compras (0003): solo Líder,
-- porque solo Líder puede además "Mandar orden" (fn_puede_operar_sede sobre
-- la sede TALLER ya lo exige así en registrar_produccion).
create policy reposicion_silenciada_all_lider on reposicion_silenciada for all
  using (fn_es_lider()) with check (fn_es_lider());

create or replace function silenciar_alerta_reposicion(p_variante_id uuid, p_dias integer default 7)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede posponer una alerta de reposición';
  end if;
  if p_dias is null or p_dias <= 0 then
    raise exception 'El plazo debe ser mayor a 0 días';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into reposicion_silenciada (variante_id, silenciada_hasta, silenciada_por)
    values (p_variante_id, now() + (p_dias || ' days')::interval, v_persona_id)
    on conflict (variante_id) do update
      set silenciada_hasta = excluded.silenciada_hasta,
          silenciada_por = excluded.silenciada_por,
          created_at = now();
end;
$$;

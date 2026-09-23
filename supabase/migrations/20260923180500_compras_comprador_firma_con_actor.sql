-- ============================================================================
-- 20260923180500_compras_comprador_firma_con_actor.sql — CAYLA V2 · ADR-0179 (arreglo de forma, sin cambio de comportamiento)
--
-- EL PROBLEMA. `20260923100000_actor_firma_las_operaciones.sql` (ADR-0162, re-ejecutable) lleva `agregar_comprador_de_tienda`
-- en su lista y exige que cada función de esa lista FIRME con una asignación: `v_x := retail.fn_actor_persona_id(false);`.
-- La versión de 20260923180000 llamaba `fn_actor_persona_id(false)` en línea dentro del `insert`: hace lo mismo, pero volver a
-- pegar 20260923100000 (su propio encabezado lo pide cada vez que entra una migración con funciones de su lista) abortaba con
-- «agregar_comprador_de_tienda … ya no busca a la persona … ni firma con fn_actor_persona_id». Lo detectó el CI
-- (`pruebas:actor-firma`, «la migración se puede pegar otra vez»).
--
-- QUÉ HACE. Recrea `agregar_comprador_de_tienda` con la firma en una variable (`v_quien := …`). Mismas reglas, mismos mensajes,
-- misma firma de parámetros (no nace una sobrecarga). No toca nada más.
--
-- PARA PEGAR EN PRODUCCIÓN: después de 20260923180000 … 180400. Trae `set search_path`. Re-pegable.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.agregar_comprador_de_tienda(p_persona_id uuid, p_ubicacion_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_quien uuid;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede sumar tiendas de Compras a una persona' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.personas p join retail.colaboradores co on co.persona_id = p.id
    where p.id = p_persona_id and p.estado = 'activo' and co.estado = 'activo'
  ) then
    raise exception 'Esa persona no es colaboradora activa de retail';
  end if;
  if not exists (select 1 from retail.ubicaciones where id = p_ubicacion_id and activo) then
    raise exception 'Esa tienda no existe o está inactiva';
  end if;
  if exists (select 1 from retail.compradores_de_tienda where persona_id = p_persona_id and ubicacion_id = p_ubicacion_id) then
    raise exception 'Esa persona ya gestiona las Compras de esa tienda';
  end if;
  v_quien := retail.fn_actor_persona_id(false);
  insert into retail.compradores_de_tienda (persona_id, ubicacion_id, agregado_por)
  values (p_persona_id, p_ubicacion_id, v_quien);
end;
$$;

comment on function retail.agregar_comprador_de_tienda(uuid, uuid) is
  'ADR-0179. Solo líder. Suma una tienda extra de Compras a una colaboradora activa (R-10). No le da el módulo: eso lo da su rol.';

revoke all on function retail.agregar_comprador_de_tienda(uuid, uuid) from public, anon;
grant execute on function retail.agregar_comprador_de_tienda(uuid, uuid) to authenticated;

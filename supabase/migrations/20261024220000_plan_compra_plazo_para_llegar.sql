-- ============================================================================
-- 20261024220000 — Plan de campaña: los días que tarda un pedido en llegar a las tiendas (ADR-0499, Felipe 2026-10-24, «mejora 1», plazo)
--
-- EL PROBLEMA PRIMERO. Una campaña falla antes por pedir tarde que por pedir mal: el Plan dice cuánto comprar, pero no hasta cuándo se puede
--   pedir para que la mercadería esté en las tiendas el día que empieza. La fecha límite es «inicio de la campaña − días que tarda un pedido
--   en llegar». Ese número es de la campaña (Navidad pide antes que un Día de la Madre con proveedor local) y hoy no vive en ninguna parte:
--   la pantalla usa 14 días de fábrica, el mismo supuesto que ya usa el punto de reorden cuando no hay historia, y lo dice.
--
-- LO QUE HACE.
--   1. `planes_compra.dias_para_llegar` (entero de 1 a 365; NULL = sin fijar → la pantalla usa el supuesto de 14 y dice que es un supuesto),
--      con quién lo fijó y cuándo (`plazo_actualizado_por/en`), como el tope de inversión (B2). Nunca un número sin autor (CHECK).
--   2. `guardar_plan_compra_plazo(plan, días)`: fija el número, o lo quita con NULL (vuelve al supuesto). Lo hace quien tiene el módulo «Plan de
--      campaña» (ADR-0387: el módulo es la llave), firmado por el responsable del combo (`fn_actor_persona_id(true)`).
--   3. `fn_plan_compra_plazo(plan)`: SOLO LEE. Devuelve el número fijado, quién y cuándo, y `soportado: true` (la web nueva solo ofrece el
--      campo si ve esa marca; con la base vieja la pantalla sigue con el supuesto sin cambio).
--
-- LO QUE NO HACE.
--   · No toca `fn_plan_compra` ni ninguna función existente: es una columna nueva y dos funciones nuevas. Nada que reemplazar, nada que anclar.
--   · No distingue proveedores ni al Taller: un solo plazo por campaña. Un proveedor lento o la producción propia tardan distinto; si eso importa,
--     es otra decisión (plazo por proveedor) y no se esconde aquí.
--   · No calcula el plazo desde la historia de recepciones: hoy casi no hay (0 órdenes de compra en producción el 2026-10-24) y un promedio de
--     dos recepciones se vería más preciso de lo que es. Cuando haya, la pantalla puede SUGERIRLO sin tocar esta tabla.
--   · No bloquea nada: la fecha límite avisa, nunca impide guardar un plan ni hacer un pedido.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema): un plazo de cero, negativo o de más de 365 días; un plazo sin quién lo fijó ni
--   cuándo; escribirlo sin pasar por la función (RLS sin políticas: nadie escribe la tabla directo).
-- CARRERA: dos personas que fijan el plazo a la vez → gana la última y queda firmada ella (es un solo número, como el tope; un control de
--   versión sería más ceremonia que el dato). La pantalla muestra quién lo fijó, así que un cambio ajeno no pasa en silencio.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: un `alter table` de una tabla chica (5 planes el 2026-10-24) y dos
--   funciones, SIN políticas ni `drop trigger` (ADR-0195). `lock_timeout` 3 s. Idempotente: pegarla dos veces deja lo mismo.
-- ORDEN: da igual. La web vieja ignora todo esto; la web nueva con la base vieja no ve `soportado` y usa el supuesto.
-- CAÍDA EXTERNA. Nada llama a la red. Si la lectura falla, la pantalla usa el supuesto de 14 días y lo dice: nunca esconde la fecha límite.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. La columna, con su autor -----------------------------------------------------------------------------------------------------

alter table retail.planes_compra
  add column if not exists dias_para_llegar integer,
  add column if not exists plazo_actualizado_por uuid references public.personas (id),
  add column if not exists plazo_actualizado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planes_compra_plazo_rango' and conrelid = 'retail.planes_compra'::regclass) then
    alter table retail.planes_compra
      add constraint planes_compra_plazo_rango check (dias_para_llegar is null or dias_para_llegar between 1 and 365);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'planes_compra_plazo_con_autor' and conrelid = 'retail.planes_compra'::regclass) then
    alter table retail.planes_compra
      add constraint planes_compra_plazo_con_autor check (dias_para_llegar is null or (plazo_actualizado_por is not null and plazo_actualizado_en is not null));
  end if;
end $$;

comment on column retail.planes_compra.dias_para_llegar is
  'ADR-0499. Cuántos días tarda un pedido en estar en las tiendas, para esta campaña (1 a 365). NULL = sin fijar: la pantalla usa el supuesto de 14 días y lo dice. La fecha límite para pedir es desde − dias_para_llegar. Solo avisa: nunca bloquea.';

-- 2. Fijarlo o quitarlo ------------------------------------------------------------------------------------------------------------

create or replace function retail.guardar_plan_compra_plazo(p_plan_id uuid, p_dias integer)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Fijar el plazo de pedido necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if not exists (select 1 from retail.planes_compra where id = p_plan_id) then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
  if p_dias is not null and p_dias not between 1 and 365 then
    raise exception 'Los días para llegar van de 1 a 365 (o déjalo vacío para volver al supuesto de 14).' using hint = 'plan_compra_plazo';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  -- Quitarlo (NULL) también deja anotado quién lo quitó y cuándo: el autor es siempre el último que lo tocó.
  update retail.planes_compra
     set dias_para_llegar = p_dias, plazo_actualizado_por = v_persona, plazo_actualizado_en = now()
   where id = p_plan_id;

  return jsonb_build_object('plan_id', p_plan_id, 'dias_para_llegar', p_dias);
end;
$$;

revoke all on function retail.guardar_plan_compra_plazo(uuid, integer) from public, anon;
grant execute on function retail.guardar_plan_compra_plazo(uuid, integer) to authenticated;
comment on function retail.guardar_plan_compra_plazo(uuid, integer) is
  'ADR-0499. Fija (o quita, con NULL) los días que tarda un pedido en llegar a las tiendas para una campaña. Pide el módulo plan_compra; firma el responsable del combo (fn_actor_persona_id(true)). Solo avisa: la fecha límite para pedir nunca bloquea nada. Devuelve {plan_id, dias_para_llegar}.';

-- 3. Leerlo ------------------------------------------------------------------------------------------------------------------------

create or replace function retail.fn_plan_compra_plazo(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_plan retail.planes_compra%rowtype;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  for v_plan in select p.* from retail.planes_compra p where p.id = p_plan_id loop
    exit;
  end loop;
  if v_plan.id is null then
    return null;
  end if;
  return jsonb_build_object(
    -- La web nueva solo ofrece el campo si ve esta marca.
    'soportado', true,
    'dias_para_llegar', v_plan.dias_para_llegar,
    -- Sin plazo fijado no hay autor: `fn_actividad_nombre(null)` diría «una persona» y la pantalla afirmaría que alguien lo fijó.
    'por', case when v_plan.plazo_actualizado_por is null then null else retail.fn_actividad_nombre(v_plan.plazo_actualizado_por) end,
    'en', v_plan.plazo_actualizado_en
  );
end;
$$;

revoke all on function retail.fn_plan_compra_plazo(uuid) from public, anon;
grant execute on function retail.fn_plan_compra_plazo(uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra_plazo(uuid) is
  'ADR-0499. Del plan: los días para llegar que se fijaron (NULL = sin fijar → supuesto de 14), quién los fijó y cuándo, y soportado = true. Solo lee. Pide el módulo plan_compra (42501 si no).';

reset lock_timeout;
notify pgrst, 'reload schema';

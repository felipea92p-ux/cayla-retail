-- Plan de campaña: cuánto le toca a cada tienda (ADR-0372, act. 2026-10-12 · Felipe: «de manera global debemos comprar tanto, pero cada sede
-- es única»).
--
-- EL PROBLEMA. El plan decía cuánto comprar para toda CAYLA, pero no cuánto mandarle a cada tienda: comprar bien en total y repartir mal da lo
-- mismo que comprar mal (en Trujillo se agota, en Arequipa sobra). La regla (en la web, `lib/plan-compra-reparto.ts`, con su prueba): el
-- objetivo de cada categoría se reparte según lo que vendió cada tienda en 90 días (su ritmo por día, para no castigar a la que abrió
-- después), se manda todo al inicio, y una tienda casi sin ventas (Lima) recibe un MÍNIMO que fija un líder (decisiones de Felipe, 2026-10-12).
--
-- QUÉ CREA.
--   1. `planes_compra_reparto (plan_id, ubicacion_id, minimo_pct)`: el mínimo de una tienda en una campaña, con su autor. Estados imposibles
--      que el esquema impide: dos mínimos para la misma tienda y campaña (PK), un mínimo de 0 o de más de 90 % (CHECK) y uno sin autor.
--      La suma de los mínimos de una campaña nunca pasa de 100 %: lo cuida la función (que es la única que escribe; RLS sin políticas).
--   2. `guardar_plan_compra_minimo(plan, tienda, pct)`: solo un líder; NULL lo quita. Firma el responsable del combo (ADR-0162).
--   3. `fn_plan_compra_propuesta` suma `tiendas_activas` (todas las tiendas, vendan o no: Lima también) y `minimos` (reemplazo ANCLADO).
--
-- CÓMO SE PEGA: una tabla nueva, una función y un reemplazo anclado; sin políticas ni `drop trigger` (ADR-0195). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.planes_compra_reparto (
  plan_id uuid not null references retail.planes_compra (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  minimo_pct integer check (minimo_pct is null or minimo_pct between 1 and 90),
  actualizado_por uuid not null references public.personas (id),
  actualizado_en timestamptz not null default now(),
  primary key (plan_id, ubicacion_id)
);

alter table retail.planes_compra_reparto enable row level security;
revoke all on table retail.planes_compra_reparto from public, anon, authenticated;

comment on table retail.planes_compra_reparto is
  'ADR-0372: el mínimo (% del objetivo de cada categoría) que le toca a una tienda en una campaña aunque venda poco (Lima al empezar). NULL = sin mínimo: le toca según lo que vende. Solo se escribe por guardar_plan_compra_minimo.';

create or replace function retail.guardar_plan_compra_minimo(p_plan_id uuid, p_ubicacion_id uuid, p_pct integer)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_otros integer;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Fijar el reparto necesita el módulo «Plan de campaña» en tu rol' using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder fija el mínimo de una tienda' using errcode = '42501', hint = 'plan_compra_solo_lider';
  end if;
  if not exists (select 1 from retail.planes_compra where id = p_plan_id) then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
  if not exists (select 1 from retail.ubicaciones where id = p_ubicacion_id and tipo = 'tienda' and activo) then
    raise exception 'El mínimo es para una tienda activa' using hint = 'plan_compra_reparto_tienda';
  end if;
  if p_pct is not null and (p_pct < 1 or p_pct > 90) then
    raise exception 'El mínimo va de 1 a 90 %% del objetivo.' using hint = 'plan_compra_reparto_pct';
  end if;
  v_otros := coalesce((select sum(minimo_pct) from retail.planes_compra_reparto where plan_id = p_plan_id and ubicacion_id <> p_ubicacion_id), 0);
  if p_pct is not null and v_otros + p_pct > 100 then
    raise exception 'Los mínimos de las tiendas sumarían % %%: no pueden pasar de 100 %%.', v_otros + p_pct using hint = 'plan_compra_reparto_suma';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  insert into retail.planes_compra_reparto (plan_id, ubicacion_id, minimo_pct, actualizado_por, actualizado_en)
  values (p_plan_id, p_ubicacion_id, p_pct, v_persona, now())
  on conflict (plan_id, ubicacion_id) do update set minimo_pct = excluded.minimo_pct, actualizado_por = excluded.actualizado_por, actualizado_en = now();
  return jsonb_build_object('plan_id', p_plan_id, 'ubicacion_id', p_ubicacion_id, 'minimo_pct', p_pct);
end;
$$;

revoke all on function retail.guardar_plan_compra_minimo(uuid, uuid, integer) from public, anon;
grant execute on function retail.guardar_plan_compra_minimo(uuid, uuid, integer) to authenticated, service_role;
comment on function retail.guardar_plan_compra_minimo(uuid, uuid, integer) is
  'ADR-0372: fija (o quita, con NULL) el mínimo de una tienda activa en una campaña (1–90 %; la suma de la campaña no pasa de 100). Pide el módulo plan_compra y ser líder; firma el responsable del combo.';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- La propuesta suma todas las tiendas activas (también la que aún no vende) y los mínimos de la campaña.
select pg_temp.reemplazar(
  'retail.fn_plan_compra_propuesta(uuid)',
  $v$'recupero_defecto', jsonb_build_object('pct', v_recupero, 'heredado', v_heredado),$v$,
  $v$'recupero_defecto', jsonb_build_object('pct', v_recupero, 'heredado', v_heredado),
      'tiendas_activas', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) order by u.nombre)
                                     from retail.ubicaciones u where u.tipo = 'tienda' and u.activo), '[]'::jsonb),
      'minimos', coalesce((select jsonb_agg(jsonb_build_object('u', r.ubicacion_id, 'pct', r.minimo_pct))
                             from retail.planes_compra_reparto r where r.plan_id = v_plan.id and r.minimo_pct is not null), '[]'::jsonb),$v$,
  1);

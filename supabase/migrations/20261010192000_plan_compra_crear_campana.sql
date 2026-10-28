-- Plan de campaña, varias campañas con su selector (ADR-0372, entrega 2 · B3).
--
-- EL PROBLEMA PRIMERO. R-19 lista seis campañas al año y el plan solo existía para una, «Diciembre 2026», sembrada por SQL: no había cómo
-- armar el plan del Día de la Madre desde la pantalla. Pero crear campañas a mano abriría una segunda fuente de verdad: las fechas de una
-- campaña ya viven en las etiquetas de estilo «campaña» de Catálogo ▸ Etiquetas (las que usan Configuración y Vender).
--
-- LO QUE SE DECIDIÓ (Felipe, 2026-10-10): una campaña nueva NACE de una etiqueta y el selector deja pasar entre las que ya existen.
--
-- LO QUE SE VIO AL CONSTRUIRLO. Las fechas de la etiqueta y las del plan NO siempre son la misma ventana: «Navidad» (la etiqueta, con su
-- descuento) es del 11 al 25 de diciembre; «Diciembre 2026» (el plan de compra) es del 1 al 31, a propósito, porque diciembre triplica un mes
-- entero. Por eso el plan queda LIGADO a su etiqueta (`etiqueta_id`, una sola por etiqueta) y arranca con las fechas de ella, pero las
-- fechas del plan son del plan y se pueden ajustar: la pantalla muestra las de la etiqueta al lado para que la diferencia no sea silenciosa.
-- «Diciembre 2026» no se toca (sin etiqueta).
--
-- QUÉ CREA.
--   1. `planes_compra.etiqueta_id` (NULL = plan sin etiqueta) + índice único parcial: dos planes para la misma campaña son un estado
--      imposible. `planes_compra.creado_por` (quién lo creó).
--   2. `crear_plan_compra(etiqueta, nombre, desde, hasta)`: módulo `plan_compra` Y líder (crear una campaña es una decisión de estructura y
--      de dinero); la etiqueta tiene que ser una campaña aprobada, activa y con fechas; firma con el responsable (`fn_actor_persona_id(true)`).
--   3. `fn_planes_compra()`: lectura para el selector: todos los planes (con sus fechas y cuántas categorías tienen plan) y las campañas de
--      Etiquetas disponibles (con el plan que ya tienen, si lo tienen). `fn_plan_compra` NO cambia.
--
-- NO COPIA PRECIOS NI COSTOS de otra campaña (la maqueta lo proponía): una línea del plan exige sus tres escenarios (CHECK), así que no se
-- puede guardar a medias. El precio y el costo ya arrancan del catálogo (B1).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: un `alter table` de una tabla chica, un índice único parcial y dos
-- funciones; SIN políticas ni `drop trigger` (ADR-0195). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.planes_compra
  add column if not exists etiqueta_id uuid references retail.etiquetas (id),
  add column if not exists creado_por uuid references public.personas (id);

create unique index if not exists planes_compra_una_por_etiqueta on retail.planes_compra (etiqueta_id) where etiqueta_id is not null;

comment on column retail.planes_compra.etiqueta_id is
  'ADR-0372: la etiqueta «campaña» (Catálogo ▸ Etiquetas) de la que nació este plan; NULL = plan sin etiqueta. Una sola por etiqueta. Las fechas del plan son del plan (una ventana de compra puede ser más ancha que la de la etiqueta).';

create or replace function retail.fn_planes_compra()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver las campañas del plan necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  return jsonb_build_object(
    'planes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'nombre', p.nombre, 'desde', p.desde, 'hasta', p.hasta, 'etiqueta_id', p.etiqueta_id,
               'con_plan', (select count(*) from retail.planes_compra_lineas l where l.plan_id = p.id))
             order by p.desde desc, p.nombre)
        from retail.planes_compra p), '[]'::jsonb),
    -- Las campañas de Etiquetas que se pueden convertir en un plan: aprobadas, activas y con sus dos fechas.
    'etiquetas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'nombre', e.nombre, 'desde', e.vigente_desde, 'hasta', e.vigente_hasta,
               'plan_id', (select p.id from retail.planes_compra p where p.etiqueta_id = e.id))
             order by e.vigente_desde, e.nombre)
        from retail.etiquetas e
       where e.estilo = 'campana' and e.activo and e.estado = 'aprobado'
         and e.vigente_desde is not null and e.vigente_hasta is not null), '[]'::jsonb));
end;
$$;

revoke all on function retail.fn_planes_compra() from public, anon;
grant execute on function retail.fn_planes_compra() to authenticated, service_role;
comment on function retail.fn_planes_compra() is
  'ADR-0372: las campañas del plan (con sus fechas y cuántas categorías tienen plan) y las campañas de Etiquetas disponibles para crear una. Pide el módulo plan_compra (42501 si no).';

create or replace function retail.crear_plan_compra(
  p_etiqueta_id uuid,
  p_nombre text default null,
  p_desde date default null,
  p_hasta date default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_e retail.etiquetas%rowtype;
  v_desde date;
  v_hasta date;
  v_nombre text;
  v_persona uuid;
  v_id uuid;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Crear una campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder crea una campaña del plan'
      using errcode = '42501', hint = 'plan_compra_campana_solo_lider';
  end if;
  for v_e in select * from retail.etiquetas e where e.id = p_etiqueta_id loop
    exit;
  end loop;
  if v_e.id is null or v_e.estilo <> 'campana' or not v_e.activo or v_e.estado <> 'aprobado'
     or v_e.vigente_desde is null or v_e.vigente_hasta is null then
    raise exception 'Elige una campaña de Catálogo ▸ Etiquetas que esté aprobada y tenga sus fechas.' using hint = 'plan_compra_etiqueta';
  end if;
  v_desde := coalesce(p_desde, v_e.vigente_desde);
  v_hasta := coalesce(p_hasta, v_e.vigente_hasta);
  if v_hasta < v_desde then
    raise exception 'La campaña no puede terminar antes de empezar.' using hint = 'plan_compra_fechas';
  end if;
  v_nombre := coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), v_e.nombre || ' ' || extract(year from v_desde)::integer);
  if exists (select 1 from retail.planes_compra p where p.etiqueta_id = p_etiqueta_id) then
    raise exception 'Esa campaña ya tiene su plan: ábrelo desde el selector.' using hint = 'plan_compra_ya_existe';
  end if;
  if exists (select 1 from retail.planes_compra p where lower(p.nombre) = lower(v_nombre)) then
    raise exception 'Ya hay un plan con ese nombre: ponle otro.' using hint = 'plan_compra_nombre';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  insert into retail.planes_compra (nombre, desde, hasta, etiqueta_id, creado_por)
  values (v_nombre, v_desde, v_hasta, p_etiqueta_id, v_persona)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'nombre', v_nombre);
end;
$$;

revoke all on function retail.crear_plan_compra(uuid, text, date, date) from public, anon;
grant execute on function retail.crear_plan_compra(uuid, text, date, date) to authenticated;
comment on function retail.crear_plan_compra(uuid, text, date, date) is
  'ADR-0372: crea el plan de una campaña de Etiquetas (aprobada, activa, con fechas): una sola por etiqueta. Arranca con las fechas de la etiqueta, que se pueden ajustar. Pide el módulo plan_compra y ser líder; firma el responsable (fn_actor_persona_id(true)).';

reset lock_timeout;
notify pgrst, 'reload schema';

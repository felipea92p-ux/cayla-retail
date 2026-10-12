-- Plan de campaña: un plan por campaña Y POR AÑO, y «Campaña nueva» que la deja en Etiquetas con su mismo formato (ADR-0372, act. 2026-10-12 (f)).
--
-- EL PROBLEMA PRIMERO. Las campañas de Catálogo ▸ Etiquetas son fechas que vuelven cada año (Historial ya las lleva a cualquier año), pero
-- `planes_compra_una_por_etiqueta` dejaba UN plan por etiqueta para siempre: con «Halloween 2026» creado, «Halloween 2027» era imposible, y
-- «San Valentín 2027» ya bloqueaba el de 2028. En enero el Plan se quedaba sin campañas que armar.
--
-- LO QUE SE DECIDIÓ (Felipe, 2026-10-12, opción A de la maqueta `docs/maquetas/plan-selector-campanas-2026-10/`):
--   · El selector del Plan es el calendario de Etiquetas (este año y el que viene) y arma el plan de una campaña con un toque.
--   · Lo que no está en el calendario se crea desde el Plan y QUEDA EN ETIQUETAS con el mismo formato que las demás («Campaña y festividad»,
--     su ícono por el nombre, sus fechas, aprobada, sin descuento): un solo calendario para Historial, Etiquetas y el Plan.
--
-- QUÉ CAMBIA.
--   1. El índice único pasa a (etiqueta, año en que TERMINA el plan): el mismo año que manda en Historial (`proyectarCampana`: San Valentín,
--      31 ene – 14 feb, es del año de su 14 de febrero). Dos planes de la misma campaña el mismo año siguen siendo un estado imposible.
--   2. `crear_plan_compra`: la regla de «ya tiene su plan» es por año, y el nombre por defecto lleva el año del fin.
--   3. `fn_planes_compra`: cada campaña de Etiquetas trae TODOS sus planes con su año (`planes`), y también las que no tienen fechas (para
--      decir «ponle fechas en Etiquetas» en vez de esconderlas). `plan_id` se queda (el de su último año) para la web de antes.
--   4. `crear_campana_con_plan(nombre, desde, hasta)`: la campaña nueva y su plan en UNA transacción, por los mismos caminos que usa Etiquetas
--      (el INSERT pasa por `etiquetas_estado_biut`, que la aprueba si quien la crea puede editar etiquetas; las fechas las pone
--      `actualizar_campana_etiqueta`, la de «Configurar campaña», sin descuento; el plan lo crea `crear_plan_compra`). Si algo falla, no queda
--      ni la etiqueta ni el plan. El nombre repetido lo rechaza el índice `etiquetas_clave_unica` (dos líderes a la vez: entra uno).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: un índice de una tabla chica y cuatro funciones; SIN políticas ni
-- `drop trigger` (ADR-0195). Idempotente. Dentro de los textos anclados no hay `select … into` (ADR-0288).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1 · Un plan por campaña y por año.
drop index if exists retail.planes_compra_una_por_etiqueta;
create unique index if not exists planes_compra_una_por_etiqueta_y_anio
  on retail.planes_compra (etiqueta_id, (extract(year from hasta)::integer)) where etiqueta_id is not null;

comment on column retail.planes_compra.etiqueta_id is
  'ADR-0372: la etiqueta «campaña» (Catálogo ▸ Etiquetas) de la que nació este plan; NULL = plan sin etiqueta. Una por etiqueta y por año (el de `hasta`, como Historial). Las fechas del plan son del plan (una ventana de compra puede ser más ancha que la de la etiqueta).';

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

-- 2 · crear_plan_compra: «ya tiene su plan» es por año; el nombre por defecto, con el año del fin.
select pg_temp.reemplazar(
  'retail.crear_plan_compra(uuid,text,date,date)',
  $v$  if exists (select 1 from retail.planes_compra p where p.etiqueta_id = p_etiqueta_id) then$v$,
  $v$  if exists (select 1 from retail.planes_compra p where p.etiqueta_id = p_etiqueta_id and extract(year from p.hasta)::integer = extract(year from v_hasta)::integer) then$v$,
  1);
select pg_temp.reemplazar(
  'retail.crear_plan_compra(uuid,text,date,date)',
  $v$v_e.nombre || ' ' || extract(year from v_desde)::integer);$v$,
  $v$v_e.nombre || ' ' || extract(year from v_hasta)::integer);$v$,
  1);

comment on function retail.crear_plan_compra(uuid, text, date, date) is
  'ADR-0372: crea el plan de una campaña de Etiquetas (aprobada, activa, con fechas): uno por etiqueta y por año (el de su fin). Arranca con las fechas que manda la pantalla (las de ese año) o las de la etiqueta. Pide el módulo plan_compra y ser líder; firma el responsable (fn_actor_persona_id(true)).';

-- 3 · fn_planes_compra: todos los planes de cada campaña, con su año; también las campañas sin fechas.
select pg_temp.reemplazar(
  'retail.fn_planes_compra()',
  $v$               'plan_id', (select p.id from retail.planes_compra p where p.etiqueta_id = e.id))$v$,
  $v$               'plan_id', (select p.id from retail.planes_compra p where p.etiqueta_id = e.id order by p.hasta desc limit 1),
               'planes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'anio', extract(year from p.hasta)::integer) order by p.hasta)
                                     from retail.planes_compra p where p.etiqueta_id = e.id), '[]'::jsonb))$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_planes_compra()',
  $v$             order by e.vigente_desde, e.nombre)$v$,
  $v$             order by e.vigente_desde nulls last, e.nombre)$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_planes_compra()',
  $v$       where e.estilo = 'campana' and e.activo and e.estado = 'aprobado'
         and e.vigente_desde is not null and e.vigente_hasta is not null), '[]'::jsonb));$v$,
  $v$       where e.estilo = 'campana' and e.activo and e.estado = 'aprobado'), '[]'::jsonb));$v$,
  1);

comment on function retail.fn_planes_compra() is
  'ADR-0372: las campañas del plan (con sus fechas, cuántas categorías tienen plan, si tienen tope y si están archivadas) y el calendario de Etiquetas: cada campaña con sus planes por año (y las que aún no tienen fechas). Pide el módulo plan_compra (42501 si no).';

-- 4 · Campaña nueva: la etiqueta con el formato de las demás y su plan, en una transacción.
create or replace function retail.crear_campana_con_plan(p_nombre text, p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_etiqueta uuid;
  v_estado text;
  v_plan jsonb;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Crear una campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder crea una campaña del plan'
      using errcode = '42501', hint = 'plan_compra_campana_solo_lider';
  end if;
  if v_nombre = '' then
    raise exception 'Escribe el nombre de la campaña.' using hint = 'plan_compra_campana_nombre';
  end if;
  if p_desde is null or p_hasta is null then
    raise exception 'Pon las dos fechas de la campaña.' using hint = 'plan_compra_fechas';
  end if;
  if p_hasta < p_desde then
    raise exception 'La campaña no puede terminar antes de empezar.' using hint = 'plan_compra_fechas';
  end if;
  if exists (select 1 from retail.etiquetas e where retail.fn_clave_texto(e.nombre) = retail.fn_clave_texto(v_nombre)) then
    raise exception 'Ya hay una etiqueta «%» en Catálogo ▸ Etiquetas: elígela en el calendario.', v_nombre using hint = 'plan_compra_campana_existe';
  end if;

  -- El mismo INSERT que Etiquetas: el disparador `etiquetas_estado_biut` decide si nace aprobada y quién la propuso.
  begin
    insert into retail.etiquetas (nombre, estilo) values (v_nombre, 'campana') returning id, estado into v_etiqueta, v_estado;
  exception when unique_violation then
    raise exception 'Ya hay una etiqueta «%» en Catálogo ▸ Etiquetas: elígela en el calendario.', v_nombre using hint = 'plan_compra_campana_existe';
  end;
  if v_estado <> 'aprobado' then
    raise exception 'La campaña quedaría pendiente de aprobar en Etiquetas: créala desde una cuenta que pueda editar etiquetas.'
      using errcode = '42501', hint = 'plan_compra_campana_pendiente';
  end if;
  -- Sus fechas, por el mismo camino que «Configurar campaña» de Etiquetas: sin descuento y sin categorías (no toca ningún precio).
  perform retail.actualizar_campana_etiqueta(v_etiqueta, null, p_desde, p_hasta, '{}'::uuid[]);
  -- Y su plan, con la regla de siempre (uno por campaña y año).
  v_plan := retail.crear_plan_compra(v_etiqueta, null, p_desde, p_hasta);

  return v_plan || jsonb_build_object('etiqueta_id', v_etiqueta);
end;
$$;

revoke all on function retail.crear_campana_con_plan(text, date, date) from public, anon;
grant execute on function retail.crear_campana_con_plan(text, date, date) to authenticated;
comment on function retail.crear_campana_con_plan(text, date, date) is
  'ADR-0372 (act. 2026-10-12 f): crea una campaña que no estaba en el calendario —una etiqueta «Campaña y festividad» de Catálogo ▸ Etiquetas, aprobada, con sus fechas y sin descuento— y su plan, en una transacción. Pide el módulo plan_compra y ser líder. Devuelve {id, nombre, etiqueta_id}.';

-- Validación: los cambios quedaron.
do $g$
begin
  if exists (select 1 from pg_indexes where schemaname = 'retail' and indexname = 'planes_compra_una_por_etiqueta')
     or not exists (select 1 from pg_indexes where schemaname = 'retail' and indexname = 'planes_compra_una_por_etiqueta_y_anio')
     or position('extract(year from p.hasta)::integer = extract(year from v_hasta)::integer' in pg_get_functiondef('retail.crear_plan_compra(uuid,text,date,date)'::regprocedure)) = 0
     or position('''planes'', coalesce(' in pg_get_functiondef('retail.fn_planes_compra()'::regprocedure)) = 0
     or position('vigente_desde is not null' in pg_get_functiondef('retail.fn_planes_compra()'::regprocedure)) > 0 then
    raise exception 'La migración de campañas por año no quedó completa.';
  end if;
end;
$g$;

reset lock_timeout;
notify pgrst, 'reload schema';

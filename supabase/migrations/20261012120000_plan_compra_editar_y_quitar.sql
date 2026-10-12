-- Plan de campaña: editar, quitar y restaurar una campaña (ADR-0372, actualización 2026-10-10 c · B5).
-- RENOMBRADA desde 20261010210000 (nunca llegó a main): va DESPUÉS de 20261010232000, que también toca fn_plan_compra.
--
-- EL PROBLEMA PRIMERO. Una campaña nace con su nombre y sus fechas y nunca más se podía tocar. En producción, el mismo día, había tres: «San
-- Valentín 2026» (31 ene – 14 feb 2026, ya pasada: creada por error), «Diciembre 2026» y «Navidad 2026» (que se superpone con Diciembre). No había
-- cómo corregir unas fechas ni quitar una creada por error: el selector se llena de campañas que confunden a quien compra.
--
-- QUÉ HACE (lo decidió Felipe, 2026-10-10: «borrar si está vacía, archivar si no»; se editan nombre y fechas).
--   1. `planes_compra` suma quién editó (editado_por/en) y quién archivó (archivado_por/en), con CHECK de que cada par va junto (estado imposible:
--      una campaña archivada que nadie archivó).
--   2. `editar_plan_compra(plan, nombre, desde, hasta)`: módulo y líder (como crearla). Cambia el nombre (sin repetir otro, sin importar
--      mayúsculas) y las fechas (hasta ≥ desde). La etiqueta a la que está ligada no cambia. Firma el responsable del combo.
--   3. `quitar_plan_compra(plan)`: módulo y líder. Si la campaña está VACÍA (ninguna categoría armada y sin tope) se borra de verdad: no hay
--      historia que perder. Si tiene algo, se ARCHIVA: sale del selector, conserva todo y se puede restaurar. Devuelve qué hizo.
--   4. `restaurar_plan_compra(plan)`: módulo y líder; vuelve al selector (quien la restaura queda como su última edición).
--   5. `fn_planes_compra` dice si cada campaña está archivada y si tiene tope; `fn_plan_compra` ya no abre una archivada por defecto y dice si la
--      que se pidió lo está.
--
-- LA CARRERA. «Quitar» bloquea la fila de la campaña (`for update`) antes de mirar si está vacía. Una categoría que se guarda en ese instante
-- espera (su clave foránea pide la misma fila); si llegó a guardarse antes, la campaña ya no está vacía y se archiva en vez de borrarse. Y la
-- clave foránea de las categorías (sin borrado en cascada) hace imposible borrar una campaña que tenga alguna, pase lo que pase en el código.
--
-- CÓMO. Las tres funciones nuevas se crean enteras. `fn_planes_compra` y `fn_plan_compra` NO se copian: se cambian con reemplazos ANCLADOS sobre
-- su definición viva (el ayudante de 20261010100100 y 20261010232000), porque `fn_plan_compra` ya tiene en producción el filtro de las familias
-- apagadas (`fn_categoria_entra_a_motores`, 20261010232000) y copiar un archivo anterior lo borraría. Cada anclaje dice cuántas veces espera ver su
-- texto y aborta SIN TOCAR NADA si la función cambió; si ya está aplicado, no hace nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: un `alter table` de una tabla chica (3 filas), tres funciones nuevas y dos
-- reemplazos anclados; SIN políticas ni disparadores. Idempotente. ORDEN: da igual (la web de antes no usa nada de esto; la nueva esconde
-- «Editar» si la base no lo manda).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.planes_compra
  add column if not exists editado_por uuid references public.personas (id),
  add column if not exists editado_en timestamptz,
  add column if not exists archivado_por uuid references public.personas (id),
  add column if not exists archivado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planes_compra_archivado_con_autor' and conrelid = 'retail.planes_compra'::regclass) then
    alter table retail.planes_compra
      add constraint planes_compra_archivado_con_autor check ((archivado_en is null) = (archivado_por is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'planes_compra_editado_con_autor' and conrelid = 'retail.planes_compra'::regclass) then
    alter table retail.planes_compra
      add constraint planes_compra_editado_con_autor check ((editado_en is null) = (editado_por is null));
  end if;
end $$;

comment on column retail.planes_compra.archivado_en is
  'ADR-0372 (B5): la campaña se archivó (sale del selector, conserva sus categorías y su tope; se restaura con restaurar_plan_compra). Una campaña vacía no se archiva: se borra.';

create or replace function retail.editar_plan_compra(p_plan_id uuid, p_nombre text, p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_persona uuid;
  v_hay boolean := false;
  v_fila record;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Editar una campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder edita una campaña del plan'
      using errcode = '42501', hint = 'plan_compra_campana_solo_lider';
  end if;
  for v_fila in select p.id from retail.planes_compra p where p.id = p_plan_id for update loop
    v_hay := true;
  end loop;
  if not v_hay then
    raise exception 'Esa campaña ya no existe: otra persona pudo quitarla.' using hint = 'plan_compra_inexistente';
  end if;
  if v_nombre = '' then
    raise exception 'Ponle un nombre al plan.' using hint = 'plan_compra_nombre_vacio';
  end if;
  if p_desde is null or p_hasta is null then
    raise exception 'Escribe desde cuándo y hasta cuándo dura la campaña.' using hint = 'plan_compra_fechas';
  end if;
  if p_hasta < p_desde then
    raise exception 'La campaña no puede terminar antes de empezar.' using hint = 'plan_compra_fechas';
  end if;
  if exists (select 1 from retail.planes_compra p where lower(p.nombre) = lower(v_nombre) and p.id <> p_plan_id) then
    raise exception 'Ya hay un plan con ese nombre: ponle otro.' using hint = 'plan_compra_nombre';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  update retail.planes_compra
     set nombre = v_nombre, desde = p_desde, hasta = p_hasta, editado_por = v_persona, editado_en = now()
   where id = p_plan_id;

  return jsonb_build_object('id', p_plan_id, 'nombre', v_nombre, 'desde', p_desde, 'hasta', p_hasta);
end;
$$;

revoke all on function retail.editar_plan_compra(uuid, text, date, date) from public, anon;
grant execute on function retail.editar_plan_compra(uuid, text, date, date) to authenticated;
comment on function retail.editar_plan_compra(uuid, text, date, date) is
  'ADR-0372 (B5): cambia el nombre y las fechas de una campaña del plan (la etiqueta no cambia). Pide el módulo plan_compra y ser líder; firma el responsable del combo (fn_actor_persona_id(true)).';

create or replace function retail.quitar_plan_compra(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_plan retail.planes_compra%rowtype;
  v_persona uuid;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Quitar una campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder quita una campaña del plan'
      using errcode = '42501', hint = 'plan_compra_campana_solo_lider';
  end if;
  for v_plan in select * from retail.planes_compra p where p.id = p_plan_id for update loop
    exit;
  end loop;
  if v_plan.id is null then
    raise exception 'Esa campaña ya no existe: otra persona pudo quitarla.' using hint = 'plan_compra_inexistente';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  -- Vacía = ninguna categoría armada y sin tope: no hay nada que perder, se borra.
  if v_plan.tope_inversion is null and not exists (select 1 from retail.planes_compra_lineas l where l.plan_id = p_plan_id) then
    begin
      delete from retail.planes_compra where id = p_plan_id;
      return jsonb_build_object('id', p_plan_id, 'accion', 'borrado', 'nombre', v_plan.nombre);
    exception when foreign_key_violation then
      -- Una categoría llegó a guardarse: ya no está vacía. Se archiva (abajo).
      null;
    end;
  end if;

  update retail.planes_compra
     set archivado_por = coalesce(archivado_por, v_persona), archivado_en = coalesce(archivado_en, now())
   where id = p_plan_id;
  return jsonb_build_object('id', p_plan_id, 'accion', 'archivado', 'nombre', v_plan.nombre);
end;
$$;

revoke all on function retail.quitar_plan_compra(uuid) from public, anon;
grant execute on function retail.quitar_plan_compra(uuid) to authenticated;
comment on function retail.quitar_plan_compra(uuid) is
  'ADR-0372 (B5): quita una campaña del plan. Vacía (sin categorías armadas ni tope): la borra. Con algo: la archiva (sale del selector, conserva todo). Pide el módulo plan_compra y ser líder. Devuelve {id, accion: borrado|archivado, nombre}.';

create or replace function retail.restaurar_plan_compra(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nombre text;
  v_persona uuid;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Restaurar una campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder restaura una campaña del plan'
      using errcode = '42501', hint = 'plan_compra_campana_solo_lider';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  -- Quién la restauró queda como su última edición.
  update retail.planes_compra
     set archivado_por = null, archivado_en = null, editado_por = v_persona, editado_en = now()
   where id = p_plan_id
  returning nombre into v_nombre;
  if v_nombre is null then
    raise exception 'Esa campaña ya no existe.' using hint = 'plan_compra_inexistente';
  end if;
  return jsonb_build_object('id', p_plan_id, 'nombre', v_nombre);
end;
$$;

revoke all on function retail.restaurar_plan_compra(uuid) from public, anon;
grant execute on function retail.restaurar_plan_compra(uuid) to authenticated;
comment on function retail.restaurar_plan_compra(uuid) is
  'ADR-0372 (B5): devuelve al selector una campaña archivada. Pide el módulo plan_compra y ser líder; firma el responsable del combo (queda como su última edición).';

-- Reemplazo anclado (el mismo de 20261010100100 y 20261010232000): falla si la función viva cambió, y es re-ejecutable.
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

-- fn_planes_compra: cada campaña dice si está archivada y si tiene tope (con tope o con categorías, «Quitar» archiva en vez de borrar).
select pg_temp.reemplazar(
  'retail.fn_planes_compra()',
  $v$               'con_plan', (select count(*) from retail.planes_compra_lineas l where l.plan_id = p.id))$v$,
  $v$               'con_plan', (select count(*) from retail.planes_compra_lineas l where l.plan_id = p.id),
               'archivado', p.archivado_en is not null,
               'con_tope', p.tope_inversion is not null)$v$,
  1);

-- fn_plan_compra: sin id, la más reciente que NO esté archivada (con id, esa aunque lo esté: la pantalla lo dice y ofrece restaurarla)...
select pg_temp.reemplazar(
  'retail.fn_plan_compra(uuid)',
  $v$     where p_plan_id is null or p.id = p_plan_id$v$,
  $v$     where (p_plan_id is null and p.archivado_en is null) or p.id = p_plan_id$v$,
  1);
-- ...dice si la que se abrió está archivada...
select pg_temp.reemplazar(
  'retail.fn_plan_compra(uuid)',
  $v$                                 'tope_inversion', v_plan.tope_inversion),$v$,
  $v$                                 'tope_inversion', v_plan.tope_inversion, 'archivado', v_plan.archivado_en is not null),$v$,
  1);
-- ...y su lista de planes deja fuera las archivadas.
select pg_temp.reemplazar(
  'retail.fn_plan_compra(uuid)',
  $v$                          from retail.planes_compra p), '[]'::jsonb),$v$,
  $v$                          from retail.planes_compra p where p.archivado_en is null), '[]'::jsonb),$v$,
  1);

comment on function retail.fn_planes_compra() is
  'ADR-0372: las campañas del plan (con sus fechas, cuántas categorías tienen plan, si tienen tope y si están archivadas, B5) y las campañas de Etiquetas disponibles para crear una. Pide el módulo plan_compra (42501 si no).';

-- Validación: los cuatro cambios quedaron.
do $g$
begin
  if position('''archivado'', p.archivado_en is not null' in pg_get_functiondef('retail.fn_planes_compra()'::regprocedure)) = 0
     or position('(p_plan_id is null and p.archivado_en is null)' in pg_get_functiondef('retail.fn_plan_compra(uuid)'::regprocedure)) = 0
     or position('''archivado'', v_plan.archivado_en is not null' in pg_get_functiondef('retail.fn_plan_compra(uuid)'::regprocedure)) = 0
     or position('from retail.planes_compra p where p.archivado_en is null' in pg_get_functiondef('retail.fn_plan_compra(uuid)'::regprocedure)) = 0 then
    raise exception 'B5: algún reemplazo anclado no quedó; no se aplica nada.';
  end if;
end
$g$;

reset lock_timeout;
notify pgrst, 'reload schema';

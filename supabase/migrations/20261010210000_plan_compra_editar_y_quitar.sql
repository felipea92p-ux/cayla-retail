-- Plan de campaña: editar, quitar y restaurar una campaña (ADR-0372, actualización 2026-10-10 c · B5).
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
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: un `alter table` de una tabla chica (3 filas), cinco funciones; SIN políticas
-- ni disparadores. Idempotente. ORDEN: da igual (la web de antes no usa nada de esto; la nueva esconde «Editar» si la base no lo manda).

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
               'con_plan', (select count(*) from retail.planes_compra_lineas l where l.plan_id = p.id),
               -- B5: si está archivada (no sale en el selector) y si tiene tope (con tope o con categorías, «Quitar» archiva en vez de borrar).
               'archivado', p.archivado_en is not null,
               'con_tope', p.tope_inversion is not null)
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
  'ADR-0372: las campañas del plan (con sus fechas, cuántas categorías tienen plan, si tienen tope y si están archivadas, B5) y las campañas de Etiquetas disponibles para crear una. Pide el módulo plan_compra (42501 si no).';

create or replace function retail.fn_plan_compra(p_plan_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  v_plan retail.planes_compra%rowtype;
  v_desde_ts timestamptz;
  v_hasta_ts timestamptz;
  v_curva_desde timestamptz := now() - interval '90 days';
  v_30_desde timestamptz := now() - interval '30 days';
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  for v_plan in
    select * from retail.planes_compra p
     -- B5: sin id, la más reciente que NO esté archivada; con id, esa (aunque esté archivada: la pantalla lo dice y ofrece restaurarla).
     where (p_plan_id is null and p.archivado_en is null) or p.id = p_plan_id
     order by p.desde desc, p.id
     limit 1
  loop
    exit;
  end loop;
  if v_plan.id is null then
    return null;
  end if;
  v_desde_ts := (v_plan.desde::timestamp at time zone 'America/Lima');
  v_hasta_ts := ((v_plan.hasta + 1)::timestamp at time zone 'America/Lima');

  return jsonb_build_object(
    'plan', jsonb_build_object('id', v_plan.id, 'nombre', v_plan.nombre, 'desde', v_plan.desde, 'hasta', v_plan.hasta,
                                 'tope_inversion', v_plan.tope_inversion, 'archivado', v_plan.archivado_en is not null),
    'hoy', retail.fn_hoy_lima(),
    -- B4: la base compara versiones al guardar una categoría. La web nueva solo manda la versión si ve esta marca.
    'con_version', true,
    'planes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre) order by p.desde desc)
                          from retail.planes_compra p where p.archivado_en is null), '[]'::jsonb),
    -- Las categorías activas con sus tallas (la curva solo puede usar estas).
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia,
               'tallas', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'valor', t.valor))
                                     from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id
                                    where ct.categoria_id = c.id), '[]'::jsonb))
             order by c.nombre)
        from retail.categorias c where c.activo), '[]'::jsonb),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'categoria_id', l.categoria_id, 'flojo', l.flojo, 'normal', l.normal, 'bueno', l.bueno,
               'precio', l.precio, 'costo', l.costo, 'recupero_pct', l.recupero_pct, 'curva', l.curva, 'nota', l.nota,
               'actualizado_por', retail.fn_actividad_nombre(l.actualizado_por), 'updated_at', l.updated_at,
               -- B4 (ADR-0193 aplicada al plan): la versión que la hoja manda al guardar.
               'version', l.version))
        from retail.planes_compra_lineas l where l.plan_id = v_plan.id), '[]'::jsonb),
    -- Lo que ya hay hoy en toda la red (tiendas, almacenes y Taller), libre de apartados y sin Cuarentena, por categoría.
    'stock', coalesce((
      select jsonb_agg(jsonb_build_object('categoria_id', x.categoria_id, 'unidades', x.unidades))
        from (select pr.categoria_id, sum(greatest(st.cantidad - coalesce(st.cantidad_apartada, 0), 0))::integer as unidades
                from retail.stock st
                join retail.ubicaciones u on u.id = st.ubicacion_id and u.activo
                left join retail.sububicaciones sb on sb.id = st.sububicacion_id
                join retail.variantes va on va.id = st.variante_id
                join retail.productos pr on pr.id = va.producto_id
               where st.variante_id <> c_centinela and not pr.es_prueba
                 and sb.tipo is distinct from 'cuarentena'
               group by pr.categoria_id) x
       where x.unidades > 0), '[]'::jsonb),
    -- Lo vendido por categoría × talla en los últimos 90 días: la base de la curva que propone el sistema. Con su prenda o anotado
    -- «sin registrar» (la anotada trae su categoría y su talla).
    'curvas', coalesce((
      select jsonb_agg(jsonb_build_object('categoria_id', y.categoria_id, 'talla_id', y.talla_id, 'unidades', y.unidades))
        from (select z.categoria_id, z.talla_id, sum(z.unidades)::integer as unidades
                from (select pr.categoria_id, va.talla_id, vi.cantidad as unidades
                        from retail.ventas v
                        join retail.venta_items vi on vi.venta_id = v.id
                        join retail.variantes va on va.id = vi.variante_id
                        join retail.productos pr on pr.id = va.producto_id
                       where v.estado = 'completada' and not v.es_prueba and not pr.es_prueba
                         and vi.variante_id <> c_centinela and v.created_at >= v_curva_desde and v.created_at < now()
                      union all
                      select p.categoria_id, p.talla_id, 1
                        from retail.prendas_por_regularizar p
                        join retail.venta_items vi on vi.id = p.venta_item_id
                        join retail.ventas v on v.id = vi.venta_id
                       where p.estado in ('pendiente', 'cerrada_sin_prenda')
                         and v.estado = 'completada' and not v.es_prueba and v.created_at >= v_curva_desde and v.created_at < now()) z
               where z.categoria_id is not null and z.talla_id is not null
               group by z.categoria_id, z.talla_id) y), '[]'::jsonb),
    -- Lo que se vendió DE VERDAD dentro de las fechas de la campaña (para compararlo en enero; durante la campaña, parcial).
    'vendido', coalesce((
      select jsonb_agg(jsonb_build_object('categoria_id', w.categoria_id, 'unidades', w.unidades))
        from (select q.categoria_id, sum(q.unidades)::integer as unidades
                from (select pr.categoria_id, vi.cantidad as unidades
                        from retail.ventas v
                        join retail.venta_items vi on vi.venta_id = v.id
                        join retail.variantes va on va.id = vi.variante_id
                        join retail.productos pr on pr.id = va.producto_id
                       where v.estado = 'completada' and not v.es_prueba and not pr.es_prueba
                         and vi.variante_id <> c_centinela
                         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
                      union all
                      select p.categoria_id, 1
                        from retail.prendas_por_regularizar p
                        join retail.venta_items vi on vi.id = p.venta_item_id
                        join retail.ventas v on v.id = vi.venta_id
                       where p.estado in ('pendiente', 'cerrada_sin_prenda')
                         and v.estado = 'completada' and not v.es_prueba
                         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts) q
               where q.categoria_id is not null
               group by q.categoria_id) w), '[]'::jsonb),
    -- ADR-0372 (B1). El precio y el costo PROMEDIO de lo que hoy hay en el catálogo de cada categoría: la hoja los pone como punto de
    -- partida («Del catálogo · revísalo») en vez de pedirlos en blanco. Solo variantes y productos activos, sin pruebas ni la prenda
    -- centinela; un precio o un costo en 0 no cuenta (es «sin dato», no «gratis»).
    'catalogo', coalesce((
      select jsonb_agg(jsonb_build_object('categoria_id', k.categoria_id, 'precio', k.precio, 'costo', k.costo))
        from (select pr.categoria_id,
                     round(avg(va.precio) filter (where va.precio > 0), 2) as precio,
                     round(avg(va.costo) filter (where va.costo > 0), 2) as costo
                from retail.variantes va
                join retail.productos pr on pr.id = va.producto_id
               where va.activo and pr.estado = 'activo' and not pr.es_prueba
                 and va.id <> c_centinela and pr.categoria_id is not null
               group by pr.categoria_id) k
       where k.precio is not null and k.costo is not null), '[]'::jsonb),
    -- ADR-0372 (B1). El mismo stock libre de la red de arriba, pero por sede (cada tienda y el Taller): para decir DÓNDE está lo que hay.
    'stock_sedes', coalesce((
      select jsonb_agg(jsonb_build_object('categoria_id', s.categoria_id, 'ubicacion', s.nombre, 'unidades', s.unidades) order by s.nombre)
        from (select pr.categoria_id, u.nombre,
                     sum(greatest(st.cantidad - coalesce(st.cantidad_apartada, 0), 0))::integer as unidades
                from retail.stock st
                join retail.ubicaciones u on u.id = st.ubicacion_id and u.activo
                left join retail.sububicaciones sb on sb.id = st.sububicacion_id
                join retail.variantes va on va.id = st.variante_id
                join retail.productos pr on pr.id = va.producto_id
               where st.variante_id <> c_centinela and not pr.es_prueba
                 and sb.tipo is distinct from 'cuarentena'
               group by pr.categoria_id, u.id, u.nombre
              having sum(greatest(st.cantidad - coalesce(st.cantidad_apartada, 0), 0)) > 0) s), '[]'::jsonb),
    -- ADR-0372 (B1). Lo vendido en los últimos 30 días por categoría, con su prenda o anotado «sin registrar»: la referencia más fresca
    -- para escribir los escenarios (la de 90 días sale de `curvas`).
    'vendido_30', coalesce((
      select jsonb_agg(jsonb_build_object('categoria_id', m.categoria_id, 'unidades', m.unidades))
        from (select t.categoria_id, sum(t.unidades)::integer as unidades
                from (select pr.categoria_id, vi.cantidad as unidades
                        from retail.ventas v
                        join retail.venta_items vi on vi.venta_id = v.id
                        join retail.variantes va on va.id = vi.variante_id
                        join retail.productos pr on pr.id = va.producto_id
                       where v.estado = 'completada' and not v.es_prueba and not pr.es_prueba
                         and vi.variante_id <> c_centinela and v.created_at >= v_30_desde and v.created_at < now()
                      union all
                      select p.categoria_id, 1
                        from retail.prendas_por_regularizar p
                        join retail.venta_items vi on vi.id = p.venta_item_id
                        join retail.ventas v on v.id = vi.venta_id
                       where p.estado in ('pendiente', 'cerrada_sin_prenda')
                         and v.estado = 'completada' and not v.es_prueba and v.created_at >= v_30_desde and v.created_at < now()) t
               where t.categoria_id is not null
               group by t.categoria_id) m), '[]'::jsonb)
  );
end;
$$;

revoke all on function retail.fn_plan_compra(uuid) from public, anon;
grant execute on function retail.fn_plan_compra(uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra(uuid) is
  'ADR-0349 + ADR-0372: la hoja del plan de campaña (la más reciente NO archivada si p_plan_id es NULL; B5): categorías activas con sus tallas, los supuestos '
  'guardados (con su versión, B4), el stock libre de la red (y por sede: stock_sedes), lo vendido por categoría × talla en 90 días (para la curva), el precio y '
  'el costo promedio del catálogo (catalogo), lo vendido en 30 días (vendido_30), lo vendido dentro de la campaña, el tope de inversión '
  '(plan.tope_inversion), si está archivada (plan.archivado) y con_version. Pide el módulo plan_compra (42501 si no).';

reset lock_timeout;
notify pgrst, 'reload schema';
